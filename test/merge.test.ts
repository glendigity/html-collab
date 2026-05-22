import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { mergeFiles } from "../src/commands/merge";
import { createReviewHtml, extractReviewState, fingerprintSource } from "../src/format/html-envelope";
import { mergeReviewStates } from "../src/format/merge";
import type { ReviewOp, ReviewState } from "../src/format/state";

const fixturePath = join(import.meta.dir, "fixtures", "simple-report.html");

describe("merge", () => {
  test("merges actors and operation sets by id", async () => {
    const sourceBytes = await readFile(fixturePath);
    const base = stateWithOps(sourceBytes, "doc-1", [
      comment("glen:1", "glen", 1, "thread-glen", "Glen comment"),
    ]);
    const reviewed = stateWithOps(sourceBytes, "doc-1", [
      comment("maya:1", "maya", 1, "thread-maya", "Maya comment"),
    ]);

    const result = mergeReviewStates([base, reviewed]);

    expect(Object.keys(result.state.actors).sort()).toEqual(["glen", "maya"]);
    expect(result.state.ops.map((op) => op.opId).sort()).toEqual(["glen:1", "maya:1"]);
    expect(result.addedOps).toBe(1);
    expect(result.addedActors).toBe(1);
  });

  test("mergeFiles writes a merged reviewed HTML file", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "html-collab-"));
    try {
      const sourceBytes = await readFile(fixturePath);
      const glenPath = join(tempDir, "glen.review.html");
      const mayaPath = join(tempDir, "maya.review.html");
      const mergedPath = join(tempDir, "merged.review.html");

      await writeFile(
        glenPath,
        createReviewHtml(sourceBytes, {
          state: stateWithOps(sourceBytes, "doc-1", [
            comment("glen:1", "glen", 1, "thread-glen", "Glen comment"),
          ]),
        }),
      );
      await writeFile(
        mayaPath,
        createReviewHtml(sourceBytes, {
          state: stateWithOps(sourceBytes, "doc-1", [
            comment("maya:1", "maya", 1, "thread-maya", "Maya comment"),
          ]),
        }),
      );

      await mergeFiles([glenPath, mayaPath], mergedPath);

      const merged = extractReviewState(await readFile(mergedPath, "utf8"));
      expect(merged.docId).toBe("doc-1");
      expect(merged.ops.map((op) => op.opId).sort()).toEqual(["glen:1", "maya:1"]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("rejects mismatched docIds", async () => {
    const sourceBytes = await readFile(fixturePath);
    const base = stateWithOps(sourceBytes, "doc-1", []);
    const unrelated = stateWithOps(sourceBytes, "doc-2", []);

    expect(() => mergeReviewStates([base, unrelated])).toThrow(
      "Cannot merge doc-2: expected docId doc-1",
    );
  });
});

function stateWithOps(sourceBytes: Buffer, docId: string, ops: ReviewOp[]): ReviewState {
  const actors = Object.fromEntries(
    Array.from(new Set(ops.map((op) => op.actorId))).map((actorId) => [
      actorId,
      { actorId, name: actorId },
    ]),
  );

  return {
    schemaVersion: 1,
    docId,
    sourceFingerprint: fingerprintSource(sourceBytes),
    title: "simple-report.html",
    actors,
    ops,
  };
}

function comment(
  opId: string,
  actorId: string,
  clock: number,
  threadId: string,
  body: string,
): ReviewOp {
  return {
    opId,
    actorId,
    time: `2026-05-22T00:00:0${clock}.000Z`,
    clock,
    type: "comment.create",
    target: {
      kind: "text",
      quote: "Revenue improved 4.2%",
      position: { start: 0, end: 21 },
    },
    payload: {
      threadId,
      body,
    },
  };
}

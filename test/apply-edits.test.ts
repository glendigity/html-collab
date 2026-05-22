import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { unwrapFile } from "../src/commands/unwrap";
import { applyAcceptedEdits } from "../src/format/apply-edits";
import { createReviewHtml, fingerprintSource } from "../src/format/html-envelope";
import type { ReviewOp, ReviewState } from "../src/format/state";

const fixturePath = join(import.meta.dir, "fixtures", "simple-report.html");

describe("apply accepted edits", () => {
  test("applies only accepted tracked edits to source HTML", async () => {
    const sourceBytes = await readFile(fixturePath);
    const sourceHtml = sourceBytes.toString("utf8");
    const state = stateWithOps(sourceBytes, [
      edit("glen:1", 1, "edit-1", "replace", "Revenue improved 5.0%"),
      editStatus("maya:1", 2, "edit-1", "edit.accept"),
      edit("glen:2", 3, "edit-2", "replace", "Revenue declined"),
      editStatus("maya:2", 4, "edit-2", "edit.reject"),
      edit("glen:3", 5, "edit-3", "replace", "Revenue was flat"),
      editStatus("maya:3", 6, "edit-3", "edit.delete"),
    ]);

    const result = applyAcceptedEdits(sourceHtml, state);

    expect(result.appliedEdits).toBe(1);
    expect(result.totalSuggestedEdits).toBe(3);
    expect(result.acceptedEdits).toBe(1);
    expect(result.openEdits).toBe(0);
    expect(result.rejectedEdits).toBe(1);
    expect(result.deletedEdits).toBe(1);
    expect(result.skippedEdits).toBe(2);
    expect(result.html).toContain("Revenue improved 5.0% versus the prior period.");
    expect(result.html).not.toContain("Revenue declined");
    expect(result.html).not.toContain("Revenue was flat");
  });

  test("unwrap can write final HTML with accepted edits applied", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "html-collab-"));
    try {
      const sourceBytes = await readFile(fixturePath);
      const reviewPath = join(tempDir, "simple-report.review.html");
      const finalPath = join(tempDir, "simple-report.final.html");

      await writeFile(
        reviewPath,
        createReviewHtml(sourceBytes, {
          state: stateWithOps(sourceBytes, [
            edit("glen:1", 1, "edit-1", "replace", "Revenue improved 5.0%"),
            editStatus("maya:1", 2, "edit-1", "edit.accept"),
          ]),
        }),
      );

      const result = await unwrapFile(reviewPath, finalPath, { applyAcceptedEdits: true });

      const finalHtml = await readFile(finalPath, "utf8");
      expect(result.sourceBytes).toBe(Buffer.byteLength(finalHtml, "utf8"));
      expect(result.appliedEdits).toBe(1);
      expect(result.skippedEdits).toBe(0);
      expect(finalHtml).toContain("Revenue improved 5.0% versus the prior period.");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("reports zero applied edits when no suggested edits are accepted", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "html-collab-"));
    try {
      const sourceBytes = await readFile(fixturePath);
      const reviewPath = join(tempDir, "simple-report.review.html");
      const finalPath = join(tempDir, "simple-report.final.html");

      await writeFile(
        reviewPath,
        createReviewHtml(sourceBytes, {
          state: stateWithOps(sourceBytes, [
            edit("glen:1", 1, "edit-1", "replace", "Revenue improved 5.0%"),
          ]),
        }),
      );

      const result = await unwrapFile(reviewPath, finalPath, { applyAcceptedEdits: true });
      const finalBytes = await readFile(finalPath);

      expect(result.appliedEdits).toBe(0);
      expect(result.openEdits).toBe(1);
      expect(result.skippedEdits).toBe(1);
      expect(finalBytes.equals(sourceBytes)).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("fails rather than applying ambiguous accepted edits", () => {
    const sourceHtml = "<p>Repeat me.</p><p>Repeat me.</p>";
    const sourceBytes = Buffer.from(sourceHtml);
    const ambiguousEdit = {
      ...edit("glen:1", 1, "edit-1", "replace", "Replacement."),
      target: {
        kind: "text",
        quote: "Repeat me.",
      },
    } as ReviewOp;
    const state = stateWithOps(sourceBytes, [
      ambiguousEdit,
      editStatus("maya:1", 2, "edit-1", "edit.accept"),
    ]);

    expect(() => applyAcceptedEdits(sourceHtml, state)).toThrow(
      "Cannot apply edit edit-1: selected quote is ambiguous in source HTML",
    );
  });
});

function stateWithOps(sourceBytes: Buffer, ops: ReviewOp[]): ReviewState {
  return {
    schemaVersion: 1,
    docId: "doc-1",
    sourceFingerprint: fingerprintSource(sourceBytes),
    title: "simple-report.html",
    actors: {
      glen: { actorId: "glen", name: "Glen" },
      maya: { actorId: "maya", name: "Maya" },
    },
    ops,
  };
}

function edit(
  opId: string,
  clock: number,
  editId: string,
  kind: "replace" | "delete" | "insert",
  replacement?: string,
): ReviewOp {
  return {
    opId,
    actorId: "glen",
    time: `2026-05-22T00:00:0${clock}.000Z`,
    clock,
    type: "edit.suggest",
    target: {
      kind: "text",
      quote: "Revenue improved 4.2%",
      position: { start: 0, end: 21 },
    },
    payload: {
      editId,
      kind,
      ...(replacement ? { replacement } : {}),
    },
  };
}

function editStatus(
  opId: string,
  clock: number,
  editId: string,
  type: "edit.accept" | "edit.reject" | "edit.delete",
): ReviewOp {
  return {
    opId,
    actorId: "maya",
    time: `2026-05-22T00:00:0${clock}.000Z`,
    clock,
    type,
    target: { editId },
    payload: {},
  };
}

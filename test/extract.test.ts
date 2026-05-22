import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extractFile } from "../src/commands/extract";
import { createReviewBundle, extractReview } from "../src/format/extract";
import { createReviewHtml, fingerprintSource } from "../src/format/html-envelope";
import type { ReviewOp, ReviewState } from "../src/format/state";

const fixturePath = join(import.meta.dir, "fixtures", "simple-report.html");

describe("extract", () => {
  test("creates a structured JSON bundle from reduced review state", async () => {
    const sourceBytes = await readFile(fixturePath);
    const state = reviewedState(sourceBytes);

    const bundle = createReviewBundle(state);

    expect(bundle.summary).toEqual({
      openThreads: 0,
      resolvedThreads: 1,
      openEdits: 0,
      acceptedEdits: 0,
      rejectedEdits: 0,
      deletedEdits: 0,
      reviewers: ["Glen", "Maya"],
    });
    expect(bundle.threads[0]).toMatchObject({
      threadId: "thread-1",
      status: "resolved",
      anchor: {
        kind: "text",
        quote: "Revenue improved 4.2%",
        confidence: "high",
        position: { start: 0, end: 21 },
      },
    });
    expect(bundle.threads[0].messages.map((message) => message.body)).toEqual([
      "Check the revenue bridge.",
      "Agreed, add the bridge above the summary.",
    ]);
  });

  test("renders markdown suitable for an author brief", async () => {
    const sourceBytes = await readFile(fixturePath);
    const markdown = extractReview(reviewedState(sourceBytes), "markdown", {
      reviewHref: "simple-report.review.html",
    });

    expect(markdown).toContain("# Review Brief: simple-report.html");
    expect(markdown).toContain("**Comments:** 0 open, 1 resolved");
    expect(markdown).toContain("### Comment 1: resolved");
    expect(markdown).toContain(
      "[Open in review](simple-report.review.html#html-collab-thread-thread-1)",
    );
    expect(markdown).toContain("ID: `thread-1`");
    expect(markdown).toContain("Context:");
    expect(markdown).toContain("**Revenue improved 4.2%**");
    expect(markdown).toContain("Glen: Check the revenue bridge.");
    expect(markdown).toContain("Maya: Agreed, add the bridge above the summary.");
  });

  test("extractFile writes JSON output when --out is used", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "html-collab-"));
    try {
      const sourceBytes = await readFile(fixturePath);
      const reviewPath = join(tempDir, "report.review.html");
      const bundlePath = join(tempDir, "review-bundle.json");

      await writeFile(
        reviewPath,
        createReviewHtml(sourceBytes, {
          state: reviewedState(sourceBytes),
        }),
      );

      await extractFile(reviewPath, { format: "json", outputPath: bundlePath });

      const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
      expect(bundle.docId).toBe("doc-1");
      expect(bundle.summary.resolvedThreads).toBe(1);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("includes suggested edits in JSON and markdown briefs", async () => {
    const sourceBytes = await readFile(fixturePath);
    const state: ReviewState = {
      ...reviewedState(sourceBytes),
      ops: [
        edit("glen:3", 4, "edit-1", "replace", "Revenue improved 5.0%"),
        {
          opId: "maya:2",
          actorId: "maya",
          time: "2026-05-22T00:00:05.000Z",
          clock: 5,
          type: "edit.reject",
          target: { editId: "edit-1" },
          payload: {},
        },
      ],
    };

    const bundle = createReviewBundle(state);
    const markdown = extractReview(state, "markdown", {
      reviewHref: "simple-report.review.html",
    });

    expect(bundle.summary.rejectedEdits).toBe(1);
    expect(bundle.edits[0]).toMatchObject({
      editId: "edit-1",
      status: "rejected",
      kind: "replace",
      replacement: "Revenue improved 5.0%",
    });
    expect(markdown).toContain("## Suggested Edits");
    expect(markdown).toContain("### Edit 1: rejected replace");
    expect(markdown).toContain("[Open in review](simple-report.review.html#html-collab-edit-edit-1)");
    expect(markdown).toContain("Replace with: Revenue improved 5.0%");
  });

  test("renders an agent plan with inferred comment actions", async () => {
    const sourceBytes = await readFile(fixturePath);
    const state = instructionState(sourceBytes);

    const agent = extractReview(state, "agent", {
      reviewHref: "simple-report.review.html",
    });

    expect(agent).toContain("# Agent Review Plan: simple-report.html");
    expect(agent).toContain("## Direct Actions");
    expect(agent).toContain("Replace selected text `1` with `5`");
    expect(agent).toContain("Source: comment `thread-make-5`");
    expect(agent).toContain("Confidence: medium");
    expect(agent).toContain("No blocking questions from open comments.");
  });
});

function reviewedState(sourceBytes: Buffer): ReviewState {
  return {
    schemaVersion: 1,
    docId: "doc-1",
    sourceFingerprint: fingerprintSource(sourceBytes),
    title: "simple-report.html",
    actors: {
      glen: { actorId: "glen", name: "Glen" },
      maya: { actorId: "maya", name: "Maya" },
    },
    ops: [
      comment("glen:1", 1),
      reply("maya:1", 2),
      {
        opId: "glen:2",
        actorId: "glen",
        time: "2026-05-22T00:00:03.000Z",
        clock: 3,
        type: "thread.resolve",
        target: { threadId: "thread-1" },
        payload: {},
      },
    ],
  };
}

function instructionState(sourceBytes: Buffer): ReviewState {
  return {
    schemaVersion: 1,
    docId: "doc-1",
    sourceFingerprint: fingerprintSource(sourceBytes),
    title: "simple-report.html",
    actors: {
      glen: { actorId: "glen", name: "Glen" },
    },
    ops: [
      {
        opId: "glen:1",
        actorId: "glen",
        time: "2026-05-22T00:00:01.000Z",
        clock: 1,
        type: "comment.create",
        target: {
          kind: "text",
          quote: "1",
          prefix: "Three things to take away ",
          suffix: " / GET CLEAR ON THE VISION",
          position: { start: 27, end: 28 },
        },
        payload: {
          threadId: "thread-make-5",
          body: "Make this 5",
        },
      },
    ],
  };
}

function comment(opId: string, clock: number): ReviewOp {
  return {
    opId,
    actorId: "glen",
    time: `2026-05-22T00:00:0${clock}.000Z`,
    clock,
    type: "comment.create",
    target: {
      kind: "text",
      quote: "Revenue improved 4.2%",
      position: { start: 0, end: 21 },
    },
    payload: {
      threadId: "thread-1",
      body: "Check the revenue bridge.",
    },
  };
}

function reply(opId: string, clock: number): ReviewOp {
  return {
    opId,
    actorId: "maya",
    time: `2026-05-22T00:00:0${clock}.000Z`,
    clock,
    type: "reply.create",
    target: {
      threadId: "thread-1",
      parentId: "glen:1",
    },
    payload: {
      body: "Agreed, add the bridge above the summary.",
    },
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

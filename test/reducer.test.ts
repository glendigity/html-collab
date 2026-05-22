import { describe, expect, test } from "bun:test";

import { reduceReviewState } from "../src/format/reduce";
import type { ReviewOp, ReviewState, TextAnchor } from "../src/format/state";

const anchor: TextAnchor = {
  kind: "text",
  quote: "Revenue improved 4.2%",
  prefix: "summary ",
  suffix: " versus",
  position: { start: 10, end: 31 },
};

describe("reduceReviewState", () => {
  test("builds threads with replies in deterministic order", () => {
    const state = stateWithOps([
      comment("maya:2", 2, "thread-1", "Root"),
      reply("ari:1", 1, "thread-1", "Earlier reply"),
      reply("glen:3", 3, "thread-1", "Later reply"),
    ]);

    const reduced = reduceReviewState(state);

    expect(reduced.invalidOps).toEqual([]);
    expect(reduced.threads).toHaveLength(1);
    expect(reduced.threads[0].root.body).toBe("Root");
    expect(reduced.threads[0].replies.map((message) => message.body)).toEqual([
      "Earlier reply",
      "Later reply",
    ]);
  });

  test("applies message edits without dropping parallel replies", () => {
    const state = stateWithOps([
      comment("glen:1", 1, "thread-1", "Original root"),
      reply("maya:1", 2, "thread-1", "Reply survives"),
      {
        opId: "glen:2",
        actorId: "glen",
        time: "2026-05-22T00:00:03.000Z",
        clock: 3,
        type: "comment.edit",
        target: { messageId: "glen:1" },
        payload: { body: "Edited root" },
      },
    ]);

    const [thread] = reduceReviewState(state).threads;

    expect(thread.root.body).toBe("Edited root");
    expect(thread.replies.map((message) => message.body)).toEqual(["Reply survives"]);
  });

  test("resolves and reopens by clock, timestamp, then opId", () => {
    const state = stateWithOps([
      comment("glen:1", 1, "thread-1", "Root"),
      status("maya:1", 2, "thread-1", "thread.resolve"),
      status("glen:2", 3, "thread-1", "thread.reopen"),
    ]);

    const [thread] = reduceReviewState(state).threads;

    expect(thread.status).toBe("open");
  });

  test("surfaces invalid operations without discarding valid threads", () => {
    const state = stateWithOps([
      comment("glen:1", 1, "thread-1", "Root"),
      reply("maya:1", 2, "missing-thread", "Orphan"),
    ]);

    const reduced = reduceReviewState(state);

    expect(reduced.threads).toHaveLength(1);
    expect(reduced.invalidOps).toEqual([
      {
        opId: "maya:1",
        reason: "reply targets missing thread missing-thread",
      },
    ]);
  });

  test("reduces suggested edits with accept reject and delete status", () => {
    const state = stateWithOps([
      edit("glen:1", 1, "edit-1", "replace", "Revenue improved 5.0%"),
      editStatus("maya:1", 2, "edit-1", "edit.accept"),
      editStatus("glen:2", 3, "edit-1", "edit.delete"),
    ]);

    const reduced = reduceReviewState(state);

    expect(reduced.invalidOps).toEqual([]);
    expect(reduced.edits).toHaveLength(1);
    expect(reduced.edits[0]).toMatchObject({
      editId: "edit-1",
      status: "deleted",
      kind: "replace",
      replacement: "Revenue improved 5.0%",
    });
  });
});

function stateWithOps(ops: ReviewOp[]): ReviewState {
  return {
    schemaVersion: 1,
    docId: "doc-1",
    sourceFingerprint: "sha256:test",
    actors: {
      glen: { actorId: "glen", name: "Glen" },
      maya: { actorId: "maya", name: "Maya" },
      ari: { actorId: "ari", name: "Ari" },
    },
    ops,
  };
}

function comment(opId: string, clock: number, threadId: string, body: string): ReviewOp {
  return {
    opId,
    actorId: opId.split(":")[0],
    time: time(clock),
    clock,
    type: "comment.create",
    target: anchor,
    payload: { threadId, body },
  };
}

function reply(opId: string, clock: number, threadId: string, body: string): ReviewOp {
  return {
    opId,
    actorId: opId.split(":")[0],
    time: time(clock),
    clock,
    type: "reply.create",
    target: { threadId },
    payload: { body },
  };
}

function status(
  opId: string,
  clock: number,
  threadId: string,
  type: "thread.resolve" | "thread.reopen",
): ReviewOp {
  return {
    opId,
    actorId: opId.split(":")[0],
    time: time(clock),
    clock,
    type,
    target: { threadId },
    payload: {},
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
    actorId: opId.split(":")[0],
    time: time(clock),
    clock,
    type: "edit.suggest",
    target: anchor,
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
    actorId: opId.split(":")[0],
    time: time(clock),
    clock,
    type,
    target: { editId },
    payload: {},
  };
}

function time(offset: number): string {
  return `2026-05-22T00:00:0${offset}.000Z`;
}

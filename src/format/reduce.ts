import type { Actor, EditKind, ReviewOp, ReviewState, TextAnchor } from "./state";

export type ReducedReview = {
  schemaVersion: 1;
  docId: string;
  sourceFingerprint: string;
  title?: string;
  actors: Record<string, Actor>;
  threads: ReducedThread[];
  edits: ReducedEdit[];
  invalidOps: InvalidOp[];
};

export type ReducedThread = {
  threadId: string;
  status: "open" | "resolved";
  anchor: TextAnchor;
  root: ReducedMessage;
  replies: ReducedMessage[];
  createdAt: string;
  updatedAt: string;
};

export type ReducedMessage = {
  messageId: string;
  actorId: string;
  body: string;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ReducedEdit = {
  editId: string;
  status: "open" | "accepted" | "rejected" | "deleted";
  kind: EditKind;
  anchor: TextAnchor;
  replacement?: string;
  note?: string;
  actorId: string;
  createdAt: string;
  updatedAt: string;
};

export type InvalidOp = {
  opId?: string;
  reason: string;
};

type MutableThread = {
  threadId: string;
  status: "open" | "resolved";
  anchor: TextAnchor;
  root: MutableMessage;
  replies: MutableMessage[];
  createdOp: ReviewOp;
  statusOp?: ReviewOp;
};

type MutableMessage = {
  messageId: string;
  actorId: string;
  body: string;
  deleted: boolean;
  createOp: ReviewOp;
  updateOp: ReviewOp;
  parentId?: string;
};

type MutableEdit = {
  editId: string;
  status: "open" | "accepted" | "rejected" | "deleted";
  kind: EditKind;
  anchor: TextAnchor;
  replacement?: string;
  note?: string;
  createdOp: ReviewOp;
  statusOp?: ReviewOp;
};

export function reduceReviewState(state: ReviewState): ReducedReview {
  const invalidOps: InvalidOp[] = [];
  const uniqueOps = dedupeOps(state.ops, invalidOps).sort(compareOps);
  const threadById = new Map<string, MutableThread>();
  const messageById = new Map<string, MutableMessage>();
  const editById = new Map<string, MutableEdit>();

  for (const op of uniqueOps) {
    if (op.type === "comment.create") {
      const threadId = op.payload.threadId;
      if (!threadId) {
        invalidOps.push({ opId: op.opId, reason: "comment.create missing threadId" });
        continue;
      }

      if (threadById.has(threadId)) {
        invalidOps.push({ opId: op.opId, reason: `duplicate threadId ${threadId}` });
        continue;
      }

      const root: MutableMessage = {
        messageId: op.opId,
        actorId: op.actorId,
        body: op.payload.body,
        deleted: false,
        createOp: op,
        updateOp: op,
      };
      const thread: MutableThread = {
        threadId,
        status: "open",
        anchor: op.target,
        root,
        replies: [],
        createdOp: op,
      };

      threadById.set(threadId, thread);
      messageById.set(root.messageId, root);
      continue;
    }

    if (op.type === "edit.suggest") {
      const editId = op.payload.editId;
      if (!editId) {
        invalidOps.push({ opId: op.opId, reason: "edit.suggest missing editId" });
        continue;
      }
      if (editById.has(editId)) {
        invalidOps.push({ opId: op.opId, reason: `duplicate editId ${editId}` });
        continue;
      }
      if ((op.payload.kind === "replace" || op.payload.kind === "insert") && !op.payload.replacement) {
        invalidOps.push({ opId: op.opId, reason: `${op.payload.kind} edit missing replacement` });
        continue;
      }

      editById.set(editId, {
        editId,
        status: "open",
        kind: op.payload.kind,
        anchor: op.target,
        replacement: op.payload.replacement,
        note: op.payload.note,
        createdOp: op,
      });
    }
  }

  for (const op of uniqueOps) {
    switch (op.type) {
      case "comment.create":
        break;
      case "reply.create": {
        const thread = threadById.get(op.target.threadId);
        if (!thread) {
          invalidOps.push({ opId: op.opId, reason: `reply targets missing thread ${op.target.threadId}` });
          break;
        }
        if (messageById.has(op.opId)) {
          invalidOps.push({ opId: op.opId, reason: `duplicate messageId ${op.opId}` });
          break;
        }

        const reply: MutableMessage = {
          messageId: op.opId,
          actorId: op.actorId,
          body: op.payload.body,
          deleted: false,
          createOp: op,
          updateOp: op,
          parentId: op.target.parentId,
        };
        thread.replies.push(reply);
        messageById.set(reply.messageId, reply);
        break;
      }
      case "comment.edit":
      case "reply.edit": {
        const message = messageById.get(op.target.messageId);
        if (!message) {
          invalidOps.push({ opId: op.opId, reason: `edit targets missing message ${op.target.messageId}` });
          break;
        }
        if (compareOps(message.updateOp, op) <= 0) {
          message.body = op.payload.body;
          message.updateOp = op;
        }
        break;
      }
      case "comment.delete":
      case "reply.delete": {
        const message = messageById.get(op.target.messageId);
        if (!message) {
          invalidOps.push({ opId: op.opId, reason: `delete targets missing message ${op.target.messageId}` });
          break;
        }
        if (compareOps(message.updateOp, op) <= 0) {
          message.deleted = true;
          message.updateOp = op;
        }
        break;
      }
      case "thread.resolve":
      case "thread.reopen": {
        const thread = threadById.get(op.target.threadId);
        if (!thread) {
          invalidOps.push({ opId: op.opId, reason: `status targets missing thread ${op.target.threadId}` });
          break;
        }
        if (!thread.statusOp || compareOps(thread.statusOp, op) <= 0) {
          thread.status = op.type === "thread.resolve" ? "resolved" : "open";
          thread.statusOp = op;
        }
        break;
      }
      case "edit.suggest":
        break;
      case "edit.accept":
      case "edit.reject":
      case "edit.delete": {
        const edit = editById.get(op.target.editId);
        if (!edit) {
          invalidOps.push({ opId: op.opId, reason: `edit status targets missing edit ${op.target.editId}` });
          break;
        }
        if (!edit.statusOp || compareOps(edit.statusOp, op) <= 0) {
          edit.status =
            op.type === "edit.accept" ? "accepted" : op.type === "edit.reject" ? "rejected" : "deleted";
          edit.statusOp = op;
        }
        break;
      }
      default: {
        const unknownOp = op as ReviewOp;
        invalidOps.push({ opId: unknownOp.opId, reason: `unsupported operation ${unknownOp.type}` });
      }
    }
  }

  const threads = Array.from(threadById.values())
    .map((thread) => reduceThread(thread))
    .sort((left, right) => {
      const created = left.createdAt.localeCompare(right.createdAt);
      if (created !== 0) {
        return created;
      }
      return left.threadId.localeCompare(right.threadId);
    });
  const edits = Array.from(editById.values())
    .map((edit) => reduceEdit(edit))
    .sort((left, right) => {
      const created = left.createdAt.localeCompare(right.createdAt);
      if (created !== 0) {
        return created;
      }
      return left.editId.localeCompare(right.editId);
    });

  return {
    schemaVersion: 1,
    docId: state.docId,
    sourceFingerprint: state.sourceFingerprint,
    title: state.title,
    actors: state.actors,
    threads,
    edits,
    invalidOps,
  };
}

export function compareOps(left: ReviewOp, right: ReviewOp): number {
  if (left.clock !== right.clock) {
    return left.clock - right.clock;
  }

  const timeComparison = left.time.localeCompare(right.time);
  if (timeComparison !== 0) {
    return timeComparison;
  }

  return left.opId.localeCompare(right.opId);
}

function dedupeOps(ops: ReviewOp[], invalidOps: InvalidOp[]): ReviewOp[] {
  const byId = new Map<string, ReviewOp>();

  for (const op of ops) {
    if (!op || typeof op !== "object" || !("opId" in op) || typeof op.opId !== "string") {
      invalidOps.push({ reason: "operation missing opId" });
      continue;
    }

    const existing = byId.get(op.opId);
    if (!existing || compareOps(existing, op) <= 0) {
      byId.set(op.opId, op);
    }
  }

  return Array.from(byId.values());
}

function reduceThread(thread: MutableThread): ReducedThread {
  const messages = [thread.root, ...thread.replies];
  const updatedAt = messages
    .map((message) => message.updateOp.time)
    .concat(thread.statusOp?.time ?? thread.createdOp.time)
    .sort()
    .at(-1) ?? thread.createdOp.time;

  return {
    threadId: thread.threadId,
    status: thread.status,
    anchor: thread.anchor,
    root: reduceMessage(thread.root),
    replies: thread.replies.sort((left, right) => compareOps(left.createOp, right.createOp)).map(reduceMessage),
    createdAt: thread.createdOp.time,
    updatedAt,
  };
}

function reduceMessage(message: MutableMessage): ReducedMessage {
  return {
    messageId: message.messageId,
    actorId: message.actorId,
    body: message.body,
    deleted: message.deleted,
    createdAt: message.createOp.time,
    updatedAt: message.updateOp.time,
  };
}

function reduceEdit(edit: MutableEdit): ReducedEdit {
  return {
    editId: edit.editId,
    status: edit.status,
    kind: edit.kind,
    anchor: edit.anchor,
    replacement: edit.replacement,
    note: edit.note,
    actorId: edit.createdOp.actorId,
    createdAt: edit.createdOp.time,
    updatedAt: edit.statusOp?.time ?? edit.createdOp.time,
  };
}

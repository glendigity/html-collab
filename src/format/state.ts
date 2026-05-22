export type ReviewState = {
  schemaVersion: 1;
  docId: string;
  sourceFingerprint: string;
  title?: string;
  actors: Record<string, Actor>;
  ops: ReviewOp[];
};

export type SourcePayload = {
  encoding: "base64";
  html: string;
};

export type Actor = {
  actorId: string;
  name: string;
  createdAt?: string;
};

export type TextAnchor = {
  kind: "text";
  quote: string;
  prefix?: string;
  suffix?: string;
  position?: {
    start: number;
    end: number;
  };
  elementFingerprint?: string;
  headingPath?: string[];
};

export type ThreadTarget = {
  threadId: string;
};

export type MessageTarget = {
  messageId: string;
};

export type ReplyTarget = {
  threadId: string;
  parentId?: string;
};

export type EditTarget = {
  editId: string;
};

export type EditKind = "replace" | "delete" | "insert";

export type ReviewOp =
  | CommentCreateOp
  | CommentEditOp
  | CommentDeleteOp
  | ReplyCreateOp
  | ReplyEditOp
  | ReplyDeleteOp
  | ThreadResolveOp
  | ThreadReopenOp
  | EditSuggestOp
  | EditAcceptOp
  | EditRejectOp
  | EditDeleteOp;

export type ReviewOpBase<TType extends string, TTarget, TPayload> = {
  opId: string;
  actorId: string;
  time: string;
  clock: number;
  type: TType;
  target: TTarget;
  payload: TPayload;
};

export type CommentCreateOp = ReviewOpBase<
  "comment.create",
  TextAnchor,
  {
    threadId: string;
    body: string;
  }
>;

export type CommentEditOp = ReviewOpBase<
  "comment.edit",
  MessageTarget,
  {
    body: string;
  }
>;

export type CommentDeleteOp = ReviewOpBase<"comment.delete", MessageTarget, Record<string, never>>;

export type ReplyCreateOp = ReviewOpBase<
  "reply.create",
  ReplyTarget,
  {
    body: string;
  }
>;

export type ReplyEditOp = ReviewOpBase<
  "reply.edit",
  MessageTarget,
  {
    body: string;
  }
>;

export type ReplyDeleteOp = ReviewOpBase<"reply.delete", MessageTarget, Record<string, never>>;

export type ThreadResolveOp = ReviewOpBase<"thread.resolve", ThreadTarget, Record<string, never>>;

export type ThreadReopenOp = ReviewOpBase<"thread.reopen", ThreadTarget, Record<string, never>>;

export type EditSuggestOp = ReviewOpBase<
  "edit.suggest",
  TextAnchor,
  {
    editId: string;
    kind: EditKind;
    replacement?: string;
    note?: string;
  }
>;

export type EditAcceptOp = ReviewOpBase<"edit.accept", EditTarget, Record<string, never>>;

export type EditRejectOp = ReviewOpBase<"edit.reject", EditTarget, Record<string, never>>;

export type EditDeleteOp = ReviewOpBase<"edit.delete", EditTarget, Record<string, never>>;

export function createInitialState(input: {
  docId: string;
  sourceFingerprint: string;
  title?: string;
}): ReviewState {
  const state: ReviewState = {
    schemaVersion: 1,
    docId: input.docId,
    sourceFingerprint: input.sourceFingerprint,
    actors: {},
    ops: [],
  };

  if (input.title) {
    state.title = input.title;
  }

  return state;
}

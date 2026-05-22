import { reduceReviewState, type ReducedEdit, type ReducedMessage, type ReducedReview } from "./reduce";
import type { EditKind, ReviewState } from "./state";

export type ExtractFormat = "markdown" | "json" | "text" | "agent";

export type ExtractReviewOptions = {
  reviewHref?: string;
};

export type ReviewBundle = {
  schemaVersion: 1;
  docId: string;
  title?: string;
  sourceFingerprint: string;
  summary: {
    openThreads: number;
    resolvedThreads: number;
    openEdits: number;
    acceptedEdits: number;
    rejectedEdits: number;
    deletedEdits: number;
    reviewers: string[];
  };
  threads: ReviewBundleThread[];
  edits: ReviewBundleEdit[];
  invalidOps: ReducedReview["invalidOps"];
};

export type ReviewBundleThread = {
  threadId: string;
  status: "open" | "resolved";
  anchor: {
    kind: "text";
    quote: string;
    confidence: "high" | "medium" | "low";
    position?: {
      start: number;
      end: number;
    };
    prefix?: string;
    suffix?: string;
    elementFingerprint?: string;
    headingPath?: string[];
  };
  messages: ReviewBundleMessage[];
};

export type ReviewBundleMessage = {
  messageId: string;
  actor: string;
  actorId: string;
  type: "comment" | "reply";
  body: string;
  deleted: boolean;
};

export type ReviewBundleEdit = {
  editId: string;
  status: "open" | "accepted" | "rejected" | "deleted";
  kind: EditKind;
  actor: string;
  actorId: string;
  anchor: ReviewBundleThread["anchor"];
  replacement?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

type ThreadReplacementInference = {
  replacement: string;
  reason: string;
};

export function extractReview(
  state: ReviewState,
  format: ExtractFormat,
  options: ExtractReviewOptions = {},
): string {
  const bundle = createReviewBundle(state);

  if (format === "json") {
    return `${JSON.stringify(bundle, null, 2)}\n`;
  }

  if (format === "text") {
    return renderTextBrief(bundle);
  }

  if (format === "agent") {
    return renderAgentBrief(bundle, options);
  }

  return renderMarkdownBrief(bundle, options);
}

export function createReviewBundle(state: ReviewState): ReviewBundle {
  const reduced = reduceReviewState(state);
  const reviewers = Object.values(reduced.actors)
    .map((actor) => actor.name)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));

  return {
    schemaVersion: 1,
    docId: reduced.docId,
    title: reduced.title,
    sourceFingerprint: reduced.sourceFingerprint,
    summary: {
      openThreads: reduced.threads.filter((thread) => thread.status === "open").length,
      resolvedThreads: reduced.threads.filter((thread) => thread.status === "resolved").length,
      openEdits: reduced.edits.filter((edit) => edit.status === "open").length,
      acceptedEdits: reduced.edits.filter((edit) => edit.status === "accepted").length,
      rejectedEdits: reduced.edits.filter((edit) => edit.status === "rejected").length,
      deletedEdits: reduced.edits.filter((edit) => edit.status === "deleted").length,
      reviewers,
    },
    threads: reduced.threads.map((thread) => ({
      threadId: thread.threadId,
      status: thread.status,
      anchor: {
        kind: thread.anchor.kind,
        quote: thread.anchor.quote,
        confidence: thread.anchor.position ? "high" : "medium",
        position: thread.anchor.position,
        prefix: thread.anchor.prefix,
        suffix: thread.anchor.suffix,
        elementFingerprint: thread.anchor.elementFingerprint,
        headingPath: thread.anchor.headingPath,
      },
      messages: [
        toBundleMessage(thread.root, "comment", reduced),
        ...thread.replies.map((reply) => toBundleMessage(reply, "reply", reduced)),
      ],
    })),
    edits: reduced.edits.map((edit) => toBundleEdit(edit, reduced)),
    invalidOps: reduced.invalidOps,
  };
}

function renderMarkdownBrief(bundle: ReviewBundle, options: ExtractReviewOptions): string {
  const lines = [
    `# Review Brief: ${bundle.title ?? bundle.docId}`,
    "",
    `**Reviewers:** ${bundle.summary.reviewers.length ? bundle.summary.reviewers.join(", ") : "None"}`,
    `**Comments:** ${bundle.summary.openThreads} open, ${bundle.summary.resolvedThreads} resolved`,
    `**Suggested edits:** ${bundle.summary.openEdits} open, ${bundle.summary.acceptedEdits} accepted, ${bundle.summary.rejectedEdits} rejected, ${bundle.summary.deletedEdits} deleted`,
    "",
    "## Comments",
    "",
  ];

  if (bundle.threads.length === 0) {
    lines.push("No comments.", "");
  }

  bundle.threads.forEach((thread, index) => {
    const link = threadLink(options.reviewHref, thread.threadId);
    lines.push(`### Comment ${index + 1}: ${thread.status}`);
    lines.push("");
    if (link) {
      lines.push(`- [Open in review](${link})`);
    }
    const location = locationLabel(thread.anchor);
    if (location) {
      lines.push(`- Location: ${location}`);
    }
    lines.push(`- ID: \`${thread.threadId}\``);
    lines.push("");
    lines.push("Context:");
    lines.push("");
    lines.push("> " + renderAnchorContextMarkdown(thread.anchor));
    lines.push("");
    lines.push("Messages:");
    for (const message of thread.messages) {
      if (message.deleted) {
        continue;
      }
      lines.push(`- ${message.actor}: ${message.body}`);
    }
    lines.push("");
  });

  lines.push("## Suggested Edits", "");
  if (bundle.edits.length === 0) {
    lines.push("No suggested edits.", "");
  }

  bundle.edits.forEach((edit, index) => {
    const link = editLink(options.reviewHref, edit.editId);
    lines.push(`### Edit ${index + 1}: ${edit.status} ${edit.kind}`);
    lines.push("");
    if (link) {
      lines.push(`- [Open in review](${link})`);
    }
    const location = locationLabel(edit.anchor);
    if (location) {
      lines.push(`- Location: ${location}`);
    }
    lines.push(`- ID: \`${edit.editId}\``);
    lines.push(`- Reviewer: ${edit.actor}`);
    lines.push("");
    lines.push("Context:");
    lines.push("");
    lines.push("> " + renderAnchorContextMarkdown(edit.anchor));
    lines.push("");
    if (edit.kind === "replace") {
      lines.push(`Replace with: ${edit.replacement ?? ""}`);
    } else if (edit.kind === "insert") {
      lines.push(`Insert after selection: ${edit.replacement ?? ""}`);
    } else {
      lines.push("Delete selected text.");
    }
    if (edit.note) {
      lines.push(`Note: ${edit.note}`);
    }
    lines.push("");
  });

  if (bundle.invalidOps.length > 0) {
    lines.push("## Invalid Operations", "");
    for (const invalid of bundle.invalidOps) {
      lines.push(`- ${invalid.opId ?? "unknown"}: ${invalid.reason}`);
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function renderTextBrief(bundle: ReviewBundle): string {
  const lines = [
    `Review Brief: ${bundle.title ?? bundle.docId}`,
    `Reviewers: ${bundle.summary.reviewers.length ? bundle.summary.reviewers.join(", ") : "None"}`,
    `Comments: ${bundle.summary.openThreads} open, ${bundle.summary.resolvedThreads} resolved`,
    `Suggested edits: ${bundle.summary.openEdits} open, ${bundle.summary.acceptedEdits} accepted, ${bundle.summary.rejectedEdits} rejected, ${bundle.summary.deletedEdits} deleted`,
  ];

  bundle.threads.forEach((thread, index) => {
    lines.push("");
    lines.push(`Comment ${index + 1}: ${thread.status}`);
    const location = locationLabel(thread.anchor);
    if (location) {
      lines.push(`Location: ${location}`);
    }
    lines.push(`ID: ${thread.threadId}`);
    lines.push(`Context: ${renderAnchorContextPlain(thread.anchor)}`);
    for (const message of thread.messages) {
      if (!message.deleted) {
        lines.push(`${message.actor}: ${message.body}`);
      }
    }
  });

  bundle.edits.forEach((edit, index) => {
    lines.push("");
    lines.push(`Edit ${index + 1}: ${edit.status} ${edit.kind}`);
    const location = locationLabel(edit.anchor);
    if (location) {
      lines.push(`Location: ${location}`);
    }
    lines.push(`ID: ${edit.editId}`);
    lines.push(`Reviewer: ${edit.actor}`);
    lines.push(`Context: ${renderAnchorContextPlain(edit.anchor)}`);
    if (edit.kind === "replace") {
      lines.push(`Replace with: ${edit.replacement ?? ""}`);
    } else if (edit.kind === "insert") {
      lines.push(`Insert after selection: ${edit.replacement ?? ""}`);
    } else {
      lines.push("Delete selected text.");
    }
    if (edit.note) {
      lines.push(`Note: ${edit.note}`);
    }
  });

  return `${lines.join("\n").trimEnd()}\n`;
}

function renderAgentBrief(bundle: ReviewBundle, options: ExtractReviewOptions): string {
  const inferredThreadActions = bundle.threads
    .filter((thread) => thread.status === "open")
    .map((thread) => ({ thread, inference: inferThreadReplacement(thread) }))
    .filter((entry): entry is { thread: ReviewBundleThread; inference: ThreadReplacementInference } =>
      Boolean(entry.inference),
    );
  const inferredThreadIds = new Set(inferredThreadActions.map((entry) => entry.thread.threadId));
  const actionableEdits = bundle.edits.filter((edit) => edit.status === "open" || edit.status === "accepted");
  const questionThreads = bundle.threads.filter(
    (thread) => thread.status === "open" && !inferredThreadIds.has(thread.threadId),
  );

  const lines = [
    `# Agent Review Plan: ${bundle.title ?? bundle.docId}`,
    "",
    `Reviewers: ${bundle.summary.reviewers.length ? bundle.summary.reviewers.join(", ") : "None"}`,
    `Open comments: ${bundle.summary.openThreads}`,
    `Open suggested edits: ${bundle.summary.openEdits}`,
    "",
    "Use `html-collab extract --format json` as the deterministic source of truth when applying these actions.",
    "Preserve thread/edit IDs in work notes and report any inferred changes as inferred.",
    "",
    "## Direct Actions",
    "",
  ];

  if (actionableEdits.length === 0 && inferredThreadActions.length === 0) {
    lines.push("No direct actions found.", "");
  }

  for (const edit of actionableEdits) {
    const link = editLink(options.reviewHref, edit.editId);
    lines.push(`- ${agentEditActionLabel(edit)}`);
    lines.push(`  - Source: edit \`${edit.editId}\`${link ? ` (${link})` : ""}`);
    lines.push(`  - Status: ${edit.status}`);
    lines.push("  - Confidence: high");
    lines.push(`  - Context: ${renderAnchorContextPlain(edit.anchor)}`);
    if (edit.note) {
      lines.push(`  - Reviewer note: ${edit.note}`);
    }
    lines.push("");
  }

  for (const { thread, inference } of inferredThreadActions) {
    const link = threadLink(options.reviewHref, thread.threadId);
    lines.push(`- Replace selected text \`${thread.anchor.quote}\` with \`${inference.replacement}\``);
    lines.push(`  - Source: comment \`${thread.threadId}\`${link ? ` (${link})` : ""}`);
    lines.push("  - Confidence: medium");
    lines.push(`  - Reason: ${inference.reason}`);
    lines.push(`  - Context: ${renderAnchorContextPlain(thread.anchor)}`);
    lines.push("");
  }

  lines.push("## Questions", "");
  if (questionThreads.length === 0) {
    lines.push("No blocking questions from open comments.", "");
  }

  for (const thread of questionThreads) {
    const link = threadLink(options.reviewHref, thread.threadId);
    lines.push(`- Clarify comment \`${thread.threadId}\`${link ? ` (${link})` : ""}`);
    lines.push(`  - Context: ${renderAnchorContextPlain(thread.anchor)}`);
    for (const message of thread.messages) {
      if (!message.deleted) {
        lines.push(`  - ${message.actor}: ${message.body}`);
      }
    }
    lines.push("");
  }

  lines.push("## Suggested Edits", "");
  if (bundle.edits.length === 0) {
    lines.push("No suggested edits.", "");
  }

  for (const edit of bundle.edits) {
    const link = editLink(options.reviewHref, edit.editId);
    lines.push(`- \`${edit.editId}\`: ${edit.status} ${edit.kind}${link ? ` (${link})` : ""}`);
    if (edit.kind === "replace") {
      lines.push(`  - Replace \`${edit.anchor.quote}\` with \`${edit.replacement ?? ""}\``);
    } else if (edit.kind === "insert") {
      lines.push(`  - Insert \`${edit.replacement ?? ""}\` after \`${edit.anchor.quote}\``);
    } else {
      lines.push(`  - Delete \`${edit.anchor.quote}\``);
    }
  }

  if (bundle.invalidOps.length > 0) {
    lines.push("", "## Invalid Operations", "");
    for (const invalid of bundle.invalidOps) {
      lines.push(`- ${invalid.opId ?? "unknown"}: ${invalid.reason}`);
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function toBundleMessage(
  message: ReducedMessage,
  type: "comment" | "reply",
  reduced: ReducedReview,
): ReviewBundleMessage {
  return {
    messageId: message.messageId,
    actor: reduced.actors[message.actorId]?.name ?? message.actorId,
    actorId: message.actorId,
    type,
    body: message.body,
    deleted: message.deleted,
  };
}

function toBundleEdit(edit: ReducedEdit, reduced: ReducedReview): ReviewBundleEdit {
  return {
    editId: edit.editId,
    status: edit.status,
    kind: edit.kind,
    actor: reduced.actors[edit.actorId]?.name ?? edit.actorId,
    actorId: edit.actorId,
    anchor: {
      kind: edit.anchor.kind,
      quote: edit.anchor.quote,
      confidence: edit.anchor.position ? "high" : "medium",
      position: edit.anchor.position,
      prefix: edit.anchor.prefix,
      suffix: edit.anchor.suffix,
      elementFingerprint: edit.anchor.elementFingerprint,
      headingPath: edit.anchor.headingPath,
    },
    replacement: edit.replacement,
    note: edit.note,
    createdAt: edit.createdAt,
    updatedAt: edit.updatedAt,
  };
}

function agentEditActionLabel(edit: ReviewBundleEdit): string {
  if (edit.kind === "replace") {
    return `Replace selected text \`${edit.anchor.quote}\` with \`${edit.replacement ?? ""}\``;
  }
  if (edit.kind === "insert") {
    return `Insert \`${edit.replacement ?? ""}\` after selected text \`${edit.anchor.quote}\``;
  }
  return `Delete selected text \`${edit.anchor.quote}\``;
}

function inferThreadReplacement(thread: ReviewBundleThread): ThreadReplacementInference | undefined {
  const message = lastVisibleMessage(thread);
  if (!message) {
    return undefined;
  }

  const body = collapseWhitespace(message.body);
  const quoted = extractQuotedReplacement(body);
  if (quoted) {
    return {
      replacement: quoted,
      reason: `${message.actor} said "${body}" on selected text "${thread.anchor.quote}".`,
    };
  }

  const patterns = [
    /^(?:please\s+)?(?:change|replace)\s+(?:this|it|that|selection|selected text|the selected text)?\s*(?:with|to|into)\s+(.+)$/i,
    /^(?:please\s+)?(?:use)\s+(.+?)\s+instead$/i,
    /^(?:please\s+)?(?:make)\s+(?:this|it|that|selection|selected text|the selected text)\s+(.+)$/i,
    /^(?:please\s+)?(?:this|it|that|selection|selected text|the selected text)\s+should\s+be\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(body);
    if (!match?.[1]) {
      continue;
    }
    const replacement = cleanReplacementLiteral(match[1]);
    if (isLikelyLiteralReplacement(replacement, thread.anchor.quote)) {
      return {
        replacement,
        reason: `${message.actor} said "${body}" on selected text "${thread.anchor.quote}".`,
      };
    }
  }

  return undefined;
}

function lastVisibleMessage(thread: ReviewBundleThread): ReviewBundleMessage | undefined {
  return thread.messages.filter((message) => !message.deleted).at(-1);
}

function extractQuotedReplacement(body: string): string | undefined {
  const match = /(?:change|replace|make|use|should be|to|with)\s+["'“”‘’`](.+?)["'“”‘’`]/i.exec(body);
  return match?.[1] ? cleanReplacementLiteral(match[1]) : undefined;
}

function cleanReplacementLiteral(value: string): string {
  return value
    .trim()
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
    .replace(/[.!?]$/g, "")
    .trim();
}

function isLikelyLiteralReplacement(replacement: string, quote: string): boolean {
  if (!replacement) {
    return false;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(replacement)) {
    return true;
  }
  if (replacement.length <= 24 && !/\s/.test(replacement) && !/[.,;:!?]/.test(replacement) && quote.length <= 40) {
    return true;
  }
  return false;
}

function threadLink(reviewHref: string | undefined, threadId: string): string | undefined {
  if (!reviewHref) {
    return undefined;
  }
  return `${reviewHref}#${threadElementId(threadId)}`;
}

function threadElementId(threadId: string): string {
  return `html-collab-thread-${encodeURIComponent(threadId)}`;
}

function editLink(reviewHref: string | undefined, editId: string): string | undefined {
  if (!reviewHref) {
    return undefined;
  }
  return `${reviewHref}#${editElementId(editId)}`;
}

function editElementId(editId: string): string {
  return `html-collab-edit-${encodeURIComponent(editId)}`;
}

function locationLabel(anchor: ReviewBundleThread["anchor"]): string | undefined {
  const heading = anchor.headingPath?.at(-1);
  if (heading && !sameText(heading, anchor.quote) && !containsText(heading, anchor.quote)) {
    return truncate(heading, 96);
  }
  return undefined;
}

function renderAnchorContextMarkdown(anchor: ReviewBundleThread["anchor"]): string {
  const prefix = collapseWhitespace(anchor.prefix ?? "");
  const quote = collapseWhitespace(anchor.quote);
  const suffix = collapseWhitespace(anchor.suffix ?? "");
  const head = prefix ? `…${escapeMarkdownInline(prefix)} ` : "";
  const tail = suffix ? ` ${escapeMarkdownInline(suffix)}…` : "";
  return `${head}**${escapeMarkdownInline(quote)}**${tail}`;
}

function renderAnchorContextPlain(anchor: ReviewBundleThread["anchor"]): string {
  const prefix = collapseWhitespace(anchor.prefix ?? "");
  const quote = collapseWhitespace(anchor.quote);
  const suffix = collapseWhitespace(anchor.suffix ?? "");
  const head = prefix ? `…${prefix} ` : "";
  const tail = suffix ? ` ${suffix}…` : "";
  return `${head}«${quote}»${tail}`;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, max: number): string {
  const collapsed = collapseWhitespace(value);
  if (collapsed.length <= max) {
    return collapsed;
  }
  return `${collapsed.slice(0, max - 1)}…`;
}

function sameText(left: string, right: string): boolean {
  return collapseWhitespace(left).toLowerCase() === collapseWhitespace(right).toLowerCase();
}

function containsText(haystack: string, needle: string): boolean {
  return collapseWhitespace(haystack).toLowerCase().includes(collapseWhitespace(needle).toLowerCase());
}

function escapeMarkdownInline(value: string): string {
  return value.replace(/([\\`*_{}\[\]()#+\-!|>])/g, "\\$1");
}

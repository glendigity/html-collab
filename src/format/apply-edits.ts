import { reduceReviewState, type ReducedEdit } from "./reduce";
import type { ReviewState } from "./state";

export type ApplyAcceptedEditsResult = {
  html: string;
  appliedEdits: number;
  totalSuggestedEdits: number;
  acceptedEdits: number;
  openEdits: number;
  rejectedEdits: number;
  deletedEdits: number;
  skippedEdits: number;
};

export function applyAcceptedEdits(sourceHtml: string, state: ReviewState): ApplyAcceptedEditsResult {
  const reduced = reduceReviewState(state);
  const accepted = reduced.edits.filter((edit) => edit.status === "accepted");
  const planned = accepted.map((edit) => planEdit(sourceHtml, edit));
  planned.sort((left, right) => right.start - left.start);

  let html = sourceHtml;
  for (const edit of planned) {
    html = html.slice(0, edit.start) + edit.replacement + html.slice(edit.end);
  }

  return {
    html,
    appliedEdits: planned.length,
    totalSuggestedEdits: reduced.edits.length,
    acceptedEdits: accepted.length,
    openEdits: reduced.edits.filter((edit) => edit.status === "open").length,
    rejectedEdits: reduced.edits.filter((edit) => edit.status === "rejected").length,
    deletedEdits: reduced.edits.filter((edit) => edit.status === "deleted").length,
    skippedEdits: reduced.edits.length - accepted.length,
  };
}

type PlannedEdit = {
  start: number;
  end: number;
  replacement: string;
};

function planEdit(sourceHtml: string, edit: ReducedEdit): PlannedEdit {
  const quote = edit.anchor.quote;
  const start = findUniqueQuote(sourceHtml, quote, edit.editId);
  const end = start + quote.length;

  if (edit.kind === "replace") {
    return {
      start,
      end,
      replacement: edit.replacement ?? "",
    };
  }

  if (edit.kind === "insert") {
    return {
      start: end,
      end,
      replacement: edit.replacement ?? "",
    };
  }

  return {
    start,
    end,
    replacement: "",
  };
}

function findUniqueQuote(sourceHtml: string, quote: string, editId: string): number {
  if (!quote) {
    throw new Error(`Cannot apply edit ${editId}: empty selected quote`);
  }

  const first = sourceHtml.indexOf(quote);
  if (first === -1) {
    throw new Error(`Cannot apply edit ${editId}: selected quote not found in source HTML`);
  }

  const second = sourceHtml.indexOf(quote, first + quote.length);
  if (second !== -1) {
    throw new Error(`Cannot apply edit ${editId}: selected quote is ambiguous in source HTML`);
  }

  return first;
}

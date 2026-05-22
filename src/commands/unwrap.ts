import { readFile, writeFile } from "node:fs/promises";

import { applyAcceptedEdits } from "../format/apply-edits";
import { extractReviewState, unwrapReviewHtml } from "../format/html-envelope";

export type UnwrapOptions = {
  applyAcceptedEdits?: boolean;
};

export type UnwrapResult = {
  sourceBytes: number;
  appliedEdits?: number;
  totalSuggestedEdits?: number;
  acceptedEdits?: number;
  openEdits?: number;
  rejectedEdits?: number;
  deletedEdits?: number;
  skippedEdits?: number;
};

export async function unwrapFile(
  inputPath: string,
  outputPath: string,
  options: UnwrapOptions = {},
): Promise<UnwrapResult> {
  const reviewHtml = await readFile(inputPath, "utf8");
  const sourceBytes = unwrapReviewHtml(reviewHtml);
  if (!options.applyAcceptedEdits) {
    await writeFile(outputPath, sourceBytes);
    return { sourceBytes: sourceBytes.byteLength };
  }

  const state = extractReviewState(reviewHtml);
  const result = applyAcceptedEdits(sourceBytes.toString("utf8"), state);
  await writeFile(outputPath, result.html, "utf8");
  return {
    sourceBytes: Buffer.byteLength(result.html, "utf8"),
    appliedEdits: result.appliedEdits,
    totalSuggestedEdits: result.totalSuggestedEdits,
    acceptedEdits: result.acceptedEdits,
    openEdits: result.openEdits,
    rejectedEdits: result.rejectedEdits,
    deletedEdits: result.deletedEdits,
    skippedEdits: result.skippedEdits,
  };
}

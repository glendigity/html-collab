import { readFile, writeFile } from "node:fs/promises";

import {
  createReviewHtmlFromParts,
  extractReviewState,
  extractSourcePayload,
} from "../format/html-envelope";
import { mergeReviewStates } from "../format/merge";

export type MergeFilesResult = {
  addedOps: number;
  addedActors: number;
  totalOps: number;
  reviewBytes: number;
};

export async function mergeFiles(inputPaths: string[], outputPath: string): Promise<MergeFilesResult> {
  if (inputPaths.length < 2) {
    throw new Error("Expected at least two reviewed HTML files to merge");
  }

  const reviewHtmlFiles = await Promise.all(inputPaths.map((path) => readFile(path, "utf8")));
  const source = extractSourcePayload(reviewHtmlFiles[0], inputPaths[0]);
  const states = reviewHtmlFiles.map((html, index) => extractReviewState(html, inputPaths[index]));
  const result = mergeReviewStates(states);
  const mergedHtml = createReviewHtmlFromParts(source, result.state);
  await writeFile(outputPath, mergedHtml, "utf8");
  return {
    addedOps: result.addedOps,
    addedActors: result.addedActors,
    totalOps: result.state.ops.length,
    reviewBytes: Buffer.byteLength(mergedHtml, "utf8"),
  };
}

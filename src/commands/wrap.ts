import { readFile, writeFile } from "node:fs/promises";

import { createReviewHtml } from "../format/html-envelope";

export type WrapResult = {
  sourceBytes: number;
  reviewBytes: number;
};

export async function wrapFile(inputPath: string, outputPath: string): Promise<WrapResult> {
  const sourceBytes = await readFile(inputPath);
  const reviewHtml = createReviewHtml(sourceBytes, { sourcePath: inputPath });
  await writeFile(outputPath, reviewHtml, "utf8");
  return {
    sourceBytes: sourceBytes.byteLength,
    reviewBytes: Buffer.byteLength(reviewHtml, "utf8"),
  };
}

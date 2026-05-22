import { readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

import { extractReview, type ExtractFormat } from "../format/extract";
import { extractReviewState } from "../format/html-envelope";

export type ExtractOptions = {
  format: ExtractFormat;
  outputPath?: string;
};

export async function extractFile(inputPath: string, options: ExtractOptions): Promise<string> {
  const reviewHtml = await readFile(inputPath, "utf8");
  const state = extractReviewState(reviewHtml);
  const output = extractReview(state, options.format, {
    reviewHref: reviewHref(inputPath, options.outputPath),
  });

  if (options.outputPath) {
    await writeFile(options.outputPath, output, "utf8");
  }

  return output;
}

function reviewHref(inputPath: string, outputPath: string | undefined): string {
  if (!outputPath) {
    return encodeURI(inputPath.split(sep).join("/"));
  }

  const inputAbsolute = resolve(inputPath);
  const outputDirAbsolute = resolve(dirname(outputPath));
  const href = relative(outputDirAbsolute, inputAbsolute) || inputPath;
  return encodeURI(href.split(sep).join("/"));
}

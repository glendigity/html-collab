import { createHash, randomUUID } from "node:crypto";
import { basename } from "node:path";

import {
  createReviewHtmlFromParts,
  extractSourcePayload,
  extractSourceTitle,
  isAlreadyWrapped,
} from "./html-envelope-core";
export * from "./html-envelope-core";
import type { ReviewState, SourcePayload } from "./state";
import { createInitialState } from "./state";

export type CreateReviewHtmlOptions = {
  sourcePath?: string;
  docId?: string;
  state?: ReviewState;
};

export function createReviewHtml(
  sourceBytes: Buffer,
  options: CreateReviewHtmlOptions = {},
): string {
  const sourceHtml = sourceBytes.toString("utf8");
  if (isAlreadyWrapped(sourceHtml)) {
    throw new Error(alreadyWrappedMessage(options.sourcePath));
  }

  const title =
    extractSourceTitle(sourceHtml) ?? (options.sourcePath ? basename(options.sourcePath) : undefined);
  const sourcePayload: SourcePayload = {
    encoding: "base64",
    html: sourceBytes.toString("base64"),
  };
  const state =
    options.state ??
    createInitialState({
      docId: options.docId ?? randomUUID(),
      sourceFingerprint: fingerprintSource(sourceBytes),
      title,
    });

  return createReviewHtmlFromParts(sourcePayload, state);
}

export function unwrapReviewHtml(reviewHtml: string | Buffer, sourceLabel?: string): Buffer {
  const source = extractSourcePayload(reviewHtml.toString(), sourceLabel);
  if (source.encoding !== "base64") {
    throw new Error(`Unsupported source encoding: ${source.encoding}${sourceLabel ? ` in ${sourceLabel}` : ""}`);
  }
  return Buffer.from(source.html, "base64");
}

export function fingerprintSource(sourceBytes: Buffer): string {
  return `sha256:${createHash("sha256").update(sourceBytes).digest("hex")}`;
}

function alreadyWrappedMessage(sourcePath?: string): string {
  const label = sourcePath ? ` ${sourcePath}` : "";
  return `Input${label} already looks like an html-collab review file. Run \`html-collab unwrap\` first to get back the original source, or open the existing review file in a browser to keep marking it up.`;
}

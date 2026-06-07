import { describe, expect, test } from "bun:test";

import { snapshotBaseHref } from "../src/extension/snapshot";
import { createReviewHtmlFromParts, extractSourcePayload } from "../src/format/html-envelope-core";
import type { ReviewState, SourcePayload } from "../src/format/state";

describe("extension packaging helpers", () => {
  test("does not inject absolute local file paths into source snapshots", () => {
    expect(snapshotBaseHref("file:///Users/glen/private/report.html")).toBeNull();
    expect(snapshotBaseHref("file:///C:/Users/Glen/private/report.html")).toBeNull();
  });

  test("keeps web page bases so relative assets resolve in extension review mode", () => {
    expect(snapshotBaseHref("https://example.com/reports/report.html?view=1#summary")).toBe(
      "https://example.com/reports/report.html?view=1#summary",
    );
  });

  test("external-runtime review envelopes stay unwrap-compatible", () => {
    const payload: SourcePayload = {
      encoding: "base64",
      html: Buffer.from("<!doctype html><title>Report</title><p>Hello</p>").toString("base64"),
    };
    const state: ReviewState = {
      schemaVersion: 1,
      docId: "doc-1",
      sourceFingerprint: "sha256:test",
      title: "Report",
      actors: {},
      ops: [],
    };

    const reviewHtml = createReviewHtmlFromParts(payload, state, {
      runtimeScriptSrc: "chrome-extension://extension-id/dist/review-runtime.js",
    });

    expect(reviewHtml).toContain(
      '<script src="chrome-extension://extension-id/dist/review-runtime.js" data-html-collab-runtime="external"></script>',
    );
    expect(reviewHtml).not.toContain("frame.srcdoc = sourceHtml");
    expect(extractSourcePayload(reviewHtml)).toEqual(payload);
  });
});

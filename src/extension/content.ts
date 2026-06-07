import {
  createReviewHtmlFromParts,
  extractReviewState,
  extractSourcePayload,
  extractSourceTitle,
  isAlreadyWrapped,
} from "../format/html-envelope-core";
import type { ReviewState, SourcePayload } from "../format/state";
import { createInitialState } from "../format/state";
import { serializeReviewSnapshot as serializeDocumentReviewSnapshot } from "./snapshot";

const MESSAGE_NAMESPACE = "html-collab-extension";

type ExtensionMessage =
  | { namespace: typeof MESSAGE_NAMESPACE; type: "status" }
  | { namespace: typeof MESSAGE_NAMESPACE; type: "start-review" }
  | { namespace: typeof MESSAGE_NAMESPACE; type: "export-review" }
  | { namespace: typeof MESSAGE_NAMESPACE; type: "copy-brief" };

type ExtensionResponse =
  | {
      ok: true;
      mode: "plain" | "review";
      title: string;
      filename: string;
      opCount: number;
      reviewHtml?: string;
      message?: string;
    }
  | {
      ok: false;
      message: string;
    };

declare global {
  interface Window {
    __htmlCollabExtensionContentLoaded?: boolean;
  }
}

if (!window.__htmlCollabExtensionContentLoaded) {
  window.__htmlCollabExtensionContentLoaded = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isExtensionMessage(message)) {
      return false;
    }

    void handleMessage(message)
      .then((response) => sendResponse(response))
      .catch((error) => {
        sendResponse({
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        } satisfies ExtensionResponse);
      });
    return true;
  });
}

async function handleMessage(message: ExtensionMessage): Promise<ExtensionResponse> {
  if (message.type === "status") {
    return currentStatus();
  }

  if (message.type === "start-review") {
    return startReview();
  }

  if (message.type === "export-review") {
    return exportReview();
  }

  return copyBrief();
}

function currentStatus(message?: string): ExtensionResponse {
  const existing = existingReviewState();
  if (existing) {
    return {
      ok: true,
      mode: "review",
      title: existing.state.title || fallbackTitle(),
      filename: reviewFilename(existing.state.title || fallbackTitle()),
      opCount: existing.state.ops.length,
      message,
    };
  }

  return {
    ok: true,
    mode: "plain",
    title: fallbackTitle(),
    filename: reviewFilename(fallbackTitle()),
    opCount: 0,
    message,
  };
}

async function startReview(): Promise<ExtensionResponse> {
  if (existingReviewState()) {
    return currentStatus("This page is already in review mode.");
  }

  const sourceHtml = serializeReviewSnapshot();
  if (isAlreadyWrapped(sourceHtml)) {
    return currentStatus("This page is already an html-collab review file.");
  }

  const sourceBytes = new TextEncoder().encode(sourceHtml);
  const title = extractSourceTitle(sourceHtml) || fallbackTitle();
  const sourcePayload: SourcePayload = {
    encoding: "base64",
    html: encodeBase64(sourceBytes),
  };
  const state = createInitialState({
    docId: createDocId(),
    sourceFingerprint: await fingerprintSource(sourceBytes),
    title,
  });
  const reviewHtml = createReviewHtmlFromParts(sourcePayload, state, {
    runtimeScriptSrc: chrome.runtime.getURL("dist/review-runtime.js"),
  });

  return {
    ok: true,
    mode: "review",
    title,
    filename: reviewFilename(title),
    opCount: 0,
    reviewHtml,
    message: "Opening review mode. Highlight text in the report to comment or suggest edits.",
  };
}

function exportReview(): ExtensionResponse {
  const existing = existingReviewState();
  if (!existing) {
    return {
      ok: false,
      message: "Start review mode before exporting a review file.",
    };
  }

  const exportButton = document.getElementById("html-collab-export");
  if (exportButton instanceof HTMLButtonElement) {
    exportButton.click();
  } else {
    downloadReviewFile(reviewFilename(existing.state.title || fallbackTitle()));
  }

  return currentStatus("Review file exported. Check Chrome downloads.");
}

function copyBrief(): ExtensionResponse {
  if (!existingReviewState()) {
    return {
      ok: false,
      message: "Start review mode before copying a brief.",
    };
  }

  document.getElementById("html-collab-brief")?.click();
  document.getElementById("html-collab-brief-copy")?.click();
  return currentStatus("Brief copied, or opened for manual copy if the browser blocked clipboard access.");
}

function existingReviewState(): { state: ReviewState } | null {
  const reviewHtml = serializeCurrentPage();
  if (!isAlreadyWrapped(reviewHtml)) {
    return null;
  }

  try {
    extractSourcePayload(reviewHtml);
    return { state: extractReviewState(reviewHtml) };
  } catch {
    return null;
  }
}

function serializeCurrentPage(): string {
  return serializeDoctype(document.doctype) + document.documentElement.outerHTML;
}

function serializeReviewSnapshot(): string {
  return serializeDocumentReviewSnapshot(document, location.href);
}

function serializeDoctype(doctype: DocumentType | null): string {
  if (!doctype) {
    return "";
  }

  const publicId = doctype.publicId ? ` PUBLIC "${doctype.publicId}"` : "";
  const systemId = doctype.systemId ? `${publicId ? "" : " SYSTEM"} "${doctype.systemId}"` : "";
  return `<!doctype ${doctype.name}${publicId}${systemId}>\n`;
}

function downloadReviewFile(filename: string): void {
  const blob = new Blob([serializeCurrentPage()], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function fingerprintSource(sourceBytes: Uint8Array<ArrayBuffer>): Promise<string> {
  if (crypto.subtle?.digest) {
    try {
      const digest = await crypto.subtle.digest("SHA-256", sourceBytes);
      return `sha256:${hex(new Uint8Array(digest))}`;
    } catch {
      // Fall through to the deterministic local implementation below.
    }
  }
  return `sha256:${sha256Hex(sourceBytes)}`;
}

function createDocId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = hex(bytes);
  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20),
  ].join("-");
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function sha256Hex(bytes: Uint8Array): string {
  const roundConstants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
    0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
    0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
    0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
    0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
    0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
    0xc67178f2,
  ];
  const words = new Uint32Array(64);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotateRight(words[index - 15], 7) ^ rotateRight(words[index - 15], 18) ^ (words[index - 15] >>> 3);
      const s1 = rotateRight(words[index - 2], 17) ^ rotateRight(words[index - 2], 19) ^ (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choice + roundConstants[index] + words[index]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => word.toString(16).padStart(8, "0"))
    .join("");
}

function rotateRight(value: number, shift: number): number {
  return (value >>> shift) | (value << (32 - shift));
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function fallbackTitle(): string {
  const title = document.title.trim();
  if (title) {
    return title;
  }

  const pathName = decodeURIComponent(location.pathname || "");
  const filename = pathName.split("/").filter(Boolean).at(-1);
  return filename || "report.html";
}

function reviewFilename(title: string): string {
  const clean = sanitizeFilename(title || "report.html");
  if (clean.endsWith(".review.html")) {
    return clean;
  }
  if (clean.endsWith(".html")) {
    return clean.slice(0, -5) + ".review.html";
  }
  return clean + ".review.html";
}

function sanitizeFilename(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160) || "report.html";
}

function isExtensionMessage(message: unknown): message is ExtensionMessage {
  if (!message || typeof message !== "object") {
    return false;
  }
  const candidate = message as Record<string, unknown>;
  return (
    candidate.namespace === MESSAGE_NAMESPACE &&
    (candidate.type === "status" ||
      candidate.type === "start-review" ||
      candidate.type === "export-review" ||
      candidate.type === "copy-brief")
  );
}

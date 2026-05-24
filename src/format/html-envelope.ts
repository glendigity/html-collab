import { createHash, randomUUID } from "node:crypto";
import { basename } from "node:path";

import { iframeLoaderRuntime } from "../runtime/index";
import type { ReviewState, SourcePayload } from "./state";
import { createInitialState } from "./state";

const SOURCE_SCRIPT_ID = "html-collab-source";
const STATE_SCRIPT_ID = "html-collab-state";
const PROJECT_URL = "https://github.com/glendigity/html-collab";
const BRAND_LOGO_SVG = `<svg class="html-collab-brand-logo" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" fill="none" stroke="#1F2042" stroke-width="15" stroke-linejoin="round" stroke-linecap="round">
  <polyline points="70,26 25,96 70,166"/>
  <polyline points="250,26 295,96 250,166"/>
  <path transform="translate(95 40)" d="M10 0 L82 0 L100 18 L100 70 A10 10 0 0 1 90 80 L30 80 L18 92 L14 80 L10 80 A10 10 0 0 1 0 70 L0 10 A10 10 0 0 1 10 0 Z" fill="#F5A524"/>
  <path transform="translate(125 60)" d="M10 0 L82 0 L100 18 L100 70 A10 10 0 0 1 90 80 L30 80 L18 92 L14 80 L10 80 A10 10 0 0 1 0 70 L0 10 A10 10 0 0 1 10 0 Z" fill="#F5A524"/>
</svg>`;
const BRAND_WORDMARK_SVG = `<svg class="html-collab-brand-wordmark" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 120">
  <text x="10" y="92" font-family="'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-weight="700" font-size="100" fill="#1F2042">&lt;html-collab&gt;</text>
</svg>`;

export type CreateReviewHtmlOptions = {
  sourcePath?: string;
  docId?: string;
  state?: ReviewState;
};

const LOCAL_PAGE_REFERENCE_ATTRIBUTE_PATTERN =
  /\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;

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

  return renderReviewShell(sourcePayload, state);
}

export function createReviewHtmlFromParts(source: SourcePayload, state: ReviewState): string {
  return renderReviewShell(source, state);
}

export function isAlreadyWrapped(html: string): boolean {
  return hasScriptWithId(html, SOURCE_SCRIPT_ID) && hasScriptWithId(html, STATE_SCRIPT_ID);
}

function alreadyWrappedMessage(sourcePath?: string): string {
  const label = sourcePath ? ` ${sourcePath}` : "";
  return `Input${label} already looks like an html-collab review file. Run \`html-collab unwrap\` first to get back the original source, or open the existing review file in a browser to keep marking it up.`;
}

export function unwrapReviewHtml(reviewHtml: string | Buffer, sourceLabel?: string): Buffer {
  const source = extractSourcePayload(reviewHtml.toString(), sourceLabel);
  if (source.encoding !== "base64") {
    throw new Error(`Unsupported source encoding: ${source.encoding}${sourceLabel ? ` in ${sourceLabel}` : ""}`);
  }
  return Buffer.from(source.html, "base64");
}

export function extractSourcePayload(reviewHtml: string, sourceLabel?: string): SourcePayload {
  const payload = parseJsonScript(reviewHtml, SOURCE_SCRIPT_ID, sourceLabel);
  if (!isSourcePayload(payload)) {
    throw new Error(`Invalid html-collab source payload in ${sourceLabel ?? "this review file"}`);
  }
  return payload;
}

export function extractReviewState(reviewHtml: string, sourceLabel?: string): ReviewState {
  const state = parseJsonScript(reviewHtml, STATE_SCRIPT_ID, sourceLabel);
  if (!isReviewState(state)) {
    throw new Error(`Invalid html-collab review state in ${sourceLabel ?? "this review file"}`);
  }
  return state;
}

export function fingerprintSource(sourceBytes: Buffer): string {
  return `sha256:${createHash("sha256").update(sourceBytes).digest("hex")}`;
}

export function findLocalHtmlPageReferences(sourceHtml: string): string[] {
  const references = new Set<string>();
  let match: RegExpExecArray | null;

  LOCAL_PAGE_REFERENCE_ATTRIBUTE_PATTERN.lastIndex = 0;
  while ((match = LOCAL_PAGE_REFERENCE_ATTRIBUTE_PATTERN.exec(sourceHtml)) !== null) {
    const rawReference = match[1] ?? match[2] ?? match[3] ?? "";
    const reference = decodeHtmlText(rawReference.trim());
    if (isLocalHtmlPageReference(reference)) {
      references.add(reference);
    }
  }

  return [...references];
}

function renderReviewShell(source: SourcePayload, state: ReviewState): string {
  const sourceHtml = Buffer.from(source.html, "base64").toString("utf8");
  const localPageReferences = findLocalHtmlPageReferences(sourceHtml);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="generator" content="html-collab">
  <link rel="icon" href="data:,">
  <link rel="author" href="${PROJECT_URL}">
  <title>${escapeHtml(state.title ?? "Reviewable HTML")}</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      height: 100%;
      margin: 0;
    }

    body {
      background: #f6f7f9;
      color: #1f2937;
    }

    button,
    input,
    select,
    textarea {
      font: inherit;
    }

    button {
      min-height: 32px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #ffffff;
      color: #1f2937;
      cursor: pointer;
    }

    button:hover:not(:disabled) {
      background: #f1f5f9;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }

    textarea,
    select,
    input {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #ffffff;
      color: #1f2937;
    }

    #html-collab-shell {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      min-height: 100vh;
    }

    .html-collab-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      min-height: 48px;
      padding: 8px 14px;
      border-bottom: 1px solid #d7dce3;
      background: #ffffff;
      color: #2f3a4a;
      font-size: 13px;
    }

    .html-collab-brand {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      border-radius: 6px;
      color: inherit;
      text-decoration: none;
    }

    .html-collab-brand:hover {
      background: #f8fafc;
    }

    .html-collab-brand:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 3px;
    }

    .html-collab-brand-logo {
      display: block;
      flex: 0 0 auto;
      width: 34px;
      height: 22px;
    }

    .html-collab-brand-wordmark {
      display: block;
      flex: 0 1 auto;
      width: 124px;
      max-width: 32vw;
      height: auto;
    }

    .html-collab-toolbar-group {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .html-collab-toolbar input {
      width: 170px;
      min-height: 32px;
      padding: 4px 8px;
    }

    .html-collab-toolbar button {
      padding: 4px 10px;
    }

    .html-collab-toolbar select {
      min-height: 32px;
      padding: 4px 8px;
    }

    .html-collab-status {
      color: #64748b;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .html-collab-workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      min-height: 0;
    }

    #html-collab-canvas {
      min-height: 0;
      padding: 0;
    }

    #html-collab-source-frame {
      display: block;
      width: 100%;
      height: calc(100vh - 49px);
      border: 0;
      background: #ffffff;
    }

    .html-collab-panel {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      min-height: 0;
      border-left: 1px solid #d7dce3;
      background: #ffffff;
    }

    .html-collab-composer {
      padding: 12px;
      border-bottom: 1px solid #e2e8f0;
      background: #fbfcfd;
    }

    .html-collab-composer[hidden] {
      display: none;
    }

    .html-collab-selected-quote {
      max-height: 76px;
      margin: 0 0 8px;
      overflow: auto;
      border-left: 3px solid #eab308;
      padding-left: 8px;
      color: #475569;
      font-size: 12px;
      line-height: 1.4;
    }

    .html-collab-composer textarea,
    .html-collab-reply-body {
      width: 100%;
      resize: vertical;
      padding: 8px;
      line-height: 1.4;
    }

    .html-collab-reply-body {
      resize: none;
      overflow: hidden;
    }

    .html-collab-composer-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
    }

    .html-collab-thread-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      margin-top: 10px;
    }

    .html-collab-thread-reply .html-collab-thread-actions {
      margin-top: 0;
    }

    .html-collab-thread-actions .html-collab-action-secondary {
      margin-right: auto;
    }

    .html-collab-action-secondary {
      min-height: 28px;
      border: 0;
      background: transparent;
      color: #94a3b8;
      padding: 2px 6px;
      font-size: 12px;
      border-radius: 4px;
    }

    .html-collab-action-secondary:hover:not(:disabled) {
      background: #f1f5f9;
      color: #475569;
    }

    .html-collab-thread-reply {
      display: grid;
      gap: 6px;
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px dashed #e2e8f0;
    }

    .html-collab-edit-fields {
      display: grid;
      gap: 8px;
    }

    .html-collab-edit-fields select {
      min-height: 32px;
      padding: 4px 8px;
    }

    .html-collab-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 16, 20, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 200;
    }

    .html-collab-modal-backdrop[hidden] {
      display: none;
    }

    .html-collab-modal {
      width: min(720px, 92vw);
      max-height: min(80vh, 600px);
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid #e2e8f0;
    }

    .html-collab-modal-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 20px;
      border-bottom: 1px solid #e2e8f0;
      background: #f8fafc;
    }

    .html-collab-modal-title {
      font-weight: 600;
      color: #1f2937;
      font-size: 14px;
    }

    .html-collab-modal-subtitle {
      font-size: 12px;
      color: #64748b;
    }

    .html-collab-modal-actions {
      margin-left: auto;
      display: flex;
      gap: 6px;
    }

    .html-collab-button-primary {
      background: #1f2937;
      color: #ffffff;
      border: 1px solid #1f2937;
      font-weight: 500;
    }

    .html-collab-button-primary:hover:not(:disabled) {
      background: #111827;
    }

    .html-collab-button-primary.is-success {
      background: #16a34a;
      border-color: #16a34a;
    }

    .html-collab-modal-body {
      margin: 0;
      padding: 20px 24px;
      overflow: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
      color: #1f2937;
      flex: 1;
      background: #ffffff;
    }

    .html-collab-thread-scroll {
      min-height: 0;
      overflow: auto;
      padding: 12px;
    }

    .html-collab-document-warning {
      margin: 12px 12px 0;
      border: 1px solid #facc15;
      border-left: 4px solid #eab308;
      border-radius: 8px;
      background: #fffbeb;
      padding: 10px 12px;
      color: #713f12;
      font-size: 12px;
      line-height: 1.4;
    }

    .html-collab-document-warning strong {
      display: block;
      margin-bottom: 4px;
      color: #422006;
      font-size: 13px;
    }

    .html-collab-document-warning p {
      margin: 0;
    }

    .html-collab-document-warning ul {
      margin: 8px 0 0;
      padding-left: 18px;
    }

    .html-collab-document-warning code {
      word-break: break-word;
    }

    .html-collab-panel-heading {
      margin: 18px 4px 8px;
      color: #334155;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .html-collab-panel-heading:first-child {
      margin-top: 4px;
    }

    .html-collab-empty {
      margin: 16px 4px;
      color: #64748b;
      font-size: 13px;
      line-height: 1.45;
    }

    .html-collab-thread {
      border: 1px solid #e5e9f0;
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 10px;
      background: #ffffff;
      cursor: pointer;
      transition: border-color 120ms ease, box-shadow 120ms ease;
    }

    .html-collab-thread:hover {
      border-color: #cbd5e1;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }

    .html-collab-thread textarea,
    .html-collab-thread input {
      cursor: text;
    }

    .html-collab-thread-active {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }

    .html-collab-thread-header {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 10px;
    }

    .html-collab-thread-header .html-collab-thread-quote {
      flex: 1 1 auto;
      min-width: 0;
      margin: 4px 0 0;
    }

    .html-collab-thread-pin {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
      flex: 0 0 auto;
    }

    .html-collab-thread-number {
      width: 32px;
      min-height: 32px;
      padding: 0;
      border-color: #eab308;
      background: #fffbeb;
      font-weight: 700;
    }

    .html-collab-thread-status {
      border-radius: 999px;
      background: #eef2f7;
      padding: 2px 10px;
      color: #475569;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.02em;
      text-transform: capitalize;
    }

    .html-collab-edit-suggestion .html-collab-thread-number {
      border-color: #22c55e;
      background: #f0fdf4;
    }

    .html-collab-edit-suggestion .html-collab-thread-quote {
      border-left-color: #22c55e;
    }

    .html-collab-edit-detail {
      margin: 6px 0 0;
      color: #1f2937;
      font-size: 13px;
      line-height: 1.45;
      white-space: pre-wrap;
    }

    .html-collab-edit-note {
      margin: 4px 0 0;
      color: #64748b;
      font-size: 12px;
      font-style: italic;
      line-height: 1.45;
      white-space: pre-wrap;
    }

    .html-collab-edit-replacement {
      background: #ecfdf5;
      color: #166534;
      border-radius: 4px;
      padding: 1px 6px;
      font-size: 12px;
    }

    .html-collab-context-menu {
      position: fixed;
      z-index: 20;
      display: grid;
      gap: 4px;
      min-width: 128px;
      padding: 6px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
    }

    .html-collab-context-menu[hidden] {
      display: none;
    }

    .html-collab-context-menu button {
      width: 100%;
      border: 0;
      padding: 6px 8px;
      text-align: left;
    }

    .html-collab-hotkeys {
      position: fixed;
      top: 54px;
      right: 14px;
      z-index: 21;
      min-width: 220px;
      padding: 10px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
      color: #334155;
      font-size: 12px;
      line-height: 1.5;
    }

    .html-collab-hotkeys[hidden] {
      display: none;
    }

    .html-collab-hotkeys kbd {
      display: inline-block;
      min-width: 22px;
      margin-right: 6px;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      background: #f8fafc;
      padding: 1px 5px;
      color: #0f172a;
      font: inherit;
      text-align: center;
    }

    .html-collab-thread-quote {
      margin: 0 0 8px;
      border-left: 3px solid #eab308;
      padding-left: 8px;
      color: #475569;
      font-size: 12px;
      line-height: 1.4;
    }

    .html-collab-message {
      margin: 10px 0 0;
    }

    .html-collab-message-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #64748b;
      font-size: 12px;
    }

    .html-collab-message-meta > :first-child {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .html-collab-message p {
      margin: 3px 0 0;
      color: #1f2937;
      font-size: 13px;
      line-height: 1.45;
      white-space: pre-wrap;
    }

    .html-collab-message-deleted {
      color: #94a3b8 !important;
      font-style: italic;
    }

    @media (max-width: 860px) {
      .html-collab-workspace {
        grid-template-columns: 1fr;
      }

      .html-collab-panel {
        border-left: 0;
        border-top: 1px solid #d7dce3;
      }

      #html-collab-source-frame {
        height: 68vh;
      }

      .html-collab-brand-wordmark {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div id="html-collab-shell">
    <header class="html-collab-toolbar" aria-label="HTML Collab review shell">
      <div class="html-collab-toolbar-group">
        <a class="html-collab-brand" href="${PROJECT_URL}" target="_blank" rel="noopener noreferrer" aria-label="Made with html-collab. Open the GitHub repository" title="Made with html-collab">${BRAND_LOGO_SVG}${BRAND_WORDMARK_SVG}</a>
        <input id="html-collab-reviewer" type="text" autocomplete="name" aria-label="Reviewer name" placeholder="Your name">
      </div>
      <div class="html-collab-toolbar-group">
        <button id="html-collab-add-comment" type="button" disabled>Comment</button>
        <button id="html-collab-suggest-edit" type="button" disabled>Edit</button>
        <select id="html-collab-edit-view" aria-label="Edit preview mode">
          <option value="markup">Markup</option>
          <option value="preview">Preview</option>
        </select>
        <button id="html-collab-merge" type="button">Merge</button>
        <button id="html-collab-brief" type="button">Brief</button>
        <button id="html-collab-autosave" type="button" aria-pressed="false">Autosave</button>
        <button id="html-collab-hotkeys-button" type="button" aria-expanded="false" title="Keyboard shortcuts">?</button>
        <input id="html-collab-merge-files" type="file" accept=".html,text/html" multiple hidden>
        <div class="html-collab-status" id="html-collab-status">Review envelope ready</div>
      </div>
    </header>
    <div class="html-collab-workspace">
      <main id="html-collab-canvas">
        <iframe
          id="html-collab-source-frame"
          title="Reviewed HTML source"
        ></iframe>
      </main>
      <div class="html-collab-context-menu" id="html-collab-context-menu" hidden>
        <button id="html-collab-context-comment" type="button">Comment (C)</button>
        <button id="html-collab-context-edit" type="button">Edit (E)</button>
      </div>
      <div class="html-collab-hotkeys" id="html-collab-hotkeys" hidden>
        <div><kbd>C</kbd>Comment on selected text</div>
        <div><kbd>E</kbd>Suggest edit on selected text</div>
        <div><kbd>Enter</kbd>Add or suggest</div>
        <div><kbd>Esc</kbd>Cancel or close</div>
        <div><kbd>Shift Enter</kbd>Line break</div>
      </div>
      <div class="html-collab-modal-backdrop" id="html-collab-brief-modal" hidden>
        <div class="html-collab-modal" role="dialog" aria-modal="true" aria-labelledby="html-collab-brief-modal-title">
          <header class="html-collab-modal-header">
            <span class="html-collab-modal-title" id="html-collab-brief-modal-title">Review brief</span>
            <span class="html-collab-modal-subtitle">Markdown · paste into your AI</span>
            <div class="html-collab-modal-actions">
              <button id="html-collab-brief-copy" type="button" class="html-collab-button-primary">Copy</button>
              <button id="html-collab-brief-download" type="button">Download .md</button>
              <button id="html-collab-brief-close" type="button" aria-label="Close">&#x2715;</button>
            </div>
          </header>
          <pre class="html-collab-modal-body" id="html-collab-brief-body"></pre>
        </div>
      </div>
      <aside class="html-collab-panel" aria-label="Review comments">
        ${renderLocalPageWarning(localPageReferences)}
        <section class="html-collab-composer" id="html-collab-composer" hidden>
          <blockquote class="html-collab-selected-quote" id="html-collab-selected-quote"></blockquote>
          <textarea id="html-collab-comment-body" rows="4" placeholder="Comment"></textarea>
          <div class="html-collab-composer-actions">
            <button id="html-collab-submit-comment" type="button">Add (Enter)</button>
            <button id="html-collab-cancel-comment" type="button">Cancel (Esc)</button>
          </div>
        </section>
        <section class="html-collab-composer" id="html-collab-edit-composer" hidden>
          <blockquote class="html-collab-selected-quote" id="html-collab-edit-selected-quote"></blockquote>
          <div class="html-collab-edit-fields">
            <select id="html-collab-edit-kind" aria-label="Suggested edit type">
              <option value="replace">Replace selection</option>
              <option value="insert">Insert after selection</option>
              <option value="delete">Delete selection</option>
            </select>
            <textarea id="html-collab-edit-replacement" rows="3" placeholder="Replacement or inserted text"></textarea>
            <textarea id="html-collab-edit-note" rows="2" placeholder="Optional note"></textarea>
          </div>
          <div class="html-collab-composer-actions">
            <button id="html-collab-submit-edit" type="button">Suggest (Enter)</button>
            <button id="html-collab-cancel-edit" type="button">Cancel (Esc)</button>
          </div>
        </section>
        <section class="html-collab-thread-scroll">
          <p class="html-collab-empty" id="html-collab-empty">No comments yet.</p>
          <div id="html-collab-thread-list"></div>
        </section>
      </aside>
    </div>
  </div>

  <script type="application/json" id="${SOURCE_SCRIPT_ID}">${jsonForScript(source)}</script>
  <script type="application/json" id="${STATE_SCRIPT_ID}">${jsonForScript(state)}</script>
  <script>
${iframeLoaderRuntime}
  </script>
</body>
</html>
`;
}

function renderLocalPageWarning(references: string[]): string {
  if (references.length === 0) {
    return "";
  }

  const shownReferences = references
    .slice(0, 5)
    .map((reference) => `<li><code>${escapeHtml(reference)}</code></li>`)
    .join("");
  const remaining = references.length > 5 ? `<li>and ${references.length - 5} more</li>` : "";

  return `<section class="html-collab-document-warning" role="note" aria-label="Local page links warning">
          <strong>Only this top page is wrapped and commentable.</strong>
          <p>This file links to other local HTML pages. Those pages are not included in this review file, so following those links may open unreviewed files or fail.</p>
          <ul>${shownReferences}${remaining}</ul>
        </section>`;
}

function parseJsonScript(html: string, id: string, sourceLabel?: string): unknown {
  const openTagPattern = /<script\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = openTagPattern.exec(html)) !== null) {
    const openTag = match[0];
    if (!scriptTagHasId(openTag, id)) {
      continue;
    }

    const contentStart = match.index + openTag.length;
    const closeIndex = html.indexOf("</script>", contentStart);
    if (closeIndex === -1) {
      throw new Error(`Missing closing script tag for ${id}${sourceLabel ? ` in ${sourceLabel}` : ""}`);
    }

    try {
      return JSON.parse(html.slice(contentStart, closeIndex));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to parse ${id} JSON${sourceLabel ? ` in ${sourceLabel}` : ""}: ${message}`,
      );
    }
  }

  throw new Error(missingScriptMessage(id, sourceLabel));
}

function extractSourceTitle(sourceHtml: string): string | undefined {
  const match = sourceHtml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = match?.[1]?.replace(/\s+/g, " ").trim();
  return title ? decodeHtmlText(title) : undefined;
}

function decodeHtmlText(value: string): string {
  return value
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function missingScriptMessage(id: string, sourceLabel?: string): string {
  const suffix = sourceLabel ? ` (${sourceLabel})` : "";
  if (id === STATE_SCRIPT_ID) {
    return `This does not look like an html-collab review file: missing review state${suffix}. Run html-collab wrap first.`;
  }
  if (id === SOURCE_SCRIPT_ID) {
    return `This does not look like an html-collab review file: missing embedded source${suffix}. Run html-collab wrap first.`;
  }
  return `Missing ${id} script${suffix}`;
}

function isLocalHtmlPageReference(reference: string): boolean {
  if (!reference || reference.startsWith("#") || reference.startsWith("//")) {
    return false;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(reference)) {
    return false;
  }

  const path = reference.split(/[?#]/, 1)[0];
  return /\.html?$/i.test(path);
}

function scriptTagHasId(openTag: string, id: string): boolean {
  return hasScriptWithId(openTag, id);
}

function hasScriptWithId(html: string, id: string): boolean {
  const escapedId = escapeRegExp(id);
  return new RegExp(`<script\\b[^>]*\\bid\\s*=\\s*(["'])${escapedId}\\1`, "i").test(html);
}

function isSourcePayload(value: unknown): value is SourcePayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as Record<string, unknown>;
  return payload.encoding === "base64" && typeof payload.html === "string";
}

function isReviewState(value: unknown): value is ReviewState {
  if (!value || typeof value !== "object") {
    return false;
  }
  const state = value as Record<string, unknown>;
  return (
    state.schemaVersion === 1 &&
    typeof state.docId === "string" &&
    typeof state.sourceFingerprint === "string" &&
    Boolean(state.actors) &&
    typeof state.actors === "object" &&
    Array.isArray(state.ops)
  );
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/[<>&]/g, (character) => {
    switch (character) {
      case "<":
        return "\\u003c";
      case ">":
        return "\\u003e";
      case "&":
        return "\\u0026";
      default:
        return character;
    }
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

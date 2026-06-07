import { iframeLoaderRuntime } from "../runtime/index";
import type { ReviewState, SourcePayload } from "./state";

export const SOURCE_SCRIPT_ID = "html-collab-source";
export const STATE_SCRIPT_ID = "html-collab-state";
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

const LOCAL_PAGE_REFERENCE_ATTRIBUTE_PATTERN =
  /\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;

export type ReviewShellOptions = {
  runtimeScriptSrc?: string;
};

export function createReviewHtmlFromParts(
  source: SourcePayload,
  state: ReviewState,
  options: ReviewShellOptions = {},
): string {
  return renderReviewShell(source, state, options);
}

export function isAlreadyWrapped(html: string): boolean {
  return hasScriptWithId(html, SOURCE_SCRIPT_ID) && hasScriptWithId(html, STATE_SCRIPT_ID);
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

function renderReviewShell(source: SourcePayload, state: ReviewState, options: ReviewShellOptions): string {
  const sourceHtml = decodeBase64Utf8(source.html);
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
      --hc-ink: #1F2042;
      --hc-ink-soft: #34355A;
      --hc-paper: #FAF9F4;
      --hc-surface: #FFFFFF;
      --hc-surface-sunk: #F4F2EB;
      --hc-rule: #E5E1D5;
      --hc-rule-soft: #EFEBDD;
      --hc-mute: #6B6F7E;
      --hc-mute-soft: #9CA0AE;
      --hc-amber: #F5A524;
      --hc-amber-soft: #FCEED0;
      --hc-amber-tint: #FFF7E1;
      --hc-amber-ink: #6E4A0A;
      --hc-edit: #1E8554;
      --hc-edit-soft: #E6F4EC;
      --hc-edit-ink: #0F4A2E;
      --hc-shadow-sm: 0 1px 2px rgba(31, 32, 66, 0.06);
      --hc-shadow-md: 0 10px 30px -12px rgba(31, 32, 66, 0.22);
      --hc-shadow-lg: 0 30px 80px -20px rgba(31, 32, 66, 0.40);
      --hc-radius-sm: 6px;
      --hc-radius-md: 10px;
      --hc-radius-lg: 16px;
      --hc-font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      --hc-font-mono: "Geist Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      --hc-ease: cubic-bezier(0.22, 0.61, 0.36, 1);
      font-family: var(--hc-font-sans);
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
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
      background: var(--hc-paper);
      color: var(--hc-ink);
      font-size: 14px;
      line-height: 1.45;
    }

    button,
    input,
    select,
    textarea {
      font: inherit;
      color: inherit;
    }

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 30px;
      padding: 5px 11px;
      border: 1px solid transparent;
      border-radius: var(--hc-radius-sm);
      background: transparent;
      color: var(--hc-ink);
      font-family: var(--hc-font-mono);
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.01em;
      cursor: pointer;
      transition:
        background-color 140ms var(--hc-ease),
        border-color 140ms var(--hc-ease),
        color 140ms var(--hc-ease),
        box-shadow 140ms var(--hc-ease),
        transform 140ms var(--hc-ease);
    }

    button:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px var(--hc-paper), 0 0 0 4px var(--hc-amber);
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.4;
    }

    /* Quiet default — sits on the surface as a hairline-bordered chip. */
    .html-collab-btn {
      border-color: var(--hc-rule);
      background: var(--hc-surface);
    }

    .html-collab-btn:hover:not(:disabled) {
      border-color: var(--hc-ink);
      background: var(--hc-surface);
    }

    .html-collab-btn:active:not(:disabled) {
      transform: translateY(1px);
    }

    /* Primary — deep ink fill. Used for the "do it" actions. */
    .html-collab-btn-primary {
      border-color: var(--hc-ink);
      background: var(--hc-ink);
      color: var(--hc-surface);
    }

    .html-collab-btn-primary:hover:not(:disabled) {
      border-color: var(--hc-ink-soft);
      background: var(--hc-ink-soft);
      color: var(--hc-surface);
    }

    .html-collab-btn-primary.is-success {
      border-color: var(--hc-edit);
      background: var(--hc-edit);
    }

    /* Amber — reserved for the single most important call-to-action. */
    .html-collab-btn-amber {
      border-color: var(--hc-amber);
      background: var(--hc-amber);
      color: var(--hc-ink);
      font-weight: 600;
    }

    .html-collab-btn-amber:hover:not(:disabled) {
      filter: brightness(0.96);
      border-color: var(--hc-amber);
    }

    /* Ghost — borderless, the lightest weight. */
    .html-collab-btn-ghost {
      border-color: transparent;
      background: transparent;
      color: var(--hc-mute);
    }

    .html-collab-btn-ghost:hover:not(:disabled) {
      background: var(--hc-surface-sunk);
      color: var(--hc-ink);
    }

    /* Icon-only square button. */
    .html-collab-btn-icon {
      width: 30px;
      min-width: 30px;
      padding: 0;
      font-size: 14px;
      font-weight: 600;
    }

    textarea,
    select,
    input {
      border: 1px solid var(--hc-rule);
      border-radius: var(--hc-radius-sm);
      background: var(--hc-surface);
      color: var(--hc-ink);
      transition: border-color 140ms var(--hc-ease), box-shadow 140ms var(--hc-ease);
    }

    textarea:focus,
    select:focus,
    input:focus {
      outline: none;
      border-color: var(--hc-ink);
      box-shadow: 0 0 0 3px rgba(245, 165, 36, 0.20);
    }

    textarea::placeholder,
    input::placeholder {
      color: var(--hc-mute-soft);
    }

    select {
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='none' stroke='%231F2042' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' d='M1 1l4 4 4-4'/></svg>");
      background-repeat: no-repeat;
      background-position: right 10px center;
      padding-right: 26px;
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
      gap: 20px;
      min-height: 52px;
      padding: 9px 18px;
      border-bottom: 1px solid var(--hc-rule);
      background: var(--hc-surface);
    }

    .html-collab-brand {
      display: flex;
      align-items: center;
      gap: 9px;
      min-width: 0;
      padding: 2px 6px;
      margin-left: -6px;
      border-radius: var(--hc-radius-sm);
      color: var(--hc-ink);
      text-decoration: none;
      transition: background-color 140ms var(--hc-ease);
    }

    .html-collab-brand:hover {
      background: var(--hc-surface-sunk);
    }

    .html-collab-brand:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px var(--hc-paper), 0 0 0 4px var(--hc-amber);
    }

    .html-collab-brand-logo {
      display: block;
      flex: 0 0 auto;
      width: 30px;
      height: 19px;
    }

    .html-collab-brand-wordmark {
      display: block;
      flex: 0 1 auto;
      width: 116px;
      max-width: 28vw;
      height: auto;
    }

    .html-collab-toolbar-group {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .html-collab-toolbar-divider {
      width: 1px;
      height: 20px;
      background: var(--hc-rule);
      margin: 0 2px;
    }

    .html-collab-toolbar input {
      width: 170px;
      min-height: 30px;
      padding: 4px 10px;
      font-family: var(--hc-font-sans);
      font-size: 13px;
    }

    .html-collab-toolbar select {
      min-height: 30px;
      padding: 4px 26px 4px 10px;
      font-family: var(--hc-font-mono);
      font-size: 12px;
    }

    .html-collab-status {
      color: var(--hc-mute);
      font-family: var(--hc-font-mono);
      font-size: 11px;
      letter-spacing: 0.02em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding-left: 4px;
    }

    .html-collab-workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 380px;
      min-height: 0;
    }

    #html-collab-canvas {
      min-height: 0;
      padding: 0;
      background: var(--hc-surface);
    }

    #html-collab-source-frame {
      display: block;
      width: 100%;
      height: calc(100vh - 53px);
      border: 0;
      background: var(--hc-surface);
    }

    .html-collab-panel {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      min-height: 0;
      border-left: 1px solid var(--hc-rule);
      background: var(--hc-paper);
    }

    .html-collab-composer {
      padding: 16px 18px;
      border-bottom: 1px solid var(--hc-rule);
      background: var(--hc-surface);
    }

    .html-collab-composer[hidden] {
      display: none;
    }

    .html-collab-selected-quote {
      max-height: 76px;
      margin: 0 0 10px;
      overflow: auto;
      border-left: 2px solid var(--hc-amber);
      padding: 2px 0 2px 10px;
      color: var(--hc-mute);
      font-size: 12px;
      line-height: 1.5;
    }

    .html-collab-composer textarea,
    .html-collab-reply-body {
      width: 100%;
      resize: vertical;
      padding: 9px 11px;
      font-family: var(--hc-font-sans);
      font-size: 13px;
      line-height: 1.5;
    }

    .html-collab-reply-body {
      resize: none;
      overflow: hidden;
    }

    .html-collab-composer-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
    }

    .html-collab-thread-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 4px;
      margin-top: 12px;
    }

    .html-collab-thread-reply .html-collab-thread-actions {
      margin-top: 0;
    }

    .html-collab-thread-actions .html-collab-action-secondary {
      margin-right: auto;
    }

    .html-collab-action-secondary {
      min-height: 26px;
      border: 0;
      background: transparent;
      color: var(--hc-mute-soft);
      padding: 2px 8px;
      font-family: var(--hc-font-mono);
      font-size: 11px;
      letter-spacing: 0.02em;
      border-radius: var(--hc-radius-sm);
    }

    .html-collab-action-secondary:hover:not(:disabled) {
      background: var(--hc-surface-sunk);
      color: var(--hc-ink);
    }

    .html-collab-thread-reply {
      display: grid;
      gap: 8px;
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px dashed var(--hc-rule);
    }

    .html-collab-edit-fields {
      display: grid;
      gap: 8px;
    }

    .html-collab-edit-fields select {
      min-height: 32px;
      padding: 4px 26px 4px 10px;
    }

    .html-collab-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(31, 32, 66, 0.40);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 200;
      padding: 24px;
      animation: hcFadeIn 180ms var(--hc-ease);
    }

    .html-collab-modal-backdrop[hidden] {
      display: none;
    }

    @keyframes hcFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes hcRise {
      from { opacity: 0; transform: translateY(8px) scale(0.992); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .html-collab-modal {
      width: min(720px, 92vw);
      max-height: min(80vh, 640px);
      background: var(--hc-surface);
      border-radius: var(--hc-radius-lg);
      box-shadow: var(--hc-shadow-lg);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid var(--hc-rule);
      animation: hcRise 220ms var(--hc-ease);
    }

    .html-collab-modal-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 22px;
      border-bottom: 1px solid var(--hc-rule);
      background: var(--hc-paper);
    }

    .html-collab-modal-title {
      font-family: var(--hc-font-mono);
      font-weight: 600;
      color: var(--hc-ink);
      font-size: 13px;
      letter-spacing: 0.01em;
    }

    .html-collab-modal-subtitle {
      font-size: 12px;
      color: var(--hc-mute);
    }

    .html-collab-modal-actions {
      margin-left: auto;
      display: flex;
      gap: 6px;
    }

    .html-collab-modal-body {
      margin: 0;
      padding: 22px 26px;
      overflow: auto;
      font-family: var(--hc-font-mono);
      font-size: 12.5px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--hc-ink);
      flex: 1;
      background: var(--hc-surface);
    }

    .html-collab-modal-footer {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 22px;
      border-top: 1px solid var(--hc-rule);
      background: var(--hc-paper);
      color: var(--hc-mute);
      font-size: 12px;
    }

    .html-collab-modal-footer code {
      font-family: var(--hc-font-mono);
      font-size: 11.5px;
      background: var(--hc-surface);
      border: 1px solid var(--hc-rule);
      border-radius: var(--hc-radius-sm);
      padding: 2px 6px;
      color: var(--hc-ink);
    }

    .html-collab-modal-footer a {
      margin-left: auto;
      color: var(--hc-ink-soft);
      text-decoration: none;
      font-family: var(--hc-font-mono);
      font-size: 11px;
      letter-spacing: 0.02em;
      border-bottom: 1px solid transparent;
      transition: border-color 140ms var(--hc-ease);
    }

    .html-collab-modal-footer a:hover {
      border-bottom-color: var(--hc-amber);
    }

    .html-collab-thread-scroll {
      min-height: 0;
      overflow: auto;
      padding: 14px 14px 18px;
    }

    .html-collab-document-warning {
      margin: 14px 14px 0;
      border: 1px solid var(--hc-amber-soft);
      border-left: 3px solid var(--hc-amber);
      border-radius: var(--hc-radius-md);
      background: var(--hc-amber-tint);
      padding: 12px 14px;
      color: var(--hc-amber-ink);
      font-size: 12px;
      line-height: 1.5;
    }

    .html-collab-document-warning strong {
      display: block;
      margin-bottom: 4px;
      color: var(--hc-amber-ink);
      font-size: 13px;
      font-weight: 600;
    }

    .html-collab-document-warning p {
      margin: 0;
    }

    .html-collab-document-warning ul {
      margin: 8px 0 0;
      padding-left: 18px;
    }

    .html-collab-document-warning code {
      font-family: var(--hc-font-mono);
      font-size: 11.5px;
      word-break: break-word;
    }

    .html-collab-panel-heading {
      margin: 22px 4px 10px;
      color: var(--hc-mute);
      font-family: var(--hc-font-mono);
      font-size: 10.5px;
      font-weight: 600;
      letter-spacing: 0.10em;
      text-transform: uppercase;
    }

    .html-collab-panel-heading:first-child {
      margin-top: 4px;
    }

    .html-collab-empty {
      margin: 18px 4px;
      color: var(--hc-mute);
      font-size: 13px;
      line-height: 1.55;
    }

    .html-collab-thread {
      border: 1px solid var(--hc-rule);
      border-radius: var(--hc-radius-md);
      padding: 14px;
      margin-bottom: 10px;
      background: var(--hc-surface);
      cursor: pointer;
      transition: border-color 140ms var(--hc-ease), box-shadow 140ms var(--hc-ease), transform 140ms var(--hc-ease);
    }

    .html-collab-thread:hover {
      border-color: var(--hc-ink);
      box-shadow: var(--hc-shadow-sm);
    }

    .html-collab-thread textarea,
    .html-collab-thread input {
      cursor: text;
    }

    .html-collab-thread-active {
      border-color: var(--hc-ink);
      box-shadow: 0 0 0 3px rgba(245, 165, 36, 0.20);
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
      width: 28px;
      min-height: 28px;
      padding: 0;
      border-color: var(--hc-amber);
      background: var(--hc-amber-tint);
      color: var(--hc-amber-ink);
      font-family: var(--hc-font-mono);
      font-weight: 600;
      font-size: 11px;
      border-radius: var(--hc-radius-sm);
    }

    .html-collab-thread-status {
      border-radius: 999px;
      background: var(--hc-surface-sunk);
      padding: 2px 10px;
      color: var(--hc-mute);
      font-family: var(--hc-font-mono);
      font-size: 10.5px;
      font-weight: 500;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .html-collab-edit-suggestion .html-collab-thread-number {
      border-color: var(--hc-edit);
      background: var(--hc-edit-soft);
      color: var(--hc-edit-ink);
    }

    .html-collab-edit-suggestion .html-collab-thread-quote {
      border-left-color: var(--hc-edit);
    }

    .html-collab-edit-detail {
      margin: 6px 0 0;
      color: var(--hc-ink);
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
    }

    .html-collab-edit-note {
      margin: 4px 0 0;
      color: var(--hc-mute);
      font-size: 12px;
      font-style: italic;
      line-height: 1.5;
      white-space: pre-wrap;
    }

    .html-collab-edit-replacement {
      background: var(--hc-edit-soft);
      color: var(--hc-edit-ink);
      border-radius: var(--hc-radius-sm);
      padding: 1px 6px;
      font-family: var(--hc-font-mono);
      font-size: 11.5px;
    }

    .html-collab-context-menu {
      position: fixed;
      z-index: 20;
      display: grid;
      gap: 2px;
      min-width: 148px;
      padding: 5px;
      border: 1px solid var(--hc-rule);
      border-radius: var(--hc-radius-md);
      background: var(--hc-surface);
      box-shadow: var(--hc-shadow-md);
    }

    .html-collab-context-menu[hidden] {
      display: none;
    }

    .html-collab-context-menu button {
      width: 100%;
      min-height: 28px;
      border: 0;
      padding: 6px 10px;
      text-align: left;
      justify-content: flex-start;
      font-size: 12px;
    }

    .html-collab-context-menu button:hover {
      background: var(--hc-surface-sunk);
    }

    .html-collab-help {
      position: fixed;
      top: 60px;
      right: 18px;
      z-index: 30;
      width: 320px;
      max-height: calc(100vh - 80px);
      overflow: auto;
      padding: 16px 18px 14px;
      border: 1px solid var(--hc-rule);
      border-radius: var(--hc-radius-md);
      background: var(--hc-surface);
      box-shadow: var(--hc-shadow-md);
      color: var(--hc-ink);
      font-size: 12.5px;
      line-height: 1.55;
      animation: hcRise 180ms var(--hc-ease);
    }

    .html-collab-help[hidden] {
      display: none;
    }

    .html-collab-help h3 {
      margin: 16px 0 8px;
      color: var(--hc-mute);
      font-family: var(--hc-font-mono);
      font-size: 10.5px;
      font-weight: 600;
      letter-spacing: 0.10em;
      text-transform: uppercase;
    }

    .html-collab-help h3:first-child {
      margin-top: 0;
    }

    .html-collab-help p {
      margin: 0 0 10px;
      color: var(--hc-ink);
    }

    .html-collab-help-row {
      display: grid;
      grid-template-columns: 88px 1fr;
      gap: 8px;
      align-items: baseline;
      padding: 3px 0;
    }

    .html-collab-help-row + .html-collab-help-row {
      border-top: 1px dashed var(--hc-rule-soft);
    }

    .html-collab-help code,
    .html-collab-help-row code {
      font-family: var(--hc-font-mono);
      font-size: 11.5px;
      color: var(--hc-ink);
    }

    .html-collab-help-cli {
      display: block;
      margin: 6px 0;
      padding: 8px 10px;
      background: var(--hc-surface-sunk);
      border-radius: var(--hc-radius-sm);
      font-family: var(--hc-font-mono);
      font-size: 11.5px;
      color: var(--hc-ink);
      overflow-x: auto;
    }

    .html-collab-help-cli .hc-prompt {
      color: var(--hc-mute-soft);
      user-select: none;
    }

    .html-collab-help-footer {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid var(--hc-rule);
      font-family: var(--hc-font-mono);
      font-size: 11px;
      color: var(--hc-mute);
    }

    .html-collab-help-footer a,
    .html-collab-help-footer button {
      color: var(--hc-ink);
      text-decoration: none;
      background: transparent;
      border: 0;
      padding: 0;
      font: inherit;
      cursor: pointer;
      border-bottom: 1px solid transparent;
      transition: border-color 140ms var(--hc-ease);
    }

    .html-collab-help-footer a:hover,
    .html-collab-help-footer button:hover {
      border-bottom-color: var(--hc-amber);
    }

    .html-collab-help-footer a:last-child {
      margin-left: auto;
    }

    .html-collab-kbd,
    .html-collab-help kbd {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 22px;
      height: 22px;
      padding: 0 6px;
      border: 1px solid var(--hc-rule);
      border-bottom-width: 2px;
      border-radius: 5px;
      background: var(--hc-surface);
      color: var(--hc-ink);
      font-family: var(--hc-font-mono);
      font-size: 11px;
      font-weight: 600;
      box-shadow: 0 1px 0 var(--hc-rule-soft);
    }

    /* Welcome modal — first-open onboarding. */
    .html-collab-welcome {
      width: min(560px, 92vw);
      max-height: min(86vh, 720px);
      background: var(--hc-surface);
      border-radius: var(--hc-radius-lg);
      box-shadow: var(--hc-shadow-lg);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid var(--hc-rule);
      animation: hcRise 260ms var(--hc-ease);
    }

    .html-collab-welcome-rule {
      height: 4px;
      background: linear-gradient(90deg, var(--hc-amber) 0%, var(--hc-amber) 64px, var(--hc-rule-soft) 64px, var(--hc-rule-soft) 100%);
    }

    .html-collab-welcome-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 18px 22px 4px;
    }

    .html-collab-welcome-header .html-collab-brand {
      margin-left: 0;
      padding: 0;
    }

    .html-collab-welcome-header .html-collab-brand:hover {
      background: transparent;
    }

    .html-collab-welcome-body {
      padding: 10px 26px 18px;
      overflow: auto;
    }

    .html-collab-welcome-eyebrow {
      margin: 6px 0 4px;
      color: var(--hc-amber-ink);
      font-family: var(--hc-font-mono);
      font-size: 10.5px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .html-collab-welcome-headline {
      margin: 0 0 14px;
      font-family: var(--hc-font-sans);
      font-size: 24px;
      font-weight: 600;
      letter-spacing: -0.01em;
      line-height: 1.2;
      color: var(--hc-ink);
    }

    .html-collab-welcome-lede {
      margin: 0 0 18px;
      color: var(--hc-ink-soft);
      font-size: 14px;
      line-height: 1.55;
    }

    .html-collab-welcome-lede em {
      color: var(--hc-ink);
      font-style: normal;
      font-weight: 600;
    }

    .html-collab-welcome-steps {
      display: grid;
      gap: 2px;
      margin: 0 0 18px;
      padding: 4px 0;
      border-top: 1px solid var(--hc-rule);
      border-bottom: 1px solid var(--hc-rule);
    }

    .html-collab-welcome-step {
      display: grid;
      grid-template-columns: 36px 1fr;
      gap: 14px;
      align-items: baseline;
      padding: 12px 2px;
    }

    .html-collab-welcome-step + .html-collab-welcome-step {
      border-top: 1px dashed var(--hc-rule-soft);
    }

    .html-collab-welcome-step .html-collab-kbd {
      justify-self: start;
    }

    .html-collab-welcome-step-title {
      display: block;
      color: var(--hc-ink);
      font-weight: 600;
      font-size: 13.5px;
      letter-spacing: -0.005em;
    }

    .html-collab-welcome-step-desc {
      display: block;
      margin-top: 2px;
      color: var(--hc-mute);
      font-size: 12.5px;
      line-height: 1.5;
    }

    .html-collab-welcome-cli {
      display: grid;
      gap: 6px;
      margin: 0 0 6px;
      padding: 14px 16px;
      background: var(--hc-ink);
      border-radius: var(--hc-radius-md);
      color: rgba(255, 255, 255, 0.92);
    }

    .html-collab-welcome-cli-label {
      font-family: var(--hc-font-mono);
      font-size: 10.5px;
      font-weight: 600;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--hc-amber);
    }

    .html-collab-welcome-cli code {
      font-family: var(--hc-font-mono);
      font-size: 13px;
      color: var(--hc-surface);
    }

    .html-collab-welcome-cli code .hc-prompt {
      color: var(--hc-amber);
      margin-right: 6px;
      user-select: none;
    }

    .html-collab-welcome-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      padding: 14px 22px;
      border-top: 1px solid var(--hc-rule);
      background: var(--hc-paper);
    }

    .html-collab-welcome-footer .html-collab-btn-ghost {
      margin-right: auto;
    }

    .html-collab-thread-quote {
      margin: 0 0 8px;
      border-left: 2px solid var(--hc-amber);
      padding: 2px 0 2px 10px;
      color: var(--hc-mute);
      font-size: 12px;
      line-height: 1.5;
    }

    .html-collab-message {
      margin: 12px 0 0;
    }

    .html-collab-message-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--hc-mute);
      font-family: var(--hc-font-mono);
      font-size: 11px;
      letter-spacing: 0.01em;
    }

    .html-collab-message-meta > :first-child {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--hc-ink);
      font-family: var(--hc-font-sans);
      font-size: 12.5px;
      font-weight: 600;
      letter-spacing: 0;
    }

    .html-collab-message p {
      margin: 4px 0 0;
      color: var(--hc-ink);
      font-size: 13px;
      line-height: 1.55;
      white-space: pre-wrap;
    }

    .html-collab-message-deleted {
      color: var(--hc-mute-soft) !important;
      font-style: italic;
    }

    @media (max-width: 860px) {
      .html-collab-workspace {
        grid-template-columns: 1fr;
      }

      .html-collab-panel {
        border-left: 0;
        border-top: 1px solid var(--hc-rule);
      }

      #html-collab-source-frame {
        height: 68vh;
      }

      .html-collab-brand-wordmark {
        display: none;
      }

      .html-collab-help {
        right: 8px;
        width: calc(100vw - 16px);
        max-width: 340px;
      }
    }
  </style>
</head>
<body>
  <div id="html-collab-shell">
    <header class="html-collab-toolbar" aria-label="HTML Collab review shell">
      <div class="html-collab-toolbar-group">
        <a class="html-collab-brand" href="${PROJECT_URL}" target="_blank" rel="noopener noreferrer" aria-label="Made with html-collab. Open the GitHub repository" title="Made with html-collab">${BRAND_LOGO_SVG}${BRAND_WORDMARK_SVG}</a>
        <span class="html-collab-toolbar-divider" aria-hidden="true"></span>
        <input id="html-collab-reviewer" type="text" autocomplete="name" aria-label="Reviewer name" placeholder="Your name">
      </div>
      <div class="html-collab-toolbar-group">
        <button id="html-collab-add-comment" class="html-collab-btn html-collab-btn-primary" type="button" disabled>Comment</button>
        <button id="html-collab-suggest-edit" class="html-collab-btn html-collab-btn-primary" type="button" disabled>Edit</button>
        <select id="html-collab-edit-view" aria-label="Edit preview mode">
          <option value="markup">Markup</option>
          <option value="preview">Preview</option>
        </select>
        <span class="html-collab-toolbar-divider" aria-hidden="true"></span>
        <button id="html-collab-merge" class="html-collab-btn" type="button">Merge</button>
        <button id="html-collab-brief" class="html-collab-btn html-collab-btn-amber" type="button">AI Brief</button>
        <button id="html-collab-export" class="html-collab-btn html-collab-btn-amber" type="button">Export Review File</button>
        <button id="html-collab-autosave" class="html-collab-btn" type="button" aria-pressed="false">Autosave</button>
        <button id="html-collab-help-button" class="html-collab-btn-ghost html-collab-btn-icon" type="button" aria-expanded="false" aria-label="About this file and keyboard shortcuts" title="About &amp; shortcuts">?</button>
        <input id="html-collab-merge-files" type="file" accept=".html,text/html" multiple hidden>
        <div class="html-collab-status" id="html-collab-status">Ready</div>
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
        <button id="html-collab-context-comment" type="button">Comment <span class="html-collab-kbd" aria-hidden="true">C</span></button>
        <button id="html-collab-context-edit" type="button">Edit <span class="html-collab-kbd" aria-hidden="true">E</span></button>
      </div>
      <aside class="html-collab-help" id="html-collab-help" role="dialog" aria-label="About this file" hidden>
        <h3>About this file</h3>
        <p>A reviewable HTML report made with <strong>html-collab</strong>. Highlight any text in the document, then comment on it or suggest an edit. Everything stays inside this single file.</p>
        <h3>Keyboard</h3>
        <div class="html-collab-help-row"><span class="html-collab-kbd">C</span><span>Comment on selection</span></div>
        <div class="html-collab-help-row"><span class="html-collab-kbd">E</span><span>Suggest an edit</span></div>
        <div class="html-collab-help-row"><span class="html-collab-kbd">Enter</span><span>Submit</span></div>
        <div class="html-collab-help-row"><span class="html-collab-kbd">Esc</span><span>Cancel · close</span></div>
        <div class="html-collab-help-row"><span><span class="html-collab-kbd">Shift</span> <span class="html-collab-kbd">↵</span></span><span>New line</span></div>
        <h3>Hand it back to your AI</h3>
        <p>Mark up what you want changed, click <strong>AI Brief</strong>, copy the markdown, paste it into the chat that wrote the report.</p>
        <h3>Wrap your own files</h3>
        <code class="html-collab-help-cli"><span class="hc-prompt">$</span> npx html-collab wrap report.html</code>
        <code class="html-collab-help-cli"><span class="hc-prompt">$</span> npx html-collab unwrap review.html --out clean.html</code>
        <code class="html-collab-help-cli"><span class="hc-prompt">$</span> npx html-collab merge a.review.html b.review.html</code>
        <div class="html-collab-help-footer">
          <button id="html-collab-show-welcome" type="button">Show welcome again</button>
          <a href="${PROJECT_URL}" target="_blank" rel="noopener noreferrer">github ↗</a>
        </div>
      </aside>
      <div class="html-collab-modal-backdrop" id="html-collab-brief-modal" hidden>
        <div class="html-collab-modal" role="dialog" aria-modal="true" aria-labelledby="html-collab-brief-modal-title">
          <header class="html-collab-modal-header">
            <span class="html-collab-modal-title" id="html-collab-brief-modal-title">Review brief</span>
            <span class="html-collab-modal-subtitle">Markdown · paste into your AI</span>
            <div class="html-collab-modal-actions">
              <button id="html-collab-brief-copy" class="html-collab-btn html-collab-btn-primary" type="button">Copy</button>
              <button id="html-collab-brief-download" class="html-collab-btn" type="button">Download .md</button>
              <button id="html-collab-brief-close" class="html-collab-btn-ghost html-collab-btn-icon" type="button" aria-label="Close">&#x2715;</button>
            </div>
          </header>
          <pre class="html-collab-modal-body" id="html-collab-brief-body"></pre>
          <footer class="html-collab-modal-footer">
            <span>Made with html-collab. Wrap your own:</span>
            <code>npx html-collab wrap report.html</code>
            <a href="${PROJECT_URL}" target="_blank" rel="noopener noreferrer">github ↗</a>
          </footer>
        </div>
      </div>
      <div class="html-collab-modal-backdrop" id="html-collab-welcome-modal" hidden>
        <div class="html-collab-welcome" role="dialog" aria-modal="true" aria-labelledby="html-collab-welcome-title">
          <div class="html-collab-welcome-rule" aria-hidden="true"></div>
          <header class="html-collab-welcome-header">
            <a class="html-collab-brand" href="${PROJECT_URL}" target="_blank" rel="noopener noreferrer" aria-label="html-collab on GitHub">${BRAND_LOGO_SVG}${BRAND_WORDMARK_SVG}</a>
            <button id="html-collab-welcome-close" class="html-collab-btn-ghost html-collab-btn-icon" type="button" aria-label="Close">&#x2715;</button>
          </header>
          <div class="html-collab-welcome-body">
            <p class="html-collab-welcome-eyebrow">A reviewable HTML file</p>
            <h2 class="html-collab-welcome-headline" id="html-collab-welcome-title">Mark it up. Send it back.</h2>
            <p class="html-collab-welcome-lede">Someone shared an HTML report with you. It opens like a normal web page — but you can <em>highlight any text</em> and leave comments or suggest edits. Everything is saved inside this single file. Nothing is uploaded anywhere.</p>
            <div class="html-collab-welcome-steps">
              <div class="html-collab-welcome-step">
                <span class="html-collab-kbd">C</span>
                <div>
                  <span class="html-collab-welcome-step-title">Comment on a selection</span>
                  <span class="html-collab-welcome-step-desc">Highlight any text in the report, press C. Or right-click for the menu.</span>
                </div>
              </div>
              <div class="html-collab-welcome-step">
                <span class="html-collab-kbd">E</span>
                <div>
                  <span class="html-collab-welcome-step-title">Suggest an edit</span>
                  <span class="html-collab-welcome-step-desc">Replace, insert, or delete — the author can accept or reject each one.</span>
                </div>
              </div>
              <div class="html-collab-welcome-step">
                <span class="html-collab-kbd">↗</span>
                <div>
                  <span class="html-collab-welcome-step-title">Send it back</span>
                  <span class="html-collab-welcome-step-desc">Save the file and email it. Your comments travel with it. Or click <strong>AI Brief</strong> to copy a markdown summary for your AI.</span>
                </div>
              </div>
            </div>
            <div class="html-collab-welcome-cli">
              <span class="html-collab-welcome-cli-label">Wrap your own AI report</span>
              <code><span class="hc-prompt">$</span>npx html-collab wrap report.html</code>
            </div>
          </div>
          <footer class="html-collab-welcome-footer">
            <a class="html-collab-btn-ghost" href="${PROJECT_URL}" target="_blank" rel="noopener noreferrer">View on GitHub ↗</a>
            <button id="html-collab-welcome-start" class="html-collab-btn html-collab-btn-amber" type="button">Start reviewing</button>
          </footer>
        </div>
      </div>
      <aside class="html-collab-panel" aria-label="Review comments">
        ${renderLocalPageWarning(localPageReferences)}
        <section class="html-collab-composer" id="html-collab-composer" hidden>
          <blockquote class="html-collab-selected-quote" id="html-collab-selected-quote"></blockquote>
          <textarea id="html-collab-comment-body" rows="4" placeholder="Comment"></textarea>
          <div class="html-collab-composer-actions">
            <button id="html-collab-submit-comment" class="html-collab-btn html-collab-btn-primary" type="button">Add <span class="html-collab-kbd" aria-hidden="true">↵</span></button>
            <button id="html-collab-cancel-comment" class="html-collab-btn-ghost" type="button">Cancel <span class="html-collab-kbd" aria-hidden="true">Esc</span></button>
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
            <button id="html-collab-submit-edit" class="html-collab-btn html-collab-btn-primary" type="button">Suggest <span class="html-collab-kbd" aria-hidden="true">↵</span></button>
            <button id="html-collab-cancel-edit" class="html-collab-btn-ghost" type="button">Cancel <span class="html-collab-kbd" aria-hidden="true">Esc</span></button>
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
  ${renderRuntimeScript(options)}
</body>
</html>
`;
}

function renderRuntimeScript(options: ReviewShellOptions): string {
  if (options.runtimeScriptSrc) {
    return `<script src="${escapeHtml(options.runtimeScriptSrc)}" data-html-collab-runtime="external"></script>`;
  }

  return `<script>
${iframeLoaderRuntime}
  </script>`;
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

export function extractSourceTitle(sourceHtml: string): string | undefined {
  const match = sourceHtml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = match?.[1]?.replace(/\s+/g, " ").trim();
  return title ? decodeHtmlText(title) : undefined;
}

function decodeBase64Utf8(value: string): string {
  const maybeBuffer = (globalThis as typeof globalThis & {
    Buffer?: { from(value: string, encoding: "base64"): { toString(encoding: "utf8"): string } };
  }).Buffer;
  if (maybeBuffer) {
    return maybeBuffer.from(value, "base64").toString("utf8");
  }

  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
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

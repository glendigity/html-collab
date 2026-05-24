import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { unwrapFile } from "../src/commands/unwrap";
import { wrapFile } from "../src/commands/wrap";
import {
  createReviewHtml,
  extractReviewState,
  extractSourcePayload,
  findLocalHtmlPageReferences,
  fingerprintSource,
} from "../src/format/html-envelope";

const fixturePath = join(import.meta.dir, "fixtures", "simple-report.html");

describe("wrap/unwrap", () => {
  test("wrap creates a single-file review envelope with source and initial state", async () => {
    const sourceBytes = await readFile(fixturePath);
    const reviewHtml = createReviewHtml(sourceBytes, {
      docId: "test-doc-id",
      sourcePath: fixturePath,
    });

    expect(reviewHtml).toContain('id="html-collab-shell"');
    expect(reviewHtml).toContain('id="html-collab-source-frame"');
    expect(reviewHtml).toContain('id="html-collab-source"');
    expect(reviewHtml).toContain('id="html-collab-state"');
    expect(reviewHtml).toContain("frame.srcdoc = sourceHtml");
    expect(reviewHtml).not.toContain("sandbox=");
    expect(reviewHtml).toContain('<link rel="icon" href="data:,">');
    expect(reviewHtml).toContain('class="html-collab-brand-logo"');
    expect(reviewHtml).toContain('class="html-collab-brand-wordmark"');
    expect(reviewHtml).toContain("&lt;html-collab&gt;");
    expect(reviewHtml).toContain(
      '<link rel="author" href="https://github.com/glendigity/html-collab">',
    );
    expect(reviewHtml).toContain(
      'href="https://github.com/glendigity/html-collab" target="_blank" rel="noopener noreferrer"',
    );
    expect(reviewHtml).toContain("Made with html-collab");
    expect(reviewHtml).toContain('placeholder="Your name"');
    expect(reviewHtml).toContain('id="html-collab-merge"');
    expect(reviewHtml).toContain('id="html-collab-brief"');
    expect(reviewHtml).toContain('id="html-collab-autosave"');
    expect(reviewHtml).not.toContain('id="html-collab-save"');
    expect(reviewHtml).toContain('id="html-collab-suggest-edit"');
    expect(reviewHtml).toContain('id="html-collab-context-menu"');
    expect(reviewHtml).toContain('id="html-collab-edit-view"');
    expect(reviewHtml).toContain('id="html-collab-help-button"');
    expect(reviewHtml).toContain('id="html-collab-welcome-modal"');
    expect(reviewHtml).toContain("Mark it up. Send it back.");
    expect(reviewHtml).not.toContain("attr(data-html-collab-number)");
    expect(reviewHtml).not.toContain("Only this top page is wrapped and commentable.");
    expect(reviewHtml).not.toContain('aria-label="Local page links warning"');

    const payload = extractSourcePayload(reviewHtml);
    expect(payload.encoding).toBe("base64");
    expect(Buffer.from(payload.html, "base64").equals(sourceBytes)).toBe(true);

    const state = extractReviewState(reviewHtml);
    expect(state).toEqual({
      schemaVersion: 1,
      docId: "test-doc-id",
      sourceFingerprint: fingerprintSource(sourceBytes),
      title: "Simple Report",
      actors: {},
      ops: [],
    });
  });

  test("wrap and unwrap round trip source bytes through files", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "html-collab-"));
    try {
      const reviewPath = join(tempDir, "simple-report.review.html");
      const finalPath = join(tempDir, "simple-report.final.html");

      const result = await wrapFile(fixturePath, reviewPath);
      await unwrapFile(reviewPath, finalPath);

      const sourceBytes = await readFile(fixturePath);
      const finalBytes = await readFile(finalPath);
      expect(result.sourceBytes).toBe(sourceBytes.byteLength);
      expect(result.reviewBytes).toBeGreaterThan(sourceBytes.byteLength);
      expect(finalBytes.equals(sourceBytes)).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("wrap reports local HTML page references without blocking", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "html-collab-"));
    try {
      const sourcePath = join(tempDir, "index.html");
      const reviewPath = join(tempDir, "index.review.html");
      await writeFile(
        sourcePath,
        `<!doctype html>
<html>
<head><title>Page tree</title></head>
<body>
  <a href="pages/chapter.html">Chapter</a>
</body>
</html>`,
      );

      const result = await wrapFile(sourcePath, reviewPath);

      expect(result.localPageReferences).toEqual(["pages/chapter.html"]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("unwrap rejects a plain HTML file", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "html-collab-"));
    try {
      const finalPath = join(tempDir, "plain.final.html");
      await expect(unwrapFile(fixturePath, finalPath)).rejects.toThrow(
        "This does not look like an html-collab review file",
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("wrap refuses to re-wrap a file that is already wrapped", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "html-collab-"));
    try {
      const reviewPath = join(tempDir, "report.review.html");
      const doublePath = join(tempDir, "report.double.review.html");

      await wrapFile(fixturePath, reviewPath);
      await expect(wrapFile(reviewPath, doublePath)).rejects.toThrow(
        /already looks like an html-collab review file/,
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("createReviewHtml refuses to wrap an already-wrapped buffer", async () => {
    const sourceBytes = await readFile(fixturePath);
    const reviewHtml = createReviewHtml(sourceBytes, {
      docId: "test-doc-id",
      sourcePath: fixturePath,
    });
    expect(() =>
      createReviewHtml(Buffer.from(reviewHtml, "utf8"), { sourcePath: "report.review.html" }),
    ).toThrow(/already looks like an html-collab review file/);
  });

  test("wrap allows ordinary HTML that mentions html-collab as a generator", () => {
    const sourceHtml = `<!doctype html>
<html>
<head>
  <meta name="generator" content="html-collab">
  <title>Generated elsewhere</title>
</head>
<body>
  <p>This is just a normal HTML file.</p>
</body>
</html>`;

    const reviewHtml = createReviewHtml(Buffer.from(sourceHtml), { sourcePath: "generated.html" });
    const payload = extractSourcePayload(reviewHtml);

    expect(Buffer.from(payload.html, "base64").toString("utf8")).toBe(sourceHtml);
  });

  test("findLocalHtmlPageReferences detects local page links only", () => {
    const sourceHtml = `<!doctype html>
<a href="pages/chapter.html">Chapter</a>
<a href='./appendix.htm?print=1#top'>Appendix</a>
<iframe src="/root/page.html"></iframe>
<a href="#local-anchor">Anchor</a>
<a href="https://example.com/remote.html">Remote</a>
<a href="mailto:test@example.com">Email</a>
<img src="images/chart.png" alt="">
<a href="pages/chapter.html">Duplicate</a>`;

    expect(findLocalHtmlPageReferences(sourceHtml)).toEqual([
      "pages/chapter.html",
      "./appendix.htm?print=1#top",
      "/root/page.html",
    ]);
  });

  test("wrap embeds a visible warning when source links to local HTML pages", () => {
    const sourceHtml = `<!doctype html>
<html>
<head><title>Page tree</title></head>
<body>
  <a href="pages/chapter.html">Chapter</a>
</body>
</html>`;

    const reviewHtml = createReviewHtml(Buffer.from(sourceHtml), { sourcePath: "index.html" });

    expect(reviewHtml).toContain("Only this top page is wrapped and commentable.");
    expect(reviewHtml).toContain("<code>pages/chapter.html</code>");
  });

  test("wrap embeds a syntactically valid runtime script", async () => {
    const sourceBytes = await readFile(fixturePath);
    const reviewHtml = createReviewHtml(sourceBytes, {
      docId: "test-doc-id",
      sourcePath: fixturePath,
    });

    const scripts = Array.from(reviewHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g));
    const runtimeScript = scripts.at(-1)?.[1];

    expect(runtimeScript).toBeTruthy();
    if (!runtimeScript) {
      throw new Error("Missing runtime script");
    }
    expect(runtimeScript).toContain("showSaveFilePicker");
    expect(runtimeScript).toContain("requestAutosave");
    expect(runtimeScript).toContain("mergeAutosaveTarget");
    expect(runtimeScript).toContain("promptReviewerName");
    expect(runtimeScript).toContain("html-collab-thread-");
    expect(runtimeScript).toContain("edit.suggest");
    expect(runtimeScript).toContain("edit.delete");
    expect(runtimeScript).toContain("contextmenu");
    expect(runtimeScript).toContain("handleReviewShortcut");
    expect(runtimeScript).toContain("handleCommentComposerKeydown");
    expect(runtimeScript).toContain("html-collab-edit-inline-replacement");
    expect(runtimeScript).toContain("html-collab-edit-preview-replacement");
    expect(runtimeScript).toContain("EDIT_VIEW_STORAGE_KEY");
    expect(runtimeScript).toContain("toggleHelp");
    expect(runtimeScript).toContain("openWelcomeModal");
    expect(() => new Function(runtimeScript)).not.toThrow();
  });
});

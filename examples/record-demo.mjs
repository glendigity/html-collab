#!/usr/bin/env node
// Records the README demo GIF.
//
// Usage:
//   bun examples/record-demo.mjs            # records into assets/demo.gif
//   bun examples/record-demo.mjs --keep     # keeps the intermediate frames/
//
// Requires: playwright (with chromium installed) and ffmpeg on PATH.
//   npx playwright install chromium
//   brew install ffmpeg
//
// The script spins up a tiny static server over examples/, drives
// examples/sample-memo.review.html in headless Chromium, takes screenshots
// at ~12fps with a caption banner overlaid, and stitches them into a GIF.

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(
    "[record-demo] playwright is not installed.\n" +
    "  Install with: npm i -D playwright && npx playwright install chromium",
  );
  process.exit(1);
}
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, existsSync, statSync, copyFileSync } from "node:fs";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const sampleSource = resolve(here, "sample-memo.html");
const sampleReview = resolve(here, "sample-memo.review.html");
const finalGif = resolve(root, "assets", "demo.gif");

if (!existsSync(sampleReview) || statSync(sampleSource).mtimeMs > statSync(sampleReview).mtimeMs) {
  console.error(
    "[record-demo] sample-memo.review.html is missing or stale. Run:\n" +
    "  bun run build && bun run build:sample",
  );
  process.exit(1);
}

const keepFrames = process.argv.includes("--keep");
const workDir = mkdtempSync(join(tmpdir(), "html-collab-demo-"));
const framesDir = join(workDir, "frames");
mkdirSync(framesDir, { recursive: true });

const PORT = 8765 + Math.floor(Math.random() * 200);
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const filePath = join(here, url.pathname.replace(/^\//, ""));
  if (!filePath.startsWith(here)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const data = readFileSync(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
const targetUrl = `http://127.0.0.1:${PORT}/sample-memo.review.html`;

const W = 1280;
const H = 760;
const FPS = 12;
const FRAME_MS = Math.round(1000 / FPS);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: W, height: H } });
await context.addInitScript(() => {
  localStorage.setItem("html-collab.reviewerName", "Glen");
});
const page = await context.newPage();
page.on("dialog", (d) => d.accept("Glen"));
page.on("console", (m) => {
  if (m.type() === "error") console.log("PAGE ERR:", m.text());
});

await page.goto(targetUrl, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.waitForFunction(
  () => {
    const f = document.querySelector("iframe");
    return f && f.contentDocument && f.contentDocument.body && f.contentDocument.body.innerText.length > 50;
  },
  { timeout: 10000 },
);

await page.evaluate(() => {
  const css = `
    #demo-caption {
      position: fixed; left: 50%; bottom: 32px; transform: translateX(-50%);
      background: #1e2238; color: #fbfaf6;
      padding: 18px 34px; border-radius: 999px;
      font: 600 21px/1 ui-sans-serif, -apple-system, BlinkMacSystemFont, sans-serif;
      letter-spacing: 0.005em; z-index: 2147483647;
      box-shadow: 0 22px 48px rgba(0,0,0,0.38);
      display: none; white-space: nowrap;
    }
    #demo-caption .step {
      color: #f5a524; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 14px; margin-right: 14px; letter-spacing: 0.14em; text-transform: uppercase;
    }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
  const cap = document.createElement("div");
  cap.id = "demo-caption";
  document.body.appendChild(cap);
  window.__caption = (step, text) => {
    cap.innerHTML = `<span class="step">${step}</span> ${text}`;
    cap.style.display = "block";
  };
  window.__captionHide = () => {
    cap.style.display = "none";
  };
});

let frameNum = 0;
async function shootMs(ms) {
  const frames = Math.max(1, Math.round(ms / FRAME_MS));
  for (let i = 0; i < frames; i++) {
    await page.screenshot({
      path: join(framesDir, String(frameNum++).padStart(5, "0") + ".png"),
      fullPage: false,
      animations: "disabled",
    });
  }
}
async function captionShow(step, text) {
  await page.evaluate(([s, t]) => window.__caption(s, t), [step, text]);
}
async function captionHide() {
  await page.evaluate(() => window.__captionHide());
}
async function selectInIframe(needle, length = 75) {
  return page.evaluate(
    ([n, len]) => {
      const f = document.querySelector("iframe");
      const doc = f.contentDocument;
      const win = f.contentWindow;
      const all = Array.from(doc.querySelectorAll("p, li, h1, h2, h3"));
      let target = null;
      let needleIndex = -1;
      for (const el of all) {
        const i = el.textContent.indexOf(n);
        if (i >= 0) {
          target = el;
          needleIndex = i;
          break;
        }
      }
      if (!target) return { ok: false };
      const walker = doc.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      let node = null;
      let consumed = 0;
      while ((node = walker.nextNode())) {
        const next = consumed + node.textContent.length;
        if (next > needleIndex) {
          const startOffset = needleIndex - consumed;
          const endOffset = Math.min(node.textContent.length, startOffset + (len || n.length));
          const range = doc.createRange();
          range.setStart(node, startOffset);
          range.setEnd(node, endOffset);
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          const sel = win.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          doc.dispatchEvent(new Event("selectionchange", { bubbles: true }));
          return { ok: true, selected: node.textContent.slice(startOffset, endOffset) };
        }
        consumed = next;
      }
      return { ok: false };
    },
    [needle, length],
  );
}
async function typeWithFrames(text, perCharMs = 50) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await shootMs(perCharMs);
  }
}

// ----- Step 1: setup -----
await shootMs(400);
await captionShow("Step 1", "Your AI just generated this report.");
await shootMs(2400);
await captionHide();
await shootMs(300);

await page.evaluate(() => {
  const f = document.querySelector("iframe");
  if (f) f.contentWindow.scrollTo({ top: 80, behavior: "smooth" });
});
await shootMs(1200);

// ----- Step 2: suggested edit -----
await captionShow("Step 2", "Mark up what you want changed.");
await shootMs(900);
const sel1 = await selectInIframe("In Q3, the operations team processed", 36);
if (!sel1.ok) throw new Error("selection 1 failed");
await shootMs(900);
await page.keyboard.press("KeyE");
await shootMs(700);
await typeWithFrames("In Q3,", 80);
await shootMs(400);
await page.keyboard.press("Enter");
await shootMs(1400);
await captionHide();
await shootMs(400);

// ----- Step 3: comment -----
await captionShow("Step 3", "Leave a comment for the AI.");
await shootMs(900);
const sel2 = await selectInIframe("Looking forward, the team is well-positioned", 82);
if (!sel2.ok) throw new Error("selection 2 failed");
await shootMs(900);
await page.keyboard.press("KeyC");
await shootMs(700);
await typeWithFrames("Cut the corporate filler. Give me the numbers.", 38);
await shootMs(500);
await page.keyboard.press("Enter");
await shootMs(1400);
await captionHide();
await shootMs(400);

// ----- Step 4: team share -----
await captionShow("Step 4", "Or send to others for their comments. Stays in one file.");
await shootMs(2800);
await captionHide();
await shootMs(300);

// ----- Step 5: brief modal -----
await captionShow("Step 5", "Click Brief to see what to send.");
await shootMs(1400);
await page.locator("#html-collab-brief").click();
await shootMs(1400);

// ----- Step 6: copy -----
await captionShow("Step 6", "Copy it. Paste it back into the AI.");
await shootMs(1200);
await page.locator("#html-collab-brief-copy").click();
await shootMs(3500);

await browser.close();
server.close();
console.log(`[record-demo] captured ${frameNum} frames`);

const palette = join(workDir, "palette.png");
const gifTmp = join(workDir, "demo.gif");

await run("ffmpeg", [
  "-y", "-framerate", String(FPS), "-i", join(framesDir, "%05d.png"),
  "-vf", "scale=820:-1:flags=lanczos,palettegen=stats_mode=diff:max_colors=128",
  palette,
]);
await run("ffmpeg", [
  "-y", "-framerate", String(FPS), "-i", join(framesDir, "%05d.png"),
  "-i", palette,
  "-lavfi", "scale=820:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
  gifTmp,
]);

mkdirSync(dirname(finalGif), { recursive: true });
copyFileSync(gifTmp, finalGif);
console.log(`[record-demo] wrote ${finalGif}`);

if (!keepFrames) {
  rmSync(workDir, { recursive: true, force: true });
} else {
  console.log(`[record-demo] frames kept at ${workDir}`);
}

function run(cmd, args) {
  return new Promise((resolveOk, rejectErr) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "inherit"] });
    child.on("error", rejectErr);
    child.on("exit", (code) => {
      if (code === 0) resolveOk();
      else rejectErr(new Error(`${cmd} exited ${code}`));
    });
  });
}

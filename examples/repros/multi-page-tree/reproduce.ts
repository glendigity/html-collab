import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { wrapFile } from "../../../src/commands/wrap";
import { extractSourcePayload } from "../../../src/format/html-envelope";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureSourceRoot = join(here, "source");
const workRoot = await mkdtemp(join(tmpdir(), "html-collab-multi-page-tree-"));
const sourceRoot = join(workRoot, "source");
const reviewOnlyRoot = join(workRoot, "review-only");

await cp(fixtureSourceRoot, sourceRoot, { recursive: true });

const sourcePages = [join(sourceRoot, "index.html"), join(sourceRoot, "pages", "chapter.html")];
for (const sourcePage of sourcePages) {
  const relativePage = relative(sourceRoot, sourcePage);
  const reviewPage = join(reviewOnlyRoot, relativePage.replace(/\.html$/, ".review.html"));
  await mkdir(dirname(reviewPage), { recursive: true });
  await wrapFile(sourcePage, reviewPage);
}

const indexReviewPath = join(reviewOnlyRoot, "index.review.html");
const chapterReviewPath = join(reviewOnlyRoot, "pages", "chapter.review.html");
const chapterSourcePath = join(reviewOnlyRoot, "pages", "chapter.html");

const indexReviewHtml = await readFile(indexReviewPath, "utf8");
if (!indexReviewHtml.includes("Only this top page is wrapped and commentable.")) {
  throw new Error("Expected review file to warn that only the top page is wrapped and commentable");
}

const sourcePayload = extractSourcePayload(indexReviewHtml, indexReviewPath);
const embeddedIndexHtml = Buffer.from(sourcePayload.html, "base64").toString("utf8");
const embeddedLink = embeddedIndexHtml.match(/href="([^"]+)"/)?.[1];

if (embeddedLink !== "pages/chapter.html") {
  throw new Error(`Expected embedded link to stay pages/chapter.html, got ${embeddedLink ?? "none"}`);
}

if (!existsSync(chapterReviewPath)) {
  throw new Error(`Expected generated review page at ${chapterReviewPath}`);
}

if (existsSync(chapterSourcePath)) {
  throw new Error(`Expected review-only tree not to contain source page ${chapterSourcePath}`);
}

const browserTargetUrl = new URL(embeddedLink, pathToFileURL(indexReviewPath));
const browserTargetPath = fileURLToPath(browserTargetUrl);
if (browserTargetPath !== chapterSourcePath) {
  throw new Error(`Unexpected resolved target: ${browserTargetPath}`);
}

console.log("Multi-page tree repro generated.");
console.log(`Source fixture: ${sourceRoot}`);
console.log(`Review-only tree: ${reviewOnlyRoot}`);
console.log(`Open manually: ${indexReviewPath}`);
console.log("");
console.log("Observed break:");
console.log("- Review UI warns that only the top page is wrapped and commentable.");
console.log(`- Embedded link remains: ${embeddedLink}`);
console.log(`- Browser target would be: ${browserTargetPath}`);
console.log(`- Generated reviewed page is: ${chapterReviewPath}`);
console.log("- Result: clicking the link cannot stay inside the .review workflow.");

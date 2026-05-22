import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createReviewHtml } from "../src/format/html-envelope";

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(here, "sample-memo.html");
const outputPath = resolve(here, "sample-memo.review.html");

const sourceBytes = await readFile(sourcePath);
const reviewHtml = createReviewHtml(sourceBytes, {
	docId: "demo-sample-memo",
	sourcePath,
});

await writeFile(outputPath, reviewHtml, "utf8");

console.log(`Built ${outputPath}`);

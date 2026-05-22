import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createReviewHtmlFromParts } from "../src/format/html-envelope";
import type {
	Actor,
	CommentCreateOp,
	EditSuggestOp,
	ReplyCreateOp,
	ReviewOp,
	ReviewState,
	SourcePayload,
	ThreadResolveOp,
} from "../src/format/state";

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(here, "tour.html");
const outputPath = resolve(here, "tour.review.html");

const sourceBytes = await readFile(sourcePath);
const sourceFingerprint = `sha256:${createHash("sha256").update(sourceBytes).digest("hex")}`;

const sourcePayload: SourcePayload = {
	encoding: "base64",
	html: sourceBytes.toString("base64"),
};

const actors: Record<string, Actor> = {
	"actor-glen": { actorId: "actor-glen", name: "Glen, allegedly human" },
	"actor-slop": { actorId: "actor-slop", name: "AI Slop Detector" },
	"actor-disgruntled": {
		actorId: "actor-disgruntled",
		name: "Disgruntled Teammate",
	},
	"actor-pedant": { actorId: "actor-pedant", name: "Senior Pedant" },
	"actor-driveby": { actorId: "actor-driveby", name: "Drive-by Reviewer" },
};

const baseTime = new Date("2026-05-20T09:00:00Z").getTime();
const timeAt = (minutes: number): string =>
	new Date(baseTime + minutes * 60_000).toISOString();

const ops: ReviewOp[] = [];

const threadEmDash = "thread-em-dash";

const commentEmDash: CommentCreateOp = {
	opId: "op-001",
	clock: 1,
	type: "comment.create",
	actorId: "actor-slop",
	time: timeAt(0),
	target: {
		kind: "text",
		quote: "portable review artifact —",
		prefix: "HTML report into a ",
		suffix: " comments",
	},
	payload: {
		threadId: threadEmDash,
		body: "em dash — AI slop?",
	},
};

const replyEmDash: ReplyCreateOp = {
	opId: "op-002",
	clock: 2,
	type: "reply.create",
	actorId: "actor-glen",
	time: timeAt(11),
	target: { threadId: threadEmDash },
	payload: {
		body: "I will die on this em-dash hill.",
	},
};

const resolveEmDash: ThreadResolveOp = {
	opId: "op-003",
	clock: 3,
	type: "thread.resolve",
	actorId: "actor-slop",
	time: timeAt(13),
	target: { threadId: threadEmDash },
	payload: {},
};

ops.push(commentEmDash, replyEmDash, resolveEmDash);

const threadGoogleDoc = "thread-google-doc";

const commentGoogleDoc: CommentCreateOp = {
	opId: "op-004",
	clock: 4,
	type: "comment.create",
	actorId: "actor-disgruntled",
	time: timeAt(42),
	target: {
		kind: "text",
		quote: "Combines two parallel reviews into one file.",
		prefix: "merged.review.html. ",
		suffix: " Operations",
	},
	payload: {
		threadId: threadGoogleDoc,
		body: "Have we considered a Google Doc.",
	},
};

const replyGoogleDoc: ReplyCreateOp = {
	opId: "op-005",
	clock: 5,
	type: "reply.create",
	actorId: "actor-glen",
	time: timeAt(58),
	target: { threadId: threadGoogleDoc },
	payload: {
		body: "People keep sending me beautiful htmls I can't annotate!",
	},
};

ops.push(commentGoogleDoc, replyGoogleDoc);

const editCadence: EditSuggestOp = {
	opId: "op-006",
	clock: 6,
	type: "edit.suggest",
	actorId: "actor-pedant",
	time: timeAt(76),
	target: {
		kind: "text",
		quote:
			"comments, edits, and a brief you can paste back to the AI that wrote it.",
		prefix: "review artifact — ",
		suffix: "",
	},
	payload: {
		editId: "edit-cadence",
		kind: "replace",
		replacement: "Comments. Edits. A brief you paste back to the AI.",
		note: "Cadence.",
	},
};

const editTerse: EditSuggestOp = {
	opId: "op-007",
	clock: 7,
	type: "edit.suggest",
	actorId: "actor-driveby",
	time: timeAt(94),
	target: {
		kind: "text",
		quote: "Same file in, same file out — no exports to keep track of.",
		prefix: "as you work. ",
		suffix: "",
	},
	payload: {
		editId: "edit-terse",
		kind: "replace",
		replacement: "Same file in, same file out.",
		note: "less words",
	},
};

ops.push(editCadence, editTerse);

const state: ReviewState = {
	schemaVersion: 1,
	docId: "demo-tour-html-collab",
	sourceFingerprint,
	title: "html-collab — How to use it",
	actors,
	ops,
};

const reviewHtml = createReviewHtmlFromParts(sourcePayload, state);
await writeFile(outputPath, reviewHtml, "utf8");

console.log(`Built ${outputPath}`);
console.log(`  ${ops.length} ops · ${Object.keys(actors).length} actors`);

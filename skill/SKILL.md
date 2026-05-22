---
name: html-collab
description: Process review comments from portable html-collab files. Use when a user provides or mentions a `.review.html` file produced by `html-collab`, asks to summarize review feedback, revise the underlying report, merge reviewed copies, extract an agent brief, or unwrap final HTML.
---

# html-collab

Use the `html-collab` CLI as the source of truth for parsing, merging,
extracting, wrapping, and unwrapping reviewable HTML files. Do not scrape the
browser UI or reimplement the embedded operation-log format.

## Core Commands

```sh
html-collab wrap report.html --out report.review.html
html-collab merge glen.review.html maya.review.html --out merged.review.html
html-collab extract merged.review.html --format agent --out agent-plan.md
html-collab extract merged.review.html --format markdown --out review-brief.md
html-collab extract merged.review.html --format json --out review-bundle.json
html-collab skill --out html-collab.SKILL.md
html-collab unwrap merged.review.html --out report.final.html
html-collab unwrap merged.review.html --apply-edits --out report.final.html
```

## Workflow

1. If the user gives reviewed copies from multiple reviewers, run `merge` first.
2. Run `extract --format agent` when the user wants you to revise or act on
   the review.
3. Run `extract --format json` when you need deterministic thread/message data.
4. Run `extract --format markdown` for a human-readable brief.
5. Summarize unresolved threads by section or anchor.
6. Summarize suggested edits separately from comments, including edit IDs,
   status, replacement text, and whether they are accepted, rejected, or deleted.
7. Separate direct edits from questions that need author judgement.
8. If asked to revise the report, unwrap or locate the source HTML, apply edits
   to the clean report, then wrap the revised report for another review round.
9. When the review cycle is finished, run `unwrap --apply-edits` if accepted
   tracked edits should be applied to the final HTML, otherwise run `unwrap`
   to recover the original clean HTML.

## Semantics

Suggested edits are deterministic instructions. Open or accepted suggested
edits can be applied directly when the user asks for revision. Rejected or
deleted edits should not be applied unless the user explicitly asks.

Comments are reviewer intent. Treat comments as questions unless the anchor and
message make a simple edit obvious. For example, a comment anchored to `1` that
says `Make this 5` can be treated as an inferred replacement from `1` to `5`,
but report it as inferred and preserve the thread ID.

Resolved comments should not drive new edits unless the user explicitly asks to
revisit resolved feedback. Deleted comments/replies should be ignored except
when auditing review history.

## Response Shape

When summarizing review feedback, report:

- Open thread count and resolved thread count.
- Suggested edit counts by status.
- Reviewers.
- Thread IDs, edit IDs, and any review-file links from the extracted brief.
- Direct revisions the agent can make.
- Author decisions that block revision.
- Any unanchored or invalid operations from the extracted bundle.

Keep comments as review state. Do not silently transform comments into document
edits unless the user asks you to revise the underlying report.

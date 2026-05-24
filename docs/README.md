# html-collab Project Notes

This is the durable project reference for `html-collab`: the mission, product
principles, and working flows. It is the source of truth outside the main
README.

## Mission

AI-generated HTML should be as reviewable as a document without losing what
makes it useful: rich layout, bespoke presentation, and single-file portability.

`html-collab` turns a normal HTML report into a transferable review artifact.
Reviewers can open the file, comment, reply, suggest edits, resolve threads,
save their feedback locally, merge parallel copies, export a review brief, and
unwrap the final result back to clean HTML.

## Product Promise

One polished HTML file that can travel like an attachment, collect review
feedback like a collaborative document, and merge parallel reviews without
losing anyone's work.

## Principles

- Keep the artifact as one transferable `.html` file.
- Preserve the original report as the main visual experience.
- Store review state inside the file, not in a separate service.
- Work offline without accounts, servers, or live sync.
- Merge parallel review copies deterministically by operation ID.
- Keep comments, edits, and exports inspectable by humans and agents.
- Treat live sync, auth, audit trails, and tamper detection as optional layers,
  not requirements for the local-first workflow.
- Keep the agent skill thin: it should call the CLI, not reimplement the file
  format.

## Current Release Surface

The current package ships:

- `wrap`, `unwrap`, `merge`, `extract`, and `skill` CLI commands.
- A browser runtime embedded into each wrapped review file.
- Text comments, replies, resolve/reopen, edit/delete, and history-preserving
  thread reduction.
- Suggested edits for replace, insert, and delete, with accept/reject controls.
- Browser autosave when the reviewer grants local file-write permission.
- Markdown, JSON, plain-text, and agent-oriented review extraction.
- An agent skill that explains how to extract, revise, wrap, and finalize
  reviewed HTML files.

## File Model

A wrapped file contains three parts:

```text
report.review.html
  review shell
    toolbar
    comment panel
    merge tray
    save and export logic
  embedded source report
    original HTML payload
    loaded into a same-origin iframe
  embedded review state
    docId
    sourceFingerprint
    actors
    append-only ops
```

The original report is loaded into an iframe so its CSS and JavaScript stay
isolated from the review UI. Review data is stored in inert JSON script blocks:
`html-collab-source` for the source HTML payload and `html-collab-state` for
the operation log.

Core operations include:

- `comment.create`, `comment.edit`, `comment.delete`
- `reply.create`, `reply.edit`, `reply.delete`
- `thread.resolve`, `thread.reopen`
- suggested-edit operations and review decisions

The reducer deduplicates operations by `opId`, applies edits and state changes
by clock/time/ID order, preserves tombstoned history, and surfaces invalid ops
instead of throwing away the whole file.

## Creation Flow

Create the source HTML first, then wrap it:

```sh
html-collab wrap report.html --out report.review.html
```

The generated `report.review.html` is the file reviewers open, annotate, save,
send onward, and merge.

Best input:

- One HTML file.
- CSS already inline.
- Images either inline as data URLs or remote URLs the organisation accepts.
- No dependency on sibling files.

If the source links to other local `.html` pages, the wrapper warns and adds a
notice inside the review file. Only the input page is wrapped and commentable;
linked pages are not bundled.

The project currently optimises for AI-generated single-file HTML. A static
no-code wrapper can be added later without changing the file format.

## Review And Save Flow

1. Reviewer opens `report.review.html` in a browser.
2. They set or confirm their display name.
3. They select text and add a comment or suggested edit.
4. Other reviewers can reply in the same thread.
5. Threads can be resolved, reopened, edited, or deleted.
6. When the browser asks where to save, the reviewer chooses a local review
   file. After that permission is granted, comments and edits autosave back
   into that local file.

Browsers cannot silently overwrite arbitrary files. In browsers with the File
System Access API, the runtime asks for local file-write permission once and
then autosaves to the chosen `.review.html` file. If permission is unavailable
or declined, the reviewer can still keep working in the open tab until they
choose a save path.

## Merge Flow

Parallel review is supported by merging operation logs, not whole-file edits:

```sh
html-collab merge glen.review.html maya.review.html --out merged.review.html
```

Merge steps:

1. Read each input review file.
2. Extract each `html-collab-state` block.
3. Reject files with a different `docId`.
4. Union actors and operations by stable ID.
5. Reduce the merged operation set deterministically.
6. Write a new single-file review artifact.

No input file is mutated. The merged output is another `.review.html` file that
contains the combined feedback.

## Extract Flow

Use `extract` to turn review state into a human or agent handoff:

```sh
html-collab extract report.review.html --format markdown --out review-brief.md
html-collab extract report.review.html --format json --out review-bundle.json
html-collab extract report.review.html --format text
html-collab extract report.review.html --format agent --out agent-plan.md
```

The Markdown brief is for authors and chat-based agent workflows. The JSON
bundle preserves the deterministic thread, message, anchor, edit, and
invalid-operation data for automated workflows. The agent format groups review
work into direct revisions and author decisions.

## Agent Revision Flow

The agent should consume structured output from the CLI rather than scrape the
browser UI:

1. Run `html-collab extract` on the reviewed file.
2. Summarise unresolved work by section and work type.
3. Separate direct edits from author decisions.
4. Ask only the blocking questions.
5. Apply approved revisions to the source report.
6. Wrap the revised report for another review round, or unwrap it when review
   is finished.

```sh
html-collab wrap revised-report.html --out revised-report.review.html
html-collab unwrap revised-report.review.html --out revised-report.final.html
```

The skill should improve the workflow, but the CLI remains the source of truth
for parsing, wrapping, merging, extracting, and unwrapping.

## Finalize Flow

When review is done, unwrap the clean source HTML:

```sh
html-collab unwrap report.review.html --out report.final.html
```

By default, `unwrap` removes the review shell and writes the embedded source
HTML. Accepted suggested edits can be applied explicitly:

```sh
html-collab unwrap report.review.html --apply-edits --out report.final.html
```

Accepted edits fail instead of guessing when the target is ambiguous. Comments
remain review state; they are not silently transformed into document changes.

## Trust Model

The current product assumes a trusted-file workflow: anyone with the file can
read it, annotate it, save it, merge it, and forward it.

Current scope:

- Comments are stored as JSON data, not executable JavaScript.
- Comment bodies render as text or sanitized markup.
- Imported review state is parsed as data.
- `docId` prevents accidental merges between unrelated documents.

Out of scope for the current release:

- Organisation permissions.
- SSO-backed identity.
- Legally defensible audit logs.
- Cryptographic tamper detection.
- Real-time multiplayer presence.

## Potential Roadmap

- Region comments for charts, images, and arbitrary visual areas.
- Stronger anchor recovery and clearer unanchored-thread handling.
- Static no-code wrapper for users who do not want a CLI.
- Better mobile and narrow-screen review ergonomics.
- Optional live sync, auth, audit, and tamper-detection layers for organisations
  that need them.

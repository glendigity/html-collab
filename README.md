<p align="center">
  <img src="https://raw.githubusercontent.com/glendigity/html-collab/main/assets/logo.svg" alt="html-collab" width="200">
</p>

<h1 align="center">html-collab</h1>

<p align="center">
  <strong>AI tools make pretty HTML reports. They're hard to give feedback on.</strong><br>
  html-collab wraps any single-file HTML report in a review layer. Comment,
  suggest edits, reply, resolve — all in the file itself. Then either paste a
  brief back to the AI that wrote it, or send the file to your team and merge
  their reviews.<br>
  One <code>.html</code> file. No server. No account.
</p>

<p align="center">
  <a href="https://github.com/glendigity/html-collab/actions"><img alt="CI" src="https://github.com/glendigity/html-collab/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/glendigity/html-collab/blob/main/LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
</p>

<p align="center">
  <strong>100% coded by GPT-5.5 and Opus 4.7, with minimal oversight.</strong><br>
  Use at your own risk.
</p>

## Why this exists

AI tools generate beautiful single-file HTML reports. The moment you want
feedback on one, you're stuck: email it as an attachment and lose all
comments, or paste it into a doc and lose the layout. html-collab keeps the
file as a single `.html` you can move anywhere, and adds the behaviours you
expect from Word and Docs — plus a clean structured export so the next
revision can be done by a human or an agent.

<p align="center">
  <a href="https://glendigity.github.io/html-collab/examples/tour.review.html"><img src="https://raw.githubusercontent.com/glendigity/html-collab/main/assets/demo.gif" alt="Demo: open an AI-generated report, suggest an edit, leave a comment, export a brief to paste back into the AI" width="780"></a><br>
  <em>Mark up the report. Export a brief. Hand it back to the AI.</em><br>
  <a href="https://glendigity.github.io/html-collab/examples/tour.review.html"><strong>Open the guided tour →</strong></a>
</p>

## What you can do inside the file

- Highlight any text and press `c` to comment, or `e` to suggest an edit.
  Right-click works too.
- Reply to threads, resolve them, reopen them, delete them. History is kept.
- Suggested edits can be replacements, inserts, or deletions. Toggle between
  the tracked-change markup and a clean preview.
- Autosave back to the same local file when a Chromium browser asks for
  permission. Safari and Firefox keep changes in the tab until you export or
  save another way.

Send your edited file to anyone else with `html-collab merge` to combine
copies, and `html-collab extract` to pull out a brief.

---

## Quick Start

Requires Node.js 18+ and npm. No clone or install step is needed:

```sh
npx html-collab wrap report.html --out report.review.html
```

The command writes a self-contained review file and prints a short summary.
Small source files grow by roughly 90 KB because the review UI is embedded
inside the HTML.

Open `report.review.html` in your browser, mark it up, then export a brief:

```sh
npx html-collab extract report.review.html --format markdown --out brief.md
```

Use `npx html-collab ...` anywhere you see a bare `html-collab` command below.

## Two ways to use it

**Solo, with your AI.** Your AI just generated a report. You want it tighter.
Wrap it, mark up the bits you want changed, export the brief, paste the
brief back into the same chat. The AI redrafts. Re-wrap and go again if
you want another round.

```sh
npx html-collab wrap report.html --out report.review.html
# Open report.review.html in your browser. Mark it up. Click Brief.
npx html-collab extract report.review.html --format markdown --out brief.md
```

**With your team.** Send the wrapped file the way you'd send anything else.
Each reviewer marks up their own copy in the browser. Merge their copies
into one file. Export a brief at the end, or just keep working in the merged
file.

```sh
npx html-collab wrap report.html --out report.review.html
# Send the file. Reviewers open it, mark it up, send their copy back.
npx html-collab merge yours.review.html theirs.review.html --out merged.review.html
npx html-collab extract merged.review.html --format markdown --out brief.md
```

Same file. Same comments. Pick the loop that matches what you're doing.

## Try it without installing

[Open the guided tour](https://glendigity.github.io/html-collab/examples/tour.review.html) on GitHub
Pages. It's a designed page that walks through what html-collab does, with
example comments and edits already loaded. Highlight any text and press `c`
to add your own. Everything runs locally inside the file. Nothing leaves
your browser. To keep your changes, use a Chromium browser and choose a local
review file when Autosave asks where to save.

## CLI reference

```
html-collab --help
html-collab --version
html-collab wrap    <input.html>        --out <output.review.html>
html-collab unwrap  <input.review.html> [--apply-edits] --out <output.html>
html-collab merge   <a.review.html> <b.review.html> [more...] --out <merged.review.html>
html-collab extract <input.review.html> --format <markdown|json|text|agent> --out <brief>
html-collab skill   --out html-collab.SKILL.md
```

Use `npx html-collab ...` if you have not installed the CLI globally.
The browser Brief button exports markdown. For JSON, plain text, or an
agent-oriented plan, use `html-collab extract --format <json|text|agent>`.
The `skill` command writes an optional agent workflow file you can drop into
a local skills directory or paste into an agent prompt.

`unwrap --apply-edits` only applies suggested edits that have been accepted
in the browser. Open, rejected, and deleted edits are skipped and reported in
the command summary. Ambiguous edits fail instead of guessing, so the output
is never silently wrong.

## How it works

Comments and edits are stored as conflict-free operations embedded directly
in the HTML file. The review chrome lives in an iframe-isolated runtime so
it never touches the original report's styles or scripts. Two reviewers on
diverged copies merge deterministically by operation ID. The brief export
reads the same embedded log, so what an agent sees matches what the side
panel shows.

## Security model

A `.review.html` file is still an HTML file. Open review files only from
people or systems you trust; html-collab does not sanitize the original
report's scripts, forms, images, or links. The review layer stores comments
and edits in the local file and does not upload them anywhere, but the
browser behavior of the original HTML is still the original HTML's behavior.

For mission, principles, and workflows, see the
[project notes](https://github.com/glendigity/html-collab/blob/main/docs/README.md).
For a fresh external sanity check, use the
[independent user test prompt](https://github.com/glendigity/html-collab/blob/main/USER_TEST_PROMPT.md).

## Status

Working today:

- `wrap`, `unwrap`, `merge`, and `extract` CLI commands
- Comments, replies, resolve, reopen, delete (history preserved)
- Suggested edits — replace, insert, delete — with accept and reject
- Right-click menu and `c` / `e` keyboard shortcuts on selected text
- Replace suggestions toggle between tracked-change markup and a clean preview
- Autosave when a Chromium browser grants file-write permission
- Briefs with stable thread IDs, anchor offsets, and deep links back into
  the matching threads in the review file

On the roadmap: region comments, advanced anchor recovery, optional auth,
audit and tamper detection, optional live sync.

## Contributing

Issues and PRs welcome. See
[CONTRIBUTING.md](https://github.com/glendigity/html-collab/blob/main/CONTRIBUTING.md)
for what's in scope and the test expectations. For security vulnerabilities,
see
[SECURITY.md](https://github.com/glendigity/html-collab/blob/main/SECURITY.md).

## License

[MIT](https://github.com/glendigity/html-collab/blob/main/LICENSE)

# Contributing to html-collab

Thanks for considering a contribution. Issues and PRs are welcome.

## Project scope

html-collab is intentionally small. The mission is to let someone share an
HTML report and get real feedback on it without asking the reviewer to do
anything beyond opening a file. Anything that requires the recipient to
install software, create an account, visit a website, or wait on a server
works against that — receiving feedback shouldn't make the other person do
more work than they already are.

Bug fixes, reducer improvements, anchor recovery, accessibility, CLI
ergonomics, examples, and documentation are always welcome and don't need a
check-in first.

## Development setup

This project uses [Bun](https://bun.sh).

```sh
bun install
bun run verify
```

The CLI entry point is `src/cli.ts`. The embedded runtime that ships inside
`.review.html` files lives in `src/runtime/`. The reducer that applies and
merges review operations lives in `src/format/`.

## Testing expectations

PRs should include unit tests for new behaviour in the reducer or extractor,
and a fixture-based test for anything that changes the file format. Run
`bun run verify` before pushing; it type-checks, tests, builds the CLI, and
regenerates the checked-in examples.

## Commit and PR style

Keep commits focused. Use imperative present tense in commit messages
("Add region comments", not "Added region comments"). PR descriptions should
explain the motivation and any user-facing impact.

## Reporting security issues

Please do not file public issues for security vulnerabilities. See
[SECURITY.md](SECURITY.md).

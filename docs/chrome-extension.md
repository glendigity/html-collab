# Chrome Extension UX

This is the no-code front door for reviewers who receive a normal HTML file
and should not need Node, `npx`, Claude Code, or the `html-collab` CLI.

## Target Flow

1. Reviewer receives a single-file HTML report.
2. Reviewer opens the HTML file in Chrome.
3. Reviewer clicks the `html-collab` extension.
4. Extension opens an extension-owned review page for the current page.
5. Reviewer selects text, adds comments, and suggests edits.
6. The generated review shell keeps draft review state in the page while the
   tab is open.
7. Reviewer clicks `Export Review File`.
8. Extension downloads a portable reviewed HTML file that is easy to find,
   copy, attach, and send back.

The sender should not need the extension to inspect the returned file. The
exported artifact must remain the normal portable `html-collab` review shell
with embedded source HTML and embedded review state.

## MVP

The unpacked extension lives in `extension/` and is built with:

```sh
bun run build:extension
```

Load `extension/` from `chrome://extensions` with Developer Mode enabled.

## Detection

Do not rely on the file name or `.review.html` suffix to detect whether a page
is already an `html-collab` review artifact. Detection should inspect the page
content for the existing embedded source and state blocks:

- `script#html-collab-source`
- `script#html-collab-state`

If those blocks exist and parse as valid review data, the extension should
offer `Continue review`. Otherwise it should offer `Start review`.

## Extension States

Initial popup on a normal HTML page:

```text
html-collab

[Start review]
```

Popup after review mode starts:

```text
html-collab

Use the page toolbar to export.
[Show Downloads Folder]
```

Popup on an existing review artifact:

```text
html-collab

[Export Review File]
[Copy Brief]
[Show Downloads Folder]
```

If Chrome blocks extension access to local `file://` URLs, show a short
instruction to enable file access for the extension. Do not present this as a
generic error.

## Autosave

The MVP reuses the existing review-shell state model and export behavior. It
does not depend on writing back to the original local file. Extension-started
reviews run from `extension/review.html`, not the source page, so source-page
CSP cannot block the review runtime.

Persistent extension storage keyed by source fingerprint and tab/page identity
is still a TODO. That would protect the reviewer from losing work if they close
the tab before exporting or enabling autosave.

For exported portable files, the existing review-shell autosave can still run
after the reviewer opens the exported artifact and grants browser file-write
permission.

## Export

`Export Review File` is the primary completion action. It should:

- Generate the same portable review shell as `html-collab wrap`.
- Embed the original source HTML and the collected review state.
- Use a clear default filename such as `<original-name>.review.html`, while
  still treating the suffix as a convention rather than identity.
- Trigger a visible Chrome download or Save As prompt.
- Show a small confirmation with a `Show in Downloads` or equivalent affordance
  so the returned file is easy to find and attach.

## Technical Shape

The extension should be a thin UI around shared core code, not a second file
format implementation.

- Refactor wrapper creation into browser-safe core helpers.
- Keep CLI wrapping and extension export on the same review shell format.
- Replace Node-only helpers with browser equivalents:
  - `Buffer` to browser base64 helpers.
  - `node:crypto` hashing to `crypto.subtle.digest`.
  - `randomUUID` to `crypto.randomUUID`.
  - `path.basename` to filename parsing.
- Inject review controls into the current page only after the user clicks the
  extension.
- Store comments and edits as the existing append-only operation log.

## TODO

- Package and publish the extension after more manual Chrome testing.
- Add a polished install/update path outside the unpacked developer flow.
- Consider a persistent draft store keyed by source fingerprint if the user
  starts reviewing but closes the tab before exporting or enabling autosave.
- Defer merge support in the extension. Keep merge in the CLI for now; revisit
  extension merge after the start-review/export loop is working.

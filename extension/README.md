# html-collab Chrome Extension

This unpacked extension is the no-code review flow:

1. Open a normal single-file HTML report in Chrome.
2. Click the `html-collab` extension.
3. Click `Start review`.
4. Chrome opens an `html-collab` review page owned by the extension.
5. Comment or suggest edits in the generated review shell.
6. Use the in-page `Export Review File` button.
7. Send the downloaded HTML file back.

For local `file://` pages, Chrome requires a one-time permission:

1. Right-click the extension icon.
2. Choose `Manage Extension`.
3. Enable `Allow access to file URLs`.

Build from the repo root:

```sh
bun run build:extension
```

Then load `extension/` from `chrome://extensions` with Developer Mode enabled.
After rebuilding, click the extension's reload button on `chrome://extensions`
before testing the new bundle.

When review mode starts from an ordinary web page, the extension captures a
static snapshot of the current DOM, strips scripts, and adds a base URL so
relative assets still resolve. It then opens an extension-owned review page
with an external runtime script. This keeps source-page CSP and app scripts
from blanking or rerouting the embedded review iframe.

Merge support is intentionally deferred for the extension MVP. Use the CLI
merge command for now.

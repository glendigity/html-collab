# Multi-page tree link repro

This fixture reproduces the current `html-collab` limitation with generated
HTML projects that are a page tree instead of one standalone HTML file.

Run it from the repo root:

```sh
bun examples/repros/multi-page-tree/reproduce.ts
```

The script wraps `source/index.html` and `source/pages/chapter.html` into a
temporary review-only tree. It then verifies the warning and the broken
navigation target:

- `index.review.html` warns that only the top page is wrapped and commentable.
- `index.review.html` embeds a source link to `pages/chapter.html`.
- The generated reviewed page is `pages/chapter.review.html`.
- A browser click from `index.review.html` resolves to `pages/chapter.html`,
  which is missing in the review-only tree.

Manual check:

1. Run the script and open the printed `index.review.html` path.
2. Confirm the side panel warns that only this top page is wrapped and
   commentable.
3. Click **Open chapter page**.
4. The browser navigates to `pages/chapter.html`, not
   `pages/chapter.review.html`.

If the original source files are left beside the review files, the link opens
the unreviewed source page instead of staying in the review workflow.

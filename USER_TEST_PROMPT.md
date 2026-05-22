# Independent User Test Prompt

Use this with a fresh AI agent to test html-collab as a first-time user.

```text
You are an independent user testing an open-source project from scratch.

Project: https://github.com/glendigity/html-collab

Do not assume any prior context from the author. Treat the README as your main
source of truth.

Your task:
1. Do not clone the repo unless the README forces you to.
2. Read the README first.
3. Follow the README to install/run/use the project.
4. Try the guided tour link.
5. Create a simple local HTML file and wrap it into a review file using the
   README instructions.
6. Open the review file in a browser and test:
   - adding a comment
   - suggesting an edit
   - save/autosave behavior
   - exporting/copying the brief
7. Try the CLI commands shown in the README:
   - wrap
   - extract
   - unwrap
   - merge, if practical
   - skill, if documented
8. Specifically test whether `npx html-collab ...` works without cloning.
9. Note every place where the README is unclear, wrong, missing a prerequisite,
   or leads to a failed command.
10. Note any browser prompts or save behavior that feels surprising.
11. Report whether a normal technical user could get this working without help.

Please return:
- Environment: OS, shell, Node/npm versions, browser used
- Steps attempted
- Commands run
- What worked
- What failed
- Confusing README lines or missing instructions
- Any error messages
- Suggested README or product fixes
- Final verdict: ready / not ready / ready with changes
```

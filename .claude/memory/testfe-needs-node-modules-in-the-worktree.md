---
name: testfe-needs-node-modules-in-the-worktree
description: npm run testFe fails with "dayjs is not defined" in a git worktree until node_modules exists there, because tester.html asks vite for /node_modules/dayjs
metadata:
  type: project
---

In a git worktree (`.claude/worktrees/<name>/`) node resolves packages by walking up to the
main checkout's `node_modules`, so `tsc`, `tslint` and `vitest` all run without installing
anything. `npm run testFe` is the exception: `csvEditorHtml/test/tester.html` loads
`/node_modules/dayjs/dayjs.min.js` as a **classic script**, and vite serves that path from
the worktree root. Without a local `node_modules` the file 404s and every autoFill date test
dies with `ReferenceError: dayjs is not defined` — 72 failures that look like a regression
and are not one. (`vitest` still exits 0, so read the summary line, not the exit code.)

Cheapest fix on Windows, no second install:

```powershell
New-Item -ItemType Junction -Path "<worktree>\node_modules" -Target "<repo>\node_modules"
```

(`mkdir` the junction only when `<worktree>\node_modules` does not already exist — a vitest
run creates it holding just a `.vite` cache, and `New-Item` then refuses.) On macOS/Linux
the same with `ln -s`. `node_modules` is git-ignored, so this stays local to the worktree.

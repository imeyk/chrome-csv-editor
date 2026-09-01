---
name: web-store-version-bump
description: "Release rule for the Edit CSV extension now lives in the repo's CLAUDE.md — bump with `npm run bump`, which commits"
metadata: 
  node_type: memory
  type: project
  originSessionId: 77cc2ce4-3502-495d-8ed2-4888ce81809e
  modified: 2026-08-25T16:37:58.741Z
---

Release rules for `imeyk/chrome-csv-editor` ("Edit CSV", published on the Chrome Web Store) are written down in the repo itself: **`CLAUDE.md` → "Releasing to the Chrome Web Store"**, and in README's packaging section. Read those rather than trusting this note, which exists only to record the history behind them.

**Short version:** `npm run bump` bumps `manifest.json` **and commits it**; `npm run pack:chrome` refuses to package a `manifest.json` that differs from `HEAD` (`ALLOW_DIRTY_MANIFEST=1` to override for a throwaway build).

**Why the guard exists:** until 2026-08-25 `pack:chrome` bumped the patch version at *build* time, so the number lived only in the working tree. Four uploads went out whose bump was never committed — git recorded 0.1.0 → 0.1.3 while the Store was already at 0.1.7 — and the next upload was rejected. Fixed in PR #15 (version → 0.1.8) and PR #16 (the `bump` command + the guard). Published state after that work: 0.1.9.

**How to apply:** if the repo ever looks behind the published version again, jump past it with the explicit form (`npm run bump -- 0.2.0`) — `+1` from a stale number is still stale. And verify the version *inside the zip*, not just in the working tree.

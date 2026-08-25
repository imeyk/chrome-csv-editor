# Working in this repo

## What this is

A Chrome MV3 extension ("Edit CSV") forked from the VS Code extension `vscode-csv-edit`.
Two worlds live side by side:

- `extension/` — the MV3 part: service worker, host page, and pure helpers in
  `extension/lib/` (each with a `*.test.mjs` next to it).
- `csvEditorHtml/` — the editor itself, inherited from the VS Code fork. **Not** a module:
  `util.ts` / `io.ts` / `ui.ts` / `autoFill.ts` declare their helpers as top-level
  `function`/`var` and reach for each other as globals. Keep it that way — converting a
  file to a module breaks every other file and the test suite.
- `src/` — the original VS Code extension. Dead weight for the Chrome build, but it must
  keep type-checking (`npx tsc -p ./`).

`csvEditorHtml/out/*.js` is git-ignored, so a fresh clone has **no editor code** until
`npx tsc -p ./csvEditorHtml/tsconfig.json` has run. Loading the extension before that
opens a blank editor.

## Releasing to the Chrome Web Store

**Bump with `npm run bump`, which bumps `manifest.json` and commits it in one step.**

The Web Store refuses any upload whose version is not strictly greater than the published
one. The version used to be bumped inside `pack:chrome`, at build time, so the number lived
only in the working tree: uploads went out from versions that were never committed and the
repo silently drifted behind what was live — four patch versions, until an upload was
rejected. `pack:chrome` now refuses to package a `manifest.json` that differs from `HEAD`
(`ALLOW_DIRTY_MANIFEST=1` for a throwaway local build).

```bash
npm run bump                 # 0.1.9 -> 0.1.10, committed
npm run bump -- 0.2.0        # explicit, e.g. to get ahead of a published version
npm run pack:chrome          # dist/chrome-csv-editor/ + dist/chrome-csv-editor.zip
```

Then upload `dist/chrome-csv-editor.zip` **and push the bump commit**. If the repo ever
looks behind the published version again, jump straight past it with the explicit form —
`+1` from a stale number is still stale.

`package.json`'s own `version` (0.11.x) is the inherited VS Code extension version and has
nothing to do with the Store.

## Checks

```bash
npm run test:ext   # node: chunking, csv urls, save routing, encoding, delimiter detection
npm run testFe     # editor units in a real headless chromium (auto-fill, header guessing)
npm run lint       # tslint over both projects
npx tsc -p ./ && npx tsc -p ./csvEditorHtml/tsconfig.json
```

All four are green on `master` — keep them that way. `testFe` needs its globals loaded as
classic scripts from `csvEditorHtml/test/tester.html`; that is why the config uses
`browser.testerHtmlPath` and not a setup file.

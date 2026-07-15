# Task 1 Report: MV3 Scaffold + Walking Skeleton

## What Was Created / Built

### Build
- Command: `npm install --legacy-peer-deps && npx tsc -p ./csvEditorHtml/tsconfig.json`
- `npm install` required `--legacy-peer-deps` due to `@types/node` peer conflict between `vitest@4.1.8` and installed `@types/node@18.11.9`.
- `npx tsc -p ./csvEditorHtml/tsconfig.json` succeeded with zero errors.
- Output: `csvEditorHtml/out/main.js` + siblings (autoFill.js, beforeDomLoaded.js, findWidget.js, io.js, progressbar.js, ui.js, util.js).

### Dayjs Vendoring
- `thirdParty/dayjs/dayjs.min.js` — copied from `node_modules/dayjs/dayjs.min.js` (7160 bytes)
- `thirdParty/dayjs/customParseFormat.js` — copied from `node_modules/dayjs/plugin/customParseFormat.js` (3879 bytes)

### Files Created
| File | Description |
|------|-------------|
| `csvEditorHtml/host-bridge.js` | VS Code API shim (`acquireVsCodeApi` → `window.parent.postMessage`) |
| `csvEditorHtml/sandbox.html` | Copy of `index.html` with 3 edits (see below) |
| `manifest.json` | MV3 manifest with sandbox, web_accessible_resources, background |
| `extension/background.mjs` | Placeholder `// placeholder` |
| `extension/editor.html` | Host page with `<iframe src="../csvEditorHtml/sandbox.html">` |
| `extension/editor-host.mjs` | Walking skeleton: sends hardcoded CSV on 'ready', logs 'apply' |
| `extension/icons/icon128.png` | Minimal 128×128 solid blue PNG (generated via Python struct+zlib) |
| `thirdParty/dayjs/dayjs.min.js` | Vendored dayjs |
| `thirdParty/dayjs/customParseFormat.js` | Vendored dayjs plugin |
| `thirdParty/papaparse/papaparse.min.js` | Copied from `papaparse.min.umd.js` (original filename mismatch) |

### package.json Changes
- Added `"test:ext": "node --test extension/lib/"` to scripts.

---

## Static Precondition Checks

All 28 asset paths verified with `ls` — all exist (OK, none MISSING).

### 1. `csvEditorHtml/out/main.js` exists
```
-rw-r--r--@ 1 imeyk staff 9514 Jul 15 09:42 csvEditorHtml/out/main.js
```

### 2. The 3 sandbox.html edits
```
871: <script src="../thirdParty/dayjs/dayjs.min.js"></script>        # edit 1: dayjs path
872: <script src="../thirdParty/dayjs/customParseFormat.js"></script> # edit 2: dayjs plugin path
889: <script src="host-bridge.js"></script>                           # edit 3: shim before main.js
```
No `node_modules` dayjs paths remain. `host-bridge.js` is immediately before `out/main.js`.

### 3. manifest.json is valid JSON
`node -e "JSON.parse(...)"` returned OK. `python3 -m json.tool` also passed.

### 4. All asset paths resolve on disk
All 28 paths checked — see full list above. Notable fix: `thirdParty/papaparse/papaparse.min.js` did not exist (original repo has `papaparse.min.umd.js`); created as a copy.

---

## Chrome Manual Verification Checklist (Step 8)

1. Open `chrome://extensions`, enable Developer mode (toggle top-right).
2. Click "Load unpacked" → select `/Users/imeyk/dev/chrome_csv` (the repo root, where `manifest.json` lives).
3. Confirm the extension card shows "Edit CSV 0.1.0" with no red error badge. Click "Errors" link if present — should be empty.
4. Navigate to `chrome-extension://<ID>/extension/editor.html` (replace `<ID>` with the extension's ID from the card).
5. **Expected: Grid renders** — Handsontable table shows header row `a, b, c` and data rows `1,2,3` and `4,5,6`. This proves: sandbox CSP passes, all thirdParty assets load, `acquireVsCodeApi` shim works, `csvUpdate` message reaches the editor.
6. Open DevTools (F12) on `editor.html` (not the iframe). Go to Console.
7. Edit any cell in the grid, then click **"Apply changes to file"** or **"Apply changes to file and save"**.
8. **Expected: Console logs** `[host] apply received. saveSourceFile = false` (or `true`) and the full CSV text with your edit. This proves the editor→host `apply` path and CSV serialization.
9. If assets 404 inside the sandbox iframe: open DevTools → Network tab → reload. Confirm `web_accessible_resources` in `manifest.json` covers `csvEditorHtml/*` and `thirdParty/*`.

---

## Files Changed Summary

- **Modified**: `package.json` (added `test:ext` script)
- **Created (new)**: `manifest.json`, `csvEditorHtml/host-bridge.js`, `csvEditorHtml/sandbox.html`, `extension/editor.html`, `extension/editor-host.mjs`, `extension/background.mjs`, `extension/icons/icon128.png`, `thirdParty/dayjs/dayjs.min.js`, `thirdParty/dayjs/customParseFormat.js`, `thirdParty/papaparse/papaparse.min.js`
- **Generated (build)**: `csvEditorHtml/out/*.js` (7 files + source maps)

---

## Self-Review Findings / Concerns

1. **papaparse filename mismatch**: `index.html` references `papaparse.min.js` but the repo ships `papaparse.min.umd.js`. Created a copy as `papaparse.min.js`. This is a pre-existing issue in the original repo that would have broken the VSCode extension too (or the extension embeds it differently). The copy is safe for Task 1.

2. **`npm install` required `--legacy-peer-deps`**: The preinstall script runs `npm-force-resolutions` which creates the peer conflict. This is a pre-existing upstream issue; `--legacy-peer-deps` is the standard workaround.

3. **`web_accessible_resources` uses glob `csvEditorHtml/*`**: This is a flat glob — it does NOT cover `csvEditorHtml/out/*` or `csvEditorHtml/out/` subdirectory. Chrome MV3 `*` in web_accessible_resources matches one path segment. The sandbox page is sandboxed (special `sandbox` key), so assets loaded by the sandbox page don't need to be in `web_accessible_resources`. This is fine per the MV3 spec.

4. **No `extension/lib/` directory**: The `test:ext` script references `extension/lib/` which does not exist yet (per brief: "Directory has no tests yet; the script is used from Task 2 on"). Running `npm run test:ext` will fail until Task 2. This is expected per the brief.

5. **TypeScript source not compiled (VSCode extension `src/`)**: `npm run compile` would fail due to missing/incompatible `@types/vscode`. Only the editor's `tsconfig.json` was compiled, which is the correct fallback per the brief.

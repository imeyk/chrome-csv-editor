# Chrome CSV Editor — Design

**Date:** 2026-07-15
**Status:** Approved (design), pending spec review
**Repo:** `imeyk/chrome-csv-editor` (fork of `janisdd/vscode-edit-csv`, upstream kept for updates)

## Goal

A Chrome extension (Manifest V3) that opens and edits CSV files using the
edit-csv editor (the `csvEditorHtml` web app from `vscode-edit-csv`), fully
client-side and offline. No file is uploaded anywhere; all processing happens
in the browser.

## Approach

Fork `janisdd/vscode-edit-csv` and **reuse the `csvEditorHtml` folder as-is** —
the complete edit-csv UI: Handsontable 6.x, PapaParse (with the project's comment-row
patches), dayjs, big.js, regression-js. All MIT-licensed.

Drop the VS Code bridge (webview `postMessage` ↔ extension host that reads/writes
the file) and replace it with a thin **Chrome host layer**. Upstream `csvEditorHtml`
is touched as little as possible so we can keep pulling updates.

## Launch mechanisms

| Mechanism | Status | How |
|---|---|---|
| Extension icon → file picker / drag-drop | Base (always works) | Open editor page with `<input type=file>` + drag-drop |
| Context menu on `.csv` links | Yes | `chrome.contextMenus` → fetch content → open in editor |
| Intercept `file://….csv` | Yes (with caveat) | Requires "Allow access to file URLs"; extension intercepts navigation to `*.csv` and redirects to the editor |
| Double-click file in Finder | Via the above | User sets Chrome as the default app for `.csv` (one-time OS setting); double-click opens `file://…` in Chrome → the `file://` interceptor handles it. No separate code. |
| Downloads watcher badge/notification | Optional (phase 2) | `chrome.downloads` watches for finished `.csv`; badge/notification "Open in CSV editor" |

**User one-time setup for the `file://` path** (documented in README):
1. Set Chrome as the default OS app for `.csv` (only needed for the Finder double-click flow).
2. Enable "Allow access to file URLs" for the extension in `chrome://extensions`.

## Save behavior

- **File System Access API** — overwrite the same file in place when a handle is
  available (files opened via the picker or drag-drop).
- **Fallback: download** a new file when no handle is available (`file://`
  interception, context menu).

## Architecture (Manifest V3)

The editor UI (`index.html`) contains **81 inline event-handler attributes**
(`onclick=`, `onmousedown=`, …). MV3 extension-page CSP is `script-src 'self'`
and forbids `unsafe-inline` for scripts, so these handlers would be blocked.
Rewriting all 81 defeats the "minimal edits / easy upstream merges" goal.
Solution: run the editor inside a **sandboxed iframe**
(`content_security_policy.sandbox`, which *does* allow inline), driven by a
privileged host page.

- **`csvEditorHtml/sandbox.html`** — a copy of `csvEditorHtml/index.html` living
  in the same folder so its relative paths (`out/*.js`, `../thirdParty/*`, `./main.css`)
  resolve unchanged. Two edits only: (1) add `<script src="host-bridge.js">` right
  before `out/main.js`; (2) repoint the two dayjs `<script>` tags to a vendored copy.
  The editor's TypeScript is **not modified**.
- **`csvEditorHtml/host-bridge.js`** — defines `window.acquireVsCodeApi()` returning
  a shim whose `postMessage(msg)` forwards to `window.parent` (the host page). The
  editor's own code (`main.ts`) then treats the shim as the VS Code API: it sends
  `{command:'ready'}` and `{command:'apply', csvContent, saveSourceFile}`; inbound
  `{command:'csvUpdate', csvContent:{text,sliceNr,totalSlices}}` is delivered by the
  host via `window.postMessage` and picked up by the editor's existing
  `handleVsCodeMessage` listener. No editor internals change.
- **`extension/editor.html` + `editor-host.js`** — privileged chrome-origin host page.
  Embeds `<iframe src="../csvEditorHtml/sandbox.html">`. Owns file loading (picker,
  drag-drop, `file://` fetch, context-menu payload), chunks CSV into `csvUpdate`
  messages to the iframe, receives `apply`, and routes saving to File System Access
  (overwrite) or download (fallback). Has `chrome.*` access.
- **`extension/background.js`** (service worker) — context menu, `webNavigation`
  interception of `file://….csv`, optional downloads watcher.
- **`manifest.json`** — MV3; permissions `contextMenus`, `webNavigation`,
  `downloads` (optional); `content_security_policy.sandbox` for the sandbox page;
  `web_accessible_resources` exposing the sandbox + assets; file-URL access.

## Build

`csvEditorHtml/out/*.js` is **not committed** — it must be built.

- `npm install` — restores dev deps (TypeScript) and `dayjs` (loaded from
  `node_modules`, not vendored in `thirdParty`).
- `npm run compile` (or `tsc -p ./csvEditorHtml/tsconfig.json`) — compiles the
  editor TS to `csvEditorHtml/out/*.js`.
- Vendor `dayjs.min.js` + `customParseFormat.js` into `thirdParty/dayjs/` and point
  `sandbox.html` at them so the packed extension has no `node_modules` dependency.

## Repository strategy

- Fork lives at `imeyk/chrome-csv-editor`; `upstream` = `janisdd/vscode-edit-csv`.
- New Chrome-specific code under a top-level `extension/` folder.
- `csvEditorHtml` reused with minimal edits to ease upstream merges.

## Risks (validate during implementation)

- **Sandbox iframe + bridge round-trip** — the whole architecture rests on the
  sandboxed editor loading under the sandbox CSP, the `acquireVsCodeApi` shim
  reaching the parent, and a CSV round-trip (load → edit → apply) working. Prove
  this first with a walking-skeleton spike (Task 1) before building launch mechanisms.
- **`file://….csv` navigation vs auto-download** — Chrome may download `.csv`
  instead of navigating. If so, intercept at the navigation level
  (`webNavigation`/redirect) rather than at render time. Confirm with a spike.
- **File System Access API in a chrome-extension page** — confirm
  `showSaveFilePicker`/handle write works from the host page; if unavailable in a
  given context, fall back to download.
- **Handsontable 6.x license** — the last MIT-licensed line; pin the version.

## Testing

- Manual scenarios per launch mechanism and per save path.
- Smoke test of parse/serialize round-trips across several CSVs: different
  delimiters, quoting, unicode, and large files.

## Out of scope (v1)

- Downloads watcher (phase 2, optional).
- Any non-CSV formats.
- Cloud sync / server-side anything.

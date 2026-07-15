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

- **`editor.html` + adapted `csvEditorHtml`** — the editor UI.
- **`host-bridge.js`** — replaces the VS Code bridge: feeds file content into the
  interface `csvEditorHtml` expects, captures the serialized CSV on save, routes it
  to File System Access or download.
- **`background.js`** (service worker) — context menu, `webNavigation` interception
  of `file://….csv`, optional downloads watcher.
- **`manifest.json`** — permissions: `contextMenus`, `webNavigation`,
  `downloads` (optional), plus file-URL access.

## Repository strategy

- Fork lives at `imeyk/chrome-csv-editor`; `upstream` = `janisdd/vscode-edit-csv`.
- New Chrome-specific code under a top-level `extension/` folder.
- `csvEditorHtml` reused with minimal edits to ease upstream merges.

## Risks (validate during implementation)

- **`file://….csv` navigation vs auto-download** — Chrome may download `.csv`
  instead of navigating. If so, intercept at the navigation level
  (`webNavigation`/redirect) rather than at render time. Confirm with a spike.
- **Handsontable 6.x license** — the last MIT-licensed line; pin the version.
- **File System Access API on a `file://` origin** — confirm availability; if
  unavailable in that context, fall back to download.

## Testing

- Manual scenarios per launch mechanism and per save path.
- Smoke test of parse/serialize round-trips across several CSVs: different
  delimiters, quoting, unicode, and large files.

## Out of scope (v1)

- Downloads watcher (phase 2, optional).
- Any non-CSV formats.
- Cloud sync / server-side anything.

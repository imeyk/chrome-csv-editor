# Edit CSV — Chrome Extension

A Chrome MV3 extension that opens and edits CSV/TSV files in a sandboxed, Excel-like table editor. Everything runs **offline** — no data is uploaded anywhere.

---

## What It Does

- Opens CSV/TSV files in a full-featured table editor (powered by [edit-csv](https://edit-csv.net)).
- Intercepts navigations to `file://` CSV paths and redirects them into the editor.
- Supports drag-and-drop, the system file picker, right-click context menu on CSV links, and direct `file://` URL navigation.
- Saves back in-place (when a file handle is available) or falls back to a browser download.

---

## Build

```bash
# 1. Install dependencies
npm install

# 2. Compile the editor TypeScript
npx tsc -p ./csvEditorHtml/tsconfig.json

# dayjs is already vendored under thirdParty/ — no extra step needed.
```

If `npm run compile` fails because the VS Code extension `src/` does not type-check in your environment, compile only the editor with the command above.

---

## Load Unpacked in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** (toggle, top-right).
3. Click **Load unpacked** and select the repo root (the folder containing `manifest.json`).
4. The "Edit CSV" extension icon appears in the toolbar.

---

## Launch Methods

| Method | How |
|---|---|
| Toolbar icon | Click the Edit CSV icon → editor opens; use **Open CSV…** button to pick a file. |
| Drag and drop | Drag a `.csv` / `.tsv` file onto the editor tab. |
| Right-click a CSV link | Right-click any `.csv` or `.tsv` hyperlink on a page → **Open in CSV editor**. |
| Open a `file://` CSV | Type or paste a `file:///absolute/path/to/data.csv` in the address bar; the extension intercepts the navigation and loads it in the editor. |
| Finder double-click | Set Chrome as the default app for `.csv` files (see One-Time Setup below); double-clicking a CSV in Finder opens it directly in the editor. |

---

## One-Time Setup for `file://` Access

The extension must be allowed to read local files before `file://` interception works:

1. Go to `chrome://extensions`.
2. Find **Edit CSV** and click **Details**.
3. Enable **Allow access to file URLs**.

Without this toggle, Chrome will not grant the extension permission to fetch or intercept `file://` URLs.

### Optional: Make Chrome the Default App for `.csv` on macOS

To open CSV files from Finder in the editor automatically:

1. In Finder, right-click any `.csv` file → **Get Info** (or press `Cmd+I`).
2. Under **Open with**, select **Google Chrome**.
3. Click **Change All…** and confirm.

After this, double-clicking a `.csv` in Finder opens it in Chrome, which the extension intercepts and redirects into the editor.

> **Note:** The navigate-vs-download behavior of `file://` CSV URLs varies by Chrome version and platform. If the editor does not open, check that the "Allow access to file URLs" toggle is enabled and verify in `chrome://extensions` that no errors are shown in the extension's service worker. See the manual checklist in the project report for the full spike procedure.

---

## Saving

| How the file was opened | Save behavior |
|---|---|
| File picker (`Open CSV…`) or drag-and-drop on a supported browser | **In-place overwrite** using the File System Access API handle. |
| Right-click context menu, `file://` URL navigation, or drag-and-drop without a handle | **Download** — the browser saves an edited copy (filename prefixed or unchanged). |

---

## Everything Runs Offline

The editor and all its assets are bundled in the extension package. No network requests are made except when you explicitly open a remote CSV URL via the context menu (which requires the remote server to permit the fetch).

---

## Known Limitations (v1)

- **Context menu on remote `.csv` links** may fail if the host server does not send permissive CORS headers, and the extension does not declare `host_permissions` for arbitrary origins. A CORS error will appear in the service worker console.
- **`file://` navigate-vs-download behavior** is verified per Chrome version. On some builds Chrome may download the file instead of navigating, in which case the `webNavigation.onBeforeNavigate` interceptor does not fire. A `chrome.downloads.onChanged` fallback (spike-contingent) is planned for v2.
- **No multi-tab sync** — editing the same file in two tabs simultaneously will result in the last save winning.
- **Non-CSV formats** (Excel, ODS, etc.) are not supported.

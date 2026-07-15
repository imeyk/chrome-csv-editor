# Chrome CSV Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Manifest V3 Chrome extension that opens and edits CSV files in the edit-csv editor (`csvEditorHtml`), fully offline, saving via File System Access with a download fallback.

**Architecture:** The unchanged edit-csv UI runs inside a **sandboxed iframe** (sandbox CSP allows its 81 inline handlers). A tiny `host-bridge.js` shim in the sandbox implements `acquireVsCodeApi()` and forwards the editor's `ready`/`apply` messages up to a privileged host page (`editor.html`). The host page loads file content (picker, drag-drop, `file://` fetch, context-menu payload), streams it into the iframe as `csvUpdate` slices, and on `apply` writes back via File System Access or triggers a download.

**Tech Stack:** Manifest V3, TypeScript (editor, already written — compiled with `tsc`), Handsontable 6.x + PapaParse (vendored in `thirdParty/`), ES-module host/background scripts, `node:test` for unit tests of pure logic.

## Global Constraints

- **Do NOT modify the editor's TypeScript** (`csvEditorHtml/*.ts`). The bridge is emulated so upstream (`janisdd/vscode-edit-csv`) stays mergeable. Allowed edits to `csvEditorHtml/`: add `sandbox.html` (copy of `index.html`), add `host-bridge.js`, add vendored `thirdParty/dayjs/`.
- **Manifest V3** only (Chrome no longer accepts MV2).
- **Editor pages must not rely on inline scripts** except inside the sandboxed page, whose CSP explicitly allows `'unsafe-inline'`/`'unsafe-eval'`.
- **Handsontable pinned to the vendored 6.x** already in `thirdParty/handsontable/` — do not upgrade.
- **Fully client-side / offline** — no network calls, no uploads.
- All new host/background/lib code is ES modules (`.mjs` for lib+background, `type="module"` scripts for pages). `host-bridge.js` is a plain classic script (must define `window.acquireVsCodeApi` before `out/main.js` runs).
- Git: work on branch `feat/chrome-extension`. Commit after each task. Every `git` command uses `git -C /Users/imeyk/dev/chrome_csv`.

---

### Task 1: Scaffold + walking skeleton (hardcoded CSV round-trip)

Proves the riskiest part first: the sandboxed editor loads under sandbox CSP, the `acquireVsCodeApi` shim reaches the host page, and a CSV round-trips (host → editor render → apply → host).

**Files:**
- Modify: `package.json` (add `test:ext` script; ensure `dayjs` present)
- Create: `thirdParty/dayjs/dayjs.min.js`, `thirdParty/dayjs/customParseFormat.js` (vendored copies)
- Create: `csvEditorHtml/host-bridge.js`
- Create: `csvEditorHtml/sandbox.html` (copy of `csvEditorHtml/index.html` with 3 edits)
- Create: `manifest.json`
- Create: `extension/editor.html`, `extension/editor-host.mjs`
- Create: `extension/icons/icon128.png` (any 128px placeholder PNG)

**Interfaces:**
- Produces: sandbox posts to parent `{command:'ready'}` and `{command:'apply', csvContent:string, saveSourceFile:boolean}`; host posts to iframe `{command:'csvUpdate', csvContent:{text:string, sliceNr:number, totalSlices:number}}`.

- [ ] **Step 1: Install deps and build the editor**

```bash
cd /Users/imeyk/dev/chrome_csv
npm install
npm run compile   # runs: tsc -p ./ && tsc -p ./csvEditorHtml/tsconfig.json
ls csvEditorHtml/out/main.js   # must exist after compile
```
Expected: `csvEditorHtml/out/main.js` and siblings (`io.js`, `ui.js`, …) exist. If `npm run compile` fails on the extension `src/` (VS Code types), compile only the editor: `npx tsc -p ./csvEditorHtml/tsconfig.json`.

- [ ] **Step 2: Vendor dayjs**

```bash
cp node_modules/dayjs/dayjs.min.js thirdParty/dayjs/dayjs.min.js
cp node_modules/dayjs/plugin/customParseFormat.js thirdParty/dayjs/customParseFormat.js
```
(Create `thirdParty/dayjs/` first if needed: `mkdir -p thirdParty/dayjs`.)

- [ ] **Step 3: Write the bridge shim** — `csvEditorHtml/host-bridge.js`

```js
// Emulates the VS Code webview API so the unmodified editor talks to our host page.
// Loaded as a classic script BEFORE out/main.js, which calls acquireVsCodeApi() at top level.
(function () {
  var api = {
    postMessage: function (msg) { window.parent.postMessage(msg, '*'); },
    getState: function () { return undefined; },
    setState: function () { /* no-op */ }
  };
  // main.ts: `if (typeof acquireVsCodeApi !== 'undefined') { vscode = acquireVsCodeApi() }`
  window.acquireVsCodeApi = function () { return api; };
})();
```

- [ ] **Step 4: Create the sandbox page** — copy `index.html` and apply exactly 3 edits

```bash
cp csvEditorHtml/index.html csvEditorHtml/sandbox.html
```
Then edit `csvEditorHtml/sandbox.html`:
1. Repoint the two dayjs tags — replace
   `<script src="../node_modules/dayjs/dayjs.min.js"></script>` with
   `<script src="../thirdParty/dayjs/dayjs.min.js"></script>` and
   `<script src="../node_modules/dayjs/plugin/customParseFormat.js"></script>` with
   `<script src="../thirdParty/dayjs/customParseFormat.js"></script>`.
2. Insert the shim immediately BEFORE `<script src="out/main.js"></script>`:
   `<script src="host-bridge.js"></script>`.

(No other changes. The editor keeps `initialConfig` undefined → uses its built-in defaults.)

- [ ] **Step 5: Write the manifest** — `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "Edit CSV",
  "version": "0.1.0",
  "description": "Open and edit CSV files with the edit-csv editor, fully offline.",
  "action": { "default_title": "Edit CSV" },
  "background": { "service_worker": "extension/background.mjs", "type": "module" },
  "permissions": ["contextMenus", "webNavigation", "downloads", "storage"],
  "icons": { "128": "extension/icons/icon128.png" },
  "content_security_policy": {
    "sandbox": "sandbox allow-scripts allow-forms allow-modals allow-popups; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; child-src 'self'"
  },
  "sandbox": { "pages": ["csvEditorHtml/sandbox.html"] },
  "web_accessible_resources": [
    {
      "resources": ["csvEditorHtml/*", "thirdParty/*", "extension/editor.html"],
      "matches": ["<all_urls>"]
    }
  ]
}
```
Note: `background.mjs` does not exist until Task 4. For Task 1, temporarily create an empty `extension/background.mjs` (`// placeholder`) so the extension loads; Task 4 fills it in. Create it now: `mkdir -p extension && printf '// placeholder\n' > extension/background.mjs`. Provide any 128×128 PNG at `extension/icons/icon128.png`.

- [ ] **Step 6: Write the host page** — `extension/editor.html`

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Edit CSV</title>
  <style>
    html, body { margin: 0; height: 100%; }
    #editor-frame { border: 0; width: 100%; height: 100vh; display: block; }
  </style>
</head>
<body>
  <iframe id="editor-frame" src="../csvEditorHtml/sandbox.html"></iframe>
  <script type="module" src="editor-host.mjs"></script>
</body>
</html>
```

- [ ] **Step 7: Write a minimal host controller** — `extension/editor-host.mjs`

```js
// Task 1 walking skeleton: send a hardcoded CSV on 'ready', log 'apply'.
const frame = document.getElementById('editor-frame');
const HARDCODED_CSV = 'a,b,c\n1,2,3\n4,5,6\n';

window.addEventListener('message', (e) => {
  if (e.source !== frame.contentWindow) return;
  const msg = e.data || {};
  if (msg.command === 'ready') {
    frame.contentWindow.postMessage(
      { command: 'csvUpdate', csvContent: { text: HARDCODED_CSV, sliceNr: 1, totalSlices: 1 } },
      '*'
    );
  } else if (msg.command === 'apply') {
    console.log('[host] apply received. saveSourceFile =', msg.saveSourceFile);
    console.log('[host] csv:\n' + msg.csvContent);
  }
});
```

- [ ] **Step 8: Load unpacked and verify the round-trip** (manual — Chrome extensions can't be driven headless here)

1. Open `chrome://extensions`, enable Developer mode, "Load unpacked" → select `/Users/imeyk/dev/chrome_csv`.
2. Confirm it loads with no errors (check the card + the service-worker "Errors" link).
3. Open the editor page directly: `chrome-extension://<ID>/extension/editor.html`.
Expected:
- The Handsontable grid renders with rows `a,b,c / 1,2,3 / 4,5,6` (proves sandbox CSP + asset loading + shim + `csvUpdate`).
- Edit a cell, click **Apply** (or **Apply & Save**). Open the host page's DevTools console.
Expected: `[host] apply received…` and the CSV text reflecting your edit (proves the editor→host `apply` path and CSV serialization).
- If assets 404 inside the sandbox, confirm `web_accessible_resources` covers `csvEditorHtml/*` and `thirdParty/*` and reload.

- [ ] **Step 9: Add the test script to package.json**

Add to `package.json` `"scripts"`: `"test:ext": "node --test extension/lib/"`. (Directory has no tests yet; the script is used from Task 2 on.)

- [ ] **Step 10: Commit**

```bash
git -C /Users/imeyk/dev/chrome_csv add -A
git -C /Users/imeyk/dev/chrome_csv commit -m "feat: MV3 sandbox scaffold + editor bridge walking skeleton"
```

---

### Task 2: Load real files (file picker + drag-drop, chunked)

Replaces the hardcoded CSV with real file content, streamed as slices.

**Files:**
- Create: `extension/lib/chunk.mjs`, `extension/lib/chunk.test.mjs`
- Modify: `extension/editor-host.mjs`
- Modify: `extension/editor.html` (add a slim toolbar with an "Open" button + drop hint)

**Interfaces:**
- Consumes: iframe messaging from Task 1.
- Produces: `partitionString(text, sliceSize) -> Array<{text,sliceNr,totalSlices}>`; `buildCsvUpdateMessages(text, sliceSize) -> Array<{command:'csvUpdate', csvContent:{text,sliceNr,totalSlices}}>`. Host holds `currentFile = { name:string, text:string, handle:FileSystemFileHandle|null }` (handle used in Task 3).

- [ ] **Step 1: Write the failing test** — `extension/lib/chunk.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partitionString, buildCsvUpdateMessages } from './chunk.mjs';

test('partitionString: single slice when under size', () => {
  assert.deepEqual(partitionString('abc', 10), [{ text: 'abc', sliceNr: 1, totalSlices: 1 }]);
});

test('partitionString: splits into ordered slices covering the whole string', () => {
  const slices = partitionString('abcdef', 2);
  assert.equal(slices.length, 3);
  assert.equal(slices.map(s => s.text).join(''), 'abcdef');
  assert.deepEqual(slices.map(s => s.sliceNr), [1, 2, 3]);
  assert.ok(slices.every(s => s.totalSlices === 3));
});

test('partitionString: empty string yields one empty slice', () => {
  assert.deepEqual(partitionString('', 5), [{ text: '', sliceNr: 1, totalSlices: 1 }]);
});

test('buildCsvUpdateMessages wraps slices in csvUpdate commands', () => {
  const msgs = buildCsvUpdateMessages('abcd', 2);
  assert.equal(msgs.length, 2);
  assert.deepEqual(msgs[0], { command: 'csvUpdate', csvContent: { text: 'ab', sliceNr: 1, totalSlices: 2 } });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:ext`
Expected: FAIL — `Cannot find module './chunk.mjs'`.

- [ ] **Step 3: Write minimal implementation** — `extension/lib/chunk.mjs`

```js
// Split a string into <=sliceSize chunks, mirroring the editor's csvUpdate protocol.
export function partitionString(text, sliceSize) {
  if (text.length === 0) return [{ text: '', sliceNr: 1, totalSlices: 1 }];
  const totalSlices = Math.ceil(text.length / sliceSize);
  const slices = [];
  for (let i = 0; i < totalSlices; i++) {
    slices.push({
      text: text.slice(i * sliceSize, (i + 1) * sliceSize),
      sliceNr: i + 1,
      totalSlices
    });
  }
  return slices;
}

export function buildCsvUpdateMessages(text, sliceSize) {
  return partitionString(text, sliceSize).map(csvContent => ({ command: 'csvUpdate', csvContent }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:ext`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire real files into the host** — replace `extension/editor-host.mjs`

```js
import { buildCsvUpdateMessages } from './lib/chunk.mjs';

const SLICE_SIZE = 1024 * 1024; // 1 MB, matches upstream
const frame = document.getElementById('editor-frame');
const openBtn = document.getElementById('open-btn');

let currentFile = { name: 'edited.csv', text: '', handle: null };
let editorReady = false;

function sendCurrentFile() {
  if (!editorReady) return;
  for (const msg of buildCsvUpdateMessages(currentFile.text, SLICE_SIZE)) {
    frame.contentWindow.postMessage(msg, '*');
  }
}

async function loadFromHandle(handle) {
  const file = await handle.getFile();
  currentFile = { name: file.name, text: await file.text(), handle };
  sendCurrentFile();
}

async function loadFromFile(file) {
  currentFile = { name: file.name, text: await file.text(), handle: null };
  sendCurrentFile();
}

openBtn.addEventListener('click', async () => {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'CSV', accept: { 'text/csv': ['.csv', '.tsv', '.txt'] } }]
      });
      await loadFromHandle(handle);
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return; // user cancelled
    }
  }
  // Fallback: hidden <input type=file>
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,.tsv,.txt,text/csv';
  input.addEventListener('change', () => { if (input.files[0]) loadFromFile(input.files[0]); });
  input.click();
});

// Drag-drop anywhere on the host page.
window.addEventListener('dragover', (e) => { e.preventDefault(); });
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  const item = e.dataTransfer.items && e.dataTransfer.items[0];
  if (item && item.getAsFileSystemHandle) {
    const handle = await item.getAsFileSystemHandle();
    if (handle && handle.kind === 'file') { await loadFromHandle(handle); return; }
  }
  const file = e.dataTransfer.files[0];
  if (file) await loadFromFile(file);
});

window.addEventListener('message', (e) => {
  if (e.source !== frame.contentWindow) return;
  const msg = e.data || {};
  if (msg.command === 'ready') {
    editorReady = true;
    sendCurrentFile();
  } else if (msg.command === 'apply') {
    console.log('[host] apply:', msg.saveSourceFile, msg.csvContent.length, 'chars');
  }
});
```

- [ ] **Step 6: Add the toolbar to `extension/editor.html`**

Replace the `<body>` contents with:
```html
<body>
  <div id="toolbar" style="font:13px system-ui;padding:6px 10px;background:#f3f3f3;border-bottom:1px solid #ddd">
    <button id="open-btn">Open CSV…</button>
    <span style="color:#666;margin-left:8px">or drag a .csv file here</span>
  </div>
  <iframe id="editor-frame" src="../csvEditorHtml/sandbox.html"
          style="border:0;width:100%;height:calc(100vh - 33px);display:block"></iframe>
  <script type="module" src="editor-host.mjs"></script>
</body>
```

- [ ] **Step 7: Manual verify**

Reload the unpacked extension, open `editor.html`, click **Open CSV…**, pick a real `.csv`.
Expected: its contents render in the grid. Repeat with a large (>1 MB) CSV — the progress bar advances across slices, then the grid renders. Drag-drop a `.csv` onto the page — same result.

- [ ] **Step 8: Commit**

```bash
git -C /Users/imeyk/dev/chrome_csv add -A
git -C /Users/imeyk/dev/chrome_csv commit -m "feat: load CSV files via picker and drag-drop"
```

---

### Task 3: Save — File System Access with download fallback

**Files:**
- Create: `extension/lib/save.mjs`, `extension/lib/save.test.mjs`
- Modify: `extension/editor-host.mjs`

**Interfaces:**
- Consumes: `currentFile.handle` (Task 2), `apply` message (Task 1).
- Produces: `resolveSaveTarget(handle) -> 'fsa' | 'download'`; `deriveDownloadName(name) -> string`.

- [ ] **Step 1: Write the failing test** — `extension/lib/save.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSaveTarget, deriveDownloadName } from './save.mjs';

test('resolveSaveTarget: fsa when a handle exists', () => {
  assert.equal(resolveSaveTarget({}), 'fsa');
});

test('resolveSaveTarget: download when no handle', () => {
  assert.equal(resolveSaveTarget(null), 'download');
});

test('deriveDownloadName: keeps a .csv name as-is', () => {
  assert.equal(deriveDownloadName('data.csv'), 'data.csv');
});

test('deriveDownloadName: falls back for empty name', () => {
  assert.equal(deriveDownloadName(''), 'edited.csv');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:ext`
Expected: FAIL — `Cannot find module './save.mjs'`.

- [ ] **Step 3: Write minimal implementation** — `extension/lib/save.mjs`

```js
export function resolveSaveTarget(handle) {
  return handle ? 'fsa' : 'download';
}

export function deriveDownloadName(name) {
  return name && name.trim() ? name : 'edited.csv';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:ext`
Expected: PASS (all chunk + save tests).

- [ ] **Step 5: Implement saving in the host** — in `extension/editor-host.mjs`

Add the import at top: `import { resolveSaveTarget, deriveDownloadName } from './lib/save.mjs';`

Add these functions:
```js
async function writeViaHandle(handle, text) {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

function downloadText(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = deriveDownloadName(name);
  a.click();
  URL.revokeObjectURL(url);
}

async function saveCsv(text) {
  if (resolveSaveTarget(currentFile.handle) === 'fsa') {
    try { await writeViaHandle(currentFile.handle, text); return; }
    catch (err) { console.warn('[host] FSA write failed, downloading instead', err); }
  }
  downloadText(currentFile.name, text);
}
```

Replace the `apply` branch of the message handler with:
```js
  } else if (msg.command === 'apply') {
    saveCsv(msg.csvContent);
  }
```

- [ ] **Step 6: Manual verify both save paths**

1. **FSA overwrite:** Open a `.csv` via **Open CSV…** (picker → handle). Edit a cell, click **Apply & Save**. Chrome may prompt once to allow editing; approve. Reopen the file on disk — it reflects the edit.
2. **Download fallback:** Load a `.csv` by drag-drop from a source without a handle, or via the `<input>` fallback. Click **Apply & Save**. A download of the edited CSV appears in Downloads.

- [ ] **Step 7: Commit**

```bash
git -C /Users/imeyk/dev/chrome_csv add -A
git -C /Users/imeyk/dev/chrome_csv commit -m "feat: save via File System Access with download fallback"
```

---

### Task 4: Context menu on .csv links + open with content

**Files:**
- Create: `extension/lib/csv-url.mjs`, `extension/lib/csv-url.test.mjs`
- Replace: `extension/background.mjs` (was placeholder)
- Modify: `extension/editor-host.mjs` (consume a pending payload on open)

**Interfaces:**
- Produces: `isCsvUrl(url) -> boolean`; `filenameFromUrl(url) -> string`. Background stores `{ name, text }` in `chrome.storage.session` under a generated key and opens `editor.html?src=session:<key>`.

- [ ] **Step 1: Write the failing test** — `extension/lib/csv-url.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCsvUrl, filenameFromUrl } from './csv-url.mjs';

test('isCsvUrl: true for .csv/.tsv, ignoring query and case', () => {
  assert.equal(isCsvUrl('https://x.com/a/data.CSV?v=1'), true);
  assert.equal(isCsvUrl('file:///Users/me/report.tsv'), true);
});

test('isCsvUrl: false for non-csv', () => {
  assert.equal(isCsvUrl('https://x.com/a.pdf'), false);
  assert.equal(isCsvUrl('https://x.com/csv-guide'), false);
});

test('filenameFromUrl: basename without query', () => {
  assert.equal(filenameFromUrl('https://x.com/a/data.csv?v=1'), 'data.csv');
  assert.equal(filenameFromUrl('file:///Users/me/r.tsv'), 'r.tsv');
});

test('filenameFromUrl: fallback when none', () => {
  assert.equal(filenameFromUrl('https://x.com/'), 'edited.csv');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:ext`
Expected: FAIL — `Cannot find module './csv-url.mjs'`.

- [ ] **Step 3: Write minimal implementation** — `extension/lib/csv-url.mjs`

```js
function pathname(url) {
  try { return new URL(url).pathname; } catch { return ''; }
}

export function isCsvUrl(url) {
  return /\.(csv|tsv)$/i.test(pathname(url));
}

export function filenameFromUrl(url) {
  const base = decodeURIComponent(pathname(url).split('/').pop() || '');
  return base || 'edited.csv';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:ext`
Expected: PASS (chunk + save + csv-url).

- [ ] **Step 5: Implement the service worker** — `extension/background.mjs`

```js
import { isCsvUrl, filenameFromUrl } from './lib/csv-url.mjs';

const MENU_ID = 'open-csv-in-editor';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Open in CSV editor',
    contexts: ['link'],
    targetUrlPatterns: ['*://*/*.csv', '*://*/*.tsv', 'file:///*.csv', 'file:///*.tsv']
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== MENU_ID || !info.linkUrl) return;
  await openUrlInEditor(info.linkUrl);
});

async function openUrlInEditor(url) {
  const res = await fetch(url);
  const text = await res.text();
  const key = 'payload_' + crypto.randomUUID();
  await chrome.storage.session.set({ [key]: { name: filenameFromUrl(url), text } });
  await chrome.tabs.create({ url: chrome.runtime.getURL(`extension/editor.html?src=session:${key}`) });
}

// Clicking the toolbar icon opens an empty editor (use Open CSV… inside).
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('extension/editor.html') });
});

export { openUrlInEditor }; // referenced by file:// interception in Task 5
```
Note: add `"tabs"` is not required for `chrome.tabs.create` with a URL, but `chrome.action.onClicked` requires no `default_popup` in the manifest `action` (already the case). Keep `storage` permission (already in manifest).

- [ ] **Step 6: Consume the pending payload on open** — in `extension/editor-host.mjs`

At the top (after `currentFile` is declared), add:
```js
async function loadPendingPayload() {
  const params = new URLSearchParams(location.search);
  const src = params.get('src');
  if (src && src.startsWith('session:')) {
    const key = src.slice('session:'.length);
    const stored = await chrome.storage.session.get(key);
    const payload = stored[key];
    if (payload) {
      currentFile = { name: payload.name, text: payload.text, handle: null };
      await chrome.storage.session.remove(key);
      sendCurrentFile();
    }
  }
}
loadPendingPayload();
```
(`sendCurrentFile()` is a no-op until `editorReady`; the `ready` handler already re-sends, so ordering is safe.)

- [ ] **Step 7: Manual verify**

Reload the extension. On any web page with a link ending in `.csv`, right-click the link → **Open in CSV editor**. A new tab opens `editor.html` and the linked CSV renders. (Save uses the download fallback — no handle for a remote URL.)

- [ ] **Step 8: Commit**

```bash
git -C /Users/imeyk/dev/chrome_csv add -A
git -C /Users/imeyk/dev/chrome_csv commit -m "feat: context menu opens .csv links in the editor"
```

---

### Task 5: file:// interception + setup docs

Intercept navigations to `file://….csv` and redirect them into the editor. Covers both "open a file:// CSV in Chrome" and "double-click when Chrome is the default `.csv` app". Includes the navigate-vs-download spike and README.

**Files:**
- Modify: `extension/background.mjs`
- Create: `README.md` (extension usage + one-time setup)

**Interfaces:**
- Consumes: `openUrlInEditor(url)` and `isCsvUrl(url)` from Task 4.

- [ ] **Step 1: Spike — does Chrome navigate to or download `file://….csv`?** (manual)

In `chrome://extensions`, open the extension's **Details** → enable **Allow access to file URLs**. In a normal tab, enter `file:///<absolute-path>/some.csv`.
- If Chrome **navigates** (shows the file / a blank page at that URL) → `webNavigation.onBeforeNavigate` fires → the redirect approach below works.
- If Chrome **downloads** it instead → `onBeforeNavigate` will still fire for the initiating navigation in most cases; if it does not, fall back to a `chrome.downloads.onChanged` watcher that, on a completed `.csv` download, calls `openUrlInEditor('file://'+item.filename)`.
Record which path applies; implement Step 2 accordingly.

- [ ] **Step 2: Add file:// interception to `extension/background.mjs`**

Append:
```js
// Redirect navigations to local .csv files into the editor.
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;              // top frame only
  if (!details.url.startsWith('file://')) return;
  if (!isCsvUrl(details.url)) return;
  chrome.tabs.update(details.tabId, {
    url: chrome.runtime.getURL(
      `extension/editor.html?src=fileurl:${encodeURIComponent(details.url)}`
    )
  });
}, { url: [{ schemes: ['file'] }] });
```
If the spike showed Chrome downloads instead of navigating, ALSO append:
```js
chrome.downloads.onChanged.addListener(async (delta) => {
  if (!delta.state || delta.state.current !== 'complete') return;
  const [item] = await chrome.downloads.search({ id: delta.id });
  if (item && isCsvUrl(item.filename)) {
    await openUrlInEditor('file://' + item.filename);
  }
});
```

- [ ] **Step 3: Handle the `fileurl:` source in the host** — in `extension/editor-host.mjs`

Extend `loadPendingPayload()` with, after the `session:` branch:
```js
  if (src && src.startsWith('fileurl:')) {
    const fileUrl = decodeURIComponent(src.slice('fileurl:'.length));
    const res = await fetch(fileUrl);
    const text = await res.text();
    currentFile = { name: fileUrl.split('/').pop() || 'edited.csv', text, handle: null };
    sendCurrentFile();
  }
```
(File-URL fetch requires the "Allow access to file URLs" toggle; saving uses the download fallback since no handle is available for an arbitrary path.)

- [ ] **Step 4: Manual verify**

With "Allow access to file URLs" enabled, open `file:///<path>/some.csv` in a tab. Expected: it redirects to `editor.html` and the CSV renders. (Optional) Set Chrome as the default macOS app for `.csv`, double-click a `.csv` in Finder → Chrome opens and redirects into the editor.

- [ ] **Step 5: Write `README.md`**

Include: what the extension does; **Build** (`npm install` → `npm run compile` → vendor dayjs — or note these are already built in the repo); **Load unpacked** steps; **Launch methods** (toolbar icon → Open CSV…, drag-drop, right-click a `.csv` link, open a `file://` CSV); **One-time setup** for the `file://` path: (1) enable "Allow access to file URLs" in the extension details, (2) optionally set Chrome as the default OS app for `.csv` to make Finder double-click work; **Saving** (in-place overwrite when opened via the picker/drag-drop with a handle; download otherwise); and the fact that everything runs offline with no uploads.

- [ ] **Step 6: Commit**

```bash
git -C /Users/imeyk/dev/chrome_csv add -A
git -C /Users/imeyk/dev/chrome_csv commit -m "feat: file:// interception + setup README"
```

---

## Out of scope (v1)

- Downloads-watcher badge/notification as a *proactive* prompt (the reactive `onChanged` fallback in Task 5 is only for the download-instead-of-navigate case).
- Non-CSV formats, cloud sync, config UI for read/write options (editor defaults are used).

## Notes for the implementer

- Chrome extension UI/integration cannot be driven headlessly here; those steps are **manual verification** in a real Chrome. Only the pure `extension/lib/*.mjs` modules have automated `node:test` coverage — keep new pure logic there so it stays testable.
- If `npm run compile` fails because the VS Code extension `src/` doesn't type-check in this environment, compile only the editor: `npx tsc -p ./csvEditorHtml/tsconfig.json`. The extension `src/` is not shipped.
- Keep edits to `csvEditorHtml/` limited to the three additive files/edits in Task 1 so upstream merges stay clean.

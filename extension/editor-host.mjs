import { buildCsvUpdateMessages } from './lib/chunk.mjs';
import { resolveSaveTarget, deriveDownloadName } from './lib/save.mjs';
import { decodeCsvBytes, encodeCsvText } from './lib/decode-text.mjs';
import { base64ToBytes } from './lib/base64.mjs';
import {
  AUTO, SUPPORTED_ENCODINGS, resolveReadEncoding, resolveWriteEncoding,
} from './lib/encodings.mjs';

const SLICE_SIZE = 1024 * 1024; // 1 MB, matches upstream
const frame = document.getElementById('editor-frame');
const openBtn = document.getElementById('open-btn');

// Load the sandboxed editor, passing the browser language so it can localize its
// UI (the sandbox has no chrome.i18n; see csvEditorHtml/i18n-editor.js).
const uiLang = (chrome.i18n.getUILanguage() || 'en').split('-')[0].toLowerCase();
frame.src = '../csvEditorHtml/sandbox.html?lang=' + encodeURIComponent(uiLang);

// `encoding`/`hadBom` are how the file was READ, so it can be written back the same way
// instead of silently becoming utf-8 (see extension/lib/decode-text.mjs). `bytes` is kept
// around so the editor's "Encoding" read option can decode the same file again.
let currentFile = {
  name: 'edited.csv', bytes: null, text: '', handle: null, encoding: 'utf-8', hadBom: false,
};
// What the user picked in the editor's read/write Encoding dropdowns.
// AUTO means: guess it on read, and write it back as it was read.
let readEncodingChoice = AUTO;
let writeEncodingChoice = AUTO;
let editorReady = false;

// Decode `bytes` with the current read choice and make them the open file.
// Opening a file resets the read choice — a new file deserves a fresh guess.
function openBytes(name, bytes, handle) {
  readEncodingChoice = AUTO;
  writeEncodingChoice = AUTO;
  setBytes(name, bytes, handle);
}

function setBytes(name, bytes, handle) {
  const decoded = decodeCsvBytes(bytes, resolveReadEncoding(readEncodingChoice));
  currentFile = {
    name, bytes, handle,
    text: decoded.text, encoding: decoded.encoding, hadBom: decoded.hadBom,
  };
  markLoaded();
  sendCurrentFile();
}

// Tell the editor which encodings to offer and what the current state is, so its
// dropdowns can show e.g. "Auto detect (windows-1251)".
function sendEncodingInfo() {
  if (!editorReady) return;
  frame.contentWindow.postMessage({
    command: 'encodingInfo',
    encodings: SUPPORTED_ENCODINGS,
    readEncoding: readEncodingChoice,
    writeEncoding: writeEncodingChoice,
    detectedEncoding: currentFile.encoding,
    // without the original bytes there is nothing to decode again
    canReread: currentFile.bytes !== null,
  }, '*');
}

async function loadPendingPayload() {
  const params = new URLSearchParams(location.search);
  const src = params.get('src');
  if (src && src.startsWith('session:')) {
    const key = src.slice('session:'.length);
    const stored = await chrome.storage.session.get(key);
    const payload = stored[key];
    if (payload) {
      await chrome.storage.session.remove(key);
      openBytes(payload.name, base64ToBytes(payload.bytesBase64), null);
    }
  }
  if (src && src.startsWith('fileurl:')) {
    const fileUrl = decodeURIComponent(src.slice('fileurl:'.length));
    try {
      // fetch() does not support the file: scheme in Chrome — use XHR, which
      // extensions may use to read file:// when "Allow access to file URLs" is on.
      // Read BYTES: a csv is not necessarily utf-8 (windows-1251 is very common).
      const bytes = await readBytesViaXhr(fileUrl);
      openBytes(fileUrl.split('/').pop() || 'edited.csv', new Uint8Array(bytes), null);
    } catch (err) {
      // Most likely cause: "Allow access to file URLs" is disabled, or the file was removed.
      console.warn('[host] failed to load file:// URL', err);
      // A banner beats alert() here: it stays on screen, it carries the button that opens
      // the setting, and it does not block the page behind a modal the user must dismiss.
      showFileAccessBanner(chrome.i18n.getMessage('fileOpenError'));
    }
  }
}
loadPendingPayload();

function sendCurrentFile() {
  if (!editorReady) return;
  for (const msg of buildCsvUpdateMessages(currentFile.text, SLICE_SIZE)) {
    frame.contentWindow.postMessage(msg, '*');
  }
  sendEncodingInfo();
}

// Read a URL as BYTES via XHR. Needed for file:// (fetch rejects the file scheme);
// bytes rather than text because decodeCsvBytes() has to guess the encoding.
function readBytesViaXhr(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.responseType = 'arraybuffer';
    xhr.onload = () => {
      // file:// responses report status 0 on success.
      if (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) resolve(xhr.response);
      else reject(new Error('XHR status ' + xhr.status + ' for ' + url));
    };
    xhr.onerror = () => reject(new Error('XHR failed for ' + url));
    xhr.send();
  });
}

// Once a file is loaded, hide the top toolbar to give the editor full height.
// Drag-dropping another .csv anywhere on the page still replaces it.
function markLoaded() {
  document.body.classList.add('file-loaded');
}

async function loadFromHandle(handle) {
  const file = await handle.getFile();
  await loadFile(file, handle);
}

async function loadFromFile(file) {
  await loadFile(file, null);
}

async function loadFile(file, handle) {
  openBytes(file.name, new Uint8Array(await file.arrayBuffer()), handle);
}

// Open a CSV via the File System Access picker (gives a handle for in-place save),
// falling back to a hidden <input type=file>. Called from the host toolbar button
// and from the editor header's "Open CSV" button (relayed via postMessage — the
// child frame's click propagates user activation to this frame).
async function openFilePicker() {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'CSV', accept: { 'text/csv': ['.csv', '.tsv', '.txt'] } }]
      });
      await loadFromHandle(handle);
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return; // user cancelled
      // Other errors (e.g. activation lost across frames): fall back to <input>.
    }
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,.tsv,.txt,text/csv';
  input.addEventListener('change', () => { if (input.files[0]) loadFromFile(input.files[0]); });
  input.click();
}
if (openBtn) openBtn.addEventListener('click', openFilePicker);

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

async function writeViaHandle(handle, bytes) {
  const writable = await handle.createWritable();
  await writable.write(bytes);
  await writable.close();
}

function downloadBytes(name, bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = deriveDownloadName(name);
  a.click();
  URL.revokeObjectURL(url);
}

async function saveCsv(text) {
  // default ("Same as read"): write it back in the encoding it was read with, so a
  // windows-1251 file stays windows-1251 for whatever else opens it. The write Encoding
  // option overrides that.
  const encoding = resolveWriteEncoding(writeEncodingChoice, currentFile.encoding);
  const bytes = encodeCsvText(text, { encoding, hadBom: currentFile.hadBom });
  if (resolveSaveTarget(currentFile.handle) === 'fsa') {
    try { await writeViaHandle(currentFile.handle, bytes); return; }
    catch (err) { console.warn('[host] FSA write failed, downloading instead', err); }
  }
  downloadBytes(currentFile.name, bytes);
}

window.addEventListener('message', (e) => {
  if (e.source !== frame.contentWindow) return;
  const msg = e.data || {};
  if (msg.command === 'ready') {
    editorReady = true;
    sendCurrentFile();
  } else if (msg.command === 'setReadEncoding') {
    // re-decode the SAME bytes; the table is replaced, exactly like re-opening the file
    readEncodingChoice = msg.encoding;
    if (currentFile.bytes) setBytes(currentFile.name, currentFile.bytes, currentFile.handle);
    else sendEncodingInfo();
  } else if (msg.command === 'setWriteEncoding') {
    writeEncodingChoice = msg.encoding;
  } else if (msg.command === 'apply') {
    saveCsv(msg.csvContent);
  } else if (msg.command === 'openFilePicker') {
    // relayed from the editor header's "Open CSV" button (host-bridge.js);
    // the child frame's click propagates user activation to this frame.
    openFilePicker();
  } else if (msg.command === 'openedFile') {
    // a file was dropped onto the editor (read inside the sandbox). No FS handle,
    // so saving uses the download fallback. The sandbox hands over raw bytes so the
    // encoding is guessed here, in one place.
    const bytes = msg.buffer
      ? new Uint8Array(msg.buffer)
      : new TextEncoder().encode(msg.text || '');
    openBytes(msg.name || 'edited.csv', bytes, null);
  }
});

// Banner with a button that opens this extension's settings page (where "Allow access to
// file URLs" lives). Used both for the one-time hint and for a failed local file read.
let fileAccessBannerWired = false;
function showFileAccessBanner(text) {
  const banner = document.getElementById('file-access-banner');
  if (!banner) return;
  banner.querySelector('.fab-text').textContent = text;

  if (!fileAccessBannerWired) {
    fileAccessBannerWired = true;
    const settingsBtn = document.getElementById('fab-open-settings');
    const closeBtn = document.getElementById('fab-close');
    settingsBtn.textContent = chrome.i18n.getMessage('fileAccessHintButton');
    closeBtn.setAttribute('aria-label', chrome.i18n.getMessage('fileAccessHintDismiss'));
    settingsBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id });
    });
    closeBtn.addEventListener('click', async () => {
      banner.hidden = true;
      await chrome.storage.local.set({ fileAccessHintDismissed: true });
    });
  }
  banner.hidden = false;
}

// One-time hint suggesting the user enable "Allow access to file URLs". Shown only
// when file access is off AND the user hasn't dismissed it before (persisted in
// chrome.storage.local); dismissing hides it for good.
(async function fileAccessHint() {
  if (!document.getElementById('file-access-banner')) return;
  const stored = await chrome.storage.local.get('fileAccessHintDismissed');
  if (stored.fileAccessHintDismissed) return;
  const allowed = await new Promise((res) => {
    try { chrome.extension.isAllowedFileSchemeAccess(res); } catch { res(false); }
  });
  if (allowed) return; // already enabled — nothing to suggest

  showFileAccessBanner(chrome.i18n.getMessage('fileAccessHintText'));
})();

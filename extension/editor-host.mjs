import { buildCsvUpdateMessages } from './lib/chunk.mjs';
import { resolveSaveTarget, deriveDownloadName } from './lib/save.mjs';

const SLICE_SIZE = 1024 * 1024; // 1 MB, matches upstream
const frame = document.getElementById('editor-frame');
const openBtn = document.getElementById('open-btn');

let currentFile = { name: 'edited.csv', text: '', handle: null };
let editorReady = false;

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
      markLoaded();
      sendCurrentFile();
    }
  }
  if (src && src.startsWith('fileurl:')) {
    const fileUrl = decodeURIComponent(src.slice('fileurl:'.length));
    try {
      // fetch() does not support the file: scheme in Chrome — use XHR, which
      // extensions may use to read file:// when "Allow access to file URLs" is on.
      const text = await readTextViaXhr(fileUrl);
      currentFile = { name: fileUrl.split('/').pop() || 'edited.csv', text, handle: null };
      markLoaded();
      sendCurrentFile();
    } catch (err) {
      // Most likely cause: "Allow access to file URLs" is disabled, or the file was removed.
      console.warn('[host] failed to load file:// URL', err);
      alert(
        'Could not open the local CSV file.\n\n' +
        'Make sure "Allow access to file URLs" is enabled for this extension ' +
        '(chrome://extensions → Edit CSV → Details), then reload the file.'
      );
    }
  }
}
loadPendingPayload();

function sendCurrentFile() {
  if (!editorReady) return;
  for (const msg of buildCsvUpdateMessages(currentFile.text, SLICE_SIZE)) {
    frame.contentWindow.postMessage(msg, '*');
  }
}

// Read a URL as text via XHR. Needed for file:// (fetch rejects the file scheme).
function readTextViaXhr(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.responseType = 'text';
    xhr.onload = () => {
      // file:// responses report status 0 on success.
      if (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300)) resolve(xhr.responseText);
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
  currentFile = { name: file.name, text: await file.text(), handle };
  markLoaded();
  sendCurrentFile();
}

async function loadFromFile(file) {
  currentFile = { name: file.name, text: await file.text(), handle: null };
  markLoaded();
  sendCurrentFile();
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

window.addEventListener('message', (e) => {
  if (e.source !== frame.contentWindow) return;
  const msg = e.data || {};
  if (msg.command === 'ready') {
    editorReady = true;
    sendCurrentFile();
  } else if (msg.command === 'apply') {
    saveCsv(msg.csvContent);
  }
});

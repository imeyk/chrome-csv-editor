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
      sendCurrentFile();
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

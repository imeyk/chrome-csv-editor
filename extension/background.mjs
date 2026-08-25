import { isCsvUrl, filenameFromUrl } from './lib/csv-url.mjs';
import { isLocalCsvDownload, originalUrlOfDownload } from './lib/local-download.mjs';

const MENU_ID = 'open-csv-in-editor';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: chrome.i18n.getMessage('ctxOpenInEditor'),
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

function editorUrlForFile(fileUrl) {
  return chrome.runtime.getURL(`extension/editor.html?src=fileurl:${encodeURIComponent(fileUrl)}`);
}

// Clicking the toolbar icon opens an empty editor (use Open CSV… inside).
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('extension/editor.html') });
});

// Redirect navigations to local .csv files into the editor (covers opening a
// file:// CSV in a tab). If Chrome NAVIGATES to it, this catches it here.
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;              // top frame only
  if (!details.url.startsWith('file://')) return;
  if (!isCsvUrl(details.url)) return;
  try {
    await chrome.tabs.update(details.tabId, { url: editorUrlForFile(details.url) });
  } catch (err) {
    // Chrome closed the tab already — it decided to download the file instead of
    // rendering it, and a tab that only ever hosted a download is discarded. Give the
    // user a tab that survives.
    await chrome.tabs.create({ url: editorUrlForFile(details.url) });
  }
}, { url: [{ schemes: ['file'] }] });

// Cancel a download, delete whatever landed on disk and drop the history entry.
// Each step is best effort: a tiny file is often already complete before we get here, and
// `removeFile` only works once it is.
async function discardDownload(id) {
  try { await chrome.downloads.cancel(id); } catch (err) { /* already finished */ }
  try { await chrome.downloads.removeFile(id); } catch (err) { /* nothing on disk (yet) */ }
  try { await chrome.downloads.erase({ id }); } catch (err) { /* already erased */ }
}

// A LOCAL csv that ended up as a download (the service worker was too cold for the
// webNavigation redirect above — e.g. the browser was started by the file itself) is
// opened from its ORIGINAL path, and the copy Chrome made is thrown away.
chrome.downloads.onCreated.addListener(async (item) => {
  if (!isLocalCsvDownload(item, isCsvUrl)) return;
  await discardDownload(item.id);
  await chrome.tabs.create({ url: editorUrlForFile(originalUrlOfDownload(item)) });
});

// Open finished .csv/.tsv downloads in the editor. Dropping a CSV onto Chrome (or
// clicking a CSV link) usually DOWNLOADS it rather than navigating, so the
// webNavigation hook above can't fire — this is what actually opens those files.
// Requires "Allow access to file URLs" so the editor can read the local file.
function fileUrlFromPath(p) {
  let s = p.replace(/\\/g, '/');
  if (!s.startsWith('/')) s = '/' + s; // Windows: C:/… -> /C:/…
  return 'file://' + s;
}
chrome.downloads.onChanged.addListener(async (delta) => {
  if (!delta.state || delta.state.current !== 'complete') return;
  const [item] = await chrome.downloads.search({ id: delta.id });
  if (!item || !item.filename) return;
  if (isLocalCsvDownload(item, isCsvUrl)) {
    // onCreated already opened the original file; a small file can finish before the
    // cancel lands, so clean the copy up now that it is on disk
    await discardDownload(item.id);
    return;
  }
  const fileUrl = fileUrlFromPath(item.filename);
  if (!isCsvUrl(fileUrl)) return;
  await chrome.tabs.create({ url: editorUrlForFile(fileUrl) });
});

export { openUrlInEditor }; // referenced by file:// interception in Task 5

import { isCsvUrl, filenameFromUrl } from './lib/csv-url.mjs';
import { decodeCsvBytes } from './lib/decode-text.mjs';
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
  // bytes, not res.text(): that would always decode as utf-8 and mangle a csv saved in
  // windows-1251 & friends
  const decoded = decodeCsvBytes(await res.arrayBuffer());
  const key = 'payload_' + crypto.randomUUID();
  await chrome.storage.session.set({
    [key]: {
      name: filenameFromUrl(url), text: decoded.text,
      encoding: decoded.encoding, hadBom: decoded.hadBom,
    }
  });
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

// Cancel a download and get rid of the copy it made.
//
// Two things make this fiddly. A tiny file is usually already complete before we get here,
// and `removeFile` only works once it is. And on Windows the freshly written file can still
// be locked for a moment, so `removeFile` fails on the first try. The history entry is
// erased only after the file is really gone, because erasing it first would leave us with
// no way to find the copy again.
async function discardDownload(id) {
  try { await chrome.downloads.cancel(id); } catch (err) { /* already finished */ }

  for (let attempt = 0; attempt < 5; attempt++) {
    const [item] = await chrome.downloads.search({ id });
    if (!item) return;                       // already gone

    if (item.state === 'complete') {
      try {
        await chrome.downloads.removeFile(id);
        try { await chrome.downloads.erase({ id }); } catch (err) { /* already erased */ }
        return;
      } catch (err) {
        // still locked (or already deleted by someone else) - try again in a moment
      }
    } else if (item.state === 'interrupted') {
      // cancel() took effect, chrome removed the partial file itself
      try { await chrome.downloads.erase({ id }); } catch (err) { /* already erased */ }
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
  }
  console.warn('[bg] could not remove the downloaded copy of a local csv');
}

// A LOCAL csv that ended up as a download (the service worker was too cold for the
// webNavigation redirect above — e.g. the browser was started by the file itself) is
// opened from its ORIGINAL path, and the copy Chrome made is thrown away.
chrome.downloads.onCreated.addListener(async (item) => {
  if (!isLocalCsvDownload(item, isCsvUrl)) return;
  await discardDownload(item.id);
  await chrome.tabs.create({ url: editorUrlForFile(originalUrlOfDownload(item)) });
});

// A download that starts BEFORE the extension's service worker exists is not delivered to
// onCreated at all - and that is exactly the case this is about: the OS starts the browser
// by the csv file, chrome downloads it because it cannot render it, and that can be over
// before the extension is loaded. Traced on a cold start: webNavigation and
// downloads.onChanged arrive, downloads.onCreated does not.
//
// So sweep for a local csv that just came in whenever the worker starts, not only from
// onStartup (which does not fire for an unpacked extension being (re)installed).
const RECENT_DOWNLOAD_WINDOW_MS = 60000;

async function sweepRecentLocalCsvDownloads() {
  let items;
  try {
    items = await chrome.downloads.search({ limit: 20, orderBy: ['-startTime'] });
  } catch (err) {
    return;
  }

  for (const item of items) {
    if (!isLocalCsvDownload(item, isCsvUrl)) continue;

    const startedAt = Date.parse(item.startTime);
    if (!Number.isFinite(startedAt) || Date.now() - startedAt > RECENT_DOWNLOAD_WINDOW_MS) continue;

    // the copy has to go regardless of who opened the editor
    await discardDownload(item.id);

    // ...but only open a tab if another handler did not already get there first
    const editorUrl = editorUrlForFile(originalUrlOfDownload(item));
    const openTabs = await chrome.tabs.query({ url: chrome.runtime.getURL('extension/editor.html') + '*' });
    if (!openTabs.some(tab => tab.url === editorUrl || tab.pendingUrl === editorUrl)) {
      await chrome.tabs.create({ url: editorUrl });
    }
    break;   // the OS hands over one file per launch
  }
}

chrome.runtime.onStartup.addListener(sweepRecentLocalCsvDownloads);
sweepRecentLocalCsvDownloads();

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

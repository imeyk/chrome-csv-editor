import { isCsvUrl, filenameFromUrl } from './lib/csv-url.mjs';

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

// Clicking the toolbar icon opens an empty editor (use Open CSV… inside).
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('extension/editor.html') });
});

// Redirect navigations to local .csv files into the editor (covers opening a
// file:// CSV in a tab). If Chrome NAVIGATES to it, this catches it here.
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
  const fileUrl = fileUrlFromPath(item.filename);
  if (!isCsvUrl(fileUrl)) return;
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`extension/editor.html?src=fileurl:${encodeURIComponent(fileUrl)}`)
  });
});

export { openUrlInEditor }; // referenced by file:// interception in Task 5

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

// Redirect navigations to local .csv files into the editor.
// NOTE: A downloads fallback (chrome.downloads.onChanged) is only needed on Chrome
// builds that DOWNLOAD file:// CSVs instead of navigating to them (see "Known
// Limitations" in the README). Omitted here to avoid a double-open on builds that
// navigate normally.
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

export { openUrlInEditor }; // referenced by file:// interception in Task 5

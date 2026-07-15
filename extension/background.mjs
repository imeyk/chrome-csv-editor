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

// Chrome cannot render text/csv, so navigating to a LOCAL csv (the Windows "default
// application" case, or typing the path in the address bar) is turned into a download and
// the tab Chrome created for it closes again.
//
// `webNavigation.onBeforeNavigate` cannot always get in front of that: when the browser is
// started BY the file (chrome.exe "C:\x.csv") the service worker is still cold and the
// download wins the race. What we can always do is notice that download and open the
// editor for the file the user actually double clicked — its ORIGINAL path, not the copy
// Chrome drops into ~/Downloads.

/**
 * True when a download item is Chrome downloading a local csv/tsv, i.e. the fallback the
 * browser takes when it could not render the file.
 *
 * Using the copy would be wrong twice over: every open leaves another "name (1).csv",
 * "name (2).csv", … behind, and saving would write to that copy instead of the file the
 * user opened.
 */
export function isLocalCsvDownload(item, isCsvUrl) {
  if (!item) return false;
  const url = item.finalUrl || item.url || '';
  return url.startsWith('file://') && isCsvUrl(url);
}

/** The original file:// URL of such a download (what the user actually wanted to open). */
export function originalUrlOfDownload(item) {
  return (item && (item.finalUrl || item.url)) || '';
}

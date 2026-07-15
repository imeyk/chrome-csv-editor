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

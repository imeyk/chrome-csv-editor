export function resolveSaveTarget(handle) {
  return handle ? 'fsa' : 'download';
}

export function deriveDownloadName(name) {
  return name && name.trim() ? name : 'edited.csv';
}

// "Save filtered CSV" must never touch the source file, so it always goes out as a download
// under a name of its own - `data.csv` stays untouched next to the new `data.filtered.csv`.
export function deriveFilteredDownloadName(name) {
  if (!name || !name.trim()) return 'filtered.csv';

  const lastDot = name.lastIndexOf('.');
  if (lastDot <= 0) return `${name}.filtered.csv`;

  return `${name.slice(0, lastDot)}.filtered${name.slice(lastDot)}`;
}

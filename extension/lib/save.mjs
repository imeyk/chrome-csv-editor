export function resolveSaveTarget(handle) {
  return handle ? 'fsa' : 'download';
}

export function deriveDownloadName(name) {
  return name && name.trim() ? name : 'edited.csv';
}

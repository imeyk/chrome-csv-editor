// The encodings offered in the editor's Read/Write options (issue #17).
//
// Decoding is the cheap side: TextDecoder knows every WHATWG label. WRITING is what
// limits the list — TextEncoder only produces utf-8, and decode-text.mjs adds utf-16
// plus the single byte encodings (by reversing the decoder table). Listing an encoding
// we cannot write would turn "save" into a silent utf-8 fallback, so the list below is
// exactly the set we can read AND write back.

/** Read: guess the encoding. Write: use whatever the file was read with. */
export const AUTO = 'auto';

// `group` becomes an <optgroup>, which is what keeps the labels short enough to fit the
// dropdown: the script is in the group heading instead of in every single entry.
export const SUPPORTED_ENCODINGS = [
  { value: 'utf-8', label: 'UTF-8', group: 'Unicode' },
  { value: 'utf-16le', label: 'UTF-16 LE', group: 'Unicode' },
  { value: 'utf-16be', label: 'UTF-16 BE', group: 'Unicode' },
  { value: 'windows-1251', label: 'windows-1251', group: 'Cyrillic' },
  { value: 'koi8-r', label: 'KOI8-R', group: 'Cyrillic' },
  { value: 'koi8-u', label: 'KOI8-U', group: 'Cyrillic' },
  { value: 'ibm866', label: 'IBM866 (DOS)', group: 'Cyrillic' },
  { value: 'iso-8859-5', label: 'ISO-8859-5', group: 'Cyrillic' },
  { value: 'windows-1252', label: 'windows-1252', group: 'Western' },
  { value: 'iso-8859-15', label: 'ISO-8859-15', group: 'Western' },
  { value: 'macintosh', label: 'Mac Roman', group: 'Western' },
  { value: 'windows-1250', label: 'windows-1250', group: 'Central European' },
  { value: 'iso-8859-2', label: 'ISO-8859-2', group: 'Central European' },
  { value: 'windows-1253', label: 'windows-1253', group: 'Greek' },
  { value: 'iso-8859-7', label: 'ISO-8859-7', group: 'Greek' },
  { value: 'windows-1254', label: 'windows-1254', group: 'Turkish' },
  { value: 'windows-1257', label: 'windows-1257', group: 'Baltic' },
];

const BY_VALUE = new Map(SUPPORTED_ENCODINGS.map(e => [e.value, e]));

/** Is this something the editor may hand us as a read/write encoding? */
export function isSupportedEncoding(encoding) {
  return BY_VALUE.has(encoding);
}

/**
 * The encoding to actually decode with.
 * `auto` (or anything we don't ship) means: guess it, i.e. no forced encoding.
 */
export function resolveReadEncoding(selected) {
  return isSupportedEncoding(selected) ? selected : null;
}

/**
 * The encoding to actually write with. `auto` keeps the fork's original behaviour —
 * write the file back exactly as it was read, so a windows-1251 file stays windows-1251.
 */
export function resolveWriteEncoding(selected, readEncoding) {
  return isSupportedEncoding(selected) ? selected : readEncoding;
}

/** Human readable name for the dropdowns; unknown encodings show their own label. */
export function labelFor(encoding) {
  const known = BY_VALUE.get(encoding);
  return known ? known.label : encoding;
}

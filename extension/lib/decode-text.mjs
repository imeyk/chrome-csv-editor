// CSV files are bytes, not text. Reading them with `file.text()` / an XHR text response
// always decodes as UTF-8, so a file saved in a legacy single byte encoding (very common
// for CSV exported by Windows tools — windows-1251 for Russian, koi8-r, cp866) comes out
// as a wall of U+FFFD replacement characters.
//
// So: sniff a BOM, else try UTF-8 strictly, else pick the best single byte candidate.

const BOMS = [
  { bytes: [0xef, 0xbb, 0xbf], encoding: 'utf-8', skip: 3 },
  { bytes: [0xff, 0xfe], encoding: 'utf-16le', skip: 2 },
  { bytes: [0xfe, 0xff], encoding: 'utf-16be', skip: 2 },
];

/** Cyrillic-capable single byte encodings, most common first. */
export const CYRILLIC_CANDIDATES = ['windows-1251', 'koi8-r', 'ibm866'];
/** What a western european file would be. */
export const WESTERN_CANDIDATE = 'windows-1252';

export function detectBom(bytes) {
  for (const bom of BOMS) {
    if (bom.bytes.every((b, i) => bytes[i] === b)) return bom;
  }
  return null;
}

function isValidUtf8(bytes) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs of bytes >= 0x80, which is what separates a non-latin script from western text:
 * Cyrillic (or Greek, Hebrew, …) words are runs of high bytes, while western text has
 * isolated high bytes (an accent) surrounded by ASCII.
 *
 * Without this, scoring alone would misread "Café" (windows-1252) as Cyrillic, because
 * windows-1251 turns that 0xE9 byte into a perfectly plausible "й".
 */
export function highByteRunStats(bytes) {
  let single = 0;
  let multi = 0;
  let run = 0;
  for (let i = 0; i <= bytes.length; i++) {
    if (i < bytes.length && bytes[i] >= 0x80) {
      run++;
      continue;
    }
    if (run === 1) single++;
    else if (run > 1) multi++;
    run = 0;
  }
  return { single, multi, total: single + multi };
}

const CYRILLIC = /[\u0400-\u04FF]/;
// control characters - tab, newline and carriage return are legitimate in a csv
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
const REPLACEMENT = String.fromCharCode(0xFFFD);

/**
 * How plausible a decoded string looks as real text. Only used to compare candidates for
 * the SAME bytes, so the absolute value carries no meaning.
 *
 * Lower case Cyrillic scores highest, and that is what separates the Cyrillic encodings
 * from each other: reading koi8-r text as windows-1251 (or the other way round) flips
 * essentially every letter to upper case — "курорт" comes out as "КУРОРТ" — while real
 * text is overwhelmingly lower case.
 */
export function scoreDecoded(text) {
  let score = 0;
  for (const ch of text) {
    if (ch === REPLACEMENT) score -= 100;       // byte has no meaning in this encoding
    else if (CONTROL.test(ch)) score -= 30;     // binary noise, so probably the wrong one
    else if (CYRILLIC.test(ch)) score += ch === ch.toLowerCase() ? 3 : 1;
    else score += 1;
  }
  return score;
}

/**
 * Decode CSV bytes, guessing the encoding.
 * Returns the text, the encoding it was read with, and whether a BOM was stripped
 * (the caller needs both to write the file back the way it found it).
 */
export function decodeCsvBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  const bom = detectBom(bytes);
  if (bom) {
    return {
      text: new TextDecoder(bom.encoding).decode(bytes.subarray(bom.skip)),
      encoding: bom.encoding,
      hadBom: true,
    };
  }

  // pure ASCII or real UTF-8: nothing to guess
  if (isValidUtf8(bytes)) {
    return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'utf-8', hadBom: false };
  }

  const runs = highByteRunStats(bytes);
  const candidates = runs.multi > runs.single ? CYRILLIC_CANDIDATES : [WESTERN_CANDIDATE];

  let best = null;
  for (const encoding of candidates) {
    const text = new TextDecoder(encoding).decode(bytes);
    const score = scoreDecoded(text);
    if (!best || score > best.score) best = { text, encoding, score };
  }
  return { text: best.text, encoding: best.encoding, hadBom: false };
}

/**
 * char -> byte map for a single byte encoding, derived from the decoder so there is no
 * hand written table to get wrong.
 */
function singleByteMap(encoding) {
  const decoder = new TextDecoder(encoding);
  const map = new Map();
  const one = new Uint8Array(1);
  for (let b = 0; b < 256; b++) {
    one[0] = b;
    const ch = decoder.decode(one);
    if (ch && ch !== REPLACEMENT && !map.has(ch)) map.set(ch, b);
  }
  return map;
}

const singleByteMaps = new Map();

/**
 * Encode text back into the encoding it was read with, so saving does not silently
 * rewrite a windows-1251 file as UTF-8 and break every other tool that opens it.
 *
 * Falls back to UTF-8 when the text no longer fits the original encoding (the user typed
 * a character it cannot represent) — losing characters would be worse than the change.
 */
export function encodeText(text, encoding) {
  const utf8 = () => ({ bytes: new TextEncoder().encode(text), encoding: 'utf-8' });

  if (!encoding || encoding === 'utf-8' || encoding.startsWith('utf-16')) return utf8();

  if (!singleByteMaps.has(encoding)) singleByteMaps.set(encoding, singleByteMap(encoding));
  const map = singleByteMaps.get(encoding);

  const out = new Uint8Array(text.length);
  let i = 0;
  for (const ch of text) {
    const byte = map.get(ch);
    if (byte === undefined) return utf8();   // cannot represent it — keep the characters
    out[i++] = byte;
  }
  return { bytes: out.subarray(0, i), encoding };
}

/** The bytes to write for `text`, re-adding a BOM if the file had one. */
export function encodeCsvText(text, { encoding, hadBom } = {}) {
  const encoded = encodeText(text, encoding);
  if (!hadBom) return encoded.bytes;
  const bom = BOMS.find(b => b.encoding === encoded.encoding);
  if (!bom) return encoded.bytes;
  const out = new Uint8Array(bom.bytes.length + encoded.bytes.length);
  out.set(bom.bytes, 0);
  out.set(encoded.bytes, bom.bytes.length);
  return out;
}

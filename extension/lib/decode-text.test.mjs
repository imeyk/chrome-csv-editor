import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeCsvBytes, detectBom, highByteRunStats, scoreDecoded, encodeText, encodeCsvText,
} from './decode-text.mjs';

// helper: encode a string into a single byte encoding via the decoder tables
function bytesIn(encoding, text) {
  return encodeText(text, encoding).bytes;
}
const utf8 = text => new TextEncoder().encode(text);

test('decodeCsvBytes: plain ascii is read as utf-8', () => {
  const r = decodeCsvBytes(utf8('id,name\n1,alpha\n'));
  assert.equal(r.text, 'id,name\n1,alpha\n');
  assert.equal(r.encoding, 'utf-8');
  assert.equal(r.hadBom, false);
});

test('decodeCsvBytes: real utf-8 cyrillic stays utf-8', () => {
  const r = decodeCsvBytes(utf8('город,курорт\nМосква,Сочи\n'));
  assert.equal(r.text, 'город,курорт\nМосква,Сочи\n');
  assert.equal(r.encoding, 'utf-8');
});

test('decodeCsvBytes: windows-1251 cyrillic is read correctly (issue #3)', () => {
  const source = 'город;курорт;месяц\nМосква;Сочи;январь\n';
  const r = decodeCsvBytes(bytesIn('windows-1251', source));
  assert.equal(r.encoding, 'windows-1251');
  assert.equal(r.text, source);
  assert.equal(r.text.includes('�'), false);
});

test('decodeCsvBytes: koi8-r cyrillic is recognised', () => {
  const source = 'город;курорт\nМосква;Сочи\n';
  const r = decodeCsvBytes(bytesIn('koi8-r', source));
  assert.equal(r.encoding, 'koi8-r');
  assert.equal(r.text, source);
});

test('decodeCsvBytes: cp866 cyrillic is recognised', () => {
  const source = 'город;курорт\nМосква;Сочи\n';
  const r = decodeCsvBytes(bytesIn('ibm866', source));
  assert.equal(r.encoding, 'ibm866');
  assert.equal(r.text, source);
});

test('decodeCsvBytes: western european text is NOT mistaken for cyrillic', () => {
  // isolated high bytes: windows-1251 would happily turn "é" into "й"
  const source = 'ville,pays\nCafé,France\nZürich,Suisse\n';
  const r = decodeCsvBytes(bytesIn('windows-1252', source));
  assert.equal(r.encoding, 'windows-1252');
  assert.equal(r.text, source);
});

test('decodeCsvBytes: utf-8 BOM is stripped so the first header cell stays clean', () => {
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('id,name\n1,a\n')]);
  const r = decodeCsvBytes(bytes);
  assert.equal(r.text, 'id,name\n1,a\n');
  assert.equal(r.hadBom, true);
  assert.equal(r.encoding, 'utf-8');
});

test('decodeCsvBytes: utf-16le with BOM', () => {
  const text = 'id,имя\n1,Аня\n';
  const buf = new Uint8Array(2 + text.length * 2);
  buf[0] = 0xff; buf[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    buf[2 + i * 2] = code & 0xff;
    buf[3 + i * 2] = code >> 8;
  }
  const r = decodeCsvBytes(buf);
  assert.equal(r.encoding, 'utf-16le');
  assert.equal(r.text, text);
});

test('decodeCsvBytes: accepts an ArrayBuffer as well as a Uint8Array', () => {
  const u8 = bytesIn('windows-1251', 'курорт\n');
  const copy = new Uint8Array(u8);           // own buffer, so byteOffset is 0
  const r = decodeCsvBytes(copy.buffer);
  assert.equal(r.text, 'курорт\n');
});

test('detectBom: none for a bare file', () => {
  assert.equal(detectBom(utf8('id,name')), null);
});

test('highByteRunStats: runs tell cyrillic words from single accents', () => {
  assert.deepEqual(highByteRunStats(bytesIn('windows-1251', 'курорт')), { single: 0, multi: 1, total: 1 });
  const cafe = highByteRunStats(bytesIn('windows-1252', 'Cafe,Zurich'.replace('e,', 'é,').replace('Zu', 'Zü')));
  assert.equal(cafe.single, 2);
  assert.equal(cafe.multi, 0);
});

test('scoreDecoded: replacement characters sink a candidate', () => {
  assert.ok(scoreDecoded('курорт') > scoreDecoded('������'));
});

test('encodeText: round trips windows-1251 so saving keeps the file readable elsewhere', () => {
  const text = 'город;курорт\nМосква;Сочи\n';
  const { bytes, encoding } = encodeText(text, 'windows-1251');
  assert.equal(encoding, 'windows-1251');
  assert.equal(new TextDecoder('windows-1251').decode(bytes), text);
});

test('encodeText: falls back to utf-8 when a character does not fit', () => {
  const { bytes, encoding } = encodeText('курорт 🌴\n', 'windows-1251');
  assert.equal(encoding, 'utf-8');
  assert.equal(new TextDecoder('utf-8').decode(bytes), 'курорт 🌴\n');
});

test('encodeText: utf-8 and an unknown encoding are written as utf-8', () => {
  assert.equal(encodeText('a', 'utf-8').encoding, 'utf-8');
  assert.equal(encodeText('a', undefined).encoding, 'utf-8');
});

test('encodeText: utf-16 is written as utf-16, not downgraded to utf-8', () => {
  const text = 'город,a\n';
  const le = encodeText(text, 'utf-16le');
  assert.equal(le.encoding, 'utf-16le');
  assert.equal(new TextDecoder('utf-16le').decode(le.bytes), text);

  const be = encodeText(text, 'utf-16be');
  assert.equal(be.encoding, 'utf-16be');
  assert.equal(new TextDecoder('utf-16be').decode(be.bytes), text);
  // same text, mirrored bytes
  assert.deepEqual([...be.bytes.slice(0, 2)], [...le.bytes.slice(0, 2)].reverse());
});

test('encodeCsvText: re-adds the BOM the file came with', () => {
  const bytes = encodeCsvText('id,a\n', { encoding: 'utf-8', hadBom: true });
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(new TextDecoder('utf-8').decode(bytes.slice(3)), 'id,a\n');
});

test('encodeCsvText: no BOM when the file had none', () => {
  const bytes = encodeCsvText('id,a\n', { encoding: 'utf-8', hadBom: false });
  assert.equal(new TextDecoder('utf-8').decode(bytes), 'id,a\n');
});

test('decode -> edit -> encode keeps a windows-1251 file windows-1251', () => {
  const original = bytesIn('windows-1251', 'город;курорт\nМосква;Сочи\n');
  const read = decodeCsvBytes(original);
  const edited = read.text.replace('Сочи', 'Анапа');
  const written = encodeCsvText(edited, read);
  assert.equal(new TextDecoder('windows-1251').decode(written), 'город;курорт\nМосква;Анапа\n');
  // and reading it back again gives the same text
  assert.equal(decodeCsvBytes(written).text, edited);
});

/* --- forced read encoding: the editor's "Encoding" read option (issue #17) --- */

test('decodeCsvBytes: a forced encoding wins over the guess', () => {
  // these bytes really are koi8-r, and the guesser gets that right...
  const bytes = bytesIn('koi8-r', 'город;курорт\n');
  assert.equal(decodeCsvBytes(bytes).encoding, 'koi8-r');

  // ...but the user gets the last word, even when the result is nonsense
  const forced = decodeCsvBytes(bytes, 'windows-1251');
  assert.equal(forced.encoding, 'windows-1251');
  assert.equal(forced.text, new TextDecoder('windows-1251').decode(bytes));
  assert.notEqual(forced.text, 'город;курорт\n');
});

test('decodeCsvBytes: a forced encoding rescues what the guesser cannot reach', () => {
  // the guesser only ever picks between cyrillic and windows-1252, so greek text
  // (runs of high bytes -> cyrillic candidates) always comes out wrong
  const source = 'πόλη;τιμή\nΑθήνα;100\n';
  const bytes = bytesIn('iso-8859-7', source);
  assert.notEqual(decodeCsvBytes(bytes).text, source);              // guessed wrong
  assert.equal(decodeCsvBytes(bytes, 'iso-8859-7').text, source);   // user fixes it
});

test('decodeCsvBytes: a forced encoding still strips the BOM', () => {
  const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...bytesIn('windows-1252', 'id,a\n')]);
  const r = decodeCsvBytes(bytes, 'windows-1252');
  assert.equal(r.text, 'id,a\n');    // no leading U+FEFF and no "ï»¿"
  assert.equal(r.hadBom, true);
});

test('decodeCsvBytes: forcing utf-8 on a utf-8 file is a no-op', () => {
  const source = 'город,курорт\n';
  const r = decodeCsvBytes(utf8(source), 'utf-8');
  assert.equal(r.text, source);
  assert.equal(r.encoding, 'utf-8');
});

test('encodeCsvText: utf-16 always gets a BOM, even for a file that had none', () => {
  const bytes = encodeCsvText('id,a\n', { encoding: 'utf-16le', hadBom: false });
  assert.deepEqual([...bytes.slice(0, 2)], [0xff, 0xfe]);
  // and it reads back as the same text, BOM included in the round trip
  assert.equal(decodeCsvBytes(bytes).text, 'id,a\n');
  assert.equal(decodeCsvBytes(bytes).encoding, 'utf-16le');
});

test('re-reading with another encoding and saving keeps that encoding', () => {
  const original = bytesIn('ibm866', 'имя;цена\nстол;100\n');
  const reread = decodeCsvBytes(original, 'ibm866');
  const written = encodeCsvText(reread.text, reread);
  assert.deepEqual([...written], [...original]);
});

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

test('encodeText: utf-8 and utf-16 sources are written as utf-8', () => {
  assert.equal(encodeText('a', 'utf-8').encoding, 'utf-8');
  assert.equal(encodeText('a', 'utf-16le').encoding, 'utf-8');
  assert.equal(encodeText('a', undefined).encoding, 'utf-8');
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

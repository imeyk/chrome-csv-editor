import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bytesToBase64, base64ToBytes } from './base64.mjs';
import { encodeText, decodeCsvBytes } from './decode-text.mjs';

test('round trips every byte value', () => {
  const bytes = new Uint8Array(256);
  for (let i = 0; i < 256; i++) bytes[i] = i;
  assert.deepEqual([...base64ToBytes(bytesToBase64(bytes))], [...bytes]);
});

test('round trips an empty file', () => {
  assert.equal(bytesToBase64(new Uint8Array(0)), '');
  assert.equal(base64ToBytes('').length, 0);
});

test('round trips past the chunk boundary (no argument limit blowup)', () => {
  const bytes = new Uint8Array(0x8000 * 2 + 17);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) & 0xff;
  assert.deepEqual([...base64ToBytes(bytesToBase64(bytes))], [...bytes]);
});

test('accepts an ArrayBuffer', () => {
  const bytes = new Uint8Array([1, 2, 3]);
  assert.equal(bytesToBase64(bytes.buffer), bytesToBase64(bytes));
});

test('a windows-1251 csv survives the trip through session storage', () => {
  const source = 'город;курорт\nМосква;Сочи\n';
  const original = encodeText(source, 'windows-1251').bytes;
  const restored = base64ToBytes(bytesToBase64(original));
  assert.deepEqual([...restored], [...original]);
  assert.equal(decodeCsvBytes(restored).text, source);
});

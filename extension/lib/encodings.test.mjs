import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO, SUPPORTED_ENCODINGS, isSupportedEncoding, resolveReadEncoding,
  resolveWriteEncoding, labelFor,
} from './encodings.mjs';
import { encodeText } from './decode-text.mjs';

test('every offered encoding can be decoded by TextDecoder', () => {
  for (const { value } of SUPPORTED_ENCODINGS) {
    assert.equal(new TextDecoder(value).encoding, value, `${value} is not a WHATWG label`);
  }
});

test('every offered encoding can actually be written back', () => {
  // the whole point of the list: no entry may silently fall back to utf-8 on save
  for (const { value } of SUPPORTED_ENCODINGS) {
    const sample = 'id,name\n1,alpha\n';
    assert.equal(encodeText(sample, value).encoding, value, `${value} falls back on write`);
  }
});

test('labels are unique so the dropdown has no ambiguous entries', () => {
  const labels = SUPPORTED_ENCODINGS.map(e => e.label);
  assert.equal(new Set(labels).size, labels.length);
});

test('every entry carries a group, and each group is listed in one run', () => {
  // the dropdown builds one <optgroup> per run, so a group must not come back later
  const seen = [];
  let previous = null;
  for (const { value, group } of SUPPORTED_ENCODINGS) {
    assert.ok(group, `${value} has no group`);
    if (group === previous) continue;
    assert.equal(seen.includes(group), false, `group ${group} is split up`);
    seen.push(group);
    previous = group;
  }
});

test('labels stay short enough for an 11rem dropdown', () => {
  for (const { label } of SUPPORTED_ENCODINGS) {
    assert.ok(label.length <= 14, `"${label}" is too long for the dropdown`);
  }
});

test('isSupportedEncoding rejects auto and unknown labels', () => {
  assert.equal(isSupportedEncoding('windows-1251'), true);
  assert.equal(isSupportedEncoding(AUTO), false);
  assert.equal(isSupportedEncoding('shift_jis'), false);
  assert.equal(isSupportedEncoding(undefined), false);
});

test('resolveReadEncoding: auto means "guess it" (no forced encoding)', () => {
  assert.equal(resolveReadEncoding(AUTO), null);
  assert.equal(resolveReadEncoding(undefined), null);
  assert.equal(resolveReadEncoding('koi8-r'), 'koi8-r');
});

test('resolveWriteEncoding: auto keeps the encoding the file was read with', () => {
  assert.equal(resolveWriteEncoding(AUTO, 'windows-1251'), 'windows-1251');
  assert.equal(resolveWriteEncoding(undefined, 'windows-1251'), 'windows-1251');
  assert.equal(resolveWriteEncoding('utf-8', 'windows-1251'), 'utf-8');
});

test('labelFor falls back to the raw encoding name', () => {
  assert.equal(labelFor('utf-8'), 'UTF-8');
  assert.equal(labelFor('shift_jis'), 'shift_jis');
});

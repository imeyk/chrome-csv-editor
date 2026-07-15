import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partitionString, buildCsvUpdateMessages } from './chunk.mjs';

test('partitionString: single slice when under size', () => {
  assert.deepEqual(partitionString('abc', 10), [{ text: 'abc', sliceNr: 1, totalSlices: 1 }]);
});

test('partitionString: splits into ordered slices covering the whole string', () => {
  const slices = partitionString('abcdef', 2);
  assert.equal(slices.length, 3);
  assert.equal(slices.map(s => s.text).join(''), 'abcdef');
  assert.deepEqual(slices.map(s => s.sliceNr), [1, 2, 3]);
  assert.ok(slices.every(s => s.totalSlices === 3));
});

test('partitionString: empty string yields one empty slice', () => {
  assert.deepEqual(partitionString('', 5), [{ text: '', sliceNr: 1, totalSlices: 1 }]);
});

test('buildCsvUpdateMessages wraps slices in csvUpdate commands', () => {
  const msgs = buildCsvUpdateMessages('abcd', 2);
  assert.equal(msgs.length, 2);
  assert.deepEqual(msgs[0], { command: 'csvUpdate', csvContent: { text: 'ab', sliceNr: 1, totalSlices: 2 } });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCsvUrl, filenameFromUrl } from './csv-url.mjs';

test('isCsvUrl: true for .csv/.tsv, ignoring query and case', () => {
  assert.equal(isCsvUrl('https://x.com/a/data.CSV?v=1'), true);
  assert.equal(isCsvUrl('file:///Users/me/report.tsv'), true);
});

test('isCsvUrl: false for non-csv', () => {
  assert.equal(isCsvUrl('https://x.com/a.pdf'), false);
  assert.equal(isCsvUrl('https://x.com/csv-guide'), false);
});

test('filenameFromUrl: basename without query', () => {
  assert.equal(filenameFromUrl('https://x.com/a/data.csv?v=1'), 'data.csv');
  assert.equal(filenameFromUrl('file:///Users/me/r.tsv'), 'r.tsv');
});

test('filenameFromUrl: fallback when none', () => {
  assert.equal(filenameFromUrl('https://x.com/'), 'edited.csv');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCsvUrl } from './csv-url.mjs';
import { isLocalCsvDownload, originalUrlOfDownload } from './local-download.mjs';

test('isLocalCsvDownload: local csv/tsv downloads only', () => {
  assert.equal(isLocalCsvDownload({ url: 'file:///C:/a/b.csv' }, isCsvUrl), true);
  assert.equal(isLocalCsvDownload({ url: 'file:///C:/a/b.TSV' }, isCsvUrl), true);
  assert.equal(isLocalCsvDownload({ url: 'file:///C:/a/b.zip' }, isCsvUrl), false);
});

test('isLocalCsvDownload: a remote csv download is left alone', () => {
  // those must keep going through the normal "open the finished download" path
  assert.equal(isLocalCsvDownload({ url: 'https://x.com/b.csv' }, isCsvUrl), false);
});

test('isLocalCsvDownload: tolerates a missing item', () => {
  assert.equal(isLocalCsvDownload(null, isCsvUrl), false);
  assert.equal(isLocalCsvDownload(undefined, isCsvUrl), false);
  assert.equal(isLocalCsvDownload({}, isCsvUrl), false);
});

test('isLocalCsvDownload: finalUrl wins over url', () => {
  const item = { url: 'https://x.com/redirect', finalUrl: 'file:///C:/a/b.csv' };
  assert.equal(isLocalCsvDownload(item, isCsvUrl), true);
});

test('originalUrlOfDownload: prefers finalUrl, falls back to url', () => {
  assert.equal(originalUrlOfDownload({ url: 'file:///a.csv' }), 'file:///a.csv');
  assert.equal(originalUrlOfDownload({ url: 'file:///a.csv', finalUrl: 'file:///b.csv' }), 'file:///b.csv');
});

test('originalUrlOfDownload: empty string when unknown', () => {
  assert.equal(originalUrlOfDownload(undefined), '');
  assert.equal(originalUrlOfDownload({}), '');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSaveTarget, deriveDownloadName, deriveFilteredDownloadName } from './save.mjs';

test('resolveSaveTarget: fsa when a handle exists', () => {
  assert.equal(resolveSaveTarget({}), 'fsa');
});

test('resolveSaveTarget: download when no handle', () => {
  assert.equal(resolveSaveTarget(null), 'download');
});

test('deriveDownloadName: keeps a .csv name as-is', () => {
  assert.equal(deriveDownloadName('data.csv'), 'data.csv');
});

test('deriveDownloadName: falls back for empty name', () => {
  assert.equal(deriveDownloadName(''), 'edited.csv');
});

test('deriveFilteredDownloadName: marks the copy before the extension', () => {
  assert.equal(deriveFilteredDownloadName('data.csv'), 'data.filtered.csv');
});

test('deriveFilteredDownloadName: keeps a non-csv extension', () => {
  assert.equal(deriveFilteredDownloadName('report.tsv'), 'report.filtered.tsv');
});

test('deriveFilteredDownloadName: keeps the case of the extension', () => {
  assert.equal(deriveFilteredDownloadName('DATA.CSV'), 'DATA.filtered.CSV');
});

test('deriveFilteredDownloadName: only the last extension is split off', () => {
  assert.equal(deriveFilteredDownloadName('my.data.csv'), 'my.data.filtered.csv');
});

test('deriveFilteredDownloadName: appends csv when there is no extension', () => {
  assert.equal(deriveFilteredDownloadName('data'), 'data.filtered.csv');
});

test('deriveFilteredDownloadName: falls back for an empty name', () => {
  assert.equal(deriveFilteredDownloadName(''), 'filtered.csv');
  assert.equal(deriveFilteredDownloadName('   '), 'filtered.csv');
  assert.equal(deriveFilteredDownloadName(undefined), 'filtered.csv');
});

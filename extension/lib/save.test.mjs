import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSaveTarget, deriveDownloadName } from './save.mjs';

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

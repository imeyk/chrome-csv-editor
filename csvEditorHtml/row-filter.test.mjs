import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  isColumnFilterEmpty,
  cellMatchesColumnFilter,
  collectColumnValues,
  countActiveFilters,
  copiedRowIndices,
  keepVisibleCopiedRows,
} = require('./row-filter.js');

const contains = (text) => ({ mode: 'contains', text: text, values: null });
const exact = (text) => ({ mode: 'exact', text: text, values: null });
const picked = (values) => ({ mode: 'contains', text: '', values: values });

//--- isColumnFilterEmpty

test('isColumnFilterEmpty: a missing filter is empty', () => {
  assert.equal(isColumnFilterEmpty(undefined), true);
  assert.equal(isColumnFilterEmpty(null), true);
});

test('isColumnFilterEmpty: no text and no value selection is empty', () => {
  assert.equal(isColumnFilterEmpty({ mode: 'contains', text: '', values: null }), true);
});

test('isColumnFilterEmpty: search text makes it active', () => {
  assert.equal(isColumnFilterEmpty(contains('a')), false);
});

test('isColumnFilterEmpty: a value selection makes it active', () => {
  assert.equal(isColumnFilterEmpty(picked(['a'])), false);
});

test('isColumnFilterEmpty: an empty value selection is active, not empty', () => {
  // nothing checked means "show no rows", which is a filter, not the absence of one
  assert.equal(isColumnFilterEmpty(picked([])), false);
});

//--- cellMatchesColumnFilter: text search

test('contains mode matches a substring', () => {
  assert.equal(cellMatchesColumnFilter('Hello world', contains('lo wo')), true);
  assert.equal(cellMatchesColumnFilter('Hello world', contains('xyz')), false);
});

test('contains mode ignores case', () => {
  assert.equal(cellMatchesColumnFilter('HELLO', contains('ell')), true);
  assert.equal(cellMatchesColumnFilter('hello', contains('ELL')), true);
});

test('exact mode needs the whole cell to match', () => {
  assert.equal(cellMatchesColumnFilter('Hello', exact('Hello')), true);
  assert.equal(cellMatchesColumnFilter('Hello', exact('ell')), false);
  assert.equal(cellMatchesColumnFilter('Hello!', exact('Hello')), false);
});

test('exact mode ignores case', () => {
  assert.equal(cellMatchesColumnFilter('Hello', exact('hello')), true);
});

test('exact mode does not trim the cell or the query', () => {
  assert.equal(cellMatchesColumnFilter(' a', exact('a')), false);
  assert.equal(cellMatchesColumnFilter('a', exact(' a')), false);
  assert.equal(cellMatchesColumnFilter(' a', exact(' a')), true);
});

test('an unknown mode falls back to contains', () => {
  assert.equal(cellMatchesColumnFilter('Hello', { mode: 'whatever', text: 'ell', values: null }), true);
});

test('empty search text matches every cell', () => {
  assert.equal(cellMatchesColumnFilter('anything', contains('')), true);
  assert.equal(cellMatchesColumnFilter('', contains('')), true);
});

test('null and undefined cells are treated as the empty string', () => {
  assert.equal(cellMatchesColumnFilter(null, contains('a')), false);
  assert.equal(cellMatchesColumnFilter(undefined, contains('a')), false);
  assert.equal(cellMatchesColumnFilter(null, exact('')), true);
});

test('non-string cells are compared as strings', () => {
  assert.equal(cellMatchesColumnFilter(42, contains('4')), true);
  assert.equal(cellMatchesColumnFilter(42, exact('42')), true);
});

//--- cellMatchesColumnFilter: value selection

test('a value selection matches the listed values only', () => {
  assert.equal(cellMatchesColumnFilter('a', picked(['a', 'b'])), true);
  assert.equal(cellMatchesColumnFilter('c', picked(['a', 'b'])), false);
});

test('a value selection compares the raw value, case sensitively', () => {
  // the values come from the column itself, so they must match it exactly
  assert.equal(cellMatchesColumnFilter('A', picked(['a'])), false);
});

test('an empty value selection matches nothing', () => {
  assert.equal(cellMatchesColumnFilter('a', picked([])), false);
  assert.equal(cellMatchesColumnFilter('', picked([])), false);
});

test('an empty cell can be selected as a value', () => {
  assert.equal(cellMatchesColumnFilter('', picked([''])), true);
  assert.equal(cellMatchesColumnFilter(null, picked([''])), true);
});

test('search text and value selection of one column are combined with and', () => {
  const filter = { mode: 'contains', text: 'pp', values: ['apple', 'banana'] };
  assert.equal(cellMatchesColumnFilter('apple', filter), true);
  assert.equal(cellMatchesColumnFilter('banana', filter), false);   // in the selection, no 'pp'
  assert.equal(cellMatchesColumnFilter('pepper', filter), false);   // has 'pp', not selected
});

//--- collectColumnValues

test('collectColumnValues: unique values of a column, ascending', () => {
  const result = collectColumnValues(['red', 'yellow', 'red', 'green']);
  assert.deepEqual(result.values, ['green', 'red', 'yellow']);
  assert.equal(result.truncated, false);
});

test('collectColumnValues: an empty cell is a value of its own', () => {
  assert.deepEqual(collectColumnValues(['apple', 'banana', 'cherry', '']).values,
    ['', 'apple', 'banana', 'cherry']);
});

test('collectColumnValues: numbers sort like numbers, not like strings', () => {
  assert.deepEqual(collectColumnValues(['9', '10', '100', '9']).values, ['9', '10', '100']);
});

test('collectColumnValues: null cells collapse into the empty string', () => {
  assert.deepEqual(collectColumnValues([null, undefined, 'a']).values, ['', 'a']);
});

test('collectColumnValues: stops at the limit and says it was truncated', () => {
  const result = collectColumnValues(['a', 'b', 'c', 'd'], 2);
  assert.equal(result.values.length, 2);
  assert.equal(result.truncated, true);
});

test('collectColumnValues: not truncated when the limit is exactly met', () => {
  const result = collectColumnValues(['a', 'b', 'a'], 2);
  assert.deepEqual(result.values, ['a', 'b']);
  assert.equal(result.truncated, false);
});

test('collectColumnValues: tolerates an empty column', () => {
  assert.deepEqual(collectColumnValues([]).values, []);
  assert.deepEqual(collectColumnValues(null).values, []);
});

//--- countActiveFilters

test('countActiveFilters: counts only the columns that actually filter', () => {
  assert.equal(countActiveFilters({}), 0);
  assert.equal(countActiveFilters(null), 0);
  assert.equal(countActiveFilters({ 0: contains(''), 1: exact('red') }), 1);
  assert.equal(countActiveFilters({ 0: contains('a'), 1: picked([]) }), 2);
});

//--- copiedRowIndices

const range = (startRow, endRow) => ({ startRow: startRow, startCol: 0, endRow: endRow, endCol: 1 });

test('copiedRowIndices: one range is walked from its first to its last row', () => {
  assert.deepEqual(copiedRowIndices([range(1, 4)]), [1, 2, 3, 4]);
});

test('copiedRowIndices: a single cell selection is one row', () => {
  assert.deepEqual(copiedRowIndices([range(2, 2)]), [2]);
});

test('copiedRowIndices: several ranges keep their order and are not repeated', () => {
  // ctrl+click selections: handsontable copies every row once, in the order the ranges came in
  assert.deepEqual(copiedRowIndices([range(0, 1), range(4, 5)]), [0, 1, 4, 5]);
  assert.deepEqual(copiedRowIndices([range(0, 2), range(1, 3)]), [0, 1, 2, 3]);
});

test('copiedRowIndices: no ranges means no rows', () => {
  assert.deepEqual(copiedRowIndices([]), []);
  assert.deepEqual(copiedRowIndices(null), []);
});

//--- keepVisibleCopiedRows

const hiddenSet = (...rows) => (visualRowIndex) => rows.indexOf(visualRowIndex) !== -1;

test('keepVisibleCopiedRows: rows hidden by a filter do not reach the clipboard', () => {
  const data = [['r0'], ['r1'], ['r2'], ['r3']];
  const removed = keepVisibleCopiedRows(data, [range(0, 3)], hiddenSet(1, 2));

  assert.equal(removed, 2);
  assert.deepEqual(data, [['r0'], ['r3']]);
});

test('keepVisibleCopiedRows: the visible rows keep their display order', () => {
  const data = [['r0'], ['r1'], ['r2'], ['r3'], ['r4']];
  keepVisibleCopiedRows(data, [range(0, 4)], hiddenSet(0, 3));

  assert.deepEqual(data, [['r1'], ['r2'], ['r4']]);
});

test('keepVisibleCopiedRows: without hidden rows the block is copied as it is', () => {
  const data = [['r0'], ['r1'], ['r2']];
  const removed = keepVisibleCopiedRows(data, [range(0, 2)], () => false);

  assert.equal(removed, 0);
  assert.deepEqual(data, [['r0'], ['r1'], ['r2']]);
});

test('keepVisibleCopiedRows: the array is edited in place, handsontable stringifies that one', () => {
  const data = [['r0'], ['r1']];
  const same = data;
  keepVisibleCopiedRows(data, [range(0, 1)], hiddenSet(0));

  assert.equal(same, data);
  assert.deepEqual(data, [['r1']]);
});

test('keepVisibleCopiedRows: the rows are matched by their range, not by their position', () => {
  // a selection that does not start at row 0: data[0] is row 5
  const data = [['r5'], ['r6'], ['r7']];
  keepVisibleCopiedRows(data, [range(5, 7)], hiddenSet(0, 6));

  assert.deepEqual(data, [['r5'], ['r7']]);
});

test('keepVisibleCopiedRows: several ranges are mapped to the rows they copied', () => {
  const data = [['r0'], ['r1'], ['r4'], ['r5']];
  keepVisibleCopiedRows(data, [range(0, 1), range(4, 5)], hiddenSet(1, 4));

  assert.deepEqual(data, [['r0'], ['r5']]);
});

test('keepVisibleCopiedRows: a selection of only hidden rows copies nothing', () => {
  const data = [['r0'], ['r1']];
  const removed = keepVisibleCopiedRows(data, [range(0, 1)], () => true);

  assert.equal(removed, 2);
  assert.deepEqual(data, []);
});

test('keepVisibleCopiedRows: missing arguments are tolerated', () => {
  assert.equal(keepVisibleCopiedRows(null, [range(0, 1)], () => true), 0);
  assert.equal(keepVisibleCopiedRows([['r0']], null, () => true), 0);
  assert.equal(keepVisibleCopiedRows([['r0']], [range(0, 0)], null), 0);
});

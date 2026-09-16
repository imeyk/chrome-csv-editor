import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  isColumnFilterEmpty,
  cellMatchesColumnFilter,
  collectColumnValues,
  countActiveFilters,
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { findCsvProblem, isTableDataEmpty, buildCsvPreview } = require('./clipboard-csv.js');

const lines = (...rows) => rows.join('\n');

/* --- findCsvProblem ------------------------------------------------------------- */

test('plain csv has no problem', () => {
  assert.equal(findCsvProblem(lines('id,name', '1,alpha')), null);
});

test('semicolon and tab separated csv have no problem', () => {
  assert.equal(findCsvProblem(lines('id;name', '1;alpha')), null);
  assert.equal(findCsvProblem(lines('id\tname', '1\talpha')), null);
});

test('a delimiter inside a quoted value is data, not a problem', () => {
  assert.equal(findCsvProblem('id,name\n1,"alpha, beta"'), null);
});

test('a newline inside a quoted value is data, not a problem', () => {
  assert.equal(findCsvProblem('id,name\n1,"alpha\nbeta"'), null);
});

test('a doubled quote inside a quoted value keeps the value open', () => {
  assert.equal(findCsvProblem('id,name\n1,"say ""hi"" twice"'), null);
});

test('empty text is reported as empty', () => {
  assert.deepEqual(findCsvProblem(''), { code: 'empty', line: 1 });
  assert.deepEqual(findCsvProblem('   \n\t \n '), { code: 'empty', line: 1 });
});

test('a non string is reported as empty rather than throwing', () => {
  assert.deepEqual(findCsvProblem(null), { code: 'empty', line: 1 });
  assert.deepEqual(findCsvProblem(undefined), { code: 'empty', line: 1 });
});

test('an unterminated quote is reported on the line it opened', () => {
  assert.deepEqual(
    findCsvProblem(lines('id,name', '1,alpha', '2,"beta', '3,gamma')),
    { code: 'unterminatedQuote', line: 3 });
});

test('an unterminated quote that spans lines still points at its opening line', () => {
  assert.deepEqual(
    findCsvProblem('id,name\n1,"alpha\nbeta\ngamma'),
    { code: 'unterminatedQuote', line: 2 });
});

test('quoteChar can be turned off, then nothing is unterminated', () => {
  assert.equal(findCsvProblem('id,name\n1,"alpha', { quoteChar: '' }), null);
});

/* --- isTableDataEmpty ----------------------------------------------------------- */

test('the editors own empty table counts as empty', () => {
  // defaultCsvContentIfEmpty (`,\n,`) parses to this
  assert.equal(isTableDataEmpty([['', ''], ['', '']]), true);
});

test('no rows at all counts as empty', () => {
  assert.equal(isTableDataEmpty([]), true);
  assert.equal(isTableDataEmpty(null), true);
});

test('whitespace only cells count as empty', () => {
  assert.equal(isTableDataEmpty([['  ', '\t'], ['', ' ']]), true);
});

test('null and undefined cells count as empty', () => {
  assert.equal(isTableDataEmpty([[null, undefined], ['', null]]), true);
});

test('a single filled cell makes the table not empty', () => {
  assert.equal(isTableDataEmpty([['', ''], ['', 'x']]), false);
});

test('a numeric zero is data, not emptiness', () => {
  assert.equal(isTableDataEmpty([[0]]), false);
});

/* --- buildCsvPreview ------------------------------------------------------------ */

const grid = (rowCount, colCount) =>
  [...Array(rowCount).keys()].map(r => [...Array(colCount).keys()].map(c => `r${r}c${c}`));

test('a small table is shown whole', () => {
  const preview = buildCsvPreview(grid(3, 4));
  assert.deepEqual(preview.rows, grid(3, 4));
  assert.deepEqual(
    [preview.totalRows, preview.totalCols, preview.hiddenRows, preview.hiddenCols],
    [3, 4, 0, 0]);
});

test('a big table is cut and reports what was cut', () => {
  const preview = buildCsvPreview(grid(40000, 20), { maxRows: 6, maxCols: 8 });
  assert.equal(preview.rows.length, 6);
  assert.equal(preview.rows[0].length, 8);
  assert.deepEqual(
    [preview.totalRows, preview.totalCols, preview.hiddenRows, preview.hiddenCols],
    [40000, 20, 39994, 12]);
});

test('the column count is the widest row, not the first one', () => {
  const preview = buildCsvPreview([['a'], ['b', 'c', 'd']]);
  assert.equal(preview.totalCols, 3);
});

test('null cells are rendered as empty strings', () => {
  const preview = buildCsvPreview([[null, undefined, 'x']]);
  assert.deepEqual(preview.rows, [['', '', 'x']]);
});

test('no rows gives an empty preview instead of throwing', () => {
  const preview = buildCsvPreview(null);
  assert.deepEqual(
    [preview.rows, preview.totalRows, preview.totalCols], [[], 0, 0]);
});

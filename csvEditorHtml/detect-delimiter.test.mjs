import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { detectDelimiter } = require('./detect-delimiter.js');

const lines = (...rows) => rows.join('\n');

test('plain comma csv', () => {
  assert.equal(detectDelimiter(lines('id,name,qty', '1,alpha,10', '2,beta,20')), ',');
});

test('plain semicolon csv', () => {
  assert.equal(detectDelimiter(lines('id;name;qty', '1;alpha;10', '2;beta;20')), ';');
});

test('tab separated', () => {
  assert.equal(detectDelimiter(lines('id\tname\tqty', '1\talpha\t10')), '\t');
});

test('pipe separated', () => {
  assert.equal(detectDelimiter(lines('id|name|qty', '1|alpha|10')), '|');
});

test('semicolons win over commas that only appear inside data values (issue #4)', () => {
  // what papaparse gets wrong: the commas are consistent across the DATA rows, so its
  // average-field-count guess picks ',' and the whole record lands in one column
  const text = lines(
    'id;mask;queries',
    '1;kurort v mesyats;a, b, c, d',
    '2;more v mesyats;e, f, g, h',
    '3;gory v mesyats;i, j, k, l');
  assert.equal(detectDelimiter(text), ';');
});

test('semicolons win when a decimal comma appears in every row', () => {
  const text = lines('id;price;share', '1;196,6;7,64', '2;105,5;0,19');
  assert.equal(detectDelimiter(text), ';');
});

test('commas win when the semicolons only live inside one text column', () => {
  const text = lines('id,name,tags', '1,alpha,"a;b;c;d;e"', '2,beta,"f;g;h;i;j"');
  assert.equal(detectDelimiter(text), ',');
});

test('delimiters inside quotes are not counted', () => {
  const text = lines('id;name', '1;"a;b;c;d;e;f;g"', '2;"h;i;j;k;l;m;n"');
  // the quoted semicolons must not inflate the count, so this is still 1 per record
  assert.equal(detectDelimiter(text), ';');
  const commas = lines('id,name', '1,"a,b,c,d"', '2,"e,f,g,h"');
  assert.equal(detectDelimiter(commas), ',');
});

test('escaped quotes ("") keep the scanner in sync', () => {
  const text = lines('id;name', '1;"say ""hi"";there"', '2;"and ""bye"";here"');
  assert.equal(detectDelimiter(text), ';');
});

test('quoted values may contain newlines', () => {
  const text = 'id;note\n1;"first line\nsecond line"\n2;"third\nfourth"\n';
  assert.equal(detectDelimiter(text), ';');
});

test('comment lines are skipped', () => {
  const text = lines('# a, comment, with, commas', 'id;name', '1;alpha', '2;beta');
  assert.equal(detectDelimiter(text, { comments: '#' }), ';');
});

test('comment lines count when no comment string is configured', () => {
  const text = lines('# a, comment, with, commas', 'id;name');
  assert.equal(detectDelimiter(text, { comments: '' }), ',');
});

test('null when the file has no delimiter at all', () => {
  assert.equal(detectDelimiter(lines('just one column', 'another row')), null);
});

test('null for empty input', () => {
  assert.equal(detectDelimiter(''), null);
  assert.equal(detectDelimiter(undefined), null);
});

test('a single line file still gets a verdict', () => {
  assert.equal(detectDelimiter('id;name;qty'), ';');
});

test('trailing newline does not create an empty record', () => {
  assert.equal(detectDelimiter('id;name\n1;alpha\n'), ';');
});

test('CRLF line endings', () => {
  assert.equal(detectDelimiter('id;name\r\n1;alpha\r\n2;beta\r\n'), ';');
});

test('comma stays the default when two candidates are equally plausible', () => {
  assert.equal(detectDelimiter(lines('a,b;c', 'd,e;f')), ',');
});

test('a delimiter missing from the header loses to one that is in it', () => {
  const text = lines('id;name', '1;a,b', '2;c,d');
  assert.equal(detectDelimiter(text), ';');
});

test('only the first records are sampled', () => {
  // 3 semicolon records, then a thousand comma ones: the sample must stay at the top
  const head = lines('id;name', '1;alpha', '2;beta');
  const tail = Array.from({ length: 1000 }, (_, i) => `${i},x,y,z`).join('\n');
  assert.equal(detectDelimiter(head + '\n' + tail, { maxRecords: 3 }), ';');
});

test('respects a custom candidate list', () => {
  assert.equal(detectDelimiter(lines('a:b:c', 'd:e:f'), { candidates: [':'] }), ':');
  assert.equal(detectDelimiter(lines('a,b,c'), { candidates: [';'] }), null);
});

test('respects a custom quote char', () => {
  const text = lines("id;name", "1;'a;b;c'", "2;'d;e;f'");
  assert.equal(detectDelimiter(text, { quoteChar: "'" }), ';');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { findUrls, toHref, mayContainUrl, KNOWN_TLDS, FILE_EXTENSION_COLLISIONS } =
  require('./url-links.js');

/** the matched substrings only - the coordinates are checked separately */
function matched(text) {
  const urls = findUrls(text);
  return urls === null ? [] : urls.map((u) => u.url);
}

test('matches a http and a https url', () => {
  assert.deepEqual(matched('http://example.com'), ['http://example.com']);
  assert.deepEqual(matched('https://example.com/a/b?x=1#frag'), ['https://example.com/a/b?x=1#frag']);
});

test('the host inside a full url is not matched a second time', () => {
  const urls = findUrls('https://example.com/page');
  assert.equal(urls.length, 1);
  assert.equal(urls[0].url, 'https://example.com/page');
});

test('matches a www url without a protocol', () => {
  assert.deepEqual(matched('www.example.com'), ['www.example.com']);
  assert.deepEqual(matched('www.example.co.uk/path'), ['www.example.co.uk/path']);
});

test('matches a bare host with a known tld', () => {
  assert.deepEqual(matched('example.com'), ['example.com']);
  assert.deepEqual(matched('shop.ru/catalog?id=7'), ['shop.ru/catalog?id=7']);
  assert.deepEqual(matched('sub.domain.example.org'), ['sub.domain.example.org']);
});

test('matches a host with a port', () => {
  assert.deepEqual(matched('example.com:8080/api'), ['example.com:8080/api']);
});

test('keeps the url verbatim, so the cell value can be rebuilt from the coordinates', () => {
  const text = 'see www.example.com now';
  const urls = findUrls(text);
  assert.equal(urls.length, 1);
  assert.equal(text.substring(urls[0].startIndex, urls[0].endIndex), 'www.example.com');
});

test('finds several urls in one cell', () => {
  assert.deepEqual(matched('a http://one.com b two.org c'), ['http://one.com', 'two.org']);
  assert.deepEqual(matched('one.com,two.ru'), ['one.com', 'two.ru']);
});

test('does not swallow trailing punctuation', () => {
  assert.deepEqual(matched('go to example.com.'), ['example.com']);
  assert.deepEqual(matched('go to example.com/a/b, then home'), ['example.com/a/b']);
  assert.deepEqual(matched('(example.com)'), ['example.com']);
});

test('plain text is not turned into a link', () => {
  for (const text of [
    'hello world',
    '3.14',
    '1.000,50',
    'report.csv',
    'config.json',
    'README.md',
    'build.sh',
    'main.rs',
    'archive.zip',
    'clip.mov',
    'script.py',
    'Иванов И.И.',
    'v1.2.3',
    '',
  ]) {
    assert.deepEqual(matched(text), [], `expected no link in ${JSON.stringify(text)}`);
  }
});

test('an e-mail address is not a link', () => {
  assert.deepEqual(matched('user@example.com'), []);
  assert.deepEqual(matched('contact: first.last@example.co.uk'), []);
});

test('the file extension collisions are kept out of the linkable tlds', () => {
  // `md` and `rs` are real country codes we deliberately refuse to link - the guard is that
  // they stay listed as known TLDs but never reach the pattern
  for (const tld of FILE_EXTENSION_COLLISIONS) {
    assert.deepEqual(matched(`name.${tld}`), [], `name.${tld} must not become a link`);
  }
  assert.ok(KNOWN_TLDS.includes('md'), 'md is still a known tld, just not a linkable one');
});

test('findUrls returns null when there is nothing to link', () => {
  assert.equal(findUrls('plain text'), null);
  assert.equal(findUrls(''), null);
  assert.equal(findUrls(null), null);
  assert.equal(findUrls(undefined), null);
});

test('findUrls is not confused by a previous call (regex lastIndex)', () => {
  assert.deepEqual(matched('example.com'), ['example.com']);
  assert.deepEqual(matched('example.com'), ['example.com']);
  assert.deepEqual(matched('a.org b.org'), ['a.org', 'b.org']);
  assert.deepEqual(matched('example.com'), ['example.com']);
});

test('toHref adds https only where a protocol is missing', () => {
  assert.equal(toHref('http://example.com'), 'http://example.com');
  assert.equal(toHref('https://example.com'), 'https://example.com');
  assert.equal(toHref('HTTPS://example.com'), 'HTTPS://example.com');
  assert.equal(toHref('www.example.com'), 'https://www.example.com');
  assert.equal(toHref('example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(toHref(''), '');
});

test('mayContainUrl gates the renderer without rejecting real urls', () => {
  assert.equal(mayContainUrl('https://example.com'), true);
  assert.equal(mayContainUrl('www.example.com'), true);
  assert.equal(mayContainUrl('example.com'), true);
  assert.equal(mayContainUrl('3.14'), false);
  assert.equal(mayContainUrl('plain text'), false);
  assert.equal(mayContainUrl(''), false);
  assert.equal(mayContainUrl(null), false);
});

test('mayContainUrl lets through everything findUrls would match', () => {
  for (const text of ['http://a.com', 'www.a.com', 'a.com', 'a.com:80/x', 'see a.ru now']) {
    assert.equal(mayContainUrl(text), true, `${text} must survive the cheap gate`);
    assert.notEqual(findUrls(text), null);
  }
});

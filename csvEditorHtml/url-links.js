// URL detection for cell values, kept free of Handsontable and of the DOM so it can be unit
// tested in node (csvEditorHtml/url-links.test.mjs). The renderer in util.ts asks here which
// parts of a cell value are links; it never decides that itself.
//
// Two kinds of links are recognized:
//   * with a protocol - `http://...` / `https://...`
//   * without one     - `www.example.com` and `example.com/page`, the second only when the
//                       last label is a TLD from KNOWN_TLDS below
//
// Why a TLD list and not "anything that looks like name.name": a CSV column is full of values
// that have a dot and are not addresses - `report.csv`, `config.json`, `README.md`, `3.14`,
// `Иванов.ИП`. Turning those into links would break the acceptance criterion that non-URL text
// stays text, and a link that opens `https://report.csv` is worse than no link at all. The list
// therefore DELIBERATELY omits real TLDs that collide with everyday file extensions - `md`
// (Moldova), `sh`, `pl`, `py`, `rs`, `so`, `zip`, `mov` - so `README.md` and `build.sh` are left
// alone. Anyone who really means such a host can write the protocol, which always wins.
//
// The protocol-less form is matched for ASCII hosts only, same as the protocol form (the
// inherited regex has always been ASCII); an IDN host like `пример.рф` needs its protocol.
//
// Found URLs are returned VERBATIM - the cell value is never rewritten. `toHref()` is what adds
// the `https://` a protocol-less link needs to be openable, and it is used for the `href` only.
(function (root) {

  // Curated, not exhaustive: generic TLDs plus the country codes a Russian/European CSV is
  // likely to contain. Everything here is checked against "could this also be a file
  // extension or a number" - see the note above.
  var KNOWN_TLDS = [
    // generic
    'com', 'org', 'net', 'int', 'edu', 'gov', 'mil', 'info', 'biz', 'name', 'pro', 'coop',
    'museum', 'travel', 'jobs', 'mobi', 'asia', 'tel', 'xxx',
    // common new gTLDs
    'app', 'dev', 'io', 'ai', 'co', 'me', 'tv', 'cc', 'online', 'site', 'store', 'shop',
    'tech', 'space', 'website', 'xyz', 'top', 'club', 'blog', 'cloud', 'agency', 'digital',
    'media', 'news', 'design', 'studio', 'email', 'life', 'world', 'group', 'team', 'wiki',
    'art', 'fun', 'link', 'live', 'today', 'zone', 'center', 'city', 'company', 'expert',
    'finance', 'fund', 'host', 'institute', 'market', 'network', 'photo', 'press', 'school',
    'services', 'software', 'solutions', 'support', 'systems', 'tools', 'video', 'works',
    // country codes
    'ru', 'su', 'ua', 'by', 'kz', 'uz', 'am', 'az', 'ge', 'kg', 'md', 'lv', 'lt', 'ee',
    'de', 'fr', 'uk', 'us', 'ca', 'au', 'nl', 'it', 'es', 'pt', 'be', 'at', 'ch', 'cz',
    'sk', 'hu', 'ro', 'bg', 'rs', 'hr', 'si', 'gr', 'tr', 'fi', 'se', 'no', 'dk', 'is',
    'ie', 'cn', 'jp', 'kr', 'in', 'id', 'th', 'vn', 'sg', 'hk', 'tw', 'il', 'ae', 'sa',
    'br', 'mx', 'ar', 'cl', 'pe', 'za', 'eg', 'nz', 'eu'
  ];

  // `md` and `rs` are country codes AND the extensions of README.md / main.rs. A CSV is far
  // more likely to hold the file name than the host, so they lose the tie: drop them from the
  // list that the protocol-less branch is built from.
  var FILE_EXTENSION_COLLISIONS = ['md', 'rs', 'sh', 'pl', 'py', 'so', 'zip', 'mov', 'ps'];

  var linkableTlds = KNOWN_TLDS.filter(function (tld) {
    return FILE_EXTENSION_COLLISIONS.indexOf(tld) === -1;
  });

  // The tail of a URL: an optional port plus an optional path/query/fragment. The last
  // character may not be punctuation so that a sentence like `see example.com/a.` does not
  // swallow its full stop - the same trick the inherited protocol regex uses.
  var TAIL = '(?::\\d{1,5})?(?:[\\/?#](?:[-A-Z0-9+&@#\\/%?=~_|$!:,.;()\\[\\]]*[-A-Z0-9+&@#\\/%=~_|$()\\]])?)?';
  var LABEL = '[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?';

  // Not preceded by anything that would make this the tail of a longer token: a letter or
  // digit (we are mid-word), a dot or hyphen (mid-host, e.g. the `com` of `a.com`), a slash
  // (mid-path) or an `@` (an e-mail address, which is not a link).
  var NOT_MID_TOKEN = '(?<![-A-Z0-9@.\\/_+%])';
  // ...and not followed by one either.
  var NOT_FOLLOWED_BY_HOST = '(?![-A-Z0-9_]|\\.[A-Z])';

  var urlPattern =
    // 1. with a protocol - the inherited pattern, unchanged, so values that worked keep working
    '(?:https?:\\/\\/[-A-Z0-9+&@#\\/%?=~_|$!:,.;]*[A-Z0-9+&@#\\/%=~_|$])' +
    '|' +
    // 2. `www.` - the user spelled out the intent, so any plausible host is accepted
    '(?:' + NOT_MID_TOKEN + 'www\\.(?:' + LABEL + '\\.)+[A-Z]{2,}' + NOT_FOLLOWED_BY_HOST + TAIL + ')' +
    '|' +
    // 3. a bare host, only with a known TLD
    '(?:' + NOT_MID_TOKEN + '(?:' + LABEL + '\\.)+(?:' + linkableTlds.join('|') + ')' + NOT_FOLLOWED_BY_HOST + TAIL + ')';

  // The alternatives are tried left to right at every position, so the protocol branch always
  // wins where it can and the host inside `https://example.com/x` is never matched on its own.
  function makeRegex() {
    return new RegExp(urlPattern, 'gi');
  }

  var scanRegex = makeRegex();

  // Cheap gate for the renderer, which runs this on every visible cell on every render: a URL
  // needs a dot followed by at least two letters, which already rules out numbers (`3.14`) and
  // most plain text. Only the survivors pay for the full scan.
  var mayContainUrlRegex = /\.[A-Z]{2,}|:\/\//i;

  function mayContainUrl(text) {
    if (typeof text !== 'string' || text === '') return false;
    return mayContainUrlRegex.test(text);
  }

  /**
   * All URLs inside `text`, in order, as `{ url, startIndex, endIndex }`.
   * Returns null when there is none (that is what the renderer branches on).
   */
  function findUrls(text) {
    if (typeof text !== 'string' || text === '') return null;

    scanRegex.lastIndex = 0;

    var urls = [];
    var match = scanRegex.exec(text);
    while (match) {
      urls.push({
        url: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });
      // a zero length match would loop forever; the pattern cannot produce one, but a guard
      // here is cheaper than finding out in a 100k row table
      if (scanRegex.lastIndex === match.index) scanRegex.lastIndex++;
      match = scanRegex.exec(text);
    }

    return urls.length === 0 ? null : urls;
  }

  /**
   * The address a found URL should actually open. A protocol-less URL gets `https://` - the
   * cell value itself is never touched, only the link target.
   */
  function toHref(url) {
    if (typeof url !== 'string' || url === '') return '';
    if (/^https?:\/\//i.test(url)) return url;
    return 'https://' + url;
  }

  var api = {
    KNOWN_TLDS: KNOWN_TLDS,
    FILE_EXTENSION_COLLISIONS: FILE_EXTENSION_COLLISIONS,
    mayContainUrl: mayContainUrl,
    findUrls: findUrls,
    toHref: toHref,
  };

  root.csvUrlLinks = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

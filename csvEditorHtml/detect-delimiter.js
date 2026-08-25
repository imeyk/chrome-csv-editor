// Delimiter detection that runs BEFORE the file is parsed.
//
// papaparse's own guess compares the average field count per delimiter, which loses on a
// very common shape: a semicolon separated file whose text columns contain comma separated
// lists. There the commas win on the data rows and the whole record ends up in one column
// (issue #4).
//
// This counts each candidate per record, ignoring anything inside quotes, and then ranks
// the candidates by, in order:
//   1. does the FIRST record (usually the header) have the same count as most records —
//      a real delimiter is in the header too, a delimiter that only appears inside data
//      values usually is not;
//   2. consistency: on how many records does the count equal the most common count;
//   3. the most common count itself — 12 columns beats 6;
//   4. the order the candidates were given, so ',' stays the default on a tie.
//
// Returns null when no candidate ever occurs, leaving the decision to papaparse.
//
// Loaded as a classic script by the editor (window.detectCsvDelimiter) and required
// directly by csvEditorHtml/detect-delimiter.test.mjs.
(function (root) {

  var DEFAULT_CANDIDATES = [',', ';', '\t', '|', String.fromCharCode(30), String.fromCharCode(31)];

  /**
   * Counts, per record, how often each candidate occurs outside of quotes.
   * A record ends at a newline that is not inside quotes, so quoted multi line values do
   * not split a record.
   */
  function countPerRecord(text, candidates, quoteChar, commentString, maxRecords) {
    var records = [];
    var counts = candidates.map(function () { return 0; });
    var inQuotes = false;
    var isFirstCharOfRecord = true;
    var isComment = false;
    var hasContent = false;

    function endRecord() {
      if (hasContent && !isComment) records.push(counts);
      counts = candidates.map(function () { return 0; });
      isFirstCharOfRecord = true;
      isComment = false;
      hasContent = false;
    }

    for (var i = 0; i < text.length && records.length < maxRecords; i++) {
      var ch = text[i];

      if (inQuotes) {
        if (ch === quoteChar) {
          // a doubled quote is an escaped quote, so stay inside the value
          if (text[i + 1] === quoteChar) i++;
          else inQuotes = false;
        }
        continue;
      }

      if (ch === '\r') continue;              // handled by the \n that follows
      if (ch === '\n') { endRecord(); continue; }

      if (isFirstCharOfRecord) {
        isFirstCharOfRecord = false;
        if (commentString && text.substr(i, commentString.length) === commentString) isComment = true;
      }
      hasContent = true;
      if (isComment) continue;

      if (quoteChar && ch === quoteChar) { inQuotes = true; continue; }

      var at = candidates.indexOf(ch);
      if (at !== -1) counts[at]++;
    }
    endRecord();
    return records;
  }

  function modeOf(values) {
    var seen = {};
    var best = 0;
    var bestHits = 0;
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      seen[v] = (seen[v] || 0) + 1;
      if (seen[v] > bestHits) { bestHits = seen[v]; best = v; }
    }
    return { value: best, hits: bestHits };
  }

  function detectDelimiter(text, options) {
    options = options || {};
    var candidates = options.candidates || DEFAULT_CANDIDATES;
    var quoteChar = options.quoteChar === undefined ? '"' : options.quoteChar;
    var commentString = typeof options.comments === 'string' && options.comments !== ''
      ? options.comments : null;
    var maxRecords = options.maxRecords || 20;

    if (!text) return null;

    var records = countPerRecord(text, candidates, quoteChar, commentString, maxRecords);
    if (records.length === 0) return null;

    var best = null;
    for (var c = 0; c < candidates.length; c++) {
      var perRecord = records.map(function (counts) { return counts[c]; });
      var mode = modeOf(perRecord);
      if (mode.value === 0) continue;                 // never occurs (outside quotes)

      var ranking = [
        perRecord[0] === mode.value ? 1 : 0,          // in the header too?
        mode.hits / perRecord.length,                 // consistency
        mode.value,                                   // number of columns it yields
        -c,                                           // given order breaks ties
      ];
      if (!best || isBetter(ranking, best.ranking)) best = { delimiter: candidates[c], ranking: ranking };
    }
    return best ? best.delimiter : null;
  }

  function isBetter(a, b) {
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] > b[i];
    }
    return false;
  }

  root.detectCsvDelimiter = detectDelimiter;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { detectDelimiter: detectDelimiter, DEFAULT_CANDIDATES: DEFAULT_CANDIDATES };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

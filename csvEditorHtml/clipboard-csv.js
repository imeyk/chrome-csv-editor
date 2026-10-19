// The parts of "import a csv from the clipboard" that are pure text/array work (issue #26).
//
// The import itself needs the editor (papaparse, handsontable, the modal), but three
// questions have nothing to do with either and are the ones that can silently go wrong:
//
//   1. is this text importable at all, and if not, WHY — the table must stay untouched and
//      the user must get a sentence, not a stack trace (findCsvProblem);
//   2. does the table currently hold data — an empty table is replaced without asking,
//      a filled one is not (isTableDataEmpty);
//   3. what does the user see before confirming — a 40k row paste must not be rendered
//      into the dialog (buildCsvPreview).
//
// Loaded as a classic script by the editor (window.findCsvProblem, ...) and required
// directly by csvEditorHtml/clipboard-csv.test.mjs.
(function (root) {

  var DEFAULT_PREVIEW_ROWS = 6;
  var DEFAULT_PREVIEW_COLS = 8;

  /**
   * Scans the text the way a csv parser would and reports the first thing that makes it
   * unimportable. Quotes are honoured, so a delimiter or a newline INSIDE a value is data
   * and not a problem.
   *
   * Returns null when the text can be parsed, else { code, line } with line 1-based:
   *   'empty'             - nothing but whitespace
   *   'unterminatedQuote' - a quoted value is still open at the end of the text
   */
  function findCsvProblem(text, options) {
    options = options || {};
    var quoteChar = options.quoteChar === undefined ? '"' : options.quoteChar;

    if (typeof text !== 'string' || text.trim() === '') return { code: 'empty', line: 1 };
    if (!quoteChar) return null;

    var inQuotes = false;
    var line = 1;
    var quoteStartedOnLine = 1;

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];

      if (ch === '\n') {
        line++;
        continue;
      }

      if (ch !== quoteChar) continue;

      if (!inQuotes) {
        inQuotes = true;
        quoteStartedOnLine = line;
        continue;
      }

      // a doubled quote is an escaped quote, so the value stays open
      if (text[i + 1] === quoteChar) i++;
      else inQuotes = false;
    }

    if (inQuotes) return { code: 'unterminatedQuote', line: quoteStartedOnLine };
    return null;
  }

  /**
   * True when the table holds nothing the user could lose. The editor's own "empty" table
   * is `,\n,` (see defaultCsvContentIfEmpty), i.e. real rows made of empty cells — so a
   * row count of zero is not the question, the cell contents are.
   *
   * Whitespace-only cells count as empty: a table of spaces is not data worth a dialog.
   */
  function isTableDataEmpty(rows) {
    if (!rows) return true;

    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      if (!row) continue;
      for (var c = 0; c < row.length; c++) {
        var cell = row[c];
        if (cell === null || cell === undefined) continue;
        if (String(cell).trim() !== '') return false;
      }
    }
    return true;
  }

  /**
   * Cuts the parsed rows down to something a dialog can show, and reports what was cut so
   * the dialog can say "+ 39 994 more rows" instead of pretending that is all there is.
   *
   * `totalCols` is the WIDEST row, not the first one: a ragged paste whose header is short
   * would otherwise under-report its own width.
   */
  function buildCsvPreview(rows, options) {
    options = options || {};
    var maxRows = options.maxRows === undefined ? DEFAULT_PREVIEW_ROWS : options.maxRows;
    var maxCols = options.maxCols === undefined ? DEFAULT_PREVIEW_COLS : options.maxCols;

    rows = rows || [];

    var totalCols = 0;
    for (var r = 0; r < rows.length; r++) {
      if (rows[r] && rows[r].length > totalCols) totalCols = rows[r].length;
    }

    var shown = [];
    for (var i = 0; i < Math.min(rows.length, maxRows); i++) {
      var row = rows[i] || [];
      shown.push(row.slice(0, maxCols).map(function (cell) {
        return cell === null || cell === undefined ? '' : String(cell);
      }));
    }

    return {
      rows: shown,
      totalRows: rows.length,
      totalCols: totalCols,
      hiddenRows: Math.max(0, rows.length - maxRows),
      hiddenCols: Math.max(0, totalCols - maxCols),
    };
  }

  root.findCsvProblem = findCsvProblem;
  root.isTableDataEmpty = isTableDataEmpty;
  root.buildCsvPreview = buildCsvPreview;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      findCsvProblem: findCsvProblem,
      isTableDataEmpty: isTableDataEmpty,
      buildCsvPreview: buildCsvPreview,
      DEFAULT_PREVIEW_ROWS: DEFAULT_PREVIEW_ROWS,
      DEFAULT_PREVIEW_COLS: DEFAULT_PREVIEW_COLS,
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

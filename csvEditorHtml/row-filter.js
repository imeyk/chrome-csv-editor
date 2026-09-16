// Row filtering logic, kept free of Handsontable and of the DOM so it can be unit tested
// in node (csvEditorHtml/row-filter.test.mjs) and reused by whoever needs the visible rows:
// the grid, the row count indicator and "Save filtered CSV" all ask the same question here.
//
// A filter of one column is `{ mode, text, values }`:
//   mode    'exact' | 'contains'  - how `text` is compared (anything else means 'contains')
//   text    the search text, compared case insensitively; '' does not restrict anything
//   values  an array of cell values to keep, or null for "no value selection"
//
// Both parts of a column filter are combined with AND. Combining the columns themselves is
// the caller's loop (it walks one column at a time, which is much cheaper than copying the
// whole table) - a row is displayed when every active column filter matches its cell.
// `values: []` (nothing checked) is an active filter that matches no row - that is what makes
// unchecking everything show an empty table instead of the full one.
//
// The text search is case insensitive because that is what people expect from a search box.
// The value selection is case sensitive and untrimmed because those values were taken from
// the column itself, so ' a' and 'a' are genuinely two entries in the list and must stay
// distinguishable (see docs/quotes.md - leading spaces are meaningful in this editor).
//
// Loaded as a classic script by the editor (window.csvRowFilter) and required directly by
// csvEditorHtml/row-filter.test.mjs.
(function (root) {

  // Reading the unique values of a column means walking the whole table, and the dropdown
  // cannot show a million checkboxes anyway, so the collection stops early and says so.
  var DEFAULT_UNIQUE_VALUES_LIMIT = 1000;

  function toText(value) {
    if (value === null || value === undefined) return '';
    return typeof value === 'string' ? value : String(value);
  }

  /**
   * @param {any} filter
   * @returns {boolean} true when the filter (or its absence) keeps every row
   */
  function isColumnFilterEmpty(filter) {
    if (!filter) return true;
    if (Array.isArray(filter.values)) return false;
    return toText(filter.text) === '';
  }

  /**
   * @param {any} value the raw cell value
   * @param {any} filter
   * @returns {boolean}
   */
  function cellMatchesColumnFilter(value, filter) {
    if (isColumnFilterEmpty(filter)) return true;

    var cell = toText(value);

    if (Array.isArray(filter.values) && filter.values.indexOf(cell) === -1) return false;

    var text = toText(filter.text);
    if (text === '') return true;

    var haystack = cell.toLowerCase();
    var needle = text.toLowerCase();
    return filter.mode === 'exact' ? haystack === needle : haystack.indexOf(needle) !== -1;
  }

  /**
   * @param {any[]} columnValues every cell of one column, e.g. from hot.getDataAtCol()
   * @param {number} [limit] stop after this many distinct values
   * @returns {{values: string[], truncated: boolean}} the distinct values, ascending
   */
  function collectColumnValues(columnValues, limit) {
    var max = typeof limit === 'number' ? limit : DEFAULT_UNIQUE_VALUES_LIMIT;
    var seen = {};
    var values = [];
    var truncated = false;

    if (columnValues) {
      for (var i = 0; i < columnValues.length; i++) {
        var cell = toText(columnValues[i]);
        // prefixed so that values like 'toString' or '__proto__' cannot collide with
        // anything on the object prototype
        var key = '#' + cell;
        if (seen[key]) continue;
        if (values.length === max) {
          truncated = true;
          break;
        }
        seen[key] = true;
        values.push(cell);
      }
    }

    values.sort(compareValues);
    return { values: values, truncated: truncated };
  }

  function compareValues(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'variant' });
  }

  /**
   * @param {Object} filters column index (as key) -> column filter
   * @returns {number} how many columns actually filter something
   */
  function countActiveFilters(filters) {
    var count = 0;
    if (!filters) return count;

    for (var key in filters) {
      if (!Object.prototype.hasOwnProperty.call(filters, key)) continue;
      if (!isColumnFilterEmpty(filters[key])) count++;
    }
    return count;
  }

  var api = {
    DEFAULT_UNIQUE_VALUES_LIMIT: DEFAULT_UNIQUE_VALUES_LIMIT,
    isColumnFilterEmpty: isColumnFilterEmpty,
    cellMatchesColumnFilter: cellMatchesColumnFilter,
    collectColumnValues: collectColumnValues,
    countActiveFilters: countActiveFilters,
  };

  root.csvRowFilter = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

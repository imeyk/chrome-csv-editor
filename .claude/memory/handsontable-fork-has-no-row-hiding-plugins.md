---
name: handsontable-fork-has-no-row-hiding-plugins
description: The vendored Handsontable 6.5.5 fork ships no filters/hiddenRows/trimRows/dropdownMenu plugin, so hiding rows is hand-rolled through rowHeights and a derived index array
metadata:
  type: project
---

`thirdParty/handsontable/handsontable.min.js` is a **custom fork of 6.5.5**
(`thirdParty/handsontable/info.md`: `github.com/janisdd/handsontable`, branch
`forCsvEdit6.2.2`), and several plugins one would reach for are simply **not in the
bundle**. Registered plugins are: autoColumnSize, autofill, autoRowSize, comments,
contextMenu, CopyPaste, customBorders, dragToScroll, manualColumnFreeze,
ManualColumnMove, manualColumnResize, ManualRowMove, manualRowResize, mergeCells,
multipleSelectionHandles, observeChanges, persistentState, search, touchScroll,
columnSorting.

**Missing: `Filters`, `DropdownMenu`, `HiddenRows`, `HiddenColumns`, `TrimRows`,
`NestedHeaders`, `MultiColumnSorting`, `CollapsibleColumns`, `Formulas`, `ExportFile`.**

The trap: `thirdParty/handsontable/handsontable.d.ts` **declares** all of them, and
`DefaultSettings` still lists `hiddenRows` / `trimRows` / `nestedHeaders` keys. So
`hot.getPlugin('filters')` or a `hiddenRows: {...}` setting type-checks and compiles
cleanly, then does nothing at runtime. The bundle also keeps the hook names
(`afterTrimRow`, `beforeDropdownMenuShow`), a `FiltersAction` inside UndoRedo and all the
`FILTERS_*` i18n constants, so grepping for a name is not evidence the plugin is there —
grep for `registerPlugin` instead.

Hiding rows is therefore hand-rolled (upstream comment in `ui.ts`: "inspired by
.../plugins/hiddenRows/hiddenRows.js"):

* `rowHeights()` returns `0.000001` for a hidden row — the row is still rendered and still
  counted by `countRows()`, it is only collapsed. `colWidths()` does the same for columns.
* `hiddenPhysicalRowIndicesSorted` (physical indices) is **derived**: it is the union of
  `commentHiddenPhysicalRowIndices` and `filterHiddenPhysicalRowIndices`, and only
  `_updateHiddenPhysicalRowIndices()` writes it. Change a source, then call that function.
  It keeps `hiddenPhysicalRowIndicesLookup` in sync, which is what `rowHeights()` reads —
  a plain array scan there is quadratic, since it runs per row per render.
* Both sources are shifted when rows are inserted/removed (`beforeRemoveRow`,
  `afterCreateRow`); `firstAndLastVisibleRows` has to be recomputed with them.
* Keyboard navigation skips hidden rows/cols in `beforeSetRangeStart`.

The upside, and the reason row filtering (issue #18) was built on this rather than on a
plugin: because rows are only hidden, `hot.getData()` still returns the **whole** file, so
normal saving keeps writing every row while a filter is active. Anything that needs the
visible rows instead (the `Rows count` indicator, `Save filtered CSV`) reads the same
hidden-row set the renderer uses, which is what keeps them from disagreeing.

Related: [[webview-ui-toolkit-not-loaded]]

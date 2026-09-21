---
name: copy-drops-hidden-rows
description: Ctrl+C copies only the displayed rows because beforeCopy edits handsontable's block in place; the hook is the only copy path and copyableRanges is always a single normalized range
metadata:
  type: project
---

Copying a selection skips the rows that are hidden (issue #23). The whole mechanism is
`beforeCopy` in `csvEditorHtml/ui.ts` calling `_removeHiddenRowsFromCopiedData`, which
delegates the index arithmetic to `csvRowFilter.keepVisibleCopiedRows` in
`csvEditorHtml/row-filter.js` (unit tested in `row-filter.test.mjs`).

What the vendored fork actually does (`thirdParty/handsontable/handsontable.min.js`, the
CopyPaste plugin) — grepped, not guessed:

* `onCopy` builds `data = getRangedData(this.copyableRanges)` and then does
  `if (!!runHooks('beforeCopy', data, copyableRanges)) { stringify(data); arrayToTable(data) }`.
  `Hooks.run` only replaces its first argument when a handler returns something other than
  `undefined`, so **the hook must mutate `data` in place** and return nothing. Returning a
  new array does nothing; returning `false` cancels the copy outright.
* `getRangedData` walks each range from `startRow` to `endRow`, skipping rows it already
  collected, so `data[i]` is the i-th row of that walk — that is what
  `copiedRowIndices(ranges)` reproduces.
* `setCopyableText` pushes exactly **one** range, from `getTopLeftCorner()` /
  `getBottomRightCorner()` of the last selection, so `startRow <= endRow` always and
  multi-range ctrl+click selections never reach the clipboard as several ranges. The
  multi-range handling is kept anyway because `modifyCopyableRange` could add some.

The rows to drop come from `hiddenPhysicalRowIndicesLookup`, i.e. the **union** the
renderer uses — filter-hidden *and* comment-hidden rows — so the clipboard can never
disagree with the screen (see [[handsontable-fork-has-no-row-hiding-plugins]]).

`cut` (`beforeCut`) was deliberately left alone: it clears the cells of the whole selected
range, hidden rows included, so a clipboard that skipped them would not match what was
emptied.

There is no copy item in the context menu (`ui.ts` lists its `items` explicitly), and the
`Copy column name(s)` item and the preview copy icon do not go through the selection, so
`beforeCopy` is the only path that needed the fix.

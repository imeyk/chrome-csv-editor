---
name: handsontable-paste-target-is-the-cell-editor
description: in the bundled handsontable fork the copy/paste focus target and the cell editor are the same textarea.handsontableInput, so only getActiveEditor().isOpened() tells "table focused" from "editing a cell"
metadata:
  type: project
---

Newer handsontable builds give the CopyPaste plugin its own hidden
`<textarea id="HandsontableCopyPaste" class="copyPaste">`. **The fork in `thirdParty/` never
creates it.** Measured in headless chromium over `sandbox.html`: `document.activeElement` is
`textarea.handsontableInput` (inside `.handsontableInputHolder`) both when the table merely
has focus and while a cell is being edited, and
`hot.getPlugin('copyPaste').focusableElement.getFocusableElement()` returns that same node.

So a paste listener cannot tell the two apart by element identity — the only signal is
`hot.getActiveEditor().isOpened()` (false = table focused, true = cell editor open). That is
what `shouldInterceptPaste()` in `ui.ts` keys off. Guarding on `#HandsontableCopyPaste` looks
right, compiles, and silently never fires.

Two more traps in the same plugin:

- `paste()` really takes `(pastableText, pastableHtml)`, not the `triggeredByClick` boolean
  the `.d.ts` used to declare. **Pass the second argument as `''`**: left out it defaults to
  the text, which then also lands in the synthetic event as `text/html` and handsontable
  parses the csv as markup instead of as a block of cells.
- that paste splits columns by TAB, not by the csv delimiter — clipboard table data is tsv.
  Pasting `a,b` into a selection fills ONE cell with `a,b`, which is correct behaviour and
  not a bug in the import path.

See [[webview-ui-toolkit-not-loaded]] and
[[handsontable-fork-has-no-row-hiding-plugins]] — same lesson, same fork: its `.d.ts`
describes upstream, the bundle is what runs.

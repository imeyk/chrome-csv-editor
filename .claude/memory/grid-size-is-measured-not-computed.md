---
name: grid-size-is-measured-not-computed
description: onResizeGrid measures #csv-editor-wrapper instead of subtracting toolbars from the page, and the min-width/min-height:0 chain around it is what keeps that measurement honest
metadata:
  type: project
---

The handsontable grid has no layout of its own: `onResizeGrid` (`csvEditorHtml/ui.ts`) hands
it an explicit `width`/`height`. Since issue #30 those two numbers are **measured** on
`#csv-editor-wrapper` (`clientWidth`/`clientHeight`), the element that clips the grid, and
never derived from the page size minus the toolbars.

The arithmetic version was wrong twice over and in a way that is invisible in a screenshot:
it never subtracted the 150px `#side-panel`, so the grid came out exactly as wide as the
whole page and its right edge — where handsontable renders the **vertical** scrollbar, and
where the last column ends up — was clipped away by the wrapper's `overflow: hidden`. The
progress bar row was missing from the height too.

Three CSS facts the measurement depends on; break any of them and the grid is sized to a
space the window cannot show:

- `html, body { margin: 0 }`. The user agent's 8px margin plus `height: 100%` made the
  document 16px taller than the window, and `overflow: hidden` cut the bottom off — the
  grid's **horizontal** scrollbar among it.
- `.side-paneled { min-width: 0; min-height: 0 }`. It is a flex item, so its automatic
  minimum size is its content: the side panel's stats (~260px) grew the row past the bottom
  of the page in a short window. `overflow: hidden` would also stop it but clips the panel's
  tooltips.
- `.csv-editor-wrapper { min-width: 0; min-height: 0 }`, so the grid it clips can never
  stretch the element that is being measured for it.

Diagnose with geometry, not with a screenshot: `#csv-editor` / `.ht_master .wtHolder`
`getBoundingClientRect()` against `#csv-editor-wrapper` on both axes — any positive
`editorRight - wrapperRight` or `editorBottom - wrapperBottom` is a clipped scrollbar — plus
`documentElement.scrollHeight` against `window.innerHeight`. The fast repro needs no
extension: launch chromium with `--allow-file-access-from-files`, open
`csvEditorHtml/sandbox.html`, and feed it
`window.postMessage({command:'csvUpdate', csvContent:{text, sliceNr:1, totalSlices:1}}, '*')`.

`csvEditorHtml/test/suite/gridLayout/gridLayout.test.ts` pins all of it against the real
markup and the real stylesheet (it fetches `sandbox.html` and loads `main.css`, with the page
inside a fixed-size host that stands in for a short window). The javascript half — that
`onResizeGrid` reads the wrapper — is not reachable from `testFe`, because `ui.ts` is not
loaded there; it is pinned only by the comment and by that measurement.

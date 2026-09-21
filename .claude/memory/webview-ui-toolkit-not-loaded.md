---
name: webview-ui-toolkit-not-loaded
description: The Chrome build never loads @vscode/webview-ui-toolkit, so every <vscode-*> tag in sandbox.html is an inert unknown element
metadata:
  type: project
---

`csvEditorHtml/sandbox.html` does **not** load `@vscode/webview-ui-toolkit`. The VS Code
build injects it (`src/getHtml.ts`, the `${toolkit}` script tag) and edit-csv.net loads it
explicitly (`csvEditorHtml/browser/indexBrowser.html`), but the extension never did.

Consequences, and the rule that follows:

* Every `<vscode-checkbox>` / `<vscode-dropdown>` / `<vscode-text-area>` / `<vscode-radio>`
  inherited from upstream stays an **unknown inline element**: no widget, `onchange` never
  fires, `.checked` is `undefined`. This is what issue #17 was — the controls were in the
  DOM but invisible and dead.
* `slot="start"` / `slot="end"` on the children of a `<vscode-button>` are **inert too**:
  there is no shadow root, so the attributes name nothing and the spans are laid out as
  ordinary flow content. Upstream's button put the gap between the icon and the label in
  its own shadow DOM, which is why every icon sat flush against its text until #22 gave
  `vscode-button` an explicit `gap` in `extension-controls.css`. Anything the toolkit's
  shadow DOM used to contribute has to be restated there.
* The toolkit also defines the design tokens `main.css` styles from (`--input-background`,
  `--dropdown-border`, `--corner-radius`, `--design-unit`, `--input-height`, `--border-width`).
  Without it they resolve to nothing, so those rules silently do nothing.

**So: never add a `<vscode-*>` interactive control to `sandbox.html`.** Use plain
`input` / `select` / `textarea` — the editor's TypeScript already treats all of them as
`HTMLInputElement` and only touches `.checked` / `.value`, so native elements are drop-in
(upstream itself did this for `<vscode-text-field>`). Styling for them, and the tokens the
leftover presentational `<vscode-button>`s need, live in `csvEditorHtml/extension-controls.css`.

Pulling the toolkit in instead was considered and rejected: it needs `npm install` plus
vendoring into `thirdParty/`, and it is built to read the `--vscode-*` palette that only
VS Code injects.

Related: [[encoding-options-are-host-driven]]

---
name: encoding-options-are-host-driven
description: The editor's Encoding read/write dropdowns are filled and driven by the host page, not by the editor's own TypeScript
metadata:
  type: project
---

The two `Encoding` dropdowns in the options bar (`read-option-encoding`,
`write-option-encoding`) have **no logic in the editor's TypeScript**. In VS Code the
encoding is the editor host's business; edit-csv.net has its own iconv-based
implementation in `csvEditorHtml/browser/browser.ts`, which the extension does not ship.

In the Chrome extension the host owns the bytes, so the wiring runs across the frame
boundary (added for issue #17):

* `extension/editor-host.mjs` keeps `currentFile.bytes` and posts `encodingInfo`
  (the list from `extension/lib/encodings.mjs`, the current choices, the detected encoding,
  and `canReread`) to the sandbox after every load.
* `csvEditorHtml/host-bridge.js` fills both `<select>`s from that message and posts
  `setReadEncoding` / `setWriteEncoding` back.
* A read encoding change re-decodes the **same bytes** and re-sends `csvUpdate` — the same
  path a dropped file takes, so the table is rebuilt from scratch.

Two constraints worth knowing before touching the list:

* `SUPPORTED_ENCODINGS` may only contain encodings the extension can also **write**.
  `TextEncoder` does utf-8 only; `decode-text.mjs` adds utf-16 and the single byte
  encodings (by reversing the decoder table). An entry that cannot be written would make
  "save" fall back to utf-8 without telling anyone. `encodings.test.mjs` asserts this.
* The context-menu path hands the file over through `chrome.storage.session`, which only
  holds JSON — hence `extension/lib/base64.mjs`. If a path ever delivers text instead of
  bytes, the host sets `canReread: false` and the read dropdown is disabled.

Related: [[webview-ui-toolkit-not-loaded]]

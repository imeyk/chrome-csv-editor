---
name: clicked-urls-open-through-the-host-page
description: the editor page is sandboxed, so a tab it opens inherits the sandbox - clicked urls go to editor-host.mjs over postMessage and are opened with chrome.tabs.create
metadata:
  type: project
---

The editor runs in a sandboxed extension page:

```json
"content_security_policy": { "sandbox": "sandbox allow-scripts allow-forms allow-modals allow-popups; …" },
"sandbox": { "pages": ["csvEditorHtml/sandbox.html"] }
```

`allow-popups` is there but **`allow-popups-to-escape-sandbox` is not**, and sandbox flags are
inherited by whatever a sandboxed document opens. So a `target="_blank"` link or a `window.open`
inside the editor produces a *sandboxed, null origin* tab: it may paint, but it carries no
cookies and no storage, so every site that needs a session is broken. The default navigation of
an `<a href>` is therefore never an option here, no matter how the link is built.

The route that works, and the one `csvHostOpenUrl` in `host-bridge.js` takes: post the url to the
host frame (`extension/editor-host.mjs`, a normal extension page) and let it open the tab. Two
things that are not obvious there:

- **`chrome.tabs.create`, not `window.open`.** The open is delayed by the double click window
  (a plain click must not open a tab on the way into the cell editor), so the transient user
  activation a `window.open` needs may be gone and the popup blocker would eat it.
  `chrome.tabs.create` needs no activation and no `tabs` permission.
- **The scheme is validated in the host.** That url came out of a CSV cell, i.e. from untrusted
  data, and the host page is privileged - only `http(s)` is ever opened, never `javascript:`,
  `data:` or a `chrome-extension:` page.

The same delegation already existed for the file picker (`csvHostOpen`), for a different reason
(user activation propagating to the parent frame). Related:
[[initial-config-is-undefined-in-the-chrome-build]].

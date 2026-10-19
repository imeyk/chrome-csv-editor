---
name: initial-config-is-undefined-in-the-chrome-build
description: sandbox.html sets initialConfig to undefined, so every editor feature gated on `initialConfig?.someFlag` is silently off in the Chrome extension
metadata:
  type: project
---

`csvEditorHtml/sandbox.html` opens with

```html
<script>var initialConfig = undefined; var initialVars = undefined;</script>
```

In VS Code that object carries the user's `csv-edit.*` settings; here there is no settings host,
so it stays `undefined` forever (`util.ts` → `applyInitialConfig` returns early on it, which is
also why the comment buttons are hidden there). Consequence: **any inherited feature written as
`initialConfig?.someFlag ? … : …` evaluates to the false branch in the Chrome build** - the
feature is dead, and nothing logs or warns.

That is exactly how issue #27 came to be. URL links were fully implemented in the fork and
gated on `initialConfig?.convertUrlsToLinkTags`, so the Chrome editor rendered every url as
plain text and the feature looked missing rather than disabled.

The working pattern is the one `highlightCsvComments` already used: a module level `let` in
`main.ts` holding the **default**, overwritten from `initialConfig` only where it exists:

```ts
let convertUrlsToLinkTags: boolean = true          // main.ts
convertUrlsToLinkTags = initialConfig.convertUrlsToLinkTags   // util.ts, after the undefined guard
```

So when porting any other inherited setting, grep for `initialConfig?.` first - every hit is a
feature that is off in this build, whatever `src/configurationHelper.ts` lists as its default.
Related: [[webview-ui-toolkit-not-loaded]], [[clicked-urls-open-through-the-host-page]].

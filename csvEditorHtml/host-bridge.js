// Emulates the VS Code webview API so the unmodified editor talks to our host page.
// Loaded as a classic script BEFORE out/main.js, which calls acquireVsCodeApi() at top level.
(function () {
  var api = {
    postMessage: function (msg) { window.parent.postMessage(msg, '*'); },
    getState: function () { return undefined; },
    setState: function () { /* no-op */ }
  };
  // main.ts: `if (typeof acquireVsCodeApi !== 'undefined') { vscode = acquireVsCodeApi() }`
  window.acquireVsCodeApi = function () { return api; };
})();

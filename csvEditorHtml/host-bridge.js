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

  // Theme: follow the browser/OS light-dark preference. The editor's CSS keys
  // off the `vscode-dark` / `vscode-light` body classes (VS Code webview
  // convention); we just pick which one based on prefers-color-scheme.
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function applyTheme() {
    var dark = mq ? mq.matches : true;
    var b = document.body;
    b.classList.remove('vscode-dark', 'vscode-light');
    b.classList.add(dark ? 'vscode-dark' : 'vscode-light');
    var bg = dark ? '#1e1e1e' : '#ffffff';
    document.documentElement.style.background = bg;
    b.style.background = bg;
  }
  applyTheme();
  if (mq) {
    // addEventListener('change') is the modern API; guard for older engines.
    if (mq.addEventListener) mq.addEventListener('change', applyTheme);
    else if (mq.addListener) mq.addListener(applyTheme);
  }
})();

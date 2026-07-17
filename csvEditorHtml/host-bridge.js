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

  // The editor's message handler THROWS on any command it doesn't recognize
  // (io.ts -> _error -> posts a 'msgBox', which — if the editor is ever running
  // top-level, i.e. window.parent === window — loops straight back and cascades).
  // Our host<->sandbox messages ('openedFile', 'openFilePicker', 'ready', 'apply', …)
  // must never reach that handler. Swallow anything that is NOT one of the editor's
  // real inbound commands, in the capture phase, before its bubble-phase listener runs.
  var EDITOR_INBOUND = {
    csvUpdate: 1, applyPress: 1, applyAndSavePress: 1,
    changeFontSizeInPx: 1, sourceFileChanged: 1
  };
  window.addEventListener('message', function (e) {
    var cmd = e && e.data && e.data.command;
    if (cmd && !EDITOR_INBOUND[cmd]) e.stopImmediatePropagation();
  }, true);

  // "Open CSV" button in the editor header delegates to the host frame, where the
  // file picker + File System Access live. Called synchronously from the button's
  // click so the user activation propagates to the parent frame.
  window.csvHostOpen = function () {
    window.parent.postMessage({ command: 'openFilePicker' }, '*');
  };

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

  // Drag & drop a .csv onto the editor. Handled here (inside the sandboxed iframe)
  // because the iframe covers the page, so OS drag events land here — not on the
  // host frame. We read the file locally and hand its text to the host, which
  // renders it (no File System Access handle → saving falls back to download).
  function dragHasFiles(e) {
    var t = e.dataTransfer && e.dataTransfer.types;
    return t && Array.prototype.indexOf.call(t, 'Files') !== -1;
  }
  function setOverlay(show) {
    var o = document.getElementById('ext-drop-overlay');
    if (o) o.style.display = show ? 'flex' : 'none';
  }
  // NOTE: listeners run in the CAPTURE phase (3rd arg = true) and stopPropagation,
  // so a file drop is intercepted before Handsontable's own drop handlers see it
  // (those sit on the table and would otherwise fire first and throw on a File).
  var dragDepth = 0;
  window.addEventListener('dragenter', function (e) {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth++;
    setOverlay(true);
  }, true);
  window.addEventListener('dragover', function (e) {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  window.addEventListener('dragleave', function (e) {
    if (!dragHasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) setOverlay(false);
  }, true);
  window.addEventListener('drop', function (e) {
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth = 0;
    setOverlay(false);
    var file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result);
      if (window.parent && window.parent !== window) {
        // inside editor.html's iframe: let the host load it (keeps save state)
        window.parent.postMessage({ command: 'openedFile', name: file.name, text: text }, '*');
      } else {
        // editor opened top-level (no host frame): feed the editor directly
        window.postMessage({ command: 'csvUpdate', csvContent: { text: text, sliceNr: 1, totalSlices: 1 } }, '*');
      }
    };
    reader.readAsText(file);
  }, true);
})();

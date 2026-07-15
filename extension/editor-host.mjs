// Task 1 walking skeleton: send a hardcoded CSV on 'ready', log 'apply'.
const frame = document.getElementById('editor-frame');
const HARDCODED_CSV = 'a,b,c\n1,2,3\n4,5,6\n';

window.addEventListener('message', (e) => {
  if (e.source !== frame.contentWindow) return;
  const msg = e.data || {};
  if (msg.command === 'ready') {
    frame.contentWindow.postMessage(
      { command: 'csvUpdate', csvContent: { text: HARDCODED_CSV, sliceNr: 1, totalSlices: 1 } },
      '*'
    );
  } else if (msg.command === 'apply') {
    console.log('[host] apply received. saveSourceFile =', msg.saveSourceFile);
    console.log('[host] csv:\n' + msg.csvContent);
  }
});

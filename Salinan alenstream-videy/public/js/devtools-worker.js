"use strict";

// Worker: menerima pesan { moreDebugs: number }.
// Akan postMessage({ isOpenBeat: true }) -> jalankan debugger spam -> postMessage({ isOpenBeat: false })
// Jika DevTools terbuka (atau worker debugger aktif) maka 'debugger' akan membuat pause dan
// memungkinkan deteksi oleh main thread.

onmessage = function (ev) {
  const more = (ev && ev.data && ev.data.moreDebugs) ? ev.data.moreDebugs : 0;

  // signal start (main bisa menganggap ini "probe attempt")
  postMessage({ isOpenBeat: true });

  try {
    // One immediate debugger — will pause if devtools attached to worker
    // (Note: worker debugger only pauses if DevTools is open and worker is being paused)
    debugger;

    // Optional spam of extra 'debugger' statements to amplify effect
    for (let i = 0; i < more; i++) {
      // eslint-disable-next-line no-debugger
      debugger;
    }
  } catch (e) {
    // ignore
  }

  // signal end
  postMessage({ isOpenBeat: false });
};

// devtools-guardian.js
(function (root = window) {
  const REDIRECT = "https://google.com";   // ganti jika perlu
  const PING_INTERVAL = 900;               // ms, seberapa sering ping worker
  const WORKER_MORE_DEBUGS = 40;           // jumlah debugger spam yang dikirim ke worker
  const POST_DETECT_DELAY = 1200;          // ms sebelum redirect setelah deteksi
  const SIZE_THRESHOLD = 160;              // window outer/inner threshold

  // state
  let worker = null;
  let detected = false;
  let pingTimer = null;

  // create worker
  try {
    worker = new Worker("/js/devtools-worker.js");
  } catch (e) {
    console.warn("DevtoolsGuardian: worker create failed", e);
    worker = null;
  }

  // handle messages from worker
  if (worker) {
    worker.onmessage = function (ev) {
      try {
        const d = ev.data || {};
        // Worker sends { isOpenBeat:true } then { isOpenBeat:false }
        if (d.isOpenBeat === true) {
          // Worker started probe — ignore
          return;
        }
        if (d.isOpenBeat === false) {
          // worker finished probe
          // NOTE: we rely on the fact that if worker paused at debugger while DevTools open,
          // worker's onmessage handling and postMessage ordering will reveal abnormal timing;
          // however to be simpler: we'll detect by measuring probe timing (see pingProbe below)
          return;
        }
      } catch (err) { /* noop */ }
    };
  }

  // Utility: size probe (docked DevTools)
  function sizeProbe() {
    try {
      const wDiff = Math.abs((root.outerWidth || 0) - (root.innerWidth || 0));
      const hDiff = Math.abs((root.outerHeight || 0) - (root.innerHeight || 0));
      return wDiff > SIZE_THRESHOLD || hDiff > SIZE_THRESHOLD;
    } catch (e) {
      return false;
    }
  }

  // timing probe on main thread (mirrors earlier working approach)
  function timingProbe() {
    try {
      const t0 = performance.now();
      // will pause here if breakpoints are active in main thread
      // eslint-disable-next-line no-eval
      eval("debugger");
      const diff = performance.now() - t0;
      return diff > 140;
    } catch (e) {
      return false;
    }
  }

  // ping worker and detect by measuring round-trip timing
  // we send a message and measure time until worker posts end (we'll adapt: worker sends start & end)
  function pingProbeWithWorker(callback) {
    if (!worker) {
      callback(false);
      return;
    }

    let start = performance.now();
    let seenStart = false;
    let seenEnd = false;
    const timeout = setTimeout(() => {
      // if worker didn't respond in time, treat as possible detection
      cleanup();
      callback(true);
    }, 1500); // if worker doesn't finish quickly, assume paused/inspected

    function onMessage(ev) {
      const d = ev.data || {};
      if (d.isOpenBeat === true) {
        seenStart = true;
        // mark start
        start = performance.now();
        return;
      }
      if (d.isOpenBeat === false && seenStart) {
        seenEnd = true;
        const took = performance.now() - start;
        cleanup();
        // if the worker took abnormally long, assume DevTools paused worker
        const suspicious = took > 250; // threshold, tune as needed
        callback(suspicious);
        return;
      }
    }

    function cleanup() {
      clearTimeout(timeout);
      worker.removeEventListener("message", onMessage);
    }

    worker.addEventListener("message", onMessage);

    // trigger worker probe
    try {
      worker.postMessage({ moreDebugs: WORKER_MORE_DEBUGS });
    } catch (e) {
      cleanup();
      callback(false);
    }
  }

  function triggerDetected(reason) {
    if (detected) return;
    detected = true;
    console.warn("DevToolsGuardian: detected ->", reason);

    // best-effort: try to stop normal media and UI
    try {
      document.querySelectorAll("video,audio").forEach(m => { try { m.pause(); m.src = ""; } catch (e) {} });
      // remove player element if you want: (optional)
      const p = document.getElementById("player");
      if (p) p.remove();
    } catch (e) {}

    // ask worker to spam more if available (extra aggressive)
    try {
      if (worker) worker.postMessage({ moreDebugs: 200 });
    } catch (e) {}

    // redirect shortly after
    setTimeout(() => {
      try { root.location.replace(REDIRECT); } catch (e) { /* ignore */ }
    }, POST_DETECT_DELAY);
  }

  // main detect function combines probes
  function detectOnce(cb) {
    try {
      if (sizeProbe()) {
        if (cb) cb(true, "size");
        else triggerDetected("size");
        return;
      }
      if (timingProbe()) {
        if (cb) cb(true, "timing");
        else triggerDetected("timing");
        return;
      }

      // worker ping for more robust detection
      pingProbeWithWorker((suspicious) => {
        if (suspicious) {
          if (cb) cb(true, "worker");
          else triggerDetected("worker");
        } else {
          if (cb) cb(false);
        }
      });
    } catch (e) {
      if (cb) cb(false);
    }
  }

  // initial immediate check
  detectOnce((hit, reason) => {
    if (hit) {
      triggerDetected(reason || "initial");
    }
  });

  // periodic detection
  pingTimer = setInterval(() => {
    if (detected) {
      clearInterval(pingTimer);
      return;
    }
    detectOnce((hit, reason) => {
      if (hit) triggerDetected(reason || "periodic");
    });
  }, PING_INTERVAL);

  // keyboard shortcuts detection (F12 etc)
  root.addEventListener("keydown", (e) => {
    const key = (e.key || "").toUpperCase();
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    if (key === "F12" || (ctrl && shift && ["I","J","C"].includes(key)) || (ctrl && key === "U")) {
      e.preventDefault();
      triggerDetected("shortcut");
    }
  }, true);

  // Expose API to test / disable while developing
  root.__DevtoolsGuardian = {
    isDetected: () => detected,
    forceDetect: (reason) => triggerDetected(reason || "manual"),
    testProbe: (cb) => detectOnce(cb),
    destroy: () => {
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      if (worker) { worker.terminate(); worker = null; }
    }
  };
})(window);

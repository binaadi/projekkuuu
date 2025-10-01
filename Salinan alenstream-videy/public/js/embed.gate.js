// embed.gate.js
// Load embed.js normally; monitor devtools in background. If detected:
// 1) remove player, 2) spam debugger to freeze DevTools, 3) after spamDuration ms -> redirect.

(function (root = window) {
  const EMBED_SRC = "/js/embed.js"; // path ke embed kamu
  const PLYR_SRC  = "https://cdn.jsdelivr.net/npm/plyr@3.7.8/dist/plyr.polyfilled.min.js";
  const HLS_SRC   = "https://cdn.jsdelivr.net/npm/hls.js@latest";

  // Config
  const CFG = {
    sizeThreshold: 160,      // outer-inner difference (docked)
    pollMs: 400,             // polling for console probe
    spamIntervalMs: 120,     // spam tick interval
    spamPerTick: 12,         // how many debugger calls per tick
    spamDurationMs: 3000,    // run spam for this long before redirect (3s)
    redirectOnDetect: true,  // true => redirect after spamDuration, false => stay (but page killed)
    redirectTo: "https://google.com",
    debug: false
  };

  // internal state
  let detected = false;
  let spamIntervalId = null;
  let redirectTimeoutId = null;

  function log(...args) { if (CFG.debug) console.log("[EmbedGate]", ...args); }

  // Remove embed + libs + player elements
  function removeEmbedAndPlayer() {
    try {
      // remove embed script tags referencing EMBED_SRC
      document.querySelectorAll(`script[src*="${EMBED_SRC}"]`).forEach(el => el.remove());
      // remove any plyr/hls libs loaded by earlier page
      document.querySelectorAll(`script[src*="plyr"], script[src*="hls.js"]`).forEach(el => el.remove());

      // remove known player DOM pieces
      ["player", "overlayContainer", "loadingOverlay"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
      });

      // additionally try to stop any playing media
      document.querySelectorAll("video,audio").forEach(m => {
        try { m.pause(); m.src = ""; } catch(_) {}
      });
    } catch (e) { /* ignore */ }
  }

  // blank page stealth (optional) - we'll remove content then spam/redirect
  function blankPage() {
    try {
      document.documentElement.innerHTML = "";
      document.write("");
      document.close();
    } catch (e) {}
  }

  // spam debugger (will pause if DevTools open)
  function spamDebuggerTick(times) {
    try {
      for (let i = 0; i < times; i++) {
        // eslint-disable-next-line no-debugger
        debugger;
      }
    } catch (e) { /* ignore */ }
  }

  function startSpamming() {
    if (spamIntervalId) return;
    spamIntervalId = setInterval(() => spamDebuggerTick(CFG.spamPerTick), CFG.spamIntervalMs);
    log("started spam debugger");
  }

  function stopSpamming() {
    if (!spamIntervalId) return;
    clearInterval(spamIntervalId);
    spamIntervalId = null;
    log("stopped spam debugger");
  }

  function scheduleRedirect() {
    if (!CFG.redirectOnDetect) return;
    if (redirectTimeoutId) return;
    redirectTimeoutId = setTimeout(() => {
      try {
        // stop spam first (best-effort)
        stopSpamming();
        // redirect user
        root.location.replace(CFG.redirectTo);
      } catch (e) {}
    }, CFG.spamDurationMs);
  }

  // Reaction when detect
  function onDetect(reason) {
    if (detected) return;
    detected = true;
    log("DevTools detected:", reason);

    // remove player & embed resources so CDN URLs are not available in DOM
    removeEmbedAndPlayer();

    // optionally blank page (stealth)
    blankPage();

    // start spam to make DevTools painful to use
    startSpamming();

    // schedule redirect after spamDuration
    scheduleRedirect();
  }

  // === PROBES ===
  function sizeProbe() {
    try {
      const wDiff = Math.abs((root.outerWidth || 0) - (root.innerWidth || 0));
      const hDiff = Math.abs((root.outerHeight || 0) - (root.innerHeight || 0));
      return wDiff > CFG.sizeThreshold || hDiff > CFG.sizeThreshold;
    } catch (e) { return false; }
  }

  // console getter probe — triggers getter when console tries to inspect object
  function consoleGetterProbe() {
    try {
      let opened = false;
      const marker = new Image();
      Object.defineProperty(marker, "id", {
        get: function () { opened = true; return ""; },
        configurable: true
      });
      // console.dir is slightly more likely to trigger than console.log in some browsers
      console.dir(marker);
      return opened;
    } catch (e) {
      return false;
    }
  }

  // === LOAD DEPENDENCIES & EMBED ===
  function loadScript(src, onload) {
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.referrerPolicy = "no-referrer";
    if (typeof onload === "function") s.onload = onload;
    document.head.appendChild(s);
    return s;
  }

  function loadDependenciesThenEmbed() {
    // load Plyr -> Hls -> embed (if needed)
    // If you already include Plyr/Hls in HTML, you can skip this chaining.
    loadScript(PLYR_SRC, () => {
      loadScript(HLS_SRC, () => {
        loadScript(EMBED_SRC);
        log("embed + deps loaded");
      });
    });
  }

  // === INIT: load embed first, then monitor in background ===

  // 1) Load embed and its libs immediately so normal users see video prompt
  loadDependenciesThenEmbed();

  // 2) Background monitor (poll console getter + size probe)
  const pollTimer = setInterval(() => {
    if (detected) {
      clearInterval(pollTimer);
      return;
    }
    try {
      if (sizeProbe()) {
        onDetect("size-probe");
        clearInterval(pollTimer);
        return;
      }
      if (consoleGetterProbe()) {
        onDetect("console-getter");
        clearInterval(pollTimer);
        return;
      }
    } catch (e) {}
  }, CFG.pollMs);

  // 3) Listen for resize (dock case)
  root.addEventListener("resize", () => {
    if (detected) return;
    if (sizeProbe()) onDetect("resize");
  }, { passive: true });

  // 4) Block common shortcuts (F12, Ctrl+Shift+I, Ctrl+U) and detect
  root.addEventListener("keydown", (e) => {
    try {
      const k = (e.key || "").toUpperCase();
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      if (
        k === "F12" ||
        (ctrl && shift && ["I", "J", "C"].includes(k)) ||
        (ctrl && k === "U")
      ) {
        e.preventDefault(); e.stopPropagation();
        onDetect("shortcut");
      }
    } catch (ex) { /* ignore */ }
  }, true);

  // expose API for dev/testing
  root.__EmbedGate = {
    isDetected: () => detected,
    stopSpam: () => { stopSpamming(); if (redirectTimeoutId) { clearTimeout(redirectTimeoutId); redirectTimeoutId = null; } },
    loadEmbedNow: () => { if (!detected) loadDependenciesThenEmbed(); },
    setRedirectOnDetect: (v) => { CFG.redirectOnDetect = !!v; },
    setDebug: (v) => { CFG.debug = !!v; }
  };

})(window);

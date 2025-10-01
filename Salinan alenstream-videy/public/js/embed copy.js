(async () => {
    const token = location.pathname.split("/").pop();
    const res = await fetch("/api/videos/by-token/" + encodeURIComponent(token));
    if (!res.ok) { alert("❌ Video tidak ditemukan"); return; }

    const v = await res.json();
    const video = document.getElementById("player");
    const overlayContainer = document.getElementById("overlayContainer");
    const clickOverlay = document.getElementById("clickOverlay");
    const loadingOverlay = document.getElementById("loadingOverlay");

    const adLink = "https://example.com/directlink"; // ganti iklanmu
    let clickCount = 0;
    let viewHit = false;

    // Tentukan URL final
    let videoUrl = v.video_id;
    let useIframe = false;
    if (v.source === "videy") {
      videoUrl = `https://cdn.videy.co/${encodeURIComponent(v.video_id)}.mp4`;
    } else if (v.source?.includes("dood")) {
      videoUrl = `https://dsvplay.com/e/${encodeURIComponent(v.video_id)}`; useIframe = true;
    } else if (v.source?.includes("videq")) {
      videoUrl = `https://videq.pw/e/${encodeURIComponent(v.video_id)}`; useIframe = true;
    } else if (v.source?.includes("lixstream")) {
      videoUrl = `https://lixstream.com/e/${encodeURIComponent(v.video_id)}`; useIframe = true;
    }

    // Kalau iframe → ganti kontainer
    if (useIframe) {
      document.getElementById("videoContainer").innerHTML = `
        <iframe src="${videoUrl}" allow="autoplay; fullscreen; encrypted-media"
        allowfullscreen style="width:100%;height:100%;border:0;"></iframe>`;
      return;
    }

    // Pasang source sejak awal
    if (videoUrl.endsWith(".m3u8")) {
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(videoUrl);
        hls.attachMedia(video);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = videoUrl;
        video.load();
      }
    } else if (videoUrl.endsWith(".mp4")) {
      video.src = videoUrl;
      video.load();
    }

    const plyr = new Plyr(video, {
      controls: ['play','progress','current-time','mute','volume','fullscreen'],
    });

    // Tampilkan frame pertama begitu siap
    video.addEventListener("loadeddata", () => {
      video.pause(); // stop biar ga autoplay
    });

    // Overlay klik
    clickOverlay.addEventListener("click", () => {
      clickCount++;
      if (clickCount === 1) {
        openPopup(adLink);
      } else if (clickCount === 2) {
        overlayContainer.style.display = "none";
        loadingOverlay.style.display = "flex";
        plyr.play().catch(()=>{});
      }
    });

    // Spinner hilang kalau siap main
    video.addEventListener("canplay", () => { loadingOverlay.style.display = "none"; });
    video.addEventListener("playing", () => { loadingOverlay.style.display = "none"; });

    // Hit view sekali aja
    video.addEventListener("playing", async () => {
      if (!viewHit) {
        viewHit = true;
        try { await fetch("/api/videos/" + v.id + "/view", { method:"POST" }); } catch {}
      }
    });

    function openPopup(url) {
      const a = document.createElement("a");
      a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
      document.body.appendChild(a); a.click(); a.remove();
    }
  })();
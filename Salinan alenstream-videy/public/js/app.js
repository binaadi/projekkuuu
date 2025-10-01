import { v4 as uuidv4 } from "https://cdn.jsdelivr.net/npm/uuid@11.0.3/+esm";


async function getMe() {
  const r = await fetch("/api/auth/me", { credentials: "include" });
  return r.ok ? r.json() : null;
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  location.href = "/";
}

// Helper validasi password
function validatePassword(password) {
  const minLength = 6;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  return password.length >= minLength && hasUpper && hasLower;
}

// Helper validasi email
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

document.addEventListener("DOMContentLoaded", async () => {
  // Ensure visitorId untuk Videy upload
  if (!localStorage.getItem("visitorId")) {
    localStorage.setItem("visitorId", uuidv4());
  }

  document.getElementById("btnLogout")?.addEventListener("click", (e) => {
    e.preventDefault();
    logout();
  });

   // ===== LOGIN =====
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = document.getElementById("loginUsername").value.trim();
      const password = document.getElementById("loginPassword").value;

      if (!username || !password) {
        alert("Isi username dan password.");
        return;
      }

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));
      if (data.success) {
        location.href = "/dashboard";
      } else {
        alert(data.error || "Login gagal, cek username/password.");
      }
    });
  }

  // ===== REGISTER =====
  const registerForm = document.getElementById("registerForm");
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = document.getElementById("registerUsername").value.trim();
      const email = document.getElementById("registerEmail").value.trim();
      const password = document.getElementById("registerPassword").value;

      // Validasi username
      if (username.length < 3) {
        alert("Username minimal 3 karakter.");
        return;
      }

      // Validasi email
      if (!validateEmail(email)) {
        alert("Masukkan email yang valid.");
        return;
      }

      // Validasi password
      if (!validatePassword(password)) {
        alert("Password minimal 6 karakter, harus ada huruf besar & huruf kecil.");
        return;
      }

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));
      if (data.success) {
        alert("Register berhasil 🎉, silakan login.");
        location.href = "/index.html";
      } else {
        alert(data.error || "Register gagal.");
      }
    });
  }


  // ===== DASHBOARD =====
  if (location.pathname === "/dashboard") {
    const me = await getMe();
    if (!me) {
      location.href = "/";
      return;
    }

    async function loadStats() {
      try {
        const r = await fetch("/api/stats", { credentials: "include" });
        if (!r.ok) return;
        const data = await r.json();

        // Today
        document.getElementById("viewsToday").textContent =
          data.today.viewsToday ?? 0;
        document.getElementById("earningsToday").textContent =
          data.today.earningsToday ?? "0.0000";

        // Total
        document.getElementById("balance").textContent =
          data.total.balance ?? "0.0000";
        document.getElementById("withdrawn").textContent =
          data.total.withdrawn ?? "0.0000";
        document.getElementById("totalEarnings").textContent =
          data.total.lifetime ?? "0.0000";

        // Weekly Chart (kalau ada canvas)
        if (document.getElementById("statsChart")) {
          const ctx = document.getElementById("statsChart").getContext("2d");
          new Chart(ctx, {
            type: "line",
            data: {
              labels: data.weekly.map((d) => d.date),
              datasets: [
                {
                  label: "Views",
                  data: data.weekly.map((d) => d.views),
                  borderColor: "#0d6efd",
                  backgroundColor: "rgba(13,110,253,0.1)",
                  tension: 0.3,
                  fill: true,
                },
                {
                  label: "Earnings ($)",
                  data: data.weekly.map((d) => (d.earnings ?? 0).toFixed(4)),

                  borderColor: "#16a34a",
                  backgroundColor: "rgba(22,163,74,0.1)",
                  tension: 0.3,
                  fill: true,
                },
              ],
            },
            options: {
              responsive: true,
              plugins: { legend: { position: "top" } },
              scales: { y: { beginAtZero: true } },
            },
          });
        }
      } catch (e) {
        console.error("Gagal load stats:", e);
      }
    }

    loadStats();
    setInterval(loadStats, 10000); // refresh tiap 10s
  }

  // ===== VIDEOS LIST =====
  if (location.pathname === "/videos") {
    const me = await getMe();
    if (!me) {
      location.href = "/";
      return;
    }
    let page = 1;
    const list = document.getElementById("videoList");
    const pageInfo = document.getElementById("pageInfo");

    async function load() {
      const r = await fetch(`/api/videos?page=${page}&limit=50`, {
        credentials: "include",
      });
      const d = await r.json();
      list.innerHTML = "";
      (d.items || []).forEach((v) => {
        const row = document.createElement("div");
        row.className = "video-row";
        const embed = `${location.origin}/e/${v.embed_token}`;
        row.innerHTML = `
          <div>
            <div><strong>${v.title}</strong> <span class="badge">${v.source}</span></div>
            <div class="small">Views: ${v.views} • Token: <code>${v.embed_token}</code></div>
          </div>
          <div>
            <a class="link" href="${embed}" target="_blank">Open Embed</a>
          </div>
        `;
        list.appendChild(row);
      });
      const total = d.total || 0;
      const totalPages = Math.max(1, Math.ceil(total / d.limit));
      pageInfo.textContent = `${page} / ${totalPages}`;
      document.getElementById("prevPage").disabled = page <= 1;
      document.getElementById("nextPage").disabled = page >= totalPages;
    }

    document
      .getElementById("prevPage")
      .addEventListener("click", () => {
        page = Math.max(1, page - 1);
        load();
      });
    document
      .getElementById("nextPage")
      .addEventListener("click", () => {
        page = page + 1;
        load();
      });
    load();
  }

  // ===== UPLOAD (Videy) =====
  if (location.pathname === "/upload") {
    const me = await getMe();
    if (!me) {
      location.href = "/";
      return;
    }

    const form = document.getElementById("uploadForm");
    const msg = document.getElementById("uploadMsg");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = document.getElementById("title").value.trim();
      const file = document.getElementById("file").files[0];
      if (!title || !file) {
        alert("isi judul & pilih file");
        return;
      }

      msg.textContent = "Uploading ke Videy...";
      const fd = new FormData();
      fd.append("file", file);

      const visitorId = localStorage.getItem("visitorId") || "";
      let videoId = "";
      try {
        const res = await fetch(
          `https://videy.co/api/upload?visitorId=${encodeURIComponent(visitorId)}`,
          { method: "POST", body: fd }
        );
        const result = await res.json();
        const link = result?.link || "";
        const u = new URL(link);
        videoId = u.searchParams.get("id") || link.split("/").pop();
      } catch {
        msg.textContent = "Upload gagal ke Videy.";
        return;
      }

      // simpan metadata di server kita
      const r2 = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, source: "videy", video_id: videoId }),
        credentials: "include",
      });
      const d2 = await r2.json().catch(() => ({}));
      if (d2.id) {
        msg.textContent = "Sukses! Mengarahkan ke daftar video...";
        setTimeout(() => (location.href = "/videos"), 700);
      } else {
        msg.textContent = "Gagal simpan metadata lokal.";
      }
    });
  }
});

// server/routes/videos.js
import express from "express";
import crypto from "crypto";
import db from "../db.js";
import { authenticateToken } from "../middleware/auth.js";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";


const router = express.Router();
const SECRET = process.env.STREAM_SECRET || "streaming-secret";

/**
 * Generate token unik buat embed link
 */
function generateToken(length = 9) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const chars = alphabet.length;
  let token = "";
  for (let i = 0; i < length; i++) {
    const rand = crypto.randomInt(0, chars);
    token += alphabet[rand];
  }
  return token;
}

/**
 * Normalisasi sumber video (videy, dood, videq, lixstream, dll)
 */
function normalizeVideo(sourceUrl) {
  try {
    const u = new URL(sourceUrl);
    if (u.hostname.includes("videy")) {
      return { source: "videy", video_id: u.pathname.split("/").pop() };
    }
    if (u.hostname.includes("dood") || u.hostname.includes("dsvplay")) {
      return { source: "doodstream", video_id: u.pathname.split("/").pop() };
    }
    if (u.hostname.includes("videq")) {
      return { source: "videq", video_id: u.pathname.split("/").pop() };
    }
    if (u.hostname.includes("lixstream")) {
      return { source: "lixstream", video_id: u.pathname.split("/").pop() };
    }
    return { source: u.hostname, video_id: sourceUrl };
  } catch {
    return { source: "unknown", video_id: sourceUrl };
  }
}

/**
 * ➕ Tambah video
 */
router.post("/", authenticateToken, (req, res) => {
  const { title, video_id, source } = req.body || {};
  if (!title || !video_id) {
    return res.status(400).json({ error: "title & video_id required" });
  }

  const embed_token = generateToken();

  db.run(
    "INSERT INTO videos(user_id,title,source,video_id,embed_token) VALUES(?,?,?,?,?)",
    [req.user.id, title, source || "videy", video_id, embed_token],
    function (err) {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json({ id: this.lastID, embed_token });
    }
  );
});

/**
 * 📄 List video user
 */
router.get("/", authenticateToken, (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10), 1), 100);
  const offset = (page - 1) * limit;

  db.get("SELECT COUNT(*) as total FROM videos WHERE user_id = ?", [req.user.id], (err, cnt) => {
    if (err) return res.status(500).json({ error: "DB error" });

    db.all(
      "SELECT id,title,source,video_id,embed_token,views,created_at FROM videos WHERE user_id=? ORDER BY id DESC LIMIT ? OFFSET ?",
      [req.user.id, limit, offset],
      (err2, rows) => {
        if (err2) return res.status(500).json({ error: "DB error" });
        res.json({ items: rows || [], total: cnt.total, page, limit });
      }
    );
  });
});

/**
 * 🔗 Ambil video public by token
 */
router.get("/by-token/:token", (req, res) => {
  const t = String(req.params.token || "");
  db.get(
    "SELECT id,title,source,video_id,embed_token,views,created_at FROM videos WHERE embed_token = ?",
    [t],
    (err, row) => {
      if (err) return res.status(500).json({ error: "DB error" });
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json(row);
    }
  );
});

/**
 * 🌍 Tambah video via remote link
 */
router.post("/remote", authenticateToken, (req, res) => {
  const { title, sourceUrl } = req.body || {};
  if (!title || !sourceUrl) {
    return res.status(400).json({ error: "Judul & URL wajib." });
  }

  const { source, video_id } = normalizeVideo(sourceUrl);
  const embed_token = generateToken();

  db.run(
    "INSERT INTO videos (user_id,title,source,video_id,embed_token) VALUES (?,?,?,?,?)",
    [req.user.id, title, source, video_id, embed_token],
    function (err) {
      if (err) return res.status(500).json({ error: "Gagal simpan DB." });
      res.json({ success: true, embed_token });
    }
  );
});

/**
 * ✏️ Rename video
 */
router.put("/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: "Judul wajib." });

  db.run(
    "UPDATE videos SET title = ? WHERE id = ? AND user_id = ?",
    [title, id, req.user.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: "Video tidak ditemukan" });
      res.json({ success: true });
    }
  );
});

/**
 * ❌ Hapus video
 */
router.delete("/:id", authenticateToken, (req, res) => {
  db.run("DELETE FROM videos WHERE id=? AND user_id=?", [req.params.id, req.user.id], function(err){
    if (err) return res.status(500).json({ success:false, error:err.message });
    if (this.changes === 0) return res.status(404).json({ success:false, error:"Video tidak ditemukan" });
    res.json({ success:true });
  });
});

/**
 * 👁️ Hitung view + earnings (maks 2 view/IP/24 jam per video)
 */
router.post("/:id/view", (req, res) => {
  const { id } = req.params;
  const rawIp =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket.remoteAddress || "0.0.0.0";
  const ip = rawIp.replace(/^::ffff:/, "").replace(/^::1$/, "127.0.0.1");
  const ipHash = crypto.createHash("sha256").update(ip).digest("hex");

  db.get(
    `SELECT COUNT(id) AS cnt FROM views WHERE video_id = ? AND ip_hash = ? AND created_at >= datetime('now','-24 hours')`,
    [id, ipHash],
    (err, row) => {
      if (err) return res.status(500).json({ error: "DB error" });
      if ((row?.cnt ?? 0) >= 2) {
        return res.json({ success: true, counted: false, reason: "quota_exceeded" });
      }

      db.run("INSERT INTO views(video_id, ip_hash) VALUES(?,?)", [id, ipHash], function (err2) {
        if (err2) return res.status(500).json({ error: "DB error" });

        db.run("UPDATE videos SET views = views + 1 WHERE id = ?", [id]);
        db.get("SELECT user_id FROM videos WHERE id=?", [id], (err3, video) => {
          if (!err3 && video) {
            const amount = 0.0008; // $0.8 CPM
            const today = new Date().toISOString().slice(0, 10);

            db.run(
              `INSERT INTO earnings(user_id, balance, withdrawn)
               VALUES (?, ?, 0)
               ON CONFLICT(user_id) DO UPDATE SET 
                 balance = balance + excluded.balance,
                 updated_at = CURRENT_TIMESTAMP`,
              [video.user_id, amount]
            );

            db.run(
              `INSERT INTO daily_stats (user_id, date, views, earnings)
               VALUES (?, ?, 1, ?)
               ON CONFLICT(user_id, date) DO UPDATE SET
                 views = daily_stats.views + 1,
                 earnings = daily_stats.earnings + ?`,
              [video.user_id, today, amount, amount]
            );
          }
        });

        res.json({ success: true, counted: true });
      });
    }
  );
});

/**
 * 🔑 Generate signed streaming URL (60 detik)
 */
router.get("/:id/signed", authenticateToken, (req, res) => {
  db.get("SELECT id, video_id, source FROM videos WHERE id=? AND user_id=?", [req.params.id, req.user.id], (err, video) => {
    if (err) return res.status(500).json({ error: "DB error" });
    if (!video) return res.status(404).json({ error: "Video tidak ditemukan" });

    const token = jwt.sign({ vid: video.id }, SECRET, { expiresIn: "60s" });
    res.json({ url: `/api/videos/${video.id}/stream?token=${token}` });
  });
});

/**
 * 🎥 Proxy streaming video (signed)
 */
router.get("/:id/stream", async (req, res) => {
  try {
    const payload = jwt.verify(req.query.token, SECRET);
    if (parseInt(req.params.id, 10) !== payload.vid) {
      return res.status(403).send("Invalid token");
    }

    db.get("SELECT video_id, source FROM videos WHERE id=?", [req.params.id], async (err, video) => {
      if (err || !video) return res.status(404).send("Video not found");

      let cdnUrl;
      if (video.source === "videy") {
        cdnUrl = `https://cdn.videy.co/${video.video_id}.mp4`;
      } else if (video.source === "doodstream") {
        cdnUrl = `https://dsvplay.com/e/${video.video_id}`;
      } else if (video.source === "videq") {
        cdnUrl = `https://videq.pw/e/${video.video_id}`;
      } else if (video.source === "lixstream") {
        cdnUrl = `https://lixstream.com/e/${video.video_id}`;
      } else {
        cdnUrl = video.video_id; // fallback direct
      }

      const response = await fetch(cdnUrl);
      if (!response.ok) return res.status(500).send("Failed to fetch video");

      res.setHeader("Content-Type", "video/mp4");
      response.body.pipe(res);
    });
  } catch {
    res.status(403).send("Token expired/invalid");
  }
});

export default router;

import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookieOpts } from "../middleware/requireAuth.js";
import db from "../db.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";
const isProd = process.env.NODE_ENV === "production";

// tabel users
// tabel users (dengan role)
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user', -- 👈 tambahin role
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Kalau table users sudah pernah dibuat tanpa kolom role → tambahkan alter table biar gak error
  db.run(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`, (err) => {
    if (err && !err.message.includes("duplicate column name")) {
      console.error("❌ Error alter users table:", err.message);
    }
  });
});


function strongPassword(pw="") { return pw.length >= 6; }

// REGISTER: username + email + password
router.post("/register", (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password) {
    return res.status(400).json({ error: "Username, email, dan password wajib." });
  }
  if (username.length < 3) return res.status(400).json({ error: "Username minimal 3 karakter." });
  if (!strongPassword(password)) return res.status(400).json({ error: "Password minimal 6 karakter." });

  const hash = bcrypt.hashSync(password, 10);
  const stmt = db.prepare("INSERT INTO users(username,email,password) VALUES(?,?,?)");
  stmt.run(username, email, hash, function (err) {
    if (err) {
      if (String(err.message).includes("UNIQUE")) {
        return res.status(409).json({ error: "Username atau email sudah dipakai." });
      }
      return res.status(500).json({ error: "Gagal daftar." });
    }
    return res.json({ success: true });
  });
});

// LOGIN: username + password
// LOGIN: user biasa (bukan admin)
router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Username & password wajib." });
  }

  db.get("SELECT id,username,email,password,role FROM users WHERE username = ?", [username], (err, row) => {
    if (err) return res.status(500).json({ error: "DB error." });
    if (!row) return res.status(401).json({ error: "Username atau password salah." });

    // ❌ Tolak kalau role = admin
    if (row.role === "admin") {
      return res.status(403).json({ error: "Gunakan halaman login admin." });
    }

    const ok = bcrypt.compareSync(password, row.password);
    if (!ok) return res.status(401).json({ error: "Username atau password salah." });

    const payload = { id: row.id, username: row.username, email: row.email, role: row.role };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "1d" });

    res.cookie("token", token, { ...cookieOpts(isProd), maxAge: 24 * 60 * 60 * 1000 });
    return res.json({ success: true });
  });
});


// ME
router.get("/me", (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.json(null);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json(decoded);
  } catch {
    res.json(null);
  }
});

// LOGOUT
router.post("/logout", (req, res) => {
  res.clearCookie("token", cookieOpts(isProd));
  res.json({ success: true });
});

export default router;

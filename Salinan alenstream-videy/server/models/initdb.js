// server/models/initdb.js
import db from "../db.js";

export function initDB() {
  db.serialize(() => {
    // Tabel video
    db.run(`CREATE TABLE IF NOT EXISTS videos(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      video_id TEXT NOT NULL,
      embed_token TEXT UNIQUE NOT NULL,
      views INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Tabel earnings
    db.run(`CREATE TABLE IF NOT EXISTS earnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      balance REAL DEFAULT 0,
      withdrawn REAL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Tabel daily_stats
    db.run(`CREATE TABLE IF NOT EXISTS daily_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      views INTEGER DEFAULT 0,
      earnings REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, date),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Tabel views
    db.run(`CREATE TABLE IF NOT EXISTS views(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id INTEGER NOT NULL,
      ip_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Index biar gak duplikat
    db.run(`CREATE INDEX IF NOT EXISTS idx_views_video_ip_time
            ON views (video_id, ip_hash, created_at)`);

    // Tabel withdraw
    db.run(`CREATE TABLE IF NOT EXISTS withdraws (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
  });
}

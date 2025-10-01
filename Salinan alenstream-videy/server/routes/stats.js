import express from "express";

import db from "../db.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();
// const db = new sqlite3.Database("./db/database.sqlite");

router.get("/", authenticateToken, (req, res) => {
  const userId = req.user.id;

  let todayData = { viewsToday: 0, earningsToday: "0.0000" };
  let totalData = { balance: "0.0000", withdrawn: "0.0000", lifetime: "0.0000" };
  let weeklyData = [];

  const today = new Date().toISOString().slice(0, 10);

  db.serialize(() => {
    // 1️⃣ Today → ambil dari daily_stats
    db.get(
      `SELECT views, earnings 
       FROM daily_stats 
       WHERE user_id = ? AND date = ?`,
      [userId, today],
      (err, row) => {
        if (!err && row) {
          todayData = {
            viewsToday: row.views || 0,
            earningsToday: (row.earnings || 0).toFixed(4),
          };
        }

        // 2️⃣ Total → dari earnings
        db.get(
          `SELECT balance, withdrawn 
           FROM earnings 
           WHERE user_id = ?`,
          [userId],
          (err2, row2) => {
            if (!err2 && row2) {
              const balance = row2.balance || 0;
              const withdrawn = row2.withdrawn || 0;
              const lifetime = balance + withdrawn;
              totalData = {
                balance: balance.toFixed(4),
                withdrawn: withdrawn.toFixed(4),
                lifetime: lifetime.toFixed(4),
              };
            }

            // 3️⃣ Weekly → dari daily_stats
            // 3️⃣ Weekly → dari daily_stats
db.all(
  `SELECT date, views, earnings 
   FROM daily_stats 
   WHERE user_id = ? 
     AND date >= DATE('now','-6 days')
   ORDER BY date ASC`,
  [userId],
  (err3, rows) => {
    if (!err3 && rows) {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - i);
        const iso = d.toISOString().slice(0, 10);
        days.push(iso);
      }

      weeklyData = days.map(day => {
        const row = rows.find(r => r.date === day);
        return {
          date: day,
          views: row ? row.views : 0,
          earnings: row ? Number(row.earnings) : 0,
        };
      });
    }


                // ✅ Kirim response final
                res.json({
                  today: todayData,
                  total: totalData,
                  weekly: weeklyData,
                });
              }
            );
          }
        );
      }
    );
  });
});

// ... router.get("/") tetap seperti sebelumnya

// 🔥 Riwayat harian lengkap
router.get("/history", authenticateToken, (req, res) => {
  const userId = req.user.id;

  db.all(
    `SELECT date, views, earnings
     FROM daily_stats
     WHERE user_id = ?
     ORDER BY date DESC
     LIMIT 30`, // default 30 hari terakhir (bisa diganti lebih panjang)
    [userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });

      const history = rows.map(r => ({
        date: r.date,
        views: r.views,
        earnings: Number(r.earnings).toFixed(4),
      }));

      res.json(history);
    }
  );
});


export default router;

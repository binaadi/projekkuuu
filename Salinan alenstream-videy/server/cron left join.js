// server/cron.js
import cron from "node-cron";
import db from "./db.js";

// Scheduler: rekap & hapus views tiap jam 7 pagi WIB
cron.schedule(
  "0 7 * * *",
  () => {
    db.serialize(() => {
      // Pastikan tabel daily_stats ada
      db.run(`
        CREATE TABLE IF NOT EXISTS daily_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          date TEXT NOT NULL,
          views INTEGER DEFAULT 0,
          earnings REAL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, date),
          FOREIGN KEY(user_id) REFERENCES users(id)
        )
      `);

      // Rekap views per user → daily_stats
      db.run(
        `
        INSERT INTO daily_stats (user_id, date, views, earnings)
        SELECT 
          COALESCE(v.user_id, 0) as user_id, -- kalau video sudah dihapus
          DATE(vw.created_at) as date,
          COUNT(vw.id) as views,
          COUNT(vw.id) * 0.0008 as earnings
        FROM views vw
        LEFT JOIN videos v ON vw.video_id = v.id
        GROUP BY COALESCE(v.user_id, 0), DATE(vw.created_at)
        ON CONFLICT(user_id, date) DO UPDATE SET
          views = excluded.views,
          earnings = excluded.earnings
        `,
        function (err) {
          if (err) {
            console.error("[purge-views] daily_stats error:", err.message);
          } else {
            console.log(`[purge-views] Rekap ${this.changes} rows ke daily_stats`);
          }
        }
      );

      // Kosongkan tabel views setelah direkap
      db.run("DELETE FROM views", function (err) {
        if (err) return console.error("[purge-views] DELETE error:", err.message);
        console.log(`[purge-views] Deleted ${this.changes} rows from views`);

        // Vacuum biar DB tetap ramping
        db.run("VACUUM", (err2) => {
          if (err2) console.error("[purge-views] VACUUM error:", err2.message);
          else console.log("[purge-views] VACUUM done");
        });
      });
    });
  },
  { timezone: "Asia/Jakarta" }
);

console.log("⏰ Cron job aktif (rekap & purge views jam 7 pagi WIB).");

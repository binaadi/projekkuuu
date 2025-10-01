// server/routes/admin.js
import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookieOpts } from "../middleware/requireAuth.js";

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";
const isProd = process.env.NODE_ENV === "production";


const router = express.Router();

// Lihat semua withdraw request (admin only)
router.get("/withdraws", requireAuth, requireAdmin, (req, res) => {
  db.all(
    "SELECT w.*, u.username FROM withdraws w JOIN users u ON w.user_id = u.id ORDER BY w.id DESC",
    [],
    (err, rows = []) => {
      if (err) return res.status(500).send("DB error");
      res.render("admin-withdraws", {
        layout: "admin-layout",  // 👈 pakai layout khusus admin
        title: "Manage Withdraws",
        activePage: "admin-withdraws",
        user: req.user,
        withdraws: rows
      });
    }
  );
});

// // Update status withdraw (admin only)
// router.post("/withdraws/:id/status", requireAuth, requireAdmin, (req, res) => {
//   const { id } = req.params;
//   const { status } = req.body; // "approved" / "rejected" / "pending"

//   if (!["approved", "rejected", "pending"].includes(status)) {
//     return res.status(400).send("Status tidak valid");
//   }

//   db.run("UPDATE withdraws SET status = ? WHERE id = ?", [status, id], function (err) {
//     if (err) return res.status(500).send("DB error");
//     if (this.changes === 0) return res.status(404).send("Withdraw tidak ditemukan");
//     res.redirect("/admin/withdraws");
//   });
// });



// Update status withdraw (admin only)
router.post("/withdraws/:id/status", requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // "approved" / "rejected" / "pending"

  if (!["approved", "rejected", "pending"].includes(status)) {
    return res.status(400).send("Status tidak valid");
  }

  // Ambil data withdraw dulu
  db.get("SELECT * FROM withdraws WHERE id = ?", [id], (err, wd) => {
    if (err) return res.status(500).send("DB error");
    if (!wd) return res.status(404).send("Withdraw tidak ditemukan");

    // Kalau status = rejected dan sebelumnya masih pending → saldo dikembalikan
    if (status === "rejected" && wd.status === "pending") {
      db.run(
        `UPDATE earnings 
           SET balance = balance + ?, 
               withdrawn = withdrawn - ?,
               updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [wd.amount, wd.amount, wd.user_id],
        (err2) => {
          if (err2) return res.status(500).send("DB error (rollback saldo)");

          // Update status withdraw → rejected
          db.run("UPDATE withdraws SET status = ? WHERE id = ?", [status, id], function (err3) {
            if (err3) return res.status(500).send("DB error");
            res.redirect("/admin/withdraws");
          });
        }
      );
    } else {
      // Normal update (approve, set pending, dsb)
      db.run("UPDATE withdraws SET status = ? WHERE id = ?", [status, id], function (err4) {
        if (err4) return res.status(500).send("DB error");
        res.redirect("/admin/withdraws");
      });
    }
  });
});




// Halaman login admin
router.get("/login", (req, res) => {
  res.render("admin-login", { layout: false });
});

// Proses login admin
router.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
    if (err) return res.status(500).send("DB error");
    if (!row || row.role !== "admin") {
      return res.status(403).send("❌ Bukan admin");
    }

    const ok = bcrypt.compareSync(password, row.password);
    if (!ok) return res.status(401).send("Password salah");

    const payload = { id: row.id, username: row.username, role: row.role };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "1d" });

    res.cookie("token", token, { ...cookieOpts(isProd), maxAge: 24 * 60 * 60 * 1000 });
    res.redirect("/admin/dashboard");
  });
});

// Admin dashboard
router.get("/dashboard", requireAuth, requireAdmin, (req, res) => {
  db.serialize(() => {
    db.get("SELECT COUNT(*) AS totalUsers FROM users", (err1, usersRow) => {
      db.get("SELECT COUNT(*) AS totalVideos FROM videos", (err2, videosRow) => {
        db.get("SELECT COUNT(*) AS pendingWithdraws FROM withdraws WHERE status = 'pending'", (err3, wdRow) => {
          if (err1 || err2 || err3) return res.status(500).send("DB error");
          res.render("admin-dashboard", {
            layout: "admin-layout",
            title: "Admin Dashboard",
            activePage: "admin-dashboard",
            user: req.user,
            stats: {
              totalUsers: usersRow.totalUsers,
              totalVideos: videosRow.totalVideos,
              pendingWithdraws: wdRow.pendingWithdraws
            }
          });
        });
      });
    });
  });
});


// =============================
// Users Management (admin only)
// =============================

// Daftar semua user
router.get("/users", requireAuth, requireAdmin, (req, res) => {
  db.all("SELECT id, username, email, role, created_at FROM users ORDER BY id DESC", [], (err, rows = []) => {
    if (err) return res.status(500).send("DB error");
    res.render("admin-users", {
      layout: "admin-layout",
      title: "Manage Users",
      activePage: "admin-users",
      user: req.user,
      users: rows
    });
  });
});

// Hapus user (kecuali diri sendiri)
router.post("/users/:id/delete", requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;

  if (parseInt(id) === req.user.id) {
    return res.status(400).send("❌ Tidak bisa hapus akun sendiri.");
  }

  db.run("DELETE FROM users WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).send("DB error");
    if (this.changes === 0) return res.status(404).send("User tidak ditemukan");
    res.redirect("/admin/users");
  });
});

// Jadikan user sebagai admin (kecuali diri sendiri)
router.post("/users/:id/make-admin", requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;

  if (parseInt(id) === req.user.id) {
    return res.status(400).send("❌ Tidak bisa ubah role akun sendiri.");
  }

  db.run("UPDATE users SET role = 'admin' WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).send("DB error");
    if (this.changes === 0) return res.status(404).send("User tidak ditemukan");
    res.redirect("/admin/users");
  });
});



// =============================
// Videos Management (admin only)
// =============================

// Daftar semua video
router.get("/videos", requireAuth, requireAdmin, (req, res) => {
  db.all(
    `SELECT v.id, v.title, v.source, v.embed_token, v.views, v.created_at, u.username
     FROM videos v
     JOIN users u ON v.user_id = u.id
     ORDER BY v.id DESC`,
    [],
    (err, rows = []) => {
      if (err) return res.status(500).send("DB error");
      res.render("admin-videos", {
        layout: "admin-layout",
        title: "Manage Videos",
        activePage: "admin-videos",
        user: req.user,
        videos: rows
      });
    }
  );
});

// Hapus video
router.post("/videos/:id/delete", requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;

  db.run("DELETE FROM videos WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).send("DB error");
    if (this.changes === 0) return res.status(404).send("Video tidak ditemukan");
    res.redirect("/admin/videos");
  });
});






// Admin logout
router.post("/logout", (req, res) => {
  res.clearCookie("token", cookieOpts(isProd));
  res.redirect("/admin/login");
});



export default router;

// server/app.js
import path from "path";
import express from "express";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "url";
import authRoutes from "./routes/auth.js";
import videosRoutes from "./routes/videos.js";
import statsRoutes from "./routes/stats.js";
import { requireAuth } from "./middleware/requireAuth.js";
import expressLayouts from "express-ejs-layouts";
import secureStream from "./routes/secureStream.js";

// Import cron supaya otomatis jalan
import "./cron.js";

import { initDB } from "./models/initdb.js";
import adminRoutes from "./routes/admin.js";




import db from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const isProd = process.env.NODE_ENV === "production";

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
//layout.ejs
app.use(expressLayouts);
app.set("layout", "layout"); // default layout.ejs

// Redirect *.html privat -> ke route EJS (opsional, biar gak ada yang nyasar)
const protectedHtml = ["/dashboard.html","/upload.html","/videos.html","/remote.html","/remot.html"];
app.get(protectedHtml, (req,res) => res.redirect(req.path.replace(".html","").replace("/remot","/remote")));

// Static (CSS/JS/images)
app.use(express.static(path.join(__dirname, "../public")));

// Halaman publik
app.get("/", (req,res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});
app.get("/register.html", (req,res) => {
  res.sendFile(path.join(__dirname, "../public/register.html"));
});

// Halaman privat (EJS) — wajib login
// app.get("/dashboard", requireAuth, (req,res) => {
//   res.render("dashboard", { user: req.user });
// });
// app.get("/upload", requireAuth, (req,res) => {
//   res.render("upload", { user: req.user });
// });
// app.get("/videos", requireAuth, (req,res) => {
//   // ambil daftar video user dari DB
//   db.all(
//     "SELECT id, title, source, video_id, embed_token, created_at FROM videos WHERE user_id = ? ORDER BY id DESC LIMIT 200",
//     [req.user.id],
//     (err, rows=[]) => {
//       if (err) return res.status(500).send("DB error");
//       res.render("videos", { user: req.user, videos: rows });
//     }
//   );
// });
// Catatan: di ZIP kamu nama file view-nya "remot.ejs". Kita normalkan route-nya /remote
// app.get("/remote", requireAuth, (req,res) => {
//   // Kalau kamu mau rename file jadi remote.ejs, ganti 'remot' -> 'remote'
//   res.render("remot", { user: req.user });
// });


// embed page: /e/:token
app.get("/e/:token", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/embed.html"));
});

app.get("/v/:token", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/stiming.html"));
});

app.get("/t/:token", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/testing.html"));
});


app.get("/dashboard", requireAuth, (req,res) => {
  res.render("dashboard", { 
    layout: "layout",
    title: "Dashboard",
    activePage: "dashboard",
    user: req.user 
  });
});

app.get("/remot", requireAuth, (req,res) => {
  res.render("remot", { 
    layout: "layout",
    title: "Remot Upload",
    activePage: "remot",
    user: req.user 
  });
});

app.get("/upload", requireAuth, (req,res) => {
  res.render("upload", { 
    layout: "layout",
    title: "Upload Video",
    activePage: "upload",
    user: req.user 
  });
});


app.get("/videos", requireAuth, (req,res) => {
  db.all(
    "SELECT id, title, source, video_id, embed_token, created_at FROM videos WHERE user_id = ? ORDER BY id DESC LIMIT 200",
    [req.user.id],
    (err, rows = []) => {
      if (err) return res.status(500).send("DB error");
      res.render("videos", { 
        layout: "layout",         // pakai layout.ejs
        title: "My Videos",       // buat <title>
        activePage: "videos",     // biar navbar aktif
        user: req.user, 
        videos: rows              // kirim daftar video
      });
    }
  );
});




// Halaman withdraw (GET)
app.get("/withdraw", requireAuth, (req, res) => {
  if (!req.user?.id) {
    return res.redirect("/");
  }

  db.serialize(() => {
    db.get("SELECT balance, withdrawn FROM earnings WHERE user_id = ?", [req.user.id], (err1, earningsRow = {}) => {
      if (err1) return res.status(500).send("DB error");

      db.all(
        "SELECT * FROM withdraws WHERE user_id = ? ORDER BY id DESC",
        [req.user.id],
        (err2, rows = []) => {
          if (err2) return res.status(500).send("DB error");
          res.render("withdraw", {
            layout: "layout",
            title: "Withdraw",
            activePage: "withdraw",
            user: req.user,
            withdraws: rows,
            earnings: {
              balance: earningsRow.balance ?? 0,
              withdrawn: earningsRow.withdrawn ?? 0
            }
          });
        }
      );
    });
  });
});



// Request withdraw baru (POST)
app.post("/withdraw", requireAuth, (req, res) => {
  if (!req.user?.id) {
    return res.redirect("/");
  }

  const { amount, method } = req.body;
  const amountNum = parseFloat(amount);

  if (isNaN(amountNum) || amountNum < 10) {
    return res.status(400).send("Minimal withdraw $10");
  }
  if (!["usdt", "ltc"].includes(method)) {
    return res.status(400).send("Metode withdraw tidak valid (hanya USDT / LTC)");
  }
 
  db.get("SELECT balance FROM earnings WHERE user_id = ?", [req.user.id], (err, row) => {
    if (err) return res.status(500).send("DB error");

    const balance = row?.balance || 0;
    if (balance < amountNum) {
      return res.status(400).send("Saldo tidak mencukupi");
    }

    db.run(
      "INSERT INTO withdraws (user_id, amount, method, status) VALUES (?, ?, ?, ?)",
      [req.user.id, amountNum, method, "pending"],
      function (err2) {
        if (err2) return res.status(500).send("DB error");

        db.run(
          `UPDATE earnings 
             SET balance = balance - ?, 
                 withdrawn = withdrawn + ?,
                 updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ?`,
          [amountNum, amountNum, req.user.id],
          (err3) => {
            if (err3) return res.status(500).send("DB error");
            res.redirect("/withdraw");
          }
        );
      }
    );
  });
});


app.use("/admin", adminRoutes);



// ...
initDB();



// API
app.use("/api/auth", authRoutes);
app.use("/api/videos", videosRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api", secureStream);


// 404
app.use((req,res) => res.status(404).send("Not found"));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});


// server/middleware/requireAdmin.js
export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).send("Akses khusus admin 🚫");
  }
  next();
}


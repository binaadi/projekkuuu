// server/middleware/requireAuth.js
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey"; // ganti di .env di produksi
const isProd = process.env.NODE_ENV === "production";

export function requireAuth(req, res, next) {
  // allowlist endpoint publik
  const publicPaths = new Set([
    "/", "/index.html",
    "/register.html",
    "/api/auth/login",
    "/api/auth/register"
  ]);
  // allowlist aset
  if (
    publicPaths.has(req.path) ||
    req.path.startsWith("/css") ||
    req.path.startsWith("/js") ||
    req.path.startsWith("/image") ||
    req.path.startsWith("/embed") // kalau player publik
  ) return next();

  const token = req.cookies?.token;
  if (!token) return res.redirect("/");

  try {
    const payload = jwt.verify(token, JWT_SECRET); // { id, username, email, iat, exp }
    req.user = payload;
    return next();
  } catch (e) {
    // token invalid / expired
    res.clearCookie("token", cookieOpts(isProd));
    return res.redirect("/");
  }
}

export function cookieOpts(isProdEnv = false) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProdEnv,     // true di produksi (HTTPS)
    path: "/",
    // maxAge set saat login (mis. 1d)
  };
}

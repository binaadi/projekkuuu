import express from "express";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";

const router = express.Router();
const SECRET = process.env.STREAM_SECRET || "super-secret-key";

// API generate signed URL
router.get("/get-url/:videoId", (req, res) => {
  const { videoId } = req.params;

  const token = jwt.sign(
    { videoId, ip: req.ip },
    SECRET,
    { expiresIn: "60s" } // expired 1 menit
  );

  res.json({ url: `/api/stream/${videoId}?token=${token}` });
});

// Proxy video stream
router.get("/stream/:videoId", async (req, res) => {
  const { videoId } = req.params;
  const { token } = req.query;

  try {
    const payload = jwt.verify(token, SECRET);

    // Optional: validasi IP juga
    if (payload.ip !== req.ip) return res.status(403).send("Invalid IP");
    if (payload.videoId !== videoId) return res.status(403).send("Invalid token");

    // Ambil dari CDN asli
    const cdnUrl = `https://cdn.videy.co/${videoId}.mp4`;
    const response = await fetch(cdnUrl);

    if (!response.ok) return res.status(500).send("CDN error");

    res.setHeader("Content-Type", "video/mp4");
    response.body.pipe(res);

  } catch (err) {
    return res.status(403).send("Token expired/invalid");
  }
});

export default router;

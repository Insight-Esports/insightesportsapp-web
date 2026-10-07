// mock/server.mjs — a stand-in for the Express backend, for local UI work
// and screenshots without touching production data.
//
//   npm run mock           → http://localhost:4000 (same routes as Railway)
//   npm run dev:mock       → Next.js pointed at the mock
//
// Login: any @insightesportsapp.com email with password "insight".
// Each file in mock/routes/*.mjs exports register(app, h) and adds routes.
import express from "express";
import { createServer } from "node:http";
import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "10mb" }));

// The mock only enforces x-api-key when APP_API_KEY is set in its own env;
// otherwise any key is accepted (the Next server sends whatever .env.local has).
const API_KEY = process.env.APP_API_KEY ?? null;
const DOMAIN = "insightesportsapp.com";

// ── helpers shared with route modules ─────────────────────────────────────
const b64url = (s) => Buffer.from(s).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
export const makeJwt = (email, ttlSec = 3600) =>
  `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify({ sub: "user-1", email, exp: Math.floor(Date.now() / 1000) + ttlSec }))}.mock`;
const readJwt = (token) => {
  if (!token) return null;
  try { return JSON.parse(Buffer.from(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()); } catch { return null; }
};
const isoAgo = (ms) => new Date(Date.now() - ms).toISOString();
const isoIn = (ms) => new Date(Date.now() + ms).toISOString();
const pick = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length];
// Deterministic pseudo-random in [0,1) from a seed — stable screenshots.
const rand = (seed) => { const x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x); };

export const me = {
  id: "user-1",
  username: "ivan",
  email: `ivan@${DOMAIN}`,
  is_premium: true,
  points_balance: 4820,
  created_at: isoAgo(90 * 864e5),
  avatar_url: null,
  avatar_pending: false,
  follower_count: 128,
  following_count: 42,
  primary_game: "VALORANT",
  favorite_games: ["VALORANT", "CS2", "League"],
};

// ── public ────────────────────────────────────────────────────────────────
app.get("/status", (_req, res) => res.json({
  version: 3,
  maintenance: { active: process.env.MOCK_MAINTENANCE === "1", message: null, eta: null },
  update: { min_version: "0.0.0", latest_version: "1.0.0", message: null },
  banner: process.env.MOCK_BANNER ?? null,
  features: {},
}));
app.get("/health", (_req, res) => res.json({ ok: true }));

// ── /api: api key + optional auth ─────────────────────────────────────────
app.use("/api", (req, res, next) => {
  if (!req.headers["x-api-key"] || (API_KEY && req.headers["x-api-key"] !== API_KEY)) return res.status(401).json({ error: "Unauthorized" });
  const auth = req.headers.authorization ?? "";
  req.user = readJwt(auth.startsWith("Bearer ") ? auth.slice(7) : null);
  if (req.user?.exp && req.user.exp < Date.now() / 1000) return res.status(401).json({ error: "Token expired" });
  next();
});
const protect = (req, res, next) => (req.user ? next() : res.status(401).json({ error: "Not authenticated" }));

app.post("/api/auth/login", (req, res) => {
  const { email = "", password = "" } = req.body ?? {};
  if (password !== "insight") return res.status(401).json({ error: "Invalid email or password" });
  const user = { ...me, email, username: email.split("@")[0] };
  res.json({ message: "Logged in successfully", token: makeJwt(email), refreshToken: "refresh-" + Date.now(), user });
});
app.post("/api/auth/refresh", (req, res) => {
  const { refreshToken } = req.body ?? {};
  if (!refreshToken || !String(refreshToken).startsWith("refresh-")) return res.status(401).json({ error: "Invalid or expired refresh token" });
  res.json({ token: makeJwt(me.email), refreshToken: "refresh-" + Date.now() });
});
app.post("/api/auth/logout", (_req, res) => res.json({ message: "Logged out successfully" }));
app.post("/api/auth/forgot-password", (_req, res) => res.json({ message: "If an account exists with this email, a reset code has been sent." }));
app.post("/api/auth/verify-reset-code", (req, res) => (req.body?.token === "123456" ? res.json({ resetToken: "rt", refreshToken: "rr" }) : res.status(400).json({ error: "Invalid or expired code" })));
app.post("/api/auth/set-new-password", (_req, res) => res.json({ message: "Password reset successfully. Please log in with your new password." }));

app.get("/api/users/me", protect, (req, res) => res.json({ ...me, email: req.user.email, username: req.user.email.split("@")[0] }));

// ── route modules ─────────────────────────────────────────────────────────
const h = { isoAgo, isoIn, pick, rand, me, protect, express };
for (const f of readdirSync(join(__dirname, "routes")).filter((f) => f.endsWith(".mjs")).sort()) {
  const mod = await import(pathToFileURL(join(__dirname, "routes", f)).href);
  mod.register?.(app, h);
}

app.use("/api", (req, res) => res.status(404).json({ error: `Route not found - ${req.originalUrl}` }));

const server = createServer(app);
// Socket.IO (optional): route modules may attach via h.io if socket.io is installed.
try {
  const { Server } = await import("socket.io");
  const io = new Server(server, { cors: { origin: "*" } });
  io.on("connection", (socket) => {
    socket.on("join_match", (id) => socket.join(`match:${id}`));
    socket.on("leave_match", (id) => socket.leave(`match:${id}`));
    socket.on("join_chat", (id) => socket.join(`chat:${id}`));
    socket.on("leave_chat", (id) => socket.leave(`chat:${id}`));
    socket.on("join_poll", (id) => socket.join(`poll:${id}`));
  });
  h.io = io;
  for (const f of readdirSync(join(__dirname, "routes")).filter((f) => f.endsWith(".mjs")).sort()) {
    const mod = await import(pathToFileURL(join(__dirname, "routes", f)).href);
    mod.registerSockets?.(io, h);
  }
} catch {
  console.log("[mock] socket.io not installed — live sockets disabled (npm i -D socket.io)");
}

const PORT = process.env.MOCK_PORT ?? 4000;
server.listen(PORT, () => console.log(`[mock] Insight mock backend on http://localhost:${PORT}`));

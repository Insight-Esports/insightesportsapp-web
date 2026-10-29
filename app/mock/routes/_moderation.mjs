// mock/routes/_moderation.mjs — Report and Block, bans, chat edit/delete,
// DM unsend/edit and everyone's look on chat / comments / DMs
// (web/ios-parity-2026-10-28.md §2–5; backend/reports-and-sanctions-contract.md,
// backend/message-edit-delete-contract.md).
//
// The leading "_" registers these routes before the other modules, so they
// win where a path is shared; anything else falls through with next().
//
// Toggles (no api key):
//   POST /mock/moderation {commentBan, avatarBan}   "on" (ends in 5 days) · "permanent" · ISO date · "off"
//   POST /mock/moderation {chatEdit, dmEdit}         "on" · "off"  (the /status chat_edit / dm_edit switches)
//   GET  /mock/moderation                            current state
// Env: MOCK_COMMENT_BAN / MOCK_AVATAR_BAN (same values), MOCK_CHAT_EDIT / MOCK_DM_EDIT (default on).
import { deflateSync } from "node:zlib";

// ── Tiny PNG avatars, so photos show inside the rings ─────────────────────
function png(w, h, pixel) {
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cc]); };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const [r, g, b] = pixel(x, y); const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const PALETTES = [[[255, 107, 53], [124, 92, 252]], [[34, 197, 94], [14, 116, 144]], [[245, 166, 35], [190, 24, 93]], [[56, 189, 248], [79, 70, 229]], [[244, 114, 182], [124, 58, 237]], [[250, 204, 21], [22, 163, 74]]];
const avatarCache = new Map();
function avatarPNG(seed) {
  if (avatarCache.has(seed)) return avatarCache.get(seed);
  let hsh = 0; for (const ch of seed) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
  const [a, b] = PALETTES[hsh % PALETTES.length];
  const S = 96;
  const buf = png(S, S, (x, y) => {
    const t = (x + y) / (2 * S);
    let c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    // a head and shoulders, lighter
    const head = (x - 48) ** 2 + (y - 38) ** 2 < 17 ** 2;
    const body = (x - 48) ** 2 / 34 ** 2 + (y - 98) ** 2 / 30 ** 2 < 1;
    if (head || body) c = c.map((v) => Math.min(255, Math.round(v * 0.45 + 140)));
    return c;
  });
  avatarCache.set(seed, buf);
  return buf;
}

const STYLES = [null, ["ring", "shine", "mark"], ["shine"], ["mark"], [], ["ring", "shine"], ["ring", "mark"]];
const NAMES = ["tenz_fan", "s1mple_enjoyer", "faker_goat", "aspas", "zywoo_w", "demon1", "chronicle", "jettmain", "boostio", "yay", "caps", "oner_fan", "derke", "leo", "cNed", "sinatraa", "tarik", "shroud", "nats", "m0nesy"];
// Live chat regulars (match-detail.mjs names them; ids are u0…u5 / bot0…bot5).
const CHAT_LOOK = {
  fragzilla: { photo: true, is_premium: true, premium_style: ["ring", "shine"] },
  ivan: { photo: false, is_premium: false, premium_style: null },
  karlo: { photo: true, is_premium: true, premium_style: ["ring", "mark"] },
  mapcontrol: { photo: true, is_premium: true, premium_style: null },
  ctside: { photo: false, is_premium: false, premium_style: null },
  vctfan99: { photo: true, is_premium: true, premium_style: ["shine", "mark"] },
  baronsteal: { photo: true, is_premium: false, premium_style: null },
  jettmain: { photo: false, is_premium: true, premium_style: ["mark"] },
};

export function register(app, h) {
  const { protect, me, rand } = h;
  const PUBLIC_URL = process.env.MOCK_PUBLIC_URL ?? `http://localhost:${process.env.MOCK_PORT ?? 4000}`;
  const avatarURL = (seed) => `${PUBLIC_URL}/mock/avatar/${encodeURIComponent(seed)}.png`;
  app.get("/mock/avatar/:seed.png", (req, res) => {
    res.set("Content-Type", "image/png").set("Cache-Control", "public, max-age=3600").set("Cross-Origin-Resource-Policy", "cross-origin");
    res.send(avatarPNG(req.params.seed));
  });

  // ── People: the same deterministic look profile.mjs gives user-2 … user-21 ──
  const people = new Map(NAMES.map((username, i) => {
    const is_premium = rand(i + 7) > 0.65;
    return [`user-${i + 2}`, { id: `user-${i + 2}`, username, is_premium, premium_style: is_premium ? STYLES[i % STYLES.length] : null, avatar_url: i % 3 !== 2 ? avatarURL(username) : null }];
  }));
  const lookOfUser = (id, username) => {
    if (id === me.id) return { avatar_url: me.avatar_url ?? null, is_premium: !!me.is_premium, premium_style: me.premium_style ?? null };
    const p = people.get(id);
    if (p) return { avatar_url: p.avatar_url, is_premium: p.is_premium, premium_style: p.premium_style };
    const c = CHAT_LOOK[username];
    if (c) return { avatar_url: c.photo ? avatarURL(username) : null, is_premium: c.is_premium, premium_style: c.premium_style };
    return null;
  };
  /** Known names for the blocked list (whoever a response showed us). */
  const names = new Map([...people.values()].map((p) => [p.id, p.username]));

  // ── State + toggles ─────────────────────────────────────────────────────
  const parseBan = (v) => {
    if (!v || v === "off") return null;
    if (v === "permanent") return { ends_at: null };
    if (v === "on") return { ends_at: new Date(Date.now() + 5 * 864e5).toISOString() };
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? { ends_at: new Date(Date.now() + 5 * 864e5).toISOString() } : { ends_at: d.toISOString() };
  };
  const state = {
    commentBan: parseBan(process.env.MOCK_COMMENT_BAN),
    avatarBan: parseBan(process.env.MOCK_AVATAR_BAN),
    chatEdit: process.env.MOCK_CHAT_EDIT ?? "on",
    dmEdit: process.env.MOCK_DM_EDIT ?? "on",
  };
  const publishFeatures = () => {
    globalThis.__mockFeatures = { ...(globalThis.__mockFeatures ?? {}), chat_edit: { mode: state.chatEdit }, dm_edit: { mode: state.dmEdit } };
  };
  publishFeatures();
  app.get("/mock/moderation", (_req, res) => res.json({ ...state, blocked: [...blocked] }));
  app.post("/mock/moderation", (req, res) => {
    const b = req.body ?? {};
    if ("commentBan" in b) state.commentBan = parseBan(b.commentBan);
    if ("avatarBan" in b) state.avatarBan = parseBan(b.avatarBan);
    if ("chatEdit" in b) state.chatEdit = b.chatEdit === "off" ? "off" : "on";
    if ("dmEdit" in b) state.dmEdit = b.dmEdit === "off" ? "off" : "on";
    if (b.resetBlocks) { blocked.clear(); for (const id of SEED_BLOCKED) blocked.add(id); }
    publishFeatures();
    res.json({ ...state, blocked: [...blocked] });
  });
  const refuse = (res, kind) => {
    const ban = kind === "comment" ? state.commentBan : state.avatarBan;
    if (!ban) return false;
    if (ban.ends_at && new Date(ban.ends_at) <= new Date()) { if (kind === "comment") state.commentBan = null; else state.avatarBan = null; return false; }
    res.status(403).json({
      error: kind === "comment" ? "You can't comment right now." : "You can't change your profile picture right now.",
      code: kind === "comment" ? "COMMENT_BANNED" : "AVATAR_BANNED",
      ends_at: ban.ends_at, permanent: !ban.ends_at,
    });
    return true;
  };

  // ── Blocks (the app-wide list; POST /dm/blocks also drops the DM thread) ──
  const SEED_BLOCKED = ["user-7", "user-13"];   // profile.mjs's two
  const blocked = new Set(SEED_BLOCKED);
  h.moderationMock = { blocked };
  const dmPerson = (id) => /^user-(\d+)$/.test(id) && Number(id.slice(5)) >= 2 && Number(id.slice(5)) <= 21;
  app.get("/api/users/me/blocked", protect, (_req, res) => {
    res.json([...blocked].map((id) => ({ id, username: names.get(id) ?? id, avatar_url: lookOfUser(id, names.get(id))?.avatar_url ?? null })).sort((a, b) => a.username.localeCompare(b.username)));
  });
  app.post("/api/dm/blocks", protect, (req, res, next) => {
    const userId = req.body?.userId ?? req.body?.user_id;
    if (!userId || typeof userId !== "string") return res.status(400).json({ error: "userId is required" });
    if (userId === req.user.sub) return res.status(400).json({ error: "You cannot block yourself" });
    blocked.add(userId);
    if (dmPerson(userId)) return next();     // dm.mjs drops the thread too
    res.json({ blocked: true, user_id: userId, conversation_id: null });
  });
  app.delete("/api/dm/blocks/:userId", protect, (req, res, next) => {
    blocked.delete(req.params.userId);
    if (dmPerson(req.params.userId)) return next();
    res.json({ blocked: false, user_id: req.params.userId });
  });

  // Wrap res.json for one request.
  const mapJson = (res, fn) => { const orig = res.json.bind(res); res.json = (body) => orig(res.statusCode < 400 ? fn(body) : body); };

  // ── Profiles: 403 when blocked; photos on rows ─────────────────────────
  app.get("/api/users/:id/profile", protect, (req, res, next) => {
    if (blocked.has(req.params.id)) return res.status(403).json({ error: "Profile unavailable" });
    mapJson(res, (b) => (b && typeof b === "object" && b.id && !b.avatar_url ? { ...b, avatar_url: lookOfUser(b.id, b.username)?.avatar_url ?? null } : b));
    next();
  });
  const withPhotos = (rows) => (Array.isArray(rows) ? rows.map((r) => { const id = r.target_id ?? r.id; if (id && r.username) names.set(id, r.username); return r && !r.avatar_url && id ? { ...r, avatar_url: lookOfUser(id, r.username)?.avatar_url ?? null } : r; }) : rows);
  app.get("/api/users/:id/followers", protect, (_req, res, next) => { mapJson(res, withPhotos); next(); });
  app.get("/api/users/:id/following", protect, (_req, res, next) => { mapJson(res, withPhotos); next(); });
  app.post("/api/users/:userId/report", protect, (req, res) => {
    if (req.params.userId === req.user.sub) return res.status(400).json({ error: "You cannot report yourself" });
    const type = req.body?.report_type ?? "user";
    if (!["user", "avatar", "username"].includes(type)) return res.status(400).json({ error: "Invalid report_type. Must be one of: user, avatar, username" });
    console.log(`[mock] user report ${req.params.userId} (${type}): ${req.body?.reason ?? "—"}`);
    res.json({ success: true, flagged_for_review: false });
  });
  app.post("/api/users/me/avatar", protect, (req, res, next) => { if (refuse(res, "avatar")) return; next(); });

  // ── Comments: bans, reports, authors' look ─────────────────────────────
  const commentLook = (c) => {
    const a = c?.author && typeof c.author === "object" ? c.author : null;
    const id = a?.id ?? c?.user_id;
    const username = a?.username ?? c?.username;
    if (id && username) names.set(id, username);
    const look = lookOfUser(id, username);
    if (!look) return c;
    return a ? { ...c, author: { ...a, avatar_url: a.avatar_url ?? look.avatar_url, is_premium: a.is_premium ?? look.is_premium, premium_style: a.premium_style ?? look.premium_style } } : { ...c, avatar_url: c.avatar_url ?? look.avatar_url, is_premium: c.is_premium ?? look.is_premium, premium_style: c.premium_style ?? look.premium_style };
  };
  const commentsBody = (b) => (b && Array.isArray(b.comments) ? { ...b, comments: b.comments.map(commentLook) } : Array.isArray(b) ? b.map(commentLook) : b);
  app.get("/api/players/:id/comments", protect, (_req, res, next) => { mapJson(res, commentsBody); next(); });
  app.get("/api/matches/:id/comments", protect, (_req, res, next) => { mapJson(res, commentsBody); next(); });
  app.post("/api/players/:id/comments", protect, (req, res, next) => { if (refuse(res, "comment")) return; next(); });
  app.post("/api/matches/:id/comments", protect, (req, res, next) => { if (refuse(res, "comment")) return; next(); });
  app.post("/api/comments/:id/report", protect, (req, res) => { console.log(`[mock] comment report ${req.params.id}: ${req.body?.reason ?? "—"}`); res.json({}); });

  // ── Live chat: look, blocks, bans, edit / delete (pending on the backend) ──
  const chatEdits = new Map();      // messageId → { text, editedAt }
  const chatDeleted = new Set();
  const seenChat = new Map();       // messageId → the message as last served
  const chatLook = (m) => {
    if (!m || typeof m !== "object") return m;
    if (m.userId && m.username) names.set(m.userId, m.username);
    const look = lookOfUser(m.userId, m.username);
    const e = chatEdits.get(String(m.id));
    const out = { ...m, ...(look ? { avatar_url: m.avatar_url ?? look.avatar_url, is_premium: look.is_premium, premium_style: m.premium_style ?? look.premium_style } : {}), ...(e ? { text: e.text, editedAt: e.editedAt } : {}) };
    seenChat.set(String(m.id), out);
    return out;
  };
  h.moderationMock.chatLook = chatLook;
  h.moderationMock.chatHidden = (m) => !m || chatDeleted.has(String(m.id)) || blocked.has(m.userId);
  app.get("/api/chat/:room/messages", protect, (_req, res, next) => {
    mapJson(res, (b) => (Array.isArray(b) ? b.filter((m) => !h.moderationMock.chatHidden(m)).map(chatLook) : b));
    next();
  });
  app.post("/api/chat/:room/messages", protect, (req, res, next) => {
    if (refuse(res, "comment")) return;
    mapJson(res, chatLook);
    next();
  });
  const chatEditOn = () => state.chatEdit === "on";
  app.patch("/api/chat/:room/messages/:id", protect, (req, res) => {
    if (!chatEditOn()) return res.status(404).json({ error: `Route not found - ${req.originalUrl}` });
    if (refuse(res, "comment")) return;
    const m = seenChat.get(req.params.id);
    if (!m || chatDeleted.has(req.params.id)) return res.status(404).json({ error: "Message not found", code: "MESSAGE_NOT_FOUND" });
    if (m.userId !== req.user.sub) return res.status(403).json({ error: "Only the sender can edit a message", code: "NOT_SENDER" });
    const text = String(req.body?.text ?? "").trim();
    if (!text) return res.status(400).json({ error: "Message cannot be empty" });
    if (text.length > 500) return res.status(400).json({ error: "Message cannot exceed 500 characters" });
    if (Date.now() - new Date(m.timestamp).getTime() > 15 * 60e3) return res.status(403).json({ error: "Messages can only be edited for 15 minutes.", code: "EDIT_WINDOW_CLOSED" });
    chatEdits.set(req.params.id, { text, editedAt: new Date().toISOString() });
    const out = chatLook(m);
    h.io?.to(`chat:${req.params.room}`).emit("chat:edited", { roomId: req.params.room, message: out });
    res.json(out);
  });
  app.delete("/api/chat/:room/messages/:id", protect, (req, res) => {
    if (!chatEditOn()) return res.status(404).json({ error: `Route not found - ${req.originalUrl}` });
    const m = seenChat.get(req.params.id);
    if (!m || chatDeleted.has(req.params.id)) return res.status(404).json({ error: "Message not found", code: "MESSAGE_NOT_FOUND" });
    if (m.userId !== req.user.sub) return res.status(403).json({ error: "Only the sender can delete a message", code: "NOT_SENDER" });
    chatDeleted.add(req.params.id);
    h.io?.to(`chat:${req.params.room}`).emit("chat:deleted", { roomId: req.params.room, messageId: req.params.id });
    res.json({});
  });
  app.post("/api/chat/:room/messages/:id/report", protect, (req, res) => {
    const m = seenChat.get(req.params.id);
    if (m && m.userId === req.user.sub) return res.status(400).json({ error: "You cannot report your own message" });
    console.log(`[mock] chat report ${req.params.room}/${req.params.id}: ${req.body?.reason ?? "—"}`);
    res.json({});
  });

  // ── DMs: the other person's look; unsend; edit (pending) ───────────────
  const dmLook = (r) => {
    if (!r || typeof r !== "object" || !r.other_id) return r;
    const p = people.get(r.other_id);
    if (!p) return r;
    return { ...r, other_avatar_url: r.other_avatar_url ?? p.avatar_url, other_is_premium: p.is_premium, other_premium_style: p.premium_style };
  };
  app.get("/api/dm/conversations", protect, (_req, res, next) => { mapJson(res, (b) => (Array.isArray(b) ? b.map(dmLook) : b)); next(); });
  app.post("/api/dm/conversations", protect, (_req, res, next) => { mapJson(res, dmLook); next(); });
  const toMe = (event, payload) => h.io?.to(`user:${me.id}`).emit(event, payload);
  app.delete("/api/dm/conversations/:id/messages/:messageId", protect, (req, res) => {
    const c = h.dmMock?.convs.get(req.params.id);
    if (!c) return res.status(404).json({ error: "Conversation not found", code: "CONVERSATION_NOT_FOUND" });
    const i = c.messages.findIndex((m) => m.id === req.params.messageId);
    if (i < 0) return res.status(404).json({ error: "Message not found", code: "MESSAGE_NOT_FOUND" });
    const msg = c.messages[i];
    if (msg.sender_id !== me.id) return res.status(403).json({ error: "Only the sender can unsend a message", code: "NOT_SENDER" });
    c.messages.splice(i, 1);
    c.last_message_at = c.messages[c.messages.length - 1]?.created_at ?? null;
    const uploadIds = Array.isArray(req.body?.uploadIds) ? req.body.uploadIds : [];
    const payload = { conversationId: c.id, messageId: msg.id, deletedBy: me.id, contentType: msg.content_type };
    toMe("dm:deleted", payload);
    console.log(`[mock] dm ${msg.id} unsent (${msg.content_type}${uploadIds.length ? `, uploadIds ${uploadIds.join(",")}` : ""})`);
    res.json({ conversation_id: c.id, message_id: msg.id, deleted: true, blobs_removed: uploadIds.length });
  });
  app.patch("/api/dm/conversations/:id/messages/:messageId", protect, (req, res) => {
    if (state.dmEdit !== "on") return res.status(404).json({ error: `Route not found - ${req.originalUrl}` });
    const c = h.dmMock?.convs.get(req.params.id);
    if (!c) return res.status(404).json({ error: "Conversation not found", code: "CONVERSATION_NOT_FOUND" });
    const msg = c.messages.find((m) => m.id === req.params.messageId);
    if (!msg) return res.status(404).json({ error: "Message not found", code: "MESSAGE_NOT_FOUND" });
    if (msg.sender_id !== me.id) return res.status(403).json({ error: "Only the sender can edit a message", code: "NOT_SENDER" });
    const { ciphertext, nonce, senderKeyVersion, recipientKeyVersion, contentType } = req.body ?? {};
    if (typeof ciphertext !== "string" || typeof nonce !== "string") return res.status(400).json({ error: "ciphertext and nonce are required" });
    if (!["text", "link"].includes(contentType)) return res.status(400).json({ error: "Only text and links can be edited" });
    Object.assign(msg, { ciphertext, nonce, sender_key_version: senderKeyVersion ?? msg.sender_key_version, recipient_key_version: recipientKeyVersion ?? msg.recipient_key_version, content_type: contentType, edited_at: new Date().toISOString() });
    toMe("dm:edited", { conversationId: c.id, message: msg });
    res.json(msg);
  });
}

export function registerSockets(io, h) {
  // Bot chat lines (match-detail.mjs) get the sender's look, and a blocked
  // sender's lines never reach you — like the server's emitChatMessage.
  const origTo = io.to.bind(io);
  io.to = (room) => {
    const op = origTo(room);
    if (typeof room !== "string" || !room.startsWith("chat:")) return op;
    const emit = op.emit.bind(op);
    op.emit = (event, payload, ...rest) => {
      if (event === "new_message" && h.moderationMock) {
        if (h.moderationMock.chatHidden(payload)) return true;
        return emit(event, h.moderationMock.chatLook(payload), ...rest);
      }
      return emit(event, payload, ...rest);
    };
    return op;
  };
}

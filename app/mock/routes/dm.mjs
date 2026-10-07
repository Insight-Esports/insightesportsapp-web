// mock/routes/dm.mjs — direct messages (DirectMessages.swift / routes/dm.js)
// with REAL ciphertext: X25519 → HKDF-SHA256("insight-dm-v1") → AES-256-GCM,
// wire = base64(ciphertext||tag), base64(nonce), plaintext envelope JSON.
//
// The signed-in mock user (user-1) has a FIXED private key so a browser can
// link with it: GET /api/dm/_mock/link-payload → {payload: "INSIGHT-DM:1:<b64>:1"}
// (also served without the api key at GET /mock/dm/link-payload).
// Every other mock user derives a stable key pair from its id.
//
// Sockets: each authenticated socket joins user:<id>; ~20 s after connect
// the mock types and then delivers a dm:message; every message you send
// gets a dm:read and a canned reply (typing first).
import { createCipheriv, createHash, createPrivateKey, createPublicKey, diffieHellman, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";

// ── Keys ──────────────────────────────────────────────────────────────────
const PKCS8_PREFIX = Buffer.from("302e020100300506032b656e04220420", "hex");   // X25519 private key wrapper
export const ME_PRIVATE_KEY_B64 = "Yj9GsUqz2mOf1kL8H4cT7vWxZ3pQaR6sN0uBdE5yC1I=";  // fixed 32 bytes for user-1
const privFromRaw = (raw) => createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, raw]), format: "der", type: "pkcs8" });
const pubRawOf = (priv) => createPublicKey(priv).export({ type: "spki", format: "der" }).subarray(-32);
const keyFor = (userId) => {
  const raw = userId === "user-1" ? Buffer.from(ME_PRIVATE_KEY_B64, "base64") : createHash("sha256").update(`insight-mock-dm:${userId}`).digest();
  const priv = privFromRaw(raw);
  return { priv, pub: pubRawOf(priv), pubB64: pubRawOf(priv).toString("base64"), version: 1 };
};
const keys = new Map();
const keyOf = (id) => { if (!keys.has(id)) keys.set(id, keyFor(id)); return keys.get(id); };
const keyRow = (id) => { const k = keyOf(id); return { user_id: id, public_key: k.pubB64, key_version: k.version, algorithm: "x25519-hkdf-sha256+aes-256-gcm", rotated: false }; };

const symmetric = (fromId, toId) => {
  const shared = diffieHellman({ privateKey: keyOf(fromId).priv, publicKey: createPublicKey(keyOf(toId).priv) });
  return Buffer.from(hkdfSync("sha256", shared, Buffer.alloc(0), "insight-dm-v1", 32));
};
const seal = (envelope, fromId, toId) => {
  const nonce = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", symmetric(fromId, toId), nonce);
  const ct = Buffer.concat([c.update(Buffer.from(JSON.stringify(envelope), "utf8")), c.final()]);
  return { ciphertext: Buffer.concat([ct, c.getAuthTag()]).toString("base64"), nonce: nonce.toString("base64") };
};
const sealBytes = (bytes, key) => {
  const nonce = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, nonce);
  const ct = Buffer.concat([c.update(bytes), c.final()]);
  return { bytes: Buffer.concat([ct, c.getAuthTag()]), nonce: nonce.toString("base64") };
};

// ── A tiny PNG so the seeded photo is a real picture ──────────────────────
function makePNG(w, h, pixel) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cc]); };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const [r, g, b] = pixel(x, y); const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const scoreboardPNG = makePNG(640, 400, (x, y) => {
  // violet → deep violet field, a gold "scoreline" band and a hairline grid
  const t = y / 400;
  let r = Math.round(124 + (109 - 124) * t), g = Math.round(92 + (40 - 92) * t), b = Math.round(252 + (217 - 252) * t);
  if (y > 150 && y < 250 && x > 60 && x < 580) { r = 19; g = 19; b = 26; }
  if (y > 196 && y < 204 && x > 100 && x < 540) { r = 245; g = 166; b = 35; }
  if (x % 80 === 0 || y % 80 === 0) { r = Math.min(255, r + 30); g = Math.min(255, g + 30); b = Math.min(255, b + 30); }
  return [r, g, b];
});

export function register(app, h) {
  const { isoAgo, me, protect, express } = h;
  const PUBLIC_URL = process.env.MOCK_PUBLIC_URL ?? `http://localhost:${process.env.MOCK_PORT ?? 4000}`;
  const now = () => new Date().toISOString();

  // ── People (same ids as profile.mjs: user-2 … user-21) ─────────────────
  const NAMES = ["tenz_fan", "s1mple_enjoyer", "faker_goat", "aspas", "zywoo_w", "demon1", "chronicle", "jettmain", "boostio", "yay", "caps", "oner_fan", "derke", "leo", "cNed", "sinatraa", "tarik", "shroud", "nats", "m0nesy"];
  const people = new Map(NAMES.map((username, i) => [`user-${i + 2}`, { id: `user-${i + 2}`, username, avatar_url: null }]));
  const person = (id) => (id === me.id ? me : people.get(id) ?? null);

  // ── Conversations / messages (in memory) ───────────────────────────────
  const convs = new Map();      // id → {id, a: me, b: other, created_at, last_message_at, read: {userId: iso}, hidden: {userId: iso|null}, messages: []}
  const blockedByMe = new Set();          // user ids I blocked
  const blocksMe = new Set(["user-17"]);  // sinatraa blocked me → CANNOT_MESSAGE_USER
  const uploads = new Map();    // id → {conversation_id, kind, bytes|null, expired}
  let seq = 0;
  const msgId = () => `msg-${String(++seq).padStart(4, "0")}`;

  const envelopeFor = (text) => (/^https?:\/\/\S+$/.test(text.trim()) ? { t: "link", url: text.trim() } : { t: "text", body: text });
  const addMessage = (conv, senderId, envelope, contentType, createdAt = now()) => {
    const recipientId = senderId === me.id ? conv.other : me.id;
    const sealed = seal(envelope, senderId, recipientId);
    const row = { id: msgId(), conversation_id: conv.id, sender_id: senderId, ciphertext: sealed.ciphertext, nonce: sealed.nonce, sender_key_version: 1, recipient_key_version: 1, content_type: contentType, created_at: createdAt };
    conv.messages.push(row);
    conv.messages.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    conv.last_message_at = conv.messages[conv.messages.length - 1].created_at;
    return row;
  };
  const addText = (conv, senderId, text, createdAt) => addMessage(conv, senderId, envelopeFor(text), envelopeFor(text).t, createdAt);
  const seedImage = (conv, senderId, createdAt, expired = false) => {
    const key = randomBytes(32);
    const sealed = sealBytes(scoreboardPNG, key);
    const id = `up-${randomUUID().slice(0, 8)}`;
    uploads.set(id, { conversation_id: conv.id, kind: "image", bytes: expired ? null : sealed.bytes, expired });
    return addMessage(conv, senderId, { t: "image", id, key: key.toString("base64"), nonce: sealed.nonce, mime: "image/jpeg", size: sealed.bytes.length, w: 640, h: 400 }, "image", createdAt);
  };
  const createConv = (otherId, createdAt = now()) => {
    const id = `conv-${otherId.replace("user-", "")}`;
    const c = { id, other: otherId, created_at: createdAt, last_message_at: null, read: {}, hidden: {}, messages: [] };
    convs.set(id, c);
    return c;
  };
  const convWith = (otherId) => [...convs.values()].find((c) => c.other === otherId) ?? null;

  // ── Seed ───────────────────────────────────────────────────────────────
  const MIN = 6e4, HOUR = 36e5, DAY = 864e5;
  {
    // tarik — 2 unread, the newest from them
    const c = createConv("user-18", isoAgo(12 * DAY));
    addText(c, me.id, "yo did you catch the SEN vs NRG map 3", isoAgo(2 * DAY + 3 * HOUR));
    addText(c, "user-18", "bro that zekken ace was unreal", isoAgo(2 * DAY + 2 * HOUR + 50 * MIN));
    addText(c, me.id, "insane. the lotus timeout was the turning point", isoAgo(2 * DAY + 2 * HOUR + 40 * MIN));
    addText(c, "user-18", "gg last night", isoAgo(50 * MIN));
    addText(c, "user-18", "wanna queue later? need a 5th", isoAgo(40 * MIN));
    c.read[me.id] = isoAgo(2 * DAY + 2 * HOUR);
    c.read["user-18"] = isoAgo(39 * MIN);
  }
  {
    // boostio — mine is newest and they read it → "Seen"
    const c = createConv("user-10", isoAgo(20 * DAY));
    addText(c, "user-10", "who you got for champs?", isoAgo(3 * DAY + 2 * HOUR));
    addText(c, me.id, "PRX if something's cooking, otherwise Fnatic", isoAgo(3 * DAY + HOUR));
    c.read[me.id] = isoAgo(3 * DAY + HOUR);
    c.read["user-10"] = isoAgo(3 * DAY + 30 * MIN);
  }
  {
    // s1mple_enjoyer — a link message, 1 unread
    const c = createConv("user-3", isoAgo(9 * DAY));
    addText(c, me.id, "zywoo 1v4 on inferno??", isoAgo(5 * HOUR + 20 * MIN));
    addText(c, "user-3", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", isoAgo(5 * HOUR));
    c.read[me.id] = isoAgo(5 * HOUR + 10 * MIN);
    c.read["user-3"] = isoAgo(5 * HOUR + 1 * MIN);
  }
  {
    // faker_goat — a photo (real ciphertext PNG) and an expired one
    const c = createConv("user-4", isoAgo(30 * DAY));
    addText(c, "user-4", "look at this scoreboard from the LCK final", isoAgo(DAY + 4 * HOUR));
    seedImage(c, "user-4", isoAgo(DAY + 4 * HOUR - 10 * 1000));
    addText(c, me.id, "T1 just different in finals", isoAgo(DAY + 3 * HOUR));
    seedImage(c, me.id, isoAgo(40 * DAY), true);   // the old one — retired by the 30-day sweep
    addText(c, "user-4", "faker azir shuffle at 23 min, chat went nuclear", isoAgo(DAY + 2 * HOUR));
    c.read[me.id] = isoAgo(DAY + 2 * HOUR);
    c.read["user-4"] = isoAgo(DAY + 2 * HOUR + 30 * MIN);
  }
  {
    // aspas — a long thread for paging (70 messages), mine newest, not yet seen → "Sent"
    const c = createConv("user-5", isoAgo(45 * DAY));
    const lines = ["ranked tonight?", "yeah after 9", "what rank are you now", "immortal 2, stuck", "reyna only?", "jett and raze mostly", "pick up viper for lotus", "nah controllers are boring", "bind is cursed this patch", "the new map is actually fine", "did you see the PRX vs LOUD VOD", "something is always insane", "what do you think of the chamber nerf", "deserved", "queue?", "5 min", "gg", "one more?", "nah bed", "tomorrow then"];
    for (let i = 0; i < 70; i++) addText(c, i % 2 === 0 ? "user-5" : me.id, lines[i % lines.length] + (i < 50 ? ` (${i + 1})` : ""), isoAgo(6 * DAY - i * 20 * MIN));
    addText(c, me.id, "ok tomorrow, I'll ping you", isoAgo(5 * HOUR + 2 * MIN));
    c.read[me.id] = isoAgo(5 * HOUR);
    c.read["user-5"] = isoAgo(5 * DAY);
  }
  {
    // sinatraa — blocked me: sending answers 403 CANNOT_MESSAGE_USER
    const c = createConv("user-17", isoAgo(15 * DAY));
    addText(c, "user-17", "nice predictions streak", isoAgo(8 * DAY));
    addText(c, me.id, "thanks, the model likes sentinels this split", isoAgo(8 * DAY - 5 * MIN));
    c.read[me.id] = isoAgo(8 * DAY);
    c.read["user-17"] = isoAgo(8 * DAY);
  }

  // ── Shapes ─────────────────────────────────────────────────────────────
  const visibleMessages = (c, userId) => { const h0 = c.hidden[userId]; return h0 ? c.messages.filter((m) => m.created_at > h0) : c.messages; };
  const unreadIn = (c, userId) => { const r = c.read[userId]; return visibleMessages(c, userId).filter((m) => m.sender_id !== userId && (!r || m.created_at > r)).length; };
  const inboxRow = (c) => {
    const other = person(c.other) ?? { id: c.other, username: "User", avatar_url: null };
    const msgs = visibleMessages(c, me.id);
    const last = msgs[msgs.length - 1] ?? null;
    return {
      id: c.id, created_at: c.created_at, last_message_at: last?.created_at ?? c.last_message_at, last_read_at: c.read[me.id] ?? null, other_last_read_at: c.read[c.other] ?? null, muted: false,
      other_id: other.id, other_username: other.username, other_avatar_url: other.avatar_url,
      other_public_key: keyOf(other.id).pubB64, other_key_version: 1, other_key_algorithm: "x25519-hkdf-sha256+aes-256-gcm",
      last_message: last, unread_count: unreadIn(c, me.id),
    };
  };
  const openShape = (c) => ({ ...inboxRow(c), last_message: undefined, unread_count: undefined });
  const isVisible = (c) => { if (blockedByMe.has(c.other)) return false; const h0 = c.hidden[me.id]; return !h0 || c.messages.some((m) => m.created_at > h0); };
  const unreadTotal = () => [...convs.values()].filter((c) => isVisible(c) && unreadIn(c, me.id) > 0).length;
  const io = () => h.io ?? null;
  const toMe = (event, payload) => { io()?.to(`user:${me.id}`).emit(event, payload); };

  // ── Link payload (the phone's QR, for the link screen test) ────────────
  const linkPayload = (_req, res) => res.json({ payload: `INSIGHT-DM:1:${ME_PRIVATE_KEY_B64}:1`, user_id: me.id, key_version: 1 });
  app.get("/api/dm/_mock/link-payload", linkPayload);
  app.get("/mock/dm/link-payload", linkPayload);

  // ── Settings ───────────────────────────────────────────────────────────
  let dmPrivacy = "everyone";
  app.get("/api/dm/settings", protect, (_req, res) => res.json({ dm_privacy: dmPrivacy }));
  app.put("/api/dm/settings", protect, (req, res) => { const v = req.body?.dm_privacy ?? req.body?.who_can_message; if (v === "everyone" || v === "following") dmPrivacy = v; res.json({ dm_privacy: dmPrivacy }); });

  // ── Keys ───────────────────────────────────────────────────────────────
  app.get("/api/dm/keys/:userId", protect, (req, res) => {
    const id = req.params.userId === "me" ? me.id : req.params.userId;
    if (!person(id)) return res.status(404).json({ error: "No key published", code: "NO_KEY" });
    const version = req.query.version != null ? parseInt(req.query.version, 10) : null;
    if (version != null && version !== keyOf(id).version) return res.status(404).json({ error: "No key at that version", code: "NO_KEY" });
    res.json(keyRow(id));
  });
  app.put("/api/dm/keys", protect, (req, res) => {
    const pub = req.body?.publicKey;
    if (typeof pub !== "string" || Buffer.from(pub, "base64").length !== 32) return res.status(400).json({ error: "publicKey must be 32 base64 bytes" });
    const k = keyOf(me.id);
    if (pub === k.pubB64) return res.json({ ...keyRow(me.id), rotated: false });
    // A different key bumps the version (the browser then reads as "stale").
    k.version += 1; k.pubB64 = pub; k.pub = Buffer.from(pub, "base64");
    res.json({ ...keyRow(me.id), rotated: true });
  });

  // ── Conversations ──────────────────────────────────────────────────────
  app.get("/api/dm/conversations", protect, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit ?? "50", 10) || 50, 100);
    const before = req.query.before ?? null;
    let rows = [...convs.values()].filter(isVisible).map(inboxRow);
    rows.sort((a, b) => String(b.last_message_at ?? b.created_at).localeCompare(String(a.last_message_at ?? a.created_at)));
    if (before) rows = rows.filter((r) => (r.last_message_at ?? r.created_at) < before);
    res.json(rows.slice(0, limit));
  });
  app.post("/api/dm/conversations", protect, (req, res) => {
    const userId = req.body?.userId ?? req.body?.user_id;
    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (userId === me.id) return res.status(400).json({ error: "You can't message yourself", code: "SELF_MESSAGE" });
    if (!person(userId)) return res.status(404).json({ error: "User not found", code: "USER_NOT_FOUND" });
    if (blockedByMe.has(userId)) return res.status(403).json({ error: "You blocked this user", code: "YOU_BLOCKED_THIS_USER" });
    if (blocksMe.has(userId)) return res.status(403).json({ error: "Cannot message this user", code: "CANNOT_MESSAGE_USER" });
    const c = convWith(userId) ?? createConv(userId);
    res.json(openShape(c));
  });
  app.get("/api/dm/conversations/:id/messages", protect, (req, res) => {
    const c = convs.get(req.params.id);
    if (!c) return res.status(404).json({ error: "Conversation not found", code: "CONVERSATION_NOT_FOUND" });
    const limit = Math.min(parseInt(req.query.limit ?? "50", 10) || 50, 100);
    const before = req.query.before ?? null, beforeId = req.query.before_id ?? null;
    let list = visibleMessages(c, me.id).slice().reverse();   // newest first
    if (before) list = list.filter((m) => m.created_at < before || (m.created_at === before && beforeId && m.id < beforeId));
    res.json({ conversation_id: c.id, other_id: c.other, last_read_at: c.read[me.id] ?? null, other_last_read_at: c.read[c.other] ?? null, messages: list.slice(0, limit) });
  });

  const sentTimes = [];
  const REPLIES = ["lol yeah", "for real", "wait what", "say less", "that's the one", "ok I'm down", "send the clip", "no way that's live", "gg", "brb queueing"];
  app.post("/api/dm/conversations/:id/messages", protect, (req, res) => {
    const c = convs.get(req.params.id);
    if (!c) return res.status(404).json({ error: "Conversation not found", code: "CONVERSATION_NOT_FOUND" });
    if (blockedByMe.has(c.other)) return res.status(403).json({ error: "You blocked this user", code: "YOU_BLOCKED_THIS_USER" });
    if (blocksMe.has(c.other)) return res.status(403).json({ error: "Cannot message this user", code: "CANNOT_MESSAGE_USER" });
    const { ciphertext, nonce, senderKeyVersion, recipientKeyVersion, contentType } = req.body ?? {};
    if (typeof ciphertext !== "string" || typeof nonce !== "string") return res.status(400).json({ error: "ciphertext and nonce are required" });
    if (!["text", "link", "image", "video", "system"].includes(contentType)) return res.status(400).json({ error: "Invalid contentType" });
    const t = Date.now();
    while (sentTimes.length && sentTimes[0] < t - 60_000) sentTimes.shift();
    if (sentTimes.length >= 30) return res.status(429).json({ error: "Slow down — messages are limited to 30 a minute.", code: "RATE_LIMITED" });
    sentTimes.push(t);
    const row = { id: msgId(), conversation_id: c.id, sender_id: me.id, ciphertext, nonce, sender_key_version: senderKeyVersion ?? 1, recipient_key_version: recipientKeyVersion ?? 1, content_type: contentType, created_at: now() };
    c.messages.push(row);
    c.last_message_at = row.created_at;
    c.hidden[me.id] = null;
    res.json(row);
    // The other side reads it, types, and answers (so Seen / typing / live append all show).
    setTimeout(() => { c.read[c.other] = now(); toMe("dm:read", { conversationId: c.id, userId: c.other, readAt: c.read[c.other] }); }, 1200);
    setTimeout(() => toMe("dm:typing", { conversationId: c.id, userId: c.other }), 2500);
    setTimeout(() => {
      const reply = addText(c, c.other, REPLIES[seq % REPLIES.length]);
      toMe("dm:message", { conversationId: c.id, message: reply });
    }, 5000);
  });
  app.post("/api/dm/conversations/:id/read", protect, (req, res) => {
    const c = convs.get(req.params.id);
    if (!c) return res.status(404).json({ error: "Conversation not found", code: "CONVERSATION_NOT_FOUND" });
    c.read[me.id] = now();
    res.json({ conversation_id: c.id, read_at: c.read[me.id] });
  });
  app.delete("/api/dm/conversations/:id", protect, (req, res) => {
    const c = convs.get(req.params.id);
    if (!c) return res.status(404).json({ error: "Conversation not found", code: "CONVERSATION_NOT_FOUND" });
    c.hidden[me.id] = now();
    res.json({ removed: true, purged: false });
  });

  // ── Blocks ─────────────────────────────────────────────────────────────
  app.post("/api/dm/blocks", protect, (req, res) => {
    const userId = req.body?.userId ?? req.body?.user_id;
    if (!userId || !person(userId)) return res.status(404).json({ error: "User not found", code: "USER_NOT_FOUND" });
    blockedByMe.add(userId);
    res.json({ blocked: true, conversation_id: convWith(userId)?.id ?? null });
  });
  app.delete("/api/dm/blocks/:userId", protect, (req, res) => { blockedByMe.delete(req.params.userId); res.json({ blocked: false }); });

  app.get("/api/dm/unread-count", protect, (_req, res) => res.json({ unread_count: unreadTotal(), count: unreadTotal() }));
  app.get("/api/dm/presence", protect, (_req, res) => res.json({ user_id: me.id, sockets_in_room: io()?.sockets.adapter.rooms.get(`user:${me.id}`)?.size ?? 0 }));

  // ── Uploads (blind relay; bytes live in memory) ────────────────────────
  app.post("/api/dm/uploads", protect, (req, res) => {
    const { conversationId, kind, size } = req.body ?? {};
    const c = convs.get(conversationId);
    if (!c) return res.status(404).json({ error: "Conversation not found", code: "CONVERSATION_NOT_FOUND" });
    if (kind !== "image" && kind !== "video") return res.status(400).json({ error: "kind must be image or video" });
    const cap = kind === "image" ? 6_000_000 : 50_000_000;
    if (Number(size) > cap) return res.status(413).json({ error: "Upload too large", code: "UPLOAD_TOO_LARGE" });
    const id = `up-${randomUUID().slice(0, 8)}`;
    uploads.set(id, { conversation_id: c.id, kind, bytes: null, expired: false });
    res.status(201).json({ id, upload_url: `${PUBLIC_URL}/mock-uploads/${id}`, expires_in: 7200, kind, max_bytes: cap, expires_at: new Date(Date.now() + 7200e3).toISOString() });
  });
  app.get("/api/dm/uploads/:id", protect, (req, res) => {
    const u = uploads.get(req.params.id);
    if (!u) return res.status(404).json({ error: "Upload not found", code: "UPLOAD_NOT_FOUND" });
    if (u.expired) return res.status(410).json({ error: "Upload expired", code: "UPLOAD_EXPIRED" });
    if (!u.bytes) return res.status(404).json({ error: "Upload not ready", code: "UPLOAD_NOT_READY" });
    res.json({ id: req.params.id, url: `${PUBLIC_URL}/mock-uploads/${req.params.id}`, expires_in: 600, kind: u.kind, size: u.bytes.length, expires_at: new Date(Date.now() + 600e3).toISOString() });
  });
  // The "bucket": PUT the ciphertext, GET it back (no auth, like a signed URL).
  const cors = (_req, res, next) => { res.set("Access-Control-Allow-Origin", "*"); res.set("Access-Control-Allow-Methods", "GET, PUT, OPTIONS"); res.set("Access-Control-Allow-Headers", "Content-Type"); next(); };
  app.options("/mock-uploads/:id", cors, (_req, res) => res.sendStatus(204));
  app.put("/mock-uploads/:id", cors, express.raw({ type: () => true, limit: "60mb" }), (req, res) => {
    const u = uploads.get(req.params.id);
    if (!u) return res.status(404).json({ error: "Upload not found" });
    u.bytes = Buffer.from(req.body);
    res.json({ ok: true, size: u.bytes.length });
  });
  app.get("/mock-uploads/:id", cors, (req, res) => {
    const u = uploads.get(req.params.id);
    if (!u || !u.bytes) return res.status(404).end();
    res.set("Content-Type", "application/octet-stream");
    res.send(u.bytes);
  });

  // Handed to registerSockets below.
  h.dmMock = { convs, addText, toMe, me, person };
}

export function registerSockets(io, h) {
  const readJwt = (token) => { if (!token) return null; try { return JSON.parse(Buffer.from(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()); } catch { return null; } };
  io.on("connection", (socket) => {
    const auth = socket.handshake.auth?.token ?? (socket.handshake.headers.authorization ?? "").replace(/^Bearer /, "");
    const userId = readJwt(auth)?.sub ?? h.me.id;     // every authenticated socket auto-joins its personal room
    socket.join(`user:${userId}`);
    socket.on("dm:typing", () => { /* relayed to the other participant's room — nobody else is online in the mock */ });

    // ~20 s after connect: tarik types, then a message lands (inbox bump + thread append + dot).
    const dm = h.dmMock;
    if (!dm || userId !== dm.me.id) return;
    const typing = setTimeout(() => socket.emit("dm:typing", { conversationId: "conv-18", userId: "user-18" }), 17_000);
    const message = setTimeout(() => {
      const c = dm.convs.get("conv-18");
      if (!c) return;
      const row = dm.addText(c, "user-18", "also, lineup for tonight: you, me, boostio, tarik's cousin and a random");
      io.to(`user:${userId}`).emit("dm:message", { conversationId: c.id, message: row });
    }, 20_000);
    socket.on("disconnect", () => { clearTimeout(typing); clearTimeout(message); });
  });
}

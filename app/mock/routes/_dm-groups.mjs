// mock/routes/_dm-groups.mjs — DM message actions and group chats
// (backend/dm-actions-contract.md, backend/group-chats-contract.md; the
// real routes: backend routes/dm.js + controllers/dmController.js +
// models/DirectMessage.js), with REAL crypto so the web is checked against
// the iOS recipe byte for byte:
//
//   • a group key is 32 random bytes per version, sealed to each member with
//     the pair's key: X25519 → HKDF-SHA256("insight-dm-v1") → AES-256-GCM,
//     plaintext {"t":"group_key","body":"<base64 32 bytes>"}. Every blob the
//     web posts (create, add people, rotate) is OPENED here with the
//     recipient's own private key; one that doesn't open, or opens to a
//     different key than the others, is refused (400 KEYS_UNOPENABLE, logged).
//   • a group message / edit / reaction is AES-256-GCM with the group key
//     itself (no HKDF), groupKeyVersion on the wire, pair versions 0. The mock
//     opens what the web sends and logs the envelope's `t` (and re/fw).
//   • a direct reaction is sealed with the pair's key ({"t":"reaction","body":emoji}).
//
// The leading "_" registers these before _moderation.mjs and dm.mjs, so the
// group ids are answered here and every direct-chat path falls through with
// next() (inbox rows and thread pages are decorated on the way out:
// reactions, pinned_at, pins, delete-for-you).
//
// Seed: "Skim SD" (conv-g1, tarik's, events on: renamed, jettmain added,
// demon1 left → key_rotation_needed, so the first send rotates to v2) and an
// unnamed group (conv-g2, mine, no `events` key: a server before the
// migration, so the lines come from the roster: "You added caps", "leo
// joined the group"). Direct chats get a reaction and a pin (tarik).
//
// Bots: every message you send in a group is read by two members (dm:read),
// one types, then answers sealed with the CURRENT group key (taken from the
// web's own rotation blobs when it rotated).
//
// Test hooks (no api key): GET /mock/dm/groups → state incl. the verify log;
// POST /mock/dm/groups/reset → reseed.
import { createCipheriv, createDecipheriv, createHash, createPrivateKey, createPublicKey, diffieHellman, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import { ME_PRIVATE_KEY_B64 } from "./dm.mjs";

// ── Keys (the same derivation dm.mjs uses) ────────────────────────────────
const PKCS8_PREFIX = Buffer.from("302e020100300506032b656e04220420", "hex");
const privFromRaw = (raw) => createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, raw]), format: "der", type: "pkcs8" });
const privOf = (id) => privFromRaw(id === "user-1" ? Buffer.from(ME_PRIVATE_KEY_B64, "base64") : createHash("sha256").update(`insight-mock-dm:${id}`).digest());
const pubB64Of = (id) => createPublicKey(privOf(id)).export({ type: "spki", format: "der" }).subarray(-32).toString("base64");
/** The pair's AES key, from a's private half and b's public half. */
const pairKey = (a, b) => Buffer.from(hkdfSync("sha256", diffieHellman({ privateKey: privOf(a), publicKey: createPublicKey(privOf(b)) }), Buffer.alloc(0), "insight-dm-v1", 32));
const seal = (key, envelope) => {
  const nonce = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, nonce);
  const ct = Buffer.concat([c.update(Buffer.from(JSON.stringify(envelope), "utf8")), c.final()]);
  return { ciphertext: Buffer.concat([ct, c.getAuthTag()]).toString("base64"), nonce: nonce.toString("base64") };
};
const open = (key, ciphertext, nonce) => {
  try {
    const wire = Buffer.from(ciphertext, "base64");
    if (wire.length <= 16) return null;
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(nonce, "base64"));
    d.setAuthTag(wire.subarray(wire.length - 16));
    const plain = Buffer.concat([d.update(wire.subarray(0, wire.length - 16)), d.final()]);
    const env = JSON.parse(plain.toString("utf8"));
    return env && typeof env.t === "string" ? env : null;
  } catch { return null; }
};

const STYLES = [null, ["ring", "shine", "mark"], ["shine"], ["mark"], [], ["ring", "shine"], ["ring", "mark"]];
const NAMES = ["tenz_fan", "s1mple_enjoyer", "faker_goat", "aspas", "zywoo_w", "demon1", "chronicle", "jettmain", "boostio", "yay", "caps", "oner_fan", "derke", "leo", "cNed", "sinatraa", "tarik", "shroud", "nats", "m0nesy"];
const UUIDish = /^[A-Za-z0-9_-]{1,64}$/;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

export function register(app, h) {
  const { isoAgo, me, protect, rand } = h;
  const PUBLIC_URL = process.env.MOCK_PUBLIC_URL ?? `http://localhost:${process.env.MOCK_PORT ?? 4000}`;
  const now = () => new Date().toISOString();
  const MIN = 6e4, HOUR = 36e5, DAY = 864e5;

  // The same look _moderation.mjs gives user-2 … user-21.
  const people = new Map(NAMES.map((username, i) => {
    const is_premium = rand(i + 7) > 0.65;
    return [`user-${i + 2}`, { id: `user-${i + 2}`, username, is_premium, premium_style: is_premium ? STYLES[i % STYLES.length] : null, avatar_url: i % 3 !== 2 ? `${PUBLIC_URL}/mock/avatar/${encodeURIComponent(username)}.png` : null }];
  }));
  const person = (id) => (id === me.id ? { id: me.id, username: me.username, avatar_url: me.avatar_url ?? null, is_premium: !!me.is_premium, premium_style: me.premium_style ?? null } : people.get(id) ?? null);
  const nameOf = (id) => person(id)?.username ?? null;

  const io = () => h.io ?? null;
  const toMe = (event, payload) => { io()?.to(`user:${me.id}`).emit(event, payload); };
  const fail = (res, status, code, error, extra = {}) => res.status(status).json({ error, code, ...extra });

  // ── State ──────────────────────────────────────────────────────────────
  let groups, reactions, pins, hidden, mutedDirect, reports, verifyLog, seq;
  const msgId = () => `gmsg-${String(++seq).padStart(4, "0")}`;
  const evId = () => `gev-${randomUUID().slice(0, 8)}`;

  const live = (g) => [...g.members.values()].filter((m) => !m.left_at);
  const isLiveMember = (g, uid) => { const m = g.members.get(uid); return !!m && !m.left_at; };
  const addEvent = (g, kind, actorId, targetId = null, detail = null, at = now()) => {
    if (!g.events) return null;
    const e = { id: evId(), kind, created_at: at, actor_id: actorId, actor_username: nameOf(actorId), target_id: targetId, target_username: targetId ? nameOf(targetId) : null, detail };
    g.events.push(e);
    return e;
  };
  /** Blobs: key_version|recipient → row; the raw keys this mock knows (for its bots). */
  const sealKeyTo = (g, version, senderId, recipientId) => {
    const raw = g.keys.get(version);
    const sealed = seal(pairKey(senderId, recipientId), { t: "group_key", body: raw.toString("base64") });
    g.blobs.set(`${version}|${recipientId}`, { key_version: version, sender_id: senderId, ciphertext: sealed.ciphertext, nonce: sealed.nonce, sender_key_version: 1, recipient_key_version: 1 });
  };
  const addGroupMessage = (g, senderId, envelope, contentType = "text", at = now()) => {
    const version = g.group_key_version;
    const sealed = seal(g.keys.get(version), envelope);
    const row = { id: msgId(), conversation_id: g.id, sender_id: senderId, ciphertext: sealed.ciphertext, nonce: sealed.nonce, sender_key_version: 0, recipient_key_version: 0, content_type: contentType, created_at: at, edited_at: null, group_key_version: version };
    g.messages.push(row);
    g.messages.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    g.last_message_at = g.messages[g.messages.length - 1].created_at;
    return row;
  };
  const reactAs = (cid, messageId, userId, emoji, key, groupVersion = null) => {
    const sealed = seal(key, { t: "reaction", body: emoji });
    if (!reactions.has(messageId)) reactions.set(messageId, new Map());
    reactions.get(messageId).set(userId, { user_id: userId, ciphertext: sealed.ciphertext, nonce: sealed.nonce, sender_key_version: groupVersion ? 0 : 1, recipient_key_version: groupVersion ? 0 : 1, group_key_version: groupVersion, created_at: now() });
  };

  function seed() {
    groups = new Map(); reactions = new Map(); pins = new Map(); hidden = new Set(); mutedDirect = new Map(); reports = []; verifyLog = []; seq = 0;
    const mk = (id, { name, createdBy, createdAt, memberIds, events }) => {
      const g = { id, name, created_by: createdBy, created_at: createdAt, last_message_at: createdAt, group_key_version: 1, key_rotation_needed: false, members: new Map(), keys: new Map([[1, randomBytes(32)]]), blobs: new Map(), messages: [], events: events ? [] : null, muted: false };
      for (const uid of memberIds) g.members.set(uid, { user_id: uid, role: uid === createdBy ? "admin" : "member", joined_at: createdAt, left_at: null, last_read_at: createdAt, added_by: null });
      for (const uid of memberIds) sealKeyTo(g, 1, createdBy, uid);
      groups.set(id, g);
      return g;
    };
    {
      // Skim SD — tarik's group; the server keeps events (rev 2).
      const made = isoAgo(6 * DAY);
      const g = mk("conv-g1", { name: null, createdBy: "user-18", createdAt: made, memberIds: ["user-18", me.id, "user-10", "user-7"], events: true });
      g.name = "Skim SD";
      addEvent(g, "renamed", "user-18", null, "Skim SD", isoAgo(6 * DAY - MIN));
      addGroupMessage(g, "user-18", { t: "text", body: "made a chat for the watch parties" }, "text", isoAgo(6 * DAY - 2 * MIN));
      const mine = addGroupMessage(g, me.id, { t: "text", body: "finally. who's hosting champs?" }, "text", isoAgo(6 * DAY - 4 * MIN));
      addGroupMessage(g, "user-10", { t: "text", body: "my place, bring snacks" }, "text", isoAgo(6 * DAY - 5 * MIN));
      reactAs(g.id, mine.id, "user-18", "❤️", g.keys.get(1), 1);
      // jettmain added two days ago by tarik: no read stamp yet (rev 2), so not a reader.
      const joined = isoAgo(2 * DAY);
      g.members.set("user-9", { user_id: "user-9", role: "member", joined_at: joined, left_at: null, last_read_at: null, added_by: "user-18" });
      sealKeyTo(g, 1, "user-18", "user-9");
      addEvent(g, "added", "user-18", "user-9", null, joined);
      addGroupMessage(g, "user-18", { t: "text", body: "added jettmain, he's in for saturday" }, "text", isoAgo(2 * DAY - 3 * MIN));
      // demon1 left yesterday: the next sender rotates the key.
      g.members.get("user-7").left_at = isoAgo(DAY);
      g.blobs.delete("1|user-7");
      g.key_rotation_needed = true;
      addEvent(g, "left", "user-7", null, null, isoAgo(DAY));
      const q = addGroupMessage(g, me.id, { t: "text", body: "lineup for tonight: me, tarik, boostio, jettmain + a random" }, "text", isoAgo(2 * HOUR));
      addGroupMessage(g, "user-10", { t: "text", body: "lock it in 🔒", re: q.id, rq: "lineup for tonight: me, tarik, boostio, jettmain + a random", rs: me.id }, "text", isoAgo(30 * MIN));
      g.members.get(me.id).last_read_at = isoAgo(2 * HOUR);
      g.members.get("user-18").last_read_at = isoAgo(20 * MIN);
      g.members.get("user-10").last_read_at = isoAgo(30 * MIN);
    }
    {
      // An unnamed group I made; this server sends no `events` (before the migration).
      const made = isoAgo(4 * DAY);
      const g = mk("conv-g2", { name: null, createdBy: me.id, createdAt: made, memberIds: [me.id, "user-5", "user-11"], events: false });
      addGroupMessage(g, "user-5", { t: "text", body: "ranked 5 stack this week?" }, "text", isoAgo(4 * DAY - 10 * MIN));
      addGroupMessage(g, me.id, { t: "text", body: "thursday works, I'll bring caps in" }, "text", isoAgo(3 * DAY + HOUR));
      g.members.get(me.id).last_read_at = isoAgo(3 * DAY + HOUR);
      // caps: added by me; the old server stamped his read at the add — not a read (N15-4).
      g.members.set("user-12", { user_id: "user-12", role: "member", joined_at: isoAgo(3 * DAY), left_at: null, last_read_at: isoAgo(3 * DAY), added_by: me.id });
      sealKeyTo(g, 1, me.id, "user-12");
      // leo: joined with nobody named as the adder.
      g.members.set("user-15", { user_id: "user-15", role: "member", joined_at: isoAgo(2 * DAY), left_at: null, last_read_at: null, added_by: null });
      sealKeyTo(g, 1, me.id, "user-15");
    }
    // Direct chats: tarik ❤️ my first line and pinned his own.
    const dm = h.dmMock;
    const c = dm?.convs.get("conv-18");
    if (c) {
      const myFirst = c.messages.find((m) => m.sender_id === me.id);
      if (myFirst) reactAs(c.id, myFirst.id, "user-18", "❤️", pairKey("user-18", me.id));
      const his = c.messages.find((m) => m.sender_id === "user-18");
      if (his) pins.set(his.id, { pinned_at: isoAgo(DAY), pinned_by: "user-18" });
    }
  }
  // dm.mjs registers after this file; its conversations exist once every module is in.
  let seeded = false;
  const ensure = () => { if (!seeded) { seeded = true; seed(); } };

  // ── Shapes ─────────────────────────────────────────────────────────────
  const reactionsOf = (mid) => [...(reactions.get(mid)?.values() ?? [])];
  const decorate = (m) => (m ? { ...m, reactions: reactionsOf(m.id), pinned_at: pins.get(m.id)?.pinned_at ?? null, group_key_version: m.group_key_version ?? null } : m);
  const memberShape = (m) => {
    const p = person(m.user_id) ?? { id: m.user_id, username: "User", avatar_url: null, is_premium: false, premium_style: null };
    return { id: m.user_id, username: p.username, avatar_url: p.avatar_url, is_premium: !!p.is_premium, premium_style: p.premium_style ?? null, title: null, role: m.role, joined_at: m.joined_at, last_read_at: m.last_read_at, public_key: pubB64Of(m.user_id), key_version: 1, added_by: m.added_by, added_by_username: m.added_by ? nameOf(m.added_by) : null };
  };
  const visibleTo = (g, uid) => g.messages.filter((m) => !(uid === me.id && hidden.has(m.id)));
  const groupRow = (g) => {
    const mine = g.members.get(me.id);
    const msgs = visibleTo(g, me.id);
    const last = msgs[msgs.length - 1] ?? null;
    const floor = mine?.last_read_at ?? mine?.joined_at ?? null;
    const unread = msgs.filter((m) => m.sender_id !== me.id && (!floor || m.created_at > floor)).length;
    return {
      id: g.id, kind: "group", name: g.name, created_by: g.created_by, created_at: g.created_at, last_message_at: g.last_message_at,
      last_read_at: mine?.last_read_at ?? null, muted: !!g.muted, unread_count: unread,
      group_key_version: g.group_key_version, key_rotation_needed: g.key_rotation_needed,
      last_message: decorate(last), members: live(g).map(memberShape),
    };
  };
  const myGroups = () => [...groups.values()].filter((g) => isLiveMember(g, me.id));
  const groupOf = (req, res) => {
    ensure();
    const g = groups.get(req.params.id);
    if (!g || !isLiveMember(g, me.id)) { fail(res, 404, "CONVERSATION_NOT_FOUND", "Conversation not found"); return null; }
    return g;
  };
  const announce = (g, events = [], removedMe = false) => {
    const lines = events.length ? { event: events[0], events } : {};
    toMe("dm:group_updated", removedMe ? { conversationId: g.id, conversation: null, removed: true, ...lines } : { conversationId: g.id, conversation: groupRow(g), ...lines });
  };
  const mapJson = (res, fn) => { const orig = res.json.bind(res); res.json = (body) => orig(res.statusCode < 400 ? fn(body) : body); };

  // ── Sealed payload checks (sealedFields) ───────────────────────────────
  const sealedFields = (body, group) => {
    const { ciphertext, nonce, groupKeyVersion } = body ?? {};
    if (typeof ciphertext !== "string" || !ciphertext || !B64.test(ciphertext)) return { error: "ciphertext must be base64 and under 64 KB" };
    if (typeof nonce !== "string" || nonce.length < 12 || !B64.test(nonce)) return { error: "nonce must be a base64 12-byte nonce" };
    if (group && !(parseInt(groupKeyVersion, 10) >= 1)) return { error: "groupKeyVersion is required in a group" };
    return { ciphertext, nonce, gkv: group ? parseInt(groupKeyVersion, 10) : null };
  };
  const assertGroupKey = (res, g, gkv) => {
    if (g.key_rotation_needed) { fail(res, 409, "KEY_ROTATION_NEEDED", "The group key must be rotated before sending", { group_key_version: g.group_key_version }); return false; }
    if (gkv !== g.group_key_version) { fail(res, 409, "KEY_VERSION", "The group key has changed; read the group again", { group_key_version: g.group_key_version }); return false; }
    return true;
  };
  /** The web's blobs, each opened with the recipient's private key: all must hold the same 32 bytes. */
  const checkBlobs = (keys, version, recipients, label) => {
    let raw = null;
    const bad = [];
    for (const rid of recipients) {
      const b = keys.find((k) => k && k.recipientId === rid && parseInt(k.keyVersion, 10) === version);
      if (!b) { bad.push({ rid, why: "missing" }); continue; }
      // Sealed by me to rid: the pair key is X25519(rid's private, my public) too.
      const env = open(pairKey(rid, me.id), b.ciphertext, b.nonce);
      if (!env || env.t !== "group_key" || typeof env.body !== "string") { bad.push({ rid, why: "won't open" }); continue; }
      const k = Buffer.from(env.body, "base64");
      if (k.length !== 32) { bad.push({ rid, why: "not 32 bytes" }); continue; }
      if (raw && !raw.equals(k)) { bad.push({ rid, why: "a different key" }); continue; }
      raw = k;
      if (parseInt(b.senderKeyVersion, 10) !== 1 || parseInt(b.recipientKeyVersion, 10) !== 1) bad.push({ rid, why: `versions ${b.senderKeyVersion}/${b.recipientKeyVersion}` });
    }
    verifyLog.push({ at: now(), label, version, recipients: recipients.length, ok: bad.length === 0, bad });
    console.log(`[mock] group key ${label} v${version}: ${recipients.length} blob(s) ${bad.length ? `REFUSED ${JSON.stringify(bad)}` : "all open to the same key ✓"}`);
    return bad.length ? null : raw;
  };

  // ── Bots: read, type, answer (sealed with the current key) ─────────────
  const REPLIES = ["say less", "I'm in", "ok bet", "lol same", "send it", "gg"];
  const groupBots = (g) => {
    const others = live(g).filter((m) => m.user_id !== me.id).map((m) => m.user_id);
    const [a, b] = others;
    if (a) setTimeout(() => { const m = g.members.get(a); if (!m || m.left_at) return; m.last_read_at = now(); toMe("dm:read", { conversationId: g.id, userId: a, readAt: m.last_read_at }); }, 1200);
    if (b) setTimeout(() => { const m = g.members.get(b); if (!m || m.left_at) return; m.last_read_at = now(); toMe("dm:read", { conversationId: g.id, userId: b, readAt: m.last_read_at }); }, 2000);
    const replier = b ?? a;
    if (!replier) return;
    setTimeout(() => toMe("dm:typing", { conversationId: g.id, userId: replier }), 2600);
    setTimeout(() => {
      if (!g.keys.get(g.group_key_version) || g.key_rotation_needed) return;
      const row = addGroupMessage(g, replier, { t: "text", body: REPLIES[seq % REPLIES.length] });
      const m = g.members.get(replier); if (m) m.last_read_at = row.created_at;
      toMe("dm:message", { conversationId: g.id, message: decorate(row) });
    }, 5200);
  };

  // ── Inbox / unread: groups added, direct rows decorated ────────────────
  app.get("/api/dm/conversations", protect, (_req, res, next) => {
    ensure();
    mapJson(res, (rows) => {
      if (!Array.isArray(rows)) return rows;
      const direct = rows.map((r) => {
        const c = h.dmMock?.convs.get(r.id);
        if (!c) return r;
        const visible = c.messages.filter((m) => !hidden.has(m.id));
        const last = r.last_message && hidden.has(r.last_message.id) ? visible[visible.length - 1] ?? null : r.last_message;
        return { ...r, kind: "direct", muted: !!mutedDirect.get(r.id), last_message: decorate(last) };
      });
      const all = [...direct, ...myGroups().map(groupRow)];
      all.sort((a, b) => String(b.last_message_at ?? b.created_at).localeCompare(String(a.last_message_at ?? a.created_at)));
      return all;
    });
    next();
  });
  app.get("/api/dm/unread-count", protect, (_req, res, next) => {
    ensure();
    mapJson(res, (b) => {
      const n = myGroups().filter((g) => groupRow(g).unread_count > 0).length;
      return b && typeof b === "object" ? { ...b, unread_count: (b.unread_count ?? 0) + n, count: (b.count ?? 0) + n } : b;
    });
    next();
  });

  // ── Thread pages ───────────────────────────────────────────────────────
  app.get("/api/dm/conversations/:id/messages", protect, (req, res, next) => {
    ensure();
    const g = groups.get(req.params.id);
    if (!g) {
      // A direct chat: delete-for-you, reactions, pins on the way out.
      mapJson(res, (b) => {
        if (!b || !Array.isArray(b.messages)) return b;
        const c = h.dmMock?.convs.get(req.params.id);
        const pinned = c ? c.messages.filter((m) => pins.has(m.id) && !hidden.has(m.id)).sort((x, y) => pins.get(y.id).pinned_at.localeCompare(pins.get(x.id).pinned_at)).slice(0, 3).map(decorate) : [];
        return { ...b, kind: "direct", muted: !!mutedDirect.get(req.params.id), messages: b.messages.filter((m) => !hidden.has(m.id)).map(decorate), pins: pinned };
      });
      return next();
    }
    if (!isLiveMember(g, me.id)) return fail(res, 404, "CONVERSATION_NOT_FOUND", "Conversation not found");
    const limit = Math.min(parseInt(req.query.limit ?? "50", 10) || 50, 100);
    const before = req.query.before ?? null, beforeId = req.query.before_id ?? null;
    let list = visibleTo(g, me.id).slice().reverse();
    if (before) list = list.filter((m) => m.created_at < before || (m.created_at === before && beforeId && m.id < beforeId));
    const page = list.slice(0, limit);
    const reachedStart = page.length < limit;
    const oldest = page.length ? page[page.length - 1].created_at : null;
    const events = g.events ? g.events.filter((e) => (reachedStart || !oldest || e.created_at >= oldest) && (!before || e.created_at < before)) : undefined;
    const pinned = g.messages.filter((m) => pins.has(m.id) && !hidden.has(m.id)).sort((x, y) => pins.get(y.id).pinned_at.localeCompare(pins.get(x.id).pinned_at)).slice(0, 3).map(decorate);
    res.json({
      conversation_id: g.id, kind: "group", name: g.name, created_by: g.created_by, last_read_at: g.members.get(me.id).last_read_at, muted: !!g.muted,
      members: live(g).map(memberShape), group_key_version: g.group_key_version, key_rotation_needed: g.key_rotation_needed,
      messages: page.map(decorate), pins: pinned, ...(events !== undefined ? { events } : {}),
    });
  });

  // ── Send / edit / unsend / read in a group ─────────────────────────────
  app.post("/api/dm/conversations/:id/messages", protect, (req, res, next) => {
    ensure();
    if (!groups.has(req.params.id)) return next();
    const g = groupOf(req, res); if (!g) return;
    const f = sealedFields(req.body, true);
    if (f.error) return res.status(400).json({ error: f.error });
    if (!assertGroupKey(res, g, f.gkv)) return;
    const ct = req.body?.contentType ?? "text";
    if (!["text", "link", "image", "video", "system"].includes(ct)) return res.status(400).json({ error: "Invalid contentType" });
    const env = open(g.keys.get(f.gkv), f.ciphertext, f.nonce);
    console.log(`[mock] group ${g.id} send v${f.gkv}: ${env ? `opens ✓ t=${env.t}${env.re ? " re" : ""}${env.fw ? " fw" : ""}` : "WON'T OPEN with the group key"}`);
    verifyLog.push({ at: now(), label: "send", version: f.gkv, ok: !!env, t: env?.t ?? null, body: env?.body ?? env?.url ?? null, re: env?.re ?? null, fw: env?.fw ?? null });
    const row = { id: msgId(), conversation_id: g.id, sender_id: me.id, ciphertext: f.ciphertext, nonce: f.nonce, sender_key_version: Number(req.body?.senderKeyVersion ?? 0), recipient_key_version: Number(req.body?.recipientKeyVersion ?? 0), content_type: ct, created_at: now(), edited_at: null, group_key_version: f.gkv };
    g.messages.push(row);
    g.last_message_at = row.created_at;
    g.members.get(me.id).last_read_at = row.created_at;   // sending is reading
    res.status(201).json(decorate(row));
    groupBots(g);
  });
  app.patch("/api/dm/conversations/:id/messages/:messageId", protect, (req, res, next) => {
    ensure();
    if (!groups.has(req.params.id)) return next();
    const g = groupOf(req, res); if (!g) return;
    const m = g.messages.find((x) => x.id === req.params.messageId);
    if (!m) return fail(res, 404, "MESSAGE_NOT_FOUND", "Message not found");
    if (m.sender_id !== me.id) return fail(res, 403, "NOT_SENDER", "Only the sender can edit a message");
    const f = sealedFields(req.body, true);
    if (f.error) return res.status(400).json({ error: f.error });
    if (!assertGroupKey(res, g, f.gkv)) return;
    const env = open(g.keys.get(f.gkv), f.ciphertext, f.nonce);
    verifyLog.push({ at: now(), label: "edit", version: f.gkv, ok: !!env, t: env?.t ?? null, body: env?.body ?? null });
    Object.assign(m, { ciphertext: f.ciphertext, nonce: f.nonce, content_type: req.body?.contentType ?? "text", edited_at: now(), group_key_version: f.gkv });
    toMe("dm:edited", { conversationId: g.id, message: decorate(m) });
    res.json(decorate(m));
  });
  app.delete("/api/dm/conversations/:id/messages/:messageId", protect, (req, res, next) => {
    ensure();
    if (!groups.has(req.params.id)) return next();
    const g = groupOf(req, res); if (!g) return;
    const i = g.messages.findIndex((x) => x.id === req.params.messageId);
    if (i < 0) return fail(res, 404, "MESSAGE_NOT_FOUND", "Message not found");
    const m = g.messages[i];
    if (m.sender_id !== me.id) return fail(res, 403, "NOT_SENDER", "Only the sender can unsend a message");
    g.messages.splice(i, 1);
    pins.delete(m.id); reactions.delete(m.id);
    g.last_message_at = g.messages[g.messages.length - 1]?.created_at ?? g.created_at;
    toMe("dm:deleted", { conversationId: g.id, messageId: m.id, deletedBy: me.id, contentType: m.content_type });
    res.json({ conversation_id: g.id, message_id: m.id, deleted: true, blobs_removed: 0 });
  });
  app.post("/api/dm/conversations/:id/read", protect, (req, res, next) => {
    ensure();
    if (!groups.has(req.params.id)) return next();
    const g = groupOf(req, res); if (!g) return;
    const mine = g.members.get(me.id);
    const changed = g.messages.some((m) => m.sender_id !== me.id && (!mine.last_read_at || m.created_at > mine.last_read_at));
    if (changed) mine.last_read_at = now();
    res.json({ conversation_id: g.id, read_at: mine.last_read_at, changed });
  });
  app.put("/api/dm/conversations/:id/mute", protect, (req, res) => {
    ensure();
    if (typeof req.body?.muted !== "boolean") return res.status(400).json({ error: "muted must be true or false" });
    const g = groups.get(req.params.id);
    if (g) { if (!isLiveMember(g, me.id)) return fail(res, 404, "CONVERSATION_NOT_FOUND", "Conversation not found"); g.muted = req.body.muted; }
    else mutedDirect.set(req.params.id, req.body.muted);
    res.json({});
  });

  // ── Message actions (direct and group) ─────────────────────────────────
  /** The conversation and message, as messageIn: {kind, cid, msg, otherId?, group?}. */
  const findMessage = (req, res) => {
    ensure();
    const cid = req.params.id, mid = req.params.messageId;
    if (!UUIDish.test(cid) || !UUIDish.test(mid)) { res.status(400).json({ error: "Invalid ID format" }); return null; }
    const g = groups.get(cid);
    if (g) {
      if (!isLiveMember(g, me.id)) { fail(res, 404, "CONVERSATION_NOT_FOUND", "Conversation not found"); return null; }
      const msg = g.messages.find((m) => m.id === mid);
      if (!msg) { fail(res, 404, "MESSAGE_NOT_FOUND", "Message not found"); return null; }
      return { kind: "group", cid, msg, group: g };
    }
    const c = h.dmMock?.convs.get(cid);
    if (!c) { fail(res, 404, "CONVERSATION_NOT_FOUND", "Conversation not found"); return null; }
    const msg = c.messages.find((m) => m.id === mid);
    if (!msg) { fail(res, 404, "MESSAGE_NOT_FOUND", "Message not found"); return null; }
    return { kind: "direct", cid, msg, otherId: c.other };
  };
  app.put("/api/dm/conversations/:id/messages/:messageId/reaction", protect, (req, res) => {
    const x = findMessage(req, res); if (!x) return;
    const f = sealedFields(req.body, x.kind === "group");
    if (f.error) return res.status(400).json({ error: f.error });
    const ct = req.body?.contentType;
    if (ct !== undefined && ct !== "reaction") return res.status(400).json({ error: "contentType must be reaction" });
    let env;
    if (x.kind === "group") {
      if (!assertGroupKey(res, x.group, f.gkv)) return;
      env = open(x.group.keys.get(f.gkv), f.ciphertext, f.nonce);
    } else {
      env = open(pairKey(x.otherId, me.id), f.ciphertext, f.nonce);
    }
    console.log(`[mock] reaction on ${x.msg.id} (${x.kind}): ${env?.t === "reaction" ? `opens ✓ ${env.body}` : "WON'T OPEN"}`);
    verifyLog.push({ at: now(), label: "reaction", ok: env?.t === "reaction", body: env?.body ?? null, kind: x.kind });
    const row = { user_id: me.id, ciphertext: f.ciphertext, nonce: f.nonce, sender_key_version: Number(req.body?.senderKeyVersion ?? (x.kind === "group" ? 0 : 1)), recipient_key_version: Number(req.body?.recipientKeyVersion ?? (x.kind === "group" ? 0 : 1)), group_key_version: f.gkv, created_at: now() };
    if (!reactions.has(x.msg.id)) reactions.set(x.msg.id, new Map());
    reactions.get(x.msg.id).set(me.id, row);
    toMe("dm:reaction", { conversationId: x.cid, messageId: x.msg.id, userId: me.id, reaction: row });
    res.json({});
  });
  app.delete("/api/dm/conversations/:id/messages/:messageId/reaction", protect, (req, res) => {
    const x = findMessage(req, res); if (!x) return;
    reactions.get(x.msg.id)?.delete(me.id);
    toMe("dm:reaction", { conversationId: x.cid, messageId: x.msg.id, userId: me.id, reaction: null });
    res.json({});
  });
  const pinHandler = (on) => (req, res) => {
    const x = findMessage(req, res); if (!x) return;
    let pinnedAt = null;
    if (on) {
      if (pins.has(x.msg.id)) pinnedAt = pins.get(x.msg.id).pinned_at;
      else {
        const list = x.kind === "group" ? x.group.messages : h.dmMock.convs.get(x.cid).messages;
        if (list.filter((m) => pins.has(m.id)).length >= 3) return fail(res, 409, "PIN_LIMIT", "A conversation can have 3 pinned messages");
        pinnedAt = now();
        pins.set(x.msg.id, { pinned_at: pinnedAt, pinned_by: me.id });
      }
    } else pins.delete(x.msg.id);
    toMe("dm:pinned", { conversationId: x.cid, messageId: x.msg.id, pinned: on, pinnedAt, pinnedBy: on ? me.id : null });
    res.json({});
  };
  app.put("/api/dm/conversations/:id/messages/:messageId/pin", protect, pinHandler(true));
  app.delete("/api/dm/conversations/:id/messages/:messageId/pin", protect, pinHandler(false));
  app.post("/api/dm/conversations/:id/messages/:messageId/hide", protect, (req, res) => {
    const x = findMessage(req, res); if (!x) return;
    hidden.add(x.msg.id);
    res.json({});
  });
  app.post("/api/dm/conversations/:id/messages/:messageId/report", protect, (req, res) => {
    const x = findMessage(req, res); if (!x) return;
    if (x.msg.sender_id === me.id) return fail(res, 400, "OWN_MESSAGE", "You cannot report your own message");
    const { text, reason } = req.body ?? {};
    if (text !== undefined && typeof text !== "string") return res.status(400).json({ error: "text must be a string" });
    reports.push({ at: now(), conversationId: x.cid, messageId: x.msg.id, reason: reason ?? "other", text: text ?? "" });
    console.log(`[mock] dm report ${x.cid}/${x.msg.id}: ${reason ?? "—"} “${String(text ?? "").slice(0, 60)}”`);
    res.json({});
  });

  // ── Groups ─────────────────────────────────────────────────────────────
  app.post("/api/dm/groups", protect, (req, res) => {
    ensure();
    const { name, memberIds, keyVersion, keys } = req.body ?? {};
    if (!Array.isArray(memberIds)) return fail(res, 400, "INVALID_MEMBERS", "memberIds must be a list of user ids");
    const ids = [...new Set(memberIds.filter((x) => typeof x === "string"))].filter((x) => x !== me.id);
    if (ids.length < 2) return fail(res, 400, "TOO_FEW_MEMBERS", "A group needs at least two other people");
    if (parseInt(keyVersion, 10) !== 1) return fail(res, 400, "KEY_VERSION", "A new group starts at key version 1");
    const missingUsers = ids.filter((x) => !person(x));
    if (missingUsers.length) return fail(res, 404, "USER_NOT_FOUND", "User not found", { ids: missingUsers });
    if (!Array.isArray(keys)) return fail(res, 400, "INVALID_KEYS", "keys must be a list");
    const all = [me.id, ...ids];
    const missing = all.filter((x) => !keys.some((k) => k?.recipientId === x && parseInt(k.keyVersion, 10) === 1));
    if (missing.length) return fail(res, 400, "KEYS_INCOMPLETE", "A key must be sealed to every member, you included", { missing });
    const raw = checkBlobs(keys, 1, all, "create");
    if (!raw) return fail(res, 400, "KEYS_UNOPENABLE", "A sealed key didn't open for its member (mock check)");
    const id = `conv-g${groups.size + 1}-${randomUUID().slice(0, 6)}`;
    const at = now();
    const n = typeof name === "string" && name.trim() ? name.trim().replace(/\s+/g, " ").slice(0, 60) : null;
    const g = { id, name: n, created_by: me.id, created_at: at, last_message_at: at, group_key_version: 1, key_rotation_needed: false, members: new Map(), keys: new Map([[1, raw]]), blobs: new Map(), messages: [], events: [], muted: false };
    for (const uid of all) g.members.set(uid, { user_id: uid, role: uid === me.id ? "admin" : "member", joined_at: at, left_at: null, last_read_at: at, added_by: null });
    for (const k of keys) g.blobs.set(`1|${k.recipientId}`, { key_version: 1, sender_id: me.id, ciphertext: k.ciphertext, nonce: k.nonce, sender_key_version: parseInt(k.senderKeyVersion, 10), recipient_key_version: parseInt(k.recipientKeyVersion, 10) });
    groups.set(id, g);
    announce(g);
    res.status(201).json(groupRow(g));
  });
  app.get("/api/dm/groups/:id", protect, (req, res) => { const g = groupOf(req, res); if (g) res.json(groupRow(g)); });
  app.patch("/api/dm/groups/:id", protect, (req, res) => {
    const g = groupOf(req, res); if (!g) return;
    const raw = req.body?.name;
    if (raw != null && typeof raw !== "string") return fail(res, 400, "INVALID_NAME", "name must be a string");
    const n = (raw ?? "").trim().replace(/\s+/g, " ");
    if (n.length > 60) return fail(res, 400, "INVALID_NAME", "A group name is at most 60 characters");
    const changed = (n || "") !== (g.name || "");
    g.name = n || null;
    const evs = changed ? [addEvent(g, "renamed", me.id, null, n)].filter(Boolean) : [];
    announce(g, evs);
    res.json(groupRow(g));
  });
  app.post("/api/dm/groups/:id/members", protect, (req, res) => {
    const g = groupOf(req, res); if (!g) return;
    const { userIds, keys } = req.body ?? {};
    if (!Array.isArray(userIds)) return fail(res, 400, "INVALID_MEMBERS", "userIds must be a list of user ids");
    const ids = [...new Set(userIds)].filter((x) => typeof x === "string" && !isLiveMember(g, x));
    if (!ids.length) return fail(res, 400, "NO_NEW_MEMBERS", "Everyone listed is already in the group");
    const cur = g.group_key_version;
    const missing = ids.filter((x) => !(keys ?? []).some((k) => k?.recipientId === x && parseInt(k.keyVersion, 10) === cur));
    if (missing.length) return fail(res, 400, "KEYS_INCOMPLETE", `Each new member needs key version ${cur}`, { missing });
    for (let v = 1; v <= cur; v++) {
      const forV = ids.filter((x) => keys.some((k) => k?.recipientId === x && parseInt(k.keyVersion, 10) === v));
      if (!forV.length) continue;
      const raw = checkBlobs(keys, v, forV, "add");
      if (!raw || (g.keys.get(v) && !g.keys.get(v).equals(raw))) return fail(res, 400, "KEYS_UNOPENABLE", "A sealed key didn't open to the group's key (mock check)");
      g.keys.set(v, raw);
    }
    const at = now();
    const evs = [];
    for (const uid of ids) {
      g.members.set(uid, { user_id: uid, role: "member", joined_at: at, left_at: null, last_read_at: null, added_by: me.id });
      for (const k of keys.filter((k) => k?.recipientId === uid)) g.blobs.set(`${k.keyVersion}|${uid}`, { key_version: parseInt(k.keyVersion, 10), sender_id: me.id, ciphertext: k.ciphertext, nonce: k.nonce, sender_key_version: parseInt(k.senderKeyVersion, 10), recipient_key_version: parseInt(k.recipientKeyVersion, 10) });
      const e = addEvent(g, "added", me.id, uid, null, at);
      if (e) evs.push(e);
    }
    announce(g, evs);
    res.json(groupRow(g));
  });
  app.delete("/api/dm/groups/:id/members/:userId", protect, (req, res) => {
    const g = groupOf(req, res); if (!g) return;
    const uid = req.params.userId;
    const leaving = uid === me.id;
    if (!leaving && g.members.get(me.id)?.role !== "admin") return fail(res, 403, "NOT_ADMIN", "Only an admin can remove people");
    if (!isLiveMember(g, uid)) return fail(res, 404, "MEMBER_NOT_FOUND", "That person is not in this group");
    const m = g.members.get(uid);
    m.left_at = now(); m.role = "member";
    for (const k of [...g.blobs.keys()]) if (k.endsWith(`|${uid}`)) g.blobs.delete(k);
    g.key_rotation_needed = true;
    const e = addEvent(g, leaving ? "left" : "removed", me.id, leaving ? null : uid);
    if (!live(g).some((x) => x.role === "admin") && live(g).length) live(g).sort((a, b) => a.joined_at.localeCompare(b.joined_at))[0].role = "admin";
    announce(g, e ? [e] : [], leaving);
    res.json({});
  });
  app.get("/api/dm/groups/:id/keys", protect, (req, res) => {
    const g = groupOf(req, res); if (!g) return;
    res.json([...g.blobs.entries()].filter(([k]) => k.endsWith(`|${me.id}`)).map(([, b]) => b).sort((a, b) => a.key_version - b.key_version));
  });
  app.post("/api/dm/groups/:id/keys", protect, (req, res) => {
    const g = groupOf(req, res); if (!g) return;
    const v = parseInt(req.body?.keyVersion, 10);
    if (v !== g.group_key_version + 1) return fail(res, 409, "KEY_VERSION", "The group key has already been rotated; read the group again", { group_key_version: g.group_key_version });
    const keys = Array.isArray(req.body?.keys) ? req.body.keys : [];
    const members = live(g).map((m) => m.user_id);
    const missing = members.filter((x) => !keys.some((k) => k?.recipientId === x && parseInt(k.keyVersion, 10) === v));
    if (missing.length) return fail(res, 400, "KEYS_INCOMPLETE", "The new key must be sealed to every member, you included", { missing });
    const raw = checkBlobs(keys, v, members, "rotate");
    if (!raw) return fail(res, 400, "KEYS_UNOPENABLE", "A sealed key didn't open for its member (mock check)");
    g.keys.set(v, raw);
    for (const k of keys.filter((k) => parseInt(k.keyVersion, 10) === v && members.includes(k.recipientId))) g.blobs.set(`${v}|${k.recipientId}`, { key_version: v, sender_id: me.id, ciphertext: k.ciphertext, nonce: k.nonce, sender_key_version: parseInt(k.senderKeyVersion, 10), recipient_key_version: parseInt(k.recipientKeyVersion, 10) });
    g.group_key_version = v;
    g.key_rotation_needed = false;
    toMe("dm:group_key", { conversationId: g.id, keyVersion: v });
    res.json({});
  });

  // ── Test hooks ─────────────────────────────────────────────────────────
  app.get("/mock/dm/groups", (_req, res) => {
    ensure();
    res.json({
      groups: [...groups.values()].map((g) => ({ id: g.id, name: g.name, group_key_version: g.group_key_version, key_rotation_needed: g.key_rotation_needed, members: [...g.members.values()], events: g.events, messages: g.messages.length })),
      pins: Object.fromEntries(pins), reactions: Object.fromEntries([...reactions].map(([k, v]) => [k, [...v.keys()]])), hidden: [...hidden], reports, verify: verifyLog,
    });
  });
  app.post("/mock/dm/groups/reset", (_req, res) => { seeded = true; seed(); res.json({ ok: true }); });
}

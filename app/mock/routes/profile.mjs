// mock/routes/profile.mjs — profile · settings · follows · notifications ·
// leaderboard · payments portal · DM settings (agent D's screens).
//
// Shapes follow the backend controllers (snake_case). Routes that another
// module may already own (block/unblock, follow/unfollow, payments/portal)
// are only added when nothing registered them first.
const b64url = (s) => Buffer.from(s).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const jwt = (email) => `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify({ sub: "user-1", email, exp: Math.floor(Date.now() / 1000) + 3600 }))}.mock`;

export function register(app, h) {
  const { isoAgo, isoIn, rand, me, protect } = h;

  // Has another module already registered METHOD path?
  const defined = (method, path) => {
    const stack = app.router?.stack ?? app._router?.stack ?? [];
    return stack.some((l) => l.route && l.route.path === path && l.route.methods?.[method.toLowerCase()]);
  };
  const add = (method, path, ...handlers) => { if (!defined(method, path)) app[method.toLowerCase()](path, ...handlers); };

  // ── People ──────────────────────────────────────────────────────────────
  const NAMES = ["tenz_fan", "s1mple_enjoyer", "faker_goat", "aspas", "zywoo_w", "demon1", "chronicle", "jettmain", "boostio", "yay", "caps", "oner_fan", "derke", "leo", "cNed", "sinatraa", "tarik", "shroud", "nats", "m0nesy"];
  const GAMES = ["VALORANT", "CS2", "League"];
  const people = NAMES.map((username, i) => ({
    id: `user-${i + 2}`,
    username,
    avatar_url: null,
    game: GAMES[i % 3],
    is_premium: rand(i + 7) > 0.65,
    points: Math.floor(rand(i + 1) * 9000) + 200,
  }));
  const person = (id) => (id === "me" || id === me.id ? me : people.find((p) => p.id === id));

  let followed = new Set(people.filter((_, i) => i % 3 === 0).map((p) => p.id));   // whom I follow
  let followers = people.filter((_, i) => i % 2 === 0);                               // who follows me
  const followedTeams = [
    { target_id: "team-sen", name: "Sentinels", game: "VALORANT", logo_url: null },
    { target_id: "team-navi", name: "Natus Vincere", game: "CS2", logo_url: null },
    { target_id: "team-t1", name: "T1", game: "League", logo_url: null },
    { target_id: "team-g2", name: "G2 Esports", game: "CS2", logo_url: null },
  ];
  const followedPlayers = [
    { target_id: "player-tenz", name: "TenZ", game: "VALORANT", image_url: null },
    { target_id: "player-s1mple", name: "s1mple", game: "CS2", image_url: null },
    { target_id: "player-faker", name: "Faker", game: "League", image_url: null },
  ];
  let blocked = [people[5], people[11]];

  const followRow = (p) => ({ id: p.id, username: p.username, avatar_url: p.avatar_url, game: p.game, is_following: followed.has(p.id) });

  // ── Public profile ──────────────────────────────────────────────────────
  app.get("/api/users/:id/profile", protect, (req, res) => {
    const p = person(req.params.id);
    if (!p) return res.status(404).json({ error: "User not found", code: "USER_NOT_FOUND" });
    const isSelf = p === me;
    const seed = parseInt(String(p.id).replace(/\D/g, ""), 10) || 1;
    const total = Math.floor(rand(seed) * 80) + 10;
    const correct = Math.floor(total * (0.45 + rand(seed + 1) * 0.3));
    res.json({
      id: p.id,
      username: isSelf ? req.user.email.split("@")[0] : p.username,
      avatar_url: p.avatar_url,
      is_current_user: isSelf,
      is_premium: isSelf ? me.is_premium : p.is_premium,
      is_following: isSelf ? false : followed.has(p.id),
      favorite_game: isSelf ? me.primary_game : p.game,
      favorite_team: isSelf ? "Sentinels" : null,
      joined_at: isoAgo((90 + seed * 7) * 864e5),
      rank_percentile: Math.max(1, Math.round(rand(seed + 2) * 40)),
      points: isSelf ? me.points_balance : p.points,
      follower_count: isSelf ? followers.length : Math.floor(rand(seed + 3) * 900),
      following_count: isSelf ? followed.size : Math.floor(rand(seed + 4) * 300),
      prediction_stats: { total, correct, streak: Math.floor(rand(seed + 5) * 6) },
      recent_activity: [],
    });
  });

  // ── PATCH /users/me (username / games) ─────────────────────────────────
  app.patch("/api/users/me", protect, (req, res) => {
    const { username, primaryGame, favoriteGames } = req.body ?? {};
    if (username !== undefined) {
      if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return res.status(422).json({ error: "Username must be 3–20 characters: letters, numbers, underscores." });
      if (username.toLowerCase() === "taken") return res.status(409).json({ error: "That username is already taken." });
      me.username = username;
    }
    if (primaryGame) me.primary_game = primaryGame;
    if (Array.isArray(favoriteGames)) me.favorite_games = favoriteGames;
    res.json({ ...me, email: req.user.email, username: me.username });
  });

  app.post("/api/users/me/avatar", protect, (req, res) => {
    const { avatarUrl } = req.body ?? {};
    if (!avatarUrl) return res.status(400).json({ error: "avatarUrl is required" });
    me.avatar_url = avatarUrl;
    me.avatar_pending = false;
    res.json({ avatar_url: avatarUrl, avatar_pending: false });
  });

  // ── Email / password ────────────────────────────────────────────────────
  let pendingEmail = null;
  app.post("/api/users/me/email/change-start", protect, (req, res) => {
    const { newEmail, password } = req.body ?? {};
    if (password !== "insight") return res.status(401).json({ error: "Incorrect password." });
    if (!newEmail || !newEmail.includes("@")) return res.status(422).json({ error: "Enter a valid email address." });
    if (newEmail === "taken@insightesportsapp.com") return res.status(409).json({ error: "That email is already in use." });
    pendingEmail = newEmail;
    res.json({ confirmationsRequired: ["current", "new"] });
  });
  app.post("/api/users/me/email/change-verify", protect, (req, res) => {
    const { target, code } = req.body ?? {};
    if (code !== "123456") return res.status(400).json({ error: "Invalid or expired code" });
    if (target === "new" && pendingEmail) { me.email = pendingEmail; pendingEmail = null; }
    res.json({});
  });
  const changePassword = (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (currentPassword !== "insight") return res.status(401).json({ error: "Current password is incorrect." });
    if (!newPassword || newPassword.length < 8) return res.status(422).json({ error: "Password must be at least 8 characters." });
    res.json({});
  };
  app.patch("/api/users/me/password", protect, changePassword);
  app.put("/api/users/me/password", protect, changePassword);

  // ── Blocked users ───────────────────────────────────────────────────────
  app.get("/api/users/me/blocked", protect, (_req, res) => res.json(blocked.map((p) => ({ id: p.id, username: p.username, avatar_url: p.avatar_url }))));
  app.delete("/api/users/me", protect, (_req, res) => res.json({ message: "Account deleted" }));

  // ── Prediction stats · points ledger ───────────────────────────────────
  app.get("/api/users/me/prediction-stats", protect, (_req, res) => res.json({ total: 64, correct: 41, streak: 4, accuracy: 64.1 }));
  app.get("/api/users/me/transactions", protect, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit ?? "50", 10) || 50, 100);
    const offset = parseInt(req.query.offset ?? "0", 10) || 0;
    const polls = ["Sentinels vs NRG — map 1 winner", "NAVI vs Vitality — first blood", "T1 vs Gen.G — first dragon", "G2 vs FaZe — over 24.5 rounds", "100T vs LOUD — total kills over 130"];
    const rows = Array.from({ length: 60 }).map((_, i) => {
      const win = rand(i + 11) > 0.4;
      return {
        id: `tx-${i + 1}`,
        points_change: win ? Math.floor(rand(i + 21) * 250) + 40 : -(Math.floor(rand(i + 31) * 60) + 10),
        reason: win ? "Poll win" : "Poll loss",
        poll_id: `poll-${i + 1}`,
        created_at: isoAgo(i * 7 * 36e5 + 36e5),
        poll_question: polls[i % polls.length],
        game: GAMES[i % 3],
      };
    });
    res.json(rows.slice(offset, offset + limit));
  });

  // ── Followers / following ──────────────────────────────────────────────
  app.get("/api/users/:id/followers", protect, (req, res) => {
    const limit = parseInt(req.query.limit ?? "20", 10) || 20;
    const offset = parseInt(req.query.offset ?? "0", 10) || 0;
    const list = req.params.id === "me" || req.params.id === me.id ? followers : people.filter((_, i) => i % 3 === 1);
    res.json(list.slice(offset, offset + limit).map(followRow));
  });
  app.get("/api/users/:id/following", protect, (req, res) => {
    const limit = parseInt(req.query.limit ?? "20", 10) || 20;
    const offset = parseInt(req.query.offset ?? "0", 10) || 0;
    const type = req.query.type ?? "user";
    if (type === "team") return res.json(followedTeams.slice(offset, offset + limit));
    if (type === "player") return res.json(followedPlayers.slice(offset, offset + limit));
    const list = req.params.id === "me" || req.params.id === me.id ? people.filter((p) => followed.has(p.id)) : people.filter((_, i) => i % 4 === 2);
    res.json(list.slice(offset, offset + limit).map(followRow));
  });
  app.post("/api/users/me/followers/:id/remove", protect, (req, res) => { followers = followers.filter((p) => p.id !== req.params.id); res.json({}); });
  app.post("/api/users/:userId/report", protect, (_req, res) => res.json({ reported: true }));

  // Only if agent B's players-teams module didn't define these.
  add("POST", "/api/users/:id/block", protect, (req, res) => {
    const p = person(req.params.id);
    if (p && p !== me && !blocked.some((b) => b.id === p.id)) blocked.push(p);
    followed.delete(req.params.id);
    followers = followers.filter((f) => f.id !== req.params.id);
    res.json({});
  });
  add("DELETE", "/api/users/:id/block", protect, (req, res) => { blocked = blocked.filter((b) => b.id !== req.params.id); res.json({}); });
  add("POST", "/api/users/:id/unblock", protect, (req, res) => { blocked = blocked.filter((b) => b.id !== req.params.id); res.json({}); });
  add("POST", "/api/follow", protect, (req, res) => { const { targetType, targetId } = req.body ?? {}; if (targetType === "user" && targetId) followed.add(targetId); res.json({}); });
  add("POST", "/api/unfollow", protect, (req, res) => { const { targetType, targetId } = req.body ?? {}; if (targetType === "user" && targetId) followed.delete(targetId); res.json({}); });

  // ── Notification preferences ───────────────────────────────────────────
  const prefs = {
    enabled: true, scope: "followed",
    types: { prediction_resolved: true, poll_resolved: true, weekly_report: true, mid_match: false, prediction_window: false, streak_milestone: true, followed_live: true, followed_result: true, followed_starting_soon: true, followed_news: true, leaderboard_rank: true, leaderboard_reset: true, new_follower: false, direct_message: true },
    quiet_hours_enabled: true, quiet_start: "22:00:00", quiet_end: "08:00:00", timezone: "America/Los_Angeles", morning_digest: true,
  };
  app.get("/api/users/me/notification-preferences", protect, (_req, res) => res.json(prefs));
  const patchPrefs = (req, res) => {
    const b = req.body ?? {};
    if (typeof b.enabled === "boolean") prefs.enabled = b.enabled;
    if (b.scope) prefs.scope = b.scope;
    if (b.types && typeof b.types === "object") Object.assign(prefs.types, b.types);
    const qh = b.quiet_hours_enabled ?? b.quietHoursEnabled; if (typeof qh === "boolean") prefs.quiet_hours_enabled = qh;
    const qs = b.quiet_start ?? b.quietStart; if (qs) prefs.quiet_start = qs.length === 5 ? `${qs}:00` : qs;
    const qe = b.quiet_end ?? b.quietEnd; if (qe) prefs.quiet_end = qe.length === 5 ? `${qe}:00` : qe;
    if (b.timezone) prefs.timezone = b.timezone;
    const md = b.morning_digest ?? b.morningDigest; if (typeof md === "boolean") prefs.morning_digest = md;
    res.json(prefs);
  };
  app.patch("/api/users/me/notification-preferences", protect, patchPrefs);
  app.put("/api/users/me/notification-preferences", protect, patchPrefs);

  // ── Notifications inbox ────────────────────────────────────────────────
  const notifications = [
    { id: "n-1", type: "prediction_resolved", title: "Prediction correct", body: "TenZ went over 22.5 kills vs NRG. +180 pts", ref_type: "match", ref_id: "match-1", is_read: false, created_at: isoAgo(25 * 6e4) },
    { id: "n-2", type: "followed_result", title: "Sentinels won", body: "Sentinels beat NRG 2–1 at VCT Americas.", ref_type: "match", ref_id: "match-1", is_read: false, created_at: isoAgo(2 * 36e5) },
    { id: "n-3", type: "new_follower", title: "New follower", body: "aspas started following you.", ref_type: "user", ref_id: "user-5", is_read: false, created_at: isoAgo(5 * 36e5) },
    { id: "n-4", type: "leaderboard_rank", title: "You moved up", body: "You're now #12 on the monthly leaderboard (+3).", ref_type: null, ref_id: null, is_read: false, created_at: isoAgo(26 * 36e5) },
    { id: "n-5", type: "poll_resolved", title: "Poll settled", body: "NAVI vs Vitality — first blood: you picked NAVI. +95 pts", ref_type: "match", ref_id: "match-2", is_read: true, created_at: isoAgo(28 * 36e5) },
    { id: "n-6", type: "streak_milestone", title: "4 in a row", body: "You're on a 4-prediction win streak. Keep it going.", ref_type: null, ref_id: null, is_read: true, created_at: isoAgo(3 * 864e5) },
    { id: "n-7", type: "weekly_report", title: "Your weekly report is ready", body: "VALORANT, CS2 and LoL — what mattered this week.", ref_type: "report", ref_id: "report-1", is_read: true, created_at: isoAgo(4 * 864e5) },
    { id: "n-8", type: "followed_player_highlight", title: "s1mple popped off", body: "41 kills · 1.62 rating vs FaZe on Mirage.", ref_type: "player", ref_id: "player-s1mple", is_read: true, created_at: isoAgo(5 * 864e5) },
    { id: "n-9", type: "featured_news", title: "Roster move", body: "Sentinels sign a new IGL ahead of Champions.", ref_type: "article", ref_id: "article-1", is_read: true, created_at: isoAgo(9 * 864e5) },
    { id: "n-10", type: "leaderboard_reset", title: "Monthly reset in 3 days", body: "Lock in your rank — the September board closes soon.", ref_type: null, ref_id: null, is_read: true, created_at: isoAgo(12 * 864e5) },
    { id: "n-11", type: "direct_message", title: "New message", body: "tarik: gg last night", ref_type: "conversation", ref_id: "conv-1", is_read: false, created_at: isoAgo(40 * 6e4) },
    { id: "n-12", type: "final_score", title: "T1 2–0 Gen.G", body: "LCK Finals — T1 take the title.", ref_type: "match", ref_id: "match-3", is_read: false, created_at: isoAgo(15 * 864e5) },
  ];
  const unreadBell = () => notifications.filter((n) => !n.is_read && n.type !== "direct_message").length;
  app.get("/api/notifications/unread-count", protect, (_req, res) => res.json({ unread_count: unreadBell(), count: unreadBell() }));
  app.get("/api/notifications", protect, (req, res) => {
    const limit = parseInt(req.query.limit ?? "40", 10) || 40;
    const offset = parseInt(req.query.offset ?? "0", 10) || 0;
    const list = req.query.unread_only === "true" ? notifications.filter((n) => !n.is_read) : notifications;
    res.json(list.slice(offset, offset + limit));
  });
  app.post("/api/notifications/read", protect, (req, res) => {
    const ids = new Set(req.body?.ids ?? []);
    notifications.forEach((n) => { if (ids.has(n.id)) n.is_read = true; });
    res.json({});
  });
  // The app posts read-all on open to clear the badge (the rows it already
  // holds keep rendering their unread state until the next load).
  app.post("/api/notifications/read-all", protect, (_req, res) => { notifications.forEach((n) => { n.is_read = true; }); res.json({}); });

  // ── DMs (placeholder screen only) ──────────────────────────────────────
  let dmPrivacy = "everyone";
  add("GET", "/api/dm/unread-count", protect, (_req, res) => res.json({ unread_count: 2, count: 2 }));
  app.get("/api/dm/settings", protect, (_req, res) => res.json({ dm_privacy: dmPrivacy }));
  app.put("/api/dm/settings", protect, (req, res) => { const v = req.body?.dm_privacy ?? req.body?.who_can_message; if (v === "everyone" || v === "following") dmPrivacy = v; res.json({ dm_privacy: dmPrivacy }); });
  add("GET", "/api/dm/conversations", protect, (_req, res) => res.json([
    { id: "conv-1", other_id: "user-18", other_username: "tarik", other_avatar_url: null, unread: 2, last_at: isoAgo(40 * 6e4) },
    { id: "conv-2", other_id: "user-9", other_username: "boostio", other_avatar_url: null, unread: 0, last_at: isoAgo(3 * 864e5) },
  ]));

  // ── Leaderboard ────────────────────────────────────────────────────────
  const board = (period) => {
    const seed = period === "alltime" ? 100 : 200;
    const rows = people.map((p, i) => ({
      rank: 0, user_id: p.id, username: p.username, avatar_url: p.avatar_url,
      points: Math.floor(rand(seed + i) * (period === "alltime" ? 20000 : 4000)) + 100, is_premium: p.is_premium,
    }));
    if (period === "alltime") rows.push({ rank: 0, user_id: me.id, username: me.username, avatar_url: me.avatar_url, points: me.points_balance, is_premium: me.is_premium });
    rows.sort((a, b) => b.points - a.points);
    return rows.map((r, i) => ({ ...r, rank: i + 1 }));
  };
  app.get("/api/leaderboard/period", protect, (req, res) => {
    const period = req.query.period ?? "monthly";
    const limit = parseInt(req.query.limit ?? "100", 10) || 100;
    const offset = parseInt(req.query.offset ?? "0", 10) || 0;
    res.json(board(period).slice(offset, offset + limit));
  });
  app.get("/api/leaderboard/me", protect, (req, res) => {
    const period = req.query.period ?? "monthly";
    const rows = board(period);
    const mine = rows.find((r) => r.user_id === me.id);
    const rank = mine ? mine.rank : rows.length + 7;
    const total = rows.length + 40;
    res.json({ period, rank, points: mine ? mine.points : 1240, total_users: total, percentile: Math.max(1, Math.round((rank / total) * 100)) });
  });

  // ── Payments (portal only — predictions.mjs may own the rest) ──────────
  add("POST", "/api/payments/portal", protect, (_req, res) => res.json({ url: "https://billing.stripe.com/p/session/test_mock", portalUrl: "https://billing.stripe.com/p/session/test_mock" }));
  add("GET", "/api/payments/status", protect, (_req, res) => res.json({ isPremium: me.is_premium, status: "active", currentPeriodEnd: isoIn(18 * 864e5), provider: "stripe", autoRenew: true, cancelledAt: null, graceUntil: null, hasStripeAccount: true }));

  // ── Auth: OTP verify / resend (public) ─────────────────────────────────
  app.post("/api/auth/verify-otp", (req, res) => {
    const { email = "", token = "" } = req.body ?? {};
    if (token !== "123456") return res.status(400).json({ error: "Invalid or expired code" });
    const user = { ...me, email, username: email.split("@")[0] };
    res.json({ message: "Email verified", token: jwt(email), refreshToken: "refresh-" + Date.now(), user });
  });
  app.post("/api/auth/resend", (_req, res) => res.json({ message: "Verification code sent" }));
}

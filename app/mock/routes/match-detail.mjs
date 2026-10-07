// mock/routes/match-detail.mjs — the match screen's backend:
//   GET  /api/matches/:id            (raw match row + detail fields)
//   GET  /api/matches/:id/stats      (player_stats rows, numerics as strings like node-postgres)
//   GET  /api/matches/:id/progress   (score / rounds / clock / gold_timeline)
//   GET/POST /api/matches/:id/comments
//   GET/POST /api/chat/:room/messages
//   GET  /api/polls/match/:id   ·   POST /api/polls/:id/vote
//   POST /api/predictions/live       (win probability)
// plus registerSockets(): round_update / game_time_update / odds_update /
// gold_update / match_update / new_message / poll_update to match:<id> rooms.
//
// Match rows come from ./_matches-data.mjs (agent A1) when it exists; a
// small fixture with the same id patterns ("m-live-1", "m-up-3",
// "m-done-12") stands in otherwise. Live matches carry an in-memory sim
// that advances in real time so the screen moves.

const TEAMS = {
  VALORANT: [["Sentinels", "SEN", "FF4654", "t-sen"], ["Fnatic", "FNC", "FF5900", "t-fnc"], ["Paper Rex", "PRX", "6D28D9", "t-prx"], ["LOUD", "LLL", "17FF8A", "t-loud"]],
  CS2: [["Vitality", "VIT", "F2C94C", "t-vit"], ["NAVI", "NAVI", "F5D000", "t-navi"], ["FaZe Clan", "FAZE", "E43D30", "t-faze"], ["G2 Esports", "G2", "FFFFFF", "t-g2"]],
  League: [["T1", "T1", "E2012D", "t-t1"], ["Gen.G", "GEN", "AA8B56", "t-geng"], ["Bilibili Gaming", "BLG", "1E80FF", "t-blg"], ["G2 Esports", "G2", "FFFFFF", "t-g2l"]],
};
const PLAYERS = {
  VALORANT: [["TenZ", "Duelist", "Jett"], ["zekken", "Duelist", "Raze"], ["Sacy", "Initiator", "Sova"], ["johnqt", "Sentinel", "Cypher"], ["Zellsis", "Controller", "Omen"], ["Boaster", "Controller", "Omen"], ["Derke", "Duelist", "Jett"], ["Alfajer", "Sentinel", "Killjoy"], ["Leo", "Initiator", "Sova"], ["Chronicle", "Initiator", "Fade"]],
  CS2: [["ZywOo", "AWPer", ""], ["apEX", "IGL", ""], ["flameZ", "Rifler", ""], ["mezii", "Support", ""], ["ropz", "Lurker", ""], ["s1mple", "AWPer", ""], ["b1t", "Rifler", ""], ["jL", "Rifler", ""], ["Aleksib", "IGL", ""], ["iM", "Rifler", ""]],
  League: [["Zeus", "Top", "Aatrox"], ["Oner", "Jungle", "Vi"], ["Faker", "Mid", "Azir"], ["Gumayusi", "ADC", "Kai'Sa"], ["Keria", "Support", "Renata"], ["Kiin", "Top", "K'Sante"], ["Canyon", "Jungle", "Sejuani"], ["Chovy", "Mid", "Orianna"], ["Peyz", "ADC", "Zeri"], ["Lehends", "Support", "Nautilus"]],
};
const MAPS = { VALORANT: ["Ascent", "Bind", "Lotus"], CS2: ["Mirage", "Inferno", "Nuke"], League: [null] };

function fixtureMatches(h) {
  const games = ["VALORANT", "CS2", "League"];
  const rows = [];
  const row = (id, game, i, status, offsetMs, extra = {}) => {
    const [a, b] = [TEAMS[game][i % 4], TEAMS[game][(i + 1) % 4]];
    return {
      id, game, status,
      team1_name: a[0], team2_name: b[0], team1_id: a[3], team2_id: b[3],
      team1_color: a[2], team2_color: b[2], team1_logo_url: null, team2_logo_url: null,
      tournament_name: game === "League" ? "Worlds 2026" : game === "CS2" ? "IEM Cologne" : "VCT Champions",
      stage: i % 2 ? "Grand Final" : "Group Stage",
      scheduled_at: status === "upcoming" ? h.isoIn(offsetMs) : h.isoAgo(offsetMs),
      completed_at: status === "completed" ? h.isoAgo(offsetMs - 3600e3) : null,
      map_name: MAPS[game][i % 3], best_of: 3, viewer_count: 12_000 + Math.floor(h.rand(i + 7) * 90_000),
      team1_score: 0, team2_score: 0, ...extra,
    };
  };
  games.forEach((g, i) => rows.push(row(`m-live-${i + 1}`, g, i, "live", 25 * 60e3)));
  games.forEach((g, i) => rows.push(row(`m-up-${i + 1}`, g, i + 1, "upcoming", (i + 1) * 3 * 3600e3, { team1_win_probability: 0.58 - i * 0.05, team2_win_probability: 0.42 + i * 0.05 })));
  for (let i = 0; i < 12; i++) {
    const g = games[i % 3];
    const t1 = g === "League" ? (i % 2 ? 2 : 1) : 13, t2 = g === "League" ? (i % 2 ? 0 : 2) : 7 + (i % 6);
    rows.push(row(`m-done-${i + 1}`, g, i, "completed", (i + 1) * 9 * 3600e3, { team1_score: t1, team2_score: t2, team1_map_score: 2, team2_map_score: i % 3 === 0 ? 1 : 0 }));
  }
  return rows;
}

let matchesCache = null;
async function matches(h) {
  if (matchesCache) return matchesCache;
  try {
    const mod = await import("./_matches-data.mjs");
    const rows = typeof mod.allMatches === "function" ? await mod.allMatches(h) : null;
    if (Array.isArray(rows) && rows.length) { matchesCache = rows; return rows; }
  } catch { /* A1's fixture not present — use ours */ }
  matchesCache = fixtureMatches(h);
  return matchesCache;
}

// ── Live simulation (per match id) ─────────────────────────────────────────
const sims = new Map();
function sim(m, h) {
  if (sims.has(m.id)) return sims.get(m.id);
  const isLeague = m.game === "League";
  const seed = [...m.id].reduce((s, c) => s + c.charCodeAt(0), 0);
  const roster = PLAYERS[m.game] ?? PLAYERS.VALORANT;
  const players = roster.map(([name, role, champ], i) => ({
    player_id: `p-${m.game.toLowerCase()}-${i + 1}`, player_name: name, image_url: null,
    team_id: i < 5 ? m.team1_id : m.team2_id, position: role, character_name: champ,
    kills: Math.floor(h.rand(seed + i) * 8), deaths: Math.floor(h.rand(seed + i + 50) * 7), assists: Math.floor(h.rand(seed + i + 100) * 6),
    headshots: 0, acs: 0, adr: 0, first_bloods: Math.floor(h.rand(seed + i + 150) * 3), clutch_wins: Math.floor(h.rand(seed + i + 200) * 2),
    kills_t_side: 0, kills_ct_side: 0, kast: 60 + h.rand(seed + i + 250) * 30, rating: 0.7 + h.rand(seed + i + 300) * 0.8,
    cs_per_min: 7 + h.rand(seed + i + 350) * 3, gold_earned: 4000 + Math.floor(h.rand(seed + i + 400) * 3000), vision_score: Math.floor(h.rand(seed + i + 450) * 40),
    damage_dealt: 5000 + Math.floor(h.rand(seed + i + 500) * 9000), is_alive: true,
  }));
  const s = {
    id: m.id, game: m.game, isLeague, startedAt: Date.now() - 14 * 60e3,
    t1: Number(m.team1_score) || 0, t2: Number(m.team2_score) || 0, maps1: 1, maps2: 0,
    history: [], side1: m.game === "CS2" ? "CT" : "defense", side2: m.game === "CS2" ? "T" : "attack",
    alive1: 5, alive2: 5, lastRoundAt: Date.now(), roundLen: 24e3 + h.rand(seed) * 16e3,
    players, odds: 52 + Math.floor(h.rand(seed + 1) * 20), decided: false, completed: false,
    gold: [], dragons: [1, 0], barons: [0, 0], towers: [2, 1], inh: [3, 3],
    chat: [], comments: [], votes: {},
  };
  // Seed round history / gold curve so joining mid-game shows real shape.
  if (!isLeague) {
    const played = s.t1 + s.t2;
    let a = 0, b = 0;
    for (let i = 0; i < played; i++) { const w = h.rand(seed + 900 + i) < 0.55 ? 1 : 2; if (w === 1 && a < s.t1) { a++; s.history.push(1); } else if (b < s.t2) { b++; s.history.push(2); } else { a++; s.history.push(1); } }
    if (played === 0) { s.t1 = 5; s.t2 = 4; for (let i = 0; i < 9; i++) s.history.push(i % 2 ? 2 : 1); }
  } else {
    let diff = 0;
    for (let min = 0; min <= 14; min += 1 / 6) { diff += Math.round((h.rand(seed + min * 37) - 0.47) * 260); s.gold.push({ minute: +min.toFixed(3), diff }); }
  }
  const names = ["fragzilla", "ivan", "karlo", "mapcontrol", "ctside", "vctfan99", "baronsteal", "jettmain"];
  const lines = ["LETS GO", "that clutch was insane", "eco round incoming", "who's taking this?", "ref ace pls", "they need this round", "gold lead growing", "dragon soul next", "classic", "nice pick", "this map is a coinflip", "pistol round decides it"];
  for (let i = 0; i < 6; i++) s.chat.push({ id: `${s.startedAt + i * 1000}-u${i}`, userId: `u${i}`, username: names[(seed + i) % names.length], text: lines[(seed + i * 3) % lines.length], is_premium: i % 3 === 0, timestamp: new Date(s.startedAt + i * 60e3).toISOString() });
  s.comments = [
    { id: `c-${m.id}-1`, body: "Calling it now, this goes to map 3.", created_at: h.isoAgo(22 * 60e3), author: { id: "u9", username: "karlo", avatar_url: null }, can_delete: false },
    { id: `c-${m.id}-2`, body: "The side swap is going to decide this one.", created_at: h.isoAgo(9 * 60e3), author: { id: "user-1", username: "ivan", avatar_url: null }, can_delete: true },
  ];
  sims.set(m.id, s);
  return s;
}

function gameSeconds(s) { return Math.floor((Date.now() - s.startedAt) / 1000); }

// Advance the sim; returns the list of events it produced (for sockets).
function tick(s, h) {
  const events = [];
  if (s.completed) return events;
  const now = Date.now();
  if (s.isLeague) {
    const minute = gameSeconds(s) / 60;
    const last = s.gold[s.gold.length - 1];
    if (!last || minute - last.minute >= 1 / 6) {
      const diff = last.diff + Math.round((h.rand(now / 1000) - 0.46) * 320);
      s.gold.push({ minute: +minute.toFixed(3), diff });
      events.push(["gold_update", { matchId: s.id }]);
      s.odds = Math.max(5, Math.min(95, 50 + Math.round(diff / 120)));
      events.push(["odds_update", { matchId: s.id, team1WinProbability: s.odds, team2WinProbability: 100 - s.odds, decided: false, model: "live-v2" }]);
      const g1 = 30000 + Math.round(minute * 1200), g2 = g1 - diff;
      events.push(["match_update", { matchId: s.id, team1Maps: s.maps1, team2Maps: s.maps2, team1Gold: g1, team2Gold: g2, team1InhibitorsUp: s.inh[0], team2InhibitorsUp: s.inh[1] }]);
      for (const p of s.players) { p.gold_earned += 180 + Math.floor(h.rand(now + p.player_id.length) * 120); p.damage_dealt += Math.floor(h.rand(now / 7) * 400); if (h.rand(now + 3) < 0.12) { p.kills += 1; } }
      if (h.rand(now / 3) < 0.08) { const side = h.rand(now / 5) < 0.5 ? 0 : 1; s.dragons[side]++; }
      if (h.rand(now / 11) < 0.05) { const side = h.rand(now / 13) < 0.5 ? 0 : 1; s.towers[side]++; }
      if (gameSeconds(s) >= 40 * 60) { s.completed = true; s.t1 = 1; s.t2 = 0; s.decided = true; events.push(["odds_update", { matchId: s.id, team1WinProbability: 100, team2WinProbability: 0, decided: true }], ["match_completed", { matchId: s.id }]); }
    }
    events.push(["game_time_update", { matchId: s.id, gameTimeSeconds: gameSeconds(s) }]);
    return events;
  }
  // Round-based: a death every few seconds, a round every roundLen.
  if (now - s.lastRoundAt > s.roundLen) {
    const winner = h.rand(now) < s.odds / 100 ? 1 : 2;
    if (winner === 1) s.t1++; else s.t2++;
    s.history.push(winner);
    s.alive1 = 5; s.alive2 = 5;
    s.lastRoundAt = now;
    for (const p of s.players) p.is_alive = true;
    if (s.t1 + s.t2 === 12) { [s.side1, s.side2] = [s.side2, s.side1]; }
    s.odds = Math.max(5, Math.min(95, 50 + (s.t1 - s.t2) * 6));
    if (s.t1 >= 13 || s.t2 >= 13) { s.completed = true; s.decided = true; s.odds = s.t1 > s.t2 ? 100 : 0; }
    events.push(["round_update", { matchId: s.id, team1Rounds: s.t1, team2Rounds: s.t2, currentRound: s.t1 + s.t2 + 1, team1Maps: s.maps1, team2Maps: s.maps2, roundHistory: s.history, team1Alive: 5, team2Alive: 5 }]);
    events.push(["odds_update", { matchId: s.id, team1WinProbability: s.odds, team2WinProbability: 100 - s.odds, decided: s.decided, model: "live-v2" }]);
    if (s.completed) events.push(["match_completed", { matchId: s.id }]);
  } else if (h.rand(now / 1000) < 0.45) {
    const side = h.rand(now / 999) < 0.5 ? 1 : 2;
    const alive = s.players.filter((p, i) => (i < 5) === (side === 1) && p.is_alive);
    if (alive.length > 1) {
      const victim = alive[Math.floor(h.rand(now / 7) * alive.length)];
      victim.is_alive = false; victim.deaths++;
      const killers = s.players.filter((p, i) => (i < 5) !== (side === 1) && p.is_alive);
      const k = killers[Math.floor(h.rand(now / 13) * killers.length)];
      if (k) { k.kills++; if (h.rand(now / 17) < 0.4) k.headshots++; k.acs = 180 + k.kills * 12; k.adr = 120 + k.kills * 6; if (h.rand(now / 19) < 0.5) { const a = killers.find((x) => x !== k); if (a) a.assists++; } }
      if (side === 1) s.alive1--; else s.alive2--;
      events.push(["round_update", { matchId: s.id, team1Rounds: s.t1, team2Rounds: s.t2, currentRound: s.t1 + s.t2 + 1, team1Maps: s.maps1, team2Maps: s.maps2, roundHistory: s.history, team1Alive: s.alive1, team2Alive: s.alive2 }]);
    }
  }
  return events;
}

const asPg = (v) => (typeof v === "number" ? String(Math.round(v * 100) / 100) : v); // node-postgres NUMERIC → string

function statsRows(s) {
  return s.players.map((p) => ({ ...p, kills: asPg(p.kills), deaths: asPg(p.deaths), assists: asPg(p.assists), acs: asPg(p.acs), adr: asPg(p.adr), kast: asPg(p.kast), rating: asPg(p.rating), cs_per_min: asPg(p.cs_per_min), plus_minus: p.kills - p.deaths }));
}

function detailRow(m, s) {
  const d = { ...m, team1_map_score: s?.maps1 ?? m.team1_map_score ?? 0, team2_map_score: s?.maps2 ?? m.team2_map_score ?? 0 };
  if (s) {
    d.team1_score = s.t1; d.team2_score = s.t2;
    if (s.completed) d.status = "completed";
    d.game_time_seconds = gameSeconds(s);
    if (s.isLeague) {
      Object.assign(d, { team1_dragon_kills: s.dragons[0], team2_dragon_kills: s.dragons[1], team1_baron_kills: s.barons[0], team2_baron_kills: s.barons[1], team1_tower_kills: s.towers[0], team2_tower_kills: s.towers[1], team1_inhibitors_up: s.inh[0], team2_inhibitors_up: s.inh[1], gold_timeline: s.gold });
      const last = s.gold[s.gold.length - 1]; d.team1_gold = 30000 + last.diff; d.team2_gold = 30000;
    } else d.round_history = s.history;
  } else if (m.status === "completed") {
    const t1 = Number(m.team1_score) || 0, t2 = Number(m.team2_score) || 0;
    if (m.game === "League") {
      Object.assign(d, { game_time_seconds: 1920, team1_dragon_kills: 3, team2_dragon_kills: 1, team1_baron_kills: 1, team2_baron_kills: 0, team1_tower_kills: 9, team2_tower_kills: 4, team1_inhibitors_up: 3, team2_inhibitors_up: 1 });
      let diff = 0; d.gold_timeline = []; for (let min = 0; min <= 32; min += 0.5) { diff += Math.round((Math.sin(min / 3) + 0.3) * 200); d.gold_timeline.push({ minute: min, diff }); }
    } else {
      d.game_time_seconds = 2710;
      d.round_history = []; let a = 0, b = 0; for (let i = 0; i < t1 + t2; i++) { const w = (i * 7) % 3 === 0 && b < t2 ? 2 : a < t1 ? 1 : 2; if (w === 1) a++; else b++; d.round_history.push(w); }
    }
  }
  return d;
}

function completedStats(m, h) {
  const roster = PLAYERS[m.game] ?? PLAYERS.VALORANT;
  const seed = [...m.id].reduce((s, c) => s + c.charCodeAt(0), 0);
  return roster.map(([name, role, champ], i) => {
    const kills = 8 + Math.floor(h.rand(seed + i) * 18), deaths = 8 + Math.floor(h.rand(seed + i + 9) * 12), assists = Math.floor(h.rand(seed + i + 19) * 12);
    return { player_id: `p-${m.game.toLowerCase()}-${i + 1}`, player_name: name, image_url: null, team_id: i < 5 ? m.team1_id : m.team2_id, position: role, character_name: champ,
      kills: String(kills), deaths: String(deaths), assists: String(assists), headshots: String(Math.floor(kills * 0.4)), acs: String(150 + kills * 9), adr: String(110 + kills * 5),
      first_bloods: String(Math.floor(h.rand(seed + i + 29) * 4)), clutch_wins: String(Math.floor(h.rand(seed + i + 39) * 3)), kast: String(60 + h.rand(seed + i + 49) * 30), rating: String((0.7 + h.rand(seed + i + 59) * 0.8).toFixed(2)),
      cs_per_min: String((7 + h.rand(seed + i + 69) * 3).toFixed(1)), gold_earned: String(10000 + Math.floor(h.rand(seed + i + 79) * 8000)), vision_score: String(Math.floor(h.rand(seed + i + 89) * 60)), damage_dealt: String(12000 + Math.floor(h.rand(seed + i + 99) * 20000)), plus_minus: String(kills - deaths) };
  });
}

function progress(m, s) {
  const r = { matchId: m.id, game: m.game, status: s.completed ? "completed" : "live", score: { team1Maps: s.maps1, team2Maps: s.maps2, team1Rounds: s.t1, team2Rounds: s.t2 }, playersAlive: { team1: s.alive1, team2: s.alive2 }, team1_id: m.team1_id, team2_id: m.team2_id };
  if (!s.isLeague) { r.currentRound = s.t1 + s.t2 + 1; r.round_history = s.history; r.sides = { team1: s.side1, team2: s.side2 }; r.team1_side = s.side1; r.team2_side = s.side2; }
  else { r.gameTimeSeconds = gameSeconds(s); r.gold_timeline = s.gold; const last = s.gold[s.gold.length - 1]; r.team1_gold = 30000 + last.diff; r.team2_gold = 30000; r.team1_inhibitors_up = s.inh[0]; r.team2_inhibitors_up = s.inh[1]; }
  return r;
}

function pollFor(m, s) {
  const id = `poll-${m.id}`;
  const o1 = `${id}-o1`, o2 = `${id}-o2`;
  const base = { [o1]: 61 + (s?.t1 ?? 0), [o2]: 44 + (s?.t2 ?? 0) };
  const counts = { ...base };
  for (const v of Object.values(s?.votes ?? {})) counts[v.optionId] = (counts[v.optionId] ?? 0) + 1;
  const total = counts[o1] + counts[o2];
  return {
    id, match_id: m.id, question: `Who wins ${m.team1_name} vs ${m.team2_name}?`, status: s?.completed ? "closed" : m.status === "completed" ? "closed" : "active", category: "match_winner",
    options: [{ id: o1, option_text: m.team1_name }, { id: o2, option_text: m.team2_name }],
    voteCounts: [{ optionId: o1, count: counts[o1], percentage: Math.round((counts[o1] / total) * 100) }, { optionId: o2, count: counts[o2], percentage: Math.round((counts[o2] / total) * 100) }],
    totalVotes: total,
  };
}

const idIsReserved = (id) => ["live", "upcoming", "completed", "filters", "popular", "search", "top"].includes(id);

export function register(app, h) {
  const find = async (id) => (await matches(h)).find((m) => String(m.id) === id) ?? null;
  const liveSim = (m) => (m && m.status === "live" ? sim(m, h) : null);

  app.get("/api/matches/:id", async (req, res, next) => {
    if (idIsReserved(req.params.id)) return next();
    const m = await find(req.params.id);
    if (!m) return res.status(404).json({ error: "Match not found" });
    res.json(detailRow(m, liveSim(m)));
  });

  app.get("/api/matches/:id/stats", async (req, res) => {
    const m = await find(req.params.id);
    if (!m) return res.status(404).json({ error: "Match not found" });
    if (m.status === "upcoming") return res.json([]);
    const s = liveSim(m);
    res.json(s ? statsRows(s) : completedStats(m, h));
  });

  app.get("/api/matches/:id/progress", async (req, res) => {
    const m = await find(req.params.id);
    if (!m) return res.status(404).json({ error: "Match not found" });
    const s = liveSim(m);
    if (!s) return res.json({ matchId: m.id, game: m.game, status: m.status, score: { team1Maps: m.team1_map_score ?? 0, team2Maps: m.team2_map_score ?? 0, team1Rounds: Number(m.team1_score) || 0, team2Rounds: Number(m.team2_score) || 0 } });
    res.json(progress(m, s));
  });

  app.get("/api/matches/:id/comments", h.protect, async (req, res) => {
    const m = await find(req.params.id);
    if (!m) return res.status(404).json({ error: "Match not found" });
    const s = sim(m, h);
    res.json({ comments: s.comments.map((c) => ({ ...c, can_delete: c.author.id === req.user.sub })) });
  });
  app.post("/api/matches/:id/comments", h.protect, async (req, res) => {
    const m = await find(req.params.id);
    if (!m) return res.status(404).json({ error: "Match not found" });
    const body = String(req.body?.body ?? "").trim();
    if (!body) return res.status(400).json({ error: "Comment body is required" });
    if (body.length > 500) return res.status(400).json({ error: "Comment is too long (max 500 characters)" });
    const s = sim(m, h);
    const c = { id: `c-${m.id}-${Date.now()}`, body, created_at: new Date().toISOString(), author: { id: req.user.sub, username: req.user.email.split("@")[0], avatar_url: null }, can_delete: true };
    s.comments.unshift(c);
    res.status(201).json({ comment: c });
  });
  app.delete("/api/comments/:id", h.protect, (req, res) => {
    for (const s of sims.values()) s.comments = s.comments.filter((c) => c.id !== req.params.id);
    res.json({ message: "Comment deleted" });
  });
  app.post("/api/comments/:id/report", h.protect, (_req, res) => res.json({ message: "Comment reported" }));

  app.get("/api/chat/:room/messages", h.protect, async (req, res) => {
    const m = await find(req.params.room);
    if (!m) return res.status(404).json({ error: "Match not found" });
    res.json(sim(m, h).chat.slice(-50));
  });
  app.post("/api/chat/:room/messages", h.protect, async (req, res) => {
    const m = await find(req.params.room);
    if (!m) return res.status(404).json({ error: "Match not found" });
    if (m.status !== "live") return res.status(400).json({ error: "Chat is only available for live matches" });
    const text = String(req.body?.text ?? "");
    if (!text.trim()) return res.status(400).json({ error: "Message cannot be empty" });
    if (text.length > 500) return res.status(400).json({ error: "Message cannot exceed 500 characters" });
    const msg = { id: `${Date.now()}-${req.user.sub}`, userId: req.user.sub, username: req.user.email.split("@")[0], text: text.trim(), is_premium: !!h.me.is_premium, timestamp: new Date().toISOString() };
    const s = sim(m, h);
    s.chat = [...s.chat, msg].slice(-50);
    h.io?.to(`chat:${m.id}`).emit("new_message", msg);
    res.status(201).json(msg);
  });

  app.get("/api/polls/match/:id", async (req, res) => {
    const m = await find(req.params.id);
    if (!m) return res.json({ polls: [] });
    const s = sim(m, h);
    const p = pollFor(m, s);
    const mine = req.user ? s.votes[req.user.sub] : null;
    p.userVote = mine ? { option_id: mine.optionId, locked_payout: mine.lockedPayout, locked_probability: mine.lockedProbability } : null;
    if (p.status === "closed") { const w = (s.completed ? s.t1 >= s.t2 : Number(m.team1_score) >= Number(m.team2_score)) ? p.options[0].id : p.options[1].id; p.winningOptionId = w; p.finalOdds = { [p.options[0].id]: w === p.options[0].id ? 100 : 0, [p.options[1].id]: w === p.options[1].id ? 100 : 0 }; }
    res.json({ polls: [p] });
  });
  app.post("/api/polls/:pollId/vote", h.protect, async (req, res) => {
    const matchId = req.params.pollId.replace(/^poll-/, "");
    const m = await find(matchId);
    if (!m) return res.status(404).json({ error: "Poll not found" });
    const s = sim(m, h);
    if (s.votes[req.user.sub]) return res.status(400).json({ error: "You have already voted in this poll" });
    const optionId = String(req.body?.optionId ?? "");
    const p = pollFor(m, s);
    if (!p.options.some((o) => o.id === optionId)) return res.status(400).json({ error: "Invalid option" });
    if (p.status !== "active") return res.status(400).json({ error: "This poll is closed" });
    const prob = optionId.endsWith("o1") ? s.odds / 100 : 1 - s.odds / 100;
    const payout = Math.max(5, Math.round(((1 - prob) / Math.max(prob, 0.01)) * 100));
    s.votes[req.user.sub] = { optionId, lockedProbability: Math.round(prob * 1000) / 1000, lockedPayout: payout };
    const after = pollFor(m, s);
    h.io?.to(`poll:${after.id}`).emit("poll_update", { pollId: after.id, voteCounts: after.voteCounts, totalVotes: after.totalVotes });
    res.json({ message: "Vote recorded", voteCounts: after.voteCounts, totalVotes: after.totalVotes, lockedProbability: s.votes[req.user.sub].lockedProbability, lockedPayout: payout });
  });

  app.post("/api/predictions/live", h.protect, async (req, res) => {
    const m = await find(String(req.body?.matchId ?? ""));
    if (!m) return res.status(404).json({ error: "Match not found" });
    const s = liveSim(m);
    const p1 = s ? s.odds : m.status === "completed" ? (Number(m.team1_score) > Number(m.team2_score) ? 100 : 0) : 50;
    res.json({ team1: { name: m.team1_name, winProbability: p1 }, team2: { name: m.team2_name, winProbability: 100 - p1 }, summary: "Live model read.", gameProgress: s ? Math.min(99, Math.round(gameSeconds(s) / 24)) : 100 });
  });

  // ── Fallbacks for the preview screen's companions (teams / players /
  // map-pool / h2h / follows). Each handler yields (next()) whenever
  // another module registered the same path, so an owner's real mock wins
  // regardless of load order; these only answer when nobody else does.
  const norm = (path) => String(path).replace(/:[A-Za-z0-9_]+/g, ":p");
  const others = (method, path) => (app.router?.stack ?? []).filter((l) => l.route && norm(l.route.path) === norm(path) && l.route.methods?.[method]).length > 1;
  const fallback = (method, path, ...fns) => { const handler = fns.pop(); app[method](path, ...fns, (req, res, next) => (others(method, path) ? next() : handler(req, res, next))); };
  const hash = (str) => [...String(str)].reduce((a, c) => a + c.charCodeAt(0), 0);
  const allTeams = async () => {
    const seen = new Map();
    for (const m of await matches(h)) {
      for (const side of [1, 2]) {
        const id = m[`team${side}_id`], name = m[`team${side}_name`];
        if (!id || seen.has(id)) continue;
        const i = seen.size;
        seen.set(id, { id, name, abbreviation: String(name).slice(0, 3).toUpperCase(), game: m.game, region: i % 2 ? "EMEA" : "Americas", tier: 1 + (i % 3), wins: 18 - (i % 7), losses: 6 + (i % 5), win_rate: (18 - (i % 7)) / 24, logo_url: m[`team${side}_logo_url`] ?? null, rating: 1800 - i * 15, ranking: i + 1, color: m[`team${side}_color`] ?? null });
      }
    }
    return [...seen.values()];
  };
  const rosterFor = (t) => {
    const pool = PLAYERS[t.game] ?? PLAYERS.VALORANT;
    const off = hash(t.id) % 2 ? 5 : 0;
    return pool.slice(off, off + 5).map(([name, role], i) => ({ id: `p-${t.game.toLowerCase()}-${off + i + 1}`, name, real_name: null, team_name: t.name, team_id: t.id, role, game: t.game, nationality: null, rating: +(1.0 + h.rand(hash(t.id) + i) * 0.4).toFixed(2), image_url: null, roster_status: "starter" }));
  };
  fallback("get", "/api/teams", async (req, res) => { const q = String(req.query.q ?? "").toLowerCase(); const game = String(req.query.game ?? ""); res.json((await allTeams()).filter((t) => (!game || t.game === game) && (!q || t.name.toLowerCase().includes(q)))); });
  fallback("get", "/api/teams/:id/players", async (req, res) => {
    const t = (await allTeams()).find((x) => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: "Team not found" });
    res.json(rosterFor(t));
  });
  fallback("get", "/api/teams/:id/map-pool", (req, res) => {
    const game = String(req.query.game ?? "VALORANT");
    const k = hash(req.params.id) % 3;
    if (game === "League") return res.json({ sides: { blue: { games: 14 + k, wins: 10 - k, losses: 4 + 2 * k }, red: { games: 12, wins: 6 + k, losses: 6 - k } } });
    const maps = game === "CS2" ? ["Mirage", "Inferno", "Nuke", "Ancient", "Anubis"] : ["Ascent", "Bind", "Lotus", "Haven", "Sunset"];
    res.json({ maps: maps.map((map, i) => ({ map, games: 14 - i * 2 + k, wins: 9 - i + (k % 2), losses: 5 - i + k - (k % 2) })) });
  });
  fallback("post", "/api/predictions/head-to-head", (req, res) => { const p = 45 + (hash(req.body?.team1Id ?? "") % 20); res.json({ game: req.body?.game, team1: { name: "", winProbability: p }, team2: { name: "", winProbability: 100 - p }, headToHead: { meetings: 3, team1Wins: 2, team2Wins: 1 } }); });
  const followed = new Set();
  fallback("get", "/api/users/:id/following", h.protect, (req, res) => res.json(req.query.type === "team" ? [...followed].map((id) => ({ target_id: id })) : []));
  fallback("post", "/api/follow", h.protect, (req, res) => { if (req.body?.targetType === "team") followed.add(req.body.targetId); res.json({ message: "Followed" }); });
  fallback("post", "/api/unfollow", h.protect, (req, res) => { if (req.body?.targetType === "team") followed.delete(req.body.targetId); res.json({ message: "Unfollowed" }); });
  fallback("get", "/api/matches/completed", async (req, res) => { const team = String(req.query.team ?? ""); res.json((await matches(h)).filter((m) => m.status === "completed" && (!team || m.team1_id === team || m.team2_id === team))); });
}

export function registerSockets(io, h) {
  // Every 2s advance each live sim and emit its events to match:<id>.
  // Chat bots keep the room alive every ~9s.
  const names = ["fragzilla", "mapcontrol", "ctside", "vctfan99", "baronsteal", "jettmain"];
  const lines = ["LETS GO", "that clutch was insane", "eco round incoming", "who's taking this?", "they need this round", "gold lead growing", "dragon soul next", "nice pick", "this map is a coinflip", "huge round"];
  let n = 0;
  setInterval(async () => {
    n++;
    const live = (await matches(h)).filter((m) => m.status === "live");
    for (const m of live) {
      const s = sim(m, h);
      for (const [event, payload] of tick(s, h)) io.to(`match:${m.id}`).emit(event, payload);
      if (n % 4 === 0 && !s.completed) {
        const msg = { id: `${Date.now()}-bot${n}`, userId: `bot${n % 6}`, username: names[(n + m.id.length) % names.length], text: lines[(n * 7 + m.id.length) % lines.length], is_premium: n % 12 === 0, timestamp: new Date().toISOString() };
        s.chat = [...s.chat, msg].slice(-50);
        io.to(`chat:${m.id}`).emit("new_message", msg);
      }
    }
  }, 2000);
}

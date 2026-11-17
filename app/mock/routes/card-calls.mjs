// mock/routes/card-calls.mjs — the player stat card's history and Insight's
// Calls (parity Nov 17 §1–2):
//
//   GET /api/players/:id/matches   for the scoreboard's players ("p-valorant-3",
//                                  "p-cs2-7", …), whom players-teams.mjs doesn't
//                                  know: 60 earlier games each, newest first,
//                                  the way the backend sends them (snake_case,
//                                  keyset paging with before / before_id). Some
//                                  rows don't count by the report's rule (no
//                                  winner, or a combined score under 6).
//                                  "p-<game>-10" has only a handful of games:
//                                  the card's "Not enough games yet".
//   GET /api/alerts/calls/:matchId Insight's calls (insightCallsService.reveal):
//                                  every live match, the first upcoming match of
//                                  each game (m-up-1..3) and every finished
//                                  m-done-* match; the rest have none.
//
// Premium comes from the account: an email that starts with "free"
// (free@insightesportsapp.com) is a free account here, so a free and a
// Premium browser can look at the same mock at once.
//
// This file sorts before players-teams.mjs, so its /players/:id/matches route
// answers first for the scoreboard ids and hands every other id on (next()).

import { findMatch } from "./_matches-data.mjs";

const rand = (seed) => { const x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x); };
const GAME_OF = { valorant: "VALORANT", cs2: "CS2", league: "League" };
const H = 3600e3;

// The scoreboard's rosters (match-detail.mjs PLAYERS: index 0–4 team1, 5–9 team2).
const NAMES = {
  VALORANT: ["TenZ", "zekken", "Sacy", "johnqt", "Zellsis", "Boaster", "Derke", "Alfajer", "Leo", "Chronicle"],
  CS2: ["ZywOo", "apEX", "flameZ", "mezii", "ropz", "s1mple", "b1t", "jL", "Aleksib", "iM"],
  League: ["Zeus", "Oner", "Faker", "Gumayusi", "Keria", "Kiin", "Canyon", "Chovy", "Peyz", "Lehends"],
};
// Someone on the roster who sat this one out: a call on them is void.
const BENCH = { VALORANT: "Shahzeb", CS2: "Spinx", League: "Rascal" };

const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;

/** A player's earlier games, newest first (the /players/:id/matches row). */
function history(game, n, playerId) {
  const now = Date.now();
  const thin = n === 10;
  const count = thin ? 4 : 60;
  const f = 0.86 + rand(n * 31 + game.length) * 0.28;      // this player's level
  const rows = [];
  for (let i = 0; i < count; i++) {
    const s = n * 1000 + i * 17 + game.length * 7;
    const completed = new Date(now - (i + 1) * 9 * H - rand(s) * 3 * H).toISOString();
    const won = rand(s + 1) > 0.45;
    // Rows the report doesn't count: no winner (every 9th), or a short game (every 13th, and most of a thin player's).
    const noWinner = i % 9 === 4;
    const short = i % 13 === 7 || (thin && i % 2 === 1);
    let t1, t2;
    if (short) { t1 = 3; t2 = 2; }
    else if (game === "League") { t1 = won ? 16 + Math.floor(rand(s + 2) * 10) : 6 + Math.floor(rand(s + 2) * 8); t2 = won ? 6 + Math.floor(rand(s + 3) * 8) : 16 + Math.floor(rand(s + 3) * 10); }
    else { t1 = won ? 13 : 5 + Math.floor(rand(s + 2) * 7); t2 = won ? 5 + Math.floor(rand(s + 3) * 7) : 13; }
    const kills = Math.max(2, Math.round((10 + rand(s + 4) * 11) * f));
    const deaths = 8 + Math.floor(rand(s + 5) * 10);
    const assists = Math.floor(rand(s + 6) * 11);
    const row = {
      match_id: `hist-${playerId}-${i + 1}`, game, completed_at: completed,
      team1_id: "team-own", team2_id: "team-opp", team1_score: t1, team2_score: t2,
      winner_id: noWinner ? null : won ? "team-own" : "team-opp",
      kills, deaths, assists, plus_minus: kills - deaths,
      acs: null, adr: null, rating: null, kast: null, gold_earned: null, cs_per_min: null, vision_score: null,
    };
    if (game === "VALORANT") Object.assign(row, { acs: round1(150 + kills * 9 + (rand(s + 7) - 0.5) * 50), adr: round1(110 + kills * 5 + (rand(s + 8) - 0.5) * 30), kast: round1(62 + rand(s + 9) * 20) });
    if (game === "CS2") Object.assign(row, { adr: round1(110 + kills * 5 + (rand(s + 8) - 0.5) * 30), rating: round2(0.75 + rand(s + 10) * 0.7 * f), kast: round1(60 + rand(s + 9) * 24) });
    if (game === "League") Object.assign(row, { gold_earned: 10000 + Math.floor(rand(s + 11) * 8000), cs_per_min: round1(7 + rand(s + 12) * 3), vision_score: Math.floor(rand(s + 13) * 60), acs: null, adr: null });
    // node-postgres serialises NUMERIC as strings now and then.
    if (i % 7 === 3 && row.adr != null) row.adr = String(row.adr);
    rows.push(row);
  }
  return rows;
}

/** match-detail.mjs completedStats' kills for a finished match, so a settled call agrees with the scoreboard. */
function finishedKills(m) {
  const seed = [...m.id].reduce((s, c) => s + c.charCodeAt(0), 0);
  return NAMES[m.game].map((_, i) => 8 + Math.floor(rand(seed + i) * 18));
}

/** Matches that have calls: every live match, m-up-1..3 and every m-done-*. */
function hasCalls(m) {
  if (m.status === "live") return true;
  if (m.status === "upcoming") return ["m-up-1", "m-up-2", "m-up-3"].includes(m.id);
  return /^m-done-\d+$/.test(m.id);
}

/** The calls as the backend stores them (before callShape). */
function callsFor(m) {
  const seed = [...m.id].reduce((s, c) => s + c.charCodeAt(0), 0);
  const over = m.status === "completed";
  const names = NAMES[m.game] ?? NAMES.VALORANT;
  const kills = over ? finishedKills(m) : null;
  const t1 = Number(m.team1_score) || 0, t2 = Number(m.team2_score) || 0;
  const pickTeam1 = rand(seed + 1) > 0.4;
  const winnerChance = 55 + Math.floor(rand(seed + 2) * 18);
  const out = [{
    id: `call-${m.id}-w`, kind: "winner", target_type: "team",
    target_id: pickTeam1 ? m.team1_id : m.team2_id, target_name: pickTeam1 ? m.team1_name : m.team2_name,
    team_name: null, opponent_name: pickTeam1 ? m.team2_name : m.team1_name,
    stat: null, direction: null, line: null, probability: winnerChance,
    status: over ? (t1 === t2 ? "void" : (t1 > t2) === pickTeam1 ? "hit" : "miss") : "pending", final_value: null,
  }];
  // The two leading players on each side; the last one sat out (void) on a finished match.
  [0, 1, 5, 6].forEach((idx, k) => {
    const benched = over && k === 3;
    const name = benched ? BENCH[m.game] : names[idx];
    // Hit, miss, hit on a finished match (the threshold sits just under or over what they got).
    const threshold = over && !benched ? kills[idx] + (k === 1 ? 2 : -1 - Math.floor(rand(seed + k) * 2)) : 14 + Math.floor(rand(seed + 10 + k) * 6);
    const killsEnd = over && !benched ? kills[idx] : null;
    out.push({
      id: `call-${m.id}-p${k}`, kind: "player_stat", target_type: "player",
      target_id: `p-${m.game.toLowerCase()}-${idx + 1}`, target_name: name,
      team_name: idx < 5 ? m.team1_name : m.team2_name, opponent_name: idx < 5 ? m.team2_name : m.team1_name,
      stat: "kills", direction: "over", line: threshold - 0.5, probability: 58 + Math.floor(rand(seed + 20 + k) * 26),
      status: !over ? "pending" : benched ? "void" : killsEnd >= threshold ? "hit" : "miss",
      final_value: killsEnd,
    });
  });
  // Winner first, then the surest call first.
  return [out[0], ...out.slice(1).sort((a, b) => b.probability - a.probability)];
}

const atLeast = (line) => Math.floor(Number(line)) + 1;
const callShape = (c) => ({
  id: c.id, kind: c.kind,
  text: c.kind === "winner" ? `${c.target_name} to win` : `${c.target_name} ${c.direction === "under" ? "under" : "at least"} ${atLeast(c.line)} ${c.stat}`,
  target_type: c.target_type, target_id: c.target_id, target_name: c.target_name, team_name: c.team_name, opponent_name: c.opponent_name,
  stat: c.stat, direction: c.direction, threshold: c.line == null ? null : atLeast(c.line),
  // node-postgres hands NUMERIC back as a string; the app reads either.
  chance: c.kind === "winner" ? String(c.probability) : c.probability,
  status: c.status, final_value: c.final_value, made_at: new Date(Date.now() - 2 * H).toISOString(),
});

export function register(app, h) {
  app.get("/api/players/:id/matches", (req, res, next) => {
    const m = /^p-(valorant|cs2|league)-(\d+)$/.exec(req.params.id);
    if (!m) return next();
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 500);
    let rows = history(GAME_OF[m[1]], Number(m[2]), req.params.id);
    const before = req.query.before ? new Date(req.query.before) : null;
    if (before && !Number.isNaN(before.getTime())) {
      const beforeId = String(req.query.before_id ?? "");
      rows = rows.filter((r) => new Date(r.completed_at) < before || (r.completed_at === before.toISOString() && r.match_id < beforeId));
    }
    res.json(rows.slice(0, limit));
  });

  app.get("/api/alerts/calls/:matchId", h.protect, (req, res) => {
    const m = findMatch(req.params.matchId);
    if (!m) return res.status(404).json({ error: "Match not found", code: "MATCH_NOT_FOUND" });
    const premium = !!h.me.is_premium && !/^free/i.test(String(req.user?.email ?? ""));
    const calls = hasCalls(m) ? callsFor(m) : [];
    const over = m.status === "completed";
    const shown = over || premium;
    const decided = calls.filter((c) => c.status === "hit" || c.status === "miss");
    res.json({
      match_id: m.id, match_status: m.status,
      available: shown && calls.length > 0,
      locked: !shown && calls.length > 0,
      calls_count: calls.length,
      calls: shown ? calls.map(callShape) : [],
      summary: over && decided.length ? { hit: decided.filter((c) => c.status === "hit").length, miss: decided.filter((c) => c.status === "miss").length, total: decided.length } : null,
    });
  });
}

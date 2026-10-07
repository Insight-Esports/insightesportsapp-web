// mock/routes/predictions.mjs — the Premium tab's backend: /predictions/*,
// /players/:id/prediction-filters, /reports/*, /payments/*. Shapes follow
// predictionService.js / reportController.js / paymentController.js and the
// Swift Codable models. Numbers are seeded (h.rand) so screenshots are stable.
//
// /players/top, /players/search and /teams are only registered here when
// mock/routes/players-teams.mjs (agent B) is absent; when it exists and
// exports player/team arrays, those are reused so ids line up.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Fixtures ──────────────────────────────────────────────────────────────
const TEAMS = {
  VALORANT: [
    ["sen", "Sentinels", "Americas", "e01e37"], ["lev", "Leviatán", "Americas", "3b82f6"], ["fnc", "Fnatic", "EMEA", "f5a623"],
    ["prx", "Paper Rex", "Pacific", "ff6b35"], ["g2v", "G2 Esports", "Americas", "9ca3af"], ["loud", "LOUD", "Americas", "22c55e"],
    ["nrg", "NRG", "Americas", "a78bfa"], ["t1v", "T1", "Pacific", "dc2626"],
  ],
  CS2: [
    ["navi", "Natus Vincere", "CIS", "f5a623"], ["vit", "Team Vitality", "EU", "f59e0b"], ["spirit", "Team Spirit", "CIS", "5b7fff"],
    ["faze", "FaZe Clan", "EU", "dc2626"], ["mouz", "MOUZ", "EU", "ef4444"], ["g2c", "G2 Esports", "EU", "9ca3af"],
    ["liq", "Team Liquid", "NA", "3b82f6"], ["heroic", "HEROIC", "EU", "22c55e"],
  ],
  League: [
    ["t1l", "T1", "LCK", "dc2626"], ["geng", "Gen.G", "LCK", "f5a623"], ["hle", "Hanwha Life Esports", "LCK", "ff6b35"],
    ["g2l", "G2 Esports", "LEC", "9ca3af"], ["blg", "Bilibili Gaming", "LPL", "3b82f6"], ["tes", "Top Esports", "LPL", "ef4444"],
    ["jdg", "JD Gaming", "LPL", "22c55e"], ["fly", "FlyQuest", "LTA", "a78bfa"],
  ],
};
const PLAYERS = {
  VALORANT: [
    ["p-tenz", "TenZ", "Sentinels", "Duelist"], ["p-aspas", "aspas", "Leviatán", "Duelist"], ["p-demon1", "Demon1", "NRG", "Duelist"],
    ["p-yay", "yay", "NRG", "Controller"], ["p-derke", "Derke", "Fnatic", "Duelist"], ["p-boaster", "Boaster", "Fnatic", "Initiator"],
    ["p-f0rsaken", "f0rsakeN", "Paper Rex", "Duelist"], ["p-less", "Less", "LOUD", "Sentinel"],
  ],
  CS2: [
    ["p-s1mple", "s1mple", "Natus Vincere", "AWPer"], ["p-zywoo", "ZywOo", "Team Vitality", "AWPer"], ["p-donk", "donk", "Team Spirit", "Rifler"],
    ["p-m0nesy", "m0NESY", "G2 Esports", "AWPer"], ["p-niko", "NiKo", "G2 Esports", "Rifler"], ["p-ropz", "ropz", "FaZe Clan", "Rifler"],
    ["p-sh1ro", "sh1ro", "Team Spirit", "AWPer"], ["p-b1t", "b1t", "Natus Vincere", "Rifler"],
  ],
  League: [
    ["p-faker", "Faker", "T1", "Mid"], ["p-chovy", "Chovy", "Gen.G", "Mid"], ["p-ruler", "Ruler", "JD Gaming", "ADC"],
    ["p-caps", "Caps", "G2 Esports", "Mid"], ["p-zeus", "Zeus", "T1", "Top"], ["p-oner", "Oner", "T1", "Jungle"],
    ["p-gumayusi", "Gumayusi", "T1", "ADC"], ["p-knight", "knight", "Bilibili Gaming", "Mid"],
  ],
};
const MAPS = {
  VALORANT: ["Ascent", "Bind", "Haven", "Split", "Lotus", "Sunset", "Icebox"],
  CS2: ["Mirage", "Inferno", "Nuke", "Overpass", "Ancient", "Anubis", "Vertigo"],
  League: ["Summoner's Rift"],
};
const AGENTS = {
  VALORANT: ["Jett", "Raze", "Omen", "Sova", "Killjoy", "Neon"],
  CS2: [],
  League: ["Ahri", "Azir", "Orianna", "Sylas", "LeBlanc", "Yone"],
};
// Baselines per stat: [mean, spread]
const BASE = {
  VALORANT: { kills: [17, 5], deaths: [14, 3], assists: [5, 2.5], acs: [232, 45], adr: [152, 30], headshots: [7, 3], plus_minus: [3, 7], first_bloods: [2, 1.5], clutch_wins: [0.6, 0.8] },
  CS2: { kills: [18, 5], deaths: [15, 3], assists: [4, 2], adr: [81, 14], headshots: [9, 3.5], plus_minus: [3, 8], kills_t_side: [9, 3], kills_ct_side: [9, 3], first_bloods: [2, 1.4], clutch_wins: [0.5, 0.7] },
  League: { kills: [3.6, 2], deaths: [2.1, 1.4], assists: [6.5, 3], cs_per_min: [8.7, 1.1], gold_earned: [13800, 2400], vision_score: [36, 10], plus_minus: [1.5, 3], damage_dealt: [19500, 5000], gold_diff_at_15: [320, 500] },
};
const TEAM_BASE = { VALORANT: { kills: [68, 12], plus_minus: [5, 12] }, CS2: { kills: [72, 12], plus_minus: [4, 12] }, League: { kills: [15, 6], plus_minus: [3, 6] } };
const STAT_COLUMNS = {
  VALORANT: ["kills", "deaths", "assists", "acs", "adr", "headshots", "plus_minus", "first_bloods", "clutch_wins"],
  CS2: ["kills", "deaths", "assists", "adr", "headshots", "plus_minus", "kills_t_side", "kills_ct_side", "first_bloods", "clutch_wins"],
  League: ["kills", "deaths", "assists", "cs_per_min", "gold_earned", "vision_score", "plus_minus", "damage_dealt", "gold_diff_at_15"],
};
const DISCLAIMER = "Predictions are statistical estimates based on historical data and are not guarantees. Not gambling advice.";

const hash = (s) => { let x = 7; for (const ch of String(s)) x = (x * 31 + ch.charCodeAt(0)) % 1_000_003; return x; };
const gameOf = (req) => (["VALORANT", "CS2", "League"].includes(req.query.game) ? req.query.game : "VALORANT");
const round1 = (v) => Math.round(v * 10) / 10;
const fmt = (v) => (Math.abs(v) >= 1000 ? Math.round(v) : round1(v));

const allPlayers = () => Object.entries(PLAYERS).flatMap(([game, rows]) => rows.map(([id, name, team, role]) => ({ id, name, team, role, game })));
const allTeams = () => Object.entries(TEAMS).flatMap(([game, rows]) => rows.map(([id, name, region, color]) => ({ id, name, region, color, game })));
// Unknown ids (e.g. the uuids players-teams.mjs mints) still resolve: the
// prediction engine only needs a stable seed + the game, never the roster.
const findPlayer = (id, game = "VALORANT") => allPlayers().find((p) => p.id === id || p.name.toLowerCase() === String(id).toLowerCase())
  ?? (id ? { id: String(id), name: "This player", team: TEAMS[game][0][1], role: "Flex", game } : undefined);
const findTeam = (id, game = "VALORANT") => allTeams().find((t) => t.id === id || t.name.toLowerCase() === decodeURIComponent(String(id)).toLowerCase())
  ?? (id ? { id: String(id), name: decodeURIComponent(String(id)).length < 24 ? decodeURIComponent(String(id)) : "This team", region: "—", color: null, game } : undefined);

// Seeded per-game stat series, most-recent FIRST (the backend's order).
function series(h, seedKey, game, stat, n, team = false) {
  const [mean, spread] = (team ? TEAM_BASE[game] : BASE[game])[stat] ?? [10, 3];
  const base = hash(seedKey + stat);
  const opponents = TEAMS[game].map((t) => t[1]);
  return Array.from({ length: n }, (_, i) => {
    const r = h.rand(base + i * 13);
    const r2 = h.rand(base + i * 29 + 5);
    // Mild upward form for the most recent games so trends are visible.
    const drift = (n - i) / n * spread * 0.35 * (h.rand(base) > 0.5 ? 1 : -1);
    const raw = mean + (r - 0.5) * 2 * spread + drift;
    const v = stat === "plus_minus" ? Math.round(raw) : Math.max(0, stat === "acs" || stat === "adr" || stat === "cs_per_min" || stat === "gold_earned" ? fmt(raw) : Math.round(raw));
    return {
      statValue: v,
      matchDate: h.isoAgo((i + 1) * 3 * 864e5).slice(0, 10),
      mapName: MAPS[game][Math.floor(r2 * MAPS[game].length)],
      agent: AGENTS[game].length ? AGENTS[game][Math.floor(h.rand(base + i * 7) * AGENTS[game].length)] : null,
      matchup: `vs ${opponents[Math.floor(h.rand(base + i * 3) * opponents.length)]}`,
      result: h.rand(base + i * 11) > 0.42 ? "W" : "L",
    };
  });
}
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const label = (stat) => ({ kills: "kills", deaths: "deaths", assists: "assists", acs: "ACS", adr: "ADR", headshots: "headshots", plus_minus: "+/−", cs_per_min: "CS/min", gold_earned: "gold", vision_score: "vision score" })[stat] ?? stat;

function analyze(h, { game, targetType, targetId, name, stat, baseline, direction, window }) {
  const n = [10, 15, 25].includes(Number(window)) ? Number(window) : 10;
  const team = targetType === "team";
  const games = series(h, targetId, game, stat, n, team);
  const values = games.map((g) => g.statValue);
  const recentAvg = avg(values);
  const careerAvg = recentAvg * (1 - (h.rand(hash(targetId)) - 0.5) * 0.18);
  const totalGames = 40 + Math.floor(h.rand(hash(targetId) + 1) * 80);
  const newer = avg(values.slice(0, Math.floor(n / 2))), older = avg(values.slice(Math.floor(n / 2)));
  const trend = newer > older * 1.06 ? "UP" : newer < older * 0.94 ? "DOWN" : "FLAT";
  const out = {
    targetType, [team ? "team" : "player"]: name, game, stat,
    careerAverage: round1(careerAvg), totalGamesAnalyzed: totalGames,
    last10Games: games, last10Average: round1(recentAvg),
    trend, trendReason: trend === "UP" ? `Averaging ${round1(newer)} over the last ${Math.floor(n / 2)} vs ${round1(older)} before that.` : trend === "DOWN" ? `Down to ${round1(newer)} over the last ${Math.floor(n / 2)} from ${round1(older)}.` : "Form is steady across the window.",
    statAggregation: "average",
    outliers: team ? null : {
      maps: { positiveOutliers: [{ name: MAPS[game][0], avgStat: round1(careerAvg * 1.22), gamesPlayed: 11, percentAbove: 22 }], negativeOutliers: [{ name: MAPS[game][2] ?? MAPS[game][0], avgStat: round1(careerAvg * 0.84), gamesPlayed: 8, percentBelow: 16 }] },
      agents: AGENTS[game].length ? { positiveOutliers: [{ name: AGENTS[game][0], avgStat: round1(careerAvg * 1.15), gamesPlayed: 19, percentAbove: 15 }], negativeOutliers: [] } : null,
    },
    disclaimer: DISCLAIMER,
  };
  if (n > totalGames) out.accuracyWarning = `Only ${totalGames} completed games on record — treat this read as directional.`;
  if (baseline != null && Number.isFinite(Number(baseline))) {
    const line = Number(baseline);
    const under = direction === "under";
    const hits = values.filter((v) => (under ? v < line : v >= line)).length;
    const sd = Math.max(0.5, Math.sqrt(avg(values.map((v) => (v - recentAvg) ** 2))));
    const z = (line - recentAvg) / sd;
    const cdf = 0.5 * (1 + Math.tanh(z * 0.8)); // smooth S-curve, close enough for a mock
    let p = (under ? cdf : 1 - cdf) * 100;
    p = Math.min(99.4, Math.max(0.3, p * 0.7 + (hits / n) * 100 * 0.3));
    const exact = Math.round(p * 10) / 10;
    const confidence = Math.round(exact);
    out.baseline = line; out.direction = under ? "under" : "over";
    out.prediction = exact >= 62 ? "LIKELY" : exact <= 38 ? "UNLIKELY" : "TOSS-UP";
    out.confidence = confidence; out.probabilityExact = exact;
    out.probabilityText = exact > 99 ? ">99%" : exact >= 1 ? `${confidence}%` : "<1%";
    out.last10Hits = hits; out.last10HitRate = Math.round((hits / n) * 100);
    out.last10Summary = `${hits} of the last ${n} games ${under ? "stayed under" : "cleared"} ${line}.`;
    out.summary = `${name} has ${under ? "stayed under" : "cleared"} ${line} ${label(stat)} in ${hits} of the last ${n} (${out.last10HitRate}%), averaging ${round1(recentAvg)} against a career ${round1(careerAvg)}. Form is ${trend === "UP" ? "rising" : trend === "DOWN" ? "cooling" : "steady"}, which ${(trend === "UP") === !under ? "helps" : "works against"} this line.`;
  } else {
    out.summary = `${name} is averaging ${round1(recentAvg)} ${label(stat)} over the last ${n}, ${recentAvg >= careerAvg ? "above" : "below"} a career ${round1(careerAvg)}. ${trend === "UP" ? "The recent half of the window is the stronger half." : trend === "DOWN" ? "The recent half of the window is the weaker half." : "Nothing in the window stands out either way."}`;
  }
  return out;
}

function period(h, seed, game, labelText, n, team, columns) {
  const wins = Math.round(n * (0.45 + h.rand(seed) * 0.3));
  const losses = n - wins;
  const avgStats = {};
  for (const c of columns) {
    const [mean, spread] = (team ? TEAM_BASE[game] : BASE[game])[c] ?? [10, 3];
    const key = c === "plus_minus" ? "plusMinus" : c;
    avgStats[key] = fmt(mean + (h.rand(seed + hash(c)) - 0.5) * spread * 0.6);
  }
  const bestStats = {};
  for (const c of columns.slice(0, 5)) bestStats[c === "plus_minus" ? "plusMinus" : c] = fmt((avgStats[c === "plus_minus" ? "plusMinus" : c] ?? 1) * 1.45);
  const form = Array.from({ length: Math.min(10, n) }, (_, i) => (h.rand(seed + i * 17) > 0.42 ? "W" : "L")).join("");
  return {
    label: labelText, gamesPlayed: n, wins, losses, winRate: `${Math.round((wins / n) * 100)}%`, record: `${wins}-${losses}`,
    avgStats, recentForm: form,
    bestGame: { opponent: TEAMS[game][Math.floor(h.rand(seed + 2) * TEAMS[game].length)][1], date: h.isoAgo(9 * 864e5).slice(0, 10), mapName: MAPS[game][0], result: "W", stats: bestStats },
  };
}

function playerOverview(h, p) {
  const game = p.game, seed = hash(p.id), cols = STAT_COLUMNS[game];
  const highs = {}, lows = {}, sHighs = {}, sLows = {};
  for (const c of cols) { const [m, s] = BASE[game][c] ?? [10, 3]; highs[c] = fmt(m + s * 2.3); lows[c] = fmt(Math.max(0, m - s * 1.9)); sHighs[c] = fmt(m + s * 1.8); sLows[c] = fmt(Math.max(0, m - s * 1.4)); }
  const agents = AGENTS[game];
  return {
    player: p.name, team: p.team, role: p.role, region: TEAMS[game][0][2], game, statColumns: cols, currentSeason: "2026",
    last10: period(h, seed + 1, game, "Last 10", 10, false, cols), season: period(h, seed + 2, game, "Season", 38, false, cols), allTime: period(h, seed + 3, game, "All Time", 164, false, cols),
    careerHighs: highs, careerLows: lows, seasonHighs: sHighs, seasonLows: sLows,
    bestAgent: agents.length ? { name: agents[0], games: 31, winRate: "68%" } : null, worstAgent: agents.length ? { name: agents[3], games: 9, winRate: "44%" } : null,
    bestMap: { name: MAPS[game][0], games: 22, winRate: "71%" }, worstMap: { name: MAPS[game][MAPS[game].length - 1], games: 12, winRate: "42%" },
    agentBreakdown: agents.map((a, i) => ({ agent: a, avgStat: fmt(BASE[game].kills[0] * (1.2 - i * 0.07)), gamesPlayed: 30 - i * 4, wins: 20 - i * 3, winRate: `${68 - i * 4}%`, avgKDA: round1(1.6 - i * 0.12) })),
    mapBreakdown: MAPS[game].map((m, i) => ({ mapName: m, avgStat: fmt(BASE[game].kills[0] * (1.18 - i * 0.05)), gamesPlayed: 24 - i * 2 })),
    disclaimer: DISCLAIMER,
  };
}
function teamOverview(h, t) {
  const game = t.game, seed = hash(t.id), cols = Object.keys(TEAM_BASE[game]).concat(game === "League" ? ["deaths", "assists", "cs_per_min", "gold_earned", "vision_score"] : ["deaths", "assists", "acs", "adr", "headshots"]);
  const maps = MAPS[game].map((m, i) => { const gp = 20 - i * 2, w = Math.round(gp * (0.72 - i * 0.06)); return { mapName: m, gamesPlayed: gp, wins: w, losses: gp - w, winRate: `${Math.round((w / gp) * 100)}%`, avgPlusMinus: round1(6 - i * 1.5) }; });
  return {
    team: t.name, game, currentSeason: "2026",
    last10: period(h, seed + 1, game, "Last 10", 10, true, cols), season: period(h, seed + 2, game, "Season", 34, true, cols), allTime: period(h, seed + 3, game, "All Time", 210, true, cols),
    mapBreakdown: maps,
    bestMap: { mapName: maps[0].mapName, winRate: maps[0].winRate, gamesPlayed: maps[0].gamesPlayed },
    worstMap: { mapName: maps[maps.length - 1].mapName, winRate: maps[maps.length - 1].winRate, gamesPlayed: maps[maps.length - 1].gamesPlayed },
    sideBreakdown: game === "League" ? { blue: { games: 112, wins: 71, losses: 41, winRate: "63%" }, red: { games: 98, wins: 52, losses: 46, winRate: "53%" } } : null,
    disclaimer: DISCLAIMER,
  };
}
const strength = (h, t) => { const s = hash(t.id); const score = Math.round(55 + h.rand(s) * 35); return { score, totalGames: 120 + Math.floor(h.rand(s + 1) * 100), overallWinRate: Math.round(score * 0.9), recentWinRate: Math.round(40 + h.rand(s + 2) * 50), avgPlusMinus: round1((h.rand(s + 3) - 0.35) * 10), opponentQuality: Math.round(35 + h.rand(s + 4) * 40) }; };

// ── Reports state (in-memory; resets with the mock) ───────────────────────
function makeReport(h, n, generatedAt) {
  return {
    id: `rep-${n}`,
    headline: n % 2 ? "Sentinels sweep the week — and your bracket noticed" : "A quiet week for your teams, a loud one for ZywOo",
    report_text: "",
    sections: [
      { type: "teams", title: "Sentinels keep rolling", body: "Sentinels went 3-0 this week, closing out Leviatán on Lotus and Sunset without dropping a map. TenZ averaged 21.4 kills across the six maps, his best stretch of the season. Fnatic stumbled against Paper Rex, splitting a pair of Bo3s that came down to overtime on Ascent." },
      { type: "players", title: "ZywOo is back on the AWP", body: "ZywOo posted 1.41 rating over 14 maps for Vitality, including a 34-bomb on Nuke against FaZe. Faker's T1 took both series this week; his Azir pick went 4-0 with a 9.2 CS/min average." },
      { type: "your_week", title: "Your predictions", body: "You ran 6 predictions and hit 4 — the Sentinels over 13.5 map kills for TenZ and the Vitality head-to-head were the clean ones. The two misses were both unders on hot players; the form trend flagged both as rising." },
      { type: "news", title: "Around the scene", body: "Roster moves ahead of the next split: NRG confirmed a sixth man, and Paper Rex's coach shuffle is official. Champions ticket windows open next week." },
    ],
    articles: [
      { title: "Sentinels sweep Leviatán to lock top seed", url: "https://www.vlr.gg/", image_url: null, source: "VLR", published_at: h.isoAgo(2 * 864e5) },
      { title: "ZywOo: 'The AWP never left'", url: "https://www.hltv.org/", image_url: null, source: "HLTV", published_at: h.isoAgo(3 * 864e5) },
      { title: "NRG confirm sixth-man signing ahead of Champions", url: "https://www.dexerto.com/", image_url: null, source: "Dexerto", published_at: h.isoAgo(1 * 864e5) },
    ],
    generated_at: generatedAt,
    is_saved: false,
  };
}

export function register(app, h) {
  const premium = (req, res, next) => (h.me.is_premium ? next() : res.status(403).json({ error: "This feature requires Insight Pro", code: "PREMIUM_REQUIRED" }));

  // ── Predictions ──
  app.post("/api/predictions/analyze", h.protect, premium, (req, res) => {
    const { game = "VALORANT", targetType = "player", targetId, stat, baseline, direction, window } = req.body ?? {};
    if (!targetId || !stat) return res.status(400).json({ error: "targetId and stat are required" });
    const target = targetType === "team" ? findTeam(targetId, game) : findPlayer(targetId, game);
    if (!target) return res.status(404).json({ error: "No stat data found for this target" });
    res.json(analyze(h, { game: target.game ?? game, targetType, targetId, name: target.name, stat, baseline, direction, window }));
  });
  app.get("/api/predictions/player-overview/:id", h.protect, premium, (req, res) => {
    const p = findPlayer(req.params.id, gameOf(req));
    if (!p) return res.status(404).json({ error: "Player not found" });
    res.json(playerOverview(h, p));
  });
  app.get("/api/predictions/team-overview/:id", h.protect, premium, (req, res) => {
    const t = findTeam(req.params.id, gameOf(req));
    if (!t) return res.status(404).json({ error: "Team not found" });
    res.json(teamOverview(h, t));
  });
  app.post("/api/predictions/head-to-head", h.protect, (req, res) => {
    const { game = "VALORANT", team1Id, team2Id, map } = req.body ?? {};
    const t1 = findTeam(team1Id, game), t2 = findTeam(team2Id, game);
    if (!t1 || !t2) return res.status(404).json({ error: "Team not found" });
    const s1 = strength(h, t1), s2 = strength(h, t2);
    const p1 = Math.max(12, Math.min(88, Math.round(50 + (s1.score - s2.score) * 1.1)));
    const meetings = 2 + Math.floor(h.rand(hash(t1.id + t2.id)) * 6);
    const t1w = Math.round(meetings * (p1 / 100));
    const sides = (t) => (game === "League" ? { blue: { games: 40, wins: 26, losses: 14, winRate: "65%" }, red: { games: 36, wins: 18 + (t.id.length % 3), losses: 18 - (t.id.length % 3), winRate: `${Math.round(((18 + (t.id.length % 3)) / 36) * 100)}%` } } : null);
    res.json({
      matchType: "pre_match", game, map: map ?? null,
      team1: { name: t1.name, winProbability: p1, color: t1.color, probabilityDisplay: `${p1}%`, strength: s1, sides: sides(t1) },
      team2: { name: t2.name, winProbability: 100 - p1, color: t2.color, probabilityDisplay: `${100 - p1}%`, strength: s2, sides: sides(t2) },
      headToHead: { meetings, team1Wins: t1w, team2Wins: meetings - t1w, usedInPrediction: meetings >= 3 },
      mapBreakdown: map ? { map, team1Record: `${7 + (hash(t1.id) % 5)}-${3 + (hash(t1.id) % 3)}`, team2Record: `${5 + (hash(t2.id) % 5)}-${4 + (hash(t2.id) % 3)}`, usedInPrediction: true } : null,
      summary: `${t1.name} come in ${p1 >= 50 ? "favored" : "as underdogs"} at ${p1}%: a ${s1.score} strength score against ${t2.name}'s ${s2.score}, ${s1.recentWinRate}% over their last ten, and ${meetings >= 3 ? `a ${t1w}-${meetings - t1w} edge across ${meetings} meetings` : `too few meetings (${meetings}) for the head-to-head record to count`}.${map ? ` On ${map} both sides have enough games for the map split to factor in.` : ""}`,
      accuracyWarning: meetings < 3 ? "Fewer than 3 direct meetings — the head-to-head record isn't factored into these odds." : null,
      disclaimer: DISCLAIMER,
    });
  });
  app.get("/api/predictions/team-map/:id", h.protect, (req, res) => {
    const game = gameOf(req);
    const t = findTeam(req.params.id, game);
    if (!t) return res.status(404).json({ error: "Team not found" });
    const map = String(req.query.map ?? "");
    const seed = hash(t.id + map);
    const gp = map.toLowerCase() === "vertigo" ? 0 : 6 + Math.floor(h.rand(seed) * 16);
    const wins = Math.round(gp * (0.4 + h.rand(seed + 1) * 0.4));
    const avgStats = {};
    for (const [k, [m, s]] of Object.entries({ kills: [68, 10], deaths: [62, 10], assists: [22, 6], plusMinus: [5, 8], acs: [214, 20], adr: [141, 15], headshots: [27, 6] })) {
      if (game === "League" && ["acs", "adr", "headshots"].includes(k)) continue;
      avgStats[k] = fmt(m + (h.rand(seed + hash(k)) - 0.5) * s);
    }
    res.json({
      team: t.name, game, map, gamesPlayed: gp, record: gp ? `${wins}-${gp - wins}` : "0-0", wins, losses: gp - wins,
      winRate: gp ? `${Math.round((wins / gp) * 100)}%` : null, winRateValue: gp ? Math.round((wins / gp) * 100) : null,
      avgStats: gp ? avgStats : null,
      message: gp ? null : `${t.name} haven't played ${map} in a tracked match yet.`,
      accuracyWarning: gp && gp < 8 ? `Only ${gp} games on ${map} — a small sample, so treat the split as directional.` : null,
      disclaimer: DISCLAIMER,
    });
  });
  // Live predictor family (premium): never blocks on history.
  const liveCommon = (req) => {
    const { matchId, playerId, stat = "kills" } = req.body ?? {};
    const p = findPlayer(playerId, req.body?.game ?? "VALORANT") ?? { id: String(playerId), name: "This player", game: "VALORANT", team: "—" };
    const games = series(h, p.id, p.game, stat, 10);
    const current = Math.round((BASE[p.game][stat]?.[0] ?? 10) * 0.55);
    const opponent = TEAMS[p.game][1][1];
    const vs = series(h, p.id + "vs", p.game, stat, 5);
    return { p, matchId, stat, games, current, opponent, vs };
  };
  app.post("/api/predictions/live-player", h.protect, premium, (req, res) => {
    const { p, matchId, stat, games, current, opponent, vs } = liveCommon(req);
    const { baseline, direction } = req.body ?? {};
    if (!matchId) return res.status(400).json({ error: "matchId is required" });
    const out = analyze(h, { game: p.game, targetType: "player", targetId: p.id, name: p.name, stat, baseline, direction, window: 10 });
    const low = h.rand(hash(p.id)) > 0.7;
    res.json({ ...out, last10Games: games, lowHistory: low, historyWarning: low ? `${p.name} has only 4 completed games on record — this is a live-pace read, not a history-backed one.` : null, liveCurrentValue: current, projection: { kind: "average", value: round1(out.last10Average * 1.05) }, opponentName: opponent, vsOpponentGames: vs, vsOpponentAverage: round1(avg(vs.map((g) => g.statValue))) });
  });
  app.post("/api/predictions/live-stat", h.protect, premium, (req, res) => {
    const { p, matchId, stat, games, current, opponent, vs } = liveCommon(req);
    if (!matchId) return res.status(400).json({ error: "matchId is required" });
    const out = analyze(h, { game: p.game, targetType: "player", targetId: p.id, name: p.name, stat, window: 10 });
    res.json({ ...out, last10Games: games, lowHistory: false, liveCurrentValue: current, projection: { kind: "total", value: round1(current * 1.8) }, opponentName: opponent, vsOpponentGames: [], vsOpponentSummary: `No prior meetings with ${opponent} on record`, summary: `${p.name} sits at ${current} ${label(stat)} so far this game, tracking toward ${round1(current * 1.8)} at this pace against a last-10 average of ${out.last10Average}.`, vsOpponentAverage: round1(avg(vs.map((g) => g.statValue))) });
  });
  app.post("/api/predictions/live-breakdown", h.protect, premium, (req, res) => {
    const { playerId, matchId } = req.body ?? {};
    const p = findPlayer(playerId, req.body?.game ?? "VALORANT");
    if (!matchId) return res.status(400).json({ error: "matchId is required" });
    res.json({ summary: `${p?.name ?? "This player"} is pacing above their usual output: on this map they average fewer kills by the half, and the opening-duel wins are carrying the team's economy.`, lowHistory: false, historyWarning: null, disclaimer: DISCLAIMER });
  });
  app.post("/api/predictions/live", h.protect, (req, res) => {
    const { matchId } = req.body ?? {};
    if (!matchId) return res.status(400).json({ error: "matchId is required" });
    res.json({ matchId, team1WinProbability: 58, team2WinProbability: 42, summary: "Momentum favors the side with the round lead and a full buy.", disclaimer: DISCLAIMER });
  });

  // ── Played-only prediction filters ──
  app.get("/api/players/:id/prediction-filters", h.protect, (req, res) => {
    const p = findPlayer(req.params.id, gameOf(req));
    const game = gameOf(req);
    res.json({
      maps: MAPS[game].map((name, i) => ({ name, games: 26 - i * 3 })),
      agents: AGENTS[game].map((name, i) => ({ name, games: 30 - i * 4 })),
      opponents: TEAMS[game].filter((t) => t[1] !== p?.team).map((t, i) => ({ name: t[1], games: 12 - i })),
    });
  });

  // ── Reports ──
  let reportSeq = 2;
  const reports = [makeReport(h, 1, h.isoAgo(9 * 864e5)), makeReport(h, 2, h.isoAgo(2 * 864e5))];
  reports[0].is_saved = true;
  const latest = () => reports[reports.length - 1];
  app.get("/api/reports/latest", h.protect, premium, (_req, res) => {
    const r = latest();
    const days = r ? Math.floor((Date.now() - new Date(r.generated_at).getTime()) / 864e5) : null;
    const can = !r || days >= 7 || process.env.MOCK_REPORT_ALWAYS === "1";
    res.json({ report: r ?? null, is_stale: can, can_generate: can, days_since: days, days_until_next: Math.max(0, 7 - (days ?? 0)) });
  });
  app.get("/api/reports/saved", h.protect, (_req, res) => res.json(reports.filter((r) => r.is_saved).slice().reverse().map(({ is_saved: _s, ...r }) => r)));
  app.get("/api/reports", h.protect, premium, (_req, res) => res.json(reports.slice().reverse()));
  app.post("/api/reports/generate", h.protect, premium, (_req, res) => {
    const r = latest();
    const days = r ? (Date.now() - new Date(r.generated_at).getTime()) / 864e5 : 99;
    if (days < 7 && process.env.MOCK_REPORT_ALWAYS !== "1" && reports.length > 2) return res.status(429).json({ error: "A new report isn't available yet" });
    setTimeout(() => {
      const fresh = makeReport(h, ++reportSeq, new Date().toISOString());
      // Unsaved reports roll over; saved ones persist.
      for (let i = reports.length - 1; i >= 0; i--) if (!reports[i].is_saved) reports.splice(i, 1);
      reports.push(fresh);
      res.json({ report: fresh });
    }, 1500);
  });
  app.post("/api/reports/:id/save", h.protect, (req, res) => { const r = reports.find((x) => x.id === req.params.id); if (!r) return res.status(404).json({ error: "Report not found" }); r.is_saved = true; res.json({ message: "Report saved" }); });
  app.post("/api/reports/:id/unsave", h.protect, (req, res) => { const r = reports.find((x) => x.id === req.params.id); if (!r) return res.status(404).json({ error: "Report not found" }); r.is_saved = false; res.json({ message: "Report unsaved" }); });
  app.delete("/api/reports/:id", h.protect, (req, res) => { const i = reports.findIndex((x) => x.id === req.params.id); if (i < 0) return res.status(404).json({ error: "Report not found" }); reports.splice(i, 1); res.json({ message: "Report deleted" }); });

  // ── Payments (Stripe hosted checkout + portal) ──
  app.get("/api/payments/status", h.protect, (_req, res) => res.json({
    isPremium: !!h.me.is_premium, status: h.me.is_premium ? "active" : "inactive", currentPeriodEnd: h.me.is_premium ? h.isoIn(23 * 864e5) : null,
    provider: h.me.is_premium ? "stripe" : null, productId: h.me.is_premium ? "price_premium_monthly" : null, environment: null,
    autoRenew: h.me.is_premium ? true : null, graceUntil: null, cancelledAt: null, hasStripeAccount: !!h.me.is_premium,
  }));
  app.post("/api/payments/checkout", h.protect, (req, res) => {
    if (h.me.is_premium && process.env.MOCK_ALLOW_CHECKOUT !== "1") return res.status(400).json({ error: "You are already a premium subscriber" });
    const mode = String(req.body?.mode ?? "hosted").toLowerCase();
    const sessionId = `cs_test_mock_${Date.now()}`;
    if (mode === "embedded") return res.json({ clientSecret: `${sessionId}_secret`, sessionId, publishableKey: "pk_test_mock", mode: "embedded" });
    res.json({ checkoutUrl: `https://checkout.stripe.com/c/pay/${sessionId}?plan=${encodeURIComponent(req.body?.plan ?? "monthly")}`, sessionId, mode: "hosted" });
  });
  app.post("/api/payments/portal", h.protect, (_req, res) => (h.me.is_premium ? res.json({ portalUrl: "https://billing.stripe.com/p/session/test_mock" }) : res.status(404).json({ error: "No subscription found" })));

  // ── Players / teams: only when agent B's module isn't there ──
  if (!existsSync(join(__dirname, "players-teams.mjs"))) {
    const playerRow = (p) => ({ id: p.id, name: p.name, team_name: p.team, role: p.role, game: p.game, rating: round1(1 + h.rand(hash(p.id)) * 0.5), image_url: null, career_stats: null });
    const teamRow = (t) => ({ id: t.id, name: t.name, abbreviation: t.name.slice(0, 3).toUpperCase(), game: t.game, region: t.region, tier: 1, wins: 20 + (hash(t.id) % 10), losses: 6 + (hash(t.id) % 6), win_rate: 0.7, logo_url: null, rating: null, ranking: null });
    app.get("/api/players/top", h.protect, (req, res) => res.json((PLAYERS[gameOf(req)] ?? []).map(([id, name, team, role]) => playerRow({ id, name, team, role, game: gameOf(req) }))));
    app.get("/api/players/search", h.protect, (req, res) => {
      const q = String(req.query.q ?? "").toLowerCase();
      res.json(allPlayers().filter((p) => p.game === gameOf(req) && p.name.toLowerCase().includes(q)).map(playerRow));
    });
    app.get("/api/teams", h.protect, (req, res) => res.json(allTeams().filter((t) => t.game === gameOf(req)).map(teamRow)));
  }
}

// Reused by other mock modules that want the same ids (optional).
export const fixtures = { TEAMS, PLAYERS, MAPS, AGENTS };

// _tournaments-data.mjs — the simulated tournaments (backend
// services/tournamentSimService.js + seriesOddsService.js), shared by every
// mock module that needs them. No register(): server.mjs skips modules
// without one; the routes live in tournaments.mjs.
//
// Exports (keep the names stable — other mock modules import them):
//   tournamentList()              every tournament (raw `tournaments` rows)
//   currentForGame(game)          GET /tournaments/sim/current body, or null
//   completedForGame(game)        GET /tournaments/completed rows (newest first)
//   bracketFor(tournamentId)      GET /tournaments/:id/bracket body, or null
//   tournamentOddsFor(id)         GET /tournaments/:id/odds body, or null
//   seriesDetail(seriesId)        GET /tournaments/series/:id body, or null
//   seriesOdds(seriesId)          GET /tournaments/series/:id/odds body, or null
//   tournamentMatchRows()         every game as a raw `matches` row (series
//                                 stamped like withSeries) — _matches-data
//                                 appends them, so /matches/live, /upcoming,
//                                 /completed and /matches/:id serve them
//   honorsFor(teamId)             GET /teams/:id → honors
//
// What is in it (times relative to now, deterministic otherwise):
//   Insight VALORANT Cup 3  live: QFs done, Semifinal 1 game 3 live (decider)
//   Insight CS2 Cup 2       live: Quarterfinal 1 game 2 live (Spirit lead 1–0)
//   Insight LoL Cup 1       live: nothing on, Quarterfinal 1 next (in 12 min)
//   Insight VALORANT Cup 2  completed ~6 h ago, champion Fnatic
//   Insight CS2 Cup 1       completed ~5 h ago, champion Team Spirit
// Ids: tournaments 5e1a0000-0000-4000-a000-000000<key>00, series
// 5e1a5e21-<key>-4000-a000-0000000000<round><position>, games
// m-t-<key>-<round><position>-g<n> (key: a103 c202 1e01 a102 c201).
// Team ids are players-teams.mjs's, so crests link to real team pages.

const rand = (seed) => { const x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x); };
const MIN = 60e3;
const GAME_MIN = { VALORANT: 32, CS2: 32, League: 37 };
const perGame = (game) => (GAME_MIN[game] + 4) * MIN;
const SERIES_GAP = 10 * MIN;
const needOf = (bestOf) => Math.floor(Number(bestOf) / 2) + 1;
const ROUND_NAMES = ["Quarterfinal", "Semifinal", "Final"];
const LABEL = { VALORANT: "VALORANT", CS2: "CS2", League: "LoL" };
const FORMAT = { VALORANT: [3, 3, 5], CS2: [3, 3, 5], League: [5, 5, 5] };
const MAP_POOL = { VALORANT: ["Ascent", "Bind", "Haven", "Lotus", "Sunset", "Icebox", "Split"], CS2: ["Mirage", "Inferno", "Nuke", "Ancient", "Anubis", "Dust2", "Vertigo"], League: [null] };
const SEED_ORDER = [1, 8, 4, 5, 2, 7, 3, 6];
const GAME_ORDER = ["VALORANT", "CS2", "League"];

const team = (id, name, color, rating) => ({ id, name, color, logo_url: null, rating });
export const TOURNAMENT_TEAMS = {
  VALORANT: {
    sen: team("team-sentinels", "Sentinels", "#C8102E", 1640),
    fnc: team("team-fnatic", "Fnatic", "#FF5900", 1665),
    prx: team("team-paper-rex", "Paper Rex", "#C72C41", 1610),
    g2: team("team-g2-esports", "G2 Esports", "#D11A2A", 1605),
    loud: team("team-loud", "LOUD", "#19E65C", 1590),
    th: team("team-team-heretics", "Team Heretics", "#2E2E2E", 1585),
    gen: team("team-gen-g", "Gen.G", "#AA8B56", 1570),
    drx: team("team-drx", "DRX", "#1E5BFF", 1540),
  },
  CS2: {
    spirit: team("team-team-spirit", "Team Spirit", "#1F1F1F", 1655),
    mouz: team("team-mouz", "MOUZ", "#D7001E", 1665),
    vit: team("team-team-vitality", "Team Vitality", "#F7E700", 1660),
    navi: team("team-natus-vincere", "Natus Vincere", "#F5C518", 1625),
    mgz: team("team-the-mongolz", "The MongolZ", "#003DA5", 1615),
    g2: team("team-g2-esports-cs2", "G2 Esports", "#D11A2A", 1630),
    faze: team("team-faze-clan", "FaZe Clan", "#E43D30", 1600),
    furia: team("team-furia-cs2", "FURIA", "#111111", 1590),
  },
  League: {
    gen: team("team-gen-g-league", "Gen.G", "#AA8B56", 1700),
    t1: team("team-t1-league", "T1", "#E2012D", 1690),
    hle: team("team-hanwha-life-esports", "Hanwha Life Esports", "#F47920", 1660),
    blg: team("team-bilibili-gaming", "Bilibili Gaming", "#00A1D6", 1650),
    jdg: team("team-jd-gaming", "JD Gaming", "#D4121B", 1620),
    tes: team("team-top-esports", "Top Esports", "#FF4500", 1615),
    g2: team("team-g2-esports-league", "G2 Esports", "#D11A2A", 1580),
    fnc: team("team-fnatic-league", "Fnatic", "#FF5900", 1560),
  },
};

// played: "round.position" → each finished game's winner side ("1" | "2"),
// in order. live: the game in progress after them, [team1 score, team2 score].
// anchor: liveAgoMin (the live game started that long ago), nextInMin (the
// next game starts in), endAgoMin (the final ended that long ago).
const SPECS = [
  { key: "a103", game: "VALORANT", edition: 3, status: "live", seeds: ["sen", "fnc", "prx", "g2", "loud", "th", "gen", "drx"],
    played: { "1.1": "11", "1.2": "212", "1.3": "121", "1.4": "22", "2.1": "21" }, live: { "2.1": [8, 6] }, anchor: { liveAgoMin: 17 } },
  { key: "c202", game: "CS2", edition: 2, status: "live", seeds: ["spirit", "mouz", "vit", "navi", "mgz", "g2", "faze", "furia"],
    played: { "1.1": "1" }, live: { "1.1": [5, 3] }, anchor: { liveAgoMin: 11 } },
  { key: "1e01", game: "League", edition: 1, status: "live", seeds: ["gen", "t1", "hle", "blg", "jdg", "tes", "g2", "fnc"],
    played: {}, live: {}, anchor: { nextInMin: 12 } },
  { key: "a102", game: "VALORANT", edition: 2, status: "completed", seeds: ["sen", "fnc", "g2", "prx", "loud", "gen", "th", "drx"],
    played: { "1.1": "11", "1.2": "121", "1.3": "11", "1.4": "212", "2.1": "212", "2.2": "11", "3.1": "2122" }, live: {}, anchor: { endAgoMin: 6 * 60 + 10 } },
  { key: "c201", game: "CS2", edition: 1, status: "completed", seeds: ["vit", "spirit", "furia", "mouz", "navi", "faze", "g2", "mgz"],
    played: { "1.1": "11", "1.2": "212", "1.3": "121", "1.4": "11", "2.1": "121", "2.2": "121", "3.1": "21212" }, live: {}, anchor: { endAgoMin: 5 * 60 + 20 } },
];

const tournamentId = (key) => `5e1a0000-0000-4000-a000-000000${key}00`;
const seriesId = (key, round, position) => `5e1a5e21-${key}-4000-a000-0000000000${round}${position}`;
const matchId = (key, round, position, n) => `m-t-${key}-${round}${position}-g${n}`;
const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());

// ── Odds (seriesOddsService.js, same model; ratings stand in for strength) ──
const BOUNCE_BACK = 0.04;
const BACKS_TO_WALL = 0.06;
const clamp = (p) => Math.min(0.95, Math.max(0.05, p));
const pct = (p) => Math.round(p * 1000) / 10;
const ratingOf = (id) => {
  for (const g of GAME_ORDER) for (const t of Object.values(TOURNAMENT_TEAMS[g])) if (t.id === id) return t.rating;
  return 1600;
};
const baseGameProb = (a, b) => clamp(1 / (1 + 10 ** ((ratingOf(b) - ratingOf(a)) / 400)));
const gameProbAtState = (base, bestOf, w1, w2, lastWinner) => {
  const need = needOf(bestOf);
  let p = base;
  const notes = [];
  if (lastWinner === 1) { p -= BOUNCE_BACK; notes.push({ effect: "bounce_back", team: 2, points: BOUNCE_BACK * 100 }); }
  if (lastWinner === 2) { p += BOUNCE_BACK; notes.push({ effect: "bounce_back", team: 1, points: BOUNCE_BACK * 100 }); }
  if (need >= 3) {
    if (w2 === need - 1 && w1 === 0) { p += BACKS_TO_WALL; notes.push({ effect: "backs_to_the_wall", team: 1, points: BACKS_TO_WALL * 100 }); }
    if (w1 === need - 1 && w2 === 0) { p -= BACKS_TO_WALL; notes.push({ effect: "backs_to_the_wall", team: 2, points: BACKS_TO_WALL * 100 }); }
  }
  return { p: clamp(p), notes };
};
const seriesWalk = (base, bestOf, w1, w2, lastWinner, firstGameP = null) => {
  const need = needOf(bestOf);
  const finals = new Map();
  const games = new Map();
  let frontier = new Map([[`${w1}-${w2}-${lastWinner || 0}`, 1]]);
  let first = true;
  while (frontier.size) {
    const next = new Map();
    for (const [key, mass] of frontier) {
      const [a, b, last] = key.split("-").map(Number);
      if (a >= need || b >= need) { finals.set(`${a}-${b}`, (finals.get(`${a}-${b}`) || 0) + mass); continue; }
      const p = first && firstGameP !== null ? firstGameP : gameProbAtState(base, bestOf, a, b, last || null).p;
      const n = a + b + 1;
      const g = games.get(n) || { played: 0, t1: 0 };
      g.played += mass; g.t1 += mass * p;
      games.set(n, g);
      const k1 = `${a + 1}-${b}-1`, k2 = `${a}-${b + 1}-2`;
      next.set(k1, (next.get(k1) || 0) + mass * p);
      next.set(k2, (next.get(k2) || 0) + mass * (1 - p));
    }
    frontier = next;
    first = false;
  }
  let t1 = 0;
  for (const [score, prob] of finals) { const [a] = score.split("-").map(Number); if (a >= need) t1 += prob; }
  return { team1: t1, finals, games };
};
const sideNotes = (notes) => notes.map((n) => ({ effect: n.effect, team: n.team === 1 ? "team1" : "team2", points: Math.round(n.points * 10) / 10 }));
// The live game's team1 chance from its score (stands in for the live model).
const liveGameP = (base, game, s1, s2) => clamp(base + (Number(s1) - Number(s2)) * (game === "League" ? 0.012 : 0.035));

// ── Building one tournament ─────────────────────────────────────────────────
function build(spec, now) {
  const { key, game } = spec;
  const P = perGame(game);
  const bestOf = FORMAT[game];
  const seeds = spec.seeds.map((k) => TOURNAMENT_TEAMS[game][k]);
  const tid = tournamentId(key);
  const name = `Insight ${LABEL[game]} Cup ${spec.edition}`;

  // Skeleton: round 1 seeded 1v8 4v5 2v7 3v6; winners fill the next round.
  const series = [];
  for (let r = 1; r <= 3; r++) {
    for (let p = 1; p <= 2 ** (3 - r); p++) {
      series.push({
        id: seriesId(key, r, p), tournament_id: tid, round: r, round_name: ROUND_NAMES[r - 1], position: p, best_of: bestOf[r - 1],
        next_series_id: r < 3 ? seriesId(key, r + 1, Math.ceil(p / 2)) : null, next_slot: r < 3 ? ((p - 1) % 2) + 1 : null,
        team1: null, team2: null, team1_seed: null, team2_seed: null,
      });
    }
  }
  const find = (r, p) => series.find((s) => s.round === r && s.position === p);
  for (let i = 0; i < 4; i++) {
    const s = find(1, i + 1);
    const a = SEED_ORDER[i * 2], b = SEED_ORDER[i * 2 + 1];
    s.team1 = seeds[a - 1]; s.team1_seed = a;
    s.team2 = seeds[b - 1]; s.team2_seed = b;
  }

  // Games + timeline (ms relative to the first series' start, shifted below).
  let cursor = 0;
  let firstSeries = true;
  let refT = null;
  let lastEnd = 0;
  for (const s of series) {
    const k = `${s.round}.${s.position}`;
    const need = needOf(s.best_of);
    if (s.team1 && s.team2) {
      const start = firstSeries ? cursor : cursor + SERIES_GAP;
      firstSeries = false;
      const outcomes = (spec.played[k] || "").split("").filter(Boolean);
      const live = spec.live[k] || null;
      let w1 = 0, w2 = 0, last = null;
      s.games = [];
      for (let i = 0; i < s.best_of; i++) {
        const n = i + 1;
        const at = start + i * P;
        const decided = w1 >= need || w2 >= need;
        const seed = [...`${key}${k}${n}`].reduce((x, c) => x + c.charCodeAt(0), 0);
        const g = {
          number: n, match_id: matchId(key, s.round, s.position, n), status: "upcoming", if_necessary: n > need,
          team1_id: s.team1.id, team2_id: s.team2.id, winner_id: null, team1_score: null, team2_score: null,
          map_name: null, at, completed: null, maps: null,
        };
        if (i < outcomes.length) {
          const t1won = outcomes[i] === "1";
          const lose = game === "League" ? 6 + Math.floor(rand(seed) * 9) : 4 + Math.floor(rand(seed) * 8);
          const winS = game === "League" ? lose + 5 + Math.floor(rand(seed + 1) * 9) : 13;
          g.status = "completed";
          g.winner_id = t1won ? s.team1.id : s.team2.id;
          g.team1_score = t1won ? winS : lose;
          g.team2_score = t1won ? lose : winS;
          g.map_name = MAP_POOL[game][Math.floor(rand(seed + 2) * MAP_POOL[game].length)];
          g.completed = at + GAME_MIN[game] * MIN;
          if (t1won) { w1++; last = 1; } else { w2++; last = 2; }
          g.maps = [w1, w2];
          lastEnd = Math.max(lastEnd, g.completed);
        } else if (decided) {
          g.status = "cancelled";
        } else if (i === outcomes.length && live) {
          g.status = "live";
          g.team1_score = live[0]; g.team2_score = live[1];
          g.map_name = MAP_POOL[game][Math.floor(rand(seed + 2) * MAP_POOL[game].length)];
          if (spec.anchor.liveAgoMin != null) refT = at + spec.anchor.liveAgoMin * MIN;
        } else if (i === outcomes.length && spec.anchor.nextInMin != null && refT == null) {
          refT = at - spec.anchor.nextInMin * MIN;
        }
        s.games.push(g);
      }
      s.team1_wins = w1; s.team2_wins = w2; s.last = last;
      const decided = w1 >= need || w2 >= need;
      s.status = decided ? "completed" : (live || w1 + w2 > 0 ? "live" : "upcoming");
      s.winner = decided ? (w1 >= need ? s.team1 : s.team2) : null;
      s.winner_seed = decided ? (w1 >= need ? s.team1_seed : s.team2_seed) : null;
      s.loser = decided ? (w1 >= need ? s.team2 : s.team1) : null;
      s.loser_seed = decided ? (w1 >= need ? s.team2_seed : s.team1_seed) : null;
      s.scheduled = start;
      s.started = outcomes.length || live ? start : null;
      s.completedAt = decided ? s.games.filter((g) => g.status === "completed").at(-1).completed : null;
      cursor = decided ? start + outcomes.length * P : start + s.best_of * P;
      if (s.winner && s.next_series_id) {
        const nx = series.find((x) => x.id === s.next_series_id);
        if (s.next_slot === 1) { nx.team1 = s.winner; nx.team1_seed = s.winner_seed; } else { nx.team2 = s.winner; nx.team2_seed = s.winner_seed; }
      }
    } else {
      const start = cursor + SERIES_GAP;
      s.games = Array.from({ length: s.best_of }, (_, i) => ({
        number: i + 1, match_id: null, status: "tbd", if_necessary: i + 1 > needOf(s.best_of), team1_id: null, team2_id: null, winner_id: null,
        team1_score: null, team2_score: null, map_name: null, at: start + i * P, completed: null, maps: null,
      }));
      s.team1_wins = 0; s.team2_wins = 0; s.last = null; s.status = "upcoming"; s.winner = null; s.loser = null;
      s.scheduled = start; s.started = null; s.completedAt = null;
      cursor = start + s.best_of * P;
    }
  }
  if (spec.anchor.endAgoMin != null) refT = lastEnd + spec.anchor.endAgoMin * MIN;
  const shift = now - (refT ?? 0);
  const abs = (t) => (t == null ? null : t + shift);

  const final = series.find((s) => s.round === 3);
  const champion = spec.status === "completed" && final.winner ? final.winner : null;
  const tournament = {
    id: tid, name, game, tier: 1, status: spec.status, is_sim: true, edition: spec.edition,
    league_name: "Insight Cup", serie_name: `Cup ${spec.edition}`,
    format: { teams: 8, rounds: ROUND_NAMES.map((rn, i) => ({ round: i + 1, name: rn, best_of: bestOf[i] })) },
    start_date: iso(abs(0)), end_date: spec.status === "completed" ? iso(abs(lastEnd)) : null,
    winner_id: champion ? champion.id : null, created_at: iso(abs(0) - 60e3),
  };
  return { spec, tournament, series, abs, champion };
}

let memo = { at: 0, list: null };
function built() {
  // Rebuilt at most every 20 s so "now"-relative times stay put between polls.
  const now = Date.now();
  if (memo.list && now - memo.at < 20e3) return memo.list;
  memo = { at: now, list: SPECS.map((s) => build(s, now)) };
  return memo.list;
}
const byTournament = (id) => built().find((b) => b.tournament.id === id) ?? null;
const bySeries = (id) => {
  for (const b of built()) { const s = b.series.find((x) => x.id === id); if (s) return { b, s }; }
  return null;
};

// ── Shapes (tournamentSimService.shapeSeries / bracket) ────────────────────
const teamRef = (t, seed) => (t ? { id: t.id, name: t.name, logo_url: t.logo_url, seed } : null);
function shapeSeries(b, s) {
  return {
    id: s.id, tournament_id: s.tournament_id, round: s.round, round_name: s.round_name, position: s.position, best_of: s.best_of,
    status: s.status,
    team1: teamRef(s.team1, s.team1_seed), team2: teamRef(s.team2, s.team2_seed),
    team1_wins: s.team1_wins, team2_wins: s.team2_wins,
    winner_id: s.winner ? s.winner.id : null, winner_name: s.winner ? s.winner.name : null,
    next_series_id: s.next_series_id,
    scheduled_at: iso(b.abs(s.scheduled)), started_at: iso(b.abs(s.started)), completed_at: iso(b.abs(s.completedAt)),
    games: s.games.map((g) => ({
      number: g.number, match_id: g.match_id, status: g.status, if_necessary: g.if_necessary,
      team1_id: g.team1_id, team2_id: g.team2_id, winner_id: g.winner_id,
      team1_score: g.team1_score, team2_score: g.team2_score, map_name: g.map_name,
      scheduled_at: iso(b.abs(g.at)), completed_at: iso(b.abs(g.completed)),
    })),
  };
}

function seriesOddsOf(b, s) {
  const head = {
    series_id: s.id, tournament_id: s.tournament_id, round: s.round, round_name: s.round_name, best_of: s.best_of,
    status: s.status, team1_wins: s.team1_wins, team2_wins: s.team2_wins,
    team1: s.team1 ? { id: s.team1.id, name: s.team1.name, logo_url: s.team1.logo_url } : null,
    team2: s.team2 ? { id: s.team2.id, name: s.team2.name, logo_url: s.team2.logo_url } : null,
  };
  if (!s.team1 || !s.team2) return { ...head, available: false, reason: "Both teams are not known yet" };
  const need = needOf(s.best_of);
  const base = baseGameProb(s.team1.id, s.team2.id);
  const w1 = s.team1_wins, w2 = s.team2_wins;
  if (w1 >= need || w2 >= need) {
    const t1 = w1 >= need ? 1 : 0;
    return {
      ...head, available: true, decided: true, team1_series: pct(t1), team2_series: pct(1 - t1),
      scores: [{ score: `${w1}-${w2}`, winner: t1 ? "team1" : "team2", team1_wins: w1, team2_wins: w2, probability: 100 }],
      next_game: null, games: [], base_game: { team1: pct(base), team2: pct(1 - base) },
    };
  }
  const liveGame = s.games.find((g) => g.status === "live") || null;
  const liveP = liveGame ? liveGameP(gameProbAtState(base, s.best_of, w1, w2, s.last).p, b.spec.game, liveGame.team1_score, liveGame.team2_score) : null;
  const walk = seriesWalk(base, s.best_of, w1, w2, s.last, liveP);
  const nextState = gameProbAtState(base, s.best_of, w1, w2, s.last);
  const scores = [...walk.finals.entries()]
    .map(([score, prob]) => {
      const [a, c] = score.split("-").map(Number);
      return { score: a >= need ? `${a}-${c}` : `${c}-${a}`, winner: a >= need ? "team1" : "team2", team1_wins: a, team2_wins: c, probability: pct(prob) };
    })
    .sort((x, y) => (x.winner === y.winner ? (x.winner === "team1" ? x.team2_wins - y.team2_wins : x.team1_wins - y.team1_wins) : (x.winner === "team1" ? -1 : 1)));
  const done = s.games.filter((g) => g.status === "completed").map((g) => ({
    number: g.number, status: "completed", match_id: g.match_id, winner: g.winner_id === s.team1.id ? "team1" : "team2",
    played: 100, team1_if_played: null, team2_if_played: null, if_necessary: g.number > need,
  }));
  const ahead = [...walk.games.entries()].sort((x, y) => x[0] - y[0]).map(([n, g]) => {
    const row = s.games.find((r) => r.number === n && r.status !== "completed");
    return {
      number: n, status: row ? row.status : "tbd", match_id: row ? row.match_id : null, winner: null,
      played: pct(g.played), team1_if_played: g.played > 0 ? pct(g.t1 / g.played) : null, team2_if_played: g.played > 0 ? pct(1 - g.t1 / g.played) : null,
      if_necessary: n > need,
    };
  });
  const nextNumber = w1 + w2 + 1;
  const nextRow = s.games.find((r) => r.status === "upcoming" && r.number === nextNumber);
  return {
    ...head, available: true, decided: false,
    team1_series: pct(walk.team1), team2_series: pct(1 - walk.team1),
    scores,
    next_game: {
      number: nextNumber, live: !!liveGame, match_id: liveGame ? liveGame.match_id : nextRow ? nextRow.match_id : null,
      team1: pct(liveP !== null ? liveP : nextState.p), team2: pct(1 - (liveP !== null ? liveP : nextState.p)),
      pre_game_team1: pct(nextState.p), adjustments: sideNotes(nextState.notes),
    },
    games: [...done, ...ahead],
    base_game: { team1: pct(base), team2: pct(1 - base) },
  };
}

function tournamentOddsOf(b) {
  const rounds = 3;
  const teams = new Map();
  for (const s of b.series.filter((x) => x.round === 1)) {
    teams.set(s.team1.id, { t: s.team1, seed: s.team1_seed, reach: {}, win: {} });
    teams.set(s.team2.id, { t: s.team2, seed: s.team2_seed, reach: {}, win: {} });
  }
  const winnerDist = new Map();
  const feeders = new Map();
  for (const s of b.series) if (s.next_series_id) { const f = feeders.get(s.next_series_id) || {}; f[s.next_slot] = s.id; feeders.set(s.next_series_id, f); }
  const bySeriesOdds = {};
  for (let r = 1; r <= rounds; r++) {
    for (const s of b.series.filter((x) => x.round === r)) {
      const f = feeders.get(s.id) || {};
      const slot = (n) => {
        const known = n === 1 ? s.team1 : s.team2;
        if (known) return new Map([[known.id, 1]]);
        return f[n] ? (winnerDist.get(f[n]) || new Map()) : new Map();
      };
      const d1 = slot(1), d2 = slot(2);
      const win = new Map();
      if (s.status === "completed" && s.winner) {
        win.set(s.winner.id, 1);
      } else if (s.team1 && s.team2) {
        const o = seriesOddsOf(b, s);
        const p1 = o.available ? o.team1_series / 100 : 0.5;
        win.set(s.team1.id, p1); win.set(s.team2.id, 1 - p1);
        bySeriesOdds[s.id] = { team1: pct(p1), team2: pct(1 - p1) };
      } else {
        for (const [a, pa] of d1) for (const [c, pc] of d2) {
          const p = seriesWalk(baseGameProb(a, c), s.best_of, 0, 0, null).team1;
          win.set(a, (win.get(a) || 0) + pa * pc * p);
          win.set(c, (win.get(c) || 0) + pa * pc * (1 - p));
        }
        if (!d2.size) for (const [a, pa] of d1) win.set(a, (win.get(a) || 0) + pa);
        if (!d1.size) for (const [c, pc] of d2) win.set(c, (win.get(c) || 0) + pc);
      }
      winnerDist.set(s.id, win);
      for (const [id, p] of [...d1, ...d2]) { const x = teams.get(id); if (x) x.reach[r] = (x.reach[r] || 0) + p; }
      for (const [id, p] of win) { const x = teams.get(id); if (x) x.win[r] = (x.win[r] || 0) + p; }
    }
  }
  const out = [...teams.values()].map((x) => ({
    team: { id: x.t.id, name: x.t.name, logo_url: x.t.logo_url, seed: x.seed },
    champion: pct(x.win[rounds] || 0),
    rounds: Array.from({ length: rounds }, (_, i) => ({ round: i + 1, name: ROUND_NAMES[i], reach: pct(x.reach[i + 1] || 0), win: pct(x.win[i + 1] || 0) })),
    eliminated: false,
  })).sort((p, q) => q.champion - p.champion || (p.team.seed || 99) - (q.team.seed || 99));
  for (const row of out) row.eliminated = row.champion === 0;
  return { tournament: { id: b.tournament.id, name: b.tournament.name, game: b.tournament.game, status: b.tournament.status }, teams: out, series: bySeriesOdds };
}

// ── Public ──────────────────────────────────────────────────────────────────
export function tournamentList() { return built().map((b) => b.tournament); }

export function bracketFor(id) {
  const b = byTournament(String(id));
  if (!b) return null;
  const odds = tournamentOddsOf(b);
  const rounds = [];
  for (const s of b.series) {
    let r = rounds.find((x) => x.round === s.round);
    if (!r) { r = { round: s.round, name: s.round_name, best_of: s.best_of, series: [] }; rounds.push(r); }
    r.series.push({ ...shapeSeries(b, s), odds: odds.series[s.id] || null });
  }
  const current = b.series.find((s) => s.status === "live") || b.series.find((s) => s.status !== "completed" && s.team1 && s.team2) || null;
  const t = b.tournament;
  return {
    tournament: {
      id: t.id, name: t.name, game: t.game, status: t.status, is_sim: true, edition: t.edition, teams: 8,
      start_date: t.start_date, end_date: t.end_date,
      champion: b.champion ? { id: b.champion.id, name: b.champion.name, logo_url: b.champion.logo_url } : null,
    },
    rounds,
    current_series_id: current ? current.id : null,
    odds: { teams: odds.teams },
  };
}

export function currentForGame(game) {
  const list = built().filter((b) => b.tournament.game === game);
  const active = list.find((b) => b.tournament.status === "live" || b.tournament.status === "upcoming");
  if (active) return bracketFor(active.tournament.id);
  const last = list.filter((b) => b.tournament.status === "completed").sort((a, c) => (a.tournament.end_date < c.tournament.end_date ? 1 : -1))[0];
  return last ? bracketFor(last.tournament.id) : null;
}

export function completedForGame(game) {
  return built().filter((b) => b.tournament.game === game && b.tournament.status === "completed")
    .map((b) => b.tournament)
    .sort((a, c) => (a.start_date < c.start_date ? 1 : -1));
}

export function tournamentOddsFor(id) {
  const b = byTournament(String(id));
  if (!b) return null;
  return { ...tournamentOddsOf(b), disclaimer: "For entertainment purposes only. This is not financial advice." };
}

export function seriesDetail(id) {
  const hit = bySeries(String(id));
  if (!hit) return null;
  const t = hit.b.tournament;
  return { tournament: { id: t.id, name: t.name, game: t.game, status: t.status }, series: shapeSeries(hit.b, hit.s) };
}

export function seriesOdds(id) {
  const hit = bySeries(String(id));
  if (!hit) return null;
  return { ...seriesOddsOf(hit.b, hit.s), disclaimer: "For entertainment purposes only. This is not financial advice." };
}

/** Every game with a match row, shaped like the backend's matches rows. */
export function tournamentMatchRows() {
  const out = [];
  for (const b of built()) {
    const t = b.tournament;
    for (const s of b.series) {
      if (!s.team1 || !s.team2) continue;
      const odds = s.status !== "completed" ? seriesOddsOf(b, s) : null;
      for (const g of s.games) {
        if (!g.match_id) continue;
        const go = odds && odds.games ? odds.games.find((x) => x.number === g.number) : null;
        const p1 = go && go.team1_if_played != null && g.status === "upcoming" ? Math.round(go.team1_if_played) : null;
        const seriesScore = g.maps ?? [s.team1_wins, s.team2_wins];
        const at = b.abs(g.at);
        out.push({
          id: g.match_id, game: t.game, status: g.status,
          team1_id: s.team1.id, team1_name: s.team1.name, team1_logo_url: s.team1.logo_url, team1_color: s.team1.color,
          team2_id: s.team2.id, team2_name: s.team2.name, team2_logo_url: s.team2.logo_url, team2_color: s.team2.color,
          tournament_id: t.id, tournament_name: t.name, stage: s.round_name, best_of: 1,
          map_name: g.map_name ?? (t.game === "League" ? null : MAP_POOL[t.game][g.number % MAP_POOL[t.game].length]),
          scheduled_at: iso(at), start_time: iso(at), completed_at: iso(b.abs(g.completed)),
          team1_score: g.team1_score ?? (g.status === "upcoming" ? 0 : null), team2_score: g.team2_score ?? (g.status === "upcoming" ? 0 : null),
          round_number: g.status === "live" && t.game !== "League" ? Number(g.team1_score) + Number(g.team2_score) + 1 : null,
          viewer_count: g.status === "live" ? 3200 + Math.floor(rand(g.number + s.round * 7) * 9000) : null,
          winner_id: g.winner_id,
          team1_win_prob: p1, team2_win_prob: p1 == null ? null : 100 - p1,
          team1_map_score: seriesScore[0], team2_map_score: seriesScore[1],
          streams: null,
          series_id: s.id, series_game_number: g.number,
          series: {
            id: s.id, tournament_id: t.id, tournament_name: t.name, round: s.round, round_name: s.round_name, position: s.position, best_of: s.best_of,
            game_number: g.number, if_necessary: g.number > needOf(s.best_of),
            team1_wins: s.team1_wins, team2_wins: s.team2_wins, status: s.status, winner_id: s.winner ? s.winner.id : null,
          },
        });
      }
    }
  }
  return out;
}

const PLACEMENT = { 1: "quarterfinalist", 2: "semifinalist", 3: "runner_up" };
/** GET /teams/:id → honors (titles, finals, semifinals, recent placements). */
export function honorsFor(teamId) {
  const rows = [];
  for (const b of built()) {
    for (const s of b.series) {
      if (!s.loser) continue;
      if (s.loser.id === teamId) rows.push({ b, placement: PLACEMENT[s.round], seed: s.loser_seed, at: b.abs(s.completedAt) });
      if (s.round === 3 && s.winner.id === teamId) rows.push({ b, placement: "champion", seed: s.winner_seed, at: b.abs(s.completedAt) });
    }
  }
  rows.sort((a, c) => c.at - a.at);
  const titles = rows.filter((x) => x.placement === "champion").length;
  const finals = rows.filter((x) => x.placement === "champion" || x.placement === "runner_up").length;
  const semifinals = finals + rows.filter((x) => x.placement === "semifinalist").length;
  return {
    titles, finals, semifinals, tournaments: rows.length,
    recent: rows.slice(0, 5).map((x) => ({ tournament_id: x.b.tournament.id, tournament: x.b.tournament.name, placement: x.placement, seed: x.seed, completed_at: iso(x.at) })),
  };
}

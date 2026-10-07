// _matches-data.mjs — ONE deterministic match universe shared by every
// mock route that serves matches (lists here, /api/matches/:id in the
// detail module). No register(): server.mjs skips modules without one.
//
//   allMatches()   → every raw match row (live + upcoming + completed),
//                    snake_case exactly like the Express backend.
//   findMatch(id)  → one row or null.
//
// Ids are stable ("m-live-1", "m-up-3", "m-done-12"); times are relative
// to "now" so Today / Live states always show. Keep the export names and
// the id patterns stable — other mock modules depend on them.

// Deterministic pseudo-random in [0,1) (same formula as server.mjs).
const rand = (seed) => { const x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x); };
const H = 3600e3;
const D = 24 * H;

const team = (name, color, id = "team-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")) => ({ id, name, color, logo: null });

export const TEAMS = {
  VALORANT: [
    team("Sentinels", "#CE0037"), team("Fnatic", "#FF5900"), team("Paper Rex", "#E63B7A"), team("LOUD", "#13E36C"),
    team("DRX", "#1E5BFF"), team("Team Heretics", "#D4AF37"), team("G2 Esports", "#B5B5B5"), team("NRG", "#2D2D2D"),
    team("Gen.G", "#AA8B56"), team("EDward Gaming", "#C8102E"), team("100 Thieves", "#FF0000"), team("Cloud9", "#00AEEF"),
    team("KRÜ Esports", "#FF2E97"), team("Team Liquid", "#0A2A8F"),
  ],
  CS2: [
    team("Natus Vincere", "#F5D000"), team("FaZe Clan", "#E43A2E"), team("Team Vitality", "#F7E600"), team("G2 Esports", "#B5B5B5"),
    team("Team Spirit", "#2F6BFF"), team("MOUZ", "#C8102E"), team("Heroic", "#2BB673"), team("Virtus.pro", "#FF6A00"),
    team("Complexity", "#1E90FF"), team("Astralis", "#FF1E3C"), team("Cloud9", "#00AEEF"), team("FURIA", "#111111"),
    team("Eternal Fire", "#FF4500"), team("Team Liquid", "#0A2A8F"),
  ],
  League: [
    team("T1", "#E2012D"), team("Gen.G", "#AA8B56"), team("JD Gaming", "#C8102E"), team("Bilibili Gaming", "#FF6699"),
    team("G2 Esports", "#B5B5B5"), team("Fnatic", "#FF5900"), team("Cloud9", "#00AEEF"), team("Team Liquid", "#0A2A8F"),
    team("Hanwha Life Esports", "#F26522"), team("Top Esports", "#FF2D55"), team("Weibo Gaming", "#E6162D"), team("Dplus KIA", "#1A1A1A"),
    team("FlyQuest", "#2E8B57"), team("LNG Esports", "#1C3F95"),
  ],
};

const TOURNAMENTS = {
  VALORANT: ["VCT Champions 2026", "VCT Masters Toronto", "VCT Americas Stage 2", "VCT EMEA Stage 2", "VCT Pacific Stage 2"],
  CS2: ["IEM Cologne 2026", "BLAST Premier Fall Final", "PGL Major Copenhagen", "ESL Pro League S22", "IEM Katowice 2026"],
  League: ["LCK Summer 2026", "Worlds 2026", "LEC Summer 2026", "LPL Summer 2026", "MSI 2026"],
};
const STAGES = ["Group Stage", "Playoffs", "Upper Semifinal", "Grand Final", "Week 3", "Lower Bracket Round 2", "Quarterfinal", "Swiss Round 3", "Lower Final", "Week 6"];
const MAPS = {
  VALORANT: ["Ascent", "Bind", "Haven", "Lotus", "Sunset", "Icebox", "Split"],
  CS2: ["Mirage", "Inferno", "Nuke", "Ancient", "Anubis", "Dust2", "Vertigo"],
  League: [null],
};
const GAMES = ["VALORANT", "CS2", "League"];
const pick = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length];

function pair(game, seed) {
  const list = TEAMS[game];
  const a = pick(list, Math.floor(rand(seed) * list.length));
  let b = pick(list, Math.floor(rand(seed + 0.5) * list.length));
  if (b.id === a.id) b = pick(list, list.indexOf(a) + 1);
  return [a, b];
}

function base(id, game, seed, status) {
  const [t1, t2] = pair(game, seed);
  return {
    id,
    game,
    status,
    team1_id: t1.id, team1_name: t1.name, team1_logo_url: t1.logo, team1_color: t1.color,
    team2_id: t2.id, team2_name: t2.name, team2_logo_url: t2.logo, team2_color: t2.color,
    tournament_name: pick(TOURNAMENTS[game], Math.floor(rand(seed + 1) * 5)),
    stage: pick(STAGES, Math.floor(rand(seed + 2) * STAGES.length)),
    best_of: game === "League" ? pick([1, 3, 5], Math.floor(rand(seed + 3) * 3)) : pick([1, 3, 3, 5], Math.floor(rand(seed + 3) * 4)),
    map_name: pick(MAPS[game], Math.floor(rand(seed + 4) * 7)),
  };
}

export function allMatches() {
  const now = Date.now();
  const out = [];

  // ── Live (6): two per game, started 20–70 minutes ago ──────────────────
  for (let i = 0; i < 6; i++) {
    const game = GAMES[Math.floor(i / 2)];
    const seed = 100 + i;
    const m = base(`m-live-${i + 1}`, game, seed, "live");
    const startedMin = 20 + Math.floor(rand(seed + 5) * 50);
    const roundBased = game !== "League";
    const r1 = roundBased ? Math.floor(rand(seed + 6) * 13) : 4 + Math.floor(rand(seed + 6) * 14);
    const r2 = roundBased ? Math.floor(rand(seed + 7) * 13) : 3 + Math.floor(rand(seed + 7) * 14);
    Object.assign(m, {
      scheduled_at: new Date(now - startedMin * 60e3).toISOString(),
      completed_at: null,
      team1_score: r1,
      team2_score: r2,
      round_number: roundBased ? r1 + r2 + 1 : null,
      viewer_count: 4200 + Math.floor(rand(seed + 8) * 180000),
      team1_win_probability: null,
      team2_win_probability: null,
      ...(game === "League" ? { team1_inhibitors_up: 3, team2_inhibitors_up: Math.floor(rand(seed + 9) * 2) + 2 } : {}),
    });
    out.push(m);
  }

  // ── Upcoming (20): two per day over the next 10 days ───────────────────
  for (let i = 0; i < 20; i++) {
    const game = GAMES[i % 3];
    const seed = 300 + i;
    const m = base(`m-up-${i + 1}`, game, seed, "upcoming");
    const dayOffset = Math.floor(i / 2);
    const hoursAhead = 1 + (i % 2) * 3 + rand(seed + 5) * 1.5;
    const hasOdds = rand(seed + 6) > 0.35;
    const p1 = hasOdds ? Math.round(35 + rand(seed + 7) * 30) : null;
    Object.assign(m, {
      scheduled_at: new Date(now + dayOffset * D + hoursAhead * H).toISOString(),
      completed_at: null,
      team1_score: 0,
      team2_score: 0,
      round_number: null,
      viewer_count: null,
      team1_win_probability: p1,
      team2_win_probability: p1 == null ? null : 100 - p1,
    });
    out.push(m);
  }

  // ── Completed (60): one every ~12h over the last 30 days ───────────────
  for (let i = 0; i < 60; i++) {
    const game = GAMES[(i * 7) % 3];
    const seed = 500 + i;
    const m = base(`m-done-${i + 1}`, game, seed, "completed");
    const endedMs = now - (i * 12 * H + rand(seed + 5) * 6 * H);
    const durationMin = game === "League" ? 28 + Math.floor(rand(seed + 6) * 18) : 42 + Math.floor(rand(seed + 6) * 30);
    let s1; let s2;
    if (game === "League") {
      // Series result for League (Bo3/Bo5), kills live.
      const wins = Math.ceil(m.best_of / 2);
      const loser = Math.floor(rand(seed + 7) * wins);
      [s1, s2] = rand(seed + 8) > 0.5 ? [wins, loser] : [loser, wins];
    } else {
      const loser = Math.floor(rand(seed + 7) * 12);
      const overtime = rand(seed + 9) > 0.85;
      const w = overtime ? 16 : 13;
      const l = overtime ? 14 : loser;
      [s1, s2] = rand(seed + 8) > 0.5 ? [w, l] : [l, w];
    }
    Object.assign(m, {
      scheduled_at: new Date(endedMs - durationMin * 60e3).toISOString(),
      start_time: new Date(endedMs - durationMin * 60e3).toISOString(),
      completed_at: new Date(endedMs).toISOString(),
      // The real backend ships completed scores as NUMERIC strings now and then.
      team1_score: i % 9 === 4 ? String(s1) : s1,
      team2_score: i % 9 === 4 ? String(s2) : s2,
      round_number: null,
      viewer_count: 2500 + Math.floor(rand(seed + 10) * 120000),
      team1_win_probability: null,
      team2_win_probability: null,
    });
    out.push(m);
  }

  return out;
}

export function findMatch(id) {
  return allMatches().find((m) => m.id === id) ?? null;
}

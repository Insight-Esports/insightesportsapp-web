// mock/routes/archive.mjs — the match archive (backend routes/archive.js +
// controllers/archiveController.js + models/Archive.js):
//   GET /api/archive/matches   ?game&team&opponent&player&date|from&to&tournament&q&order&limit&cursor
//       -> { matches: [...completed rows + played_at (+ player_stat with player=)], next_cursor }
//   GET /api/archive/years     ?game&team&player       -> { years: [{ year, matches }] }   newest first
//   GET /api/archive/calendar  ?year&game&team&player  -> { year, days: [{ date, matches }] }
//
// A deterministic history back to 2016 (VALORANT from mid-2020) built on the
// players-teams seed (h.mockTeams / h.mockPlayers, read lazily: that module
// registers after this one). Players changed orgs at the start of 2023, so
// their older rows carry the former team in player_stat.team_id.
//
// Paywall: off by default, like the backend without ARCHIVE_FREE_DAYS. Turn it
// on for screenshots with MOCK_ARCHIVE_FREE_DAYS=N or at runtime:
//   curl -XPOST localhost:4000/api/__mock/archive -H 'content-type: application/json' -d '{"free_days":30}'
// (0 turns it off). The mock treats every account as free while it is on.

const GAMES = ["VALORANT", "CS2", "League"];
const DAY = 864e5;
const uuidRe = /^[0-9a-z-]{6,}$/i;   // mock team ids are slugs ("team-sentinels"), real ones uuids
const dayRe = /^\d{4}-\d{2}-\d{2}$/;

const rand = (seed) => { const x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x); };
const START = { VALORANT: Date.UTC(2020, 5, 2), CS2: Date.UTC(2016, 0, 8), League: Date.UTC(2016, 0, 14) };
// Matches a year per game (grows with the scene).
const PER_YEAR = { VALORANT: [0, 0, 0, 0, 260, 520, 640, 700, 760, 800, 820], CS2: [380, 420, 460, 500, 520, 560, 600, 640, 700, 760, 800], League: [300, 320, 340, 360, 380, 400, 420, 440, 460, 480, 500] };
const TOURNEYS = {
  VALORANT: (y) => [`VCT ${y} Masters`, `VCT ${y} Champions`, `VCT Americas ${y}`, `VCT EMEA ${y}`, `VCT Pacific ${y}`, `Challengers ${y}`],
  CS2: (y) => [`IEM Katowice ${y}`, `BLAST Premier ${y}`, `ESL Pro League ${y}`, `PGL Major ${y}`, `IEM Cologne ${y}`, `ESL Challenger ${y}`],
  League: (y) => [`LCK Spring ${y}`, `LCK Summer ${y}`, `LEC ${y}`, `LPL ${y}`, `MSI ${y}`, `Worlds ${y}`],
};
const STAGES = ["Group Stage", "Playoffs", "Upper Semifinal", "Grand Final", "Week 3", "Quarterfinal", "Swiss Round 2", "Lower Final"];
const CHARS = {
  VALORANT: { Duelist: ["Jett", "Raze", "Neon", "Reyna"], Initiator: ["Sova", "Fade", "Skye", "KAY/O"], Controller: ["Omen", "Viper", "Astra", "Brimstone"], Sentinel: ["Cypher", "Killjoy", "Sage"] },
  League: { Mid: ["Ahri", "Azir", "Orianna", "LeBlanc"], Top: ["Aatrox", "Gnar", "Camille"], Jungle: ["Lee Sin", "Graves", "Xin Zhao"], Bot: ["Kai'Sa", "Jinx", "Aphelios"], Support: ["Rakan", "Nautilus", "Thresh"] },
};

const hex = (n, len) => n.toString(16).padStart(len, "0").slice(-len);
const idFor = (gi, n) => `${hex(0xa7c10000 + gi, 8)}-${hex((n >> 16) & 0xffff, 4)}-4${hex(n & 0xfff, 3)}-a${hex(gi * 7 + 3, 3)}-${hex(n * 2654435761 % 2 ** 32, 12)}`;
const utcKey = (t) => new Date(t).toISOString().slice(0, 10);

let universe = null;   // [{ row, t }] newest first
function build(h) {
  if (universe) return universe;
  const teams = h.mockTeams ?? [];
  const out = [];
  const end = Date.now() - 4 * 36e5;
  GAMES.forEach((game, gi) => {
    const roster = teams.filter((t) => t.game === game);
    if (roster.length < 2) return;
    let n = 0;
    for (let d = START[game]; d < end; d += DAY) {
      const date = new Date(d);
      const y = date.getUTCFullYear();
      const perYear = PER_YEAR[game][Math.min(10, Math.max(0, y - 2016))];
      const offSeason = (date.getUTCMonth() === 11 && date.getUTCDate() > 18) || (date.getUTCMonth() === 0 && date.getUTCDate() < 8);
      const lambda = (perYear / 365) * (offSeason ? 0.15 : 1);
      const seed = gi * 1e6 + Math.floor(d / DAY);
      const count = Math.floor(rand(seed) * (2 * lambda + 1));
      for (let k = 0; k < count; k++) {
        const s = seed * 7 + k * 31;
        const a = Math.floor(rand(s + 1) * roster.length);
        let b = Math.floor(rand(s + 2) * (roster.length - 1));
        if (b >= a) b += 1;
        const t1 = roster[a], t2 = roster[b];
        const t = d + (9 + Math.floor(rand(s + 3) * 13)) * 36e5 + Math.floor(rand(s + 4) * 4) * 15 * 6e4;
        if (t > end) continue;
        const bestOf = game === "League" ? (rand(s + 5) < 0.5 ? 1 : rand(s + 5) < 0.85 ? 3 : 5) : rand(s + 5) < 0.2 ? 1 : rand(s + 5) < 0.9 ? 3 : 5;
        const need = Math.ceil(bestOf / 2);
        const t1Wins = rand(s + 6) < 0.5;
        const loser = Math.floor(rand(s + 7) * need);
        const winner = t1Wins ? t1 : t2;
        const tourneys = TOURNEYS[game](y);
        n += 1;
        const completed = t + (bestOf * 55 + Math.floor(rand(s + 8) * 40)) * 6e4;
        out.push({
          t,
          row: {
            id: idFor(gi, n), game, status: "completed",
            team1_id: t1.id, team2_id: t2.id, winner_id: winner.id,
            team1_score: t1Wins ? need : loser, team2_score: t1Wins ? loser : need,
            best_of: bestOf, stage: STAGES[Math.floor(rand(s + 9) * STAGES.length)],
            start_time: new Date(t).toISOString(), completed_at: new Date(completed).toISOString(),
            scheduled_at: new Date(t).toISOString(), round_number: null, played_at: new Date(t).toISOString(),
            map_name: null, team1_color: t1.color ?? null, team2_color: t2.color ?? null,
            team1_name: t1.name, team2_name: t2.name,
            team1_primary_color: t1.color ?? null, team1_secondary_color: null, team2_primary_color: t2.color ?? null, team2_secondary_color: null,
            team1_logo_url: t1.logo_url ?? null, team2_logo_url: t2.logo_url ?? null,
            winner_name: winner.name,
            tournament_name: tourneys[Math.floor(rand(s + 10) * tourneys.length)], tournament_tier: rand(s + 11) < 0.8 ? 1 : 2,
          },
        });
      }
    }
  });
  out.sort((x, y) => y.t - x.t || (x.row.id < y.row.id ? 1 : -1));
  universe = out;
  return out;
}

// The side a player was on when a match was played: org change on 2023-01-01.
const ORG_CHANGE = Date.UTC(2023, 0, 1);
function playerSide(h, player) {
  const roster = (h.mockTeams ?? []).filter((t) => t.game === player.game);
  const idx = roster.findIndex((t) => t.id === player.team_id);
  const former = roster[(idx + 3) % roster.length] ?? null;
  const seed = parseInt(player.id.slice(0, 6), 16) || 1;
  const debut = Math.max(START[player.game], Date.UTC(player.game === "VALORANT" ? 2020 : 2016 + (seed % 4), (seed % 6), 1));
  return (t) => (t < debut ? null : t < ORG_CHANGE ? former?.id ?? null : player.team_id);
}

function playerStat(row, player, sideId, seed) {
  const g = player.game;
  const kills = 8 + Math.floor(rand(seed + 1) * 20);
  const deaths = 6 + Math.floor(rand(seed + 2) * 16);
  const assists = 2 + Math.floor(rand(seed + 3) * 11);
  const pool = g === "CS2" ? null : (CHARS[g]?.[player.role] ?? Object.values(CHARS[g] ?? {}).flat());
  return {
    kills, deaths, assists,
    acs: g === "VALORANT" ? Math.round((150 + rand(seed + 4) * 140) * 10) / 10 : null,
    adr: g === "League" ? null : Math.round((110 + rand(seed + 5) * 80) * 10) / 10,
    rating: g === "CS2" ? Math.round((0.7 + rand(seed + 6) * 0.8) * 100) / 100 : null,
    headshots: g === "League" ? null : Math.floor(kills * (0.2 + rand(seed + 7) * 0.4)),
    plus_minus: kills - deaths,
    cs_per_min: g === "League" ? Math.round((6 + rand(seed + 8) * 4) * 10) / 10 : null,
    gold_earned: g === "League" ? 9000 + Math.floor(rand(seed + 9) * 8000) : null,
    character_name: pool && pool.length ? pool[Math.floor(rand(seed + 10) * pool.length)] : null,
    team_id: sideId,
    won: row.winner_id == null || sideId == null ? null : row.winner_id === sideId,
  };
}

export function register(app, h) {
  let freeDays = parseInt(process.env.MOCK_ARCHIVE_FREE_DAYS, 10) || 0;
  app.post("/api/__mock/archive", (req, res) => { freeDays = Math.max(0, parseInt(req.body?.free_days, 10) || 0); res.json({ free_days: freeDays }); });

  const bad = (res, error) => res.status(400).json({ error });
  const day = (s) => (dayRe.test(String(s)) ? Date.parse(`${s}T00:00:00Z`) : NaN);

  // Shared filter parse (archiveController.parseFilters). Returns null after answering 400.
  const parse = (req, res, { dates = true } = {}) => {
    const q = req.query;
    const f = {};
    if (q.game) { if (!GAMES.includes(q.game)) { bad(res, `game must be one of ${GAMES.join(", ")}`); return null; } f.game = q.game; }
    for (const k of ["team", "opponent", "player"]) {
      if (q[k]) { if (!uuidRe.test(q[k])) { bad(res, `${k} must be a valid id`); return null; } f[k] = String(q[k]); }
    }
    if (f.opponent && !f.team) { bad(res, "opponent needs team too"); return null; }
    if (dates) {
      if (q.date) {
        const d = day(q.date);
        if (Number.isNaN(d)) { bad(res, "date must be a date like 2020-03-14"); return null; }
        f.from = d; f.to = d + DAY;
      } else {
        if (q.from) { f.from = day(q.from); if (Number.isNaN(f.from)) { bad(res, "from must be a date like 2020-03-14"); return null; } }
        if (q.to) { const t = day(q.to); if (Number.isNaN(t)) { bad(res, "to must be a date like 2020-03-14"); return null; } f.to = t + DAY; }
      }
    }
    if (q.tournament) f.tournament = String(q.tournament).trim().toLowerCase();
    if (q.q) f.q = String(q.q).trim().toLowerCase();
    if (f.player) {
      const p = (h.mockPlayers ?? []).find((x) => x.id === f.player);
      f.playerRec = p ?? null;
      f.side = p ? playerSide(h, p) : () => null;
    }
    return f;
  };

  const select = (f) => build(h).filter(({ row: m, t }) => {
    if (f.game && m.game !== f.game) return false;
    if (f.team && f.opponent) { if (!((m.team1_id === f.team && m.team2_id === f.opponent) || (m.team1_id === f.opponent && m.team2_id === f.team))) return false; }
    else if (f.team && m.team1_id !== f.team && m.team2_id !== f.team) return false;
    if (f.player) {
      if (!f.playerRec || m.game !== f.playerRec.game) return false;
      const side = f.side(t);
      if (!side || (m.team1_id !== side && m.team2_id !== side)) return false;
    }
    if (f.from != null && t < f.from) return false;
    if (f.to != null && t >= f.to) return false;
    if (f.tournament && !m.tournament_name.toLowerCase().includes(f.tournament)) return false;
    if (f.q && !`${m.team1_name} ${m.team2_name} ${m.tournament_name}`.toLowerCase().includes(f.q)) return false;
    return true;
  });

  const gate = (res, from) => {
    if (!freeDays) return false;
    const floor = Date.now() - freeDays * DAY;
    if (from != null && from >= floor) return false;
    res.status(403).json({ error: `The full match archive is a premium feature. Free accounts see the last ${freeDays} days.`, code: "PREMIUM_REQUIRED", free_days: freeDays });
    return true;
  };

  app.get("/api/archive/matches", h.protect, (req, res) => {
    const f = parse(req, res);
    if (!f) return;
    const order = req.query.order || "desc";
    if (!["asc", "desc"].includes(order)) return bad(res, "order must be asc or desc");
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
    let cursor = null;
    if (req.query.cursor) {
      const [at, id] = String(req.query.cursor).split("_");
      const t = Date.parse(at);
      if (!at || !id || Number.isNaN(t)) return bad(res, "cursor is not valid");
      cursor = { t, id };
    }
    if (gate(res, f.from)) return;
    let rows = select(f);
    if (order === "asc") rows = rows.slice().reverse();
    if (cursor) {
      rows = rows.filter(({ row, t }) => order === "asc"
        ? t > cursor.t || (t === cursor.t && row.id > cursor.id)
        : t < cursor.t || (t === cursor.t && row.id < cursor.id));
    }
    const page = rows.slice(0, limit + 1);
    const more = page.length > limit;
    const list = page.slice(0, limit).map(({ row, t }) => {
      if (!f.playerRec) return row;
      const side = f.side(t);
      return { ...row, player_stat: playerStat(row, f.playerRec, side, (parseInt(row.id.slice(-8), 16) % 100000) + parseInt(f.playerRec.id.slice(0, 4), 16)) };
    });
    const last = list[list.length - 1];
    res.json({ matches: list, next_cursor: more && last ? `${new Date(last.played_at).toISOString()}_${last.id}` : null });
  });

  app.get("/api/archive/years", h.protect, (req, res) => {
    const f = parse(req, res, { dates: false });
    if (!f) return;
    const by = new Map();
    for (const { t } of select(f)) { const y = new Date(t).getUTCFullYear(); by.set(y, (by.get(y) ?? 0) + 1); }
    res.json({ years: [...by.entries()].sort((a, b) => b[0] - a[0]).map(([year, matches]) => ({ year, matches })) });
  });

  app.get("/api/archive/calendar", h.protect, (req, res) => {
    const year = parseInt(req.query.year, 10);
    if (!(year >= 2000 && year <= 2100)) return bad(res, "year is required, like 2020");
    const f = parse(req, res, { dates: false });
    if (!f) return;
    f.from = Date.UTC(year, 0, 1); f.to = Date.UTC(year + 1, 0, 1);
    if (gate(res, f.from)) return;
    const by = new Map();
    for (const { t } of select(f)) { const k = utcKey(t); by.set(k, (by.get(k) ?? 0) + 1); }
    res.json({ year, days: [...by.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, matches]) => ({ date, matches })) });
  });
}

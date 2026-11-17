// _tournament-stages-data.mjs — the staged tournaments (backend
// services/tournamentStagesService.js: templates swiss16, groups16, major32,
// plus a 16-team cup), for _tournaments-data.mjs. No register(): the routes
// stay in tournaments.mjs / tournament-series.mjs, which read these through
// _tournaments-data's exports. The odds model and the payload shapes are the
// cups' (passed in as helpers, so there is no import cycle).
//
// What is in it (deterministic; times relative to now):
//   Insight LoL Cup 2        swiss16, live: Swiss Rounds 1–3 played, Round 4
//                            under way (3 of its series done); playoffs TBD
//   Insight VALORANT Cup 4   groups16, live: all four GSL groups done; double
//                            elimination under way (UQF, LR1, USF, LR2 done;
//                            the Upper Final and Lower Round 3 next)
//   Insight CS2 Major 1      major32, live: Stage 1 fast-forwarded (no games
//                            of its own), Stage 2 Rounds 1–2 played and 4
//                            series of Round 3; Stage 3 Round 1 waits on
//                            Stage 2 (seeds 1–8 vs TBD); playoffs TBD
//   Insight VALORANT Cup 1   cup16, completed ~3 days ago (Round of 16 first)
// None has a game live, so the Live lists are as before; the next series of
// each starts an hour or more from now. They are not the "current" one of
// their game (the 8-team cups stay ON NOW) unless switched with
// POST /api/mock/tournament-template?game=CS2&template=major32 (template=
// cup puts the cup back). They are reached by URL, from the Upcoming cards'
// tournament links, from Honors and (the cup16) from Past editions.
// Ids: tournaments 5e1a0000-0000-4000-a000-000000<key>00 (keys 5016 6016
// 3032 1016), series 5e1a5e21-<key>-s<stage>-<part>-r<round>p<pos>, games
// m-t-<key>-s<stage><part>r<round>p<pos>-g<n>.

const rand = (seed) => { const x = Math.sin(seed * 9301 + 49297) * 233280; return x - Math.floor(x); };
const hashOf = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (s) => rand(hashOf(s) % 100000);
const MIN = 60e3;

const SWISS = { teams: 16, advance: 8, rounds: 5, wins: 3, losses: 3 };
const PLAYOFF_NAMES = ["Quarterfinal", "Semifinal", "Final"];
const CUP_NAMES = { 3: ["Quarterfinal", "Semifinal", "Final"], 4: ["Round of 16", "Quarterfinal", "Semifinal", "Final"] };
const GROUP_LETTERS = ["A", "B", "C", "D"];
const BRACKET_ORDER = { upper: 0, lower: 1, grand_final: 2 };
const DOUBLE_OUT = { 1: "top_8", 2: "top_6", 3: "fourth", 4: "third" };
const SINGLE_OUT = ["runner_up", "semifinalist", "quarterfinalist", "round_of_16", "round_of_32"];
const LABEL = { VALORANT: "VALORANT", CS2: "CS2", League: "LoL" };
const PLAYOFF_BO = { VALORANT: [3, 3, 5], CS2: [3, 3, 5], League: [5, 5, 5] };
const SWISS_BO = { regular: 1, decider: 3 };
const GROUP_BO = 3;

// Seeded fields, best first. A team the cups also use keeps their rating.
const T = (id, name, color, rating) => ({ id, name, color, logo_url: null, rating });
export const STAGED_TEAMS = {
  VALORANT: [
    T("team-fnatic", "Fnatic", "#FF5900", 1665), T("team-sentinels", "Sentinels", "#C8102E", 1640), T("team-paper-rex", "Paper Rex", "#C72C41", 1610),
    T("team-g2-esports", "G2 Esports", "#D11A2A", 1605), T("team-loud", "LOUD", "#19E65C", 1590), T("team-team-heretics", "Team Heretics", "#2E2E2E", 1585),
    T("team-gen-g", "Gen.G", "#AA8B56", 1570), T("team-nrg", "NRG", "#0D0D0D", 1555), T("team-drx", "DRX", "#1E5BFF", 1540),
    T("team-team-liquid", "Team Liquid", "#0A2A5E", 1535), T("team-100-thieves", "100 Thieves", "#E51C1C", 1525), T("team-cloud9", "Cloud9", "#00AEEF", 1515),
    T("team-t1", "T1", "#E2012D", 1505), T("team-karmine-corp", "Karmine Corp", "#0C3DBE", 1495), T("team-furia", "FURIA", "#111111", 1480),
    T("team-kr-esports", "KRÜ Esports", "#FF2E7E", 1465),
  ],
  CS2: [
    T("team-mouz", "MOUZ", "#D7001E", 1665), T("team-team-vitality", "Team Vitality", "#F7E700", 1660), T("team-team-spirit", "Team Spirit", "#1F1F1F", 1655),
    T("team-g2-esports-cs2", "G2 Esports", "#D11A2A", 1630), T("team-natus-vincere", "Natus Vincere", "#F5C518", 1625), T("team-the-mongolz", "The MongolZ", "#003DA5", 1615),
    T("team-faze-clan", "FaZe Clan", "#E43D30", 1600), T("team-furia-cs2", "FURIA", "#111111", 1590), T("team-astralis", "Astralis", "#E31B23", 1580),
    T("team-team-liquid-cs2", "Team Liquid", "#0A2A5E", 1575), T("team-heroic", "Heroic", "#1B1B1B", 1570), T("team-virtus-pro", "Virtus.pro", "#F58220", 1560),
    T("team-complexity", "Complexity", "#1F4FCA", 1550), T("team-eternal-fire", "Eternal Fire", "#FF4C00", 1545), T("team-3dmax", "3DMAX", "#E4002B", 1540),
    T("team-big", "BIG", "#0A0A0A", 1530),
    // Seeds 17–32 (Stage 1 only): no team pages in the mock.
    T("team-aurora-cs2", "Aurora", "#6C3BFF", 1520), T("team-pain-gaming-cs2", "paiN Gaming", "#E10600", 1515), T("team-falcons-cs2", "Falcons", "#00A86B", 1510),
    T("team-gamerlegion-cs2", "GamerLegion", "#D4AF37", 1505), T("team-fnatic-cs2", "Fnatic", "#FF5900", 1500), T("team-ninjas-in-pyjamas-cs2", "Ninjas in Pyjamas", "#FFD500", 1495),
    T("team-ence-cs2", "ENCE", "#2B5BA8", 1490), T("team-saw-cs2", "SAW", "#E30613", 1485), T("team-mibr-cs2", "MIBR", "#1C1C1C", 1480),
    T("team-imperial-cs2", "Imperial", "#F2A900", 1475), T("team-b8-cs2", "B8", "#FFE600", 1470), T("team-lynn-vision-cs2", "Lynn Vision", "#C8102E", 1465),
    T("team-tyloo-cs2", "TYLOO", "#D71920", 1460), T("team-rare-atom-cs2", "Rare Atom", "#00B2FF", 1455), T("team-wildcard-cs2", "Wildcard", "#7A1FA2", 1450),
    T("team-betboom-cs2", "BetBoom", "#FF3B30", 1445),
  ],
  League: [
    T("team-gen-g-league", "Gen.G", "#AA8B56", 1700), T("team-t1-league", "T1", "#E2012D", 1690), T("team-hanwha-life-esports", "Hanwha Life Esports", "#F47920", 1660),
    T("team-bilibili-gaming", "Bilibili Gaming", "#00A1D6", 1650), T("team-jd-gaming", "JD Gaming", "#D4121B", 1620), T("team-top-esports", "Top Esports", "#FF4500", 1615),
    T("team-dplus-kia", "Dplus KIA", "#0B5ED7", 1600), T("team-weibo-gaming", "Weibo Gaming", "#E6162D", 1590), T("team-g2-esports-league", "G2 Esports", "#D11A2A", 1580),
    T("team-fnatic-league", "Fnatic", "#FF5900", 1560), T("team-karmine-corp-league", "Karmine Corp", "#0C3DBE", 1550), T("team-mad-lions-koi", "MAD Lions KOI", "#F2C94C", 1535),
    T("team-flyquest", "FlyQuest", "#00A651", 1525), T("team-team-liquid-league", "Team Liquid", "#0A2A5E", 1515), T("team-cloud9-league", "Cloud9", "#00AEEF", 1505),
    T("team-100-thieves-league", "100 Thieves", "#E51C1C", 1490),
  ],
};
const ratings = new Map(Object.values(STAGED_TEAMS).flat().map((t) => [t.id, t.rating]));
/** A staged field team's rating (the cups' own teams are looked up there first). */
export function stagedRating(id) { return ratings.get(id) ?? null; }

// progress: ffStages = stage positions fast-forwarded (decided at once, no
// games); played = how many series are then played out with games.
// anchor: nextInMin (the next series starts in), breakMin (the gap between
// the last game played and that start), or endAgoMin for a completed one.
export const STAGED_SPECS = [
  { key: "5016", template: "swiss16", game: "League", edition: 2, progress: { played: 27 }, anchor: { nextInMin: 95, breakMin: 17 * 60 } },
  { key: "6016", template: "groups16", game: "VALORANT", edition: 4, progress: { played: 30 }, anchor: { nextInMin: 140, breakMin: 18 * 60 } },
  { key: "3032", template: "major32", game: "CS2", edition: 1, progress: { ffStages: [1], played: 20 }, anchor: { nextInMin: 200, breakMin: 19 * 60 } },
  { key: "1016", template: "cup16", game: "VALORANT", edition: 1, progress: { played: Infinity }, anchor: { endAgoMin: 3 * 24 * 60 + 40 } },
];

const seedOrderOf = (n) => {
  let order = [1];
  while (order.length < n) { const size = order.length * 2; const next = []; for (const s of order) next.push(s, size + 1 - s); order = next; }
  return order;
};

// ─── Standings (the stages service's, on the mock's series objects) ─────────
const winnerIdOf = (s) => (s.winner ? s.winner.id : null);
function swissRecords(rows, game) {
  const teams = new Map();
  const touch = (t, seed) => {
    if (!t) return null;
    if (!teams.has(t.id)) teams.set(t.id, { id: t.id, t, seed: seed || 99, wins: 0, losses: 0, diff: 0, opponents: new Set() });
    return teams.get(t.id);
  };
  for (const s of rows.filter((x) => x.round === 1)) { touch(s.team1, s.team1_seed); touch(s.team2, s.team2_seed); }
  for (const s of rows) {
    const a = touch(s.team1), b = touch(s.team2);
    if (!a || !b) continue;
    a.opponents.add(b.id); b.opponents.add(a.id);
    if (s.status !== "completed" || !s.winner) continue;
    const aWon = s.winner.id === a.id;
    (aWon ? a : b).wins++; (aWon ? b : a).losses++;
    let d = s.team1_wins - s.team2_wins;
    const g = s.games.find((x) => x.status === "completed");
    if (s.best_of === 1 && game !== "League" && g && g.team1_score != null) d = g.team1_score - g.team2_score;
    a.diff += d; b.diff -= d;
  }
  for (const t of teams.values()) t.status = t.wins >= SWISS.wins ? "advanced" : t.losses >= SWISS.losses ? "eliminated" : "playing";
  return teams;
}
const standingsOrder = (a, b) => (b.wins - a.wins) || (a.losses - b.losses) || (b.diff - a.diff) || (a.seed - b.seed);
function pairRound(records) {
  const active = [...records.values()].filter((t) => t.status === "playing");
  const groups = new Map();
  for (const t of active) { const k = `${t.wins}-${t.losses}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
  const keys = [...groups.keys()].sort((x, y) => { const [w1, l1] = x.split("-").map(Number), [w2, l2] = y.split("-").map(Number); return (w2 - w1) || (l1 - l2); });
  const out = [];
  let carry = null;
  for (const k of keys) {
    let list = groups.get(k).slice().sort((x, y) => x.seed - y.seed);
    if (carry) { list = [carry, ...list]; carry = null; }
    if (list.length % 2) carry = list.pop();
    const solve = (rest, allowRematch) => {
      if (!rest.length) return [];
      const [first, ...others] = rest;
      for (let j = others.length - 1; j >= 0; j--) {
        const opp = others[j];
        if (!allowRematch && first.opponents.has(opp.id)) continue;
        const sub = solve(others.filter((_, i) => i !== j), allowRematch);
        if (sub) return [[first, opp], ...sub];
      }
      return null;
    };
    const pairs = solve(list, false) || solve(list, true) || [];
    for (const [a, b] of pairs) {
      const decider = a.wins === SWISS.wins - 1 || a.losses === SWISS.losses - 1 || b.wins === SWISS.wins - 1 || b.losses === SWISS.losses - 1;
      out.push(a.seed <= b.seed ? { a, b, decider } : { a: b, b: a, decider });
    }
  }
  return out;
}
function groupPlaces(rows) {
  const by = (name) => rows.find((r) => r.round_name === name) || null;
  const done = (r) => r && r.status === "completed" && r.winner;
  const loser = (r) => (r.winner.id === r.team1.id ? r.team2 : r.team1);
  const places = new Map();
  const w = by("Winners"), d = by("Decider"), e = by("Elimination");
  if (done(w)) places.set(w.winner.id, 1);
  if (done(d)) { places.set(d.winner.id, 2); places.set(loser(d).id, 3); }
  if (done(e)) places.set(loser(e).id, 4);
  return places;
}
function groupStandings(rows) {
  const teams = new Map();
  for (const s of rows.filter((x) => x.round === 1)) for (const [t, seed] of [[s.team1, s.team1_seed], [s.team2, s.team2_seed]]) {
    if (t && !teams.has(t.id)) teams.set(t.id, { id: t.id, t, seed: seed || 99, wins: 0, losses: 0, diff: 0 });
  }
  for (const s of rows) {
    if (s.status !== "completed" || !s.winner || !s.team1 || !s.team2 || !teams.has(s.team1.id) || !teams.has(s.team2.id)) continue;
    const a = teams.get(s.team1.id), b = teams.get(s.team2.id);
    const aWon = s.winner.id === a.id;
    (aWon ? a : b).wins++; (aWon ? b : a).losses++;
    const d = s.team1_wins - s.team2_wins;
    a.diff += d; b.diff -= d;
  }
  const places = groupPlaces(rows);
  for (const t of teams.values()) {
    t.place = places.get(t.id) || null;
    t.status = t.place === 1 || t.place === 2 ? "advanced" : t.place === 3 || t.place === 4 ? "eliminated" : "playing";
  }
  const key = (t) => (t.place === 1 ? 0 : t.place === 2 ? 1 : t.place === 3 ? 8 : t.place === 4 ? 9 : 4 - t.wins + t.losses);
  return [...teams.values()].sort((a, b) => (key(a) - key(b)) || (b.diff - a.diff) || (a.seed - b.seed));
}
const SECONDS_ORDER = ["B", "A", "D", "C"];
const groupsThrough = (firsts, seconds) => {
  const out = GROUP_LETTERS.map((g) => firsts.get(g));
  for (const g of SECONDS_ORDER) out.push(seconds.get(g));
  return out.every(Boolean) ? out : null;
};

// ─── Building one ───────────────────────────────────────────────────────────
function build(spec, now, h) {
  const { key, game, template } = spec;
  const tid = h.tournamentId(key);
  const field = STAGED_TEAMS[game].map((t, i) => ({ t, seed: i + 1 }));
  const size = template === "major32" ? 32 : 16;
  const cup = template === "cup16";
  const name = `Insight ${LABEL[game]} ${template === "major32" ? "Major" : "Cup"} ${spec.edition}`;
  const playoffBo = PLAYOFF_BO[game];
  const stages = [];
  const series = [];
  const placements = [];

  const stage = (o) => { const st = { id: `5e1a57a6-${key}-4000-a000-00000000000${o.position}`, status: "upcoming", format: null, teams: null, advance: null, rounds: null, ...o }; stages.push(st); return st; };
  const mk = (st, o) => {
    const part = o.group_name ?? (o.bracket ? o.bracket[0] : "x");
    const s = {
      id: `5e1a5e21-${key}-s${st.position}-${part}-r${o.round}p${o.position}`, tournament_id: tid, stage: st, stage_id: st.id,
      bracket: null, group_name: null, next_series_id: null, next_slot: null, loser_next_series_id: null, loser_next_slot: null,
      team1: null, team2: null, team1_seed: null, team2_seed: null, status: "upcoming", team1_wins: 0, team2_wins: 0,
      winner: null, loser: null, winner_seed: null, loser_seed: null, last: null, games: [], ff: false, ...o,
    };
    series.push(s);
    return s;
  };
  const slot = (s, n, t, seed) => { if (n === 2) { s.team2 = t; s.team2_seed = seed; } else { s.team1 = t; s.team1_seed = seed; } };
  const byId = (id) => series.find((x) => x.id === id);

  const swiss = (position, stageName, teams) => {
    const st = stage({ position, kind: "swiss", name: stageName, teams: SWISS.teams, advance: SWISS.advance, rounds: SWISS.rounds });
    for (let i = 0; i < 8; i++) {
      const a = teams[i], b = teams.length >= 16 ? teams[i + 8] : null;
      mk(st, { round: 1, round_name: "Round 1", position: i + 1, best_of: SWISS_BO.regular, team1: a.t, team1_seed: a.seed, team2: b ? b.t : null, team2_seed: b ? b.seed : null });
    }
    return st;
  };
  const groups = (position, teams) => {
    const st = stage({ position, kind: "groups", name: "Groups", format: "gsl", teams: 16, advance: 8 });
    const pots = GROUP_LETTERS.map(() => []);
    teams.slice(0, 16).forEach((t, i) => { const row = Math.floor(i / 4); const col = row % 2 === 0 ? i % 4 : 3 - (i % 4); pots[col].push(t); });
    GROUP_LETTERS.forEach((g, gi) => {
      const [t1, t2, t3, t4] = pots[gi].slice().sort((a, b) => a.seed - b.seed);
      const base = { best_of: GROUP_BO, group_name: g };
      const decider = mk(st, { ...base, round: 3, round_name: "Decider", position: 1 });
      const winners = mk(st, { ...base, round: 2, round_name: "Winners", position: 1, loser_next_series_id: decider.id, loser_next_slot: 1 });
      const elim = mk(st, { ...base, round: 2, round_name: "Elimination", position: 2, next_series_id: decider.id, next_slot: 2 });
      mk(st, { ...base, round: 1, round_name: "Opening", position: 1, next_series_id: winners.id, next_slot: 1, loser_next_series_id: elim.id, loser_next_slot: 1, team1: t1.t, team1_seed: t1.seed, team2: t4.t, team2_seed: t4.seed });
      mk(st, { ...base, round: 1, round_name: "Opening", position: 2, next_series_id: winners.id, next_slot: 2, loser_next_series_id: elim.id, loser_next_slot: 2, team1: t2.t, team1_seed: t2.seed, team2: t3.t, team2_seed: t3.seed });
    });
    return st;
  };
  // Single elimination of `teams` (8 or 16), final first so each round links on.
  const single = (position, teams, names, bo, seeded) => {
    const st = stage({ position, kind: "bracket", name: "Playoffs", format: "single", teams });
    const R = names.length;
    let nextIds = [null];
    const byRound = {};
    for (let r = R; r >= 1; r--) {
      const ids = [];
      for (let pos = 1; pos <= 2 ** (R - r); pos++) {
        const nextId = nextIds[Math.floor((pos - 1) / 2)];
        ids.push(mk(st, { round: r, round_name: names[r - 1], position: pos, best_of: bo[r - 1], next_series_id: nextId, next_slot: nextId ? ((pos - 1) % 2) + 1 : null }).id);
      }
      byRound[r] = ids;
      nextIds = ids;
    }
    if (seeded) {
      const order = seedOrderOf(teams);
      byRound[1].forEach((id, i) => {
        const s = byId(id);
        const a = seeded[order[i * 2] - 1], b = seeded[order[i * 2 + 1] - 1];
        slot(s, 1, a.t, a.seed); slot(s, 2, b.t, b.seed);
      });
    }
    return st;
  };
  const double = (position, bo) => {
    const st = stage({ position, kind: "bracket", name: "Playoffs", format: "double", teams: 8 });
    const [early, finals, grand] = bo;
    const gf = mk(st, { bracket: "grand_final", round: 4, round_name: "Grand Final", position: 1, best_of: grand });
    const lf = mk(st, { bracket: "lower", round: 4, round_name: "Lower Final", position: 1, best_of: finals, next_series_id: gf.id, next_slot: 2 });
    const uf = mk(st, { bracket: "upper", round: 3, round_name: "Upper Final", position: 1, best_of: finals, next_series_id: gf.id, next_slot: 1, loser_next_series_id: lf.id, loser_next_slot: 1 });
    const lr3 = mk(st, { bracket: "lower", round: 3, round_name: "Lower Round 3", position: 1, best_of: early, next_series_id: lf.id, next_slot: 2 });
    const lr2 = [1, 2].map((p) => mk(st, { bracket: "lower", round: 2, round_name: "Lower Round 2", position: p, best_of: early, next_series_id: lr3.id, next_slot: p }));
    const usf = [1, 2].map((p) => mk(st, { bracket: "upper", round: 2, round_name: "Upper Semifinal", position: p, best_of: early, next_series_id: uf.id, next_slot: p, loser_next_series_id: lr2[2 - p].id, loser_next_slot: 2 }));
    const lr1 = [1, 2].map((p) => mk(st, { bracket: "lower", round: 1, round_name: "Lower Round 1", position: p, best_of: early, next_series_id: lr2[p - 1].id, next_slot: 1 }));
    for (let p = 1; p <= 4; p++) {
      const half = Math.floor((p - 1) / 2), sl = ((p - 1) % 2) + 1;
      mk(st, { bracket: "upper", round: 1, round_name: "Upper Quarterfinal", position: p, best_of: early, next_series_id: usf[half].id, next_slot: sl, loser_next_series_id: lr1[half].id, loser_next_slot: sl });
    }
    return st;
  };

  if (template === "swiss16") { swiss(1, "Swiss", field); single(2, 8, PLAYOFF_NAMES, playoffBo, null); }
  else if (template === "groups16") { groups(1, field); double(2, playoffBo); }
  else if (template === "major32") { swiss(1, "Stage 1", field.slice(16, 32)); swiss(2, "Stage 2", field.slice(8, 16)); swiss(3, "Stage 3", field.slice(0, 8)); single(4, 8, PLAYOFF_NAMES, playoffBo, null); }
  else single(1, 16, CUP_NAMES[4], [playoffBo[0], ...playoffBo], field);

  // ── Playing it out, one series at a time in playing order ──
  const playOrder = (a, b) => (a.stage.position - b.stage.position) || (a.round - b.round) || ((BRACKET_ORDER[a.bracket] || 0) - (BRACKET_ORDER[b.bracket] || 0)) || (a.group_name || "").localeCompare(b.group_name || "") || (a.position - b.position);
  const place = (t, seed, placement) => placements.push({ teamId: t.id, seed, placement, order: decidedCount - 1 });
  let decidedCount = 0;
  const seedNext = (st, through) => {
    const next = stages.find((x) => x.position === st.position + 1);
    if (!next || !through) return;
    if (next.kind === "bracket") {
      const first = series.filter((s) => s.stage === next && s.round === 1 && (s.bracket || "upper") === "upper").sort((a, b) => a.position - b.position);
      const order = seedOrderOf(first.length * 2);
      first.forEach((s, i) => {
        const sa = order[i * 2], sb = order[i * 2 + 1];
        if (through[sa - 1] && through[sb - 1]) { slot(s, 1, through[sa - 1].t, sa); slot(s, 2, through[sb - 1].t, sb); }
      });
    } else if (next.kind === "swiss") {
      const open = series.filter((s) => s.stage === next && s.round === 1 && !s.team2).sort((a, b) => a.position - b.position);
      open.forEach((s, i) => { if (through[i]) slot(s, 2, through[i].t, through[i].seed); });
    }
  };
  const afterSwiss = (st) => {
    const rows = series.filter((s) => s.stage === st);
    const last = Math.max(...rows.map((r) => r.round));
    if (rows.some((r) => r.round === last && r.status !== "completed")) return;
    const rec = swissRecords(rows, game);
    for (const t of rec.values()) if (t.status === "eliminated" && !placements.some((p) => p.teamId === t.id && p.stage === st)) { place(t.t, t.seed, "swiss_stage"); placements.at(-1).stage = st; }
    const playing = [...rec.values()].filter((t) => t.status === "playing");
    if (!playing.length || last >= SWISS.rounds) {
      st.status = "completed";
      seedNext(st, [...rec.values()].filter((t) => t.status === "advanced").sort(standingsOrder).slice(0, SWISS.advance));
      return;
    }
    pairRound(rec).forEach((p, i) => mk(st, {
      round: last + 1, round_name: `Round ${last + 1}`, position: i + 1, best_of: p.decider ? SWISS_BO.decider : SWISS_BO.regular,
      team1: p.a.t, team1_seed: p.a.seed, team2: p.b.t, team2_seed: p.b.seed,
    }));
  };
  const afterLinked = (st, s) => {
    const winnerSeed = s.winner_seed, loserSeed = s.loser_seed;
    if (s.next_series_id) slot(byId(s.next_series_id), s.next_slot, s.winner, winnerSeed);
    else if (st.kind === "bracket") place(s.winner, winnerSeed, "champion");
    if (s.loser_next_series_id) slot(byId(s.loser_next_series_id), s.loser_next_slot, s.loser, loserSeed);
    else {
      const maxRound = Math.max(...series.filter((x) => x.stage === st).map((x) => x.round));
      const placement = st.kind === "groups" ? "group_stage" : s.bracket === "grand_final" ? "runner_up" : s.bracket === "lower" ? DOUBLE_OUT[s.round] || "top_8" : SINGLE_OUT[Math.min(SINGLE_OUT.length - 1, maxRound - s.round)];
      place(s.loser, loserSeed, placement);
    }
    if (series.filter((x) => x.stage === st).every((x) => x.status === "completed")) {
      st.status = "completed";
      if (st.kind === "groups") {
        const firsts = new Map(), seconds = new Map();
        for (const g of GROUP_LETTERS) {
          const gr = series.filter((x) => x.stage === st && x.group_name === g);
          for (const [id, p] of groupPlaces(gr)) {
            const r1 = gr.filter((x) => x.round === 1);
            const t = r1.map((x) => (x.team1.id === id ? { t: x.team1, seed: x.team1_seed } : x.team2.id === id ? { t: x.team2, seed: x.team2_seed } : null)).find(Boolean);
            if (p === 1) firsts.set(g, t);
            if (p === 2) seconds.set(g, t);
          }
        }
        seedNext(st, groupsThrough(firsts, seconds));
      }
    }
  };
  const decide = (s, ff) => {
    const base = h.baseGameProb(s.team1.id, s.team2.id);
    const p = h.seriesWalk(base, s.best_of, 0, 0, null).team1;
    const t1won = rng(`${s.id}:w`) < p;
    const need = h.needOf(s.best_of);
    const other = Math.floor(rng(`${s.id}:l`) * need);
    s.ff = ff;
    if (!ff) {
      // The games, winner's last: the loser's wins spread before it.
      const seq = [];
      const lossesAt = new Set();
      const slots = need - 1 + other;
      for (let i = 0; lossesAt.size < other && i < 50; i++) lossesAt.add(Math.floor(rng(`${s.id}:o${i}`) * slots));
      for (let i = 0; lossesAt.size < other; i++) lossesAt.add(i);
      for (let i = 0; i < slots; i++) seq.push(!lossesAt.has(i));
      seq.push(true);
      let w1 = 0, w2 = 0, last = null;
      s.games = seq.map((winnerWon, i) => {
        const n = i + 1;
        const one = winnerWon === t1won;
        const seed = hashOf(`${s.id}:g${n}`) % 10000;
        const lose = game === "League" ? 6 + Math.floor(rand(seed) * 9) : 4 + Math.floor(rand(seed) * 8);
        const winS = game === "League" ? lose + 5 + Math.floor(rand(seed + 1) * 9) : 13;
        if (one) { w1++; last = 1; } else { w2++; last = 2; }
        return {
          number: n, match_id: `m-t-${key}-s${s.stage.position}${s.group_name ?? (s.bracket ? s.bracket[0] : "x")}r${s.round}p${s.position}-g${n}`, status: "completed", if_necessary: n > need,
          team1_id: s.team1.id, team2_id: s.team2.id, winner_id: one ? s.team1.id : s.team2.id,
          team1_score: one ? winS : lose, team2_score: one ? lose : winS,
          map_name: h.MAP_POOL[game][Math.floor(rand(seed + 2) * h.MAP_POOL[game].length)], at: null, completed: null, maps: [w1, w2],
        };
      });
      s.team1_wins = w1; s.team2_wins = w2; s.last = last;
    } else {
      s.games = [];
      s.team1_wins = t1won ? need : other; s.team2_wins = t1won ? other : need;
    }
    s.status = "completed";
    s.winner = t1won ? s.team1 : s.team2; s.loser = t1won ? s.team2 : s.team1;
    s.winner_seed = t1won ? s.team1_seed : s.team2_seed; s.loser_seed = t1won ? s.team2_seed : s.team1_seed;
    s.decidedAt = decidedCount++;
  };

  const ffStages = spec.progress.ffStages || [];
  const decided = [];
  for (let played = 0, guard = 0; guard < 400; guard++) {
    const s = series.filter((x) => x.status !== "completed" && x.team1 && x.team2).sort(playOrder)[0];
    if (!s) break;
    const ff = ffStages.includes(s.stage.position);
    if (!ff && played >= spec.progress.played) break;
    decide(s, ff);
    decided.push(s);
    if (!ff) played++;
    if (s.stage.kind === "swiss") afterSwiss(s.stage); else afterLinked(s.stage, s);
  }
  const completed = cup ? series.every((s) => s.status === "completed") : stages.every((st) => st.status === "completed");
  const status = completed ? "completed" : "live";

  // ── Times: fast-forwarded first (at once), played series one after the
  // other, then the break, then what is still to play in order. ──
  const P = h.perGame(game);
  let cursor = 0;
  let lastEnd = 0;
  for (const s of decided) {
    if (s.ff) { s.scheduled = cursor - 2 * MIN; s.started = s.scheduled; s.completedAt = cursor - MIN; continue; }
    const start = cursor;
    s.games.forEach((g, i) => { g.at = start + i * P; g.completed = g.at + h.GAME_MIN[game] * MIN; });
    s.scheduled = start; s.started = start; s.completedAt = s.games.at(-1).completed;
    lastEnd = s.completedAt;
    cursor = start + s.games.length * P + h.SERIES_GAP;
  }
  const nextStart = spec.anchor.breakMin != null ? lastEnd + spec.anchor.breakMin * MIN : cursor;
  cursor = nextStart;
  for (const s of series.filter((x) => x.status !== "completed").sort(playOrder)) {
    const known = !!(s.team1 && s.team2);
    s.games = Array.from({ length: s.best_of }, (_, i) => ({
      number: i + 1, match_id: known ? `m-t-${key}-s${s.stage.position}${s.group_name ?? (s.bracket ? s.bracket[0] : "x")}r${s.round}p${s.position}-g${i + 1}` : null,
      status: known ? "upcoming" : "tbd", if_necessary: i + 1 > h.needOf(s.best_of),
      team1_id: known ? s.team1.id : null, team2_id: known ? s.team2.id : null, winner_id: null, team1_score: null, team2_score: null,
      map_name: null, at: cursor + i * P, completed: null, maps: null,
    }));
    s.scheduled = cursor; s.started = null; s.completedAt = null;
    cursor += s.best_of * P + h.SERIES_GAP;
  }
  const refT = spec.anchor.endAgoMin != null ? lastEnd + spec.anchor.endAgoMin * MIN : nextStart - spec.anchor.nextInMin * MIN;
  const shift = now - refT;
  const abs = (t) => (t == null ? null : t + shift);

  const finalSeries = stages.filter((st) => st.kind === "bracket").at(-1);
  const champion = completed ? series.find((s) => s.stage === finalSeries && !s.next_series_id && s.winner)?.winner ?? null : null;
  const formatRounds = template === "groups16"
    ? [{ round: 1, name: "Upper Quarterfinal", best_of: playoffBo[0] }, { round: 2, name: "Upper Semifinal", best_of: playoffBo[0] }, { round: 3, name: "Upper Final", best_of: playoffBo[1] }, { round: 4, name: "Grand Final", best_of: playoffBo[2] }]
    : (cup ? CUP_NAMES[4] : PLAYOFF_NAMES).map((rn, i) => ({ round: i + 1, name: rn, best_of: cup ? [playoffBo[0], ...playoffBo][i] : playoffBo[i] }));
  const tournament = {
    id: tid, name, game, tier: 1, status, is_sim: true, edition: spec.edition,
    league_name: "Insight Cup", serie_name: `${template === "major32" ? "Major" : "Cup"} ${spec.edition}`,
    format: cup ? { teams: 16, rounds: formatRounds } : { teams: size, template, rounds: formatRounds },
    start_date: new Date(abs(Math.min(0, ...series.map((s) => s.scheduled ?? 0)))).toISOString(),
    end_date: completed ? new Date(abs(lastEnd)).toISOString() : null,
    winner_id: champion ? champion.id : null, created_at: new Date(abs(-60e3)).toISOString(),
  };
  // Every series in its place in playing order (the bracket's own order).
  series.sort(playOrder);
  return { spec: { ...spec, game }, tournament, series, stages, abs, champion, staged: !cup, placements: placements.map((p) => ({ ...p, at: abs(decided[p.order]?.completedAt ?? lastEnd) })) };
}

export function buildStaged(now, h) {
  return STAGED_SPECS.map((spec) => build(spec, now, h));
}

// ─── The bracket payload's stages[] (stagesService.decorate) ────────────────
export function stagesPayload(b, shaped) {
  const game = b.tournament.game;
  const stageRows = (st) => b.series.filter((s) => s.stage === st);
  const teamRow = (t) => ({ team: { id: t.t.id, name: t.t.name, logo_url: t.t.logo_url, seed: t.seed }, wins: t.wins, losses: t.losses, diff: t.diff, status: t.status });
  let playoffRounds = [];
  const out = b.stages.map((st) => {
    const rows = stageRows(st);
    const anyStarted = rows.some((s) => s.status === "live" || s.status === "completed");
    const status = st.kind === "bracket"
      ? (rows.every((s) => s.status === "completed") ? "completed" : anyStarted ? "live" : "upcoming")
      : (st.status === "completed" ? "completed" : anyStarted ? "live" : "upcoming");
    const base = { id: st.id, position: st.position, kind: st.kind, name: st.name, status, teams: st.teams };
    if (st.kind === "swiss") {
      const rec = swissRecords(rows, game);
      const rounds = [];
      for (let r = 1; r <= Math.max(SWISS.rounds, ...rows.map((s) => s.round)); r++) {
        const ss = rows.filter((s) => s.round === r).sort((x, y) => x.position - y.position);
        rounds.push({ round: r, name: ss[0] ? ss[0].round_name : `Round ${r}`, best_of: ss.length ? Math.min(...ss.map((s) => s.best_of)) : null, series: ss.map(shaped) });
      }
      return { ...base, advance: st.advance, rounds_total: SWISS.rounds, standings: [...rec.values()].sort(standingsOrder).map(teamRow), rounds };
    }
    if (st.kind === "groups") {
      const letters = [...new Set(rows.map((s) => s.group_name))].sort();
      return {
        ...base, format: st.format, advance: st.advance,
        groups: letters.map((g) => {
          const gr = rows.filter((s) => s.group_name === g);
          return { name: g, standings: groupStandings(gr).map((t) => ({ ...teamRow(t), place: t.place })), series: gr.slice().sort((x, y) => (x.round - y.round) || (x.position - y.position)).map(shaped) };
        }),
      };
    }
    const keys = [...new Set(rows.map((s) => `${s.bracket || ""}|${s.round}`))].sort((x, y) => {
      const [bx, rx] = x.split("|"), [by, ry] = y.split("|");
      return ((BRACKET_ORDER[bx] || 0) - (BRACKET_ORDER[by] || 0)) || (Number(rx) - Number(ry));
    });
    const rounds = keys.map((k) => {
      const [bk, r] = k.split("|");
      const ss = rows.filter((s) => (s.bracket || "") === bk && String(s.round) === r).sort((x, y) => x.position - y.position);
      return { round: Number(r), name: ss[0].round_name, bracket: bk || null, best_of: Math.min(...ss.map((s) => s.best_of)), series: ss.map(shaped) };
    });
    playoffRounds = rounds;
    return { ...base, format: st.format, rounds };
  });
  return { stages: out, rounds: playoffRounds };
}

// ─── Title odds (stagesService.stagedOdds): the stages still to play, played
// many times over with the series odds, deterministic per state. ──────────────
const SIMS = 1000;
const mulberry = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export function stagedOdds(b, h) {
  const game = b.tournament.game;
  const random = mulberry(hashOf(`${b.tournament.id}:${b.series.filter((s) => s.status === "completed").length}`));
  const po = b.stages.filter((st) => st.kind === "bracket").at(-1);
  const rowsOf = new Map(b.stages.map((st) => [st, b.series.filter((s) => s.stage === st)]));
  const seedOf = new Map();
  for (const st of b.stages) for (const s of rowsOf.get(st)) for (const [t, seed] of [[s.team1, s.team1_seed], [s.team2, s.team2_seed]]) if (t && !seedOf.has(t.id)) seedOf.set(t.id, { t, seed });
  // Seeds in a bracket stage are playoff seeds: the tournament seed is the earliest stage's.
  const walk = new Map();
  const P = (a, c, bo) => {
    const k = `${a}|${c}|${bo}`;
    if (!walk.has(k)) walk.set(k, h.seriesWalk(h.baseGameProb(a, c), Number(bo) || 1, 0, 0, null).team1);
    return walk.get(k);
  };
  const nowOdds = new Map();
  for (const s of b.series) {
    if (!s.team1 || !s.team2) continue;
    if (s.status === "completed" && s.winner) { nowOdds.set(s.id, s.winner.id === s.team1.id ? 1 : 0); continue; }
    if (s.team1_wins + s.team2_wins > 0) { const o = h.seriesOddsOf(b, s); if (o.available) { nowOdds.set(s.id, o.team1_series / 100); continue; } }
    nowOdds.set(s.id, P(s.team1.id, s.team2.id, s.best_of));
  }
  const pOf = (row, a, c) => {
    if (row && row.team1?.id === a && row.team2?.id === c && nowOdds.has(row.id)) return nowOdds.get(row.id);
    if (row && row.team1?.id === c && row.team2?.id === a && nowOdds.has(row.id)) return 1 - nowOdds.get(row.id);
    return P(a, c, row ? row.best_of : 3);
  };
  const poRows = rowsOf.get(po);
  const colKey = (r) => (r.bracket === "lower" ? null : `${r.bracket || ""}|${r.round}`);
  const cols = [...new Set(poRows.map(colKey).filter(Boolean))].sort((x, y) => {
    const [bx, rx] = x.split("|"), [by, ry] = y.split("|");
    return ((BRACKET_ORDER[bx] || 0) - (BRACKET_ORDER[by] || 0)) || (Number(rx) - Number(ry));
  });
  const colName = cols.map((c) => poRows.find((r) => colKey(r) === c).round_name);
  const colIdx = new Map(cols.map((c, i) => [c, i]));
  const ids = [...seedOf.keys()];
  const count = new Map(ids.map((id) => [id, { playoffs: 0, reach: cols.map(() => 0), win: cols.map(() => 0) }]));

  const simSwiss = (st, rows, carry) => {
    let list = rows;
    if (carry && rows.some((r) => r.round === 1 && !r.team2)) {
      const open = rows.filter((r) => r.round === 1 && !r.team2).sort((x, y) => x.position - y.position);
      list = rows.map((r) => { const i = open.indexOf(r); return i === -1 || !carry[i] ? r : { ...r, team2: carry[i].t, team2_seed: carry[i].seed }; });
    }
    const rec = swissRecords(list, game);
    const play = (a, c, p) => { const x = rec.get(a), y = rec.get(c); if (!x || !y) return; const aw = random() < p; (aw ? x : y).wins++; (aw ? y : x).losses++; };
    const settle = () => { for (const t of rec.values()) t.status = t.wins >= SWISS.wins ? "advanced" : t.losses >= SWISS.losses ? "eliminated" : "playing"; };
    if (st.status !== "completed") {
      const lastRound = Math.max(...list.map((r) => r.round));
      for (const r of list.filter((x) => x.round === lastRound && x.status !== "completed")) if (r.team1 && r.team2) play(r.team1.id, r.team2.id, pOf(r, r.team1.id, r.team2.id));
      settle();
      for (let r = lastRound + 1; r <= SWISS.rounds; r++) {
        if (![...rec.values()].some((t) => t.status === "playing")) break;
        for (const p of pairRound(rec)) {
          p.a.opponents.add(p.b.id); p.b.opponents.add(p.a.id);
          play(p.a.id, p.b.id, P(p.a.id, p.b.id, p.decider ? SWISS_BO.decider : SWISS_BO.regular));
        }
        settle();
      }
    }
    return [...rec.values()].filter((t) => t.status === "advanced").sort(standingsOrder).slice(0, SWISS.advance).map((t) => ({ t: t.t, seed: t.seed }));
  };
  const simLinked = (st, rows, carry) => {
    const slot = new Map(rows.map((r) => [r.id, { row: r, t: [r.team1?.id ?? null, r.team2?.id ?? null], winner: null }]));
    if (carry && st.kind === "bracket") {
      const first = rows.filter((r) => r.round === 1 && (r.bracket || "upper") === "upper").sort((x, y) => x.position - y.position);
      const order = seedOrderOf(first.length * 2);
      first.forEach((r, i) => {
        const x = slot.get(r.id);
        if (x.t[0] || x.t[1]) return;
        const ta = carry[order[i * 2] - 1], tb = carry[order[i * 2 + 1] - 1];
        x.t = [ta ? ta.t.id : null, tb ? tb.t.id : null];
      });
    }
    const put = (id, n, team) => { const x = id ? slot.get(id) : null; if (x && team && !x.t[Number(n) === 2 ? 1 : 0]) x.t[Number(n) === 2 ? 1 : 0] = team; };
    const order = rows.slice().sort((x, y) => (x.round - y.round) || ((BRACKET_ORDER[x.bracket] || 0) - (BRACKET_ORDER[y.bracket] || 0)) || (x.position - y.position));
    for (let moved = true; moved;) {
      moved = false;
      for (const r of order) {
        const x = slot.get(r.id);
        if (x.winner || !x.t[0] || !x.t[1]) continue;
        const w = r.status === "completed" && r.winner ? r.winner.id : random() < pOf(r, x.t[0], x.t[1]) ? x.t[0] : x.t[1];
        x.winner = w;
        put(r.next_series_id, r.next_slot, w);
        put(r.loser_next_series_id, r.loser_next_slot, w === x.t[0] ? x.t[1] : x.t[0]);
        moved = true;
      }
    }
    return slot;
  };
  for (let it = 0; it < SIMS; it++) {
    let carry = null;
    for (const st of b.stages) {
      const rows = rowsOf.get(st);
      if (st.kind === "swiss") { carry = simSwiss(st, rows, carry); continue; }
      const slot = simLinked(st, rows, carry);
      if (st.kind === "groups") {
        const firsts = new Map(), seconds = new Map();
        for (const g of GROUP_LETTERS) {
          const gr = rows.filter((r) => r.group_name === g);
          const w = gr.find((r) => r.round_name === "Winners"), d = gr.find((r) => r.round_name === "Decider");
          if (w && slot.get(w.id).winner) firsts.set(g, seedOf.get(slot.get(w.id).winner));
          if (d && slot.get(d.id).winner) seconds.set(g, seedOf.get(slot.get(d.id).winner));
        }
        carry = groupsThrough(firsts, seconds);
        continue;
      }
      if (st !== po) continue;
      for (const r of rows) {
        const x = slot.get(r.id);
        if (r.round === 1 && (r.bracket || "upper") === "upper") for (const id of x.t) if (id && count.get(id)) count.get(id).playoffs++;
        const ci = colIdx.get(colKey(r));
        if (ci === undefined) continue;
        for (const id of x.t) if (id && count.get(id)) count.get(id).reach[ci]++;
        if (x.winner && count.get(x.winner)) count.get(x.winner).win[ci]++;
      }
    }
  }
  const pct = (x) => Math.round((x / SIMS) * 1000) / 10;
  const last = cols.length - 1;
  const teams = ids.map((id) => {
    const c = count.get(id), { t, seed } = seedOf.get(id);
    return {
      team: { id, name: t.name, logo_url: t.logo_url, seed },
      champion: pct(c.win[last]),
      rounds: [{ round: 0, name: "Playoffs", reach: pct(c.playoffs) }, ...cols.map((_, k) => ({ round: k + 1, name: colName[k], reach: pct(c.reach[k]), win: pct(c.win[k]) }))],
      eliminated: false,
    };
  }).sort((p, q) => q.champion - p.champion || (q.rounds[0].reach - p.rounds[0].reach) || (p.team.seed - q.team.seed));
  for (const row of teams) row.eliminated = row.champion === 0 && row.rounds[0].reach === 0;
  const series = {};
  for (const s of b.series) {
    if (!s.team1 || !s.team2 || !nowOdds.has(s.id)) continue;
    const v = nowOdds.get(s.id);
    series[s.id] = { team1: Math.round(v * 1000) / 10, team2: Math.round((1 - v) * 1000) / 10 };
  }
  return { tournament: { id: b.tournament.id, name: b.tournament.name, game, status: b.tournament.status }, teams, series };
}

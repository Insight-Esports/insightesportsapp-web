// mock/routes/alerts.mjs — Stat Alerts (backend routes/alerts.js →
// controllers/alertController.js → services/statAlertService.js).
//
//   GET    /api/alerts            { active, history }
//   GET    /api/alerts/context    ?targetType&targetId[&matchId]
//   POST   /api/alerts            201 with the row as GET lists it
//   PATCH  /api/alerts/:id        change the call
//   DELETE /api/alerts/:id        204
//
// Seeded so every state shows: a live stat alert (12 / 20), a live result
// alert on a team that is team 2 of its match (the round score flips), a
// REACHED one, a negative +/−, an upcoming map alert, an "every match"
// alert, and HIT / MISS / DIDN'T PLAY history.
//   MOCK_ALERTS_FREE=1  → free limit (403 ALERT_LIMIT past one active)
//   MOCK_ALERTS_OFF=1   → 503 FEATURE_DISABLED (the stat_alerts switch)
import { allMatches, findMatch } from "./_matches-data.mjs";

// Same id recipe as players-teams.mjs (VALORANT player i → uuid(20000 + i)).
const uuid = (seed) => {
  const hex = (n, len) => Math.floor(n * 16 ** len).toString(16).padStart(len, "0");
  const r = (k) => (Math.sin(seed * 7919 + k * 104729) * 10007) % 1;
  return `${hex(Math.abs(r(1)), 8)}-${hex(Math.abs(r(2)), 4)}-4${hex(Math.abs(r(3)), 3)}-a${hex(Math.abs(r(4)), 3)}-${hex(Math.abs(r(5)), 12)}`;
};
const VAL = { TenZ: 0, Derke: 5, aspas: 10, Demon1: 19, leaf: 22, valyn: 23, trent: 24 };
const pid = (name) => uuid(20000 + VAL[name]);

const RESULT_EVENTS = ["win", "lose", "sweep", "distance"];
const RATE = ["acs", "adr", "cs_per_min", "plus_minus"];
const CUMULATIVE = ["kills", "deaths", "assists", "headshots", "gold_earned", "vision_score"];
const PLAYER_STATS = { VALORANT: ["kills", "deaths", "assists", "acs", "adr", "headshots", "plus_minus"], CS2: ["kills", "deaths", "assists", "adr", "headshots", "plus_minus"], League: ["kills", "deaths", "assists", "cs_per_min", "gold_earned", "vision_score", "plus_minus"] };

const err = (res, status, code, message) => res.status(status).json({ error: message, code });

export function register(app, h) {
  const { isoAgo, isoIn, protect } = h;
  const PORT = process.env.MOCK_PORT ?? 4000;
  const internal = async (path) => {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api${path}`, { headers: { "x-api-key": process.env.APP_API_KEY ?? "mock" } });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  };

  // ── Matches, from the target's side ────────────────────────────────────
  const opp = (m, teamId) => (m.team1_id === teamId ? m.team2_name : m.team1_name);
  const seriesFor = (m) => {
    // Live best-ofs are on map 2 with map 1 to team 1; completed: by the round score.
    if (m.status === "live" && m.best_of > 1) return { t1: 1, t2: 0 };
    return { t1: Number(m.team1_map_score ?? 0), t2: Number(m.team2_map_score ?? 0) };
  };
  const matchShape = (m, teamId, withStatus = true) => {
    if (!m) return null;
    const out = { id: m.id, opponent_name: opp(m, teamId) ?? null, scheduled_at: m.scheduled_at };
    if (withStatus) out.status = m.status;
    out.best_of = m.best_of ?? null;
    if (m.status === "live" || m.status === "completed") {
      const s = seriesFor(m);
      const mine = m.team1_id === teamId;
      out.target_score = mine ? s.t1 : s.t2;
      out.opponent_score = mine ? s.t2 : s.t1;
    }
    return out;
  };
  const nextForTeam = (teamId) => allMatches().filter((m) => m.status === "upcoming" && (m.team1_id === teamId || m.team2_id === teamId)).sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0] ?? null;
  const liveForTeam = (teamId) => allMatches().find((m) => m.status === "live" && (m.team1_id === teamId || m.team2_id === teamId)) ?? null;

  // ── Seed ────────────────────────────────────────────────────────────────
  let n = 0;
  const id = () => `alert-${++n}`;
  const player = (name, team_name, team_id) => ({ target_type: "player", target_id: pid(name), target_name: name, team_name, team_id, image_url: null });
  const team = (name, team_id) => ({ target_type: "team", target_id: team_id, target_name: name, team_name: name, team_id, image_url: null });
  const G2 = ["G2 Esports", "team-g2-esports"];
  const call = (o) => ({ kind: "stat", stat: null, direction: null, target: null, event: null, map_number: null, ...o });

  const active = [
    { id: id(), game: "VALORANT", ...player("leaf", ...G2), ...call({ stat: "kills", direction: "over", target: 20 }), repeat: false, match_id: "m-live-1", created_at: isoAgo(2 * 36e5), live: { value: 12, fired_at: null } },
    { id: id(), game: "VALORANT", ...team("LOUD", "team-loud"), ...call({ kind: "result", event: "win" }), repeat: false, match_id: "m-live-2", created_at: isoAgo(3 * 36e5) },
    { id: id(), game: "VALORANT", ...player("valyn", ...G2), ...call({ stat: "kills", direction: "over", target: 15 }), repeat: false, match_id: "m-live-1", created_at: isoAgo(4 * 36e5), live: { value: 17, fired_at: isoAgo(6 * 6e4) } },
    { id: id(), game: "VALORANT", ...player("trent", ...G2), ...call({ stat: "plus_minus", direction: "over", target: 5 }), repeat: false, match_id: "m-live-1", created_at: isoAgo(5 * 36e5), live: { value: -2, fired_at: null } },
    { id: id(), game: "VALORANT", ...team("NRG", "team-nrg"), ...call({ kind: "map", event: "map_win", map_number: 2 }), repeat: false, match_id: "m-up-1", created_at: isoAgo(6 * 36e5) },
    { id: id(), game: "VALORANT", ...player("TenZ", "Sentinels", "team-sentinels"), ...call({ stat: "kills", direction: "over", target: 20 }), repeat: true, match_id: null, created_at: isoAgo(30 * 36e5) },
  ];
  const history = [
    { id: "res-1", alert_id: "alert-h1", game: "VALORANT", ...player("Derke", "Fnatic", "team-fnatic"), ...call({ stat: "kills", direction: "over", target: 18 }), status: "hit", final_value: 22, final_score: null, final_at: isoAgo(20 * 36e5), match: { id: "m-done-3", opponent_name: "Team Heretics", scheduled_at: isoAgo(23 * 36e5), best_of: 3, target_score: 2, opponent_score: 1 } },
    { id: "res-2", alert_id: "alert-h2", game: "VALORANT", ...team("Sentinels", "team-sentinels"), ...call({ kind: "result", event: "win" }), status: "miss", final_value: null, final_score: "1 – 2", final_at: isoAgo(28 * 36e5), match: { id: "m-done-5", opponent_name: "G2 Esports", scheduled_at: isoAgo(31 * 36e5), best_of: 3, target_score: 1, opponent_score: 2 } },
    { id: "res-3", alert_id: "alert-h3", game: "VALORANT", ...player("aspas", "LOUD", "team-loud"), ...call({ stat: "kills", direction: "under", target: 20 }), status: "void", final_value: null, final_score: null, final_at: isoAgo(2 * 864e5), match: { id: "m-done-7", opponent_name: "KRÜ Esports", scheduled_at: isoAgo(2 * 864e5 + 3 * 36e5), best_of: 3 } },
    { id: "res-4", alert_id: "alert-h4", game: "VALORANT", ...team("Fnatic", "team-fnatic"), ...call({ kind: "map", event: "map_win", map_number: 1 }), status: "hit", final_value: null, final_score: "13 – 9", final_at: isoAgo(3 * 864e5), match: { id: "m-done-9", opponent_name: "Paper Rex", scheduled_at: isoAgo(3 * 864e5 + 2 * 36e5), best_of: 3, target_score: 2, opponent_score: 0 } },
    { id: "res-5", alert_id: "alert-h5", game: "VALORANT", ...player("Demon1", "NRG", "team-nrg"), ...call({ stat: "plus_minus", direction: "over", target: 3 }), status: "miss", final_value: -4, final_score: null, final_at: isoAgo(4 * 864e5), match: { id: "m-done-11", opponent_name: "100 Thieves", scheduled_at: isoAgo(4 * 864e5 + 3 * 36e5), best_of: 3, target_score: 0, opponent_score: 2 } },
  ];

  // ── Rows as GET lists them ──────────────────────────────────────────────
  const activeRow = (a) => {
    const m = a.repeat ? (liveForTeam(a.team_id) ?? nextForTeam(a.team_id)) : (a.match_id ? findMatch(a.match_id) : null);
    const out = {
      id: a.id, game: a.game, target_type: a.target_type, target_id: a.target_id, target_name: a.target_name, team_name: a.team_name, image_url: a.image_url,
      kind: a.kind, stat: a.stat, direction: a.direction, target: a.target, event: a.event, map_number: a.map_number, repeat: a.repeat,
      match: matchShape(m, a.team_id), created_at: a.created_at,
    };
    if (m && m.status === "live") out.live = a.kind === "stat" ? (a.live ?? { value: null, fired_at: null }) : { value: null, fired_at: null };
    return out;
  };
  const historyRow = ({ team_id: _t, ...r }) => r;

  const off = (res) => (process.env.MOCK_ALERTS_OFF === "1" ? (res.status(503).json({ error: "Stat Alerts are turned off for now.", code: "FEATURE_DISABLED", feature: "stat_alerts", mode: "off" }), true) : false);

  // ── Target lookup (name, team) for new alerts ───────────────────────────
  const loadTarget = async (type, targetId) => {
    if (type === "team") {
      const t = await internal(`/teams/${encodeURIComponent(targetId)}`);
      const fromMatches = allMatches().find((m) => m.team1_id === targetId || m.team2_id === targetId);
      const name = t?.name ?? (fromMatches ? (fromMatches.team1_id === targetId ? fromMatches.team1_name : fromMatches.team2_name) : null);
      return name ? { target_name: name, team_name: name, team_id: targetId, image_url: t?.logo_url ?? null, game: t?.game ?? fromMatches?.game ?? null } : null;
    }
    const p = await internal(`/players/${encodeURIComponent(targetId)}`);
    return p ? { target_name: p.name, team_name: p.team_name ?? null, team_id: p.team_id ?? null, image_url: p.image_url ?? null, game: p.game } : null;
  };

  const validateCall = (b, game, type) => {
    const kind = b.kind ?? "stat";
    if (kind === "stat") {
      const stats = type === "team" ? ["kills", "plus_minus"] : PLAYER_STATS[game] ?? [];
      if (!stats.includes(b.stat)) return ["INVALID_STAT", `stat must be one of ${stats.join(", ")} for ${game} ${type}s`];
      if (!["over", "under"].includes(b.direction)) return ["INVALID_DIRECTION", "direction must be over or under"];
      const t = Number(b.target);
      if (!Number.isFinite(t)) return ["INVALID_TARGET_VALUE", "target must be a number"];
      if (!RATE.includes(b.stat) && !Number.isInteger(t)) return ["INVALID_TARGET_VALUE", "kills takes a whole number target"];
      if (b.stat !== "plus_minus" && t <= 0) return ["INVALID_TARGET_VALUE", "target must be above zero"];
      return null;
    }
    if (type !== "team") return ["INVALID_TARGET_TYPE", `${kind} alerts are for teams`];
    if (kind === "result" && !RESULT_EVENTS.includes(b.event)) return ["INVALID_EVENT", "event must be one of win, lose, sweep, distance for a result alert"];
    if (kind === "map" && !(Number(b.map) >= 1 && Number(b.map) <= 5)) return ["INVALID_MAP", "map must be a whole number from 1 to 5"];
    return null;
  };

  const refuseIfSettled = async (a, m) => {
    if (!m || m.status !== "live" || a.kind !== "stat" || !CUMULATIVE.includes(a.stat)) return null;
    const rows = (await internal(`/matches/${encodeURIComponent(m.id)}/stats`)) ?? [];
    const mine = a.target_type === "player" ? rows.filter((r) => r.player_id === a.target_id) : rows.filter((r) => r.team_id === a.target_id);
    if (!mine.length) return null;
    const v = mine.reduce((s, r) => s + Number(r[a.stat] ?? 0), 0);
    return v >= Number(a.target) ? `${a.target_name} already ${a.target_type === "team" ? "have" : "has"} ${v} ${a.stat.replace(/_/g, " ")} this match. Pick a higher number.` : null;
  };

  // ── Routes ──────────────────────────────────────────────────────────────
  app.get("/api/alerts", protect, (_req, res) => {
    if (off(res)) return;
    res.json({ active: active.map(activeRow), history: history.map(historyRow) });
  });

  app.get("/api/alerts/context", protect, async (req, res) => {
    if (off(res)) return;
    const type = String(req.query.targetType ?? "team");
    const targetId = String(req.query.targetId ?? "");
    const matchId = req.query.matchId ? String(req.query.matchId) : null;
    if (!targetId) return err(res, 400, "INVALID_TARGET", "targetId must be a valid id");
    const t = await loadTarget(type, targetId);
    if (!t) return err(res, 404, "TARGET_NOT_FOUND", `${type === "team" ? "Team" : "Player"} not found`);
    if (!t.team_id) return res.json({ match: null });
    let m = matchId ? findMatch(matchId) : (liveForTeam(t.team_id) ?? nextForTeam(t.team_id));
    if (m && ![m.team1_id, m.team2_id].includes(t.team_id)) m = null;
    if (!m) return res.json({ match: null });
    const base = matchShape(m, t.team_id);
    const mine = m.team1_id === t.team_id;
    const maps = m.status === "live" && m.best_of > 1
      ? [{ number: 1, status: "finished", target_won: mine, target_rounds: mine ? 13 : 10, opponent_rounds: mine ? 10 : 13 },
         { number: 2, status: "live", target_won: null, target_rounds: mine ? Number(m.team1_score) : Number(m.team2_score), opponent_rounds: mine ? Number(m.team2_score) : Number(m.team1_score) }]
      : [];
    res.json({ match: { ...base, target_score: base.target_score ?? 0, opponent_score: base.opponent_score ?? 0, maps } });
  });

  app.post("/api/alerts", protect, async (req, res) => {
    if (off(res)) return;
    const b = req.body ?? {};
    const type = b.targetType === "team" ? "team" : "player";
    const t = await loadTarget(type, String(b.targetId ?? ""));
    if (!t) return err(res, 404, "TARGET_NOT_FOUND", `${type === "team" ? "Team" : "Player"} not found`);
    const game = b.game ?? t.game ?? "VALORANT";
    const bad = validateCall(b, game, type);
    if (bad) return err(res, 400, bad[0], bad[1]);
    const free = process.env.MOCK_ALERTS_FREE === "1";
    if (free && active.length >= 1) return err(res, 403, "ALERT_LIMIT", "Free accounts get one active alert. Premium gets unlimited.");
    if (!free && active.length >= 50) return err(res, 403, "ALERT_LIMIT", "You can have up to 50 active alerts. Delete one to add another.");
    const repeat = b.repeat === true;
    let matchId = null;
    if (!repeat) {
      const m = b.matchId ? findMatch(String(b.matchId)) : nextForTeam(t.team_id);
      if (!m) return err(res, b.matchId ? 422 : 409, b.matchId ? "MATCH_NOT_ELIGIBLE" : "NO_UPCOMING_MATCH", b.matchId ? "That match does not exist" : `No upcoming match for this ${type} yet. Try again once one is scheduled.`);
      if (m.status === "completed") return err(res, 422, "MATCH_NOT_ELIGIBLE", "That match is already over");
      matchId = m.id;
    }
    const kind = b.kind ?? "stat";
    const a = {
      id: id(), game, target_type: type, target_id: String(b.targetId), ...t,
      kind, stat: kind === "stat" ? b.stat : null, direction: kind === "stat" ? b.direction : null, target: kind === "stat" ? Number(b.target) : null,
      event: kind === "result" ? b.event : kind === "map" ? "map_win" : null, map_number: kind === "map" ? Number(b.map) : null,
      repeat, match_id: matchId, created_at: new Date().toISOString(),
    };
    const m = matchId ? findMatch(matchId) : null;
    const settled = await refuseIfSettled(a, m);
    if (settled) return err(res, 422, "ALREADY_REACHED", settled);
    if (m && m.status === "live" && kind === "stat") a.live = { value: 0, fired_at: null };
    active.unshift(a);
    res.status(201).json(activeRow(a));
  });

  app.patch("/api/alerts/:id", protect, async (req, res) => {
    if (off(res)) return;
    const a = active.find((x) => x.id === req.params.id);
    if (!a) return err(res, 404, "ALERT_NOT_FOUND", "Alert not found");
    const b = { ...req.body };
    if (b.repeat !== undefined && b.repeat !== a.repeat) return err(res, 400, "INVALID_MATCH", "repeat cannot change on an existing alert; make a new one");
    const kind = b.kind ?? a.kind;
    const next = { kind, stat: b.stat ?? (kind === a.kind ? a.stat : null), direction: b.direction ?? (kind === a.kind ? a.direction : null), target: b.target ?? (kind === a.kind ? a.target : null), event: b.event ?? null, map: b.map ?? a.map_number };
    const bad = validateCall(next, a.game, a.target_type);
    if (bad) return err(res, 400, bad[0], bad[1]);
    const candidate = { ...a, kind, stat: kind === "stat" ? next.stat : null, direction: kind === "stat" ? next.direction : null, target: kind === "stat" ? Number(next.target) : null, event: kind === "result" ? next.event : kind === "map" ? "map_win" : null, map_number: kind === "map" ? Number(next.map) : null };
    const settled = await refuseIfSettled(candidate, a.match_id ? findMatch(a.match_id) : null);
    if (settled) return err(res, 422, "ALREADY_REACHED", settled);
    Object.assign(a, candidate);
    if (a.live) a.live = { ...a.live, fired_at: null };
    res.json(activeRow(a));
  });

  app.delete("/api/alerts/:id", protect, (req, res) => {
    if (off(res)) return;
    const i = active.findIndex((x) => x.id === req.params.id);
    if (i < 0) return err(res, 404, "ALERT_NOT_FOUND", "Alert not found");
    active.splice(i, 1);
    res.status(204).end();
  });

  void isoIn;
}

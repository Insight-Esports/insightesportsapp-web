// tournament-series.mjs — the series page and the tournament-game extras
// (backend routes/tournaments.js, routes/matches.js, routes/predictions.js):
//   GET  /api/tournaments/series/:id        one series with its games
//   GET  /api/tournaments/series/:id/odds   series + exact-score odds, next game, games that may not happen
//   POST /api/predictions/live              + `seriesFactor` on a tournament game
//                                           ({ team1_wins, team2_wins, best_of, shift, adjustments })
//   GET  /api/matches/live                  + two simulator "drip" games with no tournament
//                                           (tournament_name null), listed first by viewers, so
//                                           the Live tab's tournament-first order shows
// Data: ./_tournaments-data.mjs (the tournaments mock's; match rows already
// carry `series` and team1_win_prob through _matches-data.mjs).
//
// This file sorts before tournaments.mjs, so its series routes answer first
// (same data). The two wrappers are hoisted in front of the routes they
// extend (registered earlier by predictions.mjs / matches-list.mjs).
import { seriesDetail, seriesOdds, tournamentMatchRows } from "./_tournaments-data.mjs";

/** Move the layer just registered in front of the first route that would answer `samplePath`. */
function hoist(app, samplePath) {
  const stack = app.router?.stack ?? app._router?.stack;
  if (!Array.isArray(stack) || stack.length < 2) return;
  const mine = stack.pop();
  const idx = stack.findIndex((l) => l.route && typeof l.match === "function" && l.match(samplePath));
  stack.splice(idx >= 0 ? idx : stack.length, 0, mine);
}

const DRIP = [
  { id: "m-live-drip-1", game: "VALORANT", t1: ["team-cloud9", "Cloud9", "#00AEEF"], t2: ["team-100-thieves", "100 Thieves", "#FF0000"], s: [7, 9], map: "Lotus", viewers: 240000 },
  { id: "m-live-drip-2", game: "CS2", t1: ["team-heroic", "Heroic", "#2BB673"], t2: ["team-astralis", "Astralis", "#FF1E3C"], s: [4, 6], map: "Nuke", viewers: 200000 },
];
const dripRows = () => DRIP.map((d) => ({
  id: d.id, game: d.game, status: "live",
  team1_id: d.t1[0], team1_name: d.t1[1], team1_logo_url: null, team1_color: d.t1[2],
  team2_id: d.t2[0], team2_name: d.t2[1], team2_logo_url: null, team2_color: d.t2[2],
  tournament_name: null, stage: null, best_of: 1, map_name: d.map,
  scheduled_at: new Date(Date.now() - 18 * 60e3).toISOString(), completed_at: null,
  team1_score: d.s[0], team2_score: d.s[1], round_number: d.s[0] + d.s[1] + 1,
  viewer_count: d.viewers, team1_win_prob: null, team2_win_prob: null, streams: null,
}));

export function register(app) {
  app.get("/api/tournaments/series/:seriesId", (req, res, next) => {
    if (req.params.seriesId === "odds") return next();
    const out = seriesDetail(req.params.seriesId);
    if (!out) return res.status(404).json({ error: "Series not found" });
    res.json(out);
  });
  app.get("/api/tournaments/series/:seriesId/odds", (req, res) => {
    const out = seriesOdds(req.params.seriesId);
    if (!out) return res.status(404).json({ error: "Series not found" });
    res.json(out);
  });

  // seriesFactor on the live model (predictionService.analyzeLiveMatch):
  // the series score and its effects on this game, in the match's sides.
  app.post("/api/predictions/live", (req, res, next) => {
    const matchId = String(req.body?.matchId ?? "");
    const row = matchId.startsWith("m-t-") ? tournamentMatchRows().find((m) => m.id === matchId) : null;
    if (row && row.series_id) {
      const o = seriesOdds(row.series_id);
      const s = row.series;
      const flipped = o && o.team1 && row.team1_id === o.team2?.id;
      const notes = o && o.next_game && o.next_game.number === row.series_game_number ? o.next_game.adjustments : [];
      const adjustments = notes.map((n) => ({ ...n, team: flipped ? (n.team === "team1" ? "team2" : "team1") : n.team }));
      const shift = adjustments.reduce((sum, n) => sum + (n.team === "team1" ? n.points : -n.points), 0);
      const factor = { team1_wins: s.team1_wins, team2_wins: s.team2_wins, best_of: s.best_of, shift, adjustments };
      const json = res.json.bind(res);
      res.json = (body) => json(body && typeof body === "object" ? { ...body, seriesFactor: factor } : body);
    }
    next();
  });
  hoist(app, "/api/predictions/live");

  // Simulator drip games (no tournament) at the top of the viewer-sorted list.
  app.get("/api/matches/live", (req, res, next) => {
    const game = req.query.game ? String(req.query.game) : null;
    const json = res.json.bind(res);
    res.json = (body) => {
      if (!Array.isArray(body)) return json(body);
      const extra = dripRows().filter((d) => !game || d.game === game);
      const out = [...body];
      extra.forEach((d, i) => out.splice(Math.min(out.length, i * 2), 0, d));
      return json(out);
    };
    next();
  });
  hoist(app, "/api/matches/live");

  // The drip games open like any live match (detail, progress, empty stats).
  const drip = (id) => dripRows().find((d) => d.id === id) ?? null;
  app.get("/api/matches/:id", (req, res, next) => { const d = drip(req.params.id); return d ? res.json(d) : next(); });
  hoist(app, "/api/matches/m-live-drip-1");
  app.get("/api/matches/:id/progress", (req, res, next) => {
    const d = drip(req.params.id);
    if (!d) return next();
    res.json({ matchId: d.id, game: d.game, status: "live", series: null, score: { team1Maps: 0, team2Maps: 0, team1Rounds: d.team1_score, team2Rounds: d.team2_score }, currentRound: d.round_number, roundDisplay: `Round ${d.round_number}`, round_history: [] });
  });
  hoist(app, "/api/matches/m-live-drip-1/progress");
  app.get("/api/matches/:id/stats", (req, res, next) => (drip(req.params.id) ? res.json([]) : next()));
  hoist(app, "/api/matches/m-live-drip-1/stats");
}

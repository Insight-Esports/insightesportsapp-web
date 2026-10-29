// mock/routes/premium-links.mjs — live TEAM predictions (parity doc
// 2026-10-28 §11, backend/premium-link-payloads.md § 4). Shapes follow
// predictionService.js analyzeLiveTeamPrediction / analyzeLiveTeamBreakdown:
//   POST /api/predictions/live-team            {matchId, teamId, stat, baseline, direction}
//   POST /api/predictions/live-team-breakdown  {matchId, teamId}
// Live matches come from _matches-data.mjs (ids "m-live-N", team ids
// "team-<slug>"); a match that isn't live, or a team not in it, is a 404.
import { allMatches, TEAMS } from "./_matches-data.mjs";

const DISCLAIMER = "For entertainment purposes only. This is not financial advice.";
const ROSTERS = {
  VALORANT: [["TenZ", "Jett"], ["zekken", "Raze"], ["Sacy", "Sova"], ["johnqt", "Cypher"], ["Zellsis", "Omen"], ["Boaster", "Omen"], ["Derke", "Jett"], ["Alfajer", "Killjoy"], ["Leo", "Sova"], ["Chronicle", "Fade"]],
  CS2: [["ZywOo", null], ["apEX", null], ["flameZ", null], ["mezii", null], ["ropz", null], ["s1mple", null], ["b1t", null], ["jL", null], ["Aleksib", null], ["iM", null]],
  League: [["Zeus", "Aatrox"], ["Oner", "Vi"], ["Faker", "Azir"], ["Gumayusi", "Kai'Sa"], ["Keria", "Renata"], ["Kiin", "K'Sante"], ["Canyon", "Sejuani"], ["Chovy", "Orianna"], ["Peyz", "Zeri"], ["Lehends", "Nautilus"]],
};
const TEAM_KILLS = { VALORANT: 68, CS2: 72, League: 15 };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const round1 = (v) => Math.round(v * 10) / 10;

function liveCtx(req, res) {
  const { matchId, teamId } = req.body ?? {};
  if (!matchId || !teamId) { res.status(400).json({ error: "matchId and teamId are required" }); return null; }
  const m = allMatches().find((x) => x.id === matchId && x.status === "live");
  if (!m) { res.status(404).json({ error: "Match not found or is not currently live" }); return null; }
  if (![m.team1_id, m.team2_id].includes(teamId)) { res.status(404).json({ error: "That team is not in this live match" }); return null; }
  const isTeam1 = m.team1_id === teamId;
  const own = isTeam1 ? m.team1_score : m.team2_score;
  const opp = isTeam1 ? m.team2_score : m.team1_score;
  const game = m.game;
  const expected = game === "League" ? 32 : 24;
  const fractionDone = Math.min(0.99, (game === "League" ? 22 : own + opp) / expected);
  return {
    m, game, isTeam1, own, opp, fractionDone,
    teamName: isTeam1 ? m.team1_name : m.team2_name, opponentName: isTeam1 ? m.team2_name : m.team1_name,
    opponentId: isTeam1 ? m.team2_id : m.team1_id, opponentLogoUrl: (isTeam1 ? m.team2_logo_url : m.team1_logo_url) ?? null,
  };
}

function gameRows(h, ctx, n, vsOnly = false) {
  const others = TEAMS[ctx.game].filter((t) => t.id !== (ctx.isTeam1 ? ctx.m.team1_id : ctx.m.team2_id));
  return Array.from({ length: n }, (_, i) => {
    const opp = vsOnly ? { id: ctx.opponentId, name: ctx.opponentName } : others[Math.floor(h.rand(i * 13 + ctx.own) * others.length)];
    const won = h.rand(i * 7 + 3) > 0.42;
    return {
      statValue: Math.round(TEAM_KILLS[ctx.game] * (0.8 + h.rand(i * 5 + 1) * 0.45)),
      matchDate: h.isoAgo((i + 1) * 3 * 864e5),
      mapName: ctx.game === "League" ? null : ["Ascent", "Bind", "Lotus", "Mirage", "Nuke", "Haven"][i % 6],
      matchup: `${ctx.teamName} vs ${opp.name}`,
      result: won ? "win" : "loss",
      matchId: `m-done-${((i * 11) % 60) + 1}`,
      opponentId: opp.id, opponentName: opp.name, opponentLogoUrl: null,
    };
  });
}

function roster(h, ctx) {
  const all = ROSTERS[ctx.game];
  const mine = ctx.isTeam1 ? all.slice(0, 5) : all.slice(5);
  return mine.map(([name, agent], i) => {
    const k = Math.round((ctx.own + ctx.opp) * (0.55 + h.rand(i * 3 + ctx.own) * 0.5) / (ctx.game === "League" ? 4 : 1.3));
    const d = Math.round((ctx.own + ctx.opp) * (0.5 + h.rand(i * 5 + 2) * 0.4) / (ctx.game === "League" ? 4 : 1.4));
    return {
      playerId: `p-${slug(name)}`, name, imageUrl: null,
      kills: k, deaths: d, assists: Math.round(h.rand(i * 7) * 8), plusMinus: k - d,
      acs: ctx.game === "VALORANT" ? Math.round(160 + h.rand(i * 11) * 140) : null,
      adr: ctx.game === "CS2" ? round1(60 + h.rand(i * 11) * 45) : null,
      agent: ctx.game === "CS2" ? null : agent,
    };
  }).sort((a, b) => b.plusMinus - a.plusMinus || b.kills - a.kills);
}

export function register(app, h) {
  const premium = (req, res, next) => (h.me.is_premium ? next() : res.status(403).json({ error: "This feature requires Insight Pro", code: "PREMIUM_REQUIRED" }));

  app.post("/api/predictions/live-team-breakdown", h.protect, premium, (req, res) => {
    const ctx = liveCtx(req, res);
    if (!ctx) return;
    const players = roster(h, ctx);
    const kills = players.reduce((a, p) => a + (p.kills ?? 0), 0);
    const pm = players.reduce((a, p) => a + (p.plusMinus ?? 0), 0);
    const avgKills = TEAM_KILLS[ctx.game];
    const paceK = round1(avgKills * ctx.fractionDone);
    const vsPaceK = kills >= paceK * 1.1 ? "ahead" : kills <= paceK * 0.9 ? "behind" : "on pace";
    const paceP = round1(5 * ctx.fractionDone);
    const vsPaceP = pm >= paceP + 2 ? "ahead" : pm <= paceP - 2 ? "behind" : "on pace";
    const bestOf = ctx.m.best_of ?? 3;
    const maps = [];
    if (bestOf > 1) {
      maps.push({ number: 1, status: "finished", targetWon: true, rounds: "13 to 9" });
      maps.push({ number: 2, status: "running", targetWon: null, rounds: `${ctx.own} to ${ctx.opp}` });
      for (let n = 3; n <= bestOf; n++) maps.push({ number: n, status: "not_started", targetWon: null, rounds: null });
    } else {
      maps.push({ number: 1, status: "running", targetWon: null, rounds: `${ctx.own} to ${ctx.opp}` });
    }
    const mapsWon = maps.filter((x) => x.targetWon === true).length, mapsLost = maps.filter((x) => x.targetWon === false).length;
    const h2h = { played: 6, wins: 4, losses: 2 };
    const scoreNote = ctx.game === "League" ? "at 22:14" : `${ctx.own} to ${ctx.opp} in rounds`;
    res.json({
      targetType: "team", live: true, matchId: ctx.m.id, teamId: req.body.teamId, team: ctx.teamName, game: ctx.game,
      summary: `${ctx.teamName} are ${scoreNote} vs ${ctx.opponentName} (${Math.round(ctx.fractionDone * 100)}% done, around the midpoint) and are ${vsPaceK === "ahead" ? "ahead of their usual pace" : vsPaceK === "behind" ? "below their usual pace" : "playing roughly to their usual level"}.${bestOf > 1 ? ` The series stands ${mapsWon} to ${mapsLost} in maps (best of ${bestOf}).` : ""} They are ${h2h.wins} and ${h2h.losses} against ${ctx.opponentName} all time.`,
      stats: [
        { stat: "kills", current: kills, careerAverage: avgKills, paceExpected: paceK, projectedFinal: round1(kills + avgKills * (1 - ctx.fractionDone)), vsPace: vsPaceK },
        { stat: "plus_minus", current: pm, careerAverage: 5, paceExpected: paceP, projectedFinal: round1(pm + 5 * (1 - ctx.fractionDone)), vsPace: vsPaceP },
      ],
      players,
      last10Games: gameRows(h, ctx, 10),
      opponentName: ctx.opponentName, opponentId: ctx.opponentId, opponentLogoUrl: ctx.opponentLogoUrl,
      vsOpponentGames: gameRows(h, ctx, 5, true), vsOpponentAverage: 66.4,
      headToHead: h2h,
      strength: { team: 72, opponent: 61 },
      series: { bestOf, mapsWon, mapsLost, maps },
      context: { map: ctx.m.map_name ?? null, score: { team1: ctx.m.team1_score, team2: ctx.m.team2_score }, gameTimeDisplay: ctx.game === "League" ? "22:14" : null, fractionDone: round1(ctx.fractionDone) },
      disclaimer: DISCLAIMER,
      cached: false,
    });
  });

  app.post("/api/predictions/live-team", h.protect, premium, (req, res) => {
    const ctx = liveCtx(req, res);
    if (!ctx) return;
    const { stat, baseline, direction = "over" } = req.body ?? {};
    if (!["kills", "plus_minus"].includes(stat)) return res.status(400).json({ error: `stat must be one of kills, plus_minus for ${ctx.game} teams` });
    const line = Number(baseline);
    if (!Number.isFinite(line)) return res.status(400).json({ error: "baseline must be a number" });
    const players = roster(h, ctx);
    const current = stat === "kills" ? players.reduce((a, p) => a + p.kills, 0) : players.reduce((a, p) => a + p.plusMinus, 0);
    const under = direction === "under";
    if (stat !== "plus_minus") {
      if (!under && current > line) return res.status(400).json({ error: `${ctx.teamName} already have ${current} kills, so this line is already settled. Try a line of ${current} or higher.` });
      if (under && current >= line) return res.status(400).json({ error: `${ctx.teamName} already have ${current} kills, so this line is already settled. Try a line above ${current}.` });
    }
    const avgK = stat === "kills" ? TEAM_KILLS[ctx.game] : 5;
    const projected = round1(current + avgK * (1 - ctx.fractionDone));
    const z = (line - projected) / Math.max(1.5, avgK * 0.18);
    const pUnder = 0.5 * (1 + Math.tanh(z * 0.85));
    const p = Math.min(0.99, Math.max(0.01, under ? pUnder : 1 - pUnder));
    const whole = Math.round(p * 100);
    const last10Games = gameRows(h, ctx, 10);
    const vs = gameRows(h, ctx, 5, true);
    res.json({
      targetType: "team", live: true, matchId: ctx.m.id, teamId: req.body.teamId, team: ctx.teamName, game: ctx.game, stat,
      baseline: line, direction, confidence: whole, probabilityExact: Math.round(p * 1000) / 10,
      prediction: whole > 60 ? "LIKELY" : whole < 40 ? "UNLIKELY" : "TOSS UP",
      summary: `${ctx.teamName} have ${current} ${stat === "kills" ? "kills" : "+/−"} at ${ctx.own} to ${ctx.opp} vs ${ctx.opponentName}, ${Math.round(ctx.fractionDone * 100)}% done. Projecting about ${projected} by the end. Their live chance of ${under ? "under" : "over"} ${line} is ${whole}%.`,
      trend: "STABLE", careerAverage: avgK, last10Average: round1(last10Games.reduce((a, g) => a + g.statValue, 0) / 10), last10Games,
      opponentName: ctx.opponentName, opponentId: ctx.opponentId, opponentLogoUrl: ctx.opponentLogoUrl,
      vsOpponentGames: vs, vsOpponentAverage: round1(vs.reduce((a, g) => a + g.statValue, 0) / vs.length),
      vsOpponentSummary: `${vs.length} prior games vs ${ctx.opponentName}`,
      lowHistory: false, historyWarning: null, liveCurrentValue: current,
      probabilityDisplay: `${whole}% chance of ${under ? "under" : "over"} ${line} ${stat === "kills" ? "kills" : "+/−"} (live)`,
      projection: { currentValue: current, projectedFinal: projected, kind: "total", value: projected },
      disclaimer: DISCLAIMER, cached: false,
    });
  });
}

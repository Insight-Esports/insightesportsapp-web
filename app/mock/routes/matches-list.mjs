// matches-list.mjs — the match LIST endpoints (Home, Schedule, Results):
//   GET /api/matches/live?game=
//   GET /api/matches/upcoming?game=&from=&to=
//   GET /api/matches/completed?game=&team=&limit=&offset=&before=&before_id=&from=&to=
// Rows come from _matches-data.mjs (shared with the detail routes).
import { allMatches } from "./_matches-data.mjs";

const VALID_GAMES = ["VALORANT", "CS2", "League"];
const parseIso = (v) => {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};
const resultTime = (m) => new Date(m.completed_at ?? m.scheduled_at).getTime();

export function register(app, h) {
  app.get("/api/matches/live", h.protect, (req, res) => {
    const game = req.query.game ? String(req.query.game) : null;
    if (game && !VALID_GAMES.includes(game)) return res.status(400).json({ error: `Invalid game. Must be one of: ${VALID_GAMES.join(", ")}` });
    const rows = allMatches()
      .filter((m) => m.status === "live" && (!game || m.game === game))
      .sort((a, b) => (b.viewer_count ?? 0) - (a.viewer_count ?? 0));
    res.json(rows);
  });

  app.get("/api/matches/upcoming", h.protect, (req, res) => {
    const game = req.query.game ? String(req.query.game) : null;
    if (game && !VALID_GAMES.includes(game)) return res.status(400).json({ error: `Invalid game. Must be one of: ${VALID_GAMES.join(", ")}` });
    const from = parseIso(req.query.from);
    const to = parseIso(req.query.to);
    if ((req.query.from && !from) || (req.query.to && !to)) return res.status(400).json({ error: "Invalid date parameter" });
    const rows = allMatches()
      .filter((m) => m.status === "upcoming" && (!game || m.game === game))
      .filter((m) => {
        const t = new Date(m.scheduled_at).getTime();
        if (from && t < from.getTime()) return false;
        if (to && t > to.getTime()) return false;
        return true;
      })
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
    res.json(rows);
  });

  app.get("/api/matches/completed", h.protect, (req, res) => {
    const game = req.query.game ? String(req.query.game) : null;
    if (game && !VALID_GAMES.includes(game)) return res.status(400).json({ error: `Invalid game. Must be one of: ${VALID_GAMES.join(", ")}` });
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const teamId = req.query.team ? String(req.query.team) : null;
    const from = parseIso(req.query.from);
    const to = parseIso(req.query.to);
    const before = parseIso(req.query.before);
    const beforeId = req.query.before_id ? String(req.query.before_id) : null;
    if ((req.query.from && !from) || (req.query.to && !to) || (req.query.before && !before)) return res.status(400).json({ error: "Invalid date parameter" });

    let rows = allMatches()
      .filter((m) => m.status === "completed" && (!game || m.game === game))
      .filter((m) => !teamId || m.team1_id === teamId || m.team2_id === teamId || m.team1_name === teamId || m.team2_name === teamId)
      .filter((m) => {
        const t = resultTime(m);
        if (from && t < from.getTime()) return false;
        if (to && t > to.getTime()) return false;
        return true;
      })
      // Newest first, id as a stable tiebreak — the keyset contract.
      .sort((a, b) => resultTime(b) - resultTime(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));

    if (before) {
      const bt = before.getTime();
      rows = rows.filter((m) => {
        const t = resultTime(m);
        if (t < bt) return true;
        if (t === bt && beforeId) return m.id < beforeId;
        return false;
      });
      res.json(rows.slice(0, limit));
      return;
    }
    res.json(rows.slice(offset, offset + limit));
  });
}

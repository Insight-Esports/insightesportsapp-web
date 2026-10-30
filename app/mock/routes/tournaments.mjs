// tournaments.mjs — the simulated tournaments (backend routes/tournaments.js):
//   GET /api/tournaments/sim/current?game=          the active one (or the last while the break runs)
//   GET /api/tournaments/completed?game=&sim=true   past editions, newest first
//   GET /api/tournaments/:id/bracket                rounds → series → games, odds.teams
//   GET /api/tournaments/:id/odds                   every team's chance per round + title
// The series routes (/api/tournaments/series/:id and /odds) live in
// tournament-series.mjs. Data: ./_tournaments-data.mjs (shared by both).
import { bracketFor, completedForGame, currentForGame, tournamentOddsFor } from "./_tournaments-data.mjs";

const VALID_GAMES = ["VALORANT", "CS2", "League"];

export function register(app) {
  app.get("/api/tournaments/sim/current", (req, res) => {
    const game = req.query.game ? String(req.query.game) : "VALORANT";
    if (!VALID_GAMES.includes(game)) return res.status(400).json({ error: `Invalid game. Must be one of: ${VALID_GAMES.join(", ")}` });
    if (process.env.MOCK_TOURNAMENTS === "none") return res.status(404).json({ error: "No tournament for this game yet", code: "NO_TOURNAMENT" });
    const out = currentForGame(game);
    if (!out) return res.status(404).json({ error: "No tournament for this game yet", code: "NO_TOURNAMENT" });
    res.json(out);
  });

  app.get("/api/tournaments/completed", (req, res) => {
    const game = req.query.game ? String(req.query.game) : "VALORANT";
    const sim = String(req.query.sim || "").toLowerCase();
    if (process.env.MOCK_TOURNAMENTS === "none") return res.json([]);
    // Every tournament here is simulated: ?sim=false finds none.
    res.json(sim === "false" ? [] : completedForGame(game));
  });

  app.get("/api/tournaments/:id/bracket", (req, res) => {
    const out = bracketFor(req.params.id);
    if (!out) return res.status(404).json({ error: "Tournament not found" });
    res.json(out);
  });
  app.get("/api/tournaments/:id/odds", (req, res) => {
    const out = tournamentOddsFor(req.params.id);
    if (!out) return res.status(404).json({ error: "Tournament not found" });
    res.json(out);
  });
}

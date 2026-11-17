// mock/routes/_busy.mjs — a busy server on demand (Nov 12 §4: 503 OVERLOADED
// with Retry-After, what the backend's load shedding and read deadline send).
// Named to sort first among the route modules, so it answers before any
// /api route registered after it.
//
//   POST   /mock/busy  {path?, method?, times?, retryAfter?}
//          Arms a rule: the next `times` (default 1) requests whose path starts
//          with `path` (default "/api/") and whose method is `method` (default
//          any) get 503 {error, code: "OVERLOADED"} with `Retry-After:
//          retryAfter` (default 2; null leaves the header out).
//   GET    /mock/busy  → {rules, hits}: every request seen on a ruled path
//          (armed or spent) with what it was answered and when (ms epoch).
//   DELETE /mock/busy  → clears the rules and the hits.
//
//   MOCK_BUSY="GET /api/matches/live" (env) arms one such rule at start.
//
// No api key needed on /mock/* (outside /api). Nothing is armed by default.

const BODY = { error: "Insight is busy right now. Please try again in a moment.", code: "OVERLOADED" };

let rules = [];
let hits = [];

function arm({ path = "/api/", method = null, times = 1, retryAfter = 2 } = {}) {
  const rule = { path: String(path), method: method ? String(method).toUpperCase() : null, left: Math.max(0, Number(times) || 0), retryAfter: retryAfter == null ? null : String(retryAfter) };
  rules.push(rule);
  return rule;
}

if (process.env.MOCK_BUSY) {
  const [m, p] = process.env.MOCK_BUSY.includes(" ") ? process.env.MOCK_BUSY.split(/\s+/, 2) : [null, process.env.MOCK_BUSY];
  arm({ path: p, method: m });
}

export function register(app) {
  app.post("/mock/busy", (req, res) => res.json({ armed: arm(req.body ?? {}), rules }));
  app.get("/mock/busy", (_req, res) => res.json({ rules, hits }));
  app.delete("/mock/busy", (_req, res) => { rules = []; hits = []; res.json({ ok: true }); });

  app.use("/api", (req, res, next) => {
    const full = req.originalUrl.split("?")[0];
    const ruled = rules.filter((r) => full.startsWith(r.path) && (!r.method || r.method === req.method));
    if (ruled.length === 0) return next();
    const rule = ruled.find((r) => r.left > 0);
    if (!rule) {
      hits.push({ at: Date.now(), method: req.method, path: full, status: "passed" });
      return next();
    }
    rule.left -= 1;
    hits.push({ at: Date.now(), method: req.method, path: full, status: 503, retryAfter: rule.retryAfter });
    if (rule.retryAfter != null) res.set("Retry-After", rule.retryAfter);
    res.status(503).json(BODY);
  });
}

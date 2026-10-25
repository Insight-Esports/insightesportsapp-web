// mock/routes/events.mjs — POST /api/events (Events.swift / lib/events.ts).
// Answers 202 {accepted} like the backend (a 204 would trip the Next proxy,
// which always forwards a body), and keeps the last 200 events so a script
// can check what the web sent:
//   GET /mock/events → [{ name, at, props, session_id, app_version, received_at }]
export function register(app, { protect }) {
  const seen = [];
  app.post("/api/events", protect, (req, res) => {
    const b = req.body ?? {};
    let accepted = 0;
    for (const e of Array.isArray(b.events) ? b.events.slice(0, 50) : []) {
      if (!e || typeof e.name !== "string") continue;
      accepted++;
      seen.push({ name: e.name, at: e.at ?? null, props: e.props ?? null, session_id: b.session_id ?? null, app_version: b.app_version ?? null, received_at: new Date().toISOString() });
    }
    while (seen.length > 200) seen.shift();
    res.status(202).json({ accepted });
  });
  app.get("/mock/events", (_req, res) => res.json(seen));
}

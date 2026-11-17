// scripts/live-push-check.mjs — a stats_update push replaces the live
// scoreboard with no GET /stats (parity N5-11), and a gold_update with its
// points appends to the gold chart with no GET /progress.
// Needs the mock (port 4000) and the app (port 3100) running. The socket is
// routed through Playwright so the check can inject its own pushes.
//   node scripts/live-push-check.mjs [matchId] [shot.png]
import { chromium } from "playwright";

const matchId = process.argv[2] ?? "m-t-c202-11-g2";
const shot = process.argv[3] ?? null;
const base = process.env.BASE_URL ?? "http://localhost:3100/app";
const mock = process.env.MOCK_URL ?? "http://localhost:4000";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--no-proxy-server", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, colorScheme: "dark" });
const page = await ctx.newPage();
let fail = false;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) fail = true; };

// Route the Socket.IO websocket: pass everything through, keep a handle to push frames to the page.
let wsRoute = null;
let joined = false;
await page.routeWebSocket(/\/socket\.io\//, (ws) => {
  wsRoute = ws;
  joined = false;
  const server = ws.connectToServer();
  // The mock's own gold / scoreboard pushes would land mid-check: only ours reach the page.
  server.onMessage((m) => { if (typeof m === "string" && (m.startsWith('42["gold_update"') || m.startsWith('42["stats_update"'))) return; ws.send(m); });
  // Page → server: pass through, and note when the screen joins its match room.
  ws.onMessage((m) => { if (typeof m === "string" && m.startsWith('42["join_match"')) joined = true; server.send(m); });
});
const until = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };
const push = (event, payload) => wsRoute.send(`42${JSON.stringify([event, payload])}`);

const hits = [];
page.on("request", (r) => {
  const u = r.url();
  if (u.includes(`/matches/${matchId}/stats`)) hits.push({ kind: "stats", at: Date.now() });
  if (u.includes(`/matches/${matchId}/progress`)) hits.push({ kind: "progress", at: Date.now() });
});

const r = await ctx.request.post(base + "/api/auth/login", { data: { email: "ivan@insightesportsapp.com", password: "insight" } });
if (!r.ok()) { console.error("login failed", r.status()); process.exit(1); }
await page.goto(`${base}/match/${encodeURIComponent(matchId)}`, { waitUntil: "load", timeout: 45000 });

// 1. stats_update {matchId, stats}: the rows on the push become the scoreboard.
const rows = await (await ctx.request.get(`${mock}/api/matches/${encodeURIComponent(matchId)}/stats`, { headers: { "x-api-key": "mock" } })).json();
check(Array.isArray(rows) && rows.length >= 2, `mock served ${rows.length} stat rows`);
// The screen is up (its scoreboard shows the served rows) and in its match room.
await page.getByText(rows[0].player_name).first().waitFor({ timeout: 30000 });
check(await until(() => joined, 30000), "socket routed through the page and joined match:" + matchId);
await page.waitForTimeout(2000); // opening reads settle
const pushed = rows.map((row, i) => (i === 0 ? { ...row, player_name: "PushedPlayer", kills: "77" } : row));
const t0 = Date.now();
push("stats_update", { matchId, stats: pushed });
const shown = await page.getByText("PushedPlayer").first().waitFor({ timeout: 4000 }).then(() => true, () => false);
check(shown, "stats_update rows replaced the scoreboard (PushedPlayer shown)");
const kills = shown ? await page.locator("text=77").count() : 0;
check(kills > 0, "the pushed kills (77) are on the board");
await page.waitForTimeout(1500);
const statsAfter = hits.filter((h) => h.kind === "stats" && h.at >= t0).length;
check(statsAfter === 0, `no GET /stats after the push (saw ${statsAfter})`);

if (shot) {
  await page.getByText("PushedPlayer").first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: shot, fullPage: false });
  console.log("saved", shot);
}

// 2. gold_update with points (League only): prevMinute <= L appends, no /progress.
if (process.env.GOLD_MATCH) {
  joined = false;
  await page.goto(`${base}/match/${encodeURIComponent(process.env.GOLD_MATCH)}`, { waitUntil: "load", timeout: 45000 });
  check(await until(() => joined, 30000), "League screen joined its room");
  await page.waitForTimeout(3000);
  const prog = await (await ctx.request.get(`${mock}/api/matches/${encodeURIComponent(process.env.GOLD_MATCH)}/progress`, { headers: { "x-api-key": "mock" } })).json();
  const tl = prog.gold_timeline ?? [];
  const L = tl.length ? tl[tl.length - 1].minute : 0;
  const t1 = Date.now();
  hits.length = 0;
  page.on("request", (q) => { if (q.url().includes(`/matches/${process.env.GOLD_MATCH}/progress`)) hits.push({ kind: "gp", at: Date.now() }); });
  push("gold_update", { matchId: process.env.GOLD_MATCH, points: [{ minute: L + 0.2, diff: 4321 }], prevMinute: L });
  await page.waitForTimeout(1200);
  check(hits.filter((h) => h.kind === "gp" && h.at >= t1).length === 0, "gold_update with no gap appended without GET /progress");
  push("gold_update", { matchId: process.env.GOLD_MATCH, points: [{ minute: L + 5, diff: 1 }], prevMinute: L + 3 });
  await page.waitForTimeout(1200);
  check(hits.filter((h) => h.kind === "gp" && h.at >= t1).length >= 1, "gold_update with a gap read /progress");
}

await browser.close();
process.exit(fail ? 1 : 0);

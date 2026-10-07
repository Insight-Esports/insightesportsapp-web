import { chromium } from "playwright";
const base = "http://localhost:3100";
const routes = ["/", "/schedule", "/results", "/match/m-live-2", "/match/m-up-1", "/match/m-done-1",
 "/players", "/players/df5840c9-d473-4921-a7b9-481b2989d000", "/teams", "/teams/team-sentinels", "/news", "/search?q=sen",
 "/premium", "/premium/predict", "/premium/predict/target", "/premium/predict/h2h", "/premium/upgrade", "/weekly-report",
 "/profile", "/profile/edit", "/profile/user-1/followers", "/settings", "/settings/notifications", "/settings/games", "/settings/blocked",
 "/notifications", "/leaderboard", "/messages", "/login", "/forgot-password"];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-proxy-server"] });
for (const [w, h, tag] of [[1280, 900, "d"], [390, 844, "m"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: "dark" });
  const page = await ctx.newPage();
  const errs = {};
  page.on("pageerror", e => (errs[page.url()] ??= []).push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") (errs[page.url()] ??= []).push(m.text().slice(0, 200)); });
  await ctx.request.post(base + "/api/auth/login", { data: { email: "ivan@insightesportsapp.com", password: "insight" } });
  for (const r of routes) {
    const name = (r === "/" ? "home" : r.replace(/^\//, "").replace(/[\/?=&]/g, "_"));
    try {
      await page.goto(base + r, { waitUntil: "load", timeout: 30000 });
      await page.waitForTimeout(1800);
      await page.screenshot({ path: `/tmp/shots/${tag}_${name}.png`, fullPage: true });
      console.log(tag, r, "ok", (errs[page.url()] || []).length ? "ERRS: " + errs[page.url()].join(" | ") : "");
    } catch (e) { console.log(tag, r, "FAIL", e.message.slice(0, 120)); }
  }
  await ctx.close();
}
await browser.close();

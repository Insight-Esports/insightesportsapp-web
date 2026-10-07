// scripts/shot.mjs — screenshot a route of a running server as a logged-in
// team user (mock backend). Usage:
//   BASE_URL=http://localhost:3100 node scripts/shot.mjs /players out.png [width=1280] [height=900] [fullPage=1] [settleMs=1500]
import { chromium } from "playwright";

const [route = "/", out = "shot.png", w = "1280", hgt = "900", full = "1", settle = "1500"] = process.argv.slice(2);
const base = process.env.BASE_URL ?? "http://localhost:3100";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--no-proxy-server", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"],
});
const ctx = await browser.newContext({ viewport: { width: Number(w), height: Number(hgt) }, deviceScaleFactor: 1, colorScheme: "dark" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
const r = await ctx.request.post(base + "/api/auth/login", { data: { email: "ivan@insightesportsapp.com", password: "insight" } });
if (!r.ok()) { console.error("login failed", r.status(), await r.text()); process.exit(1); }
await page.goto(base + route, { waitUntil: "load", timeout: 45000 }).catch((e) => console.error("goto:", e.message));
await page.waitForTimeout(Number(settle));
await page.screenshot({ path: out, fullPage: full === "1" });
console.log("saved", out, `(${w}x${hgt})`, errors.length ? "\nERRORS:\n" + errors.join("\n") : "no console errors");
await browser.close();

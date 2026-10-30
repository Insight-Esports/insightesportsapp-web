// mock/routes/_logos.mjs — team logos for the §5 checks (TeamMark's chain,
// logo memory and the black-logo plate). Sorted first ("_l" < "_m"), so its
// /api middleware wraps every later route's res.json.
//
//   GET /img/:w/:sig/:src     the backend's thumbnail route (src = base64url original)
//   GET /mock-logos/:file     the "originals" (mock/logos/*.png)
//
// Cases (MOCK_LOGOS=off disables the fill):
//   Team Spirit, NRG   black mark on transparent → white plate
//                      (Team Spirit only on match rows: the Teams list row has
//                      no logo, so it shows the remembered one once seen)
//   Natus Vincere, Sentinels   coloured → as is
//   FURIA              its own opaque square → as is
//   Team Vitality      mirror answers the 1×1 placeholder → the original
//   Heroic             mirror answers 500 → one retry → the original
//   MOUZ               mirror and original 404 → letters
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "logos");
const HOST = `http://localhost:${process.env.MOCK_PORT ?? 4000}`;
const PLACEHOLDER = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const b64url = (s) => Buffer.from(s, "utf8").toString("base64url");
const thumb = (file) => `${HOST}/img/128/mocksig${file.length}/${b64url(`${HOST}/mock-logos/${file}`)}`;

// name → { url, matchOnly }
const LOGOS = new Map([
  ["Team Spirit", { url: thumb("spirit.png"), matchOnly: true }],
  ["NRG", { url: thumb("nrg.png") }],
  ["Natus Vincere", { url: thumb("navi.png") }],
  ["Sentinels", { url: thumb("sentinels.png") }],
  ["FURIA", { url: thumb("furia.png") }],
  ["Team Vitality", { url: thumb("vitality.png") }],
  ["Heroic", { url: thumb("heroic.png") }],
  ["MOUZ", { url: thumb("mouz.png") }],
]);
const MIRROR_PLACEHOLDER = new Set(["vitality.png"]);
const MIRROR_500 = new Set(["heroic.png"]);

const MATCH_PREFIXES = ["team1_", "team2_", "opponent_", "player_team_"];
function fill(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 9) return;
  if (Array.isArray(node)) { for (const x of node) fill(x, depth + 1); return; }
  for (const p of [...MATCH_PREFIXES, "team_", ""]) {
    const logoKey = `${p}logo_url`;
    if (!(logoKey in node) || node[logoKey] != null) continue;
    const hit = LOGOS.get(node[`${p}name`]);
    if (!hit || (hit.matchOnly && !MATCH_PREFIXES.includes(p))) continue;
    node[logoKey] = hit.url;
  }
  // Team entities that carry their picture as image_url (alerts, search, report entities).
  if ((node.type === "team" || node.target_type === "team") && "image_url" in node && node.image_url == null) {
    const hit = LOGOS.get(node.name ?? node.target_name);
    if (hit && !hit.matchOnly) node.image_url = hit.url;
  }
  for (const v of Object.values(node)) if (v && typeof v === "object") fill(v, depth + 1);
}

export function register(app) {
  app.get("/mock-logos/:file", (req, res) => {
    const f = join(DIR, req.params.file.replace(/[^a-z0-9._-]/gi, ""));
    if (!existsSync(f)) return res.status(404).end();
    res.set("Content-Type", "image/png").set("Cache-Control", "public, max-age=60").end(readFileSync(f));
  });
  app.get("/img/:w/:sig/:src", (req, res) => {
    let src = "";
    try { src = Buffer.from(req.params.src, "base64url").toString("utf8"); } catch { return res.status(400).end(); }
    const file = src.split("/mock-logos/")[1] ?? "";
    if (MIRROR_PLACEHOLDER.has(file)) return res.set("Content-Type", "image/png").set("Cache-Control", "public, max-age=600").set("X-Cache", "placeholder").end(PLACEHOLDER);
    if (MIRROR_500.has(file)) return res.status(500).set("Cache-Control", "no-store").end();
    const f = join(DIR, file.replace(/[^a-z0-9._-]/gi, ""));
    if (!file || !existsSync(f)) return res.status(404).end();
    res.set("Content-Type", "image/png").set("Cache-Control", "public, max-age=60").set("X-Cache", "hit").end(readFileSync(f));
  });
  if (process.env.MOCK_LOGOS === "off") return;
  app.use("/api", (_req, res, next) => {
    const json = res.json.bind(res);
    res.json = (body) => { try { fill(body); } catch { /* leave it */ } return json(body); };
    next();
  });
}

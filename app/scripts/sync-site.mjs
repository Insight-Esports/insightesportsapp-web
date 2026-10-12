// scripts/sync-site.mjs — copies the marketing site (repo root: index.html,
// privacy.html, …, riot*.txt) into public/site so the Next server can serve
// it at the host root. Runs before every build; a no-op when the repo root
// isn't present (e.g. a Railway build whose root directory is app/), in which
// case the committed copies in public/site are used. Keep editing the root
// files — this script keeps the copies in sync.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const out = resolve(here, "..", "public", "site");

if (!existsSync(join(root, "index.html"))) {
  console.log("[sync-site] repo root not present — using committed public/site");
  process.exit(0);
}
mkdirSync(out, { recursive: true });
let n = 0;
for (const f of readdirSync(root)) {
  if (/\.(html|txt|xml|ico|png|svg|css|js)$/i.test(f) || f === "CNAME") {
    copyFileSync(join(root, f), join(out, f));
    n++;
  }
}
console.log(`[sync-site] copied ${n} file(s) into public/site`);

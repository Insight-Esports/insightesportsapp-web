// team-letters.ts — a team's short letters (iOS TeamMark fallback).
// 1. A 2–4 letter all-caps word in the name (the acronym).
// 2. Otherwise the initials of up to three words, skipping team / esports /
//    esport / gaming / club / gg.
// 3. Otherwise the first three letters.
const SKIP = new Set(["team", "esports", "esport", "gaming", "club", "gg"]);

export function teamLetters(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "";
  const words = n.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const acronym = words.find((w) => w.length >= 2 && w.length <= 4 && w === w.toUpperCase() && /[A-Z]/.test(w));
  if (acronym) return acronym;
  const kept = words.filter((w) => !SKIP.has(w.toLowerCase()));
  // Initials only from real words ("Gen.G" → "GEN", not "GG").
  const real = kept.filter((w) => w.length >= 2);
  if (real.length >= 2 && real.length === kept.length) return real.slice(0, 3).map((w) => w[0]).join("").toUpperCase();
  const base = kept[0] ?? words[0] ?? n;
  return base.slice(0, 3).toUpperCase();
}

/** Logo-memory key: lowercase, accents folded, split on non-alphanumerics,
 *  drop team / esports / esport / gaming / club / gg, joined with "-". */
export function teamNameKey(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !SKIP.has(w))
    .join("-");
}

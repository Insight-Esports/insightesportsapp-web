// reports/types.ts — WeeklyReport / ReportSection / ReportArticle from
// WeeklyReportView.swift, decoded tolerantly (sections may be absent on
// legacy text-only rows, is_saved may be omitted on the latest response).

import { bool, iso, str, type Json } from "@/lib/types";

export interface ReportSection { type: string | null; title: string | null; body: string | null }
export interface ReportArticle { title: string; url: string; imageURL: string | null; source: string | null; publishedAt: string | null }
export interface WeeklyReport {
  id: string;
  reportText: string;
  sections: ReportSection[];
  articles: ReportArticle[];
  headline: string | null;
  generatedAt: string;
  isSaved: boolean;
}

function parseMaybeJson(v: Json): Json {
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return null; } }
  return v;
}

export function normalizeReport(raw: Json): WeeklyReport | null {
  if (!raw || typeof raw !== "object" || raw.id == null) return null;
  const sections = parseMaybeJson(raw.sections);
  const articles = parseMaybeJson(raw.articles);
  return {
    id: String(raw.id),
    reportText: str(raw.report_text) ?? str(raw.reportText) ?? "",
    sections: Array.isArray(sections) ? sections.filter((s) => s && typeof s === "object").map((s: Json) => ({ type: str(s.type), title: str(s.title), body: str(s.body) })) : [],
    articles: Array.isArray(articles) ? articles.filter((a) => a && typeof a === "object" && a.url).map((a: Json) => ({ title: str(a.title) ?? "", url: String(a.url), imageURL: str(a.image_url) ?? str(a.imageURL), source: str(a.source), publishedAt: str(a.published_at) ?? str(a.publishedAt) })) : [],
    headline: str(raw.headline),
    generatedAt: iso(raw.generated_at) ?? iso(raw.generatedAt) ?? new Date().toISOString(),
    isSaved: bool(raw.is_saved ?? raw.isSaved),
  };
}
export function normalizeReports(raw: Json): WeeklyReport[] {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.reports) ? raw.reports : Array.isArray(raw?.data) ? raw.data : [];
  return arr.map(normalizeReport).filter((r: WeeklyReport | null): r is WeeklyReport => !!r);
}

/** GET /reports/latest: { report, is_stale, can_generate } — or a bare report. */
export interface LatestEnvelope { report: WeeklyReport | null; isStale: boolean | null; canGenerate: boolean }
export function normalizeLatest(raw: Json): LatestEnvelope {
  if (raw && typeof raw === "object" && ("report" in raw || "can_generate" in raw || "is_stale" in raw)) {
    return { report: normalizeReport(raw.report), isStale: typeof raw.is_stale === "boolean" ? raw.is_stale : null, canGenerate: raw.can_generate == null ? true : bool(raw.can_generate) };
  }
  return { report: normalizeReport(raw), isStale: null, canGenerate: true };
}

/** "Week of Jun 16" */
export function weekLabel(r: WeeklyReport): string {
  return `Week of ${new Date(r.generatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

/** The saved row's story line: the headline, else the first 90 chars of prose. */
export function reportStory(r: WeeklyReport): string {
  const h = r.headline?.trim();
  if (h) return h;
  const source = r.reportText || r.sections[0]?.body || "";
  const trimmed = source.trim();
  return trimmed.slice(0, 90) + (trimmed.length > 90 ? "…" : "");
}

/** "2h ago" / "3d ago"-style stamp (RelativeDateTimeFormatter, abbreviated). */
export function publishedLabel(a: ReportArticle): string | null {
  if (!a.publishedAt) return null;
  const d = new Date(a.publishedAt);
  if (Number.isNaN(d.getTime())) return null;
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return `${Math.floor(s / (86400 * 7))}w ago`;
}

// ── Relevance placement ──
// Each article lands in the ONE section whose prose shares the most
// meaningful headline words with it; ties go to the earlier section;
// articles with no real overlap fall to MORE FROM THE NEWS.
const STOPWORDS = new Set([
  "with", "from", "that", "this", "after", "before", "their", "they",
  "have", "will", "into", "over", "about", "what", "when", "where",
  "team", "teams", "match", "game", "games", "week", "week's", "the",
  "and", "for", "his", "her", "who", "why", "how", "new", "news",
  "esports", "valorant", "league", "legends", "counter", "strike",
  "cs2", "player", "players", "roster", "season", "tournament",
  "first", "last", "against", "between", "final", "finals",
]);
function keywords(text: string): Set<string> {
  const cleaned = text.toLowerCase().replace(/[^a-z0-9' ]/g, " ");
  return new Set(cleaned.split(" ").filter((w) => w.length >= 4 && !STOPWORDS.has(w)));
}
export function placeArticles(r: WeeklyReport): { bySection: Map<number, ReportArticle[]>; unmatched: ReportArticle[] } {
  const sectionWords = r.sections.map((s) => keywords(s.body ?? ""));
  const bySection = new Map<number, ReportArticle[]>();
  const placed = new Set<string>();
  for (const a of r.articles) {
    const words = keywords(a.title);
    if (words.size === 0) continue;
    let best: { index: number; score: number } | null = null;
    sectionWords.forEach((sw, i) => {
      let score = 0;
      for (const w of words) if (sw.has(w)) score++;
      if (score > (best?.score ?? 0)) best = { index: i, score };
    });
    if (best && (best as { score: number }).score >= 1) {
      const idx = (best as { index: number }).index;
      bySection.set(idx, [...(bySection.get(idx) ?? []), a]);
      placed.add(a.url);
    }
  }
  return { bySection, unmatched: r.articles.filter((a) => !placed.has(a.url)) };
}

// NewsScreen — NewsView.swift.
//
// Esports news articles filtered by game. Game tabs: All, VALORANT, CS2,
// League. The first article is featured; articles open in a new tab (the
// app's in-app Safari sheet). All news is free — no premium gating.
// Game lives in the URL (?game=).
"use client";

import { Newspaper } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import { clsx, timeAgo } from "@/lib/format";
import { GAMES, normalizeArticle, type GameId, type Json, type NewsArticle } from "@/lib/types";
import { EmptyState, GamePill, GameTabBar, Img, LoadFailure, Page, SkeletonBar, TabHeader } from "@/components/ui";
import { HeaderTools } from "@/components/shell/AppShell";
import { useQueryParams } from "@/features/players/useQueryParams";

function asGame(v: string | null): GameId {
  return v === "CS2" || v === "League" || v === "VALORANT" ? v : "all";
}
function normalizeArticles(raw: Json): NewsArticle[] {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.articles) ? raw.articles : [];
  const out: NewsArticle[] = [];
  for (const r of arr) { try { if (r?.url || r?.id) out.push(normalizeArticle(r)); } catch { /* skip */ } }
  return out;
}
/** Only https links open (the app refuses anything else). */
function safeHref(url: string): string | null {
  try { return new URL(url).protocol === "https:" ? url : null; } catch { return null; }
}

export function NewsScreen() {
  const { params, set } = useQueryParams();
  const game = asGame(params.get("game"));
  const { data, loading, error, connectionProblem, reload } = useFetch<NewsArticle[]>(
    async (signal) => normalizeArticles(await api.get(endpoints.news(game === "all" ? "all" : game), { signal })),
    [game],
  );

  let content;
  if (loading && !data) {
    content = (
      <div className="px-4 pt-3 flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => <NewsCardSkeleton key={i} />)}
      </div>
    );
  } else if (error && !data) {
    content = <LoadFailure error={error} connectionProblem={connectionProblem} onRetry={reload} />;
  } else if (!data || data.length === 0) {
    content = <div className="py-16"><EmptyState icon={<Newspaper />} title="No news available" subtitle="Check back soon for the latest esports news" /></div>;
  } else {
    const [featured, ...rest] = data;
    content = (
      <div className="px-4 pt-3 grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start">
        <FeaturedNewsCard article={featured} />
        <div className="flex flex-col gap-3">
          {rest.map((a) => <NewsCard key={a.id} article={a} />)}
        </div>
      </div>
    );
  }

  return (
    <Page>
      <TabHeader title="News" tools={<HeaderTools />} />
      <GameTabBar selected={game} onChange={(g) => set({ game: g === "all" ? null : g }, { push: true })} games={GAMES} className="pt-2" />
      {content}
    </Page>
  );
}

function Dateline({ article, className }: { article: NewsArticle; className?: string }) {
  return (
    <div className={clsx("flex items-center gap-2", className)}>
      <span className="text-[10px] font-semibold tracking-[1px] text-muted uppercase truncate">{article.source} · {timeAgo(article.publishedAt)}</span>
      <span className="flex-1" />
      {article.game ? <GamePill game={article.game} /> : null}
    </div>
  );
}

function ArticlePlaceholder({ size }: { size: number }) {
  return <span className="grid place-items-center w-full h-full"><Newspaper size={size} className="text-violet/50" /></span>;
}

function FeaturedNewsCard({ article }: { article: NewsArticle }) {
  const href = safeHref(article.url);
  const Tag = href ? "a" : "div";
  return (
    <Tag {...(href ? { href, target: "_blank", rel: "noopener noreferrer" } : {})} className="flex flex-col gap-3 p-3 rounded-[14px] bg-card border border-border-subtle hover:border-border-strong transition-colors">
      <span className="block h-[180px] lg:h-[260px] rounded-[10px] overflow-hidden" style={{ background: "linear-gradient(135deg, rgb(124 92 252 / 0.4), var(--card))" }}>
        <Img src={article.imageURL} alt="" fallback={<ArticlePlaceholder size={40} />} fit="cover" className="w-full h-full" />
      </span>
      <div className="flex flex-col gap-2 px-1 pb-1">
        <Dateline article={article} />
        <span className="t-headline-md text-primary line-clamp-3">{article.title}</span>
        {article.description ? <span className="t-body-sm text-secondary line-clamp-2">{article.description}</span> : null}
        <span className="text-[10px] font-semibold tracking-[1.4px] text-violet">READ</span>
      </div>
    </Tag>
  );
}

function NewsCard({ article }: { article: NewsArticle }) {
  const href = safeHref(article.url);
  const Tag = href ? "a" : "div";
  return (
    <Tag {...(href ? { href, target: "_blank", rel: "noopener noreferrer" } : {})} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border-subtle hover:border-border-strong transition-colors">
      <span className="block size-20 shrink-0 rounded-lg overflow-hidden" style={{ background: "linear-gradient(135deg, rgb(124 92 252 / 0.3), var(--surface))" }}>
        <Img src={article.imageURL} alt="" fallback={<ArticlePlaceholder size={20} />} fit="cover" className="w-full h-full" />
      </span>
      <div className="flex flex-col gap-1.5 min-w-0 flex-1">
        <Dateline article={article} />
        <span className="t-headline-sm text-primary line-clamp-3">{article.title}</span>
      </div>
    </Tag>
  );
}

function NewsCardSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border-subtle">
      <span className="size-20 shrink-0 rounded-lg bg-surface" />
      <div className="flex flex-col gap-2 flex-1"><SkeletonBar height={12} /><SkeletonBar height={12} width="85%" /><SkeletonBar width={80} height={10} /></div>
    </div>
  );
}

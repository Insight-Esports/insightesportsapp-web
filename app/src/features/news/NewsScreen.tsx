// NewsScreen — NewsView.swift.
//
// Esports news articles filtered by game. Game tabs: All, VALORANT, CS2,
// League. Laid out as a front page: the newest article is the hero (big
// 16:9 picture, source · time, display headline, standfirst), the rest a
// newspaper grid (1 → 2 → 3 columns). Articles open in a new tab (the
// app's in-app Safari sheet). All news is free — no premium gating.
// Game lives in the URL (?game=).
"use client";

import { Newspaper } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import { useReveal } from "@/lib/use-reveal";
import { clsx, timeAgo } from "@/lib/format";
import { GAMES, normalizeArticle, type GameId, type Json, type NewsArticle } from "@/lib/types";
import { EmptyState, GamePill, GameTabBar, Img, LoadFailure, Page, TabHeader } from "@/components/ui";
import { SkeletonFeaturedNewsCard, SkeletonNewsCard } from "@/components/ui/skeletons";
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
    { cacheKey: `news:${game}` },
  );

  // NewsView: six card silhouettes until `hasLoaded` — and, here, until the
  // first page's pictures are warm so the cards appear with their images.
  const revealed = useReveal(loading, () => (data ?? []).map((a) => a.imageURL));

  let content;
  if (!revealed) {
    content = (
      <div className="px-4 pt-4 flex flex-col gap-6">
        <SkeletonFeaturedNewsCard />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonNewsCard key={i} />)}
        </div>
      </div>
    );
  } else if (error && !data) {
    content = <LoadFailure error={error} connectionProblem={connectionProblem} onRetry={reload} />;
  } else if (!data || data.length === 0) {
    content = <div className="py-16"><EmptyState icon={<Newspaper />} title="No news available" subtitle="Check back soon for the latest esports news" /></div>;
  } else {
    // Front page: the newest story as the hero, the rest in a newspaper grid.
    const [featured, ...rest] = data;
    content = (
      <div className="px-4 pt-4 flex flex-col gap-6">
        <FeaturedNewsCard article={featured} />
        {rest.length > 0 ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="t-kicker">Latest</span>
              <span className="flex-1 hairline-b" />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2 2xl:grid-cols-3 items-stretch">
              {rest.map((a) => <NewsCard key={a.id} article={a} />)}
            </div>
          </div>
        ) : null}
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
    <div className={clsx("flex items-center gap-2 min-w-0", className)}>
      <span className="text-[10px] font-semibold tracking-[1px] text-muted uppercase truncate">{article.source} · {timeAgo(article.publishedAt)}</span>
      <span className="flex-1" />
      {article.game ? <GamePill game={article.game} /> : null}
    </div>
  );
}

function ArticlePlaceholder({ size }: { size: number }) {
  return <span className="grid place-items-center w-full h-full"><Newspaper size={size} className="text-violet/50" /></span>;
}

/** 16:9 picture block; the surface tone shows while the picture loads or when there is none. */
function ArticleImage({ article, placeholder, className }: { article: NewsArticle; placeholder: number; className?: string }) {
  return (
    <span className={clsx("block w-full aspect-video overflow-hidden bg-surface", className)}>
      <Img src={article.imageURL} alt="" fallback={<ArticlePlaceholder size={placeholder} />} fit="cover" className="w-full h-full" />
    </span>
  );
}

function articleLinkProps(url: string) {
  const href = safeHref(url);
  return { Tag: (href ? "a" : "div") as "a" | "div", props: href ? { href, target: "_blank", rel: "noopener noreferrer" } : {} };
}

/** The front-page hero: the newest story, picture on top, display headline beneath. */
function FeaturedNewsCard({ article }: { article: NewsArticle }) {
  const { Tag, props } = articleLinkProps(article.url);
  return (
    <Tag {...props} className="group flex flex-col rounded-2xl bg-card border border-border-subtle hover:border-border-strong transition-colors overflow-hidden">
      {/* Same shape as before, just shorter: the picture caps at 260px and a
          story with no picture gets a slim placeholder strip, not a 16:9 void. */}
      <ArticleImage article={article} placeholder={28} className={article.imageURL ? "max-h-[200px] lg:max-h-[260px]" : "!aspect-auto h-16"} />
      <div className="flex flex-col gap-2 px-4 py-3.5 lg:px-5 lg:py-4">
        <Dateline article={article} />
        <span className="t-headline-lg text-primary line-clamp-2 group-hover:text-violet-light transition-colors">{article.title}</span>
        {article.description ? <span className="t-body-md text-secondary line-clamp-2 max-w-[72ch]">{article.description}</span> : null}
        <span className="text-[10px] font-semibold tracking-[1.4px] text-violet pt-0.5">READ</span>
      </div>
    </Tag>
  );
}

/** Grid story: picture, source · time, headline, a short description. */
function NewsCard({ article }: { article: NewsArticle }) {
  const { Tag, props } = articleLinkProps(article.url);
  return (
    <Tag {...props} className="group flex flex-col h-full rounded-xl bg-card border border-border-subtle hover:border-border-strong transition-colors overflow-hidden">
      <ArticleImage article={article} placeholder={24} />
      <div className="flex flex-col gap-1.5 px-3.5 pt-3 pb-3.5 flex-1">
        <Dateline article={article} />
        <span className="t-headline-sm text-primary line-clamp-3 group-hover:text-violet-light transition-colors">{article.title}</span>
        {article.description ? <span className="t-body-sm text-secondary line-clamp-2">{article.description}</span> : null}
      </div>
    </Tag>
  );
}

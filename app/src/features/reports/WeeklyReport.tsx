// reports/WeeklyReport.tsx — WeeklyReportView: the premium Weekly Report at
// /weekly-report. This Week (premium-gated) shows the current Claude-written
// report with Save/Unsave and on-demand generation; Saved stays accessible to
// lapsed subscribers (they keep what they saved).
//
// URL: ?tab=saved · ?tab=saved&id=<report> (a saved report's detail).
// Wide screens: the report beside the saved-reports ledger.
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bookmark, BookmarkX, ChevronLeft, ChevronRight, CirclePlus, Trash2 } from "lucide-react";
import { api, ApiError, endpoints } from "@/lib/api";
import { clsx } from "@/lib/format";
import { AssetIcon, ConfirmDialog, FilterSegment, Img, Page, Spinner } from "@/components/ui";
import { PremiumGate } from "@/features/premium/PremiumGate";
import { normalizeLatest, normalizeReport, normalizeReports, placeArticles, publishedLabel, reportStory, weekLabel, type ReportArticle, type WeeklyReport } from "./types";

type Tab = "week" | "saved";

export function WeeklyReportScreen() {
  const sp = useSearchParams();
  const router = useRouter();
  const tab: Tab = sp.get("tab") === "saved" ? "saved" : "week";
  const savedId = sp.get("id");
  const vm = useWeeklyReport();

  const setTab = (t: Tab) => router.replace(t === "saved" ? "/weekly-report?tab=saved" : "/weekly-report");
  const openSaved = (id: string) => router.push(`/weekly-report?tab=saved&id=${encodeURIComponent(id)}`);
  const selectedSaved = savedId ? vm.saved.find((r) => r.id === savedId) ?? null : null;

  const thisWeek = (
    <PremiumGate feature="weeklyReport">
      <CurrentReport vm={vm} />
    </PremiumGate>
  );
  const savedList = <SavedList reports={vm.saved} onOpen={openSaved} selectedId={savedId} />;
  const savedDetail = selectedSaved ? <SavedReportDetail report={selectedSaved} vm={vm} onBack={() => setTab("saved")} /> : null;

  return (
    <Page wide>
      <div className="flex items-center gap-2 px-3 pt-3">
        <button type="button" onClick={() => router.back()} aria-label="Back" className="grid place-items-center size-8 rounded-lg text-secondary hover:text-primary hover:bg-card"><ChevronLeft size={20} /></button>
        <span className="t-headline-sm text-primary">Weekly Report</span>
      </div>

      {/* Phones / tablets: the segmented toggle. */}
      <div className="lg:hidden flex flex-col">
        <div className="px-4 pt-3 pb-2"><FilterSegment options={[{ label: "This Week", value: "week" as Tab }, { label: "Saved", value: "saved" as Tab }]} value={tab} onChange={setTab} /></div>
        {tab === "week" ? thisWeek : savedDetail ?? savedList}
      </div>

      {/* Desktop: report beside the saved ledger. */}
      <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6 px-4 pt-3">
        <div className="min-w-0">{savedDetail ?? thisWeek}</div>
        <aside className="min-w-0 flex flex-col gap-2.5">
          <span className="t-kicker px-1">Saved reports</span>
          {savedList}
        </aside>
      </div>

      <SaveFirstDialog open={vm.pendingGeneratePrompt} onChoice={(saveFirst) => vm.confirmGenerate(saveFirst)} onCancel={() => vm.setPendingGeneratePrompt(false)} />
    </Page>
  );
}

// ── This week ─────────────────────────────────────────────────────────────
function CurrentReport({ vm }: { vm: ReturnType<typeof useWeeklyReport> }) {
  const r = vm.current;
  if (vm.isGenerating) {
    return (
      <div className="flex flex-col items-center gap-3.5 py-20 px-11 text-center">
        <Spinner size={26} />
        <span className="t-headline-sm text-primary">Writing your week…</span>
        <span className="t-body-sm text-muted max-w-sm">Pulling together your teams, players, and the week&apos;s stories. This takes about ten seconds.</span>
      </div>
    );
  }
  if (vm.isLoading && !r) {
    return <div className="flex flex-col items-center gap-4 py-20"><Spinner /><span className="t-body-md text-muted">Loading your report…</span></div>;
  }
  if (!r) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 px-9 text-center">
        <span className="t-headline-sm text-primary">No report yet</span>
        <span className="t-body-sm text-muted max-w-sm">{vm.error ?? "We couldn't put your report together. Check your connection and try again."}</span>
        <button type="button" onClick={vm.requestGenerate} className="btn-pill mt-1">Try again</button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4 px-4 lg:px-0 pt-3 max-w-[720px]">
      <div className="flex items-center gap-2.5">
        <span className="relative grid place-items-center size-11 rounded-xl bg-violet-gradient shrink-0"><span className="absolute inset-0 rounded-xl bg-white/14" /><AssetIcon name="weeklyreport" height={30} className="relative" /></span>
        <span className="flex flex-col gap-1">
          <span className="t-headline-sm text-primary">{weekLabel(r)}</span>
          <span className="violet-rule w-[22px]" />
          <span className="text-[10px] font-semibold tracking-[0.14em] text-muted">YOUR WEEK IN ESPORTS</span>
        </span>
      </div>

      <ReportBody report={r} />

      <button type="button" onClick={() => vm.toggleSave(r)} className={clsx("flex items-center justify-center gap-2 w-full py-3.5 rounded-xl t-label-lg transition-colors", r.isSaved ? "bg-card border border-violet text-violet hover:bg-surface/60" : "bg-violet text-white hover:brightness-110")}>
        <Bookmark size={16} className={r.isSaved ? "fill-violet" : undefined} />{r.isSaved ? "Saved" : "Save this report"}
      </button>

      {vm.regenerateAvailable ? (
        <button type="button" onClick={vm.requestGenerate} className="w-full py-3.5 rounded-xl bg-violet text-white t-label-lg hover:brightness-110 transition">Get this week&apos;s report</button>
      ) : null}
      {vm.error ? <span className="t-label-sm text-error">{vm.error}</span> : null}
      <p className="t-label-sm text-muted text-center pt-1">Generated from your watchlist and prediction activity this week.</p>
    </div>
  );
}

// ── Report body ───────────────────────────────────────────────────────────
// Structured sections when the report has them; the plain text blob for
// legacy rows. One accent (violet) on every section's bar; sections are told
// apart by their kickers.
function kickerFor(type: string | null): string | null {
  switch (type) {
    case "teams": return "YOUR TEAMS";
    case "players": return "YOUR PLAYERS";
    case "your_week": return "YOUR WEEK";
    case "news": return "AROUND THE SCENE";
    default: return null;
  }
}

export function ReportBody({ report }: { report: WeeklyReport }) {
  const headline = report.headline?.trim();
  const { bySection, unmatched } = placeArticles(report);
  const total = report.sections.length === 0 ? report.reportText.length : report.sections.map((s) => s.body ?? "").join("").length;
  const isThin = total > 0 && total < 320;

  return (
    <div className="flex flex-col gap-3">
      {headline ? (
        <div className="flex flex-col gap-2 pb-1">
          <span className="t-label-sm font-semibold tracking-[0.14em] text-muted">THIS WEEK&apos;S STORY</span>
          <span className="font-rounded text-[22px] font-black text-primary leading-tight">{headline}</span>
          <span className="violet-rule w-7" />
        </div>
      ) : null}

      {report.sections.length === 0 ? (
        <div className="p-[18px] rounded-[14px] bg-card border border-border-subtle t-body-lg text-primary whitespace-pre-line leading-[1.6]">{report.reportText}</div>
      ) : (
        <div className="flex flex-col gap-5">
          {report.sections.map((s, i) => {
            const kicker = kickerFor(s.type);
            const matched = bySection.get(i) ?? [];
            return (
              <section key={i} className="flex items-stretch p-4 rounded-[14px] bg-card border border-border-subtle">
                <span className="w-[3px] rounded-[2px] bg-violet shrink-0 my-0.5" />
                <div className="flex flex-col gap-2 pl-3 min-w-0">
                  {kicker ? <span className="t-label-sm font-semibold tracking-[0.14em] text-muted">{kicker}</span> : null}
                  {s.title ? <span className="font-rounded text-[19px] font-bold text-primary leading-tight">{s.title}</span> : null}
                  {s.body ? <p className="t-body-md text-secondary whitespace-pre-line leading-[1.7]">{s.body}</p> : null}
                  {matched.length ? <div className="pt-1"><ArticleLedger articles={matched} /></div> : null}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {unmatched.length ? (
        <div className="flex flex-col gap-2.5">
          <span className="t-label-sm font-bold tracking-[0.12em] text-muted">MORE FROM THE NEWS</span>
          <ArticleLedger articles={unmatched} />
        </div>
      ) : null}

      {isThin ? (
        <div className="flex flex-col gap-2.5 px-1">
          <span className="t-label-sm text-muted">Quiet week — reports grow richer as the teams and players you follow play more matches.</span>
          <Link href="/teams" className="flex items-center gap-1.5 t-label-md text-violet hover:underline"><CirclePlus size={13} />Follow more teams to make your report yours</Link>
        </div>
      ) : null}
    </div>
  );
}

/** Articles as one sharp ledger: striped rows, one bordered container. */
function ArticleLedger({ articles }: { articles: ReportArticle[] }) {
  return (
    <div className="ledger">
      {articles.map((a, i) => {
        const when = publishedLabel(a);
        return (
          <a key={a.url} href={a.url} target="_blank" rel="noreferrer" className={clsx("flex items-center gap-3 px-3 py-2.5 hover:bg-surface/60 transition-colors", i % 2 === 0 ? "bg-card" : "bg-surface/50", i > 0 && "border-t border-border-subtle")}>
            {a.imageURL ? <span className="size-11 rounded-lg overflow-hidden bg-surface shrink-0"><Img src={a.imageURL} alt="" fallback={<span className="block size-11 bg-surface" />} fit="cover" className="size-11" /></span> : null}
            <span className="flex flex-col gap-1 min-w-0">
              <span className="t-label-md text-primary line-clamp-2">{a.title}</span>
              <span className="flex items-center gap-1.5 t-label-sm">
                {a.source ? <span className="text-violet">{a.source}</span> : null}
                {when ? <><span className="text-muted">•</span><span className="text-muted">{when}</span></> : null}
              </span>
            </span>
            <span className="flex-1" />
            <ArrowUpRight size={11} className="text-muted shrink-0" />
          </a>
        );
      })}
    </div>
  );
}

// ── Saved ─────────────────────────────────────────────────────────────────
function SavedList({ reports, onOpen, selectedId }: { reports: WeeklyReport[]; onOpen: (id: string) => void; selectedId: string | null }) {
  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 px-10 text-center">
        <BookmarkX size={40} className="text-muted" />
        <span className="t-headline-sm text-primary">No saved reports</span>
        <span className="t-body-sm text-muted">Tap Save on a weekly report to keep it here.</span>
      </div>
    );
  }
  return (
    <div className="px-4 lg:px-0 pt-3 lg:pt-0">
      <div className="ledger">
        <div className="flex items-center gap-1 px-3 py-1.5 t-label-sm text-muted uppercase"><span className="w-[78px]">WEEK</span><span className="flex-1">STORY</span></div>
        {reports.map((r, i) => (
          <button key={r.id} type="button" onClick={() => onOpen(r.id)} className={clsx("flex items-center gap-1 w-full px-3 py-2.5 text-left hover:bg-surface/60 transition-colors", i % 2 === 0 ? "bg-card" : "bg-surface/50", selectedId === r.id && "bg-violet/10")}>
            <span className="w-[78px] t-label-sm text-muted line-clamp-2 shrink-0">{weekLabel(r)}</span>
            <span className="flex-1 t-body-sm text-primary line-clamp-2">{reportStory(r)}</span>
            <ChevronRight size={11} className="text-muted shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

function SavedReportDetail({ report, vm, onBack }: { report: WeeklyReport; vm: ReturnType<typeof useWeeklyReport>; onBack: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div className="flex flex-col gap-4 px-4 lg:px-0 pt-3 max-w-[720px]">
      <button type="button" onClick={onBack} className="lg:hidden flex items-center gap-1 t-label-md text-secondary hover:text-primary self-start"><ChevronLeft size={14} />Saved Report</button>
      <div className="flex flex-col gap-1 pt-1">
        <span className="font-rounded text-[28px] font-black text-primary leading-none">Weekly Report</span>
        <span className="violet-rule w-7 my-1" />
        <span className="t-label-md text-secondary">{weekLabel(report)}</span>
      </div>
      <ReportBody report={report} />
      <button type="button" onClick={() => { vm.toggleSave(report); onBack(); }} className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-card border border-error/40 text-error t-label-lg hover:bg-surface/60 transition-colors">
        <BookmarkX size={16} />Remove from Saved
      </button>
      <button type="button" onClick={() => setConfirmDelete(true)} className="flex items-center justify-center gap-2 t-label-md text-muted hover:text-error self-center"><Trash2 size={13} />Delete report</button>
      <ConfirmDialog open={confirmDelete} title="Delete this report?" message="This permanently deletes the report. It can't be recovered." confirmTitle="Delete" destructive onConfirm={() => { setConfirmDelete(false); vm.deleteSaved(report); onBack(); }} onCancel={() => setConfirmDelete(false)} />
    </div>
  );
}

/** "Save your current report?" — the three-way confirmation before regenerating. */
function SaveFirstDialog({ open, onChoice, onCancel }: { open: boolean; onChoice: (saveFirst: boolean) => void; onCancel: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4" role="alertdialog" aria-modal>
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl bg-card border border-hairline p-5 flex flex-col gap-3">
        <span className="t-headline-sm text-primary">Save your current report?</span>
        <span className="t-body-sm text-secondary">Generating a new report replaces this one. Unsaved reports can&apos;t be recovered.</span>
        <div className="flex flex-col gap-2 mt-2">
          <button type="button" onClick={() => onChoice(true)} className="btn-pill !py-2">Save it, then generate</button>
          <button type="button" onClick={() => onChoice(false)} className="btn-ghost !py-2 !text-error">Generate without saving</button>
          <button type="button" onClick={onCancel} className="btn-ghost !py-2">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── View model ────────────────────────────────────────────────────────────
function useWeeklyReport() {
  const [current, setCurrent] = useState<WeeklyReport | null>(null);
  const [saved, setSaved] = useState<WeeklyReport[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [isGenerating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canGenerate, setCanGenerate] = useState(true);
  const [pendingGeneratePrompt, setPendingGeneratePrompt] = useState(false);
  const loaded = useRef(false);
  const generating = useRef(false);

  // Manual generation (weekly server-side limit; premium-gated server-side too).
  const generate = useCallback(async (): Promise<WeeklyReport | null> => {
    if (generating.current) return null;
    generating.current = true;
    setGenerating(true); setError(null);
    try {
      const r = await api.post<{ report?: unknown }>(endpoints.generateWeeklyReport, {});
      const report = normalizeReport(r?.report);
      if (report) { setCurrent(report); setCanGenerate(false); return report; }
      return null;
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.isForbidden) setError("Weekly reports are part of Insight Premium.");
        else if (e.isRateLimited) setError("A new report isn't available yet — reports generate once per week.");
        else if (e.status >= 400 && e.status < 500) setError(e.message);
        else setError("Couldn't generate your report. Please try again.");
      } else setError("Couldn't generate your report. Please try again.");
      return null;
    } finally {
      generating.current = false;
      setGenerating(false);
    }
  }, []);

  const load = useCallback(async (force = false) => {
    if (!force && loaded.current) return;
    loaded.current = true;
    setLoading(true);
    let cur: WeeklyReport | null = null;
    try {
      const env = normalizeLatest(await api.get(endpoints.latestReport));
      cur = env.report;
      setCanGenerate(env.canGenerate);
    } catch { cur = null; }
    let rows: WeeklyReport[] = [];
    try { rows = normalizeReports(await api.get(endpoints.savedReports)).map((r) => ({ ...r, isSaved: true })); } catch { rows = []; }
    if (cur && rows.some((r) => r.id === cur!.id)) cur = { ...cur, isSaved: true };
    setSaved(rows);
    setCurrent(cur);
    setLoading(false);
    // LAZY GENERATION: no report at all → generate now (the 5-15s state shows).
    if (!cur) await generate();
  }, [generate]);

  useEffect(() => { void load(); }, [load]);

  const toggleSave = useCallback(async (report: WeeklyReport) => {
    const nowSaved = !report.isSaved;
    setCurrent((c) => (c?.id === report.id ? { ...c, isSaved: nowSaved } : c));
    setSaved((s) => (nowSaved ? (s.some((r) => r.id === report.id) ? s : [{ ...report, isSaved: true }, ...s]) : s.filter((r) => r.id !== report.id)));
    try {
      await api.post(nowSaved ? endpoints.saveReport(report.id) : endpoints.unsaveReport(report.id), {});
    } catch {
      setCurrent((c) => (c?.id === report.id ? { ...c, isSaved: !nowSaved } : c));
      setSaved((s) => (nowSaved ? s.filter((r) => r.id !== report.id) : [{ ...report, isSaved: true }, ...s]));
    }
  }, []);

  const deleteSaved = useCallback(async (report: WeeklyReport) => {
    let previous: WeeklyReport[] = [];
    setSaved((s) => { previous = s; return s.filter((r) => r.id !== report.id); });
    try { await api.delete(endpoints.deleteReport(report.id)); }
    catch { setSaved(previous); }
  }, []);

  const requestGenerate = useCallback(() => {
    if (current && !current.isSaved) setPendingGeneratePrompt(true);
    else void generate();
  }, [current, generate]);

  const confirmGenerate = useCallback(async (savingCurrent: boolean) => {
    setPendingGeneratePrompt(false);
    if (savingCurrent && current && !current.isSaved) await toggleSave(current);
    await generate();
  }, [current, generate, toggleSave]);

  return { current, saved, isLoading, isGenerating, error, regenerateAvailable: canGenerate, pendingGeneratePrompt, setPendingGeneratePrompt, requestGenerate, confirmGenerate, toggleSave, deleteSaved };
}

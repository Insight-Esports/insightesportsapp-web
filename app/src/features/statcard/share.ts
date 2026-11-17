// share.ts — the card as a picture to send (PlayerCardPicture): the same
// blocks as the screen, on the app's ground, under the app's mark and the
// day of the game, with insightesportsapp.com at the foot. A Premium
// sharer's picture adds the first five rows of the comparison under
// "INSIGHT PREMIUM". Drawn on a canvas at 3× (no dependency, nothing on it
// loads or moves), then handed to the Web Share API as a PNG file when the
// browser can share files, else downloaded.
"use client";

import { imageSrc } from "@/components/ui";
import { withBase } from "@/lib/base-path";
import { gamePillLabel, matchResultTime } from "@/lib/types";
import { logoSources, rememberedLogo } from "@/lib/logo-memory";
import { measurePlate, PLATE_INSET } from "@/lib/logo-plate";
import { teamLetters } from "@/lib/team-letters";
import {
  deltaText, gridRows, hasRead, isDimmed, rowTone, settled, shareTitle, statLabel, statText, usualText, verdictTone,
  VERDICT_LABEL, type CardCell, type CardModel, type Tone, type UsualReading,
} from "./model";

const W = 360;          // the picture's width in CSS px (iOS: 360 pt)
const PAD = 18;
const SCALE = 3;

interface Theme {
  bg: string; card: string; surface: string; border: string;
  primary: string; secondary: string; muted: string;
  violet: string; violetLight: string; success: string; error: string; live: string; team2: string; gold: string;
  sans: string; mono: string; rounded: string;
}

function theme(): Theme {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    bg: v("--bg", "#0a0a0f"), card: v("--card", "#13131a"), surface: v("--surface", "#1c1c26"), border: v("--border-subtle", "rgb(124 92 252 / 0.15)"),
    primary: v("--text-primary", "#f0f0f8"), secondary: v("--text-secondary", "#9ca3af"), muted: v("--text-muted", "#6b7280"),
    violet: v("--violet", "#7c5cfc"), violetLight: v("--violet-light", "#a78bfa"), success: v("--success", "#22c55e"), error: v("--error", "#ef4444"),
    live: v("--live", "#dc2626"), team2: v("--team2", "#ff6b35"), gold: v("--gold", "#f5a623"),
    sans: getComputedStyle(document.body).fontFamily || "system-ui, sans-serif",
    mono: v("--font-mono", "ui-monospace, Menlo, Consolas, monospace"),
    rounded: v("--font-rounded", "system-ui, sans-serif"),
  };
}

// ── Pictures (loaded before drawing: nothing on a picture can wait) ─────────
interface Logo { img: HTMLImageElement; plate: boolean }
interface Pictures { brand: HTMLImageElement | null; portrait: HTMLImageElement | null; team1: Logo | null; team2: Logo | null }

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const sameOrigin = src.startsWith("/") || src.startsWith(window.location.origin);
    // Another origin only counts when it allows reading (else the canvas would be tainted).
    if (!sameOrigin) img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    const t = setTimeout(() => resolve(null), 5000);
    img.onload = () => { clearTimeout(t); resolve(img.naturalWidth > 1 || img.naturalHeight > 1 ? img : null); };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = src;
  });
}

/** A team's logo as TeamMark finds it: from its address (mirror, then original), else the last one this browser showed for the team. */
async function loadLogo(raw: string | null, name: string): Promise<Logo | null> {
  const chain = logoSources(raw, imageSrc);
  const remembered = rememberedLogo(name);
  if (remembered && remembered !== raw) for (const s of logoSources(remembered, imageSrc, true)) if (!chain.some((c) => c.src === s.src)) chain.push(s);
  for (const step of chain) {
    const img = await loadImage(step.src);
    if (img) return { img, plate: measurePlate(img) === true };
  }
  return null;
}

async function loadPictures(m: CardModel): Promise<Pictures> {
  const photo = imageSrc(m.photoURL);
  const [brand, portrait, team1, team2] = await Promise.all([
    loadImage(withBase("/brand/logo-insight.png")),
    photo ? loadImage(photo) : Promise.resolve(null),
    loadLogo(m.match.team1LogoURL, m.match.team1Name),
    loadLogo(m.match.team2LogoURL, m.match.team2Name),
  ]);
  return { brand, portrait, team1, team2 };
}

// ── Drawing helpers ─────────────────────────────────────────────────────────
type Ctx = CanvasRenderingContext2D;
interface TextStyle { size: number; weight?: number; color: string; family?: string; align?: CanvasTextAlign; tracking?: number }

function setFont(ctx: Ctx, t: Theme, s: TextStyle) {
  ctx.font = `${s.weight ?? 400} ${s.size}px ${s.family ?? t.sans}`;
  const c = ctx as Ctx & { letterSpacing?: string };
  if ("letterSpacing" in c) c.letterSpacing = `${s.tracking ?? 0}px`;
}
function fit(ctx: Ctx, text: string, maxW: number): string {
  if (maxW <= 0) return "";
  if (ctx.measureText(text).width <= maxW) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (ctx.measureText(text.slice(0, mid) + "…").width <= maxW) lo = mid; else hi = mid - 1; }
  return text.slice(0, lo).trimEnd() + "…";
}
/** Draws one line centred on `cy`; returns its width. */
function text(ctx: Ctx, t: Theme, s: string, x: number, cy: number, style: TextStyle, maxW = Infinity): number {
  setFont(ctx, t, style);
  const shown = fit(ctx, s, maxW);
  ctx.fillStyle = style.color;
  ctx.textAlign = style.align ?? "left";
  ctx.textBaseline = "middle";
  ctx.fillText(shown, x, cy);
  return ctx.measureText(shown).width;
}
function measure(ctx: Ctx, t: Theme, s: string, style: TextStyle): number {
  setFont(ctx, t, style);
  return ctx.measureText(s).width;
}
function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
function rule(ctx: Ctx, t: Theme, x: number, y: number, w: number) {
  ctx.fillStyle = t.border;
  ctx.fillRect(x, y, w, 1);
}
const toneColor = (t: Theme, tone: Tone) => (tone === "good" ? t.success : tone === "bad" ? t.error : t.secondary);

/** Wraps `s` into lines no wider than `maxW`. */
function wrap(ctx: Ctx, t: Theme, s: string, style: TextStyle, maxW: number): string[] {
  setFont(ctx, t, style);
  const words = s.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(next).width > maxW) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function drawCrest(ctx: Ctx, t: Theme, logo: Logo | null, name: string, x: number, y: number, size: number) {
  const r = size * 0.2;
  ctx.save();
  rrect(ctx, x, y, size, size, r);
  ctx.clip();
  if (logo) {
    let inset = 0;
    if (logo.plate) { ctx.fillStyle = "rgb(255 255 255 / 0.92)"; ctx.fillRect(x, y, size, size); inset = size * PLATE_INSET; }
    const box = size - inset * 2;
    const k = Math.min(box / logo.img.naturalWidth, box / logo.img.naturalHeight);
    const w = logo.img.naturalWidth * k, h = logo.img.naturalHeight * k;
    ctx.drawImage(logo.img, x + (size - w) / 2, y + (size - h) / 2, w, h);
    ctx.restore();
    return;
  }
  ctx.fillStyle = t.surface;
  ctx.fillRect(x, y, size, size);
  ctx.restore();
  ctx.strokeStyle = t.border;
  ctx.lineWidth = 1;
  rrect(ctx, x + 0.5, y + 0.5, size - 1, size - 1, r);
  ctx.stroke();
  const letters = teamLetters(name);
  text(ctx, t, letters, x + size / 2, y + size / 2 + 0.5, { size: Math.max(7, size * 0.34), weight: 600, color: t.secondary, align: "center" }, size - 3);
}

function drawPortrait(ctx: Ctx, t: Theme, img: HTMLImageElement | null, name: string, x: number, y: number, size: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  if (img) {
    const k = Math.max(size / img.naturalWidth, size / img.naturalHeight);
    const w = img.naturalWidth * k, h = img.naturalHeight * k;
    ctx.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
  } else {
    ctx.fillStyle = t.surface;
    ctx.fillRect(x, y, size, size);
    text(ctx, t, name.slice(0, 2).toUpperCase(), x + size / 2, y + size / 2 + 0.5, { size: size * 0.32, weight: 600, color: t.secondary, align: "center" });
  }
  ctx.restore();
  ctx.strokeStyle = t.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2 - 0.5, 0, Math.PI * 2);
  ctx.stroke();
}

/** ↗ → ↘ for the verdict. */
function drawArrow(ctx: Ctx, color: string, x: number, cy: number, dir: "up" | "flat" | "down") {
  const s = 9;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (dir === "flat") {
    ctx.moveTo(x, cy); ctx.lineTo(x + s, cy);
    ctx.moveTo(x + s - 4, cy - 4); ctx.lineTo(x + s, cy); ctx.lineTo(x + s - 4, cy + 4);
  } else {
    const y0 = dir === "up" ? cy + s / 2 : cy - s / 2, y1 = dir === "up" ? cy - s / 2 : cy + s / 2;
    ctx.moveTo(x, y0); ctx.lineTo(x + s, y1);
    ctx.moveTo(x + s - 6, y1); ctx.lineTo(x + s, y1); ctx.lineTo(x + s, dir === "up" ? y1 + 6 : y1 - 6);
  }
  ctx.stroke();
  ctx.restore();
}

// ── Blocks (each returns its height; `draw` false only measures) ────────────
function identityBlock(ctx: Ctx, t: Theme, m: CardModel, p: Pictures, x: number, y: number, w: number, draw: boolean): number {
  const h = 80;
  if (!draw) return h;
  drawPortrait(ctx, t, p.portrait, m.name, x + 14, y + 14, 52);
  const tx = x + 14 + 52 + 12, tw = w - (tx - x) - 14;
  const hasDetail = !!m.detail;
  text(ctx, t, m.name, tx, hasDetail ? y + 31 : y + 40, { size: 20, weight: 600, color: t.primary }, tw);
  if (hasDetail) {
    let dx = tx;
    if (m.teamName) {
      const logo = m.side === 1 ? p.team1 : m.side === 2 ? p.team2 : null;
      drawCrest(ctx, t, logo, m.teamName, dx, y + 47, 16);
      dx += 22;
    }
    text(ctx, t, m.detail, dx, y + 55, { size: 12, weight: 500, color: t.secondary }, tw - (dx - tx));
  }
  return h;
}

function scoreBlock(ctx: Ctx, t: Theme, m: CardModel, p: Pictures, x: number, y: number, w: number, draw: boolean): number {
  const h = 104;
  if (!draw) return h;
  const left = x + 14, right = x + w - 14;
  let cx = left;
  const cy = y + 12 + 8;
  if (m.isLive) {
    ctx.fillStyle = t.live;
    ctx.beginPath(); ctx.arc(cx + 3.5, cy, 3.5, 0, Math.PI * 2); ctx.fill();
    cx += 12;
    cx += text(ctx, t, "Live", cx, cy, { size: 12, weight: 500, color: t.live }) + 6;
  } else if (m.isFinal) {
    const style: TextStyle = { size: 9, weight: 700, color: t.muted };
    const tw = measure(ctx, t, "FINAL", style);
    ctx.fillStyle = t.surface;
    rrect(ctx, cx, cy - 7, tw + 12, 14, 7); ctx.fill();
    text(ctx, t, "FINAL", cx + 6, cy + 0.5, style);
    cx += tw + 12 + 6;
  }
  const tint = m.match.game === "VALORANT" ? t.live : m.match.game === "CS2" ? t.team2 : m.match.game === "League" ? t.gold : t.violet;
  cx += text(ctx, t, gamePillLabel(m.match.game), cx, cy, { size: 10, weight: 900, color: tint, family: t.rounded }) + 6;
  text(ctx, t, m.context, cx, cy, { size: 11, weight: 500, color: t.muted }, right - cx);

  const team = (side: 1 | 2, ty: number) => {
    const dim = isDimmed(m, side);
    const name = side === 1 ? m.match.team1Name : m.match.team2Name;
    drawCrest(ctx, t, side === 1 ? p.team1 : p.team2, name, left, ty, 22);
    const score = m.score ? String(side === 1 ? m.score.team1 : m.score.team2) : "–";
    const sw = text(ctx, t, score, right, ty + 11, { size: 18, weight: 900, color: dim ? t.muted : t.primary, family: t.rounded, align: "right" });
    text(ctx, t, name, left + 32, ty + 11, { size: 16, color: dim ? t.secondary : t.primary }, right - sw - 8 - (left + 32));
  };
  team(1, y + 12 + 16 + 10);
  team(2, y + 12 + 16 + 10 + 22 + 10);
  return h;
}

function cellRow(ctx: Ctx, t: Theme, cells: CardCell[], x: number, w: number, top: number, large: boolean) {
  const cw = w / cells.length;
  cells.forEach((c, i) => {
    const mid = x + cw * i + cw / 2;
    const valueH = large ? 28 : 20;
    text(ctx, t, c.text, mid, top + valueH / 2, { size: large ? 24 : 16, weight: large ? 700 : 600, color: c.marquee ? t.violet : t.primary, family: t.mono, align: "center" }, cw - 4);
    text(ctx, t, statLabel(c.stat).toUpperCase(), mid, top + valueH + (large ? 4 : 3) + 5.5, { size: 9, weight: 700, color: t.muted, align: "center", tracking: 0.8 }, cw - 4);
  });
}

function headlineBlock(ctx: Ctx, t: Theme, m: CardModel, x: number, y: number, w: number, draw: boolean): number {
  const h = 16 + 28 + 4 + 11 + 16;
  if (draw && m.headline.length) cellRow(ctx, t, m.headline, x + 10, w - 20, y + 16, true);
  return h;
}

function gridBlock(ctx: Ctx, t: Theme, m: CardModel, x: number, y: number, w: number, draw: boolean): number {
  const rows = gridRows(m.more);
  const rowH = 20 + 3 + 11;
  const h = 14 + rows.length * rowH + Math.max(0, rows.length - 1) * 14 + 14;
  if (draw) rows.forEach((r, i) => cellRow(ctx, t, r, x + 10, w - 20, y + 14 + i * (rowH + 14), false));
  return h;
}

function readBlock(ctx: Ctx, t: Theme, m: CardModel, x: number, y: number, w: number, draw: boolean): number {
  const left = x + 14, inner = w - 28;
  let cy = y + 14;
  let any = false;
  const u = m.usual;
  if (u.kind === "ready") {
    const tone = verdictTone(u.reading.verdict);
    const color = toneColor(t, tone);
    if (draw) {
      drawArrow(ctx, color, left, cy + 8.5, tone === "good" ? "up" : tone === "bad" ? "down" : "flat");
      text(ctx, t, VERDICT_LABEL[u.reading.verdict], left + 16, cy + 8.5, { size: 14, weight: 500, color }, inner - 16);
    }
    cy += 17 + 6;
    if (draw) text(ctx, t, `${m.isLive ? "So far, against" : "Against"} their last ${u.reading.games} games`, left, cy + 6.5, { size: 11, weight: 500, color: t.muted }, inner);
    cy += 13;
    any = true;
  } else if (u.kind === "tooEarly" || u.kind === "notEnough") {
    if (draw) text(ctx, t, u.kind === "tooEarly" ? "Too early to compare with their usual." : "Not enough games yet to know their usual.", left, cy + 8, { size: 12, weight: 500, color: t.muted }, inner);
    cy += 16;
    any = true;
  }
  if (m.standing.length) {
    const style: TextStyle = { size: 11, weight: 500, color: t.secondary };
    const lines = wrap(ctx, t, m.standing.join(" · "), style, inner);
    if (any) cy += 6;
    for (const line of lines) {
      if (draw) text(ctx, t, line, left, cy + 6.5, style, inner);
      cy += 14;
    }
  }
  return cy - y + 14;
}

/** The card's face, top to bottom; returns its height. */
function face(ctx: Ctx, t: Theme, m: CardModel, p: Pictures, x: number, y: number, w: number, draw: boolean): number {
  let cy = y;
  const block = (fn: (dy: number, d: boolean) => number, ruled: boolean) => {
    if (ruled) { if (draw) rule(ctx, t, x, cy, w); cy += 1; }
    cy += fn(cy, draw);
  };
  if (draw) {
    // The card's ground; its border goes on last, over the blocks.
    const total = face(ctx, t, m, p, x, y, w, false);
    ctx.fillStyle = t.card;
    rrect(ctx, x, y, w, total, 14); ctx.fill();
    ctx.save();
    rrect(ctx, x, y, w, total, 14); ctx.clip();
  }
  block((dy, d) => identityBlock(ctx, t, m, p, x, dy, w, d), false);
  block((dy, d) => scoreBlock(ctx, t, m, p, x, dy, w, d), true);
  block((dy, d) => headlineBlock(ctx, t, m, x, dy, w, d), true);
  if (m.more.length) block((dy, d) => gridBlock(ctx, t, m, x, dy, w, d), true);
  if (hasRead(m)) block((dy, d) => readBlock(ctx, t, m, x, dy, w, d), true);
  if (draw) {
    ctx.restore();
    ctx.strokeStyle = t.border;
    ctx.lineWidth = 1;
    rrect(ctx, x + 0.5, y + 0.5, w - 1, cy - y - 1, 14);
    ctx.stroke();
  }
  return cy - y;
}

/** "VERSUS USUAL · INSIGHT PREMIUM", the line, and the first five rows of the table. */
function usualBlock(ctx: Ctx, t: Theme, r: UsualReading, isLive: boolean, x: number, y: number, w: number, draw: boolean): number {
  const rows = r.rows.slice(0, 5);
  const tableH = 25 + rows.length * 36;
  const h = 12 + 8 + 16 + 8 + tableH;
  if (!draw) return h;
  text(ctx, t, "VERSUS USUAL", x, y + 6, { size: 10, weight: 600, color: t.muted, tracking: 1.2 });
  text(ctx, t, "INSIGHT PREMIUM", x + w, y + 6, { size: 9, weight: 700, color: t.violetLight, tracking: 0.8, align: "right" });
  text(ctx, t, `Better than ${r.better} of their last ${r.games} games`, x, y + 20 + 8, { size: 13, color: t.secondary }, w);

  const top = y + 12 + 8 + 16 + 8;
  ctx.save();
  rrect(ctx, x, top, w, tableH, 12); ctx.clip();
  // Columns: stat (rest) · now/final 52 · usual 52 · bar 48 · ± 46, 4 apart, 12 in from each side.
  const r0 = x + w - 12;
  const cDelta = r0, cBar = r0 - 46 - 4, cUsual = cBar - 48 - 4, cValue = cUsual - 52 - 4;
  const head: TextStyle = { size: 11, weight: 500, color: t.muted };
  text(ctx, t, "STAT", x + 12, top + 12.5, head);
  text(ctx, t, isLive ? "NOW" : "FINAL", cValue, top + 12.5, { ...head, align: "right" });
  text(ctx, t, "USUAL", cUsual, top + 12.5, { ...head, align: "right" });
  text(ctx, t, "±", cDelta, top + 12.5, { ...head, align: "right" });
  rows.forEach((row, i) => {
    const ry = top + 25 + i * 36;
    ctx.fillStyle = i % 2 === 0 ? t.card : t.surface;
    ctx.fillRect(x, ry, w, 36);
    const cy = ry + 18;
    const color = toneColor(t, rowTone(row));
    const mono = (s: string, rx: number, c: string) => text(ctx, t, s, rx, cy, { size: 13, weight: 500, color: c, family: t.mono, align: "right" }, 52);
    text(ctx, t, statLabel(row.stat), x + 12, cy, { size: 13, color: t.primary }, cValue - 52 - 4 - (x + 12));
    mono(statText(row.stat, row.value), cValue, t.violet);
    mono(usualText(row.stat, row.usual), cUsual, t.secondary);
    // The bar: a hairline across, the middle tick, and the lean from the middle.
    const mid = cBar - 24;
    ctx.fillStyle = "rgb(107 114 128 / 0.25)";
    ctx.fillRect(mid - 22.5, cy - 0.5, 45, 1);
    ctx.fillStyle = t.muted;
    ctx.fillRect(mid - 0.5, cy - 5.5, 1, 11);
    if (row.lean !== 0) {
      const len = Math.max(2, 22 * Math.min(Math.abs(row.lean), 1));
      ctx.fillStyle = color;
      rrect(ctx, row.lean < 0 ? mid - 0.5 - len : mid + 0.5, cy - 2.5, len, 5, 2.5); ctx.fill();
    }
    mono(deltaText(row.stat, row.value - row.usual), cDelta, color);
  });
  ctx.restore();
  ctx.strokeStyle = t.border;
  ctx.lineWidth = 1;
  rrect(ctx, x + 0.5, top + 0.5, w - 1, tableH - 1, 12);
  ctx.stroke();
  return h;
}

/** The whole picture; returns its height. */
function picture(ctx: Ctx, t: Theme, m: CardModel, p: Pictures, showsUsual: boolean, draw: boolean): number {
  const x = PAD, w = W - PAD * 2;
  let y = PAD;
  if (draw) {
    if (p.brand) { ctx.save(); rrect(ctx, x, y, 22, 22, 22 * 0.22); ctx.clip(); ctx.drawImage(p.brand, x, y, 22, 22); ctx.restore(); }
    const day = new Date(matchResultTime(m.match)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const dw = text(ctx, t, day, x + w, y + 11, { size: 11, weight: 500, color: t.muted, align: "right" });
    text(ctx, t, "Insight Esports", x + 30, y + 11, { size: 14, weight: 600, color: t.primary }, w - 30 - dw - 8);
  }
  y += 22 + 14;
  y += face(ctx, t, m, p, x, y, w, draw);
  if (showsUsual && m.usual.kind === "ready" && m.usual.reading.rows.length) {
    y += 14;
    y += usualBlock(ctx, t, m.usual.reading, m.isLive, x, y, w, draw);
  }
  y += 14;
  if (draw) text(ctx, t, "insightesportsapp.com", W / 2, y + 6.5, { size: 11, weight: 500, color: t.muted, align: "center" });
  y += 13 + PAD;
  return y;
}

/** The card as a PNG. */
export async function renderCardPicture(model: CardModel, showsUsual: boolean): Promise<Blob | null> {
  const m = settled(model);
  const t = theme();
  try { await document.fonts?.ready; } catch { /* no font loading API */ }
  const pics = await loadPictures(m);
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return null;
  const h = Math.ceil(picture(probe, t, m, pics, showsUsual, false));
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = h * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, W, h);
  picture(ctx, t, m, pics, showsUsual, true);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

function fileName(m: CardModel): string {
  const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `${slug(m.name) || "player"}-stat-card.png`;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type ShareOutcome = "shared" | "downloaded" | "cancelled" | "failed";

/** The picture, then the system's share sheet (files) — or a download where the browser can't share files. */
export async function shareCardPicture(model: CardModel, showsUsual: boolean): Promise<ShareOutcome> {
  const blob = await renderCardPicture(model, showsUsual);
  if (!blob) return "failed";
  const name = fileName(model);
  const file = new File([blob], name, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: shareTitle(model) });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // NotAllowedError (the click's activation ran out while drawing) and the like: save it instead.
    }
  }
  download(blob, name);
  return "downloaded";
}

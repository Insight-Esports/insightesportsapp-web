// logo-plate.ts — the light plate behind a purely black logo (§5; Ivan's
// request: Team Spirit's all-black mark vanishes on the dark UI).
//
// The plate is only for a black logo on a transparent ground. The test, on a
// 16×16 sample of the decoded image:
//   · a pixel is SOLID at alpha ≥ 0.5 (anything less counts as clear);
//   · a solid pixel is BLACK when its brightest channel (un-premultiplied —
//     getImageData already is) is under 0.3 and its channels are within 0.1
//     of each other;
//   · plate when ≥ 90% of the solid pixels are black AND at least 1/8 of all
//     pixels are clear.
// Coloured or white logos, and logos on their own square, show as they are.
// Needs a readable canvas: only same-origin images (the /api/img mirror) are
// tested; an unreadable cross-origin fallback simply gets no plate. The
// verdict is cached per URL in memory and in localStorage.

const SIDE = 16;
const STORE_KEY = "insight.logoPlate.v1";
const MAX_ENTRIES = 1500;

/** Plate fill and logo inset (fractions of the mark's size). */
export const PLATE_FILL = "rgb(255 255 255 / 0.92)";
export const PLATE_INSET = 0.12;

let verdicts: Map<string, boolean> | null = null;

function load(): Map<string, boolean> {
  if (verdicts) return verdicts;
  verdicts = new Map();
  if (typeof window === "undefined") return verdicts;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const obj = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    if (obj && typeof obj === "object") for (const [k, v] of Object.entries(obj)) if (v === 1 || v === 0) verdicts.set(k, v === 1);
  } catch { /* private mode / bad JSON */ }
  return verdicts;
}

function save(map: Map<string, boolean>) {
  try {
    const obj: Record<string, 0 | 1> = {};
    for (const [k, v] of map) obj[k] = v ? 1 : 0;
    window.localStorage.setItem(STORE_KEY, JSON.stringify(obj));
  } catch { /* quota / blocked */ }
}

/** The cached verdict for this URL: true (plate), false (as is), undefined (not tested yet). */
export function cachedPlate(url: string): boolean | undefined {
  if (typeof window === "undefined") return undefined;
  return load().get(url);
}

/** Runs the 16×16 test on a loaded image. null when the pixels can't be read. */
export function measurePlate(img: CanvasImageSource): boolean | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = SIDE;
  canvas.height = SIDE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  let data: Uint8ClampedArray;
  try {
    ctx.clearRect(0, 0, SIDE, SIDE);
    ctx.drawImage(img, 0, 0, SIDE, SIDE);
    data = ctx.getImageData(0, 0, SIDE, SIDE).data;
  } catch {
    return null;   // tainted (cross-origin) or not decodable
  }
  let solid = 0, black = 0, clear = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] / 255 >= 0.5) {
      solid += 1;
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
      if (hi < 0.3 && hi - lo <= 0.1) black += 1;
    } else {
      clear += 1;
    }
  }
  return solid > 0 && black >= 0.9 * solid && clear >= (SIDE * SIDE) / 8;
}

/** Cached verdict, or the test run now and cached. Unreadable → false, not cached. */
export function plateFor(img: HTMLImageElement, url: string): boolean {
  const hit = cachedPlate(url);
  if (hit !== undefined) return hit;
  const v = measurePlate(img);
  if (v === null) return false;
  const map = load();
  map.set(url, v);
  while (map.size > MAX_ENTRIES) { const oldest = map.keys().next().value; if (oldest === undefined) break; map.delete(oldest); }
  save(map);
  return v;
}

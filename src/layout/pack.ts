import type { Tile } from '../model';
import { imageBoxWidth, tileHeight } from '../render/tiles';
import { stripMarkup } from '../text/markup';
import { font } from '../text/fonts';

// Auto layout: a seeded masonry/skyline packer. Tiles span 1..n columns; each
// is dropped where the skyline is lowest. With autoSize, the body text size is
// binary-searched so the collage fills the print area as densely as possible.

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: T[], seed: number): T[] {
  const r = rng(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Slot {
  tile: Tile;
  col: number;
  span: number;
  h: number;
}

interface Attempt {
  slots: Slot[];
  height: number;
  gap: number;
}
function spanFor(t: Tile, cols: number, colW: number, gap: number, b: number, r: number): number {
  let s: number;
  switch (t.type) {
    case 'title': {
      const need = font('serif').measure(t.text, b * t.scale * 2.1) * 1.02;
      s = 1;
      while (s < cols && s * colW + (s - 1) * gap < need) s++;
      if (r > 0.75) s++;
      break;
    }
    case 'text': {
      const len = stripMarkup(t.markup).length * t.scale;
      s = len < 140 ? 1 : len < 320 ? 2 : 3;
      if (r > 0.8) s++;
      else if (r < 0.15) s--;
      break;
    }
    case 'image':
      s = t.image.aspect >= 1.3 ? 2 : t.image.aspect < 0.85 ? 1 : r > 0.5 ? 2 : 1;
      if (r > 0.88) s++;
      break;
    case 'infobox':
      s = r > 0.6 ? 2 : 1;
      break;
  }
  return Math.max(1, Math.min(s, cols, Math.max(2, Math.ceil(cols * 0.67))));
}

function attempt(tiles: Tile[], area: Box, b: number, seed: number): Attempt {
  const gap = b * 1.1;
  const cols = Math.max(1, Math.round((area.w + gap) / (b * 15 + gap)));
  const colW = (area.w - (cols - 1) * gap) / cols;
  const r = rng(seed);
  const heights = new Array<number>(cols).fill(0);
  const slots: Slot[] = [];
  for (const t of tiles) {
    const span = spanFor(t, cols, colW, gap, b, r());
    const tie = r();
    const w = span * colW + (span - 1) * gap;
    const h = tileHeight(t, w, b);
    let best = 0;
    let bestTop = Infinity;
    const starts = Array.from({ length: cols - span + 1 }, (_, i) => i);
    // Rotate start order by the tie-breaker so equal skylines are chosen randomly.
    const off = Math.floor(tie * starts.length);
    for (const c of [...starts.slice(off), ...starts.slice(0, off)]) {
      const top = Math.max(...heights.slice(c, c + span));
      if (top < bestTop - 1e-6) {
        bestTop = top;
        best = c;
      }
    }
    const y = bestTop === 0 ? 0 : bestTop + gap;
    for (let c = best; c < best + span; c++) heights[c] = y + h;
    slots.push({ tile: { ...t, x: area.x + best * (colW + gap), y, w, rot: 0 }, col: best, span, h });
  }
  return { slots, height: Math.max(0, ...heights), gap };
}

/** Largest body size at which this variant fits, with its layout. */
function fit(tiles: Tile[], area: Box, seed: number): { b: number; res: Attempt } | null {
  let lo = 0.6;
  let hi = Math.min(area.w, area.h) / 6;
  let best: { b: number; res: Attempt } | null = null;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const a = attempt(tiles, area, mid, seed);
    if (a.height <= area.h) {
      best = { b: mid, res: a };
      lo = mid;
    } else hi = mid;
  }
  return best;
}

/**
 * Close vertical holes: an image tile with free space below it (up to the next
 * tile in its columns or the bottom) grows taller by cropping its picture,
 * like Wikipedia's fixed-size thumbnails do.
 */
function fillHoles(res: Attempt, bottom: number, b: number): void {
  for (const s of res.slots) {
    const t = s.tile;
    if (t.type !== 'image') continue;
    let limit = bottom;
    for (const o of res.slots) {
      if (o === s || o.tile.y <= t.y) continue;
      if (o.col < s.col + s.span && s.col < o.col + o.span) limit = Math.min(limit, o.tile.y - res.gap);
    }
    const free = limit - (t.y + s.h);
    if (free < b * 0.5) continue;
    const iw = imageBoxWidth(t, b);
    const ih = iw / t.image.aspect;
    const grow = Math.min(free, ih * 0.8); // crop at most to ~55% of the original aspect
    s.tile = { ...t, boxAspect: iw / (ih + grow) };
    s.h += grow;
  }
}

export interface ArrangeResult {
  tiles: Tile[];
  baseSize: number;
  overflow: boolean;
}

const VARIANTS = 6;

/**
 * Lay out `tiles` (in the given order) inside `area`.
 * With `autoSize`, tries a few span variants and picks the one that allows the
 * largest body size (mm); otherwise uses `baseSize`.
 */
export function arrange(tiles: Tile[], area: Box, opts: { baseSize: number; autoSize: boolean; seed: number }): ArrangeResult {
  if (!tiles.length) return { tiles, baseSize: opts.baseSize, overflow: false };
  // Start from uncropped images so repeated arranging does not accumulate crops.
  const clean = tiles.map((t) => (t.type === 'image' && t.boxAspect ? { ...t, boxAspect: undefined } : t));
  let b = opts.baseSize;
  let res: Attempt | null = null;
  if (opts.autoSize) {
    let best: { b: number; res: Attempt } | null = null;
    for (let v = 0; v < VARIANTS; v++) {
      const f = fit(clean, area, opts.seed + v * 7919);
      if (f && (!best || f.b > best.b)) best = f;
    }
    if (best) {
      b = best.b;
      res = best.res;
    } else b = 0.6;
  }
  res ??= attempt(clean, area, b, opts.seed);
  const overflow = res.height > area.h + 1e-6;
  fillHoles(res, res.height, b);
  // Spread rows vertically to use the full height (never creates overlaps:
  // scaling y by k ≥ 1 keeps every gap at least as large as before).
  const k = res.height > 0 && res.height < area.h ? area.h / res.height : 1;
  const out = res.slots.map((s) => ({ ...s.tile, y: area.y + s.tile.y * k }));
  return { tiles: out, baseSize: Math.round(b * 1000) / 1000, overflow };
}

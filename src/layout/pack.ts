import { newId, type ReserveItem, type Skin, type Tile } from '../model';
import { imageBoxWidth, tileHeight } from '../render/tiles';
import { stripMarkup } from '../text/markup';
import { font } from '../text/fonts';
import { maxWhere } from './measure';

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
  cols: number;
  colW: number;
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
    case 'card': {
      const len = stripMarkup(t.markup).length * t.scale;
      s = len < 220 ? 1 : 2;
      if (r > 0.7) s++;
      break;
    }
  }
  return Math.max(1, Math.min(s, cols, Math.max(2, Math.ceil(cols * 0.67))));
}

/** Automatic spacing between tiles for a body text size (mm). */
export const autoGap = (b: number) => b * 1.1;

function attempt(tiles: Tile[], area: Box, b: number, seed: number, skin: Skin, fixedGap?: number): Attempt {
  const gap = fixedGap ?? autoGap(b);
  const cols = Math.max(1, Math.round((area.w + gap) / (b * 15 + gap)));
  const colW = (area.w - (cols - 1) * gap) / cols;
  const r = rng(seed);
  const heights = new Array<number>(cols).fill(0);
  const slots: Slot[] = [];
  for (const t of tiles) {
    const span = spanFor(t, cols, colW, gap, b, r());
    const tie = r();
    const w = span * colW + (span - 1) * gap;
    const h = tileHeight(t, w, b, skin);
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
  return { slots, height: Math.max(0, ...heights), gap, cols, colW };
}

/** Largest body size at which this variant fits, with its layout. */
function fit(tiles: Tile[], area: Box, seed: number, skin: Skin, gap?: number): { b: number; res: Attempt } | null {
  let lo = 0.6;
  let hi = Math.min(area.w, area.h) / 6;
  let best: { b: number; res: Attempt } | null = null;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const a = attempt(tiles, area, mid, seed, skin, gap);
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
/** How far down a slot may grow: the next tile in its columns, or `bottom`. */
function limitBelow(res: Attempt, s: Slot, bottom: number): number {
  let limit = bottom;
  for (const o of res.slots) {
    if (o === s || o.tile.y <= s.tile.y) continue;
    if (o.col < s.col + s.span && s.col < o.col + o.span) limit = Math.min(limit, o.tile.y - res.gap);
  }
  return limit;
}

function fillHoles(res: Attempt, bottom: number, b: number, skin: Skin, maxGrow = 0.8): void {
  for (const s of res.slots) {
    const t = s.tile;
    if (t.type !== 'image') continue;
    const free = limitBelow(res, s, bottom) - (t.y + s.h);
    if (free < b * 0.5) continue;
    const iw = imageBoxWidth(t, b, skin);
    const ih = iw / t.image.aspect;
    const grow = Math.min(free, ih * maxGrow); // default: crop at most to ~55% of the original aspect
    s.tile = { ...t, boxAspect: iw / (ih + grow) };
    s.h += grow;
  }
}

const FILLER_SCALE = [0.5, 0.85] as const;

/**
 * Pick the spare sentence (from a random sample of `pool`) that fills a
 * `w`×`avail` hole best at filler size, and remove it from the pool.
 */
export function takeFiller(
  pool: ReserveItem[],
  w: number,
  avail: number,
  height: (t: Tile) => number,
  r: () => number,
): { tile: Tile; h: number } | null {
  let best: { i: number; scale: number; h: number } | null = null;
  const start = Math.floor(r() * pool.length);
  for (let k = 0; k < Math.min(pool.length, 40); k++) {
    const i = (start + k) % pool.length;
    const base = { id: '', type: 'text', markup: pool[i].markup, source: pool[i].source, x: 0, y: 0, w, rot: 0, scale: 1 } as Tile;
    const sc = maxWhere(FILLER_SCALE[0], FILLER_SCALE[1], (v) => height({ ...base, scale: v } as Tile) <= avail, 7);
    if (sc === null) continue;
    const h = height({ ...base, scale: sc } as Tile);
    if (!best || h > best.h) best = { i, scale: sc, h };
    if (h > avail * 0.9) break;
  }
  if (!best) return null;
  const item = pool.splice(best.i, 1)[0];
  return { tile: { id: newId(), type: 'text', markup: item.markup, source: item.source, filler: true, x: 0, y: 0, w, rot: 0, scale: best.scale }, h: best.h };
}

/**
 * "Neat" pass: tiles grow into the free space below them (images crop
 * taller, text-like tiles get slightly larger text) so columns end flush with
 * the bottom; remaining holes get small filler sentences from `reserve`.
 */
function neaten(res: Attempt, area: Box, b: number, skin: Skin, neat: number, reserve: ReserveItem[], seed: number, crop: boolean): Tile[] {
  const bottom = area.h;
  const height = (t: Tile) => tileHeight(t, t.w, b, skin);
  if (crop) fillHoles(res, bottom, b, skin, 0.8 + neat * 1.2);
  const maxGrow = 1 + neat * 0.3; // keep text sizes fairly even; fillers do the rest
  for (const s of res.slots) {
    if (s.tile.type === 'image') continue;
    const target = limitBelow(res, s, bottom) - s.tile.y;
    if (target - s.h < b * 0.3) continue;
    const g = maxWhere(1, maxGrow, (v) => height({ ...s.tile, grow: v } as Tile) <= target);
    if (g && g > 1.001) {
      s.tile = { ...s.tile, grow: g } as Tile;
      s.h = height(s.tile);
    }
  }

  // Free intervals per column, merged across neighbouring columns.
  const minHole = b * 1.4;
  type Hole = { c0: number; c1: number; top: number; bottom: number };
  const holes: Hole[] = [];
  for (let c = 0; c < res.cols; c++) {
    const occupied = res.slots
      .filter((s) => s.col <= c && c < s.col + s.span)
      .map((s) => [s.tile.y, s.tile.y + s.h] as const)
      .sort((p, q) => p[0] - q[0]);
    let cursor = 0;
    let first = true;
    for (const [top, end] of [...occupied, [bottom + res.gap, bottom + res.gap] as const]) {
      const from = first ? cursor : cursor + res.gap;
      const to = top - res.gap;
      if (to - from >= minHole) {
        const same = holes.find((h) => h.c1 === c - 1 && Math.abs(h.top - from) < 0.5 && Math.abs(h.bottom - to) < 0.5);
        if (same) same.c1 = c;
        else holes.push({ c0: c, c1: c, top: from, bottom: to });
      }
      cursor = Math.max(cursor, end);
      first = false;
    }
  }

  const used = new Set(res.slots.map((s) => (s.tile.type === 'text' ? s.tile.markup : '')));
  const pool = reserve.filter((r) => !used.has(r.markup));
  const r = rng(seed + 101);
  const fillers: Tile[] = [];
  for (const hole of holes) {
    const w = (hole.c1 - hole.c0 + 1) * res.colW + (hole.c1 - hole.c0) * res.gap;
    let y = hole.top;
    while (hole.bottom - y >= minHole && pool.length) {
      const f = takeFiller(pool, w, hole.bottom - y, height, r);
      if (!f) break;
      fillers.push({ ...f.tile, x: area.x + hole.c0 * (res.colW + res.gap), y: area.y + y });
      y += f.h + res.gap;
    }
  }
  return fillers;
}

export interface ArrangeResult {
  tiles: Tile[];
  baseSize: number;
  overflow: boolean;
  /** Layout flaws (holes along the edges, crops, uneven sizes…); 0 = clean. Used to compare candidates. */
  badness: number;
}

/** Remove what an earlier arrange added (fillers, growth, crops) so arranging again does not accumulate it. */
export function cleanTiles(tiles: Tile[]): Tile[] {
  return tiles
    .filter((t) => !(t.type === 'text' && t.filler))
    .map((t) => (t.grow || (t.type === 'image' && t.boxAspect) ? ({ ...t, grow: undefined, ...(t.type === 'image' ? { boxAspect: undefined } : {}) } as Tile) : t));
}

const VARIANTS = 10;

/**
 * Share of column ends that would keep a hole along the top or bottom edge
 * after flushEdges: a column end is fine if its outermost tile has nothing
 * beyond it in any of the tile's columns (then it can move to the edge).
 */
function raggedness(a: Attempt): number {
  if (!a.slots.length) return 0;
  const shares = (s: Slot, o: Slot) => o !== s && o.col < s.col + s.span && s.col < o.col + o.span;
  const freeBelow = (s: Slot) => !a.slots.some((o) => shares(s, o) && o.tile.y > s.tile.y);
  const freeAbove = (s: Slot) => !a.slots.some((o) => shares(s, o) && o.tile.y < s.tile.y);
  let bad = 0;
  for (let c = 0; c < a.cols; c++) {
    const inCol = a.slots.filter((s) => s.col <= c && c < s.col + s.span);
    if (!inCol.length) {
      bad += 2;
      continue;
    }
    const lowest = inCol.reduce((p, q) => (q.tile.y > p.tile.y ? q : p));
    const highest = inCol.reduce((p, q) => (q.tile.y < p.tile.y ? q : p));
    if (!freeBelow(lowest)) bad++;
    if (!freeAbove(highest)) bad++;
  }
  return bad / (2 * a.cols);
}

/**
 * Lay out `tiles` (in the given order) inside `area`.
 * With `autoSize`, tries a few span variants and picks the one that allows the
 * largest body size (mm); otherwise uses `baseSize`.
 */
export function arrange(
  tiles: Tile[],
  area: Box,
  opts: {
    baseSize: number;
    autoSize: boolean;
    seed: number;
    skin?: Skin;
    /** Fixed spacing in mm; default follows the text size. */
    gap?: number;
    /** 0–1, see `neaten`. */
    neat?: number;
    reserve?: ReserveItem[];
    /** Number of random span/tie variants to try (default 10). */
    variants?: number;
    /** false: never crop pictures into free space. */
    cropImages?: boolean;
  },
): ArrangeResult {
  const skin = opts.skin ?? 'vector2010';
  const neat = opts.neat ?? 0;
  const variants = opts.variants ?? VARIANTS;
  const clean = cleanTiles(tiles);
  if (!clean.length) return { tiles: clean, baseSize: opts.baseSize, overflow: false, badness: 0 };
  let b = opts.baseSize;
  let res: Attempt | null = null;
  // Several span/order variants; prefer large text, but strongly avoid holes
  // along the bottom edge (a clean outline beats a slightly larger size).
  const score = (size: number, a: Attempt) => size * (1 - 2 * raggedness(a));
  if (opts.autoSize) {
    let best: { b: number; res: Attempt; score: number } | null = null;
    for (let v = 0; v < variants; v++) {
      const f = fit(clean, area, opts.seed + v * 7919, skin, opts.gap);
      if (!f) continue;
      const sc = score(f.b, f.res);
      if (!best || sc > best.score) best = { ...f, score: sc };
    }
    if (best) {
      b = best.b;
      res = best.res;
    } else b = 0.6;
  } else {
    let best: { res: Attempt; r: number } | null = null;
    for (let v = 0; v < variants; v++) {
      const a = attempt(clean, area, b, opts.seed + v * 7919, skin, opts.gap);
      if (a.height > area.h + 1e-6) continue;
      const r = raggedness(a);
      if (!best || r < best.r) best = { res: a, r };
      if (r === 0) break;
    }
    res = best?.res ?? null;
  }
  res ??= attempt(clean, area, b, opts.seed, skin, opts.gap);
  const overflow = res.height > area.h + 1e-6;
  const badness = -Math.log(Math.max(0.05, 1 - 2 * raggedness(res)));
  // Heights at the (rounded) size that is returned and rendered.
  // Rounded down: slightly smaller text never makes a column taller than planned.
  const bOut = Math.floor(b * 1000) / 1000;
  const height = (t: Tile) => tileHeight(t, t.w, bOut, skin);
  if (neat > 0 && !overflow) {
    const fillers = neaten(res, area, b, skin, neat, opts.reserve ?? [], opts.seed, opts.cropImages !== false);
    const out = res.slots.map((s) => ({ ...s.tile, y: area.y + s.tile.y }));
    return { tiles: flushBottom([...out, ...fillers], area, height), baseSize: bOut, overflow, badness };
  }
  if (opts.cropImages !== false) fillHoles(res, res.height, b, skin);
  // Spread rows vertically to use the full height (never creates overlaps:
  // scaling y by k ≥ 1 keeps every gap at least as large as before).
  // With a fixed spacing the gaps must stay exactly as set, so don't spread.
  const k = opts.gap === undefined && res.height > 0 && res.height < area.h ? area.h / res.height : 1;
  const out = res.slots.map((s) => ({ ...s.tile, y: area.y + s.tile.y * k }));
  return { tiles: overflow ? out : flushBottom(out, area, height), baseSize: bOut, overflow, badness };
}

/**
 * Clean outer edges: every tile with nothing above it moves up to the top of
 * the area and every tile with nothing below it moves down to the bottom, so
 * all columns start and end flush. The slack becomes gaps inside the collage
 * instead of ragged edges. (Left and right are flush thanks to the grid.)
 */
function flushBottom(tiles: Tile[], area: Box, height: (t: Tile) => number): Tile[] {
  const hs = tiles.map(height);
  const end = area.y + area.h;
  const sharesColumns = (a: Tile, o: Tile) => o.x < a.x + a.w - 1e-6 && a.x < o.x + o.w - 1e-6;
  const up = tiles.map((t, i) => {
    const above = tiles.some((o, j) => j !== i && o.y < t.y - 1e-6 && sharesColumns(t, o));
    return above || t.y <= area.y ? t : { ...t, y: area.y };
  });
  return up.map((t, i) => {
    const below = up.some((o, j) => j !== i && o.y > t.y + 1e-6 && sharesColumns(t, o));
    const y = end - hs[i];
    return below || y <= t.y ? t : { ...t, y };
  });
}

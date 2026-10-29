import type { ReserveItem, Skin, Tile } from '../model';
import { arrange as masonry, autoGap, cleanTiles, rng, type ArrangeResult, type Box } from './pack';
import { columnsLayout } from './columns';
import { rowsLayout } from './rows';
import { mosaicLayout } from './mosaic';
import { Meter } from './measure';

// Entry point of the auto layout: runs the chosen arrangement on several
// candidates (random variants, then small changes to the best one's order) and
// keeps the one with the lowest cost: small text, holes, crops and uneven sizes
// cost, and optionally scattered articles and clumped pictures.

export type Arrangement = 'columns' | 'rows' | 'mosaic' | 'masonry';
export const ARRANGEMENTS: Arrangement[] = ['columns', 'rows', 'mosaic', 'masonry'];
export type Effort = 'fast' | 'normal' | 'thorough';
export const EFFORTS: Effort[] = ['fast', 'normal', 'thorough'];

export interface Optimize {
  effort: Effort;
  /** Keep tiles from the same article together. */
  group: boolean;
  /** Avoid pictures next to each other and on one side only. */
  spreadImages: boolean;
  /** Mosaic: largest ratio between text sizes. */
  sizeRange: number;
}

export const DEFAULT_OPTIMIZE: Optimize = { effort: 'normal', group: false, spreadImages: true, sizeRange: 1.8 };

/** Candidates per effort: [random variants, changes to the best order]. */
const BUDGET: Record<Effort, [number, number]> = { fast: [3, 0], normal: [8, 6], thorough: [12, 28] };

export interface LayoutOptions {
  arrangement?: Arrangement;
  baseSize: number;
  autoSize: boolean;
  seed: number;
  skin?: Skin;
  gap?: number;
  neat?: number;
  reserve?: ReserveItem[];
  optimize?: Partial<Optimize>;
  /** false: pictures are always shown whole (default true). */
  cropImages?: boolean;
}

/** Article a tile belongs to (for grouping), if any. */
export function articleKey(t: Tile): string | null {
  const s = t.source;
  if (s.kind !== 'wikipedia' && s.kind !== 'dyk') return null;
  const title = s.article ?? (t.type === 'image' ? undefined : s.title);
  return title ? `${s.lang ?? ''}:${title}` : null;
}

const hasPicture = (t: Tile) => t.type === 'image' || ((t.type === 'card' || t.type === 'infobox') && !!t.image);

/** Tiles grouped by article (title first), groups in first-seen or random order. */
function grouped(tiles: Tile[], rand?: () => number): Tile[] {
  const groups = new Map<string, Tile[]>();
  tiles.forEach((t, i) => {
    const k = articleKey(t) ?? `#${i}`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  });
  const list = [...groups.values()].map((g) => [...g.filter((t) => t.type === 'title'), ...g.filter((t) => t.type !== 'title')]);
  if (rand)
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  return list.flat();
}

/** A small change to an order: swap or move tiles (or whole articles when grouping). */
function mutate(order: Tile[], rand: () => number, group: boolean): Tile[] {
  if (order.length < 2) return order;
  if (group) {
    const runs: Tile[][] = [];
    for (const t of order) {
      const k = articleKey(t);
      const last = runs[runs.length - 1];
      if (last && k && articleKey(last[0]) === k) last.push(t);
      else runs.push([t]);
    }
    if (runs.length > 1) {
      const i = Math.floor(rand() * runs.length);
      const j = Math.floor(rand() * runs.length);
      [runs[i], runs[j]] = [runs[j], runs[i]];
    }
    // Sometimes also reorder inside an article (keeping its title first).
    const run = runs[Math.floor(rand() * runs.length)];
    const first = run[0].type === 'title' ? 1 : 0;
    if (run.length - first > 1) {
      const i = first + Math.floor(rand() * (run.length - first));
      const j = first + Math.floor(rand() * (run.length - first));
      [run[i], run[j]] = [run[j], run[i]];
    }
    return runs.flat();
  }
  const out = [...order];
  const i = Math.floor(rand() * out.length);
  const j = Math.floor(rand() * out.length);
  if (rand() < 0.5) [out[i], out[j]] = [out[j], out[i]];
  else out.splice(j, 0, ...out.splice(i, 1));
  return out;
}

interface Rect {
  x: number;
  y: number;
  r: number;
  b: number;
}

/** Edge-to-edge distance between two boxes (0 when they touch or overlap). */
function distance(a: Rect, b: Rect): number {
  const dx = Math.max(0, b.x - a.r, a.x - b.r);
  const dy = Math.max(0, b.y - a.b, a.y - b.b);
  return Math.hypot(dx, dy);
}

/** Average distance between tiles of the same article, relative to the diagonal. */
export function groupSpread(tiles: Tile[], rects: Rect[], diag: number): number {
  const byKey = new Map<string, number[]>();
  tiles.forEach((t, i) => {
    const k = articleKey(t);
    if (k) byKey.set(k, [...(byKey.get(k) ?? []), i]);
  });
  let sum = 0;
  let pairs = 0;
  for (const ids of byKey.values())
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        sum += distance(rects[ids[i]], rects[ids[j]]) / diag;
        pairs++;
      }
  return pairs ? sum / pairs : 0;
}

/** Share of pictures touching another picture, plus how far the pictures' centre of mass is off-centre. */
export function imageClump(tiles: Tile[], rects: Rect[], area: Box, near: number): number {
  const ids = tiles.map((t, i) => (hasPicture(t) ? i : -1)).filter((i) => i >= 0);
  if (ids.length < 2) return 0;
  let touching = 0;
  for (const i of ids) if (ids.some((j) => j !== i && distance(rects[i], rects[j]) <= near)) touching++;
  let mass = 0;
  let cx = 0;
  let cy = 0;
  for (const i of ids) {
    const r = rects[i];
    const m = (r.r - r.x) * (r.b - r.y);
    mass += m;
    cx += m * (r.x + r.r) * 0.5;
    cy += m * (r.y + r.b) * 0.5;
  }
  const off = Math.hypot(cx / mass - (area.x + area.w / 2), cy / mass - (area.y + area.h / 2)) / (Math.hypot(area.w, area.h) / 2);
  return touching / ids.length + off;
}

export function arrangeTiles(tiles: Tile[], area: Box, opts: LayoutOptions): ArrangeResult {
  const clean = cleanTiles(tiles);
  if (!clean.length) return { tiles: clean, baseSize: opts.baseSize, overflow: false, badness: 0 };
  const mode = opts.arrangement ?? 'columns';
  const o = { ...DEFAULT_OPTIMIZE, ...opts.optimize };
  const meter = new Meter(opts.skin ?? 'vector2010');
  const neat = opts.neat ?? 0;
  const reserve = opts.reserve ?? [];
  const diag = Math.hypot(area.w, area.h);

  const run = (order: Tile[], seed: number, hint?: number): ArrangeResult => {
    const common = { baseSize: opts.baseSize, autoSize: opts.autoSize, gap: opts.gap, meter, crop: opts.cropImages !== false };
    switch (mode) {
      case 'rows':
        return rowsLayout(order, area, { ...common, neat, hint });
      case 'mosaic':
        return mosaicLayout(order, area, { ...common, seed, sizeRange: o.sizeRange });
      case 'masonry':
        return masonry(order, area, { ...opts, seed, neat, reserve, variants: 1 });
      default:
        return columnsLayout(order, area, { ...common, seed, neat, reserve, hint });
    }
  };
  const cost = (res: ArrangeResult) => {
    let c = res.badness + (res.overflow ? 100 : 0);
    if (opts.autoSize) c -= Math.log(res.baseSize);
    if (o.group || o.spreadImages) {
      const rects = res.tiles.map((t) => ({ x: t.x, y: t.y, r: t.x + t.w, b: t.y + meter.h(t, t.w, res.baseSize) }));
      if (o.group) c += 2.5 * groupSpread(res.tiles, rects, diag);
      if (o.spreadImages) c += 0.6 * imageClump(res.tiles, rects, area, (opts.gap ?? autoGap(res.baseSize)) * 2.5);
    }
    return c;
  };

  const [variants, changes] = BUDGET[o.effort];
  const base = o.group ? grouped(clean) : clean;
  let best: { order: Tile[]; seed: number; res: ArrangeResult; cost: number } | null = null;
  const consider = (order: Tile[], seed: number) => {
    const res = run(order, seed, best?.res.baseSize);
    const c = cost(res);
    if (!best || c < best.cost - 1e-9) best = { order, seed, res, cost: c };
  };
  for (let v = 0; v < variants; v++) {
    const seed = opts.seed + v * 7919;
    // Rows have no randomness of their own: vary the order instead.
    const order = v === 0 ? base : o.group ? grouped(clean, rng(seed)) : mode === 'rows' ? mutate(base, rng(seed), false) : base;
    consider(order, seed);
  }
  const rand = rng(opts.seed ^ 0x2545f491);
  for (let c = 0; c < changes; c++) {
    const b = best!;
    consider(mutate(b.order, rand, o.group), b.seed);
  }
  return best!.res;
}

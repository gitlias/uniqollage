import type { ImageTile, ReserveItem, Tile } from '../model';
import { font } from '../text/fonts';
import { autoGap, rng, takeFiller, type ArrangeResult, type Box } from './pack';
import { Meter, imageParts, isTextLike, maxWhere, wordWidth } from './measure';

// "Balanced columns": the page is a stack of blocks. A block is either a
// full-width band (a long title, or a row of 2–3 landscape pictures cut to the
// same height) or a section of equal columns holding one-column tiles. Tiles
// never span several columns inside a section, which is what leaves holes in
// the masonry layout; columns are filled shortest-first and any remaining
// height is spread over each column's gaps, so every column starts and ends
// flush with its section.

interface Band {
  kind: 'band';
  tiles: Tile[];
  widths: number[];
  h: number;
}
interface Section {
  kind: 'section';
  colW: number;
  columns: Tile[][];
  h: number;
}
type Block = Band | Section;

interface Plan {
  blocks: Block[];
  height: number;
  gap: number;
  /** Columns of a full section (narrower sections mean overly long lines). */
  cols: number;
}

function plan(order: Tile[], area: Box, b: number, fixedGap: number | undefined, seed: number, meter: Meter): Plan {
  const gap = fixedGap ?? autoGap(b);
  const W = area.w;
  const r = rng(seed);
  // Column width varies a little between candidates (13–17 body sizes).
  const cols = Math.max(1, Math.round((W + gap) / (b * (13 + 4 * r()) + gap)));
  const colW = (W - (cols - 1) * gap) / cols;

  // Which tiles become bands.
  const kind = order.map((t) => {
    const x = r();
    if (cols >= 2 && t.type === 'title') {
      const need = font('serif').measure(t.text, b * t.scale * 2.1) * 1.02;
      // A word wider than the column would be split: such titles always get a band.
      if (wordWidth(meter, t) * b > colW || need > colW * 2 || (need > colW && x < 0.6) || x < 0.12) return 'title' as const;
    }
    if (cols >= 3 && t.type === 'image' && t.image.aspect >= 1.3 && x < 0.45) return 'image' as const;
    return null;
  });

  // Landscape pictures share a band with the next ones (2–3 per row); a lone one stays in the columns.
  const perRow = cols >= 5 ? 3 : 2;
  type Item = { band: Tile[] } | { tile: Tile };
  const seq: Item[] = [];
  const taken = new Set<number>();
  order.forEach((t, i) => {
    if (taken.has(i)) return;
    if (kind[i] === 'title') seq.push({ band: [t] });
    else if (kind[i] === 'image') {
      const row = [i];
      for (let j = i + 1; j < order.length && row.length < perRow; j++) if (kind[j] === 'image' && !taken.has(j)) row.push(j);
      if (row.length < 2) seq.push({ tile: t });
      else {
        row.forEach((j) => taken.add(j));
        seq.push({ band: row.map((j) => order[j]) });
      }
    } else seq.push({ tile: t });
  });

  // Sections between bands; a band waits until the section above it has a full set of columns.
  const groups: (Tile[] | { band: Tile[] })[] = [];
  let cur: Tile[] = [];
  let pending: { band: Tile[] }[] = [];
  for (const it of seq) {
    if ('band' in it) {
      if (cur.length && cur.length < cols) pending.push(it);
      else {
        if (cur.length) groups.push(cur);
        cur = [];
        groups.push(it);
      }
    } else {
      cur.push(it.tile);
      if (pending.length && cur.length >= cols) {
        groups.push(cur, ...pending);
        cur = [];
        pending = [];
      }
    }
  }
  if (cur.length) {
    // A short last section joins the previous one; the bands in between move to the bottom.
    let prev = -1;
    for (let i = groups.length - 1; i >= 0; i--) if (Array.isArray(groups[i])) (prev = i), (i = -1);
    if (cur.length < cols && prev >= 0) {
      const moved = groups.splice(prev + 1);
      (groups[prev] as Tile[]).push(...cur);
      groups.push(...moved);
    } else groups.push(cur);
  }
  groups.push(...pending);

  const blocks: Block[] = groups.map((g) => {
    if (!Array.isArray(g)) {
      if (g.band.length === 1) return { kind: 'band', tiles: g.band, widths: [W], h: meter.h(g.band[0], W, b) };
      // Picture row: widths by aspect, then each picture is cut to the common height.
      const imgs = g.band as ImageTile[];
      const inner = W - (imgs.length - 1) * gap;
      const sum = imgs.reduce((s, t) => s + t.image.aspect, 0);
      const widths = imgs.map((t) => (inner * t.image.aspect) / sum);
      const hs = imgs.map((t, i) => meter.h(t, widths[i], b));
      const H = hs.reduce((s, h) => s + h, 0) / hs.length;
      const tiles = imgs.map((t, i) => {
        const { iw } = imageParts(meter, t, widths[i], b);
        const ih = Math.max(iw / t.image.aspect + (H - hs[i]), iw / (t.image.aspect * 2.5));
        return { ...t, boxAspect: iw / ih } as Tile;
      });
      return { kind: 'band', tiles, widths, h: Math.max(...tiles.map((t, i) => meter.h(t, widths[i], b))) };
    }
    const c = Math.min(cols, g.length);
    const w = (W - (c - 1) * gap) / c;
    // Tallest tiles first, each into the shortest column (equal ones in random order);
    // inside a column the tiles keep their order.
    const columns: number[][] = Array.from({ length: c }, () => []);
    const sums = new Array<number>(c).fill(0);
    const hs = g.map((t) => meter.h(t, w, b));
    const byHeight = g.map((_, i) => i).sort((x, y) => hs[y] - hs[x]);
    for (const i of byHeight) {
      const off = Math.floor(r() * c);
      let best = -1;
      for (let k = 0; k < c; k++) {
        const j = (k + off) % c;
        if (best < 0 || sums[j] < sums[best] - 1e-6) best = j;
      }
      sums[best] += (columns[best].length ? gap : 0) + hs[i];
      columns[best].push(i);
    }
    const ordered = columns.map((col) => col.sort((x, y) => x - y).map((i) => g[i]));
    return { kind: 'section', colW: w, columns: ordered, h: Math.max(...sums) };
  });
  const height = blocks.reduce((s, bl) => s + bl.h, 0) + Math.max(0, blocks.length - 1) * gap;
  return { blocks, height, gap, cols };
}

interface Placed {
  t: Tile;
  h: number;
}

/**
 * Fit one column into `S`: spread small slack over the gaps; larger slack is
 * taken up by cropping pictures taller, then (neat) by slightly larger text and
 * filler sentences, and what remains is spread over the gaps anyway.
 * Returns the tiles with their offsets and the slack beyond what counts as even spacing.
 */
function fitColumn(
  tiles: Tile[],
  w: number,
  S: number,
  b: number,
  gap: number,
  align: 'top' | 'bottom',
  ctx: { meter: Meter; neat: number; pool: ReserveItem[]; r: () => number },
): { placed: { t: Tile; dy: number }[]; excess: number } {
  const { meter, neat } = ctx;
  const col: Placed[] = tiles.map((t) => ({ t, h: meter.h(t, w, b) }));
  const content = () => col.reduce((s, p) => s + p.h, 0) + (col.length - 1) * gap;
  const even = gap; // gaps up to twice the spacing still look even
  let need = S - content() - even * (col.length - 1);
  if (need > b * 0.3) {
    const maxGrow = 0.8 + 1.2 * neat;
    const imgs = col.filter((p) => p.t.type === 'image');
    const parts = imgs.map((p) => imageParts(meter, p.t as ImageTile, w, b));
    const capacity = parts.reduce((s, x, i) => s + (x.iw / (imgs[i].t as ImageTile).image.aspect) * maxGrow, 0);
    if (capacity > 0) {
      const share = Math.min(1, need / capacity);
      imgs.forEach((p, i) => {
        const ih = parts[i].iw / (p.t as ImageTile).image.aspect;
        const grow = ih * maxGrow * share;
        p.t = { ...p.t, boxAspect: parts[i].iw / (ih + grow) } as Tile;
        p.h = meter.h(p.t, w, b);
      });
      need = S - content() - even * (col.length - 1);
    }
    if (neat > 0) {
      for (const p of col) {
        if (!isTextLike(p.t) || need < b * 0.3) continue;
        const target = p.h + need;
        const top = Math.min(1 + 0.3 * neat, w / Math.max(1e-6, wordWidth(meter, p.t) * b));
        const g = top > 1 ? maxWhere(1, top, (v) => meter.h(p.t, w, b * v) <= target, 8) : null;
        if (g && g > 1.001) {
          const h = meter.h(p.t, w, b * g);
          need -= h - p.h;
          p.t = { ...p.t, grow: g } as Tile;
          p.h = h;
        }
      }
      const minHole = b * 1.4;
      while (need - gap >= minHole && ctx.pool.length) {
        const f = takeFiller(ctx.pool, w, need - gap, (t) => meter.h(t, w, b), ctx.r);
        if (!f) break;
        col.splice(Math.floor(ctx.r() * (col.length + 1)), 0, { t: f.tile, h: f.h });
        need -= f.h + gap + even;
      }
    }
  }
  const slack = Math.max(0, S - content());
  const placed: { t: Tile; dy: number }[] = [];
  if (col.length === 1) {
    placed.push({ t: col[0].t, dy: align === 'bottom' ? slack : 0 });
    return { placed, excess: slack };
  }
  const extra = slack / (col.length - 1);
  let y = 0;
  for (const p of col) {
    placed.push({ t: p.t, dy: y });
    y += p.h + gap + extra;
  }
  return { placed, excess: Math.max(0, slack - even * (col.length - 1)) };
}

export interface ColumnsOptions {
  baseSize: number;
  autoSize: boolean;
  seed: number;
  gap?: number;
  neat: number;
  reserve: ReserveItem[];
  meter: Meter;
  /** Text size of a previous good candidate, to narrow the size search. */
  hint?: number;
}

/** Largest body size at which `layout(b)` fits, by bisection (optionally around a hint). */
export function searchSize<T>(area: Box, fits: (b: number) => T | null, hint?: number): { b: number; res: T } | null {
  const run = (lo: number, hi: number, steps: number) => {
    let best: { b: number; res: T } | null = null;
    for (let i = 0; i < steps; i++) {
      const mid = (lo + hi) / 2;
      const res = fits(mid);
      if (res) {
        best = { b: mid, res };
        lo = mid;
      } else hi = mid;
    }
    return best;
  };
  const max = Math.min(area.w, area.h) / 6;
  if (hint) {
    const lo = hint * 0.8;
    const atLo = fits(lo);
    if (atLo && !fits(Math.min(max, hint * 1.25))) return run(lo, Math.min(max, hint * 1.25), 8) ?? { b: lo, res: atLo };
  }
  return run(0.6, max, 14);
}

export function columnsLayout(order: Tile[], area: Box, o: ColumnsOptions): ArrangeResult {
  let b = o.baseSize;
  if (o.autoSize) {
    const found = searchSize(area, (v) => (plan(order, area, v, o.gap, o.seed, o.meter).height <= area.h ? true : null), o.hint);
    b = found?.b ?? 0.6;
  }
  // Round down so the plan made at the returned size still fits.
  b = Math.floor(b * 1000) / 1000;
  const p = plan(order, area, b, o.gap, o.seed, o.meter);
  const overflow = p.height > area.h + 1e-6;
  const G = Math.max(0, area.h - p.height);
  const sectionTotal = p.blocks.reduce((s, bl) => s + (bl.kind === 'section' ? bl.h : 0), 0);
  // Without sections (only bands) the extra height goes between the blocks.
  const blockGap = p.gap + (sectionTotal === 0 && p.blocks.length > 1 ? G / (p.blocks.length - 1) : 0);
  const used = new Set(order.map((t) => (t.type === 'text' ? t.markup : '')));
  const ctx = { meter: o.meter, neat: o.neat, pool: o.reserve.filter((r) => !used.has(r.markup)), r: rng(o.seed + 101) };

  const out: Tile[] = [];
  let excess = 0;
  let wide = 0;
  let y = area.y;
  p.blocks.forEach((bl, i) => {
    if (bl.kind === 'band') {
      let x = area.x;
      bl.tiles.forEach((t, j) => {
        out.push({ ...t, x, y, w: bl.widths[j], rot: 0 });
        x += bl.widths[j] + p.gap;
      });
      y += bl.h + blockGap;
      return;
    }
    const S = bl.h + (sectionTotal ? (G * bl.h) / sectionTotal : 0);
    // The last section keeps the bottom edge clean, the others the top of their section.
    const align = i === p.blocks.length - 1 && i > 0 ? 'bottom' : 'top';
    if (bl.columns.length < p.cols) wide += bl.columns.flat().filter(isTextLike).length;
    bl.columns.forEach((col, j) => {
      const x = area.x + j * (bl.colW + p.gap);
      const fit = fitColumn(col, bl.colW, S, b, p.gap, align, ctx);
      excess += fit.excess * bl.colW;
      for (const { t, dy } of fit.placed) out.push({ ...t, x, y: y + dy, w: bl.colW, rot: 0 });
    });
    y += S + blockGap;
  });
  const badness = (6 * excess) / (area.w * area.h) + 0.08 * wide;
  return { tiles: out, baseSize: b, overflow, badness };
}

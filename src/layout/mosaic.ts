import type { Tile } from '../model';
import { autoGap, rng, type ArrangeResult, type Box } from './pack';
import { Meter, imageParts, isTextLike, maxWhere, naturalWidth, profile, profileAt, wordWidth } from './measure';

// "Mosaic": the area is cut recursively (guillotine cuts, like a treemap) into
// one cell per tile, starting from each tile's natural area; the cuts are then
// moved until the tiles come out about equally large. Every tile fills its
// cell: pictures are cropped to it, text gets the size that just fits. No gaps
// besides the spacing, but text sizes vary (within `sizeRange`).

export interface MosaicOptions {
  baseSize: number;
  autoSize: boolean;
  seed: number;
  gap?: number;
  /** Largest ratio between the biggest and smallest text size (≥ 1). */
  sizeRange: number;
  meter: Meter;
  /** Pictures may be cropped to their cell (else they are shown whole, centred). */
  crop: boolean;
}

export function mosaicLayout(order: Tile[], area: Box, o: MosaicOptions): ArrangeResult {
  const { meter } = o;
  const n = order.length;
  // Natural area, and the range of cell shapes (width / height) a tile looks good in:
  // text reflows, so anything from a narrow column to a wide block works; pictures only
  // tolerate a light crop.
  const nat = order.map((t) => {
    const p = profile(meter, t);
    const u = naturalWidth(t);
    const h = profileAt(p, u);
    // (Pictures count a little less, so the text doesn't end up tiny.)
    if (t.type === 'image') {
      const tol = o.crop ? 0.15 : 0.03;
      return { area: u * h * 0.6, lo: (u / h) * (1 - tol), hi: (u / h) * (1 + tol) };
    }
    const narrow = Math.max(u * 0.6, wordWidth(meter, t) * 1.2);
    const wide = u * (t.type === 'title' ? 4 : 2);
    return { area: u * h, lo: narrow / profileAt(p, narrow), hi: wide / profileAt(p, wide) };
  });
  // Base size at which the natural areas fill the page (minus spacing).
  const totalArea = nat.reduce((s, x) => s + x.area, 0);
  const b0 = o.autoSize ? Math.min(Math.min(area.w, area.h) / 6, Math.max(0.6, Math.sqrt((0.82 * area.w * area.h) / totalArea))) : o.baseSize;
  const gap = o.gap ?? autoGap(b0);
  const r = rng(o.seed);

  // The cut pattern: at each step, the split point and direction that give the
  // tiles on both sides suitable cell shapes (with a little randomness).
  interface Node {
    ids: number[];
    vertical: boolean;
    /** Share of the cut dimension that goes to the first part. */
    p: number;
    a?: Node;
    b?: Node;
  }
  const sideScore = (ids: number[], rc: Box) => {
    const asp = rc.w / rc.h;
    if (ids.length === 1) {
      const { lo, hi } = nat[ids[0]];
      return (asp < lo ? Math.log(lo / asp) : asp > hi ? Math.log(asp / hi) : 0) * (order[ids[0]].type === 'image' ? 2 : 1.5);
    }
    return Math.max(0, Math.abs(Math.log(asp)) - Math.log(2.5));
  };
  const cut = (rc: Box, vertical: boolean, p: number): [Box, Box] | null => {
    const dim = (vertical ? rc.w : rc.h) - gap;
    if (dim <= 0) return null;
    const s = dim * p;
    return vertical
      ? [
          { ...rc, w: s },
          { ...rc, x: rc.x + s + gap, w: dim - s },
        ]
      : [
          { ...rc, h: s },
          { ...rc, y: rc.y + s + gap, h: dim - s },
        ];
  };
  const build = (ids: number[], rc: Box): Node => {
    if (ids.length === 1) return { ids, vertical: false, p: 1 };
    const total = ids.reduce((s, i) => s + nat[i].area, 0);
    let best: { score: number; parts: [Box, Box]; k: number; p: number; vertical: boolean } | null = null;
    let prefix = 0;
    for (let k = 1; k < ids.length; k++) {
      prefix += nat[ids[k - 1]].area;
      const p = prefix / total;
      for (const vertical of [true, false]) {
        const parts = cut(rc, vertical, p);
        if (!parts) continue;
        const score = sideScore(ids.slice(0, k), parts[0]) + sideScore(ids.slice(k), parts[1]) + r() * 0.3;
        if (!best || score < best.score) best = { score, parts, k, p, vertical };
      }
    }
    // Too small to cut: everything gets the same cell (reported as overflow).
    if (!best) return { ids, vertical: true, p: 0.5 };
    return { ids, vertical: best.vertical, p: best.p, a: build(ids.slice(0, best.k), best.parts[0]), b: build(ids.slice(best.k), best.parts[1]) };
  };
  const cells: Box[] = new Array(n);
  const place = (node: Node, rc: Box) => {
    const parts = node.a && node.b ? cut(rc, node.vertical, node.p) : null;
    if (!parts) {
      for (const i of node.ids) cells[i] = rc;
      return;
    }
    place(node.a!, parts[0]);
    place(node.b!, parts[1]);
  };
  const root = build(
    order.map((_, i) => i),
    area,
  );

  // Move the cuts so all tiles end up about equally large (estimated from the
  // profiles: text size that fits the cell, or a picture's scale).
  const scale = (i: number) => {
    const t = order[i];
    const c = cells[i];
    if (c.w <= 0 || c.h <= 0) return 1e-3;
    if (t.type === 'image') return Math.sqrt((c.w * c.h) / (nat[i].area * b0 * b0));
    const p = profile(meter, t);
    const hi = Math.min(6, c.w / Math.max(1e-6, wordWidth(meter, t) * b0));
    return maxWhere(Math.min(0.05, hi), hi, (v) => b0 * v * profileAt(p, c.w / (b0 * v)) <= c.h, 12) ?? 0.05;
  };
  const balance = (node: Node, logs: number[]): { sum: number; count: number } => {
    if (!node.a || !node.b) return { sum: node.ids.reduce((s, i) => s + logs[i], 0), count: node.ids.length };
    const a = balance(node.a, logs);
    const b = balance(node.b, logs);
    // Text area grows with the square of its size.
    const d = Math.exp(-(a.sum / a.count - b.sum / b.count));
    node.p = Math.min(0.92, Math.max(0.08, (node.p * d) / (node.p * d + 1 - node.p)));
    return { sum: a.sum + b.sum, count: a.count + b.count };
  };
  for (let i = 0; i < 8; i++) {
    place(root, area);
    balance(
      root,
      order.map((_, j) => Math.log(scale(j))),
    );
  }
  place(root, area);

  // Text first: the size that just fits its cell. The smallest of these sets the
  // bottom of the allowed size window; larger cells are filled only up to its top.
  const range = Math.max(1, o.sizeRange);
  const fit = order.map((t, i) => {
    if (!isTextLike(t)) return Infinity;
    const c = cells[i];
    // Largest size that fits the height without splitting words.
    const hi = Math.min(4, c.w / Math.max(1e-6, wordWidth(meter, t) * b0));
    return maxWhere(Math.min(0.15, hi), hi, (v) => meter.h(t, c.w, b0 * v) <= c.h, 10) ?? Math.min(0.15, hi);
  });
  const floor = Math.min(...fit);
  const g = fit.map((v) => Math.min(v, floor * range));
  const texts = g.filter((_, i) => isTextLike(order[i])).sort((x, y) => x - y);
  const m = texts.length ? texts[Math.floor(texts.length / 2)] : 1;
  const b = Math.max(0.3, Math.floor(b0 * m * 1000) / 1000);
  const bottom = area.y + area.h - 0.01;

  let slack = 0;
  let crop = 0;
  let images = 0;
  let overflow = false;
  const out = order.map((t, i) => {
    const c = cells[i];
    if (t.type !== 'image') {
      const h = meter.h(t, c.w, b0 * g[i]);
      if (h > c.h + 1e-6) overflow = true;
      slack += c.w * (c.h - h);
      return { ...t, grow: (g[i] * b0) / b, x: c.x, y: c.y + c.h >= bottom ? c.y + c.h - h : c.y, w: c.w, rot: 0 } as Tile;
    }
    images++;
    const a = t.image.aspect;
    // How far a picture may be cropped from its own aspect ratio.
    const cf = o.crop ? 2.2 : 1;
    const { iw, chrome } = imageParts(meter, t, c.w, b);
    const ih = c.h - chrome;
    if (!o.crop && ih >= iw / a) {
      // Whole picture at full cell width; the rest of the cell stays empty.
      const h = meter.h(t, c.w, b);
      slack += c.w * (c.h - h);
      return { ...t, x: c.x, y: c.y + c.h >= bottom ? c.y + c.h - h : c.y, w: c.w, rot: 0 } as Tile;
    }
    if (ih <= iw / (a * cf)) {
      // Cell too flat even for a strong crop: a narrower tile, centred. (Narrower
      // means a taller caption, so scan down rather than bisect.)
      const flat = { ...t, boxAspect: o.crop ? a * cf : undefined };
      const fits = (v: number) => meter.h(flat, v, b) <= c.h;
      let w: number | null = null;
      for (let v = c.w * 0.88; v >= b * 3 && w === null; v *= 0.88) if (fits(v)) w = maxWhere(v, Math.min(c.w, v / 0.88), fits, 6) ?? v;
      if (w !== null) {
        const h = meter.h(flat, w, b);
        slack += c.w * c.h - w * h;
        crop += Math.log(cf);
        return { ...flat, x: c.x + (c.w - w) / 2, y: c.y, w, rot: 0 } as Tile;
      }
      if (!o.crop) {
        // Not even the narrowest picture fits (its caption is too tall).
        overflow = true;
        return { ...t, x: c.x, y: c.y, w: c.w, rot: 0 } as Tile;
      }
      // Last resort: crop harder at full width (overflow only if the caption alone is too tall).
      if (ih <= 0) overflow = true;
      const box = iw / Math.max(ih, 1e-3);
      crop += Math.log(box / a);
      return { ...t, boxAspect: box, x: c.x, y: c.y, w: c.w, rot: 0 } as Tile;
    }
    const box = Math.max(a / 2.2, iw / ih);
    const nt = { ...t, boxAspect: box };
    const h = meter.h(nt, c.w, b);
    slack += c.w * (c.h - h);
    crop += Math.abs(Math.log(box / a));
    return { ...nt, x: c.x, y: c.y + c.h >= bottom ? c.y + c.h - h : c.y, w: c.w, rot: 0 } as Tile;
  });

  const logs = texts.map((v) => Math.log(v));
  const mean = logs.reduce((s, v) => s + v, 0) / Math.max(1, logs.length);
  const spread = Math.sqrt(logs.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, logs.length));
  const badness = spread + (images ? (0.5 * crop) / images : 0) + (4 * Math.max(0, slack)) / (area.w * area.h);
  return { tiles: out, baseSize: b, overflow, badness };
}

import type { ImageTile, Tile } from '../model';
import { autoGap, type ArrangeResult, type Box } from './pack';
import { Meter, PROFILE_U, imageParts, maxWhere, minWhere, naturalWidth, profile, profileAt, wordWidth } from './measure';

// "Rows" (justified layout, like photo galleries): R rows of equal height fill
// the area exactly. Pictures get the width at which they are as tall as the
// row (cropped a little to make the row exactly as wide as the area); text
// gets the narrowest width at which it fits the row height, or more. The rows
// are found by dynamic programming over the tile order (linear partition).

/** Width range of a tile in a row of height H. */
interface Fit {
  min: number;
  /** Preferred width. */
  nat: number;
  max: number;
  /** Extra cost (e.g. very long lines). */
  pen: number;
}

/** Pictures may be cropped to at most this factor from their own aspect ratio. */
const CROP = 1.8;

function estimate(meter: Meter, t: Tile, b: number, H: number): Fit {
  return meter.memo(t, `fit|${b}|${H}`, () => estimateNew(meter, t, b, H));
}

function estimateNew(meter: Meter, t: Tile, b: number, H: number): Fit {
  const p = profile(meter, t);
  const U = PROFILE_U;
  const hn = H / b;
  if (t.type === 'image') {
    // Uncropped height grows with the width (except at tiny widths, where the caption wraps a lot):
    // find where the rising part reaches the row height.
    const low = p.indexOf(Math.min(...p));
    const k = p.findIndex((v, i) => i > low && v >= hn);
    let u: number;
    if (k < 0) u = U[U.length - 1] * (hn / p[p.length - 1]);
    else if (hn <= p[low]) u = U[low];
    else u = U[k - 1] + ((hn - p[k - 1]) / (p[k] - p[k - 1])) * (U[k] - U[k - 1]);
    const inset = meter.memo(t, 'inset', () => 4 * U[10] - imageParts(meter, t, 4 * U[10], 4).iw) / 4;
    const chrome = (w: number) => b * (profileAt(p, w / b) - (w / b - inset) / t.image.aspect);
    return { ...cropRange(t.image.aspect, H, u * b, inset * b, chrome, U[low] * b), pen: 0 };
  }
  // Text gets shorter when wider; cards and infoboxes have pictures, so they can get taller again.
  const first = p.findIndex((v) => v <= hn);
  if (first < 0) return { min: Infinity, nat: Infinity, max: Infinity, pen: 0 };
  let lastOk = first;
  while (lastOk + 1 < p.length && p[lastOk + 1] <= hn) lastOk++;
  // (+4 %: the interpolation can be a little optimistic.) Words are never split.
  const fit = (first === 0 ? U[0] : U[first - 1] + ((p[first - 1] - hn) / (p[first - 1] - p[first])) * (U[first] - U[first - 1])) * 1.04;
  const min = Math.max(fit, wordWidth(meter, t)) * b;
  const max = lastOk === p.length - 1 ? Infinity : Math.max(min, U[lastOk] * b);
  // Preferred: just wide enough to fill the row height, but not much narrower than a comfortable
  // reading width (in tall rows that would turn text into a word list).
  const nat = Math.min(max, Math.max(min * 1.15, naturalWidth(t) * b * 0.6));
  // Costs: text squeezed narrower than comfortable, very long lines, and empty height below the text.
  const u = nat / b;
  const narrow = u < naturalWidth(t) * 0.7 ? 0.4 : 0;
  const long = t.type === 'text' && u > 70 ? Math.min(1, (u - 70) / 70) : 0;
  const empty = Math.max(0, 1 - profileAt(p, u) / hn);
  return { min, nat, max, pen: narrow + long + empty * 0.8 };
}

/**
 * Widths at which a picture can be cut to exactly height H without cropping
 * beyond CROP (narrower pictures have taller captions, so this is searched).
 */
function cropRange(a: number, H: number, nat: number, inset: number, chrome: (w: number) => number, lo: number): { min: number; nat: number; max: number } {
  const ok = (w: number) => {
    const ih = H - chrome(w);
    if (ih <= 0) return false;
    const box = (w - inset) / ih;
    return box >= a / CROP && box <= a * CROP;
  };
  // The caption alone is (nearly) as tall as the row.
  if (!ok(nat)) return { min: Infinity, nat: Infinity, max: Infinity };
  const min = minWhere(Math.min(lo, nat), nat, ok, 10) ?? nat;
  const max = maxWhere(nat, nat * CROP * 2, ok, 10) ?? nat;
  return { min, nat, max };
}

interface RowPlan {
  R: number;
  H: number;
  /** Indices where each row starts (plus the end). */
  cuts: number[];
  cost: number;
}

/** Best split of the tiles (in order) into exactly R rows. */
function partition(fits: Fit[], R: number, W: number, gap: number): RowPlan | null {
  const n = fits.length;
  if (R > n) return null;
  // Prefix sums; infinite minima are counted separately (Infinity - Infinity is NaN).
  const pre = (f: (x: Fit) => number) => {
    const s = [0];
    const inf = [0];
    for (const x of fits) {
      const v = f(x);
      s.push(s[s.length - 1] + (Number.isFinite(v) ? v : 0));
      inf.push(inf[inf.length - 1] + (Number.isFinite(v) ? 0 : 1));
    }
    return (i: number, j: number) => (inf[j] - inf[i] ? Infinity : s[j] - s[i]);
  };
  const minS = pre((x) => x.min);
  const natS = pre((x) => x.nat);
  const maxS = pre((x) => x.max);
  const penS = pre((x) => x.pen);
  const cost = (i: number, j: number) => {
    const g = (j - i - 1) * gap;
    const lo = minS(i, j) + g;
    if (lo > W * 1.0001) return 1000 + Math.min(100, lo / W);
    const hi = maxS(i, j) + g;
    // Can't be made wide enough (only uncroppable content): a gap at the row end.
    const short = hi < W ? 4 * (1 - hi / W) : 0;
    const dev = Math.log((natS(i, j) + g) / W);
    return dev * dev * (j - i) + short + penS(i, j);
  };
  const best: number[][] = Array.from({ length: R + 1 }, () => new Array<number>(n + 1).fill(Infinity));
  const from: number[][] = Array.from({ length: R + 1 }, () => new Array<number>(n + 1).fill(-1));
  best[0][0] = 0;
  for (let r = 1; r <= R; r++)
    for (let j = r; j <= n - (R - r); j++)
      for (let i = r - 1; i < j; i++) {
        if (best[r - 1][i] === Infinity) continue;
        const c = best[r - 1][i] + cost(i, j);
        if (c < best[r][j]) {
          best[r][j] = c;
          from[r][j] = i;
        }
      }
  if (best[R][n] === Infinity) return null;
  const cuts = [n];
  for (let r = R, j = n; r > 0; r--) cuts.unshift((j = from[r][j]));
  return { R, H: 0, cuts, cost: best[R][n] };
}

function planRows(order: Tile[], area: Box, b: number, gap: number, meter: Meter): RowPlan | null {
  const maxRows = Math.min(order.length, Math.floor((area.h + gap) / (b * 3 + gap)));
  // Only row counts whose preferred widths roughly fill the rows are worth the partitioning.
  const options: { R: number; H: number; fits: Fit[]; fill: number }[] = [];
  for (let R = 1; R <= maxRows; R++) {
    const H = (area.h - (R - 1) * gap) / R;
    const fits = order.map((t) => estimate(meter, t, b, H));
    const sum = fits.reduce((s, f) => s + (Number.isFinite(f.nat) ? f.nat : area.w * 2), 0) + (order.length - R) * gap;
    options.push({ R, H, fits, fill: Math.abs(Math.log(sum / (R * area.w))) });
  }
  const closest = Math.min(...options.map((x) => x.fill));
  let best: RowPlan | null = null;
  for (const { R, H, fits, fill } of options) {
    if (fill > closest + 0.3) continue;
    const p = partition(fits, R, area.w, gap);
    if (p && (!best || p.cost < best.cost)) best = { ...p, H };
  }
  return best;
}

export interface RowsOptions {
  baseSize: number;
  autoSize: boolean;
  gap?: number;
  neat: number;
  meter: Meter;
  /** Text size of a previous good candidate, to narrow the size search. */
  hint?: number;
}

export function rowsLayout(order: Tile[], area: Box, o: RowsOptions): ArrangeResult {
  const { meter } = o;
  const gapOf = (b: number) => o.gap ?? autoGap(b);
  const feasible = (p: RowPlan | null) => !!p && p.cost < 1000;
  let b = o.baseSize;
  let plan: RowPlan | null;
  if (o.autoSize) {
    // Largest size at which every row can hold its text, then trade a little size for a better fit.
    let lo = 0.6;
    let hi = Math.min(area.w, area.h) / 6;
    let steps = 12;
    const planAt = (v: number) => planRows(order, area, v, gapOf(v), meter);
    if (o.hint && feasible(planAt(o.hint * 0.85)) && !feasible(planAt(Math.min(hi, o.hint * 1.2)))) {
      lo = o.hint * 0.85;
      hi = Math.min(hi, o.hint * 1.2);
      steps = 6;
    } else if (!feasible(planAt(lo))) hi = lo;
    for (let i = 0; i < steps && hi > lo; i++) {
      const mid = (lo + hi) / 2;
      if (feasible(planRows(order, area, mid, gapOf(mid), meter))) lo = mid;
      else hi = mid;
    }
    let best: { b: number; plan: RowPlan; score: number } | null = null;
    for (const f of [1, 0.95, 0.9, 0.85, 0.8, 0.7]) {
      const v = lo * f;
      const p = planRows(order, area, v, gapOf(v), meter);
      if (!p || !feasible(p)) continue;
      const score = Math.log(v) - p.cost / order.length;
      if (!best || score > best.score) best = { b: v, plan: p, score };
    }
    b = best?.b ?? lo;
    plan = best?.plan ?? planRows(order, area, b, gapOf(b), meter);
  } else plan = planRows(order, area, b, gapOf(b), meter);
  b = Math.floor(b * 1000) / 1000;
  let res = realize(order, area, plan, b, gapOf(b), o);
  // The plan works with estimated widths; if a row turns out too narrow for its text, try a little smaller.
  for (let i = 0; i < 8 && res.squeezed && o.autoSize; i++) {
    b = Math.floor(b * 0.93 * 1000) / 1000;
    plan = planRows(order, area, b, gapOf(b), meter);
    res = realize(order, area, plan, b, gapOf(b), o);
  }
  return { tiles: res.tiles, baseSize: b, overflow: res.overflow, badness: res.badness + (res.squeezed ? 1 : 0) };
}

function realize(
  order: Tile[],
  area: Box,
  plan: RowPlan | null,
  b: number,
  gap: number,
  o: RowsOptions,
): { tiles: Tile[]; overflow: boolean; badness: number; squeezed: boolean } {
  const { meter } = o;
  plan ??= { R: 1, H: area.h, cuts: [0, order.length], cost: 1000 };
  let squeezed = false;
  const out: Tile[] = [];
  let y = area.y;
  let slack = 0;
  let crop = 0;
  let images = 0;
  const H = plan.H || area.h;
  for (let r = 0; r < plan.cuts.length - 1; r++) {
    const row = order.slice(plan.cuts[r], plan.cuts[r + 1]);
    const inner = area.w - (row.length - 1) * gap;
    // Exact width ranges for this row.
    const fits = row.map((t) => {
      const e = estimate(meter, t, b, H);
      if (t.type === 'image') {
        // Width at which the uncropped picture is exactly H tall (on the rising part of its profile).
        const p = profile(meter, t);
        const lo = PROFILE_U[p.indexOf(Math.min(...p))] * b;
        const w = minWhere(lo, Math.max(lo, e.nat * 2, area.w), (v) => meter.h(t, v, b) >= H, 12) ?? lo;
        const inset = w - imageParts(meter, t, w, b).iw;
        const range = cropRange(t.image.aspect, H, w, inset, (v) => imageParts(meter, t, v, b).chrome, lo);
        if (Number.isFinite(range.min)) return range;
        squeezed = true;
        return { min: w, nat: w, max: w };
      }
      const lo = Math.max(wordWidth(meter, t) * b, Number.isFinite(e.min) ? e.min * 0.85 : b * 2);
      // Cards and infoboxes get taller again when wide (their picture grows): search below that.
      const top = Number.isFinite(e.max) ? Math.max(lo, Math.min(inner, e.max)) : inner;
      const exact = minWhere(lo, top, (w) => meter.h(t, w, b) <= H, 9);
      // Too tall at every width: the text size has to come down.
      if (exact === null) squeezed = true;
      const min = exact ?? (Number.isFinite(e.min) ? Math.max(lo, e.min) : inner);
      const max = Number.isFinite(e.max) ? (maxWhere(min, Math.max(min, Math.min(inner, e.max * 1.5)), (w) => meter.h(t, w, b) <= H, 9) ?? min) : Infinity;
      return { min, nat: Math.min(max, Math.max(min, e.nat)), max };
    });
    // Make the row exactly full by scaling widths by λ (clamped to each range): pictures
    // first (a crop is barely visible), text only once the pictures are at their limit.
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const sum = (ws: number[]) => ws.reduce((s, w) => s + w, 0);
    const solve = (at: (l: number) => number[]) => {
      let lo = 0;
      let hi = 1;
      while (sum(at(hi)) < inner && hi < 1e6) hi *= 2;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (sum(at(mid)) < inner) lo = mid;
        else hi = mid;
      }
      return at(hi);
    };
    const pic = row.map((t) => t.type === 'image');
    const picsAt = (l: number) => fits.map((f, i) => (pic[i] ? clamp(f.nat * l, f.min, f.max) : f.nat));
    let widths: number[];
    const minTotal = fits.reduce((s, f) => s + f.min, 0);
    const tight = minTotal >= inner;
    if (tight) {
      // Doesn't fit: pictures give way first (cropped beyond the usual limit), text only if it must.
      squeezed = true;
      const textMin = fits.reduce((s, f, i) => s + (pic[i] ? 0 : f.min), 0);
      const picMin = minTotal - textMin;
      const room = inner - textMin;
      widths =
        room > picMin * 0.3
          ? fits.map((f, i) => (pic[i] ? (f.min * room) / picMin : f.min))
          : fits.map((f, i) => (pic[i] ? f.min * 0.3 : f.min) * (inner / (textMin + picMin * 0.3)));
    } else {
      if (sum(picsAt(1e9)) < inner) widths = solve((l) => fits.map((f, i) => (pic[i] ? f.max : clamp(f.nat * (1 + l), f.nat, f.max))));
      else if (sum(picsAt(0)) > inner) widths = solve((l) => fits.map((f, i) => (pic[i] ? f.min : clamp(f.nat * l, f.min, f.nat))));
      else widths = solve(picsAt);
      // Content that can't widen any further leaves the rest of the row empty.
      if (sum(widths) < inner) slack += (inner - sum(widths)) * H;
    }
    let x = area.x;
    const placed: { t: Tile; h: number }[] = row.map((t, i) => {
      const w = widths[i];
      if (t.type === 'image') {
        // Cut the picture so the tile is exactly as tall as the row.
        const { iw, chrome } = imageParts(meter, t, w, b);
        const a = t.image.aspect;
        const box = Math.min(a * CROP * (tight ? 3 : 1), Math.max(a / (CROP * (tight ? 3 : 1)), iw / Math.max(H - chrome, 1e-3)));
        const nt = { ...t, boxAspect: box } as ImageTile;
        crop += Math.abs(Math.log(box / a));
        images++;
        return { t: nt, h: meter.h(nt, w, b) };
      }
      let h = meter.h(t, w, b);
      // Slightly larger text closes most of the leftover height.
      const top = Math.min(1.15 + 0.3 * o.neat, w / Math.max(1e-6, wordWidth(meter, t) * b));
      const g = h < H - b * 0.3 && top > 1 ? maxWhere(1, top, (v) => meter.h(t, w, b * v) <= H, 7) : null;
      if (g && g > 1.001) {
        h = meter.h(t, w, b * g);
        return { t: { ...t, grow: g } as Tile, h };
      }
      return { t, h };
    });
    const rowH = Math.max(H, ...placed.map((p) => p.h));
    // The last row sits on the bottom edge, so short tiles leave their gap inside the collage.
    const last = r === plan.cuts.length - 2 && r > 0;
    placed.forEach((p, i) => {
      out.push({ ...p.t, x, y: last ? y + rowH - p.h : y, w: widths[i], rot: 0 });
      slack += (rowH - p.h) * widths[i];
      x += widths[i] + gap;
    });
    y += rowH + gap;
  }
  const overflow = y - gap > area.y + area.h + 1e-6;
  const badness = (4 * slack) / (area.w * area.h) + (images ? (0.6 * crop) / images : 0) + Math.min(2, plan.cost / Math.max(1, order.length));
  return { tiles: out, overflow, badness, squeezed };
}

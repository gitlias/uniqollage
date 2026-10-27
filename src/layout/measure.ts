import type { Skin, Tile } from '../model';
import { imageBoxWidth, tileHeight } from '../render/tiles';
import { font, type FontStyle } from '../text/fonts';
import { stripMarkup } from '../text/markup';

/**
 * Cached tile measuring for the layout search. Heights are keyed by tile
 * object, width and body size, so repeated candidates (same tiles, same sizes)
 * cost nothing. A tile's `grow` multiplies the size, so instead of creating
 * grown copies, measure the original with `b * grow`.
 */
export class Meter {
  private heights = new WeakMap<Tile, Map<string, number>>();
  private memos = new WeakMap<Tile, Map<string, unknown>>();
  constructor(readonly skin: Skin) {}

  h(t: Tile, w: number, b: number): number {
    let m = this.heights.get(t);
    if (!m) this.heights.set(t, (m = new Map()));
    const k = `${w}|${b}`;
    let v = m.get(k);
    if (v === undefined) {
      v = tileHeight(t, w, b, this.skin);
      m.set(k, v);
    }
    return v;
  }

  /** Cache any derived value per tile (e.g. "width that fits height H at size b"). */
  memo<T>(t: Tile, key: string, fn: () => T): T {
    let m = this.memos.get(t);
    if (!m) this.memos.set(t, (m = new Map()));
    if (!m.has(key)) m.set(key, fn());
    return m.get(key) as T;
  }
}

/** Normalised widths (in units of the body size) at which tile profiles are sampled. */
export const PROFILE_U = Array.from({ length: 40 }, (_, i) => 2.5 * 1.15 ** i);

/**
 * Tile height (in body sizes) at each PROFILE_U width. Everything in a tile
 * scales with the body size, so one profile serves every size: the height at
 * width w and size b is about b × profile(w / b). Images are measured uncropped.
 */
export function profile(meter: Meter, t: Tile): number[] {
  // Sampled at size 4 so minimum stroke widths don't distort it.
  return meter.memo(t, 'profile', () => PROFILE_U.map((u) => meter.h(t, u * 4, 4) / 4));
}

/** Linear interpolation of a profile at normalised width u. */
export function profileAt(p: number[], u: number): number {
  const U = PROFILE_U;
  if (u <= U[0]) return p[0];
  const k = Math.min(U.length - 1, Math.max(1, Math.ceil(Math.log(u / U[0]) / Math.log(1.15))));
  if (u >= U[k]) return p[k];
  return p[k - 1] + ((p[k] - p[k - 1]) * (u - U[k - 1])) / (U[k] - U[k - 1]);
}

/** Largest value in [lo, hi] for which `ok` holds (ok is monotone: true then false). */
export function maxWhere(lo: number, hi: number, ok: (v: number) => boolean, steps = 10): number | null {
  if (!ok(lo)) return null;
  if (ok(hi)) return hi;
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Smallest value in [lo, hi] for which `ok` holds (ok is monotone: false then true). */
export function minWhere(lo: number, hi: number, ok: (v: number) => boolean, steps = 10): number | null {
  if (!ok(hi)) return null;
  if (ok(lo)) return lo;
  for (let i = 0; i < steps; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Width of the longest word in `text` (words over 25 characters, e.g. CJK sentences, break anyway). */
function longestWord(text: string, face: FontStyle, size: number): number {
  let max = 0;
  for (const w of text.split(/\s+/)) if (w.length <= 25) max = Math.max(max, font(face).measure(w, size));
  return max;
}

/**
 * Narrowest width (in body sizes) at which no word of the tile has to be split
 * across lines. Pictures return 0 (their captions may wrap as they like).
 */
export function wordWidth(meter: Meter, t: Tile): number {
  return meter.memo(t, 'word', () => {
    const k = t.scale;
    switch (t.type) {
      case 'title':
        return longestWord(t.text, 'serif', 2.1 * k) * 1.02;
      case 'text':
        return longestWord(stripMarkup(t.markup), 'sans', k) * 1.08;
      case 'card':
        return Math.max(longestWord(t.title, 'serif', 1.7 * k), longestWord(stripMarkup(t.markup), 'sans', k) * 1.08) + 1.4 * k;
      case 'infobox':
        return (
          Math.max(
            longestWord(t.heading, 'sans', 1.2 * k) + 0.4 * k,
            ...t.rows.map(([l, v]) => Math.max((longestWord(stripMarkup(l), 'sansBold', 0.88 * k) + 0.4 * k) / 0.4, longestWord(stripMarkup(v), 'sans', 0.88 * k) / 0.6)),
          ) + 0.9 * k
        );
      case 'image':
        return 0;
    }
  });
}

/** Natural width of a tile in body sizes (roughly what a column layout would give it). */
export function naturalWidth(t: Tile): number {
  switch (t.type) {
    case 'text': {
      const len = stripMarkup(t.markup).length * t.scale;
      return len < 140 ? 15 : len < 320 ? 22 : 30;
    }
    case 'title':
      return Math.min(40, Math.max(8, font('serif').measure(t.text, 2.1 * t.scale) * 1.05));
    case 'image':
      return t.image.aspect >= 1.3 ? 30 : t.image.aspect < 0.85 ? 15 : 22;
    case 'card':
      return stripMarkup(t.markup).length * t.scale < 220 ? 17 : 24;
    case 'infobox':
      return 17;
  }
}

/** Tiles whose size can be tuned with `grow` (everything but images). */
export const isTextLike = (t: Tile) => t.type !== 'image';

/** Width of the picture inside an image tile and the height of everything else (frame, caption). */
export function imageParts(meter: Meter, t: Extract<Tile, { type: 'image' }>, w: number, b: number): { iw: number; chrome: number } {
  const iw = imageBoxWidth({ ...t, w, grow: undefined }, b, meter.skin);
  return { iw, chrome: meter.h(t, w, b) - iw / (t.boxAspect ?? t.image.aspect) };
}

import { beforeAll, describe, expect, it } from 'vitest';
import { setupFonts } from './setup-fonts';
import { ARRANGEMENTS, arrangeTiles, articleKey, groupSpread, type Arrangement } from '../src/layout/arrange';
import type { Tile } from '../src/model';
import { renderTile } from '../src/render/tiles';
import { Meter, wordWidth } from '../src/layout/measure';

beforeAll(setupFonts);

/** Mixed tiles from `n / 4` articles (title, fact, picture, infobox each). */
function sample(n: number): Tile[] {
  const tiles: Tile[] = [];
  for (let i = 0; i < n; i++) {
    const article = `Article ${Math.floor(i / 4)}`;
    const base = { x: 0, y: 0, w: 50, rot: 0, scale: 1, id: `t${i}` };
    const src = { kind: 'wikipedia' as const, lang: 'en' as const, title: article };
    const k = i % 4;
    if (k === 0) tiles.push({ ...base, source: src, type: 'title', text: article, tagline: i % 8 === 0 });
    else if (k === 1)
      tiles.push({ ...base, source: src, type: 'text', markup: "The '''[[ginkgo]]''' is the only living species of its division, first seen 290 million years ago. ".repeat(1 + (i % 3)) });
    else if (k === 2)
      tiles.push({ ...base, source: { ...src, title: `File:${i}.jpg`, article }, type: 'image', image: { src: 'x.jpg', aspect: i % 3 ? 1.5 : 0.75 }, caption: 'An old [[tree]]', frame: true });
    else tiles.push({ ...base, source: src, type: 'infobox', heading: 'Ginkgo', rows: [['Kingdom', '[[Plantae]]'], ['Order', 'Ginkgoales']] });
  }
  // Interleave the articles so grouping has something to do.
  return [...tiles.filter((_, i) => i % 2 === 0), ...tiles.filter((_, i) => i % 2 === 1)];
}

const boxesOf = (tiles: Tile[], b: number) => tiles.map((t) => ({ x: t.x, y: t.y, w: t.w, h: renderTile(t, b).h }));
function overlaps(a: { x: number; y: number; w: number; h: number }, b: typeof a) {
  return a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;
}

const area = { x: 10, y: 5, w: 250, h: 320 };

describe.each(ARRANGEMENTS)('arrangement %s', (mode: Arrangement) => {
  for (const n of [3, 12, 30]) {
    it(`fits ${n} tiles inside the area without overlaps`, () => {
      const res = arrangeTiles(sample(n), area, { arrangement: mode, baseSize: 3, autoSize: true, seed: 42 });
      expect(res.overflow).toBe(false);
      expect(res.tiles.length).toBe(n);
      const boxes = boxesOf(res.tiles, res.baseSize);
      for (const b of boxes) {
        expect(b.x).toBeGreaterThanOrEqual(area.x - 1e-6);
        expect(b.y).toBeGreaterThanOrEqual(area.y - 1e-6);
        expect(b.x + b.w).toBeLessThanOrEqual(area.x + area.w + 1e-6);
        expect(b.y + b.h).toBeLessThanOrEqual(area.y + area.h + 1e-6);
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j]), `${i}/${j}`).toBe(false);
    });
  }

  it('reaches all four edges', () => {
    const res = arrangeTiles(sample(16), area, { arrangement: mode, baseSize: 3, autoSize: true, seed: 3 });
    const boxes = boxesOf(res.tiles, res.baseSize);
    expect(Math.min(...boxes.map((b) => b.x))).toBeCloseTo(area.x, 3);
    expect(Math.min(...boxes.map((b) => b.y))).toBeCloseTo(area.y, 3);
    expect(Math.max(...boxes.map((b) => b.x + b.w))).toBeCloseTo(area.x + area.w, 3);
    expect(Math.max(...boxes.map((b) => b.y + b.h))).toBeGreaterThan(area.y + area.h - 2);
  });

  it('is deterministic per seed', () => {
    const run = () => arrangeTiles(sample(12), area, { arrangement: mode, baseSize: 3, autoSize: true, seed: 7 }).tiles.map((t) => [t.id, t.x, t.y, t.w]);
    expect(run()).toEqual(run());
  });

  it('works with a fixed text size and spacing', () => {
    const res = arrangeTiles(sample(12), area, { arrangement: mode, baseSize: 2.5, autoSize: false, gap: 5, seed: 1 });
    const boxes = boxesOf(res.tiles, res.baseSize);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j]), `${i}/${j}`).toBe(false);
    if (mode !== 'mosaic') expect(res.baseSize).toBeCloseTo(2.5, 6);
  });
});

describe('balanced columns', () => {
  it('starts every column at the top and ends it at the bottom', () => {
    const res = arrangeTiles(sample(20), area, { arrangement: 'columns', baseSize: 3, autoSize: true, seed: 11 });
    const boxes = boxesOf(res.tiles, res.baseSize);
    for (const x of boxes.map((b) => b.x)) {
      const inCol = boxes.filter((b) => b.x <= x + 0.01 && x < b.x + b.w - 0.01);
      expect(Math.max(...inCol.map((b) => b.y + b.h))).toBeCloseTo(area.y + area.h, 2);
      expect(Math.min(...inCol.map((b) => b.y))).toBeCloseTo(area.y, 2);
    }
  });
});

describe('mosaic', () => {
  it('keeps text sizes within the chosen range', () => {
    const res = arrangeTiles(sample(16), area, { arrangement: 'mosaic', baseSize: 3, autoSize: true, seed: 5, optimize: { sizeRange: 1.5 } });
    const sizes = res.tiles.filter((t) => t.type !== 'image').map((t) => t.grow ?? 1);
    expect(Math.max(...sizes) / Math.min(...sizes)).toBeLessThanOrEqual(1.5 + 1e-6);
  });
});

describe('optimisation', () => {
  it('keeps articles together when grouping', () => {
    const tiles = sample(16);
    const spread = (group: boolean) => {
      const res = arrangeTiles(tiles, area, { arrangement: 'columns', baseSize: 3, autoSize: true, seed: 2, optimize: { group } });
      const rects = boxesOf(res.tiles, res.baseSize).map((b) => ({ x: b.x, y: b.y, r: b.x + b.w, b: b.y + b.h }));
      return groupSpread(res.tiles, rects, Math.hypot(area.w, area.h));
    };
    expect(spread(true)).toBeLessThan(spread(false));
  });

  it('knows which article a picture belongs to', () => {
    const img = sample(4).find((t) => t.type === 'image')!;
    expect(articleKey(img)).toBe('en:Article 0');
  });

  it('removes earlier fillers, growth and crops before arranging again', () => {
    const first = arrangeTiles(sample(12), area, { arrangement: 'mosaic', baseSize: 3, autoSize: true, seed: 4 });
    const fresh = first.tiles.map((t) => ({ ...t, grow: undefined, ...(t.type === 'image' ? { boxAspect: undefined } : {}) }) as Tile);
    const opts = { arrangement: 'mosaic' as const, baseSize: 3, autoSize: true, seed: 4 };
    const again = arrangeTiles(first.tiles, area, opts);
    expect(again.tiles.map((t) => [t.x, t.y, t.w, t.grow])).toEqual(arrangeTiles(fresh, area, opts).tiles.map((t) => [t.x, t.y, t.w, t.grow]));
  });
});

describe('few tiles', () => {
  it('never splits words, even when a few tiles fill a whole T-shirt', () => {
    const src = { kind: 'wikipedia' as const, lang: 'de' as const, title: 'Ginkgo' };
    const base = { x: 0, y: 0, w: 50, rot: 0, scale: 1, source: src };
    const tiles: Tile[] = [
      { ...base, id: 'a', type: 'title', text: 'Eiche', tagline: false },
      { ...base, id: 'b', type: 'card', title: 'Ginkgo', description: 'Baumart', markup: "'''Ginkgo''' ist ein Baum, der in vielen Wäldern Europas vorkommt und sehr alt werden kann.", image: { src: 'x', aspect: 1.2 } },
      { ...base, id: 'c', type: 'card', title: 'Fichte', description: 'Baumart', markup: "'''Fichte''' ist ein Baum, der in vielen Wäldern Europas vorkommt.", image: { src: 'x', aspect: 1.4 } },
      { ...base, id: 'd', type: 'text', markup: 'It is the only living genus of its order, first appearing about 290 million years ago in the [[Permian]].' },
      { ...base, id: 'e', type: 'image', image: { src: 'x', aspect: 0.8 }, caption: 'Leaves of a [[ginkgo]] in autumn', frame: true },
    ];
    const meter = new Meter('vector2010');
    for (const mode of ARRANGEMENTS) {
      const res = arrangeTiles(tiles, { x: 0, y: 0, w: 310, h: 354 }, { arrangement: mode, baseSize: 3, autoSize: true, seed: 1 });
      expect(res.overflow).toBe(false);
      for (const t of res.tiles) {
        expect(t.w, `${mode} ${t.type}`).toBeGreaterThanOrEqual(wordWidth(meter, t) * res.baseSize * (t.grow ?? 1) - 1e-6);
        // No narrow strips of text.
        if (t.type === 'card') expect(renderTile(t, res.baseSize).h / t.w, mode).toBeLessThan(4);
      }
    }
  });
});

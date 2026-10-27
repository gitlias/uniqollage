import { beforeAll, describe, expect, it } from 'vitest';
import { setupFonts } from './setup-fonts';
import { layoutText } from '../src/text/layout';
import { parseMarkup } from '../src/text/markup';
import { arrange } from '../src/layout/pack';
import type { Tile } from '../src/model';
import { renderTile } from '../src/render/tiles';

beforeAll(setupFonts);

const base = { x: 0, y: 0, w: 50, rot: 0, scale: 1, source: { kind: 'wikipedia' as const, lang: 'en' as const } };
function sample(n: number): Tile[] {
  const tiles: Tile[] = [];
  for (let i = 0; i < n; i++) {
    const k = i % 4;
    if (k === 0) tiles.push({ ...base, id: `t${i}`, type: 'title', text: `Article ${i}`, tagline: i % 8 === 0 });
    else if (k === 1) tiles.push({ ...base, id: `t${i}`, type: 'text', markup: "The '''[[ginkgo]]''' is the only living species of its division, first seen 290 million years ago. ".repeat(1 + (i % 3)) });
    else if (k === 2) tiles.push({ ...base, id: `t${i}`, type: 'image', image: { src: 'x.jpg', aspect: i % 3 ? 1.5 : 0.75 }, caption: 'An old [[tree]]', frame: true });
    else tiles.push({ ...base, id: `t${i}`, type: 'infobox', heading: 'Ginkgo', rows: [['Kingdom', '[[Plantae]]'], ['Order', 'Ginkgoales']] });
  }
  return tiles;
}

describe('layoutText', () => {
  it('wraps to the given width and colours links', () => {
    const b = layoutText(parseMarkup('The [[quick brown fox]] jumps over the lazy dog again and again'), 30, { size: 3, lineHeight: 1.6 });
    expect(b.lines).toBeGreaterThan(1);
    expect(b.maxLineWidth).toBeLessThanOrEqual(30);
    expect(b.paths.map((p) => p.fill).sort()).toEqual(['#202122', '#3366cc']);
    expect(b.height).toBeCloseTo(b.lines * 3 * 1.6);
  });
  it('hard-breaks words longer than the line', () => {
    const b = layoutText(parseMarkup('Donaudampfschifffahrtsgesellschaftskapitän'), 20, { size: 3, lineHeight: 1.5 });
    expect(b.lines).toBeGreaterThan(1);
    expect(b.maxLineWidth).toBeLessThanOrEqual(20);
  });
});

describe('renderTile', () => {
  it('renders every tile type with positive height', () => {
    for (const t of sample(4)) {
      const r = renderTile(t, 3);
      expect(r.h).toBeGreaterThan(0);
      expect(r.prims.length).toBeGreaterThan(0);
    }
  });
});

function overlaps(a: { x: number; y: number; w: number; h: number }, b: typeof a) {
  return a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;
}

describe('arrange', () => {
  for (const n of [3, 12, 30]) {
    it(`packs ${n} tiles inside the area without overlaps`, () => {
      const area = { x: 0, y: 0, w: 250, h: 320 };
      const res = arrange(sample(n), area, { baseSize: 3, autoSize: true, seed: 42 });
      expect(res.overflow).toBe(false);
      const boxes = res.tiles.map((t) => ({ x: t.x, y: t.y, w: t.w, h: renderTile(t, res.baseSize).h }));
      for (const b of boxes) {
        expect(b.x).toBeGreaterThanOrEqual(-1e-6);
        expect(b.x + b.w).toBeLessThanOrEqual(area.w + 1e-6);
        expect(b.y + b.h).toBeLessThanOrEqual(area.h + 1e-6);
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j])).toBe(false);
    });
  }
  it('is deterministic per seed', () => {
    const area = { x: 0, y: 0, w: 250, h: 250 };
    const a = arrange(sample(10), area, { baseSize: 3, autoSize: true, seed: 7 });
    const b = arrange(sample(10), area, { baseSize: 3, autoSize: true, seed: 7 });
    expect(a.tiles.map((t) => [t.x, t.y, t.w])).toEqual(b.tiles.map((t) => [t.x, t.y, t.w]));
  });
});

describe('font outlines', () => {
  it('never emits NaN (opentype.js toPathData bug) and survives variation selectors', async () => {
    const { font } = await import('../src/text/fonts');
    for (const st of ['serif', 'serifItalic', 'sans', 'sansBold'] as const) {
      const d = font(st).path('the Wikipedia ginkgo Enzyklopädie ᠋ x️', 0, 10, 3);
      expect(d).not.toContain('NaN');
      expect(d.length).toBeGreaterThan(100);
    }
  });
});

describe('night mode', () => {
  it('renders text and links in the dark palette', () => {
    const t = sample(2)[1];
    const fills = renderTile(t, 3, 'dark').prims.filter((p) => p.t === 'path').map((p) => (p as { fill: string }).fill);
    expect(new Set(fills)).toEqual(new Set(['#eaecf0', '#88a3e8']));
  });
});

describe('extended scripts', () => {
  it('has glyphs for Chechen palochka, polytonic Greek and Vietnamese', async () => {
    const { font } = await import('../src/text/fonts');
    // The .notdef box is a closed rectangle; real glyphs differ in width from it.
    const notdef = font('sans').measure('￿', 10);
    for (const ch of ['Ӏ', 'ӏ', 'ἀ', 'ệ']) expect(font('sans').measure(ch, 10)).not.toBe(notdef);
  });
});

describe('fixed spacing', () => {
  it('keeps exactly the chosen gap between neighbouring tiles', () => {
    const area = { x: 0, y: 0, w: 250, h: 320 };
    const res = arrange(sample(16), area, { baseSize: 3, autoSize: true, seed: 5, gap: 6 });
    const boxes = res.tiles.map((t) => ({ x: t.x, y: t.y, r: t.x + t.w, b: t.y + renderTile(t, res.baseSize).h }));
    let minH = Infinity;
    let minV = Infinity;
    for (const a of boxes)
      for (const b of boxes) {
        if (a === b) continue;
        const rowOverlap = a.y < b.b && b.y < a.b;
        const colOverlap = a.x < b.r && b.x < a.r;
        if (rowOverlap && b.x >= a.r - 1e-6) minH = Math.min(minH, b.x - a.r);
        if (colOverlap && b.y >= a.b - 1e-6) minV = Math.min(minV, b.y - a.b);
      }
    expect(minH).toBeCloseTo(6, 6);
    expect(minV).toBeGreaterThanOrEqual(6 - 0.01);
  });
});

describe('neat layout', () => {
  const words = 'ginkgo tree leaf autumn seed temple garden fossil species ancient yellow fan shaped survivor city street'.split(' ');
  const reserve = Array.from({ length: 60 }, (_, i) => ({
    markup: Array.from({ length: 8 + (i % 17) }, (_, j) => words[(i * 7 + j * 3) % words.length]).join(' ') + '.',
    source: { kind: 'wikipedia' as const },
  }));
  const area = { x: 0, y: 0, w: 250, h: 320 };
  const columnBottoms = (tiles: Tile[], b: number) => {
    const xs = [...new Set(tiles.map((t) => Math.round(t.x)))];
    return xs.map((x) => Math.max(...tiles.filter((t) => Math.round(t.x) <= x && x < t.x + t.w - 1).map((t) => t.y + renderTile(t, b).h)));
  };

  it('ends every column flush at the bottom (fillers + growth), without overlaps', () => {
    const loose = arrange(sample(14), area, { baseSize: 3, autoSize: false, seed: 9, gap: 4 });
    const neat = arrange(sample(14), area, { baseSize: 3, autoSize: false, seed: 9, gap: 4, neat: 1, reserve });
    const spread = (bs: number[]) => Math.max(...bs) - Math.min(...bs);
    expect(spread(columnBottoms(loose.tiles, 3))).toBeGreaterThan(10);
    const bottoms = columnBottoms(neat.tiles, 3);
    for (const bt of bottoms) expect(bt).toBeGreaterThan(area.h - 3 * 1.4 - 4 - 1);
    expect(neat.tiles.some((t) => t.type === 'text' && t.filler)).toBe(true);
    const boxes = neat.tiles.map((t) => ({ x: t.x, y: t.y, w: t.w, h: renderTile(t, 3).h }));
    for (const b of boxes) expect(b.y + b.h).toBeLessThanOrEqual(area.h + 1e-6);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j]), `${i}/${j}`).toBe(false);
  });

  it('does not accumulate growth or fillers when arranging again', () => {
    const first = arrange(sample(10), area, { baseSize: 3, autoSize: false, seed: 2, neat: 1, reserve });
    const again = arrange(first.tiles, area, { baseSize: 3, autoSize: false, seed: 2, neat: 1, reserve });
    expect(again.tiles.length).toBe(first.tiles.length);
    const growth = (ts: Tile[]) => ts.reduce((s, t) => s + (t.grow ?? 1), 0);
    expect(growth(again.tiles)).toBeCloseTo(growth(first.tiles), 6);
  });
});

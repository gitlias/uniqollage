import { beforeAll, describe, expect, it } from 'vitest';
import { setupFonts } from './setup-fonts';
import { articlePage } from '../src/layout/page';
import { parseArticle } from '../src/wiki/parse';
import { renderTile } from '../src/render/tiles';
import type { Tile } from '../src/model';
// @ts-expect-error plain JS fixture shared with the browser test
import { articleHtml } from './e2e/fixtures.mjs';

beforeAll(setupFonts);

// Make the fixture long enough to overflow a T-shirt print area.
const long = articleHtml.replace('<h2>References</h2>', `${'<h2>More</h2><p>Ginkgo leaves turn bright yellow in autumn and fall within a few days. Many old trees grow near temples in Japan and China, where they are considered sacred.</p>'.repeat(30)}<h2>References</h2>`);
const parsed = parseArticle(long, 'en');
const article = { ...parsed, lang: 'en' as const, title: 'Ginkgo', url: 'https://en.wikipedia.org/wiki/Ginkgo', images: new Map() };
const area = { x: 0, y: 0, w: 310, h: 354 };

describe('articlePage', () => {
  let tiles: Tile[] = [];
  beforeAll(() => {
    tiles = articlePage(article, area, { baseSize: 4, skin: 'vector2010' });
  });
  const box = (t: Tile) => ({ x: t.x, y: t.y, r: t.x + t.w, b: t.y + renderTile(t, 4).h });

  it('starts with the title and floats the infobox on the right', () => {
    expect(tiles[0]).toMatchObject({ type: 'title', text: 'Ginkgo', tagline: true, w: 310 });
    const ib = tiles.find((t) => t.type === 'infobox')!;
    expect(ib.x + ib.w).toBeCloseTo(310);
    expect(ib.x).toBeGreaterThan(150);
  });
  it('stays inside the area without overlaps', () => {
    const boxes = tiles.map(box);
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(-1e-6);
      expect(b.r).toBeLessThanOrEqual(310 + 1e-6);
      expect(b.b).toBeLessThanOrEqual(354 + 1e-6);
    }
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, c] = [boxes[i], boxes[j]];
        expect(a.x < c.r - 1e-6 && c.x < a.r - 1e-6 && a.y < c.b - 1e-6 && c.y < a.b - 1e-6, `${i}/${j} overlap`).toBe(false);
      }
  });
  it('adds section headings and cuts the last paragraph with "…"', () => {
    expect(tiles.some((t) => t.type === 'title' && t.text === 'History' && !t.tagline)).toBe(true);
    const last = tiles.filter((t) => t.type === 'text').at(-1)!;
    // The page is filled: either the last paragraph is cut with "…", or
    // not even two more lines would have fitted.
    const cut = last.type === 'text' && last.markup.endsWith('…');
    expect(cut || box(last).b > 354 - 2 * 1.6 * 4 - 4).toBe(true);
    expect(tiles.some((t) => t.type === 'text' && t.markup.endsWith('…'))).toBe(cut);
  });
});

import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupFonts } from './setup-fonts';
import { visualOrder, layoutText, type Word } from '../src/text/layout';
import { parseMarkup } from '../src/text/markup';
import { font, isCovered, strongDirection } from '../src/text/fonts';
import { ensureFonts } from '../src/text/fallback';

beforeAll(setupFonts);

const w = (text: string): Word => [{ text, run: { text, link: false, bold: false, italic: false }, width: 1 }] as Word;
const order = (words: string[], base: 'ltr' | 'rtl') => visualOrder(words.map(w), base).map((x) => x.word[0].text);

describe('bidi word order', () => {
  it('detects direction', () => {
    expect(strongDirection('القاهرة')).toBe('rtl');
    expect(strongDirection('(1969)')).toBeNull();
    expect(strongDirection('Kairo')).toBe('ltr');
  });
  it('reverses Arabic runs inside left-to-right text', () => {
    expect(order(['Die', 'Stadt', 'القاهرة', 'الكبرى', 'ist', 'groß'], 'ltr')).toEqual(['Die', 'Stadt', 'الكبرى', 'القاهرة', 'ist', 'groß']);
  });
  it('lays out right-to-left paragraphs from the right, keeping Latin runs readable', () => {
    expect(order(['مدينة', 'Kairo', 'Stadt', 'كبيرة'], 'rtl')).toEqual(['كبيرة', 'Kairo', 'Stadt', 'مدينة']);
  });
  it('keeps numbers between Arabic words inside the Arabic run', () => {
    expect(order(['a', 'عام', '1969', 'م', 'b'], 'ltr')).toEqual(['a', 'م', '1969', 'عام', 'b']);
  });
});

// Real Noto fonts from the Fontsource CDN (skipped when offline).
const online = await fetch('https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-arabic@latest/arabic-400-normal.ttf', { method: 'HEAD' })
  .then((r) => r.ok)
  .catch(() => false);

describe.skipIf(!online)('on-demand script fonts', () => {
  beforeAll(() => {
    const realFetch = globalThis.fetch;
    // The app fetches the table from its own origin; serve it from public/.
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
      String(url).endsWith('noto-fonts.json') ? Promise.resolve(new Response(readFileSync('public/noto-fonts.json'))) : realFetch(url, init),
    );
  });
  afterAll(() => vi.unstubAllGlobals());

  const samples = {
    arabic: 'القاهرة',
    hebrew: 'ירושלים',
    devanagari: 'हिन्दी',
    thai: 'กรุงเทพมหานคร',
    japanese: '東京都とうきょう',
  };

  it('loads fonts so that every character has a glyph', async () => {
    await ensureFonts(Object.values(samples).join(' '));
    for (const text of Object.values(samples)) for (const ch of text) expect(isCovered(ch.codePointAt(0)!), `${ch} in ${text}`).toBe(true);
    for (const text of Object.values(samples)) expect(font('sans').shape(text).glyphs.every((g) => g.g !== 0), text).toBe(true);
  }, 60_000);

  it('loads one CJK chunk per character even with concurrent requests', async () => {
    const urls: string[] = [];
    const prev = globalThis.fetch;
    vi.stubGlobal('fetch', (u: string, i?: RequestInit) => {
      urls.push(String(u));
      return prev(u, i);
    });
    await Promise.all([ensureFonts('大阪'), ensureFonts('大阪'), ensureFonts('大阪 市')]);
    vi.stubGlobal('fetch', prev);
    const ttf = new Set(urls.filter((u) => u.endsWith('.ttf')));
    expect(ttf.size).toBeLessThanOrEqual(3);
    for (const ch of '大阪市') expect(isCovered(ch.codePointAt(0)!)).toBe(true);
  }, 60_000);

  it('picks the font made for each script (CJK chunk ranges over-claim)', async () => {
    const urls: string[] = [];
    const prev = globalThis.fetch;
    vi.stubGlobal('fetch', (u: string, i?: RequestInit) => {
      urls.push(String(u));
      return prev(u, i);
    });
    await ensureFonts('سلام ภาษาไทย ქართული Հայերեն ܐܪܡܝܐ');
    vi.stubGlobal('fetch', prev);
    const ttf = urls.filter((u) => u.endsWith('.ttf')).map((u) => u.split('/fonts/')[1].split('@')[0]);
    expect(ttf.some((id) => ['noto-sans-sc', 'noto-sans-tc', 'noto-sans-hk', 'noto-sans-mongolian'].includes(id))).toBe(false);
    for (const ch of 'ไქՀܐ') expect(isCovered(ch.codePointAt(0)!), ch).toBe(true);
  }, 60_000);

  it('shapes Arabic into joined forms and Devanagari into conjuncts', () => {
    // Joined Arabic letters use different glyphs than the isolated form.
    const joined = font('sans').shape('سسس').glyphs.map((g) => g.g);
    const isolated = font('sans').shape('س').glyphs[0].g;
    expect(joined).not.toContain(isolated);
    // "न्द" becomes a conjunct: fewer glyphs than code points.
    expect(font('sans').shape('हिन्दी').glyphs.length).toBeLessThan([...'हिन्दी'].length);
  });

  it('right-aligns Arabic paragraphs and breaks Thai/Japanese without spaces', () => {
    const ar = layoutText(parseMarkup('القاهرة هي عاصمة مصر'), 200, { size: 4, lineHeight: 1.5, measureOnly: false });
    const minX = Math.min(...ar.paths.flatMap((p) => [...p.d.matchAll(/[ML]([\d.]+)/g)].map((m) => Number(m[1]))));
    expect(minX).toBeGreaterThan(100);
    const th = layoutText(parseMarkup(samples.thai.repeat(4)), 40, { size: 4, lineHeight: 1.5 });
    expect(th.lines).toBeGreaterThan(1);
    expect(th.maxLineWidth).toBeLessThanOrEqual(40);
  });
});

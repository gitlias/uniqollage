import { afterEach, describe, expect, it, vi } from 'vitest';
import { allocate, FILL_TYPES, randomFill } from '../src/wiki/randomFill';
import { rng } from '../src/layout/pack';
// @ts-expect-error plain JS fixture shared with the browser test
import { handle } from './e2e/fixtures.mjs';

describe('allocate', () => {
  it('splits the count over the selected types only', () => {
    for (const count of [5, 23, 50]) {
      const need = allocate(['fact', 'image', 'infobox'], count, rng(count));
      expect(Object.values(need).reduce((a, b) => a + b, 0)).toBe(count);
      expect(need.fact).toBeGreaterThan(0);
      expect(need.infobox).toBeGreaterThan(0);
      expect(need.dyk + need.card + need.title).toBe(0);
    }
  });
});

describe('randomFill', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('produces the requested number of tiles of every type (mocked Wikipedia)', async () => {
    vi.stubGlobal('fetch', async (url: string) => {
      const r = handle(url);
      return new Response(r.body, { status: r.status ?? 200, headers: { 'content-type': r.contentType } });
    });
    const progress: number[] = [];
    const res = await randomFill({ types: FILL_TYPES, count: 14, langs: ['en', 'de'], rand: rng(3), onProgress: (n) => progress.push(n) });
    expect(res.drafts.length + Object.values(res.missing).reduce((a, b) => a + (b ?? 0), 0)).toBe(14);
    expect(res.drafts.length).toBeGreaterThanOrEqual(10);
    expect(new Set(res.drafts.map((d) => d.type))).toEqual(new Set(['text', 'card', 'title', 'image', 'infobox']));
    expect(progress.at(-1)).toBe(res.drafts.length);
    // Pictures use standard Wikimedia widths.
    for (const d of res.drafts) if (d.type === 'image') expect(d.image.src).toMatch(/\/(1920|250)px-/);
  });
});

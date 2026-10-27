import { beforeAll, describe, expect, it } from 'vitest';
import { setupFonts } from './setup-fonts';
import { resizeTile } from '../src/layout/resize';
import { renderTile } from '../src/render/tiles';
import type { ImageTile, TextTile, Tile } from '../src/model';

beforeAll(setupFonts);

const ctx = { baseSize: 3, skin: 'vector2010' as const };
const base = { x: 50, y: 40, rot: 0, scale: 1, source: { kind: 'wikipedia' as const } };
const text: TextTile = { ...base, id: 't', type: 'text', w: 60, markup: 'The ginkgo is the only living species of its division, first seen 290 million years ago.' };
const img: ImageTile = { ...base, id: 'i', type: 'image', w: 60, image: { src: 'x', aspect: 1.5 }, caption: 'A tree', frame: true };
const h = (t: Tile) => renderTile(t, ctx.baseSize, 'light', ctx.skin).h;
const apply = (t: Tile, handle: Parameters<typeof resizeTile>[2], dx: number, dy: number) => ({ ...t, ...resizeTile(t, h(t), handle, dx, dy, ctx) }) as Tile;

describe('resizeTile', () => {
  it('left edge: wider, right edge stays', () => {
    const t = apply(text, 'w', -10, 0);
    expect(t.w).toBeCloseTo(70);
    expect(t.x + t.w).toBeCloseTo(text.x + text.w);
  });
  it('bottom edge on text: larger text, top stays', () => {
    const t = apply(text, 's', 0, 10);
    expect(t.scale).toBeGreaterThan(1);
    expect(h(t)).toBeCloseTo(h(text) + 10, 0);
    expect(t.y).toBeCloseTo(text.y);
  });
  it('top edge on image: crops the picture, bottom stays', () => {
    const t = apply(img, 'n', 0, -15) as ImageTile;
    expect(t.boxAspect).toBeLessThan(1.5);
    expect(h(t)).toBeCloseTo(h(img) + 15, 5);
    expect(t.y + h(t)).toBeCloseTo(img.y + h(img), 5);
  });
  it('corner scales width and text together, opposite corner stays', () => {
    const t = apply(text, 'nw', -12, -6);
    expect(t.w / text.w).toBeCloseTo(t.scale / text.scale, 5);
    expect(t.x + t.w).toBeCloseTo(text.x + text.w, 5);
    expect(t.y + h(t)).toBeCloseTo(text.y + h(text), 5);
  });
  it('keeps the opposite edge fixed on rotated tiles', () => {
    const r = { ...text, rot: 30 };
    const t = apply(r, 'e', 10, 0);
    // Left-edge midpoint in page coordinates before and after.
    const leftMid = (u: Tile) => {
      const a = (u.rot * Math.PI) / 180;
      const hh = h(u);
      return { x: u.x + u.w / 2 - (u.w / 2) * Math.cos(a), y: u.y + hh / 2 - (u.w / 2) * Math.sin(a) };
    };
    expect(leftMid(t).x).toBeCloseTo(leftMid(r).x, 5);
    expect(leftMid(t).y).toBeCloseTo(leftMid(r).y, 5);
  });
});

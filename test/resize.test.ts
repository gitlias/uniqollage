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
  it('left edge: wider, right edge and top stay', () => {
    const t = apply(text, 'w', -10, 0);
    expect(t.w).toBeCloseTo(70);
    expect(t.x + t.w).toBeCloseTo(text.x + text.w);
    expect(t.y).toBeCloseTo(text.y);
  });
  it('right edge on an image crops: left, top and bottom stay', () => {
    const t = apply(img, 'e', 20, 0) as ImageTile;
    expect(t.w).toBeCloseTo(80);
    expect(t.x).toBeCloseTo(img.x);
    expect(t.y).toBeCloseTo(img.y);
    expect(h(t)).toBeCloseTo(h(img), 5);
    expect(t.boxAspect).toBeGreaterThan(1.5);
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
  it('keeps the top-left corner fixed on rotated tiles when dragging the right edge', () => {
    const r = { ...text, rot: 30 };
    const t = apply(r, 'e', 10, 0);
    const topLeft = (u: Tile) => {
      const a = (u.rot * Math.PI) / 180;
      const hh = h(u);
      const lx = -u.w / 2;
      const ly = -hh / 2;
      return { x: u.x + u.w / 2 + lx * Math.cos(a) - ly * Math.sin(a), y: u.y + hh / 2 + lx * Math.sin(a) + ly * Math.cos(a) };
    };
    expect(topLeft(t).x).toBeCloseTo(topLeft(r).x, 5);
    expect(topLeft(t).y).toBeCloseTo(topLeft(r).y, 5);
  });
});

describe('resizeTile without cropping', () => {
  const noCrop = { ...ctx, crop: false };
  const drag = (t: Tile, handle: Parameters<typeof resizeTile>[2], dx: number, dy: number) => ({ ...t, ...resizeTile(t, h(t), handle, dx, dy, noCrop) }) as Tile;
  it('side and top/bottom edges scale the picture instead of cropping it', () => {
    const wider = drag(img, 'e', 15, 0) as ImageTile;
    expect(wider.boxAspect).toBeUndefined();
    expect(wider.w).toBeCloseTo(75);
    expect(h(wider)).toBeGreaterThan(h(img));
    const taller = drag(img, 's', 0, 12) as ImageTile;
    expect(taller.boxAspect).toBeUndefined();
    expect(h(taller)).toBeCloseTo(h(img) + 12, 1);
    // The top edge keeps the bottom in place.
    const up = drag(img, 'n', 0, -12) as ImageTile;
    expect(up.y + h(up)).toBeCloseTo(img.y + h(img), 1);
  });
});

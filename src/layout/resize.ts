import type { Skin, Tile } from '../model';
import { imageBoxWidth, tileHeight } from '../render/tiles';

// Resizing a tile from any edge or corner. A tile's height follows from its
// content, so each handle maps to something the content can do:
// - left/right edges: width (text reflows, images scale)
// - top/bottom edges: images crop (box aspect); text-like tiles change their
//   text size until the tile reaches the dragged height
// - corners: scale width and text size together
// The opposite edge/corner stays put, also for rotated tiles.

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

const MIN_W = 8;
const SCALE = [0.2, 8] as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Text scale at which the tile is `target` mm high (height grows with scale). */
function scaleForHeight(t: Tile, target: number, height: (t: Tile) => number): number {
  let lo: number = SCALE[0];
  let hi: number = SCALE[1];
  if (height({ ...t, scale: lo } as Tile) >= target) return lo;
  if (height({ ...t, scale: hi } as Tile) <= target) return hi;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (height({ ...t, scale: mid } as Tile) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * New placement/size for dragging `handle` of tile `t0` (rendered height `h0`)
 * by (dx, dy) page millimetres.
 */
export function resizeTile(t0: Tile, h0: number, handle: Handle, dx: number, dy: number, ctx: { baseSize: number; skin: Skin }): Partial<Tile> {
  const height = (t: Tile) => tileHeight(t, t.w, ctx.baseSize, ctx.skin);
  const a = (t0.rot * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  // Pointer movement in the tile's own (unrotated) axes.
  const lx = dx * cos + dy * sin;
  const ly = -dx * sin + dy * cos;
  const E = handle.includes('e');
  const W = handle.includes('w');
  const N = handle.includes('n');
  const S = handle.includes('s');

  let patch: Partial<Tile>;
  if ((E || W) && (N || S)) {
    const kx = (t0.w + (E ? lx : -lx)) / t0.w;
    const ky = (h0 + (S ? ly : -ly)) / h0;
    const k = clamp((kx + ky) / 2, MIN_W / t0.w, 20);
    patch = { w: t0.w * k, scale: clamp(t0.scale * k, SCALE[0], SCALE[1]) };
  } else if (E || W) {
    patch = { w: Math.max(MIN_W, t0.w + (E ? lx : -lx)) };
  } else {
    const target = Math.max(3, h0 + (S ? ly : -ly));
    if (t0.type === 'image') {
      // Taller or flatter picture box: the image is cropped to fill it.
      const iw = imageBoxWidth(t0, ctx.baseSize, ctx.skin);
      const ih0 = iw / (t0.boxAspect ?? t0.image.aspect);
      const ih = Math.max(iw * 0.1, ih0 + target - h0);
      patch = { boxAspect: clamp(iw / ih, 0.1, 10) };
    } else {
      patch = { scale: scaleForHeight(t0, target, height) };
    }
  }

  // Keep the opposite edge/corner (or the centre line) fixed on the page.
  const t1 = { ...t0, ...patch } as Tile;
  const h1 = height(t1);
  const anchor = (w: number, h: number) => ({ x: W ? w : E ? 0 : w / 2, y: N ? h : S ? 0 : h / 2 });
  const rotate = (x: number, y: number) => ({ x: x * cos - y * sin, y: x * sin + y * cos });
  const a0 = anchor(t0.w, h0);
  const r0 = rotate(a0.x - t0.w / 2, a0.y - h0 / 2);
  const page = { x: t0.x + t0.w / 2 + r0.x, y: t0.y + h0 / 2 + r0.y };
  const a1 = anchor(t1.w, h1);
  const r1 = rotate(a1.x - t1.w / 2, a1.y - h1 / 2);
  return { ...patch, x: page.x - r1.x - t1.w / 2, y: page.y - r1.y - h1 / 2 };
}

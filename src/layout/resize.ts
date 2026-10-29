import type { Skin, Tile } from '../model';
import { imageBoxWidth, tileHeight } from '../render/tiles';

// Resizing a tile from any edge or corner. A tile's height follows from its
// content, so each handle maps to something the content can do:
// - left/right edges: width; text reflows, images crop (their height stays)
// - top/bottom edges: images crop (box aspect); text-like tiles change their
//   text size until the tile reaches the dragged height
// With cropping switched off, images keep their aspect ratio on every handle:
// the dragged edge scales the whole picture.
// - corners: scale width and text size together
// Only the dragged edge moves: the opposite edge stays put and side handles
// keep the top (or, for the top handle, the bottom) fixed – also when rotated.

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
export function resizeTile(
  orig: Tile,
  h0: number,
  handle: Handle,
  dx: number,
  dy: number,
  ctx: { baseSize: number; skin: Skin; crop?: boolean },
): Partial<Tile> {
  // Growth from the neat layout becomes part of the tile's own scale.
  const folded = !!orig.grow;
  const t0 = folded ? ({ ...orig, scale: orig.scale * orig.grow!, grow: undefined } as Tile) : orig;
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
  } else if (t0.type === 'image' && ctx.crop === false) {
    // Uncropped: the picture scales; find the width that gives the dragged size.
    if (E || W) patch = { w: Math.max(MIN_W, t0.w + (E ? lx : -lx)) };
    else {
      const target = Math.max(3, h0 + (S ? ly : -ly));
      let lo = MIN_W;
      let hi = Math.max(t0.w * 20, MIN_W * 2);
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (height({ ...t0, w: mid } as Tile) < target) lo = mid;
        else hi = mid;
      }
      patch = { w: (lo + hi) / 2 };
    }
  } else if (E || W) {
    const w = Math.max(MIN_W, t0.w + (E ? lx : -lx));
    if (t0.type === 'image') {
      // Keep the picture's height: a wider/narrower box crops the image.
      const ih = imageBoxWidth(t0, ctx.baseSize, ctx.skin) / (t0.boxAspect ?? t0.image.aspect);
      const iw = imageBoxWidth({ ...t0, w }, ctx.baseSize, ctx.skin);
      patch = { w, boxAspect: clamp(iw / ih, 0.1, 10) };
    } else {
      patch = { w };
    }
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

  // Keep the opposite edge/corner fixed on the page; side handles keep the
  // top-left (top handle: bottom-left) so nothing else shifts.
  const t1 = { ...t0, ...patch } as Tile;
  const h1 = height(t1);
  const anchor = (w: number, h: number) => ({ x: W ? w : 0, y: N ? h : 0 });
  const rotate = (x: number, y: number) => ({ x: x * cos - y * sin, y: x * sin + y * cos });
  const a0 = anchor(t0.w, h0);
  const r0 = rotate(a0.x - t0.w / 2, a0.y - h0 / 2);
  const page = { x: t0.x + t0.w / 2 + r0.x, y: t0.y + h0 / 2 + r0.y };
  const a1 = anchor(t1.w, h1);
  const r1 = rotate(a1.x - t1.w / 2, a1.y - h1 / 2);
  const fold = folded ? { scale: t0.scale, grow: undefined } : {};
  return { ...fold, ...patch, x: page.x - r1.x - t1.w / 2, y: page.y - r1.y - h1 / 2 };
}

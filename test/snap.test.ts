import { describe, expect, it } from 'vitest';
import { boundsOf, MOVE_EDGES, snapBox } from '../src/layout/snap';

const page = { x: 0, y: 0, w: 300, h: 400 };
const opts = { gap: 3, threshold: 2, edges: MOVE_EDGES };

describe('snapBox', () => {
  it('snaps to the page edge and shows a guide', () => {
    const r = snapBox({ x: 1.2, y: 50, w: 40, h: 30 }, [], [page], opts);
    expect(r.dx).toBeCloseTo(-1.2);
    expect(r.dy).toBe(0);
    expect(r.guides).toEqual([{ x1: 0, y1: 0, x2: 0, y2: 400 }]);
  });
  it('snaps to the layout spacing next to a neighbour in the same row', () => {
    const other = { x: 10, y: 50, w: 60, h: 40 };
    // Neighbour's right edge is 70; with gap 3 the left edge should land on 73.
    const r = snapBox({ x: 74.5, y: 55, w: 40, h: 30 }, [other], [], opts);
    expect(r.dx).toBeCloseTo(-1.5);
  });
  it('does not apply the spacing to tiles far away in the other axis', () => {
    const other = { x: 10, y: 300, w: 60, h: 40 };
    expect(snapBox({ x: 74.5, y: 55, w: 40, h: 30 }, [other], [], opts).dx).toBe(0);
  });
  it('aligns centres', () => {
    const r = snapBox({ x: 129, y: 10, w: 40, h: 30 }, [], [page], opts);
    expect(r.dx).toBeCloseTo(1); // centre 149 → 150
  });
  it('only snaps the requested edges', () => {
    const r = snapBox({ x: 1, y: 50, w: 40, h: 30 }, [], [page], { ...opts, edges: { right: true } });
    expect(r.dx).toBe(0);
  });
  it('uses the bounding box of rotated tiles', () => {
    const b = boundsOf(0, 0, 40, 20, 90);
    expect(b.w).toBeCloseTo(20);
    expect(b.h).toBeCloseTo(40);
    expect(b.x).toBeCloseTo(10);
  });
});

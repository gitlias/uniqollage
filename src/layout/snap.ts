// Snapping while moving or resizing tiles: edges and centres align with the
// print area, the content box (margins), the page centre and other tiles, and
// neighbours snap to the layout spacing (the gap the auto layout uses).

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Guide {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Which edges of the moving box may snap. */
export interface SnapEdges {
  left?: boolean;
  right?: boolean;
  top?: boolean;
  bottom?: boolean;
  centerX?: boolean;
  centerY?: boolean;
}

export const MOVE_EDGES: SnapEdges = { left: true, right: true, top: true, bottom: true, centerX: true, centerY: true };

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

/** Axis-aligned bounding box of a (possibly rotated) tile. */
export function boundsOf(x: number, y: number, w: number, h: number, rot: number): Box {
  if (!rot) return { x, y, w, h };
  const a = (rot * Math.PI) / 180;
  const cw = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a));
  const ch = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
  return { x: x + w / 2 - cw / 2, y: y + h / 2 - ch / 2, w: cw, h: ch };
}

interface Candidate {
  delta: number;
  at: number;
  /** Extent of the guide line along the other axis. */
  from: number;
  to: number;
}

const overlaps = (a0: number, a1: number, b0: number, b1: number, slack: number) => a0 < b1 + slack && b0 < a1 + slack;

/**
 * Snap `box` to `frames` (print area, content box) and `others` (tiles).
 * Returns the correction to apply and guide lines for what it snapped to.
 */
export function snapBox(box: Box, others: Box[], frames: Box[], opts: { gap: number; threshold: number; edges: SnapEdges }): SnapResult {
  const { gap, threshold, edges } = opts;
  const right = box.x + box.w;
  const bottom = box.y + box.h;
  const xs: Candidate[] = [];
  const ys: Candidate[] = [];
  const tryX = (value: number, target: number, from: number, to: number) => {
    const delta = target - value;
    if (Math.abs(delta) <= threshold) xs.push({ delta, at: target, from, to });
  };
  const tryY = (value: number, target: number, from: number, to: number) => {
    const delta = target - value;
    if (Math.abs(delta) <= threshold) ys.push({ delta, at: target, from, to });
  };

  for (const f of frames) {
    const fr = f.x + f.w;
    const fb = f.y + f.h;
    for (const t of [f.x, fr]) {
      if (edges.left) tryX(box.x, t, f.y, fb);
      if (edges.right) tryX(right, t, f.y, fb);
    }
    if (edges.centerX) tryX(box.x + box.w / 2, f.x + f.w / 2, f.y, fb);
    for (const t of [f.y, fb]) {
      if (edges.top) tryY(box.y, t, f.x, fr);
      if (edges.bottom) tryY(bottom, t, f.x, fr);
    }
    if (edges.centerY) tryY(box.y + box.h / 2, f.y + f.h / 2, f.x, fr);
  }

  for (const o of others) {
    const or = o.x + o.w;
    const ob = o.y + o.h;
    const spanY: [number, number] = [Math.min(box.y, o.y), Math.max(bottom, ob)];
    const spanX: [number, number] = [Math.min(box.x, o.x), Math.max(right, or)];
    // Aligned edges and centres.
    if (edges.left) for (const t of [o.x, or]) tryX(box.x, t, ...spanY);
    if (edges.right) for (const t of [o.x, or]) tryX(right, t, ...spanY);
    if (edges.centerX) tryX(box.x + box.w / 2, o.x + o.w / 2, ...spanY);
    if (edges.top) for (const t of [o.y, ob]) tryY(box.y, t, ...spanX);
    if (edges.bottom) for (const t of [o.y, ob]) tryY(bottom, t, ...spanX);
    if (edges.centerY) tryY(box.y + box.h / 2, o.y + o.h / 2, ...spanX);
    // Layout spacing to neighbours in the same row / column.
    if (overlaps(box.y, bottom, o.y, ob, gap)) {
      if (edges.left) tryX(box.x, or + gap, ...spanY);
      if (edges.right) tryX(right, o.x - gap, ...spanY);
    }
    if (overlaps(box.x, right, o.x, or, gap)) {
      if (edges.top) tryY(box.y, ob + gap, ...spanX);
      if (edges.bottom) tryY(bottom, o.y - gap, ...spanX);
    }
  }

  const best = (cs: Candidate[]) => cs.reduce<Candidate | null>((b, c) => (!b || Math.abs(c.delta) < Math.abs(b.delta) ? c : b), null);
  const bx = best(xs);
  const by = best(ys);
  const guides: Guide[] = [];
  if (bx) for (const c of xs) if (Math.abs(c.delta - bx.delta) < 1e-6) guides.push({ x1: c.at, y1: c.from, x2: c.at, y2: c.to });
  if (by) for (const c of ys) if (Math.abs(c.delta - by.delta) < 1e-6) guides.push({ x1: c.from, y1: c.at, x2: c.to, y2: c.at });
  return { dx: bx?.delta ?? 0, dy: by?.delta ?? 0, guides };
}

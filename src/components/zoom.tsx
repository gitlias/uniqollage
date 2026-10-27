import { useEffect, useRef, type RefObject } from 'react';
import { useUi } from '../ui';
import { useT } from '../i18n';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The visible part of `base` at the current zoom/centre. */
export function useViewBox(base: Rect): Rect {
  const zoom = useUi((s) => s.zoom);
  const center = useUi((s) => s.center);
  const w = base.w / zoom;
  const h = base.h / zoom;
  const cx = center?.x ?? base.x + base.w / 2;
  const cy = center?.y ?? base.y + base.h / 2;
  // Keep the view inside the base rectangle.
  const x = Math.min(Math.max(cx - w / 2, base.x), base.x + base.w - w);
  const y = Math.min(Math.max(cy - h / 2, base.y), base.y + base.h - h);
  return { x, y, w, h };
}

/** mm per screen pixel for an SVG showing `vb` (preserveAspectRatio meet). */
function unitsPerPixel(svg: SVGSVGElement, vb: Rect): number {
  const r = svg.getBoundingClientRect();
  return Math.max(vb.w / r.width, vb.h / r.height);
}

/**
 * Ctrl/⌘ + wheel (or pinch) zooms around the pointer, plain wheel pans when
 * zoomed in. Returns a pan starter for drags on the background.
 */
export function useZoomGestures(svgRef: RefObject<SVGSVGElement | null>, vb: Rect) {
  const vbRef = useRef(vb);
  vbRef.current = vb;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      const { zoom, setZoom, setCenter } = useUi.getState();
      const v = vbRef.current;
      const upp = unitsPerPixel(svg, v);
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        // Zoom around the pointer: keep the point under the cursor fixed.
        const r = svg.getBoundingClientRect();
        const px = v.x + v.w / 2 + (e.clientX - (r.left + r.width / 2)) * upp;
        const py = v.y + v.h / 2 + (e.clientY - (r.top + r.height / 2)) * upp;
        const next = Math.min(16, Math.max(1, zoom * Math.exp(-e.deltaY * 0.0025)));
        const k = zoom / next;
        const cx = px - (px - (v.x + v.w / 2)) * k;
        const cy = py - (py - (v.y + v.h / 2)) * k;
        setZoom(next, { x: cx, y: cy });
      } else if (zoom > 1) {
        e.preventDefault();
        setCenter({ x: v.x + v.w / 2 + e.deltaX * upp, y: v.y + v.h / 2 + e.deltaY * upp });
      }
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [svgRef]);

  /** Start panning with a pointer drag; returns false if nothing to pan. */
  return (e: React.PointerEvent): boolean => {
    const svg = svgRef.current;
    if (!svg || useUi.getState().zoom <= 1) return false;
    const v = vbRef.current;
    const upp = unitsPerPixel(svg, v);
    const sx = e.clientX;
    const sy = e.clientY;
    const c0 = { x: v.x + v.w / 2, y: v.y + v.h / 2 };
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('panning');
    const move = (ev: PointerEvent) => useUi.getState().setCenter({ x: c0.x - (ev.clientX - sx) * upp, y: c0.y - (ev.clientY - sy) * upp });
    const up = () => {
      svg.classList.remove('panning');
      svg.removeEventListener('pointermove', move);
      svg.removeEventListener('pointerup', up);
      svg.removeEventListener('pointercancel', up);
    };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerup', up);
    svg.addEventListener('pointercancel', up);
    return true;
  };
}

/** Zoom buttons shown in the corner of the canvas. */
export function ZoomControls() {
  const t = useT();
  const zoom = useUi((s) => s.zoom);
  const setZoom = useUi((s) => s.setZoom);
  return (
    <div className="zoom-controls" role="group" aria-label="Zoom">
      <button onClick={() => setZoom(zoom / 1.25)} disabled={zoom <= 1} title={`${t('zoomOut')} (Ctrl −)`}>
        −
      </button>
      <button className="zoom-level" onClick={() => setZoom(1, null)} title={t('zoomFit')}>
        {Math.round(zoom * 100)} %
      </button>
      <button onClick={() => setZoom(zoom * 1.25)} disabled={zoom >= 16} title={`${t('zoomIn')} (Ctrl +)`}>
        +
      </button>
    </div>
  );
}

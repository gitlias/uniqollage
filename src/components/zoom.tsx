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
 * Ctrl/⌘ + wheel (or trackpad pinch) zooms around the pointer, plain wheel
 * pans when zoomed in; on touch screens two fingers pinch-zoom and pan.
 * `onPinch` is called when a two-finger gesture starts (to cancel a tile drag
 * begun by the first finger). Returns a pan starter for drags on the background.
 */
export function useZoomGestures(svgRef: RefObject<SVGSVGElement | null>, vb: Rect, onPinch?: () => void) {
  const vbRef = useRef(vb);
  vbRef.current = vb;
  const onPinchRef = useRef(onPinch);
  onPinchRef.current = onPinch;
  const pinching = useRef(false);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const pts = new Map<number, { x: number; y: number }>();
    let start: { d: number; zoom: number; point: { x: number; y: number } } | null = null;
    const pair = () => {
      const [a, b] = [...pts.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size !== 2) return;
      // Second finger: from now on this is a pinch, not a tile drag.
      e.stopPropagation();
      onPinchRef.current?.();
      const { d, mid } = pair();
      const v = vbRef.current;
      const r = svg.getBoundingClientRect();
      const upp = unitsPerPixel(svg, v);
      // The page point under the fingers stays under them.
      start = {
        d: Math.max(d, 1),
        zoom: useUi.getState().zoom,
        point: { x: v.x + v.w / 2 + (mid.x - (r.left + r.width / 2)) * upp, y: v.y + v.h / 2 + (mid.y - (r.top + r.height / 2)) * upp },
      };
      pinching.current = true;
    };
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!start || pts.size < 2) return;
      const { d, mid } = pair();
      const zoom = Math.min(16, Math.max(1, (start.zoom * d) / start.d));
      const v = vbRef.current;
      const r = svg.getBoundingClientRect();
      const upp = unitsPerPixel(svg, v) * (useUi.getState().zoom / zoom);
      useUi.getState().setZoom(zoom, { x: start.point.x - (mid.x - (r.left + r.width / 2)) * upp, y: start.point.y - (mid.y - (r.top + r.height / 2)) * upp });
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) {
        start = null;
        pinching.current = false;
      }
    };
    svg.addEventListener('pointerdown', down, true);
    svg.addEventListener('pointermove', move, true);
    svg.addEventListener('pointerup', up, true);
    svg.addEventListener('pointercancel', up, true);
    return () => {
      svg.removeEventListener('pointerdown', down, true);
      svg.removeEventListener('pointermove', move, true);
      svg.removeEventListener('pointerup', up, true);
      svg.removeEventListener('pointercancel', up, true);
    };
  }, [svgRef]);

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
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId || pinching.current) return;
      useUi.getState().setCenter({ x: c0.x - (ev.clientX - sx) * upp, y: c0.y - (ev.clientY - sy) * upp });
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
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

/** Tool picker: move tiles or drag the view. */
export function ToolPicker() {
  const t = useT();
  const tool = useUi((s) => s.tool);
  const temp = useUi((s) => s.tempPan);
  const active = temp ? 'pan' : tool;
  return (
    <div className="tool-picker" role="radiogroup" aria-label="Tool">
      <button role="radio" aria-checked={active === 'move'} className={active === 'move' ? 'on' : ''} onClick={() => useUi.getState().setTool('move')} title={t('toolMove')} aria-label={t('toolMove')}>
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
          <path d="M4 2l11 8.5-4.8.6 2.9 5.6-2.2 1.1-2.9-5.6L4 15.5z" fill="currentColor" />
        </svg>
      </button>
      <button role="radio" aria-checked={active === 'pan'} className={active === 'pan' ? 'on' : ''} onClick={() => useUi.getState().setTool('pan')} title={t('toolPan')} aria-label={t('toolPan')}>
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
          <path
            d="M8 2.5a1.2 1.2 0 0 1 2.4 0V9h.6V3.6a1.2 1.2 0 0 1 2.4 0V9.5h.6V5.4a1.2 1.2 0 0 1 2.4 0V12c0 3.3-2.4 6-5.6 6-2.3 0-3.7-1-4.9-2.8L3.3 11a1.2 1.2 0 0 1 2-1.3L7.4 12V4a1.2 1.2 0 0 1 .6-1z"
            fill="currentColor"
          />
        </svg>
      </button>
    </div>
  );
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

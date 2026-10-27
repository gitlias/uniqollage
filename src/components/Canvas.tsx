import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { compose } from '../render/collage';
import { PrimEl, TileView } from './TileView';
import { garmentColor, isPoster } from '../products';
import { PALETTES } from '../render/tiles';
import { useT } from '../i18n';
import { useUi } from '../ui';

type Gesture =
  | { kind: 'move'; id: string; sx: number; sy: number; x0: number; y0: number }
  | { kind: 'resize'; id: string; sx: number; sy: number; w0: number; rot: number }
  | { kind: 'rotate'; id: string; cx: number; cy: number };

/** Interactive collage editor (SVG in print-area millimetres). */
export function Canvas() {
  const project = useStore((s) => s.project);
  const selected = useStore((s) => s.selected);
  const uiLang = useStore((s) => s.uiLang);
  const epoch = useStore((s) => s.fontEpoch);
  const t = useT();
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);

  const c = compose(project, uiLang);
  const pad = Math.max(c.w, c.h) * 0.06;
  const sel = c.placed.find((p) => p.tile.id === selected);
  const overflow = c.placed.some((p) => p.tile.y + p.h > c.h + 0.5 || p.tile.x + p.tile.w > c.w + 0.5 || p.tile.x < -0.5 || p.tile.y < -0.5);

  const toLocal = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    return m ? pt.matrixTransform(m.inverse()) : pt;
  };

  const start = (e: React.PointerEvent, g: Gesture) => {
    e.stopPropagation();
    useStore.getState().checkpoint();
    gesture.current = g;
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const p = toLocal(e);
    const { patchTile } = useStore.getState();
    if (g.kind === 'move') {
      patchTile(g.id, { x: g.x0 + p.x - g.sx, y: g.y0 + p.y - g.sy }, false);
    } else if (g.kind === 'resize') {
      const a = (g.rot * Math.PI) / 180;
      const dx = (p.x - g.sx) * Math.cos(a) + (p.y - g.sy) * Math.sin(a);
      patchTile(g.id, { w: Math.max(8, g.w0 + dx) }, false);
    } else {
      let deg = (Math.atan2(p.y - g.cy, p.x - g.cx) * 180) / Math.PI + 90;
      if (deg > 180) deg -= 360;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      else if (Math.abs(deg) < 2) deg = 0;
      patchTile(g.id, { rot: Math.round(deg * 10) / 10 }, false);
    }
  };

  const onUp = () => {
    gesture.current = null;
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]')) return;
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (!s.selected) return;
      const tile = s.project.tiles.find((x) => x.id === s.selected);
      if (!tile) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        s.removeTile(tile.id);
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        s.duplicateTile(tile.id);
      } else if (e.key === 'Escape') {
        s.select(null);
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        s.patchTile(tile.id, { x: tile.x + dx, y: tile.y + dy });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hs = Math.max(c.w, c.h) * 0.012; // handle size

  return (
    <div className="canvas-wrap">
      <svg
        ref={svgRef}
        className="canvas"
        viewBox={`${-pad} ${-pad} ${c.w + 2 * pad} ${c.h + 2 * pad}`}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerDown={() => useStore.getState().select(null)}
      >
        <defs>
          <filter id="pageShadow" x="-5%" y="-5%" width="110%" height="110%">
            <feDropShadow dx="0" dy={pad * 0.05} stdDeviation={pad * 0.12} floodOpacity="0.18" />
          </filter>
        </defs>
        <rect x={0} y={0} width={c.w} height={c.h} fill={isPoster(project.productId) ? PALETTES[project.theme].page : garmentColor(project.garment).hex} filter="url(#pageShadow)" />
        {c.placed.map((p) => (
          <g
            key={p.tile.id}
            className="tile"
            onPointerDown={(e) => {
              useStore.getState().select(p.tile.id);
              const pt = toLocal(e);
              start(e, { kind: 'move', id: p.tile.id, sx: pt.x, sy: pt.y, x0: p.tile.x, y0: p.tile.y });
            }}
          >
            <TileView tile={p.tile} baseSize={project.baseSize} theme={project.theme} skin={project.skin} epoch={epoch} />
            <rect
              transform={`translate(${p.tile.x} ${p.tile.y}) rotate(${p.tile.rot} ${p.tile.w / 2} ${p.h / 2})`}
              width={p.tile.w}
              height={p.h}
              fill="transparent"
              className="hit"
            />
          </g>
        ))}
        {c.credit.map((p, i) => (
          <PrimEl key={i} p={p} />
        ))}
        {/* Dim everything outside the print area. */}
        <path
          d={`M${-pad * 3} ${-pad * 3}H${c.w + pad * 3}V${c.h + pad * 3}H${-pad * 3}Z M0 0V${c.h}H${c.w}V0Z`}
          fillRule="evenodd"
          fill="rgba(238,240,243,0.82)"
          pointerEvents="none"
        />
        <rect x={0} y={0} width={c.w} height={c.h} fill="none" stroke={overflow ? '#d33' : '#a2a9b1'} strokeDasharray="2 1.5" strokeWidth={0.4} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        {sel && (
          <g transform={`translate(${sel.tile.x} ${sel.tile.y}) rotate(${sel.tile.rot} ${sel.tile.w / 2} ${sel.h / 2})`}>
            <rect width={sel.tile.w} height={sel.h} fill="none" stroke="#36c" strokeWidth={1.5} vectorEffect="non-scaling-stroke" pointerEvents="none" />
            <line x1={sel.tile.w / 2} y1={0} x2={sel.tile.w / 2} y2={-hs * 2.5} stroke="#36c" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <circle
              className="handle rotate"
              cx={sel.tile.w / 2}
              cy={-hs * 2.5}
              r={hs * 0.8}
              onPointerDown={(e) =>
                start(e, {
                  kind: 'rotate',
                  id: sel.tile.id,
                  cx: sel.tile.x + sel.tile.w / 2,
                  cy: sel.tile.y + sel.h / 2,
                })
              }
            />
            <rect
              className="handle resize"
              x={sel.tile.w - hs / 2}
              y={sel.h / 2 - hs}
              width={hs}
              height={hs * 2}
              rx={hs / 3}
              onPointerDown={(e) => {
                const pt = toLocal(e);
                start(e, { kind: 'resize', id: sel.tile.id, sx: pt.x, sy: pt.y, w0: sel.tile.w, rot: sel.tile.rot });
              }}
            />
          </g>
        )}
      </svg>
      {!project.tiles.length && (
        <div className="canvas-empty">
          <p>{t('empty')}</p>
          <button className="primary" onClick={() => useUi.getState().setFillOpen(true)}>
            🎲 {t('fillRandom')}
          </button>
        </div>
      )}
      {overflow && <div className="canvas-warning">{t('overflow')}</div>}
    </div>
  );
}


import { useStore } from '../store';
import { compose } from '../render/collage';
import { garmentColor, productById, sizeOf, type Shape, type SizeSpec } from '../products';
import { PrimEl, TileView } from './TileView';

// Flat-lay silhouettes drawn to the official garment measurements (mm), with the
// print area placed at the official distance below the front neck seam.

interface Outline {
  w: number;
  h: number;
  body: string;
  details: string;
  back?: string;
  /** Print area top-left. */
  px: number;
  py: number;
}

const M = 40; // margin

function topOutline(shape: Shape, s: SizeSpec): Outline {
  const { length: L, width: W } = s.garment;
  const S = s.garment.shoulder ?? W * 0.86;
  const k = S / 450; // scale for neck/sleeve details relative to an adult M
  const neckW = 190 * k;
  const neckD = (shape === 'sweat' ? 85 : 90) * k;
  const slope = 40 * k;
  const armpit = L * (shape === 'oversized' ? 0.4 : shape === 'sweat' ? 0.37 : 0.34);
  // Sleeve: length from shoulder point, angle below horizontal, opening width.
  const sleeve =
    shape === 'sweat'
      ? { len: L * 0.88, deg: 62, open: W * 0.2 }
      : shape === 'oversized'
        ? { len: L * 0.36, deg: 38, open: W * 0.4 }
        : { len: S * 0.47, deg: 35, open: W * 0.33 };
  const a = (sleeve.deg * Math.PI) / 180;
  const half = Math.max(S / 2 + sleeve.len * Math.cos(a), W / 2) + 10;
  const cx = M + half;
  const y0 = M;

  const shoulderX = S / 2;
  const outer = { x: shoulderX + sleeve.len * Math.cos(a), y: slope + sleeve.len * Math.sin(a) };
  const inner = { x: outer.x - sleeve.open * Math.sin(a), y: outer.y + sleeve.open * Math.cos(a) };
  const arm = { x: W / 2, y: armpit };

  const side = (sx: 1 | -1) => (p: { x: number; y: number }) => `${(cx + sx * p.x).toFixed(1)} ${(y0 + p.y).toFixed(1)}`;
  const R = side(1);
  const Lf = side(-1);
  const body = [
    `M${Lf({ x: neckW / 2, y: 0 })}`,
    `C${Lf({ x: neckW / 2, y: neckD * 0.75 })} ${Lf({ x: neckW * 0.22, y: neckD })} ${R({ x: 0, y: neckD })}`,
    `C${R({ x: neckW * 0.22, y: neckD })} ${R({ x: neckW / 2, y: neckD * 0.75 })} ${R({ x: neckW / 2, y: 0 })}`,
    `L${R({ x: shoulderX, y: slope })}`,
    `L${R(outer)}`,
    `L${R(inner)}`,
    `L${R(arm)}`,
    `L${R({ x: W / 2, y: L })}`,
    `L${Lf({ x: W / 2, y: L })}`,
    `L${Lf(arm)}`,
    `L${Lf(inner)}`,
    `L${Lf(outer)}`,
    `L${Lf({ x: shoulderX, y: slope })}`,
    'Z',
  ].join(' ');

  const rib = 14 * k;
  let details =
    `M${Lf({ x: neckW / 2 + rib * 0.6, y: 0 })} C${Lf({ x: neckW / 2 + rib * 0.6, y: neckD * 0.85 + rib })} ${Lf({ x: neckW * 0.22, y: neckD + rib })} ${R({ x: 0, y: neckD + rib })}` +
    ` C${R({ x: neckW * 0.22, y: neckD + rib })} ${R({ x: neckW / 2 + rib * 0.6, y: neckD * 0.85 + rib })} ${R({ x: neckW / 2 + rib * 0.6, y: 0 })}` +
    ` M${Lf({ x: shoulderX, y: slope })} L${Lf(arm)} M${R({ x: shoulderX, y: slope })} L${R(arm)}`;
  if (shape === 'sweat') {
    const hem = 60 * k;
    details += ` M${Lf({ x: W / 2, y: L - hem })} L${R({ x: W / 2, y: L - hem })}`;
    const cuff = 70 * k;
    const c = (p: { x: number; y: number }, d: number) => ({ x: p.x - d * Math.cos(a), y: p.y - d * Math.sin(a) });
    details += ` M${Lf(c(outer, cuff))} L${Lf(c(inner, cuff))} M${R(c(outer, cuff))} L${R(c(inner, cuff))}`;
  } else {
    details += ` M${Lf({ x: W / 2, y: L - 22 * k })} L${R({ x: W / 2, y: L - 22 * k })}`;
  }
  return {
    w: 2 * half + 2 * M,
    h: L + 2 * M,
    body,
    details,
    px: cx - s.w / 2,
    py: y0 + neckD + s.top,
  };
}

function bagOutline(shape: Shape, s: SizeSpec): Outline {
  const { width: W, length: H } = s.garment;
  const handleH = shape === 'tote' ? 230 : 160;
  const top = M + handleH;
  const x0 = M;
  const hl = x0 + W * 0.27;
  const hr = x0 + W * 0.73;
  const strap = shape === 'tote' ? 25 : 20;
  return {
    w: W + 2 * M,
    h: top + H + M,
    back: `M${hl - strap / 2} ${top + 5} C${hl - strap / 2} ${top - handleH * 1.2} ${hr + strap / 2} ${top - handleH * 1.2} ${hr + strap / 2} ${top + 5} L${hr - strap / 2} ${top + 5} C${hr - strap / 2} ${top - handleH * 1.05} ${hl + strap / 2} ${top - handleH * 1.05} ${hl + strap / 2} ${top + 5} Z`,
    body: `M${x0} ${top} H${x0 + W} V${top + H} H${x0} Z`,
    details: `M${x0} ${top + 18} H${x0 + W}`,
    px: x0 + (W - s.w) / 2,
    py: top + s.top,
  };
}

export function Mockup() {
  const project = useStore((s) => s.project);
  const uiLang = useStore((s) => s.uiLang);
  const c = compose(project, uiLang);
  const product = productById(project.productId);
  const size = sizeOf(project.productId, project.sizeId);
  const color = garmentColor(project.garment);

  const design = (
    <>
      {c.placed.map((p) => (
        <TileView key={p.tile.id} tile={p.tile} baseSize={project.baseSize} theme={project.theme} />
      ))}
      {c.credit.map((p, i) => (
        <PrimEl key={i} p={p} />
      ))}
    </>
  );

  if (product.shape === 'none') {
    return (
      <div className="canvas-wrap">
        <svg className="canvas" viewBox={`${-20} ${-20} ${c.w + 40} ${c.h + 40}`}>
          <rect width={c.w} height={c.h} fill={color.hex} />
          <svg width={c.w} height={c.h} viewBox={`0 0 ${c.w} ${c.h}`} overflow="hidden">
            {design}
          </svg>
        </svg>
      </div>
    );
  }

  const o = product.shape === 'tote' || product.shape === 'mini-tote' ? bagOutline(product.shape, size) : topOutline(product.shape, size);
  const stroke = color.dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)';
  return (
    <div className="canvas-wrap">
      <svg className="canvas mockup" viewBox={`0 0 ${o.w} ${o.h}`}>
        <defs>
          <linearGradient id="fabric" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.10" />
            <stop offset="0.6" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.10" />
          </linearGradient>
          <clipPath id="printClip">
            <rect width={c.w} height={c.h} />
          </clipPath>
        </defs>
        {o.back && <path d={o.back} fill={color.hex} stroke={stroke} strokeWidth={1.5} />}
        <path d={o.body} fill={color.hex} stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />
        <path d={o.details} fill="none" stroke={stroke} strokeWidth={1.2} />
        <g transform={`translate(${o.px} ${o.py})`} clipPath="url(#printClip)">
          {design}
        </g>
        <path d={o.body} fill="url(#fabric)" pointerEvents="none" />
        <rect x={o.px} y={o.py} width={c.w} height={c.h} fill="none" stroke={color.dark ? '#fff' : '#36c'} strokeOpacity={0.35} strokeDasharray="4 3" strokeWidth={0.8} />
      </svg>
    </div>
  );
}

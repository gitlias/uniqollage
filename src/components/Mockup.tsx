import { useStore } from '../store';
import { compose } from '../render/collage';
import { GARMENT_COLORS, productById } from '../products';
import { PrimEl, TileView } from './TileView';

// Simple flat-lay silhouettes in millimetres, with the print area origin.
interface Shape {
  w: number;
  h: number;
  /** Silhouette path(s). */
  body: string;
  /** Decorative seams/ribs drawn as strokes. */
  details: string;
  /** Top-left of the print area (centred horizontally when x is omitted). */
  print: { x?: number; y: number };
  /** Handles etc. drawn in the garment colour but behind the body. */
  back?: string;
}

const TSHIRT: Shape = {
  w: 700,
  h: 790,
  body: 'M275 30 Q350 85 425 30 L520 50 L680 150 L625 270 L575 235 L580 760 L120 760 L125 235 L75 270 L20 150 L180 50 Z',
  details: 'M275 30 Q350 100 425 30 M275 30 Q350 85 425 30 M125 235 L180 50 M575 235 L520 50 M120 745 L580 745',
  print: { y: 120 },
};

const SWEAT: Shape = {
  w: 700,
  h: 760,
  body: 'M275 30 Q350 85 425 30 L520 50 L690 420 L640 445 L575 250 L580 720 L120 720 L125 250 L60 445 L10 420 L180 50 Z',
  details: 'M275 30 Q350 105 425 30 M120 680 L580 680 M125 250 L180 50 M575 250 L520 50 M660 400 L620 425 M40 400 L80 425',
  print: { y: 130 },
};

function tote(w: number, h: number, top: number, printTop: number): Shape {
  const hl = w * 0.27;
  const hr = w * 0.73;
  const hh = top * 0.9;
  return {
    w: w + 40,
    h: top + h + 20,
    back: `M${20 + hl - 15} ${top + 5} C${20 + hl - 15} ${top - hh} ${20 + hr + 15} ${top - hh} ${20 + hr + 15} ${top + 5} L${20 + hr - 10} ${top + 5} C${20 + hr - 10} ${top - hh + 28} ${20 + hl + 10} ${top - hh + 28} ${20 + hl + 10} ${top + 5} Z`,
    body: `M20 ${top} H${20 + w} V${top + h} H20 Z`,
    details: `M20 ${top + 18} H${20 + w}`,
    print: { y: top + printTop },
  };
}

const SHAPES: Record<string, Shape> = {
  tshirt: TSHIRT,
  'tshirt-chest': { ...TSHIRT, print: { x: 395, y: 125 } },
  sweat: SWEAT,
  tote: tote(410, 390, 190, 45),
  'mini-tote': tote(350, 215, 150, 32),
};

export function Mockup() {
  const project = useStore((s) => s.project);
  const uiLang = useStore((s) => s.uiLang);
  const c = compose(project, uiLang);
  const product = productById(project.productId);
  const color = GARMENT_COLORS.find((g) => g.id === project.garment)?.hex ?? '#fff';
  const shape = SHAPES[product.mockup];
  const dark = ['navy', 'black'].includes(project.garment);

  const design = (
    <>
      {c.placed.map((p) => (
        <TileView key={p.tile.id} tile={p.tile} baseSize={project.baseSize} />
      ))}
      {c.credit.map((p, i) => (
        <PrimEl key={i} p={p} />
      ))}
    </>
  );

  if (!shape) {
    return (
      <div className="canvas-wrap">
        <svg className="canvas" viewBox={`${-20} ${-20} ${c.w + 40} ${c.h + 40}`}>
          <rect width={c.w} height={c.h} fill={color} />
          <svg width={c.w} height={c.h} viewBox={`0 0 ${c.w} ${c.h}`} overflow="hidden">
            {design}
          </svg>
        </svg>
      </div>
    );
  }

  const px = shape.print.x ?? (shape.w - c.w) / 2;
  const py = shape.print.y;
  const stroke = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.16)';
  return (
    <div className="canvas-wrap">
      <svg className="canvas mockup" viewBox={`0 0 ${shape.w} ${shape.h}`}>
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
        {shape.back && <path d={shape.back} fill={color} stroke={stroke} strokeWidth={1.5} />}
        <path d={shape.body} fill={color} stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />
        <path d={shape.details} fill="none" stroke={stroke} strokeWidth={1.2} />
        <g transform={`translate(${px} ${py})`} clipPath="url(#printClip)">
          {design}
        </g>
        <path d={shape.body} fill="url(#fabric)" pointerEvents="none" />
        <rect x={px} y={py} width={c.w} height={c.h} fill="none" stroke={dark ? '#fff' : '#36c'} strokeOpacity={0.35} strokeDasharray="4 3" strokeWidth={0.8} />
      </svg>
    </div>
  );
}

import type { ImageTile, InfoboxTile, Theme, Tile, TextTile, TitleTile } from '../model';
import { layoutText } from '../text/layout';
import { parseMarkup } from '../text/markup';

// Every tile renders to a small display list in local millimetre coordinates
// (origin = tile top-left, width = tile.w). The same list feeds the editor,
// SVG/PDF export and PNG rasterisation.

export type Prim =
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; sw?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; sw: number }
  | { t: 'path'; d: string; fill: string; x: number; y: number }
  | { t: 'image'; x: number; y: number; w: number; h: number; href: string };

export interface Rendered {
  h: number;
  prims: Prim[];
}

export interface Palette {
  /** Paper colour for posters. */
  page: string;
  ink: string;
  title: string;
  link: string;
  muted: string;
  rule: string;
  frameBorder: string;
  frameBg: string;
  hairline: string;
  infoboxHead: string;
}

/** Wikipedia (Vector) colours, and the night-mode variant for dark garments. */
export const PALETTES: Record<Theme, Palette> = {
  light: {
    page: '#ffffff',
    ink: '#202122',
    title: '#000000',
    link: '#3366cc',
    muted: '#54595d',
    rule: '#a2a9b1',
    frameBorder: '#c8ccd1',
    frameBg: '#f8f9fa',
    hairline: '#eaecf0',
    infoboxHead: '#dde6f3',
  },
  dark: {
    page: '#101418',
    ink: '#eaecf0',
    title: '#f8f9fa',
    link: '#88a3e8',
    muted: '#a2a9b1',
    rule: '#72777d',
    frameBorder: '#54595d',
    frameBg: '#202122',
    hairline: '#404244',
    infoboxHead: '#27354f',
  },
};

// Set for the duration of one renderTile call.
let pal: Palette = PALETTES.light;

export const TAGLINE = {
  en: 'From Wikipedia, the free encyclopedia',
  de: 'Aus Wikipedia, der freien Enzyklopädie',
};

// While measuring for the auto layout we skip glyph outline generation.
let measuring = false;

function text(markup: string, x: number, y: number, width: number, opts: Parameters<typeof layoutText>[2]) {
  const block = layoutText(parseMarkup(markup), Math.max(width, 1), { color: pal.ink, linkColor: pal.link, ...opts, measureOnly: measuring });
  const prims: Prim[] = block.paths.map((p) => ({ t: 'path', d: p.d, fill: p.fill, x, y }));
  return { block, prims };
}

function renderTitle(t: TitleTile, b: number): Rendered {
  const size = b * 2.1;
  const { block, prims } = text(t.text, 0, 0, t.w, { size, lineHeight: 1.25, family: 'serif', color: pal.title });
  let y = block.height + size * 0.12;
  const sw = Math.max(b * 0.06, 0.12);
  prims.push({ t: 'line', x1: 0, y1: y, x2: t.w, y2: y, stroke: pal.rule, sw });
  y += sw + b * 0.35;
  if (t.tagline) {
    const tag = text(TAGLINE[t.source.lang ?? 'en'], 0, y, t.w, { size: b * 0.82, lineHeight: 1.4, color: pal.muted });
    prims.push(...tag.prims);
    y += tag.block.height;
  }
  return { h: y, prims };
}

function renderText(t: TextTile, b: number): Rendered {
  const { block, prims } = text(t.markup, 0, 0, t.w, { size: b, lineHeight: 1.6 });
  return { h: block.height, prims };
}

/** Width of the image box inside an image tile. */
export function imageBoxWidth(t: ImageTile, baseSize: number): number {
  return t.frame ? t.w - 2 * baseSize * t.scale * 0.22 : t.w;
}

function renderImage(t: ImageTile, b: number): Rendered {
  const prims: Prim[] = [];
  const aspect = t.boxAspect ?? t.image.aspect;
  if (!t.frame) {
    const h = t.w / aspect;
    prims.push({ t: 'image', x: 0, y: 0, w: t.w, h, href: t.image.src });
    let y = h;
    if (t.caption.trim()) {
      y += b * 0.3;
      const cap = text(t.caption, 0, y, t.w, { size: b * 0.88, lineHeight: 1.45 });
      prims.push(...cap.prims);
      y += cap.block.height;
    }
    return { h: y, prims };
  }
  const sw = Math.max(b * 0.07, 0.1);
  const pad = b * 0.22;
  const iw = t.w - 2 * pad;
  const ih = iw / aspect;
  let y = pad;
  const body: Prim[] = [];
  body.push({ t: 'image', x: pad, y, w: iw, h: ih, href: t.image.src });
  // Hairline around the image itself, as in Vector's thumb frames.
  body.push({ t: 'rect', x: pad, y, w: iw, h: ih, stroke: pal.hairline, sw: sw * 0.7 });
  y += ih;
  if (t.caption.trim()) {
    y += b * 0.32;
    const cap = text(t.caption, pad + b * 0.1, y, iw - b * 0.2, { size: b * 0.88, lineHeight: 1.45 });
    body.push(...cap.prims);
    y += cap.block.height;
  }
  y += pad * 1.4;
  prims.push({ t: 'rect', x: 0, y: 0, w: t.w, h: y, fill: pal.frameBg, stroke: pal.frameBorder, sw }, ...body);
  return { h: y, prims };
}

function renderInfobox(t: InfoboxTile, b: number): Rendered {
  const size = b * 0.88;
  const sw = Math.max(b * 0.07, 0.1);
  const pad = b * 0.45;
  const inner = t.w - 2 * pad;
  const body: Prim[] = [];
  let y = pad;

  // Header band.
  const head = text(t.heading, pad, 0, inner - b * 0.4, { size: b * 1.2, lineHeight: 1.3, align: 'center' });
  const headH = head.block.height + b * 0.5;
  body.push({ t: 'rect', x: pad, y, w: inner, h: headH, fill: pal.infoboxHead });
  body.push(...head.prims.map((p) => (p.t === 'path' ? { ...p, x: p.x + b * 0.2, y: y + b * 0.25 } : p)));
  y += headH + b * 0.4;

  if (t.image) {
    const iw = inner * 0.86;
    const ih = iw / t.image.aspect;
    body.push({ t: 'image', x: pad + (inner - iw) / 2, y, w: iw, h: ih, href: t.image.src });
    y += ih + b * 0.25;
    if (t.imageCaption?.trim()) {
      const cap = text(t.imageCaption, pad, y, inner, { size: size * 0.95, lineHeight: 1.4, align: 'center' });
      body.push(...cap.prims);
      y += cap.block.height;
    }
    y += b * 0.35;
  }

  const labelW = inner * 0.4;
  const gap = b * 0.4;
  t.rows.forEach(([label, value], i) => {
    if (i > 0) body.push({ t: 'line', x1: pad, y1: y, x2: pad + inner, y2: y, stroke: pal.hairline, sw: sw * 0.8 });
    y += b * 0.18;
    const l = text(`'''${label}'''`, pad, y, labelW - gap, { size, lineHeight: 1.4 });
    const v = text(value, pad + labelW, y, inner - labelW, { size, lineHeight: 1.4 });
    body.push(...l.prims, ...v.prims);
    y += Math.max(l.block.height, v.block.height) + b * 0.18;
  });
  y += pad;
  return { h: y, prims: [{ t: 'rect', x: 0, y: 0, w: t.w, h: y, fill: pal.frameBg, stroke: pal.rule, sw }, ...body] };
}

// Rendering is pure; cache by tile identity (tiles are immutable in the store) and size.
const cache = new WeakMap<Tile, { b: number; theme: Theme; r: Rendered }>();

export function renderTile(t: Tile, baseSize: number, theme: Theme = 'light'): Rendered {
  const b = baseSize * t.scale;
  const hit = cache.get(t);
  if (hit && hit.b === b && hit.theme === theme) return hit.r;
  pal = PALETTES[theme];
  let r: Rendered;
  switch (t.type) {
    case 'title':
      r = renderTitle(t, b);
      break;
    case 'text':
      r = renderText(t, b);
      break;
    case 'image':
      r = renderImage(t, b);
      break;
    case 'infobox':
      r = renderInfobox(t, b);
      break;
  }
  cache.set(t, { b, theme, r });
  return r;
}

/** Height a tile would have at width `w` (used by the auto layout). */
export function tileHeight(t: Tile, w: number, baseSize: number): number {
  measuring = true;
  try {
    return renderTile({ ...t, w } as Tile, baseSize).h;
  } finally {
    measuring = false;
  }
}

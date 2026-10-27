import type { CardTile, ImageStyle, ImageTile, InfoboxTile, Skin, Theme, Tile, TextTile, TitleTile } from '../model';
import { layoutText } from '../text/layout';
import { fontEpoch } from '../text/fonts';
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

/** Light-mode colours that differ between skins. */
const SKIN_COLORS: Record<Skin, Partial<Palette>> = {
  vector2022: {},
  vector2010: { link: '#0645ad' },
  monobook: { link: '#002bb8', frameBorder: '#cccccc', frameBg: '#f9f9f9', rule: '#aaaaaa' },
  minerva: {},
};

export const SKIN_IMAGE_STYLE: Record<Skin, ImageStyle> = {
  vector2010: 'classic',
  monobook: 'classic',
  vector2022: 'modern',
  minerva: 'mobile',
};

export function paletteFor(theme: Theme, skin: Skin): Palette {
  return theme === 'light' ? { ...PALETTES.light, ...SKIN_COLORS[skin] } : PALETTES.dark;
}

export function imageStyleOf(t: ImageTile, skin: Skin): ImageStyle {
  return t.imageStyle ?? (t.frame === false ? 'plain' : SKIN_IMAGE_STYLE[skin]);
}

// Set for the duration of one renderTile call.
let pal: Palette = PALETTES.light;
let skin: Skin = 'vector2010';

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
  // MonoBook used a plain sans-serif heading; the other skins Linux Libertine.
  const sans = skin === 'monobook';
  const size = b * (sans ? 1.88 : 2.1);
  const { block, prims } = text(t.text, 0, 0, t.w, { size, lineHeight: 1.25, family: sans ? 'sans' : 'serif', color: pal.title });
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

interface FrameGeometry {
  /** Outer border width (0 = no box). */
  sw: number;
  /** Padding between box and image. */
  pad: number;
}

function frameGeometry(style: ImageStyle, b: number): FrameGeometry {
  if (style === 'classic' || style === 'modern') return { sw: Math.max(b * 0.07, 0.1), pad: b * 0.22 };
  return { sw: 0, pad: 0 };
}

/** Width of the picture inside an image tile. */
export function imageBoxWidth(t: ImageTile, baseSize: number, s: Skin = 'vector2010'): number {
  const g = frameGeometry(imageStyleOf(t, s), baseSize * t.scale);
  return t.w - 2 * (g.pad + g.sw);
}

/** MediaWiki's "enlarge" icon: two overlapping windows. */
function magnifyIcon(x: number, y: number, s: number): Prim[] {
  const sw = s * 0.07;
  const stroke = '#72777d';
  return [
    { t: 'rect', x, y: y + s * 0.3, w: s * 0.68, h: s * 0.5, fill: pal.frameBg, stroke, sw },
    { t: 'rect', x: x + s * 0.4, y, w: s * 0.6, h: s * 0.45, fill: pal.frameBg, stroke, sw },
  ];
}

function renderImage(t: ImageTile, b: number): Rendered {
  const style = imageStyleOf(t, skin);
  const aspect = t.boxAspect ?? t.image.aspect;
  const { sw, pad } = frameGeometry(style, b);
  const inset = sw + pad;
  const iw = t.w - 2 * inset;
  const ih = iw / aspect;
  const body: Prim[] = [{ t: 'image', x: inset, y: inset, w: iw, h: ih, href: t.image.src }];
  let y = inset + ih;
  const caption = t.caption.trim();

  if (style === 'classic') {
    // Vector 2010 / MonoBook: bordered image on a grey card, caption at 94 %
    // with the enlarge icon floated right.
    body.push({ t: 'rect', x: inset, y: inset, w: iw, h: ih, stroke: pal.frameBorder, sw });
    const size = b * 0.94;
    const icon = b * 1.05;
    y += pad;
    if (caption) {
      const cap = text(t.caption, inset + pad * 0.5, y + pad * 0.5, iw - icon - pad * 1.5, { size, lineHeight: 1.4 });
      body.push(...cap.prims, ...magnifyIcon(inset + iw - icon, y + pad * 0.5 + (size * 1.4 - icon * 0.8) / 2, icon));
      y += cap.block.height + pad;
    } else {
      body.push(...magnifyIcon(inset + iw - icon, y, icon));
      y += icon * 0.8 + pad;
    }
  } else if (style === 'modern') {
    body.push({ t: 'rect', x: inset, y: inset, w: iw, h: ih, stroke: pal.hairline, sw: sw * 0.7 });
    if (caption) {
      y += b * 0.32;
      const cap = text(t.caption, inset + b * 0.1, y, iw - b * 0.2, { size: b * 0.88, lineHeight: 1.45 });
      body.push(...cap.prims);
      y += cap.block.height;
    }
    y += pad * 0.4;
  } else if (caption) {
    // Mobile: small grey caption; plain: regular caption.
    const mobile = style === 'mobile';
    y += b * (mobile ? 0.45 : 0.3);
    const cap = text(t.caption, 0, y, t.w, { size: b * (mobile ? 0.82 : 0.88), lineHeight: 1.45, color: mobile ? pal.muted : pal.ink });
    body.push(...cap.prims);
    y += cap.block.height;
  }
  y += inset;
  if (!sw) return { h: y, prims: body };
  return { h: y, prims: [{ t: 'rect', x: 0, y: 0, w: t.w, h: y, fill: pal.frameBg, stroke: pal.frameBorder, sw }, ...body] };
}

/** Cropped card images are never taller than 4:3 (like Wikipedia's page previews). */
export const CARD_MIN_ASPECT = 4 / 3;
/** Uncropped tall images are capped at this height relative to the card width and centred. */
const CARD_MAX_HEIGHT = 1.2;

function renderCard(t: CardTile, b: number): Rendered {
  const sw = Math.max(b * 0.07, 0.1);
  const pad = b * 0.7;
  const inner = t.w - 2 * pad;
  const body: Prim[] = [];
  let y = pad;
  if (t.image) {
    let iw = inner;
    let ih: number;
    if (t.imageFit === 'cover') {
      ih = inner / Math.max(t.image.aspect, CARD_MIN_ASPECT);
    } else {
      // Show the whole picture; very tall ones get narrower instead of cropped.
      ih = Math.min(inner / t.image.aspect, inner * CARD_MAX_HEIGHT);
      iw = ih * t.image.aspect;
    }
    body.push({ t: 'image', x: pad + (inner - iw) / 2, y, w: iw, h: ih, href: t.image.src });
    y += ih + b * 0.6;
  }
  const sans = skin === 'monobook';
  const size = b * (sans ? 1.5 : 1.7);
  const title = text(t.title, pad, y, inner, { size, lineHeight: 1.25, family: sans ? 'sans' : 'serif', color: pal.title });
  body.push(...title.prims);
  y += title.block.height + size * 0.1;
  body.push({ t: 'line', x1: pad, y1: y, x2: pad + inner, y2: y, stroke: pal.rule, sw });
  y += b * 0.45;
  if (t.description?.trim()) {
    const d = text(t.description, pad, y, inner, { size: b * 0.88, lineHeight: 1.4, color: pal.muted });
    body.push(...d.prims);
    y += d.block.height + b * 0.35;
  }
  if (t.markup.trim()) {
    const x = text(t.markup, pad, y, inner, { size: b, lineHeight: 1.55 });
    body.push(...x.prims);
    y += x.block.height;
  }
  y += pad;
  return { h: y, prims: [{ t: 'rect', x: 0, y: 0, w: t.w, h: y, fill: pal.page, stroke: pal.frameBorder, sw }, ...body] };
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
const cache = new WeakMap<Tile, { b: number; theme: Theme; skin: Skin; epoch: number; r: Rendered }>();

export function renderTile(t: Tile, baseSize: number, theme: Theme = 'light', sk: Skin = 'vector2010'): Rendered {
  const b = baseSize * t.scale;
  const hit = cache.get(t);
  const epoch = fontEpoch();
  if (hit && hit.b === b && hit.theme === theme && hit.skin === sk && hit.epoch === epoch) return hit.r;
  pal = paletteFor(theme, sk);
  skin = sk;
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
    case 'card':
      r = renderCard(t, b);
      break;
  }
  cache.set(t, { b, theme, skin: sk, epoch, r });
  return r;
}

/** All text a tile draws (to load fonts for it). */
export function tileText(t: Tile): string {
  switch (t.type) {
    case 'title':
      return t.text;
    case 'text':
      return t.markup;
    case 'image':
      return t.caption;
    case 'infobox':
      return [t.heading, t.imageCaption ?? '', ...t.rows.flat()].join(' ');
    case 'card':
      return [t.title, t.description ?? '', t.markup].join(' ');
  }
}

/** Height a tile would have at width `w` (used by the auto layout). */
export function tileHeight(t: Tile, w: number, baseSize: number, sk: Skin = 'vector2010'): number {
  measuring = true;
  try {
    return renderTile({ ...t, w } as Tile, baseSize, 'light', sk).h;
  } finally {
    measuring = false;
  }
}

import type { Project, Tile } from '../model';
import { areaOf, isPoster } from '../products';
import { layoutText } from '../text/layout';
import { parseMarkup } from '../text/markup';
import { PALETTES, paletteFor, renderTile, type Prim } from './tiles';
import type { Box } from '../layout/pack';

export function creditSize(area: { w: number }): number {
  return Math.min(3, Math.max(1.6, area.w / 140));
}

/** White margin around poster collages (0 for garments and bags). */
export function marginOf(p: Project): number {
  return isPoster(p.productId) ? Math.max(0, p.margin ?? 0) : 0;
}

/** Area available to tiles (print area minus margin and the optional credit strip). */
export function contentBox(p: Project): Box {
  const area = areaOf(p);
  const m = marginOf(p);
  const strip = p.credit ? creditSize(area) * 2.2 : 0;
  return { x: m, y: m, w: area.w - 2 * m, h: area.h - 2 * m - strip };
}

/** Background to export: paper colour for posters, transparent otherwise. */
export function pageBackground(p: Project): string | undefined {
  return isPoster(p.productId) ? PALETTES[p.theme].page : undefined;
}

export function creditText(p: Project, lang: 'en' | 'de'): string {
  const textLangs = new Set<string>();
  const licences = new Set<string>();
  let commons = false;
  let own = false;
  for (const t of p.tiles) {
    const s = t.source;
    if ((s.kind === 'wikipedia' || s.kind === 'dyk') && t.type !== 'image') textLangs.add(s.lang ?? 'en');
    if (t.type === 'image' || (t.type === 'infobox' && t.image)) {
      if (s.kind === 'upload') own = true;
      else {
        commons = true;
        if (s.license) licences.add(s.license);
      }
    }
    if (t.type === 'card' && t.image) {
      commons = true;
      if (t.imageSource?.license) licences.add(t.imageSource.license);
    }
  }
  const parts: string[] = [];
  const sites = [...textLangs].map((l) => `${l}.wikipedia.org`).join(', ');
  if (textLangs.size) {
    parts.push(lang === 'de' ? `Texte: Wikipedia-Autor:innen (${sites}), CC BY-SA 4.0` : `Text: Wikipedia contributors (${sites}), CC BY-SA 4.0`);
  }
  if (commons) {
    const lic = [...licences].slice(0, 4).join(', ');
    parts.push(lang === 'de' ? `Bilder: Wikimedia Commons${lic ? ` (${lic})` : ''}` : `Images: Wikimedia Commons${lic ? ` (${lic})` : ''}`);
  }
  if (own) parts.push(lang === 'de' ? 'eigene Bilder' : 'own images');
  return parts.join(' · ');
}

export interface Placed {
  tile: Tile;
  h: number;
  prims: Prim[];
}

export interface Composition {
  w: number;
  h: number;
  placed: Placed[];
  /** Credit strip primitives in page coordinates. */
  credit: Prim[];
}

export function compose(p: Project, lang: 'en' | 'de'): Composition {
  const area = areaOf(p);
  const m = marginOf(p);
  const muted = paletteFor(p.theme, p.skin ?? 'vector2010').muted;
  const placed = p.tiles.map((tile) => {
    const r = renderTile(tile, p.baseSize, p.theme, p.skin);
    return { tile, h: r.h, prims: r.prims };
  });
  const credit: Prim[] = [];
  if (p.credit) {
    const text = creditText(p, lang);
    if (text) {
      const size = creditSize(area);
      const w = area.w - 2 * m;
      const block = layoutText(parseMarkup(text), w, { size, lineHeight: 1.3, color: muted, align: 'left' });
      // Shrink to a single line if needed.
      const scale = block.lines > 1 ? Math.max(0.55, w / (block.maxLineWidth * 1.02 + 1)) : 1;
      const final = scale < 1 ? layoutText(parseMarkup(text), w, { size: size * scale, lineHeight: 1.3, color: muted, align: 'left' }) : block;
      const y = area.h - m - final.height;
      for (const pth of final.paths) credit.push({ t: 'path', d: pth.d, fill: pth.fill, x: m, y });
    }
  }
  return { w: area.w, h: area.h, placed, credit };
}

export function tileTransform(t: Tile, h: number): string {
  const cx = t.w / 2;
  const cy = h / 2;
  return `translate(${r3(t.x)} ${r3(t.y)})` + (t.rot ? ` rotate(${r3(t.rot)} ${r3(cx)} ${r3(cy)})` : '');
}

export function r3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/** Unique ids for clip paths within one SVG document. */
let clipSeq = 0;

/**
 * The rectangle a picture of ratio `aspect` must be drawn at to cover box
 * (x, y, w, h) – the overflow is clipped. Done explicitly because svg2pdf
 * ignores preserveAspectRatio="… slice" and would draw the picture uncropped.
 */
export function coverRect(x: number, y: number, w: number, h: number, aspect: number) {
  if (!(aspect > 0) || Math.abs(aspect - w / h) < 1e-6) return { x, y, w, h };
  if (aspect > w / h) {
    const dw = h * aspect;
    return { x: x - (dw - w) / 2, y, w: dw, h };
  }
  const dh = w / aspect;
  return { x, y: y - (dh - h) / 2, w, h: dh };
}

export function primToSvg(p: Prim, hrefMap?: Map<string, string>): string {
  switch (p.t) {
    case 'rect':
      return `<rect x="${r3(p.x)}" y="${r3(p.y)}" width="${r3(p.w)}" height="${r3(p.h)}" fill="${p.fill ?? 'none'}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${r3(p.sw ?? 0.1)}"` : ''}/>`;
    case 'line':
      return `<line x1="${r3(p.x1)}" y1="${r3(p.y1)}" x2="${r3(p.x2)}" y2="${r3(p.y2)}" stroke="${p.stroke}" stroke-width="${r3(p.sw)}"/>`;
    case 'path':
      return `<path transform="translate(${r3(p.x)} ${r3(p.y)})" fill="${p.fill}" d="${p.d}"/>`;
    case 'image': {
      const href = esc(hrefMap?.get(p.href) ?? p.href);
      const d = coverRect(p.x, p.y, p.w, p.h, p.aspect);
      const img = `<image x="${r3(d.x)}" y="${r3(d.y)}" width="${r3(d.w)}" height="${r3(d.h)}" preserveAspectRatio="none" href="${href}" xlink:href="${href}"`;
      if (d.w === p.w && d.h === p.h) return `${img}/>`;
      const id = `clip${++clipSeq}`;
      return `<clipPath id="${id}"><rect x="${r3(p.x)}" y="${r3(p.y)}" width="${r3(p.w)}" height="${r3(p.h)}"/></clipPath>${img} clip-path="url(#${id})"/>`;
    }
  }
}

/** Standalone SVG document in millimetres. */
/**
 * Standalone SVG document in millimetres. `bleed` (mm) extends the page on
 * every side for print shops; only the background reaches into it.
 */
export function compositionToSvg(c: Composition, opts: { hrefMap?: Map<string, string>; background?: string; bleed?: number } = {}): string {
  const b = opts.bleed ?? 0;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${r3(c.w + 2 * b)}mm" height="${r3(c.h + 2 * b)}mm" viewBox="${r3(-b)} ${r3(-b)} ${r3(c.w + 2 * b)} ${r3(c.h + 2 * b)}">`,
  );
  if (opts.background) parts.push(`<rect x="${r3(-b)}" y="${r3(-b)}" width="${r3(c.w + 2 * b)}" height="${r3(c.h + 2 * b)}" fill="${opts.background}"/>`);
  for (const pl of c.placed) {
    parts.push(`<g transform="${tileTransform(pl.tile, pl.h)}">`);
    for (const p of pl.prims) parts.push(primToSvg(p, opts.hrefMap));
    parts.push('</g>');
  }
  for (const p of c.credit) parts.push(primToSvg(p, opts.hrefMap));
  parts.push('</svg>');
  return parts.join('');
}

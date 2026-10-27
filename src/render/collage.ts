import type { Project, Tile } from '../model';
import { printArea } from '../products';
import { layoutText } from '../text/layout';
import { parseMarkup } from '../text/markup';
import { renderTile, type Prim } from './tiles';
import type { Box } from '../layout/pack';

export function creditSize(area: { w: number }): number {
  return Math.min(3, Math.max(1.6, area.w / 140));
}

/** Area available to tiles (print area minus the optional credit strip). */
export function contentBox(p: Project): Box {
  const area = printArea(p.productId, p.customArea);
  const strip = p.credit ? creditSize(area) * 2.2 : 0;
  return { x: 0, y: 0, w: area.w, h: area.h - strip };
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
  const area = printArea(p.productId, p.customArea);
  const placed = p.tiles.map((tile) => {
    const r = renderTile(tile, p.baseSize);
    return { tile, h: r.h, prims: r.prims };
  });
  const credit: Prim[] = [];
  if (p.credit) {
    const text = creditText(p, lang);
    if (text) {
      const size = creditSize(area);
      const block = layoutText(parseMarkup(text), area.w, { size, lineHeight: 1.3, color: '#54595d', align: 'center' });
      // Shrink to a single line if needed.
      const scale = block.lines > 1 ? Math.max(0.55, area.w / (block.maxLineWidth * 1.02 + 1)) : 1;
      const final = scale < 1 ? layoutText(parseMarkup(text), area.w, { size: size * scale, lineHeight: 1.3, color: '#54595d', align: 'center' }) : block;
      const y = area.h - final.height;
      for (const pth of final.paths) credit.push({ t: 'path', d: pth.d, fill: pth.fill, x: 0, y });
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

export function primToSvg(p: Prim, hrefMap?: Map<string, string>): string {
  switch (p.t) {
    case 'rect':
      return `<rect x="${r3(p.x)}" y="${r3(p.y)}" width="${r3(p.w)}" height="${r3(p.h)}" fill="${p.fill ?? 'none'}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${r3(p.sw ?? 0.1)}"` : ''}/>`;
    case 'line':
      return `<line x1="${r3(p.x1)}" y1="${r3(p.y1)}" x2="${r3(p.x2)}" y2="${r3(p.y2)}" stroke="${p.stroke}" stroke-width="${r3(p.sw)}"/>`;
    case 'path':
      return `<path transform="translate(${r3(p.x)} ${r3(p.y)})" fill="${p.fill}" d="${p.d}"/>`;
    case 'image': {
      const href = hrefMap?.get(p.href) ?? p.href;
      return `<image x="${r3(p.x)}" y="${r3(p.y)}" width="${r3(p.w)}" height="${r3(p.h)}" preserveAspectRatio="xMidYMid slice" href="${esc(href)}" xlink:href="${esc(href)}"/>`;
    }
  }
}

/** Standalone SVG document in millimetres. */
export function compositionToSvg(c: Composition, opts: { hrefMap?: Map<string, string>; background?: string } = {}): string {
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${r3(c.w)}mm" height="${r3(c.h)}mm" viewBox="0 0 ${r3(c.w)} ${r3(c.h)}">`,
  );
  if (opts.background) parts.push(`<rect width="${r3(c.w)}" height="${r3(c.h)}" fill="${opts.background}"/>`);
  for (const pl of c.placed) {
    parts.push(`<g transform="${tileTransform(pl.tile, pl.h)}">`);
    for (const p of pl.prims) parts.push(primToSvg(p, opts.hrefMap));
    parts.push('</g>');
  }
  for (const p of c.credit) parts.push(primToSvg(p, opts.hrefMap));
  parts.push('</svg>');
  return parts.join('');
}

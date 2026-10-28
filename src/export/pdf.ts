import type { jsPDF } from 'jspdf';
import type { Composition } from '../render/collage';
import { coverRect } from '../render/collage';
import type { Prim } from '../render/tiles';

// Vector PDF straight from the composition's display list with jsPDF's
// low-level API (no SVG round trip). Every picture is embedded once, as the
// JPEG/PNG data it already is, and reused by alias; svg2pdf instead decoded
// each picture again in the browser, and on iOS Safari those decodes failed
// under memory pressure, silently dropping pictures from the PDF.

type Matrix = ReturnType<jsPDF['Matrix']>;

/** Glyph outline data: absolute M/L/Q/C/Z commands (see FontChain.path). */
function tracePath(doc: jsPDF, d: string, ox: number, oy: number): void {
  const tokens = d.match(/[MLQCZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  let i = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  const n = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[MLQCZ]/i.test(tokens[i])) cmd = tokens[i++].toUpperCase();
    switch (cmd) {
      case 'M':
        cx = n();
        cy = n();
        doc.moveTo(ox + cx, oy + cy);
        cmd = 'L'; // further pairs are line-tos
        break;
      case 'L':
        cx = n();
        cy = n();
        doc.lineTo(ox + cx, oy + cy);
        break;
      case 'Q': {
        // Quadratic → cubic.
        const qx = n();
        const qy = n();
        const x = n();
        const y = n();
        doc.curveTo(ox + cx + (2 / 3) * (qx - cx), oy + cy + (2 / 3) * (qy - cy), ox + x + (2 / 3) * (qx - x), oy + y + (2 / 3) * (qy - y), ox + x, oy + y);
        cx = x;
        cy = y;
        break;
      }
      case 'C': {
        const x1 = n();
        const y1 = n();
        const x2 = n();
        const y2 = n();
        cx = n();
        cy = n();
        doc.curveTo(ox + x1, oy + y1, ox + x2, oy + y2, ox + cx, oy + cy);
        break;
      }
      case 'Z':
        doc.close();
        break;
      default:
        i++;
    }
  }
}

function drawPrim(doc: jsPDF, p: Prim, images: Map<string, { data: string; alias: string }>): void {
  switch (p.t) {
    case 'rect':
      if (p.fill && p.fill !== 'none') {
        doc.setFillColor(p.fill);
        doc.rect(p.x, p.y, p.w, p.h, null);
        doc.fill();
      }
      if (p.stroke) {
        doc.setDrawColor(p.stroke);
        doc.setLineWidth(p.sw ?? 0.1);
        doc.rect(p.x, p.y, p.w, p.h, null);
        doc.stroke();
      }
      return;
    case 'line':
      doc.setDrawColor(p.stroke);
      doc.setLineWidth(p.sw);
      doc.moveTo(p.x1, p.y1);
      doc.lineTo(p.x2, p.y2);
      doc.stroke();
      return;
    case 'path':
      if (!p.d) return;
      doc.setFillColor(p.fill);
      tracePath(doc, p.d, p.x, p.y);
      doc.fill();
      return;
    case 'image': {
      const img = images.get(p.href);
      if (!img) return;
      const d = coverRect(p.x, p.y, p.w, p.h, p.aspect);
      const crop = d.w !== p.w || d.h !== p.h;
      if (crop) {
        doc.saveGraphicsState();
        doc.rect(p.x, p.y, p.w, p.h, null);
        doc.clip();
        doc.discardPath();
      }
      doc.addImage(img.data, img.data.startsWith('data:image/png') ? 'PNG' : 'JPEG', d.x, d.y, d.w, d.h, img.alias, 'NONE');
      if (crop) doc.restoreGraphicsState();
      return;
    }
  }
}

/**
 * Draw the composition onto the (only) page of `doc`, which is `bleed` mm
 * larger than the composition on every side. `hrefMap` maps picture URLs to
 * the data URLs to embed (pictures without one are left out).
 */
export function drawComposition(doc: jsPDF, c: Composition, opts: { hrefMap: Map<string, string>; background?: string; bleed?: number }): void {
  const b = opts.bleed ?? 0;
  const images = new Map<string, { data: string; alias: string }>();
  for (const [src, data] of opts.hrefMap) images.set(src, { data, alias: `img${images.size}` });

  doc.advancedAPI();
  doc.saveGraphicsState();
  doc.setCurrentTransformationMatrix(doc.Matrix(1, 0, 0, 1, b, b));
  if (opts.background) drawPrim(doc, { t: 'rect', x: -b, y: -b, w: c.w + 2 * b, h: c.h + 2 * b, fill: opts.background }, images);
  for (const pl of c.placed) {
    const t = pl.tile;
    // translate(x y) rotate(rot cx cy), as in the SVG.
    const a = ((t.rot || 0) * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const cx = t.w / 2;
    const cy = pl.h / 2;
    const m: Matrix = doc.Matrix(cos, sin, -sin, cos, t.x + cx - cos * cx + sin * cy, t.y + cy - sin * cx - cos * cy);
    doc.saveGraphicsState();
    doc.setCurrentTransformationMatrix(m);
    for (const p of pl.prims) drawPrim(doc, p, images);
    doc.restoreGraphicsState();
  }
  for (const p of c.credit) drawPrim(doc, p, images);
  doc.restoreGraphicsState();
  doc.compatAPI();
}

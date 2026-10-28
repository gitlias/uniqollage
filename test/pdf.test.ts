import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { writeFileSync } from 'node:fs';
import { drawComposition } from '../src/export/pdf';
import type { Composition } from '../src/render/collage';
import type { Tile } from '../src/model';

// 2×1 px PNG (red | blue), so cropping and placement can be checked.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4zwAE/wEHAAH/4iOeWQAAAABJRU5ErkJggg==';

const tile = (over: Partial<Tile>): Tile => ({ id: 't', type: 'text', markup: '', source: { kind: 'upload' }, x: 0, y: 0, w: 40, rot: 0, scale: 1, ...over }) as Tile;

function pdfFor(c: Composition): string {
  const doc = new jsPDF({ unit: 'mm', format: [c.w, c.h], compress: false });
  drawComposition(doc, c, { hrefMap: new Map([['x.png', PNG]]) });
  return doc.output();
}

describe('PDF export', () => {
  const c: Composition = {
    w: 100,
    h: 100,
    credit: [],
    placed: [
      // The same picture three times, one of them cropped to a square.
      { tile: tile({ x: 10, y: 10 }), h: 20, prims: [{ t: 'image', x: 0, y: 0, w: 40, h: 20, href: 'x.png', aspect: 2 }] },
      { tile: tile({ x: 10, y: 50 }), h: 20, prims: [{ t: 'image', x: 0, y: 0, w: 20, h: 20, href: 'x.png', aspect: 2 }] },
      { tile: tile({ x: 50, y: 50, rot: 90 }), h: 20, prims: [{ t: 'image', x: 0, y: 0, w: 40, h: 20, href: 'x.png', aspect: 2 }, { t: 'path', x: 0, y: 0, fill: '#202122', d: 'M0 0L4 0Q6 0 6 2C6 3 5 4 4 4Z' }] },
    ],
  };

  it('embeds each picture once and draws every use of it', () => {
    const pdf = pdfFor(c);
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, pdf, 'binary');
    expect(pdf.match(/\/Subtype \/Image/g)?.length).toBe(1);
    expect(pdf.match(/\/I\w* Do/g)?.length).toBe(3);
    // The cropped one is clipped (W n), the others are not.
    expect(pdf.match(/W\s*\n?n/g)?.length).toBe(1);
  });

  it('draws glyph outlines with curves (quadratics as cubics)', () => {
    const pdf = pdfFor(c);
    expect(pdf).toMatch(/ c\n/);
  });
});

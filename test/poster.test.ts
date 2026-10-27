import { beforeAll, describe, expect, it } from 'vitest';
import { setupFonts } from './setup-fonts';
import { areaOf, exportPixels, productsIn } from '../src/products';
import { emptyProject } from '../src/store';
import { compose, compositionToSvg, contentBox, pageBackground } from '../src/render/collage';

beforeAll(setupFonts);

const poster = { ...emptyProject(), productId: 'poster', sizeId: 'A2', margin: 20, credit: false };

describe('posters', () => {
  it('is offered in every region', () => {
    expect(productsIn('de').some((p) => p.id === 'poster')).toBe(true);
    expect(productsIn('jp').some((p) => p.id === 'poster')).toBe(true);
  });
  it('uses DIN sizes and swaps for landscape', () => {
    expect(areaOf(poster)).toEqual({ w: 420, h: 594 });
    expect(areaOf({ ...poster, landscape: true })).toEqual({ w: 594, h: 420 });
    expect(areaOf({ ...poster, sizeId: '50×70 cm' })).toEqual({ w: 500, h: 700 });
  });
  it('insets the content by the margin, garments ignore it', () => {
    expect(contentBox(poster)).toEqual({ x: 20, y: 20, w: 380, h: 554 });
    expect(contentBox({ ...emptyProject(), margin: 20, credit: false })).toEqual({ x: 0, y: 0, w: 310, h: 354 });
  });
  it('exports with paper background and bleed', () => {
    expect(pageBackground(poster)).toBe('#ffffff');
    expect(pageBackground({ ...poster, theme: 'dark' })).toBe('#101418');
    expect(pageBackground(emptyProject())).toBeUndefined();
    const svg = compositionToSvg(compose(poster, 'en'), { background: '#ffffff', bleed: 3 });
    expect(svg).toContain('width="426mm" height="600mm" viewBox="-3 -3 426 600"');
    expect(svg).toContain('<rect x="-3" y="-3" width="426" height="600" fill="#ffffff"/>');
  });
  it('computes print resolutions', () => {
    expect(exportPixels({ w: 420, h: 594 }, 'print-150')).toMatchObject({ w: 2480, h: 3508, dpi: 150 });
  });
});

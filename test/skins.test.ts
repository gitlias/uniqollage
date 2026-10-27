import { beforeAll, describe, expect, it } from 'vitest';
import { setupFonts } from './setup-fonts';
import { renderTile, paletteFor } from '../src/render/tiles';
import { isNonStandardThumb, originalFromThumb } from '../src/wiki/api';
import { emptyProject, migrate } from '../src/store';
import type { ImageTile, Project } from '../src/model';

beforeAll(setupFonts);

const thumb = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Ginkgo.jpg/1600px-Ginkgo.jpg';
const image: ImageTile = {
  id: 'i',
  type: 'image',
  x: 0,
  y: 0,
  w: 60,
  rot: 0,
  scale: 1,
  source: { kind: 'wikipedia' },
  image: { src: thumb, aspect: 0.75 },
  caption: 'May 22, 1944 [[Life Magazine]] Picture of the Week',
  frame: true,
};

describe('Wikimedia thumbnail sizes', () => {
  it('detects non-standard widths and falls back to the original', () => {
    expect(isNonStandardThumb(thumb)).toBe(true);
    expect(isNonStandardThumb(thumb.replace('1600px', '1920px'))).toBe(false);
    expect(originalFromThumb(thumb)).toBe('https://upload.wikimedia.org/wikipedia/commons/a/ab/Ginkgo.jpg');
  });
  it('repairs saved projects on load', () => {
    const p = migrate({ ...emptyProject(), tiles: [image] } as Project);
    expect((p.tiles[0] as ImageTile).image.src).toBe('https://upload.wikimedia.org/wikipedia/commons/a/ab/Ginkgo.jpg');
  });
});

describe('skins and image styles', () => {
  const rects = (t: ImageTile, skin: Parameters<typeof renderTile>[3]) => renderTile({ ...t }, 3, 'light', skin).prims.filter((p) => p.t === 'rect').length;
  it('classic thumbnails have a card, an image border and the enlarge icon', () => {
    expect(rects(image, 'vector2010')).toBe(4);
    expect(rects(image, 'vector2022')).toBe(2);
    expect(rects(image, 'minerva')).toBe(0);
    expect(rects({ ...image, imageStyle: 'classic' }, 'minerva')).toBe(4);
    expect(rects({ ...image, frame: false }, 'vector2010')).toBe(0);
  });
  it('uses the skin link colours', () => {
    expect(paletteFor('light', 'vector2010').link).toBe('#0645ad');
    expect(paletteFor('light', 'monobook').link).toBe('#002bb8');
    expect(paletteFor('light', 'vector2022').link).toBe('#3366cc');
    expect(paletteFor('dark', 'vector2010').link).toBe('#88a3e8');
    const fills = renderTile({ ...image }, 3, 'light', 'vector2010').prims.filter((p) => p.t === 'path').map((p) => (p as { fill: string }).fill);
    expect(fills).toContain('#0645ad');
  });
});

describe('cards', () => {
  it('renders image, title, rule, description and text, and credits the image', async () => {
    const { creditText } = await import('../src/render/collage');
    const card = {
      id: 'c',
      type: 'card' as const,
      x: 0,
      y: 0,
      w: 80,
      rot: 0,
      scale: 1,
      source: { kind: 'wikipedia' as const, lang: 'de' as const, title: 'Naurskaja' },
      title: 'Naurskaja',
      description: 'Siedlung in Russland',
      markup: "'''Naurskaja''' ist eine Staniza in der Republik Tschetschenien.",
      image: { src: 'x.jpg', aspect: 2.2 },
      imageSource: { kind: 'wikipedia' as const, license: 'CC BY-SA 3.0' },
    };
    const r = renderTile(card, 3, 'light', 'vector2010');
    expect(r.prims.filter((p) => p.t === 'image')).toHaveLength(1);
    expect(r.prims.filter((p) => p.t === 'line')).toHaveLength(1);
    const noImage = renderTile({ ...card, image: undefined }, 3, 'light', 'vector2010');
    expect(r.h - noImage.h).toBeGreaterThan(20);
    // Whole picture by default: the drawn box has the image's own aspect ratio, also for portraits.
    for (const aspect of [2.2, 0.6, 0.3]) {
      const img = renderTile({ ...card, image: { src: 'x.jpg', aspect } }, 3, 'light', 'vector2010').prims.find((p) => p.t === 'image') as { w: number; h: number };
      expect(img.w / img.h).toBeCloseTo(aspect, 5);
    }
    const cropped = renderTile({ ...card, image: { src: 'x.jpg', aspect: 0.6 }, imageFit: 'cover' as const }, 3, 'light', 'vector2010').prims.find((p) => p.t === 'image') as { w: number; h: number };
    expect(cropped.w / cropped.h).toBeCloseTo(4 / 3, 5);
    const credit = creditText({ ...emptyProject(), tiles: [card] }, 'de');
    expect(credit).toContain('de.wikipedia.org');
    expect(credit).toContain('CC BY-SA 3.0');
  });
});

import { describe, expect, it } from 'vitest';
import { exportPixels, offerIn, printArea, productById, productsIn, PRODUCTS, sizeOf, UPLOAD_TARGETS } from '../src/products';
import { emptyProject, migrate, normalize, resetSettings } from '../src/store';
import type { Project } from '../src/model';

describe('products', () => {
  it('uses the official UTme! print areas', () => {
    expect(printArea('basic-t', { w: 1, h: 1 }, 'M')).toEqual({ w: 310, h: 354 });
    expect(printArea('basic-t', { w: 1, h: 1 }, 'XXL')).toEqual({ w: 350, h: 400 });
    expect(printArea('tote', { w: 1, h: 1 })).toEqual({ w: 265, h: 298 });
    expect(printArea('mini-tote', { w: 1, h: 1 })).toEqual({ w: 125, h: 140 });
    expect(sizeOf('sweat', 'M').top).toBe(90);
  });
  it('every product has its default size and colours', () => {
    for (const p of PRODUCTS) {
      expect(p.sizes.some((s) => s.id === p.defaultSize)).toBe(true);
      expect(p.colors.length).toBeGreaterThan(0);
    }
  });
  it('fits PNG exports into the upload limits with the print-area aspect', () => {
    for (const p of PRODUCTS.filter((x) => x.id !== 'custom'))
      for (const s of p.sizes)
        for (const t of UPLOAD_TARGETS.filter((x) => Number.isFinite(x.maxW))) {
          const px = exportPixels(s, t.id);
          expect(px.w).toBeLessThanOrEqual(t.maxW);
          expect(px.h).toBeLessThanOrEqual(t.maxH);
          expect(Math.max(px.w / t.maxW, px.h / t.maxH)).toBeGreaterThan(0.99);
          expect(px.w / px.h).toBeCloseTo(s.w / s.h, 2);
        }
    expect(exportPixels({ w: 310, h: 354 }, 'print-300')).toMatchObject({ w: 3661, h: 4181, dpi: 300 });
  });
  it('migrates projects saved with legacy product ids', () => {
    const old = { ...emptyProject(), productId: 'tshirt-chest', garment: 'navy' } as Project;
    delete (old as Partial<Project>).sizeId;
    delete (old as Partial<Project>).theme;
    delete (old as Partial<Project>).region;
    const m = migrate(old);
    expect(m.region).toBe('de');
    expect(m.productId).toBe('basic-t');
    expect(m.sizeId).toBe('M');
    expect(m.theme).toBe('light');
    expect(m.garment).toBe('white');
  });
});

describe('regions', () => {
  it('offers exactly the German UTme! line-up', () => {
    expect(productsIn('de').map((p) => p.id)).toEqual(['basic-t', 'kids-t', 'tote', 'mini-tote', 'poster', 'custom']);
    const tee = offerIn(productById('basic-t'), 'de');
    expect(tee.sizes.map((s) => s.id)).toEqual(['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL']);
    expect(tee.colors).toEqual(['white']);
    expect(tee.price).toBe('19,90 €');
    expect(offerIn(productById('kids-t'), 'de').sizes.map((s) => s.id)).toEqual(['110', '120', '130', '140', '150', '160']);
    expect(sizeOf('basic-t', '3XL').estimated).toBe(true);
    expect(sizeOf('basic-t', 'M').estimated).toBeUndefined();
  });
  it('keeps Japanese-only items and sizes out of Germany', () => {
    const jp = { ...emptyProject(), region: 'jp' as const, productId: 'sweat', sizeId: 'L', garment: 'black', theme: 'dark' as const };
    const de = normalize({ ...jp, region: 'de' });
    expect(de).toMatchObject({ productId: 'basic-t', sizeId: 'L', garment: 'white', theme: 'light' });
    expect(normalize({ ...emptyProject(), region: 'jp', sizeId: '3XL' }).sizeId).toBe('M');
  });
});

describe('resetSettings', () => {
  it('restores layout and look defaults but keeps what is printed on', () => {
    const p = {
      ...emptyProject(),
      productId: 'tote',
      sizeId: 'one',
      garment: 'natural',
      baseSize: 7,
      autoSize: false,
      gap: 9,
      margins: 20,
      neat: 1,
      credit: false,
      skin: 'minerva' as const,
      arrangement: 'mosaic' as const,
      optimize: { effort: 'thorough' as const },
      cropImages: false,
      reserve: [{ markup: 'x', source: { kind: 'upload' as const } }],
    };
    const r = resetSettings(p);
    const d = emptyProject();
    expect([r.productId, r.sizeId, r.garment, r.reserve]).toEqual([p.productId, p.sizeId, p.garment, p.reserve]);
    expect([r.baseSize, r.autoSize, r.gap, r.margins, r.neat, r.credit, r.skin]).toEqual([d.baseSize, true, undefined, 0, undefined, true, 'vector2010']);
    expect([r.arrangement, r.optimize, r.cropImages]).toEqual([undefined, undefined, undefined]);
  });
});

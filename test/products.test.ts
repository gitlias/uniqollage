import { describe, expect, it } from 'vitest';
import { exportPixels, printArea, productById, PRODUCTS, sizeOf, UPLOAD_TARGETS } from '../src/products';
import { emptyProject, migrate } from '../src/store';
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
    const m = migrate(old);
    expect(m.productId).toBe('basic-t');
    expect(m.sizeId).toBe('M');
    expect(m.theme).toBe('light');
    expect(productById(m.productId).colors).toContain(m.garment);
  });
});

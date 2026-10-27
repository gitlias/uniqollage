// UNIQLO UTme! products, print areas and garment measurements.
//
// Sources (checked 2026-10):
// - Print areas: official UTme! FAQ "インクジェットプリントの大きさ(範囲)はどれくらいですか。"
//   https://utme.uniqlo.com/faq/print/ (table image "印刷範囲表25.4", April 2025).
//   Values are mm; "collar" is the distance from the lowest point of the front
//   neck seam (tops) or from the top edge (bags) to the top of the print area.
// - Garment measurements (身丈 length, 肩幅 shoulder, 身幅 body width, cm):
//   https://utme.uniqlo.com/itemlineup/
// - Upload limits: https://utme.uniqlo.com/faq/processing/ (PNG/JPEG, ≤2048×2304 px,
//   RGB, ~5 MB web / ~10 MB app; printer resolution 96 dpi; #FFFFFF is not printed).
// Only the front can be printed. Regional services (EU, SG, PH…) use the same
// garments; some regions document a 2048×2048 px / 2 MB upload instead.

export type Shape = 'tee' | 'oversized' | 'sweat' | 'tote' | 'mini-tote' | 'none';

export interface SizeSpec {
  id: string;
  /** Print area in mm. */
  w: number;
  h: number;
  /** Collar (or bag top) to print area, mm. */
  top: number;
  /** Garment: length, shoulder width, body width (flat), mm. Bags: width, height. */
  garment: { length: number; shoulder?: number; width: number };
}

export interface Product {
  id: string;
  name: { en: string; de: string };
  shape: Shape;
  colors: string[];
  sizes: SizeSpec[];
  defaultSize: string;
}

type Row = [id: string, w: number, h: number, top: number, length: number, shoulder: number, width: number];
const sizes = (rows: Row[]): SizeSpec[] =>
  rows.map(([id, w, h, top, length, shoulder, width]) => ({ id, w, h, top, garment: { length, shoulder, width } }));

export const PRODUCTS: Product[] = [
  {
    id: 'basic-t',
    name: { en: 'Basic T-shirt', de: 'Basic T-Shirt' },
    shape: 'tee',
    colors: ['white', 'black'],
    defaultSize: 'M',
    sizes: sizes([
      ['XS', 270, 308, 40, 630, 420, 460],
      ['S', 290, 331, 40, 650, 435, 490],
      ['M', 310, 354, 40, 680, 450, 520],
      ['L', 330, 373, 40, 710, 465, 550],
      ['XL', 330, 373, 40, 740, 485, 590],
      ['XXL', 350, 400, 50, 765, 505, 630],
    ]),
  },
  {
    id: 'u-crew',
    name: { en: 'U Crew Neck T-shirt', de: 'U Crew Neck T-Shirt' },
    shape: 'tee',
    colors: ['white'],
    defaultSize: 'M',
    sizes: sizes([
      ['S', 290, 331, 70, 660, 450, 500],
      ['M', 310, 354, 70, 690, 465, 530],
      ['L', 330, 373, 70, 720, 480, 560],
      ['XL', 330, 373, 70, 750, 500, 600],
      ['XXL', 350, 400, 70, 770, 520, 640],
    ]),
  },
  {
    id: 'airism-oversized',
    name: { en: 'AIRism Cotton Oversized T-shirt', de: 'AIRism Cotton Oversized T-Shirt' },
    shape: 'oversized',
    colors: ['white'],
    defaultSize: 'M',
    sizes: sizes([
      ['S', 290, 331, 40, 660, 510, 525],
      ['M', 310, 354, 40, 690, 525, 555],
      ['L', 330, 373, 40, 720, 540, 585],
      ['XL', 330, 373, 40, 750, 560, 625],
      ['XXL', 350, 400, 50, 775, 580, 665],
    ]),
  },
  {
    id: 'kids-t',
    name: { en: 'Kids Basic T-shirt', de: 'Kinder Basic T-Shirt' },
    shape: 'tee',
    colors: ['white'],
    defaultSize: '130',
    sizes: sizes([
      ['100', 213, 240, 32, 420, 330, 340],
      ['110', 235, 265, 32, 450, 345, 360],
      ['120', 235, 265, 32, 480, 360, 380],
      ['130', 235, 265, 36, 510, 375, 400],
      ['140', 235, 265, 36, 550, 390, 420],
      ['150', 265, 299, 36, 590, 410, 450],
      ['160', 270, 308, 40, 630, 425, 470],
    ]),
  },
  {
    id: 'sweat',
    name: { en: 'Sweatshirt', de: 'Sweatshirt' },
    shape: 'sweat',
    colors: ['offwhite', 'black'],
    defaultSize: 'M',
    sizes: sizes([
      ['S', 290, 331, 90, 620, 475, 535],
      ['M', 310, 354, 90, 650, 490, 565],
      ['L', 330, 373, 90, 680, 505, 595],
      ['XL', 350, 400, 90, 710, 525, 635],
      ['XXL', 350, 400, 90, 730, 545, 675],
    ]),
  },
  {
    id: 'tote',
    name: { en: 'Tote bag', de: 'Tragetasche' },
    shape: 'tote',
    colors: ['offwhite'],
    defaultSize: 'F',
    sizes: [{ id: 'F', w: 265, h: 298, top: 60, garment: { width: 390, length: 410 } }],
  },
  {
    id: 'mini-tote',
    name: { en: 'Mini tote bag', de: 'Mini-Tragetasche' },
    shape: 'mini-tote',
    colors: ['offwhite'],
    defaultSize: 'F',
    sizes: [{ id: 'F', w: 125, h: 140, top: 40, garment: { width: 350, length: 215 } }],
  },
  {
    id: 'custom',
    name: { en: 'Custom size', de: 'Eigene Größe' },
    shape: 'none',
    colors: ['white', 'offwhite', 'black'],
    defaultSize: 'F',
    sizes: [{ id: 'F', w: 250, h: 320, top: 0, garment: { width: 0, length: 0 } }],
  },
];

/** Projects saved before the official tables were added used these ids. */
const LEGACY: Record<string, string> = {
  tshirt: 'basic-t',
  'tshirt-square': 'basic-t',
  'tshirt-chest': 'basic-t',
};

export function productById(id: string): Product {
  return PRODUCTS.find((p) => p.id === id) ?? PRODUCTS.find((p) => p.id === LEGACY[id]) ?? PRODUCTS[0];
}

export function sizeOf(productId: string, sizeId: string | undefined): SizeSpec {
  const p = productById(productId);
  return p.sizes.find((s) => s.id === sizeId) ?? p.sizes.find((s) => s.id === p.defaultSize) ?? p.sizes[0];
}

export function printArea(productId: string, custom: { w: number; h: number }, sizeId?: string): { w: number; h: number } {
  const p = productById(productId);
  if (p.id === 'custom') return custom;
  const s = sizeOf(productId, sizeId);
  return { w: s.w, h: s.h };
}

export interface GarmentColor {
  id: string;
  hex: string;
  dark: boolean;
  name: { en: string; de: string };
}

export const GARMENT_COLORS: GarmentColor[] = [
  { id: 'white', hex: '#f7f7f5', dark: false, name: { en: 'White', de: 'Weiß' } },
  { id: 'offwhite', hex: '#efe9dc', dark: false, name: { en: 'Off white', de: 'Naturweiß' } },
  { id: 'black', hex: '#1d1d1f', dark: true, name: { en: 'Black', de: 'Schwarz' } },
];

export function garmentColor(id: string): GarmentColor {
  return GARMENT_COLORS.find((c) => c.id === id) ?? GARMENT_COLORS[0];
}

/** UTme! upload targets. */
export const UPLOAD_TARGETS = [
  { id: 'utme-jp', maxW: 2048, maxH: 2304, maxBytes: 5 * 1024 * 1024, name: { en: 'UTme! Japan (max. 2048 × 2304 px, ≈5 MB web / 10 MB app)', de: 'UTme! Japan (max. 2048 × 2304 px, ≈5 MB Web / 10 MB App)' } },
  { id: 'utme-intl', maxW: 2048, maxH: 2048, maxBytes: 2 * 1024 * 1024, name: { en: 'UTme! other regions (max. 2048 × 2048 px, ≤2 MB)', de: 'UTme! andere Länder (max. 2048 × 2048 px, ≤2 MB)' } },
  { id: 'print-300', maxW: Infinity, maxH: Infinity, maxBytes: Infinity, name: { en: 'High resolution, 300 dpi (other print shops)', de: 'Hohe Auflösung, 300 dpi (andere Druckereien)' } },
] as const;

export type UploadTargetId = (typeof UPLOAD_TARGETS)[number]['id'];

/** Pixel size of a PNG export for a print area (mm) and target. */
export function exportPixels(area: { w: number; h: number }, target: UploadTargetId): { w: number; h: number; dpi: number } {
  const t = UPLOAD_TARGETS.find((x) => x.id === target)!;
  if (!Number.isFinite(t.maxW)) {
    const dpi = 300;
    return { w: Math.round((area.w / 25.4) * dpi), h: Math.round((area.h / 25.4) * dpi), dpi };
  }
  const scale = Math.min(t.maxW / area.w, t.maxH / area.h); // px per mm
  return { w: Math.floor(area.w * scale), h: Math.floor(area.h * scale), dpi: Math.round(scale * 25.4) };
}

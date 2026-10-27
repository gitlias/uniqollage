// UNIQLO UTme! product presets.
//
// UNIQLO does not publish exact print-area dimensions (the UTme! app shows the
// boundary on screen), so these are conservative approximations derived from
// the garment/bag sizes. Users can switch to "custom" to enter exact values.

export interface Product {
  id: string;
  name: { en: string; de: string };
  /** Print area in mm. */
  w: number;
  h: number;
  /** Mockup shape and where the print area sits on it. */
  mockup: 'tshirt' | 'tshirt-chest' | 'tote' | 'mini-tote' | 'sweat' | 'none';
}

export const PRODUCTS: Product[] = [
  { id: 'tshirt', name: { en: 'T-shirt – front (large)', de: 'T-Shirt – Vorderseite (groß)' }, w: 250, h: 320, mockup: 'tshirt' },
  { id: 'tshirt-square', name: { en: 'T-shirt – front (square)', de: 'T-Shirt – Vorderseite (quadratisch)' }, w: 250, h: 250, mockup: 'tshirt' },
  { id: 'tshirt-chest', name: { en: 'T-shirt – chest (small)', de: 'T-Shirt – Brust (klein)' }, w: 100, h: 100, mockup: 'tshirt-chest' },
  { id: 'tote', name: { en: 'Tote bag (41 × 39 cm)', de: 'Tragetasche (41 × 39 cm)' }, w: 300, h: 300, mockup: 'tote' },
  { id: 'mini-tote', name: { en: 'Mini tote (35 × 21.5 cm)', de: 'Mini-Tasche (35 × 21,5 cm)' }, w: 250, h: 150, mockup: 'mini-tote' },
  { id: 'sweat', name: { en: 'Sweatshirt / hoodie – front', de: 'Sweatshirt / Hoodie – Vorderseite' }, w: 250, h: 280, mockup: 'sweat' },
  { id: 'custom', name: { en: 'Custom size', de: 'Eigene Größe' }, w: 250, h: 320, mockup: 'none' },
];

export function productById(id: string): Product {
  return PRODUCTS.find((p) => p.id === id) ?? PRODUCTS[0];
}

export function printArea(productId: string, custom: { w: number; h: number }): { w: number; h: number } {
  const p = productById(productId);
  return p.id === 'custom' ? custom : { w: p.w, h: p.h };
}

export const GARMENT_COLORS: { id: string; hex: string; name: { en: string; de: string } }[] = [
  { id: 'white', hex: '#f7f7f5', name: { en: 'White', de: 'Weiß' } },
  { id: 'natural', hex: '#ece3d0', name: { en: 'Natural', de: 'Natur' } },
  { id: 'grey', hex: '#c9cbcd', name: { en: 'Light grey', de: 'Hellgrau' } },
  { id: 'sky', hex: '#c8dcec', name: { en: 'Light blue', de: 'Hellblau' } },
  { id: 'navy', hex: '#26324a', name: { en: 'Navy', de: 'Marine' } },
  { id: 'black', hex: '#1d1d1f', name: { en: 'Black', de: 'Schwarz' } },
];

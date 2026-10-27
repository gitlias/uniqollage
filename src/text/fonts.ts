import opentype from 'opentype.js';
import type { Font } from 'opentype.js';

// Text is measured *and* drawn with opentype.js outlines, so the editor preview,
// the PNG and the vector exports are identical and need no font embedding.

export type FontStyle = 'serif' | 'serifItalic' | 'sans' | 'sansBold' | 'sansItalic' | 'sansBoldItalic';

const SUBSETS = ['latin', 'latin-ext', 'greek', 'cyrillic'] as const;

/** fontsource file name stem per style, e.g. "arimo-{subset}-700-normal". */
const FILES: Record<FontStyle, string> = {
  serif: 'libertinus-serif/files/libertinus-serif-{subset}-400-normal.woff',
  serifItalic: 'libertinus-serif/files/libertinus-serif-{subset}-400-italic.woff',
  sans: 'arimo/files/arimo-{subset}-400-normal.woff',
  sansBold: 'arimo/files/arimo-{subset}-700-normal.woff',
  sansItalic: 'arimo/files/arimo-{subset}-400-italic.woff',
  sansBoldItalic: 'arimo/files/arimo-{subset}-700-italic.woff',
};

export function fontFiles(): { style: FontStyle; subset: string; path: string }[] {
  const out: { style: FontStyle; subset: string; path: string }[] = [];
  for (const style of Object.keys(FILES) as FontStyle[]) {
    for (const subset of SUBSETS) out.push({ style, subset, path: FILES[style].replace('{subset}', subset) });
  }
  return out;
}

// opentype.js 2.0's Path.toPathData occasionally emits "NaN" when rounding,
// so serialise the commands ourselves.
const num = (v: number) => String(Math.round(v * 1000) / 1000);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pathData(cmds: any[]): string {
  let d = '';
  for (const c of cmds) {
    if (c.type === 'M' || c.type === 'L') d += `${c.type}${num(c.x)} ${num(c.y)}`;
    else if (c.type === 'Q') d += `Q${num(c.x1)} ${num(c.y1)} ${num(c.x)} ${num(c.y)}`;
    else if (c.type === 'C') d += `C${num(c.x1)} ${num(c.y1)} ${num(c.x2)} ${num(c.y2)} ${num(c.x)} ${num(c.y)}`;
    else if (c.type === 'Z') d += 'Z';
  }
  return d;
}

/** Variation selectors and other format characters crash or confuse shaping. */
const FORMAT_CHARS = /[\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufe00-\ufe0f\ufeff]|\udb40[\udd00-\uddef]/g;

/** A primary font plus fallbacks for characters outside its subset. */
export class FontChain {
  constructor(readonly fonts: Font[]) {}

  private fontFor(ch: string): Font {
    const cp = ch.codePointAt(0)!;
    for (const f of this.fonts) {
      if (f.charToGlyphIndex(String.fromCodePoint(cp)) > 0) return f;
    }
    return this.fonts[0];
  }

  /** Split text into runs that each render with a single font. */
  private segments(text: string): { font: Font; text: string }[] {
    const segs: { font: Font; text: string }[] = [];
    for (const ch of text.replace(FORMAT_CHARS, '')) {
      // Spaces exist in every font; keep them in the current run to preserve kerning.
      const f = ch === ' ' && segs.length ? segs[segs.length - 1].font : this.fontFor(ch);
      const last = segs[segs.length - 1];
      if (last && last.font === f) last.text += ch;
      else segs.push({ font: f, text: ch });
    }
    return segs;
  }

  // Advance widths scale linearly with size, so cache them at size 1.
  private unitWidths = new Map<string, number>();

  measure(text: string, size: number): number {
    let w = this.unitWidths.get(text);
    if (w === undefined) {
      w = 0;
      for (const s of this.segments(text)) w += s.font.getAdvanceWidth(s.text, 1, { kerning: true });
      if (this.unitWidths.size > 50_000) this.unitWidths.clear();
      this.unitWidths.set(text, w);
    }
    return w * size;
  }

  /** SVG path data for `text` with its baseline starting at (x, y). */
  path(text: string, x: number, y: number, size: number): string {
    let d = '';
    for (const s of this.segments(text)) {
      d += pathData(s.font.getPath(s.text, x, y, size, { kerning: true }).commands);
      x += s.font.getAdvanceWidth(s.text, size, { kerning: true });
    }
    return d;
  }

  /** Ascender as a fraction of the font size. */
  get ascent(): number {
    const f = this.fonts[0];
    return f.ascender / f.unitsPerEm;
  }
}

let chains: Record<FontStyle, FontChain> | null = null;

export function fontsReady(): boolean {
  return chains !== null;
}

export function font(style: FontStyle): FontChain {
  if (!chains) throw new Error('Fonts not loaded');
  return chains[style];
}

/** Install fonts from raw WOFF buffers (path → buffer as returned by `fontFiles`). */
export function installFonts(buffers: Map<string, ArrayBuffer>): void {
  const byStyle = {} as Record<FontStyle, Font[]>;
  for (const { style, path } of fontFiles()) {
    const buf = buffers.get(path);
    if (!buf) continue;
    (byStyle[style] ??= []).push(opentype.parse(buf));
  }
  const out = {} as Record<FontStyle, FontChain>;
  for (const style of Object.keys(FILES) as FontStyle[]) {
    if (!byStyle[style]?.length) throw new Error(`Missing font files for ${style}`);
    out[style] = new FontChain(byStyle[style]);
  }
  chains = out;
}

/** Browser loader: Vite resolves the fontsource files to hashed asset URLs. */
export async function loadFonts(): Promise<void> {
  if (chains) return;
  const urls = import.meta.glob(
    [
      '/node_modules/@fontsource/arimo/files/arimo-{latin,latin-ext,greek,cyrillic}-{400,700}-{normal,italic}.woff',
      '/node_modules/@fontsource/libertinus-serif/files/libertinus-serif-{latin,latin-ext,greek,cyrillic}-400-{normal,italic}.woff',
    ],
    {
    query: '?url',
    import: 'default',
      eager: true,
    },
  ) as Record<string, string>;
  const buffers = new Map<string, ArrayBuffer>();
  await Promise.all(
    fontFiles().map(async ({ path }) => {
      const url = urls[`/node_modules/@fontsource/${path}`];
      if (!url) return;
      const res = await fetch(url);
      buffers.set(path, await res.arrayBuffer());
    }),
  );
  installFonts(buffers);
}

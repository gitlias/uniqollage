import * as hb from 'harfbuzzjs';
import { woffToSfnt } from './woff';

// Text is shaped with HarfBuzz (ligatures, Arabic joining, Indic reordering,
// mark positioning) and drawn from the fonts' glyph outlines, so the editor
// preview, the PNG and the vector exports are identical and need no font
// embedding. Characters outside the bundled fonts are covered by Noto fonts
// that are loaded on demand (see fallback.ts).

export type FontStyle = 'serif' | 'serifItalic' | 'sans' | 'sansBold' | 'sansItalic' | 'sansBoldItalic';

const SUBSETS = ['latin', 'latin-ext', 'greek', 'greek-ext', 'cyrillic', 'cyrillic-ext', 'vietnamese'] as const;

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

interface LoadedFont {
  name: string;
  font: hb.Font;
  upem: number;
  cps: Set<number>;
  /** Glyph outlines in font units, cached per glyph id. */
  outlines: Map<number, { type: string; values: number[] }[]>;
}

function load(name: string, sfnt: ArrayBuffer): LoadedFont {
  const face = new hb.Face(new hb.Blob(sfnt));
  return { name, font: new hb.Font(face), upem: face.upem, cps: new Set(face.collectUnicodes()), outlines: new Map() };
}

/** Fonts loaded on demand for other scripts; shared by every style. */
const fallbacks: LoadedFont[] = [];

/** Right-to-left scripts. */
const RTL = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Adlam}\p{Script=Samaritan}\p{Script=Mandaic}]/u;
const STRONG = /[\p{L}]/u;

/** Direction of the first strong character, or null for neutral text (digits, punctuation). */
export function strongDirection(text: string): 'ltr' | 'rtl' | null {
  for (const ch of text) {
    if (RTL.test(ch)) return 'rtl';
    if (STRONG.test(ch)) return 'ltr';
  }
  return null;
}

/** Characters that only confuse layout (zero-width space, bidi embedding controls, BOM). */
const STRIP = /[​‪-‮⁦-⁩﻿]/g;
const MARK = /\p{M}/u;

let sharedBuffer: hb.Buffer | null = null;

interface Shaped {
  /** Advance in em. */
  width: number;
  glyphs: { f: LoadedFont; g: number; x: number; dy: number }[];
}

/** A primary font (all subsets of one family/style) plus the shared fallbacks. */
export class FontChain {
  constructor(readonly fonts: LoadedFont[]) {}

  private fontFor(cp: number): LoadedFont {
    for (const f of this.fonts) if (f.cps.has(cp)) return f;
    for (const f of fallbacks) if (f.cps.has(cp)) return f;
    return this.fonts[0];
  }

  covers(cp: number): boolean {
    return this.fonts.some((f) => f.cps.has(cp)) || fallbacks.some((f) => f.cps.has(cp));
  }

  /** Split text into runs that each render with a single font (marks stay with their base). */
  private segments(text: string): { font: LoadedFont; text: string }[] {
    const segs: { font: LoadedFont; text: string }[] = [];
    for (const ch of text.replace(STRIP, '')) {
      const last = segs[segs.length - 1];
      const keep = last && (ch === ' ' || MARK.test(ch) || ch === '‌' || ch === '‍');
      const f = keep ? last.font : this.fontFor(ch.codePointAt(0)!);
      if (last && last.font === f) last.text += ch;
      else segs.push({ font: f, text: ch });
    }
    return segs;
  }

  private cache = new Map<string, Shaped>();

  shape(text: string): Shaped {
    let s = this.cache.get(text);
    if (s) return s;
    const rtl = strongDirection(text) === 'rtl';
    const runs = this.segments(text).map((seg) => {
      const buf = (sharedBuffer ??= new hb.Buffer());
      buf.reset();
      buf.addText(seg.text);
      buf.guessSegmentProperties();
      buf.setDirection(rtl ? hb.Direction.RTL : hb.Direction.LTR);
      hb.shape(seg.font.font, buf);
      const out = buf.getGlyphInfosAndPositions().map((g) => ({ g: g.codepoint, adv: (g.xAdvance ?? 0) / seg.font.upem, dx: (g.xOffset ?? 0) / seg.font.upem, dy: (g.yOffset ?? 0) / seg.font.upem }));
      return { font: seg.font, glyphs: out };
    });
    // HarfBuzz returns each run in visual order; RTL runs also follow each other right to left.
    if (rtl) runs.reverse();
    const glyphs: Shaped['glyphs'] = [];
    let x = 0;
    for (const r of runs) {
      for (const g of r.glyphs) {
        glyphs.push({ f: r.font, g: g.g, x: x + g.dx, dy: g.dy });
        x += g.adv;
      }
    }
    s = { width: x, glyphs };
    if (this.cache.size > 50_000) this.cache.clear();
    this.cache.set(text, s);
    return s;
  }

  measure(text: string, size: number): number {
    return this.shape(text).width * size;
  }

  /** SVG path data for `text` with its baseline starting at (x, y). */
  path(text: string, x: number, y: number, size: number): string {
    let d = '';
    for (const gl of this.shape(text).glyphs) {
      let cmds = gl.f.outlines.get(gl.g);
      if (!cmds) {
        cmds = gl.f.font.glyphToJson(gl.g);
        gl.f.outlines.set(gl.g, cmds);
      }
      const k = size / gl.f.upem;
      const ox = x + gl.x * size;
      const oy = y - gl.dy * size;
      for (const c of cmds) {
        d += c.type;
        for (let i = 0; i < c.values.length; i += 2) {
          if (i) d += ' ';
          d += `${num(ox + c.values[i] * k)} ${num(oy - c.values[i + 1] * k)}`;
        }
      }
    }
    return d;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

const num = (v: number) => String(Math.round(v * 1000) / 1000);

let chains: Record<FontStyle, FontChain> | null = null;
let epoch = 0;
const listeners = new Set<() => void>();

export function fontsReady(): boolean {
  return chains !== null;
}

export function font(style: FontStyle): FontChain {
  if (!chains) throw new Error('Fonts not loaded');
  return chains[style];
}

/** Increases whenever fonts were added; renderers key their caches on it. */
export function fontEpoch(): number {
  return epoch;
}

export function onFontsChanged(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** True if some loaded font has a glyph for the code point. */
export function isCovered(cp: number): boolean {
  return font('sans').covers(cp) || font('serif').covers(cp);
}

/** Add a fallback font (TTF/OTF/WOFF) for further scripts and re-render. */
export async function addFallbackFont(name: string, data: ArrayBuffer): Promise<void> {
  if (fallbacks.some((f) => f.name === name)) return;
  fallbacks.push(load(name, await woffToSfnt(data)));
  for (const c of Object.values(chains ?? {})) c.clearCache();
  epoch++;
  for (const cb of listeners) cb();
}

/** Install fonts from raw WOFF buffers (path → buffer as returned by `fontFiles`). */
export async function installFonts(buffers: Map<string, ArrayBuffer>): Promise<void> {
  const byStyle = {} as Record<FontStyle, LoadedFont[]>;
  for (const { style, path } of fontFiles()) {
    const buf = buffers.get(path);
    if (!buf) continue;
    (byStyle[style] ??= []).push(load(path, await woffToSfnt(buf)));
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
      '/node_modules/@fontsource/arimo/files/arimo-{latin,latin-ext,greek,greek-ext,cyrillic,cyrillic-ext,vietnamese}-{400,700}-{normal,italic}.woff',
      '/node_modules/@fontsource/libertinus-serif/files/libertinus-serif-{latin,latin-ext,greek,greek-ext,cyrillic,cyrillic-ext,vietnamese}-400-{normal,italic}.woff',
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
  await installFonts(buffers);
}

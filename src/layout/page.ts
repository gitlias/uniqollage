import { newId, type ImageRef, type Lang, type Skin, type Source, type Tile } from '../model';
import { tileHeight } from '../render/tiles';
import { splitSentences, type Figure, type ParsedArticle } from '../wiki/parse';
import type { ImageInfo } from '../wiki/api';
import type { Box } from './pack';

// "Whole page": lay a single article out like a Wikipedia page across the
// canvas – title with tagline, infobox and pictures floating on the right,
// paragraphs beside and below them, section headings – and cut it off where
// the canvas ends (the last paragraph ends with "…").

export interface PageArticle extends ParsedArticle {
  lang: Lang;
  title: string;
  url: string;
  images: Map<string, ImageInfo>;
}

const FLOAT_SHARE = 0.36; // width of the right-hand column (infobox, pictures)
const MAX_FIGURES = 4;

export function articlePage(a: PageArticle, area: Box, opts: { baseSize: number; skin: Skin }): Tile[] {
  const b = opts.baseSize;
  const gap = b * 0.9;
  const bottom = area.y + area.h;
  const source: Source = { kind: 'wikipedia', lang: a.lang, title: a.title, url: a.url };
  const base = { rot: 0, scale: 1, source };
  const out: Tile[] = [];
  const height = (t: Tile) => tileHeight(t, t.w, b, opts.skin);
  const floatW = Math.max(area.w * FLOAT_SHARE, 30);
  const floatX = area.x + area.w - floatW;
  let y = area.y;
  let floatBottom = area.y; // the right column is occupied down to here
  let full = false; // canvas is full

  const fits = (t: Tile) => t.y + height(t) <= bottom + 1e-6;

  const imageRef = (f: Figure): { image: ImageRef; info?: ImageInfo } => {
    const info = a.images.get(f.file);
    return { image: { src: info?.url ?? f.thumb, aspect: info ? info.width / info.height : 1.33 }, info };
  };

  /** Put a tile in the right-hand column below earlier floats. */
  const float = (t: Tile) => {
    const placed = { ...t, x: floatX, y: Math.max(y, floatBottom) } as Tile;
    if (!fits(placed)) return;
    out.push(placed);
    floatBottom = placed.y + height(placed) + gap;
  };

  const columnWidth = () => (y < floatBottom ? area.w - floatW - gap : area.w);

  // Title + tagline across the page.
  const title: Tile = { ...base, id: newId(), type: 'title', text: a.title, tagline: true, x: area.x, y, w: area.w };
  out.push(title);
  y += height(title) + gap * 0.6;
  floatBottom = y;

  if (a.infobox && (a.infobox.rows.length || a.infobox.image)) {
    const ib = a.infobox;
    const img = ib.image ? imageRef(ib.image) : undefined;
    float({
      ...base,
      id: newId(),
      type: 'infobox',
      heading: ib.heading || a.title,
      image: img?.image,
      imageCaption: ib.image?.caption,
      rows: ib.rows.slice(0, 10),
      x: 0,
      y: 0,
      w: floatW,
    });
  }

  const figures = a.figures.slice(0, MAX_FIGURES);
  const placeFigures = (section: string) => {
    for (const f of figures.filter((x) => (x.section ?? '') === section)) {
      const { image, info } = imageRef(f);
      float({
        ...base,
        id: newId(),
        type: 'image',
        image,
        caption: f.caption,
        frame: true,
        source: { kind: 'wikipedia', lang: a.lang, title: f.file, article: a.title, url: info?.page, license: info?.license, artist: info?.artist },
        x: 0,
        y: 0,
        w: floatW,
      });
    }
  };
  placeFigures('');

  /** Add a text block at the current position; truncate it with "…" if the page ends. */
  const text = (markup: string, scale = 1, kind: 'text' | 'heading' = 'text') => {
    if (full) return;
    const w = columnWidth();
    const t: Tile =
      kind === 'heading'
        ? { ...base, id: newId(), type: 'title', text: markup, tagline: false, scale, x: area.x, y, w }
        : { ...base, id: newId(), type: 'text', markup, scale, x: area.x, y, w };
    if (fits(t)) {
      out.push(t);
      y += height(t) + (kind === 'heading' ? gap * 0.4 : gap * 0.7);
      return;
    }
    full = true;
    if (kind === 'heading') return; // never end the page on a lone heading
    // Largest word count that still fits, ending in "…".
    const words = markup.split(' ');
    let lo = 0;
    let hi = words.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (fits({ ...t, markup: `${words.slice(0, mid).join(' ')} …` } as Tile)) lo = mid;
      else hi = mid - 1;
    }
    if (lo >= 3) out.push({ ...t, markup: `${words.slice(0, lo).join(' ').replace(/[,;:.]$/, '')} …` } as Tile);
  };

  /**
   * A paragraph that starts beside the floats and would run past them is
   * split at a sentence, so the rest uses the full width (like text wrapping
   * around Wikipedia's thumbnails).
   */
  const paragraph = (markup: string) => {
    if (full) return;
    if (y < floatBottom) {
      const narrow = area.w - floatW - gap;
      const sentences = splitSentences(markup, a.lang);
      let i = 0;
      while (i < sentences.length) {
        const part = sentences.slice(0, i + 1).join(' ');
        const h = height({ ...base, id: '', type: 'text', markup: part, x: 0, y: 0, w: narrow } as Tile);
        if (y + h > floatBottom - gap) break;
        i++;
      }
      if (i > 0 && i < sentences.length) {
        text(sentences.slice(0, i).join(' '));
        if (y < floatBottom) y = floatBottom;
        text(sentences.slice(i).join(' '));
        return;
      }
    }
    text(markup);
  };

  let section = '';
  for (const p of a.paragraphs) {
    if (full) break;
    if (p.section !== section) {
      section = p.section;
      placeFigures(section);
      text(section, 0.62, 'heading');
    }
    paragraph(p.markup);
  }
  return out;
}

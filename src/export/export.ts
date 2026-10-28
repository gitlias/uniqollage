import type { Project, Source, Tile } from '../model';
import { compose, compositionToSvg, coverRect, pageBackground, type Composition } from '../render/collage';
import { areaOf, exportPixels, productById, type UploadTargetId } from '../products';

// Exports. Remote images are fetched (Wikimedia serves CORS headers) and
// normalised to PNG/JPEG data URLs so the SVG is self-contained, rasterises
// inside an <img>, and is accepted by jsPDF. They are scaled down to what the
// export needs, which keeps memory low (iOS Safari is strict about canvases).

export function download(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image ${src.slice(0, 80)}`));
    img.src = src;
  });
}

function hasAlpha(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 16) if (data[i] < 250) return true;
  return false;
}

/** Image as a PNG (if it has transparency) or JPEG data URL, at most `maxWidth` px wide. */
async function normalise(src: string, maxWidth: number): Promise<string> {
  const img = await loadImage(src);
  const k = Math.min(1, maxWidth / img.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas available (out of memory?)');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const url = hasAlpha(ctx, canvas.width, canvas.height) ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92);
    if (url.length < 32) throw new Error('Image encoding failed');
    return url;
  } finally {
    // Free the pixels now: iOS limits the total canvas memory of a page.
    canvas.width = canvas.height = 0;
  }
}

/** Print resolution for vector exports. */
const VECTOR_PX_PER_MM = 300 / 25.4;

/**
 * Data URLs for all pictures of the composition, each scaled to the largest
 * size it is drawn at × `pxPerMm`. Converted one after another to keep the
 * peak memory low.
 */
async function inlineImages(c: Composition, pxPerMm = VECTOR_PX_PER_MM): Promise<Map<string, string>> {
  const widest = new Map<string, number>();
  for (const p of c.placed)
    for (const prim of p.prims)
      if (prim.t === 'image') {
        // Cropped pictures are drawn wider than their box.
        const drawn = coverRect(prim.x, prim.y, prim.w, prim.h, prim.aspect).w;
        widest.set(prim.href, Math.max(widest.get(prim.href) ?? 0, drawn));
      }
  const map = new Map<string, string>();
  for (const [src, mm] of widest) {
    try {
      map.set(src, await normalise(src, Math.max(64, Math.ceil(mm * pxPerMm))));
    } catch (e) {
      console.warn(e);
    }
  }
  return map;
}

function baseName(p: Project): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const size = p.sizeId.replace(/[^\w]+/g, '');
  return `uniqollage-${productById(p.productId).id}-${size}${p.landscape && p.productId === 'poster' ? '-landscape' : ''}-${stamp}`;
}

export async function exportSvg(p: Project, lang: 'en' | 'de', bleed = 0): Promise<void> {
  const c = compose(p, lang);
  const svg = compositionToSvg(c, { hrefMap: await inlineImages(c), background: pageBackground(p), bleed });
  download(new Blob([svg], { type: 'image/svg+xml' }), `${baseName(p)}.svg`);
}

/** Nudge pure white (#FFFFFF), which UTme! treats as transparent, to #FEFEFE. */
function protectWhite(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 0 && d[i] === 255 && d[i + 1] === 255 && d[i + 2] === 255) {
      d[i] = d[i + 1] = d[i + 2] = 254;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export async function renderPng(
  p: Project,
  lang: 'en' | 'de',
  px: { w: number; h: number },
  opts: { background?: string; keepWhite?: boolean } = {},
): Promise<Blob> {
  // Browsers refuse (or crash on) very large canvases.
  if (px.w > 16384 || px.h > 16384 || px.w * px.h > 120e6) {
    throw new Error(`${px.w} × ${px.h} px is too large for the browser – use 150 dpi or the PDF export.`);
  }
  const c = compose(p, lang);
  // Pictures only need the export's own resolution (with a little headroom).
  const svg = compositionToSvg(c, { hrefMap: await inlineImages(c, (px.w / c.w) * 1.25), background: opts.background });
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = px.w;
    canvas.height = px.h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, px.w, px.h);
    if (opts.keepWhite) protectWhite(ctx, px.w, px.h);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Export a PNG for an upload target; returns the file size in bytes. */
export async function exportPng(
  p: Project,
  lang: 'en' | 'de',
  target: UploadTargetId,
  opts: { transparent: boolean; keepWhite: boolean },
): Promise<number> {
  const px = exportPixels(areaOf(p), target);
  const background = pageBackground(p) ?? (opts.transparent ? undefined : '#ffffff');
  const blob = await renderPng(p, lang, px, { background, keepWhite: opts.keepWhite });
  download(blob, `${baseName(p)}-${px.w}x${px.h}.png`);
  return blob.size;
}

export async function renderPdf(p: Project, lang: 'en' | 'de', bleed = 0): Promise<Blob> {
  const [{ jsPDF }, { drawComposition }] = await Promise.all([import('jspdf'), import('./pdf')]);
  const c = compose(p, lang);
  const hrefMap = await inlineImages(c);
  const W = c.w + 2 * bleed;
  const H = c.h + 2 * bleed;
  const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: W > H ? 'landscape' : 'portrait', compress: true });
  drawComposition(doc, c, { hrefMap, background: pageBackground(p), bleed });
  return doc.output('blob');
}

export async function exportPdf(p: Project, lang: 'en' | 'de', bleed = 0): Promise<void> {
  download(await renderPdf(p, lang, bleed), `${baseName(p)}.pdf`);
}

export function attributionText(p: Project, lang: 'en' | 'de'): string {
  const lines: string[] = [];
  lines.push(lang === 'de' ? 'Quellen und Lizenzen' : 'Sources and licences');
  lines.push('');
  const seen = new Set<string>();
  // Card images carry their own source next to the article's.
  type Entry = { id: string; type: Tile['type']; source: Source };
  const sources = p.tiles.flatMap((t): Entry[] =>
    t.type === 'card' && t.imageSource ? [t, { id: t.id, type: 'image', source: t.imageSource }] : [t],
  );
  for (const t of sources) {
    const s = t.source;
    const key = `${s.kind}|${s.url ?? s.title ?? t.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (s.kind === 'upload') {
      lines.push(lang === 'de' ? '• Eigenes Bild' : '• Own image');
      continue;
    }
    if (s.kind === 'commons' || (t.type === 'image' && s.license)) {
      lines.push(`• ${s.title ?? 'Image'} — ${s.artist ?? (lang === 'de' ? 'unbekannt' : 'unknown')}, ${s.license ?? '?'}${s.url ? ` — ${s.url}` : ''}`);
      continue;
    }
    lines.push(
      `• ${s.title ?? ''} — ${lang === 'de' ? 'Wikipedia-Autor:innen' : 'Wikipedia contributors'}, CC BY-SA 4.0${s.url ? ` — ${s.url}` : ''}`,
    );
  }
  lines.push('');
  lines.push(
    lang === 'de'
      ? 'Wikipedia-Texte: Creative Commons Namensnennung – Weitergabe unter gleichen Bedingungen 4.0 (https://creativecommons.org/licenses/by-sa/4.0/deed.de). Texte wurden gekürzt.'
      : 'Wikipedia text: Creative Commons Attribution-ShareAlike 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Text has been excerpted.',
  );
  return lines.join('\n');
}

export function exportAttribution(p: Project, lang: 'en' | 'de'): void {
  download(new Blob([attributionText(p, lang)], { type: 'text/plain;charset=utf-8' }), `${baseName(p)}-sources.txt`);
}

export function exportProject(p: Project): void {
  download(new Blob([JSON.stringify(p)], { type: 'application/json' }), `${baseName(p)}.uniqollage.json`);
}

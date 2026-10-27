import { addFallbackFont, isCovered } from './fonts';

// On-demand fonts for every script Wikipedia shows: when text contains
// characters the bundled fonts lack, look them up in the Noto coverage table
// (public/noto-fonts.json, built by scripts/build-font-table.mjs) and load the
// matching Fontsource file – for CJK only the chunk that contains them.

interface Family {
  id: string;
  weight: number;
  subsets: [string, [number, number][]][];
}

const CDN = 'https://cdn.jsdelivr.net/fontsource/fonts';

let table: Promise<Family[]> | null = null;
const loading = new Map<string, Promise<void>>();
/** Code points nothing could be found for (don't retry). */
const unavailable = new Set<number>();

function loadTable(): Promise<Family[]> {
  table ??= fetch(`${import.meta.env?.BASE_URL ?? '/'}noto-fonts.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`noto-fonts.json: HTTP ${r.status}`);
      return r.json();
    })
    .then((j: { families: Family[] }) => j.families)
    .catch((e) => {
      table = null;
      throw e;
    });
  return table;
}

function inRanges(cp: number, ranges: [number, number][]): boolean {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < ranges[mid][0]) hi = mid - 1;
    else if (cp > ranges[mid][1]) lo = mid + 1;
    else return true;
  }
  return false;
}

/** Characters that never need a glyph. */
const IGNORABLE = /[\s\p{Cc}\p{Cf}\u{FE00}-\u{FE0F}\u{E0100}-\u{E01EF}]/u;

/** Code points in `text` that no loaded font covers. */
export function missingCodePoints(text: string): number[] {
  const out = new Set<number>();
  for (const ch of text) {
    if (IGNORABLE.test(ch)) continue;
    const cp = ch.codePointAt(0)!;
    if (!unavailable.has(cp) && !isCovered(cp)) out.add(cp);
  }
  return [...out];
}

/** Load fonts so that all characters in `text` can be drawn. Resolves when done (never rejects). */
export async function ensureFonts(text: string): Promise<void> {
  const missing = missingCodePoints(text);
  if (!missing.length) return;
  let families: Family[];
  try {
    families = await loadTable();
  } catch (e) {
    console.warn('Font table unavailable', e);
    return;
  }
  // Up to three passes: if a loaded file lacks a character after all (some
  // families claim ranges they only partly cover), try the next candidate.
  for (let pass = 0; pass < 3; pass++) {
    const todo = pass === 0 ? missing : missingCodePoints(text);
    if (!todo.length) return;
    const files = new Map<string, string>();
    for (const cp of todo) {
      const candidate = families
        .flatMap((f) => f.subsets.filter(([, r]) => inRanges(cp, r)).map(([subset]) => ({ f, subset })))
        .find(({ f, subset }) => !tried.has(`${f.id}/${subset}`));
      if (!candidate) {
        unavailable.add(cp);
        continue;
      }
      const name = `${candidate.f.id}/${candidate.subset}`;
      files.set(name, `${CDN}/${candidate.f.id}@latest/${candidate.subset}-${candidate.f.weight}-normal.ttf`);
    }
    if (!files.size) return;
    await Promise.all([...files].map(([name, url]) => loadFile(name, url)));
  }
}

/** Files already loaded or attempted. */
const tried = new Set<string>();

function loadFile(name: string, url: string): Promise<void> {
  tried.add(name);
  let p = loading.get(name);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => addFallbackFont(name, buf))
      .catch((e) => {
        console.warn('Font load failed', e);
        loading.delete(name);
        tried.delete(name);
      });
    loading.set(name, p);
  }
  return p;
}

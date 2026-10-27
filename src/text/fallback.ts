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

const CJK_FAMILIES = new Set(['noto-sans-sc', 'noto-sans-tc', 'noto-sans-hk', 'noto-sans-jp', 'noto-sans-kr']);
const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}\u3000-\u303f\uff00-\uffef]/u;

/** "noto-sans-old-italic" → /\p{Script=Old_Italic}/u, or null if not a Unicode script name. */
const scriptRegex = new Map<string, RegExp | null>();
function familyScript(id: string): RegExp | null {
  if (!scriptRegex.has(id)) {
    const name = id
      .replace(/^noto-(sans|serif)-/, '')
      .split('-')
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join('_');
    let re: RegExp | null = null;
    try {
      re = new RegExp(`\\p{Script=${name}}`, 'u');
    } catch {
      re = null;
    }
    scriptRegex.set(id, re);
  }
  return scriptRegex.get(id)!;
}

/**
 * Preference for a font family: one made for the character's script first,
 * then generic Noto Sans, then the rest. The unicode-range lists of the CJK
 * (and some other) families claim far more than their files contain, so CJK
 * fonts only come first for CJK characters.
 */
function rank(id: string, ch: string): number {
  if (CJK_FAMILIES.has(id)) return CJK_CHAR.test(ch) ? 0 : 4;
  if (familyScript(id)?.test(ch)) return 1;
  if (id === 'noto-sans') return 2;
  return 3;
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
      const ch = String.fromCodePoint(cp);
      const candidate = families
        .flatMap((f, order) => f.subsets.filter(([, r]) => inRanges(cp, r)).map(([subset]) => ({ f, subset, order, rank: rank(f.id, ch) })))
        .sort((a, b) => a.rank - b.rank || a.order - b.order)
        // Files still downloading count as candidates (their promise is reused);
        // only finished ones that did not help are skipped.
        .find(({ f, subset }) => !done.has(`${f.id}/${subset}`));
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

/** Files whose download finished (successfully or not). */
const done = new Set<string>();

function loadFile(name: string, url: string): Promise<void> {
  let p = loading.get(name);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => addFallbackFont(name, buf))
      .then(() => {
        done.add(name);
      })
      .catch((e) => {
        console.warn('Font load failed', e);
        done.add(name);
      });
    loading.set(name, p);
  }
  return p;
}

import type { Lang } from '../model';
import { cleanText, escapeText, stripMarkup } from '../text/markup';

// Turns MediaWiki parser HTML into our tile markup and candidate fragments.

const DROP = [
  'style',
  'script',
  'link',
  'sup.reference',
  'sup.noprint',
  '.mw-ref',
  '.reference',
  '.mw-editsection',
  '.noprint',
  '.mw-empty-elt',
  '.mw-cite-backlink',
  '.error',
  '.sortkey',
  'math',
  '.mwe-math-element',
  '.mwe-math-fallback-image-inline',
  '#coordinates',
  '.geo-inline-hidden',
  '.IPA',
  '.rt-commentedText',
  '[style*="display:none"]',
  '[style*="display: none"]',
].join(',');

function isInternalLink(a: Element): boolean {
  const href = a.getAttribute('href') ?? '';
  if (a.classList.contains('external') || a.classList.contains('extiw')) return false;
  if (!href.startsWith('/wiki/') && !href.startsWith('./')) return false;
  // Skip links into other namespaces (File:, Datei:, Help:, …).
  const target = decodeURIComponent(href.replace(/^(\/wiki\/|\.\/)/, ''));
  return !NAMESPACES.test(target);
}

const NAMESPACES =
  /^(File|Datei|Image|Bild|Media|Help|Hilfe|Wikipedia|WP|Category|Kategorie|Template|Vorlage|Portal|Special|Spezial|Talk|Diskussion|User|Benutzer|Benutzerin|H|Module|Modul):/i;

/** Convert an element's content to markup ([[link]], '''bold''', ''italic''). */
export function htmlToMarkup(el: Node): string {
  let out = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) {
      out += escapeText(cleanText(node.textContent ?? ''));
      continue;
    }
    if (node.nodeType !== 1) continue;
    const e = node as Element;
    if (e.matches(DROP)) continue;
    const tag = e.tagName.toLowerCase();
    const inner = htmlToMarkup(e);
    if (!inner) continue;
    if (tag === 'a') out += isInternalLink(e) && inner.trim() ? `[[${inner.replace(/\[\[|\]\]/g, '')}]]` : inner;
    else if (tag === 'b' || tag === 'strong') out += `'''${inner}'''`;
    else if (tag === 'i' || tag === 'em' || tag === 'cite' || tag === 'var') out += `''${inner}''`;
    else if (tag === 'br') out += ' ';
    else out += inner;
  }
  return out;
}

/** Tidy artefacts left behind by removed pronunciations, refs etc. */
export function tidy(markup: string): string {
  return markup
    .replace(/\s+/g, ' ')
    .replace(/\(\s*[;,]\s*/g, '(')
    .replace(/\s*[;,]\s*\)/g, ')')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/''''''/g, '')
    .replace(/(?<!')''''(?!')/g, '')
    .trim();
}

const ABBREV: Record<Lang, string[]> = {
  en: ['mr', 'mrs', 'ms', 'dr', 'st', 'jr', 'sr', 'vs', 'e.g', 'i.e', 'etc', 'no', 'approx', 'ca', 'c', 'gen', 'col', 'lt', 'sgt', 'fr', 'mt', 'ft', 'inc', 'ltd', 'co', 'u.s', 'u.k', 'prof', 'rev', 'jan', 'feb', 'aug', 'sept', 'oct', 'nov', 'dec'],
  de: ['z', 'b', 'bzw', 'ca', 'dr', 'st', 'nr', 'chr', 'v', 'n', 'u', 'a', 'd', 'h', 'usw', 'etc', 'vgl', 'geb', 'gest', 'jh', 'jhd', 'mio', 'mrd', 'prof', 'sog', 'evtl', 'ggf', 'inkl', 'hl', 'bzw', 'abs', 'bd', 'str', 'u.a', 'z.b', 'd.h', 'o.ä', 'v.a', 's'],
};

/** Split markup into sentences, keeping [[links]] intact. */
export function splitSentences(markup: string, lang: Lang): string[] {
  const out: string[] = [];
  let start = 0;
  let inLink = false;
  for (let i = 0; i < markup.length; i++) {
    if (markup.startsWith('[[', i)) {
      inLink = true;
      i++;
      continue;
    }
    if (markup.startsWith(']]', i)) {
      inLink = false;
      i++;
      continue;
    }
    if (inLink || !'.!?'.includes(markup[i])) continue;
    // Absorb closing quotes, brackets and markup after the punctuation.
    let j = i + 1;
    while (j < markup.length && `"'”’»)]`.includes(markup[j])) j++;
    if (j >= markup.length || markup[j] !== ' ') continue;
    // Next sentence must start with an uppercase letter, digit or quote.
    let k = j + 1;
    while (k < markup.length && `'[„“"«(`.includes(markup[k])) k++;
    const next = markup[k] ?? '';
    if (!/[\p{Lu}\d]/u.test(next)) continue;
    if (markup[i] === '.') {
      const before = markup.slice(start, i).replace(/[\[\]']/g, '');
      const word = (before.match(/(\S+)$/)?.[1] ?? '').toLowerCase();
      if (word.length === 1 && /\p{L}/u.test(word)) continue; // initials
      if (ABBREV[lang].includes(word) || ABBREV[lang].includes(word.replace(/^.*\./, ''))) continue;
      if (lang === 'de' && /^\d+$/.test(word)) continue; // German ordinals: "3. Oktober"
    }
    out.push(markup.slice(start, j).trim());
    start = j + 1;
  }
  const rest = markup.slice(start).trim();
  if (rest) out.push(rest);
  return out.filter((s) => s.length > 0);
}

const FUN_WORDS = [
  /\b(first|only|largest|biggest|smallest|oldest|youngest|longest|highest|tallest|fastest|deepest|record|world|unusual|famous|nicknamed|known as|despite|accidentally|banned|invented|named after|secret|mysterious|rare|unique)\b/i,
  /\b(erste[nmrs]?|einzige[nmrs]?|größte[nmrs]?|kleinste[nmrs]?|älteste[nmrs]?|jüngste[nmrs]?|längste[nmrs]?|höchste[nmrs]?|schnellste[nmrs]?|Rekord|Welt\w*|ungewöhnlich\w*|berühmt\w*|Spitzname\w*|obwohl|trotz|versehentlich|verboten|erfand|benannt|geheim\w*|rätselhaft\w*|selten\w*|einzigartig\w*)\b/i,
];

/** Rough "is this a fun fact?" score used to sort sentence candidates. */
export function funScore(markup: string): number {
  const plain = stripMarkup(markup);
  let s = 0;
  if (/\d/.test(plain)) s += 1;
  for (const re of FUN_WORDS) if (re.test(plain)) s += 2;
  if (plain.length < 50 || plain.length > 320) s -= 2;
  if (/[!?]$/.test(plain)) s += 0.5;
  return s;
}

export interface Figure {
  /** File name without namespace, spaces not underscores. */
  file: string;
  /** Section the figure appears in ('' = lead). */
  section?: string;
  thumb: string;
  caption: string;
}

export interface Infobox {
  heading: string;
  image?: Figure;
  rows: [string, string][];
}

export interface Sentence {
  markup: string;
  section: string;
  score: number;
}

export interface Paragraph {
  markup: string;
  /** Section heading ('' for the lead). */
  section: string;
}

export interface ParsedArticle {
  lead: string;
  /** All body paragraphs in order (for the whole-page layout). */
  paragraphs: Paragraph[];
  sentences: Sentence[];
  figures: Figure[];
  infobox?: Infobox;
}

const SKIP_SECTIONS = /^(references|notes|see also|external links|further reading|bibliography|sources|citations|einzelnachweise|anmerkungen|literatur|weblinks|siehe auch|quellen|belege)$/i;
const EXCLUDED_CONTAINERS = 'table, figure, blockquote, .navbox, .reflist, .references, .thumb, .gallery, .hatnote, .infobox, .sidebar, .metadata, .ambox, .mw-collapsible, aside';

export function fileFromHref(href: string): string | null {
  const m = decodeURIComponent(href).match(/(?:\/wiki\/|\.\/)[^:/]+:(.+)$/);
  return m ? m[1].replace(/_/g, ' ') : null;
}

function absolute(src: string): string {
  return src.startsWith('//') ? `https:${src}` : src;
}

function figureFrom(img: HTMLImageElement | null, link: Element | null, caption: string): Figure | null {
  if (!img) return null;
  const w = Number(img.getAttribute('width') ?? 0);
  if (w && w < 80) return null; // icons, flags
  const file = link ? fileFromHref(link.getAttribute('href') ?? '') : null;
  const src = img.getAttribute('src');
  if (!file || !src) return null;
  return { file, thumb: absolute(src), caption };
}

export function parseArticle(html: string, lang: Lang): ParsedArticle {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.querySelector('.mw-parser-output') ?? doc.body;

  // Infobox.
  let infobox: Infobox | undefined;
  const ib = root.querySelector('table.infobox, table.taxobox, table[class*="infobox"], table[class*="Infobox"]');
  if (ib) {
    const headEl = ib.querySelector('caption, .infobox-above, .infobox-title, th[colspan]');
    const imgEl = ib.querySelector('img') as HTMLImageElement | null;
    const imgLink = imgEl?.closest('a') ?? null;
    const capEl = ib.querySelector('.infobox-caption');
    const image = figureFrom(imgEl, imgLink, capEl ? tidy(htmlToMarkup(capEl)) : '') ?? undefined;
    const rows: [string, string][] = [];
    for (const tr of Array.from(ib.querySelectorAll('tr'))) {
      const cells = Array.from(tr.children).filter((c) => c.tagName === 'TH' || c.tagName === 'TD');
      if (cells.length !== 2 || cells[0].querySelector('img')) continue;
      const label = tidy(stripMarkup(htmlToMarkup(cells[0]))).replace(/:$/, '');
      const value = tidy(htmlToMarkup(cells[1]));
      const plain = stripMarkup(value);
      if (!label || !plain || label.length > 40 || plain.length > 140) continue;
      rows.push([label, value]);
      if (rows.length >= 12) break;
    }
    const heading = headEl ? tidy(stripMarkup(htmlToMarkup(headEl))) : '';
    if (rows.length || image) infobox = { heading, image, rows };
  }

  // Figures (modern <figure> and legacy .thumb markup, galleries).
  const figures: Figure[] = [];
  const seen = new Set<string>();
  const addFig = (f: Figure | null) => {
    if (f && !seen.has(f.file)) {
      seen.add(f.file);
      figures.push(f);
    }
  };
  if (infobox?.image) seen.add(infobox.image.file);
  for (const fig of Array.from(root.querySelectorAll('figure[typeof^="mw:File"], figure.mw-default-size, div.thumb'))) {
    if (fig.closest('.infobox, .navbox, .sidebar, .metadata')) continue;
    const img = fig.querySelector('img') as HTMLImageElement | null;
    const link = fig.querySelector('a.mw-file-description, a.image, a[href*=":"]');
    const cap = fig.querySelector('figcaption, .thumbcaption');
    addFig(figureFrom(img, link, cap ? tidy(htmlToMarkup(cap)) : ''));
  }
  for (const box of Array.from(root.querySelectorAll('li.gallerybox'))) {
    const img = box.querySelector('img') as HTMLImageElement | null;
    const link = box.querySelector('a.mw-file-description, a.image, a[href*=":"]');
    const cap = box.querySelector('.gallerytext');
    addFig(figureFrom(img, link, cap ? tidy(htmlToMarkup(cap)) : ''));
  }

  // Paragraphs, in document order, tracking the current section heading.
  const sentences: Sentence[] = [];
  const paragraphs: Paragraph[] = [];
  let section = '';
  let lead = '';
  let skip = false;
  for (const el of Array.from(root.querySelectorAll('h2, h3, p'))) {
    if (el.tagName !== 'P') {
      const name = cleanText(el.textContent ?? '').trim();
      if (el.tagName === 'H2') {
        section = name;
        skip = SKIP_SECTIONS.test(name);
      }
      continue;
    }
    if (skip || el.closest(EXCLUDED_CONTAINERS)) continue;
    const m = tidy(htmlToMarkup(el));
    if (stripMarkup(m).length < 30) continue;
    if (!section && !lead) lead = m;
    paragraphs.push({ markup: m, section });
    for (const s of splitSentences(m, lang)) {
      if (stripMarkup(s).length < 25) continue;
      sentences.push({ markup: s, section, score: funScore(s) });
    }
  }
  // Which section each figure belongs to (document order).
  let current = '';
  const sectionOf = new Map<string, string>();
  for (const el of Array.from(root.querySelectorAll('h2, figure, div.thumb, li.gallerybox'))) {
    if (el.tagName === 'H2') current = cleanText(el.textContent ?? '').trim();
    else {
      const link = el.querySelector('a.mw-file-description, a.image, a[href*=":"]');
      const file = link ? fileFromHref(link.getAttribute('href') ?? '') : null;
      if (file && !sectionOf.has(file)) sectionOf.set(file, current);
    }
  }
  for (const f of figures) f.section = sectionOf.get(f.file) ?? '';
  return { lead, paragraphs, sentences, figures, infobox };
}

/** "Did you know" / "Schon gewusst?" items as markup. */
export function parseDyk(html: string, lang: Lang): { markup: string; article?: string }[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: { markup: string; article?: string }[] = [];
  for (const li of Array.from(doc.querySelectorAll('li'))) {
    if (li.closest('.quotebox, .navbox, .hlist, .plainlinks, .hauptseite-mehr')) continue;
    let m = tidy(htmlToMarkup(li));
    const plain = stripMarkup(m);
    if (plain.length < 40 || !m.includes('[[')) continue;
    if (lang === 'en' && !/^(\.\.\.|…)/.test(plain)) continue;
    m = m.replace(/\s*\((pictured|illustrated|im Bild|abgebildet|Bild)\)/gi, '');
    const bold = li.querySelector('b a, a b, strong a');
    const article = bold ? (bold.closest('a')?.getAttribute('title') ?? undefined) : undefined;
    out.push({ markup: m, article });
  }
  return out;
}

/** Decorate a DYK hook as a standalone tile. */
export function dykTileMarkup(markup: string, lang: Lang): string {
  if (lang === 'en') return `'''Did you know''' ${markup.replace(/^(\.\.\.|…)\s*/, '… ')}`;
  return `'''Schon gewusst?''' ${markup}`;
}

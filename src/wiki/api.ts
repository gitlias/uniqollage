import type { Lang } from '../model';
import { cleanText } from '../text/markup';
import { parseArticle, parseDyk, type Figure, type ParsedArticle } from './parse';

// Thin client for the MediaWiki Action API (CORS via origin=*).

// Wikimedia only serves thumbnails in these widths; other widths are rejected
// (HTTP 400) when hotlinked. https://www.mediawiki.org/wiki/Common_thumbnail_sizes
export const THUMB_WIDTHS = [20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840];
/** Width used for images placed on the collage (print quality). */
const PRINT_WIDTH = 1920;

/**
 * Turn an upload.wikimedia.org thumbnail URL into the original file URL.
 * Used to repair tiles saved with non-standard thumbnail widths.
 */
export function originalFromThumb(url: string): string {
  const m = url.match(/^(https:\/\/upload\.wikimedia\.org\/[^/]+\/[^/]+)\/thumb\/(.+)\/[^/]+$/);
  return m ? `${m[1]}/${m[2]}` : url;
}

/** True for a thumbnail URL whose width Wikimedia no longer serves. */
export function isNonStandardThumb(url: string): boolean {
  const m = url.match(/^https:\/\/upload\.wikimedia\.org\/.+\/thumb\/.+\/(\d+)px-[^/]+$/);
  return !!m && !THUMB_WIDTHS.includes(Number(m[1]));
}

const API_UA = 'Uniqollage/0.1 (https://github.com/gitlias/uniqollage; collage editor)';
type Host = Lang | 'commons';

function hostOf(h: Host): string {
  return h === 'commons' ? 'commons.wikimedia.org' : `${h}.wikipedia.org`;
}

export function articleUrl(lang: Lang, title: string): string {
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

export function commonsFileUrl(file: string): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function api(host: Host, params: Record<string, string | number>): Promise<any> {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', origin: '*' });
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const res = await fetch(`https://${hostOf(host)}/w/api.php?${qs}`, { headers: { 'Api-User-Agent': API_UA } });
  if (!res.ok) throw new Error(`${hostOf(host)}: HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.info ?? json.error.code);
  return json;
}

function htmlToPlain(html: string | undefined): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return cleanText(doc.body.textContent ?? '').trim();
}

export interface SearchHit {
  title: string;
  description?: string;
  thumb?: string;
}

export async function searchArticles(lang: Lang, q: string): Promise<SearchHit[]> {
  const json = await api(lang, {
    action: 'query',
    generator: 'search',
    gsrsearch: q,
    gsrlimit: 12,
    gsrnamespace: 0,
    prop: 'pageimages|description',
    piprop: 'thumbnail',
    pithumbsize: 250,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pages: any[] = json.query?.pages ?? [];
  return pages
    .sort((a, b) => a.index - b.index)
    .map((p) => ({ title: p.title, description: p.description, thumb: p.thumbnail?.source }));
}

export interface ImageInfo {
  url: string;
  width: number;
  height: number;
  license?: string;
  artist?: string;
  description?: string;
  page: string;
}

/** Print-resolution (≤1920px) URLs, sizes and licence data for files. */
export async function imageInfo(host: Host, files: string[], lang: Lang = 'en'): Promise<Map<string, ImageInfo>> {
  const out = new Map<string, ImageInfo>();
  for (let i = 0; i < files.length; i += 50) {
    const batch = files.slice(i, i + 50);
    const json = await api(host, {
      action: 'query',
      titles: batch.map((f) => `File:${f}`).join('|'),
      prop: 'imageinfo',
      iiprop: 'url|size|extmetadata',
      iiurlwidth: PRINT_WIDTH,
      iiextmetadatafilter: 'LicenseShortName|Artist|ImageDescription',
      iiextmetadatalanguage: lang,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (json.query?.pages ?? []) as any[]) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      const meta = ii.extmetadata ?? {};
      const name = String(p.title).replace(/^[^:]+:/, '');
      out.set(name, {
        url: ii.thumburl ?? ii.url,
        width: ii.thumbwidth ?? ii.width,
        height: ii.thumbheight ?? ii.height,
        license: htmlToPlain(meta.LicenseShortName?.value) || undefined,
        artist: htmlToPlain(meta.Artist?.value) || undefined,
        description: htmlToPlain(meta.ImageDescription?.value) || undefined,
        page: ii.descriptionurl ?? commonsFileUrl(name),
      });
    }
  }
  return out;
}

export interface Article extends ParsedArticle {
  lang: Lang;
  title: string;
  url: string;
  /** Wikidata short description, e.g. "Siedlung in Russland". */
  description?: string;
  images: Map<string, ImageInfo>;
}

export async function loadArticle(lang: Lang, title: string): Promise<Article> {
  const json = await api(lang, {
    action: 'parse',
    page: title,
    prop: 'text|displaytitle',
    redirects: 1,
    disableeditsection: 1,
    disabletoc: 1,
  });
  const realTitle: string = json.parse.title;
  const parsed = parseArticle(json.parse.text, lang);
  let description: string | undefined;
  try {
    const d = await api(lang, { action: 'query', titles: realTitle, prop: 'description' });
    description = d.query?.pages?.[0]?.description;
  } catch {
    // Optional.
  }
  const files = [...parsed.figures, ...(parsed.infobox?.image ? [parsed.infobox.image] : [])].map((f: Figure) => f.file);
  let images = new Map<string, ImageInfo>();
  if (files.length) {
    try {
      images = await imageInfo(lang, files, lang);
    } catch {
      // Fall back to the inline thumbnails below.
    }
  }
  return { ...parsed, lang, title: realTitle, url: articleUrl(lang, realTitle), images, description };
}

/** Parse only the lead section (sentences, lead figures, infobox) – much smaller than the full page. */
export async function loadLead(lang: Lang, title: string): Promise<ParsedArticle & { title: string }> {
  const json = await api(lang, { action: 'parse', page: title, prop: 'text', section: 0, redirects: 1, disableeditsection: 1 });
  return { ...parseArticle(json.parse.text, lang), title: json.parse.title ?? title };
}

export interface RandomArticle {
  title: string;
  extract: string;
  description?: string;
  thumb?: string;
  /** Thumbnail aspect ratio (w/h). */
  aspect?: number;
  /** File name of the article's lead image. */
  pageImage?: string;
}

export async function randomArticles(lang: Lang, n = 5): Promise<RandomArticle[]> {
  const json = await api(lang, {
    action: 'query',
    generator: 'random',
    grnnamespace: 0,
    grnlimit: n,
    prop: 'extracts|pageimages|description',
    exintro: 1,
    explaintext: 1,
    exsentences: 3,
    exlimit: n,
    piprop: 'thumbnail|name',
    pithumbsize: 500,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((json.query?.pages ?? []) as any[]).map((p) => ({
    title: p.title,
    extract: cleanText(p.extract ?? '').trim(),
    description: p.description,
    thumb: p.thumbnail?.source,
    aspect: p.thumbnail?.width && p.thumbnail?.height ? p.thumbnail.width / p.thumbnail.height : undefined,
    pageImage: p.pageimage,
  }));
}

/** Category names starting with `q` (without the "Category:" prefix). */
export async function searchCategories(lang: Lang, q: string): Promise<string[]> {
  const json = await api(lang, { action: 'query', list: 'prefixsearch', pssearch: q, psnamespace: 14, pslimit: 10 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((json.query?.prefixsearch ?? []) as any[]).map((p) => String(p.title).replace(/^[^:]+:/, ''));
}

async function categoryMembers(lang: Lang, category: string, type: 'page' | 'subcat'): Promise<string[]> {
  const titles: string[] = [];
  let cont: string | undefined;
  do {
    const json = await api(lang, {
      action: 'query',
      list: 'categorymembers',
      cmtitle: `Category:${category}`,
      cmtype: type,
      cmnamespace: type === 'page' ? 0 : 14,
      cmlimit: 500,
      ...(cont ? { cmcontinue: cont } : {}),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const m of (json.query?.categorymembers ?? []) as any[]) titles.push(String(m.title));
    cont = json.continue?.cmcontinue;
  } while (cont && titles.length < 1500);
  return titles;
}

/**
 * Article titles in a category, plus those of up to `maxSub` of its
 * subcategories when the category itself is small.
 */
export async function categoryArticles(lang: Lang, category: string, want = 100, maxSub = 8): Promise<string[]> {
  const name = category.replace(/^(Category|Kategorie):/i, '').trim();
  const pages = new Set(await categoryMembers(lang, name, 'page'));
  if (pages.size < want) {
    const subs = (await categoryMembers(lang, name, 'subcat')).slice(0, maxSub);
    const lists = await Promise.all(subs.map((s) => categoryMembers(lang, s.replace(/^[^:]+:/, ''), 'page').catch(() => [] as string[])));
    for (const l of lists) for (const t of l) pages.add(t);
  }
  return [...pages];
}

/** Summaries (extract, picture, description) for up to 20 titles – same shape as random articles. */
export async function articleSummaries(lang: Lang, titles: string[]): Promise<RandomArticle[]> {
  if (!titles.length) return [];
  const json = await api(lang, {
    action: 'query',
    titles: titles.slice(0, 20).join('|'),
    prop: 'extracts|pageimages|description',
    exintro: 1,
    explaintext: 1,
    exsentences: 3,
    exlimit: 20,
    piprop: 'thumbnail|name',
    pithumbsize: 500,
    redirects: 1,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((json.query?.pages ?? []) as any[])
    .filter((p) => !p.missing)
    .map((p) => ({
      title: p.title,
      extract: cleanText(p.extract ?? '').trim(),
      description: p.description,
      thumb: p.thumbnail?.source,
      aspect: p.thumbnail?.width && p.thumbnail?.height ? p.thumbnail.width / p.thumbnail.height : undefined,
      pageImage: p.pageimage,
    }));
}

const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function dykPage(lang: Lang, archive?: { year: number; month: number }): string {
  if (lang === 'en') return archive ? `Wikipedia:Recent additions/${archive.year}/${EN_MONTHS[archive.month - 1]}` : 'Template:Did you know';
  return archive
    ? `Wikipedia:Hauptseite/Schon gewusst/Archiv/${archive.year}/${String(archive.month).padStart(2, '0')}`
    : 'Wikipedia:Hauptseite/Schon gewusst';
}

export async function didYouKnow(lang: Lang, archive?: { year: number; month: number }) {
  const page = dykPage(lang, archive);
  const json = await api(lang, { action: 'parse', page, prop: 'text', disableeditsection: 1 });
  return { page, items: parseDyk(json.parse.text, lang) };
}

export interface CommonsHit {
  file: string;
  thumb: string;
  width: number;
  height: number;
  description: string;
  license?: string;
  artist?: string;
  page: string;
}

export async function searchCommons(q: string, lang: Lang): Promise<CommonsHit[]> {
  const json = await api('commons', {
    action: 'query',
    generator: 'search',
    gsrsearch: `${q} filetype:bitmap`,
    gsrnamespace: 6,
    gsrlimit: 24,
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: 330,
    iiextmetadatafilter: 'LicenseShortName|Artist|ImageDescription',
    iiextmetadatalanguage: lang,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pages: any[] = json.query?.pages ?? [];
  return pages
    .sort((a, b) => a.index - b.index)
    .filter((p) => p.imageinfo?.[0])
    .map((p) => {
      const ii = p.imageinfo[0];
      const meta = ii.extmetadata ?? {};
      const file = String(p.title).replace(/^[^:]+:/, '');
      return {
        file,
        thumb: ii.thumburl ?? ii.url,
        width: ii.width,
        height: ii.height,
        description: htmlToPlain(meta.ImageDescription?.value).slice(0, 400),
        license: htmlToPlain(meta.LicenseShortName?.value) || undefined,
        artist: htmlToPlain(meta.Artist?.value) || undefined,
        page: ii.descriptionurl ?? commonsFileUrl(file),
      };
    });
}

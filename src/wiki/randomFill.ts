import type { Lang, ReserveItem, Source, TileDraft } from '../model';
import { articleSummaries, articleUrl, categoryArticles, didYouKnow, imageInfo, loadLead, randomArticles, type ImageInfo, type RandomArticle } from './api';
import { cardDraft } from './cards';
import { measureAspect } from '../components/common';
import { dykTileMarkup, type Figure, type ParsedArticle } from './parse';
import { escapeText, stripMarkup } from '../text/markup';

// "Fill randomly": fetch random Wikipedia content of the chosen types.
// Requests are batched (random articles 20 at a time, licence data 50 at a
// time) and lead sections are parsed with limited concurrency to stay polite
// towards the Wikimedia APIs.

export type FillType = 'fact' | 'dyk' | 'card' | 'title' | 'image' | 'infobox';
export const FILL_TYPES: FillType[] = ['fact', 'dyk', 'card', 'title', 'image', 'infobox'];

/** Relative frequency of each type when several are selected. */
const WEIGHT: Record<FillType, number> = { fact: 4, dyk: 3, card: 2, title: 2, image: 3, infobox: 1 };

export interface FillOptions {
  types: FillType[];
  count: number;
  langs: Lang[];
  /**
   * Only use articles from this Wikipedia category (and some of its
   * subcategories). Categories are per language, so the first of `langs`
   * is used; "Did you know" hooks can't be filtered and are skipped.
   */
  category?: string;
  /** Called with the number of tiles found so far. */
  onProgress?: (done: number) => void;
  rand?: () => number;
}

/** Thrown when a category has no articles (or does not exist). */
export class EmptyCategoryError extends Error {}

export interface FillResult {
  drafts: TileDraft[];
  /** Further good sentences from the articles that were read (filler material for the neat layout). */
  reserve: ReserveItem[];
  /** Per type, how many could not be found. */
  missing: Partial<Record<FillType, number>>;
}

/** Split `count` over the selected types by weight (each selected type gets at least one if possible). */
export function allocate(types: FillType[], count: number, rand: () => number = Math.random): Record<FillType, number> {
  const need = Object.fromEntries(FILL_TYPES.map((t) => [t, 0])) as Record<FillType, number>;
  const list = types.length ? types : (['fact'] as FillType[]);
  for (const t of list.slice(0, count)) need[t]++;
  const total = list.reduce((s, t) => s + WEIGHT[t], 0);
  for (let i = list.length; i < count; i++) {
    let r = rand() * total;
    const t = list.find((x) => (r -= WEIGHT[x]) < 0) ?? list[list.length - 1];
    need[t]++;
  }
  return need;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function pick<T>(items: T[], rand: () => number): T {
  return items[Math.floor(rand() * items.length)];
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomMonth(lang: Lang, rand: () => number): { year: number; month: number } {
  const now = new Date();
  const first = lang === 'en' ? 2011 : 2005;
  const year = first + Math.floor(rand() * (now.getFullYear() - first));
  return { year, month: 1 + Math.floor(rand() * 12) };
}

async function imageDraft(fig: Figure, info: ImageInfo | undefined, article: { lang: Lang; title: string }): Promise<TileDraft> {
  const caption = fig.caption || `[[${escapeText(article.title)}]]`;
  const source: Source = { kind: 'wikipedia', lang: article.lang, title: fig.file, url: info?.page, license: info?.license, artist: info?.artist };
  return {
    type: 'image',
    image: { src: info?.url ?? fig.thumb, aspect: info ? info.width / info.height : await measureAspect(fig.thumb) },
    caption,
    frame: true,
    source,
  };
}

export async function randomFill(opts: FillOptions): Promise<FillResult> {
  const rand = opts.rand ?? Math.random;
  const category = opts.category?.trim();
  const langs = opts.langs.length ? (category ? [opts.langs[0]] : opts.langs) : (['en'] as Lang[]);
  const types = category ? opts.types.filter((t) => t !== 'dyk') : opts.types;
  const need = allocate(types.length ? types : ['fact'], opts.count, rand);
  // Articles of the chosen category, in random order (taken 20 at a time).
  const pool = category ? shuffle(await categoryArticles(langs[0], category, opts.count * 3), rand) : null;
  if (pool && !pool.length) throw new EmptyCategoryError(category);
  const drafts: TileDraft[] = [];
  const reserve: ReserveItem[] = [];
  const push = (d: TileDraft) => {
    drafts.push(d);
    opts.onProgress?.(drafts.length);
  };

  // "Did you know" hooks: current pages first, then random archive months.
  if (need.dyk) {
    const pool: { markup: string; article?: string; lang: Lang }[] = [];
    const seen = new Set<string>();
    for (let attempt = 0; attempt < 4 && pool.length < need.dyk * 2; attempt++) {
      const lang = attempt < langs.length ? langs[attempt] : pick(langs, rand);
      try {
        const r = await didYouKnow(lang, attempt < langs.length ? undefined : randomMonth(lang, rand));
        for (const it of r.items) {
          if (seen.has(it.markup)) continue;
          seen.add(it.markup);
          pool.push({ ...it, lang });
        }
      } catch {
        // Archive month may not exist; try another.
      }
    }
    for (const it of shuffle(pool, rand).slice(0, need.dyk)) {
      push({
        type: 'text',
        markup: dykTileMarkup(it.markup, it.lang),
        source: { kind: 'dyk', lang: it.lang, title: it.article, url: it.article ? articleUrl(it.lang, it.article) : undefined },
      });
      need.dyk--;
    }
  }

  // Everything else comes from random articles.
  const used = new Set<string>();
  for (let round = 0; round < (pool ? 30 : 10) && (need.fact || need.image || need.infobox || need.card || need.title); round++) {
    const lang = pick(langs, rand);
    let batch: RandomArticle[];
    try {
      if (pool && !pool.length) break;
      const fetched = pool ? await articleSummaries(lang, pool.splice(0, 20)) : await randomArticles(lang, 20);
      batch = fetched.filter((a) => !used.has(`${lang}:${a.title}`));
    } catch {
      continue;
    }
    const rest: RandomArticle[] = [];
    for (const a of batch) {
      used.add(`${lang}:${a.title}`);
      if (need.card && a.thumb && a.extract) {
        const text = escapeText(a.extract);
        const i = text.indexOf(a.title);
        const markup = i >= 0 ? `${text.slice(0, i)}'''${a.title}'''${text.slice(i + a.title.length)}` : text;
        push(await cardDraft({ lang, title: a.title, description: a.description, markup, image: { file: a.pageImage, thumb: a.thumb, aspect: a.aspect } }));
        need.card--;
      } else if (need.title && !need.fact && !need.image && !need.infobox) {
        push({ type: 'title', text: a.title, tagline: rand() < 0.3, source: { kind: 'wikipedia', lang, title: a.title, url: articleUrl(lang, a.title) } });
        need.title--;
      } else rest.push(a);
    }

    // Parse lead sections only as many as still needed (infoboxes are rarer).
    const wanted = need.fact + need.image + need.infobox * 3;
    const leads = (
      await mapLimit(rest.slice(0, Math.min(20, wanted)), 4, (a) => loadLead(lang, a.title).catch(() => null as (ParsedArticle & { title: string }) | null))
    ).filter((x): x is ParsedArticle & { title: string } => !!x);

    // Licence data for all candidate pictures in one request.
    const figs = leads.map((l) => l.infobox?.image ?? l.figures[0]).filter((f): f is Figure => !!f);
    const infos = figs.length ? await imageInfo(lang, figs.map((f) => f.file), lang).catch(() => new Map<string, ImageInfo>()) : new Map<string, ImageInfo>();

    for (const lead of leads) {
      const source: Source = { kind: 'wikipedia', lang, title: lead.title, url: articleUrl(lang, lead.title) };
      for (const s of lead.sentences) {
        const n = stripMarkup(s.markup).length;
        if (n >= 40 && n <= 260) reserve.push({ markup: s.markup, source });
      }
      const fig = lead.infobox?.image ?? lead.figures[0];
      const facts = lead.sentences.filter((s) => stripMarkup(s.markup).length >= 40).sort((a, b) => b.score - a.score);
      if (need.infobox && lead.infobox && lead.infobox.rows.length >= 2) {
        const ib = lead.infobox;
        const info = ib.image ? infos.get(ib.image.file) : undefined;
        push({
          type: 'infobox',
          heading: ib.heading || lead.title,
          image: ib.image ? { src: info?.url ?? ib.image.thumb, aspect: info ? info.width / info.height : await measureAspect(ib.image.thumb) } : undefined,
          imageCaption: ib.image?.caption,
          rows: ib.rows.slice(0, 6),
          source,
        });
        need.infobox--;
      } else if (need.image && fig) {
        push(await imageDraft(fig, infos.get(fig.file), { lang, title: lead.title }));
        need.image--;
      } else if (need.fact && facts.length) {
        push({ type: 'text', markup: pick(facts.slice(0, 2), rand).markup, source });
        need.fact--;
      } else if (need.title) {
        push({ type: 'title', text: lead.title, tagline: rand() < 0.3, source });
        need.title--;
      }
    }
    // Leftover articles from this batch can still become titles.
    for (const a of rest.slice(Math.min(20, wanted))) {
      if (!need.title) break;
      push({ type: 'title', text: a.title, tagline: rand() < 0.3, source: { kind: 'wikipedia', lang, title: a.title, url: articleUrl(lang, a.title) } });
      need.title--;
    }
  }

  const missing: FillResult['missing'] = {};
  for (const t of FILL_TYPES) if (need[t] > 0) missing[t] = need[t];
  const taken = new Set(drafts.map((d) => (d.type === 'text' ? d.markup : '')));
  return { drafts: shuffle(drafts, rand), missing, reserve: reserve.filter((r) => !taken.has(r.markup)) };
}

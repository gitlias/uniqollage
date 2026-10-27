import { useEffect, useState } from 'react';
import type { Lang, Source, TileDraft } from '../model';
import { useStore } from '../store';
import { useUi } from '../ui';
import { useT } from '../i18n';
import { loadArticle, searchArticles, type Article, type SearchHit } from '../wiki/api';
import type { Figure } from '../wiki/parse';
import { AddButton, LangToggle, Markup, Status, measureAspect } from './common';
import { cardDraft } from '../wiki/cards';
import { placeWholePage } from './wholePage';

export function ArticleTab() {
  const t = useT();
  const uiLang = useStore((s) => s.uiLang);
  const openRequest = useUi((s) => s.openRequest);
  const searchRequest = useUi((s) => s.searchRequest);
  const [lang, setLang] = useState<Lang>(uiLang);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setLoading(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const open = async (l: Lang, title: string) => {
    const a = await run(() => loadArticle(l, title));
    if (a) setArticle(a);
  };

  useEffect(() => {
    if (openRequest) {
      setLang(openRequest.lang);
      void open(openRequest.lang, openRequest.title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest?.nonce]);

  const search = async (l: Lang, query: string) => {
    if (!query.trim()) return;
    setArticle(null);
    const r = await run(() => searchArticles(l, query.trim()));
    if (r) setHits(r);
  };

  useEffect(() => {
    if (searchRequest) {
      setQ(searchRequest.q);
      void search(lang, searchRequest.q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchRequest?.nonce]);

  if (article) return <ArticleView article={article} onBack={() => setArticle(null)} loading={loading} />;

  return (
    <div className="tab">
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void search(lang, q);
        }}
      >
        <LangToggle value={lang} onChange={setLang} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPlaceholder')} />
        <button type="submit">{t('search')}</button>
      </form>
      <Status loading={loading} error={error} />
      <ul className="hits">
        {hits.map((h) => (
          <li key={h.title} onClick={() => open(lang, h.title)}>
            {h.thumb ? <img src={h.thumb} alt="" /> : <div className="noimg">W</div>}
            <div>
              <div className="hit-title">{h.title}</div>
              {h.description && <div className="muted small">{h.description}</div>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ArticleView({ article: a, onBack, loading }: { article: Article; onBack: () => void; loading: boolean }) {
  const t = useT();
  const storeAdd = useStore((s) => s.addTiles);
  // Taking something from an article also keeps its best sentences as filler material.
  const addTiles = (drafts: Parameters<typeof storeAdd>[0]) => {
    useStore.getState().addReserve(
      [...a.sentences]
        .sort((x, y) => y.score - x.score)
        .slice(0, 20)
        .map((s) => ({ markup: s.markup, source: { kind: 'wikipedia' as const, lang: a.lang, title: a.title, url: a.url } })),
    );
    return storeAdd(drafts);
  };
  const source: Source = { kind: 'wikipedia', lang: a.lang, title: a.title, url: a.url };
  const sentences = [...a.sentences].sort((x, y) => y.score - x.score);

  const imageDraft = async (f: Figure): Promise<TileDraft> => {
    const info = a.images.get(f.file);
    const src = info?.url ?? f.thumb;
    const aspect = info ? info.width / info.height : await measureAspect(src);
    return {
      type: 'image',
      image: { src, aspect },
      caption: f.caption,
      frame: true,
      source: { kind: 'wikipedia', lang: a.lang, title: f.file, article: a.title, url: info?.page, license: info?.license, artist: info?.artist },
    };
  };

  return (
    <div className="tab">
      <div className="row">
        <button onClick={onBack}>← {t('back')}</button>
        <a className="muted small ellipsis" href={a.url} target="_blank" rel="noreferrer">
          {a.lang}.wikipedia.org
        </a>
      </div>
      {loading && <p className="muted">{t('loading')}</p>}
      <div className="card">
        <div className="wiki-title">{a.title}</div>
        {a.description && <div className="muted small">{a.description}</div>}
        <div className="row">
          <AddButton label={t('addTitle')} onAdd={() => addTiles([{ type: 'title', text: a.title, tagline: false, source }])} />
          <AddButton label={`${t('addTitle')} + tagline`} onAdd={() => addTiles([{ type: 'title', text: a.title, tagline: true, source }])} />
          <button className="add-like" title={t('wholePageHint')} onClick={() => placeWholePage(a, t('confirmReplace'))}>
            ▤ {t('wholePage')}
          </button>
          <span title={t('addCardHint')}>
            <AddButton
              label={t('addCard')}
              onAdd={async () => {
                const lead = a.sentences.filter((s) => !s.section).slice(0, 3);
                const fig = a.infobox?.image ?? a.figures[0];
                addTiles([
                  await cardDraft({
                    lang: a.lang,
                    title: a.title,
                    description: a.description,
                    markup: lead.length ? lead.map((s) => s.markup).join(' ') : a.lead,
                    image: fig ? { file: fig.file, thumb: fig.thumb } : undefined,
                  }),
                ]);
              }}
            />
          </span>
        </div>
      </div>

      {a.lead && (
        <div className="card">
          <div className="label">{t('lead')}</div>
          <p className="wiki-text">
            <Markup src={a.lead} />
          </p>
          <AddButton onAdd={() => addTiles([{ type: 'text', markup: a.lead, source }])} />
        </div>
      )}

      {a.infobox && (
        <div className="card">
          <div className="label">{t('infobox')}</div>
          <div className="mini-infobox">
            <div className="ib-head">{a.infobox.heading || a.title}</div>
            {a.infobox.image && <img src={a.infobox.image.thumb} alt="" />}
            <table>
              <tbody>
                {a.infobox.rows.map(([l, v], i) => (
                  <tr key={i}>
                    <th>{l}</th>
                    <td>
                      <Markup src={v} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AddButton
            onAdd={async () => {
              const ib = a.infobox!;
              let image;
              if (ib.image) {
                const d = (await imageDraft(ib.image)) as Extract<TileDraft, { type: 'image' }>;
                image = d.image;
              }
              addTiles([
                { type: 'infobox', heading: ib.heading || a.title, image, imageCaption: ib.image?.caption, rows: ib.rows.slice(0, 8), source },
              ]);
            }}
          />
        </div>
      )}

      {a.figures.length > 0 && (
        <>
          <div className="label">{t('images')}</div>
          <div className="grid">
            {a.figures.map((f) => (
              <div key={f.file} className="figure">
                <img src={f.thumb} alt="" loading="lazy" />
                {f.caption && (
                  <div className="small cap">
                    <Markup src={f.caption} />
                  </div>
                )}
                <AddButton onAdd={async () => addTiles([await imageDraft(f)])} />
              </div>
            ))}
          </div>
        </>
      )}

      <div className="row spread">
        <div className="label">
          {t('sentences')} <span className="muted small">{t('funFirst')}</span>
        </div>
        <AddButton
          label={t('addAll')}
          onAdd={() => addTiles(sentences.slice(0, 5).map((s) => ({ type: 'text' as const, markup: s.markup, source })))}
        />
      </div>
      <ul className="sentences">
        {sentences.map((s, i) => (
          <li key={i}>
            <div className="wiki-text">
              {s.score >= 2 && <span className="star">★ </span>}
              <Markup src={s.markup} />
              {s.section && <span className="muted small"> — {s.section}</span>}
            </div>
            <AddButton onAdd={() => addTiles([{ type: 'text', markup: s.markup, source }])} />
          </li>
        ))}
      </ul>
    </div>
  );
}

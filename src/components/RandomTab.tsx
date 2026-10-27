import { useEffect, useState } from 'react';
import type { Lang } from '../model';
import { useStore } from '../store';
import { useUi } from '../ui';
import { useT } from '../i18n';
import { articleUrl, loadArticle, randomArticles, type RandomArticle } from '../wiki/api';
import { escapeText } from '../text/markup';
import { AddButton, LangToggle, Status } from './common';
import { cardDraft } from '../wiki/cards';
import { placeWholePage } from './wholePage';

/** Extract with the first occurrence of the title in bold, as in a Wikipedia lead. */
function leadMarkup(a: RandomArticle): string {
  const text = escapeText(a.extract);
  const i = text.indexOf(a.title);
  return i >= 0 ? `${text.slice(0, i)}'''${a.title}'''${text.slice(i + a.title.length)}` : text;
}

export function RandomTab() {
  const t = useT();
  const uiLang = useStore((s) => s.uiLang);
  const addTiles = useStore((s) => s.addTiles);
  const openArticle = useUi((s) => s.openArticle);
  const [lang, setLang] = useState<Lang>(uiLang);
  const [items, setItems] = useState<RandomArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const more = async (l: Lang) => {
    setLoading(true);
    setError(null);
    try {
      const r = await randomArticles(l, 6);
      setItems(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void more(lang);
  }, [lang]);

  return (
    <div className="tab">
      <div className="row">
        <LangToggle value={lang} onChange={setLang} />
        <button onClick={() => more(lang)}>🎲 {t('nextRandom')}</button>
      </div>
      <Status loading={loading} error={error} />
      {items.map((a) => (
        <div className="card random" key={a.title}>
          {a.thumb && <img src={a.thumb} alt="" />}
          <div className="wiki-title small-title">{a.title}</div>
          {a.description && <div className="muted small">{a.description}</div>}
          <p className="wiki-text">{a.extract}</p>
          <div className="row">
            <button onClick={() => openArticle(lang, a.title)}>{t('open')} →</button>
            <AddButton
              onAdd={async () =>
                addTiles([
                  await cardDraft({
                    lang,
                    title: a.title,
                    description: a.description,
                    markup: leadMarkup(a),
                    image: a.thumb ? { file: a.pageImage, thumb: a.thumb, aspect: a.aspect } : undefined,
                  }),
                ])
              }
            />
            <AddButton
              label={t('textOnly')}
              onAdd={() => addTiles([{ type: 'text', markup: leadMarkup(a), source: { kind: 'wikipedia', lang, title: a.title, url: articleUrl(lang, a.title) } }])}
            />
            <button
              className="add-like"
              title={t('wholePageHint')}
              onClick={async () => {
                try {
                  placeWholePage(await loadArticle(lang, a.title), t('confirmReplace'));
                } catch (e) {
                  alert(`${t('error')}: ${(e as Error).message}`);
                }
              }}
            >
              ▤ {t('wholePage')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

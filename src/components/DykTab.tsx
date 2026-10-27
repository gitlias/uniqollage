import { useEffect, useState } from 'react';
import type { Lang } from '../model';
import { useStore } from '../store';
import { useT } from '../i18n';
import { articleUrl, didYouKnow } from '../wiki/api';
import { dykTileMarkup } from '../wiki/parse';
import { AddButton, LangToggle, Markup, Status } from './common';

function lastMonth(): { year: number; month: number } {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function DykTab() {
  const t = useT();
  const uiLang = useStore((s) => s.uiLang);
  const addTiles = useStore((s) => s.addTiles);
  const [lang, setLang] = useState<Lang>(uiLang);
  const [archive, setArchive] = useState<{ year: number; month: number } | null>(null);
  const [items, setItems] = useState<{ markup: string; article?: string }[]>([]);
  const [page, setPage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (l: Lang, a: { year: number; month: number } | null) => {
    setLoading(true);
    setError(null);
    setItems([]);
    try {
      const r = await didYouKnow(l, a ?? undefined);
      setItems(r.items);
      setPage(r.page);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(lang, archive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, archive?.year, archive?.month]);

  const randomMonth = () => {
    const last = lastMonth();
    const first = lang === 'en' ? 2011 : 2005;
    const year = first + Math.floor(Math.random() * (last.year - first + 1));
    const month = year === last.year ? 1 + Math.floor(Math.random() * last.month) : 1 + Math.floor(Math.random() * 12);
    setArchive({ year, month });
  };

  return (
    <div className="tab">
      <div className="row">
        <LangToggle value={lang} onChange={setLang} />
        <div className="seg">
          <button className={!archive ? 'on' : ''} onClick={() => setArchive(null)}>
            {t('current')}
          </button>
          <button className={archive ? 'on' : ''} onClick={() => setArchive(archive ?? lastMonth())}>
            {t('archive')}
          </button>
        </div>
      </div>
      {archive && (
        <div className="row">
          <input
            type="month"
            value={`${archive.year}-${String(archive.month).padStart(2, '0')}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-').map(Number);
              if (y && m) setArchive({ year: y, month: m });
            }}
          />
          <button onClick={randomMonth}>🎲 {t('randomMonth')}</button>
        </div>
      )}
      <div className="muted small ellipsis">{page}</div>
      <Status loading={loading} error={error} />
      <ul className="sentences">
        {items.map((it, i) => (
          <li key={i}>
            <div className="wiki-text">
              <Markup src={it.markup} />
            </div>
            <AddButton
              onAdd={() =>
                addTiles([
                  {
                    type: 'text',
                    markup: dykTileMarkup(it.markup, lang),
                    source: { kind: 'dyk', lang, title: it.article ?? page, url: articleUrl(lang, it.article ?? page) },
                  },
                ])
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

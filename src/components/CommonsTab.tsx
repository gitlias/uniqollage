import { useState } from 'react';
import type { Lang } from '../model';
import { useStore } from '../store';
import { useT } from '../i18n';
import { imageInfo, searchCommons, type CommonsHit } from '../wiki/api';
import { escapeText } from '../text/markup';
import { AddButton, LangToggle, Status } from './common';

/** First sentence (or ~200 chars) of a Commons description, for a caption. */
function shortCaption(s: string): string {
  const first = s.match(/^.{20,220}?[.!?](\s|$)/)?.[0] ?? s.slice(0, 200);
  return first.trim();
}

export function CommonsTab() {
  const t = useT();
  const uiLang = useStore((s) => s.uiLang);
  const addTiles = useStore((s) => s.addTiles);
  const [lang, setLang] = useState<Lang>(uiLang);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<CommonsHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (h: CommonsHit) => {
    const info = (await imageInfo('commons', [h.file], lang)).get(h.file);
    addTiles([
      {
        type: 'image',
        image: { src: info?.url ?? h.thumb, aspect: h.width / h.height },
        caption: escapeText(shortCaption(h.description)),
        frame: true,
        source: { kind: 'commons', title: h.file, url: h.page, license: h.license, artist: h.artist },
      },
    ]);
  };

  return (
    <div className="tab">
      <form
        className="row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!q.trim()) return;
          setLoading(true);
          setError(null);
          try {
            setHits(await searchCommons(q.trim(), lang));
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setLoading(false);
          }
        }}
      >
        <LangToggle value={lang} onChange={setLang} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('commonsPlaceholder')} />
        <button type="submit">{t('search')}</button>
      </form>
      <Status loading={loading} error={error} />
      <div className="grid">
        {hits.map((h) => (
          <div key={h.file} className="figure">
            <img src={h.thumb} alt="" loading="lazy" />
            <div className="small cap">{shortCaption(h.description) || h.file}</div>
            <div className="muted tiny">
              {h.license}
              {h.artist ? ` · ${h.artist.slice(0, 40)}` : ''}
            </div>
            <AddButton onAdd={() => add(h)} />
          </div>
        ))}
      </div>
    </div>
  );
}

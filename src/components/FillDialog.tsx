import { useEffect, useState } from 'react';
import type { Lang } from '../model';
import { useStore } from '../store';
import { useUi } from '../ui';
import { useT } from '../i18n';
import { EmptyCategoryError, FILL_TYPES, randomFill, type FillType } from '../wiki/randomFill';
import { searchCategories } from '../wiki/api';

export function FillDialog() {
  const t = useT();
  const uiLang = useStore((s) => s.uiLang);
  const hasTiles = useStore((s) => s.project.tiles.length > 0);
  const close = () => useUi.getState().setFillOpen(false);
  const [types, setTypes] = useState<Set<FillType>>(() => new Set(['fact', 'dyk', 'card', 'image', 'title']));
  const [count, setCount] = useState(25);
  const [langs, setLangs] = useState<Set<Lang>>(() => new Set([uiLang]));
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  // Categories are per language: with a category, only the first chosen language is used.
  const catLang: Lang = langs.has(uiLang) ? uiLang : ([...langs][0] ?? uiLang);

  useEffect(() => {
    const q = category.trim();
    if (q.length < 2) return setSuggestions([]);
    const timer = setTimeout(() => {
      searchCategories(catLang, q)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [category, catLang]);

  const toggle = <T,>(set: Set<T>, v: T, update: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    update(next);
  };

  const go = async () => {
    setBusy(0);
    setError(null);
    setMissing(null);
    try {
      const cat = category.trim();
      const res = await randomFill({ types: [...types], count, langs: cat ? [catLang] : [...langs], category: cat || undefined, onProgress: setBusy });
      useStore.getState().addReserve(res.reserve);
      if (res.drafts.length) useStore.getState().fill(res.drafts, replace || !hasTiles);
      const miss = Object.entries(res.missing).map(([k, n]) => `${t(`fill_${k as FillType}`)} (${n})`);
      if (miss.length) setMissing(`${t('fillMissing')}: ${miss.join(', ')}`);
      else close();
    } catch (e) {
      setError(e instanceof EmptyCategoryError ? t('categoryEmpty') : (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="modal-back" onClick={() => busy === null && close()}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('fillTitle')}>
        <h2>{t('fillTitle')}</h2>
        <section>
          <h3>{t('fillTypes')}</h3>
          <div className="fill-types">
            {FILL_TYPES.map((ft) => (
              <label key={ft} className="check">
                <input
                  type="checkbox"
                  checked={types.has(ft) && !(ft === 'dyk' && category.trim())}
                  disabled={ft === 'dyk' && !!category.trim()}
                  onChange={() => toggle(types, ft, setTypes)}
                />{' '}
                {t(`fill_${ft}`)}
              </label>
            ))}
          </div>
        </section>
        <section>
          <label>
            {t('fillCount')}: <strong>{count}</strong>
            <input type="range" min={5} max={50} step={1} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </label>
        </section>
        <section>
          <label>
            {t('category')} <span className="muted small">({t('optional')})</span>
            <input list="fill-categories" value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t('categoryPlaceholder')} />
          </label>
          <datalist id="fill-categories">
            {suggestions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {category.trim() && (
            <p className="muted small">
              {t('categoryHint')} ({catLang === 'de' ? 'de.wikipedia.org' : 'en.wikipedia.org'})
            </p>
          )}
        </section>
        <section className="row wrap">
          <span>{t('fillLangs')}:</span>
          {(['en', 'de'] as Lang[]).map((l) => (
            <label key={l} className="check">
              <input type="checkbox" checked={langs.has(l)} onChange={() => toggle(langs, l, setLangs)} /> {l === 'en' ? 'English' : 'Deutsch'}
            </label>
          ))}
        </section>
        {hasTiles && (
          <section className="row wrap">
            <label className="check">
              <input type="radio" name="fill-mode" checked={replace} onChange={() => setReplace(true)} /> {t('fillReplace')}
            </label>
            <label className="check">
              <input type="radio" name="fill-mode" checked={!replace} onChange={() => setReplace(false)} /> {t('fillAdd')}
            </label>
          </section>
        )}
        {!types.size && <p className="msg warning">{t('fillNoType')}</p>}
        {missing && <p className="msg warning">{missing}</p>}
        {error && (
          <p className="msg warning">
            {t('error')}: {error}
          </p>
        )}
        <div className="row end">
          {busy !== null && (
            <span className="muted small">
              {t('fillProgress')} {busy}/{count}
            </span>
          )}
          <button onClick={close} disabled={busy !== null}>
            {t('close')}
          </button>
          <button className="primary" disabled={busy !== null || !types.size || !langs.size} onClick={go}>
            {t('fillGo')}
          </button>
        </div>
      </div>
    </div>
  );
}

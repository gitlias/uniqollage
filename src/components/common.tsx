import { useState } from 'react';
import type { Lang } from '../model';
import { parseMarkup } from '../text/markup';
import { useT } from '../i18n';

/** Inline preview of tile markup in Wikipedia style. */
export function Markup({ src }: { src: string }) {
  return (
    <>
      {parseMarkup(src).map((r, i) => {
        const cls = [r.link && 'wl', r.bold && 'wb', r.italic && 'wi'].filter(Boolean).join(' ');
        return (
          <span key={i} className={cls || undefined}>
            {r.text}
          </span>
        );
      })}
    </>
  );
}

export function LangToggle({ value, onChange }: { value: Lang; onChange: (l: Lang) => void }) {
  return (
    <div className="seg" role="group">
      {(['en', 'de'] as Lang[]).map((l) => (
        <button key={l} className={value === l ? 'on' : ''} onClick={() => onChange(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

/** "Add" button that briefly confirms. */
export function AddButton({ onAdd, label }: { onAdd: () => void | Promise<void>; label?: string }) {
  const t = useT();
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  return (
    <button
      className="add"
      disabled={state === 'busy'}
      onClick={async (e) => {
        e.stopPropagation();
        setState('busy');
        try {
          await onAdd();
          setState('done');
          setTimeout(() => setState('idle'), 1200);
        } catch (err) {
          console.error(err);
          setState('idle');
          alert(`${t('error')}: ${(err as Error).message}`);
        }
      }}
    >
      {state === 'done' ? `✓ ${t('added')}` : state === 'busy' ? '…' : `+ ${label ?? t('add')}`}
    </button>
  );
}

export function Status({ loading, error }: { loading: boolean; error: string | null }) {
  const t = useT();
  if (loading) return <p className="muted">{t('loading')}</p>;
  if (error)
    return (
      <p className="error">
        {t('error')}: {error}
      </p>
    );
  return null;
}

/** Natural aspect ratio (w/h) of an image URL. */
export function measureAspect(src: string): Promise<number> {
  return new Promise((resolve) => {
    // Don't wait forever for a slow or broken image.
    setTimeout(() => resolve(1.33), 8000);
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth / img.naturalHeight || 1);
    img.onerror = () => resolve(1.33);
    img.src = src;
  });
}

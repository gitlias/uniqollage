import type { Tile, ImageStyle } from '../model';
import { useStore } from '../store';
import { useT } from '../i18n';
import { stripMarkup } from '../text/markup';

const ICON: Record<Tile['type'], string> = { title: 'H', text: '¶', image: '▣', infobox: '▤' };

function label(t: Tile): string {
  switch (t.type) {
    case 'title':
      return t.text;
    case 'text':
      return stripMarkup(t.markup);
    case 'image':
      return stripMarkup(t.caption) || t.source.title || 'Image';
    case 'infobox':
      return t.heading;
  }
}

export function Inspector() {
  const t = useT();
  const tiles = useStore((s) => s.project.tiles);
  const selected = useStore((s) => s.selected);
  const s = useStore.getState();
  const tile = tiles.find((x) => x.id === selected);

  // Text fields: one undo step per focus session rather than per keystroke.
  const textProps = {
    onFocus: () => s.checkpoint(),
  };
  const set = (patch: Partial<Tile>) => s.patchTile(tile!.id, patch, false);

  return (
    <aside className="inspector vector-menu">
      <div className="menu-heading">{t('tools')}</div>
      <h3>{t('inspector')}</h3>
      {!tile && <p className="muted small">{t('nothingSelected')}</p>}
      {tile && (
        <div className="fields">
          {tile.type === 'title' && (
            <>
              <label>
                {t('heading')}
                <input value={tile.text} {...textProps} onChange={(e) => set({ text: e.target.value })} />
              </label>
              <label className="check">
                <input type="checkbox" checked={tile.tagline} onChange={(e) => s.patchTile(tile.id, { tagline: e.target.checked })} /> {t('tagline')}
              </label>
            </>
          )}
          {tile.type === 'text' && (
            <label>
              {t('text')}
              <textarea rows={7} value={tile.markup} {...textProps} onChange={(e) => set({ markup: e.target.value })} />
            </label>
          )}
          {tile.type === 'image' && (
            <>
              <label>
                {t('caption')}
                <textarea rows={4} value={tile.caption} placeholder={t('captionPlaceholder')} {...textProps} onChange={(e) => set({ caption: e.target.value })} />
              </label>
              <label>
                {t('imageStyle')}
                <select
                  value={tile.imageStyle ?? (tile.frame === false ? 'plain' : 'auto')}
                  onChange={(e) => {
                    const v = e.target.value as ImageStyle | 'auto';
                    s.patchTile(tile.id, { imageStyle: v === 'auto' ? undefined : v, frame: v !== 'plain' });
                  }}
                >
                  {(['auto', 'classic', 'modern', 'mobile', 'plain'] as const).map((v) => (
                    <option key={v} value={v}>
                      {t(`imageStyle_${v}`)}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {tile.type === 'infobox' && (
            <>
              <label>
                {t('heading')}
                <input value={tile.heading} {...textProps} onChange={(e) => set({ heading: e.target.value })} />
              </label>
              {tile.image && (
                <label>
                  {t('caption')}
                  <input value={tile.imageCaption ?? ''} {...textProps} onChange={(e) => set({ imageCaption: e.target.value })} />
                </label>
              )}
              <label>
                {t('rows')}
                <textarea
                  rows={7}
                  defaultValue={tile.rows.map(([l, v]) => `${l} | ${v}`).join('\n')}
                  key={tile.id}
                  {...textProps}
                  onChange={(e) =>
                    set({
                      rows: e.target.value
                        .split('\n')
                        .filter((l) => l.trim())
                        .map((l) => {
                          const [a, ...b] = l.split('|');
                          return [a.trim(), b.join('|').trim()] as [string, string];
                        }),
                    })
                  }
                />
              </label>
            </>
          )}
          <label>
            {t('scale')} <span className="muted">{tile.scale.toFixed(2)}×</span>
            <input type="range" min={0.5} max={3} step={0.05} value={tile.scale} {...textProps} onChange={(e) => set({ scale: Number(e.target.value) })} />
          </label>
          <div className="row">
            <label>
              {t('width')} (mm)
              <input type="number" min={8} step={1} value={Math.round(tile.w)} {...textProps} onChange={(e) => set({ w: Math.max(8, Number(e.target.value)) })} />
            </label>
            <label>
              {t('rotation')} (°)
              <input type="number" min={-180} max={180} step={1} value={tile.rot} {...textProps} onChange={(e) => set({ rot: Number(e.target.value) })} />
            </label>
          </div>
          <div className="row wrap">
            <button onClick={() => s.restack(tile.id, 'front')}>{t('toFront')}</button>
            <button onClick={() => s.restack(tile.id, 'back')}>{t('toBack')}</button>
            <button onClick={() => s.duplicateTile(tile.id)}>{t('duplicate')}</button>
            <button className="danger" onClick={() => s.removeTile(tile.id)}>
              {t('delete')}
            </button>
          </div>
          {tile.source.url && (
            <div className="muted small">
              {t('source')}:{' '}
              <a href={tile.source.url} target="_blank" rel="noreferrer">
                {tile.source.title ?? tile.source.url}
              </a>
              {tile.source.license && ` · ${tile.source.license}`}
              {tile.source.artist && ` · ${tile.source.artist}`}
            </div>
          )}
        </div>
      )}

      <h3>
        {t('tiles')} <span className="muted">({tiles.length})</span>
      </h3>
      <p className={`small ${tiles.length < 20 ? 'muted' : 'ok'}`}>{t('tileCountHint')}</p>
      <ul className="tile-list">
        {[...tiles].reverse().map((x) => (
          <li key={x.id} className={x.id === selected ? 'on' : ''} onClick={() => s.select(x.id)}>
            <span className="ico">{ICON[x.type]}</span>
            <span className="ellipsis">{label(x)}</span>
            <button
              className="x"
              onClick={(e) => {
                e.stopPropagation();
                s.removeTile(x.id);
              }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

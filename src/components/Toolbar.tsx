import { normalize, useStore, updateAndRelayout } from '../store';
import { useT } from '../i18n';
import { useUi } from '../ui';
import { offerIn, productById, productsIn } from '../products';
import { SettingsPanel } from './SettingsPanel';

export function Toolbar() {
  const t = useT();
  const p = useStore((s) => s.project);
  const uiLang = useStore((s) => s.uiLang);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const settingsOpen = useUi((u) => u.settingsOpen);
  const s = useStore.getState();
  const product = productById(p.productId);
  const offer = offerIn(product, p.region);
  const size = offer.sizes.find((x) => x.id === p.sizeId);

  return (
    <div className="toolbar">
      <div className="group">
        <label>
          {t('product')}
          <select
            value={product.id}
            onChange={(e) => {
              const next = productById(e.target.value);
              updateAndRelayout((x) => {
                // Posters usually want a white border, garments usually don't.
                const toPoster = next.shape === 'poster' && product.shape !== 'poster';
                const fromPoster = next.shape !== 'poster' && product.shape === 'poster';
                const margins = toPoster && !x.margins ? 15 : fromPoster && x.margins === 15 ? 0 : x.margins;
                return normalize({ ...x, productId: next.id, sizeId: next.defaultSize, margins });
              });
            }}
          >
            {productsIn(p.region).map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.name[uiLang]}
                {offerIn(pr, p.region).price ? ` · ${offerIn(pr, p.region).price}` : ''}
              </option>
            ))}
          </select>
        </label>
        {offer.sizes.length > 1 && (
          <label title={size?.estimated ? t('estimated') : undefined}>
            {t('size')}
            <select value={p.sizeId} onChange={(e) => updateAndRelayout((x) => ({ ...x, sizeId: e.target.value }))}>
              {offer.sizes.map((sz) => (
                <option key={sz.id} value={sz.id}>
                  {sz.id} · {sz.estimated ? '≈ ' : ''}
                  {sz.w / 10}×{sz.h / 10} cm
                </option>
              ))}
            </select>
            {size?.estimated && <span className="estimated">≈</span>}
          </label>
        )}
        {offer.sizes.length === 1 && product.id !== 'custom' && (
          <span className="muted small">
            {offer.sizes[0].w / 10}×{offer.sizes[0].h / 10} cm
          </span>
        )}
      </div>
      <div className="group">
        <button onClick={() => useUi.getState().setFillOpen(true)}>🎲 {t('fillRandom')}</button>
        <button className="primary" disabled={!p.tiles.length} onClick={() => s.arrange(true)}>
          {t('shuffle')}
        </button>
        <button disabled={!p.tiles.length} onClick={() => s.arrange(false)}>
          {t('arrange')}
        </button>
      </div>
      <div className="group">
        <button disabled={!canUndo} onClick={s.undo} title={`${t('undo')} (Ctrl+Z)`} aria-label={t('undo')}>
          ↶
        </button>
        <button disabled={!canRedo} onClick={s.redo} title={`${t('redo')} (Ctrl+Shift+Z)`} aria-label={t('redo')}>
          ↷
        </button>
      </div>
      <div className="group settings-anchor">
        <button
          className={`settings-toggle ${settingsOpen ? 'on' : ''}`}
          aria-expanded={settingsOpen}
          onClick={() => useUi.getState().setSettingsOpen(!settingsOpen)}
        >
          ⚙ {t('settings')}
        </button>
        {settingsOpen && <SettingsPanel />}
      </div>
    </div>
  );
}

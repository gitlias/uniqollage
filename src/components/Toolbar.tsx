import { normalize, useStore, updateAndRelayout } from '../store';
import type { Skin } from '../model';

const SKINS: Skin[] = ['vector2010', 'vector2022', 'monobook', 'minerva'];
import { useT } from '../i18n';
import { useUi } from '../ui';
import { garmentColor, offerIn, productById, productsIn, REGIONS, type Region } from '../products';

export function Toolbar() {
  const t = useT();
  const p = useStore((s) => s.project);
  const uiLang = useStore((s) => s.uiLang);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const autoLayout = useStore((s) => s.autoLayout);
  const snap = useUi((u) => u.snap);
  const s = useStore.getState();
  const product = productById(p.productId);
  const offer = offerIn(product, p.region);
  const size = offer.sizes.find((x) => x.id === p.sizeId);

  const setSize = (baseSize: number) => {
    if (autoLayout) updateAndRelayout((x) => ({ ...x, baseSize, autoSize: false }));
    else s.update((x) => ({ ...x, baseSize, autoSize: false }));
  };

  return (
    <div className="toolbar">
      <div className="group">
        <label>
          {t('region')}
          <select value={p.region} onChange={(e) => updateAndRelayout((x) => normalize({ ...x, region: e.target.value as Region }))}>
            {REGIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name[uiLang]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('product')}
          <select
            value={product.id}
            onChange={(e) => {
              const next = productById(e.target.value);
              updateAndRelayout((x) => normalize({ ...x, productId: next.id, sizeId: next.defaultSize }));
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
        {product.shape === 'poster' && (
          <>
            <div className="seg" role="group" aria-label={t('orientation')}>
              <button className={!p.landscape ? 'on' : ''} onClick={() => updateAndRelayout((x) => ({ ...x, landscape: false }))}>
                {t('portrait')}
              </button>
              <button className={p.landscape ? 'on' : ''} onClick={() => updateAndRelayout((x) => ({ ...x, landscape: true }))}>
                {t('landscape')}
              </button>
            </div>
            <label>
              {t('margin')}
              <input
                type="number"
                min={0}
                max={100}
                value={p.margin ?? 0}
                onChange={(e) => updateAndRelayout((x) => ({ ...x, margin: Math.min(100, Math.max(0, Number(e.target.value))) }))}
              />
            </label>
          </>
        )}
        {p.productId === 'custom' && (
          <>
            <label>
              {t('width')}
              <input
                type="number"
                min={30}
                max={1000}
                value={p.customArea.w}
                onChange={(e) => updateAndRelayout((x) => ({ ...x, customArea: { ...x.customArea, w: Math.max(30, Number(e.target.value)) } }))}
              />
            </label>
            <label>
              {t('height')}
              <input
                type="number"
                min={30}
                max={1000}
                value={p.customArea.h}
                onChange={(e) => updateAndRelayout((x) => ({ ...x, customArea: { ...x.customArea, h: Math.max(30, Number(e.target.value)) } }))}
              />
            </label>
          </>
        )}
      </div>
      <div className="group">
        <button onClick={() => useUi.getState().setFillOpen(true)}>🎲 {t('fillRandom')}</button>
        <button className="primary" disabled={!p.tiles.length} onClick={() => s.arrange(true)} title="Shuffle">
          {t('shuffle')}
        </button>
        <button disabled={!p.tiles.length} onClick={() => s.arrange(false)}>
          {t('arrange')}
        </button>
      </div>
      <div className="group">
        <label>
          {t('textSize')}
          <input type="range" min={0.8} max={10} step={0.05} value={p.baseSize} onChange={(e) => setSize(Number(e.target.value))} />
          <span className="muted small">{(p.baseSize / 0.3528).toFixed(1)} pt</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={p.autoSize} onChange={(e) => updateAndRelayout((x) => ({ ...x, autoSize: e.target.checked }))} /> {t('autoSize')}
        </label>
        <label className="check">
          <input type="checkbox" checked={p.credit} onChange={(e) => updateAndRelayout((x) => ({ ...x, credit: e.target.checked }))} /> {t('credit')}
        </label>
      </div>
      <div className="group">
        <button disabled={!canUndo} onClick={s.undo} title="Ctrl+Z">
          ↶
        </button>
        <button disabled={!canRedo} onClick={s.redo} title="Ctrl+Shift+Z">
          ↷
        </button>
        <label className="check" title={t('snapHint')}>
          <input type="checkbox" checked={snap} onChange={() => useUi.getState().toggleSnap()} /> {t('snap')}
        </label>
      </div>
      <div className="group">
        {offer.colors.length > 1 && <span className="muted">{t('garment')}</span>}
        <div className="swatches">
          {(offer.colors.length > 1 ? offer.colors : []).map((id) => {
            const g = garmentColor(id);
            return (
              <button
                key={id}
                className={`swatch ${p.garment === id ? 'on' : ''}`}
                style={{ background: g.hex }}
                title={g.name[uiLang]}
                onClick={() => s.update((x) => ({ ...x, garment: id, theme: g.dark ? 'dark' : 'light' }))}
              />
            );
          })}
        </div>
        <label title={t('skinHint')}>
          {t('skin')}
          <select value={p.skin ?? 'vector2010'} onChange={(e) => updateAndRelayout((x) => ({ ...x, skin: e.target.value as Skin }))}>
            {SKINS.map((k) => (
              <option key={k} value={k}>
                {t(`skin_${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="check" title={t('nightModeHint')}>
          <input type="checkbox" checked={p.theme === 'dark'} onChange={(e) => s.update((x) => ({ ...x, theme: e.target.checked ? 'dark' : 'light' }))} />{' '}
          {t('nightMode')}
        </label>
      </div>
    </div>
  );
}

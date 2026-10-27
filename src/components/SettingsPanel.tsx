import { useEffect, useRef } from 'react';
import { normalize, useStore, updateAndRelayout } from '../store';
import { useUi } from '../ui';
import { useT } from '../i18n';
import type { Skin } from '../model';
import { areaOf, garmentColor, offerIn, productById, productsIn, REGIONS, type Region } from '../products';
import { autoGap } from '../layout/pack';

const SKINS: Skin[] = ['vector2010', 'vector2022', 'monobook', 'minerva'];

/** Project / canvas settings, opened from the toolbar's ⚙ button. */
export function SettingsPanel() {
  const t = useT();
  const p = useStore((s) => s.project);
  const uiLang = useStore((s) => s.uiLang);
  const autoLayout = useStore((s) => s.autoLayout);
  const snap = useUi((u) => u.snap);
  const close = () => useUi.getState().setSettingsOpen(false);
  const ref = useRef<HTMLDivElement>(null);
  const s = useStore.getState();
  const product = productById(p.productId);
  const offer = offerIn(product, p.region);
  const size = offer.sizes.find((x) => x.id === p.sizeId);
  const area = areaOf(p);
  const maxMargin = Math.floor(Math.min(area.w, area.h) / 4);
  const gap = p.gap ?? autoGap(p.baseSize);

  // Close on Escape or a click outside (but not on the ⚙ button, which toggles).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement;
      if (!ref.current?.contains(el) && !el.closest('.settings-toggle')) close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, []);

  /** Text size: re-run the layout only if it is automatic (keeps manual placements). */
  const layout = (fn: Parameters<typeof updateAndRelayout>[0]) => (autoLayout ? updateAndRelayout(fn) : s.update(fn));

  return (
    <div className="settings-panel" ref={ref} role="dialog" aria-label={t('settings')}>
      <section>
        <h4>{t('settingsProduct')}</h4>
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
        {offer.colors.length > 1 && (
          <div className="field">
            <span>{t('garment')}</span>
            <div className="swatches">
              {offer.colors.map((id) => {
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
          </div>
        )}
        {product.shape === 'poster' && (
          <div className="field">
            <span>{t('orientation')}</span>
            <div className="seg" role="group">
              <button className={!p.landscape ? 'on' : ''} onClick={() => updateAndRelayout((x) => ({ ...x, landscape: false }))}>
                {t('portrait')}
              </button>
              <button className={p.landscape ? 'on' : ''} onClick={() => updateAndRelayout((x) => ({ ...x, landscape: true }))}>
                {t('landscape')}
              </button>
            </div>
          </div>
        )}
        {product.id === 'custom' && (
          <div className="row">
            <label>
              {t('width')} (mm)
              <input
                type="number"
                min={30}
                max={1000}
                value={p.customArea.w}
                onChange={(e) => updateAndRelayout((x) => ({ ...x, customArea: { ...x.customArea, w: Math.max(30, Number(e.target.value)) } }))}
              />
            </label>
            <label>
              {t('height')} (mm)
              <input
                type="number"
                min={30}
                max={1000}
                value={p.customArea.h}
                onChange={(e) => updateAndRelayout((x) => ({ ...x, customArea: { ...x.customArea, h: Math.max(30, Number(e.target.value)) } }))}
              />
            </label>
          </div>
        )}
      </section>

      <section>
        <h4>{t('settingsLayout')}</h4>
        <label>
          <span className="row spread">
            {t('textSize')}
            <span className="muted small">{(p.baseSize / 0.3528).toFixed(1)} pt</span>
          </span>
          <input type="range" min={0.8} max={10} step={0.05} value={p.baseSize} onChange={(e) => layout((x) => ({ ...x, baseSize: Number(e.target.value), autoSize: false }))} />
        </label>
        <label className="check">
          <input type="checkbox" checked={p.autoSize} onChange={(e) => updateAndRelayout((x) => ({ ...x, autoSize: e.target.checked }))} /> {t('autoSize')}
        </label>
        <label title={t('gapHint')}>
          <span className="row spread">
            {t('gap')}
            <span className="muted small">{p.gap === undefined ? `${t('auto')} · ` : ''}{gap.toFixed(1)} mm</span>
          </span>
          <input type="range" min={0} max={20} step={0.5} value={gap} onChange={(e) => updateAndRelayout((x) => ({ ...x, gap: Number(e.target.value) }))} />
        </label>
        <label className="check">
          <input type="checkbox" checked={p.gap === undefined} onChange={(e) => updateAndRelayout((x) => ({ ...x, gap: e.target.checked ? undefined : gap }))} /> {t('gapAuto')}
        </label>
        <label title={t('marginHint')}>
          <span className="row spread">
            {t('margin')}
            <span className="muted small">{p.margins ?? 0} mm</span>
          </span>
          <input type="range" min={0} max={maxMargin} step={1} value={p.margins ?? 0} onChange={(e) => updateAndRelayout((x) => ({ ...x, margins: Number(e.target.value) }))} />
        </label>
        <label className="check">
          <input type="checkbox" checked={p.credit} onChange={(e) => updateAndRelayout((x) => ({ ...x, credit: e.target.checked }))} /> {t('credit')}
        </label>
      </section>

      <section>
        <h4>{t('settingsLook')}</h4>
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
          <input type="checkbox" checked={p.theme === 'dark'} onChange={(e) => s.update((x) => ({ ...x, theme: e.target.checked ? 'dark' : 'light' }))} /> {t('nightMode')}
        </label>
      </section>

      <section>
        <h4>{t('settingsEditor')}</h4>
        <label className="check" title={t('snapHint')}>
          <input type="checkbox" checked={snap} onChange={() => useUi.getState().toggleSnap()} /> {t('snap')}
        </label>
        <p className="muted small">{t('snapHint')}</p>
      </section>
    </div>
  );
}

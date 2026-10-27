import { useStore, updateAndRelayout } from '../store';
import { useUi } from '../ui';
import { useT } from '../i18n';
import { GARMENT_COLORS, PRODUCTS } from '../products';

export function Toolbar() {
  const t = useT();
  const p = useStore((s) => s.project);
  const uiLang = useStore((s) => s.uiLang);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const autoLayout = useStore((s) => s.autoLayout);
  const view = useUi((s) => s.view);
  const s = useStore.getState();

  const setSize = (baseSize: number) => {
    if (autoLayout) updateAndRelayout((x) => ({ ...x, baseSize, autoSize: false }));
    else s.update((x) => ({ ...x, baseSize, autoSize: false }));
  };

  return (
    <div className="toolbar">
      <div className="group">
        <label>
          {t('product')}
          <select value={p.productId} onChange={(e) => updateAndRelayout((x) => ({ ...x, productId: e.target.value }))}>
            {PRODUCTS.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.name[uiLang]}
                {pr.id !== 'custom' ? ` · ${pr.w / 10}×${pr.h / 10} cm` : ''}
              </option>
            ))}
          </select>
        </label>
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
      </div>
      {view === 'mockup' && (
        <div className="group">
          <span className="muted">{t('garment')}</span>
          <div className="swatches">
            {GARMENT_COLORS.map((g) => (
              <button
                key={g.id}
                className={`swatch ${p.garment === g.id ? 'on' : ''}`}
                style={{ background: g.hex }}
                title={g.name[uiLang]}
                onClick={() => s.update((x) => ({ ...x, garment: g.id }), false)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

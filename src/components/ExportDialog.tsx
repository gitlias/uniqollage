import { useState } from 'react';
import { useStore } from '../store';
import { useUi } from '../ui';
import { useT } from '../i18n';
import { exportAttribution, exportPdf, exportPng, exportSvg, pngSize } from '../export/export';
import { printArea, productById } from '../products';

export function ExportDialog() {
  const t = useT();
  const p = useStore((s) => s.project);
  const uiLang = useStore((s) => s.uiLang);
  const close = () => useUi.getState().setExportOpen(false);
  const [dpi, setDpi] = useState(300);
  const [transparent, setTransparent] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const area = printArea(p.productId, p.customArea);
  const px = pngSize(p, dpi);

  const run = async (name: string, fn: () => Promise<void> | void) => {
    setBusy(name);
    try {
      await fn();
    } catch (e) {
      alert(`${t('error')}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="modal-back" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('exportTitle')}>
        <h2>{t('exportTitle')}</h2>
        <p className="muted small">
          {productById(p.productId).name[uiLang]} · {area.w} × {area.h} mm
        </p>
        <section>
          <h3>{t('exportPng')}</h3>
          <p className="muted small">{t('exportPngHint')}</p>
          <div className="row">
            <label>
              {t('dpi')}
              <select value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
                {[150, 200, 300].map((d) => (
                  <option key={d} value={d}>
                    {d} dpi
                  </option>
                ))}
              </select>
            </label>
            <span className="muted small">
              {px.w} × {px.h} {t('pixels')}
            </span>
            <label className="check">
              <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> {t('transparent')}
            </label>
          </div>
          <button className="primary" disabled={!!busy} onClick={() => run('png', () => exportPng(p, uiLang, dpi, transparent))}>
            {busy === 'png' ? t('exporting') : '⬇ PNG'}
          </button>
        </section>
        <section className="row wrap">
          <button disabled={!!busy} onClick={() => run('svg', () => exportSvg(p, uiLang))}>
            {busy === 'svg' ? t('exporting') : `⬇ ${t('exportSvg')}`}
          </button>
          <button disabled={!!busy} onClick={() => run('pdf', () => exportPdf(p, uiLang))}>
            {busy === 'pdf' ? t('exporting') : `⬇ ${t('exportPdf')}`}
          </button>
          <button disabled={!!busy} onClick={() => run('txt', () => exportAttribution(p, uiLang))}>
            ⬇ {t('exportCredits')}
          </button>
        </section>
        <p className="muted small">{t('areaNote')}</p>
        <p className="muted small">{t('licenseNote')}</p>
        <div className="row end">
          <button onClick={close}>{t('close')}</button>
        </div>
      </div>
    </div>
  );
}

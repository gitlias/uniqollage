import { useState } from 'react';
import { useStore } from '../store';
import { useUi } from '../ui';
import { useT } from '../i18n';
import { exportAttribution, exportPdf, exportPng, exportSvg } from '../export/export';
import { exportPixels, garmentColor, printArea, productById, sizeOf, UPLOAD_TARGETS, type UploadTargetId } from '../products';

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function ExportDialog() {
  const t = useT();
  const p = useStore((s) => s.project);
  const uiLang = useStore((s) => s.uiLang);
  const close = () => useUi.getState().setExportOpen(false);
  // German stores do not document upload limits; the stricter international
  // limit (2048×2048 px, 2 MB) is safe everywhere.
  const [target, setTarget] = useState<UploadTargetId>(p.region === 'jp' ? 'utme-jp' : 'utme-intl');
  const [transparent, setTransparent] = useState(true);
  const [keepWhite, setKeepWhite] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastSize, setLastSize] = useState<number | null>(null);
  const product = productById(p.productId);
  const size = sizeOf(p.productId, p.sizeId);
  const area = printArea(p.productId, p.customArea, p.sizeId);
  const px = exportPixels(area, target);
  const limit = UPLOAD_TARGETS.find((x) => x.id === target)!.maxBytes;
  const garment = garmentColor(p.garment);

  const run = async (name: string, fn: () => Promise<unknown> | unknown) => {
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
          {product.name[uiLang]}
          {product.id !== 'custom' && product.sizes.length > 1 ? ` ${size.id}` : ''} · {t('width')} {area.w} × {t('height')} {area.h} mm
          {product.id !== 'custom' ? ` · ${size.top} mm ${uiLang === 'de' ? 'unter Kragen/Oberkante' : 'below collar/top edge'}` : ''}
        </p>
        {size.estimated && <p className="msg warning">{t('estimated')}</p>}
        {garment.dark && p.theme === 'light' && <p className="msg warning">{t('darkOnDark')}</p>}
        {!garment.dark && p.theme === 'dark' && <p className="msg warning">{t('lightOnLight')}</p>}
        <section>
          <h3>{t('exportPng')}</h3>
          <p className="muted small">{t('exportPngHint')}</p>
          <label>
            {t('target')}
            <select value={target} onChange={(e) => setTarget(e.target.value as UploadTargetId)}>
              {UPLOAD_TARGETS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name[uiLang]}
                </option>
              ))}
            </select>
          </label>
          <div className="row wrap">
            <span className="muted small">
              {px.w} × {px.h} {t('pixels')} · {px.dpi} dpi
            </span>
            <label className="check">
              <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> {t('transparent')}
            </label>
            <label className="check" title={t('protectWhiteHint')}>
              <input type="checkbox" checked={keepWhite} onChange={(e) => setKeepWhite(e.target.checked)} /> {t('protectWhite')}
            </label>
          </div>
          <div className="row">
            <button
              className="primary"
              disabled={!!busy}
              onClick={() =>
                run('png', async () => {
                  setLastSize(await exportPng(p, uiLang, target, { transparent, keepWhite }));
                })
              }
            >
              {busy === 'png' ? t('exporting') : '⬇ PNG'}
            </button>
            {lastSize !== null && (
              <span className={`small ${lastSize > limit ? 'error' : 'ok'}`}>
                {t('fileSize')}: {mb(lastSize)}
                {lastSize > limit ? ` – ${t('tooBig')}` : ' ✓'}
              </span>
            )}
          </div>
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
        <p className="muted small">
          {t('protectWhiteHint')} {t('whiteOnWhite')}
        </p>
        <p className="muted small">{t('licenseNote')}</p>
        <div className="row end">
          <button onClick={close}>{t('close')}</button>
        </div>
      </div>
    </div>
  );
}

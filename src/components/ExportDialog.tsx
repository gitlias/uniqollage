import { useState } from 'react';
import { useStore } from '../store';
import { useUi } from '../ui';
import { useT } from '../i18n';
import { exportAttribution, exportPdf, exportPng, exportSvg } from '../export/export';
import { areaOf, exportPixels, garmentColor, isPoster, productById, sizeOf, UPLOAD_TARGETS, type UploadTargetId } from '../products';

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
  const poster = isPoster(p.productId);
  const [target, setTarget] = useState<UploadTargetId>(poster ? 'print-300' : p.region === 'jp' ? 'utme-jp' : 'utme-intl');
  const [bleed, setBleed] = useState(true);
  const bleedMm = poster && bleed ? 3 : 0;
  const [transparent, setTransparent] = useState(true);
  const [keepWhite, setKeepWhite] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastSize, setLastSize] = useState<number | null>(null);
  const product = productById(p.productId);
  const size = sizeOf(p.productId, p.sizeId);
  const area = areaOf(p);
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
          {product.id !== 'custom' && !poster ? ` · ${size.top} mm ${uiLang === 'de' ? 'unter Kragen/Oberkante' : 'below collar/top edge'}` : ''}
        </p>
        {size.estimated && <p className="msg warning">{t('estimated')}</p>}
        {!poster && garment.dark && p.theme === 'light' && <p className="msg warning">{t('darkOnDark')}</p>}
        {!poster && !garment.dark && p.theme === 'dark' && <p className="msg warning">{t('lightOnLight')}</p>}
        <section>
          <h3>{poster ? 'PNG' : t('exportPng')}</h3>
          <p className="muted small">{poster ? t('posterPngHint') : t('exportPngHint')}</p>
          <label>
            {t('target')}
            <select value={target} onChange={(e) => setTarget(e.target.value as UploadTargetId)}>
              {UPLOAD_TARGETS.filter((x) => !poster || x.id.startsWith('print')).map((x) => (
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
            {!poster && (
              <>
                <label className="check">
                  <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> {t('transparent')}
                </label>
                <label className="check" title={t('protectWhiteHint')}>
                  <input type="checkbox" checked={keepWhite} onChange={(e) => setKeepWhite(e.target.checked)} /> {t('protectWhite')}
                </label>
              </>
            )}
          </div>
          <div className="row">
            <button
              className="primary"
              disabled={!!busy}
              onClick={() =>
                run('png', async () => {
                  setLastSize(await exportPng(p, uiLang, target, { transparent, keepWhite: keepWhite && !poster }));
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
        {poster && (
          <label className="check" title={t('bleedHint')}>
            <input type="checkbox" checked={bleed} onChange={(e) => setBleed(e.target.checked)} /> {t('bleed')}
          </label>
        )}
        <section className="row wrap">
          <button disabled={!!busy} onClick={() => run('svg', () => exportSvg(p, uiLang, bleedMm))}>
            {busy === 'svg' ? t('exporting') : `⬇ ${t('exportSvg')}`}
          </button>
          <button disabled={!!busy} onClick={() => run('pdf', () => exportPdf(p, uiLang, bleedMm))}>
            {busy === 'pdf' ? t('exporting') : `⬇ ${t('exportPdf')}`}
          </button>
          <button disabled={!!busy} onClick={() => run('txt', () => exportAttribution(p, uiLang))}>
            ⬇ {t('exportCredits')}
          </button>
        </section>
        {poster ? (
          <p className="muted small">{t('posterNote')}</p>
        ) : (
          <>
            <p className="muted small">{t('areaNote')}</p>
            <p className="muted small">
              {t('protectWhiteHint')} {t('whiteOnWhite')}
            </p>
          </>
        )}
        <p className="muted small">{t('licenseNote')}</p>
        <div className="row end">
          <button onClick={close}>{t('close')}</button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useStore, emptyProject } from './store';
import { useUi, type SourceTab } from './ui';
import { useT, type TKey } from './i18n';
import { Canvas } from './components/Canvas';
import { Mockup } from './components/Mockup';
import { Toolbar } from './components/Toolbar';
import { Inspector } from './components/Inspector';
import { ExportDialog } from './components/ExportDialog';
import { FillDialog } from './components/FillDialog';
import { ArticleTab } from './components/ArticleTab';
import { DykTab } from './components/DykTab';
import { RandomTab } from './components/RandomTab';
import { CommonsTab } from './components/CommonsTab';
import { UploadTab } from './components/UploadTab';
import { LangToggle } from './components/common';
import { exportProject } from './export/export';
import { productById } from './products';
import type { Project } from './model';

const REPO_URL = 'https://github.com/gitlias/uniqollage';

const TABS: [SourceTab, TKey][] = [
  ['search', 'tabSearch'],
  ['dyk', 'tabDyk'],
  ['random', 'tabRandom'],
  ['commons', 'tabCommons'],
  ['upload', 'tabUpload'],
];

const TAB_VIEWS: Record<SourceTab, JSX.Element> = {
  search: <ArticleTab />,
  dyk: <DykTab />,
  random: <RandomTab />,
  commons: <CommonsTab />,
  upload: <UploadTab />,
};

/** Slim bar shown in place of a collapsed side panel. */
function PanelRail({ side, label }: { side: 'left' | 'right'; label: string }) {
  const t = useT();
  const toggle = side === 'left' ? useUi.getState().toggleLeft : useUi.getState().toggleRight;
  return (
    <button className={`panel-rail ${side}`} onClick={toggle} title={t('expand')} aria-label={`${t('expand')}: ${label}`}>
      <span>{side === 'left' ? '»' : '«'}</span>
      <span className="rail-label">{label}</span>
    </button>
  );
}

export function App() {
  const t = useT();
  const uiLang = useStore((s) => s.uiLang);
  const setUiLang = useStore((s) => s.setUiLang);
  const productId = useStore((s) => s.project.productId);
  const sizeId = useStore((s) => s.project.sizeId);
  const tileCount = useStore((s) => s.project.tiles.length);
  const tab = useUi((s) => s.tab);
  const setTab = useUi((s) => s.setTab);
  const view = useUi((s) => s.view);
  const setView = useUi((s) => s.setView);
  const exportOpen = useUi((s) => s.exportOpen);
  const leftOpen = useUi((s) => s.leftOpen);
  const rightOpen = useUi((s) => s.rightOpen);
  const fillOpen = useUi((s) => s.fillOpen);
  const fileInput = useRef<HTMLInputElement>(null);
  const [headerQ, setHeaderQ] = useState('');
  // DYK and Random fetch on mount: mount each tab on first visit, then keep it
  // mounted so its state survives tab switches.
  const [visited, setVisited] = useState<Set<SourceTab>>(() => new Set([tab]));
  useEffect(() => setVisited((v) => (v.has(tab) ? v : new Set(v).add(tab))), [tab]);

  return (
    <div className={`app${leftOpen ? '' : ' left-collapsed'}${rightOpen ? '' : ' right-collapsed'}`}>
      <header className="vector-header">
        <div className="header-start">
          <span className="wordmark" aria-label="Uniqollage">
            <span className="wm-mark" aria-hidden>
              Ü
            </span>
            <span className="wm-text">
              <span className="wm-title">Uniqollage</span>
              <span className="wm-tagline">{t('wordmarkTagline')}</span>
            </span>
          </span>
        </div>
        <form
          className="header-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (headerQ.trim()) useUi.getState().search(headerQ.trim());
          }}
        >
          <input type="search" value={headerQ} onChange={(e) => setHeaderQ(e.target.value)} placeholder={t('searchWikipedia')} aria-label={t('searchWikipedia')} />
          <button type="submit">{t('search')}</button>
        </form>
        <nav className="header-end">
          <span className="lang-btn" title="Interface language">
            <span aria-hidden>文A</span>
            <LangToggle value={uiLang} onChange={setUiLang} />
          </span>
          <button
            className="quiet"
            onClick={() => {
              if (confirm(t('confirmNew'))) useStore.getState().load(emptyProject());
            }}
          >
            {t('newProject')}
          </button>
          <button className="quiet" onClick={() => fileInput.current?.click()}>
            {t('importProject')}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const p = JSON.parse(await f.text()) as Project;
                if (p.version !== 1 || !Array.isArray(p.tiles)) throw new Error('Not a Uniqollage project');
                useStore.getState().load(p);
              } catch (err) {
                alert(`${t('error')}: ${(err as Error).message}`);
              }
            }}
          />
          <button className="quiet" onClick={() => exportProject(useStore.getState().project)}>
            {t('exportProject')}
          </button>
          <button className="primary" onClick={() => useUi.getState().setExportOpen(true)}>
            {t('export')}
          </button>
        </nav>
      </header>

      {!leftOpen && <PanelRail side="left" label={t('factBank')} />}
      <aside className="sources vector-menu" hidden={!leftOpen}>
        <div className="menu-heading">
          {t('factBank')}
          <button className="panel-toggle" onClick={() => useUi.getState().toggleLeft()} title={t('collapse')} aria-label={t('collapse')}>
            «
          </button>
        </div>
        <nav className="tabs">
          {TABS.map(([id, key]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              {t(key)}
            </button>
          ))}
        </nav>
        <div className="tab-body">
          {TABS.map(([id]) =>
            visited.has(id) || tab === id ? (
              <div key={id} hidden={tab !== id}>
                {TAB_VIEWS[id]}
              </div>
            ) : null,
          )}
        </div>
      </aside>

      <main className="content">
        <div className="title-bar">
          <h1 className="first-heading">
            {productById(productId).name[uiLang]}
            {productById(productId).sizes.length > 1 ? ` (${sizeId})` : ''}
          </h1>
          <span className="muted small">
            {tileCount} {t('ofTiles')}
          </span>
        </div>
        <nav className="page-tabs">
          <div>
            <button className="on">{t('collage')}</button>
          </div>
          <div>
            <button className={view === 'editor' ? 'on' : ''} onClick={() => setView('editor')}>
              {t('edit')}
            </button>
            <button className={view === 'mockup' ? 'on' : ''} onClick={() => setView('mockup')}>
              {t('preview')}
            </button>
            <button onClick={() => useUi.getState().setExportOpen(true)}>{t('export')}</button>
          </div>
        </nav>
        <div className="site-sub">{t('siteSub')}</div>
        <Toolbar />
        {view === 'editor' ? <Canvas /> : <Mockup />}
        <footer className="footer">
          <span>{t('footerLicense')}</span>{' '}
          <span>
            {t('footerSource')}{' '}
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              {t('sourceCode')}
            </a>
          </span>
        </footer>
      </main>

      {rightOpen ? <Inspector /> : <PanelRail side="right" label={t('tools')} />}
      {exportOpen && <ExportDialog />}
      {fillOpen && <FillDialog />}
    </div>
  );
}

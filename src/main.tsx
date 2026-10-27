import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { get, set } from 'idb-keyval';
import { App } from './App';
import { loadFonts } from './text/fonts';
import { useStore } from './store';
import type { Project } from './model';
import './styles.css';

const KEY = 'uniqollage:project';
const root = createRoot(document.getElementById('root')!);
root.render(<div className="boot">Uniqollage…</div>);

async function boot() {
  await loadFonts();
  try {
    const saved = (await get(KEY)) as Project | undefined;
    if (saved?.version === 1) useStore.getState().load(saved);
  } catch (e) {
    console.warn('Could not restore project', e);
  }
  // Autosave (debounced) to IndexedDB, including uploaded images.
  let timer: number | undefined;
  useStore.subscribe((s, prev) => {
    if (s.project === prev.project) return;
    clearTimeout(timer);
    timer = window.setTimeout(() => set(KEY, s.project).catch((e) => console.warn('Autosave failed', e)), 400);
  });
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

boot().catch((e) => root.render(<pre className="boot">{String(e)}</pre>));

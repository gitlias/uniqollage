import { create } from 'zustand';
import type { Lang } from './model';

export type SourceTab = 'search' | 'dyk' | 'random' | 'commons' | 'upload';

interface UiState {
  tab: SourceTab;
  view: 'editor' | 'mockup';
  /** Article requested from another tab (e.g. Random → Open). */
  openRequest: { lang: Lang; title: string; nonce: number } | null;
  /** Query typed into the header search box. */
  searchRequest: { q: string; nonce: number } | null;
  exportOpen: boolean;
  fillOpen: boolean;
  /** Side panels (remembered per browser). */
  leftOpen: boolean;
  rightOpen: boolean;
  toggleLeft(): void;
  toggleRight(): void;
  /** Canvas zoom (1 = fit) and view centre in mm (null = centre of the page). */
  zoom: number;
  center: { x: number; y: number } | null;
  setZoom(zoom: number, center?: { x: number; y: number } | null): void;
  setCenter(center: { x: number; y: number } | null): void;
  setFillOpen(v: boolean): void;
  search(q: string): void;
  setTab(t: SourceTab): void;
  setView(v: 'editor' | 'mockup'): void;
  openArticle(lang: Lang, title: string): void;
  setExportOpen(v: boolean): void;
}

function stored(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function store(key: string, v: boolean): void {
  try {
    localStorage.setItem(key, v ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export const useUi = create<UiState>((set) => ({
  tab: 'search',
  view: 'editor',
  openRequest: null,
  searchRequest: null,
  exportOpen: false,
  fillOpen: false,
  leftOpen: stored('uniqollage:left', true),
  rightOpen: stored('uniqollage:right', true),
  toggleLeft: () =>
    set((s) => {
      store('uniqollage:left', !s.leftOpen);
      return { leftOpen: !s.leftOpen };
    }),
  toggleRight: () =>
    set((s) => {
      store('uniqollage:right', !s.rightOpen);
      return { rightOpen: !s.rightOpen };
    }),
  zoom: 1,
  center: null,
  setZoom: (zoom, center) => set((s) => ({ zoom: Math.min(16, Math.max(1, zoom)), center: zoom <= 1 ? null : center === undefined ? s.center : center })),
  setCenter: (center) => set({ center }),
  setFillOpen: (fillOpen) => set({ fillOpen }),
  search: (q) => set({ tab: 'search', searchRequest: { q, nonce: Date.now() } }),
  setTab: (tab) => set({ tab }),
  setView: (view) => set({ view }),
  openArticle: (lang, title) => set({ tab: 'search', openRequest: { lang, title, nonce: Date.now() } }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
}));

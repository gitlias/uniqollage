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
  setFillOpen(v: boolean): void;
  search(q: string): void;
  setTab(t: SourceTab): void;
  setView(v: 'editor' | 'mockup'): void;
  openArticle(lang: Lang, title: string): void;
  setExportOpen(v: boolean): void;
}

export const useUi = create<UiState>((set) => ({
  tab: 'search',
  view: 'editor',
  openRequest: null,
  searchRequest: null,
  exportOpen: false,
  fillOpen: false,
  setFillOpen: (fillOpen) => set({ fillOpen }),
  search: (q) => set({ tab: 'search', searchRequest: { q, nonce: Date.now() } }),
  setTab: (tab) => set({ tab }),
  setView: (view) => set({ view }),
  openArticle: (lang, title) => set({ tab: 'search', openRequest: { lang, title, nonce: Date.now() } }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
}));

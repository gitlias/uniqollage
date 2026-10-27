import { create } from 'zustand';
import { isNonStandardThumb, originalFromThumb } from './wiki/api';
import { newId, type Lang, type Project, type Tile, type TileDraft } from './model';
import { arrange, shuffled } from './layout/pack';
import { contentBox } from './render/collage';
import { areaOf, garmentColor, offerIn, productById, productsIn } from './products';

export function emptyProject(): Project {
  return {
    version: 1,
    region: 'de',
    productId: 'basic-t',
    sizeId: 'M',
    theme: 'light',
    skin: 'vector2010',
    landscape: false,
    margins: 0,
    customArea: { w: 250, h: 320 },
    baseSize: 3,
    autoSize: true,
    credit: true,
    seed: 1,
    tiles: [],
    garment: 'white',
  };
}

const HISTORY = 100;

/**
 * Make product, size and garment colour valid for the project's region,
 * keeping the current choice where possible.
 */
export function normalize(p: Project): Project {
  const available = productsIn(p.region);
  const product = available.find((x) => x.id === productById(p.productId).id) ?? available[0];
  const offer = offerIn(product, p.region);
  const size =
    offer.sizes.find((s) => s.id === p.sizeId) ?? offer.sizes.find((s) => s.id === product.defaultSize) ?? offer.sizes[Math.floor(offer.sizes.length / 2)];
  const garment = offer.colors.includes(p.garment) ? p.garment : offer.colors[0];
  const theme = garment === p.garment ? p.theme : garmentColor(garment).dark ? 'dark' : 'light';
  return { ...p, productId: product.id, sizeId: size.id, garment, theme };
}

/** Images saved with thumbnail widths Wikimedia no longer serves fall back to the original file. */
function repairImage<T extends { src: string } | undefined>(img: T): T {
  return img && isNonStandardThumb(img.src) ? { ...img, src: originalFromThumb(img.src) } : img;
}

/** Fill in fields added after a project was saved and map legacy product ids. */
export function migrate(p: Project): Project {
  const tiles = (p.tiles ?? []).map((t) =>
    t.type === 'image' ? { ...t, image: repairImage(t.image) } : t.type === 'infobox' ? { ...t, image: repairImage(t.image) } : t,
  );
  // Margins used to exist for posters only.
  const margins = p.margins ?? (productById(p.productId).shape === 'poster' ? (p.margin ?? 15) : 0);
  return normalize({ ...emptyProject(), ...p, tiles, margins, theme: p.theme ?? 'light' });
}

interface State {
  project: Project;
  uiLang: Lang;
  selected: string | null;
  /** True while the layout is untouched by manual edits; new tiles then trigger a re-layout. */
  autoLayout: boolean;
  /** Bumped when fonts for further scripts arrive; views re-render on it. */
  fontEpoch: number;
  /** After font changes: re-run the layout (no undo step) if it is automatic. */
  refreshLayout(): void;
  past: Project[];
  future: Project[];

  /** Snapshot the current project for undo (call before a gesture). */
  checkpoint(): void;
  /** Replace the project. Pass history=false for intermediate gesture updates. */
  update(fn: (p: Project) => Project, history?: boolean): void;
  undo(): void;
  redo(): void;
  addTiles(drafts: TileDraft[]): void;
  /** Add (or replace with) many tiles in one undo step and shuffle the layout. */
  fill(drafts: TileDraft[], replace: boolean): void;
  patchTile(id: string, patch: Partial<Tile>, history?: boolean): void;
  removeTile(id: string): void;
  duplicateTile(id: string): void;
  restack(id: string, where: 'front' | 'back'): void;
  arrange(shuffle: boolean): void;
  select(id: string | null): void;
  setUiLang(l: Lang): void;
  load(p: Project): void;
}

/** Give drafts ids and a provisional placement (the layout replaces it). */
function toTiles(project: Project, drafts: TileDraft[]): Tile[] {
  const area = areaOf(project);
  return drafts.map(
    (d, i) =>
      ({
        scale: 1,
        ...d,
        id: newId(),
        x: area.w * 0.3 + i * 4,
        y: area.h * 0.3 + i * 4,
        w: d.type === 'title' ? area.w * 0.4 : area.w * 0.3,
        rot: 0,
      }) as Tile,
  );
}

function relayout(p: Project, shuffle: boolean): Project {
  const seed = shuffle ? Math.floor(Math.random() * 2 ** 31) : p.seed;
  const order = shuffle ? shuffled(p.tiles, seed) : p.tiles;
  const res = arrange(order, contentBox(p), { baseSize: p.baseSize, autoSize: p.autoSize, seed, skin: p.skin, gap: p.gap });
  return { ...p, seed, tiles: res.tiles, baseSize: res.baseSize };
}

export const useStore = create<State>((set, get) => ({
  project: emptyProject(),
  uiLang: (() => {
    try {
      const v = localStorage.getItem('uniqollage:lang');
      if (v === 'de' || v === 'en') return v;
    } catch {
      /* ignore */
    }
    return navigator.language?.startsWith('de') ? 'de' : 'en';
  })(),
  selected: null,
  autoLayout: true,
  fontEpoch: 0,
  past: [],
  future: [],

  checkpoint() {
    set((s) => ({ past: [...s.past.slice(-HISTORY + 1), s.project], future: [] }));
  },
  update(fn, history = true) {
    if (history) get().checkpoint();
    set((s) => ({ project: fn(s.project) }));
  },
  undo() {
    const { past, project, future } = get();
    if (!past.length) return;
    set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future] });
  },
  redo() {
    const { past, project, future } = get();
    if (!future.length) return;
    set({ project: future[0], future: future.slice(1), past: [...past, project] });
  },
  addTiles(drafts) {
    const { project, autoLayout } = get();
    const tiles = toTiles(project, drafts);
    get().update((p) => {
      const next = { ...p, tiles: [...p.tiles, ...tiles] };
      return autoLayout ? relayout(next, false) : next;
    });
    set({ selected: tiles.length === 1 ? tiles[0].id : get().selected });
  },
  fill(drafts, replace) {
    get().update((p) => relayout({ ...p, tiles: [...(replace ? [] : p.tiles), ...toTiles(p, drafts)] }, true));
    set({ autoLayout: true, selected: null });
  },
  patchTile(id, patch, history = true) {
    get().update((p) => ({ ...p, tiles: p.tiles.map((t) => (t.id === id ? ({ ...t, ...patch } as Tile) : t)) }), history);
    if ('x' in patch || 'y' in patch || 'w' in patch || 'rot' in patch) set({ autoLayout: false });
  },
  removeTile(id) {
    get().update((p) => ({ ...p, tiles: p.tiles.filter((t) => t.id !== id) }));
    if (get().selected === id) set({ selected: null });
  },
  duplicateTile(id) {
    const t = get().project.tiles.find((x) => x.id === id);
    if (!t) return;
    const copy = { ...t, id: newId(), x: t.x + 5, y: t.y + 5 } as Tile;
    get().update((p) => ({ ...p, tiles: [...p.tiles, copy] }));
    set({ selected: copy.id, autoLayout: false });
  },
  restack(id, where) {
    get().update((p) => {
      const t = p.tiles.find((x) => x.id === id);
      if (!t) return p;
      const rest = p.tiles.filter((x) => x.id !== id);
      return { ...p, tiles: where === 'front' ? [...rest, t] : [t, ...rest] };
    });
  },
  refreshLayout() {
    const { autoLayout, project } = get();
    if (autoLayout && project.tiles.length) set({ project: relayout(project, false) });
  },
  arrange(shuffle) {
    get().update((p) => relayout(p, shuffle));
    set({ autoLayout: true });
  },
  select(id) {
    set({ selected: id });
  },
  setUiLang(l) {
    try {
      localStorage.setItem('uniqollage:lang', l);
    } catch {
      /* ignore */
    }
    set({ uiLang: l });
  },
  load(p) {
    set({ project: migrate(p), past: [], future: [], selected: null, autoLayout: false });
  },
}));

/** Re-run the layout after a setting change that affects it (product, size, credit strip). */
export function updateAndRelayout(fn: (p: Project) => Project): void {
  const s = useStore.getState();
  s.update((p) => {
    const next = fn(p);
    return next.tiles.length ? relayout(next, false) : next;
  });
  useStore.setState({ autoLayout: true });
}

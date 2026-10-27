import { useStore } from '../store';
import { contentBox } from '../render/collage';
import { articlePage } from '../layout/page';
import type { Article } from '../wiki/api';

/** Replace the collage with the article laid out as one Wikipedia page. */
export function placeWholePage(a: Article, confirmText: string): void {
  const s = useStore.getState();
  if (s.project.tiles.length && !confirm(confirmText)) return;
  const p = s.project;
  s.setTiles(articlePage(a, contentBox(p), { baseSize: p.baseSize, skin: p.skin ?? 'vector2010' }));
}

import { memo } from 'react';
import type { Skin, Theme, Tile } from '../model';
import { renderTile, type Prim } from '../render/tiles';
import { r3, tileTransform } from '../render/collage';

export function PrimEl({ p }: { p: Prim }) {
  switch (p.t) {
    case 'rect':
      return <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={p.fill ?? 'none'} stroke={p.stroke} strokeWidth={p.sw} />;
    case 'line':
      return <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={p.stroke} strokeWidth={p.sw} />;
    case 'path':
      return <path transform={`translate(${r3(p.x)} ${r3(p.y)})`} fill={p.fill} d={p.d} />;
    case 'image':
      return <image x={p.x} y={p.y} width={p.w} height={p.h} href={p.href} preserveAspectRatio="xMidYMid slice" />;
  }
}

export const TileView = memo(function TileView({
  tile,
  baseSize,
  theme,
  skin,
}: {
  tile: Tile;
  baseSize: number;
  theme: Theme;
  skin?: Skin;
  /** Changes when fonts were added, to re-render. */
  epoch?: number;
}) {
  const r = renderTile(tile, baseSize, theme, skin);
  return (
    <g transform={tileTransform(tile, r.h)}>
      {r.prims.map((p, i) => (
        <PrimEl key={i} p={p} />
      ))}
    </g>
  );
});

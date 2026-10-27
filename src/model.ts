// Core data model. All geometry is in millimetres on the print area.

export type Lang = 'en' | 'de';

export interface Source {
  kind: 'wikipedia' | 'dyk' | 'commons' | 'upload';
  lang?: Lang;
  /** Article or file title. */
  title?: string;
  url?: string;
  license?: string;
  artist?: string;
}

export interface Placement {
  x: number;
  y: number;
  /** Tile width; the height follows from the content. */
  w: number;
  /** Rotation in degrees around the tile centre. */
  rot: number;
}

interface TileBase extends Placement {
  id: string;
  source: Source;
  /** Per-tile text size multiplier on top of the global base size. */
  scale: number;
}

/** Article heading: serif title, hairline rule, optional "From Wikipedia…" tagline. */
export interface TitleTile extends TileBase {
  type: 'title';
  text: string;
  tagline: boolean;
}

/**
 * Body text using a tiny wiki-ish markup:
 *   [[link]]  '''bold'''  ''italic''
 */
export interface TextTile extends TileBase {
  type: 'text';
  markup: string;
}

export interface ImageRef {
  /** Remote URL or data: URL (uploads). */
  src: string;
  /** width / height */
  aspect: number;
}

/** Wikipedia thumbnail frame with caption (also used for own uploads). */
export interface ImageTile extends TileBase {
  type: 'image';
  image: ImageRef;
  caption: string;
  frame: boolean;
  /** Overrides the skin's default image style. */
  imageStyle?: ImageStyle;
  /** Displayed image box aspect (w/h) when cropped to fill space; defaults to image.aspect. */
  boxAspect?: number;
}

export interface InfoboxTile extends TileBase {
  type: 'infobox';
  heading: string;
  image?: ImageRef;
  imageCaption?: string;
  rows: [string, string][];
}

/** Article summary like Wikipedia's page previews: image, title, description, extract. */
export interface CardTile extends TileBase {
  type: 'card';
  title: string;
  description?: string;
  markup: string;
  image?: ImageRef;
  /** 'contain' (default) shows the whole picture; 'cover' crops it to at most 4:3. */
  imageFit?: 'contain' | 'cover';
  /** Licence data of the image, for attribution. */
  imageSource?: Source;
}

export type Tile = TitleTile | TextTile | ImageTile | InfoboxTile | CardTile;
export type TileType = Tile['type'];

/** A tile before it has been placed on the collage. */
export type TileDraft = DistributiveOmit<Tile, keyof Placement | 'id' | 'scale'> & { scale?: number };
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type Theme = 'light' | 'dark';

/** Wikipedia look to imitate: skins differ in link colour, headings and image frames. */
export type Skin = 'vector2010' | 'vector2022' | 'monobook' | 'minerva';

/**
 * Image frame:
 * - classic: grey box, bordered image, caption with "enlarge" icon (Vector 2010/MonoBook thumbs)
 * - modern:  Vector 2022 figure (grey box, no icon)
 * - mobile:  Minerva, no box, small grey caption
 * - plain:   image with caption underneath
 */
export type ImageStyle = 'classic' | 'modern' | 'mobile' | 'plain';

export interface Project {
  version: 1;
  /** UTme! region whose products/sizes are offered (see products.ts). */
  region: 'de' | 'jp';
  productId: string;
  /** Garment size (print areas differ per size). */
  sizeId: string;
  /** 'dark' = Wikipedia night mode palette, for black garments. */
  theme: Theme;
  skin?: Skin;
  /** Posters only: landscape orientation. */
  landscape?: boolean;
  /** Spacing between tiles in mm; undefined = automatic (follows the text size). */
  gap?: number;
  /** Empty margin around the collage inside the print area / poster, mm (all products). */
  margins?: number;
  /** @deprecated Poster-only margin of older projects; migrated to `margins`. */
  margin?: number;
  /** Only used when productId === 'custom'. */
  customArea: { w: number; h: number };
  /** Body text size in mm (cap height ≈ 0.7×). */
  baseSize: number;
  /** When true, Shuffle/Arrange pick the largest base size that fits. */
  autoSize: boolean;
  credit: boolean;
  seed: number;
  tiles: Tile[];
  garment: string;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

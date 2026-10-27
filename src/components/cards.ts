import type { ImageRef, Lang, Source, TileDraft } from '../model';
import { articleUrl, imageInfo } from '../wiki/api';
import { measureAspect } from './common';

/** Build a page-preview card: lead image at print resolution (with licence), title, description, text. */
export async function cardDraft(opts: {
  lang: Lang;
  title: string;
  description?: string;
  markup: string;
  /** Lead image: file name (preferred, resolved at 1920 px) and/or a preview thumbnail. */
  image?: { file?: string; thumb?: string; aspect?: number };
}): Promise<TileDraft> {
  const { lang, title } = opts;
  let image: ImageRef | undefined;
  let imageSource: Source | undefined;
  if (opts.image?.file || opts.image?.thumb) {
    // pageimages returns "A_b.jpg", imageinfo answers with "A b.jpg".
    const file = opts.image.file?.replace(/_/g, ' ');
    const info = file ? (await imageInfo(lang, [file], lang).catch(() => new Map())).get(file) : undefined;
    const src = info?.url ?? opts.image.thumb;
    if (src) {
      const aspect = info ? info.width / info.height : (opts.image.aspect ?? (await measureAspect(src)));
      image = { src, aspect };
      imageSource = { kind: 'wikipedia', lang, title: file, url: info?.page, license: info?.license, artist: info?.artist };
    }
  }
  return {
    type: 'card',
    title,
    description: opts.description,
    markup: opts.markup,
    image,
    imageSource,
    source: { kind: 'wikipedia', lang, title, url: articleUrl(lang, title) },
  };
}

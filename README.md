# Uniqollage

A browser-based collage editor for **Wikipedia fun-fact prints** on UNIQLO
**UTme!** products (T-shirts, tote bags, sweatshirts), inspired by the
[Kleinian custom wiki print](https://kleinian.com/products/custom-wiki-print).

Pick facts, images and infoboxes from the **English and German Wikipedia**,
add your own photos (with or without captions), shuffle them into a dense
Wikipedia-styled collage, preview it on the garment and export print-ready
files.

## Features

- **Fact sources**
  - *Articles* – search EN/DE Wikipedia, then pick the title, lead, single
    sentences (likely "fun facts" are starred and sorted first), figures with
    captions, or the infobox.
  - *Did you know / Schon gewusst?* – current hooks plus monthly archives
    (`Wikipedia:Recent additions/YYYY/Month`,
    `Wikipedia:Hauptseite/Schon gewusst/Archiv/YYYY/MM`), incl. a random month.
  - *Random* – random article roulette, open or add the extract.
  - *Commons* – search Wikimedia Commons and use the image description as caption.
  - *Own images* – drag & drop uploads with optional captions
    (`[[link]]`, `'''bold'''`, `''italic''` markup supported).
- **Wikipedia look** – article titles with hairline rule and "From Wikipedia…"
  tagline, body text with link-blue words, thumbnail frames with captions,
  infobox fragments. The editor UI itself follows the Vector 2022 skin /
  Codex design tokens.
- **Auto layout + manual tweaks** – seeded masonry packing that picks the
  largest text size that fills the print area, crops images to close holes;
  *Shuffle* for a new arrangement. Drag to move, handles to resize/rotate,
  per-tile text scale, undo/redo, keyboard shortcuts.
- **UTme! presets** – T-shirt (large/square/chest), tote, mini tote,
  sweatshirt and custom sizes. Print areas are approximations — check the
  boundary shown in the UTme! app.
- **Export** – transparent PNG at 150/200/300 dpi for the UTme! upload,
  vector SVG and PDF (text is outlined), attribution list (.txt).
- **Garment mockup** in several colours.
- **Licensing helper** – optional credit strip on the print and per-item
  attribution list (Wikipedia text is CC BY-SA 4.0).
- Autosave in the browser (IndexedDB) and project import/export (.json).
- English / German interface.

Everything runs client-side; Wikipedia and Commons are queried directly via
the MediaWiki Action API (CORS, `origin=*`).

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (vitest)
npm run build      # static site in dist/
npm run e2e        # browser smoke test with mocked Wikipedia (needs Playwright + a running `npm run preview`)
```

### How rendering works

All text is measured and drawn as outlines with
[opentype.js](https://github.com/opentypejs/opentype.js), using the bundled
open fonts. The editor preview, PNG, SVG and PDF are therefore pixel-identical
and need no font embedding. Each tile renders to a small display list
(`src/render/tiles.ts`) that is turned into React SVG (editor) or an SVG
string (exports).

## Licences

- Code: [MIT](LICENSE).
- Fonts: [Libertinus Serif](https://github.com/alerque/libertinus) (stand-in for
  Wikipedia's Linux Libertine headings) and [Arimo](https://fonts.google.com/specimen/Arimo)
  (metric-compatible with Arial), both under the SIL Open Font License, via Fontsource.
- UI colours and component styles follow Wikimedia
  [Codex](https://doc.wikimedia.org/codex/) design tokens; no Wikimedia logos
  or trademarks are used.
- Content you fetch remains under its own licence: Wikipedia text is
  CC BY-SA 4.0; Commons media have individual licences shown in the app and in
  the attribution export.

Uniqollage is not affiliated with UNIQLO or the Wikimedia Foundation.

# Uniqollage

**▶ Open the editor: [gitlias.github.io/uniqollage](https://gitlias.github.io/uniqollage/)**

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
- **Neat mode** – close gaps and ragged column ends: tiles grow into free
  space and leftover holes get small filler sentences (collected from the
  articles you used).
- **Whole page** – lay one article out like a Wikipedia page across the
  canvas (infobox and pictures floating right, section headings), cut off
  with "…" where the canvas ends.
- **Random fill** with any mix of content types, 5–50 tiles, EN/DE, and an
  optional Wikipedia category (incl. subcategories).
- **Auto layout + manual tweaks** – seeded masonry packing that picks the
  largest text size that fills the print area, crops images to close holes;
  *Shuffle* for a new arrangement. Drag to move, resize from every edge and
  corner, rotate, snap to edges, centres and the layout spacing (toggle,
  Alt to move freely), zoom, per-tile text scale, undo/redo, shortcuts.
- **UTme! products with official print areas per size**, filtered by region:
  *Germany* (T-shirt adults XXS–3XL, T-shirt kids 110–160, tote, mini tote –
  white/off white, with prices) or *Japan* (adds U Crew Neck T, AIRism
  oversized T, sweatshirt, black). See [docs/utme-research.md](docs/utme-research.md).
- **Posters** – DIN A4–A0, frame sizes (30×40 to 70×100 cm) and US sizes
  (11×17″ to 24×36″, incl. Kleinian's 17×22″), portrait/landscape, white
  margin, vector PDF with 3 mm bleed for print shops, framed wall mockup.
- **Export** – transparent PNG sized to the UTme! upload limits
  (2048 × 2304 px Japan, 2048 × 2048 px other regions, or 300 dpi), with a
  file-size check and protection against UTme! dropping pure white; vector
  SVG and PDF (text is outlined); attribution list (.txt).
- **Garment mockups** drawn to the official measurements, with the print
  area at the official distance below the collar, in the colours each item
  is sold in.
- **Night mode** – Wikipedia's dark palette for black T-shirts and
  sweatshirts (switched on automatically for dark garments).
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

## Deployment

Uniqollage is a static site (`npm run build` → `dist/`) without a backend, so
any static host works: GitHub Pages, Netlify, Cloudflare Pages, Vercel or a
plain web server. `vite.config.ts` uses `base: './'`, so it also works from a
sub-path.

**GitHub Pages** (`.github/workflows/pages.yml`): every push to `main` runs
the tests, builds and deploys. One-time setup: *Settings → Pages → Source:
GitHub Actions*. Pages for **private** repositories needs a paid plan
(GitHub Pro/Team/Enterprise); the published site is public either way, except
with Enterprise Cloud access control.

**Netlify / Cloudflare Pages / Vercel**: connect the repository, build command
`npm run build`, output directory `dist`. These also deploy from private
repositories on their free plans.

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

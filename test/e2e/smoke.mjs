// Browser smoke test with mocked Wikipedia: node test/e2e/smoke.mjs <baseUrl> <outDir>
import { createRequire } from 'node:module';
import { mkdirSync, statSync } from 'node:fs';
import { handle } from './fixtures.mjs';

// Uses the globally installed Playwright (CommonJS resolution honours NODE_PATH).
const { chromium } = createRequire(import.meta.url)('playwright');

const [base = 'http://localhost:4173/', out = 'test-results'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, acceptDownloads: true, locale: 'en-US' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => {
  if (/Replace|ersetzen/.test(d.message())) return; // expected confirmation, accepted by the step
  errors.push(`dialog: ${d.message()}`);
  d.dismiss();
});
await page.route(/wikipedia\.org|wikimedia\.org/, (route) => {
  const r = handle(route.request().url());
  if ((r.status ?? 200) >= 400 && route.request().url().includes('upload.wikimedia.org')) errors.push(`image rejected: ${route.request().url()}`);
  route.fulfill({ status: r.status ?? 200, contentType: r.contentType, body: r.body, headers: { 'access-control-allow-origin': '*' } });
});

const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  await fn();
  console.log('ok');
};

await page.goto(base);
await page.waitForSelector('header');

await step('search and open article', async () => {
  await page.fill('.header-search input', 'Ginkgo');
  await page.keyboard.press('Enter');
  await page.click('.hits li >> text=Ginkgo');
  await page.waitForSelector('.wiki-title');
});

await step('add title, lead, infobox, images, sentences', async () => {
  await page.click('button.add >> text=Title + tagline');
  const adds = page.locator('.tab:visible button.add');
  const n = await adds.count();
  for (let i = 1; i < n; i++) await adds.nth(i).click();
  await page.waitForFunction(() => document.querySelectorAll('.tile-list li').length >= 8);
});

await step('add DYK facts (EN + DE)', async () => {
  await page.click('.tabs button >> text=Did you know');
  await page.waitForSelector('.tab:visible .sentences li');
  for (const b of await page.locator('.tab:visible .sentences button.add').all()) await b.click();
  await page.click('.tab:visible .seg button >> text=DE');
  await page.waitForSelector('.tab:visible .sentences li >> text=TriVis');
  await page.locator('.tab:visible .sentences button.add').first().click();
});

await step('add random article and commons image', async () => {
  await page.click('.tabs button >> text=Random');
  await page.waitForSelector('.tab:visible .card.random');
  // "Add" on the article with a picture adds a page-preview card.
  const hallig = page.locator('.tab:visible .card.random').filter({ hasText: 'Hallig' });
  await hallig.locator('button.add').first().click();
  await page.waitForSelector('.tile-list li >> text=Hallig');
  await page.locator('.tab:visible .card.random').first().locator('button.add >> text=Text only').click();
  await page.click('.tabs button >> text=Commons');
  await page.fill('.tab:visible input[type=search]', 'cat');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.tab:visible .figure');
  await page.locator('.tab:visible .figure button.add').first().click();
});

await step('upload own image with caption', async () => {
  await page.click('.tabs button >> text=Own images');
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 600;
    c.height = 400;
    const g = c.getContext('2d');
    g.fillStyle = '#e3001b';
    g.fillRect(0, 0, 600, 400);
    g.fillStyle = '#fff';
    g.font = 'bold 80px sans-serif';
    g.fillText('MY PIC', 150, 230);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.setInputFiles('.tab:visible input[type=file]', { name: 'me.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.waitForSelector('.card.upload textarea');
  await page.fill('.card.upload textarea', "Me at the '''[[Brandenburger Tor]]''' in 2024");
  await page.click('.card.upload button.add');
});

await step('shuffle and screenshot editor', async () => {
  await page.click('button >> text=Shuffle');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/editor.png` });
});

await step('card has the 1920 px lead image', async () => {
  const hrefs = await page.locator('.canvas image').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  if (!hrefs.some((h) => h && h.includes('1920px-Ginkgo_tree.jpg'))) throw new Error(`no print-size card image: ${hrefs}`);
});

await step('zoom on a classic image tile', async () => {
  const img = page.locator('.canvas .tile').filter({ has: page.locator('image') }).first();
  await img.screenshot({ path: `${out}/tile-classic.png`, scale: 'device' });
});

await step('typing Arabic loads the Arabic font', async () => {
  const fontReq = page.waitForRequest((r) => r.url().includes('noto-sans-arabic'), { timeout: 30000 });
  await page.locator('.tile-list li').filter({ hasText: 'Ginkgos are popular' }).first().click();
  await page.fill('.inspector textarea', 'القاهرة هي عاصمة مصر');
  await fontReq;
  await page.waitForTimeout(1500);
});

await step('select, drag, rotate a tile', async () => {
  const hit = page.locator('.canvas .tile .hit').nth(2);
  const box = await hit.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20, { steps: 5 });
  await page.mouse.up();
  await page.fill('.inspector input[type=number] >> nth=1', '-6');
  await page.screenshot({ path: `${out}/editor-selected.png` });
  await page.keyboard.press('Escape');
});

await step('resize from edges and corners', async () => {
  await page.locator('.canvas .tile .hit').nth(1).click();
  const sel = () => page.locator('.canvas rect[stroke="#36c"]').first().boundingBox();
  const drag = async (handle, dx, dy) => {
    const b = await page.locator(`.canvas .handle.resize.${handle}`).boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 4 });
    await page.mouse.up();
  };
  const b0 = await sel();
  await drag('s', 0, 40);
  const b1 = await sel();
  if (!(b1.height > b0.height + 20)) throw new Error(`bottom handle: ${b0.height} → ${b1.height}`);
  await drag('w', -30, 0);
  const b2 = await sel();
  if (!(b2.width > b1.width + 15) || Math.abs(b2.x + b2.width - (b1.x + b1.width)) > 3) throw new Error('left handle should grow to the left');
  await drag('se', 30, 30);
  const b3 = await sel();
  if (!(b3.width > b2.width && b3.height > b2.height)) throw new Error('corner handle should scale');
  await page.screenshot({ path: `${out}/resized.png` });
});

await step('undo/redo', async () => {
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
});

const openSettings = async () => {
  if (!(await page.locator('.settings-panel').count())) await page.click('.settings-toggle');
  await page.waitForSelector('.settings-panel');
};
const closeSettings = async () => {
  if (await page.locator('.settings-panel').count()) await page.click('.settings-toggle');
};
const setRegion = async (r) => {
  await openSettings();
  await page.selectOption('.settings-panel select >> nth=0', r);
  await closeSettings();
};
// Product and size live in the settings panel (region, product, size).
const choose = async (which, value) => {
  await openSettings();
  await page.selectOption(`.settings-panel select >> nth=${which === 'product' ? 1 : 2}`, value);
  await closeSettings();
};

await step('mockups', async () => {
  await page.click('.page-tabs button >> text=Preview on product');
  await page.screenshot({ path: `${out}/mockup-tshirt.png` });
  await openSettings();
  const deProducts = await page.locator('.settings-panel select').nth(1).locator('option').allTextContents();
  await closeSettings();
  if (deProducts.length !== 6 || deProducts.some((x) => /Sweat|AIRism|U Crew/.test(x))) throw new Error(`DE products: ${deProducts}`);
  await openSettings();
  await page.selectOption('.settings-panel select >> nth=2', '3XL');
  await page.waitForSelector('.settings-panel .estimated');
  await closeSettings();
  await setRegion('jp');
  await choose('product', 'sweat');
  await choose('size', 'L');
  await openSettings();
  await page.click('.settings-panel .swatch[title=Black]');
  const night = page.locator('.settings-panel label', { hasText: /Night mode|Dunkelmodus/ }).locator('input');
  if (!(await night.isChecked())) throw new Error('night mode not enabled for black');
  await closeSettings();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/mockup-sweat-black.png` });
  await choose('product', 'airism-oversized');
  await page.screenshot({ path: `${out}/mockup-oversized.png` });
  await setRegion('de');
  await choose('product', 'tote');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/mockup-tote.png` });
  await choose('product', 'mini-tote');
  await page.screenshot({ path: `${out}/mockup-mini.png` });
  await choose('product', 'kids-t');
  await page.screenshot({ path: `${out}/mockup-kids.png` });
  await choose('product', 'poster');
  await choose('size', 'A2');
  await openSettings();
  await page.click('.settings-panel .seg button >> text=Landscape');
  await closeSettings();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/mockup-poster.png` });
  await page.click('header button.primary');
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('.modal button >> text=PDF (vector)')]);
  await pdf.saveAs(`${out}/poster.pdf`);
  await page.click('.modal button >> text=Close');
  await openSettings();
  await page.click('.settings-panel .seg button >> text=Portrait');
  await closeSettings();
  await choose('product', 'basic-t');
  await choose('size', 'M');
  await page.click('.page-tabs button >> text=Edit');
});

await step('exports', async () => {
  await page.click('header button.primary');
  for (const [label, file, target] of [
    ['⬇ PNG', 'collage.png'],
    ['⬇ PNG', 'collage-intl.png', 'utme-intl'],
    ['SVG (vector)', 'collage.svg'],
    ['PDF (vector)', 'collage.pdf'],
    ['Attribution list', 'sources.txt'],
  ]) {
    if (target) await page.selectOption('.modal select', target);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click(`.modal button >> text=${label}`)]);
    await dl.saveAs(`${out}/${file}`);
    console.log(`\n   ${file}: ${dl.suggestedFilename()} ${statSync(`${out}/${file}`).size} bytes`);
  }
});

await step('fill randomly', async () => {
  if (await page.locator('.modal').count()) await page.click('.modal button >> text=Close');
  await page.click('.toolbar button >> text=/Fill randomly|Zufällig füllen/');
  await page.waitForSelector('.modal .fill-types');
  await page.locator('.modal input[type=range]').fill('12');
  await page.click('.modal label >> text=Infoboxes');
  await page.click('.modal button.primary >> text=Fill');
  await page.waitForFunction(() => !document.querySelector('.modal') || document.querySelector('.modal .msg'), null, { timeout: 60000 });
  if (await page.locator('.modal').count()) await page.click('.modal button >> text=Close');
  const n = await page.locator('.tile-list li').count();
  if (n < 10 || n > 12) throw new Error(`expected ~12 tiles after fill, got ${n}`);
  await page.screenshot({ path: `${out}/filled.png` });
});

await step('collapse panels and zoom the canvas', async () => {
  const canvasWidth = async () => (await page.locator('.canvas-wrap').boundingBox()).width;
  const before = await canvasWidth();
  await page.click('.sources .panel-toggle');
  await page.click('.inspector .panel-toggle');
  await page.waitForSelector('.panel-rail.left');
  const wide = await canvasWidth();
  if (wide < before + 400) throw new Error(`canvas did not grow: ${before} → ${wide}`);
  const vb0 = await page.getAttribute('svg.canvas', 'viewBox');
  await page.click('.zoom-controls button >> text=+');
  await page.click('.zoom-controls button >> text=+');
  const vb1 = await page.getAttribute('svg.canvas', 'viewBox');
  const w = (vb) => Number(vb.split(' ')[2]);
  if (!(w(vb1) < w(vb0) * 0.7)) throw new Error(`zoom did not change viewBox: ${vb0} → ${vb1}`);
  // Ctrl + wheel zooms further, dragging the background pans.
  const box = await page.locator('svg.canvas').boundingBox();
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -300);
  await page.keyboard.up('Control');
  const vb2 = await page.getAttribute('svg.canvas', 'viewBox');
  if (!(w(vb2) < w(vb1))) throw new Error('ctrl+wheel did not zoom');
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 160, { steps: 4 });
  await page.mouse.up();
  const vb3 = await page.getAttribute('svg.canvas', 'viewBox');
  if (vb3 === vb2) throw new Error('drag did not pan');
  await page.screenshot({ path: `${out}/zoomed-collapsed.png` });

  // Hand tool: dragging on a tile pans the view and leaves the tile where it is.
  const tiles = () => page.locator('.canvas .tile').count();
  const pos = () => page.locator('.canvas .tile .hit').evaluateAll((els) => els.map((e) => e.getAttribute('transform')).join('|'));
  await page.click('.tool-picker button >> nth=1');
  const p0 = await pos();
  const vb4 = await page.getAttribute('svg.canvas', 'viewBox');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  if (!(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.tile'), [cx, cy]))) throw new Error('no tile under the drag start');
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 80, cy - 60, { steps: 4 });
  await page.mouse.up();
  if ((await page.getAttribute('svg.canvas', 'viewBox')) === vb4) throw new Error('hand tool did not pan');
  if ((await pos()) !== p0) throw new Error('hand tool moved a tile');
  if (await page.locator('.canvas .handle').count()) throw new Error('handles shown with the hand tool');
  // V switches back; holding Space pans temporarily.
  await page.keyboard.press('v');
  if (!(await page.locator('.tool-picker button >> nth=0').getAttribute('class')).includes('on')) throw new Error('V did not select the move tool');
  await page.keyboard.down('Space');
  if (!(await page.locator('svg.canvas').getAttribute('class')).includes('tool-pan')) throw new Error('Space did not switch to the hand');
  await page.keyboard.up('Space');
  if ((await page.locator('svg.canvas').getAttribute('class')).includes('tool-pan')) throw new Error('hand stayed after Space');
  if ((await tiles()) < 1) throw new Error('tiles lost');

  await page.click('.zoom-level');
  if ((await page.getAttribute('svg.canvas', 'viewBox')) !== vb0) throw new Error('fit did not reset');
  await page.click('.panel-rail.left');
  await page.click('.panel-rail.right');
  await page.waitForSelector('.sources .tabs');
});

await step('autosave survives reload', async () => {
  const before = await page.locator('.tile-list li').count();
  await page.waitForTimeout(800);
  await page.reload();
  await page.waitForSelector('.tile-list li');
  const after = await page.locator('.tile-list li').count();
  if (before !== after) throw new Error(`tiles ${before} → ${after}`);
});

await step('German UI', async () => {
  await page.click('header .seg button >> text=DE');
  await page.waitForSelector('text=Mischen');
});

await step('spacing and margin in the settings panel', async () => {
  const setRange = async (label, value) => {
    const input = page.locator('.settings-panel label', { hasText: label }).locator('input[type=range]');
    await input.evaluate((el, v) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
  };
  await openSettings();
  await setRange(/^(Spacing|Abstand)/, 10);
  await setRange(/^(Margin|Rand)/, 20);
  await closeSettings();
  await page.waitForSelector('.canvas .margin-guide');
  const guide = await page.locator('.canvas .margin-guide').boundingBox();
  const pg = await page.locator('svg.canvas > rect').first().boundingBox();
  if (!(guide.x > pg.x + 5 && guide.width < pg.width - 10)) throw new Error('margin guide not inset');
  const boxes = await page.locator('.canvas .tile .hit').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, r: r.right, b: r.bottom })));
  if (boxes.some((b) => b.x < guide.x - 1 || b.r > guide.x + guide.width + 1)) throw new Error('tiles outside the margin');
  // Neighbours in a row are 10 mm apart: compare with the page width in px (310 mm).
  const pxPerMm = pg.width / 310;
  let minGap = Infinity;
  for (const a of boxes) for (const b of boxes) if (a !== b && a.y < b.b && b.y < a.b && b.x >= a.r - 0.5) minGap = Math.min(minGap, b.x - a.r);
  if (Math.abs(minGap / pxPerMm - 10) > 0.6) throw new Error(`spacing ${minGap / pxPerMm} mm, expected 10`);
  await page.screenshot({ path: `${out}/spacing.png` });
  await openSettings();
  await page.locator('.settings-panel label', { hasText: /Automatic spacing|Automatischer Abstand/ }).locator('input').check();
  await setRange(/^(Margin|Rand)/, 0);
  await closeSettings();
});

await step('random fill from a category', async () => {
  await page.click('.toolbar button >> text=/Fill randomly|Zufällig füllen/');
  await page.waitForSelector('.modal .fill-types');
  await page.locator('.modal input[list=fill-categories]').fill('Bäume');
  await page.waitForTimeout(400);
  if (!(await page.locator('.modal input[type=checkbox] >> nth=1').isDisabled())) throw new Error('DYK should be disabled with a category');
  await page.locator('.modal input[type=range]').fill('6');
  await page.click('.modal button.primary');
  await page.waitForFunction(() => !document.querySelector('.modal') || document.querySelector('.modal .msg'), null, { timeout: 60000 });
  if (await page.locator('.modal').count()) await page.click('.modal button >> nth=-2');
  const labels = await page.locator('.tile-list li').allTextContents();
  // Random-article fixtures (Brillenkauz, Hallig) and DYK hooks must not appear.
  if (!labels.length || labels.some((l) => /Brillenkauz|Hallig|Did you know|Schon gewusst/.test(l))) throw new Error(`unexpected tiles: ${labels.join(' | ')}`);
});

await step('neat layout closes gaps', async () => {
  await page.click('.settings-toggle');
  const neat = page.locator('.settings-panel label', { hasText: /^(Neat|Ordentlich)/ }).locator('input[type=range]');
  await neat.evaluate((el) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '1');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForSelector('.settings-panel >> text=/Filler material|Füllmaterial/');
  await page.click('.settings-toggle');
  await page.screenshot({ path: `${out}/neat.png` });
});

await step('arrangements and optimisation', async () => {
  await page.click('.settings-toggle');
  // Neat filler text (from the step before) only exists in the column layouts.
  let tiles = 0;
  await page.locator('.settings-panel label', { hasText: /(Keep articles together|Artikel zusammenhalten)/ }).locator('input').check();
  await page.locator('.settings-panel .seg button', { hasText: /^(Thorough|Gründlich)$/ }).click();
  for (const [name, re] of [
    ['rows', /^(Rows|Zeilen)$/],
    ['mosaic', /^(Mosaic|Mosaik)$/],
    ['masonry', /^(Masonry|Mauerwerk)/],
    ['columns', /^(Columns|Spalten)$/],
  ]) {
    await page.locator('.settings-panel .seg button', { hasText: re }).click();
    const n = await page.locator('.canvas .tile').count();
    if (name === 'rows') tiles = n;
    if (!n || (name === 'mosaic' && n !== tiles)) throw new Error(`${name}: ${n} tiles`);
    await page.screenshot({ path: `${out}/arrange-${name}.png` });
  }
  // The neat slider only exists where there are holes to close.
  await page.locator('.settings-panel .seg button', { hasText: /^(Mosaic|Mosaik)$/ }).click();
  if (await page.locator('.settings-panel label', { hasText: /^(Neat|Ordentlich)/ }).count()) throw new Error('neat shown for mosaic');
  await page.locator('.settings-panel .seg button', { hasText: /^(Columns|Spalten)$/ }).click();
  await page.click('.settings-toggle');
});

await step('whole page from an article', async () => {
  await page.click('.tabs button >> nth=0');
  await page.fill('.header-search input', 'Ginkgo');
  await page.keyboard.press('Enter');
  await page.click('.hits li >> nth=0');
  await page.waitForSelector('.wiki-title');
  page.once('dialog', (d) => d.accept());
  await page.click('button >> text=/Whole page|Ganze Seite/');
  await page.waitForTimeout(500);
  const titles = await page.locator('.tile-list li').allTextContents();
  if (!titles.some((x) => /Ginkgo/.test(x)) || titles.length < 4) throw new Error(`whole page tiles: ${titles.join(' | ')}`);
  await page.screenshot({ path: `${out}/whole-page.png` });
});

await step('snapping to the page edge (Alt moves freely)', async () => {
  // A defined project: one unrotated tile, nothing else to snap to.
  const project = { version: 1, region: 'de', productId: 'basic-t', sizeId: 'M', theme: 'light', skin: 'vector2010', customArea: { w: 250, h: 320 }, baseSize: 4, autoSize: false, credit: false, seed: 1, garment: 'white',
    tiles: [{ id: 'a', type: 'text', x: 60, y: 60, w: 80, rot: 0, scale: 1, source: { kind: 'wikipedia' }, markup: 'Snap me to the edge of the print area.' }] };
  await page.setInputFiles('header input[type=file]', { name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await page.waitForTimeout(500);
  await page.locator('.canvas .tile .hit').first().click();
  const tileX = async () => (await page.locator('.canvas rect[stroke="#36c"]').first().boundingBox()).x;
  const pageLeft = (await page.locator('svg.canvas > rect').first().boundingBox()).x;
  const dragBy = async (dx, alt) => {
    const b = await page.locator('.canvas rect[stroke="#36c"]').first().boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    if (alt) await page.keyboard.down('Alt');
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2, { steps: 6 });
    await page.mouse.up();
    if (alt) await page.keyboard.up('Alt');
  };
  await dragBy(pageLeft + 4 - (await tileX()), false);
  const snapped = (await tileX()) - pageLeft;
  if (Math.abs(snapped) > 1.5) throw new Error(`no snap: ${snapped}px from edge`);
  await dragBy(4, true);
  const free = (await tileX()) - pageLeft;
  if (Math.abs(free - 4) > 1.5) throw new Error(`Alt should disable snapping: ${free}px from edge`);
});

await browser.close();
if (errors.length) {
  console.error('Errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('All good');

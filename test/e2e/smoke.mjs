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

await step('mockups', async () => {
  const region = '.toolbar select >> nth=0';
  const product = '.toolbar select >> nth=1';
  const size = '.toolbar select >> nth=2';
  await page.click('.page-tabs button >> text=Preview on product');
  await page.screenshot({ path: `${out}/mockup-tshirt.png` });
  const deProducts = await page.locator('.toolbar select').nth(1).locator('option').allTextContents();
  if (deProducts.length !== 6 || deProducts.some((x) => /Sweat|AIRism|U Crew/.test(x))) throw new Error(`DE products: ${deProducts}`);
  await page.selectOption(size, '3XL');
  await page.waitForSelector('.toolbar .estimated');
  await page.selectOption(region, 'jp');
  await page.selectOption(product, 'sweat');
  await page.selectOption(size, 'L');
  await page.click('.swatch[title=Black]');
  if (!(await page.isChecked('.toolbar input[type=checkbox] >> nth=-1'))) throw new Error('night mode not enabled for black');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/mockup-sweat-black.png` });
  await page.selectOption(product, 'airism-oversized');
  await page.screenshot({ path: `${out}/mockup-oversized.png` });
  await page.selectOption(region, 'de');
  await page.selectOption(product, 'tote');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/mockup-tote.png` });
  await page.selectOption(product, 'mini-tote');
  await page.screenshot({ path: `${out}/mockup-mini.png` });
  await page.selectOption(product, 'kids-t');
  await page.screenshot({ path: `${out}/mockup-kids.png` });
  await page.selectOption(product, 'poster');
  await page.selectOption(size, 'A2');
  await page.click('.toolbar .seg button >> text=Landscape');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/mockup-poster.png` });
  await page.click('header button.primary');
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('.modal button >> text=PDF (vector)')]);
  await pdf.saveAs(`${out}/poster.pdf`);
  await page.click('.modal button >> text=Close');
  await page.click('.toolbar .seg button >> text=Portrait');
  await page.selectOption(product, 'basic-t');
  await page.selectOption(size, 'M');
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
  await page.click('.toolbar button >> text=Fill randomly');
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

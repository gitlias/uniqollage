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

await browser.close();
if (errors.length) {
  console.error('Errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('All good');

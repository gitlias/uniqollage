// Phone-size walkthrough with mocked Wikipedia: node test/e2e/mobile-shots.mjs <baseUrl> <outDir>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { handle } from './fixtures.mjs';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const [base = 'http://localhost:4173/', out = 'test-results/mobile'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'de-DE' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route(/wikipedia\.org|wikimedia\.org/, (route) => {
  const r = handle(route.request().url());
  route.fulfill({ status: r.status ?? 200, contentType: r.contentType, body: r.body, headers: { 'access-control-allow-origin': '*' } });
});
page.on('dialog', (d) => d.accept());
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const noHScroll = async (where) => {
  const w = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (w > 1) throw new Error(`${where}: page scrolls sideways by ${w}px`);
};
await page.goto(base);
await page.waitForSelector('.mobile-nav');
await shot('1-canvas-empty');
await noHScroll('start');

await page.fill('.header-search input', 'Ginkgo');
await page.keyboard.press('Enter');
await page.tap('.hits li >> text=Ginkgo');
await page.waitForSelector('.wiki-title');
await shot('2-article');
await noHScroll('article');
await page.locator('.tab:visible button.add').nth(0).tap();
await page.waitForSelector('.toast');
await shot('3-toast');
const adds = page.locator('.tab:visible button.add');
for (let i = 1; i < Math.min(7, await adds.count()); i++) await adds.nth(i).tap();
await page.tap('.toast button');
await page.waitForSelector('.canvas .tile');
await page.waitForTimeout(300);
await shot('4-canvas');
await noHScroll('canvas');

// Hand tool: a swipe over a tile moves the zoomed-in view, not the tile.
await page.tap('.zoom-controls button >> nth=2');
await page.tap('.zoom-controls button >> nth=2');
await page.tap('.tool-picker button >> nth=1');
const vb0 = await page.getAttribute('svg.canvas', 'viewBox');
const box = await page.locator('svg.canvas').boundingBox();
const cdp = await ctx.newCDPSession(page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
await touch('touchStart', box.x + box.width / 2, box.y + box.height / 2);
for (let i = 1; i <= 5; i++) await touch('touchMove', box.x + box.width / 2 - i * 20, box.y + box.height / 2 - i * 15);
await touch('touchEnd');
if ((await page.getAttribute('svg.canvas', 'viewBox')) === vb0) throw new Error('hand tool did not pan on touch');
await shot('4b-hand');
await page.tap('.tool-picker button >> nth=0');
await page.tap('.zoom-level');

// Select a tile, then edit it.
await page.locator('.canvas .tile .hit').nth(1).tap();
await page.waitForSelector('.tile-actions');
await shot('5-selected');
await page.tap('.tile-actions button >> nth=0');
await page.waitForSelector('.app.pane-tools');
await shot('6-tools');
await noHScroll('tools');

await page.tap('.mobile-nav button >> nth=1');
await page.tap('.settings-toggle');
await shot('7-settings');
await page.tap('.sheet-head button');
if (await page.locator('.settings-panel').count()) throw new Error('settings sheet did not close');

await page.tap('.menu-toggle');
await shot('8-menu');
await page.tap('.menu-toggle');

await page.tap('.vector-header .primary');
await page.waitForSelector('.modal');
await shot('9-export');
await noHScroll('export');

if (errors.length) throw new Error(errors.join('\n'));
console.log('mobile ok');
await browser.close();

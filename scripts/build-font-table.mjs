// Builds public/noto-fonts.json: which Noto font file (Fontsource CDN) covers
// which code points. The app loads it on demand when text contains characters
// that the bundled fonts lack. Run: node scripts/build-font-table.mjs
import { writeFileSync } from 'node:fs';

const API = 'https://api.fontsource.org/v1/fonts';
const EXCLUDE = /-(display|mono|unjoined|looped|eastern|western)$|^noto-sans-phags-pa$/;
// Serif-only scripts (no Noto Sans counterpart on Fontsource).
const SERIF_ONLY = ['ahom', 'dives-akuru', 'dogra', 'khitan-small-script', 'makasar', 'np-hmong', 'old-uyghur', 'ottoman-siyaq', 'tangut', 'tibetan', 'todhri', 'toto', 'yezidi'].map((s) => `noto-serif-${s}`);
const CJK = ['noto-sans-sc', 'noto-sans-tc', 'noto-sans-hk', 'noto-sans-jp', 'noto-sans-kr'];
const LAST = ['noto-sans-symbols', 'noto-sans-symbols-2', 'noto-sans-math', 'noto-music', 'noto-znamenny-musical-notation', 'noto-emoji'];

function ranges(spec) {
  const out = [];
  for (const part of spec.split(',')) {
    const m = part.trim().match(/^U\+([0-9a-f?]+)(?:-([0-9a-f]+))?$/i);
    if (!m) continue;
    if (m[1].includes('?')) out.push([parseInt(m[1].replace(/\?/g, '0'), 16), parseInt(m[1].replace(/\?/g, 'f'), 16)]);
    else out.push([parseInt(m[1], 16), parseInt(m[2] ?? m[1], 16)]);
  }
  out.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else merged.push(r);
  }
  return merged;
}

const all = await (await fetch(API)).json();
const ids = all.map((f) => f.id);
const scripts = ids.filter((id) => id.startsWith('noto-sans-') && !EXCLUDE.test(id) && !CJK.includes(id) && !LAST.includes(id)).sort();
// CJK first: several script families also ship (partial) Han chunks.
const order = ['noto-sans', ...CJK, ...scripts, ...SERIF_ONLY.filter((id) => ids.includes(id)), ...LAST.filter((id) => ids.includes(id))];

const families = [];
for (const id of order) {
  const meta = await (await fetch(`${API}/${id}`)).json();
  const weight = meta.weights.includes(400) ? 400 : meta.weights.reduce((a, b) => (Math.abs(b - 400) < Math.abs(a - 400) ? b : a));
  const subsets = Object.entries(meta.unicodeRange ?? {}).map(([name, spec]) => [name.replace(/^\[(\d+)\]$/, '$1'), ranges(spec)]);
  families.push({ id, weight, subsets });
  process.stdout.write('.');
}
writeFileSync('public/noto-fonts.json', JSON.stringify({ generated: new Date().toISOString().slice(0, 10), families }));
console.log(`\n${families.length} families`);

// Mock MediaWiki API responses for the browser smoke test.
const svgImage = (w, h, hue) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="hsl(${hue},45%,62%)"/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 3}" fill="hsl(${hue + 40},55%,38%)"/></svg>`;

export const images = {
  'Ginkgo_leaf.jpg': svgImage(800, 1000, 70),
  'Ginkgo_tree.jpg': svgImage(1200, 800, 100),
  'Hiroshima.jpg': svgImage(1000, 1000, 20),
  'Commons_cat.jpg': svgImage(1200, 900, 200),
};

const img = (name, w) => `//upload.wikimedia.org/thumb/${w}px-${name}`;

export const articleHtml = `<div class="mw-parser-output">
<table class="infobox biota"><tbody>
<tr><th colspan="2" class="infobox-above">Ginkgo</th></tr>
<tr><td colspan="2"><span typeof="mw:File"><a href="/wiki/File:Ginkgo_leaf.jpg" class="mw-file-description"><img src="${img('Ginkgo_leaf.jpg', 250)}" width="250" height="312"></a></span><div class="infobox-caption">Leaves of a <a href="/wiki/Ginkgo_biloba">ginkgo</a> in autumn</div></td></tr>
<tr><th>Kingdom:</th><td><a href="/wiki/Plant">Plantae</a></td></tr>
<tr><th>Division:</th><td><a href="/wiki/Ginkgophyta">Ginkgophyta</a></td></tr>
<tr><th>Genus:</th><td><i><b>Ginkgo</b></i> <a href="/wiki/Carl_Linnaeus">L.</a></td></tr>
</tbody></table>
<p><b>Ginkgo</b> is a <a href="/wiki/Genus">genus</a> of non-flowering <a href="/wiki/Seed_plant">seed plants</a>.<sup class="reference">[1]</sup> The scientific name is also used as the English name. It is the only living genus of its order, first appearing about 290 million years ago in the <a href="/wiki/Permian">Permian</a>.</p>
<figure typeof="mw:File/Thumb"><a href="/wiki/File:Ginkgo_tree.jpg" class="mw-file-description"><img src="${img('Ginkgo_tree.jpg', 220)}" width="220" height="147"></a><figcaption>A 1,000-year-old <a href="/wiki/Tree">tree</a> in <a href="/wiki/Korea">Korea</a></figcaption></figure>
<div class="mw-heading mw-heading2"><h2 id="History">History</h2></div>
<p>Six <i>Ginkgo</i> trees survived the <a href="/wiki/Atomic_bombing_of_Hiroshima">atomic bombing of Hiroshima</a> in 1945, only 1–2 km from the explosion, and they are still alive today. Ginkgos are popular street trees because they tolerate pollution remarkably well.</p>
<figure typeof="mw:File/Thumb"><a href="/wiki/File:Hiroshima.jpg" class="mw-file-description"><img src="${img('Hiroshima.jpg', 220)}" width="220" height="220"></a><figcaption>A survivor tree in Hiroshima</figcaption></figure>
<p>The seeds smell like rancid butter, which is why many cities plant only male trees. Despite this, roasted ginkgo nuts are a delicacy in China and Japan, and are served at weddings.</p>
<h2>References</h2><p>Nothing to see here, reference section skipped.</p>
</div>`;

export const dykEnHtml = `<div class="mw-parser-output"><ul>
<li>... that the <b><a href="/wiki/Ginkgo" title="Ginkgo">ginkgo</a></b> (pictured) survived the atomic bombing of Hiroshima?</li>
<li>... that <b><a href="/wiki/Bill_Simpson" title="Bill Simpson">Bill Simpson</a></b> set himself on fire several times to demonstrate his racing suit?</li>
<li>... that the <b><a href="/wiki/Suco" title="Suco">chefe de suco</a></b> does not serve juice?</li>
<li>... that the <i><b><a href="/wiki/Bat" title="Bat">nasal-leaf bulldog bat</a></b></i> can crawl through holes as wide as its ears are long?</li>
</ul></div>`;

export const dykDeHtml = `<div class="mw-parser-output"><div class="hauptseite-box-content"><ul>
<li>Mit <a href="/wiki/TriVis" title="TriVis"><b>TriVis</b></a> wurde die Wettervorhersage im deutschen Fernsehen dreidimensional.</li>
<li>Der <a href="/wiki/Brillenkauz" title="Brillenkauz"><b>Brillenkauz</b></a> trägt seine Brille schon als Küken – allerdings umgekehrt gefärbt.</li>
</ul></div></div>`;

export function handle(url) {
  const u = new URL(url);
  const p = Object.fromEntries(u.searchParams);
  if (u.hostname === 'upload.wikimedia.org') {
    const name = u.pathname.split('-').slice(1).join('-');
    return { contentType: 'image/svg+xml', body: images[name] ?? images['Ginkgo_tree.jpg'] };
  }
  const json = (o) => ({ contentType: 'application/json', body: JSON.stringify(o) });
  const lang = u.hostname.split('.')[0];
  if (p.action === 'query' && p.generator === 'search' && u.hostname.startsWith('commons')) {
    return json({
      query: {
        pages: [
          {
            title: 'File:Commons_cat.jpg',
            index: 1,
            imageinfo: [
              {
                thumburl: `https:${img('Commons_cat.jpg', 320)}`,
                url: `https:${img('Commons_cat.jpg', 1200)}`,
                width: 1200,
                height: 900,
                descriptionurl: 'https://commons.wikimedia.org/wiki/File:Commons_cat.jpg',
                extmetadata: {
                  ImageDescription: { value: 'A <b>cat</b> sleeping on a Wikipedia server rack. Taken in 2019.' },
                  LicenseShortName: { value: 'CC BY-SA 4.0' },
                  Artist: { value: '<a href="#">Jane Doe</a>' },
                },
              },
            ],
          },
        ],
      },
    });
  }
  if (p.action === 'query' && p.generator === 'search') {
    return json({
      query: {
        pages: [
          { title: 'Ginkgo', index: 1, description: 'Genus of plants', thumbnail: { source: `https:${img('Ginkgo_leaf.jpg', 160)}` } },
          { title: 'Ginkgo biloba', index: 2, description: 'Species of tree' },
        ],
      },
    });
  }
  if (p.action === 'query' && p.generator === 'random') {
    return json({
      query: {
        pages: [
          { title: 'Brillenkauz', extract: 'Der Brillenkauz ist eine Eulenart aus Mittel- und Südamerika. Er ist nachtaktiv.', description: 'Art der Gattung Pulsatrix' },
          { title: 'Hallig', extract: 'Eine Hallig ist eine kleine, nicht oder nur wenig geschützte Marschinsel.', thumbnail: { source: `https:${img('Ginkgo_tree.jpg', 400)}` } },
        ],
      },
    });
  }
  if (p.action === 'query' && p.prop === 'imageinfo') {
    const pages = p.titles.split('|').map((t) => {
      const name = t.replace(/^File:/, '').replace(/ /g, '_');
      const [w, h] = name.startsWith('Ginkgo_leaf') ? [800, 1000] : name.startsWith('Hiroshima') ? [1000, 1000] : [1200, 800];
      return {
        title: lang === 'de' ? `Datei:${t.slice(5)}` : t,
        imageinfo: [
          {
            thumburl: `https:${img(name, 1600)}`,
            thumbwidth: w,
            thumbheight: h,
            descriptionurl: `https://commons.wikimedia.org/wiki/File:${name}`,
            extmetadata: { LicenseShortName: { value: 'CC BY-SA 3.0' }, Artist: { value: 'Photographer' } },
          },
        ],
      };
    });
    return json({ query: { pages } });
  }
  if (p.action === 'parse') {
    if (p.page === 'Template:Did you know' || p.page.startsWith('Wikipedia:Recent additions')) return json({ parse: { title: p.page, text: dykEnHtml } });
    if (p.page.startsWith('Wikipedia:Hauptseite/Schon gewusst')) return json({ parse: { title: p.page, text: dykDeHtml } });
    return json({ parse: { title: p.page, text: articleHtml } });
  }
  return { status: 404, contentType: 'application/json', body: '{}' };
}

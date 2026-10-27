import { describe, expect, it } from 'vitest';
import { htmlToMarkup, parseArticle, parseDyk, splitSentences, tidy, dykTileMarkup } from '../src/wiki/parse';

const frag = (html: string) => new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html').body.firstChild!;

describe('htmlToMarkup', () => {
  it('keeps internal links, drops refs and file links', () => {
    const m = tidy(
      htmlToMarkup(
        frag(
          '<b>Ginkgo</b> is a <a href="/wiki/Genus">genus</a> of <a href="https://x.org" class="external">trees</a><sup class="reference">[1]</sup>. <a href="/wiki/File:X.jpg">img</a>',
        ),
      ),
    );
    expect(m).toBe("'''Ginkgo''' is a [[genus]] of trees. img");
  });
  it('cleans up removed pronunciations', () => {
    const m = tidy(htmlToMarkup(frag('<b>X</b> (<span class="IPA">/eks/</span>; born 1950) was')));
    expect(m).toBe("'''X''' (born 1950) was");
  });
});

describe('splitSentences', () => {
  it('splits English sentences but not abbreviations or links', () => {
    const s = splitSentences("It grew in the U.S. and e.g. China. [[St. Louis]] has one. Mr. Smith agreed!", 'en');
    expect(s).toEqual(['It grew in the U.S. and e.g. China.', '[[St. Louis]] has one.', 'Mr. Smith agreed!']);
  });
  it('does not split German ordinals and abbreviations', () => {
    const s = splitSentences('Er wurde am 3. Oktober 1990 geboren, z. B. in Berlin. Danach zog er um.', 'de');
    expect(s).toEqual(['Er wurde am 3. Oktober 1990 geboren, z. B. in Berlin.', 'Danach zog er um.']);
  });
});

describe('parseArticle', () => {
  const html = `<div class="mw-parser-output">
    <table class="infobox"><caption>Ginkgo</caption>
      <tr><td colspan="2"><a href="/wiki/File:Ginkgo_leaf.jpg" class="mw-file-description"><img src="//upload.wikimedia.org/thumb/250px-Ginkgo_leaf.jpg" width="250"></a><div class="infobox-caption">A leaf</div></td></tr>
      <tr><th>Kingdom</th><td><a href="/wiki/Plant">Plantae</a></td></tr>
    </table>
    <p><b>Ginkgo</b> is a genus of non-flowering seed plants. It is the only living species of its division, first seen 290 million years ago.</p>
    <figure typeof="mw:File/Thumb"><a href="/wiki/File:Tree.jpg" class="mw-file-description"><img src="//upload.wikimedia.org/thumb/220px-Tree.jpg" width="220"></a><figcaption>An old <a href="/wiki/Tree">tree</a></figcaption></figure>
    <div class="mw-heading"><h2>History</h2></div>
    <p>Ginkgo trees survived the Hiroshima bombing in 1945, and several are still alive today.</p>
    <h2>References</h2><p>Some reference text that should be skipped entirely.</p>
  </div>`;
  const a = parseArticle(html, 'en');
  it('extracts the infobox', () => {
    expect(a.infobox?.heading).toBe('Ginkgo');
    expect(a.infobox?.rows).toEqual([['Kingdom', '[[Plantae]]']]);
    expect(a.infobox?.image).toMatchObject({ file: 'Ginkgo leaf.jpg', caption: 'A leaf' });
  });
  it('extracts figures with captions', () => {
    expect(a.figures).toEqual([{ file: 'Tree.jpg', thumb: 'https://upload.wikimedia.org/thumb/220px-Tree.jpg', caption: 'An old [[tree]]', section: '' }]);
    expect(a.paragraphs.map((p) => p.section)).toEqual(['', 'History']);
  });
  it('extracts sentences with sections and skips references', () => {
    expect(a.sentences.map((s) => s.section)).toEqual(['', '', 'History']);
    expect(a.sentences[1].score).toBeGreaterThan(a.sentences[0].score);
    expect(a.lead).toContain("'''Ginkgo'''");
  });
});

describe('parseDyk', () => {
  it('parses English hooks', () => {
    const html = `<ul><li>... that the <b><a href="/wiki/Ginkgo" title="Ginkgo">ginkgo</a></b> (pictured) survived an atomic bomb?</li><li><a href="/wiki/X">Archive</a></li></ul>`;
    const items = parseDyk(html, 'en');
    expect(items).toEqual([{ markup: "... that the '''[[ginkgo]]''' survived an atomic bomb?", article: 'Ginkgo' }]);
    expect(dykTileMarkup(items[0].markup, 'en')).toBe("'''Did you know''' … that the '''[[ginkgo]]''' survived an atomic bomb?");
  });
  it('parses German items', () => {
    const html = `<div class="hauptseite-box-content"><ul><li>Mit <a href="/wiki/TriVis" title="TriVis"><b>TriVis</b></a> wurde die Wettervorhersage dreidimensional.</li></ul><div class="hauptseite-mehr"><ul><li><a href="/wiki/A">Weitere neue Artikel und noch mehr Text hier</a></li></ul></div></div>`;
    expect(parseDyk(html, 'de')).toEqual([{ markup: "Mit [['''TriVis''']] wurde die Wettervorhersage dreidimensional.", article: 'TriVis' }]);
  });
});

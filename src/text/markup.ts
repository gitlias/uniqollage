// Minimal wiki-style markup used for all tile text:
//   [[link text]]   rendered in Wikipedia link blue
//   '''bold'''      ''italic''
// Newlines are hard line breaks. Unbalanced markers are tolerated.

export interface Run {
  text: string;
  link: boolean;
  bold: boolean;
  italic: boolean;
}

export function parseMarkup(src: string): Run[] {
  const runs: Run[] = [];
  let link = false;
  let bold = false;
  let italic = false;
  let buf = '';
  const flush = () => {
    if (!buf) return;
    const last = runs[runs.length - 1];
    if (last && last.link === link && last.bold === bold && last.italic === italic) last.text += buf;
    else runs.push({ text: buf, link, bold, italic });
    buf = '';
  };
  let i = 0;
  while (i < src.length) {
    if (src.startsWith('[[', i) && !link) {
      flush();
      link = true;
      i += 2;
    } else if (src.startsWith(']]', i) && link) {
      flush();
      link = false;
      i += 2;
    } else if (src.startsWith("'''", i)) {
      flush();
      bold = !bold;
      i += 3;
    } else if (src.startsWith("''", i)) {
      flush();
      italic = !italic;
      i += 2;
    } else {
      buf += src[i];
      i++;
    }
  }
  flush();
  return runs;
}

/** Plain text without markup. */
export function stripMarkup(src: string): string {
  return parseMarkup(src)
    .map((r) => r.text)
    .join('');
}

/** Escape literal text so it survives parseMarkup unchanged. */
export function escapeText(text: string): string {
  // Markup characters in Wikipedia prose are rare; replace them with look-alikes.
  return text.replace(/\[\[/g, '[​[').replace(/\]\]/g, ']​]').replace(/''/g, '’’');
}

/** Normalise whitespace and remove soft hyphens / zero-width chars. */
export function cleanText(text: string): string {
  return text
    .replace(/[­​-‍⁠﻿]/g, '')
    .replace(/[ \t\r\n  ]+/g, (m) => (/[  ]/.test(m) && m.length === 1 ? ' ' : ' '));
}

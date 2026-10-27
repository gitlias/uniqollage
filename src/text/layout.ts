import { font, strongDirection, type FontStyle } from './fonts';
import type { Run } from './markup';

export interface TextStyle {
  size: number;
  lineHeight: number;
  /** Font for a run; defaults to the sans family. */
  family?: 'sans' | 'serif';
  color?: string;
  linkColor?: string;
  align?: 'left' | 'center';
  /** Skip outline generation (only the metrics are needed). */
  measureOnly?: boolean;
}

export interface TextBlock {
  height: number;
  lines: number;
  /** Widest line, useful for shrink-wrapping. */
  maxLineWidth: number;
  /** Path data grouped by fill colour, coordinates relative to the block's top-left. */
  paths: { fill: string; d: string }[];
}

export const INK = '#202122';
export const LINK = '#3366cc';

function styleOf(run: Run, family: 'sans' | 'serif'): FontStyle {
  if (family === 'serif') return run.italic ? 'serifItalic' : 'serif';
  if (run.bold && run.italic) return 'sansBoldItalic';
  if (run.bold) return 'sansBold';
  if (run.italic) return 'sansItalic';
  return 'sans';
}

export interface Piece {
  text: string;
  run: Run;
  width: number;
}
export type Word = Piece[] & {
  /** No space before this word (break opportunity inside CJK/Thai text). */
  glue?: boolean;
};

/** Scripts written without spaces between words; Intl.Segmenter finds break opportunities. */
const NO_SPACES = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Script=Tibetan}]/u;
const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;

function breakUnits(text: string): string[] {
  if (!segmenter || !NO_SPACES.test(text)) return [text];
  return [...segmenter.segment(text)].map((s) => s.segment);
}

function wordText(w: Word): string {
  return w.map((p) => p.text).join('');
}

/**
 * Visual order of a line's words (simplified Unicode bidi at word level):
 * runs of words against the paragraph direction are reversed, neutral words
 * (numbers, punctuation) join a run when both neighbours belong to it, and
 * the pieces of a right-to-left word are reversed too.
 */
export function visualOrder(words: Word[], base: 'ltr' | 'rtl'): { word: Word; logical: number }[] {
  const dirs = words.map((w) => strongDirection(wordText(w)));
  const resolved = dirs.map((d, i) => {
    if (d) return d;
    let prev: 'ltr' | 'rtl' | null = null;
    for (let j = i - 1; j >= 0 && !prev; j--) prev = dirs[j];
    let next: 'ltr' | 'rtl' | null = null;
    for (let j = i + 1; j < dirs.length && !next; j++) next = dirs[j];
    return prev && prev === next ? prev : base;
  });
  const items = words.map((w, i) => ({ word: (resolved[i] === 'rtl' ? ([...w].reverse() as Word) : w), logical: i, dir: resolved[i] }));
  const out = base === 'rtl' ? [...items].reverse() : [...items];
  // Re-reverse runs that go against the base direction.
  const against = base === 'rtl' ? 'ltr' : 'rtl';
  for (let i = 0; i < out.length; ) {
    if (out[i].dir !== against) {
      i++;
      continue;
    }
    let j = i;
    while (j < out.length && out[j].dir === against) j++;
    const run = out.slice(i, j).reverse();
    out.splice(i, j - i, ...run);
    i = j;
  }
  return out;
}

function wordWidth(w: Word): number {
  return w.reduce((s, p) => s + p.width, 0);
}

/** Break a too-long word into chunks that each fit `width`. */
function splitWord(word: Word, width: number, measure: (t: string, r: Run) => number): Word[] {
  const out: Word[] = [];
  let cur: Word = [];
  let curW = 0;
  for (const p of word) {
    for (const ch of p.text) {
      const cw = measure(ch, p.run);
      if (curW + cw > width && curW > 0) {
        out.push(cur);
        cur = [];
        curW = 0;
      }
      const last = cur[cur.length - 1];
      if (last && last.run === p.run) {
        last.text += ch;
        last.width += cw;
      } else cur.push({ text: ch, run: p.run, width: cw });
      curW += cw;
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

export function layoutText(runs: Run[], width: number, st: TextStyle): TextBlock {
  const family = st.family ?? 'sans';
  const color = st.color ?? INK;
  const linkColor = st.linkColor ?? LINK;
  const measure = (t: string, r: Run) => font(styleOf(r, family)).measure(t, st.size);

  // Tokenise into paragraphs → words → styled pieces.
  const paragraphs: Word[][] = [[]];
  let word: Word = [];
  let glueNext = false;
  const endWord = (glue = false) => {
    if (word.length) {
      word.glue = glueNext;
      paragraphs[paragraphs.length - 1].push(word);
    }
    word = [];
    glueNext = glue;
  };
  for (const run of runs) {
    const text = run.text.replace(/\u200b/g, '');
    let buf = '';
    const flushBuf = () => {
      const units = breakUnits(buf);
      units.forEach((u, i) => {
        if (i > 0) endWord(true);
        if (u) word.push({ text: u, run, width: measure(u, run) });
      });
      buf = '';
    };
    for (const ch of text) {
      if (ch === ' ' || ch === '\n') {
        flushBuf();
        endWord();
        if (ch === '\n') paragraphs.push([]);
      } else buf += ch;
    }
    flushBuf();
  }
  endWord();

  const spaceW = font(family === 'serif' ? 'serif' : 'sans').measure(' ', st.size);
  const lines: { words: Word[]; width: number; base: 'ltr' | 'rtl' }[] = [];
  for (const para of paragraphs) {
    const base = strongDirection(para.map(wordText).join(' ')) ?? 'ltr';
    let cur: Word[] = [];
    let curW = 0;
    const queue = [...para];
    while (queue.length) {
      const w = queue.shift()!;
      const ww = wordWidth(w);
      const add = cur.length ? (w.glue ? 0 : spaceW) + ww : ww;
      if (curW + add <= width + 1e-6) {
        cur.push(w);
        curW += add;
      } else if (!cur.length) {
        // Single word wider than the line: hard-break it.
        const parts = splitWord(w, width, measure);
        cur.push(parts[0]);
        curW = wordWidth(parts[0]);
        queue.unshift(...parts.slice(1));
        lines.push({ words: cur, width: curW, base });
        cur = [];
        curW = 0;
      } else {
        lines.push({ words: cur, width: curW, base });
        cur = [];
        curW = 0;
        queue.unshift(w);
      }
    }
    lines.push({ words: cur, width: curW, base });
  }
  // Drop a trailing empty line produced by a final newline.
  while (lines.length > 1 && lines[lines.length - 1].words.length === 0) lines.pop();

  const byColor = new Map<string, string>();
  const lh = st.size * st.lineHeight;
  if (!st.measureOnly) lines.forEach((line, i) => {
    const base = line.base;
    let x = st.align === 'center' ? (width - line.width) / 2 : base === 'rtl' ? width - line.width : 0;
    const baseline = i * lh + lh / 2 + st.size * 0.35;
    const visual = visualOrder(line.words, base);
    visual.forEach(({ word: w, logical }, vi) => {
      if (vi > 0) {
        // The space belongs to whichever of the two neighbours comes later in reading order.
        const prev = visual[vi - 1].logical;
        const later = line.words[Math.max(prev, logical)];
        if (Math.abs(prev - logical) !== 1 || !later.glue) x += spaceW;
      }
      for (const p of w) {
        const fill = p.run.link ? linkColor : color;
        const d = font(styleOf(p.run, family)).path(p.text.replace(/ /g, ' '), x, baseline, st.size);
        byColor.set(fill, (byColor.get(fill) ?? '') + d);
        x += p.width;
      }
    });
  });

  return {
    height: lines.length * lh,
    lines: lines.length,
    maxLineWidth: Math.max(0, ...lines.map((l) => l.width)),
    paths: [...byColor].map(([fill, d]) => ({ fill, d })),
  };
}

import { font, type FontStyle } from './fonts';
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

interface Piece {
  text: string;
  run: Run;
  width: number;
}
type Word = Piece[];

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
  const endWord = () => {
    if (word.length) paragraphs[paragraphs.length - 1].push(word);
    word = [];
  };
  for (const run of runs) {
    const text = run.text.replace(/​/g, '');
    let buf = '';
    const flushBuf = () => {
      if (buf) word.push({ text: buf, run, width: measure(buf, run) });
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
  const lines: { words: Word[]; width: number }[] = [];
  for (const para of paragraphs) {
    let cur: Word[] = [];
    let curW = 0;
    const queue = [...para];
    while (queue.length) {
      const w = queue.shift()!;
      const ww = wordWidth(w);
      const add = cur.length ? spaceW + ww : ww;
      if (curW + add <= width + 1e-6) {
        cur.push(w);
        curW += add;
      } else if (!cur.length) {
        // Single word wider than the line: hard-break it.
        const parts = splitWord(w, width, measure);
        cur.push(parts[0]);
        curW = wordWidth(parts[0]);
        queue.unshift(...parts.slice(1));
        lines.push({ words: cur, width: curW });
        cur = [];
        curW = 0;
      } else {
        lines.push({ words: cur, width: curW });
        cur = [];
        curW = 0;
        queue.unshift(w);
      }
    }
    lines.push({ words: cur, width: curW });
  }
  // Drop a trailing empty line produced by a final newline.
  while (lines.length > 1 && lines[lines.length - 1].words.length === 0) lines.pop();

  const byColor = new Map<string, string>();
  const lh = st.size * st.lineHeight;
  if (!st.measureOnly) lines.forEach((line, i) => {
    let x = st.align === 'center' ? (width - line.width) / 2 : 0;
    const baseline = i * lh + lh / 2 + st.size * 0.35;
    line.words.forEach((w, wi) => {
      if (wi > 0) x += spaceW;
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

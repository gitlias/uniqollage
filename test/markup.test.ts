import { describe, expect, it } from 'vitest';
import { parseMarkup, stripMarkup, cleanText } from '../src/text/markup';

describe('parseMarkup', () => {
  it('parses links, bold and italic', () => {
    const runs = parseMarkup("The '''[[Ginkgo]]''' is ''very'' old.");
    expect(runs).toEqual([
      { text: 'The ', link: false, bold: false, italic: false },
      { text: 'Ginkgo', link: true, bold: true, italic: false },
      { text: ' is ', link: false, bold: false, italic: false },
      { text: 'very', link: false, bold: false, italic: true },
      { text: ' old.', link: false, bold: false, italic: false },
    ]);
  });
  it('tolerates unbalanced markers', () => {
    expect(stripMarkup("a [[b ''c")).toBe('a b c');
  });
  it('cleans soft hyphens and whitespace', () => {
    expect(cleanText('sozia­listische\n  Partei')).toBe('sozialistische Partei');
  });
});

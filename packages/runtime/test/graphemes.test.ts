/**
 * Letters, words, and lines (D69.2): the segmentation of extended grapheme
 * clusters meets every case of the conformance file of its Unicode version,
 * and agrees with the ICU of Node when that ICU has the same version.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { GRAPHEME_TABLE, UNICODE_VERSION } from '../src/grapheme-table.js';
import { graphemes, isWhiteSpace, textLayout } from '../src/graphemes.js';

const conformance = readFileSync(
  new URL(`./unicode/GraphemeBreakTest-${UNICODE_VERSION}.txt`, import.meta.url),
  'utf8',
);

/** The cases of the file: the text and its clusters. */
function cases(): { readonly line: string; readonly clusters: string[] }[] {
  const out: { line: string; clusters: string[] }[] = [];
  for (const raw of conformance.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    if (line === '') continue;
    const clusters: string[] = [];
    let current = '';
    for (const token of line.split(/\s+/)) {
      if (token === '÷') {
        if (current !== '') clusters.push(current);
        current = '';
      } else if (token !== '×') {
        current += String.fromCodePoint(Number.parseInt(token, 16));
      }
    }
    out.push({ line, clusters });
  }
  return out;
}

describe('graphemes (D69.2)', () => {
  it(`passes every case of GraphemeBreakTest-${UNICODE_VERSION}.txt`, () => {
    const all = cases();
    expect(all.length).toBeGreaterThan(700);
    const failures = all.filter(({ clusters }) => {
      return JSON.stringify(graphemes(clusters.join(''))) !== JSON.stringify(clusters);
    });
    expect(failures.map(({ line }) => line)).toEqual([]);
  });

  it('keeps an emoji sequence, a flag, a combining mark, and a Hangul syllable whole', () => {
    expect(graphemes('été')).toEqual(['é', 't', 'é']);
    expect(graphemes('👩‍👩‍👧‍👦!')).toEqual(['👩‍👩‍👧‍👦', '!']);
    expect(graphemes('🇵🇱🇩🇪🇫')).toEqual(['🇵🇱', '🇩🇪', '🇫']);
    expect(graphemes('각a')).toEqual(['각', 'a']);
    expect(graphemes('क्षि')).toEqual(['क्षि']);
    expect(graphemes('')).toEqual([]);
  });

  it('table covers every code point exactly once', () => {
    let total = 0;
    for (const [, length = ''] of GRAPHEME_TABLE.matchAll(/([0-9a-z]+)([A-Z])/g)) {
      total += Number.parseInt(length, 36);
    }
    expect(total).toBe(0x110000);
  });

  const icu = (process.versions as Record<string, string | undefined>)['unicode'];
  it.runIf(icu !== undefined && `${icu}.0`.startsWith(UNICODE_VERSION.slice(0, 4)))(
    "agrees with Node's Intl.Segmenter of the same Unicode version on pairs of every code point",
    () => {
      const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
      const icuClusters = (text: string): string[] =>
        Array.from(segmenter.segment(text), (segment) => segment.segment);
      // Every code point between partners that exercise the rules, in long runs
      // segmented whole: any difference of a class shows as a different cluster.
      const partners = ['a', '\u0308', '\u200d', '\u094d', '\u0915', '🇦', '\u1100', '\u1161', '©'];
      const differ: string[] = [];
      let text = '';
      const flush = (): void => {
        if (JSON.stringify(graphemes(text)) !== JSON.stringify(icuClusters(text))) {
          differ.push(text.slice(0, 40));
        }
        text = '';
      };
      for (let codePoint = 0; codePoint <= 0x10ffff; codePoint += 1) {
        if (codePoint >= 0xd800 && codePoint <= 0xdfff) continue;
        const c = String.fromCodePoint(codePoint);
        text += partners.map((partner) => c + partner).join('');
        if (codePoint % 1024 === 1023) flush();
      }
      flush();
      expect(differ).toEqual([]);
    },
    120_000,
  );
});

describe('white space and the layout of a text (D69.2)', () => {
  it('takes the white space of ECMAScript and nothing else', () => {
    for (let codePoint = 0; codePoint <= 0xffff; codePoint += 1) {
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) continue;
      expect(isWhiteSpace(codePoint), codePoint.toString(16)).toBe(
        /\s/u.test(String.fromCodePoint(codePoint)),
      );
    }
  });

  it('splits lines at a line feed, words at white space, and letters by graphemes', () => {
    const layout = textLayout('  Kadrion  dancé\n\n é \t');
    expect(layout.lines).toEqual([
      {
        runs: [
          { space: '  ' },
          { letters: ['K', 'a', 'd', 'r', 'i', 'o', 'n'] },
          { space: '  ' },
          { letters: ['d', 'a', 'n', 'c', 'é'] },
        ],
      },
      { runs: [] },
      { runs: [{ space: ' ' }, { letters: ['é'] }, { space: ' \t' }] },
    ]);
    expect([layout.letters, layout.words, layout.fragmentLines]).toEqual([13, 3, 2]);
    const joined = layout.lines
      .map((line) => line.runs.map((run) => ('space' in run ? run.space : run.letters.join(''))))
      .map((runs) => runs.join(''))
      .join('\n');
    expect(joined).toBe('  Kadrion  dancé\n\n é \t');
  });

  it('gives an empty text no fragment at all', () => {
    expect(textLayout('')).toEqual({
      lines: [{ runs: [] }],
      letters: 0,
      words: 0,
      fragmentLines: 0,
    });
  });
});

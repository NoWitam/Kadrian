/**
 * Captions (D57): the lines and pages are a pure function of the words and
 * the style, without measuring text, and the page shown and the word spoken
 * at every time follow from the word timings alone.
 */
import { validateComposition, type CaptionsNode, type CaptionWord } from '@kadrion/schema';
import { captionsComposition, captionsGoldenTimestamps } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { captionAt, captionPages, evaluateComposition } from '../src/index.js';

function validated(document: unknown) {
  const result = validateComposition(document);
  if (!result.ok) throw new Error(result.errors[0]?.message);
  return result.composition;
}

const composition = validated(captionsComposition);
const node = composition.scenes[0]?.nodes.find(
  (item): item is CaptionsNode => item.type === 'captions',
) as CaptionsNode;

function words(...texts: string[]): CaptionWord[] {
  return texts.map((text, at) => ({ text, startUs: at * 100, durationUs: 100 }));
}

describe('captionPages (D57.3)', () => {
  it('fills the lines of the fixture greedily and makes two pages of two lines', () => {
    // "Kadrion renders" is 15 characters; " scenes" would make 22 > 16.
    expect(captionPages(node.words, node.style)).toEqual([
      { firstWord: 0, lines: [{ words: [0, 1] }, { words: [2, 3, 4] }] },
      { firstWord: 5, lines: [{ words: [5, 6, 7, 8] }, { words: [9] }] },
    ]);
  });

  it('counts one space between two words, and fills a line to exactly its length', () => {
    const style = { maxLineLength: 7, maxLines: 10 };
    expect(captionPages(words('abc', 'def', 'g'), style)).toEqual([
      { firstWord: 0, lines: [{ words: [0, 1] }, { words: [2] }] },
    ]);
  });

  it('puts a word longer than a line on a line of its own', () => {
    const style = { maxLineLength: 3, maxLines: 1 };
    expect(captionPages(words('a', 'abcdef', 'b'), style).map(({ lines }) => lines)).toEqual([
      [{ words: [0] }],
      [{ words: [1] }],
      [{ words: [2] }],
    ]);
  });

  it('counts Unicode code points, not UTF-16 units', () => {
    // Each emoji is one code point and two UTF-16 code units.
    const style = { maxLineLength: 3, maxLines: 1 };
    expect(captionPages(words('😀', '😀'), style)).toEqual([
      { firstWord: 0, lines: [{ words: [0, 1] }] },
    ]);
  });

  it('makes no page of no words', () => {
    expect(captionPages([], { maxLineLength: 10, maxLines: 2 })).toEqual([]);
  });
});

describe('captionAt (D57.4)', () => {
  const pages = captionPages(node.words, node.style);
  it.each([
    [0, null, null],
    [199_999, null, null],
    [200_000, 0, 0],
    [499_999, 0, 0],
    [500_000, 0, 1],
    [1_599_999, 0, 4],
    // The pause after the first page: the page stays, no word is highlighted.
    [1_600_000, 0, null],
    [1_799_999, 0, null],
    [1_800_000, 1, 5],
    [2_966_666, 1, 9],
  ])('at %i µs shows page %s and highlights word %s', (timeUs, page, word) => {
    expect(captionAt(node.words, pages, timeUs)).toEqual({ page, word });
  });
});

describe('evaluateComposition of captions (D57.4)', () => {
  it('reports the page and the word at each golden timestamp', () => {
    const states = captionsGoldenTimestamps.map(({ timeUs }) => {
      const state = evaluateComposition(composition, timeUs).scenes[0]?.nodes[1];
      return state?.type === 'captions' ? [state.page, state.word] : null;
    });
    expect(states).toEqual([
      [null, null],
      [0, 0],
      [0, 3],
      [0, null],
      [1, 8],
      [1, 9],
    ]);
  });

  it('reports neither while the node is not active', () => {
    const late = validated({
      ...(structuredClone(captionsComposition) as object),
      scenes: composition.scenes.map((scene) => ({
        ...scene,
        nodes: scene.nodes.map((item) =>
          item.type === 'captions' ? { ...item, startUs: 1_000_000, durationUs: 500_000 } : item,
        ),
      })),
    });
    for (const timeUs of [300_000, 1_700_000]) {
      const state = evaluateComposition(late, timeUs).scenes[0]?.nodes[1];
      expect(state).toMatchObject({ type: 'captions', active: false, page: null, word: null });
    }
    const inside = evaluateComposition(late, 1_200_000).scenes[0]?.nodes[1];
    expect(inside).toMatchObject({ active: true, page: 0, word: 3 });
  });

  it('carries the transform of the node like any leaf', () => {
    const state = evaluateComposition(composition, 300_000).scenes[0]?.nodes[1];
    expect(state).toEqual({
      id: 'captions',
      type: 'captions',
      active: true,
      position: { x: 40, y: 200 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      origin: { x: 0, y: 0 },
      opacity: 1,
      color: '#ffffff',
      page: 0,
      word: 0,
      fragments: null,
      effects: [],
    });
  });
});

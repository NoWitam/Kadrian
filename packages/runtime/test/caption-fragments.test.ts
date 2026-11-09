/**
 * Animated captions (D70): which captions node is drawn in pieces, and the
 * state of every line and word of the page shown — the entrance and the exit
 * of a page, one fragment after another, and the highlight of the word being
 * spoken, in its own time and at no other time.
 */
import { validateComposition, type CaptionsNode } from '@kadrion/schema';
import { captionsComposition, captionsMotionComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  captionAt,
  captionFragments,
  captionPages,
  captionsInPieces,
  evaluateComposition,
  type CaptionFragmentsState,
  type FragmentState,
} from '../src/index.js';

function validated(document: unknown) {
  const result = validateComposition(document);
  if (!result.ok) throw new Error(result.errors[0]?.message);
  return result.composition;
}

const motion = validated(captionsMotionComposition);

function captionsNode(id: string): CaptionsNode {
  const found = motion.scenes[0]?.nodes.find(
    (item): item is CaptionsNode => item.type === 'captions' && item.id === id,
  );
  if (found === undefined) throw new Error(`No captions node ${id}.`);
  return found;
}

const pop = captionsNode('captions-pop');
const bounce = captionsNode('captions-bounce');

function fragmentsAt(node: CaptionsNode, timeUs: number): CaptionFragmentsState | null {
  const pages = captionPages(node.words, node.style);
  return captionFragments(
    node,
    pages,
    captionAt(node.words, pages, timeUs),
    node.style.color,
    timeUs,
  );
}

function fragmentsOf(node: CaptionsNode, timeUs: number): CaptionFragmentsState {
  const fragments = fragmentsAt(node, timeUs);
  if (fragments === null) throw new Error('Not in pieces.');
  return fragments;
}

const at = (list: readonly FragmentState[], index: number): FragmentState => {
  const fragment = list[index];
  if (fragment === undefined) throw new Error(`No fragment ${String(index)}.`);
  return fragment;
};

describe('captionsInPieces (D70)', () => {
  const style = (
    validated(captionsComposition).scenes[0]?.nodes.find(
      (item): item is CaptionsNode => item.type === 'captions',
    ) as CaptionsNode
  ).style;

  it('keeps the captions of 0.14 in one piece: a colour, an outline, and a shadow move nothing', () => {
    expect(captionsInPieces(style)).toBe(false);
    expect(
      captionsInPieces({
        ...style,
        highlight: { ...style.highlight, color: '#00ff00' },
        stroke: { kind: 'outside', color: '#000000', width: 2 },
        shadow: { kind: 'drop', color: '#000000', opacity: 1, offset: { x: 1, y: 1 }, blur: 0 },
      }),
    ).toBe(false);
  });

  const solidBox = {
    kind: 'solid',
    color: '#000000',
    opacity: 1,
    padding: 2,
    cornerRadius: 0,
  } as const;
  const animate = {
    kind: 'animate',
    unit: 'word',
    staggerUs: 0,
    order: { kind: 'forward' },
    tracks: [
      {
        property: 'opacity',
        keyframes: [
          { timeUs: 0, value: 0, easing: { kind: 'linear' } },
          { timeUs: 1, value: 1, easing: { kind: 'linear' } },
        ],
      },
    ],
  } as const;
  it.each([
    ['a box behind the lines', { box: solidBox }],
    ['a scale of the highlight', { highlight: { ...style.highlight, scale: 1.1 } }],
    ['tracks of the highlight', { highlight: { ...style.highlight, tracks: animate.tracks } }],
    [
      'an underline',
      {
        highlight: {
          ...style.highlight,
          underline: { kind: 'solid', color: '#ffffff', thickness: 2, offset: 0 },
        },
      },
    ],
    ['a box of the highlight', { highlight: { ...style.highlight, box: solidBox } }],
    ['an entrance', { pageIn: animate }],
    ['an exit', { pageOut: animate }],
  ] as const)('draws in pieces a style with %s', (_name, change) => {
    expect(captionsInPieces({ ...style, ...change })).toBe(true);
  });

  it('leaves a node of 0.14 without fragments in the evaluated state', () => {
    const composition = validated(captionsComposition);
    for (const timeUs of [0, 500_000, 1_900_000]) {
      const state = evaluateComposition(composition, timeUs).scenes[0]?.nodes[1];
      expect(state?.type === 'captions' && state.fragments).toBeNull();
    }
  });
});

describe('captionFragments: the pages of the fixture (D57.3)', () => {
  it('makes two pages of each node', () => {
    expect(captionPages(pop.words, pop.style)).toEqual([
      { firstWord: 0, lines: [{ words: [0, 1] }, { words: [2, 3, 4] }] },
      { firstWord: 5, lines: [{ words: [5, 6] }, { words: [7] }] },
    ]);
    expect(captionPages(bounce.words, bounce.style)).toEqual([
      { firstWord: 0, lines: [{ words: [0, 1, 2] }, { words: [3, 4] }] },
      { firstWord: 5, lines: [{ words: [5, 6] }] },
    ]);
  });

  it('has no fragment while no page is shown, and one per line and word of the page shown', () => {
    expect(fragmentsOf(pop, 99_999)).toEqual({ lines: [], words: [] });
    const first = fragmentsOf(pop, 100_000);
    expect([first.lines.length, first.words.length]).toEqual([2, 5]);
    const second = fragmentsOf(pop, 1_100_000);
    expect([second.lines.length, second.words.length]).toEqual([2, 3]);
  });
});

describe('captionFragments: the entrance of a page (D70)', () => {
  it('gives the word of step k the own time t − start − k·s, before which it holds its first keyframe', () => {
    // The page starts at 100 000 µs; the words follow 80 000 µs apart.
    const { words } = fragmentsOf(pop, 200_000);
    expect(words.map(({ opacity }) => opacity)).toEqual([0.5, 0.1, 0, 0, 0]);
    expect(at(words, 4).offset).toEqual({ x: 0, y: 20 });
    // Once the last word has entered, every word is at rest.
    const settled = fragmentsOf(pop, 100_000 + 4 * 80_000 + 200_000);
    for (const fragment of settled.words) {
      expect([fragment.opacity, fragment.offset]).toEqual([1, { x: 0, y: 0 }]);
    }
  });

  it('enters the lines of a page backward: the last line first', () => {
    // The first page starts at 200 000 µs; the second line is step 0.
    const { lines } = fragmentsOf(bounce, 320_000);
    expect(at(lines, 1)).toEqual({
      opacity: 1,
      offset: { x: 0, y: 0 },
      scale: at(lines, 1).scale,
      rotation: 0,
      color: at(lines, 1).color,
    });
    expect(at(lines, 1).scale.x).toBeGreaterThan(0);
    expect(at(lines, 0).scale).toEqual({ x: 0, y: 0 });
    expect(at(lines, 0).color).toBe('#12b76a');
    // A line track leaves the words at rest, but for the one being spoken.
    expect(at(fragmentsOf(bounce, 320_000).words, 3).color).toBe('#e4e7ec');
  });

  it('enters every page, each from the start of its first word', () => {
    const { words } = fragmentsOf(pop, 1_200_000);
    // 'dances' starts the second page at 1 100 000 µs.
    expect(words.map(({ opacity }) => opacity)).toEqual([0.5, 0.1, 0]);
  });
});

describe('captionFragments: the exit of a page (D70)', () => {
  // The first page ends where the second begins, at 1 100 000 µs. Its exit has
  // a length of 150 000 µs and the steps 0, 1, 2, 1, 0 of `edges`, 50 000 µs apart.
  it('lets the last step reach its last keyframe exactly at the end of the page', () => {
    const { words } = fragmentsOf(pop, 1_050_000);
    // Step s has the own time t − end + L + (S − 1 − s)·s = 100 000 + (2 − s)·50 000.
    const close = (list: readonly FragmentState[], expected: readonly number[]): void => {
      expect(list).toHaveLength(expected.length);
      list.forEach(({ opacity }, index) => {
        expect(opacity).toBeCloseTo(expected[index] ?? NaN, 12);
      });
    };
    close(words, [0, 0, 1 / 3, 0, 0]);
    close(fragmentsOf(pop, 1_000_000).words, [0, 1 / 3, 2 / 3, 1 / 3, 0]);
    const last = fragmentsOf(pop, 1_099_999);
    expect(at(last.words, 2).opacity).toBeCloseTo(0, 4);
    expect(at(last.words, 2).opacity).toBeGreaterThan(0);
  });

  it('holds every word at rest before its exit begins', () => {
    const { words } = fragmentsOf(pop, 800_000);
    expect(words.map(({ opacity }) => opacity)).toEqual([1, 1, 1, 1, 1]);
  });

  it('ends the last page at the end of its last word', () => {
    // 'stride' ends at 1 680 000 µs; the page stays, faded out, until the node ends.
    // Its three words have the steps 0, 1, 0: the exit begins 200 000 µs before
    // the end, after the entrance of the page has ended at 1 460 000 µs.
    const before = fragmentsOf(pop, 1_470_000);
    expect(before.words.map(({ opacity }) => opacity)).toEqual([1, 1, 1]);
    const after = fragmentsOf(pop, 1_680_000);
    expect(after.words.map(({ opacity }) => opacity)).toEqual([0, 0, 0]);
    expect(fragmentsOf(pop, 1_999_999).words).toHaveLength(3);
  });
});

describe('captionFragments: the highlight (D70)', () => {
  it('gives the spoken word the highlight colour and scale, on top of its entrance', () => {
    const { words } = fragmentsOf(pop, 200_000);
    expect(at(words, 0).color).toBe('#ffd400');
    expect(at(words, 0).scale).toEqual({ x: 1.25, y: 1.25 });
    expect(at(words, 0).opacity).toBe(0.5);
    expect(at(words, 1).color).toBe('#ffffff');
    expect(at(words, 1).scale).toEqual({ x: 1, y: 1 });
  });

  it('plays the tracks of the highlight in the word’s own time, while it is spoken only', () => {
    // 'stars' is spoken from 200 000 µs for 200 000 µs.
    const spoken = at(fragmentsOf(bounce, 300_000).words, 0);
    expect(spoken).toEqual({
      opacity: 1,
      offset: { x: 0, y: -12 },
      scale: { x: 1, y: 1 },
      rotation: -3,
      color: '#ffffff',
    });
    // In the pause after it, no word is spoken and every word is at rest.
    for (const word of fragmentsOf(bounce, 410_000).words) {
      expect(word).toEqual({
        opacity: 1,
        offset: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        color: '#e4e7ec',
      });
    }
  });

  it('starts the tracks again for every word', () => {
    const first = at(fragmentsOf(bounce, 300_000).words, 0);
    const second = at(fragmentsOf(bounce, 530_000).words, 1);
    expect(second).toEqual(first);
  });
});

describe('the fragments in the evaluated state (D70)', () => {
  it('reports them beside the page and the word, from the colour of the node at that instant', () => {
    const state = evaluateComposition(motion, 300_000).scenes[0]?.nodes[2];
    expect(state?.type).toBe('captions');
    if (state?.type !== 'captions') return;
    expect([state.page, state.word]).toEqual([0, 0]);
    expect(state.fragments).toEqual(fragmentsAt(bounce, 300_000));
  });

  it('has empty lists while the node is not active', () => {
    const late = validated({
      ...(structuredClone(captionsMotionComposition) as object),
      scenes: motion.scenes.map((scene) => ({
        ...scene,
        nodes: scene.nodes.map((item) =>
          item.type === 'captions' ? { ...item, startUs: 500_000, durationUs: 1_500_000 } : item,
        ),
      })),
    });
    const state = evaluateComposition(late, 300_000).scenes[0]?.nodes[1];
    expect(state?.type === 'captions' && state.fragments).toEqual({ lines: [], words: [] });
  });
});

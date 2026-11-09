/**
 * Text animated in fragments (D69): the step of each fragment in each order,
 * the own time of a fragment in each phase, and the combination of several
 * text animations, against values derived by hand.
 */
import { compositionSchema, type TextAnimation, type TextNode } from '@kadrion/schema';
import { textComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { TRACK_BOUNDS } from '../src/fragments.js';
import { evaluateComposition, fragmentSteps, textFragments } from '../src/index.js';
import { validated } from './support.js';

const LINEAR = { kind: 'linear' } as const;

/** A text of 2 s from 1 s with the given text and text animations, plain otherwise. */
function text(content: string, textAnimations: readonly TextAnimation[]): TextNode {
  return {
    id: 'node-text',
    type: 'text',
    startUs: 1_000_000,
    durationUs: 2_000_000,
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    origin: { x: 0, y: 0 },
    opacity: 1,
    animations: [],
    text: content,
    fontAssetId: 'asset-font',
    fontSize: 40,
    color: '#ffffff',
    style: { stroke: { kind: 'none' }, shadow: { kind: 'none' }, box: { kind: 'none' } },
    textAnimations,
    effects: [],
  };
}

/** A fade of each fragment from 0 to 1 over 100 ms, linear. */
function fade(
  unit: TextAnimation['unit'],
  phase: TextAnimation['phase'],
  staggerUs: number,
  order: TextAnimation['order'] = { kind: 'forward' },
): TextAnimation {
  return {
    id: `text-${unit}`,
    unit,
    phase,
    staggerUs,
    order,
    tracks: [
      {
        property: 'opacity',
        keyframes: [
          { timeUs: 0, value: 0, easing: LINEAR },
          { timeUs: 100_000, value: 1, easing: LINEAR },
        ],
      },
    ],
  };
}

const opacities = (node: TextNode, timeUs: number, unit: 'letters' | 'words' | 'lines'): number[] =>
  (textFragments(node, '#ffffff', timeUs)?.[unit] ?? []).map(({ opacity }) => opacity);

/**
 * Fisher–Yates with `mulberry32` as published (its float output times 2^32),
 * written apart from the runtime: step k is the fragment at position k.
 */
function referenceShuffle(seed: number, count: number): number[] {
  let a = seed;
  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const order = Array.from({ length: count }, (_, index) => index);
  for (let last = count - 1; last > 0; last -= 1) {
    const other = (next() * 4294967296) % (last + 1);
    [order[last], order[other]] = [order[other] ?? 0, order[last] ?? 0];
  }
  const steps: number[] = [];
  order.forEach((fragment, step) => {
    steps[fragment] = step;
  });
  return steps;
}

describe('the steps of an order (D69.4)', () => {
  it('runs forward and backward one fragment per step', () => {
    expect(fragmentSteps({ kind: 'forward' }, 5)).toEqual([0, 1, 2, 3, 4]);
    expect(fragmentSteps({ kind: 'backward' }, 5)).toEqual([4, 3, 2, 1, 0]);
  });

  it('starts center in the middle and edges at both ends, two fragments a step', () => {
    expect(fragmentSteps({ kind: 'center' }, 5)).toEqual([2, 1, 0, 1, 2]);
    expect(fragmentSteps({ kind: 'center' }, 4)).toEqual([1, 0, 0, 1]);
    expect(fragmentSteps({ kind: 'edges' }, 5)).toEqual([0, 1, 2, 1, 0]);
    expect(fragmentSteps({ kind: 'edges' }, 4)).toEqual([0, 1, 1, 0]);
    expect(fragmentSteps({ kind: 'edges' }, 1)).toEqual([0]);
  });

  it('gives no fragment no step', () => {
    for (const kind of ['forward', 'backward', 'center', 'edges'] as const) {
      expect(fragmentSteps({ kind }, 0)).toEqual([]);
    }
    expect(fragmentSteps({ kind: 'random', seed: 7 }, 0)).toEqual([]);
  });

  it('shuffles random by Fisher–Yates with mulberry32 from the seed, the same every time', () => {
    for (const seed of [0, 1, 7, 2 ** 31, 4_294_967_295]) {
      for (const count of [1, 2, 13, 40]) {
        const steps = fragmentSteps({ kind: 'random', seed }, count);
        expect(steps).toEqual(referenceShuffle(seed, count));
        expect([...steps].sort((a, b) => a - b)).toEqual(
          Array.from({ length: count }, (_, index) => index),
        );
      }
    }
    // Pinned once, so that a change of the generator shows as a change of this line.
    expect(fragmentSteps({ kind: 'random', seed: 7 }, 8)).toEqual(referenceShuffle(7, 8));
    expect(fragmentSteps({ kind: 'random', seed: 7 }, 8)).not.toEqual(
      fragmentSteps({ kind: 'random', seed: 8 }, 8),
    );
  });
});

describe('the own time of a fragment (D69.3)', () => {
  it('starts step 0 of in at the start of the node, each step a stagger later', () => {
    const node = text('abc', [fade('letter', { kind: 'in' }, 50_000)]);
    expect(opacities(node, 1_000_000, 'letters')).toEqual([0, 0, 0]);
    expect(opacities(node, 1_075_000, 'letters')).toEqual([0.75, 0.25, 0]);
    expect(opacities(node, 1_200_000, 'letters')).toEqual([1, 1, 1]);
  });

  it('starts step 0 of accent at its scene time', () => {
    const node = text('ab', [fade('letter', { kind: 'accent', startUs: 1_500_000 }, 100_000)]);
    expect(opacities(node, 1_400_000, 'letters')).toEqual([0, 0]);
    expect(opacities(node, 1_550_000, 'letters')).toEqual([0.5, 0]);
    expect(opacities(node, 1_650_000, 'letters')).toEqual([1, 0.5]);
  });

  it('ends the last keyframe of the last step of out at the end of the node', () => {
    // Three words, the last step ends at 3 s: step 2 starts at 2.9 s, step 0 at 2.7 s.
    const node = text('one two six', [fade('word', { kind: 'out' }, 100_000)]);
    expect(opacities(node, 2_700_000, 'words')).toEqual([0, 0, 0]);
    expect(opacities(node, 2_850_000, 'words')).toEqual([1, 0.5, 0]);
    expect(opacities(node, 2_999_999, 'words')).toEqual([1, 1, 1 - 1 / 100_000]);
  });

  it('counts the steps of out by its order: two words of center share a step', () => {
    const node = text('a b c d', [fade('word', { kind: 'out' }, 100_000, { kind: 'center' })]);
    // Two steps: step 1 (the outer words) starts at 2.9 s, step 0 at 2.8 s.
    expect(opacities(node, 2_850_000, 'words')).toEqual([0, 0.5, 0.5, 0]);
  });

  it('runs every line that holds a word, and no empty line', () => {
    const node = text('ab\n\n  \ncd', [fade('line', { kind: 'in' }, 100_000)]);
    expect(opacities(node, 1_150_000, 'lines')).toEqual([1, 0.5]);
  });
});

describe('the fragments of a text node (D69)', () => {
  it('is null for a text without text animations', () => {
    expect(textFragments(text('abc', []), '#ffffff', 0)).toBeNull();
  });

  it('lists the fragments of each unit an animation uses, in the order of the text, and none of another', () => {
    const fragments = textFragments(
      text('Kadrion  dancé 👩‍👩‍👧', [fade('letter', { kind: 'in' }, 0)]),
      '#123456',
      1_000_000,
    );
    expect(fragments?.letters).toHaveLength(13);
    expect(fragments?.words).toEqual([]);
    expect(fragments?.lines).toEqual([]);
    expect(fragments?.letters[0]).toStrictEqual({
      opacity: 0,
      offset: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      color: '#123456',
    });
  });

  it('multiplies opacity and scale, adds offset and rotation, and lets the last colour win', () => {
    const track = <P extends string, V>(property: P, a: V, b: V) => ({
      property,
      keyframes: [
        { timeUs: 0, value: a, easing: LINEAR },
        { timeUs: 1_000_000, value: b, easing: LINEAR },
      ],
    });
    const animation = (id: string, tracks: TextAnimation['tracks']): TextAnimation => ({
      id,
      unit: 'word',
      phase: { kind: 'in' },
      staggerUs: 0,
      order: { kind: 'forward' },
      tracks,
    });
    const node = text('one', [
      animation('text-a', [
        track('opacity', 0, 1),
        track('scale', { x: 0, y: 2 }, { x: 2, y: 4 }),
        track('offset', { x: 0, y: 10 }, { x: 10, y: 30 }),
        track('rotation', -90, 90),
        track('color', '#000000', '#ffffff'),
      ] as TextAnimation['tracks']),
      animation('text-b', [
        track('opacity', 0.5, 0.5),
        track('scale', { x: 3, y: 3 }, { x: 3, y: 3 }),
        track('offset', { x: -1, y: -2 }, { x: -1, y: -2 }),
        track('rotation', 10, 10),
        track('color', '#ff0000', '#ff0000'),
      ] as TextAnimation['tracks']),
    ]);
    expect(textFragments(node, '#00ff00', 1_250_000)?.words).toStrictEqual([
      {
        opacity: 0.25 * 0.5,
        offset: { x: 2.5 - 1, y: 15 - 2 },
        scale: { x: 0.5 * 3, y: 2.5 * 3 },
        rotation: -45 + 10,
        color: '#ff0000',
      },
    ]);
  });

  it('reports a rotation of -0 degrees as 0', () => {
    const node = text('a', [
      {
        ...fade('letter', { kind: 'in' }, 0),
        tracks: [
          {
            property: 'rotation',
            keyframes: [
              { timeUs: 0, value: -0, easing: LINEAR },
              { timeUs: 1, value: -0, easing: LINEAR },
            ],
          },
        ],
      },
    ]);
    expect(Object.is(textFragments(node, '#ffffff', 1_000_000)?.letters[0]?.rotation, 0)).toBe(
      true,
    );
  });

  it('is in the state of a text node, and moves with its scene', () => {
    const state = evaluateComposition(validated(textComposition), 300_000);
    const node = state.scenes[0]?.nodes.find(({ id }) => id === 'node-letters');
    if (node?.type !== 'text') throw new Error('No text.');
    expect(node.fragments?.letters).toHaveLength(13);
    expect(node.fragments?.letters.map(({ opacity }) => opacity > 0)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('the bounds of a track (D67.6, D69)', () => {
  it('are the bounds of each track of a text animation in the schema', () => {
    const found: Record<string, unknown> = {};
    const walk = (node: unknown): void => {
      if (typeof node !== 'object' || node === null) return;
      const properties = (node as { properties?: Record<string, unknown> }).properties;
      const textAnimations = properties?.['textAnimations'] as
        { items: { properties: { tracks: { items: { oneOf: unknown[] } } } } } | undefined;
      if (textAnimations !== undefined) {
        for (const track of textAnimations.items.properties.tracks.items.oneOf) {
          const trackProperties = (track as { properties: Record<string, unknown> }).properties;
          const property = (trackProperties['property'] as { const: string }).const;
          const value = (
            trackProperties['keyframes'] as {
              items: { properties: { value: Record<string, unknown> } };
            }
          ).items.properties.value;
          const channels = value['properties'] as
            Record<string, Record<string, unknown>> | undefined;
          const scalar = channels?.['x'] ?? value;
          found[property] = { min: scalar['minimum'], max: scalar['maximum'] };
        }
      }
      for (const child of Object.values(node)) walk(child);
    };
    walk(compositionSchema);
    expect(found['color']).toEqual({ min: undefined, max: undefined });
    expect(found).toEqual({ ...TRACK_BOUNDS, color: found['color'] });
    expect(TRACK_BOUNDS.color).toEqual({ min: 0, max: 255 });
  });
});

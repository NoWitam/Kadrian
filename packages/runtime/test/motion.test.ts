/**
 * The rows of D68 in the evaluated state: rotation and origin are offsets
 * added to the base value, like a position (D16.6); size, colour, crop, and
 * corner radius replace it. A colour is interpolated per sRGB channel and
 * rounded once, halves upwards; two opposite insets that an eased segment
 * pushes past 999 per mille are reduced in proportion. The expected values are
 * written out by the arithmetic rule of D18, independently of the samplers.
 */
import { motionComposition, motionGoldenTimestamps } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { evaluateComposition, type NodeState } from '../src/index.js';
import { easedValue } from '../src/easing.js';
import { PROPERTY_BOUNDS } from '../src/keyframes.js';
import {
  derived,
  draftNode,
  reference,
  referenceDraft,
  stateNode,
  validated,
  type Draft,
} from './support.js';

/** A linear segment of D18.3: `a + ((b − a) · elapsed) / span`. */
const linear = (a: number, b: number, elapsed: number, span: number): number =>
  a + ((b - a) * elapsed) / span;

/** An animation of the given keyframes, each `[timeUs, value]`, every segment linear. */
function keyframed(id: string, property: string, ...keyframes: [number, unknown][]): never {
  return {
    id,
    property,
    keyframes: keyframes.map(([timeUs, value]) => ({ timeUs, value, easing: { kind: 'linear' } })),
  } as never;
}

function backgroundOf(draft: Draft): { color: string; animations: unknown[] } {
  const node = draft.scenes[0]?.nodes[0];
  if (node?.type !== 'background') throw new Error('The first node is the background.');
  return node;
}

describe('rotation and origin are offsets added to the base value (D68)', () => {
  it('adds the sampled rotation to the base rotation in one operation', () => {
    const document = derived((draft) => {
      const title = draftNode(draft, 'node-title');
      title.rotation = 12.5;
      title.animations = [keyframed('anim-title-rotation', 'rotation', [0, -30], [3, 60])];
    });
    expect(stateNode(evaluateComposition(document, 2), 'node-title')).toMatchObject({
      rotation: 12.5 + linear(-30, 60, 2, 3),
    });
    expect(stateNode(evaluateComposition(document, 3), 'node-title')).toMatchObject({
      rotation: 12.5 + 60,
    });
  });

  it('adds the sampled origin to the base origin, channel by channel', () => {
    const document = derived((draft) => {
      const image = draftNode(draft, 'node-image');
      image.origin = { x: 500, y: 250 };
      image.animations = [
        keyframed('anim-image-origin', 'origin', [0, { x: 0, y: 0 }], [3, { x: -500, y: 750 }]),
      ];
    });
    expect(stateNode(evaluateComposition(document, 1), 'node-image')).toMatchObject({
      origin: { x: 500 + linear(0, -500, 1, 3), y: 250 + linear(0, 750, 1, 3) },
    });
  });

  it('reports a rotation of -0 degrees as 0', () => {
    const document = derived((draft) => {
      const title = draftNode(draft, 'node-title');
      title.rotation = -0;
      title.animations = [];
    });
    const rotation = (
      stateNode(evaluateComposition(document, 0), 'node-title') as {
        rotation: number;
      }
    ).rotation;
    expect(Object.is(rotation, 0)).toBe(true);
  });
});

describe('size, colour, crop, and corner radius replace the base value (D68)', () => {
  it('replaces the size of an image with the sampled size, never multiplied', () => {
    const document = derived((draft) => {
      const image = draftNode(draft, 'node-image');
      image.animations = [
        keyframed(
          'anim-image-size',
          'size',
          [0, { width: 100, height: 50 }],
          [3, { width: 400, height: 200 }],
        ),
      ];
    });
    expect(stateNode(evaluateComposition(document, 1), 'node-image')).toMatchObject({
      size: { width: linear(100, 400, 1, 3), height: linear(50, 200, 1, 3) },
    });
  });

  it('replaces the corner radius, fractional while animated', () => {
    const document = derived((draft) => {
      draftNode(draft, 'node-image').animations = [
        keyframed('anim-image-radius', 'cornerRadius', [0, 0], [3, 10]),
      ];
    });
    expect(stateNode(evaluateComposition(document, 1), 'node-image')).toMatchObject({
      cornerRadius: linear(0, 10, 1, 3),
    });
  });

  it('gives the crop of the document as insets', () => {
    const document = derived((draft) => {
      (draftNode(draft, 'node-image') as unknown as { crop: unknown }).crop = {
        top: 10,
        right: 20,
        bottom: 30,
        left: 40,
      };
    });
    expect(stateNode(evaluateComposition(document, 0), 'node-image')).toMatchObject({
      crop: { fromTop: 10, fromRight: 20, fromBottom: 30, fromLeft: 40 },
    });
  });

  it('reduces two opposite insets that an overshoot pushes past 999, in proportion', () => {
    const back = { kind: 'cubic-bezier', x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 } as const;
    const document = derived((draft) => {
      const image = draftNode(draft, 'node-image');
      const crop = keyframed(
        'anim-image-crop',
        'crop',
        [0, { top: 0, right: 0, bottom: 99, left: 0 }],
        [1_000_000, { top: 900, right: 0, bottom: 99, left: 0 }],
      ) as { keyframes: { easing: unknown }[] };
      (crop.keyframes[0] as { easing: unknown }).easing = back;
      image.animations = [crop as never];
    });
    const top = easedValue(back, 0, 900, 600_000, 1_000_000, PROPERTY_BOUNDS.crop);
    expect(top + 99).toBeGreaterThan(999);
    const sum = top + 99;
    expect(stateNode(evaluateComposition(document, 600_000), 'node-image')).toMatchObject({
      crop: { fromTop: (top * 999) / sum, fromRight: 0, fromBottom: (99 * 999) / sum, fromLeft: 0 },
    });
  });

  it.each([
    ['#000000', '#ffffff', 1, 2, '#808080'],
    ['#000000', '#ffffff', 1, 3, '#555555'],
    ['#000000', '#010101', 1, 2, '#010101'],
    ['#0a0b0c', '#0a0b0c', 1, 2, '#0a0b0c'],
    ['#ff0000', '#00ff00', 1, 4, '#bf4000'],
  ])(
    'interpolates %s to %s at %i of %i per channel, rounded halves upwards: %s',
    (from, to, elapsed, span, color) => {
      const document = derived((draft) => {
        draftNode(draft, 'node-title').animations = [
          keyframed('anim-title-color', 'color', [0, from], [span, to]),
        ];
      });
      expect(stateNode(evaluateComposition(document, elapsed), 'node-title')).toMatchObject({
        color,
      });
    },
  );

  it('animates the colour of the background', () => {
    const document = validated(
      ((): Draft => {
        const draft = referenceDraft();
        backgroundOf(draft).animations = [
          keyframed('anim-background-color', 'color', [0, '#000000'], [2, '#0000ff']),
        ];
        return draft;
      })(),
    );
    const background = evaluateComposition(document, 1).scenes[0]?.nodes[0];
    expect(background).toEqual({
      id: 'node-background',
      type: 'background',
      active: true,
      color: '#000080',
    });
  });

  it('keeps every base value where nothing is animated', () => {
    const image = stateNode(evaluateComposition(reference, 0), 'node-image');
    expect(image).toMatchObject({
      rotation: 0,
      origin: { x: 0, y: 0 },
      size: { width: 400, height: 400 },
      crop: { fromTop: 0, fromRight: 0, fromBottom: 0, fromLeft: 0 },
      cornerRadius: 0,
    });
  });
});

describe('the motion fixture (D68)', () => {
  const document = validated(motionComposition);

  const TIMES = motionGoldenTimestamps.map(({ timeUs }) => timeUs);

  function all(nodes: readonly NodeState[]): NodeState[] {
    return nodes.flatMap((node): NodeState[] =>
      node.type === 'group' ? [node, ...node.children] : [node],
    );
  }

  it.each(TIMES)('evaluates at %i and holds every row in its bounds', (timeUs) => {
    const nodes = all(evaluateComposition(document, timeUs).scenes.flatMap((s) => s.nodes));
    expect(nodes.length).toBeGreaterThan(5);
    for (const node of nodes) {
      if ('color' in node) expect(node.color).toMatch(/^#[0-9a-f]{6}$/);
      if ('crop' in node) {
        expect(node.crop.fromLeft + node.crop.fromRight).toBeLessThanOrEqual(999);
        expect(node.crop.fromTop + node.crop.fromBottom).toBeLessThanOrEqual(999);
      }
      if ('size' in node) {
        expect(node.size.width).toBeGreaterThanOrEqual(1);
        expect(node.size.height).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('is the same state, whatever was evaluated before', () => {
    const fresh = TIMES.map((timeUs) => JSON.stringify(evaluateComposition(document, timeUs)));
    const again = [...TIMES]
      .reverse()
      .map((timeUs) => JSON.stringify(evaluateComposition(document, timeUs)))
      .reverse();
    expect(again).toEqual(fresh);
  });
});

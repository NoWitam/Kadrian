/**
 * `SetNodeCorners` (D91.1) through `applyCommand` and the bus: it sets the
 * corners of every transformable node and nothing else, the same value is no
 * edit, `null` is four zero vectors, a background has no corners, a
 * quadrilateral the document cannot hold is refused as `invalid-result`, and
 * the inverse sets the old corners back, byte for byte. The expected values
 * are written out by hand from the reference composition and the nodes of
 * `everyType`.
 */
import { describe, expect, it } from 'vitest';

import { applyCommand, createCommandBus, type Command } from '../src/index.js';

import { codeOf, errorOf, everyType, json, nodeOf, reference } from './support.js';

function fieldOf(document: unknown, nodeId: string, field: string): unknown {
  return (nodeOf(document, nodeId) as unknown as Record<string, unknown>)[field];
}

type Point = { readonly x: number; readonly y: number };

function cornersOf(
  nodeId: string,
  topLeft: Point,
  topRight: Point = { x: 0, y: 0 },
  bottomRight: Point = { x: 0, y: 0 },
  bottomLeft: Point = { x: 0, y: 0 },
): Command {
  return {
    type: 'SetNodeCorners',
    nodeId,
    corners: { topLeft, topRight, bottomRight, bottomLeft },
  };
}

const ZERO =
  '{"topLeft":{"x":0,"y":0},"topRight":{"x":0,"y":0},"bottomRight":{"x":0,"y":0},"bottomLeft":{"x":0,"y":0}}';
const MOVED =
  '{"topLeft":{"x":4,"y":2.5},"topRight":{"x":0,"y":0},"bottomRight":{"x":0,"y":0},"bottomLeft":{"x":0,"y":0}}';

describe('SetNodeCorners (D91.1)', () => {
  it.each([
    ['an image in a group', 'node-image'],
    ['a group', 'node-group'],
    ['a Custom HTML element', 'node-custom-html'],
    ['a video', 'node-video'],
    ['a captions node', 'node-captions'],
    ['a shape', 'node-shape'],
    ['an instance', 'node-instance'],
  ])(
    'moves the corners of %s and nothing else, and its inverse gives the bytes back',
    (_, nodeId) => {
      const before = everyType();
      const result = applyCommand(before, cornersOf(nodeId, { x: 4, y: 2.5 }));
      expect(JSON.stringify(fieldOf(result.document, nodeId, 'corners'))).toBe(MOVED);
      // Only the corners of that node changed: the box and the transform stay.
      const restored = JSON.parse(json(result.document)) as unknown;
      (nodeOf(restored, nodeId) as unknown as Record<string, unknown>)['corners'] =
        JSON.parse(ZERO);
      expect(json(restored)).toBe(json(before));
      if (result.inverse === null) throw new Error('The command changed nothing.');
      expect(JSON.stringify(result.inverse)).toBe(
        `{"type":"SetNodeCorners","nodeId":"${nodeId}","corners":${ZERO}}`,
      );
      expect(json(applyCommand(result.document, result.inverse).document)).toBe(json(before));
    },
  );

  it('keeps the keys of the corners in the order of the schema, whatever order the call has', () => {
    const result = applyCommand(reference(), {
      type: 'SetNodeCorners',
      nodeId: 'node-image',
      corners: {
        bottomLeft: { y: 0, x: 0 },
        topLeft: { y: 2.5, x: 4 },
        bottomRight: { x: 0, y: 0 },
        topRight: { x: 0, y: 0 },
      },
    } as unknown as Command);
    expect(JSON.stringify(fieldOf(result.document, 'node-image', 'corners'))).toBe(MOVED);
  });

  it('is no edit for the corners the node has, and -0 is 0', () => {
    const before = reference();
    const result = applyCommand(before, cornersOf('node-image', { x: -0, y: 0 }));
    expect(result.inverse).toBeNull();
    expect(json(result.document)).toBe(json(before));
  });

  it('takes null as four zero vectors, and its inverse sets the old corners back', () => {
    const moved = applyCommand(reference(), cornersOf('node-image', { x: 4, y: 2.5 })).document;
    const removed = applyCommand(moved, {
      type: 'SetNodeCorners',
      nodeId: 'node-image',
      corners: null,
    } as unknown as Command);
    expect(JSON.stringify(fieldOf(removed.document, 'node-image', 'corners'))).toBe(ZERO);
    if (removed.inverse === null) throw new Error('The command changed nothing.');
    expect(json(applyCommand(removed.document, removed.inverse).document)).toBe(json(moved));
    // On a node without corners, null is no edit.
    expect(
      applyCommand(reference(), {
        type: 'SetNodeCorners',
        nodeId: 'node-image',
        corners: null,
      } as unknown as Command).inverse,
    ).toBeNull();
  });

  it('refuses a background with unsupported-node, and a node that does not exist with unknown-node', () => {
    const corners = cornersOf('node-background', { x: 4, y: 0 });
    expect(codeOf(() => applyCommand(reference(), corners))).toBe('unsupported-node');
    expect(codeOf(() => applyCommand(reference(), cornersOf('node-missing', { x: 4, y: 0 })))).toBe(
      'unknown-node',
    );
  });

  it('refuses the corners of a text without a fixed frame, and takes them once it has one (question 1 of D91)', () => {
    const error = errorOf(() => applyCommand(reference(), cornersOf('node-title', { x: 4, y: 0 })));
    expect(error.code).toBe('invalid-result');
    expect(error.details.join('\n')).toContain('/corners');
    const framed = applyCommand(reference(), {
      type: 'SetNodeSize',
      nodeId: 'node-title',
      width: 600,
      height: 200,
    }).document;
    const result = applyCommand(framed, cornersOf('node-title', { x: 4, y: 0 }));
    expect(JSON.stringify(fieldOf(result.document, 'node-title', 'corners'))).toContain(
      '"topLeft":{"x":4,"y":0}',
    );
  });

  it.each([
    ['concave', { x: 300, y: 300 }, undefined, undefined],
    ['self-intersecting', { x: 0, y: 0 }, { x: 0, y: 400 }, { x: 0, y: -400 }],
  ] as const)(
    'refuses a %s quadrilateral with invalid-result',
    (_, topLeft, topRight, bottomRight) => {
      const error = errorOf(() =>
        applyCommand(reference(), cornersOf('node-image', topLeft, topRight, bottomRight)),
      );
      expect(error.code).toBe('invalid-result');
      expect(error.details.join('\n')).toContain('/children/0/corners');
    },
  );

  it.each([
    { topLeft: { x: 1, y: 0 } },
    {
      topLeft: { x: '1', y: 0 },
      topRight: { x: 0, y: 0 },
      bottomRight: { x: 0, y: 0 },
      bottomLeft: { x: 0, y: 0 },
    },
    {
      topLeft: { x: Number.NaN, y: 0 },
      topRight: { x: 0, y: 0 },
      bottomRight: { x: 0, y: 0 },
      bottomLeft: { x: 0, y: 0 },
    },
    {
      topLeft: { x: 1_000_001, y: 0 },
      topRight: { x: 0, y: 0 },
      bottomRight: { x: 0, y: 0 },
      bottomLeft: { x: 0, y: 0 },
    },
    {
      topLeft: { x: 0, y: 0, z: 0 },
      topRight: { x: 0, y: 0 },
      bottomRight: { x: 0, y: 0 },
      bottomLeft: { x: 0, y: 0 },
    },
    [0, 0, 0, 0],
    'none',
  ])('refuses the corners %j with invalid-argument', (corners) => {
    expect(
      codeOf(() =>
        applyCommand(reference(), {
          type: 'SetNodeCorners',
          nodeId: 'node-image',
          corners,
        } as never),
      ),
    ).toBe('invalid-argument');
  });

  it('is undone and redone by the bus as one edit', () => {
    const bus = createCommandBus(reference());
    const before = json(bus.getDocument());
    bus.dispatch(cornersOf('node-image', { x: 4, y: 2.5 }));
    expect(JSON.stringify(fieldOf(bus.getDocument(), 'node-image', 'corners'))).toBe(MOVED);
    bus.undo();
    expect(json(bus.getDocument())).toBe(before);
    bus.redo();
    expect(JSON.stringify(fieldOf(bus.getDocument(), 'node-image', 'corners'))).toBe(MOVED);
  });
});

describe('the corners row of D65.1 through the generic keyframe commands (D91.1)', () => {
  const offsets = (x: number): unknown => ({
    topLeft: { x, y: 0 },
    topRight: { x: 0, y: 0 },
    bottomRight: { x: 0, y: 0 },
    bottomLeft: { x: 0, y: 0 },
  });

  it('adds an animation of the corners and sets a keyframe value, never rounded', () => {
    const added = applyCommand(reference(), {
      type: 'AddAnimation',
      nodeId: 'node-image',
      index: 0,
      animation: {
        id: 'anim-image-corners',
        property: 'corners',
        keyframes: [
          { timeUs: 0, value: offsets(0), easing: { kind: 'linear' } },
          { timeUs: 1_000_000, value: offsets(10), easing: { kind: 'linear' } },
        ],
      },
    } as unknown as Command).document;
    const set = applyCommand(added, {
      type: 'SetKeyframeValue',
      animationId: 'anim-image-corners',
      timeUs: 1_000_000,
      value: offsets(12.5),
    } as unknown as Command);
    const animations = fieldOf(set.document, 'node-image', 'animations') as {
      readonly keyframes: readonly { readonly value: unknown }[];
    }[];
    expect(JSON.stringify(animations[0]?.keyframes[1]?.value)).toBe(JSON.stringify(offsets(12.5)));
    if (set.inverse === null) throw new Error('The command changed nothing.');
    expect(json(applyCommand(set.document, set.inverse).document)).toBe(json(added));
    // A value of the wrong form is refused before the document is judged.
    expect(
      codeOf(() =>
        applyCommand(added, {
          type: 'SetKeyframeValue',
          animationId: 'anim-image-corners',
          timeUs: 1_000_000,
          value: { topLeft: { x: 1, y: 0 } },
        } as unknown as Command),
      ),
    ).toBe('invalid-argument');
  });
});

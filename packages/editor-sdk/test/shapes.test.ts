/**
 * The commands of shapes (D73): each replaces one field of a shape whole, is
 * undone by its inverse, writes no history when it changes nothing, refuses
 * any other node type, and leaves the full validation of the result to the
 * schema: a path that starts without a move, a fill animated on a gradient,
 * or a geometry that loses the structure of its animation is refused there.
 */
import { describe, expect, it } from 'vitest';

import { applyCommand, type Command } from '../src/index.js';

import { codeOf, everyType, json, nodeOf, SHAPE_NODE } from './support.js';

const SHAPE = SHAPE_NODE.id;

function fieldOf(document: unknown, field: string): unknown {
  return (nodeOf(document, SHAPE) as unknown as Record<string, unknown>)[field];
}

const PATH = {
  kind: 'path',
  fillRule: 'evenodd',
  commands: [
    { kind: 'move', x: 0, y: 0 },
    { kind: 'cubic', x1: 10, y1: -5, x2: 20, y2: 5, x: 30, y: 0 },
    { kind: 'arc', rx: 5, ry: 5, rotation: 0, largeArc: false, sweep: true, x: 30, y: 10 },
    { kind: 'close' },
  ],
} as const;

const GRADIENT = {
  kind: 'linear-gradient',
  start: { x: 0, y: 0 },
  end: { x: 200, y: 0 },
  stops: [
    { offset: 0, color: '#000000', opacity: 1 },
    { offset: 1000, color: '#ffffff', opacity: 0.5 },
  ],
} as const;

const ROWS: readonly { field: string; command: Command; expected: unknown }[] = [
  {
    field: 'geometry',
    command: { type: 'SetShapeGeometry', nodeId: SHAPE, geometry: PATH },
    expected: PATH,
  },
  {
    field: 'fill',
    command: { type: 'SetShapeFill', nodeId: SHAPE, fill: GRADIENT },
    expected: GRADIENT,
  },
  {
    field: 'stroke',
    command: {
      type: 'SetShapeStroke',
      nodeId: SHAPE,
      stroke: { color: '#ff0000', width: 0, dash: [20, 10], cap: 'round', join: 'bevel' },
    },
    expected: { color: '#ff0000', width: 0, dash: [20, 10], cap: 'round', join: 'bevel' },
  },
  {
    field: 'trim',
    command: { type: 'SetShapeTrim', nodeId: SHAPE, trim: { start: 100, end: 900 } },
    expected: { start: 100, end: 900 },
  },
];

describe('the commands of shapes (D73)', () => {
  it.each(ROWS)('replaces the $field of a shape and is undone by its inverse', (row) => {
    const document = everyType();
    const result = applyCommand(document, row.command);
    expect(fieldOf(result.document, row.field)).toEqual(row.expected);
    if (result.inverse === null) throw new Error('No inverse.');
    expect(json(applyCommand(result.document, result.inverse).document)).toBe(json(document));
  });

  it.each(ROWS)('writes no history when the $field is already the one given', (row) => {
    const once = applyCommand(everyType(), row.command).document;
    expect(applyCommand(once, row.command).inverse).toBeNull();
  });

  it.each(ROWS)('refuses a node that is not a shape: $command.type', (row) => {
    const command = { ...row.command, nodeId: 'node-title' } as Command;
    expect(codeOf(() => applyCommand(everyType(), command))).toBe('unsupported-node');
  });

  it('refuses a trim outside 0 to 1000 and a trim of fractions as invalid arguments', () => {
    for (const trim of [
      { start: -1, end: 1000 },
      { start: 0, end: 1001 },
      { start: 0.5, end: 1000 },
    ]) {
      const command: Command = { type: 'SetShapeTrim', nodeId: SHAPE, trim };
      expect(
        codeOf(() => applyCommand(everyType(), command)),
        JSON.stringify(trim),
      ).toBe('invalid-argument');
    }
  });

  it('leaves a path without a first move and an odd dash list to the validation of the result', () => {
    const path: Command = {
      type: 'SetShapeGeometry',
      nodeId: SHAPE,
      geometry: { ...PATH, commands: PATH.commands.slice(1) },
    };
    expect(codeOf(() => applyCommand(everyType(), path))).toBe('invalid-result');
    const stroke: Command = {
      type: 'SetShapeStroke',
      nodeId: SHAPE,
      stroke: { color: '#ff0000', width: 2, dash: [20], cap: 'butt', join: 'miter' },
    };
    expect(codeOf(() => applyCommand(everyType(), stroke))).toBe('invalid-result');
  });

  it('refuses a geometry that leaves the structure of its animation, and a gradient under a fill animation', () => {
    const animated = applyCommand(everyType(), {
      type: 'AddAnimation',
      nodeId: SHAPE,
      index: 0,
      animation: {
        id: 'anim-shape-geometry',
        property: 'geometry',
        keyframes: [
          { timeUs: 0, value: { kind: 'rect', cornerRadius: 0 }, easing: { kind: 'linear' } },
          {
            timeUs: 500_000,
            value: { kind: 'rect', cornerRadius: 40 },
            easing: { kind: 'linear' },
          },
        ],
      },
    }).document;
    const ellipse: Command = {
      type: 'SetShapeGeometry',
      nodeId: SHAPE,
      geometry: { kind: 'ellipse' },
    };
    expect(codeOf(() => applyCommand(animated, ellipse))).toBe('invalid-result');
    const rect: Command = {
      type: 'SetShapeGeometry',
      nodeId: SHAPE,
      geometry: { kind: 'rect', cornerRadius: 8 },
    };
    expect(fieldOf(applyCommand(animated, rect).document, 'geometry')).toEqual({
      kind: 'rect',
      cornerRadius: 8,
    });

    const filled = applyCommand(everyType(), {
      type: 'AddAnimation',
      nodeId: SHAPE,
      index: 0,
      animation: {
        id: 'anim-shape-fill',
        property: 'fill',
        keyframes: [
          { timeUs: 0, value: '#000000', easing: { kind: 'linear' } },
          { timeUs: 500_000, value: '#ffffff', easing: { kind: 'linear' } },
        ],
      },
    }).document;
    const gradient: Command = { type: 'SetShapeFill', nodeId: SHAPE, fill: GRADIENT };
    expect(codeOf(() => applyCommand(filled, gradient))).toBe('invalid-result');
  });

  it('sets a keyframe of a geometry, a trim, and a stroke colour by SetKeyframeValue', () => {
    let document = applyCommand(everyType(), {
      type: 'AddAnimation',
      nodeId: SHAPE,
      index: 0,
      animation: {
        id: 'anim-shape-trim',
        property: 'trim/end',
        keyframes: [
          { timeUs: 0, value: 0, easing: { kind: 'linear' } },
          { timeUs: 500_000, value: 1000, easing: { kind: 'linear' } },
        ],
      },
    }).document;
    document = applyCommand(document, {
      type: 'SetKeyframeValue',
      animationId: 'anim-shape-trim',
      timeUs: 250_000,
      value: 400,
    }).document;
    const animations = fieldOf(document, 'animations') as {
      keyframes: { timeUs: number; value: unknown }[];
    }[];
    expect(animations[0]?.keyframes.map(({ timeUs, value }) => [timeUs, value])).toEqual([
      [0, 0],
      [250_000, 400],
      [500_000, 1000],
    ]);
    expect(
      codeOf(() =>
        applyCommand(document, {
          type: 'SetKeyframeValue',
          animationId: 'anim-shape-trim',
          timeUs: 250_000,
          value: 400.5,
        }),
      ),
    ).toBe('invalid-argument');
  });
});

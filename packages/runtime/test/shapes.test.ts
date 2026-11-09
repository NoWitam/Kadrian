/**
 * Vector shapes at one instant (D73): every geometry as one path of absolute
 * commands in the pixels of its box, a fill, and a stroke whose trim and
 * dashes become one dash array over a `pathLength` of 1000. The expected
 * values are derived by hand from the composition of shapes.
 */
import { shapesComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { shapePath } from '../src/shapes.js';
import { evaluateComposition, type CompositionState, type ShapeNodeState } from '../src/index.js';
import { animation, validated, stateNode, type Draft, type DraftNode } from './support.js';

const composition = validated(shapesComposition);

function shapeOf(state: CompositionState, id: string): ShapeNodeState {
  const node = stateNode(state, id);
  if (node.type !== 'shape') throw new Error(`${id} is not a shape.`);
  return node as ShapeNodeState;
}

function at(id: string, timeUs: number): ShapeNodeState {
  return shapeOf(evaluateComposition(composition, timeUs), id);
}

const arc = (r: number, x: number, y: number) =>
  ({ kind: 'arc', rx: r, ry: r, rotation: 0, largeArc: false, sweep: true, x, y }) as const;

describe('the path of a geometry (D73)', () => {
  it('draws a rectangle clockwise from its top edge, its corners rounded by arcs', () => {
    expect(shapePath({ kind: 'rect', cornerRadius: 24 }, { width: 160, height: 100 })).toEqual([
      { kind: 'move', x: 24, y: 0 },
      { kind: 'line', x: 136, y: 0 },
      arc(24, 160, 24),
      { kind: 'line', x: 160, y: 76 },
      arc(24, 136, 100),
      { kind: 'line', x: 24, y: 100 },
      arc(24, 0, 76),
      { kind: 'line', x: 0, y: 24 },
      arc(24, 24, 0),
      { kind: 'close' },
    ]);
  });

  it('reduces a radius above half the shorter side to half of it, and leaves out a side it takes whole', () => {
    expect(shapePath({ kind: 'rect', cornerRadius: 500 }, { width: 200, height: 120 })).toEqual([
      { kind: 'move', x: 60, y: 0 },
      { kind: 'line', x: 140, y: 0 },
      arc(60, 200, 60),
      arc(60, 140, 120),
      { kind: 'line', x: 60, y: 120 },
      arc(60, 0, 60),
      arc(60, 60, 0),
      { kind: 'close' },
    ]);
  });

  it('draws a rectangle without a radius as four lines from its top-left corner', () => {
    expect(shapePath({ kind: 'rect', cornerRadius: 0 }, { width: 100, height: 60 })).toEqual([
      { kind: 'move', x: 0, y: 0 },
      { kind: 'line', x: 100, y: 0 },
      { kind: 'line', x: 100, y: 60 },
      { kind: 'line', x: 0, y: 60 },
      { kind: 'close' },
    ]);
  });

  it('draws an ellipse in two half arcs clockwise from its rightmost point', () => {
    const half = (x: number) =>
      ({
        kind: 'arc',
        rx: 70,
        ry: 50,
        rotation: 0,
        largeArc: false,
        sweep: true,
        x,
        y: 50,
      }) as const;
    expect(shapePath({ kind: 'ellipse' }, { width: 140, height: 100 })).toEqual([
      { kind: 'move', x: 140, y: 50 },
      half(0),
      half(140),
      { kind: 'close' },
    ]);
  });

  it('closes a polygon through its points, and carries a path command for command', () => {
    expect(
      shapePath(
        {
          kind: 'polygon',
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 5, y: 8.5 },
          ],
        },
        { width: 1, height: 1 },
      ),
    ).toEqual([
      { kind: 'move', x: 0, y: 0 },
      { kind: 'line', x: 10, y: 0 },
      { kind: 'line', x: 5, y: 8.5 },
      { kind: 'close' },
    ]);
    const commands = [
      { kind: 'move', x: 0, y: 20 },
      { kind: 'quadratic', x1: 5, y1: -5, x: 10, y: 20 },
    ] as const;
    const path = shapePath(
      { kind: 'path', fillRule: 'nonzero', commands: [...commands] },
      {
        width: 1,
        height: 1,
      },
    );
    expect(path).toEqual(commands);
    expect(path[0]).not.toBe(commands[0]);
  });
});

describe('a shape of the composition of shapes at one instant (D73)', () => {
  it('follows its size animation, its rounded corners following its geometry animation', () => {
    const rect = at('shape-rect', 1_000_000);
    expect(rect.size).toEqual({ width: 200, height: 120 });
    expect(rect.path).toEqual(
      shapePath({ kind: 'rect', cornerRadius: 60 }, { width: 200, height: 120 }),
    );
    // Linear from 24 to 60 over 1 s: 42 at its middle.
    expect(at('shape-rect', 500_000).path[0]).toEqual({ kind: 'move', x: 42, y: 0 });
  });

  it('says only that a gradient fills it: the gradient itself is static (D73)', () => {
    expect(at('shape-rect', 0).fill).toEqual({ kind: 'gradient' });
    expect(at('shape-ellipse', 0).fill).toEqual({ kind: 'gradient' });
  });

  it('replaces the colour of a solid fill, of a stroke, and the width of a stroke', () => {
    expect(at('shape-star', 0).fill).toEqual({ kind: 'solid', color: '#f79009' });
    expect(at('shape-star', 1_000_000).fill).toEqual({ kind: 'solid', color: '#12b76a' });
    expect(at('shape-ellipse', 0).stroke).toMatchObject({ color: '#d1e9ff', width: 4 });
    expect(at('shape-ellipse', 500_000).stroke).toMatchObject({ width: 8 });
    expect(at('shape-ellipse', 1_000_000).stroke).toMatchObject({ color: '#f04438', width: 12 });
  });

  it('writes no dash array for an untrimmed stroke without dashes', () => {
    expect(at('shape-ellipse', 0).stroke).toEqual({
      color: '#d1e9ff',
      width: 4,
      cap: 'butt',
      join: 'miter',
      dashArray: null,
      dashOffset: 0,
    });
    expect(at('shape-star', 1_000_000).stroke?.dashArray).toBeNull();
  });

  it('draws nothing of a stroke trimmed to nothing, so no cap shows (D65.5)', () => {
    expect(at('shape-star', 0).trim).toEqual({ start: 0, end: 0 });
    expect(at('shape-star', 0).stroke).toBeNull();
  });

  it('draws a trimmed part as one dash, moved to where it starts', () => {
    expect(at('shape-star', 500_000).stroke).toMatchObject({
      dashArray: [500, 1000],
      dashOffset: 0,
    });
    const line = at('shape-line', 500_000);
    expect(line.trim).toEqual({ start: 250, end: 750 });
    expect(line.stroke).toMatchObject({ dashArray: [500, 1000], dashOffset: -250 });
    expect(Object.is(at('shape-line', 0).stroke?.dashOffset, 0)).toBe(true);
  });

  it('repeats a dash pattern along the outline and ends it with a gap that never repeats', () => {
    const dashes = at('shape-badge', 500_000).stroke?.dashArray ?? [];
    // 10, 10, 40, 10 is 70 per mille: 14 whole patterns, then a dash of 10 and
    // a gap of 10 reach 1000, where the last dash ends at 990.
    expect(dashes.slice(0, 8)).toEqual([10, 10, 40, 10, 10, 10, 40, 10]);
    expect(dashes).toHaveLength(14 * 4 + 2);
    expect(dashes.slice(-2)).toEqual([10, 1000]);
    expect(dashes.reduce((sum, length) => sum + length, 0)).toBe(1990);
    const rect = at('shape-rect', 0).stroke?.dashArray ?? [];
    expect(rect.slice(-4)).toEqual([60, 30, 10, 1000]);
  });

  it('morphs a path number by number under the easing of the earlier keyframe (D67)', () => {
    // Ease-in-out is symmetric: half way at the middle of the 1.2 s.
    const path = at('shape-morph', 600_000).path;
    expect(path[1]).toEqual({ kind: 'cubic', x1: 25, y1: 55, x2: 65, y2: 55, x: 90, y: 50 });
    expect(path[3]).toEqual({ ...arc(37.5, 150, 120) });
    expect(path[6]).toEqual({ kind: 'move', x: 60, y: 75 });
    expect(path.map(({ kind }) => kind)).toEqual(
      composition.scenes[0]?.nodes
        .flatMap((node) => (node.id === 'shape-morph' && node.type === 'shape' ? [node] : []))
        .flatMap((node) => (node.geometry.kind === 'path' ? node.geometry.commands : []))
        .map(({ kind }) => kind),
    );
  });

  it('evaluates a shape inside a group like any child', () => {
    expect(at('shape-line', 0).path).toHaveLength(3);
    expect(at('shape-badge', 500_000).effects.map(({ kind }) => kind)).toEqual(['drop-shadow']);
  });
});

describe('the bounds of a shape row (D67.6, D73)', () => {
  /** The shape `id` with `row` as its one animation, eased to overshoot, at 0.6 s. */
  function overshooting(id: string, row: DraftAnimation): ShapeNodeState {
    const draft = structuredClone(shapesComposition) as Draft;
    const node = draft.scenes[0]?.nodes.find((item) => item.id === id) as DraftNode | undefined;
    if (node === undefined) throw new Error(`No ${id}.`);
    const back = { kind: 'cubic-bezier', x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 } as const;
    node.animations = [
      { ...row, keyframes: row.keyframes.map((keyframe) => ({ ...keyframe, easing: back })) },
    ] as DraftAnimation[];
    return shapeOf(evaluateComposition(validated(draft), 600_000), id);
  }

  it('holds an overshoot of a trim and of a stroke width within 0 and 1000', () => {
    const trim = overshooting(
      'shape-ellipse',
      animation('a', 'trim/end', [0, 0], [1_000_000, 1000]),
    );
    expect(trim.trim.end).toBe(1000);
    const width = overshooting(
      'shape-ellipse',
      animation('a', 'stroke/width', [0, 0], [1_000_000, 1000]),
    );
    expect(width.stroke?.width).toBe(1000);
  });

  it('holds an overshoot of a corner radius at 0', () => {
    const rect = overshooting(
      'shape-rect',
      animation(
        'a',
        'geometry',
        [0, { kind: 'rect', cornerRadius: 40 }],
        [1_000_000, { kind: 'rect', cornerRadius: 0 }],
      ),
    );
    expect(rect.path[0]).toEqual({ kind: 'move', x: 0, y: 0 });
    expect(rect.path).toHaveLength(5);
  });
});

type DraftAnimation = DraftNode['animations'][number];

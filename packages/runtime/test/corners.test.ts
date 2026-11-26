/**
 * The four corners of a node in the runtime (D91.1): the homography of a box
 * onto a quadrilateral, the cosine and the sine of a rotation in `+ − × /`, the
 * state that carries sixteen numbers, `null`, or nothing, and the warnings of
 * corners that turn concave while animated.
 */
import {
  cosSinOfDegrees,
  movedCorners,
  type CornerOffsets,
  type CornerTransform,
  type Quadrilateral,
} from '@kadrion/schema';
import {
  cornersComposition,
  generateProportionalFont,
  referenceComposition,
} from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { boxOntoQuadrilateral, cornersHomography } from '../src/homography.js';
import {
  cornersWarnings,
  evaluateComposition,
  fontMetrics,
  type CompositionState,
  type Homography,
} from '../src/index.js';
import { referenceDraft, stateNode, validated } from './support.js';

/** The metrics of the measured text of the fixture (D83.7). */
const FONTS = new Map([['asset-font-proportional', fontMetrics(generateProportionalFont())]]);

/** The state of the fixture of corners at `timeUs`. */
function cornersState(timeUs: number): CompositionState {
  return evaluateComposition(validated(cornersComposition), timeUs, FONTS);
}

const ZERO: CornerOffsets = {
  topLeft: { x: 0, y: 0 },
  topRight: { x: 0, y: 0 },
  bottomRight: { x: 0, y: 0 },
  bottomLeft: { x: 0, y: 0 },
};

const IDENTITY: CornerTransform = {
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  origin: { x: 0, y: 0 },
  flip: { x: false, y: false },
};

/** Where a CSS `matrix3d` takes the point `x`, `y` of the element's own box. */
function apply(matrix: Homography, x: number, y: number): { x: number; y: number } {
  const w = matrix[3] * x + matrix[7] * y + matrix[15];
  return {
    x: (matrix[0] * x + matrix[4] * y + matrix[12]) / w,
    y: (matrix[1] * x + matrix[5] * y + matrix[13]) / w,
  };
}

function expectClose(found: { x: number; y: number }, expected: { x: number; y: number }): void {
  expect(found.x).toBeCloseTo(expected.x, 9);
  expect(found.y).toBeCloseTo(expected.y, 9);
}

describe('the cosine and the sine of a rotation (D91.1, D24)', () => {
  it.each([
    [0, 1, 0],
    [90, 0, 1],
    [180, -1, 0],
    [270, 0, -1],
    [360, 1, 0],
    [-90, 0, -1],
    [450, 0, 1],
    [-360_000, 1, 0],
  ])('is exact at a whole number of quarter turns: %d°', (degrees, cos, sin) => {
    const found = cosSinOfDegrees(degrees);
    expect(found.cos).toBe(cos);
    expect(found.sin).toBe(sin);
  });

  it('agrees with Math.cos and Math.sin to the precision of a double between them', () => {
    for (let degrees = -720; degrees <= 720; degrees += 7.25) {
      const { cos, sin } = cosSinOfDegrees(degrees);
      const radians = (degrees * Math.PI) / 180;
      // A few units in the last place: Math.cos has its own rounding of the radians.
      expect(Math.abs(cos - Math.cos(radians)), String(degrees)).toBeLessThan(4e-15);
      expect(Math.abs(sin - Math.sin(radians)), String(degrees)).toBeLessThan(4e-15);
    }
  });
});

describe('the homography of a box onto a quadrilateral (D91.1)', () => {
  const box = { width: 200, height: 100 };

  it('sends each corner of the box exactly where it is sent', () => {
    const quadrilateral: Quadrilateral = [
      { x: 30, y: 12 },
      { x: 250, y: 40 },
      { x: 220, y: 160 },
      { x: 10, y: 130 },
    ];
    const matrix = boxOntoQuadrilateral(box, quadrilateral);
    expectClose(apply(matrix, 0, 0), quadrilateral[0]);
    expectClose(apply(matrix, 200, 0), quadrilateral[1]);
    expectClose(apply(matrix, 200, 100), quadrilateral[2]);
    expectClose(apply(matrix, 0, 100), quadrilateral[3]);
    // A true perspective: the bottom row of the matrix is not 0, 0.
    expect(matrix[3] !== 0 || matrix[7] !== 0).toBe(true);
  });

  it('is the affine transform of a node when its corners are zero: a scale and a position exactly', () => {
    const transform = { ...IDENTITY, position: { x: 10, y: 20 }, scale: { x: 2, y: 3 } };
    const matrix = boxOntoQuadrilateral(box, movedCorners(box, transform, ZERO));
    expect(matrix).toEqual([2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1, 0, 10, 20, 0, 1]);
  });

  it('is the affine transform of a node when its corners are zero: a rotation about an origin and a flip', () => {
    const transform: CornerTransform = {
      position: { x: 40, y: -12 },
      scale: { x: 1.5, y: 0.75 },
      rotation: 30,
      origin: { x: 250, y: 750 },
      flip: { x: true, y: false },
    };
    const matrix = boxOntoQuadrilateral(box, movedCorners(box, transform, ZERO));
    // The affine list of D68 and D89.3, by Math.cos: translate, about the pivot,
    // rotate, scale, then the flip in the box.
    const radians = (30 * Math.PI) / 180;
    const pivot = { x: 0.25 * 200, y: 0.75 * 100 };
    const affine = (x: number, y: number): { x: number; y: number } => {
      const flippedX = 200 - x;
      const scaledX = (flippedX - pivot.x) * 1.5;
      const scaledY = (y - pivot.y) * 0.75;
      return {
        x: 40 + pivot.x + scaledX * Math.cos(radians) - scaledY * Math.sin(radians),
        y: -12 + pivot.y + scaledX * Math.sin(radians) + scaledY * Math.cos(radians),
      };
    };
    expect(Math.abs(matrix[3]) + Math.abs(matrix[7])).toBeLessThan(1e-15);
    for (const [x, y] of [
      [0, 0],
      [200, 0],
      [200, 100],
      [0, 100],
      [70, 30],
    ] as const) {
      expectClose(apply(matrix, x, y), affine(x, y));
    }
  });

  it('is null for a quadrilateral that is not convex with a non-zero area', () => {
    const concave = { ...ZERO, topLeft: { x: 150, y: 80 } };
    expect(cornersHomography(box, IDENTITY, concave)).toBeNull();
    const point = { ...ZERO, topRight: { x: -200, y: 0 } };
    expect(cornersHomography(box, IDENTITY, point)).toBeNull();
    const moved = cornersHomography(box, IDENTITY, { ...ZERO, topLeft: { x: 20, y: 10 } });
    expect(moved).toHaveLength(16);
  });

  it('reports no -0 among its numbers', () => {
    const matrix = boxOntoQuadrilateral(box, movedCorners(box, IDENTITY, ZERO));
    for (const value of matrix) expect(Object.is(value, -0)).toBe(false);
  });
});

describe('the corners in the state of a frame (D91.1)', () => {
  it('leaves the state of a node with four zero corners without a homography', () => {
    const state = evaluateComposition(validated(referenceComposition), 2_500_000);
    expect('homography' in stateNode(state, 'node-image')).toBe(false);
    expect('homography' in stateNode(state, 'node-group')).toBe(false);
  });

  it('carries the sixteen numbers of a node with corners, and of a group over the canvas', () => {
    const draft = referenceDraft();
    const group = draft.scenes[0]?.nodes.find((node) => node.id === 'node-group');
    if (group === undefined || group.type !== 'group') throw new Error('No group.');
    group.corners = { ...ZERO, topLeft: { x: 30, y: 0 } };
    // Without its animations, its transform at any instant is its base.
    group.animations = [];
    const state = evaluateComposition(validated(draft), 2_500_000);
    const homography = stateNode(state, 'node-group').homography;
    expect(homography).toHaveLength(16);
    // The canvas of the scene, 1080 by 1920, is the box of the group.
    if (homography == null) throw new Error('No homography.');
    const canvas = { width: 1080, height: 1920 };
    const moved = movedCorners(canvas, group, group.corners);
    expectClose(apply(homography, 0, 0), moved[0]);
    expectClose(apply(homography, 1080, 0), moved[1]);
    expectClose(apply(homography, 1080, 1920), moved[2]);
    expectClose(apply(homography, 0, 1920), moved[3]);
  });

  it('draws nothing of a node in a frame where its animated corners are concave, and lists the first such instant', () => {
    // 90 pixels a second on a box of 100: the top-left corner passes the
    // diagonal after 555 556 µs; the frames at 533 333 and 566 666 µs are on
    // either side of it.
    const before = stateNode(cornersState(533_333), 'corners-animated');
    expect(before.homography).toHaveLength(16);
    const after = stateNode(cornersState(566_666), 'corners-animated');
    expect(after.homography).toBeNull();
    expect(cornersWarnings(validated(cornersComposition))).toEqual([
      {
        code: 'corners-not-convex',
        nodeId: 'corners-animated',
        holderId: 'scene-corners',
        timeUs: 566_666,
        message:
          'The corners of "corners-animated" do not form a convex quadrilateral at 566666 µs (scene time 566666 µs): it draws nothing then (D91.1).',
      },
    ]);
    expect(cornersWarnings(validated(referenceComposition))).toEqual([]);
  });

  it('gives every node with corners in the fixture a homography at 0', () => {
    const state = cornersState(0);
    for (const id of [
      'corners-image',
      'corners-text',
      'corners-shape',
      'corners-group',
      'corners-animated',
    ]) {
      expect(stateNode(state, id).homography, id).toHaveLength(16);
    }
    const instance = state.scenes[0]?.nodes.find(({ id }) => id === 'corners-instance');
    expect(instance !== undefined && 'homography' in instance && instance.homography).toHaveLength(
      16,
    );
  });
});

/**
 * The corners of a node in the document (D91.1): zero offsets are none; a
 * node with corners needs a box the runtime knows (a text a fixed frame); its
 * moved corners at the base values form a convex quadrilateral with a non-zero
 * area; and a matte has no corners, since Chromium draws a perspective
 * `matrix3d` in an SVG mask without its perspective (question 2 of D91,
 * amended by PR-95).
 */
import { compositingComposition, cornersComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  hasCorners,
  isConvexQuadrilateral,
  movedCorners,
  validateComposition,
  type Quadrilateral,
} from '../src/index.js';

type Node = Record<string, unknown> & { animations: unknown[] };
type Draft = {
  scenes: { nodes: (Node & { children?: Node[] })[] }[];
  definitions: { nodes: (Node & { children?: Node[] })[] }[];
};

const ZERO = {
  topLeft: { x: 0, y: 0 },
  topRight: { x: 0, y: 0 },
  bottomRight: { x: 0, y: 0 },
  bottomLeft: { x: 0, y: 0 },
};

function edited(source: unknown, edit: (draft: Draft) => void): unknown {
  const draft = structuredClone(source) as Draft;
  edit(draft);
  return draft;
}

function nodeIn(draft: Draft, id: string): Node {
  for (const holder of [...draft.scenes, ...draft.definitions]) {
    for (const node of holder.nodes) {
      if (node['id'] === id) return node;
      for (const child of node.children ?? []) if (child['id'] === id) return child;
    }
  }
  throw new Error(`No node ${id}.`);
}

function errorsOf(document: unknown): { code: string; path: string }[] {
  const result = validateComposition(document);
  return result.ok ? [] : result.errors.map(({ code, path }) => ({ code, path }));
}

describe('the geometry of the corners (D91.1)', () => {
  it('reads four zero vectors as no corners, and any other offset as corners', () => {
    expect(hasCorners(ZERO)).toBe(false);
    expect(hasCorners({ ...ZERO, bottomLeft: { x: 0, y: -0.5 } })).toBe(true);
  });

  it('takes a convex quadrilateral in either orientation, which a flip mirrors', () => {
    const square: Quadrilateral = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(isConvexQuadrilateral(square)).toBe(true);
    expect(isConvexQuadrilateral([square[1], square[0], square[3], square[2]])).toBe(true);
    // Concave, crossed, three on one line, two at one point.
    expect(isConvexQuadrilateral([{ x: 6, y: 6 }, square[1], square[2], square[3]])).toBe(false);
    expect(isConvexQuadrilateral([square[0], square[2], square[1], square[3]])).toBe(false);
    expect(isConvexQuadrilateral([square[0], { x: 5, y: 5 }, square[2], square[3]])).toBe(false);
    expect(isConvexQuadrilateral([square[0], square[0], square[2], square[3]])).toBe(false);
  });

  it('moves the corners by the transform first and then by their offsets', () => {
    const moved = movedCorners(
      { width: 100, height: 50 },
      {
        position: { x: 10, y: 20 },
        scale: { x: 2, y: 2 },
        rotation: 90,
        origin: { x: 0, y: 0 },
        flip: { x: true, y: false },
      },
      { ...ZERO, topLeft: { x: 1, y: 2 } },
    );
    // Mirrored in the box, scaled, a quarter turn clockwise, placed, offset.
    expect(moved).toEqual([
      { x: 11, y: 222 },
      { x: 10, y: 20 },
      { x: -90, y: 20 },
      { x: -90, y: 220 },
    ]);
  });
});

describe('the validation of corners (D91.1)', () => {
  it('accepts the fixture of corners: an image, a framed text, a shape, a group, an instance, and an animation', () => {
    expect(errorsOf(cornersComposition)).toEqual([]);
  });

  it('refuses the corners of a text without a frame, even when only an animation gives them', () => {
    const animated = edited(cornersComposition, (draft) => {
      const text = nodeIn(draft, 'corners-text');
      text['frame'] = { kind: 'none' };
      text['corners'] = ZERO;
      text.animations.push({
        id: 'anim-text-corners',
        property: 'corners',
        keyframes: [
          { timeUs: 0, value: ZERO, easing: { kind: 'linear' } },
          {
            timeUs: 500_000,
            value: { ...ZERO, topLeft: { x: 4, y: 0 } },
            easing: { kind: 'linear' },
          },
        ],
      });
    });
    expect(errorsOf(animated)).toEqual([
      { code: 'invalid-corners', path: '/scenes/0/nodes/2/corners' },
    ]);
  });

  it('judges the corners of a group against the canvas of what holds it', () => {
    // An offset that keeps the canvas of the scene convex, but not a smaller box.
    const fine = edited(cornersComposition, (draft) => {
      nodeIn(draft, 'corners-group')['corners'] = { ...ZERO, topRight: { x: -300, y: 50 } };
    });
    expect(errorsOf(fine)).toEqual([]);
    const crossed = edited(cornersComposition, (draft) => {
      nodeIn(draft, 'corners-group')['corners'] = { ...ZERO, topRight: { x: -700, y: 0 } };
    });
    expect(errorsOf(crossed)).toEqual([
      { code: 'invalid-corners', path: '/scenes/0/nodes/4/corners' },
    ]);
  });

  it('judges a node of a definition against its own box', () => {
    const concave = edited(cornersComposition, (draft) => {
      nodeIn(draft, 'corners-badge-square')['corners'] = {
        ...ZERO,
        topLeft: { x: 1000, y: 1000 },
      };
    });
    const errors = errorsOf(concave);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.code).toBe('invalid-corners');
    expect(errors[0]?.path).toMatch(/^\/definitions\/0\/nodes\/\d+\/corners$/);
  });

  it('refuses corners on a node that is the matte of a sibling, in its base or in an animation', () => {
    const base = edited(compositingComposition, (draft) => {
      nodeIn(draft, 'matte-gradient')['corners'] = { ...ZERO, topLeft: { x: 4, y: 0 } };
    });
    expect(errorsOf(base)).toEqual([
      { code: 'invalid-corners', path: '/scenes/0/nodes/22/corners' },
    ]);
    const animated = edited(compositingComposition, (draft) => {
      nodeIn(draft, 'matte-gradient').animations.push({
        id: 'anim-matte-corners',
        property: 'corners',
        keyframes: [
          { timeUs: 0, value: ZERO, easing: { kind: 'linear' } },
          {
            timeUs: 500_000,
            value: { ...ZERO, topLeft: { x: 4, y: 0 } },
            easing: { kind: 'linear' },
          },
        ],
      });
    });
    expect(errorsOf(animated)).toEqual([
      { code: 'invalid-corners', path: '/scenes/0/nodes/22/corners' },
    ]);
    // The node it mattes may have corners: its element is drawn in CSS.
    const matted = edited(compositingComposition, (draft) => {
      nodeIn(draft, 'matte-luminance-photo')['corners'] = { ...ZERO, topLeft: { x: 4, y: 0 } };
    });
    expect(errorsOf(matted)).toEqual([]);
  });
});

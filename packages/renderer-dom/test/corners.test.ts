/**
 * The corners of a node in the rendered tree (D91.1): a node with corners
 * writes its homography as one `matrix3d(…)` in the numbers of D22, after the
 * transform of a clip transition; a node with four zero corners writes the
 * list it wrote before, so a document of 0.29 writes the same strings; and a
 * frame where the animated quadrilateral is not convex hides the node. What a
 * browser paints for it is measured in the pinned environment
 * (`tests/pinned/corners.pinned.test.ts`); here the strings are checked.
 */
import { evaluateComposition, fontMetrics, type Homography } from '@kadrion/runtime';
import {
  cornersComposition,
  generateProportionalFont,
  referenceComposition,
} from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { cssMatrix3d, cssTransform } from '../src/css.js';
import { mountComposition, renderState } from '../src/index.js';
import { mountMeasured } from '../src/mount.js';
import { createRoot, elementOf, referenceUrls, TRUSTED, validated } from './support.js';

const base = {
  position: { x: 3, y: 4 },
  scale: { x: 2, y: 0.5 },
  rotation: 0,
  origin: { x: 0, y: 0 },
  flip: { x: false, y: false },
  opacity: 1,
};

const MATRIX: Homography = [
  1.1, 0.05, 0, 0.0001, -0.2, 0.9, 0, -0.00025, 0, 0, 1, 0, 30, 12.5, 0, 1,
];

describe('the homography in place of the transform list (D91.1)', () => {
  it('writes the sixteen numbers as matrix3d, each by the rule of D22', () => {
    expect(cssMatrix3d(MATRIX)).toBe(
      'matrix3d(1.1, 0.05, 0, 0.0001, -0.2, 0.9, 0, -0.00025, 0, 0, 1, 0, 30, 12.5, 0, 1)',
    );
    expect(cssMatrix3d([1e-7, ...MATRIX.slice(1)])).toMatch(/^matrix3d\(1e-7, /);
  });

  it('replaces the whole list of a node with corners, the rotation and the flip included', () => {
    expect(
      cssTransform({
        ...base,
        rotation: 30,
        origin: { x: 250, y: 750 },
        flip: { x: true, y: false },
        homography: MATRIX,
      }),
    ).toBe(cssMatrix3d(MATRIX));
  });

  it('writes the list of 0.29 for a node without a homography, the same string as before', () => {
    expect(cssTransform(base)).toBe('translate(3px, 4px) scale(2, 0.5)');
  });
});

const FONTS = new Map([['asset-font-proportional', fontMetrics(generateProportionalFont())]]);

function rendered(timeUs: number): HTMLElement {
  const composition = validated(cornersComposition);
  const root = createRoot();
  const urls = {
    'asset-image': 'data:image/png,',
    'asset-font-proportional': 'data:font/ttf,',
  };
  mountMeasured(root, composition, urls, TRUSTED, FONTS);
  renderState(root, evaluateComposition(composition, timeUs, FONTS));
  return root;
}

describe('the corners in the rendered tree (D91.1)', () => {
  it('writes a matrix3d for every node with corners, and hides a node while its quadrilateral is not convex', () => {
    const before = rendered(533_333);
    for (const id of [
      'corners-image',
      'corners-text',
      'corners-shape',
      'corners-group',
      'corners-instance',
      'corners-animated',
    ]) {
      expect(elementOf(before, id).style.getPropertyValue('transform'), id).toMatch(
        /^matrix3d\([^)]*\)$/,
      );
      expect(elementOf(before, id).style.getPropertyValue('visibility'), id).toBe('');
    }
    const after = rendered(566_666);
    expect(elementOf(after, 'corners-animated').style.getPropertyValue('visibility')).toBe(
      'hidden',
    );
    expect(elementOf(after, 'corners-image').style.getPropertyValue('visibility')).toBe('');
    // A background has no transform and is drawn as before.
    expect(elementOf(after, 'corners-background').style.getPropertyValue('visibility')).toBe('');
  });

  it('writes no matrix3d for the reference composition, whose nodes the step to 0.30 gave zero corners', () => {
    const composition = validated(referenceComposition);
    const root = createRoot();
    mountComposition(root, composition, referenceUrls, TRUSTED);
    renderState(root, evaluateComposition(composition, 5_000_000));
    const transforms = [...root.querySelectorAll<HTMLElement>('[data-kadrion-node]')].map(
      (element) => element.style.getPropertyValue('transform'),
    );
    expect(transforms.filter((transform) => transform !== '').length).toBeGreaterThan(3);
    expect(transforms.filter((transform) => transform.includes('matrix3d'))).toEqual([]);
  });
});

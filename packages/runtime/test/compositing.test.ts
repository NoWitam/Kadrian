/**
 * Compositing at one instant (D75): the mask of a node with the geometry and
 * the feather of the instant, its matte, and its blend mode, as the state
 * reports them. A shape mask is drawn as the path of its geometry in its box;
 * its geometry morphs number by number and its feather is sampled under the
 * easing of its keyframe, held within 0 and 1000. The expected values are
 * derived by hand from the compositing fixture.
 */
import type { Mask } from '@kadrion/schema';
import { compositingComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { FEATHER_BOUNDS, maskAt } from '../src/compositing.js';
import { evaluateComposition, type CompositionState } from '../src/index.js';
import { reference, stateNode, validated } from './support.js';

const composition = validated(compositingComposition);

function compositingOf(state: CompositionState, id: string): unknown {
  const node = stateNode(state, id) as unknown as Record<string, unknown>;
  return { mask: node['mask'], matte: node['matte'], blendMode: node['blendMode'] };
}

describe('the compositing of a node in the state (D75)', () => {
  it('is no mask, no matte, and the normal blend mode for every node of the reference', () => {
    const state = evaluateComposition(reference, 0);
    for (const id of ['node-group', 'node-image', 'node-caption', 'node-title']) {
      expect(compositingOf(state, id), id).toEqual({
        mask: { kind: 'none' },
        matte: { kind: 'none' },
        blendMode: 'normal',
      });
    }
  });

  it('carries the blend mode and the matte as the document gives them', () => {
    const state = evaluateComposition(composition, 0);
    expect(compositingOf(state, 'matte-group')).toMatchObject({ blendMode: 'lighten' });
    expect(compositingOf(state, 'matte-luminance-photo')).toEqual({
      mask: { kind: 'none' },
      matte: { kind: 'node', nodeId: 'matte-gradient', mode: 'luminance-inverted' },
      blendMode: 'normal',
    });
  });

  it('reports an image mask with the feather of the instant and no path', () => {
    const state = evaluateComposition(composition, 0);
    const { mask } = compositingOf(state, 'mask-image-bar') as { mask: Record<string, unknown> };
    expect(mask['kind']).toBe('image');
    expect(mask).not.toHaveProperty('path');
    expect(mask).not.toHaveProperty('animations');
  });

  it('morphs the geometry and samples the feather of a shape mask in scene time', () => {
    const at = (timeUs: number): Record<string, unknown> =>
      (
        compositingOf(evaluateComposition(composition, timeUs), 'mask-shape-photo') as {
          mask: Record<string, unknown>;
        }
      ).mask;
    // The feather runs linearly from 0 at 0 to 12 at 1 000 000, then holds.
    expect(at(0)['feather']).toBe(0);
    expect(at(500_000)['feather']).toBe(6);
    expect(at(1_500_000)['feather']).toBe(12);
    // A square of 140 at 0: a closed path of four lines and no arcs.
    const square = at(0)['path'] as readonly { kind: string }[];
    expect(square.map(({ kind }) => kind)).toEqual(['move', 'line', 'line', 'line', 'close']);
    // Rounded by the end: every corner an arc.
    const rounded = at(1_500_000)['path'] as readonly { kind: string }[];
    expect(rounded.filter(({ kind }) => kind === 'arc')).toHaveLength(4);
  });
});

describe('maskAt (D75)', () => {
  const feathered = (keyframes: readonly [number, number][]): Mask => ({
    kind: 'image',
    assetId: 'asset-image',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    mode: 'alpha',
    inverted: false,
    feather: 3,
    animations:
      keyframes.length === 0
        ? []
        : [
            {
              id: 'feather',
              property: 'feather',
              keyframes: keyframes.map(([timeUs, value]) => ({
                timeUs,
                value,
                easing: { kind: 'cubic-bezier', x1: 0.3, y1: -2, x2: 0.7, y2: 3 },
              })),
            },
          ],
  });

  it('keeps its own feather where nothing animates it', () => {
    expect(maskAt(feathered([]), 123)).toMatchObject({ feather: 3 });
  });

  it('holds an overshoot of the feather within 0 and 1000', () => {
    expect(FEATHER_BOUNDS).toEqual({ min: 0, max: 1000 });
    for (let timeUs = 0; timeUs <= 1000; timeUs += 50) {
      const low = maskAt(
        feathered([
          [0, 0],
          [1000, 10],
        ]),
        timeUs,
      ) as { feather: number };
      const high = maskAt(
        feathered([
          [0, 990],
          [1000, 1000],
        ]),
        timeUs,
      ) as { feather: number };
      expect(low.feather, String(timeUs)).toBeGreaterThanOrEqual(0);
      expect(high.feather, String(timeUs)).toBeLessThanOrEqual(1000);
    }
  });

  it('reports -0 as 0', () => {
    const mask = { ...feathered([]), feather: -0 } as Mask;
    expect(Object.is((maskAt(mask, 0) as { feather: number }).feather, 0)).toBe(true);
  });
});

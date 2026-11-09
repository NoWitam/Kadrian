/**
 * How a node is composited at one instant (D65.6, D75): its mask, with the
 * geometry and the feather of the instant, its matte, and its blend mode. A
 * shape mask is drawn as the path of its geometry in its box, as a shape is
 * (D73); its geometry morphs number by number under its animation, and its
 * feather is sampled by the rule of D18 under the easing of its keyframe (D67).
 */
import type { BlendMode, Mask, MaskAnimation, Matte } from '@kadrion/schema';

import type { Bounds } from './easing.js';
import { sampleNumberKeyframes, type Keyframe } from './keyframes.js';
import { animatedGeometry, shapePath } from './shapes.js';
import type { CompositingState, MaskState, MatteState } from './state.js';

/** The bounds of a feather, within which an eased segment is held (D75). */
export const FEATHER_BOUNDS: Bounds = { min: 0, max: 1000 };

type MaskAnimationOf<P extends MaskAnimation['property']> = Extract<MaskAnimation, { property: P }>;

/** The animation of one property of a mask, when it has one. */
function animationOf<P extends MaskAnimation['property']>(
  animations: readonly MaskAnimation[],
  property: P,
): MaskAnimationOf<P> | undefined {
  return animations.find(
    (animation): animation is MaskAnimationOf<P> => animation.property === property,
  );
}

/** The feather of a mask at `timeUs`: its own, or its animation's. -0 is reported as 0. */
function featherAt(
  mask: { readonly feather: number; readonly animations: readonly MaskAnimation[] },
  timeUs: number,
): number {
  const animation = animationOf(mask.animations, 'feather');
  if (animation === undefined) return mask.feather + 0;
  const keyframes = animation.keyframes as readonly Keyframe<number>[];
  return sampleNumberKeyframes(keyframes, FEATHER_BOUNDS, timeUs) + 0;
}

/** A mask at `timeUs` (D75). */
export function maskAt(mask: Mask, timeUs: number): MaskState {
  switch (mask.kind) {
    case 'none':
      return { kind: 'none' };
    case 'shape': {
      const geometry = animatedGeometry(
        mask.geometry,
        animationOf(mask.animations, 'geometry'),
        timeUs,
      );
      return {
        kind: 'shape',
        x: mask.x,
        y: mask.y,
        width: mask.width,
        height: mask.height,
        path: shapePath(geometry, { width: mask.width, height: mask.height }),
        inverted: mask.inverted,
        feather: featherAt(mask, timeUs),
      };
    }
    case 'image':
      return {
        kind: 'image',
        assetId: mask.assetId,
        x: mask.x,
        y: mask.y,
        width: mask.width,
        height: mask.height,
        mode: mask.mode,
        inverted: mask.inverted,
        feather: featherAt(mask, timeUs),
      };
  }
}

/** A matte as the state reports it: a copy that shares no object with the document (D75). */
function matteOf(matte: Matte): MatteState {
  return matte.kind === 'none'
    ? { kind: 'none' }
    : { kind: 'node', nodeId: matte.nodeId, mode: matte.mode };
}

/** The mask, matte, and blend mode of a node at `timeUs` (D75). */
export function compositingAt(
  node: { readonly mask: Mask; readonly matte: Matte; readonly blendMode: BlendMode },
  timeUs: number,
): CompositingState {
  return { mask: maskAt(node.mask, timeUs), matte: matteOf(node.matte), blendMode: node.blendMode };
}

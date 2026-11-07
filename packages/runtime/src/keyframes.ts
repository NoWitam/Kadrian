/**
 * Keyframe sampling and the one arithmetic rule of the runtime (D18). The order
 * of the operations is part of the contract: another order yields other bits.
 */
import type { Easing, NodeAnimation } from '@kadrion/schema';

import { easedValue, requireEasing, type Bounds } from './easing.js';
import { EvaluationError } from './errors.js';
import type { Vec2 } from './state.js';

interface Keyframe<Value> {
  readonly timeUs: number;
  readonly value: Value;
  readonly easing: Easing;
}

/**
 * The bounds of a keyframe value of each property in the schema (D16.6,
 * D41.3), within which an eased segment is held (D67.6). A test compares them
 * with `compositionSchema`.
 */
export const PROPERTY_BOUNDS: Readonly<Record<NodeAnimation['property'], Bounds>> = {
  opacity: { min: 0, max: 1 },
  position: { min: -1_000_000, max: 1_000_000 },
  scale: { min: 0, max: 1000 },
};

/**
 * The value of an animation at `timeUs` (D16.6, D18). At or before the first
 * keyframe the first value holds, and at or after the last keyframe the last
 * value holds. A time exactly on a keyframe yields the value of that keyframe
 * without any arithmetic; only a time strictly between two keyframes is
 * interpolated, by the easing of the earlier of the two (D67). Keyframe times
 * ascend strictly, which validation guarantees.
 */
function sample<Value>(
  keyframes: readonly Keyframe<Value>[],
  timeUs: number,
  between: (previous: Keyframe<Value>, next: Keyframe<Value>) => Value,
): Value {
  for (const keyframe of keyframes) requireEasing(keyframe.easing);
  let previous: Keyframe<Value> | undefined;
  for (const keyframe of keyframes) {
    if (timeUs <= keyframe.timeUs) {
      return previous === undefined || timeUs === keyframe.timeUs
        ? keyframe.value
        : between(previous, keyframe);
    }
    previous = keyframe;
  }
  if (previous === undefined) {
    const message = 'An animation without keyframes cannot come out of validateComposition.';
    throw new EvaluationError('invalid-document', message);
  }
  return previous.value;
}

export function sampleScalar(
  animation: Extract<NodeAnimation, { property: 'opacity' }>,
  timeUs: number,
): number {
  const bounds = PROPERTY_BOUNDS[animation.property];
  return sample(animation.keyframes, timeUs, (previous, next) =>
    easedValue(
      previous.easing,
      previous.value,
      next.value,
      timeUs - previous.timeUs,
      next.timeUs - previous.timeUs,
      bounds,
    ),
  );
}

/** `x` and `y` are independent channels of the same rule and the same easing. */
export function sampleVec2(
  animation: Extract<NodeAnimation, { property: 'position' | 'scale' }>,
  timeUs: number,
): Vec2 {
  const bounds = PROPERTY_BOUNDS[animation.property];
  return sample(animation.keyframes, timeUs, (previous, next) => {
    const elapsedUs = timeUs - previous.timeUs;
    const spanUs = next.timeUs - previous.timeUs;
    return {
      x: easedValue(previous.easing, previous.value.x, next.value.x, elapsedUs, spanUs, bounds),
      y: easedValue(previous.easing, previous.value.y, next.value.y, elapsedUs, spanUs, bounds),
    };
  });
}

/**
 * Keyframe sampling and the one arithmetic rule of the runtime (D18). The order
 * of the operations is part of the contract: another order yields other bits.
 */
import type { Easing, NodeAnimation } from '@kadrion/schema';

import { easedValue, requireEasing, within, type Bounds } from './easing.js';
import { EvaluationError } from './errors.js';
import type { CropState, Size, Vec2 } from './state.js';

interface Keyframe<Value> {
  readonly timeUs: number;
  readonly value: Value;
  readonly easing: Easing;
}

/**
 * The bounds of a keyframe value of each property in the schema (D16.6,
 * D41.3, D68), within which an eased segment is held (D67.6). A test compares
 * them with `compositionSchema`. A colour is held per channel, from 0 to 255.
 */
export const PROPERTY_BOUNDS: Readonly<Record<NodeAnimation['property'], Bounds>> = {
  opacity: { min: 0, max: 1 },
  position: { min: -1_000_000, max: 1_000_000 },
  scale: { min: 0, max: 1000 },
  rotation: { min: -360_000, max: 360_000 },
  origin: { min: -1000, max: 1000 },
  size: { min: 1, max: 1_000_000 },
  color: { min: 0, max: 255 },
  crop: { min: 0, max: 1000 },
  cornerRadius: { min: 0, max: 1_000_000 },
};

/**
 * The value of an animation at `timeUs` (D16.6, D18). At or before the first
 * keyframe the first value holds, and at or after the last keyframe the last
 * value holds. A time exactly on a keyframe yields the value of that keyframe
 * without any arithmetic; only a time strictly between two keyframes is
 * interpolated, by the easing of the earlier of the two (D67). Keyframe times
 * ascend strictly, which validation guarantees.
 */
function sample<Value, Out>(
  keyframes: readonly Keyframe<Value>[],
  timeUs: number,
  held: (value: Value) => Out,
  between: (previous: Keyframe<Value>, next: Keyframe<Value>) => Out,
): Out {
  for (const keyframe of keyframes) requireEasing(keyframe.easing);
  let previous: Keyframe<Value> | undefined;
  for (const keyframe of keyframes) {
    if (timeUs <= keyframe.timeUs) {
      return previous === undefined || timeUs === keyframe.timeUs
        ? held(keyframe.value)
        : between(previous, keyframe);
    }
    previous = keyframe;
  }
  if (previous === undefined) {
    const message = 'An animation without keyframes cannot come out of validateComposition.';
    throw new EvaluationError('invalid-document', message);
  }
  return held(previous.value);
}

type AnimationOf<P extends NodeAnimation['property']> = Extract<NodeAnimation, { property: P }>;

/** Every channel of a value by the same rule and the same easing (D18.3, D67, D68). */
function sampleChannels<Value, K extends string>(
  keyframes: readonly Keyframe<Value>[],
  bounds: Bounds,
  timeUs: number,
  channels: readonly K[],
  read: (value: Value) => Readonly<Record<K, number>>,
): Readonly<Record<K, number>> {
  return sample(keyframes, timeUs, read, (previous, next) => {
    const elapsedUs = timeUs - previous.timeUs;
    const spanUs = next.timeUs - previous.timeUs;
    const a = read(previous.value);
    const b = read(next.value);
    const out: Partial<Record<K, number>> = {};
    for (const channel of channels) {
      out[channel] = easedValue(previous.easing, a[channel], b[channel], elapsedUs, spanUs, bounds);
    }
    return out as Readonly<Record<K, number>>;
  });
}

const SCALAR = ['value'] as const;
const VECTOR = ['x', 'y'] as const;

export function sampleScalar(
  animation: AnimationOf<'opacity' | 'rotation' | 'cornerRadius'>,
  timeUs: number,
): number {
  const keyframes: readonly Keyframe<number>[] = animation.keyframes;
  const bounds = PROPERTY_BOUNDS[animation.property];
  return sampleChannels(keyframes, bounds, timeUs, SCALAR, (value) => ({ value })).value;
}

/** `x` and `y` are independent channels of the same rule and the same easing. */
export function sampleVec2(
  animation: AnimationOf<'position' | 'scale' | 'origin'>,
  timeUs: number,
): Vec2 {
  const keyframes: readonly Keyframe<Vec2>[] = animation.keyframes;
  const bounds = PROPERTY_BOUNDS[animation.property];
  const { x, y } = sampleChannels(keyframes, bounds, timeUs, VECTOR, (value) => value);
  return { x, y };
}

/** The width and the height of a box, two channels (D68). */
export function sampleSize(animation: AnimationOf<'size'>, timeUs: number): Size {
  const { width, height } = sampleChannels(
    animation.keyframes,
    PROPERTY_BOUNDS.size,
    timeUs,
    ['width', 'height'] as const,
    (value) => value,
  );
  return { width, height };
}

/** The channels of a lowercase `#rrggbb` colour. */
function channelsOf(hex: string): { readonly r: number; readonly g: number; readonly b: number } {
  const channel = (at: number): number => Number.parseInt(hex.slice(at, at + 2), 16);
  return { r: channel(1), g: channel(3), b: channel(5) };
}

/** One channel as two lowercase hexadecimal digits. */
function hexOf(channel: number): string {
  return channel.toString(16).padStart(2, '0');
}

/**
 * The colour of an animation at `timeUs` (D68): on a keyframe its own colour,
 * between two keyframes each sRGB channel by the rule of its easing on its own,
 * held within 0 and 255, and then rounded once to the integer nearest to it,
 * halves upwards: `floor(c + 0.5)`.
 */
export function sampleColor(animation: AnimationOf<'color'>, timeUs: number): string {
  const keyframes: readonly Keyframe<string>[] = animation.keyframes;
  const bounds = PROPERTY_BOUNDS.color;
  return sample(
    keyframes,
    timeUs,
    (value) => value,
    (previous, next) => {
      const elapsedUs = timeUs - previous.timeUs;
      const spanUs = next.timeUs - previous.timeUs;
      const a = channelsOf(previous.value);
      const b = channelsOf(next.value);
      const rounded = (channel: 'r' | 'g' | 'b'): string => {
        const value = easedValue(
          previous.easing,
          a[channel],
          b[channel],
          elapsedUs,
          spanUs,
          bounds,
        );
        return hexOf(Math.floor(within(value, bounds.min, bounds.max) + 0.5));
      };
      return `#${rounded('r')}${rounded('g')}${rounded('b')}`;
    },
  );
}

/**
 * Two opposite insets that add up to more than 999 per mille, as an eased
 * segment can make them, are both reduced in proportion so that they add up to
 * 999: `a · 999 / (a + b)` (D68). Insets that leave a picture are returned as
 * they are.
 */
function opposite(a: number, b: number): readonly [number, number] {
  const sum = a + b;
  if (sum <= 999) return [a, b];
  return [(a * 999) / sum, (b * 999) / sum];
}

/** The crop of an animation at `timeUs` (D68): four channels, then opposite insets held. */
export function sampleCrop(animation: AnimationOf<'crop'>, timeUs: number): CropState {
  const crop = sampleChannels(
    animation.keyframes,
    PROPERTY_BOUNDS.crop,
    timeUs,
    ['top', 'right', 'bottom', 'left'] as const,
    (value) => value,
  );
  return cropState(crop);
}

/** The key of a top inset, held in a constant: a literal `top` reads like the global of a page. */
const TOP = 'top';

/** A crop of the document or of an animation, its opposite insets held (D68). */
export function cropState(crop: {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}): CropState {
  const [fromLeft, fromRight] = opposite(crop.left, crop.right);
  const [fromTop, fromBottom] = opposite(crop[TOP], crop.bottom);
  return { fromTop, fromRight, fromBottom, fromLeft };
}

/**
 * The effects of a node, a group, or a scene at one instant (D71, D72): each
 * parameter is its own value, or what its animation replaces it with, sampled
 * by the rule of D18 under the easing of its keyframe (D67) and held within
 * the bounds of the parameter where eased (D67.6). A colour is sampled per
 * channel and rounded once (D68).
 */
import type { Effect, EffectAnimation } from '@kadrion/schema';

import type { Bounds } from './easing.js';
import { unsupported } from './errors.js';
import {
  sampleColorKeyframes,
  sampleNumberKeyframes,
  sampleVec2Keyframes,
  type Keyframe,
} from './keyframes.js';
import type { EffectState, Vec2 } from './state.js';

/**
 * The bounds of every parameter of every kind in the schema (D71), within which
 * an eased segment is held. A test compares them with `compositionSchema`.
 */
export const EFFECT_BOUNDS = {
  blur: { radius: { min: 0, max: 1000 } },
  brightness: { amount: { min: 0, max: 10 } },
  contrast: { amount: { min: 0, max: 10 } },
  saturate: { amount: { min: 0, max: 10 } },
  'hue-rotate': { angle: { min: -360_000, max: 360_000 } },
  grayscale: { amount: { min: 0, max: 1 } },
  invert: { amount: { min: 0, max: 1 } },
  sepia: { amount: { min: 0, max: 1 } },
  'drop-shadow': {
    opacity: { min: 0, max: 1 },
    offset: { min: -1000, max: 1000 },
    blur: { min: 0, max: 1000 },
  },
  curves: { amount: { min: 0, max: 1 } },
  'color-grade': {
    lift: { min: -1, max: 1 },
    gamma: { min: 0.1, max: 10 },
    gain: { min: 0, max: 10 },
    temperature: { min: -1, max: 1 },
    tint: { min: -1, max: 1 },
  },
  glow: { opacity: { min: 0, max: 1 }, radius: { min: 0, max: 1000 } },
  vignette: { amount: { min: 0, max: 1 }, size: { min: 0.05, max: 10 } },
  'chroma-key': {
    tolerance: { min: 0, max: 1 },
    softness: { min: 0.01, max: 1 },
    spill: { min: 0, max: 1 },
  },
} as const satisfies Readonly<Record<Effect['kind'], Readonly<Record<string, Bounds>>>>;

/** The animation of one parameter of an effect, when it has one. */
function animationOf(
  effect: { readonly animations: readonly EffectAnimation[] },
  parameter: string,
): EffectAnimation | undefined {
  return effect.animations.find((animation) => animation.property === parameter);
}

/** A number parameter: its own value, or its animation's at `timeUs`. -0 is reported as 0. */
function numberAt(
  effect: { readonly animations: readonly EffectAnimation[] },
  parameter: string,
  own: number,
  bounds: Bounds,
  timeUs: number,
): number {
  const animation = animationOf(effect, parameter);
  if (animation === undefined) return own + 0;
  const keyframes = animation.keyframes as readonly Keyframe<number>[];
  return sampleNumberKeyframes(keyframes, bounds, timeUs) + 0;
}

/** One effect at `timeUs` (D71). */
function effectAt(effect: Effect, timeUs: number): EffectState {
  switch (effect.kind) {
    case 'blur':
      return {
        id: effect.id,
        kind: effect.kind,
        radius: numberAt(effect, 'radius', effect.radius, EFFECT_BOUNDS.blur.radius, timeUs),
      };
    case 'brightness':
    case 'contrast':
    case 'saturate':
    case 'grayscale':
    case 'invert':
    case 'sepia':
      return {
        id: effect.id,
        kind: effect.kind,
        amount: numberAt(
          effect,
          'amount',
          effect.amount,
          EFFECT_BOUNDS[effect.kind].amount,
          timeUs,
        ),
      };
    case 'hue-rotate':
      return {
        id: effect.id,
        kind: effect.kind,
        angle: numberAt(effect, 'angle', effect.angle, EFFECT_BOUNDS['hue-rotate'].angle, timeUs),
      };
    case 'drop-shadow': {
      const bounds = EFFECT_BOUNDS['drop-shadow'];
      const color = animationOf(effect, 'color');
      const offset = animationOf(effect, 'offset');
      const sampledOffset: Vec2 =
        offset === undefined
          ? { x: effect.offset.x, y: effect.offset.y }
          : sampleVec2Keyframes(
              offset.keyframes as readonly Keyframe<Vec2>[],
              bounds.offset,
              timeUs,
            );
      return {
        id: effect.id,
        kind: effect.kind,
        color:
          color === undefined
            ? effect.color
            : sampleColorKeyframes(color.keyframes as readonly Keyframe<string>[], timeUs),
        opacity: numberAt(effect, 'opacity', effect.opacity, bounds.opacity, timeUs),
        offset: { x: sampledOffset.x + 0, y: sampledOffset.y + 0 },
        blur: numberAt(effect, 'blur', effect.blur, bounds.blur, timeUs),
      };
    }
    case 'curves':
      return {
        id: effect.id,
        kind: effect.kind,
        red: effect.red.map((level) => level + 0),
        green: effect.green.map((level) => level + 0),
        blue: effect.blue.map((level) => level + 0),
        amount: numberAt(effect, 'amount', effect.amount, EFFECT_BOUNDS.curves.amount, timeUs),
      };
    case 'color-grade': {
      const bounds = EFFECT_BOUNDS['color-grade'];
      return {
        id: effect.id,
        kind: effect.kind,
        lift: numberAt(effect, 'lift', effect.lift, bounds.lift, timeUs),
        gamma: numberAt(effect, 'gamma', effect.gamma, bounds.gamma, timeUs),
        gain: numberAt(effect, 'gain', effect.gain, bounds.gain, timeUs),
        temperature: numberAt(
          effect,
          'temperature',
          effect.temperature,
          bounds.temperature,
          timeUs,
        ),
        tint: numberAt(effect, 'tint', effect.tint, bounds.tint, timeUs),
      };
    }
    case 'glow': {
      const bounds = EFFECT_BOUNDS.glow;
      const color = animationOf(effect, 'color');
      return {
        id: effect.id,
        kind: effect.kind,
        color:
          color === undefined
            ? effect.color
            : sampleColorKeyframes(color.keyframes as readonly Keyframe<string>[], timeUs),
        opacity: numberAt(effect, 'opacity', effect.opacity, bounds.opacity, timeUs),
        radius: numberAt(effect, 'radius', effect.radius, bounds.radius, timeUs),
      };
    }
    case 'vignette':
      return {
        id: effect.id,
        kind: effect.kind,
        amount: numberAt(effect, 'amount', effect.amount, EFFECT_BOUNDS.vignette.amount, timeUs),
        size: numberAt(effect, 'size', effect.size, EFFECT_BOUNDS.vignette.size, timeUs),
      };
    case 'chroma-key': {
      const bounds = EFFECT_BOUNDS['chroma-key'];
      return {
        id: effect.id,
        kind: effect.kind,
        key: effect.key,
        tolerance: numberAt(effect, 'tolerance', effect.tolerance, bounds.tolerance, timeUs),
        softness: numberAt(effect, 'softness', effect.softness, bounds.softness, timeUs),
        spill: numberAt(effect, 'spill', effect.spill, bounds.spill, timeUs),
      };
    }
    default:
      return unsupported(effect, 'kind');
  }
}

/**
 * The effects of a list at `timeUs`, in their order (D71): `timeUs` is the time
 * of the scene, in which the keyframes of every effect lie, those of a scene's
 * effects included.
 */
export function effectsAt(effects: readonly Effect[], timeUs: number): EffectState[] {
  return effects.map((effect) => effectAt(effect, timeUs));
}

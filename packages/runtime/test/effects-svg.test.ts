/**
 * The effects of SVG filters (D72): curves, a colour grade, a glow, a
 * vignette, and a chroma key at one instant, sampled from their own animations
 * in scene time like every effect (D71), with their tables and their key
 * channel carried as they are. The expected values are derived by hand from
 * the composition of SVG effects.
 */
import type { Effect } from '@kadrion/schema';
import { effectsSvgComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { EFFECT_BOUNDS } from '../src/effects.js';
import {
  effectsAt,
  evaluateComposition,
  type CompositionState,
  type EffectState,
} from '../src/index.js';
import { stateNode, validated } from './support.js';

const composition = validated(effectsSvgComposition);
const LINEAR = { kind: 'linear' } as const;

function effectsOf(state: CompositionState, id: string): readonly EffectState[] {
  const node = stateNode(state, id);
  if (!('effects' in node)) throw new Error(`${id} has no effects.`);
  return node.effects;
}

describe('the effects of SVG filters (D72)', () => {
  it('carry the tables of curves and mix them in by their animated amount', () => {
    const curves = (timeUs: number): unknown =>
      effectsOf(evaluateComposition(composition, timeUs), 'svg-curves')[0];
    const tables = {
      red: [0, 0.15, 0.5, 0.85, 1],
      green: [0, 0.15, 0.5, 0.85, 1],
      blue: [0.1, 0.4, 0.9],
    };
    expect(curves(0)).toEqual({ id: 'svg-curves-e0', kind: 'curves', ...tables, amount: 0 });
    // Ease-in-out from 0 to 1 over 1 s: half way at the middle.
    expect(curves(500_000)).toEqual({
      id: 'svg-curves-e0',
      kind: 'curves',
      ...tables,
      amount: 0.5,
    });
    expect(curves(1_100_000)).toEqual({
      id: 'svg-curves-e0',
      kind: 'curves',
      ...tables,
      amount: 1,
    });
  });

  it('move the temperature of a colour grade and keep its other parameters', () => {
    const grade = (timeUs: number): unknown =>
      effectsOf(evaluateComposition(composition, timeUs), 'svg-grade')[0];
    const rest = { id: 'svg-grade-e0', kind: 'color-grade', lift: 0.05, gamma: 1.2, gain: 1.1 };
    expect(grade(0)).toEqual({ ...rest, temperature: -0.8, tint: 0 });
    expect(grade(500_000)).toEqual({ ...rest, temperature: 0, tint: 0 });
    expect(grade(1_000_000)).toEqual({ ...rest, temperature: 0.8, tint: 0 });
  });

  it('spread a glow and turn its colour per channel', () => {
    const state = evaluateComposition(composition, 1_000_000);
    expect(effectsOf(state, 'svg-glow')).toEqual([
      { id: 'svg-glow-e0', kind: 'glow', color: '#f79009', opacity: 0.9, radius: 10 },
    ]);
    expect(effectsOf(state, 'svg-group')).toEqual([
      { id: 'svg-group-e0', kind: 'glow', color: '#12b76a', opacity: 1, radius: 6 },
    ]);
    const start = effectsOf(evaluateComposition(composition, 0), 'svg-group')[0];
    expect(start).toEqual({
      id: 'svg-group-e0',
      kind: 'glow',
      color: '#7a5af8',
      opacity: 1,
      radius: 6,
    });
  });

  it('deepen the vignette of a scene in scene time', () => {
    const scene = (timeUs: number): unknown =>
      evaluateComposition(composition, timeUs).scenes[0]?.effects;
    expect(scene(0)).toEqual([{ id: 'scene-svg-e0', kind: 'vignette', amount: 0, size: 0.8 }]);
    expect(scene(500_000)).toEqual([
      { id: 'scene-svg-e0', kind: 'vignette', amount: 0.25, size: 0.8 },
    ]);
  });

  it('carry the key channel of a chroma key and animate its spill', () => {
    const key = (timeUs: number): unknown =>
      effectsOf(evaluateComposition(composition, timeUs), 'svg-key')[0];
    const rest = {
      id: 'svg-key-e0',
      kind: 'chroma-key',
      key: 'green',
      tolerance: 0.1,
      softness: 0.1,
    };
    expect(key(0)).toEqual({ ...rest, spill: 0 });
    expect(key(500_000)).toEqual({ ...rest, spill: 0.5 });
    expect(key(1_000_000)).toEqual({ ...rest, spill: 1 });
  });

  it('keep the order of a chain of CSS and SVG filters', () => {
    const state = evaluateComposition(composition, 0);
    expect(effectsOf(state, 'svg-chain').map(({ kind }) => kind)).toEqual([
      'brightness',
      'curves',
      'blur',
    ]);
  });

  it('are every kind over an image, a text, and a video in the last scene', () => {
    const state = evaluateComposition(composition, 1_400_000);
    const scene = state.scenes.find((item) => item.id === 'scene-kinds');
    const kinds = (scene?.nodes ?? []).flatMap((node) =>
      'effects' in node ? node.effects.map(({ kind }) => `${node.type} ${kind}`) : [],
    );
    const svg = Object.keys(EFFECT_BOUNDS).slice(9);
    expect(svg).toEqual(['curves', 'color-grade', 'glow', 'vignette', 'chroma-key']);
    for (const kind of svg) {
      for (const type of ['image', 'text', 'video']) expect(kinds).toContain(`${type} ${kind}`);
    }
  });

  it('hold an overshoot within the bounds of the parameter', () => {
    const overshoot = { kind: 'cubic-bezier', x1: 0.3, y1: 2, x2: 0.7, y2: 2 } as const;
    const effect: Effect = {
      id: 'e',
      kind: 'vignette',
      amount: 0,
      size: 0.05,
      animations: [
        {
          id: 'e-a-size',
          property: 'size',
          keyframes: [
            { timeUs: 0, value: 10, easing: overshoot },
            { timeUs: 1_000_000, value: 0.05, easing: LINEAR },
          ],
        },
      ],
    };
    expect(effectsAt([effect], 500_000)).toEqual([
      { id: 'e', kind: 'vignette', amount: 0, size: 0.05 },
    ]);
  });

  it('never report -0, a level of a curve included', () => {
    const effect: Effect = {
      id: 'e',
      kind: 'curves',
      red: [-0, 1],
      green: [0, 1],
      blue: [0, 1],
      amount: -0,
      animations: [],
    };
    const [state] = effectsAt([effect], 0) as unknown as [{ red: number[]; amount: number }];
    expect(Object.is(state.red[0], 0)).toBe(true);
    expect(Object.is(state.amount, 0)).toBe(true);
  });
});

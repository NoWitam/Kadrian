/**
 * Effects (D71): the parameters of every effect at one instant, sampled from
 * its own animations in scene time and held within the bounds of the schema;
 * the effects of a node, a group, and a scene in the state; and the blur
 * dissolve, which blurs one side out while the other blurs in. The expected
 * values are derived by hand from the effects fixture.
 */
import { compositionSchema, type Effect } from '@kadrion/schema';
import { effectsComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { EFFECT_BOUNDS } from '../src/effects.js';
import {
  effectsAt,
  evaluateComposition,
  type CompositionState,
  type EffectState,
  type SceneState,
} from '../src/index.js';
import { reference, stateNode, validated } from './support.js';

const composition = validated(effectsComposition);
const LINEAR = { kind: 'linear' } as const;

function sceneOf(state: CompositionState, id: string): SceneState {
  const scene = state.scenes.find((item) => item.id === id);
  if (scene === undefined) throw new Error(`No scene ${id}.`);
  return scene;
}

function effectsOf(state: CompositionState, id: string): readonly EffectState[] {
  const node = stateNode(state, id);
  if (!('effects' in node)) throw new Error(`${id} has no effects.`);
  return node.effects;
}

describe('the parameters of an effect (D71)', () => {
  it('are its own values where nothing animates them', () => {
    const state = evaluateComposition(composition, 600_000);
    expect(effectsOf(state, 'effects-video')).toEqual([
      { id: 'effects-video-e0', kind: 'grayscale', amount: 1 },
      { id: 'effects-video-e1', kind: 'contrast', amount: 1.4 },
    ]);
    expect(effectsOf(state, 'effects-group-image')).toEqual([
      { id: 'effects-group-image-e0', kind: 'saturate', amount: 2 },
    ]);
    expect(sceneOf(state, 'scene-effects').effects).toEqual([
      { id: 'scene-effects-e0', kind: 'saturate', amount: 1.2 },
    ]);
  });

  it('follow a linear animation in scene time, and hold the nearest keyframe outside it', () => {
    // The hue turns from 0 to 180 degrees over 1.2 s.
    const angle = (timeUs: number): unknown =>
      effectsOf(evaluateComposition(composition, timeUs), 'effects-hue')[0];
    expect(angle(0)).toEqual({ id: 'effects-hue-e0', kind: 'hue-rotate', angle: 0 });
    expect(angle(600_000)).toEqual({ id: 'effects-hue-e0', kind: 'hue-rotate', angle: 90 });
    expect(angle(1_000_000)).toEqual({ id: 'effects-hue-e0', kind: 'hue-rotate', angle: 150 });
    // The blur of the image has come to rest at 0 after 600 ms.
    expect(effectsOf(evaluateComposition(composition, 700_000), 'effects-blur')).toEqual([
      { id: 'effects-blur-e0', kind: 'blur', radius: 0 },
    ]);
  });

  it('sample an eased animation as a keyframe of a node does', () => {
    const start = effectsOf(evaluateComposition(composition, 0), 'effects-blur')[0];
    const after = effectsOf(evaluateComposition(composition, 200_000), 'effects-blur')[0];
    expect(start).toEqual({ id: 'effects-blur-e0', kind: 'blur', radius: 8 });
    // Ease-out from 8 to 0: past the linear value of 16/3 at a third of the way.
    expect(after).toMatchObject({ kind: 'blur' });
    const radius = (after as { radius: number }).radius;
    expect(radius).toBeLessThan(16 / 3);
    expect(radius).toBeGreaterThan(0);
  });

  it('move every parameter of a drop shadow: its offset and its colour per channel', () => {
    const shadow = (timeUs: number): unknown =>
      effectsOf(evaluateComposition(composition, timeUs), 'effects-text')[1];
    expect(shadow(0)).toEqual({
      id: 'effects-text-e1',
      kind: 'drop-shadow',
      color: '#12b76a',
      opacity: 0.9,
      offset: { x: -4, y: 6 },
      blur: 4,
    });
    expect(shadow(1_100_000)).toMatchObject({ color: '#7a5af8' });
    const offset = (timeUs: number): unknown =>
      (
        effectsOf(evaluateComposition(composition, timeUs), 'effects-shadow')[0] as {
          offset: unknown;
        }
      ).offset;
    expect(offset(0)).toEqual({ x: 0, y: 0 });
    expect(offset(600_000)).toEqual({ x: 10, y: 12 });
    expect(offset(900_000)).toEqual({ x: 10, y: 12 });
  });

  it('follow the scene time of a scene that starts later', () => {
    // scene-dissolve starts at 0.8 s; its contrast falls from 1 to 0.6 over its first second.
    const state = evaluateComposition(composition, 1_300_000);
    expect(sceneOf(state, 'scene-dissolve').effects).toEqual([
      { id: 'scene-dissolve-e0', kind: 'contrast', amount: 0.8 },
    ]);
  });

  it('hold an overshoot within the bounds of the parameter', () => {
    const overshoot = { kind: 'cubic-bezier', x1: 0.3, y1: 2, x2: 0.7, y2: 2 } as const;
    const effect: Effect = {
      id: 'e',
      kind: 'grayscale',
      amount: 0,
      animations: [
        {
          id: 'e-a-amount',
          property: 'amount',
          keyframes: [
            { timeUs: 0, value: 0, easing: overshoot },
            { timeUs: 1_000_000, value: 1, easing: LINEAR },
          ],
        },
      ],
    };
    expect(effectsAt([effect], 500_000)).toEqual([{ id: 'e', kind: 'grayscale', amount: 1 }]);
  });

  it('are those of every kind over an image, a text, and a video in the last scene', () => {
    const state = evaluateComposition(composition, 2_000_000);
    const scene = sceneOf(state, 'scene-kinds');
    const kinds = scene.nodes.flatMap((node) =>
      'effects' in node ? node.effects.map(({ kind }) => `${node.type} ${kind}`) : [],
    );
    // The kinds of CSS filters; those of SVG filters are in effects-svg.test.ts (D72).
    const css = Object.keys(EFFECT_BOUNDS).slice(0, 9);
    expect(css.at(-1)).toBe('drop-shadow');
    for (const kind of css) {
      for (const type of ['image', 'text', 'video']) expect(kinds).toContain(`${type} ${kind}`);
    }
  });

  it('never report -0', () => {
    const effect: Effect = {
      id: 'e',
      kind: 'drop-shadow',
      color: '#000000',
      opacity: 1,
      offset: { x: -0, y: -0 },
      blur: 0,
      animations: [],
    };
    const [state] = effectsAt([effect], 0) as unknown as [{ offset: { x: number; y: number } }];
    expect(Object.is(state.offset.x, 0)).toBe(true);
    expect(Object.is(state.offset.y, 0)).toBe(true);
  });
});

describe('the bounds of the parameters (D71)', () => {
  it('are the bounds of each parameter in the schema', () => {
    expect(findEffects()).toEqual(EFFECT_BOUNDS);
  });
});

/** The bounds of every animated parameter of every kind, read from the schema. */
function findEffects(): Record<string, Record<string, { min: unknown; max: unknown }>> {
  const found: Record<string, Record<string, { min: unknown; max: unknown }>> = {};
  const walk = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return;
    const properties = (node as { properties?: Record<string, Record<string, unknown>> })
      .properties;
    const kind = (properties?.['kind'] as { const?: string } | undefined)?.const;
    const animations = properties?.['animations'] as
      { items?: { oneOf?: { properties: Record<string, Record<string, unknown>> }[] } } | undefined;
    if (kind !== undefined && animations?.items?.oneOf !== undefined) {
      const bounds: Record<string, { min: unknown; max: unknown }> = {};
      for (const row of animations.items.oneOf) {
        const parameter = (row.properties['property'] as { const: string }).const;
        const value = (
          row.properties['keyframes'] as {
            items: { properties: { value: Record<string, unknown> } };
          }
        ).items.properties.value;
        const channels = value['properties'] as Record<string, Record<string, unknown>> | undefined;
        // A colour is a string, held per channel by the rule of D68.
        if (value['type'] === 'string') continue;
        const scalar = channels?.['x'] ?? value;
        bounds[parameter] = { min: scalar['minimum'], max: scalar['maximum'] };
      }
      found[kind] ??= bounds;
      return;
    }
    for (const child of Object.values(node)) walk(child);
  };
  walk(compositionSchema);
  return found;
}

describe('the effects in the state (D71)', () => {
  it('are empty for a node, a group, and a scene without effects, and absent from a background and Custom HTML', () => {
    const state = evaluateComposition(reference, 0);
    const [scene] = state.scenes;
    expect(scene?.effects).toEqual([]);
    for (const id of ['node-group', 'node-image', 'node-caption', 'node-title']) {
      expect(effectsOf(state, id)).toEqual([]);
    }
    for (const node of scene?.nodes ?? []) {
      if (node.type === 'background' || node.type === 'custom-html') {
        expect('effects' in node).toBe(false);
      }
    }
    expect(scene?.nodes.map(({ type }) => type)).toContain('custom-html');
  });

  it('are those of a group, besides those of its children', () => {
    const state = evaluateComposition(composition, 0);
    expect(effectsOf(state, 'effects-group')).toEqual([
      { id: 'effects-group-e0', kind: 'brightness', amount: 0.5 },
    ]);
    expect(effectsOf(state, 'effects-group-text')).toEqual([
      {
        id: 'effects-group-text-e0',
        kind: 'drop-shadow',
        color: '#f04438',
        opacity: 1,
        offset: { x: 3, y: 3 },
        blur: 0,
      },
    ]);
  });
});

describe('the blur dissolve (D71)', () => {
  it('blurs the outgoing scene out while the incoming one blurs in and fades in', () => {
    // The transition runs from 0.8 s to 1.2 s with a radius of 12; at 1 s it is halfway.
    const state = evaluateComposition(composition, 1_000_000);
    expect(state.scenes.map(({ id }) => id)).toEqual(['scene-effects', 'scene-dissolve']);
    expect(sceneOf(state, 'scene-effects').transition).toEqual({
      id: 'scene-blur-dissolve',
      blur: 6,
    });
    expect(sceneOf(state, 'scene-dissolve').transition).toEqual({
      id: 'scene-blur-dissolve',
      opacity: 0.5,
      blur: 6,
    });
  });

  it('blurs the outgoing clip out while the incoming one blurs in and fades in', () => {
    // In scene-dissolve, from 0.4 s to 0.6 s of scene time with a radius of 10.
    const state = evaluateComposition(composition, 1_300_000);
    const image = stateNode(state, 'dissolve-image');
    const text = stateNode(state, 'dissolve-text');
    expect(image.transition).toEqual({ id: 'dissolve-clips', blur: 5 });
    expect(text.transition).toEqual({ id: 'dissolve-clips', blur: 5 });
    expect(text.opacity).toBe(0.5);
    expect(image.opacity).toBe(1);
  });

  it('leaves no trace before and after it', () => {
    for (const timeUs of [700_000, 1_400_000]) {
      const state = evaluateComposition(composition, timeUs);
      for (const scene of state.scenes) expect(scene.transition).toBeUndefined();
    }
  });
});

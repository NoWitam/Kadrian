/**
 * The seam of D41.4 at the bus: the minimum number of keyframes is the one
 * `compositionSchema` states, read where `RemoveKeyframe` runs, not a number of
 * `editor-sdk`. Schema `0.2` states 2 for every property, so a bus that wrote
 * out 2 would pass every other test; here the module `@kadrion/schema` hands the
 * SDK other metadata — opacity takes three keyframes — while its validator stays
 * the real one, which accepts two. Only the SDK's reading can then refuse a
 * removal that leaves two. Neither schema 0.2 nor the public API changes; the
 * mock is local to this file.
 */
import { referenceComposition } from '@kadrion/test-fixtures';
import { describe, expect, it, vi } from 'vitest';

import { keyframeMinimum } from '../src/animations.js';
import { createCommandBus, type Command } from '../src/index.js';

import { errorOf, json } from './support.js';

vi.mock('@kadrion/schema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@kadrion/schema')>();
  const schema = structuredClone(actual.compositionSchema) as unknown as {
    properties: { scenes: { items: { properties: { nodes: { items: { oneOf: unknown[] } } } } } };
  };
  type Shape = { properties: { property: { const: string }; keyframes: { minItems: number } } };
  type Variant = {
    properties: {
      animations?: { items: { oneOf: Shape[] } };
      children?: { items: { oneOf: Variant[] } };
    };
  };
  const visit = (variant: Variant): void => {
    for (const shape of variant.properties.animations?.items.oneOf ?? []) {
      if (shape.properties.property.const === 'opacity') shape.properties.keyframes.minItems = 3;
    }
    for (const child of variant.properties.children?.items.oneOf ?? []) visit(child);
  };
  for (const variant of schema.properties.scenes.items.properties.nodes.items.oneOf) {
    visit(variant as Variant);
  }
  return { ...actual, compositionSchema: schema };
});

const { compositionSchema } = await import('@kadrion/schema');

function removeKeyframe(animationId: string, timeUs: number): Command {
  return { type: 'RemoveKeyframe', animationId, timeUs };
}

function addKeyframe(animationId: string, timeUs: number, value: unknown): Command {
  return { type: 'AddKeyframe', animationId, keyframe: { timeUs, value } };
}

describe('the minimum of RemoveKeyframe is the schema’s (D41.4)', () => {
  it('sees the other metadata', () => {
    expect(keyframeMinimum(compositionSchema, 'opacity')).toBe(3);
    expect(keyframeMinimum(compositionSchema, 'scale')).toBe(2);
  });

  it('refuses to leave an opacity animation two keyframes, which the validator would accept', () => {
    const bus = createCommandBus(referenceComposition, { historyLimit: 10 });
    bus.dispatch(addKeyframe('anim-title-opacity', 5_000_000, 0.5));
    const before = json(bus.getDocument());
    const error = errorOf(() => bus.dispatch(removeKeyframe('anim-title-opacity', 0)));
    expect(error.code).toBe('too-few-keyframes');
    expect(error.details).toEqual(['anim-title-opacity']);
    expect(json(bus.getDocument())).toBe(before);
  });

  it('still lets a scale animation go down to two', () => {
    const bus = createCommandBus(referenceComposition, { historyLimit: 10 });
    bus.dispatch(addKeyframe('anim-image-scale', 5_000_000, { x: 2, y: 2 }));
    bus.dispatch(removeKeyframe('anim-image-scale', 2_500_000));
    const animations = (
      bus.getDocument().scenes[0]?.nodes.find(({ id }) => id === 'node-group') as unknown as {
        children: { id: string; animations: { keyframes: { timeUs: number }[] }[] }[];
      }
    ).children.find(({ id }) => id === 'node-image')?.animations;
    expect(animations?.[0]?.keyframes.map(({ timeUs }) => timeUs)).toEqual([5_000_000, 10_000_000]);
  });
});

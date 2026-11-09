/**
 * The commands of D71 — `AddEffect`, `RemoveEffect`, `ReorderEffect`, and
 * `SetEffect` — through `applyCommand`, each undone by its inverse to the exact
 * text of the document before it; and the commands that copy, split, and move
 * a node or a scene, which carry its effects: a copy renames them after its
 * owner, a split hands the second half its own, and a move moves their
 * keyframes with the node.
 */
import type { ValidatedComposition } from '@kadrion/schema';
import { effectsComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { applyCommand, type Command } from '../src/index.js';

import { codeOf, json, nodeOf, reference, validated } from './support.js';

const LINEAR = { kind: 'linear' } as const;

/** A blur of the given ID, animated from 8 to 0 over the first second. */
function blur(id: string): Record<string, unknown> {
  return {
    id,
    kind: 'blur',
    radius: 0,
    animations: [
      {
        id: `${id}-a-radius`,
        property: 'radius',
        keyframes: [
          { timeUs: 0, value: 8, easing: { kind: 'ease-out' } },
          { timeUs: 1_000_000, value: 0, easing: LINEAR },
        ],
      },
    ],
  };
}

/** A plain grey of the given ID. */
function grey(id: string): Record<string, unknown> {
  return { id, kind: 'grayscale', amount: 1, animations: [] };
}

function apply(command: unknown, document: unknown = reference()): ValidatedComposition {
  return applyCommand(document as ValidatedComposition, command as Command).document;
}

/** Applies a command and its inverse, checks the restored text, and returns the result. */
function roundTrip(command: unknown, document: unknown = reference()) {
  const result = applyCommand(document as ValidatedComposition, command as Command);
  if (result.inverse === null) throw new Error('The command changed nothing.');
  expect(json(applyCommand(result.document, result.inverse).document)).toBe(json(document));
  return result;
}

function effectsOf(document: unknown, ownerId: string): Record<string, unknown>[] {
  const scene = (
    document as { scenes: { id: string; effects: Record<string, unknown>[] }[] }
  ).scenes.find(({ id }) => id === ownerId);
  if (scene !== undefined) return scene.effects;
  return (nodeOf(document, ownerId) as unknown as { effects: Record<string, unknown>[] }).effects;
}

const idsOf = (document: unknown, ownerId: string): unknown[] =>
  effectsOf(document, ownerId).map(({ id }) => id);

/** The reference with effects on the image, in this order. */
function withEffects(...effects: Record<string, unknown>[]): ValidatedComposition {
  return effects.reduce<ValidatedComposition>(
    (document, effect, index) =>
      apply({ type: 'AddEffect', ownerId: 'node-image', index, effect }, document),
    reference(),
  );
}

describe('AddEffect (D71)', () => {
  it.each(['node-image', 'node-title', 'node-caption', 'node-group', 'scene-main'])(
    'adds an effect to %s with its animations, and is undone exactly',
    (ownerId) => {
      const result = roundTrip({ type: 'AddEffect', ownerId, index: 0, effect: blur('effect') });
      expect(effectsOf(result.document, ownerId)).toEqual([blur('effect')]);
      expect(result.createdIds).toEqual(['effect', 'effect-a-radius']);
    },
  );

  it('inserts at its index, the last one included', () => {
    const document = withEffects(grey('first'), grey('second'));
    expect(idsOf(document, 'node-image')).toEqual(['first', 'second']);
    const between = apply(
      { type: 'AddEffect', ownerId: 'node-image', index: 1, effect: grey('between') },
      document,
    );
    expect(idsOf(between, 'node-image')).toEqual(['first', 'between', 'second']);
  });

  it('keeps the effects the last field of their owner', () => {
    const document = withEffects(grey('first'));
    expect(Object.keys(nodeOf(document, 'node-image')).at(-1)).toBe('effects');
  });

  it('is refused for a background or Custom HTML, an unknown owner, an index past the end, and a taken ID', () => {
    const add = (ownerId: string, index: number, effect: unknown) => () =>
      applyCommand(reference(), { type: 'AddEffect', ownerId, index, effect } as Command);
    expect(codeOf(add('node-background', 0, grey('e')))).toBe('unsupported-node');
    expect(codeOf(add('node-custom-html', 0, grey('e')))).toBe('unsupported-node');
    expect(codeOf(add('node-nobody', 0, grey('e')))).toBe('unknown-node');
    expect(codeOf(add('node-image', 1, grey('e')))).toBe('index-out-of-range');
    expect(codeOf(add('node-image', 0, grey('node-title')))).toBe('id-in-use');
    expect(codeOf(add('node-image', 0, blur('anim-title-opacity')))).toBe('id-in-use');
    const twice = blur('effect');
    expect(
      codeOf(
        add('node-image', 0, {
          ...twice,
          animations: [
            ...(twice['animations'] as unknown[]),
            { ...(twice['animations'] as Record<string, unknown>[])[0], id: 'effect-again' },
          ],
        }),
      ),
    ).toBe('invalid-result');
    expect(codeOf(add('node-image', 0, { ...grey('e'), amount: 2 }))).toBe('invalid-result');
    expect(codeOf(add('node-image', 0, { ...grey('e'), kind: 'vignette' }))).toBe('invalid-result');
  });
});

describe('RemoveEffect (D71)', () => {
  it('removes an effect with its animations, and is undone to its place exactly', () => {
    const document = withEffects(grey('first'), blur('second'), grey('third'));
    const result = roundTrip({ type: 'RemoveEffect', effectId: 'second' }, document);
    expect(idsOf(result.document, 'node-image')).toEqual(['first', 'third']);
    expect(result.createdIds).toEqual([]);
  });

  it('leaves an empty list, exactly as the node had before its first effect', () => {
    const document = withEffects(grey('only'));
    const removed = apply({ type: 'RemoveEffect', effectId: 'only' }, document);
    expect(json(removed)).toBe(json(reference()));
  });

  it('is refused with unknown-effect for an ID that names no effect', () => {
    expect(codeOf(() => apply({ type: 'RemoveEffect', effectId: 'node-image' }))).toBe(
      'unknown-effect',
    );
    expect(codeOf(() => apply({ type: 'RemoveEffect', effectId: 'anim-title-opacity' }))).toBe(
      'unknown-effect',
    );
  });
});

describe('ReorderEffect (D71)', () => {
  const three = (): ValidatedComposition => withEffects(grey('a'), grey('b'), grey('c'));

  it.each([
    ['a', 2, ['b', 'c', 'a']],
    ['c', 0, ['c', 'a', 'b']],
    ['b', 0, ['b', 'a', 'c']],
  ] as const)('moves %s to %i, and is undone exactly', (effectId, index, order) => {
    const result = roundTrip({ type: 'ReorderEffect', effectId, index }, three());
    expect(idsOf(result.document, 'node-image')).toEqual(order);
  });

  it('changes nothing at its own index, and is refused past the last', () => {
    const result = applyCommand(three(), { type: 'ReorderEffect', effectId: 'b', index: 1 });
    expect(result.inverse).toBeNull();
    expect(codeOf(() => apply({ type: 'ReorderEffect', effectId: 'b', index: 3 }, three()))).toBe(
      'index-out-of-range',
    );
    expect(codeOf(() => apply({ type: 'ReorderEffect', effectId: 'x', index: 0 }, three()))).toBe(
      'unknown-effect',
    );
  });
});

describe('SetEffect (D71)', () => {
  it('replaces the whole effect, its kind too, and names the animations it adds', () => {
    const document = withEffects(blur('effect'));
    const shadow = {
      id: 'effect',
      kind: 'drop-shadow',
      color: '#000000',
      opacity: 0.5,
      offset: { x: 0, y: 8 },
      blur: 16,
      animations: [
        {
          id: 'effect-a-offset',
          property: 'offset',
          keyframes: [
            { timeUs: 0, value: { x: 0, y: 0 }, easing: LINEAR },
            { timeUs: 500_000, value: { x: 0, y: 8 }, easing: LINEAR },
          ],
        },
      ],
    };
    const result = roundTrip({ type: 'SetEffect', effect: shadow }, document);
    expect(effectsOf(result.document, 'node-image')).toEqual([shadow]);
    expect(result.createdIds).toEqual(['effect-a-offset']);
  });

  it('changes nothing for the effect it already is', () => {
    const document = withEffects(blur('effect'));
    expect(
      applyCommand(document, { type: 'SetEffect', effect: blur('effect') }).inverse,
    ).toBeNull();
  });

  it('is refused for an unknown effect, a taken ID, and an effect the document cannot hold', () => {
    const document = withEffects(blur('effect'));
    expect(codeOf(() => apply({ type: 'SetEffect', effect: blur('other') }, document))).toBe(
      'unknown-effect',
    );
    const taken = blur('effect');
    const animations = taken['animations'] as Record<string, unknown>[];
    expect(
      codeOf(() =>
        apply(
          {
            type: 'SetEffect',
            effect: { ...taken, animations: [{ ...animations[0], id: 'node-title' }] },
          },
          document,
        ),
      ),
    ).toBe('id-in-use');
    expect(
      codeOf(() => apply({ type: 'SetEffect', effect: { ...taken, radius: 1001 } }, document)),
    ).toBe('invalid-result');
  });
});

describe('the commands that copy, split, and move what holds effects (D71)', () => {
  it('renames the effects of a copied node and of its children after their new IDs', () => {
    const document = apply(
      { type: 'AddEffect', ownerId: 'node-group', index: 0, effect: blur('group-blur') },
      apply({ type: 'AddEffect', ownerId: 'node-image', index: 0, effect: grey('image-grey') }),
    );
    const result = applyCommand(document, {
      type: 'DuplicateNode',
      nodeId: 'node-group',
      newNodeId: 'copy',
    });
    expect(idsOf(result.document, 'copy')).toEqual(['copy-e0']);
    expect(effectsOf(result.document, 'copy')[0]?.['animations']).toEqual([
      { ...(blur('x')['animations'] as Record<string, unknown>[])[0], id: 'copy-e0-a-radius' },
    ]);
    expect(idsOf(result.document, 'copy-c0')).toEqual(['copy-c0-e0']);
    expect(result.createdIds).toEqual(
      expect.arrayContaining(['copy-e0', 'copy-e0-a-radius', 'copy-c0-e0']),
    );
  });

  it('renames the effects of a copied scene and of its nodes after their new IDs', () => {
    const document = apply(
      { type: 'AddEffect', ownerId: 'scene-main', index: 0, effect: blur('scene-blur') },
      apply({ type: 'AddEffect', ownerId: 'node-title', index: 0, effect: grey('title-grey') }),
    );
    const result = applyCommand(document, {
      type: 'DuplicateScene',
      sceneId: 'scene-main',
      newSceneId: 'again',
    });
    expect(idsOf(result.document, 'again')).toEqual(['again-e0']);
    expect(idsOf(result.document, 'again-n2')).toEqual(['again-n2-e0']);
    expect(result.createdIds).toEqual(
      expect.arrayContaining(['again-e0', 'again-e0-a-radius', 'again-n2-e0']),
    );
  });

  it('hands the second half of a split its own copy of every effect, sampled at the same scene times', () => {
    const document = apply({
      type: 'AddEffect',
      ownerId: 'node-title',
      index: 0,
      effect: blur('title-blur'),
    });
    const result = applyCommand(document, {
      type: 'SplitClip',
      clipId: 'node-title',
      atUs: 5_000_000,
      newClipId: 'tail',
    });
    expect(effectsOf(result.document, 'node-title')).toEqual([blur('title-blur')]);
    const tail = effectsOf(result.document, 'tail');
    expect(tail.map(({ id }) => id)).toEqual(['tail-e0']);
    expect((tail[0]?.['animations'] as { id: string; keyframes: unknown }[])[0]).toEqual({
      ...(blur('x')['animations'] as Record<string, unknown>[])[0],
      id: 'tail-e0-a-radius',
    });
  });

  it('moves the keyframes of its effects with a node moved in time', () => {
    const document = apply({
      type: 'AddEffect',
      ownerId: 'node-title',
      index: 0,
      effect: blur('title-blur'),
    });
    const moved = apply({ type: 'MoveClip', clipId: 'node-title', startUs: 500_000 }, document);
    const [effect] = effectsOf(moved, 'node-title');
    const [animation] = effect?.['animations'] as { keyframes: { timeUs: number }[] }[];
    expect(animation?.keyframes.map(({ timeUs }) => timeUs)).toEqual([500_000, 1_500_000]);
  });

  it('holds every kind in the effects fixture, which a bus can start from', () => {
    const document = validated(effectsComposition);
    expect(idsOf(document, 'scene-effects')).toEqual(['scene-effects-e0']);
  });
});

/**
 * The commands of D69 — `SetTextStyle`, `AddTextAnimation`,
 * `RemoveTextAnimation`, and `SetTextAnimation` — through `applyCommand`, each
 * undone by its inverse to the exact text of the document before it; and the
 * commands that move, split, and copy a text, which carry its text animations:
 * a move moves an accent with the node, a split hands the second half an
 * entrance as an accent at the start of the whole, and a copy renames them.
 */
import type { ValidatedComposition } from '@kadrion/schema';
import { describe, expect, it } from 'vitest';

import { applyCommand, type Command } from '../src/index.js';

import { codeOf, json, nodeOf, reference } from './support.js';

const TITLE = 'node-title';
const PLAIN = { stroke: { kind: 'none' }, shadow: { kind: 'none' }, box: { kind: 'none' } };
const STYLE = {
  stroke: { kind: 'outside', color: '#000000', width: 3 },
  shadow: { kind: 'drop', color: '#101828', opacity: 0.5, offset: { x: 2, y: 4 }, blur: 6 },
  box: { kind: 'solid', color: '#344054', opacity: 0.8, padding: 12, cornerRadius: 8 },
};

function fieldOf(document: unknown, nodeId: string, field: string): unknown {
  return (nodeOf(document, nodeId) as unknown as Record<string, unknown>)[field];
}

const idsOf = (document: unknown, nodeId: string): string[] =>
  (fieldOf(document, nodeId, 'textAnimations') as { id: string }[]).map(({ id }) => id);

function apply(command: unknown, document: unknown = reference()): ValidatedComposition {
  return applyCommand(document as ValidatedComposition, command as Command).document;
}

/** Applies a command and its inverse, checks the restored text, and returns the edited document. */
function roundTrip(command: unknown, document: unknown = reference()): ValidatedComposition {
  const result = applyCommand(document as ValidatedComposition, command as Command);
  if (result.inverse === null) throw new Error('The command changed nothing.');
  expect(json(applyCommand(result.document, result.inverse).document)).toBe(json(document));
  return result.document;
}

function animation(id: string, phase: unknown, overrides: Record<string, unknown> = {}): unknown {
  return {
    id,
    unit: 'letter',
    phase,
    staggerUs: 50_000,
    order: { kind: 'forward' },
    tracks: [
      {
        property: 'opacity',
        keyframes: [
          { timeUs: 0, value: 0, easing: { kind: 'ease-out' } },
          { timeUs: 300_000, value: 1, easing: { kind: 'linear' } },
        ],
      },
    ],
    ...overrides,
  };
}

/** The reference with text animations on the title, in this order. */
function animated(...animations: unknown[]): ValidatedComposition {
  return animations.reduce<ValidatedComposition>(
    (document, item, index) =>
      apply({ type: 'AddTextAnimation', nodeId: TITLE, index, animation: item }, document),
    reference(),
  );
}

describe('SetTextStyle (D69)', () => {
  it('replaces the stroke, the shadow, and the box of a text, and is undone exactly', () => {
    for (const nodeId of [TITLE, 'node-caption']) {
      const edited = roundTrip({ type: 'SetTextStyle', nodeId, style: STYLE });
      expect(fieldOf(edited, nodeId, 'style')).toEqual(STYLE);
      const keys = Object.keys(nodeOf(edited, nodeId));
      expect(keys.slice(keys.indexOf('color'))).toEqual([
        'color',
        'style',
        'textAnimations',
        'effects',
        'mask',
        'matte',
        'blendMode',
      ]);
    }
  });

  it('is no edit when the style is the same', () => {
    const result = applyCommand(reference(), { type: 'SetTextStyle', nodeId: TITLE, style: PLAIN });
    expect(result.inverse).toBeNull();
    expect(json(result.document)).toBe(json(reference()));
  });

  it('refuses a node that is no text, an unknown node, and a style the document cannot hold', () => {
    expect(codeOf(() => apply({ type: 'SetTextStyle', nodeId: 'node-image', style: PLAIN }))).toBe(
      'unsupported-node',
    );
    expect(codeOf(() => apply({ type: 'SetTextStyle', nodeId: 'node-none', style: PLAIN }))).toBe(
      'unknown-node',
    );
    for (const style of [
      { ...STYLE, stroke: { kind: 'outside', color: '#000000', width: 0 } },
      { ...STYLE, shadow: { ...STYLE.shadow, opacity: 1.5 } },
      { ...STYLE, box: { kind: 'gradient' } },
      { stroke: PLAIN.stroke, shadow: PLAIN.shadow },
    ]) {
      expect(codeOf(() => apply({ type: 'SetTextStyle', nodeId: TITLE, style }))).toBe(
        'invalid-result',
      );
    }
  });
});

describe('AddTextAnimation (D69)', () => {
  it('inserts a text animation at an index, names its ID created, and is undone exactly', () => {
    const first = animation('text-a', { kind: 'in' });
    const from = animated(first);
    const result = applyCommand(from, {
      type: 'AddTextAnimation',
      nodeId: TITLE,
      index: 0,
      animation: animation('text-b', { kind: 'out' }) as Record<string, unknown>,
    });
    expect(result.createdIds).toEqual(['text-b']);
    expect(idsOf(result.document, TITLE)).toEqual(['text-b', 'text-a']);
    roundTrip(
      {
        type: 'AddTextAnimation',
        nodeId: TITLE,
        index: 1,
        animation: animation('text-b', { kind: 'in' }),
      },
      from,
    );
  });

  it('refuses a taken ID, an index past the end, a node that is no text, and an animation the document cannot hold', () => {
    const from = animated(animation('text-a', { kind: 'in' }));
    const add = (fields: Record<string, unknown>): string =>
      codeOf(() =>
        apply(
          {
            type: 'AddTextAnimation',
            nodeId: TITLE,
            index: 0,
            animation: animation('text-b', { kind: 'in' }),
            ...fields,
          },
          from,
        ),
      );
    expect(add({ animation: animation('anim-title-opacity', { kind: 'in' }) })).toBe('id-in-use');
    expect(add({ animation: animation('text-a', { kind: 'in' }) })).toBe('id-in-use');
    expect(add({ index: 2 })).toBe('index-out-of-range');
    expect(add({ nodeId: 'node-image' })).toBe('unsupported-node');
    expect(add({ nodeId: 'node-none' })).toBe('unknown-node');
    expect(add({ animation: animation('text-b', { kind: 'in' }, { unit: 'sentence' }) })).toBe(
      'invalid-result',
    );
    expect(add({ animation: animation('text-b', { kind: 'in' }, { tracks: [] }) })).toBe(
      'invalid-result',
    );
    const twice = {
      property: 'rotation',
      keyframes: [
        { timeUs: 0, value: 0, easing: { kind: 'linear' } },
        { timeUs: 1, value: 1, easing: { kind: 'linear' } },
      ],
    };
    expect(
      add({ animation: animation('text-b', { kind: 'in' }, { tracks: [twice, twice] }) }),
    ).toBe('invalid-result');
  });
});

describe('RemoveTextAnimation (D69)', () => {
  it('removes one text animation, and is undone to the same index', () => {
    const from = animated(
      animation('text-a', { kind: 'in' }),
      animation('text-b', { kind: 'out' }),
    );
    const result = applyCommand(from, { type: 'RemoveTextAnimation', textAnimationId: 'text-a' });
    expect(idsOf(result.document, TITLE)).toEqual(['text-b']);
    roundTrip({ type: 'RemoveTextAnimation', textAnimationId: 'text-a' }, from);
  });

  it('refuses an ID no text animation has, the ID of an animation included', () => {
    for (const textAnimationId of ['text-none', 'anim-title-opacity']) {
      expect(codeOf(() => apply({ type: 'RemoveTextAnimation', textAnimationId }))).toBe(
        'unknown-animation',
      );
    }
  });
});

describe('SetTextAnimation (D69)', () => {
  it('replaces the text animation of the same ID in place, and is undone exactly', () => {
    const from = animated(
      animation('text-a', { kind: 'in' }),
      animation('text-b', { kind: 'out' }),
    );
    const next = animation(
      'text-a',
      { kind: 'accent', startUs: 2_000_000 },
      { unit: 'word', order: { kind: 'random', seed: 42 } },
    );
    const edited = roundTrip({ type: 'SetTextAnimation', animation: next }, from);
    expect(fieldOf(edited, TITLE, 'textAnimations')).toEqual([
      next,
      animation('text-b', { kind: 'out' }),
    ]);
  });

  it('is no edit when the animation is the same', () => {
    const from = animated(animation('text-a', { kind: 'in' }));
    const result = applyCommand(from, {
      type: 'SetTextAnimation',
      animation: animation('text-a', { kind: 'in' }) as Record<string, unknown>,
    });
    expect(result.inverse).toBeNull();
  });

  it('refuses an animation without the ID of a text animation, and one the document cannot hold', () => {
    const from = animated(animation('text-a', { kind: 'in' }));
    const set = (item: unknown): string =>
      codeOf(() => apply({ type: 'SetTextAnimation', animation: item }, from));
    expect(set(animation('text-none', { kind: 'in' }))).toBe('unknown-animation');
    expect(set({ ...(animation('text-a', { kind: 'in' }) as object), id: 7 })).toBe(
      'unknown-animation',
    );
    expect(set(animation('text-a', { kind: 'in' }, { staggerUs: -1 }))).toBe('invalid-result');
    expect(set(animation('text-a', { kind: 'random' }))).toBe('invalid-result');
  });
});

describe('the timeline commands on a text with text animations (D55, D69)', () => {
  const ACCENT = animation('text-accent', { kind: 'accent', startUs: 1_000_000 });
  const ENTRANCE = animation('text-in', { kind: 'in' });

  /** The title shortened to 4 s, so that a move has room, with an entrance and an accent. */
  function shortened(): ValidatedComposition {
    return apply(
      { type: 'TrimClipEnd', clipId: TITLE, endUs: 4_000_000 },
      animated(ENTRANCE, ACCENT),
    );
  }

  const phases = (document: unknown, nodeId: string): unknown[] =>
    (fieldOf(document, nodeId, 'textAnimations') as { phase: unknown }[]).map(({ phase }) => phase);

  it('moves an accent with the node, as a keyframe, and leaves an entrance relative to its start', () => {
    const edited = roundTrip({ type: 'MoveClip', clipId: TITLE, startUs: 500_000 }, shortened());
    expect(phases(edited, TITLE)).toEqual([{ kind: 'in' }, { kind: 'accent', startUs: 1_500_000 }]);
  });

  it('moves no accent when the start is trimmed', () => {
    const edited = roundTrip(
      { type: 'TrimClipStart', clipId: TITLE, startUs: 200_000 },
      shortened(),
    );
    expect(phases(edited, TITLE)).toEqual([{ kind: 'in' }, { kind: 'accent', startUs: 1_000_000 }]);
  });

  it('gives the second half of a split its text animations renamed, its entrance as an accent at the start of the whole, and a join takes it back', () => {
    const from = shortened();
    const split = roundTrip(
      { type: 'SplitClip', clipId: TITLE, atUs: 2_000_000, newClipId: 'node-title-tail' },
      from,
    );
    expect(phases(split, TITLE)).toEqual(phases(from, TITLE));
    expect(idsOf(split, 'node-title-tail')).toEqual(['node-title-tail-t0', 'node-title-tail-t1']);
    expect(phases(split, 'node-title-tail')).toEqual([
      { kind: 'accent', startUs: 0 },
      { kind: 'accent', startUs: 1_000_000 },
    ]);
    const joined = apply(
      { type: 'JoinClips', clipId: TITLE, nextClipId: 'node-title-tail' },
      split,
    );
    expect(json(joined)).toBe(json(from));
  });

  it('refuses to split a text whose exit would end at the cut', () => {
    const from = animated(animation('text-out', { kind: 'out' }));
    expect(
      codeOf(() =>
        apply(
          { type: 'SplitClip', clipId: TITLE, atUs: 2_000_000, newClipId: 'node-title-tail' },
          from,
        ),
      ),
    ).toBe('split-not-exact');
  });

  it('renames the text animations of a copied node and of a copied scene', () => {
    const from = animated(ENTRANCE, ACCENT);
    const copy = apply({ type: 'DuplicateNode', nodeId: TITLE, newNodeId: 'node-copy' }, from);
    expect(idsOf(copy, 'node-copy')).toEqual(['node-copy-t0', 'node-copy-t1']);
    const scene = apply(
      { type: 'DuplicateScene', sceneId: 'scene-main', newSceneId: 'scene-again' },
      from,
    );
    const scenes = (
      scene as unknown as {
        scenes: { id: string; nodes: { id: string; textAnimations?: { id: string }[] }[] }[];
      }
    ).scenes;
    const again = scenes.find(({ id }) => id === 'scene-again');
    const titles =
      again?.nodes.filter(({ textAnimations }) => (textAnimations ?? []).length > 0) ?? [];
    expect(
      titles.map(({ id, textAnimations }) => [id, textAnimations?.map((item) => item.id)]),
    ).toEqual([[titles[0]?.id, [`${titles[0]?.id ?? ''}-t0`, `${titles[0]?.id ?? ''}-t1`]]]);
  });

  it('takes the text animations with a removed node, so that their IDs are free again', () => {
    const removed = apply({ type: 'RemoveNode', nodeId: TITLE }, animated(ENTRANCE));
    const caption = apply(
      { type: 'AddTextAnimation', nodeId: 'node-caption', index: 0, animation: ENTRANCE },
      removed,
    );
    expect(idsOf(caption, 'node-caption')).toEqual(['text-in']);
  });

  it('counts the text animations among the IDs of a node, so a copy cannot take one', () => {
    const from = animated(ENTRANCE);
    expect(
      codeOf(() =>
        apply({ type: 'DuplicateNode', nodeId: 'node-caption', newNodeId: 'text-in' }, from),
      ),
    ).toBe('id-in-use');
  });
});

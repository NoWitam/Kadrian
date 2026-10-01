/**
 * The animation commands of D41.1: `AddAnimation` and `RemoveAnimation`. An
 * animation belongs to the node whose `animations` hold it (D16.4); adding one
 * keeps the host's data as it is until the validation, and removing one returns
 * an `AddAnimation` that restores it byte for byte. The expected values are
 * written out by hand from the reference composition.
 */
import { referenceComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  createCommandBus,
  parseCommand,
  type Command,
  type CommandBus,
} from '../src/index.js';

import { codeOf, errorOf, json, nodeOf, reference, validated } from './support.js';

const GROUP = 'node-group';
const IMAGE = 'node-image';
const CAPTION = 'node-caption';
const TITLE = 'node-title';
const HTML = 'node-custom-html';
const BACKGROUND = 'node-background';

function addAnimation(nodeId: string, index: number, animation: unknown): Command {
  return { type: 'AddAnimation', nodeId, index, animation } as Command;
}

function removeAnimation(animationId: string): Command {
  return { type: 'RemoveAnimation', animationId };
}

/** A command with a field its type does not have: refused by the parser, whatever else holds. */
function extra(command: Command): Command {
  return { ...command, extra: 1 } as unknown as Command;
}

/** Two keyframes of a property, in the canonical order of the schema. */
function keyframesFor(property: string): unknown[] {
  if (property === 'opacity') {
    return [
      { timeUs: 0, value: 0 },
      { timeUs: 1_000_000, value: 1 },
    ];
  }
  const [from, to] = property === 'position' ? [0, 10] : [1, 2];
  return [
    { timeUs: 0, value: { x: from, y: from } },
    { timeUs: 1_000_000, value: { x: to, y: to } },
  ];
}

function animation(id: string, property: string): Record<string, unknown> {
  return { id, property, interpolation: 'linear', keyframes: keyframesFor(property) };
}

/** The IDs of a node's animations, in their order. */
function animationIds(document: unknown, nodeId: string): string[] {
  return (nodeOf(document, nodeId).animations as { id: string }[]).map(({ id }) => id);
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

function bus(): CommandBus {
  return createCommandBus(referenceComposition, { historyLimit: 1000 });
}

/**
 * The reference composition with the keys of every animation written in reverse
 * (`keyframes` first) and every keyframe as `{ value, timeUs }` with `{ y, x }`
 * values: the schema accepts any key order, and the exact commands keep it.
 */
function reordered(): ReturnType<typeof validated> {
  const copy = structuredClone(referenceComposition) as {
    scenes: { nodes: Record<string, unknown>[] }[];
  };
  const visit = (node: Record<string, unknown>): void => {
    const animations = node['animations'] as Record<string, unknown>[] | undefined;
    if (animations !== undefined) {
      node['animations'] = animations.map((item) => ({
        keyframes: (item['keyframes'] as { timeUs: number; value: unknown }[]).map(
          ({ timeUs, value }) => ({
            value:
              typeof value === 'object' && value !== null
                ? { y: (value as { y: number }).y, x: (value as { x: number }).x }
                : value,
            timeUs,
          }),
        ),
        interpolation: item['interpolation'],
        property: item['property'],
        id: item['id'],
      }));
    }
    for (const child of (node['children'] as Record<string, unknown>[] | undefined) ?? []) {
      visit(child);
    }
  };
  for (const scene of copy.scenes) for (const node of scene.nodes) visit(node);
  return validated(copy);
}

describe('AddAnimation (D41.1)', () => {
  it('inserts an animation at an index of a node and removes it again as its inverse', () => {
    const board = bus();
    const before = json(board.getDocument());
    const result = board.dispatch(addAnimation(TITLE, 0, animation('a', 'position')));
    expect(animationIds(result.document, TITLE)).toEqual(['a', 'anim-title-opacity']);
    expect(result.createdIds).toEqual(['a']);
    expect(result.inverse).toEqual(removeAnimation('a'));
    board.undo();
    expect(json(board.getDocument())).toBe(before);
  });

  it('inserts at the length of the list, after the others', () => {
    const { document } = applyCommand(reference(), addAnimation(TITLE, 1, animation('a', 'scale')));
    expect(animationIds(document, TITLE)).toEqual(['anim-title-opacity', 'a']);
  });

  it.each([
    ['a group', GROUP, 'opacity', ['anim-group-position', 'a']],
    ['a group child with an animation', IMAGE, 'position', ['anim-image-scale', 'a']],
    ['a group child without animations', CAPTION, 'opacity', ['a']],
    ['a Custom HTML node', HTML, 'scale', ['a']],
  ])('adds to %s', (_, nodeId, property, expected) => {
    const board = bus();
    const before = json(board.getDocument());
    const index = animationIds(board.getDocument(), nodeId).length;
    board.dispatch(addAnimation(nodeId, index, animation('a', property)));
    expect(animationIds(board.getDocument(), nodeId)).toEqual(expected);
    board.undo();
    expect(json(board.getDocument())).toBe(before);
  });

  it('refuses an index past the end of the list, and never rounds one', () => {
    expect(
      codeOf(() => applyCommand(reference(), addAnimation(TITLE, 2, animation('a', 'scale')))),
    ).toBe('index-out-of-range');
    expect(
      codeOf(() => applyCommand(reference(), addAnimation(TITLE, 0.5, animation('a', 'scale')))),
    ).toBe('invalid-argument');
  });

  it.each([
    ['a missing node', 'node-missing', 'unknown-node'],
    ['an animation', 'anim-title-opacity', 'unknown-node'],
    ['the clip', 'clip-audio', 'unknown-node'],
    ['an asset', 'asset-image', 'unknown-node'],
    ['the background, which has no animations', BACKGROUND, 'unsupported-node'],
  ])('refuses %s with %s', (_, nodeId, code) => {
    expect(
      codeOf(() => applyCommand(reference(), addAnimation(nodeId, 0, animation('a', 'scale')))),
    ).toBe(code);
  });

  it('refuses the scene, which holds nodes and no animations, with unknown-node, and changes nothing', () => {
    const board = createCommandBus(referenceComposition, { onListenerError: () => undefined });
    const before = board.getDocument();
    const seen: unknown[] = [];
    board.subscribe((change) => seen.push(change));
    // Otherwise valid: the same arguments are accepted for a node, as the next lines show.
    const error = errorOf(() =>
      board.dispatch(addAnimation('scene-main', 0, animation('a', 'scale'))),
    );
    expect(error.code).toBe('unknown-node');
    expect(error.details).toEqual([]);
    expect(board.getDocument()).toBe(before);
    expect(board.canUndo()).toBe(false);
    expect(board.canRedo()).toBe(false);
    expect(seen).toEqual([]);
    expect(board.dispatch(addAnimation(CAPTION, 0, animation('a', 'scale'))).createdIds).toEqual([
      'a',
    ]);
    expect(seen).toHaveLength(1);
  });

  it.each([
    ['a node ID', TITLE],
    ['an animation ID', 'anim-image-scale'],
    ['the scene ID', 'scene-main'],
    ['an asset ID', 'asset-font'],
    ['the clip ID', 'clip-audio'],
  ])('refuses %s as the new ID with id-in-use, naming it once', (_, id) => {
    const error = errorOf(() =>
      applyCommand(reference(), addAnimation(CAPTION, 0, animation(id, 'scale'))),
    );
    expect(error.code).toBe('id-in-use');
    expect(error.details).toEqual([id]);
  });

  it('refuses a property the node animates already, naming the animation that does', () => {
    const error = errorOf(() =>
      applyCommand(reference(), addAnimation(TITLE, 0, animation('a', 'opacity'))),
    );
    expect(error.code).toBe('duplicate-animation-target');
    expect(error.details).toEqual(['anim-title-opacity']);
  });

  it('judges the property per node: another node may animate it', () => {
    const { document } = applyCommand(
      reference(),
      addAnimation(CAPTION, 0, animation('a', 'opacity')),
    );
    expect(animationIds(document, CAPTION)).toEqual(['a']);
  });

  it.each([
    ['an unknown field', { ...animation('a', 'scale'), easing: 'in' }],
    ['a missing field', { id: 'a', property: 'scale', keyframes: keyframesFor('scale') }],
    ['one keyframe', { ...animation('a', 'scale'), keyframes: keyframesFor('scale').slice(0, 1) }],
    [
      'a value of another property',
      { ...animation('a', 'scale'), keyframes: keyframesFor('opacity') },
    ],
    ['an ID of another form', animation('A B', 'scale')],
    ['an ID that is no string', { ...animation('a', 'scale'), id: 7 }],
    ['a property that is no string', { ...animation('a', 'scale'), property: 7 }],
    ['an unknown property', animation('a', 'rotation')],
  ])('leaves %s to the validation, which refuses it as invalid-result', (_, value) => {
    expect(codeOf(() => applyCommand(reference(), addAnimation(CAPTION, 0, value)))).toBe(
      'invalid-result',
    );
  });

  it.each([
    ['null', null],
    ['an array', [animation('a', 'scale')]],
    ['a string', 'a'],
    ['a map', new Map()],
  ])('refuses %s as the animation with invalid-argument', (_, value) => {
    expect(codeOf(() => parseCommand(addAnimation(CAPTION, 0, value)))).toBe('invalid-argument');
  });

  it('keeps the keys of the animation, its keyframes, and its values in the host’s order', () => {
    const value = {
      keyframes: [
        { value: { y: 2, x: 1 }, timeUs: 0 },
        { value: { y: 4, x: 3 }, timeUs: 5 },
      ],
      interpolation: 'linear',
      property: 'scale',
      id: 'a',
    };
    const { document } = applyCommand(reference(), addAnimation(CAPTION, 0, value));
    expect(json(nodeOf(document, CAPTION).animations)).toBe(json([value]));
  });

  it('keeps its own frozen copy: the host’s object stays unfrozen, and later edits reach nothing', () => {
    const value = animation('a', 'scale');
    const command = parseCommand(addAnimation(CAPTION, 0, value));
    expect(isDeepFrozen(command)).toBe(true);
    expect(Object.isFrozen(value)).toBe(false);
    const [first] = value['keyframes'] as { value: unknown }[];
    if (first === undefined) throw new Error('No keyframe.');
    first.value = { x: 9, y: 9 };
    const { document } = applyCommand(reference(), command);
    expect(json(nodeOf(document, CAPTION).animations)).toBe(json([animation('a', 'scale')]));
  });

  it('rebuilds only the path to the node: its other animations and every other node stay', () => {
    const document = reference();
    const { document: edited } = applyCommand(
      document,
      addAnimation(IMAGE, 1, animation('a', 'opacity')),
    );
    const animations = (node: unknown): unknown[] => nodeOf(node, IMAGE).animations as unknown[];
    expect(animations(edited)[0]).toBe(animations(document)[0]);
    expect(nodeOf(edited, CAPTION)).toBe(nodeOf(document, CAPTION));
    expect(nodeOf(edited, TITLE)).toBe(nodeOf(document, TITLE));
    expect(edited.assets).toBe(document.assets);
  });
});

describe('the order of the checks of AddAnimation (D41.6)', () => {
  it.each([
    [
      'the fields before the node',
      addAnimation('node-missing', -1, animation('a', 'scale')),
      'invalid-argument',
    ],
    [
      'the node before the index',
      addAnimation('node-missing', 9, animation('a', 'scale')),
      'unknown-node',
    ],
    [
      'the node before the ID',
      addAnimation('node-missing', 0, animation(TITLE, 'scale')),
      'unknown-node',
    ],
    [
      'a node without animations before the index',
      addAnimation(BACKGROUND, 9, animation('a', 'scale')),
      'unsupported-node',
    ],
    [
      'a node without animations before the ID',
      addAnimation(BACKGROUND, 0, animation(TITLE, 'opacity')),
      'unsupported-node',
    ],
    [
      'the index before the ID',
      addAnimation(TITLE, 9, animation(GROUP, 'scale')),
      'index-out-of-range',
    ],
    [
      'the index before the property',
      addAnimation(TITLE, 9, animation('a', 'opacity')),
      'index-out-of-range',
    ],
    [
      'the ID before the property',
      addAnimation(TITLE, 0, animation(GROUP, 'opacity')),
      'id-in-use',
    ],
    [
      'the ID before the validation',
      addAnimation(TITLE, 0, { ...animation(GROUP, 'scale'), easing: 'in' }),
      'id-in-use',
    ],
    [
      'the property before the validation',
      addAnimation(TITLE, 0, { ...animation('a', 'opacity'), easing: 'in' }),
      'duplicate-animation-target',
    ],
    [
      'the node before the validation',
      addAnimation('node-missing', 0, { ...animation('a', 'scale'), easing: 'in' }),
      'unknown-node',
    ],
    [
      'a node without animations before the validation',
      addAnimation(BACKGROUND, 0, { ...animation('a', 'scale'), easing: 'in' }),
      'unsupported-node',
    ],
    [
      'the index before the validation',
      addAnimation(TITLE, 9, { ...animation('a', 'scale'), easing: 'in' }),
      'index-out-of-range',
    ],
    [
      'the fields before a node without animations',
      extra(addAnimation(BACKGROUND, 0, animation('a', 'scale'))),
      'invalid-argument',
    ],
    [
      'the fields before the index',
      extra(addAnimation(TITLE, 9, animation('a', 'scale'))),
      'invalid-argument',
    ],
    [
      'the fields before the ID',
      extra(addAnimation(TITLE, 0, animation(GROUP, 'scale'))),
      'invalid-argument',
    ],
    [
      'the fields before the property',
      extra(addAnimation(TITLE, 0, animation('a', 'opacity'))),
      'invalid-argument',
    ],
    [
      'the fields before the validation',
      extra(addAnimation(TITLE, 0, { ...animation('a', 'scale'), easing: 'in' })),
      'invalid-argument',
    ],
  ])('checks %s', (_, command, code) => {
    expect(codeOf(() => applyCommand(reference(), command))).toBe(code);
  });
});

describe('RemoveAnimation (D41.1)', () => {
  it.each([
    ['anim-title-opacity', TITLE],
    ['anim-group-position', GROUP],
    ['anim-image-scale', IMAGE],
  ])(
    'removes %s and returns an AddAnimation with its exact data, node, and index',
    (animationId, nodeId) => {
      const board = bus();
      const before = json(board.getDocument());
      const kept = structuredClone(
        (nodeOf(board.getDocument(), nodeId).animations as unknown[])[0],
      );
      const result = board.dispatch(removeAnimation(animationId));
      expect(animationIds(result.document, nodeId)).toEqual([]);
      expect(result.createdIds).toEqual([]);
      expect(result.inverse).toEqual(addAnimation(nodeId, 0, kept));
      expect(isDeepFrozen(result.inverse)).toBe(true);
      expect(parseCommand(result.inverse)).toEqual(result.inverse);
      expect(board.undo().createdIds).toEqual([animationId]);
      expect(json(board.getDocument())).toBe(before);
    },
  );

  it('restores the animation at its index among others', () => {
    const board = bus();
    board.dispatchTransaction([
      addAnimation(TITLE, 0, animation('a', 'position')),
      addAnimation(TITLE, 2, animation('b', 'scale')),
    ]);
    const before = json(board.getDocument());
    const result = board.dispatch(removeAnimation('anim-title-opacity'));
    expect(result.inverse).toMatchObject({ nodeId: TITLE, index: 1 });
    board.undo();
    expect(json(board.getDocument())).toBe(before);
  });

  it('restores an animation byte for byte whatever the order of its keys', () => {
    const board = createCommandBus(reordered());
    const before = json(board.getDocument());
    board.dispatch(removeAnimation('anim-group-position'));
    board.undo();
    expect(json(board.getDocument())).toBe(before);
  });

  it.each([
    ['a missing animation', 'anim-missing'],
    ['a node', TITLE],
    ['the scene', 'scene-main'],
    ['an asset', 'asset-image'],
    ['the clip', 'clip-audio'],
  ])('refuses %s with unknown-animation and no details', (_, animationId) => {
    const error = errorOf(() => applyCommand(reference(), removeAnimation(animationId)));
    expect(error.code).toBe('unknown-animation');
    expect(error.details).toEqual([]);
  });

  it('cannot fail the validation: removing an animation leaves every other entity as it was', () => {
    // Why D41.6 lists no pair of RemoveAnimation with invalid-result: nothing refers to an animation.
    for (const animationId of ['anim-title-opacity', 'anim-group-position', 'anim-image-scale']) {
      expect(codeOf(() => applyCommand(reference(), removeAnimation(animationId)))).toBe(
        'did not throw',
      );
    }
    expect(codeOf(() => applyCommand(reference(), extra(removeAnimation('anim-missing'))))).toBe(
      'invalid-argument',
    );
  });

  it('checks the fields before the animation', () => {
    expect(
      codeOf(() =>
        applyCommand(reference(), {
          type: 'RemoveAnimation',
          animationId: 7,
        } as unknown as Command),
      ),
    ).toBe('invalid-argument');
  });

  it('changes the property of an animation as a removal and an addition in one transaction', () => {
    const board = bus();
    const before = json(board.getDocument());
    board.dispatchTransaction([
      removeAnimation('anim-title-opacity'),
      addAnimation(TITLE, 0, animation('anim-title-opacity', 'scale')),
    ]);
    expect(
      (nodeOf(board.getDocument(), TITLE).animations as { property: string }[])[0]?.property,
    ).toBe('scale');
    board.undo();
    expect(json(board.getDocument())).toBe(before);
  });
});

describe('createdIds of animation commands are net (D39.4, D41.7)', () => {
  it.each([
    ['[Add A]', [addAnimation(CAPTION, 0, animation('a', 'scale'))], ['a']],
    [
      '[Add A, Remove A]',
      [addAnimation(CAPTION, 0, animation('a', 'scale')), removeAnimation('a')],
      [],
    ],
    [
      '[Remove A, Add A]',
      [
        removeAnimation('anim-title-opacity'),
        addAnimation(TITLE, 0, animation('anim-title-opacity', 'opacity')),
      ],
      ['anim-title-opacity'],
    ],
    ['[Remove A]', [removeAnimation('anim-title-opacity')], []],
  ])('%s', (_, commands, expected) => {
    const board = createCommandBus(referenceComposition, { onListenerError: () => undefined });
    const seen: (readonly string[])[] = [];
    board.subscribe((change) => seen.push(change.createdIds));
    const result = board.dispatchTransaction(commands);
    expect(result.createdIds).toEqual(expected);
    expect(seen).toEqual([expected]);
  });
});

describe('an animation inverse applied to a diverged document (D39.6)', () => {
  it.each([
    [
      'a removed animation that is gone already',
      () => {
        const inverse = applyCommand(
          reference(),
          addAnimation(CAPTION, 0, animation('a', 'scale')),
        ).inverse;
        return { document: reference(), inverse, code: 'unknown-animation' };
      },
    ],
    [
      'a restored animation whose ID is back in use',
      () => {
        const inverse = applyCommand(reference(), removeAnimation('anim-title-opacity')).inverse;
        return { document: reference(), inverse, code: 'id-in-use' };
      },
    ],
    [
      'a restored animation whose property another animation took',
      () => {
        const removed = applyCommand(reference(), removeAnimation('anim-title-opacity'));
        const taken = applyCommand(
          removed.document,
          addAnimation(TITLE, 0, animation('b', 'opacity')),
        );
        return {
          document: taken.document,
          inverse: removed.inverse,
          code: 'duplicate-animation-target',
        };
      },
    ],
    [
      'a restored animation whose node is gone',
      () => {
        const removed = applyCommand(reference(), removeAnimation('anim-title-opacity'));
        const gone = applyCommand(removed.document, { type: 'RemoveNode', nodeId: TITLE });
        return { document: gone.document, inverse: removed.inverse, code: 'unknown-node' };
      },
    ],
    [
      'a restored animation whose index the list no longer has',
      () => {
        const board = createCommandBus(referenceComposition);
        board.dispatch(addAnimation(TITLE, 0, animation('a', 'position')));
        const inverse = board.dispatch(removeAnimation('anim-title-opacity')).inverse;
        const shorter = applyCommand(board.getDocument(), removeAnimation('a'));
        return { document: shorter.document, inverse, code: 'index-out-of-range' };
      },
    ],
  ])('fails atomically for %s', (_, setup) => {
    const { document, inverse, code } = setup();
    const before = json(document);
    expect(codeOf(() => applyCommand(document, inverse as Command))).toBe(code);
    expect(json(document)).toBe(before);
  });
});

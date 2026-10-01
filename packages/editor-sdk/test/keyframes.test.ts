/**
 * The keyframe commands of D41.1–D41.6: the typed upserts `SetOpacityKeyframe`,
 * `SetPositionKeyframe`, and `SetScaleKeyframe`, and the exact `AddKeyframe`,
 * `RemoveKeyframe`, and `MoveKeyframe`. A keyframe is addressed by its time,
 * keyframes stay in the order of their times, and every inverse restores the
 * exact bytes, whatever the order of the keys of a keyframe and of its value.
 * The expected values are written out by hand from the reference composition:
 *
 * - `anim-title-opacity` (on `node-title`): 0 → 0.25, 7 500 000 → 1;
 * - `anim-group-position` (on `node-group`): 0 → {16, 8}, 7 500 000 → {76, 308};
 * - `anim-image-scale` (on the group child `node-image`): 2 500 000 → {1, 1},
 *   10 000 000 → {1.75, 1.375}.
 */
import { referenceComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  createCommandBus,
  EditorError,
  parseCommand,
  type Command,
  type CommandBus,
} from '../src/index.js';

import { codeOf, errorOf, json, nodeOf, reference, validated } from './support.js';

const OPACITY = 'anim-title-opacity';
const POSITION = 'anim-group-position';
const SCALE = 'anim-image-scale';
const MAX_TIME = 2 ** 53 - 1;

function setOpacity(animationId: string, timeUs: number, opacity: number): Command {
  return { type: 'SetOpacityKeyframe', animationId, timeUs, opacity };
}

function setPosition(animationId: string, timeUs: number, x: number, y: number): Command {
  return { type: 'SetPositionKeyframe', animationId, timeUs, offset: { x, y } };
}

function setScale(animationId: string, timeUs: number, x: number, y: number): Command {
  return { type: 'SetScaleKeyframe', animationId, timeUs, factor: { x, y } };
}

function addKeyframe(animationId: string, keyframe: unknown): Command {
  return { type: 'AddKeyframe', animationId, keyframe } as Command;
}

function removeKeyframe(animationId: string, timeUs: number): Command {
  return { type: 'RemoveKeyframe', animationId, timeUs };
}

function moveKeyframe(animationId: string, timeUs: number, toTimeUs: number): Command {
  return { type: 'MoveKeyframe', animationId, timeUs, toTimeUs };
}

/** A command with a field its type does not have: refused by the parser, whatever else holds. */
function extra(command: Command): Command {
  return { ...command, extra: 1 } as unknown as Command;
}

const OWNERS: Readonly<Record<string, string>> = {
  [OPACITY]: 'node-title',
  [POSITION]: 'node-group',
  [SCALE]: 'node-image',
};

interface Keyframe {
  readonly timeUs: number;
  readonly value: unknown;
}

/** The keyframes of one of the reference animations. */
function keyframesOf(document: unknown, animationId: string): Keyframe[] {
  const owner = OWNERS[animationId];
  if (owner === undefined) throw new Error(`No owner of ${animationId}.`);
  const animations = nodeOf(document, owner).animations as { id: string; keyframes: Keyframe[] }[];
  const found = animations.find(({ id }) => id === animationId);
  if (found === undefined) throw new Error(`No animation ${animationId}.`);
  return found.keyframes;
}

function timesOf(document: unknown, animationId: string): number[] {
  return keyframesOf(document, animationId).map(({ timeUs }) => timeUs);
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

function bus(document: unknown = referenceComposition): CommandBus {
  return createCommandBus(document, { historyLimit: 1000, onListenerError: () => undefined });
}

/**
 * The reference composition with every keyframe as `{ value, timeUs }` and
 * every object value as `{ y, x }`: the schema accepts any key order, and no
 * command may write the canonical one over it.
 */
function reordered(): ReturnType<typeof validated> {
  const copy = structuredClone(referenceComposition) as {
    scenes: { nodes: Record<string, unknown>[] }[];
  };
  const visit = (node: Record<string, unknown>): void => {
    for (const item of (node['animations'] as Record<string, unknown>[] | undefined) ?? []) {
      item['keyframes'] = (item['keyframes'] as Keyframe[]).map(({ timeUs, value }) => ({
        value:
          typeof value === 'object' && value !== null
            ? { y: (value as { y: number }).y, x: (value as { x: number }).x }
            : value,
        timeUs,
      }));
    }
    for (const child of (node['children'] as Record<string, unknown>[] | undefined) ?? []) {
      visit(child);
    }
  };
  for (const scene of copy.scenes) for (const node of scene.nodes) visit(node);
  return validated(copy);
}

/** Runs a command on a bus, undoes it, and redoes it, checking the bytes at each step. */
function roundTrip(board: CommandBus, command: Command): string {
  const before = json(board.getDocument());
  board.dispatch(command);
  const after = json(board.getDocument());
  board.undo();
  expect(json(board.getDocument())).toBe(before);
  board.redo();
  expect(json(board.getDocument())).toBe(after);
  return after;
}

describe('the typed keyframe commands replace a value (D41.1, D41.3)', () => {
  it.each([
    ['an opacity', setOpacity(OPACITY, 0, 0.5), OPACITY, 0.5, setOpacity(OPACITY, 0, 0.25)],
    [
      'a position',
      setPosition(POSITION, 7_500_000, 1, -2),
      POSITION,
      { x: 1, y: -2 },
      setPosition(POSITION, 7_500_000, 76, 308),
    ],
    [
      'a scale of a group child',
      setScale(SCALE, 10_000_000, 0.5, 2),
      SCALE,
      { x: 0.5, y: 2 },
      setScale(SCALE, 10_000_000, 1.75, 1.375),
    ],
  ])('of %s, with the previous value as the inverse', (_, command, animationId, value, inverse) => {
    const board = bus();
    const before = json(board.getDocument());
    const count = keyframesOf(board.getDocument(), animationId).length;
    const result = board.dispatch(command);
    const keyframes = keyframesOf(result.document, animationId);
    expect(keyframes).toHaveLength(count);
    expect(
      keyframes.find(({ timeUs }) => timeUs === (command as { timeUs: number }).timeUs)?.value,
    ).toEqual(value);
    expect(result.inverse).toEqual(inverse);
    expect(isDeepFrozen(result.inverse)).toBe(true);
    expect(result.createdIds).toEqual([]);
    board.undo();
    expect(json(board.getDocument())).toBe(before);
  });

  it('keeps the other keyframes, animations, and nodes as the same objects', () => {
    const document = reference();
    const { document: edited } = applyCommand(document, setScale(SCALE, 2_500_000, 3, 3));
    expect(keyframesOf(edited, SCALE)[1]).toBe(keyframesOf(document, SCALE)[1]);
    expect(nodeOf(edited, 'node-caption')).toBe(nodeOf(document, 'node-caption'));
    expect(nodeOf(edited, 'node-title')).toBe(nodeOf(document, 'node-title'));
    expect(edited.assets).toBe(document.assets);
  });
});

describe('the typed keyframe commands insert a keyframe (D41.1, D41.2)', () => {
  it.each([
    ['between two', setOpacity(OPACITY, 5_000_000, 0.5), OPACITY, [0, 5_000_000, 7_500_000]],
    ['after the last', setPosition(POSITION, 9_000_000, 1, 2), POSITION, [0, 7_500_000, 9_000_000]],
    ['before the first', setScale(SCALE, 0, 2, 2), SCALE, [0, 2_500_000, 10_000_000]],
    ['one microsecond after one', setOpacity(OPACITY, 1, 0.5), OPACITY, [0, 1, 7_500_000]],
    ['at the duration', setOpacity(OPACITY, 10_000_000, 0.5), OPACITY, [0, 7_500_000, 10_000_000]],
    ['after the duration', setOpacity(OPACITY, MAX_TIME, 0.5), OPACITY, [0, 7_500_000, MAX_TIME]],
  ])(
    '%s, placed by its time, with RemoveKeyframe as the inverse',
    (_, command, animationId, times) => {
      const board = bus();
      const before = json(board.getDocument());
      const result = board.dispatch(command);
      expect(timesOf(result.document, animationId)).toEqual(times);
      const timeUs = (command as { timeUs: number }).timeUs;
      expect(result.inverse).toEqual(removeKeyframe(animationId, timeUs));
      board.undo();
      expect(json(board.getDocument())).toBe(before);
    },
  );

  it('writes a new keyframe as { timeUs, value } with a value { x, y }', () => {
    const { document } = applyCommand(reordered(), setPosition(POSITION, 9_000_000, 1, 2));
    expect(json(keyframesOf(document, POSITION)[2])).toBe(
      '{"timeUs":9000000,"value":{"x":1,"y":2}}',
    );
  });
});

describe('the values of the typed commands are normalised by the parser (D41.3)', () => {
  it('rounds an offset to an integer, halves towards +∞, and writes -0 as 0', () => {
    const command = parseCommand(setPosition(POSITION, 0, 10.5, -10.5));
    expect(command).toEqual(setPosition(POSITION, 0, 11, -10));
    const zero = parseCommand(setPosition(POSITION, 0, -0.4, -0));
    expect(Object.is((zero as { offset: { x: number } }).offset.x, 0)).toBe(true);
    expect(Object.is((zero as { offset: { y: number } }).offset.y, 0)).toBe(true);
  });

  it('never rounds an opacity or a factor, and writes -0 as 0', () => {
    expect(parseCommand(setOpacity(OPACITY, 0, 0.123456789))).toEqual(
      setOpacity(OPACITY, 0, 0.123456789),
    );
    expect(parseCommand(setScale(SCALE, 0, 1.0000001, 999.5))).toEqual(
      setScale(SCALE, 0, 1.0000001, 999.5),
    );
    const zero = parseCommand(setOpacity(OPACITY, 0, -0)) as { opacity: number };
    expect(Object.is(zero.opacity, 0)).toBe(true);
    const { factor } = parseCommand(setScale(SCALE, 0, -0, -0)) as unknown as {
      factor: { x: number; y: number };
    };
    expect(Object.is(factor.x, 0)).toBe(true);
    expect(Object.is(factor.y, 0)).toBe(true);
  });

  it.each([
    ['an opacity above 1', setOpacity(OPACITY, 0, 1.01)],
    ['a negative opacity', setOpacity(OPACITY, 0, -0.1)],
    ['an opacity that is NaN', setOpacity(OPACITY, 0, Number.NaN)],
    ['a factor above 1000', setScale(SCALE, 0, 1001, 1)],
    ['a negative factor', setScale(SCALE, 0, 1, -1)],
    ['an infinite offset', setPosition(POSITION, 0, Number.POSITIVE_INFINITY, 0)],
    [
      'an offset that is no number',
      { type: 'SetPositionKeyframe', animationId: POSITION, timeUs: 0, offset: { x: '1', y: 0 } },
    ],
    [
      'an offset with a third field',
      {
        type: 'SetPositionKeyframe',
        animationId: POSITION,
        timeUs: 0,
        offset: { x: 1, y: 0, z: 0 },
      },
    ],
    ['an unknown field', { ...setOpacity(OPACITY, 0, 0.5), easing: 'in' }],
  ])('refuses %s with invalid-argument', (_, command) => {
    expect(codeOf(() => parseCommand(command))).toBe('invalid-argument');
  });

  it('leaves the range of an offset to the document: outside it is invalid-result', () => {
    expect(codeOf(() => applyCommand(reference(), setPosition(POSITION, 0, 1_000_001, 0)))).toBe(
      'invalid-result',
    );
    expect(
      codeOf(() => applyCommand(reference(), setPosition(POSITION, 0, 1_000_000.4, 0))),
    ).not.toBe('invalid-result');
  });

  it.each([
    ['the same opacity', setOpacity(OPACITY, 0, 0.25)],
    ['the same position after rounding', setPosition(POSITION, 0, 15.5, 7.6)],
    ['the same position', setPosition(POSITION, 0, 16, 8)],
    ['the same scale', setScale(SCALE, 2_500_000, 1, 1)],
  ])('is a no-op for %s: no change, no history, no event (D38.9)', (_, command) => {
    const board = bus();
    const before = board.getDocument();
    const seen: unknown[] = [];
    board.subscribe((change) => seen.push(change));
    const result = board.dispatch(command);
    expect(result.document).toBe(before);
    expect(result.inverse).toBeNull();
    expect(board.canUndo()).toBe(false);
    expect(seen).toEqual([]);
  });

  it.each([
    ['a position whose x alone is the same', setPosition(POSITION, 0, 16, 9), { x: 16, y: 9 }],
    ['a position whose y alone is the same', setPosition(POSITION, 0, 17, 8), { x: 17, y: 8 }],
    ['a scale whose y alone is the same', setScale(SCALE, 2_500_000, 2, 1), { x: 2, y: 1 }],
  ])('changes %s', (_, command, value) => {
    const { document, inverse } = applyCommand(reference(), command);
    const { timeUs } = command as { timeUs: number };
    const animationId = (command as { animationId: string }).animationId;
    expect(
      keyframesOf(document, animationId).find((item) => item.timeUs === timeUs)?.value,
    ).toEqual(value);
    expect(inverse).not.toBeNull();
  });
});

describe('the times of the keyframe commands (D41.2)', () => {
  const makers: [string, (timeUs: number) => Command][] = [
    ['SetOpacityKeyframe', (timeUs) => setOpacity(OPACITY, timeUs, 0.5)],
    ['SetPositionKeyframe', (timeUs) => setPosition(POSITION, timeUs, 1, 1)],
    ['SetScaleKeyframe', (timeUs) => setScale(SCALE, timeUs, 1, 1)],
    ['AddKeyframe', (timeUs) => addKeyframe(OPACITY, { timeUs, value: 0.5 })],
    ['RemoveKeyframe', (timeUs) => removeKeyframe(OPACITY, timeUs)],
    ['MoveKeyframe from', (timeUs) => moveKeyframe(OPACITY, timeUs, 5)],
    ['MoveKeyframe to', (timeUs) => moveKeyframe(OPACITY, 0, timeUs)],
  ];

  it.each(
    makers.flatMap(([name, make]) =>
      (
        [
          ['a fraction', 0.5],
          ['a large fraction', 1_000_000.25],
          ['a negative time', -1],
          ['a time past 2^53 − 1', 2 ** 53],
          ['NaN', Number.NaN],
          ['Infinity', Number.POSITIVE_INFINITY],
          ['a string', '0'],
          ['null', null],
        ] as [string, unknown][]
      ).map(([what, timeUs]) => [name, what, make(timeUs as number)] as const),
    ),
  )('%s refuses %s with invalid-argument, never rounding it', (_, __, command) => {
    expect(codeOf(() => parseCommand(command))).toBe('invalid-argument');
  });

  it.each(makers)('%s reads -0 as 0', (_, make) => {
    const parsed = parseCommand(make(-0)) as unknown as Record<string, unknown>;
    const keyframe = parsed['keyframe'] as Record<string, unknown> | undefined;
    const times = [parsed['timeUs'], parsed['toTimeUs'], keyframe?.['timeUs']].filter(
      (time) => time !== undefined,
    );
    expect(times.some((time) => Object.is(time, -0))).toBe(false);
    expect(times).toContain(0);
  });

  it('accepts 2^53 − 1 and does not snap a time to the frame grid', () => {
    const board = bus();
    board.dispatch(moveKeyframe(OPACITY, 7_500_000, 7_500_001));
    board.dispatch(moveKeyframe(OPACITY, 7_500_001, MAX_TIME));
    expect(timesOf(board.getDocument(), OPACITY)).toEqual([0, MAX_TIME]);
  });
});

describe('AddKeyframe (D41.1, D41.3)', () => {
  it('inserts the keyframe as given, placed by its time, with RemoveKeyframe as the inverse', () => {
    const board = bus();
    const before = json(board.getDocument());
    const result = board.dispatch(addKeyframe(SCALE, { timeUs: 5_000_000, value: { x: 2, y: 3 } }));
    expect(timesOf(result.document, SCALE)).toEqual([2_500_000, 5_000_000, 10_000_000]);
    expect(result.inverse).toEqual(removeKeyframe(SCALE, 5_000_000));
    expect(result.createdIds).toEqual([]);
    board.undo();
    expect(json(board.getDocument())).toBe(before);
  });

  it('keeps the order of the keys of the keyframe and of its value', () => {
    const keyframe = { value: { y: 3, x: 2 }, timeUs: 5_000_000 };
    const { document } = applyCommand(reference(), addKeyframe(SCALE, keyframe));
    expect(json(keyframesOf(document, SCALE)[1])).toBe(json(keyframe));
  });

  it('keeps an unknown field until the validation, which refuses it as invalid-result', () => {
    const command = parseCommand(addKeyframe(OPACITY, { timeUs: 5, value: 0.5, easing: 'in' }));
    expect((command as { keyframe: unknown }).keyframe).toEqual({
      timeUs: 5,
      value: 0.5,
      easing: 'in',
    });
    expect(codeOf(() => applyCommand(reference(), command))).toBe('invalid-result');
  });

  it.each([
    ['a value of another property', { timeUs: 5, value: { x: 1, y: 1 } }],
    ['an opacity above 1', { timeUs: 5, value: 2 }],
    ['a missing value', { timeUs: 5 }],
  ])('leaves %s to the validation', (_, keyframe) => {
    expect(codeOf(() => applyCommand(reference(), addKeyframe(OPACITY, keyframe)))).toBe(
      'invalid-result',
    );
  });

  it.each([
    ['null', null],
    ['an array', [{ timeUs: 5, value: 0.5 }]],
    ['a keyframe without a time', { value: 0.5 }],
    ['a keyframe with a fractional time', { timeUs: 5.5, value: 0.5 }],
  ])('refuses %s with invalid-argument', (_, keyframe) => {
    expect(codeOf(() => parseCommand(addKeyframe(OPACITY, keyframe)))).toBe('invalid-argument');
  });

  it('writes -0 as 0 in place, keeping the order of the keys', () => {
    const command = parseCommand(addKeyframe(OPACITY, { value: 0.5, timeUs: -0 }));
    const { keyframe } = command as unknown as { keyframe: { timeUs: number } };
    expect(json(keyframe)).toBe('{"value":0.5,"timeUs":0}');
    expect(Object.is(keyframe.timeUs, 0)).toBe(true);
  });

  it('keeps its own frozen copy: the host’s object stays unfrozen, and later edits reach nothing', () => {
    const value = { x: 2, y: 3 };
    const keyframe = { timeUs: 5_000_000, value };
    const command = parseCommand(addKeyframe(SCALE, keyframe));
    expect(isDeepFrozen(command)).toBe(true);
    expect(Object.isFrozen(keyframe)).toBe(false);
    value.x = 9;
    const { document } = applyCommand(reference(), command);
    expect(keyframesOf(document, SCALE)[1]?.value).toEqual({ x: 2, y: 3 });
  });

  it('refuses a time the animation has with keyframe-exists and no details', () => {
    const error = errorOf(() =>
      applyCommand(reference(), addKeyframe(OPACITY, { timeUs: 0, value: 0.5 })),
    );
    expect(error.code).toBe('keyframe-exists');
    expect(error.details).toEqual([]);
  });
});

describe('RemoveKeyframe (D41.1, D41.4)', () => {
  it('removes a keyframe and returns an AddKeyframe with its exact data', () => {
    const board = bus();
    board.dispatch(setOpacity(OPACITY, 5_000_000, 0.5));
    const before = json(board.getDocument());
    const result = board.dispatch(removeKeyframe(OPACITY, 0));
    expect(timesOf(result.document, OPACITY)).toEqual([5_000_000, 7_500_000]);
    expect(result.inverse).toEqual(addKeyframe(OPACITY, { timeUs: 0, value: 0.25 }));
    expect(isDeepFrozen(result.inverse)).toBe(true);
    expect(result.createdIds).toEqual([]);
    board.undo();
    expect(json(board.getDocument())).toBe(before);
  });

  it('restores a keyframe { value, timeUs } with a value { y, x } byte for byte', () => {
    const board = bus(reordered());
    board.dispatch(setPosition(POSITION, 9_000_000, 1, 1));
    board.dispatch(setPosition(POSITION, 9_500_000, 2, 2));
    roundTrip(board, removeKeyframe(POSITION, 7_500_000));
    roundTrip(board, removeKeyframe(POSITION, 0));
  });

  it.each([
    [OPACITY, 0],
    [POSITION, 7_500_000],
    [SCALE, 2_500_000],
  ])(
    'refuses to leave %s one keyframe: too-few-keyframes names it, and nothing changes',
    (animationId, timeUs) => {
      const board = bus();
      board.dispatch(setOpacity(OPACITY, 1, 0.5));
      board.undo();
      const before = board.getDocument();
      const seen: unknown[] = [];
      board.subscribe((change) => seen.push(change));
      const error = errorOf(() => board.dispatch(removeKeyframe(animationId, timeUs)));
      expect(error.code).toBe('too-few-keyframes');
      expect(error.details).toEqual([animationId]);
      expect(board.getDocument()).toBe(before);
      expect(board.canUndo()).toBe(false);
      expect(board.canRedo()).toBe(true);
      expect(seen).toEqual([]);
    },
  );

  it('refuses a time without a keyframe with unknown-keyframe and no details', () => {
    const error = errorOf(() => applyCommand(reference(), removeKeyframe(OPACITY, 1)));
    expect(error.code).toBe('unknown-keyframe');
    expect(error.details).toEqual([]);
  });
});

describe('insert before remove (D41.4)', () => {
  const replacements = [
    addKeyframe(OPACITY, { timeUs: 1_000_000, value: 0 }),
    addKeyframe(OPACITY, { timeUs: 2_000_000, value: 1 }),
  ];
  const removals = [removeKeyframe(OPACITY, 0), removeKeyframe(OPACITY, 7_500_000)];

  it('replaces both keyframes of a two-keyframe animation when the insertions come first', () => {
    const board = bus();
    const before = json(board.getDocument());
    board.dispatchTransaction([...replacements, ...removals]);
    expect(keyframesOf(board.getDocument(), OPACITY)).toEqual([
      { timeUs: 1_000_000, value: 0 },
      { timeUs: 2_000_000, value: 1 },
    ]);
    board.undo();
    expect(json(board.getDocument())).toBe(before);
  });

  it('refuses the other order at its first removal, atomically', () => {
    const board = bus();
    const before = board.getDocument();
    const error = errorOf(() => board.dispatchTransaction([...removals, ...replacements]));
    expect(error.code).toBe('too-few-keyframes');
    expect(error.message).toMatch(/^Command 0 of the transaction: /);
    expect(board.getDocument()).toBe(before);
    expect(board.canUndo()).toBe(false);
  });

  it('asks nothing of a same-time replacement or a move', () => {
    const board = bus();
    board.dispatchTransaction([
      setOpacity(OPACITY, 0, 0.5),
      setOpacity(OPACITY, 7_500_000, 0),
      moveKeyframe(OPACITY, 0, 100),
      moveKeyframe(OPACITY, 7_500_000, 200),
    ]);
    expect(keyframesOf(board.getDocument(), OPACITY)).toEqual([
      { timeUs: 100, value: 0.5 },
      { timeUs: 200, value: 0 },
    ]);
  });
});

describe('MoveKeyframe (D41.1, D41.2)', () => {
  it.each([
    ['within its neighbours', OPACITY, 0, 100, [100, 7_500_000]],
    ['past another keyframe', OPACITY, 0, 9_000_000, [7_500_000, 9_000_000]],
    ['before another keyframe', SCALE, 10_000_000, 0, [0, 2_500_000]],
  ])(
    'moves a keyframe %s, placed by its new time, with the move back as the inverse',
    (_, animationId, from, to, times) => {
      const board = bus();
      const before = json(board.getDocument());
      const result = board.dispatch(moveKeyframe(animationId, from, to));
      expect(timesOf(result.document, animationId)).toEqual(times);
      expect(result.inverse).toEqual(moveKeyframe(animationId, to, from));
      expect(result.createdIds).toEqual([]);
      board.undo();
      expect(json(board.getDocument())).toBe(before);
    },
  );

  it('keeps the value itself and the order of the keys of the keyframe', () => {
    const document = reordered();
    const value = keyframesOf(document, POSITION)[0]?.value;
    const { document: edited } = applyCommand(document, moveKeyframe(POSITION, 0, 9_000_000));
    const moved = keyframesOf(edited, POSITION)[1];
    expect(moved?.value).toBe(value);
    expect(json(moved)).toBe('{"value":{"y":8,"x":16},"timeUs":9000000}');
  });

  it('is a no-op for the time the keyframe has (D38.9)', () => {
    const board = bus();
    const before = board.getDocument();
    const result = board.dispatch(moveKeyframe(OPACITY, 0, 0));
    expect(result.document).toBe(before);
    expect(result.inverse).toBeNull();
    expect(board.canUndo()).toBe(false);
  });

  it('refuses a time another keyframe has with keyframe-exists and no details', () => {
    const error = errorOf(() => applyCommand(reference(), moveKeyframe(OPACITY, 0, 7_500_000)));
    expect(error.code).toBe('keyframe-exists');
    expect(error.details).toEqual([]);
  });

  it('refuses a time without a keyframe with unknown-keyframe', () => {
    expect(codeOf(() => applyCommand(reference(), moveKeyframe(OPACITY, 1, 2)))).toBe(
      'unknown-keyframe',
    );
  });
});

describe('byte-for-byte undo whatever the order of the keys (D41.3)', () => {
  it.each([
    ['SetPositionKeyframe', setPosition(POSITION, 0, 1, 2)],
    ['SetScaleKeyframe on a group child', setScale(SCALE, 10_000_000, 3, 4)],
    ['SetOpacityKeyframe', setOpacity(OPACITY, 7_500_000, 0.5)],
    ['SetPositionKeyframe inserting', setPosition(POSITION, 1, 1, 2)],
    ['AddKeyframe', addKeyframe(POSITION, { value: { y: 1, x: 2 }, timeUs: 1 })],
    ['MoveKeyframe', moveKeyframe(POSITION, 7_500_000, 9_000_000)],
  ])('%s', (_, command) => {
    roundTrip(bus(reordered()), command);
  });

  it('keeps a stored { y, x } and { value, timeUs } through a typed replacement', () => {
    const board = bus(reordered());
    const after = roundTrip(board, setPosition(POSITION, 0, 1, 2));
    expect(after).toContain('{"value":{"y":2,"x":1},"timeUs":0}');
    roundTrip(board, setScale(SCALE, 2_500_000, 5, 6));
    expect(json(board.getDocument())).toContain('{"value":{"y":6,"x":5},"timeUs":2500000}');
  });
});

describe('the order of the checks of the keyframe commands (D41.6)', () => {
  it.each([
    [
      'Set: the fields before the animation',
      setOpacity('anim-missing', 0.5, 0.5),
      'invalid-argument',
    ],
    ['Set: the value before the animation', setScale('anim-missing', 0, -1, 1), 'invalid-argument'],
    [
      'Set: the animation before the property',
      setOpacity('node-title', 0, 0.5),
      'unknown-animation',
    ],
    [
      'Set: the property before a no-op',
      setScale(POSITION, 0, 16, 8),
      'animation-property-mismatch',
    ],
    [
      'Set: the property before the validation',
      setPosition(SCALE, 0, 2_000_000, 0),
      'animation-property-mismatch',
    ],
    [
      'Add: the fields before the animation',
      addKeyframe('anim-missing', { timeUs: -1, value: 0 }),
      'invalid-argument',
    ],
    [
      'Add: the animation before the validation',
      addKeyframe('anim-missing', { timeUs: 1, value: 9 }),
      'unknown-animation',
    ],
    [
      'Add: the time before the validation',
      addKeyframe(OPACITY, { timeUs: 0, value: 9 }),
      'keyframe-exists',
    ],
    [
      'Remove: the fields before the animation',
      removeKeyframe('anim-missing', 0.5),
      'invalid-argument',
    ],
    ['Remove: the keyframe before the minimum', removeKeyframe(OPACITY, 1), 'unknown-keyframe'],
    [
      'Move: the fields before the animation',
      moveKeyframe('anim-missing', 0, 0.5),
      'invalid-argument',
    ],
    [
      'Move: the keyframe before the target',
      moveKeyframe(OPACITY, 1, 7_500_000),
      'unknown-keyframe',
    ],
    ['Move: the keyframe before a no-op', moveKeyframe(OPACITY, 1, 1), 'unknown-keyframe'],
    ['Set: the fields before the property', setOpacity(POSITION, 0, 1.5), 'invalid-argument'],
    ['Set: the fields before a no-op', extra(setOpacity(OPACITY, 0, 0.25)), 'invalid-argument'],
    [
      'Set: the fields before the validation',
      setPosition(POSITION, 0.5, 2_000_000, 0),
      'invalid-argument',
    ],
    [
      'Set: the animation before the validation',
      setPosition('anim-missing', 0, 2_000_000, 0),
      'unknown-animation',
    ],
    [
      'Add: the fields before the time',
      extra(addKeyframe(OPACITY, { timeUs: 0, value: 0.5 })),
      'invalid-argument',
    ],
    [
      'Add: the fields before the validation',
      extra(addKeyframe(OPACITY, { timeUs: 5, value: 9 })),
      'invalid-argument',
    ],
    [
      'Remove: the fields before the keyframe',
      extra(removeKeyframe(OPACITY, 1)),
      'invalid-argument',
    ],
    [
      'Remove: the fields before the minimum',
      extra(removeKeyframe(OPACITY, 0)),
      'invalid-argument',
    ],
    [
      'Move: the fields before the keyframe',
      extra(moveKeyframe(OPACITY, 1, 2)),
      'invalid-argument',
    ],
    ['Move: the fields before a no-op', extra(moveKeyframe(OPACITY, 0, 0)), 'invalid-argument'],
    [
      'Move: the fields before the target',
      extra(moveKeyframe(OPACITY, 0, 7_500_000)),
      'invalid-argument',
    ],
  ])('%s', (_, command, code) => {
    expect(codeOf(() => applyCommand(reference(), command))).toBe(code);
  });

  it.each([
    ['SetOpacityKeyframe on a position', setOpacity(POSITION, 0, 0.5)],
    ['SetOpacityKeyframe on a scale', setOpacity(SCALE, 0, 0.5)],
    ['SetPositionKeyframe on an opacity', setPosition(OPACITY, 0, 1, 1)],
    ['SetPositionKeyframe on a scale', setPosition(SCALE, 0, 1, 1)],
    ['SetScaleKeyframe on an opacity', setScale(OPACITY, 0, 1, 1)],
    ['SetScaleKeyframe on a position', setScale(POSITION, 0, 1, 1)],
  ])('refuses %s with animation-property-mismatch and no details', (_, command) => {
    const error = errorOf(() => applyCommand(reference(), command));
    expect(error.code).toBe('animation-property-mismatch');
    expect(error.details).toEqual([]);
  });

  it.each([
    ['SetOpacityKeyframe', setOpacity('anim-missing', 0, 0.5)],
    ['SetPositionKeyframe', setPosition('node-group', 0, 1, 1)],
    ['SetScaleKeyframe', setScale('asset-image', 0, 1, 1)],
    ['AddKeyframe', addKeyframe('scene-main', { timeUs: 1, value: 0 })],
    ['RemoveKeyframe', removeKeyframe('clip-audio', 0)],
    ['MoveKeyframe', moveKeyframe('anim-missing', 0, 1)],
  ])('%s refuses a missing animation with unknown-animation and no details', (_, command) => {
    const error = errorOf(() => applyCommand(reference(), command));
    expect(error.code).toBe('unknown-animation');
    expect(error.details).toEqual([]);
  });
});

describe('a keyframe inverse applied to a diverged document (D39.6)', () => {
  it.each([
    [
      'an inserted keyframe that is gone already',
      () => ({
        document: reference(),
        inverse: applyCommand(reference(), setOpacity(OPACITY, 5, 0.5)).inverse,
        code: 'unknown-keyframe',
      }),
    ],
    [
      'a removed keyframe whose time is taken again',
      () => {
        const added = applyCommand(reference(), setOpacity(OPACITY, 5, 0.5)).document;
        return {
          document: added,
          inverse: applyCommand(added, removeKeyframe(OPACITY, 5)).inverse,
          code: 'keyframe-exists',
        };
      },
    ],
    [
      'a moved keyframe that is no longer at its new time',
      () => ({
        document: reference(),
        inverse: applyCommand(reference(), moveKeyframe(OPACITY, 0, 5)).inverse,
        code: 'unknown-keyframe',
      }),
    ],
    [
      'a replaced value whose animation is gone',
      () => {
        const inverse = applyCommand(reference(), setOpacity(OPACITY, 0, 0.5)).inverse;
        const gone = applyCommand(reference(), {
          type: 'RemoveAnimation',
          animationId: OPACITY,
        }).document;
        return { document: gone, inverse, code: 'unknown-animation' };
      },
    ],
    [
      'an inserted keyframe whose removal would leave too few',
      () => {
        const inverse = applyCommand(reference(), setOpacity(OPACITY, 5, 0.5)).inverse;
        const board = bus();
        board.dispatchTransaction([setOpacity(OPACITY, 5, 0.5), removeKeyframe(OPACITY, 0)]);
        return { document: board.getDocument(), inverse, code: 'too-few-keyframes' };
      },
    ],
  ])('fails atomically for %s', (_, setup) => {
    const { document, inverse, code } = setup();
    const before = json(document);
    expect(codeOf(() => applyCommand(document, inverse as Command))).toBe(code);
    expect(json(document)).toBe(before);
  });
});

describe('the inverse of a replacement is an upsert (D41.1, D41.8, D39.6)', () => {
  it('restores the previous value through the bus, whose history never diverges', () => {
    const board = bus();
    const before = json(board.getDocument());
    const result = board.dispatch(setOpacity(OPACITY, 0, 0.9));
    expect(result.inverse).toEqual(setOpacity(OPACITY, 0, 0.25));
    expect(timesOf(board.undo().document, OPACITY)).toEqual([0, 7_500_000]);
    expect(json(board.getDocument())).toBe(before);
  });

  it('reinserts the keyframe when it is applied directly to a document without it', () => {
    // A stateless host holds an old inverse; the keyframe it would restore the value
    // of was removed since. The inverse does not fail: it is an upsert and inserts.
    const withKeyframe = applyCommand(reference(), setOpacity(OPACITY, 5, 0.5)).document;
    const inverse = applyCommand(withKeyframe, setOpacity(OPACITY, 5, 0.9)).inverse;
    expect(inverse).toEqual(setOpacity(OPACITY, 5, 0.5));
    const diverged = reference();
    const before = json(diverged);
    expect(timesOf(diverged, OPACITY)).toEqual([0, 7_500_000]);
    const applied = applyCommand(diverged, inverse as Command);
    expect(keyframesOf(applied.document, OPACITY)).toEqual([
      { timeUs: 0, value: 0.25 },
      { timeUs: 5, value: 0.5 },
      { timeUs: 7_500_000, value: 1 },
    ]);
    // What it did is an insertion, and its own inverse says so.
    expect(applied.inverse).toEqual(removeKeyframe(OPACITY, 5));
    expect(json(diverged)).toBe(before);
  });

  it('is a no-op on a diverged document that already holds the previous value', () => {
    const inverse = applyCommand(reference(), setOpacity(OPACITY, 0, 0.9)).inverse;
    const diverged = reference();
    expect(applyCommand(diverged, inverse as Command).document).toBe(diverged);
  });
});

describe('the typed keyframe commands on animations of a group child (D41.1)', () => {
  const CAPTION = 'node-caption';
  const IMAGE = 'node-image';

  function animation(id: string, property: string, from: unknown, to: unknown): Command {
    return {
      type: 'AddAnimation',
      nodeId: property === 'opacity' ? CAPTION : IMAGE,
      index: 0,
      animation: {
        id,
        property,
        interpolation: 'linear',
        keyframes: [
          { timeUs: 0, value: from },
          { timeUs: 1_000_000, value: to },
        ],
      },
    };
  }

  /** A bus whose group children hold an opacity and a position animation. */
  function childBus(): CommandBus {
    const board = bus();
    board.dispatchTransaction([
      animation('child-opacity', 'opacity', 0, 1),
      animation('child-position', 'position', { x: 0, y: 0 }, { x: 10, y: 20 }),
    ]);
    return board;
  }

  function childKeyframes(document: unknown, nodeId: string, animationId: string): Keyframe[] {
    const animations = nodeOf(document, nodeId).animations as {
      id: string;
      keyframes: Keyframe[];
    }[];
    return animations.find(({ id }) => id === animationId)?.keyframes ?? [];
  }

  it.each([
    [
      'replaces an opacity',
      CAPTION,
      setOpacity('child-opacity', 0, 0.5),
      [
        { timeUs: 0, value: 0.5 },
        { timeUs: 1_000_000, value: 1 },
      ],
      setOpacity('child-opacity', 0, 0),
    ],
    [
      'inserts an opacity',
      CAPTION,
      setOpacity('child-opacity', 500_000, 0.5),
      [
        { timeUs: 0, value: 0 },
        { timeUs: 500_000, value: 0.5 },
        { timeUs: 1_000_000, value: 1 },
      ],
      removeKeyframe('child-opacity', 500_000),
    ],
    [
      'replaces a position',
      IMAGE,
      setPosition('child-position', 1_000_000, -3, 4.5),
      [
        { timeUs: 0, value: { x: 0, y: 0 } },
        { timeUs: 1_000_000, value: { x: -3, y: 5 } },
      ],
      setPosition('child-position', 1_000_000, 10, 20),
    ],
    [
      'inserts a position',
      IMAGE,
      setPosition('child-position', 2_000_000, 7, 8),
      [
        { timeUs: 0, value: { x: 0, y: 0 } },
        { timeUs: 1_000_000, value: { x: 10, y: 20 } },
        { timeUs: 2_000_000, value: { x: 7, y: 8 } },
      ],
      removeKeyframe('child-position', 2_000_000),
    ],
  ])('%s, and its inverse restores the document', (_, nodeId, command, keyframes, inverse) => {
    const board = childBus();
    const before = board.getDocument();
    const text = json(before);
    const { animationId } = command as { animationId: string };
    const result = board.dispatch(command);
    // A real change of the child's animation, and of nothing beside its path.
    expect(result.document).not.toBe(before);
    expect(childKeyframes(result.document, nodeId, animationId)).toEqual(keyframes);
    expect(childKeyframes(result.document, nodeId, animationId)).not.toEqual(
      childKeyframes(before, nodeId, animationId),
    );
    expect(nodeOf(result.document, 'node-title')).toBe(nodeOf(before, 'node-title'));
    expect(result.inverse).toEqual(inverse);
    // The inverse, applied as a command of its own, gives the bytes back; so does undo.
    expect(json(applyCommand(result.document, result.inverse as Command).document)).toBe(text);
    board.undo();
    expect(json(board.getDocument())).toBe(text);
    board.redo();
    expect(childKeyframes(board.getDocument(), nodeId, animationId)).toEqual(keyframes);
  });

  it('removes and moves a keyframe of a child animation, with exact inverses', () => {
    const board = childBus();
    board.dispatch(setOpacity('child-opacity', 500_000, 0.5));
    roundTrip(board, moveKeyframe('child-opacity', 500_000, 2_000_000));
    roundTrip(board, removeKeyframe('child-opacity', 0));
    expect(childKeyframes(board.getDocument(), CAPTION, 'child-opacity')).toEqual([
      { timeUs: 1_000_000, value: 1 },
      { timeUs: 2_000_000, value: 0.5 },
    ]);
  });
});

describe('the error contract of the new codes (D41.5)', () => {
  it('keeps the shape of EditorError: the same own properties as an existing code', () => {
    const existing = errorOf(() =>
      applyCommand(reference(), { type: 'RemoveNode', nodeId: 'node-missing' }),
    );
    const names = (error: EditorError): string[] => Object.getOwnPropertyNames(error).sort();
    const cases: [Command, string, string[]][] = [
      [removeKeyframe('anim-missing', 0), 'unknown-animation', []],
      [removeKeyframe(OPACITY, 1), 'unknown-keyframe', []],
      [moveKeyframe(OPACITY, 0, 7_500_000), 'keyframe-exists', []],
      [removeKeyframe(OPACITY, 0), 'too-few-keyframes', [OPACITY]],
      [setScale(OPACITY, 0, 1, 1), 'animation-property-mismatch', []],
      [
        {
          type: 'AddAnimation',
          nodeId: 'node-image',
          index: 0,
          animation: { id: 'a', property: 'scale', interpolation: 'linear', keyframes: [] },
        },
        'duplicate-animation-target',
        [SCALE],
      ],
    ];
    for (const [command, code, details] of cases) {
      const error = errorOf(() => applyCommand(reference(), command));
      expect(error).toBeInstanceOf(EditorError);
      expect(error.name).toBe('EditorError');
      expect(error.code).toBe(code);
      expect(error.details).toEqual(details);
      expect(typeof error.message).toBe('string');
      expect(error.message.length).toBeGreaterThan(0);
      expect(names(error)).toEqual(names(existing));
    }
  });
});

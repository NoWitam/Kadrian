/**
 * `SetNodeLifetime` (D42.10): the two fields of one node's lifetime, set
 * together. It applies to every node — the background and a child of a group
 * like any other — keeps every other key and value of the node where it is, and
 * moves no keyframe. The expected values are written out by hand from the
 * reference composition, whose nodes all live from 0 for 10 000 000.
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

import { codeOf, errorOf, json, nodeOf, reference } from './support.js';

const MAX = Number.MAX_SAFE_INTEGER;
const BACKGROUND = 'node-background';
const GROUP = 'node-group';
const IMAGE = 'node-image';
const CAPTION = 'node-caption';
const TITLE = 'node-title';
const HTML = 'node-custom-html';
const EVERY_NODE = [BACKGROUND, GROUP, IMAGE, CAPTION, TITLE, HTML];

function setLifetime(nodeId: string, startUs: number, durationUs: number): Command {
  return { type: 'SetNodeLifetime', nodeId, startUs, durationUs };
}

/** A command with a field its type does not have: refused by the parser, whatever else holds. */
function extra(command: Command): Command {
  return { ...command, extra: 1 } as unknown as Command;
}

function lifetimeOf(document: unknown, nodeId: string): { startUs: unknown; durationUs: unknown } {
  const node = nodeOf(document, nodeId) as unknown as Record<string, unknown>;
  return { startUs: node['startUs'], durationUs: node['durationUs'] };
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

function bus(): CommandBus {
  return createCommandBus(referenceComposition, {
    historyLimit: 100,
    onListenerError: () => undefined,
  });
}

describe('SetNodeLifetime (D42.10)', () => {
  it.each(EVERY_NODE)('sets both fields of %s, with the previous two as its inverse', (nodeId) => {
    const board = bus();
    const before = json(board.getDocument());
    const result = board.dispatch(setLifetime(nodeId, 2_000_000, 3_000_000));
    expect(lifetimeOf(result.document, nodeId)).toEqual({
      startUs: 2_000_000,
      durationUs: 3_000_000,
    });
    expect(result.inverse).toEqual(setLifetime(nodeId, 0, 10_000_000));
    expect(isDeepFrozen(result.inverse)).toBe(true);
    expect(result.createdIds).toEqual([]);
    board.undo();
    expect(json(board.getDocument())).toBe(before);
    board.redo();
    expect(lifetimeOf(board.getDocument(), nodeId)).toEqual({
      startUs: 2_000_000,
      durationUs: 3_000_000,
    });
  });

  it.each([
    ['only the start', setLifetime(TITLE, 5, 10_000_000), { startUs: 5, durationUs: 10_000_000 }],
    ['only the duration', setLifetime(TITLE, 0, 5), { startUs: 0, durationUs: 5 }],
  ])('changes %s when the other value stays', (_, command, expected) => {
    const { document, inverse } = applyCommand(reference(), command);
    expect(lifetimeOf(document, TITLE)).toEqual(expected);
    expect(inverse).toEqual(setLifetime(TITLE, 0, 10_000_000));
  });

  it('changes nothing but the two fields: every key keeps its place and every other node its bytes', () => {
    const document = reference();
    const { document: edited } = applyCommand(document, setLifetime(GROUP, 1, 2));
    expect(Object.keys(nodeOf(edited, GROUP))).toEqual(Object.keys(nodeOf(document, GROUP)));
    expect(Object.keys(nodeOf(edited, GROUP)).slice(0, 4)).toEqual([
      'id',
      'type',
      'startUs',
      'durationUs',
    ]);
    const without = (value: unknown): string =>
      JSON.stringify(value, (key, child: unknown) =>
        key === 'startUs' || key === 'durationUs' ? undefined : child,
      );
    expect(without(edited)).toBe(without(document));
    expect(JSON.stringify(edited)).not.toBe(JSON.stringify(document));
  });

  it('keeps the values of the node and every other node as the same objects (D30.7)', () => {
    const document = reference();
    const { document: edited } = applyCommand(document, setLifetime(GROUP, 1, 2));
    const [was, is] = [nodeOf(document, GROUP), nodeOf(edited, GROUP)];
    expect(is).not.toBe(was);
    expect(is.children).toBe(was.children);
    expect(is.animations).toBe(was.animations);
    expect(is.position).toBe(was.position);
    expect(nodeOf(edited, TITLE)).toBe(nodeOf(document, TITLE));
    expect(nodeOf(edited, BACKGROUND)).toBe(nodeOf(document, BACKGROUND));
    expect(edited.assets).toBe(document.assets);
  });

  it('moves no keyframe: an animation keeps its composition times (D42.2)', () => {
    const document = reference();
    const { document: edited } = applyCommand(document, setLifetime(TITLE, 5_000_000, 1_000_000));
    expect(nodeOf(edited, TITLE).animations).toBe(nodeOf(document, TITLE).animations);
    expect(json(nodeOf(edited, TITLE).animations)).toContain('"timeUs":7500000');
  });

  it('sets the lifetime of a child alone: its group keeps its own', () => {
    const { document } = applyCommand(reference(), setLifetime(IMAGE, 4_000_000, 2_000_000));
    expect(lifetimeOf(document, IMAGE)).toEqual({ startUs: 4_000_000, durationUs: 2_000_000 });
    expect(lifetimeOf(document, GROUP)).toEqual({ startUs: 0, durationUs: 10_000_000 });
    expect(lifetimeOf(document, CAPTION)).toEqual({ startUs: 0, durationUs: 10_000_000 });
  });

  it.each([
    ['a start at the end of the composition', 10_000_000, 1],
    ['a start after it', 20_000_000, 5],
    ['a lifetime that reaches past the end', 9_000_000, 50_000_000],
    ['a lifetime off the frame grid', 1, 1],
    ['the largest start and duration, whose sum is not a safe integer', MAX, MAX],
    ['the largest duration from 0', 0, MAX],
  ])('accepts %s (D42.1, D42.2)', (_, startUs, durationUs) => {
    const board = bus();
    const before = json(board.getDocument());
    board.dispatch(setLifetime(TITLE, startUs, durationUs));
    expect(lifetimeOf(board.getDocument(), TITLE)).toEqual({ startUs, durationUs });
    board.undo();
    expect(json(board.getDocument())).toBe(before);
  });
});

describe('the arguments of SetNodeLifetime (D42.10)', () => {
  it.each([
    ['a fractional start', setLifetime(TITLE, 0.5, 1)],
    ['a fractional duration', setLifetime(TITLE, 0, 1.5)],
    ['a negative start', setLifetime(TITLE, -1, 1)],
    ['a duration of zero', setLifetime(TITLE, 0, 0)],
    ['a negative duration', setLifetime(TITLE, 0, -1)],
    ['a start past 2^53 − 1', setLifetime(TITLE, MAX + 1, 1)],
    ['a duration past 2^53 − 1', setLifetime(TITLE, 0, MAX + 1)],
    ['a start that is NaN', setLifetime(TITLE, Number.NaN, 1)],
    ['an infinite duration', setLifetime(TITLE, 0, Number.POSITIVE_INFINITY)],
    [
      'a start that is a string',
      { type: 'SetNodeLifetime', nodeId: TITLE, startUs: '0', durationUs: 1 },
    ],
    ['a missing duration', { type: 'SetNodeLifetime', nodeId: TITLE, startUs: 0 }],
    ['a missing start', { type: 'SetNodeLifetime', nodeId: TITLE, durationUs: 1 }],
    ['an empty node ID', setLifetime('', 0, 1)],
    ['an unknown field', extra(setLifetime(TITLE, 0, 1))],
  ])('refuses %s with invalid-argument, never rounding it', (_, command) => {
    expect(codeOf(() => parseCommand(command))).toBe('invalid-argument');
  });

  it('reads -0 as the start 0, and freezes the command', () => {
    const command = parseCommand(setLifetime(TITLE, -0, 1)) as unknown as { startUs: number };
    expect(Object.is(command.startUs, 0)).toBe(true);
    expect(Object.isFrozen(command)).toBe(true);
  });

  it('is idempotent and returns a well-formed command unchanged', () => {
    const command = parseCommand(setLifetime(TITLE, 1, 2));
    expect(command).toEqual(setLifetime(TITLE, 1, 2));
    expect(parseCommand(command)).toEqual(command);
  });
});

describe('the order of the checks of SetNodeLifetime (D42.10)', () => {
  it.each([
    ['a missing node', 'node-missing'],
    ['the scene', 'scene-main'],
    ['an animation', 'anim-title-opacity'],
    ['an asset', 'asset-image'],
    ['the clip', 'clip-audio'],
  ])('refuses %s with unknown-node and no details', (_, nodeId) => {
    const error = errorOf(() => applyCommand(reference(), setLifetime(nodeId, 1, 2)));
    expect(error.code).toBe('unknown-node');
    expect(error.details).toEqual([]);
  });

  it.each([
    ['the fields before the node', setLifetime('node-missing', 0.5, 1), 'invalid-argument'],
    [
      'the fields before the node, for a duration',
      setLifetime('node-missing', 0, 0),
      'invalid-argument',
    ],
    ['the fields before a no-op', extra(setLifetime(TITLE, 0, 10_000_000)), 'invalid-argument'],
    ['the node before a no-op', setLifetime('node-missing', 0, 10_000_000), 'unknown-node'],
  ])('checks %s', (_, command, code) => {
    expect(codeOf(() => applyCommand(reference(), command))).toBe(code);
  });

  it.each(EVERY_NODE)(
    'is a no-op for the lifetime %s has: no change, no history, no event',
    (nodeId) => {
      const board = bus();
      const before = board.getDocument();
      const seen: unknown[] = [];
      board.subscribe((change) => seen.push(change));
      const result = board.dispatch(setLifetime(nodeId, -0, 10_000_000));
      expect(result.document).toBe(before);
      expect(result.inverse).toBeNull();
      expect(board.canUndo()).toBe(false);
      expect(seen).toEqual([]);
    },
  );

  it('leaves the document, the history, and the listeners alone when it is refused', () => {
    const board = bus();
    board.dispatch(setLifetime(TITLE, 1, 2));
    board.undo();
    const before = board.getDocument();
    const seen: unknown[] = [];
    board.subscribe((change) => seen.push(change));
    for (const command of [setLifetime('node-missing', 1, 2), setLifetime(TITLE, 0, 0)]) {
      expect(codeOf(() => board.dispatch(command))).not.toBe('did not throw');
    }
    expect(board.getDocument()).toBe(before);
    expect(board.canUndo()).toBe(false);
    expect(board.canRedo()).toBe(true);
    expect(seen).toEqual([]);
  });

  it('has no node it does not support: every node of the reference takes it', () => {
    for (const nodeId of EVERY_NODE) {
      expect(
        codeOf(() => applyCommand(reference(), setLifetime(nodeId, 1, 2))),
        nodeId,
      ).toBe('did not throw');
    }
  });
});

describe('SetNodeLifetime in a transaction, and its inverse elsewhere (D38.4, D39.6)', () => {
  it('sets several lifetimes as one operation and undoes them as one', () => {
    const board = bus();
    const before = json(board.getDocument());
    const result = board.dispatchTransaction([
      setLifetime(GROUP, 1_000_000, 4_000_000),
      setLifetime(IMAGE, 2_000_000, 1_000_000),
      setLifetime(BACKGROUND, 0, 9_000_000),
    ]);
    expect(result.createdIds).toEqual([]);
    expect(lifetimeOf(board.getDocument(), IMAGE)).toEqual({
      startUs: 2_000_000,
      durationUs: 1_000_000,
    });
    board.undo();
    expect(json(board.getDocument())).toBe(before);
  });

  it('fails atomically when its inverse is applied to a document without the node', () => {
    const { inverse } = applyCommand(reference(), setLifetime(TITLE, 1, 2));
    const gone = applyCommand(reference(), { type: 'RemoveNode', nodeId: TITLE }).document;
    const before = json(gone);
    expect(codeOf(() => applyCommand(gone, inverse as Command))).toBe('unknown-node');
    expect(json(gone)).toBe(before);
  });

  it('is carried by a duplicated node, and by a node removed and restored', () => {
    const board = bus();
    board.dispatch(setLifetime(TITLE, 1_000_000, 2_000_000));
    board.dispatch({ type: 'DuplicateNode', nodeId: TITLE, newNodeId: 'title-2' });
    expect(lifetimeOf(board.getDocument(), 'title-2')).toEqual({
      startUs: 1_000_000,
      durationUs: 2_000_000,
    });
    const before = json(board.getDocument());
    board.dispatch({ type: 'RemoveNode', nodeId: TITLE });
    board.undo();
    expect(json(board.getDocument())).toBe(before);
  });

  it('refuses an added node without a lifetime: the validator requires both fields', () => {
    const node = structuredClone(nodeOf(reference(), HTML)) as unknown as Record<string, unknown>;
    node['id'] = 'html-2';
    Reflect.deleteProperty(node, 'startUs');
    const error = errorOf(() =>
      applyCommand(reference(), { type: 'AddNode', parentId: 'scene-main', index: 0, node }),
    );
    expect(error.code).toBe('invalid-result');
    expect(error.details.join('\n')).toContain('startUs');
  });
});

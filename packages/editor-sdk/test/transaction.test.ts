/**
 * Transactions and the bounded history of the bus (D38.4–D38.7, D38.9). A
 * transaction is all of its commands or none of them, one history entry, and
 * one change; the history keeps at most `historyLimit` entries, a transaction
 * counting as one.
 */
import { referenceComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { createCommandBus, type Command } from '../src/index.js';

import { codeOf, errorOf, json, nodeOf, positionOf, reference } from './support.js';

const TITLE = 'node-title';
const CAPTION = 'node-caption';
const START = { x: 90, y: 160 };

function move(x: number, y: number, nodeId = TITLE): Command {
  return { type: 'SetNodePosition', nodeId, position: { x, y } };
}

function fade(opacity: number, nodeId = TITLE): Command {
  return { type: 'SetNodeOpacity', nodeId, opacity };
}

function retext(text: string, nodeId = TITLE): Command {
  return { type: 'SetTextContent', nodeId, text };
}

function fieldOf(document: unknown, nodeId: string, field: string): unknown {
  return (nodeOf(document, nodeId) as unknown as Record<string, unknown>)[field];
}

describe('dispatchTransaction (D38.4)', () => {
  it('applies every command in order as one operation with one history entry', () => {
    const original = json(reference());
    const bus = createCommandBus(referenceComposition);
    const result = bus.dispatchTransaction([move(10, 20), fade(0.5), retext('Hi', CAPTION)]);
    expect(positionOf(result.document, TITLE)).toEqual({ x: 10, y: 20 });
    expect(fieldOf(result.document, TITLE, 'opacity')).toBe(0.5);
    expect(fieldOf(result.document, CAPTION, 'text')).toBe('Hi');
    expect(result.document).toBe(bus.getDocument());
    expect(bus.canUndo()).toBe(true);
    const edited = json(bus.getDocument());
    bus.undo();
    expect(json(bus.getDocument())).toBe(original);
    expect(bus.canUndo()).toBe(false);
    bus.redo();
    expect(json(bus.getDocument())).toBe(edited);
  });

  it('returns the parsed commands, and the inverses in the order undo applies them (D38.6)', () => {
    const bus = createCommandBus(referenceComposition);
    const result = bus.dispatchTransaction([move(10.4, 20.6), fade(0.5), retext('Hi', CAPTION)]);
    expect(result.commands).toEqual([move(10, 21), fade(0.5), retext('Hi', CAPTION)]);
    expect(result.inverses).toEqual([
      retext('Deterministic by design', CAPTION),
      fade(0.75),
      move(START.x, START.y),
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.commands)).toBe(true);
    expect(Object.isFrozen(result.inverses)).toBe(true);
    for (const command of [...result.commands, ...result.inverses]) {
      expect(Object.isFrozen(command)).toBe(true);
    }
  });

  it('leaves the commands that changed nothing out of the inverses', () => {
    const bus = createCommandBus(referenceComposition);
    const result = bus.dispatchTransaction([fade(0.75), move(1, 2), retext('Kadrion')]);
    expect(result.commands).toHaveLength(3);
    expect(result.inverses).toEqual([move(START.x, START.y)]);
  });

  it('edits the same node twice and undoes it back to the start in one step', () => {
    const bus = createCommandBus(referenceComposition);
    const result = bus.dispatchTransaction([move(1, 1), move(2, 2)]);
    expect(result.inverses).toEqual([move(1, 1), move(START.x, START.y)]);
    expect(positionOf(bus.getDocument(), TITLE)).toEqual({ x: 2, y: 2 });
    const undone = bus.undo();
    expect(positionOf(bus.getDocument(), TITLE)).toEqual(START);
    expect(json(bus.getDocument())).toBe(json(reference()));
    // What redo will apply, in its order: the commands again.
    expect(undone.commands).toEqual([move(1, 1), move(START.x, START.y)]);
    expect(undone.inverses).toEqual([move(1, 1), move(2, 2)]);
    bus.redo();
    expect(positionOf(bus.getDocument(), TITLE)).toEqual({ x: 2, y: 2 });
  });

  it('records a round trip as an entry: it is not a no-op (D38.9)', () => {
    const bus = createCommandBus(referenceComposition);
    bus.dispatch(move(5, 5));
    bus.undo();
    const before = bus.getDocument();
    const result = bus.dispatchTransaction([move(1, 1), move(START.x, START.y)]);
    expect(json(result.document)).toBe(json(before));
    expect(result.document).not.toBe(before);
    expect(result.inverses).toHaveLength(2);
    expect(bus.canUndo()).toBe(true);
    expect(bus.canRedo()).toBe(false);
  });

  it('changes nothing when no command changes a value: no entry, the redo branch stays', () => {
    const bus = createCommandBus(referenceComposition);
    bus.dispatch(move(5, 5));
    bus.undo();
    const before = bus.getDocument();
    const result = bus.dispatchTransaction([move(START.x, START.y), fade(0.75), retext('Kadrion')]);
    expect(result.document).toBe(before);
    expect(result.inverses).toEqual([]);
    expect(Object.isFrozen(result.inverses)).toBe(true);
    expect(bus.canUndo()).toBe(false);
    expect(bus.canRedo()).toBe(true);
  });

  it('clears the redo branch like a dispatch', () => {
    const bus = createCommandBus(referenceComposition);
    bus.dispatch(move(5, 5));
    bus.undo();
    bus.dispatchTransaction([fade(0.1)]);
    expect(bus.canRedo()).toBe(false);
  });

  describe('atomicity', () => {
    it('applies none of the commands when one fails, and names it by its index', () => {
      const bus = createCommandBus(referenceComposition);
      bus.dispatch(move(5, 5));
      const document = bus.getDocument();
      const error = errorOf(() =>
        bus.dispatchTransaction([fade(0.5), move(2_000_000, 0), retext('never')]),
      );
      expect(error.code).toBe('invalid-result');
      expect(error.message).toBe(
        'Command 1 of the transaction: The command `SetNodePosition` would produce a document the schema rejects.',
      );
      expect(error.details.join('\n')).toContain('/position/x');
      expect(bus.getDocument()).toBe(document);
      expect(bus.canUndo()).toBe(true);
      expect(bus.canRedo()).toBe(false);
      bus.undo();
      expect(json(bus.getDocument())).toBe(json(reference()));
      expect(bus.canUndo()).toBe(false);
    });

    it('keeps the code of every failure and prefixes its message only', () => {
      const bus = createCommandBus(referenceComposition);
      for (const [commands, code, at] of [
        [[fade(0.5), { type: 'Group', commands: [] }], 'unknown-command', 1],
        [[move(1, 1), move(2, 2), fade(1.5)], 'invalid-argument', 2],
        [[retext('x', 'node-missing')], 'unknown-node', 0],
        [[fade(0.5), retext('x', 'node-image')], 'unsupported-node', 1],
        [[fade(0.5), 'not a command'], 'invalid-argument', 1],
        [[fade(0.5), [fade(0.1)]], 'invalid-argument', 1],
      ] as const) {
        const error = errorOf(() => bus.dispatchTransaction(commands));
        expect(error.code, JSON.stringify(commands)).toBe(code);
        expect(error.message).toMatch(new RegExp(`^Command ${String(at)} of the transaction: `));
        expect(json(bus.getDocument())).toBe(json(reference()));
        expect(bus.canUndo()).toBe(false);
      }
    });

    it('parses every command before applying any', () => {
      const bus = createCommandBus(referenceComposition);
      // The unknown node would fail when applied; the malformed command fails first.
      expect(
        codeOf(() => bus.dispatchTransaction([move(1, 1, 'node-missing'), fade(Number.NaN)])),
      ).toBe('invalid-argument');
    });

    it('validates the document after every command, not only at the end (D38.5)', () => {
      const bus = createCommandBus(referenceComposition);
      const error = errorOf(() => bus.dispatchTransaction([move(2_000_000, 0), move(1, 1)]));
      expect(error.code).toBe('invalid-result');
      expect(error.message).toMatch(/^Command 0 of the transaction: /);
      expect(json(bus.getDocument())).toBe(json(reference()));
    });
  });

  it.each([
    ['an object', { commands: [] }],
    ['a single command', { type: 'SetNodeOpacity', nodeId: TITLE, opacity: 0.5 }],
    ['a string', 'SetNodeOpacity'],
    ['null', null],
    ['undefined', undefined],
    ['an empty array', []],
    ['a sparse array', Object.assign(new Array<unknown>(3), { 0: fade(0.5), 2: fade(0.25) })],
    ['an array with a hole at the end', Object.assign(new Array<unknown>(2), { 0: fade(0.5) })],
  ])('refuses %s as invalid-argument', (_, commands) => {
    const bus = createCommandBus(referenceComposition);
    expect(codeOf(() => bus.dispatchTransaction(commands))).toBe('invalid-argument');
    expect(json(bus.getDocument())).toBe(json(reference()));
  });

  it('keeps its history out of reach of a caller that mutates its array afterwards', () => {
    const original = json(reference());
    const bus = createCommandBus(referenceComposition);
    const payload = { type: 'SetNodePosition', nodeId: TITLE, position: { x: 1, y: 2 } };
    const commands: unknown[] = [payload];
    bus.dispatchTransaction(commands);
    payload.position.x = 999;
    commands.push(fade(0.1));
    bus.undo();
    expect(json(bus.getDocument())).toBe(original);
  });

  it('names the hole of a sparse array rather than parsing undefined', () => {
    const bus = createCommandBus(referenceComposition);
    const commands = Object.assign(new Array<unknown>(3), { 0: fade(0.5), 2: fade(0.25) });
    expect(errorOf(() => bus.dispatchTransaction(commands)).message).toBe(
      'A transaction has no command at index 1.',
    );
    expect(errorOf(() => bus.dispatchTransaction([])).message).toBe(
      'A transaction needs at least one command.',
    );
  });

  it('reads the array once', () => {
    const bus = createCommandBus(referenceComposition);
    let reads = 0;
    const commands = new Proxy([fade(0.5)], {
      get(target, key, receiver) {
        if (key === '0') reads += 1;
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
    bus.dispatchTransaction(commands);
    expect(reads).toBe(1);
  });
});

describe('dispatch keeps its contract (D30.9)', () => {
  it('returns a frozen CommandResult and reports failures without a transaction prefix', () => {
    const bus = createCommandBus(referenceComposition);
    const result = bus.dispatch(fade(0.5));
    expect(Object.keys(result).sort()).toEqual(['createdIds', 'document', 'inverse']);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.createdIds).toEqual([]);
    expect(result.inverse).toEqual(fade(0.75));
    expect(errorOf(() => bus.dispatch(fade(2))).message).toBe(
      '`opacity` must be a finite number from 0 to 1, not 2.',
    );
  });

  it('reports a failure found while applying without a transaction prefix', () => {
    // These fail after parsing, inside the mechanism dispatch shares with transactions.
    const bus = createCommandBus(referenceComposition);
    expect(errorOf(() => bus.dispatch(move(2_000_000, 0))).message).toBe(
      'The command `SetNodePosition` would produce a document the schema rejects.',
    );
    expect(errorOf(() => bus.dispatch(fade(0.5, 'node-missing'))).message).toBe(
      'The document has no node `node-missing`.',
    );
  });

  it('dispatches every command type', () => {
    const bus = createCommandBus(referenceComposition);
    bus.dispatch(move(1, 2));
    bus.dispatch(fade(0.5));
    bus.dispatch(retext('Hi'));
    expect(fieldOf(bus.getDocument(), TITLE, 'text')).toBe('Hi');
    for (let step = 0; step < 3; step += 1) bus.undo();
    expect(json(bus.getDocument())).toBe(json(reference()));
  });
});

describe('undo and redo return a TransactionResult', () => {
  it('names the commands applied and the entry recorded for the other direction', () => {
    const bus = createCommandBus(referenceComposition);
    bus.dispatch(fade(0.5));
    const undone = bus.undo();
    expect(undone.document).toBe(bus.getDocument());
    expect(undone.commands).toEqual([fade(0.75)]);
    expect(undone.inverses).toEqual([fade(0.5)]);
    const redone = bus.redo();
    expect(redone.commands).toEqual([fade(0.5)]);
    expect(redone.inverses).toEqual([fade(0.75)]);
    expect(Object.isFrozen(undone)).toBe(true);
    expect(Object.isFrozen(redone.commands)).toBe(true);
  });
});

describe('the history limit (D38.7)', () => {
  /** A bus with `count` distinct moves dispatched, and the JSON after each. */
  function filled(count: number, historyLimit?: number) {
    const bus =
      historyLimit === undefined
        ? createCommandBus(referenceComposition)
        : createCommandBus(referenceComposition, { historyLimit });
    const states = [json(bus.getDocument())];
    for (let at = 1; at <= count; at += 1) {
      bus.dispatch(move(at, at));
      states.push(json(bus.getDocument()));
    }
    return { bus, states };
  }

  /** How many times undo succeeds. */
  function undoAll(bus: ReturnType<typeof createCommandBus>): number {
    let count = 0;
    while (bus.canUndo()) {
      bus.undo();
      count += 1;
    }
    expect(codeOf(() => bus.undo())).toBe('nothing-to-undo');
    return count;
  }

  it('keeps 100 entries by default and drops the oldest first', () => {
    const { bus, states } = filled(101);
    expect(undoAll(bus)).toBe(100);
    expect(json(bus.getDocument())).toBe(states[1]);
  });

  it('keeps as many entries as it is given', () => {
    const { bus, states } = filled(5, 2);
    expect(undoAll(bus)).toBe(2);
    expect(json(bus.getDocument())).toBe(states[3]);
  });

  it('counts a transaction as one entry', () => {
    const bus = createCommandBus(referenceComposition, { historyLimit: 1 });
    bus.dispatch(fade(0.1));
    bus.dispatchTransaction([move(1, 1), move(2, 2), fade(0.5)]);
    const after = json(bus.getDocument());
    expect(undoAll(bus)).toBe(1);
    expect(fieldOf(bus.getDocument(), TITLE, 'opacity')).toBe(0.1);
    bus.redo();
    expect(json(bus.getDocument())).toBe(after);
  });

  it('never lets redo exceed the limit either', () => {
    const { bus, states } = filled(4, 2);
    undoAll(bus);
    let redone = 0;
    while (bus.canRedo()) {
      bus.redo();
      redone += 1;
    }
    expect(redone).toBe(2);
    expect(codeOf(() => bus.redo())).toBe('nothing-to-redo');
    expect(json(bus.getDocument())).toBe(states[4]);
  });

  it('keeps no history at 0, and still executes every command', () => {
    for (const historyLimit of [0, -0]) {
      const bus = createCommandBus(referenceComposition, { historyLimit });
      bus.dispatch(move(1, 1));
      bus.dispatchTransaction([fade(0.5), retext('Hi')]);
      expect(positionOf(bus.getDocument(), TITLE)).toEqual({ x: 1, y: 1 });
      expect(fieldOf(bus.getDocument(), TITLE, 'text')).toBe('Hi');
      expect(bus.canUndo()).toBe(false);
      expect(bus.canRedo()).toBe(false);
      expect(codeOf(() => bus.undo())).toBe('nothing-to-undo');
      expect(codeOf(() => bus.redo())).toBe('nothing-to-redo');
    }
  });

  it('accepts the largest safe integer', () => {
    const { bus } = filled(3, Number.MAX_SAFE_INTEGER);
    expect(undoAll(bus)).toBe(3);
  });

  it.each([
    ['a negative number', -1],
    ['a fraction', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['an unsafe integer', 2 ** 53],
    ['a numeric string', '3'],
    ['null', null],
    ['a boolean', true],
  ])('refuses %s as invalid-argument', (_, historyLimit) => {
    expect(codeOf(() => createCommandBus(referenceComposition, { historyLimit } as never))).toBe(
      'invalid-argument',
    );
  });

  it('is read once and cannot change for the life of the bus', () => {
    let reads = 0;
    const options = {
      get historyLimit() {
        reads += 1;
        return reads === 1 ? 1 : 100;
      },
    };
    const bus = createCommandBus(referenceComposition, options);
    bus.dispatch(move(1, 1));
    bus.dispatch(move(2, 2));
    expect(reads).toBe(1);
    bus.undo();
    expect(bus.canUndo()).toBe(false);
  });
});

describe('the options of the bus', () => {
  it('may be left out, or given empty', () => {
    expect(createCommandBus(referenceComposition).canUndo()).toBe(false);
    expect(createCommandBus(referenceComposition, {}).canUndo()).toBe(false);
  });

  it.each([
    ['an unknown option', { historyLimit: 3, history: 3 }],
    ['a misspelt option', { onListenerErrors: () => undefined }],
    ['null', null],
    ['an array', []],
    ['a number', 3],
    ['a non-function onListenerError', { onListenerError: 'log' }],
  ])('refuses %s as invalid-argument', (_, options) => {
    expect(codeOf(() => createCommandBus(referenceComposition, options as never))).toBe(
      'invalid-argument',
    );
  });

  it('still refuses an invalid document first', () => {
    expect(codeOf(() => createCommandBus(null, { historyLimit: -1 }))).toBe('invalid-document');
  });
});

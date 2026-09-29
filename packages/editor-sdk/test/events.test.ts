/**
 * The changes the bus delivers to its listeners (D38.8). One frozen change per
 * committed operation, after the commit, in the order of subscription, over the
 * listeners subscribed when delivery began. A listener's error goes to the
 * host's `onListenerError` and never escapes the operation; a listener cannot
 * change the document while a change is being delivered.
 */
import { referenceComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  createCommandBus,
  type BusChange,
  type Command,
  type CommandBus,
  type ListenerErrorHandler,
} from '../src/index.js';

import { codeOf, json, positionOf, reference } from './support.js';

const TITLE = 'node-title';

function move(x: number, y: number): Command {
  return { type: 'SetNodePosition', nodeId: TITLE, position: { x, y } };
}

function fade(opacity: number): Command {
  return { type: 'SetNodeOpacity', nodeId: TITLE, opacity };
}

/** A bus whose listener errors are collected, and the changes one listener saw. */
function observed(onListenerError: ListenerErrorHandler = () => undefined) {
  const bus = createCommandBus(referenceComposition, { onListenerError });
  const changes: BusChange[] = [];
  bus.subscribe((change) => changes.push(change));
  return { bus, changes };
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

describe('a bus without onListenerError', () => {
  it('works in full, and refuses a subscription as invalid-argument', () => {
    const bus = createCommandBus(referenceComposition);
    bus.dispatch(move(1, 1));
    bus.dispatchTransaction([fade(0.5)]);
    bus.undo();
    bus.redo();
    expect(codeOf(() => bus.subscribe(() => undefined))).toBe('invalid-argument');
    expect(bus.canUndo()).toBe(true);
  });
});

describe('the changes (D38.8)', () => {
  it('refuses a listener that is not a function', () => {
    const { bus } = observed();
    expect(codeOf(() => bus.subscribe('log' as never))).toBe('invalid-argument');
  });

  it('delivers one change per dispatch, transaction, undo, and redo', () => {
    const { bus, changes } = observed();
    const dispatched = bus.dispatch(move(1, 1));
    const transaction = bus.dispatchTransaction([fade(0.5), move(2, 2)]);
    const undone = bus.undo();
    const redone = bus.redo();
    expect(changes.map(({ kind }) => kind)).toEqual(['dispatch', 'transaction', 'undo', 'redo']);
    expect(changes.map(({ document }) => document)).toEqual([
      dispatched.document,
      transaction.document,
      undone.document,
      redone.document,
    ]);
    expect(changes[0]).toMatchObject({
      commands: [move(1, 1)],
      inverses: [move(90, 160)],
      canUndo: true,
      canRedo: false,
    });
    expect(changes[1]).toMatchObject({
      commands: transaction.commands,
      inverses: transaction.inverses,
    });
    expect(changes[2]).toMatchObject({
      commands: transaction.inverses,
      inverses: undone.inverses,
      canUndo: true,
      canRedo: true,
    });
    expect(changes[3]).toMatchObject({ canUndo: true, canRedo: false });
  });

  it('is delivered after the commit: the listener reads the new state', () => {
    const bus = createCommandBus(referenceComposition, { onListenerError: () => undefined });
    const seen: unknown[] = [];
    bus.subscribe((change) => {
      seen.push(change.document === bus.getDocument(), bus.canUndo(), bus.canRedo());
    });
    bus.dispatch(move(1, 1));
    bus.undo();
    expect(seen).toEqual([true, true, false, true, false, true]);
  });

  it('is frozen, with its arrays and the commands in them', () => {
    const { bus, changes } = observed();
    bus.dispatchTransaction([move(1, 1), fade(0.5)]);
    bus.undo();
    for (const change of changes) {
      expect(Object.isFrozen(change)).toBe(true);
      expect(isDeepFrozen(change.commands)).toBe(true);
      expect(isDeepFrozen(change.inverses)).toBe(true);
      expect(Object.keys(change).sort()).toEqual([
        'canRedo',
        'canUndo',
        'commands',
        'createdIds',
        'document',
        'inverses',
        'kind',
      ]);
      expect(Object.isFrozen(change.createdIds)).toBe(true);
    }
  });

  it('is not delivered for a no-op or a failure', () => {
    const { bus, changes } = observed();
    bus.dispatch(move(90, 160));
    bus.dispatchTransaction([fade(0.75)]);
    expect(codeOf(() => bus.dispatch(move(2_000_000, 0)))).toBe('invalid-result');
    expect(codeOf(() => bus.dispatchTransaction([fade(0.5), fade(2)]))).toBe('invalid-argument');
    expect(codeOf(() => bus.undo())).toBe('nothing-to-undo');
    expect(codeOf(() => bus.redo())).toBe('nothing-to-redo');
    expect(changes).toEqual([]);
  });

  it('is delivered with historyLimit 0, saying there is nothing to undo', () => {
    const bus = createCommandBus(referenceComposition, {
      historyLimit: 0,
      onListenerError: () => undefined,
    });
    const changes: BusChange[] = [];
    bus.subscribe((change) => changes.push(change));
    bus.dispatch(move(1, 1));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ canUndo: false, canRedo: false });
  });
});

describe('the listeners (D38.8)', () => {
  it('are called in the order of subscription; the same function twice is called twice', () => {
    const bus = createCommandBus(referenceComposition, { onListenerError: () => undefined });
    const calls: string[] = [];
    const twice = (): void => {
      calls.push('twice');
    };
    bus.subscribe(() => calls.push('first'));
    const offTwice = bus.subscribe(twice);
    bus.subscribe(twice);
    bus.subscribe(() => calls.push('last'));
    bus.dispatch(move(1, 1));
    expect(calls).toEqual(['first', 'twice', 'twice', 'last']);
    calls.length = 0;
    offTwice();
    offTwice();
    bus.dispatch(move(2, 2));
    expect(calls).toEqual(['first', 'twice', 'last']);
  });

  it('stop receiving changes once unsubscribed', () => {
    const bus = createCommandBus(referenceComposition, { onListenerError: () => undefined });
    const changes: BusChange[] = [];
    const off = bus.subscribe((change) => changes.push(change));
    bus.dispatch(move(1, 1));
    off();
    bus.dispatch(move(2, 2));
    expect(changes).toHaveLength(1);
  });

  it('are a snapshot taken when delivery begins', () => {
    const bus = createCommandBus(referenceComposition, { onListenerError: () => undefined });
    const calls: string[] = [];
    let offSecond = (): void => undefined;
    bus.subscribe((change) => {
      calls.push(`first ${change.kind}`);
      if (calls.length === 1) {
        offSecond();
        bus.subscribe(() => calls.push('late'));
      }
    });
    offSecond = bus.subscribe(() => calls.push('second'));
    bus.dispatch(move(1, 1));
    // The removed listener still receives this change; the new one does not.
    expect(calls).toEqual(['first dispatch', 'second']);
    bus.dispatch(move(2, 2));
    expect(calls).toEqual(['first dispatch', 'second', 'first dispatch', 'late']);
  });

  it('do not include a listener subscribed during delivery, with nothing removed first', () => {
    const bus = createCommandBus(referenceComposition, { onListenerError: () => undefined });
    const calls: string[] = [];
    let added = false;
    bus.subscribe((change) => {
      calls.push(`first ${change.kind}`);
      if (!added) {
        added = true;
        bus.subscribe((late) => calls.push(`late ${late.kind}`));
      }
    });
    bus.dispatch(move(1, 1));
    expect(calls).toEqual(['first dispatch']);
    bus.undo();
    expect(calls).toEqual(['first dispatch', 'first undo', 'late undo']);
  });
});

describe('listener errors (D38.8)', () => {
  it('go to onListenerError, once each, and the other listeners still run', () => {
    const errors: [unknown, BusChange][] = [];
    const bus = createCommandBus(referenceComposition, {
      onListenerError: (error, change) => errors.push([error, change]),
    });
    const calls: string[] = [];
    const first = new Error('first');
    const third = new Error('third');
    bus.subscribe(() => {
      throw first;
    });
    bus.subscribe(() => calls.push('second'));
    bus.subscribe(() => {
      throw third;
    });
    bus.subscribe(() => calls.push('fourth'));
    const result = bus.dispatch(move(1, 1));
    expect(calls).toEqual(['second', 'fourth']);
    expect(errors.map(([error]) => error)).toEqual([first, third]);
    expect(errors[0]?.[1]).toBe(errors[1]?.[1]);
    expect(errors[0]?.[1].document).toBe(result.document);
  });

  it('change neither the result nor the committed state, and roll nothing back', () => {
    const errors: unknown[] = [];
    const bus = createCommandBus(referenceComposition, {
      onListenerError: (error) => errors.push(error),
    });
    bus.subscribe(() => {
      throw new Error('listener');
    });
    const dispatched = bus.dispatch(move(1, 1));
    expect(dispatched.inverse).toEqual(move(90, 160));
    expect(bus.getDocument()).toBe(dispatched.document);
    const transaction = bus.dispatchTransaction([fade(0.5)]);
    expect(bus.getDocument()).toBe(transaction.document);
    bus.undo();
    bus.redo();
    expect(bus.canUndo()).toBe(true);
    expect(errors).toHaveLength(4);
  });

  it('never escape an operation, whatever is thrown', () => {
    const bus = createCommandBus(referenceComposition, { onListenerError: () => undefined });
    const values: readonly unknown[] = [
      new Error('x'),
      'a string',
      undefined,
      null,
      { code: 'busy' },
    ];
    for (const thrown of values) {
      bus.subscribe(() => {
        throw thrown;
      });
    }
    expect(codeOf(() => bus.dispatch(move(1, 1)))).toBe('did not throw');
    expect(codeOf(() => bus.dispatchTransaction([fade(0.5)]))).toBe('did not throw');
    expect(codeOf(() => bus.undo())).toBe('did not throw');
    expect(codeOf(() => bus.redo())).toBe('did not throw');
  });

  it('survive an onListenerError that throws, which breaks the host contract', () => {
    let handled = 0;
    const bus = createCommandBus(referenceComposition, {
      onListenerError: () => {
        handled += 1;
        throw new Error('the handler');
      },
    });
    const calls: string[] = [];
    bus.subscribe(() => {
      throw new Error('first');
    });
    bus.subscribe(() => calls.push('second'));
    bus.subscribe(() => {
      throw new Error('third');
    });
    bus.subscribe(() => calls.push('fourth'));
    expect(codeOf(() => bus.dispatch(move(1, 1)))).toBe('did not throw');
    expect(calls).toEqual(['second', 'fourth']);
    expect(handled).toBe(2);
    // The bus stays consistent and usable.
    expect(positionOf(bus.getDocument(), TITLE)).toEqual({ x: 1, y: 1 });
    bus.undo();
    expect(json(bus.getDocument())).toBe(json(reference()));
    expect(calls).toEqual(['second', 'fourth', 'second', 'fourth']);
  });
});

describe('reentrancy (D38.8)', () => {
  /** Runs `attempt` from a listener during one dispatch and returns what it threw. */
  function fromListener(
    attempt: (bus: CommandBus) => unknown,
    prepare?: (bus: CommandBus) => void,
  ) {
    const bus = createCommandBus(referenceComposition, { onListenerError: () => undefined });
    prepare?.(bus);
    const codes: string[] = [];
    const states: string[] = [];
    let armed = true;
    bus.subscribe(() => {
      if (!armed) return;
      armed = false;
      const before = [json(bus.getDocument()), bus.canUndo(), bus.canRedo()].join('|');
      codes.push(codeOf(() => attempt(bus)));
      states.push(before, [json(bus.getDocument()), bus.canUndo(), bus.canRedo()].join('|'));
    });
    bus.dispatch(move(1, 1));
    return { bus, codes, states };
  }

  it.each([
    ['dispatch', (bus: CommandBus) => bus.dispatch(move(5, 5))],
    ['dispatchTransaction', (bus: CommandBus) => bus.dispatchTransaction([move(5, 5)])],
    ['undo', (bus: CommandBus) => bus.undo()],
    ['redo', (bus: CommandBus) => bus.redo()],
  ])('refuses %s during delivery as busy and changes nothing', (_, attempt) => {
    const { bus, codes, states } = fromListener(attempt, (fresh) => {
      fresh.dispatch(fade(0.5));
      fresh.undo();
    });
    expect(codes).toEqual(['busy']);
    expect(states[0]).toBe(states[1]);
    expect(positionOf(bus.getDocument(), TITLE)).toEqual({ x: 1, y: 1 });
  });

  const ATTEMPTS: readonly (readonly [string, (bus: CommandBus) => unknown])[] = [
    ['dispatch', (bus) => bus.dispatch(move(5, 5))],
    ['dispatchTransaction', (bus) => bus.dispatchTransaction([move(5, 5), fade(0.1)])],
    ['undo', (bus) => bus.undo()],
    ['redo', (bus) => bus.redo()],
  ];

  /** A bus with something to undo and something to redo. */
  function withHistory(onListenerError: ListenerErrorHandler): CommandBus {
    const bus = createCommandBus(referenceComposition, { onListenerError });
    bus.dispatch(fade(0.5));
    bus.dispatch(move(3, 3));
    bus.undo();
    return bus;
  }

  /** The document and both flags, as one comparable string. */
  function stateOf(bus: CommandBus): string {
    return [json(bus.getDocument()), bus.canUndo(), bus.canRedo()].join('|');
  }

  it.each([
    ['a transaction', (bus: CommandBus) => bus.dispatchTransaction([move(1, 1), fade(0.25)])],
    ['an undo', (bus: CommandBus) => bus.undo()],
    ['a redo', (bus: CommandBus) => bus.redo()],
  ])('refuses every mutation during the delivery of %s as busy', (_, trigger) => {
    const bus = withHistory(() => undefined);
    const codes: string[] = [];
    let armed = true;
    let unchanged = true;
    bus.subscribe(() => {
      if (!armed) return;
      armed = false;
      const before = stateOf(bus);
      for (const [, attempt] of ATTEMPTS) codes.push(codeOf(() => attempt(bus)));
      unchanged = stateOf(bus) === before;
    });
    const committed = trigger(bus) as { document: unknown };
    expect(codes).toEqual(['busy', 'busy', 'busy', 'busy']);
    expect(unchanged).toBe(true);
    expect(bus.getDocument()).toBe(committed.document);
  });

  it('refuses every mutation from onListenerError during delivery as busy', () => {
    const codes: string[] = [];
    let unchanged = true;
    let armed = true;
    const bus = withHistory(() => {
      // Once only: were a mutation let through, its own change would call the
      // handler again, and the test would recurse instead of failing.
      if (!armed) return;
      armed = false;
      const before = stateOf(bus);
      for (const [, attempt] of ATTEMPTS) codes.push(codeOf(() => attempt(bus)));
      unchanged = stateOf(bus) === before;
    });
    bus.subscribe(() => {
      throw new Error('listener');
    });
    const result = bus.dispatch(move(1, 1));
    expect(codes).toEqual(['busy', 'busy', 'busy', 'busy']);
    expect(unchanged).toBe(true);
    expect(bus.getDocument()).toBe(result.document);
    // Once delivery is over, the bus accepts changes again.
    expect(codeOf(() => bus.undo())).toBe('did not throw');
  });

  it('refuses even a call that would otherwise fail differently', () => {
    const { codes } = fromListener((bus) => bus.redo());
    expect(codes).toEqual(['busy']);
    const invalid = fromListener((bus) => bus.dispatch('not a command'));
    expect(invalid.codes).toEqual(['busy']);
  });

  it('allows reading and subscribing during delivery', () => {
    const { codes } = fromListener((bus) => {
      bus.getDocument();
      bus.canUndo();
      bus.canRedo();
      bus.subscribe(() => undefined)();
    });
    expect(codes).toEqual(['did not throw']);
  });

  it('is over once delivery ends, even after a listener threw', () => {
    const bus = createCommandBus(referenceComposition, { onListenerError: () => undefined });
    bus.subscribe(() => {
      throw new Error('listener');
    });
    bus.dispatch(move(1, 1));
    expect(codeOf(() => bus.dispatch(move(2, 2)))).toBe('did not throw');
    expect(positionOf(bus.getDocument(), TITLE)).toEqual({ x: 2, y: 2 });
  });

  it('reaches onListenerError when the listener lets busy escape', () => {
    const codes: unknown[] = [];
    const bus = createCommandBus(referenceComposition, {
      onListenerError: (error) => codes.push((error as { code?: unknown }).code),
    });
    bus.subscribe(() => bus.undo());
    bus.dispatch(move(1, 1));
    expect(codes).toEqual(['busy']);
    expect(bus.canUndo()).toBe(true);
  });
});

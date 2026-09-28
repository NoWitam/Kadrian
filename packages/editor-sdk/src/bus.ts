/**
 * The command bus and its history (D30.9, D38). The history is host memory: it
 * is not part of the composition, not part of the schema, never reaches
 * `@kadrion/runtime` or the Producer, and may be empty after a reload. Taskio
 * stores document versions (D02), which is a different thing from an
 * operational undo stack.
 */
import { validateComposition, type ValidatedComposition } from '@kadrion/schema';

import { applyCommand, type CommandResult } from './apply.js';
import { isPlainObject, type Command } from './commands.js';
import { EditorError } from './errors.js';
import { parseCommand } from './registry.js';

/** What one committed operation did: the same shape for a dispatch, a transaction, undo, and redo. */
export interface TransactionResult {
  /** The current document after the operation; the same object when nothing changed. */
  readonly document: ValidatedComposition;
  /** The commands applied, parsed, in the order they were applied. */
  readonly commands: readonly Command[];
  /**
   * The commands that undo the operation, in the order undo applies them — the
   * reverse of `commands` — without the commands that changed nothing. Empty
   * when nothing changed (D38.6).
   */
  readonly inverses: readonly Command[];
}

/** One change of the document, delivered to every listener after it is committed (D38.8). */
export interface BusChange {
  readonly kind: 'dispatch' | 'transaction' | 'undo' | 'redo';
  /** The current document after the change. */
  readonly document: ValidatedComposition;
  readonly commands: readonly Command[];
  readonly inverses: readonly Command[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export type BusListener = (change: BusChange) => void;

/**
 * Receives an error a listener threw. It must not throw itself: that violates
 * the host's contract (D38.8); the bus catches it all the same and carries on.
 */
export type ListenerErrorHandler = (error: unknown, change: BusChange) => void;

export interface CommandBusOptions {
  /**
   * How many operations undo can reach, a transaction counting as one. A safe
   * integer from 0; 0 keeps no history. Fixed for the life of the bus (D38.7).
   */
  readonly historyLimit?: number;
  /** Required before `subscribe`: where the errors of listeners go (D38.8). */
  readonly onListenerError?: ListenerErrorHandler;
}

export interface CommandBus {
  /** The current document; every render starts from this one. */
  getDocument(): ValidatedComposition;
  canUndo(): boolean;
  canRedo(): boolean;
  /**
   * Parses, applies, and records one command. The argument is `unknown` on
   * purpose: the AI tool contract of D31 hands its arguments to this same
   * method and cannot acquire a second path into the document (D30.9).
   */
  dispatch(command: unknown): CommandResult;
  /**
   * Parses and applies a non-empty array of commands as one operation: all of
   * them or none, one history entry, one change (D38.4).
   */
  dispatchTransaction(commands: unknown): TransactionResult;
  undo(): TransactionResult;
  redo(): TransactionResult;
  /**
   * Calls `listener` once for every committed change, until the returned
   * function is called. Needs the option `onListenerError` (D38.8).
   */
  subscribe(listener: BusListener): () => void;
}

/** The default of `historyLimit` (D38.7). */
const HISTORY_LIMIT = 100;

const OPTIONS: readonly string[] = Object.freeze(['historyLimit', 'onListenerError']);

interface Settings {
  readonly historyLimit: number;
  readonly onListenerError: ListenerErrorHandler | null;
}

/** Reads every option once, so a getter cannot change a setting later (D38.7). */
function settingsOf(options: unknown): Settings {
  if (options === undefined) return { historyLimit: HISTORY_LIMIT, onListenerError: null };
  if (!isPlainObject(options)) {
    throw new EditorError('invalid-argument', 'The options of the command bus are not an object.');
  }
  const unknown = Object.keys(options).filter((key) => !OPTIONS.includes(key));
  if (unknown.length > 0) {
    throw new EditorError(
      'invalid-argument',
      `The command bus has no option ${unknown.map((key) => `\`${key}\``).join(', ')}.`,
    );
  }
  const historyLimit: unknown = options['historyLimit'];
  const onListenerError: unknown = options['onListenerError'];
  if (
    historyLimit !== undefined &&
    (typeof historyLimit !== 'number' || !Number.isSafeInteger(historyLimit) || historyLimit < 0)
  ) {
    throw new EditorError(
      'invalid-argument',
      `\`historyLimit\` must be a safe integer from 0, not ${typeof historyLimit === 'number' ? String(historyLimit) : typeof historyLimit}.`,
    );
  }
  if (onListenerError !== undefined && typeof onListenerError !== 'function') {
    throw new EditorError('invalid-argument', '`onListenerError` must be a function.');
  }
  return {
    // `-0` passes `Number.isSafeInteger`; it limits exactly as 0 does.
    historyLimit: historyLimit === undefined ? HISTORY_LIMIT : historyLimit,
    onListenerError:
      onListenerError === undefined ? null : (onListenerError as ListenerErrorHandler),
  };
}

/** The same failure, located in a transaction; the code and details stay (D38.4). */
function inTransaction(error: unknown, at: number): unknown {
  if (!(error instanceof EditorError)) return error;
  return new EditorError(
    error.code,
    `Command ${String(at)} of the transaction: ${error.message}`,
    error.details,
  );
}

/** The items of a transaction, read once; an array with a hole is not a list of commands. */
function itemsOf(commands: unknown): readonly unknown[] {
  if (!Array.isArray(commands)) {
    throw new EditorError('invalid-argument', 'A transaction is not an array of commands.');
  }
  const source = commands as readonly unknown[];
  const length = source.length;
  if (length === 0) {
    throw new EditorError('invalid-argument', 'A transaction needs at least one command.');
  }
  const items: unknown[] = [];
  for (let at = 0; at < length; at += 1) {
    if (!Object.prototype.hasOwnProperty.call(source, at)) {
      throw new EditorError(
        'invalid-argument',
        `A transaction has no command at index ${String(at)}.`,
      );
    }
    items.push(source[at]);
  }
  return items;
}

interface Subscription {
  readonly listener: BusListener;
}

/**
 * A bus over one document. Throws `invalid-document` when the document is not a
 * composition, so a bus never exists around an invalid one, and
 * `invalid-argument` when an option is invalid or unknown.
 */
export function createCommandBus(document: unknown, options?: CommandBusOptions): CommandBus {
  const initial = validateComposition(document);
  if (!initial.ok) {
    throw new EditorError(
      'invalid-document',
      'The command bus needs a valid composition to start from.',
      initial.errors.map(({ path, message }) => `${path}: ${message}`),
    );
  }
  const { historyLimit, onListenerError } = settingsOf(options);
  let current = initial.composition;
  // Each entry is the frozen list of commands one undo (or redo) applies.
  const undoable: (readonly Command[])[] = [];
  const redoable: (readonly Command[])[] = [];
  let subscriptions: readonly Subscription[] = [];
  let delivering = false;

  /** Refuses a change while listeners are being told about the previous one (D38.8). */
  function idle(): void {
    if (delivering) {
      throw new EditorError(
        'busy',
        'The bus is delivering a change; a listener cannot change the document.',
      );
    }
  }

  /**
   * Applies parsed commands one by one to a candidate document, each through
   * `applyCommand` and so through the full `validateComposition` (D38.5).
   * Nothing is published here: a failure throws before the caller touches the
   * current document, a stack, or a listener, which keeps rule 6 of D30.9 true
   * for every operation.
   */
  function run(commands: readonly Command[], located: boolean): TransactionResult {
    let candidate = current;
    const inverses: Command[] = [];
    commands.forEach((command, at) => {
      try {
        const result = applyCommand(candidate, command);
        candidate = result.document;
        // Undo applies the inverses last first (D38.6).
        if (result.inverse !== null) inverses.unshift(result.inverse);
      } catch (error) {
        throw located ? inTransaction(error, at) : error;
      }
    });
    return Object.freeze({
      document: candidate,
      commands: Object.freeze([...commands]),
      inverses: Object.freeze(inverses),
    });
  }

  /** Records an entry on a stack, the oldest entries dropped first (D38.7). */
  function record(stack: (readonly Command[])[], entry: readonly Command[]): void {
    if (entry.length === 0) return;
    stack.push(entry);
    if (stack.length > historyLimit) stack.splice(0, stack.length - historyLimit);
  }

  /**
   * Tells every listener subscribed when the change was committed, in the order
   * of subscription. A listener's error goes to `onListenerError`, then the next
   * listener runs; the committed change stays (D38.8).
   */
  function emit(kind: BusChange['kind'], result: TransactionResult): void {
    const snapshot = subscriptions;
    if (snapshot.length === 0) return;
    const change: BusChange = Object.freeze({
      kind,
      document: result.document,
      commands: result.commands,
      inverses: result.inverses,
      canUndo: undoable.length > 0,
      canRedo: redoable.length > 0,
    });
    delivering = true;
    try {
      for (const { listener } of snapshot) {
        try {
          listener(change);
        } catch (error) {
          try {
            onListenerError?.(error, change);
          } catch {
            // A throwing handler breaks the host's contract (D38.8); the change
            // is committed all the same, and the remaining listeners still run.
          }
        }
      }
    } finally {
      delivering = false;
    }
  }

  /** Commits a new operation: history entry, cleared redo branch, one change. */
  function commit(kind: 'dispatch' | 'transaction', result: TransactionResult): void {
    // A no-op changed nothing: no entry, the redo branch stays, no change (D38.9).
    if (result.inverses.length === 0) return;
    current = result.document;
    record(undoable, result.inverses);
    redoable.length = 0;
    emit(kind, result);
  }

  /** Spends the top entry of `from` and records what undoes it on `to`. */
  function step(
    from: (readonly Command[])[],
    to: (readonly Command[])[],
    kind: 'undo' | 'redo',
  ): TransactionResult {
    idle();
    const entry = from[from.length - 1];
    if (entry === undefined) {
      throw new EditorError(
        kind === 'undo' ? 'nothing-to-undo' : 'nothing-to-redo',
        kind === 'undo' ? 'Nothing to undo.' : 'Nothing to redo.',
      );
    }
    const result = run(entry, false);
    // Popped only now: a failure above leaves both stacks as they were (D30.9, D38.7).
    from.pop();
    current = result.document;
    record(to, result.inverses);
    emit(kind, result);
    return result;
  }

  // A frozen facade (D30.13): no caller can replace, add, or delete a method of
  // the bus it shares with others. The closure above stays mutable on purpose.
  return Object.freeze<CommandBus>({
    getDocument: () => current,
    canUndo: () => undoable.length > 0,
    canRedo: () => redoable.length > 0,
    dispatch(command) {
      idle();
      const result = run([parseCommand(command)], false);
      commit('dispatch', result);
      return { document: result.document, inverse: result.inverses[0] ?? null };
    },
    dispatchTransaction(commands) {
      idle();
      const parsed = itemsOf(commands).map((command, at) => {
        try {
          return parseCommand(command);
        } catch (error) {
          throw inTransaction(error, at);
        }
      });
      const result = run(parsed, true);
      commit('transaction', result);
      return result;
    },
    undo: () => step(undoable, redoable, 'undo'),
    redo: () => step(redoable, undoable, 'redo'),
    subscribe(listener) {
      if (typeof listener !== 'function') {
        throw new EditorError('invalid-argument', 'A listener must be a function.');
      }
      if (onListenerError === null) {
        throw new EditorError(
          'invalid-argument',
          'The bus has no `onListenerError`; create it with one before subscribing.',
        );
      }
      const subscription: Subscription = { listener };
      subscriptions = [...subscriptions, subscription];
      // Removing twice is harmless; the same function subscribed twice is two subscriptions.
      return () => {
        subscriptions = subscriptions.filter((other) => other !== subscription);
      };
    },
  });
}

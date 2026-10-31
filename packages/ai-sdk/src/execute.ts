/**
 * Runs one tool call of the catalogue on the host's bus (D46.4). A command
 * tool is one `dispatch` of its command, built by adding the discriminator and
 * nothing else (D31.3); `run_transaction` is one `dispatchTransaction` of the
 * commands its calls name; `describe_document` reads the current document and
 * writes nothing. Failures are the bus's own `EditorError` (D31.6), and a
 * refused call leaves the document and the history as they were.
 */
import {
  describeDocument,
  EditorError,
  type CommandBus,
  type CommandResult,
  type DocumentDescription,
  type TransactionResult,
} from '@kadrion/editor-sdk';

import { commandTypeOf, DESCRIBE_DOCUMENT, RUN_TRANSACTION } from './catalogue.js';

/**
 * The capabilities a tool call may use: the three methods of the host's bus
 * that read the document or edit it through the command path. No undo, no
 * redo, no subscription (D31.5, D46.4).
 */
export type ToolBus = Pick<CommandBus, 'getDocument' | 'dispatch' | 'dispatchTransaction'>;

/** What a tool call did; frozen. */
export type ToolResult =
  | { readonly kind: 'command'; readonly result: CommandResult }
  | { readonly kind: 'transaction'; readonly result: TransactionResult }
  | { readonly kind: 'description'; readonly description: DocumentDescription };

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True when `value` has exactly `keys` as its own enumerable keys. */
function hasExactly(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/**
 * The command a command tool's arguments ask for (D31.3). Anything that is not
 * an object goes to the bus unchanged, whose parser refuses it; an own `type`
 * is refused here, because the schema forbids it and either spread order
 * would disagree with the schema. The spread reads each field once.
 */
export function commandOf(name: string, type: string, args: unknown): unknown {
  if (!isObject(args)) return args;
  if (Object.hasOwn(args, 'type')) {
    throw new EditorError(
      'invalid-argument',
      `The arguments of \`${name}\` have no \`type\`; the tool supplies it.`,
    );
  }
  return { type, ...args };
}

function refused(message: string): EditorError {
  return new EditorError('invalid-argument', message);
}

/** The commands of a `run_transaction` call, in order, built as each command tool builds its own. */
function transactionOf(args: unknown): readonly unknown[] {
  if (!isObject(args) || !hasExactly(args, ['calls'])) {
    throw refused(`The arguments of \`${RUN_TRANSACTION}\` are an object with \`calls\` alone.`);
  }
  const calls = args['calls'];
  if (!Array.isArray(calls) || calls.length === 0) {
    throw refused(`\`calls\` of \`${RUN_TRANSACTION}\` is a non-empty array.`);
  }
  const items: readonly unknown[] = calls;
  return items.map((call, at) => {
    const where = `Call ${String(at)} of \`${RUN_TRANSACTION}\``;
    if (!isObject(call) || !hasExactly(call, ['name', 'arguments'])) {
      throw refused(`${where} is not an object with \`name\` and \`arguments\` alone.`);
    }
    const name = call['name'];
    const type = typeof name === 'string' ? commandTypeOf(name) : null;
    if (typeof name !== 'string' || type === null) {
      throw refused(`${where} names no edit tool of the catalogue.`);
    }
    const callArgs = call['arguments'];
    if (!isObject(callArgs)) throw refused(`${where} has arguments that are not an object.`);
    return commandOf(name, type, callArgs);
  });
}

/**
 * Runs the tool `name` with `args` on the host's bus (D46.4): a command tool is
 * exactly one `dispatch`, `run_transaction` exactly one `dispatchTransaction`,
 * and `describe_document` one `getDocument`. An unknown name is refused with
 * `unknown-command`; arguments the tool's schema refuses with
 * `invalid-argument`, as the bus refuses them.
 */
export function executeTool(bus: ToolBus, name: unknown, args: unknown): ToolResult {
  if (typeof name !== 'string') {
    throw new EditorError('invalid-argument', 'A tool name is a string.');
  }
  if (name === DESCRIBE_DOCUMENT) {
    if (!isObject(args) || !hasExactly(args, [])) {
      throw refused(`\`${DESCRIBE_DOCUMENT}\` takes an empty object as its arguments.`);
    }
    return Object.freeze({
      kind: 'description',
      description: describeDocument(bus.getDocument()),
    });
  }
  if (name === RUN_TRANSACTION) {
    return Object.freeze({
      kind: 'transaction',
      result: bus.dispatchTransaction(transactionOf(args)),
    });
  }
  const type = commandTypeOf(name);
  if (type === null) {
    throw new EditorError('unknown-command', `The catalogue has no tool \`${name}\`.`);
  }
  return Object.freeze({ kind: 'command', result: bus.dispatch(commandOf(name, type, args)) });
}

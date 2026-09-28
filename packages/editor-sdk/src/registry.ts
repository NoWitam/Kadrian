/**
 * The closed registry of the commands this build knows (D38.1). One entry per
 * member of `Command`, typed so that a member without an entry, or an entry
 * without a member, fails compilation. The table is deep-frozen at module
 * scope and not exported: no caller can add, replace, or remove a command, and
 * there is no way to load one from outside the package.
 *
 * Each entry reads the fields of its command (`parse`) and edits one node
 * (`edit`); `applyCommand` does the rest of D30.4 for every command alike —
 * finding the node, rebuilding the document, and validating it in full.
 */
import {
  deepFreeze,
  isPlainObject,
  parseSetNodeOpacity,
  parseSetNodePosition,
  parseSetTextContent,
  type Command,
  type CommandPosition,
} from './commands.js';
import { isObject, type DocumentObject } from './document.js';
import { EditorError } from './errors.js';

/** A node with the command applied, and the command that restores the previous value. */
export interface NodeEdit<C extends Command> {
  readonly node: DocumentObject;
  readonly inverse: C;
}

/** How one command type reads its fields and edits one node. */
export interface CommandDefinition<C extends Command> {
  readonly parse: (value: unknown) => C;
  /**
   * The edited node, or `null` when the node already holds the value (D30.9,
   * rule 7). Throws `unsupported-node` when the node lacks the edited field;
   * whether it has it is read from the node, not from a list of types (D30.8).
   */
  readonly edit: (node: DocumentObject, command: C) => NodeEdit<C> | null;
}

type Definitions = {
  readonly [T in Command['type']]: CommandDefinition<Extract<Command, { type: T }>>;
};

/** One coordinate of a node of a validated document, which the schema guarantees is an integer. */
function coordinate(position: DocumentObject, axis: 'x' | 'y', nodeId: string): number {
  const value: unknown = position[axis];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new EditorError(
      'unsupported-node',
      `The node \`${nodeId}\` has no numeric position.${axis}.`,
    );
  }
  return value;
}

// The type argument makes the literal itself a `Definitions`: a missing entry and
// an entry for a type outside the union both fail compilation.
const DEFINITIONS = deepFreeze<Definitions>({
  SetNodePosition: {
    parse: parseSetNodePosition,
    edit(node, command) {
      const position = node['position'];
      if (!isObject(position)) {
        throw new EditorError(
          'unsupported-node',
          `The node \`${command.nodeId}\` has no position; it cannot be moved.`,
        );
      }
      const previous: CommandPosition = {
        x: coordinate(position, 'x', command.nodeId),
        y: coordinate(position, 'y', command.nodeId),
      };
      if (previous.x === command.position.x && previous.y === command.position.y) return null;
      return {
        // Spreading the originals keeps every existing field in its place (D30.7).
        node: {
          ...node,
          position: { ...position, x: command.position.x, y: command.position.y },
        },
        inverse: parseSetNodePosition({ ...command, position: previous }),
      };
    },
  },
  SetNodeOpacity: {
    parse: parseSetNodeOpacity,
    edit(node, command) {
      const opacity: unknown = node['opacity'];
      if (typeof opacity !== 'number' || !Number.isFinite(opacity)) {
        throw new EditorError(
          'unsupported-node',
          `The node \`${command.nodeId}\` has no opacity; it cannot be faded.`,
        );
      }
      if (opacity === command.opacity) return null;
      return {
        node: { ...node, opacity: command.opacity },
        inverse: parseSetNodeOpacity({ ...command, opacity }),
      };
    },
  },
  SetTextContent: {
    parse: parseSetTextContent,
    edit(node, command) {
      const text: unknown = node['text'];
      if (typeof text !== 'string') {
        throw new EditorError(
          'unsupported-node',
          `The node \`${command.nodeId}\` is not a text node; it has no text to replace.`,
        );
      }
      if (text === command.text) return null;
      return {
        node: { ...node, text: command.text },
        inverse: parseSetTextContent({ ...command, text }),
      };
    },
  },
});

/**
 * Every command type this build knows: the keys of the registry, in the order
 * its entries are written, so the list cannot omit or add a type the table does
 * not have (D38.1). The keys are the members of `Command['type']` exactly, which
 * the type of the table guarantees, hence the assertion. The list is frozen: a
 * caller that pushed a name onto it would make `parseCommand` accept a type the
 * build does not know (D31.8).
 */
export const COMMAND_TYPES: readonly Command['type'][] = Object.freeze(
  Object.keys(DEFINITIONS) as Command['type'][],
);

function isKnown(type: string): type is Command['type'] {
  return COMMAND_TYPES.some((known) => known === type);
}

/** The entry of one command, typed by that command (the table's type pairs them). */
function definitionOf<C extends Command>(command: C): CommandDefinition<C> {
  return DEFINITIONS[command.type] as unknown as CommandDefinition<C>;
}

/**
 * The single entry into a typed command (D30.3). Rejects a payload that is not
 * an object, a type it does not know, and fields that are not exactly those of
 * that command; normalises what the command normalises and freezes the result,
 * so a caller that keeps the object cannot reach into the history afterwards.
 * Parsing an already-parsed command returns an equal command.
 */
export function parseCommand(value: unknown): Command {
  if (!isPlainObject(value)) {
    throw new EditorError('invalid-argument', 'A command is not an object.');
  }
  const type: unknown = value['type'];
  if (typeof type !== 'string') {
    throw new EditorError('invalid-argument', 'A command has no string `type`.');
  }
  if (!isKnown(type)) {
    throw new EditorError('unknown-command', `This build knows no command \`${type}\`.`);
  }
  return DEFINITIONS[type].parse(value);
}

/** Applies a parsed command to one node through its entry. */
export function editNode<C extends Command>(node: DocumentObject, command: C): NodeEdit<C> | null {
  return definitionOf(command).edit(node, command);
}

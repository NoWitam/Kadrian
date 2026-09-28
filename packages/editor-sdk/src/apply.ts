/**
 * Applying one command to one document (D30.4). The function is pure with
 * respect to the document (§9): it never mutates its input, and the same
 * document and command always give the same result.
 */
import { validateComposition, type ValidatedComposition } from '@kadrion/schema';

import type { Command } from './commands.js';
import { findNode, replaceNode } from './document.js';
import { EditorError } from './errors.js';
import { editNode, parseCommand } from './registry.js';

export interface CommandResult {
  /** The edited document, accepted by the full `validateComposition` (D30.6). */
  readonly document: ValidatedComposition;
  /** The command that undoes this one, or `null` when nothing changed (D30.5, D30.9). */
  readonly inverse: Command | null;
}

/**
 * Applies a command in the order D30.4 fixes: parse, find, read the previous
 * value from the input document, rebuild immutably, validate the result in
 * full, and only then return. Any failure throws an `EditorError` and leaves
 * the input document exactly as it was. What differs between command types —
 * which field is read and written — comes from the closed registry (D38.1);
 * the order is the same for every one of them.
 *
 * The argument is typed, but it is parsed all the same: the type is structural,
 * so a caller can write a literal, and parsing at every entry point is what
 * guarantees that the UI and the AI tool of D31 normalise their values
 * identically (D30.3).
 */
export function applyCommand(document: ValidatedComposition, command: Command): CommandResult {
  const parsed = parseCommand(command);
  const node = findNode(document, parsed.nodeId);
  if (node === null) {
    throw new EditorError('unknown-node', `The document has no node \`${parsed.nodeId}\`.`);
  }
  const edit = editNode(node, parsed);
  // A command that changes no value leaves the document and writes no history (D30.9).
  if (edit === null) return { document, inverse: null };
  const edited = replaceNode(document, parsed.nodeId, edit.node);
  const result = validateComposition(edited);
  if (!result.ok) {
    throw new EditorError(
      'invalid-result',
      `The command \`${parsed.type}\` would produce a document the schema rejects.`,
      result.errors.map(({ path, message }) => `${path}: ${message}`),
    );
  }
  return { document: result.composition, inverse: edit.inverse };
}

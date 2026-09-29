/**
 * Applying one command to one document (D30.4). The function is pure with
 * respect to the document (§9): it never mutates its input, and the same
 * document and command always give the same result.
 */
import { validateComposition, type ValidatedComposition } from '@kadrion/schema';

import type { Command } from './commands.js';
import { fieldsOf } from './document.js';
import { EditorError } from './errors.js';
import { editDocument, parseCommand } from './registry.js';

export interface CommandResult {
  /** The edited document, accepted by the full `validateComposition` (D30.6). */
  readonly document: ValidatedComposition;
  /** The command that undoes this one, or `null` when nothing changed (D30.5, D30.9). */
  readonly inverse: Command | null;
  /**
   * The IDs the command created, in the order of D39.4: the node IDs in
   * preorder, then the animation IDs grouped by owner. Always present, and
   * empty for a command that creates nothing.
   */
  readonly createdIds: readonly string[];
}

/** A result with what the bus needs besides: the IDs the command removed (D39.4). */
export interface Execution extends CommandResult {
  readonly removedIds: readonly string[];
}

/**
 * Applies a command in the order D30.4 fixes: parse, edit the document through
 * the command's entry (D39.9), validate the result in full, and only then
 * return it with the inverse read from the concrete document. Any failure throws
 * an `EditorError` and leaves the input document exactly as it was; a candidate
 * and an inverse prepared for it are discarded (D39.5).
 */
export function executeCommand(document: ValidatedComposition, command: Command): Execution {
  const parsed = parseCommand(command);
  const edit = editDocument(fieldsOf(document), parsed);
  // A command that changes no value leaves the document and writes no history (D30.9).
  if (edit === null) {
    return { document, inverse: null, createdIds: Object.freeze([]), removedIds: [] };
  }
  const result = validateComposition(edit.document);
  if (!result.ok) {
    throw new EditorError(
      'invalid-result',
      `The command \`${parsed.type}\` would produce a document the schema rejects.`,
      result.errors.map(({ path, message }) => `${path}: ${message}`),
    );
  }
  return {
    document: result.composition,
    inverse: edit.invert(),
    createdIds: Object.freeze([...edit.createdIds]),
    removedIds: edit.removedIds,
  };
}

/**
 * Applies one command to one document and returns the frozen result (D39.9).
 *
 * The argument is typed, but it is parsed all the same: the type is structural,
 * so a caller can write a literal, and parsing at every entry point is what
 * guarantees that the UI and the AI tool of D31 normalise their values
 * identically (D30.3).
 */
export function applyCommand(document: ValidatedComposition, command: Command): CommandResult {
  const { inverse, createdIds, document: edited } = executeCommand(document, command);
  return Object.freeze({ document: edited, inverse, createdIds });
}

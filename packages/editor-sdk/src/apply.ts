/**
 * Applying one command to one document (D30.4). The function is pure with
 * respect to the document (§9): it never mutates its input, and the same
 * document and command always give the same result.
 */
import {
  validateComposition,
  type ValidationError,
  type ValidatedComposition,
} from '@kadrion/schema';

import type { Command } from './commands.js';
import { fieldsOf, isObject, transitionAt } from './document.js';
import { EditorError } from './errors.js';
import { checkSourceRanges, type MediaFactsLookup } from './media.js';
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
export function executeCommand(
  document: ValidatedComposition,
  command: Command,
  mediaFacts: MediaFactsLookup | null = null,
): Execution {
  const parsed = parseCommand(command);
  const edit = editDocument(fieldsOf(document), parsed);
  // A command that changes no value leaves the document and writes no history (D30.9).
  if (edit === null) {
    return { document, inverse: null, createdIds: Object.freeze([]), removedIds: [] };
  }
  const result = validateComposition(edit.document);
  if (!result.ok) {
    // An entry may know what the errors mean for its command, such as the uses of
    // a removed asset (D40.4); a command that breaks a transition it does not edit
    // is told which (D56.7); every other failure is `invalid-result`.
    throw (
      edit.refine?.(result.errors) ??
      transitionsInUse(parsed, edit.document, result.errors) ??
      new EditorError(
        'invalid-result',
        `The command \`${parsed.type}\` would produce a document the schema rejects.`,
        result.errors.map(({ path, message }) => `${path}: ${message}`),
      )
    );
  }
  // The sampled source ranges the command changed, against the host's media facts (D49.6).
  checkSourceRanges(document, result.composition, mediaFacts);
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
export interface ApplyOptions {
  /**
   * The media facts the host read from verified bytes, by content hash (D49.6).
   * Without them, a command that sets the sampled source range of a video node
   * is refused with `media-facts-missing`.
   */
  readonly mediaFacts?: MediaFactsLookup;
}

export function applyCommand(
  document: ValidatedComposition,
  command: Command,
  options: ApplyOptions = {},
): CommandResult {
  const {
    inverse,
    createdIds,
    document: edited,
  } = executeCommand(document, command, options.mediaFacts ?? null);
  return Object.freeze({ document: edited, inverse, createdIds });
}

/** The commands that edit transitions themselves: their failures are theirs to report (D56.6). */
const TRANSITION_COMMANDS: readonly Command['type'][] = Object.freeze([
  'AddSceneTransition',
  'AddClipTransition',
  'RemoveTransition',
  'SetTransitionDuration',
  'SetTransitionEffect',
]);

/** The validation codes that judge a transition against its sides (D56.3). */
const TRANSITION_CODES: readonly string[] = Object.freeze([
  'unresolved-scene-reference',
  'unresolved-node-reference',
  'transition-not-adjacent',
  'transition-not-siblings',
  'transition-node-type',
  'transition-overlap-mismatch',
  'transition-too-long',
  'duplicate-transition',
]);

/**
 * `transition-in-use` when a command other than a transition's own would
 * leave a transition that no longer fits its sides (D56.7), with the IDs of
 * those transitions, sorted; `null` otherwise. Nothing is removed in passing:
 * the host removes the transition first, in the same transaction.
 */
function transitionsInUse(
  command: Command,
  candidate: object,
  errors: readonly ValidationError[],
): EditorError | null {
  if (TRANSITION_COMMANDS.includes(command.type)) return null;
  const ids = new Set<string>();
  for (const error of errors) {
    if (!TRANSITION_CODES.includes(error.code)) continue;
    const transition = transitionAt(candidate, error.path);
    if (isObject(transition) && typeof transition['id'] === 'string') ids.add(transition['id']);
  }
  if (ids.size === 0) return null;
  return new EditorError(
    'transition-in-use',
    `The command \`${command.type}\` would break a transition; remove the transition first, in the same transaction (D56.7).`,
    [...ids].sort(),
  );
}

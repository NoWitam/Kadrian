/**
 * The saved form of a composition (D43): the composition itself as JSON text,
 * without an envelope. This module reads and writes that text with the plain
 * semantics of JSON — `JSON.parse` and `JSON.stringify`, nothing of its own —
 * and leaves every judgement of the document to the validator and to the
 * migration it is handed.
 *
 * It is reachable from the migration entry only, so neither the runtime
 * artifact nor the Player carries it (D42.8).
 */
import type { ValidationError } from '../errors.js';
import type { ValidatedComposition } from '../types.js';
import { validateComposition } from '../validate.js';
import type { MigrationOutcome } from './run.js';

/** Why a text is no JSON text at all. A document was never reached. */
export interface CompositionTextError {
  /**
   * `not-a-string`: the argument is no string. `invalid-json`: `JSON.parse`
   * refuses the text — a byte order mark, a truncated text, a comment.
   */
  readonly code: 'not-a-string' | 'invalid-json';
  /** A fixed text of Kadrion: the engine's own message differs between runtimes. */
  readonly message: string;
}

/** What parsing a saved text comes to, for a table of versions. */
export type ParseOutcome<Version extends string> =
  | {
      readonly ok: true;
      readonly composition: ValidatedComposition;
      readonly versions: readonly Version[];
    }
  | { readonly ok: false; readonly stage: 'text'; readonly error: CompositionTextError }
  | {
      readonly ok: false;
      readonly stage: 'document';
      readonly version: Version | null;
      readonly versions: readonly Version[];
      readonly errors: readonly ValidationError[];
    };

/** What `serializeComposition` returns (D43.3). */
export type SerializeCompositionResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

const MESSAGES: Readonly<Record<CompositionTextError['code'], string>> = Object.freeze({
  'not-a-string': 'The saved composition is not a string.',
  'invalid-json': 'The saved composition is not JSON text.',
});

function textFailure<Version extends string>(
  code: CompositionTextError['code'],
): ParseOutcome<Version> {
  return Object.freeze({
    ok: false,
    stage: 'text',
    error: Object.freeze({ code, message: MESSAGES[code] }),
  });
}

/**
 * `text`, read as JSON and handed to `migrate`, whose verdict is carried as it
 * is: the same composition and versions on success, the same version, versions,
 * and errors on failure, under `stage: 'document'`.
 *
 * Only what `JSON.parse` itself throws becomes `invalid-json`. `migrate` runs
 * outside that `try`, so nothing it reports, and nothing it might throw, is
 * ever relabelled as a fault of the text.
 *
 * JSON's own rules decide the rest: a byte order mark is no JSON, and of two
 * equal keys of an object the last one wins.
 */
export function parseThrough<Version extends string>(
  migrate: (input: unknown) => MigrationOutcome<Version>,
  text: unknown,
): ParseOutcome<Version> {
  if (typeof text !== 'string') return textFailure('not-a-string');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return textFailure('invalid-json');
  }
  const outcome = migrate(data);
  // A success is returned as the migration made it: the same object, with its
  // composition and its versions. `migrateComposition` freezes that result.
  if (outcome.ok) return outcome;
  return Object.freeze({
    ok: false,
    stage: 'document',
    version: outcome.version,
    versions: outcome.versions,
    errors: outcome.errors,
  });
}

/**
 * The saved text of a composition of the current version: `JSON.stringify` of
 * the document, compact, without a trailing newline, the keys in the order the
 * document has them. A `-0` is written as `0`, as JSON writes it.
 *
 * It validates first and never migrates: a document of an earlier version is
 * refused with the validator's `unsupported-schema-version`, like any document
 * the validator refuses. It neither writes nor freezes the document.
 */
export function serializeComposition(document: unknown): SerializeCompositionResult {
  const result = validateComposition(document);
  if (!result.ok) return Object.freeze({ ok: false, errors: Object.freeze([...result.errors]) });
  return Object.freeze({ ok: true, text: JSON.stringify(result.composition) });
}

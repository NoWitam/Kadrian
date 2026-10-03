/**
 * Carries a document forward through a table of versions (D35.3, D42.8). The
 * table is data, so that a test can hand `migrateThrough` another one — for
 * example a step that produces an invalid document — while `migrateComposition`
 * hands it the versions of this build.
 */
import type { ValidationError, ValidationResult } from '../errors.js';
import type { ValidatedComposition } from '../types.js';
import { detached } from './detached.js';

/** One version a document can be in, oldest first in a table. */
export interface VersionEntry<Version extends string> {
  readonly version: Version;
  /**
   * The errors of a document under this version's own validation; none when it
   * is valid. It judges an input that names this version, and the output of the
   * step that reaches this version before another step reads it.
   */
  readonly errors: (input: unknown) => readonly ValidationError[];
  /** The step to the next version of the table. The last entry, the current version, has none. */
  readonly next?: (document: unknown) => unknown;
}

export type MigrationOutcome<Version extends string> =
  | {
      readonly ok: true;
      readonly composition: ValidatedComposition;
      readonly versions: readonly Version[];
    }
  | {
      readonly ok: false;
      readonly version: Version | null;
      readonly versions: readonly Version[];
      readonly errors: readonly ValidationError[];
    };

function failure<Version extends string>(
  versions: readonly Version[],
  errors: readonly ValidationError[],
): MigrationOutcome<Version> {
  return Object.freeze({
    ok: false,
    version: versions.at(-1) ?? null,
    versions: Object.freeze([...versions]),
    errors: Object.freeze([...errors]),
  });
}

/** The version a document names: an own `schemaVersion` that is a string, or nothing. */
function namedVersion(input: unknown): string | null {
  if (typeof input !== 'object' || input === null || !Object.hasOwn(input, 'schemaVersion')) {
    return null;
  }
  const { schemaVersion } = input as { readonly schemaVersion: unknown };
  return typeof schemaVersion === 'string' ? schemaVersion : null;
}

/**
 * `input`, validated under its own version, carried through every later step of
 * `table`, and validated in full under the current version by `validateCurrent`
 * — always, also when no step ran. The output of a step is validated as a
 * document of the version it reaches before another step reads it (D35.2). The
 * composition it returns is a new tree that shares no object with `input`.
 *
 * The table is trusted, not checked: it is private to this package, written
 * oldest first, and every entry but the last has a `next` while the last has
 * none. An entry in the middle without a step, or a last entry with one, is a
 * mistake of this package that its tests are to catch, not an input.
 *
 * It never writes `input`. For passive data — the input boundary of
 * `validateComposition`: plain objects, arrays, and primitives, read through
 * data properties — every outcome, a malformed document included, is a result
 * and nothing throws. An accessor or a Proxy that throws, or that answers
 * differently each time it is read, is outside that guarantee (D42.8).
 */
export function migrateThrough<Version extends string>(
  table: readonly VersionEntry<Version>[],
  validateCurrent: (document: unknown) => ValidationResult,
  input: unknown,
): MigrationOutcome<Version> {
  const named = namedVersion(input);
  // A search through the table, never a lookup in an object: "constructor" and
  // "__proto__" are versions nobody knows, like any other string.
  const start = table.findIndex(({ version }) => version === named);
  const entry = table[start];
  if (entry === undefined) {
    const known = table.map(({ version }) => `"${version}"`).join(', ');
    const actual = named === null ? 'no schemaVersion that is a string' : `"${named}"`;
    return failure<Version>(
      [],
      [
        {
          code: 'unsupported-schema-version',
          path: '/schemaVersion',
          message: `The document has ${actual}; this build can carry forward ${known}.`,
        },
      ],
    );
  }
  const inputErrors = entry.errors(input);
  if (inputErrors.length > 0) return failure([entry.version], inputErrors);

  const versions = [entry.version];
  let document = input;
  for (const [index, { next }] of table.entries()) {
    if (index < start || next === undefined) continue;
    document = next(document);
    const reached = table[index + 1];
    if (reached === undefined) continue;
    versions.push(reached.version);
    // A step accepts only a valid document of its own version (D35.2), so the
    // output of this one is validated before the next step reads it. The last
    // version has no step: `validateCurrent` judges it below, in full.
    if (reached.next === undefined) continue;
    const errors = reached.errors(document);
    if (errors.length > 0) return failure(versions, errors);
  }
  // A document that was current already took no step: it is detached here, so
  // that the result is the caller's own tree on both paths (D42.8).
  const result = validateCurrent(versions.length === 1 ? detached(document) : document);
  if (!result.ok) return failure(versions, result.errors);
  return Object.freeze({
    ok: true,
    composition: result.composition,
    versions: Object.freeze(versions),
  });
}

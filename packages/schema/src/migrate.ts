/**
 * @kadrion/schema/migrate — the explicit, forward-only migration of composition
 * documents (D35, D42.7, D42.8).
 *
 * It is an entry point of its own on purpose: the historical schemas and the
 * steps are imported here and nowhere in the main entry, so the render page,
 * which imports `@kadrion/schema`, carries none of them, and a change of a
 * migration does not change the runtime artifact (D21).
 *
 * `validateComposition` never migrates. A host that holds a document of an
 * earlier version calls `migrateComposition` and stores the result as a new
 * version (D02, D35.3).
 */
import type { ValidationError } from './errors.js';
import { migrateThrough, type MigrationOutcome, type VersionEntry } from './migration/run.js';
import { step01To02 } from './migration/step-0-1-to-0-2.js';
import {
  compositionSchemaV01,
  SCHEMA_VERSION_V01,
  type CompositionV01,
} from './v0-1/composition-schema.js';
import { validateSemantics } from './validate-semantics.js';
import { validateStructure } from './validate-structure.js';
import { validateComposition } from './validate.js';

/** The versions this build can carry forward, oldest first; the last is the current one. */
export type SchemaVersion = '0.1' | '0.2';

/** What `migrateComposition` returns (D42.8). */
export type MigrationResult = MigrationOutcome<SchemaVersion>;

/**
 * The validation a document of 0.1 had (D35.4): its frozen schema, then the
 * semantic rules. The gate has run already: the caller chose this version by
 * the document's own `schemaVersion`. It yields errors and never a branded
 * document: only the current version carries the brand (D42.8).
 */
function errorsOfV01(input: unknown): readonly ValidationError[] {
  const structural = validateStructure(compositionSchemaV01, input);
  if (structural.length > 0) return structural;
  // The structural phase has just checked every field of `CompositionV01`,
  // which is derived from the same frozen schema.
  return validateSemantics(input as CompositionV01);
}

function errorsOfCurrent(input: unknown): readonly ValidationError[] {
  const result = validateComposition(input);
  return result.ok ? [] : result.errors;
}

const VERSIONS: readonly VersionEntry<SchemaVersion>[] = Object.freeze([
  Object.freeze({
    version: SCHEMA_VERSION_V01,
    errors: errorsOfV01,
    // `migrateThrough` calls a step only with a document its entry found valid.
    next: (document: unknown) => step01To02(document as CompositionV01),
  }),
  Object.freeze({ version: '0.2', errors: errorsOfCurrent }),
]);

/**
 * Carries a document forward to the current schema version (D35.3, D42.8):
 *
 * 1. the input is validated under its own version;
 * 2. every later step is applied in order, and the output of a step is
 *    validated under the version it reaches before another step reads it — with
 *    the two versions of today there is no such intermediate version;
 * 3. the result is validated in full under the current version, always;
 * 4. `versions` reports the versions it went through: `['0.1', '0.2']` for a
 *    migration, `['0.2']` for a document that was current already.
 *
 * A document without an own `schemaVersion` that is a known string gets one
 * `unsupported-schema-version` error, `version: null`, and `versions: []`.
 *
 * It never writes or freezes its input. The composition it returns is a new
 * tree that shares no object with the input, is not frozen, and belongs to the
 * caller; the result object and its arrays are frozen.
 *
 * For passive data — plain objects, arrays, and primitives read through data
 * properties, the input boundary of `validateComposition` — it never throws: a
 * malformed document is a failure result. Accessors and Proxies that throw or
 * change their answers are outside that guarantee.
 */
export function migrateComposition(input: unknown): MigrationResult {
  return migrateThrough(VERSIONS, validateComposition, input);
}

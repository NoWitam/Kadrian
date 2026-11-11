/**
 * @kadrion/schema/migrate — the explicit, forward-only migration of composition
 * documents (D35, D42.7, D42.8), and the saved text of a composition (D43):
 * `parseComposition` and `serializeComposition`, which a host calls itself.
 *
 * It is an entry point of its own on purpose: the historical schemas and the
 * steps are imported here and nowhere in the main entry, so the render page,
 * which imports `@kadrion/schema`, carries none of them, and a change of a
 * migration does not change the runtime artifact (D21).
 *
 * `validateComposition` never migrates. A host that holds a document of an
 * earlier version calls `migrateComposition`, or `parseComposition` for a saved
 * text, and stores the result as a new version (D02, D35.3). Neither makes the
 * Player, the Producer, the runtime, or the command bus accept an earlier
 * version: they still validate the current one only (D42.9).
 */
import type { ValidationError } from './errors.js';
import { migrateThrough, type MigrationOutcome, type VersionEntry } from './migration/run.js';
import { step01To02 } from './migration/step-0-1-to-0-2.js';
import { step02To03 } from './migration/step-0-2-to-0-3.js';
import { step03To04 } from './migration/step-0-3-to-0-4.js';
import { step04To05 } from './migration/step-0-4-to-0-5.js';
import { step05To06 } from './migration/step-0-5-to-0-6.js';
import { step06To07 } from './migration/step-0-6-to-0-7.js';
import { step07To08 } from './migration/step-0-7-to-0-8.js';
import { step08To09 } from './migration/step-0-8-to-0-9.js';
import { step09To10 } from './migration/step-0-9-to-0-10.js';
import { step010To011 } from './migration/step-0-10-to-0-11.js';
import { step011To012 } from './migration/step-0-11-to-0-12.js';
import { step012To013 } from './migration/step-0-12-to-0-13.js';
import { step013To014 } from './migration/step-0-13-to-0-14.js';
import { step014To015 } from './migration/step-0-14-to-0-15.js';
import { step015To016 } from './migration/step-0-15-to-0-16.js';
import { step016To017 } from './migration/step-0-16-to-0-17.js';
import { step017To018 } from './migration/step-0-17-to-0-18.js';
import { step018To019 } from './migration/step-0-18-to-0-19.js';
import { step019To020 } from './migration/step-0-19-to-0-20.js';
import { step020To021 } from './migration/step-0-20-to-0-21.js';
import { step021To022 } from './migration/step-0-21-to-0-22.js';
import { step022To023 } from './migration/step-0-22-to-0-23.js';
import { step023To024 } from './migration/step-0-23-to-0-24.js';
import { step024To025 } from './migration/step-0-24-to-0-25.js';
import { parseThrough, type ParseOutcome } from './migration/text.js';
import {
  compositionSchemaV01,
  SCHEMA_VERSION_V01,
  type CompositionV01,
} from './v0-1/composition-schema.js';
import {
  compositionSchemaV02,
  SCHEMA_VERSION_V02,
  type CompositionV02,
} from './v0-2/composition-schema.js';
import {
  compositionSchemaV03,
  SCHEMA_VERSION_V03,
  type CompositionV03,
} from './v0-3/composition-schema.js';
import {
  compositionSchemaV04,
  SCHEMA_VERSION_V04,
  type CompositionV04,
} from './v0-4/composition-schema.js';
import {
  compositionSchemaV05,
  SCHEMA_VERSION_V05,
  type CompositionV05,
} from './v0-5/composition-schema.js';
import {
  compositionSchemaV06,
  SCHEMA_VERSION_V06,
  type CompositionV06,
} from './v0-6/composition-schema.js';
import {
  compositionSchemaV07,
  SCHEMA_VERSION_V07,
  type CompositionV07,
} from './v0-7/composition-schema.js';
import {
  compositionSchemaV08,
  SCHEMA_VERSION_V08,
  type CompositionV08,
} from './v0-8/composition-schema.js';
import {
  compositionSchemaV09,
  SCHEMA_VERSION_V09,
  type CompositionV09,
} from './v0-9/composition-schema.js';
import {
  compositionSchemaV010,
  SCHEMA_VERSION_V010,
  type CompositionV010,
} from './v0-10/composition-schema.js';
import {
  compositionSchemaV011,
  SCHEMA_VERSION_V011,
  type CompositionV011,
} from './v0-11/composition-schema.js';
import {
  compositionSchemaV012,
  SCHEMA_VERSION_V012,
  type CompositionV012,
} from './v0-12/composition-schema.js';
import {
  compositionSchemaV013,
  SCHEMA_VERSION_V013,
  type CompositionV013,
} from './v0-13/composition-schema.js';
import {
  compositionSchemaV014,
  SCHEMA_VERSION_V014,
  type CompositionV014,
} from './v0-14/composition-schema.js';
import {
  compositionSchemaV015,
  SCHEMA_VERSION_V015,
  type CompositionV015,
} from './v0-15/composition-schema.js';
import {
  compositionSchemaV016,
  SCHEMA_VERSION_V016,
  type CompositionV016,
} from './v0-16/composition-schema.js';
import {
  compositionSchemaV017,
  SCHEMA_VERSION_V017,
  type CompositionV017,
} from './v0-17/composition-schema.js';
import {
  compositionSchemaV018,
  SCHEMA_VERSION_V018,
  type CompositionV018,
} from './v0-18/composition-schema.js';
import {
  compositionSchemaV019,
  SCHEMA_VERSION_V019,
  type CompositionV019,
} from './v0-19/composition-schema.js';
import {
  compositionSchemaV020,
  SCHEMA_VERSION_V020,
  type CompositionV020,
} from './v0-20/composition-schema.js';
import {
  compositionSchemaV021,
  SCHEMA_VERSION_V021,
  type CompositionV021,
} from './v0-21/composition-schema.js';
import {
  compositionSchemaV022,
  SCHEMA_VERSION_V022,
  type CompositionV022,
} from './v0-22/composition-schema.js';
import {
  compositionSchemaV023,
  SCHEMA_VERSION_V023,
  type CompositionV023,
} from './v0-23/composition-schema.js';
import {
  compositionSchemaV024,
  SCHEMA_VERSION_V024,
  type CompositionV024,
} from './v0-24/composition-schema.js';
import { validateSemantics } from './validate-semantics.js';
import { validateStructure } from './validate-structure.js';
import { validateComposition } from './validate.js';

/** The versions this build can carry forward, oldest first; the last is the current one. */
export type SchemaVersion =
  | '0.1'
  | '0.2'
  | '0.3'
  | '0.4'
  | '0.5'
  | '0.6'
  | '0.7'
  | '0.8'
  | '0.9'
  | '0.10'
  | '0.11'
  | '0.12'
  | '0.13'
  | '0.14'
  | '0.15'
  | '0.16'
  | '0.17'
  | '0.18'
  | '0.19'
  | '0.20'
  | '0.21'
  | '0.22'
  | '0.23'
  | '0.24'
  | '0.25';

/** What `migrateComposition` returns (D42.8). */
export type MigrationResult = MigrationOutcome<SchemaVersion>;

/** What `parseComposition` returns (D43.4). */
export type ParseCompositionResult = ParseOutcome<SchemaVersion>;

export { serializeComposition } from './migration/text.js';
export type { CompositionTextError, SerializeCompositionResult } from './migration/text.js';

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

/** The validation a document of 0.2 had (D35.4, D50.7), as for 0.1. */
function errorsOfV02(input: unknown): readonly ValidationError[] {
  const structural = validateStructure(compositionSchemaV02, input);
  if (structural.length > 0) return structural;
  return validateSemantics(input as CompositionV02);
}

/** The validation a document of 0.3 had (D35.4, D52), as for 0.1. */
function errorsOfV03(input: unknown): readonly ValidationError[] {
  const structural = validateStructure(compositionSchemaV03, input);
  if (structural.length > 0) return structural;
  return validateSemantics(input as CompositionV03);
}

/** The validation a document of 0.4 had (D35.4, D54), as for 0.1. */
function errorsOfV04(input: unknown): readonly ValidationError[] {
  const structural = validateStructure(compositionSchemaV04, input);
  if (structural.length > 0) return structural;
  return validateSemantics(input as CompositionV04);
}

/** The validation a document of 0.5 had (D35.4, D56), as for 0.1. */
function errorsOfV05(input: unknown): readonly ValidationError[] {
  const structural = validateStructure(compositionSchemaV05, input);
  if (structural.length > 0) return structural;
  return validateSemantics(input as CompositionV05);
}

/** The validation a document of 0.6 had (D35.4, D57), as for 0.1. */
function errorsOfV06(input: unknown): readonly ValidationError[] {
  const structural = validateStructure(compositionSchemaV06, input);
  if (structural.length > 0) return structural;
  return validateSemantics(input as CompositionV06);
}

/** The validation a document of 0.7 had (D35.4, D58), as for 0.1. */
function errorsOfV07(input: unknown): readonly ValidationError[] {
  const structural = validateStructure(compositionSchemaV07, input);
  if (structural.length > 0) return structural;
  return validateSemantics(input as CompositionV07);
}

/** The validation a document of 0.8 had (D35.4, D59), as for 0.1. */
function errorsOfV08(input: unknown): readonly ValidationError[] {
  const structural = validateStructure(compositionSchemaV08, input);
  if (structural.length > 0) return structural;
  return validateSemantics(input as CompositionV08);
}

/** The validation a document of 0.9 had (D35.4, D63), as for 0.1. */
function errorsOfV09(input: unknown): readonly ValidationError[] {
  const structural = validateStructure(compositionSchemaV09, input);
  if (structural.length > 0) return structural;
  return validateSemantics(input as CompositionV09);
}

/** The validation a document of 0.10 had (D35.4, D66), as for 0.1. */
function errorsOfV010(input: unknown): readonly ValidationError[] {
  const structural = validateStructure(compositionSchemaV010, input);
  if (structural.length > 0) return structural;
  return validateSemantics(input as CompositionV010);
}

/** The validation a document of 0.11 had (D35.4, D67), as for 0.1. */
function errorsOfV011(input: unknown): readonly ValidationError[] {
  const structural = validateStructure(compositionSchemaV011, input);
  if (structural.length > 0) return structural;
  return validateSemantics(input as CompositionV011);
}

/** The validation a document of 0.12 had (D35.4, D68), as for 0.1. */
function errorsOfV012(input: unknown): readonly ValidationError[] {
  const structural = validateStructure(compositionSchemaV012, input);
  if (structural.length > 0) return structural;
  return validateSemantics(input as CompositionV012);
}

/** The validation a document of 0.13 had (D35.4, D69), as for 0.1. */
function errorsOfV013(input: unknown): readonly ValidationError[] {
  const structural = validateStructure(compositionSchemaV013, input);
  if (structural.length > 0) return structural;
  return validateSemantics(input as CompositionV013);
}

/** The validation a document of 0.14 had (D35.4, D70), as for 0.1. */
function errorsOfV014(input: unknown): readonly ValidationError[] {
  const structural = validateStructure(compositionSchemaV014, input);
  if (structural.length > 0) return structural;
  return validateSemantics(input as CompositionV014);
}

/** The validation a document of 0.15 had (D35.4, D71), as for 0.1. */
function errorsOfV015(input: unknown): readonly ValidationError[] {
  const structural = validateStructure(compositionSchemaV015, input);
  if (structural.length > 0) return structural;
  return validateSemantics(input as CompositionV015);
}

/** The validation a document of 0.16 had (D35.4, D72), as for 0.1. */
function errorsOfV016(input: unknown): readonly ValidationError[] {
  const structural = validateStructure(compositionSchemaV016, input);
  if (structural.length > 0) return structural;
  return validateSemantics(input as CompositionV016);
}

/** The validation a document of 0.17 had (D35.4, D73), as for 0.1. */
function errorsOfV017(input: unknown): readonly ValidationError[] {
  const structural = validateStructure(compositionSchemaV017, input);
  if (structural.length > 0) return structural;
  return validateSemantics(input as CompositionV017);
}

/** The validation a document of 0.18 had (D35.4, D74), as for 0.1. */
function errorsOfV018(input: unknown): readonly ValidationError[] {
  const structural = validateStructure(compositionSchemaV018, input);
  if (structural.length > 0) return structural;
  return validateSemantics(input as CompositionV018);
}

/** The validation a document of 0.19 had (D35.4, D75), as for 0.1. */
function errorsOfV019(input: unknown): readonly ValidationError[] {
  const structural = validateStructure(compositionSchemaV019, input);
  if (structural.length > 0) return structural;
  return validateSemantics(input as CompositionV019);
}

/** The validation a document of 0.20 had (D35.4, D76), as for 0.1. */
function errorsOfV020(input: unknown): readonly ValidationError[] {
  const structural = validateStructure(compositionSchemaV020, input);
  if (structural.length > 0) return structural;
  return validateSemantics(input as CompositionV020);
}

/** The validation a document of 0.21 had (D35.4, D77), as for 0.1. */
function errorsOfV021(input: unknown): readonly ValidationError[] {
  const structural = validateStructure(compositionSchemaV021, input);
  if (structural.length > 0) return structural;
  return validateSemantics(input as CompositionV021);
}

/** The validation a document of 0.22 had (D35.4, D78), as for 0.1. */
function errorsOfV022(input: unknown): readonly ValidationError[] {
  const structural = validateStructure(compositionSchemaV022, input);
  if (structural.length > 0) return structural;
  return validateSemantics(input as CompositionV022);
}

/** The validation a document of 0.23 had (D35.4, D82), as for 0.1. */
function errorsOfV023(input: unknown): readonly ValidationError[] {
  const structural = validateStructure(compositionSchemaV023, input);
  if (structural.length > 0) return structural;
  return validateSemantics(input as CompositionV023);
}

/** The validation a document of 0.24 had (D35.4, D83), as for 0.1. */
function errorsOfV024(input: unknown): readonly ValidationError[] {
  const structural = validateStructure(compositionSchemaV024, input);
  if (structural.length > 0) return structural;
  return validateSemantics(input as CompositionV024);
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
  Object.freeze({
    version: SCHEMA_VERSION_V02,
    errors: errorsOfV02,
    next: (document: unknown) => step02To03(document as CompositionV02),
  }),
  Object.freeze({
    version: SCHEMA_VERSION_V03,
    errors: errorsOfV03,
    next: (document: unknown) => step03To04(document as CompositionV03),
  }),
  Object.freeze({
    version: SCHEMA_VERSION_V04,
    errors: errorsOfV04,
    next: (document: unknown) => step04To05(document as CompositionV04),
  }),
  Object.freeze({
    version: SCHEMA_VERSION_V05,
    errors: errorsOfV05,
    next: (document: unknown) => step05To06(document as CompositionV05),
  }),
  Object.freeze({
    version: SCHEMA_VERSION_V06,
    errors: errorsOfV06,
    next: (document: unknown) => step06To07(document as CompositionV06),
  }),
  Object.freeze({
    version: SCHEMA_VERSION_V07,
    errors: errorsOfV07,
    next: (document: unknown) => step07To08(document as CompositionV07),
  }),
  Object.freeze({
    version: SCHEMA_VERSION_V08,
    errors: errorsOfV08,
    next: (document: unknown) => step08To09(document as CompositionV08),
  }),
  Object.freeze({
    version: SCHEMA_VERSION_V09,
    errors: errorsOfV09,
    next: (document: unknown) => step09To10(document as CompositionV09),
  }),
  Object.freeze({
    version: SCHEMA_VERSION_V010,
    errors: errorsOfV010,
    next: (document: unknown) => step010To011(document as CompositionV010),
  }),
  Object.freeze({
    version: SCHEMA_VERSION_V011,
    errors: errorsOfV011,
    next: (document: unknown) => step011To012(document as CompositionV011),
  }),
  Object.freeze({
    version: SCHEMA_VERSION_V012,
    errors: errorsOfV012,
    next: (document: unknown) => step012To013(document as CompositionV012),
  }),
  Object.freeze({
    version: SCHEMA_VERSION_V013,
    errors: errorsOfV013,
    next: (document: unknown) => step013To014(document as CompositionV013),
  }),
  Object.freeze({
    version: SCHEMA_VERSION_V014,
    errors: errorsOfV014,
    next: (document: unknown) => step014To015(document as CompositionV014),
  }),
  Object.freeze({
    version: SCHEMA_VERSION_V015,
    errors: errorsOfV015,
    next: (document: unknown) => step015To016(document as CompositionV015),
  }),
  Object.freeze({
    version: SCHEMA_VERSION_V016,
    errors: errorsOfV016,
    next: (document: unknown) => step016To017(document as CompositionV016),
  }),
  Object.freeze({
    version: SCHEMA_VERSION_V017,
    errors: errorsOfV017,
    next: (document: unknown) => step017To018(document as CompositionV017),
  }),
  Object.freeze({
    version: SCHEMA_VERSION_V018,
    errors: errorsOfV018,
    next: (document: unknown) => step018To019(document as CompositionV018),
  }),
  Object.freeze({
    version: SCHEMA_VERSION_V019,
    errors: errorsOfV019,
    next: (document: unknown) => step019To020(document as CompositionV019),
  }),
  Object.freeze({
    version: SCHEMA_VERSION_V020,
    errors: errorsOfV020,
    next: (document: unknown) => step020To021(document as CompositionV020),
  }),
  Object.freeze({
    version: SCHEMA_VERSION_V021,
    errors: errorsOfV021,
    next: (document: unknown) => step021To022(document as CompositionV021),
  }),
  Object.freeze({
    version: SCHEMA_VERSION_V022,
    errors: errorsOfV022,
    next: (document: unknown) => step022To023(document as CompositionV022),
  }),
  Object.freeze({
    version: SCHEMA_VERSION_V023,
    errors: errorsOfV023,
    next: (document: unknown) => step023To024(document as CompositionV023),
  }),
  Object.freeze({
    version: SCHEMA_VERSION_V024,
    errors: errorsOfV024,
    next: (document: unknown) => step024To025(document as CompositionV024),
  }),
  Object.freeze({ version: '0.25', errors: errorsOfCurrent }),
]);

/**
 * The versions this build can carry forward, oldest first; the last is the
 * current one (D43.5). It is read from the table the migration runs, so the two
 * cannot disagree. A version that is not listed is refused, never guessed.
 *
 * Supported here means supported for migration. `validateComposition`, and
 * everything built on it, accepts the last version only, and its message for an
 * earlier document speaks of that narrower sense.
 */
export const SUPPORTED_SCHEMA_VERSIONS: readonly SchemaVersion[] = Object.freeze(
  VERSIONS.map(({ version }) => version),
);

/**
 * Carries a document forward to the current schema version (D35.3, D42.8):
 *
 * 1. the input is validated under its own version;
 * 2. every later step is applied in order, and the output of a step is
 *    validated under the version it reaches before another step reads it — a
 *    document of 0.1 is validated as 0.2 before the step to 0.3 reads it;
 * 3. the result is validated in full under the current version, always;
 * 4. `versions` reports the versions it went through: `['0.1', '0.2', '0.3',
 *    '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '0.10', '0.11', '0.12', '0.13', '0.14', '0.15', '0.16', '0.17', '0.18', '0.19', '0.20', '0.21', '0.22', '0.23', '0.24', '0.25']` for a document of 0.1, `['0.25']` for a document that was
 *    current already.
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

/**
 * Reads a saved composition (D43.4): the text as JSON, then `migrateComposition`
 * on what it holds. A success is the success of the migration: a new, validated
 * composition of the current version that belongs to the caller and is not
 * frozen, and the versions the document went through.
 *
 * A failure says where it happened:
 *
 * - `stage: 'text'` — the argument is no string, or `JSON.parse` refuses it;
 *   one frozen `CompositionTextError`, and no document was looked at;
 * - `stage: 'document'` — the text is JSON, and the migration refused what it
 *   holds: `version`, `versions`, and `errors` are exactly those of
 *   `migrateComposition`, which may be several errors.
 *
 * JSON's own rules apply and no other: a byte order mark is not JSON, the last
 * of two equal keys wins, and every check of a number sees the value
 * `JSON.parse` made of it, not its decimal spelling. For any string it returns
 * a result and does not throw. The result and its arrays are frozen.
 */
export function parseComposition(text: string): ParseCompositionResult {
  return parseThrough(migrateComposition, text);
}

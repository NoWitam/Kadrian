/**
 * `kadrion migrate <input> (--out <file> | --check)`: the saved text of D43 as
 * a job of D48. It is a thin layer over `parseComposition` and
 * `serializeComposition` of `@kadrion/schema/migrate`, and the only source of a
 * package that imports that entry: running the command is the host's explicit
 * act of migrating (D43.7, amended by PR-41).
 *
 * This module decides what the command reports and writes; `cli.ts` reads the
 * input, writes the file, and prints the lines.
 */
import {
  parseComposition,
  serializeComposition,
  type CompositionTextError,
  type SchemaVersion,
} from '@kadrion/schema/migrate';

import type { ValidationError } from '@kadrion/schema';

/** The exit code of `migrate --check` for a valid document of an earlier version (D48.3). */
export const EXIT_NOT_CURRENT = 6;

/** The error code of the `error` line of a refused text or document (as the Producer's, D28.6). */
export const INVALID_DOCUMENT = 'invalid-document';

/** The error code of the `error` line of `migrate --check` for a document that is not current. */
export const NOT_CURRENT = 'not-current';

/**
 * The lines only `migrate` writes (D48.1, amended by PR-41): the versions the
 * document passed through, oldest first, the last one current; or what
 * `parseComposition` refused, with its typed errors, before the `error` line.
 */
export type MigrateLine =
  { readonly event: 'versions'; readonly versions: readonly SchemaVersion[] } | InvalidLine;

/** The `invalid` line: what `parseComposition` refused, as it reported it (D43.4). */
export type InvalidLine =
  | { readonly event: 'invalid'; readonly stage: 'text'; readonly error: CompositionTextError }
  | {
      readonly event: 'invalid';
      readonly stage: 'document';
      readonly version: SchemaVersion | null;
      readonly versions: readonly SchemaVersion[];
      readonly errors: readonly ValidationError[];
    };

/** What the command does with one input text. */
export type MigrateOutcome =
  /** The document is valid: `text` is what `--out` receives, and `current` whether it already was. */
  | {
      readonly ok: true;
      readonly line: { readonly event: 'versions'; readonly versions: readonly SchemaVersion[] };
      readonly current: boolean;
      readonly text: string;
    }
  /** The text or the document was refused: the `invalid` line, then an `error` line. */
  | { readonly ok: false; readonly line: InvalidLine };

/**
 * Migrates one saved text: `parseComposition`, then `serializeComposition` of
 * its result. The text written is exactly what a library caller gets from the
 * same two calls: compact, no trailing newline (D43.3).
 */
export function migrateText(text: string): MigrateOutcome {
  const parsed = parseComposition(text);
  if (!parsed.ok) {
    return parsed.stage === 'text'
      ? { ok: false, line: { event: 'invalid', stage: 'text', error: parsed.error } }
      : {
          ok: false,
          line: {
            event: 'invalid',
            stage: 'document',
            version: parsed.version,
            versions: parsed.versions,
            errors: parsed.errors,
          },
        };
  }
  const saved = serializeComposition(parsed.composition);
  if (!saved.ok) {
    // A migration's result is valid by D42.8; this is a defect of the build, not of the input.
    throw new Error(
      `A migrated document was refused: ${saved.errors.map((error) => error.code).join(', ')}`,
    );
  }
  return {
    ok: true,
    line: { event: 'versions', versions: parsed.versions },
    current: parsed.versions.length === 1,
    text: saved.text,
  };
}

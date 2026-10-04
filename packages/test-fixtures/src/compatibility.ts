/**
 * @kadrion/test-fixtures/compatibility — the compatibility corpus (D43.6): the
 * saved documents that must keep loading, and the hand-written document of the
 * current version each must load as.
 *
 * It is an entry point of its own on purpose. The main entry is loaded by many
 * suites and, unbundled, by the playground in a browser; neither should fetch
 * and resolve a corpus that only the compatibility tests read. The main entry
 * imports nothing from here, and this module imports nothing from the main
 * entry: the corpus holds its own copies of the fixtures it began with, so work
 * on those fixtures cannot change it.
 *
 * Pure data without `@kadrion/*` dependencies (D12). Documents are exported as
 * `unknown`, and deeply frozen because all consumers share the module instance.
 */
import manifest from './compatibility/manifest.json' with { type: 'json' };
import extremesV01 from './compatibility/v0-1/extremes.json' with { type: 'json' };
import minimalV01 from './compatibility/v0-1/minimal.json' with { type: 'json' };
import pairV01 from './compatibility/v0-1/pair.json' with { type: 'json' };
import referenceV01 from './compatibility/v0-1/reference.json' with { type: 'json' };
import extremesV02 from './compatibility/v0-2/extremes.json' with { type: 'json' };
import lifetimeV02 from './compatibility/v0-2/lifetime.json' with { type: 'json' };
import minimalV02 from './compatibility/v0-2/minimal.json' with { type: 'json' };
import pairV02 from './compatibility/v0-2/pair.json' with { type: 'json' };
import referenceV02 from './compatibility/v0-2/reference.json' with { type: 'json' };

/**
 * An entry of the compatibility corpus (D43.6): a saved document that must keep
 * loading, and the document of the current version it must load as.
 */
export interface CompatibilityEntry {
  readonly id: string;
  /** The schema version the input names. */
  readonly schemaVersion: string;
  /** The saved document: a frozen input, which never changes once committed. */
  readonly input: unknown;
  readonly inputFile: string;
  /** SHA-256 of the bytes of the input file. */
  readonly inputSha256: string;
  /** The versions loading must report, the input's own first. */
  readonly versions: readonly string[];
  /** What the input must load as: written by hand, never by a migration. */
  readonly expected: unknown;
  readonly expectedFile: string;
  /** SHA-256 of the bytes of the expected file. */
  readonly expectedSha256: string;
  /** `sha256(canonicalJson(expected))`: independent of white space and key order (D28.7). */
  readonly expectedCompositionHash: string;
}

/** The corpus documents by the path the manifest names them with. */
const FILES: Readonly<Record<string, unknown>> = {
  'compatibility/v0-1/extremes.json': extremesV01,
  'compatibility/v0-1/minimal.json': minimalV01,
  'compatibility/v0-1/pair.json': pairV01,
  'compatibility/v0-1/reference.json': referenceV01,
  'compatibility/v0-2/extremes.json': extremesV02,
  'compatibility/v0-2/lifetime.json': lifetimeV02,
  'compatibility/v0-2/minimal.json': minimalV02,
  'compatibility/v0-2/pair.json': pairV02,
  'compatibility/v0-2/reference.json': referenceV02,
};

function fileOf(path: string): unknown {
  if (!Object.hasOwn(FILES, path)) {
    throw new Error(`The compatibility manifest names ${path}, which this module does not import.`);
  }
  return FILES[path];
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * The compatibility corpus: every entry of `compatibility/manifest.json` with
 * its two documents. A repository test checks the manifest against the files on
 * disk, their bytes, and this list (D43.6).
 */
export const compatibilityCorpus: readonly CompatibilityEntry[] = deepFreeze(
  manifest.entries.map((entry) => ({
    id: entry.id,
    schemaVersion: entry.schemaVersion,
    input: fileOf(entry.input),
    inputFile: entry.input,
    inputSha256: entry.inputSha256,
    versions: entry.versions,
    expected: fileOf(entry.expected),
    expectedFile: entry.expected,
    expectedSha256: entry.expectedSha256,
    expectedCompositionHash: entry.expectedCompositionHash,
  })),
);

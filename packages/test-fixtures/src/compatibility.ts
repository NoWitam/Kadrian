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
import extremesV03 from './compatibility/v0-3/extremes.json' with { type: 'json' };
import lifetimeV03 from './compatibility/v0-3/lifetime.json' with { type: 'json' };
import minimalV03 from './compatibility/v0-3/minimal.json' with { type: 'json' };
import pairV03 from './compatibility/v0-3/pair.json' with { type: 'json' };
import referenceV03 from './compatibility/v0-3/reference.json' with { type: 'json' };
import videoV03 from './compatibility/v0-3/video.json' with { type: 'json' };
import audioV04 from './compatibility/v0-4/audio.json' with { type: 'json' };
import extremesV04 from './compatibility/v0-4/extremes.json' with { type: 'json' };
import lifetimeV04 from './compatibility/v0-4/lifetime.json' with { type: 'json' };
import minimalV04 from './compatibility/v0-4/minimal.json' with { type: 'json' };
import pairV04 from './compatibility/v0-4/pair.json' with { type: 'json' };
import referenceV04 from './compatibility/v0-4/reference.json' with { type: 'json' };
import videoV04 from './compatibility/v0-4/video.json' with { type: 'json' };
import audioV05 from './compatibility/v0-5/audio.json' with { type: 'json' };
import extremesV05 from './compatibility/v0-5/extremes.json' with { type: 'json' };
import lifetimeV05 from './compatibility/v0-5/lifetime.json' with { type: 'json' };
import minimalV05 from './compatibility/v0-5/minimal.json' with { type: 'json' };
import pairV05 from './compatibility/v0-5/pair.json' with { type: 'json' };
import referenceV05 from './compatibility/v0-5/reference.json' with { type: 'json' };
import scenesV05 from './compatibility/v0-5/scenes.json' with { type: 'json' };
import videoV05 from './compatibility/v0-5/video.json' with { type: 'json' };
import audioV06 from './compatibility/v0-6/audio.json' with { type: 'json' };
import extremesV06 from './compatibility/v0-6/extremes.json' with { type: 'json' };
import lifetimeV06 from './compatibility/v0-6/lifetime.json' with { type: 'json' };
import minimalV06 from './compatibility/v0-6/minimal.json' with { type: 'json' };
import pairV06 from './compatibility/v0-6/pair.json' with { type: 'json' };
import referenceV06 from './compatibility/v0-6/reference.json' with { type: 'json' };
import scenesV06 from './compatibility/v0-6/scenes.json' with { type: 'json' };
import transitionsV06 from './compatibility/v0-6/transitions.json' with { type: 'json' };
import videoV06 from './compatibility/v0-6/video.json' with { type: 'json' };
import audioV07 from './compatibility/v0-7/audio.json' with { type: 'json' };
import captionsV07 from './compatibility/v0-7/captions.json' with { type: 'json' };
import extremesV07 from './compatibility/v0-7/extremes.json' with { type: 'json' };
import lifetimeV07 from './compatibility/v0-7/lifetime.json' with { type: 'json' };
import minimalV07 from './compatibility/v0-7/minimal.json' with { type: 'json' };
import pairV07 from './compatibility/v0-7/pair.json' with { type: 'json' };
import referenceV07 from './compatibility/v0-7/reference.json' with { type: 'json' };
import scenesV07 from './compatibility/v0-7/scenes.json' with { type: 'json' };
import transitionsV07 from './compatibility/v0-7/transitions.json' with { type: 'json' };
import videoV07 from './compatibility/v0-7/video.json' with { type: 'json' };
import audioV08 from './compatibility/v0-8/audio.json' with { type: 'json' };
import captionsV08 from './compatibility/v0-8/captions.json' with { type: 'json' };
import extremesV08 from './compatibility/v0-8/extremes.json' with { type: 'json' };
import inputsV08 from './compatibility/v0-8/inputs.json' with { type: 'json' };
import lifetimeV08 from './compatibility/v0-8/lifetime.json' with { type: 'json' };
import minimalV08 from './compatibility/v0-8/minimal.json' with { type: 'json' };
import pairV08 from './compatibility/v0-8/pair.json' with { type: 'json' };
import referenceV08 from './compatibility/v0-8/reference.json' with { type: 'json' };
import scenesV08 from './compatibility/v0-8/scenes.json' with { type: 'json' };
import templateV08 from './compatibility/v0-8/template.json' with { type: 'json' };
import transitionsV08 from './compatibility/v0-8/transitions.json' with { type: 'json' };
import videoV08 from './compatibility/v0-8/video.json' with { type: 'json' };
import audioV09 from './compatibility/v0-9/audio.json' with { type: 'json' };
import captionsV09 from './compatibility/v0-9/captions.json' with { type: 'json' };
import extremesV09 from './compatibility/v0-9/extremes.json' with { type: 'json' };
import inputsV09 from './compatibility/v0-9/inputs.json' with { type: 'json' };
import lifetimeV09 from './compatibility/v0-9/lifetime.json' with { type: 'json' };
import minimalV09 from './compatibility/v0-9/minimal.json' with { type: 'json' };
import pairV09 from './compatibility/v0-9/pair.json' with { type: 'json' };
import referenceV09 from './compatibility/v0-9/reference.json' with { type: 'json' };
import repeatsV09 from './compatibility/v0-9/repeats.json' with { type: 'json' };
import scenesV09 from './compatibility/v0-9/scenes.json' with { type: 'json' };
import templateV09 from './compatibility/v0-9/template.json' with { type: 'json' };
import transitionsV09 from './compatibility/v0-9/transitions.json' with { type: 'json' };
import videoV09 from './compatibility/v0-9/video.json' with { type: 'json' };
import audioV010 from './compatibility/v0-10/audio.json' with { type: 'json' };
import captionsV010 from './compatibility/v0-10/captions.json' with { type: 'json' };
import extremesV010 from './compatibility/v0-10/extremes.json' with { type: 'json' };
import focusV010 from './compatibility/v0-10/focus.json' with { type: 'json' };
import inputsV010 from './compatibility/v0-10/inputs.json' with { type: 'json' };
import lifetimeV010 from './compatibility/v0-10/lifetime.json' with { type: 'json' };
import minimalV010 from './compatibility/v0-10/minimal.json' with { type: 'json' };
import pairV010 from './compatibility/v0-10/pair.json' with { type: 'json' };
import referenceV010 from './compatibility/v0-10/reference.json' with { type: 'json' };
import repeatsV010 from './compatibility/v0-10/repeats.json' with { type: 'json' };
import scenesV010 from './compatibility/v0-10/scenes.json' with { type: 'json' };
import templateV010 from './compatibility/v0-10/template.json' with { type: 'json' };
import transitionsV010 from './compatibility/v0-10/transitions.json' with { type: 'json' };
import videoV010 from './compatibility/v0-10/video.json' with { type: 'json' };

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
  'compatibility/v0-3/extremes.json': extremesV03,
  'compatibility/v0-3/lifetime.json': lifetimeV03,
  'compatibility/v0-3/minimal.json': minimalV03,
  'compatibility/v0-3/pair.json': pairV03,
  'compatibility/v0-3/reference.json': referenceV03,
  'compatibility/v0-3/video.json': videoV03,
  'compatibility/v0-4/audio.json': audioV04,
  'compatibility/v0-4/extremes.json': extremesV04,
  'compatibility/v0-4/lifetime.json': lifetimeV04,
  'compatibility/v0-4/minimal.json': minimalV04,
  'compatibility/v0-4/pair.json': pairV04,
  'compatibility/v0-4/reference.json': referenceV04,
  'compatibility/v0-4/video.json': videoV04,
  'compatibility/v0-5/audio.json': audioV05,
  'compatibility/v0-5/extremes.json': extremesV05,
  'compatibility/v0-5/lifetime.json': lifetimeV05,
  'compatibility/v0-5/minimal.json': minimalV05,
  'compatibility/v0-5/pair.json': pairV05,
  'compatibility/v0-5/reference.json': referenceV05,
  'compatibility/v0-5/scenes.json': scenesV05,
  'compatibility/v0-5/video.json': videoV05,
  'compatibility/v0-6/audio.json': audioV06,
  'compatibility/v0-6/extremes.json': extremesV06,
  'compatibility/v0-6/lifetime.json': lifetimeV06,
  'compatibility/v0-6/minimal.json': minimalV06,
  'compatibility/v0-6/pair.json': pairV06,
  'compatibility/v0-6/reference.json': referenceV06,
  'compatibility/v0-6/scenes.json': scenesV06,
  'compatibility/v0-6/transitions.json': transitionsV06,
  'compatibility/v0-6/video.json': videoV06,
  'compatibility/v0-7/audio.json': audioV07,
  'compatibility/v0-7/captions.json': captionsV07,
  'compatibility/v0-7/extremes.json': extremesV07,
  'compatibility/v0-7/lifetime.json': lifetimeV07,
  'compatibility/v0-7/minimal.json': minimalV07,
  'compatibility/v0-7/pair.json': pairV07,
  'compatibility/v0-7/reference.json': referenceV07,
  'compatibility/v0-7/scenes.json': scenesV07,
  'compatibility/v0-7/transitions.json': transitionsV07,
  'compatibility/v0-7/video.json': videoV07,
  'compatibility/v0-8/audio.json': audioV08,
  'compatibility/v0-8/captions.json': captionsV08,
  'compatibility/v0-8/extremes.json': extremesV08,
  'compatibility/v0-8/inputs.json': inputsV08,
  'compatibility/v0-8/lifetime.json': lifetimeV08,
  'compatibility/v0-8/minimal.json': minimalV08,
  'compatibility/v0-8/pair.json': pairV08,
  'compatibility/v0-8/reference.json': referenceV08,
  'compatibility/v0-8/scenes.json': scenesV08,
  'compatibility/v0-8/template.json': templateV08,
  'compatibility/v0-8/transitions.json': transitionsV08,
  'compatibility/v0-8/video.json': videoV08,
  'compatibility/v0-9/audio.json': audioV09,
  'compatibility/v0-9/captions.json': captionsV09,
  'compatibility/v0-9/extremes.json': extremesV09,
  'compatibility/v0-9/inputs.json': inputsV09,
  'compatibility/v0-9/lifetime.json': lifetimeV09,
  'compatibility/v0-9/minimal.json': minimalV09,
  'compatibility/v0-9/pair.json': pairV09,
  'compatibility/v0-9/reference.json': referenceV09,
  'compatibility/v0-9/repeats.json': repeatsV09,
  'compatibility/v0-9/scenes.json': scenesV09,
  'compatibility/v0-9/template.json': templateV09,
  'compatibility/v0-9/transitions.json': transitionsV09,
  'compatibility/v0-9/video.json': videoV09,
  'compatibility/v0-10/audio.json': audioV010,
  'compatibility/v0-10/captions.json': captionsV010,
  'compatibility/v0-10/extremes.json': extremesV010,
  'compatibility/v0-10/focus.json': focusV010,
  'compatibility/v0-10/inputs.json': inputsV010,
  'compatibility/v0-10/lifetime.json': lifetimeV010,
  'compatibility/v0-10/minimal.json': minimalV010,
  'compatibility/v0-10/pair.json': pairV010,
  'compatibility/v0-10/reference.json': referenceV010,
  'compatibility/v0-10/repeats.json': repeatsV010,
  'compatibility/v0-10/scenes.json': scenesV010,
  'compatibility/v0-10/template.json': templateV010,
  'compatibility/v0-10/transitions.json': transitionsV010,
  'compatibility/v0-10/video.json': videoV010,
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

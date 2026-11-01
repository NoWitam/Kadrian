/**
 * @kadrion/test-fixtures — reference compositions and golden frames.
 *
 * Pure data without `@kadrion/*` dependencies (D12). Documents are exported as
 * `unknown` so that every consumer goes through `validateComposition`, and they
 * are deeply frozen because all consumers share the same module instance.
 *
 * The asset hashes are the SHA-256 of the bytes that `generateReferenceAssets`
 * makes (D14, D27.5); no binary asset is committed. The Custom HTML element
 * speaks protocol version 1 of D23.3.
 */
import expectedRender from './compositions/reference.expected-render.json' with { type: 'json' };
import expectedStates from './compositions/reference.expected-state.json' with { type: 'json' };
import lifetimeExpectations from './compositions/lifetime.expected.json' with { type: 'json' };
import lifetime from './compositions/lifetime.json' with { type: 'json' };
import migrationAfter from './compositions/migration-0-1-to-0-2.after.json' with { type: 'json' };
import migrationBefore from './compositions/migration-0-1-to-0-2.before.json' with { type: 'json' };
import migration03After from './compositions/migration-0-2-to-0-3.after.json' with { type: 'json' };
import migration03Before from './compositions/migration-0-2-to-0-3.before.json' with { type: 'json' };
import migration04After from './compositions/migration-0-3-to-0-4.after.json' with { type: 'json' };
import migration04Before from './compositions/migration-0-3-to-0-4.before.json' with { type: 'json' };
import migration05After from './compositions/migration-0-4-to-0-5.after.json' with { type: 'json' };
import migration05Before from './compositions/migration-0-4-to-0-5.before.json' with { type: 'json' };
import invalidCases from './compositions/reference.invalid.json' with { type: 'json' };
import reference from './compositions/reference.json' with { type: 'json' };
import scenes from './compositions/scenes.json' with { type: 'json' };
import video from './compositions/video.json' with { type: 'json' };
import invalidCasesV01 from './compositions/reference.v0-1.invalid.json' with { type: 'json' };
import referenceV01 from './compositions/reference.v0-1.json' with { type: 'json' };
import invalidCasesV02 from './compositions/reference.v0-2.invalid.json' with { type: 'json' };
import referenceV02 from './compositions/reference.v0-2.json' with { type: 'json' };
import invalidCasesV03 from './compositions/reference.v0-3.invalid.json' with { type: 'json' };
import referenceV03 from './compositions/reference.v0-3.json' with { type: 'json' };
import invalidCasesV04 from './compositions/reference.v0-4.invalid.json' with { type: 'json' };
import referenceV04 from './compositions/reference.v0-4.json' with { type: 'json' };

export {
  AUDIO_SAMPLE_RATE,
  AUDIO_SECONDS,
  FONT_FAMILY_NAME,
  FONT_GLYPHS,
  FONT_UNITS_PER_EM,
  generateReferenceAssets,
  IMAGE_SIZE,
  VIDEO_FIXTURE,
  VIDEO_SOUND_FIXTURE,
  videoFixtureArguments,
  videoSoundFixtureArguments,
} from './assets/index.js';
export type { FixtureAsset } from './assets/index.js';

/** One step of an RFC 6902 JSON Patch, restricted to `add`, `replace`, and `remove`. */
export interface FixturePatchOperation {
  readonly op: 'add' | 'replace' | 'remove';
  /** RFC 6901 JSON Pointer; a trailing `-` appends to an array. */
  readonly path: string;
  readonly value?: unknown;
}

/** The reference composition plus exactly one defect, and the typed errors it must produce. */
export interface InvalidCompositionCase {
  readonly name: string;
  readonly description: string;
  readonly patch: readonly FixturePatchOperation[];
  readonly expectedErrors: readonly { readonly code: string; readonly path: string }[];
}

/** Golden timestamps with their frame index at 30 fps (specification §3.3). */
export interface GoldenTimestamp {
  readonly timeUs: number;
  readonly frame: number;
}

/** The evaluated state of the reference composition at one golden timestamp. */
export interface ExpectedGoldenState {
  readonly timeUs: number;
  /** How every animated value was derived by hand, step by step. */
  readonly derivation: readonly string[];
  /**
   * Exactly what `evaluateComposition` of `@kadrion/runtime` must return. It is
   * `unknown` because the runtime owns the state types, and fixtures stay free
   * of `@kadrion/*` dependencies (D12).
   */
  readonly state: unknown;
}

/** Hand-derived expectations together with the rule they were derived with. */
export interface ExpectedStates {
  readonly description: string;
  readonly rule: readonly string[];
  readonly golden: readonly ExpectedGoldenState[];
}

/** A text node of an expected DOM tree. */
export interface ExpectedText {
  readonly text: string;
}

/** An element of an expected DOM tree: everything it has, and nothing else. */
export interface ExpectedElement {
  readonly tag: string;
  readonly attributes: Readonly<Record<string, string>>;
  /** Every inline style declaration, by property name. */
  readonly style: Readonly<Record<string, string>>;
  readonly children: readonly (ExpectedElement | ExpectedText)[];
}

/** A message of the Custom HTML time contract (D23.3). */
export interface ExpectedCustomHtmlMessage {
  readonly type: string;
  readonly version: number;
  /** The node ID, which the element reads from its shell. */
  readonly instanceId: string;
  /** Chosen by the host; the fixture assumes the frame index of the golden timestamp. */
  readonly requestId: number;
  readonly timeUs: number;
}

/** What the host posts to one Custom HTML element, and the one answer it accepts. */
export interface ExpectedCustomHtmlExchange {
  readonly nodeId: string;
  readonly post: ExpectedCustomHtmlMessage;
  readonly acknowledgement: ExpectedCustomHtmlMessage;
}

/** The DOM tree that the renderer must produce at one golden timestamp. */
export interface ExpectedGoldenRender {
  readonly timeUs: number;
  /** How every evaluated value became CSS text, step by step. */
  readonly derivation: readonly string[];
  /** The one element that the renderer places in its root. */
  readonly tree: ExpectedElement;
  /** Every Custom HTML element in document order, with its messages (D23). */
  readonly customHtml: readonly ExpectedCustomHtmlExchange[];
}

/** Hand-derived DOM trees together with the rule and the asset URLs they assume (D22). */
export interface ExpectedRender {
  readonly description: string;
  readonly rule: readonly string[];
  /** What the host passes as asset URLs, by asset ID. */
  readonly assetUrls: Readonly<Record<string, string>>;
  readonly golden: readonly ExpectedGoldenRender[];
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** The 10 s, 1080x1920, 30 fps reference composition (specification §3), in schema 0.5. */
export const referenceComposition: unknown = deepFreeze(reference);

/** Patches over `referenceComposition`; the consumer applies them to a copy. */
export const invalidCompositionCases = deepFreeze(
  invalidCases,
) as readonly InvalidCompositionCase[];

/**
 * The reference composition as schema 0.1 had it, byte for byte: the file is
 * frozen (D35.4, D35.5). Its canonical hash is the `compositionHash` the golden
 * manifest of 0.1 held. `migrateComposition` must carry it to
 * `referenceComposition`, which was written by hand and not by the migration.
 */
export const referenceCompositionV01: unknown = deepFreeze(referenceV01);

/** The negative corpus of schema 0.1, frozen with it: patches over `referenceCompositionV01`. */
export const invalidCompositionCasesV01 = deepFreeze(
  invalidCasesV01,
) as readonly InvalidCompositionCase[];

/**
 * The reference composition as schema 0.2 had it, byte for byte: the file is
 * frozen (D35.4, D35.5). `migrateComposition` must carry it to
 * `referenceComposition`, which was written by hand and not by the migration.
 */
export const referenceCompositionV02: unknown = deepFreeze(referenceV02);

/** The negative corpus of schema 0.2, frozen with it: patches over `referenceCompositionV02`. */
export const invalidCompositionCasesV02 = deepFreeze(
  invalidCasesV02,
) as readonly InvalidCompositionCase[];

/**
 * The reference composition as schema 0.3 had it, byte for byte: the file is
 * frozen (D35.4, D35.5). `migrateComposition` must carry it to
 * `referenceComposition`, which was written by hand and not by the migration.
 */
export const referenceCompositionV03: unknown = deepFreeze(referenceV03);

/** The negative corpus of schema 0.3, frozen with it: patches over `referenceCompositionV03`. */
export const invalidCompositionCasesV03 = deepFreeze(
  invalidCasesV03,
) as readonly InvalidCompositionCase[];

/**
 * The reference composition as schema 0.4 had it, byte for byte: the file is
 * frozen (D35.4, D35.5). `migrateComposition` must carry it to
 * `referenceComposition`, which was written by hand and not by the migration.
 */
export const referenceCompositionV04: unknown = deepFreeze(referenceV04);

/** The negative corpus of schema 0.4, frozen with it: patches over `referenceCompositionV04`. */
export const invalidCompositionCasesV04 = deepFreeze(
  invalidCasesV04,
) as readonly InvalidCompositionCase[];

/**
 * A composition of schema 0.5 with three scenes in sequence (D54): 1 s, 1.5 s,
 * and 0.7 s, each starting on the frame grid of 30 fps, with nodes in scene
 * time — keyframes, an image, a Custom HTML element, a text whose lifetime
 * reaches past its scene — a clip of the middle scene, and a composition clip
 * that spans all three.
 */
export const scenesComposition: unknown = deepFreeze(scenes);

/** A document before a migration step and what the step must make of it, both written by hand. */
export interface MigrationPair {
  readonly before: unknown;
  readonly after: unknown;
}

/**
 * The hand-written pair of the step 0.1 → 0.2 (D35.5, D42.7): keys out of their
 * usual order, a `type` in the first and in the last place, every node type, a
 * keyframe past the end, and a duration that is not the reference's.
 */
export const migrationPair01To02: MigrationPair = deepFreeze({
  before: migrationBefore,
  after: migrationAfter,
});

/**
 * The hand-written pair of the step 0.2 → 0.3 (D35.5, D50.7): the document the
 * pair of 0.1 → 0.2 ends with, whose image child, a key out of its usual
 * order, is the only node that gains a key: `fit: "fill"` at its end.
 */
export const migrationPair02To03: MigrationPair = deepFreeze({
  before: migration03Before,
  after: migration03After,
});

/**
 * The hand-written pair of the step 0.3 → 0.4 (D35.5, D52.6): the document the
 * pair of 0.2 → 0.3 ends with, plus a video node whose `type` is its last key,
 * a video child of the group whose `fit` is its second key, and a clip whose
 * keys are in reverse order. Each video gains `volume: 0` at its end, and the
 * clip `sourceStartUs: 0`, `volume: 1`, `fadeInUs: 0`, and `fadeOutUs: 0`.
 */
export const migrationPair03To04: MigrationPair = deepFreeze({
  before: migration04Before,
  after: migration04After,
});

/**
 * The hand-written pair of the step 0.4 → 0.5 (D35.5, D54.4): the document the
 * pair of 0.3 → 0.4 ends with, whose one scene gains `durationUs: 3000000`, the
 * composition's, directly after its `id`, and `clips: []` at its end.
 */
export const migrationPair04To05: MigrationPair = deepFreeze({
  before: migration05Before,
  after: migration05After,
});

/** Which nodes of `lifetimeComposition` are active and which are shown at one time. */
export interface ExpectedLifetime {
  readonly timeUs: number;
  /** The nodes whose state says `active: true`, in document order (D42.3). */
  readonly active: readonly string[];
  /** The nodes whose element is not hidden, in document order (D42.4). */
  readonly shown: readonly string[];
  /** The evaluated x of `life-text`, which is evaluated whether or not it is active. */
  readonly positionX: number;
}

/** Hand-derived activity together with the rule it was derived with. */
export interface ExpectedLifetimes {
  readonly description: string;
  readonly rule: readonly string[];
  readonly times: readonly ExpectedLifetime[];
}

/** A small composition of schema 0.5 whose nodes begin and end inside it (D42.2). */
export const lifetimeComposition: unknown = deepFreeze(lifetime);

/**
 * What the runtime and the renderer must make of `lifetimeComposition` at its
 * boundary times. Derived by hand, never generated by an implementation.
 */
export const lifetimeExpected: ExpectedLifetimes = deepFreeze(lifetimeExpectations);

/**
 * What the runtime must produce for `referenceComposition` at the golden
 * timestamps. Derived by hand, never generated by an implementation.
 */
export const referenceExpectedStates: ExpectedStates = deepFreeze(expectedStates);

/**
 * What the DOM renderer must produce for `referenceComposition` at the golden
 * timestamps. Derived by hand from `referenceExpectedStates` and D22, never
 * generated by an implementation.
 */
export const referenceExpectedRender: ExpectedRender = deepFreeze(expectedRender);

/**
 * The second reference composition (D50.8): 2 s, 640x360, 30 fps, with the
 * video of `VIDEO_FIXTURE` in three nodes — at its own size with `fill`, with
 * `cover` from a later source time, and with `contain` inside a moving group
 * for part of the composition — and the reference image with `contain` and
 * `cover`. Its assets are the image of `generateReferenceAssets` and the video
 * that `videoFixtureArguments` makes.
 */
export const videoComposition: unknown = deepFreeze(video);

/** The golden timestamps of `videoComposition`, with their frame index at 30 fps. */
export const videoGoldenTimestamps: readonly GoldenTimestamp[] = deepFreeze([
  { timeUs: 0, frame: 0 },
  { timeUs: 500_000, frame: 15 },
  { timeUs: 1_000_000, frame: 30 },
  { timeUs: 1_500_000, frame: 45 },
  { timeUs: 1_966_666, frame: 59 },
]);

export const goldenTimestamps: readonly GoldenTimestamp[] = deepFreeze([
  { timeUs: 0, frame: 0 },
  { timeUs: 2_500_000, frame: 75 },
  { timeUs: 5_000_000, frame: 150 },
  { timeUs: 7_500_000, frame: 225 },
  { timeUs: 9_900_000, frame: 297 },
]);

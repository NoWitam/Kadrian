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
import captions from './compositions/captions.json' with { type: 'json' };
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
import migration06After from './compositions/migration-0-5-to-0-6.after.json' with { type: 'json' };
import migration06Before from './compositions/migration-0-5-to-0-6.before.json' with { type: 'json' };
import migration07After from './compositions/migration-0-6-to-0-7.after.json' with { type: 'json' };
import migration07Before from './compositions/migration-0-6-to-0-7.before.json' with { type: 'json' };
import migration08After from './compositions/migration-0-7-to-0-8.after.json' with { type: 'json' };
import migration08Before from './compositions/migration-0-7-to-0-8.before.json' with { type: 'json' };
import migration09After from './compositions/migration-0-8-to-0-9.after.json' with { type: 'json' };
import migration09Before from './compositions/migration-0-8-to-0-9.before.json' with { type: 'json' };
import migration10After from './compositions/migration-0-9-to-0-10.after.json' with { type: 'json' };
import migration10Before from './compositions/migration-0-9-to-0-10.before.json' with { type: 'json' };
import migration11After from './compositions/migration-0-10-to-0-11.after.json' with { type: 'json' };
import migration11Before from './compositions/migration-0-10-to-0-11.before.json' with { type: 'json' };
import migration12After from './compositions/migration-0-11-to-0-12.after.json' with { type: 'json' };
import migration12Before from './compositions/migration-0-11-to-0-12.before.json' with { type: 'json' };
import migration13After from './compositions/migration-0-12-to-0-13.after.json' with { type: 'json' };
import migration13Before from './compositions/migration-0-12-to-0-13.before.json' with { type: 'json' };
import migration14After from './compositions/migration-0-13-to-0-14.after.json' with { type: 'json' };
import migration14Before from './compositions/migration-0-13-to-0-14.before.json' with { type: 'json' };
import migration15After from './compositions/migration-0-14-to-0-15.after.json' with { type: 'json' };
import migration15Before from './compositions/migration-0-14-to-0-15.before.json' with { type: 'json' };
import migration16After from './compositions/migration-0-15-to-0-16.after.json' with { type: 'json' };
import migration16Before from './compositions/migration-0-15-to-0-16.before.json' with { type: 'json' };
import migration17After from './compositions/migration-0-16-to-0-17.after.json' with { type: 'json' };
import migration17Before from './compositions/migration-0-16-to-0-17.before.json' with { type: 'json' };
import migration18After from './compositions/migration-0-17-to-0-18.after.json' with { type: 'json' };
import migration18Before from './compositions/migration-0-17-to-0-18.before.json' with { type: 'json' };
import migration19After from './compositions/migration-0-18-to-0-19.after.json' with { type: 'json' };
import migration19Before from './compositions/migration-0-18-to-0-19.before.json' with { type: 'json' };
import migration20After from './compositions/migration-0-19-to-0-20.after.json' with { type: 'json' };
import migration20Before from './compositions/migration-0-19-to-0-20.before.json' with { type: 'json' };
import migration21After from './compositions/migration-0-20-to-0-21.after.json' with { type: 'json' };
import migration21Before from './compositions/migration-0-20-to-0-21.before.json' with { type: 'json' };
import migration22After from './compositions/migration-0-21-to-0-22.after.json' with { type: 'json' };
import migration22Before from './compositions/migration-0-21-to-0-22.before.json' with { type: 'json' };
import migration23After from './compositions/migration-0-22-to-0-23.after.json' with { type: 'json' };
import migration23Before from './compositions/migration-0-22-to-0-23.before.json' with { type: 'json' };
import migration24After from './compositions/migration-0-23-to-0-24.after.json' with { type: 'json' };
import migration24Before from './compositions/migration-0-23-to-0-24.before.json' with { type: 'json' };
import nested from './compositions/nested.json' with { type: 'json' };
import customHtml from './compositions/custom-html.json' with { type: 'json' };
import elements from './compositions/elements.json' with { type: 'json' };
import compositing from './compositions/compositing.json' with { type: 'json' };
import captionsMotion from './compositions/captions-motion.json' with { type: 'json' };
import effectsSvg from './compositions/effects-svg.json' with { type: 'json' };
import effects from './compositions/effects.json' with { type: 'json' };
import shapes from './compositions/shapes.json' with { type: 'json' };
import svg from './compositions/svg.json' with { type: 'json' };
import motion from './compositions/motion.json' with { type: 'json' };
import text from './compositions/text.json' with { type: 'json' };
import focus from './compositions/focus.json' with { type: 'json' };
import invalidCases from './compositions/reference.invalid.json' with { type: 'json' };
import reference from './compositions/reference.json' with { type: 'json' };
import scenes from './compositions/scenes.json' with { type: 'json' };
import repeatsExpected from './compositions/repeats.expected.json' with { type: 'json' };
import repeats from './compositions/repeats.json' with { type: 'json' };
import template from './compositions/template.json' with { type: 'json' };
import transitions from './compositions/transitions.json' with { type: 'json' };
import clipTransitions from './compositions/clip-transitions.json' with { type: 'json' };
import easing from './compositions/easing.json' with { type: 'json' };
import video from './compositions/video.json' with { type: 'json' };
import speed from './compositions/speed.json' with { type: 'json' };
import invalidCasesV01 from './compositions/reference.v0-1.invalid.json' with { type: 'json' };
import referenceV01 from './compositions/reference.v0-1.json' with { type: 'json' };
import invalidCasesV02 from './compositions/reference.v0-2.invalid.json' with { type: 'json' };
import referenceV02 from './compositions/reference.v0-2.json' with { type: 'json' };
import invalidCasesV03 from './compositions/reference.v0-3.invalid.json' with { type: 'json' };
import referenceV03 from './compositions/reference.v0-3.json' with { type: 'json' };
import invalidCasesV04 from './compositions/reference.v0-4.invalid.json' with { type: 'json' };
import referenceV04 from './compositions/reference.v0-4.json' with { type: 'json' };
import invalidCasesV05 from './compositions/reference.v0-5.invalid.json' with { type: 'json' };
import referenceV05 from './compositions/reference.v0-5.json' with { type: 'json' };
import invalidCasesV06 from './compositions/reference.v0-6.invalid.json' with { type: 'json' };
import referenceV06 from './compositions/reference.v0-6.json' with { type: 'json' };
import invalidCasesV07 from './compositions/reference.v0-7.invalid.json' with { type: 'json' };
import referenceV07 from './compositions/reference.v0-7.json' with { type: 'json' };
import invalidCasesV08 from './compositions/reference.v0-8.invalid.json' with { type: 'json' };
import referenceV08 from './compositions/reference.v0-8.json' with { type: 'json' };
import invalidCasesV09 from './compositions/reference.v0-9.invalid.json' with { type: 'json' };
import referenceV09 from './compositions/reference.v0-9.json' with { type: 'json' };
import invalidCasesV010 from './compositions/reference.v0-10.invalid.json' with { type: 'json' };
import referenceV010 from './compositions/reference.v0-10.json' with { type: 'json' };
import invalidCasesV011 from './compositions/reference.v0-11.invalid.json' with { type: 'json' };
import referenceV011 from './compositions/reference.v0-11.json' with { type: 'json' };
import invalidCasesV012 from './compositions/reference.v0-12.invalid.json' with { type: 'json' };
import referenceV012 from './compositions/reference.v0-12.json' with { type: 'json' };
import invalidCasesV013 from './compositions/reference.v0-13.invalid.json' with { type: 'json' };
import referenceV013 from './compositions/reference.v0-13.json' with { type: 'json' };
import invalidCasesV014 from './compositions/reference.v0-14.invalid.json' with { type: 'json' };
import referenceV014 from './compositions/reference.v0-14.json' with { type: 'json' };
import invalidCasesV015 from './compositions/reference.v0-15.invalid.json' with { type: 'json' };
import referenceV015 from './compositions/reference.v0-15.json' with { type: 'json' };
import invalidCasesV016 from './compositions/reference.v0-16.invalid.json' with { type: 'json' };
import referenceV016 from './compositions/reference.v0-16.json' with { type: 'json' };
import invalidCasesV017 from './compositions/reference.v0-17.invalid.json' with { type: 'json' };
import referenceV017 from './compositions/reference.v0-17.json' with { type: 'json' };
import invalidCasesV018 from './compositions/reference.v0-18.invalid.json' with { type: 'json' };
import referenceV018 from './compositions/reference.v0-18.json' with { type: 'json' };
import invalidCasesV019 from './compositions/reference.v0-19.invalid.json' with { type: 'json' };
import referenceV019 from './compositions/reference.v0-19.json' with { type: 'json' };
import invalidCasesV020 from './compositions/reference.v0-20.invalid.json' with { type: 'json' };
import referenceV020 from './compositions/reference.v0-20.json' with { type: 'json' };
import invalidCasesV021 from './compositions/reference.v0-21.invalid.json' with { type: 'json' };
import referenceV021 from './compositions/reference.v0-21.json' with { type: 'json' };
import invalidCasesV022 from './compositions/reference.v0-22.invalid.json' with { type: 'json' };
import referenceV022 from './compositions/reference.v0-22.json' with { type: 'json' };
import invalidCasesV023 from './compositions/reference.v0-23.invalid.json' with { type: 'json' };
import referenceV023 from './compositions/reference.v0-23.json' with { type: 'json' };

export {
  AUDIO_SAMPLE_RATE,
  AUDIO_SECONDS,
  FONT_FAMILY_NAME,
  FONT_GLYPHS,
  FONT_NOTDEF_ADVANCE,
  FONT_UNITS_PER_EM,
  fixtureSine,
  generateProportionalFont,
  generateReferenceAssets,
  generateSoundFixture,
  generateSvgAsset,
  IMAGE_SIZE,
  PROPORTIONAL_FONT_ADVANCES,
  PROPORTIONAL_FONT_FAMILY_NAME,
  PROPORTIONAL_FONT_GLYPHS,
  SOUND_FIXTURES,
  SOUND_SAMPLE_RATE,
  SVG_BADGE,
  SVG_BADGE_SIZE,
  GREEN_SCREEN_FIXTURE,
  greenScreenFixtureArguments,
  ROTATED_VIDEO_FIXTURES,
  rotatedVideoFixtureArguments,
  TILTED_VIDEO_FIXTURE,
  VIDEO_FIXTURE,
  VIDEO_SOUND_FIXTURE,
  videoFixtureArguments,
  videoSoundFixtureArguments,
} from './assets/index.js';
export type {
  FixtureAsset,
  FixtureFontCmap,
  RotatedVideoFixture,
  SoundFixture,
} from './assets/index.js';

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

/** The 10 s, 1080x1920, 30 fps reference composition (specification §3), in schema 0.24. */
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
 * The reference composition as schema 0.5 had it, byte for byte: the file is
 * frozen (D35.4, D35.5). `migrateComposition` must carry it to
 * `referenceComposition`, which was written by hand and not by the migration.
 */
export const referenceCompositionV05: unknown = deepFreeze(referenceV05);

/** The negative corpus of schema 0.5, frozen with it: patches over `referenceCompositionV05`. */
export const invalidCompositionCasesV05 = deepFreeze(
  invalidCasesV05,
) as readonly InvalidCompositionCase[];

/**
 * The reference composition as schema 0.6 had it, byte for byte: the file is
 * frozen (D35.4, D35.5). `migrateComposition` must carry it to
 * `referenceComposition`, which was written by hand and not by the migration.
 */
export const referenceCompositionV06: unknown = deepFreeze(referenceV06);

/** The negative corpus of schema 0.6, frozen with it: patches over `referenceCompositionV06`. */
export const invalidCompositionCasesV06 = deepFreeze(
  invalidCasesV06,
) as readonly InvalidCompositionCase[];

/**
 * The reference composition as schema 0.7 had it, byte for byte: the file is
 * frozen (D35.4, D35.5). `migrateComposition` must carry it to
 * `referenceComposition`, which was written by hand and not by the migration.
 */
export const referenceCompositionV07: unknown = deepFreeze(referenceV07);

/** The negative corpus of schema 0.7, frozen with it: patches over `referenceCompositionV07`. */
export const invalidCompositionCasesV07 = deepFreeze(
  invalidCasesV07,
) as readonly InvalidCompositionCase[];

/**
 * The reference composition as schema 0.8 had it, byte for byte: the file is
 * frozen (D35.4, D35.5). `migrateComposition` must carry it to
 * `referenceComposition`, which was written by hand and not by the migration.
 */
export const referenceCompositionV08: unknown = deepFreeze(referenceV08);

/** The negative corpus of schema 0.8, frozen with it: patches over `referenceCompositionV08`. */
export const invalidCompositionCasesV08 = deepFreeze(
  invalidCasesV08,
) as readonly InvalidCompositionCase[];

/**
 * The reference composition as schema 0.9 had it, byte for byte: the file is
 * frozen (D35.4, D35.5). `migrateComposition` must carry it to
 * `referenceComposition`, which was written by hand and not by the migration.
 */
export const referenceCompositionV09: unknown = deepFreeze(referenceV09);

/** The negative corpus of schema 0.9, frozen with it: patches over `referenceCompositionV09`. */
export const invalidCompositionCasesV09 = deepFreeze(
  invalidCasesV09,
) as readonly InvalidCompositionCase[];

/** The reference composition as the last build of schema 0.10 had it, frozen (D35.4, D66). */
export const referenceCompositionV010: unknown = deepFreeze(referenceV010);

/** The negative corpus of schema 0.10, frozen with it: patches over `referenceCompositionV010`. */
export const invalidCompositionCasesV010 = deepFreeze(
  invalidCasesV010,
) as readonly InvalidCompositionCase[];

/** The reference composition as the last build of schema 0.11 had it, frozen (D35.4, D67). */
export const referenceCompositionV011: unknown = deepFreeze(referenceV011);

/** The negative corpus of schema 0.11, frozen with it: patches over `referenceCompositionV011`. */
export const invalidCompositionCasesV011 = deepFreeze(
  invalidCasesV011,
) as readonly InvalidCompositionCase[];

/** The reference composition as the last build of schema 0.12 had it, frozen (D35.4, D68). */
export const referenceCompositionV012: unknown = deepFreeze(referenceV012);

/** The negative corpus of schema 0.12, frozen with it: patches over `referenceCompositionV012`. */
export const invalidCompositionCasesV012 = deepFreeze(
  invalidCasesV012,
) as readonly InvalidCompositionCase[];

/** The reference composition as the last build of schema 0.13 had it, frozen (D35.4, D69). */
export const referenceCompositionV013: unknown = deepFreeze(referenceV013);

/** The negative corpus of schema 0.13, frozen with it: patches over `referenceCompositionV013`. */
export const invalidCompositionCasesV013 = deepFreeze(
  invalidCasesV013,
) as readonly InvalidCompositionCase[];

/** The reference composition as the last build of schema 0.14 had it, frozen (D35.4, D70). */
export const referenceCompositionV014: unknown = deepFreeze(referenceV014);

/** The negative corpus of schema 0.14, frozen with it: patches over `referenceCompositionV014`. */
export const invalidCompositionCasesV014 = deepFreeze(
  invalidCasesV014,
) as readonly InvalidCompositionCase[];

/** The reference composition as the last build of schema 0.15 had it, frozen (D35.4, D71). */
export const referenceCompositionV015: unknown = deepFreeze(referenceV015);

/** The negative corpus of schema 0.15, frozen with it: patches over `referenceCompositionV015`. */
export const invalidCompositionCasesV015 = deepFreeze(
  invalidCasesV015,
) as readonly InvalidCompositionCase[];

/** The reference composition as the last build of schema 0.16 had it, frozen (D35.4, D72). */
export const referenceCompositionV016: unknown = deepFreeze(referenceV016);

/** The negative corpus of schema 0.16, frozen with it: patches over `referenceCompositionV016`. */
export const invalidCompositionCasesV016 = deepFreeze(
  invalidCasesV016,
) as readonly InvalidCompositionCase[];

/** The reference composition as the last build of schema 0.17 had it, frozen (D35.4, D73). */
export const referenceCompositionV017: unknown = deepFreeze(referenceV017);

/** The negative corpus of schema 0.17, frozen with it: patches over `referenceCompositionV017`. */
export const invalidCompositionCasesV017 = deepFreeze(
  invalidCasesV017,
) as readonly InvalidCompositionCase[];

/** The reference composition as the last build of schema 0.18 had it, frozen (D35.4, D74). */
export const referenceCompositionV018: unknown = deepFreeze(referenceV018);

/** The negative corpus of schema 0.18, frozen with it: patches over `referenceCompositionV018`. */
export const invalidCompositionCasesV018 = deepFreeze(
  invalidCasesV018,
) as readonly InvalidCompositionCase[];

/** The reference composition as the last build of schema 0.19 had it, frozen (D35.4, D75). */
export const referenceCompositionV019: unknown = deepFreeze(referenceV019);

/** The negative corpus of schema 0.19, frozen with it: patches over `referenceCompositionV019`. */
export const invalidCompositionCasesV019 = deepFreeze(
  invalidCasesV019,
) as readonly InvalidCompositionCase[];

/** The reference composition as the last build of schema 0.20 had it, frozen (D35.4, D76). */
export const referenceCompositionV020: unknown = deepFreeze(referenceV020);

/** The negative corpus of schema 0.20, frozen with it: patches over `referenceCompositionV020`. */
export const invalidCompositionCasesV020 = deepFreeze(
  invalidCasesV020,
) as readonly InvalidCompositionCase[];

/** The reference composition as the last build of schema 0.21 had it, frozen (D35.4, D77). */
export const referenceCompositionV021: unknown = deepFreeze(referenceV021);

/** The negative corpus of schema 0.21, frozen with it: patches over `referenceCompositionV021`. */
export const invalidCompositionCasesV021 = deepFreeze(
  invalidCasesV021,
) as readonly InvalidCompositionCase[];

/** The reference composition as the last build of schema 0.22 had it, frozen (D35.4, D78). */
export const referenceCompositionV022: unknown = deepFreeze(referenceV022);

/** The negative corpus of schema 0.22, frozen with it: patches over `referenceCompositionV022`. */
export const invalidCompositionCasesV022 = deepFreeze(
  invalidCasesV022,
) as readonly InvalidCompositionCase[];

/** The reference composition as the last build of schema 0.23 had it, frozen (D35.4, D82.8). */
export const referenceCompositionV023: unknown = deepFreeze(referenceV023);

/** The negative corpus of schema 0.23, frozen with it: patches over `referenceCompositionV023`. */
export const invalidCompositionCasesV023 = deepFreeze(
  invalidCasesV023,
) as readonly InvalidCompositionCase[];

/**
 * A template of schema 0.24 (D58): a 2 s card, 640x360, 30 fps, with seven
 * inputs — a text `name` and a number `rank` filling the placeholders of the
 * title, a colour `brand` bound to the background, a text `tagline` bound to
 * the tagline, an image `photo` bound to the photo's asset, a boolean
 * `show-photo` and a list `team` that nothing reads — and every bound
 * property and asset holding its input's default.
 */
export const templateComposition: unknown = deepFreeze(template);

/**
 * A template of schema 0.24 with conditions and repeats (D59): 640x360, 30 fps;
 * an intro scene kept while the boolean `show-intro` holds, then a scene
 * repeated for each person of the list `people` for the duration its item
 * names, with the colour, the name, and the portrait of the item, and a
 * credits scene whose line repeats for each person, a note kept while the list
 * is empty, and a line kept while the text `mood` equals `stars`.
 */
export const repeatsComposition: unknown = deepFreeze(repeats);

/**
 * The instantiation of `repeatsComposition` with its defaults, written by hand
 * (D59.4): two person scenes of 0.8 s and 1.2 s with the IDs of copies 0 and 1,
 * two credit lines 0.4 s apart, one portrait asset per person, the transition
 * into the first copy, no empty note, and 3.8 s in all.
 */
export const repeatsInstantiated: unknown = deepFreeze(repeatsExpected);

/**
 * A composition of schema 0.24 with captions (D57): 3 s, 640x360, 30 fps, one
 * scene with a background and a captions node of ten words, centred at the
 * bottom of its box, at most 16 characters a line and two lines a page, so
 * that the words make four lines and two pages. The first word starts at
 * 200 ms, and a pause from 1.6 s to 1.8 s ends the first page. Every word uses
 * only characters of `FONT_GLYPHS`.
 */
export const captionsComposition: unknown = deepFreeze(captions);

/**
 * The golden timestamps of the captions composition (D57): before the first
 * word, the first word spoken, a word of the second line, the pause at the end
 * of the first page, a word of the second page, and its last word.
 */
export const captionsGoldenTimestamps: readonly GoldenTimestamp[] = Object.freeze(
  [
    { timeUs: 0, frame: 0 },
    { timeUs: 300_000, frame: 9 },
    { timeUs: 1_200_000, frame: 36 },
    { timeUs: 1_700_000, frame: 51 },
    { timeUs: 2_600_000, frame: 78 },
    { timeUs: 2_966_666, frame: 89 },
  ].map((timestamp) => Object.freeze(timestamp)),
);

/**
 * A composition of schema 0.24 with five scenes and a transition of each kind
 * between them (D56): a crossfade, a fade through white, a slide to the left,
 * and a wipe upwards, each 400 ms, and in the last scene a crossfade of 400 ms
 * between an image and a text of one layer. Every scene and every transition
 * starts on the frame grid of 30 fps.
 */
export const transitionsComposition: unknown = deepFreeze(transitions);

/**
 * The golden timestamps of the transitions composition (D56): the middle of the
 * crossfade, a quarter and three quarters of the fade through a colour, the
 * middle of the slide and of the wipe, and the middle of the clip crossfade.
 */
export const transitionsGoldenTimestamps: readonly GoldenTimestamp[] = Object.freeze(
  [
    { timeUs: 800_000, frame: 24 },
    { timeUs: 1_300_000, frame: 39 },
    { timeUs: 1_500_000, frame: 45 },
    { timeUs: 2_000_000, frame: 60 },
    { timeUs: 2_600_000, frame: 78 },
    { timeUs: 3_000_000, frame: 90 },
  ].map((timestamp) => Object.freeze(timestamp)),
);

/**
 * A composition of schema 0.24 with clip transitions of every kind (D66):
 * 11 s, 640x360, 30 fps, four scenes. In `scene-up` eight clips of one layer
 * follow each other, images and texts of 800 ms every 600 ms, each later one
 * above the one before it, joined by transitions of 200 ms of the seven kinds
 * in this order: crossfade, fade through a colour, slide left, wipe down, push
 * up, zoom from 0.25, and iris from a point at the bottom left. `scene-down`
 * has the same chain with the clips listed the other way round, so that each
 * outgoing clip lies above the incoming one. `scene-group` slides one child of
 * a scaled group into the place of another, in the frame of the group. The
 * scenes are joined by a push to the left, a zoom from 2, and an iris from the
 * centre, each 400 ms. Every value is an integer or a short decimal.
 */
export const clipTransitionsComposition: unknown = deepFreeze(clipTransitions);

/**
 * The golden timestamps of `clipTransitionsComposition`, with their frame index
 * at 30 fps: the middle of each clip transition of `scene-up`, of the scene
 * push, of each clip transition of `scene-down`, of the scene zoom, of the
 * slide in the group, and of the scene iris.
 */
export const clipTransitionsGoldenTimestamps: readonly GoldenTimestamp[] = Object.freeze(
  [
    { timeUs: 700_000, frame: 21 },
    { timeUs: 1_300_000, frame: 39 },
    { timeUs: 1_900_000, frame: 57 },
    { timeUs: 2_500_000, frame: 75 },
    { timeUs: 3_100_000, frame: 93 },
    { timeUs: 3_700_000, frame: 111 },
    { timeUs: 4_300_000, frame: 129 },
    { timeUs: 4_800_000, frame: 144 },
    { timeUs: 5_300_000, frame: 159 },
    { timeUs: 5_900_000, frame: 177 },
    { timeUs: 6_500_000, frame: 195 },
    { timeUs: 7_100_000, frame: 213 },
    { timeUs: 7_700_000, frame: 231 },
    { timeUs: 8_300_000, frame: 249 },
    { timeUs: 8_900_000, frame: 267 },
    { timeUs: 9_400_000, frame: 282 },
    { timeUs: 9_900_000, frame: 297 },
    { timeUs: 10_400_000, frame: 312 },
  ].map((timestamp) => Object.freeze(timestamp)),
);

/**
 * A composition of schema 0.24 with eased motion (D67): 2.6 s, 640x360, 30 fps,
 * two scenes. In `scene-motion` seven images of 40x40 move from x 40 to x 480
 * over the first 1.6 s, one row each, with the easings linear, hold, ease-in,
 * ease-out, ease-in-out, a cubic Bézier that overshoots (0.34, 1.56, 0.64,
 * 1), and four steps at their ends. A slide to the left eased in and out over
 * 400 ms leads to `scene-end`, where an image grows from scale 1 to 6, eased
 * out, over 800 ms.
 */
export const easingComposition: unknown = deepFreeze(easing);

/**
 * The golden timestamps of `easingComposition`, with their frame index at 30
 * fps: a quarter, a half, and three quarters of the motion, a quarter of the
 * slide, where ease-in-out is not yet half way, and three quarters of the
 * growth.
 */
export const easingGoldenTimestamps: readonly GoldenTimestamp[] = Object.freeze(
  [
    { timeUs: 400_000, frame: 12 },
    { timeUs: 800_000, frame: 24 },
    { timeUs: 1_200_000, frame: 36 },
    { timeUs: 1_700_000, frame: 51 },
    { timeUs: 2_200_000, frame: 66 },
  ].map((timestamp) => Object.freeze(timestamp)),
);

/**
 * A composition of schema 0.24 with every property of D68 (2 s, 640x360, 30
 * fps, one scene): a background whose colour moves from #1d2939 to #f79009;
 * an image rotated by 10 degrees about its centre that turns 300 degrees more,
 * eased in and out; an image under cover whose crop grows to 200, 300, 200,
 * and 100 per mille over the first second, eased out; an image whose corners
 * round to 60 px while its box grows from 120x120 to 180x90; a text rotated by
 * -8 degrees about its bottom-left corner whose colour moves from white to
 * #12b76a; and a group about the centre of the canvas that turns 20 degrees,
 * holding a video cropped to its middle half with rounded corners.
 */
export const motionComposition: unknown = deepFreeze(motion);

/**
 * The golden timestamps of `motionComposition`, with their frame index at 30
 * fps: the start, a quarter, a half, and three quarters.
 */
export const motionGoldenTimestamps: readonly GoldenTimestamp[] = Object.freeze(
  [
    { timeUs: 0, frame: 0 },
    { timeUs: 500_000, frame: 15 },
    { timeUs: 1_000_000, frame: 30 },
    { timeUs: 1_500_000, frame: 45 },
  ].map((timestamp) => Object.freeze(timestamp)),
);

/**
 * A composition of schema 0.24 with text styles and text animated in fragments
 * (D69): 2 s, 640x360, 30 fps, one scene with four texts of 40 px on a dark
 * background. `Kadrion danced` has an outline outside its glyphs and enters
 * letter by letter, forward, 60 ms apart, each letter rising 30 px while it
 * fades in over 300 ms, eased out. `big dancing stars` casts a soft shadow and
 * enters word by word from the centre, 150 ms apart, each word growing from
 * nothing and turning from -30 degrees over 400 ms. `Kadrion` and `is steady`
 * stand on a rounded translucent box and leave line by line, backward, 200
 * ms apart, so that the last line has gone at the node's end. `radiant comets`
 * flashes amber and hops letter by letter in a random order of seed 7 from
 * 0.8 s, 40 ms apart, while its two words, from the edges, sway by 8 degrees
 * and fade in from 0.4 over the first 500 ms.
 */
export const textComposition: unknown = deepFreeze(text);

/**
 * The golden timestamps of `textComposition`, with their frame index at 30 fps:
 * the letters and words in mid-stagger, the random letters in mid-stagger
 * twice, and the lines leaving one after the other.
 */
export const textGoldenTimestamps: readonly GoldenTimestamp[] = Object.freeze(
  [
    { timeUs: 300_000, frame: 9 },
    { timeUs: 900_000, frame: 27 },
    { timeUs: 1_500_000, frame: 45 },
    { timeUs: 1_800_000, frame: 54 },
  ].map((timestamp) => Object.freeze(timestamp)),
);

/**
 * A composition of schema 0.24 with animated captions (D70): 2 s, 640x360, 30
 * fps, one scene with a background, a safe area, and two captions nodes of 32
 * px, two lines a page. `captions-pop` has an outline outside its glyphs; its
 * spoken word turns amber, grows by 1.25, and is underlined; each page enters
 * word by word, forward, 80 ms apart, every word rising 20 px while it fades in
 * over 200 ms, and leaves from the edges, 50 ms apart, every word fading out
 * over 150 ms. `captions-bounce` casts a soft shadow over a rounded translucent
 * box behind every line; its spoken word turns white on a red box, hops 12 px
 * and turns from -6 degrees over 200 ms; each page enters line by line,
 * backward, 120 ms apart, every line growing from nothing while it turns from
 * green to its colour over 240 ms.
 */
export const captionsMotionComposition: unknown = deepFreeze(captionsMotion);

/**
 * The golden timestamps of `captionsMotionComposition`, with their frame index
 * at 30 fps: both first pages entering, a word grown and underlined beside a
 * word mid-hop, the first page of `captions-pop` leaving, and its last page
 * leaving while a word of the second page of `captions-bounce` hops on its box.
 */
export const captionsMotionGoldenTimestamps: readonly GoldenTimestamp[] = Object.freeze(
  [
    { timeUs: 200_000, frame: 6 },
    { timeUs: 500_000, frame: 15 },
    { timeUs: 1_000_000, frame: 30 },
    { timeUs: 1_600_000, frame: 48 },
  ].map((timestamp) => Object.freeze(timestamp)),
);

/**
 * A composition of schema 0.24 with effects (D71): 2.2 s, 640x360, 30 fps,
 * three scenes, the first two joined by a blur dissolve of 400 ms and radius
 * 12. `scene-effects`,
 * saturated by 1.2 as a whole, holds an image whose blur falls from 8 to 0 over
 * 600 ms, eased out; a rounded image whose black shadow moves out to (10, 12);
 * a video in grey with more contrast; an image whose hue turns 180 degrees over
 * the scene, a quarter inverted; a group brightened from 0.5 to 1.3 around a
 * saturated image and a text with a sharp red shadow; and a slightly blurred
 * text whose soft shadow turns from green to violet. `scene-dissolve`, its
 * contrast falling from 1 to 0.6, dissolves an image into a text through a
 * blur of radius 10 over 200 ms. `scene-kinds`, 400 ms, shows every kind at
 * rest over an image, a text, and a video, one column per kind. Its texts use
 * only characters of `FONT_GLYPHS`.
 */
export const effectsComposition: unknown = deepFreeze(effects);

/**
 * The golden timestamps of `effectsComposition`, with their frame index at 30
 * fps: the blur and the shadow on their way, every effect at rest, the middle
 * of the scene transition, the middle of the clip transition, the end of the
 * dissolve with the text alone, and every kind at rest.
 */
export const effectsGoldenTimestamps: readonly GoldenTimestamp[] = Object.freeze(
  [
    { timeUs: 200_000, frame: 6 },
    { timeUs: 600_000, frame: 18 },
    { timeUs: 1_000_000, frame: 30 },
    { timeUs: 1_300_000, frame: 39 },
    { timeUs: 1_600_000, frame: 48 },
    { timeUs: 2_000_000, frame: 60 },
  ].map((timestamp) => Object.freeze(timestamp)),
);

/**
 * A composition of schema 0.24 with the effects of SVG filters (D72): 1.6 s,
 * 640x360, 30 fps, two scenes. `scene-svg`, whose vignette deepens from 0 to
 * 0.5 over 1 s, holds an image whose curves mix in from 0 to 1, eased in and
 * out; a video graded from cool to warm; a text whose orange glow spreads from
 * 2 to 10, eased out; a strip of the image brightened, its red channel
 * inverted by curves, and blurred, in that order, CSS and SVG filters in one
 * chain; a group glowing from violet to green around a vignetted image and a
 * text; and the green screen of `GREEN_SCREEN_FIXTURE` keyed by its green
 * channel over the image, its spill suppressed from 0 to 1. `scene-kinds`,
 * 400 ms, shows every kind at rest over an image, a green text, and a video,
 * one column per kind, and a strip of the video keyed by its blue channel. Its
 * texts use only characters of `FONT_GLYPHS`.
 */
export const effectsSvgComposition: unknown = deepFreeze(effectsSvg);

/**
 * The golden timestamps of `effectsSvgComposition`, with their frame index at
 * 30 fps: every animation at its start, on its way, and at its end, and every
 * kind at rest.
 */
export const effectsSvgGoldenTimestamps: readonly GoldenTimestamp[] = Object.freeze(
  [
    { timeUs: 0, frame: 0 },
    { timeUs: 500_000, frame: 15 },
    { timeUs: 1_000_000, frame: 30 },
    { timeUs: 1_400_000, frame: 42 },
  ].map((timestamp) => Object.freeze(timestamp)),
);

/**
 * A composition of schema 0.24 with vector shapes (D73): 1.6 s, 640x360, 30
 * fps, one scene on a dark background. A rectangle filled with a linear
 * gradient, its stroke dashed, grows and rounds its corners, eased in and out;
 * an ellipse filled with a radial gradient thickens its stroke and turns it
 * red; a star, a polygon of ten points, is drawn on by its stroke over 1 s
 * while its fill turns from amber to green; a path of every kind of command,
 * with a hole by the even-odd rule, morphs into a path of the same commands
 * over 1.2 s, eased in and out; and a turning group holds an open curve whose
 * drawn half runs from its start to its end, and, from 200 ms for 1.2 s, a
 * badge scaled about its centre with a dash pattern and a drop shadow.
 */
export const shapesComposition: unknown = deepFreeze(shapes);

/**
 * The golden timestamps of `shapesComposition`, with their frame index at 30
 * fps: every geometry at its start, the star drawn half way, every animation
 * at its end, and the group still turning.
 */
export const shapesGoldenTimestamps: readonly GoldenTimestamp[] = Object.freeze(
  [
    { timeUs: 0, frame: 0 },
    { timeUs: 500_000, frame: 15 },
    { timeUs: 1_000_000, frame: 30 },
    { timeUs: 1_400_000, frame: 42 },
  ].map((timestamp) => Object.freeze(timestamp)),
);

/**
 * A composition of schema 0.24 with an SVG asset (D74): 1.6 s, 640x360, 30
 * fps, one scene on a dark background. The badge of `generateSvgAsset` is
 * shown by an image node on the left; on the right stand the shape nodes that
 * `svgToShapes` gave for the same drawing, in a box of the same size — the
 * star turns 90° over 1 s, eased in and out, the curve is drawn on over 1 s,
 * and the sun fades to 0.4 over 1.2 s; and a smaller image of the same asset,
 * contained in its box, turns from -20° to 20° over 1.4 s.
 */
export const svgComposition: unknown = deepFreeze(svg);

/**
 * The golden timestamps of `svgComposition`, with their frame index at 30
 * fps: the drawing at its start, half way, at the end of the star and the
 * curve, and with the image still turning.
 */
export const svgGoldenTimestamps: readonly GoldenTimestamp[] = Object.freeze(
  [
    { timeUs: 0, frame: 0 },
    { timeUs: 500_000, frame: 15 },
    { timeUs: 1_000_000, frame: 30 },
    { timeUs: 1_400_000, frame: 42 },
  ].map((timestamp) => Object.freeze(timestamp)),
);

/**
 * A composition of schema 0.24 with blend modes, masks, and mattes (D75): 2 s,
 * 640x360, 30 fps, one scene on a dark background. On the left, sixteen
 * ellipses with a vertical gradient from green to red, one per blend mode in
 * the order of the schema, lie over a horizontal gradient from violet through
 * white to amber, and under them a bar of amber is shown through the image
 * asset by its luminance. On the right, a photo is masked by a rectangle whose
 * corners round to a circle over 1.5 s, eased in and out, while its edge
 * softens to a feather of 12 over 1 s; a text has a diagonal band cut out of
 * it by an inverted, feathered polygon mask that crosses it over 1.9 s; a
 * group that blends by lighten holds a photo matted by the alpha of a star
 * that turns 72° about its centre over 1.5 s; and a photo is matted, inverted,
 * by the luminance of a white-to-black gradient that is active from 0.5 s and
 * slides 100 pixels to the right over 1 s.
 */
export const compositingComposition: unknown = deepFreeze(compositing);

/**
 * The golden timestamps of `compositingComposition`, with their frame index at
 * 30 fps: every mask at its start with the gradient matte not yet active, the
 * matte just active, the feather at its end, and every animation but the band
 * at its end.
 */
export const compositingGoldenTimestamps: readonly GoldenTimestamp[] = Object.freeze(
  [
    { timeUs: 0, frame: 0 },
    { timeUs: 500_000, frame: 15 },
    { timeUs: 1_000_000, frame: 30 },
    { timeUs: 1_500_000, frame: 45 },
  ].map((timestamp) => Object.freeze(timestamp)),
);

/**
 * A composition of schema 0.24 with nested compositions (D76): 2 s, 640x360,
 * 30 fps, one scene on a dark background, and two definitions. `card`, 320x180
 * and 1.5 s, holds a background, a photo masked by a feathered ellipse that
 * slides 24 pixels to the right, the text `Kadrion` with an amber glow that
 * spreads from 2 to 10, two bars of one layer joined by a crossfade of 300 ms,
 * an instance of `badge` from 0.2 s, and a sound of 1 s with fades. `badge`,
 * 80x80 and 1 s, holds a red disc and an amber square that turns 90° about
 * its centre, eased in and out. The scene places `card` three times — at the
 * top left as its own size, at the bottom right half a second later, and
 * turned by 6°, at 0.85 opacity, covering a box of 240x120 cut to rounded
 * corners from 0.3 s — and `badge` alone at 1.5 times its size, blurred.
 */
export const nestedComposition: unknown = deepFreeze(nested);

/**
 * The golden timestamps of `nestedComposition`, with their frame index at 30
 * fps: every instance at its start but the two that start later, the
 * crossfade of the bars under way in the left card, the badge of the left card
 * near its end, and the right card after the left one ends.
 */
export const nestedGoldenTimestamps: readonly GoldenTimestamp[] = Object.freeze(
  [
    { timeUs: 0, frame: 0 },
    { timeUs: 800_000, frame: 24 },
    { timeUs: 1_100_000, frame: 33 },
    { timeUs: 1_600_000, frame: 48 },
  ].map((timestamp) => Object.freeze(timestamp)),
);

/**
 * A composition of schema 0.24 with elements (D77): 2 s, 640x360, 30 fps, one
 * scene on a dark background, and two definitions with templates. `lower-third`,
 * 360x80, holds a background bound to the colour input `accent`, the text
 * `{{title}}` filled from the text input `title`, and a white disc kept while
 * the boolean `show-badge` holds; its source hash is the one a host gave it.
 * `speech`, 640x120, holds two captions nodes whose words are bound to the list
 * of timed words `words`, one kept while the text `style` is `plain` and the
 * other while it is `bold`. The scene places `lower-third` twice — green with
 * the title `Dance`, and with its default colour, the title `Kadrion design`,
 * and no disc — and `speech` once, bold, with five words of its own. Every
 * text uses only characters of `FONT_GLYPHS`.
 */
export const elementsComposition: unknown = deepFreeze(elements);

/**
 * The golden timestamps of `elementsComposition`, with their frame index at 30
 * fps: the first spoken word, the second, the third, and the last.
 */
export const elementsGoldenTimestamps: readonly GoldenTimestamp[] = Object.freeze(
  [
    { timeUs: 0, frame: 0 },
    { timeUs: 500_000, frame: 15 },
    { timeUs: 1_000_000, frame: 30 },
    { timeUs: 1_600_000, frame: 48 },
  ].map((timestamp) => Object.freeze(timestamp)),
);

/**
 * A composition of schema 0.24 with two Custom HTML elements for AI authors
 * (D78): 10 s, 640x360, 30 fps, on a dark background. `html-css`, 640x220 at
 * the top for the whole 10 s, is CSS alone: a ball sized by the number
 * parameter `ball` and coloured by the colour parameter `accent` slides,
 * turns, and rounds its corners, the word `Kadrion` in the font `asset-font`
 * rises, and a bar fills over the 10 s. `html-script`, 640x140 below it from
 * 1 s for 9 s, is script: twelve dots placed by the seeded `Math.random` and
 * dimmed by it each frame, and the text parameter `label` revealed letter by
 * letter from `Date.now` and moved by `performance.now`, in a
 * `requestAnimationFrame` callback. Both read only the managed clock, so each
 * frame depends on its time alone. Every text uses only characters of
 * `FONT_GLYPHS`.
 */
export const customHtmlComposition: unknown = deepFreeze(customHtml);

/**
 * The golden timestamps of `customHtmlComposition`, with their frame index at
 * 30 fps: the five of the reference spike.
 */
export const customHtmlGoldenTimestamps: readonly GoldenTimestamp[] = Object.freeze(
  [
    { timeUs: 0, frame: 0 },
    { timeUs: 2_500_000, frame: 75 },
    { timeUs: 5_000_000, frame: 150 },
    { timeUs: 7_500_000, frame: 225 },
    { timeUs: 9_900_000, frame: 297 },
  ].map((timestamp) => Object.freeze(timestamp)),
);

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

/**
 * The hand-written pair of the step 0.5 → 0.6 (D35.5, D56): the document the
 * pair of 0.4 → 0.5 ends with, whose one scene gains `transitions: []` at its
 * end, and so does the composition.
 */
export const migrationPair05To06: MigrationPair = deepFreeze({
  before: migration06Before,
  after: migration06After,
});

/**
 * The hand-written pair of the step 0.6 → 0.7 (D35.5, D57): the document the
 * pair of 0.5 → 0.6 ends with, whose `schemaVersion` alone changes.
 */
export const migrationPair06To07: MigrationPair = deepFreeze({
  before: migration07Before,
  after: migration07After,
});

/**
 * The hand-written pair of the step 0.7 → 0.8 (D35.5, D58): the document the
 * pair of 0.6 → 0.7 ends with, whose `schemaVersion` changes and which gains an
 * empty template section at its end.
 */
export const migrationPair07To08: MigrationPair = deepFreeze({
  before: migration08Before,
  after: migration08After,
});

/**
 * The hand-written pair of the step 0.8 → 0.9 (D35.5, D59): the document the
 * pair of 0.7 → 0.8 ends with, whose `schemaVersion` changes and whose template
 * section gains an empty list of conditions and of repeats.
 */
export const migrationPair08To09: MigrationPair = deepFreeze({
  before: migration09Before,
  after: migration09After,
});

/**
 * The hand-written pair of the step 0.9 → 0.10 (D35.5, D63): the document the
 * pair of 0.8 → 0.9 ends with, whose `schemaVersion` changes and whose image
 * and two videos, the image and one video children of a group, gain the
 * centred focus `{ x: 500, y: 500 }` right after their `fit`.
 */
export const migrationPair09To10: MigrationPair = deepFreeze({
  before: migration10Before,
  after: migration10After,
});

/**
 * The hand-written pair of the step 0.10 → 0.11 (D35.5, D66): the document the
 * pair of 0.9 → 0.10 ends with, whose `schemaVersion` alone changes.
 */
export const migrationPair010To011: MigrationPair = deepFreeze({
  before: migration11Before,
  after: migration11After,
});

/**
 * The hand-written pair of the step 0.11 → 0.12 (D35.5, D67): the document the
 * pair of 0.10 → 0.11 ends with, whose `schemaVersion` changes, whose two
 * animations lose their `interpolation`, and each of whose keyframes gains
 * `easing: { kind: 'linear' }` right after its `value`. It has no transition,
 * so the compatibility corpus carries the transitions of the step.
 */
export const migrationPair011To012: MigrationPair = deepFreeze({
  before: migration12Before,
  after: migration12After,
});

/**
 * The hand-written pair of the step 0.12 → 0.13 (D35.5, D68): the document the
 * pair of 0.11 → 0.12 ends with, whose `schemaVersion` changes, each of whose
 * transformable nodes gains `rotation: 0` and `origin: { x: 0, y: 0 }` right
 * after its `scale`, each of whose images and videos gains a crop of four
 * zero insets and `cornerRadius: 0` right after its `focus`, and whose
 * background gains an empty `animations` right after its `color`.
 */
export const migrationPair012To013: MigrationPair = deepFreeze({
  before: migration13Before,
  after: migration13After,
});

/**
 * The hand-written pair of the step 0.13 → 0.14 (D35.5, D69): the document the
 * pair of 0.12 → 0.13 ends with, whose `schemaVersion` changes and each of
 * whose text nodes gains a style with no stroke, no shadow, and no box and an
 * empty `textAnimations` right after its `color`.
 */
export const migrationPair013To014: MigrationPair = deepFreeze({
  before: migration14Before,
  after: migration14After,
});

/**
 * The hand-written pair of the step 0.14 → 0.15 (D35.5, D70): the document the
 * pair of 0.13 → 0.14 ends with, whose `schemaVersion` changes and which gains
 * a safe area of the whole canvas right after its `height`; it has no captions,
 * whose style the step changes, so the unit tests of the step state those.
 */
export const migrationPair014To015: MigrationPair = deepFreeze({
  before: migration15Before,
  after: migration15After,
});

/**
 * The hand-written pair of the step 0.15 → 0.16 (D35.5, D71): the document the
 * pair of 0.14 → 0.15 ends with, whose `schemaVersion` changes and whose scene,
 * group, and the image, video, and text in the group and the scene gain an
 * empty list of effects as their last field; Custom HTML gains none.
 */
export const migrationPair015To016: MigrationPair = deepFreeze({
  before: migration16Before,
  after: migration16After,
});

/**
 * The hand-written pair of the step 0.16 → 0.17 (D35.5, D72): the document the
 * pair of 0.15 → 0.16 ends with, whose `schemaVersion` changes and nothing
 * else, since 0.17 only adds kinds of effects.
 */
export const migrationPair016To017: MigrationPair = deepFreeze({
  before: migration17Before,
  after: migration17After,
});

/**
 * The hand-written pair of the step 0.17 → 0.18 (D35.5, D73): the document the
 * pair of 0.16 → 0.17 ends with, whose `schemaVersion` changes and nothing
 * else, since 0.18 only adds the node type `shape`.
 */
export const migrationPair017To018: MigrationPair = deepFreeze({
  before: migration18Before,
  after: migration18After,
});

/**
 * The hand-written pair of the step 0.18 → 0.19 (D35.5, D74): the document the
 * pair of 0.17 → 0.18 ends with, whose `schemaVersion` changes and nothing
 * else, since 0.19 only adds the asset type `svg`.
 */
export const migrationPair018To019: MigrationPair = deepFreeze({
  before: migration19Before,
  after: migration19After,
});

/**
 * The hand-written pair of the step 0.19 → 0.20 (D35.5, D75): the document the
 * pair of 0.18 → 0.19 ends with, whose `schemaVersion` changes and whose
 * images, videos, texts, captions, shapes, and groups, at any depth, end with
 * no mask, no matte, and the normal blend mode.
 */
export const migrationPair019To020: MigrationPair = deepFreeze({
  before: migration20Before,
  after: migration20After,
});

/**
 * The hand-written pair of the step 0.20 → 0.21 (D35.5, D76): the document the
 * pair of 0.19 → 0.20 ends with, whose `schemaVersion` changes and which gains
 * an empty list of definitions directly before its template.
 */
export const migrationPair020To021: MigrationPair = deepFreeze({
  before: migration21Before,
  after: migration21After,
});

/**
 * The hand-written pair of the step 0.21 → 0.22 (D35.5, D77): the document the
 * pair of 0.20 → 0.21 ends with, whose `schemaVersion` changes; it has no
 * definition and no instance, so nothing else does.
 */
export const migrationPair021To022: MigrationPair = deepFreeze({
  before: migration22Before,
  after: migration22After,
});

/**
 * The hand-written pair of the step 0.22 → 0.23 (D35.5, D78): the document the
 * pair of 0.21 → 0.22 ends with, whose `schemaVersion` changes and whose one
 * Custom HTML element gains an empty list of fonts and of parameters.
 */
export const migrationPair022To023: MigrationPair = deepFreeze({
  before: migration23Before,
  after: migration23After,
});

/**
 * The hand-written pair of the step 0.23 → 0.24 (D35.5, D82.8): the document
 * the pair of 0.22 → 0.23 ends with, whose `schemaVersion` changes and whose
 * video nodes and audio clips each gain the time map of speed 1 forwards —
 * `sourceStartRemainder: 0`, `speed: { num: 1, den: 1 }`, and `reverse: false`
 * — after `sourceStartUs`.
 */
export const migrationPair023To024: MigrationPair = deepFreeze({
  before: migration24Before,
  after: migration24After,
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

/** A small composition of schema 0.24 whose nodes begin and end inside it (D42.2). */
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

/**
 * A composition of schema 0.24 whose pictures are placed off their centre
 * (D63): 1 s, 640x360, 30 fps, one scene with a background and the reference
 * image and the video of `VIDEO_FIXTURE` twice each — the image with `cover` in
 * a tall box, focused on its left edge, and with `contain` in a wide box,
 * focused on its top right corner; the video with `cover` in a tall box,
 * focused at 850 per mille of its width, and with `contain` in a tall box,
 * focused on its bottom edge.
 */
export const focusComposition: unknown = deepFreeze(focus);

/** The golden timestamps of `focusComposition`, with their frame index at 30 fps. */
export const focusGoldenTimestamps: readonly GoldenTimestamp[] = deepFreeze([
  { timeUs: 0, frame: 0 },
  { timeUs: 500_000, frame: 15 },
]);

/**
 * A composition of schema 0.24 whose clips play at another speed, frozen, or
 * reversed (D82): 2 s, 640x360, 30 fps, one scene with a background and the
 * video with sound of `VIDEO_SOUND_FIXTURE` in six nodes — at a quarter of
 * its speed with a remainder, at half, at three halves, at four times,
 * reversed, and frozen (silent) — and two audio clips of the reference sound,
 * one at half speed and one reversed at three halves. Its assets are the video
 * that `videoSoundFixtureArguments` makes and the sound of
 * `generateReferenceAssets`.
 */
export const speedComposition: unknown = deepFreeze(speed);

/** The golden timestamps of `speedComposition`, with their frame index at 30 fps. */
export const speedGoldenTimestamps: readonly GoldenTimestamp[] = deepFreeze([
  { timeUs: 0, frame: 0 },
  { timeUs: 500_000, frame: 15 },
  { timeUs: 1_000_000, frame: 30 },
  { timeUs: 1_500_000, frame: 45 },
  { timeUs: 1_966_666, frame: 59 },
]);

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

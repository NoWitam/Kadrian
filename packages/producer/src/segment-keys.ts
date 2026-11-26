/**
 * The key of a segment (D92.1): a SHA-256 of what decides the bytes of its
 * file, computed without a browser, FFmpeg, or a clock. Two segments with
 * equal keys are the same bytes in the environment of D26.2 (D47.3, D47.6),
 * so a host may join a segment it stored from a render of an earlier version
 * of a document wherever the key is the same (D92.3).
 *
 * The key of a segment is `sha256(canonicalJson(input))`, the hash and the
 * JSON of the `compositionHash` (D28.7): the SHA-256 of the UTF-8 bytes of
 * JSON whose object keys are sorted by UTF-16 code units, with arrays in
 * order, no whitespace, and numbers and strings as `JSON.stringify` writes
 * them (the shortest decimal that reads back as the same binary64, `-0` as
 * `0`). The input is the object
 *
 *     { browser, canvas, ffmpeg, frames, keyVersion, preset, runtime, segmentFrames }
 *
 * - `browser`: `{ args, capture, chromiumRevision, chromiumVersion, clear,
 *   deviceScaleFactor, image, locale, playwrightCore, timezone }`, the pins of
 *   D26 and D90, the capture `fast` (D88.2), and the clear `white` (D89.2) of
 *   every video job;
 * - `canvas`: `{ fps, height, width }` of the composition;
 * - `ffmpeg`: `{ archiveSha256, asset, configuration, ffmpegSha256,
 *   ffprobeSha256, release, segmentArgs, version }`, the pinned FFmpeg of
 *   D29.1 and the arguments of a segment (D47.3) with the preset's graph and
 *   the output written as `<output>`;
 * - `frames`: one record per frame of the segment, in order (below);
 * - `keyVersion`: `SEGMENT_KEY_VERSION`;
 * - `preset`: the MP4 preset of the manifests (D29.5), its graph included;
 * - `runtime`: the `contentHash` of the runtime build (D21);
 * - `segmentFrames`: the segment length of D47.1.
 *
 * A frame's record is `{ assets, definitions, nodes, scenes, state }`:
 *
 * - `state`: `evaluateComposition` at the frame's time (D19.4) without the
 *   composition's `timeUs`; the times of its scenes stay;
 * - `nodes`: the document's object of every node the scenes of the state list,
 *   in the order of the state (a group with its children);
 * - `definitions`: the document's object of the definition of every instance
 *   the state lists, at any depth, each once, in the order of the state;
 * - `scenes`: for every scene of the state, its document object without its
 *   `nodes` (listed above), its sounds (`clips`, the audio pass's, D47.4), and
 *   its `durationUs` (which places the scenes, as the state shows), and with
 *   `sceneTransitions`, the document's scene transitions from or to it: the
 *   mount reads both beside the state at every frame of the scene (a frame for
 *   each side of a clip transition, a layer for a scene that fades);
 * - `assets`: `{ contentHash, id, type }` of every asset of the document whose
 *   ID is a string anywhere in the other four, sorted by ID: a font, a mask's
 *   image, and an element's asset input included.
 *
 * Neither the composition time nor the frame index is read: a span that moves
 * on the timeline keeps the keys of its segments (D92, question 4). Nor the
 * document's ID, hash, or anything no frame draws.
 */
import { createHash } from 'node:crypto';

import {
  evaluateComposition,
  fontMetrics,
  measuredFontIds,
  type CompositionState,
  type FontMetrics,
  type NodeState,
} from '@kadrion/runtime';
import { frameToTimeUs, type Definition, type ValidatedComposition } from '@kadrion/schema';
import { RenderError } from '@kadrion/renderer-dom';

import { EXPORT_CAPTURE, mp4Preset, OUTPUT_PLACEHOLDER, presetSize, videoGraph } from './encode.js';
import {
  CHROMIUM_ARGS,
  CHROMIUM_REVISION,
  CHROMIUM_VERSION,
  DEVICE_SCALE_FACTOR,
  LOCALE,
  PINNED_IMAGE,
  PLAYWRIGHT_CORE_VERSION,
  TIMEZONE,
} from './environment.js';
import { asProducerError, producerCode, ProducerError } from './errors.js';
import {
  FFMPEG_ARCHIVE_SHA256,
  FFMPEG_ASSET,
  FFMPEG_CONFIGURATION,
  FFMPEG_RELEASE,
  FFMPEG_SHA256,
  FFMPEG_VERSION,
  FFPROBE_SHA256,
} from './ffmpeg.js';
import { checkAssetLimits, checkDocumentLimits, type JobLimits } from './job.js';
import { canonicalJson, sha256, type ManifestClear } from './manifest.js';
import {
  isBytesAsset,
  resolveProducerAsset,
  type ProducerAsset,
  type ProducerAssetResolver,
} from './media-path.js';
import { validated } from './render.js';
import { loadRuntimeBuild, type RuntimeBuild } from './runtime.js';
import {
  checkedSegmentFrames,
  gridSpans,
  segmentArgs,
  segmentGrid,
  spanSegments,
  type GridRequest,
  type SpanSegment,
} from './segments.js';

/**
 * The version of what the key reads (D92.1): a change of it raises the
 * version, so that no earlier key matches.
 */
export const SEGMENT_KEY_VERSION = 1;

/**
 * The grid of D80.6 with the start times of its spans (D92.2): the grid of a
 * render job; without spans, the grid's span is one span.
 */
export type SegmentKeysGrid = GridRequest;

/** What the keys depend on besides the document and its grid (D92.1). */
export interface SegmentKeysSettings {
  /** `1080p` or `720p` (D29.5). */
  readonly preset: string;
  /** Frames per segment (D47.1); `DEFAULT_SEGMENT_FRAMES` if not given. */
  readonly segmentFrames?: number;
  /**
   * The metrics of the fonts of the document's measured nodes, by the ID of
   * their asset, as `evaluateComposition` takes them (D83.7);
   * `measuredFontMetrics` reads them through a resolver.
   */
  readonly fonts: ReadonlyMap<string, FontMetrics>;
  /** The runtime build the jobs execute; the build of `@kadrion/renderer-dom` if not given. */
  readonly runtime?: Pick<RuntimeBuild, 'contentHash'>;
  /** The limits of D48.4 that a document and its frames are checked against. */
  readonly limits?: JobLimits;
}

/** The key of one segment of the grid (D92.1, D92.2). */
export interface SegmentKey {
  /** Its index over the whole grid (D47.3): the name of its file. */
  readonly index: number;
  /** The index of the span it lies in, 0 for a grid without spans. */
  readonly span: number;
  readonly firstFrame: number;
  readonly frameCount: number;
  /** `sha256:` and 64 lowercase hex digits. */
  readonly key: string;
  /**
   * The Custom HTML nodes whose own lifetime holds a frame of the segment, by
   * their IDs in the state (a path inside an instance, D76.3), in the order of
   * the state: what the key cannot see of an element that keeps state between
   * frames or reads a timer (D92, question 9).
   */
  readonly customHtmlNodeIds: readonly string[];
}

/** The keys of every segment of a grid, in the order of their indices. */
export interface SegmentKeys {
  readonly keyVersion: number;
  readonly segments: readonly SegmentKey[];
}

/** The pins a key reads besides the document (D92.1); tests replace them. */
export interface SegmentKeyPins {
  readonly runtime: string;
  readonly browser: {
    readonly playwrightCore: string;
    readonly chromiumRevision: string;
    readonly chromiumVersion: string;
    readonly args: readonly string[];
    readonly locale: string;
    readonly timezone: string;
    readonly deviceScaleFactor: number;
    readonly image: string;
    readonly capture: string;
    readonly clear: ManifestClear;
  };
  readonly ffmpeg: {
    readonly release: string;
    readonly asset: string;
    readonly archiveSha256: string;
    readonly ffmpegSha256: string;
    readonly ffprobeSha256: string;
    readonly version: string;
    readonly configuration: string;
  };
}

/** The pins of this build of the Producer, with the hash of a runtime build. */
export function pinnedKeyPins(runtime: string): SegmentKeyPins {
  return {
    runtime,
    browser: {
      playwrightCore: PLAYWRIGHT_CORE_VERSION,
      chromiumRevision: CHROMIUM_REVISION,
      chromiumVersion: CHROMIUM_VERSION,
      args: CHROMIUM_ARGS,
      locale: LOCALE,
      timezone: TIMEZONE,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
      image: PINNED_IMAGE,
      capture: EXPORT_CAPTURE,
      // A video has no alpha: every video job draws a copy of the document over white (D89.2).
      clear: 'white',
    },
    ffmpeg: {
      release: FFMPEG_RELEASE,
      asset: FFMPEG_ASSET,
      archiveSha256: FFMPEG_ARCHIVE_SHA256,
      ffmpegSha256: FFMPEG_SHA256,
      ffprobeSha256: FFPROBE_SHA256,
      version: FFMPEG_VERSION,
      configuration: FFMPEG_CONFIGURATION,
    },
  };
}

/**
 * The key of every segment of a grid of a document (D92.1): validated
 * (`invalid-document`), on the preset (`preset-unsupported`), the segment
 * length (`segment-length-invalid`), and the grid and its spans
 * (`range-invalid`) a render job would refuse, and with the metrics of every
 * font of a measured node (`font-metrics-missing`). It opens no browser,
 * starts no FFmpeg, reads no clock, and reads no file but the manifest of
 * the runtime build when `settings.runtime` is not given.
 */
export function segmentKeys(
  document: unknown,
  grid: SegmentKeysGrid,
  settings: SegmentKeysSettings,
): SegmentKeys {
  const composition = validated(document);
  const runtime = settings.runtime ?? loadRuntimeBuild();
  return segmentKeysWith(composition, grid, settings, pinnedKeyPins(runtime.contentHash));
}

/** `segmentKeys` of a validated document on the given pins; tests pass other pins. */
export function segmentKeysWith(
  composition: ValidatedComposition,
  grid: SegmentKeysGrid,
  settings: Omit<SegmentKeysSettings, 'runtime'>,
  pins: SegmentKeyPins,
): SegmentKeys {
  presetSize(composition, settings.preset);
  const segmentFrames = checkedSegmentFrames(settings.segmentFrames);
  const anchored = segmentGrid(composition, segmentFrames, grid);
  checkDocumentLimits(settings.limits, composition, anchored.frameCount);
  const keyOf = segmentKeyer(
    composition,
    { preset: settings.preset, segmentFrames, fonts: settings.fonts },
    pins,
  );
  const spans = anchored.spans ?? gridSpans(composition, anchored, undefined);
  return {
    keyVersion: SEGMENT_KEY_VERSION,
    segments: spanSegments(anchored, spans).map(keyOf),
  };
}

/**
 * The key of a segment of a document (D92.1), as a function of the segment:
 * the font metrics of every measured node checked once (`font-metrics-missing`),
 * the common part of the hashed input written once, and the frames of each
 * segment evaluated when its key is asked for. A render job asks for the keys
 * of its range, and the join for those of the slots it fills (D92.2, D92.3).
 */
export function segmentKeyer(
  composition: ValidatedComposition,
  settings: {
    readonly preset: string;
    readonly segmentFrames: number;
    readonly fonts: ReadonlyMap<string, FontMetrics>;
  },
  pins: SegmentKeyPins,
): (segment: SpanSegment) => SegmentKey {
  const size = presetSize(composition, settings.preset);
  const { segmentFrames } = settings;
  for (const id of measuredFontIds(composition)) {
    if (!settings.fonts.has(id)) {
      throw new ProducerError(
        'font-metrics-missing',
        `A measured node uses the font "${id}", and the fonts given have no metrics of it (D83.7).`,
      );
    }
  }
  const preset = mp4Preset(composition, size);
  const common = {
    browser: pins.browser,
    canvas: { width: composition.width, height: composition.height, fps: composition.fps },
    ffmpeg: {
      ...pins.ffmpeg,
      segmentArgs: segmentArgs({
        fps: composition.fps,
        videoGraph: videoGraph(size),
        output: OUTPUT_PLACEHOLDER,
      }),
    },
    keyVersion: SEGMENT_KEY_VERSION,
    preset,
    runtime: pins.runtime,
    segmentFrames,
  };
  // The input with no frames, split where the frames go: canonical JSON names
  // `"frames":[]` only as that key, since every quote inside a string is escaped.
  const empty = canonicalJson({ ...common, frames: [] });
  const at = empty.indexOf('"frames":[]');
  const head = `${empty.slice(0, at)}"frames":[`;
  const tail = empty.slice(at + '"frames":['.length);
  const document = keyDocument(composition);
  return (segment) => segmentKey(composition, document, settings.fonts, segment, head, tail);
}

/** The key of one segment: its frames' records between the common head and tail. */
function segmentKey(
  composition: ValidatedComposition,
  document: KeyDocument,
  fonts: ReadonlyMap<string, FontMetrics>,
  segment: SpanSegment,
  head: string,
  tail: string,
): SegmentKey {
  const hash = createHash('sha256').update(head);
  const customHtml = new Set<string>();
  for (let offset = 0; offset < segment.frameCount; offset += 1) {
    const timeUs = frameToTimeUs(segment.firstFrame + offset, composition.fps);
    const state = evaluateComposition(composition, timeUs, fonts);
    if (offset > 0) hash.update(',');
    hash.update(canonicalJson(frameRecord(document, state)));
    for (const scene of state.scenes) activeCustomHtml(scene.nodes, customHtml);
  }
  hash.update(tail);
  return {
    index: segment.index,
    span: segment.span,
    firstFrame: segment.firstFrame,
    frameCount: segment.frameCount,
    key: `sha256:${hash.digest('hex')}`,
    customHtmlNodeIds: [...customHtml],
  };
}

/** The objects of the document a frame's record names, found by their IDs. */
export interface KeyDocument {
  readonly scenes: ReadonlyMap<
    string,
    {
      readonly kept: Readonly<Record<string, unknown>>;
      readonly nodes: ReadonlyMap<string, unknown>;
    }
  >;
  readonly definitions: ReadonlyMap<string, Definition>;
  readonly assets: ReadonlyMap<string, { id: string; type: string; contentHash: string }>;
}

/** What a frame's record reads of the document, by ID; nothing of a frame is kept. */
export function keyDocument(composition: ValidatedComposition): KeyDocument {
  const scenes = new Map<
    string,
    { kept: Readonly<Record<string, unknown>>; nodes: ReadonlyMap<string, unknown> }
  >();
  for (const scene of composition.scenes) {
    const kept: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(scene)) {
      if (key !== 'nodes' && key !== 'clips' && key !== 'durationUs') kept[key] = value;
    }
    kept.sceneTransitions = composition.transitions.filter(
      ({ fromSceneId, toSceneId }) => fromSceneId === scene.id || toSceneId === scene.id,
    );
    scenes.set(scene.id, { kept, nodes: new Map(scene.nodes.map((node) => [node.id, node])) });
  }
  return {
    scenes,
    definitions: new Map(composition.definitions.map((definition) => [definition.id, definition])),
    assets: new Map(
      composition.assets.map(({ id, type, contentHash }) => [id, { id, type, contentHash }]),
    ),
  };
}

/** The record of one frame (the layout in the comment of this module). */
export function frameRecord(document: KeyDocument, state: CompositionState): unknown {
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) if (key !== 'timeUs') kept[key] = value;
  const nodes: unknown[] = [];
  const scenes: unknown[] = [];
  const definitions = new Map<string, Definition>();
  for (const scene of state.scenes) {
    // Every scene and node of a state is one of the document's (D19.4, D54.3).
    const own = document.scenes.get(scene.id);
    scenes.push(own?.kept);
    for (const node of scene.nodes) nodes.push(own?.nodes.get(node.id));
    instanceDefinitions(document, scene.nodes, definitions);
  }
  const record = { definitions: [...definitions.values()], nodes, scenes, state: kept };
  const named = new Set<string>();
  assetIdsIn(record, document.assets, named);
  return { ...record, assets: [...named].sort().map((id) => document.assets.get(id)) };
}

/** The definitions of the instances among `nodes`, at any depth, each once, in order. */
function instanceDefinitions(
  document: KeyDocument,
  nodes: readonly NodeState[],
  found: Map<string, Definition>,
): void {
  for (const node of nodes) {
    if (node.type !== 'instance') continue;
    const definition = document.definitions.get(node.definitionId);
    if (definition !== undefined && !found.has(definition.id)) found.set(definition.id, definition);
    instanceDefinitions(document, node.nodes, found);
  }
}

/** Every string of `value` that is the ID of an asset of the document. */
function assetIdsIn(
  value: unknown,
  assets: ReadonlyMap<string, unknown>,
  found: Set<string>,
): void {
  if (typeof value === 'string') {
    if (assets.has(value)) found.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) assetIdsIn(item, assets, found);
  } else if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) assetIdsIn(item, assets, found);
  }
}

/** The Custom HTML nodes among `nodes` whose own lifetime holds the frame, at any depth. */
function activeCustomHtml(nodes: readonly NodeState[], found: Set<string>): void {
  for (const node of nodes) {
    if (node.type === 'custom-html' && node.active) found.add(node.id);
    if (node.type === 'instance') activeCustomHtml(node.nodes, found);
  }
}

/**
 * The metrics of the fonts of a document's measured nodes (D83.7), read
 * through a resolver and nothing else: each font is asked for once, verified
 * against its `contentHash` (D14), checked against the limits of one asset and
 * of all of them (D48.4), and measured by the runtime's `fontMetrics`, which
 * refuses a damaged WOFF or WOFF2 file as `font-invalid` and any other file it
 * cannot measure as `font-unmeasurable` (D84.6). A document without a measured
 * node reads nothing.
 */
export async function measuredFontMetrics(
  document: unknown,
  resolveAsset: ProducerAssetResolver,
  limits?: JobLimits,
): Promise<ReadonlyMap<string, FontMetrics>> {
  const composition = validated(document);
  const assets = new Map(composition.assets.map((asset) => [asset.id, asset]));
  const read: ProducerAsset[] = [];
  for (const id of measuredFontIds(composition)) {
    const asset = assets.get(id);
    if (asset === undefined) continue;
    let resolved;
    try {
      resolved = await resolveProducerAsset(
        asset,
        resolveAsset,
        (bytes) => Promise.resolve(sha256(bytes)),
        limits?.maxAssetBytes,
      );
    } catch (reason) {
      if (reason instanceof RenderError) {
        throw new ProducerError(producerCode(reason.code), reason.message);
      }
      throw asProducerError(reason);
    }
    if (!isBytesAsset(resolved)) {
      throw new ProducerError('asset-invalid', `The font "${id}" must be given as bytes (D64.2).`);
    }
    read.push(resolved);
    checkAssetLimits(limits, read);
  }
  return measuredFonts(composition, read);
}

/**
 * The metrics of the fonts of a document's measured nodes (D83.7) from assets
 * already resolved and verified, as a render job and the join by keys hold
 * them (D92.2, D92.3): measured by the runtime's `fontMetrics`, which refuses
 * a damaged WOFF or WOFF2 file as `font-invalid` and any other file it cannot
 * measure as `font-unmeasurable` (D84.6). A font given by path is
 * `asset-invalid` (D64.2); a font that is not given is left out, and
 * `segmentKeyer` names it.
 */
export function measuredFonts(
  composition: ValidatedComposition,
  assets: readonly ProducerAsset[],
): ReadonlyMap<string, FontMetrics> {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const fonts = new Map<string, FontMetrics>();
  for (const id of measuredFontIds(composition)) {
    const asset = byId.get(id);
    if (asset === undefined) continue;
    if (!isBytesAsset(asset)) {
      throw new ProducerError('asset-invalid', `The font "${id}" must be given as bytes (D64.2).`);
    }
    try {
      fonts.set(id, fontMetrics(asset.bytes));
    } catch (reason) {
      const code =
        (reason as { code?: unknown } | null)?.code === 'font-invalid'
          ? 'font-invalid'
          : 'font-unmeasurable';
      const message = reason instanceof Error ? reason.message : String(reason);
      throw new ProducerError(code, `The font "${id}" cannot be measured: ${message}`);
    }
  }
  return fonts;
}

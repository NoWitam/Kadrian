/**
 * The segmented MP4 export (D29, D47). A render is a sequence of segments of a
 * fixed number of frames on the composition's grid (D47.1); each is encoded by
 * its own FFmpeg process from PNG bytes that stream from the frame loop of
 * `renderFrames` (D29.3) and never touch the disk. The audio of the range is
 * rendered once to a lossless intermediate (D47.4), and the join puts the
 * segments and the audio into one MP4 (D47.5).
 *
 * - `renderSegments` renders a range of whole segments of one composition, in
 *   one page, and returns the segments manifest; a host runs one per job.
 * - `renderAudio` renders the audio of a range; it needs no browser.
 * - `joinSegments` checks that the manifests make one render and joins them.
 * - `exportMp4` is the three in one call, on the same code: a one-pass export
 *   and a join of separately rendered segments are the same bytes (D47.6).
 *
 * Every file is written under a temporary name and renamed when complete, so a
 * retried job never finds half a file under a final name (D47.6). Everything
 * that can be checked before a page opens is checked first, and every failure
 * kills FFmpeg and removes what it was writing.
 */
import { rename, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import {
  frameCount,
  frameToTimeUs,
  heardSourceRange,
  type ValidatedComposition,
} from '@kadrion/schema';

import { audioPlan } from '@kadrion/runtime';

import {
  AUDIO_BITRATE,
  AUDIO_CHANNEL_LAYOUT,
  AUDIO_CODEC,
  audioLayout,
  EXPORT_CAPTURE,
  FrameSink,
  MAX_VIDEO_SIDE,
  mp4Preset,
  OUTPUT_PLACEHOLDER,
  presetSize,
  realTimer,
  receiptHashes,
  SAMPLE_RATE,
  samplesAt,
  TIME_SCALE_PER_FRAME,
  type AudioLayout,
  type PresetSize,
  type StartTimer,
  videoGraph,
} from './encode.js';
import {
  CHROMIUM_REVISION,
  hostNetworkInterfaces,
  launchChromium,
  PLAYWRIGHT_CORE_VERSION,
  type LaunchedChromium,
} from './environment.js';
import { envelopeStream, type EnvelopeStream } from './envelope.js';
import { asProducerError, ProducerError } from './errors.js';
import {
  checkAssetLimits,
  checkDocumentLimits,
  failure,
  onCancel,
  throwIfCancelled,
  type JobLimits,
  type JobOptions,
} from './job.js';
import {
  FFMPEG_ARCHIVE_SHA256,
  FFMPEG_ASSET,
  FFMPEG_RELEASE,
  FFMPEG_URL,
  pinnedFfmpeg,
  type AudioProbe,
  type EncoderProcess,
  type FfmpegPaths,
  type FfmpegTools,
  type StreamStart,
} from './ffmpeg.js';
import {
  canonicalJson,
  EXPORT_MANIFEST_VERSION,
  sha256,
  type AudioManifest,
  type ExportManifest,
  type FfmpegIdentityBlock,
  type ManifestAudio,
  type ManifestFfmpegBuild,
  type ManifestFrame,
  type ManifestGrid,
  type ManifestMp4Preset,
  type ManifestSound,
  type ManifestSpan,
  type ManifestStretch,
  type ManifestSegment,
  type ManifestVideo,
  type RenderIdentity,
  type SegmentsManifest,
} from './manifest.js';
import {
  chromiumSequence,
  manifestAssets,
  manifestBase,
  validated,
  verifiedAssets,
  withWhiteClear,
  type FrameSequence,
  type GridFrame,
  type PreparedRender,
  type RenderedFrame,
  type RenderTimeouts,
} from './render.js';
import type { ProducerAssetResolver } from './media-path.js';
import type { FrameCapture } from './capture.js';
import { loadRuntimeBuild, type RuntimeBuild } from './runtime.js';
import { measuredFonts, pinnedKeyPins, segmentKeyer, type SegmentKey } from './segment-keys.js';
import { stretchedAudio, type StretchedAudio } from './stretch.js';
import { mediaFiles, prepareVideos, type MediaFiles } from './video.js';
import {
  AUDIO_INTERMEDIATE_CODEC,
  AUDIO_INTERMEDIATE_FORMAT,
  AUDIO_PLACEHOLDER,
  audioPassArgs,
  audioPassGraph,
  audioRangeOf,
  envelopePipe,
  envelopePlaceholder,
  soundPlaceholder,
  checkedMinSegmentFrames,
  checkedSegmentFrames,
  concatList,
  frameRange,
  gridRange,
  gridRangeSegments,
  gridSegments,
  gridSpan,
  isCompositionGrid,
  joinArgs,
  PARTIAL_SUFFIX,
  rangeSegmentsOf,
  segmentGrid,
  segmentArgs,
  segmentFileName,
  spanSegments,
  type FrameRange,
  type GridRequest,
  type GridSpan,
  type Segment,
  type SegmentGrid,
  type SpanSegment,
} from './segments.js';

/** A range of the composition in microseconds: `fromUs` included, `toUs` excluded (D47.2). */
export interface RangeRequest {
  readonly fromUs: number;
  readonly toUs: number;
}

interface EncoderSettings {
  /** How long FFmpeg may take to accept a frame, to finish a segment, or to run a pass. */
  readonly encoderTimeoutMs?: number;
}

export interface SegmentsRequest extends RenderTimeouts, EncoderSettings, JobOptions {
  readonly document: unknown;
  /** Bytes for every asset, or a path for a video or an audio asset (D14, D64.1). */
  readonly resolveAsset: ProducerAssetResolver;
  /** `1080p` or `720p` (D29.5). */
  readonly preset: string;
  /** Frames per segment (D47.1); `DEFAULT_SEGMENT_FRAMES` if not given. */
  readonly segmentFrames?: number;
  /**
   * The range on the segment grid (D47.2, D80.3); the whole composition if not
   * given, or the grid's span when `grid` is given.
   */
  readonly range?: RangeRequest;
  /**
   * A grid anchored on a span of the composition, with a shortest last segment
   * (D80.1) and its spans (D92.2); the composition's grid of D47.1 if not
   * given. Every job of one render names the same grid. On spans, the
   * manifest records each segment's span and key.
   */
  readonly grid?: GridRequest;
  /** An existing directory; each segment is written there as `segment-<index>.mp4`. */
  readonly outputDirectory: string;
  /** Absolute paths of the pinned executables (D29.1); `PATH` is never searched. */
  readonly ffmpeg: FfmpegPaths;
  /** A browser from `launchChromium` to reuse; otherwise one is launched and closed. */
  readonly chromium?: LaunchedChromium;
  readonly runtime?: RuntimeBuild;
}

export interface ExportStats {
  /** Frames accepted into the window of D29.3, over every segment. */
  readonly framesWritten: number;
  /** The most frames that were in flight at once; never above `FRAMES_IN_FLIGHT`. */
  readonly maxFramesInFlight: number;
}

export interface SegmentsResult {
  readonly manifest: SegmentsManifest;
  readonly stats: ExportStats;
}

export interface AudioRequest extends EncoderSettings, JobOptions {
  readonly document: unknown;
  /** Bytes for every asset, or a path for a video or an audio asset (D14, D64.1). */
  readonly resolveAsset: ProducerAssetResolver;
  /** The range of frame times; the whole composition if not given (D47.4). */
  readonly range?: RangeRequest;
  /** An existing directory; the audio is written there as `audio.wav`. */
  readonly outputDirectory: string;
  readonly ffmpeg: FfmpegPaths;
}

export interface AudioResult {
  readonly manifest: AudioManifest;
}

/** A manifest and the directory its files are named relative to. */
export interface JoinPart<M> {
  readonly manifest: M;
  readonly directory: string;
}

export interface JoinRequest extends EncoderSettings, Pick<JobOptions, 'signal'> {
  /**
   * The segments manifests of every job of the render, in any order; with a
   * target, also manifests of renders of other documents, whose segments fill
   * the slots of the target by their keys (D92.3).
   */
  readonly segments: readonly JoinPart<SegmentsManifest>[];
  /** The audio pass of the range; it states the range the segments must cover. */
  readonly audio: JoinPart<AudioManifest>;
  /** Where the MP4 is written; written under a temporary name first. */
  readonly outputPath: string;
  readonly ffmpeg: FfmpegPaths;
  /**
   * The document whose export the join writes, joined by the keys of its
   * segments (D92.3); without it, the join of D47.5 and D80.4.
   */
  readonly target?: JoinTarget;
}

/**
 * The document of a join by keys (D92.3): its asset resolver, which the keys
 * read the fonts of measured nodes through and the manifest the facts of its
 * videos, and the grid of its render, with its spans (D92.2), which a join by
 * keys requires.
 */
export interface JoinTarget {
  readonly document: unknown;
  /** Bytes for every asset, or a path for a video or an audio asset (D14, D64.1). */
  readonly resolveAsset: ProducerAssetResolver;
  /** Frames per segment (D47.1); the parts' if not given. */
  readonly segmentFrames?: number;
  /** The grid of the render, with the start times of its spans (D80.1, D92.2). */
  readonly grid: GridRequest;
  /** The limits of D48.4 that the document and its assets are checked against. */
  readonly limits?: JobLimits;
}

export interface JoinResult {
  readonly outputPath: string;
  readonly manifest: ExportManifest;
}

export interface ExportRequest extends RenderTimeouts, EncoderSettings, JobOptions {
  readonly document: unknown;
  /** Bytes for every asset, or a path for a video or an audio asset (D14, D64.1). */
  readonly resolveAsset: ProducerAssetResolver;
  /** `1080p` or `720p` (D29.5). */
  readonly preset: string;
  /** Frames per segment (D47.1); `DEFAULT_SEGMENT_FRAMES` if not given. */
  readonly segmentFrames?: number;
  /** Where the MP4 is written. Its parts are written next to it and removed. */
  readonly outputPath: string;
  readonly ffmpeg: FfmpegPaths;
  readonly chromium?: LaunchedChromium;
  readonly runtime?: RuntimeBuild;
}

export interface ExportResult {
  readonly outputPath: string;
  readonly manifest: ExportManifest;
  readonly stats: ExportStats;
}

/** How the frame loop of an export and of a range job runs (D88.1, D88.3). */
export interface ExportLoop {
  readonly capture: FrameCapture;
  readonly firstSeek: boolean;
}

/** A browser for one render: its frame loop, and how to let it go. */
export interface ExportBrowser {
  readonly chromium: LaunchedChromium;
  readonly sequence: FrameSequence;
  close(): Promise<void>;
}

/** What the export runs on; tests pass fakes (not exported by the package). */
export interface ExportDependencies {
  readonly tools: (paths: FfmpegPaths) => Promise<FfmpegTools>;
  /**
   * A browser whose frame loop captures as `loop.capture` asks (D88.1) and
   * whose first decoder of a node may start by a seek (D88.3).
   */
  readonly browser: (
    request: SegmentsRequest | ExportRequest,
    loop: ExportLoop,
  ) => Promise<ExportBrowser>;
  readonly removeFile: (path: string) => Promise<void>;
  /** Renames a complete file to its final name, replacing what is there (D47.6). */
  readonly renameFile: (from: string, to: string) => Promise<void>;
  readonly startTimer: StartTimer;
  /** The host's interface names for the manifest (D28.9); the real run reads the host. */
  readonly networkInterfaces: () => readonly string[];
}

const DEFAULT_TIMEOUT_MS = 30_000;
/** The audio pass and the join read whole files; they get more time than one frame. */
const PASS_TIMEOUT_FACTOR = 10;

function encodeFailed(message: string): ProducerError {
  return new ProducerError('encode-failed', message);
}

function joinInvalid(message: string): ProducerError {
  return new ProducerError('join-invalid', message);
}

function within<T>(
  work: Promise<T>,
  milliseconds: number,
  startTimer: StartTimer,
  what: string,
): Promise<T> {
  return new Promise<T>((resolveWork, reject) => {
    const cancel = startTimer(() => {
      reject(encodeFailed(`FFmpeg did not ${what} within ${String(milliseconds)} ms.`));
    }, milliseconds);
    work.then(
      (value) => {
        cancel();
        resolveWork(value);
      },
      (reason: unknown) => {
        cancel();
        reject(asProducerError(reason));
      },
    );
  });
}

/** The checked sounds of a render: their layout, the file of each source, and their hashes. */
interface CheckedAudio {
  readonly layout: AudioLayout;
  /** The file each sound is read from, in the order of the layout. */
  readonly inputs: readonly string[];
  readonly hashes: ReadonlyMap<string, string>;
  /** Checks that every source read by path is still the file verified (D64.3). */
  check(): Promise<void>;
  /** Removes the private copies; every caller calls it when the audio pass is done or failed. */
  close(): Promise<void>;
}

/** Whether two stated stream starts are the same instant, compared exactly. */
function sameStart(a: StreamStart, b: StreamStart): boolean {
  return a.pts * BigInt(a.num) * BigInt(b.den) === b.pts * BigInt(b.num) * BigInt(a.den);
}

/**
 * The sounds of the document, checked with the pinned ffprobe before the render
 * (D29.6, D49.6, D52.5): the audio plan of `@kadrion/runtime` on the sample
 * grid, the file of every source a sound reads (a private copy of bytes, or
 * the host's file read by path, D64), and for each sound a
 * source with exactly one audio stream and a sample rate, which covers every
 * source time it is heard at; the sound of a video starts where its picture
 * does. `null` when nothing is heard: the export then has no audio stream.
 */
async function checkedAudio(
  prepared: PreparedRender,
  tools: FfmpegTools,
): Promise<CheckedAudio | null> {
  const layout = audioLayout(audioPlan(prepared.composition));
  if (layout.sounds.length === 0) return null;
  const used = new Set(layout.sounds.map(({ entry }) => entry.assetId));
  const sources = prepared.assets.filter(({ id }) => used.has(id));
  for (const id of used) {
    if (!sources.some((asset) => asset.id === id)) {
      // Unreachable: every asset of the document was resolved and verified.
      throw new ProducerError('asset-missing', `The asset "${id}" was not resolved.`);
    }
  }
  const copies: MediaFiles = await mediaFiles(sources, 'sound');
  try {
    const probes = new Map<string, AudioProbe>();
    for (const [id, file] of copies.files) probes.set(id, await tools.probeAudio(file));
    // What ffprobe read is used only if every file is still the one verified (D64.3).
    await copies.check();
    for (const { entry } of layout.sounds) {
      const probe = probes.get(entry.assetId);
      const name = `${entry.kind === 'clip' ? 'The clip' : 'The video node'} "${entry.id}"`;
      if (probe === undefined || probe.audioStreams !== 1) {
        throw new ProducerError(
          'audio-invalid',
          `${name} plays "${entry.assetId}", which has ${String(probe?.audioStreams ?? 0)} audio streams, not 1.`,
        );
      }
      if (probe.sampleRate === null) {
        throw new ProducerError(
          'audio-invalid',
          `${name} plays "${entry.assetId}", which has no sample rate that ffprobe could read.`,
        );
      }
      if (entry.kind === 'video') {
        const { audioStart, videoStart } = probe;
        if (audioStart === null || videoStart === null || !sameStart(audioStart, videoStart)) {
          throw new ProducerError(
            'audio-invalid',
            `${name} plays the sound of "${entry.assetId}", whose audio does not start where its video does, so source time 0 would not be one instant (D52.5).`,
          );
        }
      }
      // The range heard, from the map of a sound at another speed or reversed (D82.6).
      const heard = heardSourceRange(entry);
      const endUs = BigInt(heard.startUs) + BigInt(heard.durationUs);
      if (probe.samples * 1_000_000n < endUs * BigInt(probe.sampleRate)) {
        throw new ProducerError(
          'source-range-exceeded',
          `${entry.id}: samples ${String(heard.startUs)} to ${String(endUs)} µs of "${entry.assetId}", which holds ${String(probe.samples)} samples at ${String(probe.sampleRate)} Hz (D49.6).`,
        );
      }
    }
    return {
      layout,
      inputs: layout.sounds.map(({ entry }) => copies.files.get(entry.assetId) ?? ''),
      hashes: new Map(sources.map(({ id, contentHash }) => [id, contentHash])),
      check: () => copies.check(),
      close: () => copies.remove(),
    };
  } catch (reason) {
    await copies.remove();
    throw reason;
  }
}

/** The sounds of the layout as the manifests record them (D52.5), with the stretch of a mapped one (D82.6). */
function manifestSounds(
  audio: CheckedAudio,
  stretches: readonly (ManifestStretch | null)[],
  envelopes: readonly (string | null)[],
): ManifestSound[] {
  return audio.layout.sounds.map((sound, index) => ({
    kind: sound.entry.kind,
    id: sound.entry.id,
    assetId: sound.entry.assetId,
    assetHash: audio.hashes.get(sound.entry.assetId) ?? '',
    volume: sound.entry.volume,
    startSample: sound.startSample,
    sampleCount: sound.sampleCount,
    sourceStartSample: sound.sourceStartSample,
    fadeIn: sound.fadeIn,
    fadeOut: sound.fadeOut,
    ...(stretches[index] == null ? {} : { stretch: stretches[index] }),
    ...(sound.volumeKeys === undefined
      ? {}
      : { volumeKeys: sound.volumeKeys, envelopeSha256: envelopes[index] ?? '' }),
  }));
}

function ffmpegBuild(tools: FfmpegTools): ManifestFfmpegBuild {
  const { identity } = tools;
  return {
    release: FFMPEG_RELEASE,
    asset: FFMPEG_ASSET,
    url: FFMPEG_URL,
    archiveSha256: FFMPEG_ARCHIVE_SHA256,
    ffmpegSha256: identity.ffmpegSha256,
    ffprobeSha256: identity.ffprobeSha256,
    version: identity.version,
    configuration: identity.configuration,
    encoders: identity.encoders,
  };
}

function ffmpegIdentityBlock(tools: FfmpegTools): FfmpegIdentityBlock {
  const { identity } = tools;
  return {
    ffmpegSha256: identity.ffmpegSha256,
    ffprobeSha256: identity.ffprobeSha256,
    ffmpegVersion: identity.version,
    ffmpegBuildConfiguration: identity.configuration,
  };
}

/** Where one segment is written, its temporary name, and its name in the manifest. */
interface SegmentTarget {
  readonly segment: Segment;
  readonly path: string;
  /** Its span and key, on a grid of spans only (D92.2). */
  readonly key?: SegmentKey;
}

/**
 * A segment as a manifest records it: on a grid of spans with its span and
 * key (D92.2), and otherwise with the fields of D47.3 alone, so a manifest
 * without spans keeps its bytes.
 */
function manifestSegment(
  segment: Segment,
  key: Pick<SegmentKey, 'span' | 'key'> | undefined,
): Omit<ManifestSegment, 'file' | 'sha256'> {
  return {
    index: segment.index,
    ...(key === undefined ? {} : { span: key.span }),
    firstFrame: segment.firstFrame,
    frameCount: segment.frameCount,
    ...(key === undefined ? {} : { key: key.key }),
  };
}

/**
 * Encodes the frames of `targets`, all of one range in one page, each segment
 * by its own FFmpeg process (D47.3): the frames stream into the process as PNG
 * bytes (D29.3), the receipt and the self-check run on the segment's file
 * under its temporary name, and only then is it renamed.
 */
async function encodeSegments(options: {
  readonly prepared: PreparedRender;
  readonly tools: FfmpegTools;
  readonly browser: ExportBrowser;
  readonly size: PresetSize;
  readonly targets: readonly SegmentTarget[];
  readonly timeoutMs: number;
  readonly dependencies: ExportDependencies;
  readonly job: JobOptions;
}): Promise<{
  readonly segments: ManifestSegment[];
  readonly frames: ManifestFrame[];
  readonly blockedRequests: readonly string[];
  readonly stats: ExportStats;
}> {
  const { prepared, tools, browser, size, targets, timeoutMs, dependencies, job } = options;
  const { signal, onProgress } = job;
  const { fps } = prepared.composition;
  const totalFrames = targets.reduce((sum, { segment }) => sum + segment.frameCount, 0);
  /** Segments of this call renamed to their final names; removed again if it fails. */
  const completed: string[] = [];
  const graph = videoGraph(size);
  const frames: ManifestFrame[] = [];
  const segments: ManifestSegment[] = [];
  let framesWritten = 0;
  let maxFramesInFlight = 0;

  interface Open {
    readonly target: SegmentTarget;
    readonly partial: string;
    readonly encoder: EncoderProcess;
    readonly sink: FrameSink;
    readonly sent: string[];
  }
  /** The segment being encoded; held in an object, because the frame loop's callback sets it. */
  const state: { open: Open | null } = { open: null };

  const start = (target: SegmentTarget): Open => {
    const partial = `${target.path}${PARTIAL_SUFFIX}`;
    const encoder = tools.spawnEncoder(
      segmentArgs({ fps, videoGraph: graph, output: partial }),
      false,
    );
    const sink = new FrameSink(encoder.video, timeoutMs, dependencies.startTimer);
    return { target, partial, encoder, sink, sent: [] };
  };

  const finish = async (current: Open): Promise<void> => {
    const { target, partial, encoder, sink, sent } = current;
    await sink.end();
    const exited = await within(encoder.exited, timeoutMs, dependencies.startTimer, 'finish');
    if (exited.code !== 0) {
      throw encodeFailed(`FFmpeg exited with ${String(exited.code)}: ${exited.stderr.trim()}`);
    }
    const received = receiptHashes(await encoder.receipt);
    if (received.length !== sent.length || received.some((hash, index) => hash !== sent[index])) {
      throw encodeFailed(
        `FFmpeg read ${String(received.length)} frames of segment ${String(target.segment.index)} that do not match the ${String(sent.length)} rendered ones.`,
      );
    }
    const count = target.segment.frameCount;
    const packets = await tools.countVideoPackets(partial);
    if (packets !== count) {
      throw encodeFailed(
        `Segment ${String(target.segment.index)} holds ${String(packets)} video packets, not ${String(count)}.`,
      );
    }
    // Frame i of the segment at i × 512 in the time base of D29.4: the segment
    // starts at 0 and drops, repeats, or shifts no frame.
    const timestamps = await tools.videoTimestamps(partial);
    if (
      timestamps.length !== count ||
      timestamps.some((pts, at) => pts !== at * TIME_SCALE_PER_FRAME)
    ) {
      throw encodeFailed(
        `Segment ${String(target.segment.index)} holds other presentation times than its frames 0…${String(count - 1)} at ${String(TIME_SCALE_PER_FRAME)} each.`,
      );
    }
    const hash = await tools.sha256File(partial);
    throwIfCancelled(signal);
    await dependencies.renameFile(partial, target.path);
    completed.push(target.path);
    framesWritten += sink.written;
    maxFramesInFlight = Math.max(maxFramesInFlight, sink.maxInFlight);
    segments.push({
      ...manifestSegment(target.segment, target.key),
      file: basename(target.path),
      sha256: hash,
    });
    onProgress?.({
      event: 'segment',
      segment: target.segment.index,
      done: segments.length,
      segments: targets.length,
    });
  };

  const byFirstFrame = new Map(targets.map((target) => [target.segment.firstFrame, target]));
  function* grid(): Generator<GridFrame> {
    for (const { segment } of targets) {
      for (
        let index = segment.firstFrame;
        index < segment.firstFrame + segment.frameCount;
        index += 1
      ) {
        yield { index, timeUs: frameToTimeUs(index, fps) };
      }
    }
  }

  // A cancelled job kills the encoder at once; the frame loop stops at its next frame (D48.2).
  const stopListening = onCancel(signal, () => {
    state.open?.encoder.kill();
  });
  try {
    // Every video job renders a copy of the document with a white clear, whose
    // frames are those of the white document; the manifest keeps the hash of the
    // document as given (D89.2).
    const { blockedRequests } = await browser.sequence(
      { ...prepared, composition: withWhiteClear(prepared.composition) },
      grid(),
      async (frame: RenderedFrame) => {
        throwIfCancelled(signal);
        const begins = byFirstFrame.get(frame.index);
        if (begins !== undefined) state.open = start(begins);
        const current = state.open;
        if (current === null)
          throw encodeFailed(`Frame ${String(frame.index)} belongs to no segment.`);
        // The hash is of exactly the bytes that go into the pipe (D29.3).
        const hash = sha256(frame.png);
        frames.push({ index: frame.index, timeUs: frame.timeUs, sha256: hash });
        current.sent.push(hash);
        await current.sink.write(frame.png);
        onProgress?.({
          event: 'frame',
          frame: frame.index,
          done: frames.length,
          frames: totalFrames,
        });
        const { segment } = current.target;
        if (frame.index === segment.firstFrame + segment.frameCount - 1) {
          await finish(current);
          state.open = null;
        }
      },
    );
    if (state.open !== null) throw encodeFailed('The frame loop ended inside a segment.');
    return {
      segments,
      frames,
      blockedRequests,
      stats: { framesWritten, maxFramesInFlight },
    };
  } catch (reason) {
    const current = state.open;
    if (current !== null) {
      current.encoder.kill();
      await current.encoder.exited;
      // A failure to remove the partial file must not replace the reason for it.
      await dependencies.removeFile(current.partial).catch(() => undefined);
    }
    // A failed job leaves nothing under a final name, not even its finished segments (D48.2).
    for (const path of completed) await dependencies.removeFile(path).catch(() => undefined);
    throw asProducerError(failure(reason, signal));
  } finally {
    stopListening();
  }
}

function identityOf(base: ReturnType<typeof manifestBase>, tools: FfmpegTools): RenderIdentity {
  const image = base.environment.pinned ? base.environment.image : null;
  return {
    playwrightImageDigest:
      image === null ? null : (/@(sha256:[0-9a-f]{64})$/.exec(image)?.[1] ?? null),
    playwrightVersion: PLAYWRIGHT_CORE_VERSION,
    chromiumRevision: CHROMIUM_REVISION,
    ...ffmpegIdentityBlock(tools),
  };
}

/** What can be checked before a page opens, for a render of segments (D29.8, D47.2). */
async function preparedSegments(
  request: SegmentsRequest | ExportRequest,
  dependencies: ExportDependencies,
  range: RangeRequest | undefined,
  asked: GridRequest | undefined,
): Promise<{
  readonly prepared: PreparedRender;
  readonly size: PresetSize;
  readonly segmentFrames: number;
  /** The grid the manifest names, or `null` for the composition's grid of D47.1 (D80.2). */
  readonly grid: ManifestGrid | null;
  readonly frames: FrameRange;
  readonly segments: Segment[];
  /** The key of each segment of the range by its index, on a grid of spans only (D92.2). */
  readonly keys: ReadonlyMap<number, SegmentKey> | null;
  readonly tools: FfmpegTools;
}> {
  throwIfCancelled(request.signal);
  const composition = validated(request.document);
  const size = presetSize(composition, request.preset);
  const segmentFrames = checkedSegmentFrames(request.segmentFrames);
  // Without a grid, exactly the range and the segments of D47.1 (D80.2).
  const grid = asked === undefined ? null : segmentGrid(composition, segmentFrames, asked);
  const frames =
    grid === null
      ? frameRange(composition, range, segmentFrames)
      : gridRange(composition, grid, range);
  checkDocumentLimits(request.limits, composition, frames.frameCount);
  const assets = await verifiedAssets(composition, request.resolveAsset, request.limits);
  checkAssetLimits(request.limits, assets);
  const runtime = request.runtime ?? loadRuntimeBuild();
  const segments =
    grid === null
      ? rangeSegmentsOf(composition, segmentFrames, frames)
      : gridRangeSegments(grid, frames);
  // On a grid of spans, the key of every segment of the range, before a page opens (D92.2).
  let keys: Map<number, SegmentKey> | null = null;
  if (grid?.spans !== undefined) {
    const keyOf = segmentKeyer(
      composition,
      { preset: request.preset, segmentFrames, fonts: measuredFonts(composition, assets) },
      pinnedKeyPins(runtime.contentHash),
    );
    keys = new Map(
      segments.map((segment) => [segment.index, keyOf(segment as SpanSegment)] as const),
    );
  }
  const tools = await dependencies.tools(request.ffmpeg);
  throwIfCancelled(request.signal);
  return {
    prepared: {
      composition,
      assets,
      runtime,
      videos: await prepareVideos(composition, assets, tools),
    },
    size,
    segmentFrames,
    grid:
      grid === null || isCompositionGrid(composition, grid)
        ? null
        : manifestGrid(composition, grid),
    frames,
    segments,
    keys,
    tools,
  };
}

/**
 * The grid a manifest names (D80.2): its span and its shortest last segment,
 * and the spans of a grid of spans (D92.2).
 */
function manifestGrid(composition: ValidatedComposition, grid: SegmentGrid): ManifestGrid {
  return {
    ...gridSpan(composition, grid),
    minSegmentFrames: grid.minSegmentFrames,
    ...(grid.spans === undefined
      ? {}
      : { spans: grid.spans.map(({ fromUs, firstFrame }) => ({ fromUs, firstFrame })) }),
  };
}

async function segmentsWith(
  request: SegmentsRequest | ExportRequest,
  dependencies: ExportDependencies,
  given: Awaited<ReturnType<typeof preparedSegments>>,
  pathOf: (segment: Segment) => string,
): Promise<SegmentsResult> {
  const { prepared, size, segmentFrames, grid, frames, segments, keys, tools } = given;
  const timeoutMs = request.encoderTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  // An export and a range job capture for speed; their frames go only to the encoder (D88.1).
  // A node's first decoder starts at the IDR picture before a late first frame (D88.3).
  const browser = await dependencies.browser(request, {
    capture: EXPORT_CAPTURE,
    firstSeek: true,
  });
  try {
    throwIfCancelled(request.signal);
    const targets = segments.map((segment) => {
      const key = keys?.get(segment.index);
      return { segment, path: pathOf(segment), ...(key === undefined ? {} : { key }) };
    });
    request.onProgress?.({
      event: 'start',
      frames: frames.frameCount,
      segments: segments.length,
    });
    const encoded = await encodeSegments({
      prepared,
      tools,
      browser,
      size,
      targets,
      timeoutMs,
      dependencies,
      job: request,
    });
    const base = manifestBase(prepared, browser.chromium, dependencies.networkInterfaces());
    const manifest: SegmentsManifest = {
      ...base,
      manifestVersion: EXPORT_MANIFEST_VERSION,
      kind: 'segments',
      capture: EXPORT_CAPTURE,
      // A video has no alpha: its page draws a copy of the document over white (D89.2).
      clear: 'white',
      preset: mp4Preset(prepared.composition, size),
      segmentFrames,
      // Named only when it is not the grid of D47.1, so a render without one keeps its bytes (D80.2).
      ...(grid === null ? {} : { grid }),
      range: frames,
      segments: encoded.segments,
      frames: encoded.frames,
      blockedRequests: encoded.blockedRequests,
      ffmpeg: {
        ...ffmpegBuild(tools),
        segmentArgs: segmentArgs({
          fps: prepared.composition.fps,
          videoGraph: videoGraph(size),
          output: OUTPUT_PLACEHOLDER,
        }),
      },
      identity: identityOf(base, tools),
    };
    return { manifest, stats: encoded.stats };
  } finally {
    await browser.close();
  }
}

/** `renderSegments` on the given dependencies; tests pass fakes. */
export async function renderSegmentsWith(
  request: SegmentsRequest,
  dependencies: ExportDependencies,
): Promise<SegmentsResult> {
  try {
    const given = await preparedSegments(request, dependencies, request.range, request.grid);
    const directory = resolve(request.outputDirectory);
    return await segmentsWith(request, dependencies, given, (segment) =>
      join(directory, segmentFileName(segment.index)),
    );
  } catch (reason) {
    throw failure(reason, request.signal);
  }
}

/** The file name of the audio pass in its directory (D47.4). */
export const AUDIO_FILE_NAME = 'audio.wav';

async function audioWith(options: {
  readonly composition: ValidatedComposition;
  readonly audio: CheckedAudio | null;
  readonly tools: FfmpegTools;
  readonly range: FrameRange;
  readonly path: string;
  readonly timeoutMs: number;
  readonly dependencies: ExportDependencies;
  readonly signal: AbortSignal | undefined;
}): Promise<AudioManifest> {
  const { composition, audio, tools, range, path, timeoutMs, dependencies, signal } = options;
  const samples = audioRangeOf(range, samplesAt);
  const common = {
    manifestVersion: EXPORT_MANIFEST_VERSION,
    kind: 'audio' as const,
    compositionHash: sha256(canonicalJson(composition)),
    schemaVersion: composition.schemaVersion,
    durationUs: composition.durationUs,
    frameCount: frameCount(composition.durationUs, composition.fps),
    fps: composition.fps,
    range,
    identity: ffmpegIdentityBlock(tools),
  };
  if (audio === null) {
    return { ...common, audio: null, ffmpeg: { ...ffmpegBuild(tools), audioArgs: null } };
  }
  const partial = `${path}${PARTIAL_SUFFIX}`;
  let stretched: StretchedAudio | null = null;
  try {
    throwIfCancelled(signal);
    // Every sound at another speed or reversed, computed into a WAV of its own (D82.6).
    stretched = await stretchedAudio(audio.layout, audio.inputs, tools, timeoutMs, signal);
    throwIfCancelled(signal);
    const graph = audioPassGraph(stretched.graphLayout, samples);
    // The envelope of every sound with a curve, streamed on its own pipe (D85.5).
    const curved = stretched.graphLayout.sounds.flatMap((sound, index) =>
      sound.volumeKeys === undefined ? [] : [{ index, sound, volumeKeys: sound.volumeKeys }],
    );
    const streams = curved.map(({ sound, volumeKeys }) =>
      envelopeStream(volumeKeys, sound.sampleCount),
    );
    const args = audioPassArgs({
      graph,
      inputs: stretched.inputs,
      envelopes: curved.map((_, index) => envelopePipe(index)),
      output: partial,
    });
    const result = await tools.run(
      args,
      new Uint8Array(0),
      timeoutMs * PASS_TIMEOUT_FACTOR,
      signal,
      streams.map(({ chunks }) => chunks),
    );
    throwIfCancelled(signal);
    if (result.code !== 0) {
      throw encodeFailed(
        `FFmpeg exited with ${String(result.code)} in the audio pass: ${result.stderr.trim()}`,
      );
    }
    const stream = await tools.audioStream(partial);
    if (
      stream.codec !== AUDIO_INTERMEDIATE_CODEC ||
      stream.sampleRate !== SAMPLE_RATE ||
      stream.channels !== 2 ||
      stream.samples !== samples.sampleCount
    ) {
      throw encodeFailed(
        `The audio pass wrote ${stream.codec} at ${String(stream.sampleRate)} Hz with ${String(stream.channels)} channels and ${String(stream.samples)} samples, not ${AUDIO_INTERMEDIATE_CODEC} at ${String(SAMPLE_RATE)} Hz with 2 and ${String(samples.sampleCount)}.`,
      );
    }
    // The pass is kept only if every source it read is still the file verified (D64.3).
    await audio.check();
    const hash = await tools.sha256File(partial);
    const envelopes: (string | null)[] = stretched.graphLayout.sounds.map(() => null);
    curved.forEach(({ index }, ordinal) => {
      envelopes[index] = (streams[ordinal] as EnvelopeStream).sha256();
    });
    throwIfCancelled(signal);
    await dependencies.renameFile(partial, path);
    return {
      ...common,
      audio: {
        sampleRate: SAMPLE_RATE,
        totalSamples: audio.layout.totalSamples,
        sounds: manifestSounds(audio, stretched.stretches, envelopes),
        rangeStartSample: samples.startSample,
        rangeSampleCount: samples.sampleCount,
        channelLayout: AUDIO_CHANNEL_LAYOUT,
        codec: AUDIO_INTERMEDIATE_CODEC,
        format: AUDIO_INTERMEDIATE_FORMAT,
        file: basename(path),
        sha256: hash,
      },
      ffmpeg: {
        ...ffmpegBuild(tools),
        audioArgs: audioPassArgs({
          graph,
          inputs: audio.inputs.map((_, index) => soundPlaceholder(index)),
          envelopes: curved.map(({ index }) => envelopePlaceholder(index)),
          output: OUTPUT_PLACEHOLDER,
        }),
      },
    };
  } catch (reason) {
    await dependencies.removeFile(partial).catch(() => undefined);
    throw asProducerError(failure(reason, signal));
  } finally {
    await stretched?.remove();
  }
}

/** `renderAudio` on the given dependencies; tests pass fakes. */
export async function renderAudioWith(
  request: AudioRequest,
  dependencies: ExportDependencies,
): Promise<AudioResult> {
  const { signal } = request;
  try {
    throwIfCancelled(signal);
    const composition = validated(request.document);
    const range = frameRange(composition, request.range);
    checkDocumentLimits(request.limits, composition, range.frameCount);
    const assets = await verifiedAssets(composition, request.resolveAsset, request.limits);
    checkAssetLimits(request.limits, assets);
    const tools = await dependencies.tools(request.ffmpeg);
    const prepared: PreparedRender = { composition, assets, runtime: loadRuntimeBuild() };
    const audio = await checkedAudio(prepared, tools);
    try {
      request.onProgress?.({ event: 'start', frames: 0, segments: 0 });
      const manifest = await audioWith({
        composition,
        audio,
        tools,
        range,
        path: join(resolve(request.outputDirectory), AUDIO_FILE_NAME),
        timeoutMs: request.encoderTimeoutMs ?? DEFAULT_TIMEOUT_MS,
        dependencies,
        signal,
      });
      return { manifest };
    } finally {
      await audio?.close();
    }
  } catch (reason) {
    throw failure(reason, signal);
  }
}

/** A file name of a manifest: a plain name in its directory, never a path (D47.5). */
function plainName(name: string): string {
  if (name === '' || name === '.' || name === '..' || /[/\\\0]/.test(name)) {
    throw joinInvalid(
      `A manifest names the file ${JSON.stringify(name)}, which is not a plain file name.`,
    );
  }
  return name;
}

/** The fields every part of one render shares, compared as canonical JSON (D47.5). */
const SHARED_FIELDS = [
  'manifestVersion',
  'capture',
  'clear',
  'compositionHash',
  'schemaVersion',
  'runtime',
  'chromium',
  'environment',
  'assets',
  'durationUs',
  'frameCount',
  'preset',
  'segmentFrames',
  'grid',
  'video',
  'ffmpeg',
  'identity',
] as const;

/** The decode of a manifest without `seekArgs`, which a job records only when it went back (D82.5). */
function withoutSeek(video: ManifestVideo | null): ManifestVideo | null {
  if (video === null) return null;
  return {
    decoder: video.decoder,
    decodeArgs: video.decodeArgs,
    sources: video.sources,
  };
}

const FFMPEG_BUILD_FIELDS = [
  'release',
  'asset',
  'url',
  'archiveSha256',
  'ffmpegSha256',
  'ffprobeSha256',
  'version',
  'configuration',
  'encoders',
] as const;

/** One segment of a join, with the file it is read from. */
export interface JoinSegment extends ManifestSegment {
  readonly path: string;
}

/**
 * What the export manifest of a join says of its document (D92.3): the parts'
 * own in the join of D47.5, the target's in a join by keys.
 */
export type JoinDocument = Pick<
  SegmentsManifest,
  'compositionHash' | 'schemaVersion' | 'assets' | 'durationUs' | 'frameCount' | 'grid'
>;

/** What a join joins, once the manifests were found to make one render. */
export interface JoinPlan {
  readonly first: SegmentsManifest;
  /** The document the export is of: the parts', or the target of a join by keys (D92.3). */
  readonly document: JoinDocument;
  /** The decode of the parts, with `seekArgs` when any part went back by a seek (D82.5). */
  readonly video: ManifestVideo | null;
  readonly range: AudioManifest['range'];
  /** In the order of the grid; on a grid of spans with their spans and keys (D92.2). */
  readonly segments: readonly JoinSegment[];
  readonly frames: readonly ManifestFrame[];
  readonly blockedRequests: readonly string[];
  readonly audioPath: string | null;
}

/** A key as a manifest records it: `sha256:` and 64 lowercase hex digits (D92.1). */
const KEY_PATTERN = /^sha256:[0-9a-f]{64}$/;

/** A segments manifest of the version of this build, of a canvas a video job draws (D47.8, D89.1). */
function checkSegmentsKind(manifest: SegmentsManifest): void {
  if (
    (manifest.kind as string) !== 'segments' ||
    manifest.manifestVersion !== EXPORT_MANIFEST_VERSION
  ) {
    throw joinInvalid(
      `A segments manifest of version ${String(EXPORT_MANIFEST_VERSION)} was expected, got ${JSON.stringify(manifest.kind)} of version ${String(manifest.manifestVersion)}.`,
    );
  }
  // A video job draws a side of at most 1920 (D89.1); the range job refuses a
  // larger canvas, and so does the join of segments that claim one.
  const { sourceWidth, sourceHeight } = manifest.preset;
  if (sourceWidth > MAX_VIDEO_SIDE || sourceHeight > MAX_VIDEO_SIDE) {
    throw new ProducerError(
      'preset-unsupported',
      `A segments manifest names a composition of ${String(sourceWidth)}x${String(sourceHeight)}: a video job draws a side of at most ${String(MAX_VIDEO_SIDE)} (D89.1).`,
    );
  }
}

/** An audio manifest of the version of this build (D47.8). */
function checkAudioKind(pass: AudioManifest): void {
  if ((pass.kind as string) !== 'audio' || pass.manifestVersion !== EXPORT_MANIFEST_VERSION) {
    throw joinInvalid(
      `An audio manifest of version ${String(EXPORT_MANIFEST_VERSION)} was expected, got ${JSON.stringify(pass.kind)} of version ${String(pass.manifestVersion)}.`,
    );
  }
}

/** The FFmpeg of the audio pass against that of the segments (D47.5). */
function audioFfmpegFields(
  pass: AudioManifest,
  first: SegmentsManifest,
): [string, unknown, unknown][] {
  return [
    ...FFMPEG_BUILD_FIELDS.map(
      (field) =>
        [`ffmpeg.${field}`, pass.ffmpeg[field], first.ffmpeg[field]] as [string, unknown, unknown],
    ),
    ['identity.ffmpegSha256', pass.identity.ffmpegSha256, first.identity.ffmpegSha256],
    ['identity.ffprobeSha256', pass.identity.ffprobeSha256, first.identity.ffprobeSha256],
    ['identity.ffmpegVersion', pass.identity.ffmpegVersion, first.identity.ffmpegVersion],
    [
      'identity.ffmpegBuildConfiguration',
      pass.identity.ffmpegBuildConfiguration,
      first.identity.ffmpegBuildConfiguration,
    ],
  ];
}

function checkAudioFields(fields: readonly [string, unknown, unknown][]): void {
  for (const [field, given, expected] of fields) {
    if (canonicalJson(given) !== canonicalJson(expected)) {
      throw joinInvalid(`The audio manifest differs from the segments in ${field}.`);
    }
  }
}

/**
 * The segments of a manifest on the grid it names, by index (D47.1, D80.4):
 * the grid of D47.1 without one; on a grid of spans, each in the span it
 * names and with a key (D92.2). Anything else is `join-invalid`.
 */
function checkOnGrid(manifest: SegmentsManifest): void {
  const { segmentFrames, frameCount: total } = manifest;
  const onGrid = manifest.grid === undefined ? null : manifestGridSegments(manifest);
  for (const segment of manifest.segments) {
    if (onGrid !== null) {
      // The segments of the grid the manifests name, by index (D80.4).
      const expected = Number.isSafeInteger(segment.index) ? onGrid[segment.index] : undefined;
      if (
        expected === undefined ||
        segment.firstFrame !== expected.firstFrame ||
        segment.frameCount !== expected.frameCount
      ) {
        throw joinInvalid(`Segment ${String(segment.index)} does not lie on the segment grid.`);
      }
      const { span } = expected as Partial<SpanSegment>;
      if (span !== undefined && segment.span !== span) {
        throw joinInvalid(
          `Segment ${String(segment.index)} names span ${String(segment.span)}, not span ${String(span)} of the grid, which it lies in.`,
        );
      }
      if (
        span !== undefined &&
        (typeof segment.key !== 'string' || !KEY_PATTERN.test(segment.key))
      ) {
        throw joinInvalid(
          `Segment ${String(segment.index)} of a grid of spans has no key, which every such segment has (D92.2).`,
        );
      }
    } else {
      const expectedFrames = Math.min(segmentFrames, total - segment.index * segmentFrames);
      if (
        !Number.isSafeInteger(segment.index) ||
        segment.index < 0 ||
        segment.firstFrame !== segment.index * segmentFrames ||
        segment.frameCount !== expectedFrames ||
        expectedFrames < 1
      ) {
        throw joinInvalid(`Segment ${String(segment.index)} does not lie on the segment grid.`);
      }
    }
  }
}

/** The frames of a manifest are exactly those of its segments (D47.5). */
function checkPartFrames(manifest: SegmentsManifest): void {
  const own = new Set<number>();
  for (const segment of manifest.segments) {
    for (
      let index = segment.firstFrame;
      index < segment.firstFrame + segment.frameCount;
      index += 1
    ) {
      own.add(index);
    }
  }
  if (manifest.frames.length !== own.size || manifest.frames.some(({ index }) => !own.has(index))) {
    throw joinInvalid('A segments manifest lists other frames than its segments hold.');
  }
}

/**
 * Whether the manifests make one render (D47.5): the same document, runtime,
 * browser, environment, preset, segment length, grid, and FFmpeg; segments on
 * the grid (D47.1, or the one the manifests name, D80.4, with its spans and
 * the key of each segment, D92.2), each once, without a gap, covering exactly
 * the range of the audio pass; and frames that are the segments' frames.
 * Anything else is `join-invalid`, before FFmpeg runs. Pure: the files are
 * checked afterwards.
 */
export function joinPlan(
  parts: readonly JoinPart<SegmentsManifest>[],
  audio: JoinPart<AudioManifest>,
): JoinPlan {
  const [head] = parts;
  if (head === undefined) throw joinInvalid('A join needs at least one segments manifest.');
  const first = head.manifest;
  for (const { manifest } of parts) {
    checkSegmentsKind(manifest);
    for (const field of SHARED_FIELDS) {
      // An absent grid is the grid of D47.1 (D80.2); every other field is required. Whether a
      // job went back by a seek is its own (D82.5): the decode is compared without it.
      const of = (given: SegmentsManifest): unknown =>
        field === 'grid'
          ? (given.grid ?? null)
          : field === 'video'
            ? withoutSeek(given.video)
            : given[field];
      if (canonicalJson(of(manifest)) !== canonicalJson(of(first))) {
        throw joinInvalid(
          `The segments manifests differ in ${field}; they are not parts of one render.`,
        );
      }
    }
  }
  const pass = audio.manifest;
  checkAudioKind(pass);
  checkAudioFields([
    ['compositionHash', pass.compositionHash, first.compositionHash],
    ['schemaVersion', pass.schemaVersion, first.schemaVersion],
    ['durationUs', pass.durationUs, first.durationUs],
    ['frameCount', pass.frameCount, first.frameCount],
    ['fps', pass.fps, first.preset.fps],
    ...audioFfmpegFields(pass, first),
  ]);
  const all: JoinSegment[] = [];
  const frames: ManifestFrame[] = [];
  const blocked = new Set<string>();
  for (const { manifest, directory } of parts) {
    checkOnGrid(manifest);
    checkPartFrames(manifest);
    for (const segment of manifest.segments) {
      all.push({ ...segment, path: join(resolve(directory), plainName(segment.file)) });
    }
    frames.push(...manifest.frames);
    for (const url of manifest.blockedRequests) blocked.add(url);
  }
  all.sort((a, b) => a.index - b.index);
  frames.sort((a, b) => a.index - b.index);
  const { range } = pass;
  let next = range.firstFrame;
  for (const segment of all) {
    if (segment.firstFrame < next) {
      throw joinInvalid(`Segment ${String(segment.index)} is given more than once.`);
    }
    if (segment.firstFrame > next) {
      throw joinInvalid(
        `Frames ${String(next)}…${String(segment.firstFrame - 1)} are in no segment: the parts have a gap.`,
      );
    }
    next = segment.firstFrame + segment.frameCount;
  }
  const end = range.firstFrame + range.frameCount;
  if (all[0]?.firstFrame !== range.firstFrame || next !== end) {
    throw joinInvalid(
      `The segments cover frames ${String(all[0]?.firstFrame ?? 0)}…${String(next - 1)}, not the range ${String(range.firstFrame)}…${String(end - 1)} of the audio pass.`,
    );
  }
  const seekArgs = parts.find(({ manifest }) => manifest.video?.seekArgs !== undefined)?.manifest
    .video?.seekArgs;
  return {
    first,
    document: {
      compositionHash: first.compositionHash,
      schemaVersion: first.schemaVersion,
      assets: first.assets,
      durationUs: first.durationUs,
      frameCount: first.frameCount,
      ...(first.grid === undefined ? {} : { grid: first.grid }),
    },
    video:
      first.video === null || seekArgs === undefined ? first.video : { ...first.video, seekArgs },
    range,
    segments: all,
    frames,
    blockedRequests: [...blocked].sort(),
    audioPath:
      pass.audio === null ? null : join(resolve(audio.directory), plainName(pass.audio.file)),
  };
}

/**
 * The segments of the grid a segments manifest names (D80.4), once the grid
 * was found to be one: a span of whole frames inside the composition, its
 * times the frame times of its ends, a shortest last segment from 1 to the
 * segment length, and not the grid of D47.1, which a manifest names only with
 * spans. On a grid of spans (D92.2), its spans are frame times inside its
 * span, increasing, the first at its start, and its segments are those of its
 * spans, each with its span. Anything else is `join-invalid`.
 */
function manifestGridSegments(manifest: SegmentsManifest): Segment[] {
  const { grid, segmentFrames, frameCount: total, durationUs } = manifest;
  if (grid === undefined) throw joinInvalid('The segments manifests name no grid.');
  const { fps } = manifest.preset;
  const end = grid.firstFrame + grid.frameCount;
  const timeOf = (frame: number): number =>
    frame >= total ? durationUs : frameToTimeUs(frame, fps);
  const whole = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;
  if (
    !whole(grid.firstFrame) ||
    !whole(grid.frameCount) ||
    grid.frameCount < 1 ||
    end > total ||
    grid.fromUs !== timeOf(grid.firstFrame) ||
    grid.toUs !== timeOf(end) ||
    !Number.isSafeInteger(segmentFrames) ||
    segmentFrames < 1
  ) {
    throw joinInvalid('The grid of the segments manifests is not a span of the composition.');
  }
  try {
    checkedMinSegmentFrames(grid.minSegmentFrames, segmentFrames);
  } catch {
    throw joinInvalid(
      `The grid's shortest last segment ${String(grid.minSegmentFrames)} is not in [1, ${String(segmentFrames)}].`,
    );
  }
  const anchored = {
    firstFrame: grid.firstFrame,
    frameCount: grid.frameCount,
    segmentFrames,
    minSegmentFrames: grid.minSegmentFrames,
  };
  if (grid.spans !== undefined) {
    // A manifest is read from JSON: anything but a list of spans names none.
    const listed: unknown = grid.spans;
    if (!Array.isArray(listed) || listed.length === 0) {
      throw joinInvalid('The grid of the segments manifests names no span.');
    }
    const spans: readonly ManifestSpan[] = grid.spans;
    spans.forEach(({ fromUs, firstFrame }, at) => {
      const before = spans[at - 1]?.firstFrame;
      if (
        !whole(firstFrame) ||
        firstFrame >= end ||
        fromUs !== timeOf(firstFrame) ||
        (before === undefined ? firstFrame !== grid.firstFrame : firstFrame <= before)
      ) {
        throw joinInvalid(
          `Span ${String(at)} of the grid of the segments manifests is not a frame time inside the grid's span after the span before it.`,
        );
      }
    });
    return spanSegments(anchored, spans);
  }
  const segments = gridSegments(anchored);
  const canonical = Math.ceil(total / segmentFrames);
  if (grid.firstFrame === 0 && end === total && segments.length === canonical) {
    throw joinInvalid('The segments manifests name the grid of D47.1, which no manifest names.');
  }
  return segments;
}

/** The fields every part of a join by keys shares (D92.3), compared as canonical JSON. */
const KEYED_SHARED_FIELDS = [
  'manifestVersion',
  'capture',
  'clear',
  'runtime',
  'chromium',
  'environment',
  'preset',
  'segmentFrames',
  'ffmpeg',
  'identity',
] as const;

/** The fields of a part of the target that it shares with the target (D92.3). */
const TARGET_FIELDS = [
  'compositionHash',
  'schemaVersion',
  'assets',
  'durationUs',
  'frameCount',
  'grid',
] as const;

/** The decode of a manifest without its sources and its seek (D92.3). */
function decodeOf(video: ManifestVideo | null): unknown {
  return video === null ? null : { decoder: video.decoder, decodeArgs: video.decodeArgs };
}

/** What a join by keys knows of its target, once it was read and checked (D92.3). */
export interface KeyedTarget {
  readonly fps: number;
  /** The target's grid of spans (D92.2). */
  readonly grid: SegmentGrid & { readonly spans: readonly GridSpan[] };
  readonly document: JoinDocument & { readonly grid: ManifestGrid };
  readonly preset: ManifestMp4Preset;
  readonly segmentFrames: number;
  /** The decode of the target's videos as a job reads them (D50.5), or `null` without video nodes. */
  readonly video: ManifestVideo | null;
  /** The key of a segment of the target's grid (D92.1). */
  readonly keyOf: (segment: SpanSegment) => SegmentKey;
}

/**
 * The plan of a join by keys (D92.3): the parts agree with each other in the
 * pins of the run, and with the target in its preset and segment length; a
 * part of the target (its `compositionHash`) is a part of the target's render
 * on the target's grid, and fills its own slots, each once, with the key of
 * the target there; a part of another document is checked as a render of its
 * own, and each of its segments fills every slot left free whose key is its
 * key; one that fills none is left out. Every slot of the range of the audio
 * pass, which is the target's, must be filled. Frames are numbered with the
 * indices and times of the slots they fill. Anything else is `join-invalid`.
 */
export function keyedJoinPlan(
  parts: readonly JoinPart<SegmentsManifest>[],
  audio: JoinPart<AudioManifest>,
  target: KeyedTarget,
): JoinPlan {
  const [head] = parts;
  if (head === undefined) throw joinInvalid('A join needs at least one segments manifest.');
  const first = head.manifest;
  for (const { manifest } of parts) {
    checkSegmentsKind(manifest);
    for (const field of KEYED_SHARED_FIELDS) {
      if (canonicalJson(manifest[field]) !== canonicalJson(first[field])) {
        throw joinInvalid(`The segments manifests differ in ${field}; they are not of one worker.`);
      }
    }
  }
  if (canonicalJson(first.preset) !== canonicalJson(target.preset)) {
    throw joinInvalid('The segments manifests differ from the target in preset.');
  }
  if (first.segmentFrames !== target.segmentFrames) {
    throw joinInvalid('The segments manifests differ from the target in segmentFrames.');
  }
  // The decode of every part that decoded a video, and of the target, without sources or seek.
  const decodes = [...parts.map(({ manifest }) => manifest.video), target.video].flatMap((video) =>
    video === null ? [] : [canonicalJson(decodeOf(video))],
  );
  if (new Set(decodes).size > 1) {
    throw joinInvalid(
      'The segments manifests differ in the decode of video; they are not of one worker.',
    );
  }
  const pass = audio.manifest;
  checkAudioKind(pass);
  const { document } = target;
  checkAudioFields([
    ['compositionHash', pass.compositionHash, document.compositionHash],
    ['schemaVersion', pass.schemaVersion, document.schemaVersion],
    ['durationUs', pass.durationUs, document.durationUs],
    ['frameCount', pass.frameCount, document.frameCount],
    ['fps', pass.fps, target.fps],
    ...audioFfmpegFields(pass, first),
  ]);
  // The slots of the grid that the audio pass covers: whole segments of the target's grid.
  const slots = spanSegments(target.grid, target.grid.spans);
  const { range } = pass;
  const end = range.firstFrame + range.frameCount;
  const covered = slots.filter(
    ({ firstFrame }) => firstFrame >= range.firstFrame && firstFrame < end,
  );
  const last = covered.at(-1);
  if (
    covered[0]?.firstFrame !== range.firstFrame ||
    last === undefined ||
    last.firstFrame + last.frameCount !== end
  ) {
    throw joinInvalid(
      `The range ${String(range.firstFrame)}…${String(end - 1)} of the audio pass is not whole segments of the target's grid.`,
    );
  }
  const keys = new Map<number, string>();
  const keyOf = (slot: SpanSegment): string => {
    let key = keys.get(slot.index);
    if (key === undefined) {
      key = target.keyOf(slot).key;
      keys.set(slot.index, key);
    }
    return key;
  };
  interface Found {
    readonly segment: ManifestSegment;
    readonly part: JoinPart<SegmentsManifest>;
  }
  const own = new Map<number, Found>();
  const byKey = new Map<string, Found>();
  for (const part of parts) {
    const { manifest } = part;
    checkOnGrid(manifest);
    checkPartFrames(manifest);
    const ofTarget = manifest.compositionHash === document.compositionHash;
    if (ofTarget) {
      for (const field of TARGET_FIELDS) {
        if (canonicalJson(manifest[field] ?? null) !== canonicalJson(document[field])) {
          throw joinInvalid(`A part of the target differs from the target in ${field}.`);
        }
      }
    }
    for (const segment of manifest.segments) {
      const name = `Segment ${String(segment.index)}`;
      if (segment.key === undefined) {
        throw joinInvalid(
          `${name} has no key: a join by keys takes the parts of renders on spans (D92.2, D92.3).`,
        );
      }
      if (!ofTarget) {
        // The first segment given with a key fills the slots of that key (D92, question 8).
        if (!byKey.has(segment.key)) byKey.set(segment.key, { segment, part });
        continue;
      }
      // On the target's grid, as checkOnGrid found: the slot of its index.
      const slot = slots[segment.index];
      if (slot === undefined || !covered.includes(slot)) {
        throw joinInvalid(`${name} of the target lies outside the range of the audio pass.`);
      }
      if (own.has(slot.index)) {
        throw joinInvalid(`${name} of the target is given more than once.`);
      }
      if (segment.key !== keyOf(slot)) {
        throw joinInvalid(
          `${name} of the target has another key than the target's there: it was rendered with other pins (D92.1).`,
        );
      }
      own.set(slot.index, { segment, part });
    }
  }
  const segments: JoinSegment[] = [];
  const frames: ManifestFrame[] = [];
  const used = new Set<JoinPart<SegmentsManifest>>();
  for (const slot of covered) {
    const key = keyOf(slot);
    const found = own.get(slot.index) ?? byKey.get(key);
    if (found === undefined) {
      throw joinInvalid(
        `Segment ${String(slot.index)} of the target (frames ${String(slot.firstFrame)}…${String(slot.firstFrame + slot.frameCount - 1)}, span ${String(slot.span)}) has no part: no part of the target fills it and no segment given has its key.`,
      );
    }
    const { segment, part } = found;
    if (segment.frameCount !== slot.frameCount) {
      // Unreachable: a key hashes every frame of its segment (D92.1).
      throw joinInvalid(`Segment ${String(slot.index)} has a key of another number of frames.`);
    }
    used.add(part);
    segments.push({
      ...manifestSegment(slot, { span: slot.span, key }),
      file: segment.file,
      sha256: segment.sha256,
      path: join(resolve(part.directory), plainName(segment.file)),
    });
    // The part's frames of the segment, numbered with the indices and times of the slot.
    const held = part.manifest.frames
      .filter(
        ({ index }) =>
          index >= segment.firstFrame && index < segment.firstFrame + segment.frameCount,
      )
      .sort((a, b) => a.index - b.index);
    held.forEach(({ sha256: hash }, offset) => {
      const index = slot.firstFrame + offset;
      frames.push({ index, timeUs: frameToTimeUs(index, target.fps), sha256: hash });
    });
  }
  const contributing = parts.filter((part) => used.has(part));
  const blocked = new Set(contributing.flatMap(({ manifest }) => manifest.blockedRequests));
  const seekArgs = contributing.find(({ manifest }) => manifest.video?.seekArgs !== undefined)
    ?.manifest.video?.seekArgs;
  const video = target.video === null ? null : withoutSeek(target.video);
  return {
    first,
    document,
    video: video === null || seekArgs === undefined ? video : { ...video, seekArgs },
    range,
    segments,
    frames,
    blockedRequests: [...blocked].sort(),
    audioPath:
      pass.audio === null ? null : join(resolve(audio.directory), plainName(pass.audio.file)),
  };
}

async function joinWith(
  plan: JoinPlan,
  audio: AudioManifest,
  tools: FfmpegTools,
  outputPath: string,
  timeoutMs: number,
  dependencies: ExportDependencies,
  signal: AbortSignal | undefined,
): Promise<ExportManifest> {
  for (const segment of plan.segments) {
    const found = await tools.sha256File(segment.path).catch(() => null);
    if (found !== segment.sha256) {
      throw joinInvalid(
        `The file of segment ${String(segment.index)} has ${String(found)}, not the ${segment.sha256} of its manifest.`,
      );
    }
  }
  if (plan.audioPath !== null && audio.audio !== null) {
    const found = await tools.sha256File(plan.audioPath).catch(() => null);
    if (found !== audio.audio.sha256) {
      throw joinInvalid(
        `The audio file has ${String(found)}, not the ${audio.audio.sha256} of its manifest.`,
      );
    }
  }
  const { first, range } = plan;
  const partial = `${outputPath}${PARTIAL_SUFFIX}`;
  const args = joinArgs({ fps: first.preset.fps, audio: plan.audioPath, output: partial });
  try {
    const list = new TextEncoder().encode(concatList(plan.segments.map(({ path }) => path)));
    throwIfCancelled(signal);
    const result = await tools.run(args, list, timeoutMs * PASS_TIMEOUT_FACTOR, signal);
    throwIfCancelled(signal);
    if (result.code !== 0) {
      throw encodeFailed(
        `FFmpeg exited with ${String(result.code)} in the join: ${result.stderr.trim()}`,
      );
    }
    // The self-check of D29.3 on the joined file: every frame of the range once,
    // at index × 512 from the range's start.
    const packets = await tools.countVideoPackets(partial);
    if (packets !== range.frameCount) {
      throw encodeFailed(
        `The MP4 holds ${String(packets)} video packets, not ${String(range.frameCount)}.`,
      );
    }
    const timestamps = await tools.videoTimestamps(partial);
    if (
      timestamps.length !== range.frameCount ||
      timestamps.some((pts, at) => pts !== at * TIME_SCALE_PER_FRAME)
    ) {
      throw encodeFailed(
        `The MP4 holds other presentation times than frames 0…${String(range.frameCount - 1)} at ${String(TIME_SCALE_PER_FRAME)} each.`,
      );
    }
    throwIfCancelled(signal);
    await dependencies.renameFile(partial, outputPath);
  } catch (reason) {
    await dependencies.removeFile(partial).catch(() => undefined);
    throw asProducerError(failure(reason, signal));
  }
  const pass = audio.audio;
  const exportedAudio: ManifestAudio | null =
    pass === null
      ? null
      : {
          sampleRate: pass.sampleRate,
          totalSamples: pass.totalSamples,
          sounds: pass.sounds,
          rangeStartSample: pass.rangeStartSample,
          rangeSampleCount: pass.rangeSampleCount,
          channelLayout: pass.channelLayout,
          codec: AUDIO_CODEC,
          bitrate: AUDIO_BITRATE,
          intermediate: { codec: pass.codec, format: pass.format, sha256: pass.sha256 },
        };
  const { document } = plan;
  // A segment names its span and key on a grid of spans only, so an export without keeps its bytes (D92.2).
  const keyed = document.grid?.spans !== undefined;
  return {
    manifestVersion: first.manifestVersion,
    compositionHash: document.compositionHash,
    schemaVersion: document.schemaVersion,
    runtime: first.runtime,
    chromium: first.chromium,
    environment: first.environment,
    assets: document.assets,
    durationUs: document.durationUs,
    frameCount: document.frameCount,
    preset: first.preset,
    segmentFrames: first.segmentFrames,
    ...(document.grid === undefined ? {} : { grid: document.grid }),
    video: plan.video,
    identity: first.identity,
    kind: 'export',
    capture: first.capture,
    clear: first.clear,
    range,
    segments: plan.segments.map((segment) => ({
      ...manifestSegment(
        segment,
        keyed ? { span: segment.span ?? 0, key: segment.key ?? '' } : undefined,
      ),
      sha256: segment.sha256,
    })),
    frames: plan.frames,
    blockedRequests: plan.blockedRequests,
    ffmpeg: {
      ...first.ffmpeg,
      audioArgs: audio.ffmpeg.audioArgs,
      joinArgs: joinArgs({
        fps: first.preset.fps,
        audio: plan.audioPath === null ? null : AUDIO_PLACEHOLDER,
        output: OUTPUT_PLACEHOLDER,
      }),
    },
    audio: exportedAudio,
  };
}

/**
 * What a join by keys reads before its plan (D92.3): the target validated,
 * its grid of spans, its assets resolved and verified within the limits, the
 * metrics of the fonts of its measured nodes, and the facts of its videos as
 * a job reads them (D50.5); its keys are computed on the pins of this build
 * with the runtime build the parts name, for the slots the plan asks for.
 */
async function keyedJoin(
  request: JoinRequest,
  target: JoinTarget,
  dependencies: ExportDependencies,
): Promise<{ readonly plan: JoinPlan; readonly tools: FfmpegTools }> {
  const { signal } = request;
  const head = request.segments[0]?.manifest;
  if (head === undefined) throw joinInvalid('A join needs at least one segments manifest.');
  const composition = validated(target.document);
  const preset = /^mp4-([0-9a-z]+)$/.exec(head.preset.name)?.[1];
  if (preset === undefined) {
    throw joinInvalid(`A segments manifest names the preset ${JSON.stringify(head.preset.name)}.`);
  }
  const size = presetSize(composition, preset);
  const segmentFrames = checkedSegmentFrames(target.segmentFrames ?? head.segmentFrames);
  if (target.grid.spans === undefined) {
    throw joinInvalid(
      'A join by keys needs the spans of the grid: only a render on spans records keys (D92.2, D92.3).',
    );
  }
  const grid = segmentGrid(composition, segmentFrames, target.grid);
  const { spans } = grid;
  if (spans === undefined) throw joinInvalid('The grid of the target has no spans.');
  checkDocumentLimits(target.limits, composition, grid.frameCount);
  const assets = await verifiedAssets(composition, target.resolveAsset, target.limits);
  checkAssetLimits(target.limits, assets);
  const keyOf = segmentKeyer(
    composition,
    { preset, segmentFrames, fonts: measuredFonts(composition, assets) },
    pinnedKeyPins(head.runtime.contentHash),
  );
  const tools = await dependencies.tools(request.ffmpeg);
  throwIfCancelled(signal);
  const videos = await prepareVideos(composition, assets, tools);
  throwIfCancelled(signal);
  const plan = keyedJoinPlan(request.segments, request.audio, {
    fps: composition.fps,
    grid: { ...grid, spans },
    document: {
      compositionHash: sha256(canonicalJson(composition)),
      schemaVersion: composition.schemaVersion,
      assets: manifestAssets(assets),
      durationUs: composition.durationUs,
      frameCount: frameCount(composition.durationUs, composition.fps),
      grid: manifestGrid(composition, grid),
    },
    preset: mp4Preset(composition, size),
    segmentFrames,
    video: videos?.manifest ?? null,
    keyOf,
  });
  return { plan, tools };
}

/** `joinSegments` on the given dependencies; tests pass fakes. */
export async function joinSegmentsWith(
  request: JoinRequest,
  dependencies: ExportDependencies,
): Promise<JoinResult> {
  const { signal } = request;
  try {
    throwIfCancelled(signal);
    const { plan, tools } =
      request.target === undefined
        ? {
            plan: joinPlan(request.segments, request.audio),
            tools: await dependencies.tools(request.ffmpeg),
          }
        : await keyedJoin(request, request.target, dependencies);
    const outputPath = resolve(request.outputPath);
    const manifest = await joinWith(
      plan,
      request.audio.manifest,
      tools,
      outputPath,
      request.encoderTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      dependencies,
      signal,
    );
    return { outputPath, manifest };
  } catch (reason) {
    throw failure(reason, signal);
  }
}

/**
 * The one-pass export on the given dependencies: every segment of the grid in
 * one page, the audio pass, and the join, on the code the three commands run
 * (D47.6). The parts are written next to the output and removed afterwards.
 */
export async function exportWith(
  request: ExportRequest,
  dependencies: ExportDependencies,
): Promise<ExportResult> {
  try {
    return await exportOf(request, dependencies);
  } catch (reason) {
    throw failure(reason, request.signal);
  }
}

async function exportOf(
  request: ExportRequest,
  dependencies: ExportDependencies,
): Promise<ExportResult> {
  const given = await preparedSegments(request, dependencies, undefined, undefined);
  const audio = await checkedAudio(given.prepared, given.tools);
  const outputPath = resolve(request.outputPath);
  const directory = dirname(outputPath);
  const stem = basename(outputPath);
  const parts: string[] = [];
  const timeoutMs = request.encoderTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const rendered = await segmentsWith(request, dependencies, given, (segment) => {
      const path = join(directory, `${stem}.${segmentFileName(segment.index)}`);
      parts.push(path);
      return path;
    });
    const audioPath = join(directory, `${stem}.${AUDIO_FILE_NAME}`);
    parts.push(audioPath);
    const pass = await audioWith({
      composition: given.prepared.composition,
      audio,
      tools: given.tools,
      range: given.frames,
      path: audioPath,
      timeoutMs,
      dependencies,
      signal: request.signal,
    });
    const plan = joinPlan([{ manifest: rendered.manifest, directory }], {
      manifest: pass,
      directory,
    });
    const manifest = await joinWith(
      plan,
      pass,
      given.tools,
      outputPath,
      timeoutMs,
      dependencies,
      request.signal,
    );
    return { outputPath, manifest, stats: rendered.stats };
  } catch (reason) {
    await dependencies.removeFile(outputPath).catch(() => undefined);
    throw asProducerError(reason);
  } finally {
    await audio?.close();
    for (const part of parts) await dependencies.removeFile(part).catch(() => undefined);
  }
}

function realDependencies(): ExportDependencies {
  return {
    tools: (paths) => pinnedFfmpeg(paths),
    async browser(given, loop) {
      const chromium = given.chromium ?? (await launchChromium());
      return {
        chromium,
        sequence: chromiumSequence(chromium, { ...given, ...loop }),
        async close() {
          if (given.chromium === undefined) await chromium.browser.close();
        },
      };
    },
    removeFile: (path) => rm(path, { force: true }),
    renameFile: (from, to) => rename(from, to),
    startTimer: realTimer,
    networkInterfaces: () => hostNetworkInterfaces(),
  };
}

/**
 * Renders a range of whole segments of `document` at `preset` into
 * `outputDirectory`, one `segment-<index>.mp4` per segment, and returns the
 * segments manifest (D47.3). The range must lie on the segment grid.
 */
export function renderSegments(request: SegmentsRequest): Promise<SegmentsResult> {
  return renderSegmentsWith(request, realDependencies());
}

/**
 * Renders the audio of a range of `document` into `outputDirectory` as
 * `audio.wav`, and returns the audio manifest (D47.4). A composition without
 * an audio clip writes no file; its manifest says so.
 */
export function renderAudio(request: AudioRequest): Promise<AudioResult> {
  return renderAudioWith(request, realDependencies());
}

/**
 * Joins the segments of one render and its audio into one MP4 at `outputPath`
 * (D47.5), after checking that the manifests make one render. With a target,
 * joins segments of renders of other documents wherever their keys are the
 * target's, and writes the export manifest of the target (D92.3).
 */
export function joinSegments(request: JoinRequest): Promise<JoinResult> {
  return joinSegmentsWith(request, realDependencies());
}

/**
 * Exports `document` as an H.264 MP4 at `preset` to `outputPath` with the
 * pinned FFmpeg (D29, D47), and returns the export manifest of D29.9.
 */
export function exportMp4(request: ExportRequest): Promise<ExportResult> {
  return exportWith(request, realDependencies());
}

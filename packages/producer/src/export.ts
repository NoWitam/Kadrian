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

import type { AssetResolver } from '@kadrion/renderer-dom';
import { frameCount, frameToTimeUs, type ValidatedComposition } from '@kadrion/schema';

import {
  AUDIO_BITRATE,
  AUDIO_CHANNEL_LAYOUT,
  AUDIO_CODEC,
  audioPlan,
  FrameSink,
  OUTPUT_PLACEHOLDER,
  presetSize,
  realTimer,
  receiptHashes,
  SAMPLE_RATE,
  samplesAt,
  TIME_SCALE_PER_FRAME,
  type AudioPlan,
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
import { asProducerError, ProducerError } from './errors.js';
import {
  checkAssetLimits,
  checkDocumentLimits,
  failure,
  onCancel,
  throwIfCancelled,
  type JobOptions,
} from './job.js';
import {
  FFMPEG_ARCHIVE_SHA256,
  FFMPEG_ASSET,
  FFMPEG_RELEASE,
  FFMPEG_URL,
  pinnedFfmpeg,
  type EncoderProcess,
  type FfmpegPaths,
  type FfmpegTools,
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
  type ManifestMp4Preset,
  type ManifestSegment,
  type RenderIdentity,
  type SegmentsManifest,
} from './manifest.js';
import {
  chromiumSequence,
  manifestBase,
  validated,
  verifiedAssets,
  type FrameSequence,
  type GridFrame,
  type PreparedRender,
  type RenderedFrame,
  type RenderTimeouts,
} from './render.js';
import { loadRuntimeBuild, type RuntimeBuild } from './runtime.js';
import { prepareVideos } from './video.js';
import {
  AUDIO_INTERMEDIATE_CODEC,
  AUDIO_INTERMEDIATE_FORMAT,
  AUDIO_PLACEHOLDER,
  audioPassArgs,
  audioPassGraph,
  audioRangeOf,
  checkedSegmentFrames,
  concatList,
  frameRange,
  joinArgs,
  PARTIAL_SUFFIX,
  rangeSegmentsOf,
  segmentArgs,
  segmentFileName,
  type FrameRange,
  type Segment,
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
  readonly resolveAsset: AssetResolver;
  /** `1080p` or `720p` (D29.5). */
  readonly preset: string;
  /** Frames per segment (D47.1); `DEFAULT_SEGMENT_FRAMES` if not given. */
  readonly segmentFrames?: number;
  /** The range on the segment grid; the whole composition if not given (D47.2). */
  readonly range?: RangeRequest;
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
  readonly resolveAsset: AssetResolver;
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
  /** The segments manifests of every job of the render, in any order. */
  readonly segments: readonly JoinPart<SegmentsManifest>[];
  /** The audio pass of the range; it states the range the segments must cover. */
  readonly audio: JoinPart<AudioManifest>;
  /** Where the MP4 is written; written under a temporary name first. */
  readonly outputPath: string;
  readonly ffmpeg: FfmpegPaths;
}

export interface JoinResult {
  readonly outputPath: string;
  readonly manifest: ExportManifest;
}

export interface ExportRequest extends RenderTimeouts, EncoderSettings, JobOptions {
  readonly document: unknown;
  readonly resolveAsset: AssetResolver;
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

/** A browser for one render: its frame loop, and how to let it go. */
export interface ExportBrowser {
  readonly chromium: LaunchedChromium;
  readonly sequence: FrameSequence;
  close(): Promise<void>;
}

/** What the export runs on; tests pass fakes (not exported by the package). */
export interface ExportDependencies {
  readonly tools: (paths: FfmpegPaths) => Promise<FfmpegTools>;
  readonly browser: (request: SegmentsRequest | ExportRequest) => Promise<ExportBrowser>;
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

interface CheckedAudio {
  readonly plan: AudioPlan;
  readonly bytes: Uint8Array;
  readonly contentHash: string;
}

/** The audio of the document, checked with the pinned ffprobe before the render (D29.6). */
async function checkedAudio(
  prepared: PreparedRender,
  tools: FfmpegTools,
): Promise<CheckedAudio | null> {
  const plan = audioPlan(prepared.composition);
  if (plan === null) return null;
  const asset = prepared.assets.find(({ id }) => id === plan.assetId);
  if (asset === undefined) {
    throw new ProducerError('audio-invalid', `The audio asset "${plan.assetId}" was not resolved.`);
  }
  const probe = await tools.probeAudio(asset.bytes);
  if (probe.audioStreams !== 1) {
    throw new ProducerError(
      'audio-invalid',
      `The audio asset "${plan.assetId}" has ${String(probe.audioStreams)} audio streams, not 1.`,
    );
  }
  if (probe.sampleRate === null) {
    throw new ProducerError(
      'audio-invalid',
      `The audio asset "${plan.assetId}" has no sample rate that ffprobe could read.`,
    );
  }
  if (plan.audibleUs === 0) {
    throw new ProducerError(
      'audio-invalid',
      `The clip "${plan.clipId}" starts at or after the end of the composition, so none of it would be heard; silence is not an export.`,
    );
  }
  if (probe.samples * 1_000_000n < BigInt(plan.audibleUs) * BigInt(probe.sampleRate)) {
    throw new ProducerError(
      'audio-invalid',
      `The audio asset "${plan.assetId}" is shorter than the ${String(plan.audibleUs)} µs of its clip that are heard.`,
    );
  }
  return { plan, bytes: asset.bytes, contentHash: asset.contentHash };
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

function mp4Preset(composition: ValidatedComposition, size: PresetSize): ManifestMp4Preset {
  return {
    name: `mp4-${size.name}`,
    width: size.width,
    height: size.height,
    sourceWidth: composition.width,
    sourceHeight: composition.height,
    fps: composition.fps,
    deviceScaleFactor: 1,
    videoGraph: videoGraph(size),
  };
}

/** Where one segment is written, its temporary name, and its name in the manifest. */
interface SegmentTarget {
  readonly segment: Segment;
  readonly path: string;
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
      index: target.segment.index,
      firstFrame: target.segment.firstFrame,
      frameCount: count,
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
    const { blockedRequests } = await browser.sequence(
      prepared,
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
): Promise<{
  readonly prepared: PreparedRender;
  readonly size: PresetSize;
  readonly segmentFrames: number;
  readonly frames: FrameRange;
  readonly segments: Segment[];
  readonly tools: FfmpegTools;
}> {
  throwIfCancelled(request.signal);
  const composition = validated(request.document);
  const size = presetSize(composition, request.preset);
  const segmentFrames = checkedSegmentFrames(request.segmentFrames);
  const frames = frameRange(composition, range, segmentFrames);
  checkDocumentLimits(request.limits, composition, frames.frameCount);
  const assets = await verifiedAssets(composition, request.resolveAsset);
  checkAssetLimits(request.limits, assets);
  const tools = await dependencies.tools(request.ffmpeg);
  throwIfCancelled(request.signal);
  return {
    prepared: {
      composition,
      assets,
      runtime: request.runtime ?? loadRuntimeBuild(),
      videos: await prepareVideos(composition, assets, tools),
    },
    size,
    segmentFrames,
    frames,
    segments: rangeSegmentsOf(composition, segmentFrames, frames),
    tools,
  };
}

async function segmentsWith(
  request: SegmentsRequest | ExportRequest,
  dependencies: ExportDependencies,
  given: Awaited<ReturnType<typeof preparedSegments>>,
  pathOf: (segment: Segment) => string,
): Promise<SegmentsResult> {
  const { prepared, size, segmentFrames, frames, segments, tools } = given;
  const timeoutMs = request.encoderTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const browser = await dependencies.browser(request);
  try {
    throwIfCancelled(request.signal);
    const targets = segments.map((segment) => ({ segment, path: pathOf(segment) }));
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
      preset: mp4Preset(prepared.composition, size),
      segmentFrames,
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
    const given = await preparedSegments(request, dependencies, request.range);
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
  const graph = audioPassGraph(audio.plan, samples);
  const partial = `${path}${PARTIAL_SUFFIX}`;
  const args = audioPassArgs({ graph, output: partial });
  try {
    throwIfCancelled(signal);
    const result = await tools.run(args, audio.bytes, timeoutMs * PASS_TIMEOUT_FACTOR, signal);
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
    const hash = await tools.sha256File(partial);
    throwIfCancelled(signal);
    await dependencies.renameFile(partial, path);
    return {
      ...common,
      audio: {
        clipId: audio.plan.clipId,
        assetId: audio.plan.assetId,
        assetHash: audio.contentHash,
        sampleRate: SAMPLE_RATE,
        startSample: audio.plan.startSample,
        sampleCount: audio.plan.sampleCount,
        totalSamples: audio.plan.totalSamples,
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
        audioArgs: audioPassArgs({ graph, output: OUTPUT_PLACEHOLDER }),
      },
    };
  } catch (reason) {
    await dependencies.removeFile(partial).catch(() => undefined);
    throw asProducerError(failure(reason, signal));
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
    const assets = await verifiedAssets(composition, request.resolveAsset);
    checkAssetLimits(request.limits, assets);
    const tools = await dependencies.tools(request.ffmpeg);
    const prepared: PreparedRender = { composition, assets, runtime: loadRuntimeBuild() };
    const audio = await checkedAudio(prepared, tools);
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
  'video',
  'ffmpeg',
  'identity',
] as const;

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

/** What a join joins, once the manifests were found to make one render. */
export interface JoinPlan {
  readonly first: SegmentsManifest;
  readonly range: AudioManifest['range'];
  readonly segments: readonly JoinSegment[];
  readonly frames: readonly ManifestFrame[];
  readonly blockedRequests: readonly string[];
  readonly audioPath: string | null;
}

/**
 * Whether the manifests make one render (D47.5): the same document, runtime,
 * browser, environment, preset, segment length, and FFmpeg; segments on the
 * grid, each once, without a gap, covering exactly the range of the audio
 * pass; and frames that are the segments' frames. Anything else is
 * `join-invalid`, before FFmpeg runs. Pure: the files are checked afterwards.
 */
export function joinPlan(
  parts: readonly JoinPart<SegmentsManifest>[],
  audio: JoinPart<AudioManifest>,
): JoinPlan {
  const [head] = parts;
  if (head === undefined) throw joinInvalid('A join needs at least one segments manifest.');
  const first = head.manifest;
  for (const { manifest } of parts) {
    if (
      (manifest.kind as string) !== 'segments' ||
      manifest.manifestVersion !== EXPORT_MANIFEST_VERSION
    ) {
      throw joinInvalid(
        `A segments manifest of version ${String(EXPORT_MANIFEST_VERSION)} was expected, got ${JSON.stringify(manifest.kind)} of version ${String(manifest.manifestVersion)}.`,
      );
    }
    for (const field of SHARED_FIELDS) {
      if (canonicalJson(manifest[field]) !== canonicalJson(first[field])) {
        throw joinInvalid(
          `The segments manifests differ in ${field}; they are not parts of one render.`,
        );
      }
    }
  }
  const pass = audio.manifest;
  if ((pass.kind as string) !== 'audio' || pass.manifestVersion !== EXPORT_MANIFEST_VERSION) {
    throw joinInvalid(
      `An audio manifest of version ${String(EXPORT_MANIFEST_VERSION)} was expected, got ${JSON.stringify(pass.kind)} of version ${String(pass.manifestVersion)}.`,
    );
  }
  const audioFields: readonly [string, unknown, unknown][] = [
    ['compositionHash', pass.compositionHash, first.compositionHash],
    ['schemaVersion', pass.schemaVersion, first.schemaVersion],
    ['durationUs', pass.durationUs, first.durationUs],
    ['frameCount', pass.frameCount, first.frameCount],
    ['fps', pass.fps, first.preset.fps],
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
  for (const [field, given, expected] of audioFields) {
    if (canonicalJson(given) !== canonicalJson(expected)) {
      throw joinInvalid(`The audio manifest differs from the segments in ${field}.`);
    }
  }
  const { segmentFrames, frameCount: total } = first;
  const all: JoinSegment[] = [];
  const frames: ManifestFrame[] = [];
  const blocked = new Set<string>();
  for (const { manifest, directory } of parts) {
    const own = new Set<number>();
    for (const segment of manifest.segments) {
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
      for (
        let index = segment.firstFrame;
        index < segment.firstFrame + segment.frameCount;
        index += 1
      ) {
        own.add(index);
      }
      all.push({ ...segment, path: join(resolve(directory), plainName(segment.file)) });
    }
    if (
      manifest.frames.length !== own.size ||
      manifest.frames.some(({ index }) => !own.has(index))
    ) {
      throw joinInvalid('A segments manifest lists other frames than its segments hold.');
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
  return {
    first,
    range,
    segments: all,
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
          clipId: pass.clipId,
          assetId: pass.assetId,
          sampleRate: pass.sampleRate,
          startSample: pass.startSample,
          sampleCount: pass.sampleCount,
          totalSamples: pass.totalSamples,
          rangeStartSample: pass.rangeStartSample,
          rangeSampleCount: pass.rangeSampleCount,
          channelLayout: pass.channelLayout,
          codec: AUDIO_CODEC,
          bitrate: AUDIO_BITRATE,
          intermediate: { codec: pass.codec, format: pass.format, sha256: pass.sha256 },
        };
  return {
    manifestVersion: first.manifestVersion,
    compositionHash: first.compositionHash,
    schemaVersion: first.schemaVersion,
    runtime: first.runtime,
    chromium: first.chromium,
    environment: first.environment,
    assets: first.assets,
    durationUs: first.durationUs,
    frameCount: first.frameCount,
    preset: first.preset,
    segmentFrames: first.segmentFrames,
    video: first.video,
    identity: first.identity,
    kind: 'export',
    range,
    segments: plan.segments.map(({ index, firstFrame, frameCount, sha256: hash }) => ({
      index,
      firstFrame,
      frameCount,
      sha256: hash,
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

/** `joinSegments` on the given dependencies; tests pass fakes. */
export async function joinSegmentsWith(
  request: JoinRequest,
  dependencies: ExportDependencies,
): Promise<JoinResult> {
  const { signal } = request;
  try {
    throwIfCancelled(signal);
    const plan = joinPlan(request.segments, request.audio);
    const tools = await dependencies.tools(request.ffmpeg);
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
  const given = await preparedSegments(request, dependencies, undefined);
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
    for (const part of parts) await dependencies.removeFile(part).catch(() => undefined);
  }
}

function realDependencies(): ExportDependencies {
  return {
    tools: (paths) => pinnedFfmpeg(paths),
    async browser(given) {
      const chromium = given.chromium ?? (await launchChromium());
      return {
        chromium,
        sequence: chromiumSequence(chromium, given),
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
 * (D47.5), after checking that the manifests make one render.
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

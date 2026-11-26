/**
 * The command line of D28.8, D29.10, and D45:
 *
 *   kadrion render-frames --composition <file> --assets <file> --out <dir> --times <t,…>
 *                  [--ffmpeg <path>] [--ffprobe <path>]
 *   kadrion export --composition <file> --assets <file> --out <dir> --preset <1080p|720p>
 *                  [--ffmpeg <path>] [--ffprobe <path>]
 *                  [--segment-frames <n>] [--ffmpeg <path>] [--ffprobe <path>]
 *   kadrion render-range --composition <file> --assets <file> --out <dir> --preset <1080p|720p>
 *                  [--from-us <t> --to-us <t>] [--segment-frames <n>] [--ffmpeg …] [--ffprobe …]
 *                  [--grid-from-us <t> --grid-to-us <t>] [--min-segment-frames <n>]
 *   kadrion render-audio --composition <file> --assets <file> --out <dir>
 *                  [--from-us <t> --to-us <t>] [--ffmpeg <path>] [--ffprobe <path>]
 *   kadrion join --in <dir> [--in <dir> …] --out <dir> [--ffmpeg <path>] [--ffprobe <path>]
 *   kadrion render-still --composition <file> --assets <file> --out <dir> --time-us <t>
 *                  --format <png|jpeg|webp> [--ffmpeg <path>] [--ffprobe <path>]
 *   kadrion estimate --composition <file> --assets <file> --preset <1080p|720p>
 *                  [--samples <n>] [--segment-frames <n>] [--budget-ms <ms>] [--ffmpeg …] [--ffprobe …]
 *                  [--grid-from-us <t> --grid-to-us <t>] [--min-segment-frames <n>]
 *   kadrion segment-keys --composition <file> --assets <file> --preset <1080p|720p>
 *                  [--segment-frames <n>] [--grid-from-us <t> --grid-to-us <t>]
 *                  [--min-segment-frames <n>] [--spans-us <t,…>]
 *   kadrion check-custom-html --composition <file> --assets <file> --node-id <id> [--samples <n>]
 *   kadrion migrate <file> (--out <file> | --check)
 *   kadrion fetch-ffmpeg --dir <dir>
 *   kadrion doctor [--ffmpeg <path>] [--ffprobe <path>]
 *   kadrion inspect [--json] <file>
 *
 * Every command but `fetch-ffmpeg`, `doctor`, and `inspect` is a job of D48: its standard
 * output is JSON lines and nothing else (progress, the files written, and the
 * end), its diagnostics go to standard error, `SIGTERM` or `SIGINT` cancel it,
 * it takes the limits `--max-document-bytes`, `--max-duration-us`,
 * `--max-frames`, `--max-assets`, `--max-canvas-pixels`, `--max-asset-bytes`,
 * `--max-total-asset-bytes` (not `join`, which reads no document, nor
 * `migrate`, which renders nothing), and `--max-wall-ms`, and its exit code is
 * one of the table of D48.3.
 *
 * `render-frames` renders frame times of a composition to `frame-<index>.png` and
 * writes `render-manifest.json`. `export` writes `video-<preset>.mp4` and
 * `video-<preset>.render-manifest.json` with the pinned FFmpeg, whose paths come
 * from the flags or from `KADRION_FFMPEG` and `KADRION_FFPROBE`, never from
 * `PATH` (D29.1). The asset file maps asset IDs to `{ path, mediaType }`,
 * with paths relative to that file: where bytes live is the host's business,
 * never the document's (D14). Images and fonts are read into memory; video and
 * audio are handed to the Producer by path and read where they are (D64). The CLI knows no golden timestamp (D12).
 * `render-range`, `render-audio`, and `join` are the export split into jobs of
 * a host's queue (D47): a range of whole segments with its
 * `segments-<first>-<last>.manifest.json`, the audio of a range with
 * `audio.manifest.json`, and the join of every manifest in the `--in`
 * directories into the same two files `export` writes. `render-still` writes
 * `still-<index>.<png|jpg|webp>` and its manifest. Every file the CLI writes is
 * written under a temporary name and renamed when complete (D47.6).
 * `render-range` and `estimate` take a grid anchored on a span instead of the
 * composition's, `--grid-from-us` and `--grid-to-us`, and `--min-segment-frames`,
 * under which a last segment is merged into the one before it (D80).
 * `estimate` renders and encodes a few frames into a temporary directory and
 * reports the time per frame and how many segments fit into a budget (D48.5).
 * `segment-keys` prints the key of every segment of a grid, its span, and the
 * Custom HTML nodes active in it, computed without a browser from the document
 * and the fonts of its measured nodes, the only assets it reads (D92.1);
 * `--spans-us` divides the grid into spans at those start times (D92.2).
 * `check-custom-html` runs the check of D78.6 on one Custom HTML node: the
 * findings of its html and the render check of the Producer in the pinned
 * Chromium, which it launches itself, and prints the report of the tool
 * `check_custom_html` in one `check` line before its `done` (D93).
 * `migrate` reads one saved document, reports the versions it passed through,
 * and writes it in the current version to `--out`, or with `--check` writes
 * nothing and exits 6 when the document is not current (D43, amended by PR-41).
 * `fetch-ffmpeg` installs the pinned FFmpeg into a directory and prints the two
 * paths; `doctor` prints a JSON report of whether this process is the reference
 * environment, and exits 3 when it is not (D45). `inspect` prints the verdict
 * of the Player's `inspectVideo` on one file: whether the Player shows it as it
 * is, every reason why not, and its facts (D79.6); on a composition, a file
 * whose text starts with `{`, it lists a warning for every node whose animated
 * corners turn concave, with the first such instant (D91.1).
 */
import { openAsBlob } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

import {
  AUDIO_FILE_NAME,
  canonicalJson,
  checkCustomHtml,
  cornersWarnings,
  CUSTOM_HTML_CHECK_SAMPLES,
  DEFAULT_ESTIMATE_SAMPLES,
  estimatePlan,
  exportMp4,
  FFMPEG_SHA256,
  FFPROBE_SHA256,
  JOB_LIMITS,
  joinSegments,
  launchChromium,
  measuredFontMetrics,
  PARTIAL_SUFFIX,
  ProducerError,
  renderAudio,
  renderFrames,
  renderSegments,
  renderStill,
  segmentKeys,
  sha256,
  STILL_FORMATS,
  type AudioManifest,
  type AudioRequest,
  type AudioResult,
  type CornersWarning,
  type CustomHtmlCheck,
  type CustomHtmlCheckRequest,
  type ExportRequest,
  type ExportResult,
  type FfmpegPaths,
  type GridRequest,
  type JoinPart,
  type JoinRequest,
  type JoinResult,
  type JobLimits,
  type LaunchedChromium,
  type ProgressEvent,
  type RenderRequest,
  type RenderResult,
  type SegmentKey,
  type SegmentKeys,
  type SegmentKeysGrid,
  type SegmentKeysSettings,
  type SegmentsManifest,
  type SegmentsRequest,
  type SegmentsResult,
  type StillFormat,
  type StillRequest,
  type StillResult,
} from '@kadrion/producer';
import { checkCustomHtmlSource, type CustomHtmlFinding } from '@kadrion/editor-sdk';
import { inspectVideo, type VideoInspection } from '@kadrion/player';
import {
  frameCount,
  validateComposition,
  type CustomHtmlNode,
  type ValidatedComposition,
} from '@kadrion/schema';

import { runDoctor, type DoctorReport } from './doctor.js';
import {
  EXIT_NOT_CURRENT,
  INVALID_DOCUMENT,
  migrateText,
  NOT_CURRENT,
  type MigrateLine,
} from './migrate.js';
import { fetchFfmpeg, type FetchFfmpegOptions } from './fetch-ffmpeg.js';
import { FfmpegInstallError, type Installed } from './ffmpeg-install.js';

/** The exit codes of D48.3; a host's queue decides by them whether to retry. */
export const EXIT_OK = 0;
/** A `ProducerError` other than the two below: the render failed. */
export const EXIT_PRODUCER_ERROR = 1;
export const EXIT_USAGE = 2;
/** `kadrion doctor`: the report was written, and this is not the reference environment. */
export const EXIT_NOT_REFERENCE = 3;
/** A limit of the job is exceeded (`limit-exceeded`), the wall time included. */
export const EXIT_LIMIT_EXCEEDED = 4;
/** The job was cancelled by `SIGTERM` or `SIGINT` (`cancelled`). */
export const EXIT_CANCELLED = 5;
/** `kadrion migrate --check` only: the document is valid and of an earlier version (`not-current`). */
export { EXIT_NOT_CURRENT };

/** How long a cancelled job may take to clean up before the process exits anyway (D48.2). */
export const CANCEL_GRACE_MS = 10_000;

/** The commands that are jobs of D48: JSON lines on standard output. */
export const JOB_COMMANDS = [
  'render-frames',
  'export',
  'render-range',
  'render-audio',
  'join',
  'render-still',
  'estimate',
  'segment-keys',
  'check-custom-html',
  'migrate',
] as const;

/**
 * A line of a job's standard output (D48.1): the Producer's progress, then a
 * `file` per file written under its final name, then exactly one `done` or
 * `error`. `estimate` reports its measurement before its `done`,
 * `segment-keys` its keys (D92.1), and `check-custom-html` its report (D93).
 */
export type JobLine =
  | ProgressEvent
  | { readonly event: 'file'; readonly file: string }
  | {
      readonly event: 'estimate';
      readonly samples: number;
      readonly setupMs: number;
      readonly msPerFrame: number;
      readonly segmentFrames: number;
      readonly msPerSegment: number;
      readonly segments: number;
      readonly segmentsInBudget: number | null;
    }
  | {
      readonly event: 'segment-keys';
      readonly keyVersion: number;
      readonly segments: readonly SegmentKey[];
    }
  | {
      readonly event: 'check';
      readonly nodeId: string;
      readonly findings: readonly CustomHtmlFinding[];
      readonly render: CustomHtmlCheck;
      readonly ok: boolean;
    }
  | MigrateLine
  | { readonly event: 'done'; readonly manifest: string | null }
  | { readonly event: 'error'; readonly code: string; readonly exitCode: number };

export const USAGE = [
  'Usage: kadrion render-frames --composition <file> --assets <file> --out <dir> --times <t,...> [--ffmpeg <path>] [--ffprobe <path>]',
  '       kadrion export --composition <file> --assets <file> --out <dir> --preset <1080p|720p> [--segment-frames <n>] [--ffmpeg <path>] [--ffprobe <path>]',
  '       kadrion render-range --composition <file> --assets <file> --out <dir> --preset <1080p|720p> [--from-us <t> --to-us <t>] [--segment-frames <n>] [--grid-from-us <t> --grid-to-us <t>] [--min-segment-frames <n>] [--ffmpeg <path>] [--ffprobe <path>]',
  '       kadrion render-audio --composition <file> --assets <file> --out <dir> [--from-us <t> --to-us <t>] [--ffmpeg <path>] [--ffprobe <path>]',
  '       kadrion join --in <dir> [--in <dir> ...] --out <dir> [--ffmpeg <path>] [--ffprobe <path>]',
  '       kadrion render-still --composition <file> --assets <file> --out <dir> --time-us <t> --format <png|jpeg|webp> [--ffmpeg <path>] [--ffprobe <path>]',
  '       kadrion estimate --composition <file> --assets <file> --preset <1080p|720p> [--samples <n>] [--segment-frames <n>] [--grid-from-us <t> --grid-to-us <t>] [--min-segment-frames <n>] [--budget-ms <ms>] [--ffmpeg <path>] [--ffprobe <path>]',
  '       kadrion segment-keys --composition <file> --assets <file> --preset <1080p|720p> [--segment-frames <n>] [--grid-from-us <t> --grid-to-us <t>] [--min-segment-frames <n>] [--spans-us <t,...>]',
  '       kadrion check-custom-html --composition <file> --assets <file> --node-id <id> [--samples <n>]',
  '       kadrion migrate <file> (--out <file> | --check)',
  '       kadrion fetch-ffmpeg --dir <dir>',
  '       kadrion doctor [--ffmpeg <path>] [--ffprobe <path>]',
  '       kadrion inspect [--json] <file>',
  'Limits of a job: [--max-document-bytes <n>] [--max-duration-us <n>] [--max-frames <n>] [--max-assets <n>] [--max-canvas-pixels <n>] [--max-asset-bytes <n>] [--max-total-asset-bytes <n>] [--max-wall-ms <n>]',
].join('\n');

/** Where `kadrion export` finds the pinned executables without flags (D29.10). */
export const FFMPEG_VARIABLE = 'KADRION_FFMPEG';
export const FFPROBE_VARIABLE = 'KADRION_FFPROBE';

export interface CliIo {
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
}

export type Render = (request: RenderRequest) => Promise<RenderResult>;
export type Export = (request: ExportRequest) => Promise<ExportResult>;
export type RenderRange = (request: SegmentsRequest) => Promise<SegmentsResult>;
export type RenderAudio = (request: AudioRequest) => Promise<AudioResult>;
export type Join = (request: JoinRequest) => Promise<JoinResult>;
export type RenderStill = (request: StillRequest) => Promise<StillResult>;
export type FetchFfmpeg = (options: FetchFfmpegOptions) => Promise<Installed>;
export type Doctor = (ffmpeg: Partial<FfmpegPaths>) => Promise<DoctorReport>;
/** The keys of the segments of a grid (D92.1); `segmentKeys` of `@kadrion/producer`. */
export type SegmentKeysHost = (
  document: unknown,
  grid: SegmentKeysGrid,
  settings: SegmentKeysSettings,
) => SegmentKeys;
/** The metrics of the fonts of measured nodes (D83.7); `measuredFontMetrics` of `@kadrion/producer`. */
export type MeasureFonts = (
  document: unknown,
  resolveAsset: RenderRequest['resolveAsset'],
  limits?: JobLimits,
) => Promise<SegmentKeysSettings['fonts']>;
/** The render check of one Custom HTML element (D78.6); `checkCustomHtml` of `@kadrion/producer`. */
export type CheckCustomHtml = (request: CustomHtmlCheckRequest) => Promise<CustomHtmlCheck>;
/** Launches the pinned Chromium and refuses any other (D26.1); `launchChromium` of `@kadrion/producer`. */
export type LaunchBrowser = () => Promise<LaunchedChromium>;
/** The Player's verdict on a file (D79.4); `inspectVideo` of `@kadrion/player`. */
export type Inspect = (file: Blob) => Promise<VideoInspection>;

/** Starts a timer and returns how to cancel it: the CLI's clock, never the runtime's (D48.4). */
export type StartTimer = (fire: () => void, milliseconds: number) => () => void;

/** What the commands run on; tests replace them. */
export interface CliHosts {
  readonly render: Render;
  readonly exportMp4: Export;
  readonly renderRange: RenderRange;
  readonly renderAudio: RenderAudio;
  readonly join: Join;
  readonly renderStill: RenderStill;
  readonly segmentKeys: SegmentKeysHost;
  readonly measureFonts: MeasureFonts;
  readonly checkCustomHtml: CheckCustomHtml;
  readonly launchChromium: LaunchBrowser;
  readonly fetchFfmpeg: FetchFfmpeg;
  readonly doctor: Doctor;
  readonly inspect: Inspect;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Cancels the job: `bin.ts` aborts it on `SIGTERM` and `SIGINT` (D48.2). */
  readonly signal: AbortSignal | undefined;
  /** Milliseconds of a monotonic clock, for `estimate` (D48.5). */
  readonly now: () => number;
  /** The timer of `--max-wall-ms` (D48.4). */
  readonly startTimer: StartTimer;
}

class UsageError extends Error {}

/** A failure of a job that is no `ProducerError`: `not-current` of `migrate --check`. */
class JobFailure extends Error {
  readonly code: typeof NOT_CURRENT;

  constructor(code: typeof NOT_CURRENT, message: string) {
    super(message);
    this.code = code;
  }
}

/** What a job command runs with besides its arguments (D48). */
interface Job {
  readonly hosts: CliHosts;
  readonly signal: AbortSignal | undefined;
  /** Writes one line of standard output. */
  readonly emit: (line: JobLine) => void;
}

/** The flag of each limit: `maxDocumentBytes` is `--max-document-bytes`. */
function limitFlag(name: keyof JobLimits): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

const LIMIT_OPTIONS = Object.fromEntries(
  JOB_LIMITS.map((name) => [limitFlag(name), { type: 'string' as const }]),
) as Record<string, { readonly type: 'string' }>;

/** The limits given as flags; a flag that is not a non-negative integer is a usage error. */
function limitsOf(values: Readonly<Record<string, unknown>>): JobLimits | undefined {
  const limits: Partial<Record<keyof JobLimits, number>> = {};
  for (const name of JOB_LIMITS) {
    const value = integerFlag(limitFlag(name), values[limitFlag(name)] as string | undefined);
    if (value !== undefined) limits[name] = value;
  }
  return Object.keys(limits).length === 0 ? undefined : limits;
}

/** What every job passes to the Producer: its signal, its progress, and its limits. */
function jobOptions(
  job: Job,
  values: Readonly<Record<string, unknown>>,
): {
  readonly signal?: AbortSignal;
  readonly onProgress: (event: ProgressEvent) => void;
  readonly limits?: JobLimits;
} {
  const limits = limitsOf(values);
  return {
    ...(job.signal === undefined ? {} : { signal: job.signal }),
    onProgress: job.emit,
    ...(limits === undefined ? {} : { limits }),
  };
}

interface AssetEntry {
  readonly path: string;
  readonly mediaType: string;
}

/** The asset map: an object of `{ path, mediaType }` entries, nothing else. */
export function parseAssetMap(text: string): ReadonlyMap<string, AssetEntry> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new UsageError('The asset file is not JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new UsageError('The asset file must map asset IDs to { path, mediaType }.');
  }
  const entries = new Map<string, AssetEntry>();
  for (const [id, value] of Object.entries(parsed)) {
    const entry = value as Partial<Record<string, unknown>> | null;
    if (
      typeof entry !== 'object' ||
      entry === null ||
      Object.keys(entry).sort().join(',') !== 'mediaType,path' ||
      typeof entry.path !== 'string' ||
      entry.path === '' ||
      typeof entry.mediaType !== 'string'
    ) {
      throw new UsageError(`The asset "${id}" must be { path, mediaType }.`);
    }
    entries.set(id, { path: entry.path, mediaType: entry.mediaType });
  }
  return entries;
}

/** Times as written: comma-separated non-negative integers, in the order given. */
export function parseTimes(text: string, flag = 'times'): number[] {
  const parts = text.split(',');
  if (parts.some((part) => !/^\d+$/.test(part))) {
    throw new UsageError(
      `--${flag} takes comma-separated integer microseconds, such as 0,2500000.`,
    );
  }
  return parts.map(Number);
}

/** `frame-000075.png`: six digits hold every frame index of the spike's durations. */
export function frameFileName(index: number): string {
  return `frame-${String(index).padStart(6, '0')}.png`;
}

/** The document and a resolver over the asset file (D14): shared by both commands. */
async function readInputs(
  composition: string,
  assets: string,
): Promise<{ readonly document: unknown; readonly resolveAsset: RenderRequest['resolveAsset'] }> {
  let document: unknown;
  try {
    document = JSON.parse(await readFile(composition, 'utf8'));
  } catch (reason) {
    throw new UsageError(`Cannot read the composition: ${String(reason)}`);
  }
  const assetFile = resolve(assets);
  let assetText: string;
  try {
    assetText = await readFile(assetFile, 'utf8');
  } catch (reason) {
    throw new UsageError(`Cannot read the asset file: ${String(reason)}`);
  }
  const map = parseAssetMap(assetText);
  return {
    document,
    resolveAsset: async ({ id, type }) => {
      const entry = map.get(id);
      if (entry === undefined) return null;
      const path = resolve(dirname(assetFile), entry.path);
      // Video and audio are read by path, never held in memory (D64.1); images and fonts as bytes.
      if (type === 'video' || type === 'audio') return { path, mediaType: entry.mediaType };
      const bytes = await readFile(path);
      return { bytes: new Uint8Array(bytes), mediaType: entry.mediaType };
    },
  };
}

async function renderCommand(args: readonly string[], job: Job): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: {
      composition: { type: 'string' },
      assets: { type: 'string' },
      out: { type: 'string' },
      times: { type: 'string' },
      ...FFMPEG_OPTIONS,
      ...LIMIT_OPTIONS,
    },
    strict: true,
    allowPositionals: false,
  });
  const { composition, assets, out, times } = values;
  if (
    composition === undefined ||
    assets === undefined ||
    out === undefined ||
    times === undefined
  ) {
    throw new UsageError('--composition, --assets, --out, and --times are required.');
  }
  const timesUs = parseTimes(times);
  const options = jobOptions(job, values);
  const inputs = await readInputs(composition, assets);
  // Frames need FFmpeg only to decode video nodes (D50.5).
  const ffmpeg = optionalFfmpegPaths(values, job.hosts);
  const result = await job.hosts.render({
    ...inputs,
    timesUs,
    ...(ffmpeg === undefined ? {} : { ffmpeg }),
    ...options,
  });
  await mkdir(out, { recursive: true });
  for (const frame of result.frames) {
    await writeComplete(join(out, frameFileName(frame.index)), frame.png);
    job.emit({ event: 'file', file: frameFileName(frame.index) });
  }
  return finished(job, out, RENDER_MANIFEST_NAME, result.manifest);
}

/** The manifest of `render-frames` in its directory (D28.8). */
export const RENDER_MANIFEST_NAME = 'render-manifest.json';

/** Writes the manifest of a job last, reports it, and ends the job (D48.1). */
async function finished(job: Job, out: string, name: string, manifest: unknown): Promise<number> {
  await writeComplete(join(out, name), manifestText(manifest));
  job.emit({ event: 'file', file: name });
  job.emit({ event: 'done', manifest: name });
  return EXIT_OK;
}

/** `video-1080p.mp4`, and its manifest next to it (D29.10). */
export function exportFileNames(preset: string): {
  readonly video: string;
  readonly manifest: string;
} {
  return { video: `video-${preset}.mp4`, manifest: `video-${preset}.render-manifest.json` };
}

async function exportCommand(args: readonly string[], job: Job): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: {
      ...DOCUMENT_OPTIONS,
      preset: { type: 'string' },
      'segment-frames': { type: 'string' },
      ...FFMPEG_OPTIONS,
      ...LIMIT_OPTIONS,
    },
    strict: true,
    allowPositionals: false,
  });
  const { composition, assets, out, preset } = values;
  if (
    composition === undefined ||
    assets === undefined ||
    out === undefined ||
    preset === undefined
  ) {
    throw new UsageError('--composition, --assets, --out, and --preset are required.');
  }
  if (!/^[0-9a-z]+$/.test(preset)) throw new UsageError('--preset takes a name such as 1080p.');
  const segmentFrames = integerFlag('segment-frames', values['segment-frames']);
  const options = jobOptions(job, values);
  const ffmpeg = ffmpegPaths(values, job.hosts);
  const inputs = await readInputs(composition, assets);
  await mkdir(out, { recursive: true });
  const names = exportFileNames(preset);
  const result = await job.hosts.exportMp4({
    ...inputs,
    preset,
    ...(segmentFrames === undefined ? {} : { segmentFrames }),
    outputPath: join(out, names.video),
    ffmpeg,
    ...options,
  });
  job.emit({ event: 'file', file: names.video });
  return finished(job, out, names.manifest, result.manifest);
}

/**
 * Writes a file under a temporary name and renames it when complete, so that
 * a final name never holds half a file (D47.6).
 */
async function writeComplete(path: string, data: string | Uint8Array): Promise<void> {
  const partial = `${path}${PARTIAL_SUFFIX}`;
  await writeFile(partial, data);
  await rename(partial, path);
}

function manifestText(manifest: unknown): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** The pinned executables: flags first, then the environment; never PATH (D29.10). */
function ffmpegPaths(
  values: { readonly ffmpeg?: string | undefined; readonly ffprobe?: string | undefined },
  hosts: CliHosts,
): FfmpegPaths {
  const ffmpegPath = values.ffmpeg ?? hosts.env[FFMPEG_VARIABLE];
  const ffprobePath = values.ffprobe ?? hosts.env[FFPROBE_VARIABLE];
  if (ffmpegPath === undefined || ffprobePath === undefined) {
    throw new ProducerError(
      'ffmpeg-missing',
      `Give --ffmpeg and --ffprobe, or set ${FFMPEG_VARIABLE} and ${FFPROBE_VARIABLE}; PATH is never searched.`,
    );
  }
  return { ffmpegPath, ffprobePath };
}

/** The pinned executables when a flag or the environment names either, else none. */
function optionalFfmpegPaths(
  values: { readonly ffmpeg?: string | undefined; readonly ffprobe?: string | undefined },
  hosts: CliHosts,
): FfmpegPaths | undefined {
  const named = [
    values.ffmpeg,
    values.ffprobe,
    hosts.env[FFMPEG_VARIABLE],
    hosts.env[FFPROBE_VARIABLE],
  ];
  return named.every((value) => value === undefined) ? undefined : ffmpegPaths(values, hosts);
}

/** A non-negative integer of microseconds or frames, as written. */
function integerFlag(name: string, text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  if (!/^\d+$/.test(text)) throw new UsageError(`--${name} takes a non-negative integer.`);
  return Number(text);
}

/** `--from-us` and `--to-us`, both or neither. */
function rangeFlags(values: {
  readonly 'from-us'?: string | undefined;
  readonly 'to-us'?: string | undefined;
}): { readonly fromUs: number; readonly toUs: number } | undefined {
  const fromUs = integerFlag('from-us', values['from-us']);
  const toUs = integerFlag('to-us', values['to-us']);
  if (fromUs === undefined && toUs === undefined) return undefined;
  if (fromUs === undefined || toUs === undefined) {
    throw new UsageError('--from-us and --to-us go together.');
  }
  return { fromUs, toUs };
}

/**
 * `--grid-from-us` and `--grid-to-us` (both or neither) and
 * `--min-segment-frames`: a grid anchored on a span (D80.1), or `undefined`
 * for the composition's grid of D47.1.
 */
function gridFlags(values: {
  readonly 'grid-from-us'?: string | undefined;
  readonly 'grid-to-us'?: string | undefined;
  readonly 'min-segment-frames'?: string | undefined;
}): GridRequest | undefined {
  const fromUs = integerFlag('grid-from-us', values['grid-from-us']);
  const toUs = integerFlag('grid-to-us', values['grid-to-us']);
  const minSegmentFrames = integerFlag('min-segment-frames', values['min-segment-frames']);
  if ((fromUs === undefined) !== (toUs === undefined)) {
    throw new UsageError('--grid-from-us and --grid-to-us go together.');
  }
  if (fromUs === undefined && minSegmentFrames === undefined) return undefined;
  return {
    ...(fromUs === undefined || toUs === undefined ? {} : { range: { fromUs, toUs } }),
    ...(minSegmentFrames === undefined ? {} : { minSegmentFrames }),
  };
}

const GRID_OPTIONS = {
  'grid-from-us': { type: 'string' },
  'grid-to-us': { type: 'string' },
  'min-segment-frames': { type: 'string' },
} as const;

const FFMPEG_OPTIONS = { ffmpeg: { type: 'string' }, ffprobe: { type: 'string' } } as const;
const DOCUMENT_OPTIONS = {
  composition: { type: 'string' },
  assets: { type: 'string' },
  out: { type: 'string' },
} as const;

/** `segments-000002-000004.manifest.json`: the manifest of a range, by its first and last segment. */
export function segmentsManifestName(first: number, last: number): string {
  const six = (index: number): string => String(index).padStart(6, '0');
  return `segments-${six(first)}-${six(last)}.manifest.json`;
}

/** The manifest of the audio pass in its directory (D47.4). */
export const AUDIO_MANIFEST_NAME = 'audio.manifest.json';

/** `still-000075.jpg` and `still-000075.manifest.json` (D47.7). */
export function stillFileNames(
  index: number,
  format: StillFormat,
): { readonly image: string; readonly manifest: string } {
  const six = String(index).padStart(6, '0');
  return {
    image: `still-${six}.${STILL_FORMATS[format].extension}`,
    manifest: `still-${six}.manifest.json`,
  };
}

async function renderRangeCommand(args: readonly string[], job: Job): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: {
      ...DOCUMENT_OPTIONS,
      preset: { type: 'string' },
      'from-us': { type: 'string' },
      'to-us': { type: 'string' },
      'segment-frames': { type: 'string' },
      ...GRID_OPTIONS,
      ...FFMPEG_OPTIONS,
      ...LIMIT_OPTIONS,
    },
    strict: true,
    allowPositionals: false,
  });
  const { composition, assets, out, preset } = values;
  if (
    composition === undefined ||
    assets === undefined ||
    out === undefined ||
    preset === undefined
  ) {
    throw new UsageError('--composition, --assets, --out, and --preset are required.');
  }
  if (!/^[0-9a-z]+$/.test(preset)) throw new UsageError('--preset takes a name such as 1080p.');
  const range = rangeFlags(values);
  const segmentFrames = integerFlag('segment-frames', values['segment-frames']);
  const grid = gridFlags(values);
  const options = jobOptions(job, values);
  const ffmpeg = ffmpegPaths(values, job.hosts);
  const inputs = await readInputs(composition, assets);
  await mkdir(out, { recursive: true });
  const { manifest } = await job.hosts.renderRange({
    ...inputs,
    preset,
    ...(range === undefined ? {} : { range }),
    ...(segmentFrames === undefined ? {} : { segmentFrames }),
    ...(grid === undefined ? {} : { grid }),
    outputDirectory: out,
    ffmpeg,
    ...options,
  });
  const first = manifest.segments[0]?.index ?? 0;
  const last = manifest.segments.at(-1)?.index ?? first;
  for (const segment of manifest.segments) job.emit({ event: 'file', file: segment.file });
  return finished(job, out, segmentsManifestName(first, last), manifest);
}

async function renderAudioCommand(args: readonly string[], job: Job): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: {
      ...DOCUMENT_OPTIONS,
      'from-us': { type: 'string' },
      'to-us': { type: 'string' },
      ...FFMPEG_OPTIONS,
      ...LIMIT_OPTIONS,
    },
    strict: true,
    allowPositionals: false,
  });
  const { composition, assets, out } = values;
  if (composition === undefined || assets === undefined || out === undefined) {
    throw new UsageError('--composition, --assets, and --out are required.');
  }
  const range = rangeFlags(values);
  const options = jobOptions(job, values);
  const ffmpeg = ffmpegPaths(values, job.hosts);
  const inputs = await readInputs(composition, assets);
  await mkdir(out, { recursive: true });
  const { manifest } = await job.hosts.renderAudio({
    ...inputs,
    ...(range === undefined ? {} : { range }),
    outputDirectory: out,
    ffmpeg,
    ...options,
  });
  // A composition without an audio clip writes the manifest only (D47.4).
  if (manifest.audio !== null) job.emit({ event: 'file', file: AUDIO_FILE_NAME });
  return finished(job, out, AUDIO_MANIFEST_NAME, manifest);
}

async function readManifest(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (reason) {
    throw new UsageError(`Cannot read the manifest ${path}: ${String(reason)}`);
  }
}

async function joinCommand(args: readonly string[], job: Job): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: { in: { type: 'string', multiple: true }, out: { type: 'string' }, ...FFMPEG_OPTIONS },
    strict: true,
    allowPositionals: false,
  });
  const inputs = values.in ?? [];
  const { out } = values;
  if (inputs.length === 0 || out === undefined)
    throw new UsageError('--in and --out are required.');
  const ffmpeg = ffmpegPaths(values, job.hosts);
  const segments: JoinPart<SegmentsManifest>[] = [];
  const audio: JoinPart<AudioManifest>[] = [];
  for (const directory of inputs) {
    let names: string[];
    try {
      names = (await readdir(directory)).sort();
    } catch (reason) {
      throw new UsageError(`Cannot read the directory ${directory}: ${String(reason)}`);
    }
    for (const name of names) {
      if (/^segments-\d{6}-\d{6}\.manifest\.json$/.test(name)) {
        const manifest = (await readManifest(join(directory, name))) as SegmentsManifest;
        segments.push({ manifest, directory });
      } else if (name === AUDIO_MANIFEST_NAME) {
        const manifest = (await readManifest(join(directory, name))) as AudioManifest;
        audio.push({ manifest, directory });
      }
    }
  }
  const [pass, ...more] = audio;
  if (pass === undefined || more.length > 0) {
    throw new ProducerError(
      'join-invalid',
      `A join needs exactly one ${AUDIO_MANIFEST_NAME} in the --in directories, found ${String(audio.length)}.`,
    );
  }
  const preset = /^mp4-([0-9a-z]+)$/.exec(String(segments[0]?.manifest.preset.name))?.[1];
  if (preset === undefined) {
    throw new ProducerError('join-invalid', 'No segments manifest in the --in directories.');
  }
  await mkdir(out, { recursive: true });
  const names = exportFileNames(preset);
  const result = await job.hosts.join({
    segments,
    audio: pass,
    outputPath: join(out, names.video),
    ffmpeg,
    ...(job.signal === undefined ? {} : { signal: job.signal }),
  });
  job.emit({ event: 'file', file: names.video });
  return finished(job, out, names.manifest, result.manifest);
}

async function renderStillCommand(args: readonly string[], job: Job): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: {
      ...DOCUMENT_OPTIONS,
      'time-us': { type: 'string' },
      format: { type: 'string' },
      ...FFMPEG_OPTIONS,
      ...LIMIT_OPTIONS,
    },
    strict: true,
    allowPositionals: false,
  });
  const { composition, assets, out, format } = values;
  const timeUs = integerFlag('time-us', values['time-us']);
  if (
    composition === undefined ||
    assets === undefined ||
    out === undefined ||
    timeUs === undefined ||
    format === undefined
  ) {
    throw new UsageError('--composition, --assets, --out, --time-us, and --format are required.');
  }
  if (!/^[0-9a-z]+$/.test(format)) throw new UsageError('--format takes a name such as png.');
  const options = jobOptions(job, values);
  // PNG needs no FFmpeg encoder: the captured bytes are the still (D47.7); video nodes
  // still need it to decode (D50.5).
  const ffmpeg =
    format === 'png' ? optionalFfmpegPaths(values, job.hosts) : ffmpegPaths(values, job.hosts);
  const inputs = await readInputs(composition, assets);
  await mkdir(out, { recursive: true });
  const result = await job.hosts.renderStill({
    ...inputs,
    timeUs,
    format,
    ...(ffmpeg === undefined ? {} : { ffmpeg }),
    ...options,
  });
  const [frame] = result.manifest.frames;
  const names = stillFileNames(frame?.index ?? 0, result.format);
  await writeComplete(join(out, names.image), result.bytes);
  job.emit({ event: 'file', file: names.image });
  return finished(job, out, names.manifest, result.manifest);
}

/**
 * `kadrion estimate` (D48.5): renders and encodes the segment of
 * `estimatePlan` into a temporary directory, which it removes, and measures
 * it with the CLI's clock. The first frame carries the launch and the load;
 * the rest, up to the finished segment, is the time per frame. It is advice
 * for the host's batching and changes no output.
 */
async function estimateCommand(args: readonly string[], job: Job): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: {
      composition: { type: 'string' },
      assets: { type: 'string' },
      preset: { type: 'string' },
      samples: { type: 'string' },
      'segment-frames': { type: 'string' },
      ...GRID_OPTIONS,
      'budget-ms': { type: 'string' },
      ...FFMPEG_OPTIONS,
      ...LIMIT_OPTIONS,
    },
    strict: true,
    allowPositionals: false,
  });
  const { composition, assets, preset } = values;
  if (composition === undefined || assets === undefined || preset === undefined) {
    throw new UsageError('--composition, --assets, and --preset are required.');
  }
  if (!/^[0-9a-z]+$/.test(preset)) throw new UsageError('--preset takes a name such as 1080p.');
  const samples = integerFlag('samples', values.samples) ?? DEFAULT_ESTIMATE_SAMPLES;
  const segmentFrames = integerFlag('segment-frames', values['segment-frames']);
  const budgetMs = integerFlag('budget-ms', values['budget-ms']);
  const grid = gridFlags(values);
  const options = jobOptions(job, values);
  const ffmpeg = ffmpegPaths(values, job.hosts);
  const inputs = await readInputs(composition, assets);
  const plan = estimatePlan(inputs.document, samples, segmentFrames, grid);
  const { now } = job.hosts;
  const started = now();
  /** Set by the progress callback: held in an object, so the checks below see them. */
  const times: { firstFrame: number | null; finishedAt: number | null } = {
    firstFrame: null,
    finishedAt: null,
  };
  const directory = await mkdtemp(join(tmpdir(), 'kadrion-estimate-'));
  try {
    await job.hosts.renderRange({
      ...inputs,
      preset,
      range: plan.range,
      segmentFrames: plan.sampleSegmentFrames,
      outputDirectory: directory,
      ffmpeg,
      ...options,
      onProgress(event) {
        if (event.event === 'frame') times.firstFrame ??= now();
        if (event.event === 'segment') times.finishedAt = now();
        job.emit(event);
      },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  const { firstFrame, finishedAt } = times;
  if (firstFrame === null || finishedAt === null) {
    throw new ProducerError('page-error', 'The estimate rendered no segment.');
  }
  const setupMs = Math.ceil(firstFrame - started);
  const msPerFrame = Math.ceil((finishedAt - firstFrame) / (plan.frames - 1));
  const msPerSegment = msPerFrame * plan.segmentFrames;
  job.emit({
    event: 'estimate',
    samples: plan.frames,
    setupMs,
    msPerFrame,
    segmentFrames: plan.segmentFrames,
    msPerSegment,
    segments: plan.segments,
    segmentsInBudget:
      budgetMs === undefined
        ? null
        : Math.max(0, Math.floor((budgetMs - setupMs) / Math.max(1, msPerSegment))),
  });
  job.emit({ event: 'done', manifest: null });
  return EXIT_OK;
}

/** Throws the error of a cancelled job when the signal has aborted (D48.2). */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw signal.reason instanceof ProducerError
      ? signal.reason
      : new ProducerError('cancelled', 'The job was cancelled.');
  }
}

/**
 * `kadrion segment-keys` (D92.1): the key of every segment of the grid the
 * flags name, without a browser, FFmpeg, or a file of output. It reads the
 * composition, the asset file, and the fonts of the measured nodes, nothing
 * else, and prints one `segment-keys` line before its `done`.
 */
async function segmentKeysCommand(args: readonly string[], job: Job): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: {
      composition: { type: 'string' },
      assets: { type: 'string' },
      preset: { type: 'string' },
      'segment-frames': { type: 'string' },
      ...GRID_OPTIONS,
      'spans-us': { type: 'string' },
      ...LIMIT_OPTIONS,
    },
    strict: true,
    allowPositionals: false,
  });
  const { composition, assets, preset } = values;
  if (composition === undefined || assets === undefined || preset === undefined) {
    throw new UsageError('--composition, --assets, and --preset are required.');
  }
  if (!/^[0-9a-z]+$/.test(preset)) throw new UsageError('--preset takes a name such as 1080p.');
  const segmentFrames = integerFlag('segment-frames', values['segment-frames']);
  const grid = gridFlags(values);
  const spans =
    values['spans-us'] === undefined ? undefined : parseTimes(values['spans-us'], 'spans-us');
  const limits = limitsOf(values);
  const inputs = await readInputs(composition, assets);
  throwIfAborted(job.signal);
  const fonts = await job.hosts.measureFonts(inputs.document, inputs.resolveAsset, limits);
  throwIfAborted(job.signal);
  const keys = job.hosts.segmentKeys(
    inputs.document,
    { ...grid, ...(spans === undefined ? {} : { spans }) },
    {
      preset,
      ...(segmentFrames === undefined ? {} : { segmentFrames }),
      fonts,
      ...(limits === undefined ? {} : { limits }),
    },
  );
  job.emit({ event: 'segment-keys', keyVersion: keys.keyVersion, segments: keys.segments });
  job.emit({ event: 'done', manifest: null });
  return EXIT_OK;
}

type CheckNode =
  | ValidatedComposition['scenes'][number]['nodes'][number]
  | Extract<
      ValidatedComposition['scenes'][number]['nodes'][number],
      { type: 'group' }
    >['children'][number];

/** The node `nodeId` among `nodes` and the children of their groups, or `null`. */
function findCheckNode(nodes: readonly CheckNode[], nodeId: string): CheckNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    if (node.type === 'group') {
      const found = findCheckNode(node.children, nodeId);
      if (found !== null) return found;
    }
  }
  return null;
}

/**
 * The validated document and its Custom HTML node `nodeId`, of a scene, a
 * group, or a definition; an invalid document, no such node, or a node of
 * another type is `invalid-document`, as `checkCustomHtml` refuses them (D93.1).
 */
function customHtmlNodeOf(
  document: unknown,
  nodeId: string,
): { readonly composition: ValidatedComposition; readonly node: CustomHtmlNode } {
  const result = validateComposition(document);
  if (!result.ok) {
    const details = result.errors.map(({ path, message }) => `${path}: ${message}`).join('; ');
    throw new ProducerError(INVALID_DOCUMENT, `The document is not valid: ${details}`);
  }
  const { composition } = result;
  for (const nodes of [
    ...composition.scenes.map((scene) => scene.nodes),
    ...composition.definitions.map((definition) => definition.nodes),
  ]) {
    const node = findCheckNode(nodes, nodeId);
    if (node === null) continue;
    if (node.type !== 'custom-html') {
      throw new ProducerError(
        INVALID_DOCUMENT,
        `Node "${nodeId}" is a ${node.type} node, not Custom HTML.`,
      );
    }
    return { composition, node };
  }
  throw new ProducerError(INVALID_DOCUMENT, `No Custom HTML node has the ID "${nodeId}".`);
}

/** Refuses `value` over the limit `name`, in the words of the Producer's limits (D48.4). */
function withinLimit(limits: JobLimits, name: keyof JobLimits, value: number, what: string): void {
  const limit = limits[name];
  if (limit === undefined) return;
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new ProducerError(
      'limit-exceeded',
      `The limit ${name} must be a non-negative integer, got ${String(limit)}.`,
    );
  }
  if (value > limit) {
    throw new ProducerError(
      'limit-exceeded',
      `${what} is ${String(value)}, more than the limit of ${String(limit)}.`,
    );
  }
}

/**
 * The limits of D48.4 for `check-custom-html`, checked before the browser
 * opens. `checkCustomHtml` takes none (D93.3), so the command checks them
 * itself: the document as given, the frames the check renders (each sampled
 * time twice), and the bytes of the element's fonts as the resolver returned them.
 */
function checkLimits(
  limits: JobLimits | undefined,
  composition: ValidatedComposition,
  frames: number,
  fonts: readonly { readonly id: string; readonly bytes: number }[],
): void {
  if (limits === undefined) return;
  withinLimit(
    limits,
    'maxDocumentBytes',
    new TextEncoder().encode(canonicalJson(composition)).byteLength,
    'The document (canonical JSON, bytes)',
  );
  withinLimit(limits, 'maxDurationUs', composition.durationUs, 'The duration (µs)');
  withinLimit(limits, 'maxFrames', frames, 'The frames of the job');
  withinLimit(limits, 'maxAssets', composition.assets.length, 'The number of assets');
  withinLimit(
    limits,
    'maxCanvasPixels',
    composition.width * composition.height,
    'The pixels of a canvas (width × height)',
  );
  for (const { id, width, height } of composition.definitions) {
    withinLimit(
      limits,
      'maxCanvasPixels',
      width * height,
      `The pixels of the canvas of the definition "${id}" (width × height)`,
    );
  }
  let total = 0;
  for (const { id, bytes } of fonts) {
    withinLimit(limits, 'maxAssetBytes', bytes, `The asset "${id}" (bytes)`);
    total += bytes;
  }
  withinLimit(limits, 'maxTotalAssetBytes', total, 'All assets together (bytes)');
}

/**
 * The bytes of the element's fonts, read once before the browser opens: a font
 * the asset file lacks, given as no bytes, or with other bytes than its content
 * hash is the error of a render (D14), not a problem of the element.
 */
async function elementFonts(
  composition: ValidatedComposition,
  node: CustomHtmlNode,
  resolveAsset: RenderRequest['resolveAsset'],
): Promise<ReadonlyMap<string, { readonly bytes: Uint8Array; readonly mediaType: string }>> {
  const fonts = new Map<string, { readonly bytes: Uint8Array; readonly mediaType: string }>();
  for (const id of node.fontAssetIds) {
    const asset = composition.assets.find((candidate) => candidate.id === id);
    if (asset === undefined || fonts.has(id)) continue;
    const resolved = await resolveAsset({
      id,
      type: asset.type,
      contentHash: asset.contentHash,
    });
    if (resolved === null) {
      throw new ProducerError('asset-missing', `The asset file has no entry for the font "${id}".`);
    }
    if (!('bytes' in resolved)) {
      throw new ProducerError('asset-invalid', `The font "${id}" must be given as bytes (D64.2).`);
    }
    if (sha256(resolved.bytes) !== asset.contentHash) {
      throw new ProducerError(
        'asset-hash-mismatch',
        `The bytes of the font "${id}" do not have its content hash.`,
      );
    }
    fonts.set(id, resolved);
  }
  return fonts;
}

/**
 * `kadrion check-custom-html` (D93): the check of D78.6 on one Custom HTML
 * node, the report of the tool `check_custom_html`. The findings come from
 * `checkCustomHtmlSource`; the render check from `checkCustomHtml` in the
 * pinned Chromium, which the command launches itself, so that a browser other
 * than the pinned one is an error of the job (exit 1), not a problem of the
 * element, and closes when the job is cancelled or its wall time is up. It
 * writes no file, and exits 0 whether `ok` is true or false.
 */
async function checkCustomHtmlCommand(args: readonly string[], job: Job): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: {
      composition: { type: 'string' },
      assets: { type: 'string' },
      'node-id': { type: 'string' },
      samples: { type: 'string' },
      ...LIMIT_OPTIONS,
    },
    strict: true,
    allowPositionals: false,
  });
  const { composition, assets } = values;
  const nodeId = values['node-id'];
  if (composition === undefined || assets === undefined || nodeId === undefined) {
    throw new UsageError('--composition, --assets, and --node-id are required.');
  }
  if (nodeId === '') throw new UsageError('--node-id takes the ID of a Custom HTML node.');
  const samples = integerFlag('samples', values.samples) ?? CUSTOM_HTML_CHECK_SAMPLES;
  if (samples < 1) throw new UsageError('--samples takes a whole number from 1.');
  const limits = limitsOf(values);
  const inputs = await readInputs(composition, assets);
  const checked = customHtmlNodeOf(inputs.document, nodeId);
  const sampled = Math.min(samples, frameCount(checked.node.durationUs, checked.composition.fps));
  const fonts = await elementFonts(checked.composition, checked.node, inputs.resolveAsset);
  checkLimits(
    limits,
    checked.composition,
    2 * sampled,
    [...fonts].map(([id, font]) => ({ id, bytes: font.bytes.byteLength })),
  );
  const findings = checkCustomHtmlSource(checked.node.html);
  throwIfAborted(job.signal);
  const chromium = await job.hosts.launchChromium();
  // The check turns a failed render into a problem of the element, so a job
  // cancelled while it runs closes the browser, which fails the render in
  // flight at once, and ends as cancelled whatever the check returned (D48.2).
  const state: { cancelled: boolean } = { cancelled: false };
  const close = (): void => {
    chromium.browser.close().catch(() => undefined);
  };
  const stop = (): void => {
    state.cancelled = true;
    close();
  };
  const stopListening = (): void => {
    job.signal?.removeEventListener('abort', stop);
  };
  job.signal?.addEventListener('abort', stop, { once: true });
  if (job.signal?.aborted === true) stop();
  let render: CustomHtmlCheck;
  try {
    render = await job.hosts.checkCustomHtml({
      document: inputs.document,
      nodeId,
      resolveAsset: ({ id }) => fonts.get(id) ?? null,
      samples,
      chromium,
    });
  } catch (reason) {
    if (state.cancelled) throwIfAborted(job.signal);
    throw reason;
  } finally {
    stopListening();
    close();
  }
  if (state.cancelled) throwIfAborted(job.signal);
  job.emit({
    event: 'check',
    nodeId,
    findings,
    render,
    ok: findings.length === 0 && render.problems.length === 0,
  });
  job.emit({ event: 'done', manifest: null });
  return EXIT_OK;
}

/**
 * `kadrion migrate` (D43, amended by PR-41): `parseComposition` of the input
 * text, then `serializeComposition` of the result to `--out`, written under a
 * temporary name and renamed (D47.6), so a refused document or a cancelled job
 * leaves no file. `--out` may name the input itself. Without `--check` an
 * earlier version is migrated and succeeds; with it nothing is written.
 */
async function migrateCommand(args: readonly string[], job: Job): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...args],
    options: { out: { type: 'string' }, check: { type: 'boolean' } },
    strict: true,
    allowPositionals: true,
  });
  const [input, ...more] = positionals;
  if (input === undefined || more.length > 0) {
    throw new UsageError('migrate takes exactly one document file.');
  }
  const check = values.check === true;
  const { out } = values;
  if (check === (out !== undefined)) throw new UsageError('Give either --out <file> or --check.');
  if (out === '') throw new UsageError('--out takes a file.');
  let text: string;
  try {
    text = await readFile(input, 'utf8');
  } catch (reason) {
    throw new UsageError(`Cannot read the document: ${String(reason)}`);
  }
  const outcome = migrateText(text);
  job.emit(outcome.line);
  if (!outcome.ok) {
    throw new ProducerError(
      INVALID_DOCUMENT,
      `The ${outcome.line.stage === 'text' ? 'text' : 'document'} of ${input} was refused; the invalid line holds why.`,
    );
  }
  if (check) {
    if (!outcome.current) {
      throw new JobFailure(
        NOT_CURRENT,
        `${input} is valid, but of an earlier version than the current one.`,
      );
    }
  } else if (out !== undefined) {
    throwIfAborted(job.signal);
    await mkdir(dirname(resolve(out)), { recursive: true });
    await writeComplete(out, outcome.text);
    job.emit({ event: 'file', file: out });
  }
  job.emit({ event: 'done', manifest: null });
  return EXIT_OK;
}

async function fetchFfmpegCommand(
  args: readonly string[],
  io: CliIo,
  fetch: FetchFfmpeg,
): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: { dir: { type: 'string' } },
    strict: true,
    allowPositionals: false,
  });
  if (values.dir === undefined || values.dir === '') throw new UsageError('--dir is required.');
  // Progress goes to standard error; standard output carries only the two paths.
  const installed = await fetch({ dir: values.dir, log: io.err });
  io.out(`ffmpeg ${installed.ffmpeg} ${FFMPEG_SHA256}`);
  io.out(`ffprobe ${installed.ffprobe} ${FFPROBE_SHA256}`);
  return EXIT_OK;
}

async function doctorCommand(args: readonly string[], io: CliIo, hosts: CliHosts): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: { ffmpeg: { type: 'string' }, ffprobe: { type: 'string' } },
    strict: true,
    allowPositionals: false,
  });
  const ffmpegPath = values.ffmpeg ?? hosts.env[FFMPEG_VARIABLE];
  const ffprobePath = values.ffprobe ?? hosts.env[FFPROBE_VARIABLE];
  const report = await hosts.doctor({
    ...(ffmpegPath === undefined ? {} : { ffmpegPath }),
    ...(ffprobePath === undefined ? {} : { ffprobePath }),
  });
  io.out(JSON.stringify(report, null, 2));
  return report.reference ? EXIT_OK : EXIT_NOT_REFERENCE;
}

/** The text of a verdict without `--json`: the verdict, its reasons, and the facts read. */
function inspectionLines(file: string, inspection: VideoInspection): string[] {
  const { video, audio } = inspection;
  const lines = [
    `${file}: ${inspection.playable ? 'the Player shows it as it is' : 'not as it is'}`,
  ];
  for (const { code, message } of inspection.reasons) lines.push(`  ${code}: ${message}`);
  if (inspection.container !== null) {
    lines.push(`  container: ${inspection.container} (${inspection.format ?? ''})`);
  }
  if (video !== null) {
    const rate =
      video.frameRate === null
        ? 'variable'
        : `${String(video.frameRate.num)}/${String(video.frameRate.den)}`;
    lines.push(
      `  video: ${video.codecString ?? video.codec ?? 'unknown'} ${String(video.width)}x${String(video.height)}, ` +
        `${String(video.frames ?? '?')} frames, ${String(video.durationUs ?? '?')} µs, ${rate} fps` +
        (video.rotation === 0 && !video.flipped
          ? ''
          : `, rotated ${String(video.rotation)}°${video.flipped ? ' and flipped' : ''}`),
    );
  }
  lines.push(
    audio === null
      ? '  audio: none'
      : `  audio: ${audio.codec ?? 'unknown'}, ${String(audio.channels)} channels, ${String(audio.sampleRate)} Hz`,
  );
  return lines;
}

/** Whether a file is a composition: its text starts with `{`, which no video file does. */
async function isComposition(blob: Blob): Promise<boolean> {
  const head = await blob.slice(0, 64).text();
  return head.trimStart().startsWith('{');
}

/**
 * `kadrion inspect` on a composition (D91.1): one warning per node whose
 * animated corners are not a convex quadrilateral at an instant of the frame
 * grid, with the first such instant. A text that is no JSON, or a document the
 * validator refuses, is an error, and exits 1.
 */
function inspectComposition(file: string, text: string, json: boolean, io: CliIo): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (reason) {
    io.err(`error invalid-json: ${reason instanceof Error ? reason.message : String(reason)}`);
    return EXIT_PRODUCER_ERROR;
  }
  const validation = validateComposition(parsed);
  if (!validation.ok) {
    io.err(`error ${INVALID_DOCUMENT}: ${file} is not a valid composition of this build.`);
    for (const { code, path, message } of validation.errors) {
      io.err(`  ${code} ${path}: ${message}`);
    }
    return EXIT_PRODUCER_ERROR;
  }
  const warnings: readonly CornersWarning[] = cornersWarnings(validation.composition);
  if (json) {
    io.out(JSON.stringify({ kind: 'composition', warnings }, null, 2));
    return EXIT_OK;
  }
  const count = `${String(warnings.length)} warning${warnings.length === 1 ? '' : 's'}`;
  io.out(`${file}: a composition of schema ${validation.composition.schemaVersion}, ${count}`);
  for (const { code, nodeId, timeUs, message } of warnings) {
    io.out(`  ${code} ${nodeId} at ${String(timeUs)} µs: ${message}`);
  }
  return EXIT_OK;
}

/**
 * `kadrion inspect [--json] <file>` (D79.6): the verdict of `inspectVideo` on
 * the file, read in slices and never whole, or the warnings of a composition
 * (D91.1). It exits 0 whatever the verdict is, 1 when the file cannot be
 * opened or is no valid composition, and 2 on a usage error.
 */
async function inspectCommand(
  args: readonly string[],
  io: CliIo,
  inspect: Inspect,
): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...args],
    options: { json: { type: 'boolean' } },
    strict: true,
    allowPositionals: true,
  });
  const [file, ...extra] = positionals;
  if (file === undefined || extra.length > 0) {
    throw new UsageError('kadrion inspect takes exactly one file.');
  }
  let blob: Blob;
  try {
    blob = await openAsBlob(resolve(file));
  } catch (reason) {
    io.err(`error file-unreadable: ${reason instanceof Error ? reason.message : String(reason)}`);
    return EXIT_PRODUCER_ERROR;
  }
  if (await isComposition(blob)) {
    return inspectComposition(file, await blob.text(), values.json === true, io);
  }
  const inspection = await inspect(blob);
  if (values.json === true) io.out(JSON.stringify(inspection, null, 2));
  else for (const line of inspectionLines(file, inspection)) io.out(line);
  return EXIT_OK;
}

/** `--max-wall-ms <n>` or `--max-wall-ms=<n>`, taken out of the arguments of a job (D48.4). */
function wallLimit(args: readonly string[]): {
  readonly rest: readonly string[];
  readonly wallMs: number | undefined;
} {
  const rest: string[] = [];
  let given: string | undefined;
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at] ?? '';
    if (arg === '--max-wall-ms') {
      given = args[at + 1];
      if (given === undefined) throw new UsageError('--max-wall-ms takes a value.');
      at += 1;
    } else if (arg.startsWith('--max-wall-ms=')) {
      given = arg.slice('--max-wall-ms='.length);
    } else {
      rest.push(arg);
    }
  }
  return { rest, wallMs: integerFlag('max-wall-ms', given) };
}

/** The exit code of a failure, by the table of D48.3. */
function exitCodeOf(code: string): number {
  if (code === 'limit-exceeded') return EXIT_LIMIT_EXCEEDED;
  if (code === 'cancelled') return EXIT_CANCELLED;
  if (code === NOT_CURRENT) return EXIT_NOT_CURRENT;
  return EXIT_PRODUCER_ERROR;
}

const JOBS: Readonly<
  Record<(typeof JOB_COMMANDS)[number], (args: readonly string[], job: Job) => Promise<number>>
> = {
  'render-frames': renderCommand,
  export: exportCommand,
  'render-range': renderRangeCommand,
  'render-audio': renderAudioCommand,
  join: joinCommand,
  'render-still': renderStillCommand,
  estimate: estimateCommand,
  'segment-keys': segmentKeysCommand,
  'check-custom-html': checkCustomHtmlCommand,
  migrate: migrateCommand,
};

function isJob(command: string | undefined): command is (typeof JOB_COMMANDS)[number] {
  return (JOB_COMMANDS as readonly (string | undefined)[]).includes(command);
}

const realTimer: StartTimer = (fire, milliseconds) => {
  const timer = setTimeout(fire, milliseconds);
  return () => {
    clearTimeout(timer);
  };
};

/**
 * Runs a job: its signal joins the host's with the wall time, its lines go to
 * standard output, and every failure ends in one `error` line, its message on
 * standard error, and the exit code of D48.3.
 */
async function runJob(
  command: (typeof JOB_COMMANDS)[number],
  args: readonly string[],
  io: CliIo,
  hosts: CliHosts,
): Promise<number> {
  const emit = (line: JobLine): void => {
    io.out(JSON.stringify(line));
  };
  let stopWall = (): void => undefined;
  try {
    const { rest, wallMs } = wallLimit(args);
    let signal = hosts.signal;
    if (wallMs !== undefined) {
      const wall = new AbortController();
      stopWall = hosts.startTimer(() => {
        wall.abort(
          new ProducerError(
            'limit-exceeded',
            `The job ran for longer than the wall time of ${String(wallMs)} ms.`,
          ),
        );
      }, wallMs);
      signal = signal === undefined ? wall.signal : AbortSignal.any([signal, wall.signal]);
    }
    if (signal?.aborted === true) {
      throw signal.reason instanceof ProducerError
        ? signal.reason
        : new ProducerError('cancelled', 'The job was cancelled before it started.');
    }
    return await JOBS[command](rest, { hosts, signal, emit });
  } catch (reason) {
    if (
      reason instanceof ProducerError ||
      reason instanceof FfmpegInstallError ||
      reason instanceof JobFailure
    ) {
      const exitCode = exitCodeOf(reason.code);
      io.err(`error ${reason.code}: ${reason.message}`);
      emit({ event: 'error', code: reason.code, exitCode });
      return exitCode;
    }
    if (
      reason instanceof UsageError ||
      String((reason as { code?: unknown }).code).startsWith('ERR_PARSE_ARGS_')
    ) {
      io.err((reason as Error).message);
      if ((reason as Error).message !== USAGE) io.err(USAGE);
      emit({ event: 'error', code: 'usage', exitCode: EXIT_USAGE });
      return EXIT_USAGE;
    }
    throw reason;
  } finally {
    stopWall();
  }
}

/** Runs the CLI and returns its exit code; nothing here calls `process.exit`. */
export async function runCli(
  argv: readonly string[],
  io: CliIo,
  hosts: Partial<CliHosts> = {},
): Promise<number> {
  const [command, ...rest] = argv;
  const given: CliHosts = {
    render: hosts.render ?? renderFrames,
    exportMp4: hosts.exportMp4 ?? exportMp4,
    renderRange: hosts.renderRange ?? renderSegments,
    renderAudio: hosts.renderAudio ?? renderAudio,
    join: hosts.join ?? joinSegments,
    renderStill: hosts.renderStill ?? renderStill,
    segmentKeys: hosts.segmentKeys ?? segmentKeys,
    measureFonts: hosts.measureFonts ?? measuredFontMetrics,
    checkCustomHtml: hosts.checkCustomHtml ?? checkCustomHtml,
    launchChromium: hosts.launchChromium ?? (() => launchChromium()),
    fetchFfmpeg: hosts.fetchFfmpeg ?? fetchFfmpeg,
    doctor: hosts.doctor ?? ((ffmpeg) => runDoctor(ffmpeg)),
    inspect: hosts.inspect ?? inspectVideo,
    env: hosts.env ?? process.env,
    signal: hosts.signal,
    now: hosts.now ?? (() => performance.now()),
    startTimer: hosts.startTimer ?? realTimer,
  };
  if (isJob(command)) return runJob(command, rest, io, given);
  try {
    if (command === 'fetch-ffmpeg') return await fetchFfmpegCommand(rest, io, given.fetchFfmpeg);
    if (command === 'doctor') return await doctorCommand(rest, io, given);
    if (command === 'inspect') return await inspectCommand(rest, io, given.inspect);
    throw new UsageError(USAGE);
  } catch (reason) {
    if (reason instanceof ProducerError || reason instanceof FfmpegInstallError) {
      io.err(`error ${reason.code}: ${reason.message}`);
      return EXIT_PRODUCER_ERROR;
    }
    if (
      reason instanceof UsageError ||
      String((reason as { code?: unknown }).code).startsWith('ERR_PARSE_ARGS_')
    ) {
      io.err((reason as Error).message);
      if ((reason as Error).message !== USAGE) io.err(USAGE);
      return EXIT_USAGE;
    }
    throw reason;
  }
}

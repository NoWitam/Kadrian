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
 *   kadrion render-audio --composition <file> --assets <file> --out <dir>
 *                  [--from-us <t> --to-us <t>] [--ffmpeg <path>] [--ffprobe <path>]
 *   kadrion join --in <dir> [--in <dir> …] --out <dir> [--ffmpeg <path>] [--ffprobe <path>]
 *   kadrion render-still --composition <file> --assets <file> --out <dir> --time-us <t>
 *                  --format <png|jpeg|webp> [--ffmpeg <path>] [--ffprobe <path>]
 *   kadrion estimate --composition <file> --assets <file> --preset <1080p|720p>
 *                  [--samples <n>] [--segment-frames <n>] [--budget-ms <ms>] [--ffmpeg …] [--ffprobe …]
 *   kadrion fetch-ffmpeg --dir <dir>
 *   kadrion doctor [--ffmpeg <path>] [--ffprobe <path>]
 *
 * Every command but `fetch-ffmpeg` and `doctor` is a job of D48: its standard
 * output is JSON lines and nothing else (progress, the files written, and the
 * end), its diagnostics go to standard error, `SIGTERM` or `SIGINT` cancel it,
 * it takes the limits `--max-document-bytes`, `--max-duration-us`,
 * `--max-frames`, `--max-assets`, `--max-asset-bytes`,
 * `--max-total-asset-bytes` (not `join`, which reads no document), and
 * `--max-wall-ms`, and its exit code is one of the table of D48.3.
 *
 * `render-frames` renders frame times of a composition to `frame-<index>.png` and
 * writes `render-manifest.json`. `export` writes `video-<preset>.mp4` and
 * `video-<preset>.render-manifest.json` with the pinned FFmpeg, whose paths come
 * from the flags or from `KADRION_FFMPEG` and `KADRION_FFPROBE`, never from
 * `PATH` (D29.1). The asset file maps asset IDs to `{ path, mediaType }`,
 * with paths relative to that file: where bytes live is the host's business,
 * never the document's (D14). The CLI knows no golden timestamp (D12).
 * `render-range`, `render-audio`, and `join` are the export split into jobs of
 * a host's queue (D47): a range of whole segments with its
 * `segments-<first>-<last>.manifest.json`, the audio of a range with
 * `audio.manifest.json`, and the join of every manifest in the `--in`
 * directories into the same two files `export` writes. `render-still` writes
 * `still-<index>.<png|jpg|webp>` and its manifest. Every file the CLI writes is
 * written under a temporary name and renamed when complete (D47.6).
 * `estimate` renders and encodes a few frames into a temporary directory and
 * reports the time per frame and how many segments fit into a budget (D48.5).
 * `fetch-ffmpeg` installs the pinned FFmpeg into a directory and prints the two
 * paths; `doctor` prints a JSON report of whether this process is the reference
 * environment, and exits 3 when it is not (D45).
 */
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

import {
  AUDIO_FILE_NAME,
  DEFAULT_ESTIMATE_SAMPLES,
  estimatePlan,
  exportMp4,
  FFMPEG_SHA256,
  FFPROBE_SHA256,
  JOB_LIMITS,
  joinSegments,
  PARTIAL_SUFFIX,
  ProducerError,
  renderAudio,
  renderFrames,
  renderSegments,
  renderStill,
  STILL_FORMATS,
  type AudioManifest,
  type AudioRequest,
  type AudioResult,
  type ExportRequest,
  type ExportResult,
  type FfmpegPaths,
  type JoinPart,
  type JoinRequest,
  type JoinResult,
  type JobLimits,
  type ProgressEvent,
  type RenderRequest,
  type RenderResult,
  type SegmentsManifest,
  type SegmentsRequest,
  type SegmentsResult,
  type StillFormat,
  type StillRequest,
  type StillResult,
} from '@kadrion/producer';

import { runDoctor, type DoctorReport } from './doctor.js';
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
] as const;

/**
 * A line of a job's standard output (D48.1): the Producer's progress, then a
 * `file` per file written under its final name, then exactly one `done` or
 * `error`. `estimate` reports its measurement before its `done`.
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
  | { readonly event: 'done'; readonly manifest: string | null }
  | { readonly event: 'error'; readonly code: string; readonly exitCode: number };

export const USAGE = [
  'Usage: kadrion render-frames --composition <file> --assets <file> --out <dir> --times <t,...> [--ffmpeg <path>] [--ffprobe <path>]',
  '       kadrion export --composition <file> --assets <file> --out <dir> --preset <1080p|720p> [--segment-frames <n>] [--ffmpeg <path>] [--ffprobe <path>]',
  '       kadrion render-range --composition <file> --assets <file> --out <dir> --preset <1080p|720p> [--from-us <t> --to-us <t>] [--segment-frames <n>] [--ffmpeg <path>] [--ffprobe <path>]',
  '       kadrion render-audio --composition <file> --assets <file> --out <dir> [--from-us <t> --to-us <t>] [--ffmpeg <path>] [--ffprobe <path>]',
  '       kadrion join --in <dir> [--in <dir> ...] --out <dir> [--ffmpeg <path>] [--ffprobe <path>]',
  '       kadrion render-still --composition <file> --assets <file> --out <dir> --time-us <t> --format <png|jpeg|webp> [--ffmpeg <path>] [--ffprobe <path>]',
  '       kadrion estimate --composition <file> --assets <file> --preset <1080p|720p> [--samples <n>] [--segment-frames <n>] [--budget-ms <ms>] [--ffmpeg <path>] [--ffprobe <path>]',
  '       kadrion fetch-ffmpeg --dir <dir>',
  '       kadrion doctor [--ffmpeg <path>] [--ffprobe <path>]',
  'Limits of a job: [--max-document-bytes <n>] [--max-duration-us <n>] [--max-frames <n>] [--max-assets <n>] [--max-asset-bytes <n>] [--max-total-asset-bytes <n>] [--max-wall-ms <n>]',
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
  readonly fetchFfmpeg: FetchFfmpeg;
  readonly doctor: Doctor;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Cancels the job: `bin.ts` aborts it on `SIGTERM` and `SIGINT` (D48.2). */
  readonly signal: AbortSignal | undefined;
  /** Milliseconds of a monotonic clock, for `estimate` (D48.5). */
  readonly now: () => number;
  /** The timer of `--max-wall-ms` (D48.4). */
  readonly startTimer: StartTimer;
}

class UsageError extends Error {}

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
export function parseTimes(text: string): number[] {
  const parts = text.split(',');
  if (parts.some((part) => !/^\d+$/.test(part))) {
    throw new UsageError('--times takes comma-separated integer microseconds, such as 0,2500000.');
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
    resolveAsset: async ({ id }) => {
      const entry = map.get(id);
      if (entry === undefined) return null;
      const bytes = await readFile(resolve(dirname(assetFile), entry.path));
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
  const options = jobOptions(job, values);
  const ffmpeg = ffmpegPaths(values, job.hosts);
  const inputs = await readInputs(composition, assets);
  await mkdir(out, { recursive: true });
  const { manifest } = await job.hosts.renderRange({
    ...inputs,
    preset,
    ...(range === undefined ? {} : { range }),
    ...(segmentFrames === undefined ? {} : { segmentFrames }),
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
  const options = jobOptions(job, values);
  const ffmpeg = ffmpegPaths(values, job.hosts);
  const inputs = await readInputs(composition, assets);
  const plan = estimatePlan(inputs.document, samples, segmentFrames);
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
    if (reason instanceof ProducerError || reason instanceof FfmpegInstallError) {
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
    fetchFfmpeg: hosts.fetchFfmpeg ?? fetchFfmpeg,
    doctor: hosts.doctor ?? ((ffmpeg) => runDoctor(ffmpeg)),
    env: hosts.env ?? process.env,
    signal: hosts.signal,
    now: hosts.now ?? (() => performance.now()),
    startTimer: hosts.startTimer ?? realTimer,
  };
  if (isJob(command)) return runJob(command, rest, io, given);
  try {
    if (command === 'fetch-ffmpeg') return await fetchFfmpegCommand(rest, io, given.fetchFfmpeg);
    if (command === 'doctor') return await doctorCommand(rest, io, given);
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

/**
 * The command line of D28.8, D29.10, and D45:
 *
 *   kadrion render-frames --composition <file> --assets <file> --out <dir> --times <t,…>
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
 *   kadrion fetch-ffmpeg --dir <dir>
 *   kadrion doctor [--ffmpeg <path>] [--ffprobe <path>]
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
 * `fetch-ffmpeg` installs the pinned FFmpeg into a directory and prints the two
 * paths; `doctor` prints a JSON report of whether this process is the reference
 * environment, and exits 3 when it is not (D45).
 */
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

import {
  AUDIO_FILE_NAME,
  exportMp4,
  FFMPEG_SHA256,
  FFPROBE_SHA256,
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

export const EXIT_OK = 0;
export const EXIT_PRODUCER_ERROR = 1;
export const EXIT_USAGE = 2;
/** `kadrion doctor`: the report was written, and this is not the reference environment. */
export const EXIT_NOT_REFERENCE = 3;

export const USAGE = [
  'Usage: kadrion render-frames --composition <file> --assets <file> --out <dir> --times <t,...>',
  '       kadrion export --composition <file> --assets <file> --out <dir> --preset <1080p|720p> [--segment-frames <n>] [--ffmpeg <path>] [--ffprobe <path>]',
  '       kadrion render-range --composition <file> --assets <file> --out <dir> --preset <1080p|720p> [--from-us <t> --to-us <t>] [--segment-frames <n>] [--ffmpeg <path>] [--ffprobe <path>]',
  '       kadrion render-audio --composition <file> --assets <file> --out <dir> [--from-us <t> --to-us <t>] [--ffmpeg <path>] [--ffprobe <path>]',
  '       kadrion join --in <dir> [--in <dir> ...] --out <dir> [--ffmpeg <path>] [--ffprobe <path>]',
  '       kadrion render-still --composition <file> --assets <file> --out <dir> --time-us <t> --format <png|jpeg|webp> [--ffmpeg <path>] [--ffprobe <path>]',
  '       kadrion fetch-ffmpeg --dir <dir>',
  '       kadrion doctor [--ffmpeg <path>] [--ffprobe <path>]',
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
}

class UsageError extends Error {}

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

async function renderCommand(args: readonly string[], io: CliIo, render: Render): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: {
      composition: { type: 'string' },
      assets: { type: 'string' },
      out: { type: 'string' },
      times: { type: 'string' },
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
  const inputs = await readInputs(composition, assets);
  const result = await render({ ...inputs, timesUs });
  await mkdir(out, { recursive: true });
  for (const frame of result.frames) {
    await writeFile(join(out, frameFileName(frame.index)), frame.png);
  }
  await writeFile(
    join(out, 'render-manifest.json'),
    `${JSON.stringify(result.manifest, null, 2)}\n`,
  );
  for (const frame of result.manifest.frames) {
    io.out(`${frameFileName(frame.index)} ${String(frame.timeUs)} ${frame.sha256}`);
  }
  io.out(`render-manifest.json runtime ${result.manifest.runtime.contentHash}`);
  return EXIT_OK;
}

/** `video-1080p.mp4`, and its manifest next to it (D29.10). */
export function exportFileNames(preset: string): {
  readonly video: string;
  readonly manifest: string;
} {
  return { video: `video-${preset}.mp4`, manifest: `video-${preset}.render-manifest.json` };
}

async function exportCommand(args: readonly string[], io: CliIo, hosts: CliHosts): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: {
      ...DOCUMENT_OPTIONS,
      preset: { type: 'string' },
      'segment-frames': { type: 'string' },
      ...FFMPEG_OPTIONS,
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
  const ffmpeg = ffmpegPaths(values, hosts);
  const inputs = await readInputs(composition, assets);
  await mkdir(out, { recursive: true });
  const names = exportFileNames(preset);
  const result = await hosts.exportMp4({
    ...inputs,
    preset,
    ...(segmentFrames === undefined ? {} : { segmentFrames }),
    outputPath: join(out, names.video),
    ffmpeg,
  });
  await writeComplete(join(out, names.manifest), manifestText(result.manifest));
  io.out(
    `${names.video} ${String(result.manifest.frames.length)} frames ${result.manifest.preset.name} ffmpeg ${result.manifest.ffmpeg.version}`,
  );
  io.out(`${names.manifest} runtime ${result.manifest.runtime.contentHash}`);
  return EXIT_OK;
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

async function renderRangeCommand(
  args: readonly string[],
  io: CliIo,
  hosts: CliHosts,
): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: {
      ...DOCUMENT_OPTIONS,
      preset: { type: 'string' },
      'from-us': { type: 'string' },
      'to-us': { type: 'string' },
      'segment-frames': { type: 'string' },
      ...FFMPEG_OPTIONS,
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
  const ffmpeg = ffmpegPaths(values, hosts);
  const inputs = await readInputs(composition, assets);
  await mkdir(out, { recursive: true });
  const { manifest } = await hosts.renderRange({
    ...inputs,
    preset,
    ...(range === undefined ? {} : { range }),
    ...(segmentFrames === undefined ? {} : { segmentFrames }),
    outputDirectory: out,
    ffmpeg,
  });
  const first = manifest.segments[0]?.index ?? 0;
  const last = manifest.segments.at(-1)?.index ?? first;
  const name = segmentsManifestName(first, last);
  await writeComplete(join(out, name), manifestText(manifest));
  for (const segment of manifest.segments) {
    io.out(
      `${segment.file} ${String(segment.firstFrame)} ${String(segment.frameCount)} ${segment.sha256}`,
    );
  }
  io.out(`${name} runtime ${manifest.runtime.contentHash}`);
  return EXIT_OK;
}

async function renderAudioCommand(
  args: readonly string[],
  io: CliIo,
  hosts: CliHosts,
): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: {
      ...DOCUMENT_OPTIONS,
      'from-us': { type: 'string' },
      'to-us': { type: 'string' },
      ...FFMPEG_OPTIONS,
    },
    strict: true,
    allowPositionals: false,
  });
  const { composition, assets, out } = values;
  if (composition === undefined || assets === undefined || out === undefined) {
    throw new UsageError('--composition, --assets, and --out are required.');
  }
  const range = rangeFlags(values);
  const ffmpeg = ffmpegPaths(values, hosts);
  const inputs = await readInputs(composition, assets);
  await mkdir(out, { recursive: true });
  const { manifest } = await hosts.renderAudio({
    ...inputs,
    ...(range === undefined ? {} : { range }),
    outputDirectory: out,
    ffmpeg,
  });
  await writeComplete(join(out, AUDIO_MANIFEST_NAME), manifestText(manifest));
  io.out(
    manifest.audio === null
      ? `no audio clip: ${AUDIO_MANIFEST_NAME} only`
      : `${AUDIO_FILE_NAME} ${String(manifest.audio.rangeSampleCount)} samples ${manifest.audio.sha256}`,
  );
  io.out(`${AUDIO_MANIFEST_NAME} ${manifest.compositionHash}`);
  return EXIT_OK;
}

async function readManifest(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (reason) {
    throw new UsageError(`Cannot read the manifest ${path}: ${String(reason)}`);
  }
}

async function joinCommand(args: readonly string[], io: CliIo, hosts: CliHosts): Promise<number> {
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
  const ffmpeg = ffmpegPaths(values, hosts);
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
  const result = await hosts.join({
    segments,
    audio: pass,
    outputPath: join(out, names.video),
    ffmpeg,
  });
  await writeComplete(join(out, names.manifest), manifestText(result.manifest));
  io.out(
    `${names.video} ${String(result.manifest.frames.length)} frames ${String(result.manifest.segments.length)} segments ${result.manifest.preset.name}`,
  );
  io.out(`${names.manifest} runtime ${result.manifest.runtime.contentHash}`);
  return EXIT_OK;
}

async function renderStillCommand(
  args: readonly string[],
  io: CliIo,
  hosts: CliHosts,
): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: {
      ...DOCUMENT_OPTIONS,
      'time-us': { type: 'string' },
      format: { type: 'string' },
      ...FFMPEG_OPTIONS,
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
  // PNG needs no FFmpeg: the captured bytes are the still (D47.7).
  const ffmpeg = format === 'png' ? undefined : ffmpegPaths(values, hosts);
  const inputs = await readInputs(composition, assets);
  await mkdir(out, { recursive: true });
  const result = await hosts.renderStill({
    ...inputs,
    timeUs,
    format,
    ...(ffmpeg === undefined ? {} : { ffmpeg }),
  });
  const [frame] = result.manifest.frames;
  const names = stillFileNames(frame?.index ?? 0, result.format);
  await writeComplete(join(out, names.image), result.bytes);
  await writeComplete(join(out, names.manifest), manifestText(result.manifest));
  io.out(`${names.image} ${String(timeUs)} ${result.manifest.output.sha256}`);
  io.out(`${names.manifest} runtime ${result.manifest.runtime.contentHash}`);
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
  };
  try {
    if (command === 'render-frames') return await renderCommand(rest, io, given.render);
    if (command === 'export') return await exportCommand(rest, io, given);
    if (command === 'render-range') return await renderRangeCommand(rest, io, given);
    if (command === 'render-audio') return await renderAudioCommand(rest, io, given);
    if (command === 'join') return await joinCommand(rest, io, given);
    if (command === 'render-still') return await renderStillCommand(rest, io, given);
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

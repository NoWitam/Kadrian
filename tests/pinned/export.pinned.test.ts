/**
 * The MP4 export of D29 (specification §5 P5) and its segments, jobs, join, and
 * stills (D47) with the pinned FFmpeg. It needs
 * `KADRION_FFMPEG` and `KADRION_FFPROBE`, the verified binaries of
 * `node --run ffmpeg:fetch`: required in the pinned environment, and skipped
 * with a message elsewhere, because the pinned build runs on linux/x64 only.
 * Structure is checked with `ffprobe`; pixels are compared on the pre-encode
 * frames only, and the decoded video is reported, never asserted (P5). The
 * expectations are written out from D29, not taken from the implementation.
 * The job contract of D48 is tested on the CLI in processes of its own:
 * progress lines, cancellation by signal, the wall time, and the estimate.
 */
import { execFile, spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';

import { CANCEL_GRACE_MS, EXIT_CANCELLED, EXIT_LIMIT_EXCEEDED } from '@kadrion/cli';
import {
  exportMp4,
  launchChromium,
  networkFacts,
  PINNED_IMAGE,
  PINNED_IMAGE_VARIABLE,
  renderFrames,
  renderSegments,
  renderStill,
  sha256,
  type ExportManifest,
  type ExportResult,
  type LaunchedChromium,
  type RenderResult,
} from '@kadrion/producer';
import {
  generateReferenceAssets,
  goldenTimestamps,
  referenceComposition,
} from '@kadrion/test-fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  customHtmlNode,
  decodePng,
  OUTPUT_DIRECTORY,
  readGoldens,
  referenceResolver,
  repoRoot,
  variant,
  writeReport,
  type Pixels,
} from './support.js';

const run = promisify(execFile);
const ffmpegPath = process.env.KADRION_FFMPEG;
const ffprobePath = process.env.KADRION_FFPROBE;
const available = ffmpegPath !== undefined && ffprobePath !== undefined;
const pinned = process.env[PINNED_IMAGE_VARIABLE] === PINNED_IMAGE;
const FFMPEG = { ffmpegPath: ffmpegPath ?? '', ffprobePath: ffprobePath ?? '' };
const EXPORTS = join(OUTPUT_DIRECTORY, 'exports');
const report: Record<string, unknown> = {};

describe('the pinned FFmpeg for the export (D29.1)', () => {
  it('is given wherever the run is pinned, and its absence is stated elsewhere', () => {
    if (pinned) expect(available).toBe(true);
    if (!available) {
      console.info(
        'The export tests are skipped: KADRION_FFMPEG and KADRION_FFPROBE are not set. P5 is not proven by this run.',
      );
    }
  });
});

interface Stream {
  readonly codec_type: string;
  readonly codec_name: string;
  readonly profile?: string;
  readonly level?: number;
  readonly width?: number;
  readonly height?: number;
  readonly pix_fmt?: string;
  readonly sample_aspect_ratio?: string;
  readonly r_frame_rate: string;
  readonly avg_frame_rate: string;
  readonly time_base: string;
  readonly start_pts?: number;
  readonly duration_ts?: number;
  readonly nb_read_frames?: string;
  readonly color_range?: string;
  readonly color_space?: string;
  readonly color_transfer?: string;
  readonly color_primaries?: string;
  readonly sample_rate?: string;
  readonly channels?: number;
  readonly channel_layout?: string;
}

interface Probe {
  readonly streams: readonly Stream[];
  readonly format: {
    readonly format_name: string;
    readonly duration: string;
    readonly tags?: Record<string, string>;
  };
}

async function probe(file: string): Promise<Probe> {
  const { stdout } = await run(
    ffprobePath ?? '',
    ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(stdout) as Probe;
}

/** The presentation time of every video frame, in the stream's time base. */
async function videoTimestamps(file: string): Promise<number[]> {
  const { stdout } = await run(
    ffprobePath ?? '',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pts', '-of', 'csv=p=0', file],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  // The first frame carries side data, which csv output writes as one more, empty field.
  return stdout
    .trim()
    .split('\n')
    .map((line) => Number(line.split(',')[0]?.trim()));
}

/** The audio, decoded by the pinned FFmpeg to mono signed 16-bit samples at 48 kHz. */
async function decodedAudio(file: string): Promise<Int16Array> {
  const { stdout } = await run(
    ffmpegPath ?? '',
    ['-v', 'error', '-i', file, '-map', '0:a', '-ac', '1', '-ar', '48000', '-f', 's16le', 'pipe:1'],
    { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
  );
  const bytes = stdout as unknown as Buffer;
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
}

/** The source tone of the audio fixture, written out again: a 480 Hz triangle of 100 samples. */
function source(index: number): number {
  const phase = index % 100;
  return phase < 50 ? -8000 + 320 * phase : 8000 - 320 * (phase - 50);
}

/** Decoded RGB frames of the MP4 at the given indices (report only, P5). */
async function decodedFrames(file: string, indices: readonly number[]): Promise<Pixels[]> {
  const select = indices.map((index) => `eq(n\\,${String(index)})`).join('+');
  const { stdout } = await run(
    ffmpegPath ?? '',
    ['-v', 'error', '-i', file, '-vf', `select=${select}`, '-fps_mode', 'passthrough'].concat([
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      'pipe:1',
    ]),
    { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 },
  );
  const bytes = stdout as unknown as Buffer;
  const size = 1080 * 1920 * 3;
  return indices.map((_, position) => {
    const rgb = bytes.subarray(position * size, (position + 1) * size);
    const data = new Uint8Array(1080 * 1920 * 4);
    for (let pixel = 0; pixel < 1080 * 1920; pixel += 1) {
      data[pixel * 4] = rgb[pixel * 3] ?? 0;
      data[pixel * 4 + 1] = rgb[pixel * 3 + 1] ?? 0;
      data[pixel * 4 + 2] = rgb[pixel * 3 + 2] ?? 0;
      data[pixel * 4 + 3] = 255;
    }
    return { width: 1080, height: 1920, data };
  });
}

function psnr(a: Pixels, b: Pixels): number {
  let squared = 0;
  for (let index = 0; index < a.data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const delta = (a.data[index + channel] ?? 0) - (b.data[index + channel] ?? 0);
      squared += delta * delta;
    }
  }
  const mse = squared / ((a.data.length / 4) * 3);
  return mse === 0 ? Number.POSITIVE_INFINITY : 10 * Math.log10((255 * 255) / mse);
}

/** Files anywhere below `directory`, a few levels deep, that look like frames. */
function frameLikeFiles(directory: string, depth = 3): string[] {
  if (depth < 0 || !existsSync(directory)) return [];
  const found: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return [];
  }
  for (const name of entries) {
    const path = join(directory, name);
    let isDirectory: boolean;
    try {
      isDirectory = statSync(path).isDirectory();
    } catch {
      continue;
    }
    if (isDirectory) found.push(...frameLikeFiles(path, depth - 1));
    else if (/\.(png|bmp|ppm|rgb|rgba|raw|yuv|y4m)$/i.test(name)) found.push(path);
  }
  return found;
}

describe.skipIf(!available)('the MP4 export with the pinned FFmpeg (D29, P5)', () => {
  let chromium: LaunchedChromium;
  let reference: RenderResult;
  let full: ExportResult;
  let small: ExportResult;
  const watched: string[] = [];
  const watchedDirectories = [EXPORTS, tmpdir(), '/dev/shm'];

  beforeAll(async () => {
    chromium = await launchChromium();
    rmSync(EXPORTS, { recursive: true, force: true });
    mkdirSync(EXPORTS, { recursive: true });
    const before = new Set(watchedDirectories.flatMap((directory) => frameLikeFiles(directory)));
    const outputs = new Set<string>();
    const watch = setInterval(() => {
      for (const directory of watchedDirectories) {
        for (const file of frameLikeFiles(directory)) if (!before.has(file)) outputs.add(file);
      }
      for (const name of existsSync(EXPORTS) ? readdirSync(EXPORTS) : []) {
        // The MP4, and while it is made its encoded parts (D47.6): segments and the
        // audio intermediate, never a frame.
        if (
          !/^video-(1080p|720p)\.mp4(\.(segment-\d{6}\.mp4|audio\.wav))?(\.partial)?$/.test(name)
        ) {
          outputs.add(join(EXPORTS, name));
        }
      }
    }, 25);
    try {
      full = await exportMp4({
        document: variant(() => undefined).document,
        resolveAsset: referenceResolver,
        preset: '1080p',
        outputPath: join(EXPORTS, 'video-1080p.mp4'),
        ffmpeg: FFMPEG,
        chromium,
      });
      small = await exportMp4({
        document: variant(() => undefined).document,
        resolveAsset: referenceResolver,
        preset: '720p',
        outputPath: join(EXPORTS, 'video-720p.mp4'),
        ffmpeg: FFMPEG,
        chromium,
      });
    } finally {
      clearInterval(watch);
    }
    watched.push(...outputs);
    // The reference: the frame loop of D28 over the full grid, in a page of its own.
    reference = await renderFrames({
      document: variant(() => undefined).document,
      resolveAsset: referenceResolver,
      timesUs: full.manifest.frames.map(({ timeUs }) => timeUs),
      chromium,
    });
  }, 1_200_000);

  afterAll(async () => {
    await chromium.browser.close();
    writeReport('export-report.json', report);
  });

  it('records the network interfaces this host reports, not assumed ones (D28.9)', () => {
    expect(full.manifest.environment.network).toEqual(
      networkFacts(Object.keys(networkInterfaces())),
    );
  });

  it('writes no frame file while exporting, and leaves only the MP4 (§5 P5, D47.6)', () => {
    report.frameFiles = watched;
    expect(watched).toEqual([]);
    expect(readdirSync(EXPORTS).sort()).toEqual(['video-1080p.mp4', 'video-720p.mp4']);
  });

  it('pipes exactly the pre-encode frames of the Producer for every (composition, timeUs)', () => {
    // The FFmpeg the export verified and used (D29.1), for ci-identity.json.
    report.ffmpeg = full.manifest.ffmpeg;
    expect(full.manifest.frames).toHaveLength(300);
    full.manifest.frames.forEach((frame, index) => {
      expect(frame.index).toBe(index);
      // frameToTimeUs of D13 at 30 fps, written out: ⌊index × 1 000 000 / 30⌋.
      expect(frame.timeUs).toBe(Math.floor((index * 1_000_000) / 30));
    });
    expect(full.manifest.frames).toEqual(reference.manifest.frames);
  });

  it('pipes the golden frames at the golden timestamps, where the pinned goldens exist', () => {
    const goldens = readGoldens();
    report.goldens = goldens === null ? 'none' : goldens.manifest.environment.pinned;
    report.pinned = pinned;
    report.goldenFramesCompared = false;
    if (goldens === null || !goldens.manifest.environment.pinned || !pinned) return;
    for (const { timeUs, frame: index } of goldenTimestamps) {
      expect(full.manifest.frames[index]?.sha256, String(timeUs)).toBe(
        goldens.manifest.frames.find((frame) => frame.timeUs === timeUs)?.sha256,
      );
    }
    // Only a comparison that ran to the end counts: an early return above leaves it false.
    report.goldenFramesCompared = true;
  });

  it('exports 720p from the same source frames (D29.5)', () => {
    expect(small.manifest.frames).toEqual(full.manifest.frames);
  });

  it('keeps FRAMES_IN_FLIGHT and writes every frame once (D29.3)', () => {
    report.stats = { full: full.stats, small: small.stats };
    expect(full.stats.framesWritten).toBe(300);
    expect(full.stats.maxFramesInFlight).toBeGreaterThanOrEqual(1);
    expect(full.stats.maxFramesInFlight).toBeLessThanOrEqual(2);
  });

  it('is made of segments of 60 frames on the grid (D47.1)', () => {
    expect(full.manifest.segmentFrames).toBe(60);
    expect(
      full.manifest.segments.map(({ index, firstFrame, frameCount }) => [
        index,
        firstFrame,
        frameCount,
      ]),
    ).toEqual([0, 1, 2, 3, 4].map((index) => [index, index * 60, 60]));
    expect(full.manifest.range).toEqual({
      fromUs: 0,
      toUs: 10_000_000,
      firstFrame: 0,
      frameCount: 300,
    });
  });

  it.each([
    ['1080p', 1080, 1920],
    ['720p', 720, 1280],
  ] as const)('has the video stream of D29.4 in the %s export', async (preset, width, height) => {
    const file = join(EXPORTS, `video-${preset}.mp4`);
    const { streams, format } = await probe(file);
    (report.probe ??= {}) as Record<string, unknown>;
    (report.probe as Record<string, unknown>)[preset] = { streams, format };
    expect(format.format_name).toContain('mp4');
    expect(streams.map(({ codec_type: type }) => type)).toEqual(['video', 'audio']);
    const [video] = streams;
    expect(video).toMatchObject({
      codec_name: 'h264',
      profile: 'High',
      level: 40,
      width,
      height,
      pix_fmt: 'yuv420p',
      sample_aspect_ratio: '1:1',
      r_frame_rate: '30/1',
      avg_frame_rate: '30/1',
      time_base: '1/15360',
      nb_read_frames: '300',
      color_range: 'tv',
      color_space: 'bt709',
    });
    // Measured in the pinned container: this build writes the matrix and the range,
    // and ffprobe reports no primaries or transfer characteristics for the stream —
    // with or without +bitexact. The arguments still ask for BT.709 (D29.4), and the
    // manifest records them, so a change of intent is visible in review.
    report.colour = {
      space: video?.color_space ?? null,
      range: video?.color_range ?? null,
      primaries: video?.color_primaries ?? null,
      transfer: video?.color_transfer ?? null,
    };
    expect(full.manifest.ffmpeg.segmentArgs).toEqual(
      expect.arrayContaining(['-color_primaries', 'bt709', '-color_trc', 'bt709']),
    );
    expect(await videoTimestamps(file)).toEqual(Array.from({ length: 300 }, (_, i) => i * 512));
    expect(format.tags?.creation_time).toBeUndefined();
    expect(format.tags?.encoder).toBeUndefined();
  });

  it.each(['1080p', '720p'])('has the audio stream of D29.6 in the %s export', async (preset) => {
    const file = join(EXPORTS, `video-${preset}.mp4`);
    const { streams, format } = await probe(file);
    const audio = streams[1];
    expect(audio).toMatchObject({
      codec_name: 'aac',
      profile: 'LC',
      sample_rate: '48000',
      channels: 2,
      channel_layout: 'stereo',
      time_base: '1/48000',
    });
    // D29.6: the stream starts at 0 within one sample, and lasts 480 000 samples up to one AAC frame more.
    expect(Math.abs(audio?.start_pts ?? Number.NaN)).toBeLessThanOrEqual(1);
    expect(audio?.duration_ts).toBeGreaterThanOrEqual(480_000);
    expect(audio?.duration_ts).toBeLessThan(480_000 + 1024);
    // The whole file lasts the composition, within one AAC frame.
    expect(Number(format.duration)).toBeGreaterThanOrEqual(10);
    expect(Number(format.duration)).toBeLessThan(10 + 1024 / 48_000);
  });

  it('decodes the audio in sync with its source: no leading silence, in phase (D29.6)', async () => {
    const samples = await decodedAudio(join(EXPORTS, 'video-1080p.mp4'));
    expect(samples.length).toBeGreaterThanOrEqual(480_000);
    expect(samples.length).toBeLessThan(480_000 + 1024);
    const window = 4_800;
    let best = { lag: 0, error: Number.POSITIVE_INFINITY };
    for (let lag = -50; lag <= 50; lag += 1) {
      let error = 0;
      for (let index = 100; index < window; index += 1) {
        const delta = (samples[index] ?? 0) - source(index - lag);
        error += delta * delta;
      }
      if (error < best.error) best = { lag, error };
    }
    const leading = Array.from(samples.subarray(0, 480)).map(Math.abs);
    const leadingPeak = Math.max(...leading);
    report.audio = { decodedSamples: samples.length, lag: best.lag, leadingPeak };
    expect(leadingPeak).toBeGreaterThan(4_000);
    expect(Math.abs(best.lag)).toBeLessThanOrEqual(2);
  });

  it('reports the decoded video against the pre-encode frames, without asserting it (P5)', async () => {
    const indices = goldenTimestamps.map(({ frame }) => frame);
    const decoded = await decodedFrames(join(EXPORTS, 'video-1080p.mp4'), indices);
    const rows = indices.map((index, position) => {
      const png = reference.frames[index]?.png ?? new Uint8Array();
      const neighbours = [index - 1, index + 1]
        .filter((other) => other >= 0 && other < 300)
        .map((other) =>
          psnr(decoded[position] as Pixels, decodePng(reference.frames[other]?.png ?? png)),
        );
      return {
        index,
        psnr: psnr(decoded[position] as Pixels, decodePng(png)),
        neighbourPsnr: neighbours,
      };
    });
    report.decodedVideo = rows;
    console.info(`Decoded MP4 against pre-encode frames (report only): ${JSON.stringify(rows)}`);
    expect(rows).toHaveLength(indices.length);
  });

  it('refuses FFmpeg that is missing, found by name, or not the pinned build, before the first frame', async () => {
    const attempts = [
      ['ffmpeg-missing', { ffmpegPath: 'ffmpeg', ffprobePath: FFMPEG.ffprobePath }],
      ['ffmpeg-missing', { ffmpegPath: '/nonexistent/ffmpeg', ffprobePath: FFMPEG.ffprobePath }],
      ['ffmpeg-mismatch', { ffmpegPath: FFMPEG.ffprobePath, ffprobePath: FFMPEG.ffprobePath }],
    ] as const;
    for (const [code, ffmpeg] of attempts) {
      const output = join(EXPORTS, `refused-${code}.mp4`);
      await expect(
        exportMp4({
          document: variant(() => undefined).document,
          resolveAsset: referenceResolver,
          preset: '1080p',
          outputPath: output,
          ffmpeg,
          chromium,
        }),
      ).rejects.toMatchObject({ code });
      expect(existsSync(output)).toBe(false);
    }
  });

  it('refuses an audio asset shorter than its clip with the pinned ffprobe, before the first frame (D52.5)', async () => {
    const wav = generatedWav(48_000 * 5);
    const { document, resolveAsset } = variant(() => undefined, { 'asset-audio': wav });
    const output = join(EXPORTS, 'refused-audio.mp4');
    await expect(
      exportMp4({
        document,
        resolveAsset,
        preset: '1080p',
        outputPath: output,
        ffmpeg: FFMPEG,
        chromium,
      }),
    ).rejects.toMatchObject({ code: 'source-range-exceeded' });
    expect(existsSync(output)).toBe(false);
  });

  it('ends with custom-html-navigated when an element navigates at the last frame, and removes the output (D23.9, D29.7)', async () => {
    const { document } = variant((draft) => {
      const node = customHtmlNode(draft);
      node.html = (node.html ?? '').replace(
        "window.parent.postMessage({type:'kadrion:time-ack'",
        "if(data.requestId===299)setTimeout(function(){location.href='https://kadrion-nav.invalid/last'},0);window.parent.postMessage({type:'kadrion:time-ack'",
      );
    });
    expect(JSON.stringify(document)).toContain('kadrion-nav.invalid/last');
    const output = join(EXPORTS, 'refused-navigation.mp4');
    await expect(
      exportMp4({
        document,
        resolveAsset: referenceResolver,
        preset: '1080p',
        outputPath: output,
        ffmpeg: FFMPEG,
        chromium,
      }),
    ).rejects.toMatchObject({ code: 'custom-html-navigated' });
    expect(existsSync(output)).toBe(false);
  });

  describe.skipIf(!available)(
    'jobs of one render in separate processes, joined (D47, PR-25a)',
    () => {
      const JOBS = join(EXPORTS, 'jobs');
      const INPUTS = join(JOBS, 'inputs');
      const ffmpegFlags = ['--ffmpeg', FFMPEG.ffmpegPath, '--ffprobe', FFMPEG.ffprobePath];
      const inputs = [
        '--composition',
        join(INPUTS, 'composition.json'),
        '--assets',
        join(INPUTS, 'assets.json'),
      ];
      const onePass: Record<string, { file: string; manifest: ExportManifest }> = {};
      const joined: Record<string, { file: string; manifest: ExportManifest }> = {};
      /** The ranges of each preset's jobs, in the order they are run: never the grid's. */
      const RANGES = {
        '1080p': [
          [4_000_000, 10_000_000],
          [0, 2_000_000],
          [2_000_000, 4_000_000],
        ],
        '720p': [
          [6_000_000, 10_000_000],
          [0, 6_000_000],
        ],
      } as const;

      beforeAll(async () => {
        rmSync(JOBS, { recursive: true, force: true });
        mkdirSync(INPUTS, { recursive: true });
        writeFileSync(join(INPUTS, 'composition.json'), JSON.stringify(referenceComposition));
        const map: Record<string, { path: string; mediaType: string }> = {};
        for (const asset of generateReferenceAssets()) {
          writeFileSync(join(INPUTS, asset.id), asset.bytes);
          map[asset.id] = { path: asset.id, mediaType: asset.mediaType };
        }
        writeFileSync(join(INPUTS, 'assets.json'), JSON.stringify(map));
        for (const preset of ['1080p', '720p'] as const) {
          for (const [fromUs, toUs] of RANGES[preset]) {
            await job([
              'render-range',
              ...inputs,
              ...['--out', join(JOBS, preset, `range-${String(fromUs)}`)],
              ...['--preset', preset, '--from-us', String(fromUs), '--to-us', String(toUs)],
              ...ffmpegFlags,
            ]);
          }
          await job([
            'render-audio',
            ...inputs,
            '--out',
            join(JOBS, preset, 'audio'),
            ...ffmpegFlags,
          ]);
          const directories = readdirSync(join(JOBS, preset));
          await job([
            'join',
            ...directories.flatMap((name) => ['--in', join(JOBS, preset, name)]),
            ...['--out', join(JOBS, preset, 'joined')],
            ...ffmpegFlags,
          ]);
          const file = join(JOBS, preset, 'joined', `video-${preset}.mp4`);
          joined[preset] = {
            file,
            manifest: JSON.parse(
              readFileSync(
                join(JOBS, preset, 'joined', `video-${preset}.render-manifest.json`),
                'utf8',
              ),
            ) as ExportManifest,
          };
          // The one-pass export of the same preset, by the CLI as well.
          await job([
            'export',
            ...inputs,
            '--out',
            join(JOBS, preset, 'one-pass'),
            '--preset',
            preset,
            ...ffmpegFlags,
          ]);
          onePass[preset] = {
            file: join(JOBS, preset, 'one-pass', `video-${preset}.mp4`),
            manifest: JSON.parse(
              readFileSync(
                join(JOBS, preset, 'one-pass', `video-${preset}.render-manifest.json`),
                'utf8',
              ),
            ) as ExportManifest,
          };
        }
      }, 1_800_000);

      it.each(['1080p', '720p'] as const)(
        'joins the %s jobs into the one-pass export, byte for byte',
        (preset) => {
          const a = joined[preset];
          const b = onePass[preset];
          if (a === undefined || b === undefined) throw new Error('The jobs did not run.');
          const segments = report.segments as Record<string, unknown> | undefined;
          report.segments = {
            ...segments,
            [preset]: {
              ranges: RANGES[preset],
              joined: fileHash(a.file),
              onePass: fileHash(b.file),
              segments: a.manifest.segments,
            },
          };
          expect(fileHash(a.file)).toBe(fileHash(b.file));
          expect(a.manifest).toEqual(b.manifest);
        },
      );

      it('reads the same PNG frames in the joined render and the one-pass export (D29.3, D47.6)', () => {
        expect(joined['1080p']?.manifest.frames).toEqual(full.manifest.frames);
        expect(joined['720p']?.manifest.frames).toEqual(full.manifest.frames);
      });

      it('passes the self-check of D29.3 on the joined file', async () => {
        const file = joined['1080p']?.file ?? '';
        expect(await videoTimestamps(file)).toEqual(Array.from({ length: 300 }, (_, i) => i * 512));
        const { streams } = await probe(file);
        expect(streams.map(({ codec_type: type }) => type)).toEqual(['video', 'audio']);
        expect(streams[0]?.nb_read_frames).toBe('300');
      });

      it('refuses a range off the segment grid before rendering, and writes nothing', async () => {
        const directory = join(JOBS, 'refused');
        mkdirSync(directory, { recursive: true });
        await expect(
          renderSegments({
            document: referenceComposition,
            resolveAsset: referenceResolver,
            preset: '1080p',
            range: { fromUs: 1_000_000, toUs: 4_000_000 },
            outputDirectory: directory,
            ffmpeg: FFMPEG,
            chromium,
          }),
        ).rejects.toMatchObject({ code: 'range-invalid' });
        expect(readdirSync(directory)).toEqual([]);
      });
    },
  );

  describe.skipIf(!available)('still frames (D47.7)', () => {
    it('renders the golden frame of its time as PNG, where the pinned goldens exist', async () => {
      const goldens = readGoldens();
      const rows: Record<string, unknown>[] = [];
      for (const { timeUs } of goldenTimestamps) {
        const still = await renderStill({
          document: referenceComposition,
          resolveAsset: referenceResolver,
          timeUs,
          format: 'png',
          chromium,
        });
        const golden = goldens?.manifest.frames.find((frame) => frame.timeUs === timeUs)?.sha256;
        rows.push({ timeUs, sha256: still.manifest.output.sha256, golden: golden ?? null });
        expect(still.manifest.output.sha256).toBe(still.manifest.frames[0]?.sha256);
        if (goldens !== null && goldens.manifest.environment.pinned && pinned) {
          expect(still.manifest.output.sha256, String(timeUs)).toBe(golden);
        }
      }
      report.stills = rows;
    });

    it.each(['jpeg', 'webp'] as const)(
      'encodes the same %s twice, from the same PNG',
      async (format) => {
        const render = () =>
          renderStill({
            document: referenceComposition,
            resolveAsset: referenceResolver,
            timeUs: 2_500_000,
            format,
            ffmpeg: FFMPEG,
            chromium,
          });
        const [a, b] = [await render(), await render()];
        expect(sha256(a.bytes)).toBe(sha256(b.bytes));
        expect(a.manifest.frames).toEqual(b.manifest.frames);
        expect(a.mediaType).toBe(format === 'jpeg' ? 'image/jpeg' : 'image/webp');
        const { streams } = await probeBytes(a.bytes, format);
        expect(streams[0]).toMatchObject({ width: 1080, height: 1920 });
      },
    );
  });
});

/** The CLI of this working tree, run as its own process: one job of a host's queue. */
const CLI = join(repoRoot, 'packages', 'cli', 'dist', 'bin.js');

async function job(args: readonly string[]): Promise<string> {
  const { stdout } = await run(process.execPath, [CLI, ...args], {
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

function fileHash(path: string): string {
  return sha256(readFileSync(path));
}

async function probeBytes(bytes: Uint8Array, format: string): Promise<Probe> {
  const file = join(EXPORTS, `still-probe.${format}`);
  writeFileSync(file, bytes);
  try {
    return await probe(file);
  } finally {
    rmSync(file, { force: true });
  }
}

/** A CLI job as a host's queue runs it: its own process, read line by line, stopped by a signal (D48). */
interface RunningJob {
  readonly lines: Record<string, unknown>[];
  readonly stderr: string[];
  /** Resolves with the exit code, or rejects on a line of standard output that is not JSON. */
  readonly exited: Promise<number | null>;
  readonly kill: (signal: NodeJS.Signals) => void;
  /** Resolves once a line matches. */
  readonly when: (match: (line: Record<string, unknown>) => boolean) => Promise<void>;
}

/** Marks every process a job starts, Chromium and FFmpeg included, by their environment. */
const JOB_MARK = 'KADRION_PINNED_JOB_MARK';

function startJob(args: readonly string[], mark: string): RunningJob {
  const child = spawn(process.execPath, [CLI, ...args], {
    env: { ...process.env, [JOB_MARK]: mark },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lines: Record<string, unknown>[] = [];
  const stderr: string[] = [];
  const waiting: { match: (line: Record<string, unknown>) => boolean; done: () => void }[] = [];
  let malformed: string | null = null;
  createInterface({ input: child.stdout }).on('line', (text) => {
    try {
      const line = JSON.parse(text) as Record<string, unknown>;
      lines.push(line);
      for (const entry of waiting.splice(0)) {
        if (entry.match(line)) entry.done();
        else waiting.push(entry);
      }
    } catch {
      malformed ??= text;
    }
  });
  createInterface({ input: child.stderr }).on('line', (text) => stderr.push(text));
  const exited = new Promise<number | null>((resolve, reject) => {
    child.on('close', (code) => {
      if (malformed !== null) reject(new Error(`Not a JSON line on stdout: ${malformed}`));
      else resolve(code);
    });
  });
  return {
    lines,
    stderr,
    exited,
    kill: (signal) => child.kill(signal),
    when: (match) =>
      new Promise((resolve) => {
        if (lines.some(match)) resolve();
        else waiting.push({ match, done: resolve });
      }),
  };
}

/** The processes that still carry a job's mark: none may outlive a cancelled job. */
function marked(mark: string): string[] {
  const found: string[] = [];
  for (const pid of readdirSync('/proc')) {
    if (!/^\d+$/.test(pid)) continue;
    try {
      if (readFileSync(`/proc/${pid}/environ`, 'latin1').includes(`${JOB_MARK}=${mark}`)) {
        found.push(readFileSync(`/proc/${pid}/comm`, 'utf8').trim());
      }
    } catch {
      // The process ended between listing and reading, or belongs to another user.
    }
  }
  return found;
}

describe.skipIf(!available)('a render job of the CLI in its own process (D48)', () => {
  const JOBS = join(EXPORTS, 'contract');
  const INPUTS = join(JOBS, 'inputs');
  const inputs = [
    '--composition',
    join(INPUTS, 'composition.json'),
    '--assets',
    join(INPUTS, 'assets.json'),
  ];
  const ffmpegFlags = ['--ffmpeg', FFMPEG.ffmpegPath, '--ffprobe', FFMPEG.ffprobePath];
  const rows: Record<string, unknown>[] = [];

  beforeAll(() => {
    rmSync(JOBS, { recursive: true, force: true });
    mkdirSync(INPUTS, { recursive: true });
    writeFileSync(join(INPUTS, 'composition.json'), JSON.stringify(referenceComposition));
    const map: Record<string, { path: string; mediaType: string }> = {};
    for (const asset of generateReferenceAssets()) {
      writeFileSync(join(INPUTS, asset.id), asset.bytes);
      map[asset.id] = { path: asset.id, mediaType: asset.mediaType };
    }
    writeFileSync(join(INPUTS, 'assets.json'), JSON.stringify(map));
  });

  afterAll(() => {
    // Report only: how long the jobs took to stop, and the estimate (D48.2, D48.5).
    console.info(`Job contract (report only): ${JSON.stringify(rows)}`);
  });

  it('reports every frame and segment of a range as JSON lines, then its files and its end', async () => {
    const out = join(JOBS, 'range');
    const job = startJob(
      [
        'render-range',
        ...inputs,
        ...['--out', out, '--preset', '720p', '--from-us', '0', '--to-us', '4000000'],
        ...ffmpegFlags,
      ],
      'range',
    );
    await expect(job.exited).resolves.toBe(0);
    expect(job.lines[0]).toEqual({ event: 'start', frames: 120, segments: 2 });
    const frames = job.lines.filter(({ event }) => event === 'frame');
    expect(frames.map(({ frame, done }) => [frame, done])).toEqual(
      Array.from({ length: 120 }, (_, i) => [i, i + 1]),
    );
    expect(job.lines.filter(({ event }) => event === 'segment')).toEqual([
      { event: 'segment', segment: 0, done: 1, segments: 2 },
      { event: 'segment', segment: 1, done: 2, segments: 2 },
    ]);
    expect(job.lines.slice(-4)).toEqual([
      { event: 'file', file: 'segment-000000.mp4' },
      { event: 'file', file: 'segment-000001.mp4' },
      { event: 'file', file: 'segments-000000-000001.manifest.json' },
      { event: 'done', manifest: 'segments-000000-000001.manifest.json' },
    ]);
    expect(readdirSync(out).sort()).toEqual([
      'segment-000000.mp4',
      'segment-000001.mp4',
      'segments-000000-000001.manifest.json',
    ]);
  });

  it.each(['SIGTERM', 'SIGINT'] as const)(
    'stops a job on %s within the grace time: Chromium and FFmpeg end, and no file remains',
    async (signal) => {
      const out = join(JOBS, `cancelled-${signal}`);
      const mark = `cancel-${signal}`;
      const job = startJob(
        ['render-range', ...inputs, ...['--out', out, '--preset', '1080p'], ...ffmpegFlags],
        mark,
      );
      // Inside segment 1, after segment 0 was written under its final name.
      await job.when(({ event, frame }) => event === 'frame' && frame === 75);
      const running = marked(mark);
      const sent = performance.now();
      job.kill(signal);
      const code = await job.exited;
      const stoppedMs = Math.round(performance.now() - sent);
      rows.push({ signal, stoppedMs, running });
      expect(code).toBe(EXIT_CANCELLED);
      expect(stoppedMs).toBeLessThan(CANCEL_GRACE_MS);
      expect(job.lines.some(({ event, segment }) => event === 'segment' && segment === 0)).toBe(
        true,
      );
      expect(job.lines.at(-1)).toEqual({
        event: 'error',
        code: 'cancelled',
        exitCode: EXIT_CANCELLED,
      });
      expect(job.stderr.join('\n')).toMatch(/error cancelled/);
      // The browser and the encoder were running, and none of them outlived the job.
      expect(running).toEqual(expect.arrayContaining(['ffmpeg']));
      expect(running.some((name) => /chrom/i.test(name))).toBe(true);
      expect(marked(mark)).toEqual([]);
      expect(readdirSync(out)).toEqual([]);
    },
  );

  it('ends a job at its wall time with limit-exceeded and exit code 4', async () => {
    const out = join(JOBS, 'wall');
    const job = startJob(
      [
        'render-range',
        ...inputs,
        ...['--out', out, '--preset', '1080p', '--max-wall-ms', '4000'],
        ...ffmpegFlags,
      ],
      'wall',
    );
    await expect(job.exited).resolves.toBe(EXIT_LIMIT_EXCEEDED);
    expect(job.lines.at(-1)).toEqual({
      event: 'error',
      code: 'limit-exceeded',
      exitCode: EXIT_LIMIT_EXCEEDED,
    });
    expect(marked('wall')).toEqual([]);
    expect(readdirSync(out)).toEqual([]);
  });

  it('refuses a job over a limit before Chromium or FFmpeg starts', async () => {
    const job = startJob(
      [
        'render-range',
        ...inputs,
        ...['--out', join(JOBS, 'limit'), '--preset', '1080p', '--max-frames', '299'],
        ...ffmpegFlags,
      ],
      'limit',
    );
    await expect(job.exited).resolves.toBe(EXIT_LIMIT_EXCEEDED);
    expect(job.lines).toEqual([
      { event: 'error', code: 'limit-exceeded', exitCode: EXIT_LIMIT_EXCEEDED },
    ]);
  });

  it('estimates the time per frame from one sampled segment, and keeps none of it', async () => {
    const job = startJob(
      [
        'estimate',
        ...inputs,
        ...['--preset', '1080p', '--samples', '10', '--budget-ms', '600000'],
        ...ffmpegFlags,
      ],
      'estimate',
    );
    await expect(job.exited).resolves.toBe(0);
    const [estimate, end] = job.lines.slice(-2);
    rows.push({ estimate });
    expect(end).toEqual({ event: 'done', manifest: null });
    expect(estimate).toMatchObject({
      event: 'estimate',
      samples: 10,
      segmentFrames: 60,
      segments: 5,
    });
    expect(estimate?.msPerFrame).toBeGreaterThan(0);
    expect(estimate?.segmentsInBudget).toBeGreaterThanOrEqual(1);
    expect(job.lines.filter(({ event }) => event === 'frame')).toHaveLength(10);
  });
});

describe.skipIf(!available)(
  'memory of the export with the pinned FFmpeg (D29.3, report only)',
  () => {
    it(
      'reports the peak memory of Node.js and FFmpeg for 60 and 300 frames',
      { timeout: 600_000 },
      async () => {
        const chromium = await launchChromium();
        const rows: Record<string, unknown>[] = [];
        try {
          for (const frames of [60, 300]) {
            const { document } = variant((draft) => {
              (draft as unknown as { durationUs: number }).durationUs = (frames * 1_000_000) / 30;
              const [clip] = (draft as unknown as { clips: { durationUs: number }[] }).clips;
              if (clip !== undefined) clip.durationUs = (frames * 1_000_000) / 30;
            });
            let nodePeak = 0;
            let ffmpegPeakKb = 0;
            const sample = setInterval(() => {
              globalThis.gc?.();
              const { heapUsed, arrayBuffers } = process.memoryUsage();
              nodePeak = Math.max(nodePeak, heapUsed + arrayBuffers);
              for (const pid of existsSync('/proc') ? readdirSync('/proc') : []) {
                if (!/^\d+$/.test(pid)) continue;
                try {
                  const status = readFileSync(`/proc/${pid}/status`, 'utf8');
                  if (!/^Name:\s+ffmpeg$/m.test(status)) continue;
                  const rss = Number(/^VmHWM:\s+(\d+) kB$/m.exec(status)?.[1] ?? 0);
                  ffmpegPeakKb = Math.max(ffmpegPeakKb, rss);
                } catch {
                  // The process ended between listing and reading.
                }
              }
            }, 50);
            try {
              const result = await exportMp4({
                document,
                resolveAsset: referenceResolver,
                preset: '1080p',
                outputPath: join(EXPORTS, `memory-${String(frames)}.mp4`),
                ffmpeg: FFMPEG,
                chromium,
              });
              rows.push({ frames, nodePeakBytes: nodePeak, ffmpegPeakKb, stats: result.stats });
            } finally {
              clearInterval(sample);
              rmSync(join(EXPORTS, `memory-${String(frames)}.mp4`), { force: true });
            }
          }
        } finally {
          await chromium.browser.close();
        }
        writeReport('export-memory.json', rows);
        console.info(`Export memory (report only): ${JSON.stringify(rows)}`);
        expect(rows).toHaveLength(2);
      },
    );
  },
);

/** A WAV of `samples` silent samples at 48 kHz, mono, 16-bit. */
function generatedWav(samples: number): Uint8Array {
  const data = samples * 2;
  const bytes = new Uint8Array(44 + data);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1)
      bytes[offset + index] = text.charCodeAt(index);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + data, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 48_000, true);
  view.setUint32(28, 96_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, data, true);
  return bytes;
}

/**
 * Frames rendered under load (D86.4): a film with one video node over the
 * whole frame and the reference composition with its Custom HTML element are
 * exported by four CLI processes at once, two of each, with the default
 * timeouts, and every frame's hash must equal the hash of the same frame
 * exported by one process alone. Before D86 the capture could hold the frame
 * before, while the page already showed the right one. The number of
 * processors and the times are reported. Since D88 the report also holds the
 * SHA-256 of every segment and of every MP4 (D88.4: the fast capture keeps the
 * file of `main`, alone and under load), and the MP4 of every export under load
 * must equal the one alone. Skipped without `KADRION_FFMPEG` and
 * `KADRION_FFPROBE`; required where the run is pinned.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { PINNED_IMAGE, PINNED_IMAGE_VARIABLE, type ExportManifest } from '@kadrion/producer';
import {
  generateReferenceAssets,
  referenceComposition,
  videoComposition,
} from '@kadrion/test-fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { HEIGHT, OUTPUT_DIRECTORY, repoRoot, WIDTH, writeReport } from './support.js';

const run = promisify(execFile);
const ffmpegPath = process.env.KADRION_FFMPEG;
const ffprobePath = process.env.KADRION_FFPROBE;
const available = ffmpegPath !== undefined && ffprobePath !== undefined;
const pinned = process.env[PINNED_IMAGE_VARIABLE] === PINNED_IMAGE;
const CLI = join(repoRoot, 'packages', 'cli', 'dist', 'bin.js');
const LOAD = join(OUTPUT_DIRECTORY, 'load');
const DURATION_US = 10_000_000;

/** A video that changes every frame, as large as the composition, made by the pinned FFmpeg. */
function clipArguments(output: string): readonly string[] {
  return [
    ...['-nostdin', '-v', 'error', '-y', '-f', 'lavfi'],
    ...['-i', `testsrc2=size=${String(WIDTH)}x${String(HEIGHT)}:rate=30:duration=10`],
    ...['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-g', '30'],
    ...['-pix_fmt', 'yuv420p', '-threads', '1', output],
  ];
}

interface VideoNode {
  readonly type: string;
  readonly [key: string]: unknown;
}

/**
 * The video composition of D50.8 at the size and length of the reference
 * composition, with only its background and one video node over the whole
 * frame, whose asset is the clip above.
 */
function clipComposition(contentHash: string): unknown {
  const document = structuredClone(videoComposition) as {
    width: number;
    height: number;
    durationUs: number;
    assets: unknown[];
    scenes: { durationUs: number; nodes: VideoNode[] }[];
  };
  const [scene] = document.scenes;
  if (scene === undefined) throw new Error('The video composition has no scene.');
  const background = scene.nodes.find(({ type }) => type === 'background');
  const video = scene.nodes.find(({ type }) => type === 'video');
  if (background === undefined || video === undefined) {
    throw new Error('The video composition has no background or no video node.');
  }
  document.width = WIDTH;
  document.height = HEIGHT;
  document.durationUs = DURATION_US;
  document.assets = [{ id: 'asset-clip', type: 'video', contentHash }];
  document.scenes = [
    {
      ...scene,
      durationUs: DURATION_US,
      nodes: [
        { ...background, durationUs: DURATION_US },
        {
          ...video,
          id: 'node-clip',
          durationUs: DURATION_US,
          assetId: 'asset-clip',
          width: WIDTH,
          height: HEIGHT,
        },
      ],
    },
  ];
  return document;
}

interface Inputs {
  readonly name: string;
  readonly composition: string;
  readonly assets: string;
}

interface Export {
  readonly frames: ExportManifest['frames'];
  readonly seconds: number;
  /** The SHA-256 of the MP4 and of its segments (D88.4). */
  readonly mp4: string;
  readonly segments: readonly string[];
}

async function exported(inputs: Inputs, out: string): Promise<Export> {
  const started = performance.now();
  await run(
    process.execPath,
    [
      CLI,
      'export',
      ...['--composition', inputs.composition, '--assets', inputs.assets],
      ...['--out', out, '--preset', '1080p'],
      ...['--ffmpeg', ffmpegPath ?? '', '--ffprobe', ffprobePath ?? ''],
    ],
    { env: process.env, maxBuffer: 16 * 1024 * 1024 },
  );
  const manifest = JSON.parse(
    readFileSync(join(out, 'video-1080p.render-manifest.json'), 'utf8'),
  ) as ExportManifest;
  return {
    frames: manifest.frames,
    seconds: (performance.now() - started) / 1000,
    mp4: `sha256:${createHash('sha256')
      .update(readFileSync(join(out, 'video-1080p.mp4')))
      .digest('hex')}`,
    segments: manifest.segments.map(({ sha256 }) => sha256),
  };
}

/** The indices of the frames whose hash differs from the frame alone, and which of them repeat the frame before. */
function compared(alone: Export, loaded: Export): { differing: number[]; repeated: number[] } {
  const differing: number[] = [];
  const repeated: number[] = [];
  alone.frames.forEach((frame, index) => {
    const other = loaded.frames[index];
    if (other?.timeUs !== frame.timeUs || other.sha256 !== frame.sha256) {
      differing.push(index);
      if (index > 0 && other?.sha256 === alone.frames[index - 1]?.sha256) repeated.push(index);
    }
  });
  return { differing, repeated };
}

describe('the pinned FFmpeg under load (D86.4)', () => {
  it('is given wherever the run is pinned, and its absence is stated elsewhere', () => {
    if (pinned) expect(available).toBe(true);
    if (!available) {
      console.info(
        'The test under load is skipped: KADRION_FFMPEG and KADRION_FFPROBE are not set. Frames under load are not proven by this run.',
      );
    }
  });
});

describe.skipIf(!available)('frames exported under load (D86)', () => {
  const inputs: Inputs[] = [];
  const alone = new Map<string, Export>();
  const loaded: { name: string; result: Export }[] = [];
  const report: Record<string, unknown> = { processors: availableParallelism() };

  beforeAll(async () => {
    rmSync(LOAD, { recursive: true, force: true });
    mkdirSync(LOAD, { recursive: true });

    const clip = join(LOAD, 'clip.mp4');
    await run(ffmpegPath ?? '', [...clipArguments(clip)]);
    const hash = `sha256:${createHash('sha256').update(readFileSync(clip)).digest('hex')}`;
    writeFileSync(join(LOAD, 'clip.json'), JSON.stringify(clipComposition(hash)));
    writeFileSync(
      join(LOAD, 'clip.assets.json'),
      JSON.stringify({ 'asset-clip': { path: 'clip.mp4', mediaType: 'video/mp4' } }),
    );
    inputs.push({
      name: 'clip',
      composition: join(LOAD, 'clip.json'),
      assets: join(LOAD, 'clip.assets.json'),
    });

    const map: Record<string, { path: string; mediaType: string }> = {};
    for (const asset of generateReferenceAssets()) {
      writeFileSync(join(LOAD, asset.id), asset.bytes);
      map[asset.id] = { path: asset.id, mediaType: asset.mediaType };
    }
    writeFileSync(join(LOAD, 'reference.json'), JSON.stringify(referenceComposition));
    writeFileSync(join(LOAD, 'reference.assets.json'), JSON.stringify(map));
    inputs.push({
      name: 'reference',
      composition: join(LOAD, 'reference.json'),
      assets: join(LOAD, 'reference.assets.json'),
    });

    // One process alone for each composition, one after the other.
    for (const entry of inputs) {
      alone.set(entry.name, await exported(entry, join(LOAD, `${entry.name}-alone`)));
    }
    // Then four processes at once, two for each composition.
    const jobs = [...inputs, ...inputs].map((entry, index) =>
      exported(entry, join(LOAD, `${entry.name}-loaded-${String(index)}`)).then((result) => ({
        name: entry.name,
        result,
      })),
    );
    loaded.push(...(await Promise.all(jobs)));
  }, 1_800_000);

  afterAll(() => {
    writeReport('load-report.json', report);
    rmSync(LOAD, { recursive: true, force: true });
  });

  it('writes every frame of four exports at once as one export alone writes it', () => {
    const results = loaded.map(({ name, result }) => {
      const reference = alone.get(name);
      if (reference === undefined) throw new Error(`No export alone of ${name}.`);
      return {
        name,
        seconds: result.seconds,
        mp4: result.mp4,
        sameMp4: result.mp4 === reference.mp4,
        ...compared(reference, result),
      };
    });
    report.alone = Object.fromEntries(
      [...alone].map(([name, { frames, seconds, mp4, segments }]) => [
        name,
        { frames: frames.length, seconds, mp4, segments },
      ]),
    );
    report.loaded = results;
    for (const [name, { frames }] of alone) expect(frames.length, name).toBe(300);
    expect(results.map(({ name, differing, sameMp4 }) => ({ name, differing, sameMp4 }))).toEqual(
      results.map(({ name }) => ({ name, differing: [], sameMp4: true })),
    );
  });
});

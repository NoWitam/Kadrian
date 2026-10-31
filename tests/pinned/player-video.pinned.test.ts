/**
 * Video in the Player (D51) in Chromium, with the fixture video the pinned
 * FFmpeg makes: the Player reads the media facts the Producer's ffprobe reads,
 * decodes in the host window, converts YUV to RGB as the Producer's FFmpeg
 * does, and so shows at every golden timestamp of the video composition the
 * frame the Producer renders in the same run, to the pixel. Frames do not
 * depend on the order of seeks or on how the video was delivered, and every
 * problem of a video is typed before the first frame. Skipped without
 * `KADRION_FFMPEG` and `KADRION_FFPROBE`; required where the run is pinned.
 */
import {
  launchChromium,
  PINNED_IMAGE,
  PINNED_IMAGE_VARIABLE,
  renderFrames,
  type LaunchedChromium,
  type RenderResult,
} from '@kadrion/producer';
import type { AssetResolver } from '@kadrion/renderer-dom';
import {
  generateReferenceAssets,
  VIDEO_FIXTURE,
  videoComposition,
  videoGoldenTimestamps,
} from '@kadrion/test-fixtures';
import { timeUsToFrame, validateComposition } from '@kadrion/schema';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  compareFrame,
  decodePng,
  distManifest,
  goldenManifestPath,
  measure,
  parityMode,
  parityRecord,
  recordProblems,
  sha256,
  type GoldenManifest,
  type ParityRow,
} from '../parity/parity.js';

import {
  closeConformanceHost,
  openConformanceHost,
  playerState,
  preparedFacts,
  seekAndCapture,
  type ConformanceHost,
} from './conformance-host.js';
import {
  GOLDEN_DIRECTORY,
  OUTPUT_DIRECTORY,
  pinnedRun,
  repoRoot,
  writeReport,
  type Draft,
} from './support.js';
import { makeVideoFixture } from './video-fixture.ts';

const ffmpegPath = process.env.KADRION_FFMPEG;
const ffprobePath = process.env.KADRION_FFPROBE;
const available = ffmpegPath !== undefined && ffprobePath !== undefined;
const pinned = process.env[PINNED_IMAGE_VARIABLE] === PINNED_IMAGE;
const TIMES = videoGoldenTimestamps.map(({ timeUs }) => timeUs);
const TEXT = JSON.stringify(videoComposition);
const RECORD = join('video-parity', 'video-parity-measurement.json');
const FAILED_RECORD = join('video-parity', 'video-parity-measurement.failed.json');
const VIDEO_MANIFEST = join(repoRoot, goldenManifestPath('video'));
const validatedVideo = validateComposition(videoComposition);
if (!validatedVideo.ok) throw new Error('The video composition is not valid.');
const { width: WIDTH, height: HEIGHT, fps: FPS } = validatedVideo.composition;

interface HostWindow {
  readonly conformance: {
    load(
      text: string,
      assets: readonly { id: string; mediaType: string; base64: string }[],
      blob: boolean,
    ): Promise<void>;
  };
}

describe('the pinned FFmpeg for video in the Player (D51)', () => {
  it('is given wherever the run is pinned, and its absence is stated elsewhere', () => {
    if (pinned) expect(available).toBe(true);
    if (!available) {
      console.info(
        'The Player video tests are skipped: KADRION_FFMPEG and KADRION_FFPROBE are not set.',
      );
    }
  });
});

describe.skipIf(!available)('video in the Player (D51)', () => {
  let chromium: LaunchedChromium;
  let video: Uint8Array;
  let assets: { id: string; mediaType: string; bytes: Uint8Array }[];
  let producer: RenderResult;
  let host: ConformanceHost;

  const edited = (edit: (draft: Draft) => void): string => {
    const draft = structuredClone(videoComposition) as Draft;
    edit(draft);
    return JSON.stringify(draft);
  };

  /** Loads a document into an open host and returns the Player's error code, or `null`. */
  const loadCode = async (
    target: ConformanceHost,
    text: string,
    given: readonly { id: string; mediaType: string; bytes: Uint8Array }[],
  ): Promise<string | null> => {
    await target.page
      .evaluate(
        ([documentText, sent]) =>
          (window as unknown as HostWindow).conformance.load(documentText, sent, false),
        [
          text,
          given.map(({ id, mediaType, bytes }) => ({
            id,
            mediaType,
            base64: Buffer.from(bytes).toString('base64'),
          })),
        ] as const,
      )
      .catch(() => undefined);
    return (await playerState(target)).error;
  };

  beforeAll(async () => {
    chromium = await launchChromium();
    video = await makeVideoFixture(ffmpegPath ?? '');
    assets = [
      ...generateReferenceAssets(),
      { id: VIDEO_FIXTURE.id, mediaType: VIDEO_FIXTURE.mediaType, bytes: video },
    ];
    const resolveAsset: AssetResolver = ({ id }) => assets.find((asset) => asset.id === id) ?? null;
    producer = await renderFrames({
      document: videoComposition,
      resolveAsset,
      timesUs: TIMES,
      chromium,
      ffmpeg: { ffmpegPath: ffmpegPath ?? '', ffprobePath: ffprobePath ?? '' },
    });
    host = await openConformanceHost(chromium, TEXT, assets);
  });

  afterAll(async () => {
    await closeConformanceHost(host);
    await chromium.browser.close();
  });

  it("reads the media facts the Producer's ffprobe reads (D49.6, D51.3)", async () => {
    expect(await preparedFacts(host, VIDEO_FIXTURE.id, VIDEO_FIXTURE.contentHash)).toEqual({
      type: 'video',
      durationUs: VIDEO_FIXTURE.sourceDurationUs,
      width: VIDEO_FIXTURE.width,
      height: VIDEO_FIXTURE.height,
      frames: VIDEO_FIXTURE.frames,
    });
    const source = producer.manifest.video?.sources[0];
    expect(source).toMatchObject({
      sourceDurationUs: VIDEO_FIXTURE.sourceDurationUs,
      frames: VIDEO_FIXTURE.frames,
    });
  });

  it('shows the frame the Producer renders in this run at every golden timestamp, to the pixel (D28.5, D51.4)', async () => {
    for (const timeUs of TIMES) {
      const shown = await seekAndCapture(host, timeUs, null);
      const reference = producer.frames.find((frame) => frame.timeUs === timeUs)?.png;
      if (reference === undefined) throw new Error(`No Producer frame of ${String(timeUs)}.`);
      expect(shown.runtimeHash).toBe(producer.manifest.runtime.contentHash);
      const metric = measure(decodePng(shown.png), decodePng(reference));
      expect(metric.differingPixels, String(timeUs)).toBe(0);
    }
  });

  it('shows the same pixels in any order of seeks, and for a video delivered as a Blob (D51.2)', async () => {
    const first = new Map<number, Uint8Array>();
    for (const timeUs of TIMES) first.set(timeUs, (await seekAndCapture(host, timeUs, null)).png);
    const other = await openConformanceHost(chromium, TEXT, assets, { videoAsBlob: true });
    try {
      for (const timeUs of [...TIMES].reverse()) {
        const shown = await seekAndCapture(other, timeUs, null);
        expect(
          measure(decodePng(shown.png), decodePng(first.get(timeUs) ?? new Uint8Array()))
            .differingPixels,
          String(timeUs),
        ).toBe(0);
      }
      // Again, after a frame far away: nothing depends on what was shown before.
      await seekAndCapture(other, TIMES.at(-1) ?? 0, null);
      const again = await seekAndCapture(other, 500_000, null);
      expect(
        measure(decodePng(again.png), decodePng(first.get(500_000) ?? new Uint8Array()))
          .differingPixels,
      ).toBe(0);
    } finally {
      await closeConformanceHost(other);
    }
  });

  it('types every problem of a video before the first frame (D49.6, D51)', async () => {
    const target = await openConformanceHost(chromium, TEXT, assets);
    try {
      const tooLong = edited((draft) => {
        const cover = draft.scenes[0]?.nodes.find((node) => node.id === 'node-video-cover');
        if (cover === undefined) throw new Error('No cover node.');
        (cover as unknown as { sourceStartUs: number }).sourceStartUs = 1_500_000;
      });
      expect(await loadCode(target, tooLong, assets)).toBe('source-range-exceeded');
      const tampered = video.slice();
      tampered[tampered.length - 1] = (tampered.at(-1) ?? 0) ^ 1;
      expect(
        await loadCode(
          target,
          TEXT,
          assets.map((asset) =>
            asset.id === VIDEO_FIXTURE.id ? { ...asset, bytes: tampered } : asset,
          ),
        ),
      ).toBe('asset-hash-mismatch');
      // A file the Player does not read: the reference image, declared as the video.
      const image = assets.find((asset) => asset.id === 'asset-image');
      if (image === undefined) throw new Error('No image asset.');
      const notVideo = edited((draft) => {
        const asset = draft.assets.find((candidate) => candidate.id === VIDEO_FIXTURE.id);
        if (asset === undefined) throw new Error('No video asset.');
        asset.contentHash =
          draft.assets.find((candidate) => candidate.id === 'asset-image')?.contentHash ?? '';
      });
      expect(
        await loadCode(
          target,
          notVideo,
          assets.map((asset) =>
            asset.id === VIDEO_FIXTURE.id ? { ...asset, bytes: image.bytes } : asset,
          ),
        ),
      ).toBe('video-unsupported');
    } finally {
      await closeConformanceHost(target);
    }
  });

  it('measures parity against the committed video golden frames, gated in the pinned environment (D33, D34, D51.6)', async () => {
    rmSync(join(OUTPUT_DIRECTORY, RECORD), { force: true });
    rmSync(join(OUTPUT_DIRECTORY, FAILED_RECORD), { force: true });
    const manifestBytes = readFileSync(VIDEO_MANIFEST);
    const manifest = JSON.parse(manifestBytes.toString('utf8')) as GoldenManifest;
    const rows: ParityRow[] = [];
    for (const timeUs of TIMES) {
      const entry = manifest.frames.find((frame) => frame.timeUs === timeUs);
      if (entry === undefined) throw new Error(`No video golden frame of ${String(timeUs)}.`);
      const shown = await seekAndCapture(host, timeUs, null);
      rows.push(
        compareFrame(
          { width: WIDTH, height: HEIGHT, frameIndex: timeUsToFrame(timeUs, FPS) },
          { ...shown, compositionHash: host.compositionHash },
          {
            png: new Uint8Array(readFileSync(join(GOLDEN_DIRECTORY, entry.file))),
            file: entry.file,
            timeUs: entry.timeUs,
            index: entry.index,
            sha256: entry.sha256,
            runtimeHash: manifest.render.runtime.contentHash,
            compositionHash: manifest.render.compositionHash,
            prefix: 'video',
          },
        ),
      );
    }
    const environment = pinnedRun(chromium);
    const gate =
      parityMode(
        process.env[PINNED_IMAGE_VARIABLE],
        PINNED_IMAGE,
        environment,
        manifest.environment,
      ) === 'gate';
    const record = parityRecord(
      environment,
      {
        goldenManifest: goldenManifestPath('video'),
        goldenManifestSha256: sha256(manifestBytes),
        runtimeHash: manifest.render.runtime.contentHash,
        compositionHash: manifest.render.compositionHash,
        width: WIDTH,
        height: HEIGHT,
      },
      rows,
      { gate, playerDist: distManifest(host.servedFiles) },
    );
    const problems = recordProblems(
      JSON.parse(JSON.stringify(record)),
      {
        manifest,
        manifestSha256: sha256(manifestBytes),
        timestamps: TIMES,
        width: WIDTH,
        height: HEIGHT,
        prefix: 'video',
      },
      { reference: false },
    );
    const file = writeReport(problems.length === 0 ? RECORD : FAILED_RECORD, record);
    console.info(`Video parity record (${gate ? 'gated' : 'report only'}): ${file}`);
    expect(problems).toEqual([]);
    if (gate) {
      // D34.1 holds inside video nodes too (D51.6), stated here as literals.
      for (const row of rows) {
        expect(row.differingPixels, String(row.timeUs)).toBe(0);
        expect(row.maxChannelDifference, String(row.timeUs)).toBe(0);
      }
    }
  });
});

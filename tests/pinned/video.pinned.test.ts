/**
 * Video nodes in the Producer (D49, D50) with the pinned FFmpeg and Chromium:
 * the fixture video is the committed bytes, its media facts are the committed
 * facts, every frame of a video node shows exactly the source frame the rule
 * of D49.5 selects as FFmpeg decodes it, the frames do not depend on the order
 * of the render, the golden frames of the video composition are met in the
 * pinned environment, and every problem of a video is typed before the first
 * frame. Skipped without `KADRION_FFMPEG` and `KADRION_FFPROBE`; required where
 * the run is pinned.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  launchChromium,
  PINNED_IMAGE,
  PINNED_IMAGE_VARIABLE,
  renderFrames,
  sha256,
  type LaunchedChromium,
  type RenderResult,
} from '@kadrion/producer';
import type { AssetResolver } from '@kadrion/renderer-dom';
import { sourceFrameIndex, sourceTimeUs } from '@kadrion/schema';
import {
  generateReferenceAssets,
  VIDEO_FIXTURE,
  videoComposition,
  videoGoldenTimestamps,
} from '@kadrion/test-fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  decodePng,
  difference,
  GOLDEN_DIRECTORY,
  OUTPUT_DIRECTORY,
  pinnedRun,
  pixelReport,
  samePixels,
  writeReport,
  type Draft,
} from './support.js';
import { decodedFixtureFrames, makeVideoFixture } from './video-fixture.ts';

const ffmpegPath = process.env.KADRION_FFMPEG;
const ffprobePath = process.env.KADRION_FFPROBE;
const available = ffmpegPath !== undefined && ffprobePath !== undefined;
const pinned = process.env[PINNED_IMAGE_VARIABLE] === PINNED_IMAGE;
const FFMPEG = { ffmpegPath: ffmpegPath ?? '', ffprobePath: ffprobePath ?? '' };
const TIMES = videoGoldenTimestamps.map(({ timeUs }) => timeUs);
const VIDEO_MANIFEST = join(GOLDEN_DIRECTORY, 'video.golden-frames.json');

const generated = Object.fromEntries(
  generateReferenceAssets().map(({ id, mediaType, bytes }) => [id, { mediaType, bytes }]),
);

interface VideoNodeDraft {
  id: string;
  type: string;
  startUs: number;
  durationUs: number;
  sourceStartUs: number;
  children?: VideoNodeDraft[];
}

describe('the pinned FFmpeg for video (D50.5)', () => {
  it('is given wherever the run is pinned, and its absence is stated elsewhere', () => {
    if (pinned) expect(available).toBe(true);
    if (!available) {
      console.info(
        'The video tests are skipped: KADRION_FFMPEG and KADRION_FFPROBE are not set. Video nodes are not proven by this run.',
      );
    }
  });
});

describe.skipIf(!available)('video nodes in the Producer (D49, D50)', () => {
  let chromium: LaunchedChromium;
  let video: Uint8Array;
  let decoded: Uint8Array[];
  let baseline: RenderResult;

  const resolverWith =
    (bytes: Uint8Array): AssetResolver =>
    ({ id }) =>
      id === VIDEO_FIXTURE.id
        ? { bytes, mediaType: VIDEO_FIXTURE.mediaType }
        : (generated[id] ?? null);

  const render = (
    timesUs: readonly number[],
    document: unknown = videoComposition,
    bytes = video,
  ) =>
    renderFrames({
      document,
      resolveAsset: resolverWith(bytes),
      timesUs,
      chromium,
      ffmpeg: FFMPEG,
    });

  /** The video composition with one edit, as a fresh draft. */
  const edited = (edit: (draft: Draft) => void): unknown => {
    const draft = structuredClone(videoComposition) as Draft;
    edit(draft);
    return draft;
  };

  beforeAll(async () => {
    chromium = await launchChromium();
    video = await makeVideoFixture(FFMPEG.ffmpegPath);
    decoded = await decodedFixtureFrames(FFMPEG.ffmpegPath, video);
    baseline = await render(TIMES);
  });

  afterAll(async () => {
    await chromium.browser.close();
  });

  it('makes the committed fixture video, which decodes to the committed number of frames', () => {
    expect(sha256(video)).toBe(VIDEO_FIXTURE.contentHash);
    expect(decoded).toHaveLength(VIDEO_FIXTURE.frames);
  });

  it('records the media facts and the decode in the render manifest (D50.5)', () => {
    expect(baseline.manifest).toMatchObject({
      manifestVersion: 3,
      schemaVersion: '0.6',
      preset: { name: 'frames-png', width: 640, height: 360, fps: 30 },
      ffmpeg: null,
      video: {
        decoder: { version: 'n8.1.3-20260921' },
        sources: [
          {
            assetId: VIDEO_FIXTURE.id,
            contentHash: VIDEO_FIXTURE.contentHash,
            width: VIDEO_FIXTURE.width,
            height: VIDEO_FIXTURE.height,
            frames: VIDEO_FIXTURE.frames,
            timeBase: `${String(VIDEO_FIXTURE.timeBase.num)}/${String(VIDEO_FIXTURE.timeBase.den)}`,
            sourceDurationUs: VIDEO_FIXTURE.sourceDurationUs,
          },
        ],
      },
    });
    expect(baseline.manifest.video?.decodeArgs).toContain('<input>');
    expect(baseline.manifest.frames.map(({ index }) => index)).toEqual(
      videoGoldenTimestamps.map(({ frame }) => frame),
    );
  });

  it('shows in node-video-full exactly the source frame of the rule, as FFmpeg decodes it (D49.5)', () => {
    const timestamps = Array.from(
      { length: VIDEO_FIXTURE.frames },
      (_, at) => at * VIDEO_FIXTURE.frameTicks,
    );
    const node = { startUs: 0, durationUs: 2_000_000, sourceStartUs: 0 };
    const rows: { timeUs: number; sourceFrame: number; differingPixels: number }[] = [];
    for (const { timeUs, png } of baseline.frames) {
      const sourceFrame = sourceFrameIndex(
        timestamps,
        VIDEO_FIXTURE.timeBase,
        sourceTimeUs(node, timeUs),
      );
      const image = decodePng(png);
      const source = decoded[sourceFrame];
      if (source === undefined) throw new Error(`No source frame ${String(sourceFrame)}.`);
      let differingPixels = 0;
      for (let y = 0; y < VIDEO_FIXTURE.height; y += 1) {
        for (let x = 0; x < VIDEO_FIXTURE.width; x += 1) {
          const at = (y * image.width + x) * 4;
          const from = (y * VIDEO_FIXTURE.width + x) * 3;
          if (
            image.data[at] !== source[from] ||
            image.data[at + 1] !== source[from + 1] ||
            image.data[at + 2] !== source[from + 2]
          ) {
            differingPixels += 1;
          }
        }
      }
      rows.push({ timeUs, sourceFrame, differingPixels });
    }
    writeReport('video/source-frames.json', rows);
    expect(rows.map(({ sourceFrame }) => sourceFrame)).toEqual([0, 12, 25, 37, 49]);
    expect(rows.map(({ differingPixels }) => differingPixels)).toEqual([0, 0, 0, 0, 0]);
  });

  it('gives the same frames in any order: a decoder that goes back starts again', async () => {
    const reversed = await render([...TIMES].reverse());
    for (const { timeUs, png } of reversed.frames) {
      const expected = baseline.frames.find((frame) => frame.timeUs === timeUs)?.png;
      if (expected === undefined) throw new Error(`No frame at ${String(timeUs)}.`);
      expect(samePixels(png, expected), pixelReport(String(timeUs), png, expected)).toBe(true);
    }
  });

  it('meets the golden frames of the video composition in the pinned environment only (D26.5)', () => {
    const environment = pinnedRun(chromium);
    const goldens = existsSync(VIDEO_MANIFEST)
      ? (JSON.parse(readFileSync(VIDEO_MANIFEST, 'utf8')) as {
          environment: { pinned: boolean };
          frames: { file: string; timeUs: number }[];
        })
      : null;
    const report = baseline.frames.map(({ timeUs, png }) => {
      const file = goldens?.frames.find((frame) => frame.timeUs === timeUs)?.file;
      return {
        timeUs,
        difference:
          file === undefined
            ? null
            : difference(decodePng(readFileSync(join(GOLDEN_DIRECTORY, file))), decodePng(png)),
      };
    });
    rmSync(join(OUTPUT_DIRECTORY, 'video', 'golden-comparison.json'), { force: true });
    writeReport('video/golden-comparison.json', { environment, goldens: goldens !== null, report });
    if (!environment.pinned) {
      console.info('Not the pinned environment: the video golden frames are not asserted.');
      return;
    }
    expect(
      goldens,
      'Run "node --run goldens:update" in the pinned container first.',
    ).not.toBeNull();
    expect(goldens?.environment.pinned).toBe(true);
    for (const { timeUs, difference: found } of report) {
      expect(found?.differingPixels, String(timeUs)).toBe(0);
    }
  });

  describe('typed errors before the first frame (D49.6, D50.5)', () => {
    it('refuses a node that samples past the end of its video with source-range-exceeded', async () => {
      const document = edited((draft) => {
        const node = draft.scenes[0]?.nodes.find(({ id }) => id === 'node-video-full') as
          VideoNodeDraft | undefined;
        if (node === undefined) throw new Error('No node-video-full.');
        node.sourceStartUs = 1_000_001;
      });
      await expect(render([0], document)).rejects.toMatchObject({
        code: 'source-range-exceeded',
        message: expect.stringContaining('node-video-full') as unknown,
      });
    });

    it('accepts a node whose range ends exactly at the end of its video', async () => {
      const document = edited((draft) => {
        const node = draft.scenes[0]?.nodes.find(({ id }) => id === 'node-video-full') as
          VideoNodeDraft | undefined;
        if (node === undefined) throw new Error('No node-video-full.');
        node.sourceStartUs = 1_000_000;
      });
      const result = await render([1_966_666], document);
      expect(result.frames).toHaveLength(1);
    });

    it('refuses a document with video nodes and no FFmpeg with ffmpeg-missing', async () => {
      await expect(
        renderFrames({
          document: videoComposition,
          resolveAsset: resolverWith(video),
          timesUs: [0],
          chromium,
        }),
      ).rejects.toMatchObject({ code: 'ffmpeg-missing' });
    });

    it('refuses bytes that are no video with video-undecodable', async () => {
      const bytes = new Uint8Array(4096).fill(7);
      const document = edited((draft) => {
        const asset = draft.assets.find(({ id }) => id === VIDEO_FIXTURE.id);
        if (asset === undefined) throw new Error('No video asset.');
        asset.contentHash = sha256(bytes);
      });
      await expect(render([0], document, bytes)).rejects.toMatchObject({
        code: 'video-undecodable',
      });
    });

    it('refuses other bytes than the pinned video with asset-hash-mismatch', async () => {
      const bytes = video.slice();
      bytes[bytes.length - 1] = (bytes.at(-1) ?? 0) ^ 1;
      await expect(render([0], videoComposition, bytes)).rejects.toMatchObject({
        code: 'asset-hash-mismatch',
      });
    });
  });
});

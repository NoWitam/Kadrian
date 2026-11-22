/**
 * Video nodes in the Producer (D49, D50) with the pinned FFmpeg and Chromium:
 * the fixture video is the committed bytes, its media facts are the committed
 * facts, every frame of a video node shows exactly the source frame the rule
 * of D49.5 selects as FFmpeg decodes it, the frames do not depend on the order
 * of the render, the golden frames of the video composition are met in the
 * pinned environment, the frames are the same when the video is read by path
 * (D64), and every problem of a video is typed before the first frame. A
 * video turned by its container is decoded at its coded size and turned after
 * the conversion to RGB, in the orientation FFmpeg itself shows it, and a
 * display matrix that is no quarter turn is refused (D81). Skipped without
 * `KADRION_FFMPEG` and `KADRION_FFPROBE`; required where the run is pinned.
 */
import { execFile } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
  exportMp4,
  joinSegments,
  launchChromium,
  PINNED_IMAGE,
  PINNED_IMAGE_VARIABLE,
  renderAudio,
  renderFrames,
  renderSegments,
  sha256,
  type ExportManifest,
  type ExportResult,
  type JoinPart,
  type JoinResult,
  type LaunchedChromium,
  type ProducerAssetResolver,
  type RenderResult,
  type SegmentsManifest,
} from '@kadrion/producer';
import { orientRgb, type AssetResolver, type VideoOrientation } from '@kadrion/renderer-dom';
import { frameCount, frameToTimeUs, sourceFrameIndex, sourceTimeUs } from '@kadrion/schema';
import {
  generateReferenceAssets,
  ROTATED_VIDEO_FIXTURES,
  rotatedVideoFixtureArguments,
  TILTED_VIDEO_FIXTURE,
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
import {
  decodedFixtureFrames,
  makeRotatedVideoFixture,
  makeVideoFixture,
  remuxed,
  REMUXES,
} from './video-fixture.ts';

const run = promisify(execFile);
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
      schemaVersion: '0.29',
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
    // A render that never goes back records no seek and keeps its bytes (D82.5).
    expect(baseline.manifest.video).not.toHaveProperty('seekArgs');
    expect(baseline.manifest.frames.map(({ index }) => index)).toEqual(
      videoGoldenTimestamps.map(({ frame }) => frame),
    );
  });

  it('shows in node-video-full exactly the source frame of the rule, as FFmpeg decodes it (D49.5)', () => {
    const timestamps = Array.from(
      { length: VIDEO_FIXTURE.frames },
      (_, at) => at * VIDEO_FIXTURE.frameTicks,
    );
    const node = {
      startUs: 0,
      durationUs: 2_000_000,
      sourceStartUs: 0,
      sourceStartRemainder: 0,
      speed: { num: 1, den: 1 },
      reverse: false,
    };
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

  describe('going back by a seek to the IDR picture before the frame (D82.5)', () => {
    /** Every frame of the video composition: node-video-full shows 0 to 49, node-video-cover 12 to 61. */
    const ALL = Array.from({ length: frameCount(2_000_000, 30) }, (_, frame) =>
      frameToTimeUs(frame, 30),
    );

    /** Renders every frame forwards and backwards and requires the same pixels. */
    const sameBothWays = async (document: unknown, bytes: Uint8Array): Promise<RenderResult> => {
      const forward = await render(ALL, document, bytes);
      const backward = await render([...ALL].reverse(), document, bytes);
      for (const { timeUs, png } of backward.frames) {
        const expected = forward.frames.find((frame) => frame.timeUs === timeUs)?.png;
        if (expected === undefined) throw new Error(`No frame at ${String(timeUs)}.`);
        expect(samePixels(png, expected), pixelReport(String(timeUs), png, expected)).toBe(true);
      }
      expect(forward.manifest.video).not.toHaveProperty('seekArgs');
      return backward;
    };

    it('renders every frame of the video composition backwards as forwards, and records the seek', async () => {
      const backward = await sameBothWays(videoComposition, video);
      const decode = backward.manifest.video;
      expect(decode?.seekArgs).toEqual([
        ...['-nostdin', '-v', 'error', '-threads', '1', '-noautorotate'],
        ...['-seek_timestamp', '1', '-ss', '<start>', '-i', '<input>'],
        ...(decode?.decodeArgs.slice(decode.decodeArgs.indexOf('-map')) ?? []),
      ]);
      // The frames requested backwards meet the frames of the golden render (D26.5).
      for (const { timeUs, png } of backward.frames) {
        const expected = baseline.frames.find((frame) => frame.timeUs === timeUs)?.png;
        if (expected !== undefined) expect(samePixels(png, expected), String(timeUs)).toBe(true);
      }
    });

    it.each(REMUXES)(
      'decodes every frame of the fixture in %s after a seek as the forward decode does',
      async (_name, extension, options) => {
        const bytes = await remuxed(FFMPEG.ffmpegPath, video, extension, options);
        const document = edited((draft) => {
          const asset = draft.assets.find(({ id }) => id === VIDEO_FIXTURE.id);
          if (asset === undefined) throw new Error('No video asset.');
          asset.contentHash = sha256(bytes);
        });
        const backward = await sameBothWays(document, bytes);
        expect(backward.manifest.video).toHaveProperty('seekArgs');
      },
    );

    it.each(ROTATED_VIDEO_FIXTURES)(
      'decodes every frame of $name after a seek as the forward decode does (D81)',
      async (fixture) => {
        const bytes = await makeRotatedVideoFixture(FFMPEG.ffmpegPath, video, fixture);
        const document = edited((draft) => {
          const asset = draft.assets.find(({ id }) => id === VIDEO_FIXTURE.id);
          if (asset === undefined) throw new Error('No video asset.');
          asset.contentHash = fixture.contentHash;
        });
        const backward = await sameBothWays(document, bytes);
        expect(backward.manifest.video).toHaveProperty('seekArgs');
      },
    );
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

  describe('the video read by path (D64)', () => {
    // The host's storage: a directory of its own, outside the outputs of the run.
    const HOST = mkdtempSync(join(tmpdir(), 'kadrion-host-'));
    const file = join(HOST, 'clip.mp4');
    const byPath: ProducerAssetResolver = ({ id }) =>
      id === VIDEO_FIXTURE.id
        ? { path: file, mediaType: VIDEO_FIXTURE.mediaType }
        : (generated[id] ?? null);

    beforeAll(() => {
      writeFileSync(file, video);
    });

    afterAll(() => {
      rmSync(HOST, { recursive: true, force: true });
    });

    it('renders the same frames and the same manifest as the delivery of its bytes', async () => {
      const result = await renderFrames({
        document: videoComposition,
        resolveAsset: byPath,
        timesUs: TIMES,
        chromium,
        ffmpeg: FFMPEG,
      });
      expect(result.frames.map(({ png }) => sha256(png))).toEqual(
        baseline.frames.map(({ png }) => sha256(png)),
      );
      expect(result.manifest).toEqual(baseline.manifest);
      // The host's file is read where it is: neither changed nor removed.
      expect(sha256(new Uint8Array(readFileSync(file)))).toBe(VIDEO_FIXTURE.contentHash);
    });

    it('refuses a file changed between its verification and its decode with asset-changed', async () => {
      const changed = join(HOST, 'changed.mp4');
      writeFileSync(changed, video);
      try {
        await expect(
          renderFrames({
            document: videoComposition,
            resolveAsset: ({ id }) =>
              id === VIDEO_FIXTURE.id
                ? { path: changed, mediaType: VIDEO_FIXTURE.mediaType }
                : (generated[id] ?? null),
            timesUs: TIMES,
            chromium,
            ffmpeg: FFMPEG,
            // After the checks before the page and before the first frame is decoded.
            onProgress: (event) => {
              if (event.event === 'start') appendFileSync(changed, new Uint8Array(1));
            },
          }),
        ).rejects.toMatchObject({ code: 'asset-changed' });
      } finally {
        rmSync(changed, { force: true });
      }
    });
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

  describe('a video turned by its container (D81)', () => {
    /** The time shown, and the source frame node-video-full shows then. */
    const TIME_US = 1_000_000;
    const FRAME = 25;
    const ORIENTATIONS: readonly VideoOrientation[] = [0, 90, 180, 270].flatMap((rotation) =>
      [false, true].map((flipped) => ({ rotation: rotation as 0 | 90 | 180 | 270, flipped })),
    );

    /** The video composition with node-video-full alone, at the size the video is shown. */
    const alone = (contentHash: string, width: number, height: number): unknown =>
      edited((draft) => {
        const asset = draft.assets.find(({ id }) => id === VIDEO_FIXTURE.id);
        const scene = draft.scenes[0];
        if (asset === undefined || scene === undefined) throw new Error('No video asset.');
        asset.contentHash = contentHash;
        scene.nodes = scene.nodes.filter(({ id }) => id === 'node-video-full');
        const [node] = scene.nodes;
        if (node === undefined) throw new Error('No node-video-full.');
        node.width = width;
        node.height = height;
      });

    /** The mean difference of two pictures of packed RGB of the same length. */
    const meanDifference = (a: Uint8Array, b: Uint8Array): number => {
      let sum = 0;
      for (let at = 0; at < a.length; at += 1) sum += Math.abs((a[at] ?? 0) - (b[at] ?? 0));
      return sum / a.length;
    };

    it.each(ROTATED_VIDEO_FIXTURES)(
      'shows $name turned after the conversion to RGB, as FFmpeg shows it',
      async (fixture) => {
        const bytes = await makeRotatedVideoFixture(FFMPEG.ffmpegPath, video, fixture);
        const result = await render(
          [TIME_US],
          alone(fixture.contentHash, fixture.width, fixture.height),
          bytes,
        );
        expect(result.manifest.video?.sources[0]).toMatchObject({
          contentHash: fixture.contentHash,
          width: fixture.width,
          height: fixture.height,
          frames: fixture.frames,
          sourceDurationUs: fixture.sourceDurationUs,
        });
        expect(result.manifest.video?.decodeArgs).toContain('-noautorotate');
        const coded = (await decodedFixtureFrames(FFMPEG.ffmpegPath, bytes))[FRAME];
        const shownByFfmpeg = (await decodedFixtureFrames(FFMPEG.ffmpegPath, bytes, true))[FRAME];
        if (coded === undefined || shownByFfmpeg === undefined) throw new Error('No frame.');
        const { width, height } = VIDEO_FIXTURE;
        const expected = orientRgb(coded, width, height, fixture);
        // The frame of the page holds the turned picture at (0, 0), pixel for pixel.
        const image = decodePng(result.frames[0]?.png ?? new Uint8Array());
        let differingPixels = 0;
        for (let y = 0; y < fixture.height; y += 1) {
          for (let x = 0; x < fixture.width; x += 1) {
            const at = (y * image.width + x) * 4;
            const from = (y * fixture.width + x) * 3;
            if (
              image.data[at] !== expected[from] ||
              image.data[at + 1] !== expected[from + 1] ||
              image.data[at + 2] !== expected[from + 2]
            ) {
              differingPixels += 1;
            }
          }
        }
        expect(differingPixels).toBe(0);
        // FFmpeg turns before its conversion, so its pixels differ by the chroma filter
        // only: of the eight orientations, the one of D81 is by far the nearest to it.
        const distances = ORIENTATIONS.filter(
          (orientation) => orientation.rotation % 180 === fixture.rotation % 180,
        ).map((orientation) => ({
          orientation,
          mean: meanDifference(orientRgb(coded, width, height, orientation), shownByFfmpeg),
        }));
        const nearest = distances.reduce((best, next) => (next.mean < best.mean ? next : best));
        expect(nearest.orientation).toEqual({
          rotation: fixture.rotation,
          flipped: fixture.flipped,
        });
        expect(nearest.mean).toBeLessThan(1);
      },
    );

    it('refuses a display matrix that is no quarter turn with video-undecodable', async () => {
      const bytes = await makeRotatedVideoFixture(FFMPEG.ffmpegPath, video, TILTED_VIDEO_FIXTURE);
      await expect(
        render(
          [0],
          alone(TILTED_VIDEO_FIXTURE.contentHash, VIDEO_FIXTURE.width, VIDEO_FIXTURE.height),
          bytes,
        ),
      ).rejects.toMatchObject({
        code: 'video-undecodable',
        message: expect.stringContaining('not a quarter turn') as unknown,
      });
    });
  });
});

/**
 * The first start of a decoder in an export (D88.3, D88.4). A source of 25 s at
 * 30 fps with an IDR picture every 120 frames, made by the pinned FFmpeg and
 * not stored, in every container the Producer reads and turned by its
 * container (D81): a range job that enters the clip at source frame 300 starts
 * its decoder at the IDR picture of frame 240 and reads across those of 360
 * and 480, and its frames are the frames of a job that read from frame 0. A
 * film joined from ranges equals the film exported in one pass: in its MP4
 * bytes, its frames, and its manifest apart from `video.seekArgs`.
 */
describe.skipIf(!available)('a first start that seeks in an export (D88.3, D88.4)', () => {
  const LONG = { width: 160, height: 96, fps: 30, seconds: 25 } as const;
  let chromium: LaunchedChromium;
  let directory: string;
  let long: Uint8Array;

  /** The long source, made by the pinned FFmpeg with a fixed distance of IDR pictures. */
  const longSource = async (): Promise<Uint8Array> => {
    const output = join(directory, 'long.mp4');
    await run(FFMPEG.ffmpegPath, [
      ...['-nostdin', '-v', 'error', '-y', '-f', 'lavfi'],
      ...[
        '-i',
        `testsrc2=size=${String(LONG.width)}x${String(LONG.height)}:rate=${String(LONG.fps)}:duration=${String(LONG.seconds)}`,
      ],
      ...['-c:v', 'libx264', '-preset', 'veryfast', '-g', '120', '-keyint_min', '120'],
      ...['-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-threads', '1', output],
    ]);
    return new Uint8Array(readFileSync(output));
  };

  /** The background and node-video-full alone, showing `bytes` from `sourceStartUs` for `durationUs`. */
  const film = (bytes: Uint8Array, durationUs: number, sourceStartUs: number): unknown => {
    const draft = structuredClone(videoComposition) as {
      width: number;
      height: number;
      durationUs: number;
      assets: { id: string; contentHash: string }[];
      scenes: { durationUs: number; nodes: { id: string; type: string }[] }[];
    };
    // The size of the preset 720p, which never upscales (D29.5).
    draft.width = 1280;
    draft.height = 720;
    draft.durationUs = durationUs;
    const asset = draft.assets.find(({ id }) => id === VIDEO_FIXTURE.id);
    if (asset === undefined) throw new Error('No video asset.');
    asset.contentHash = sha256(bytes);
    for (const scene of draft.scenes) {
      scene.durationUs = durationUs;
      scene.nodes = scene.nodes
        .filter(({ id }) => id === 'node-background' || id === 'node-video-full')
        .map((node) => ({
          ...node,
          durationUs,
          ...(node.type === 'video' ? { sourceStartUs } : {}),
        }));
    }
    return draft;
  };

  const resolver =
    (bytes: Uint8Array): AssetResolver =>
    ({ id }) =>
      id === VIDEO_FIXTURE.id
        ? { bytes, mediaType: VIDEO_FIXTURE.mediaType }
        : (generated[id] ?? null);

  /** A range job of `document` into a directory of its own. */
  const job = async (
    document: unknown,
    bytes: Uint8Array,
    name: string,
    range?: { fromUs: number; toUs: number },
  ): Promise<JoinPart<SegmentsManifest>> => {
    const outputDirectory = join(directory, name);
    mkdirSync(outputDirectory, { recursive: true });
    const { manifest } = await renderSegments({
      document,
      resolveAsset: resolver(bytes),
      preset: '720p',
      ...(range === undefined ? {} : { range }),
      outputDirectory,
      ffmpeg: FFMPEG,
      chromium,
    });
    return { manifest, directory: outputDirectory };
  };

  beforeAll(async () => {
    chromium = await launchChromium();
    directory = mkdtempSync(join(tmpdir(), 'kadrion-first-seek-'));
    long = await longSource();
  }, 120_000);

  afterAll(async () => {
    await chromium.browser.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const containers: readonly (readonly [string, () => Promise<Uint8Array>])[] = [
    ['MP4', () => Promise.resolve(long)],
    ...REMUXES.map(
      ([name, extension, options]) =>
        [name, () => remuxed(FFMPEG.ffmpegPath, long, extension, options)] as const,
    ),
    [
      'a video turned by its container (D81)',
      async () => {
        const input = join(directory, 'upright.mp4');
        const output = join(directory, 'turned.mp4');
        writeFileSync(input, long);
        const [turned] = ROTATED_VIDEO_FIXTURES;
        if (turned === undefined) throw new Error('No turned fixture.');
        await run(FFMPEG.ffmpegPath, [
          ...rotatedVideoFixtureArguments(turned.display, input, output),
        ]);
        return new Uint8Array(readFileSync(output));
      },
    ],
  ];

  it.each(containers)(
    'reads %s from a late IDR picture across two more as from frame 0',
    async (name, make) => {
      const bytes = await make();
      // 17 s of the clip from its start: frame f of the film shows source frame f.
      const document = film(bytes, 17_000_000, 0);
      const slug = name.replace(/[^a-z0-9]+/gi, '-');
      // From frame 240, below FIRST_SEEK_FRAMES: the decoder starts at frame 0 and reads on.
      const early = await job(document, bytes, `${slug}-early`, {
        fromUs: 8_000_000,
        toUs: 17_000_000,
      });
      const late = await job(document, bytes, `${slug}-late`, {
        fromUs: 10_000_000,
        toUs: 17_000_000,
      });
      expect(early.manifest.video).not.toHaveProperty('seekArgs');
      expect(late.manifest.video?.seekArgs).toEqual(
        expect.arrayContaining(['-seek_timestamp', '1', '-ss', '<start>']),
      );
      // Frames 300 to 509 of the film: source frames 300 to 509, across the IDR pictures 360 and 480.
      expect(late.manifest.frames).toHaveLength(210);
      expect(late.manifest.frames).toEqual(early.manifest.frames.slice(60));
    },
    900_000,
  );

  /** One pass and a join of `ranges`, of a film of 12 s that shows the clip from `sourceStartUs`. */
  const bothWays = async (
    sourceStartUs: number,
    ranges: readonly (readonly [number, number])[],
    name: string,
  ): Promise<{ onePass: ExportResult; joined: JoinResult; files: [string, string] }> => {
    const document = film(long, 12_000_000, sourceStartUs);
    const onePassFile = join(directory, `${name}-one-pass.mp4`);
    const onePass = await exportMp4({
      document,
      resolveAsset: resolver(long),
      preset: '720p',
      outputPath: onePassFile,
      ffmpeg: FFMPEG,
      chromium,
    });
    const parts: JoinPart<SegmentsManifest>[] = [];
    for (const [fromUs, toUs] of ranges) {
      parts.push(await job(document, long, `${name}-${String(fromUs)}`, { fromUs, toUs }));
    }
    const audioDirectory = join(directory, `${name}-audio`);
    mkdirSync(audioDirectory, { recursive: true });
    const audio = await renderAudio({
      document,
      resolveAsset: resolver(long),
      outputDirectory: audioDirectory,
      ffmpeg: FFMPEG,
    });
    const joinedFile = join(directory, `${name}-joined.mp4`);
    const joined = await joinSegments({
      segments: parts,
      audio: { manifest: audio.manifest, directory: audioDirectory },
      outputPath: joinedFile,
      ffmpeg: FFMPEG,
    });
    return { onePass, joined, files: [onePassFile, joinedFile] };
  };

  /** The manifest without `video.seekArgs`, which a job records only when it started by a seek. */
  const withoutSeek = (manifest: ExportManifest): unknown => {
    const copy = structuredClone(manifest) as { video: Record<string, unknown> | null };
    if (copy.video !== null) delete copy.video.seekArgs;
    return copy;
  };

  it('joins a later range that seeks into the film of one pass that read on (D88.4)', async () => {
    // The clip starts at source frame 0; the second range enters it at frame 300.
    const { onePass, joined, files } = await bothWays(
      0,
      [
        [10_000_000, 12_000_000],
        [0, 10_000_000],
      ],
      'below',
    );
    expect(onePass.manifest.video).not.toHaveProperty('seekArgs');
    expect(joined.manifest.video).toHaveProperty('seekArgs');
    expect(sha256(readFileSync(files[1]))).toBe(sha256(readFileSync(files[0])));
    expect(joined.manifest.frames).toEqual(onePass.manifest.frames);
    expect(withoutSeek(joined.manifest)).toEqual(withoutSeek(onePass.manifest));
  }, 900_000);

  it('writes equal manifests when the clip starts at 256 or later and both seek (D88.4)', async () => {
    // The clip starts at source frame 300; the ranges enter it at 300 and 480.
    const { onePass, joined, files } = await bothWays(
      10_000_000,
      [
        [6_000_000, 12_000_000],
        [0, 6_000_000],
      ],
      'late',
    );
    expect(onePass.manifest.video).toHaveProperty('seekArgs');
    expect(sha256(readFileSync(files[1]))).toBe(sha256(readFileSync(files[0])));
    expect(joined.manifest).toEqual(onePass.manifest);
  }, 900_000);
});

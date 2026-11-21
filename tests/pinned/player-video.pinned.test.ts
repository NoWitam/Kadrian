/**
 * Video in the Player (D51) in Chromium, with the fixture video the pinned
 * FFmpeg makes: the Player reads the media facts the Producer's ffprobe reads,
 * decodes in the host window, converts YUV to RGB as the Producer's FFmpeg
 * does, and so shows at every golden timestamp of the video composition the
 * frame the Producer renders in the same run, to the pixel. Frames do not
 * depend on the order of seeks or on how the video was delivered, and every
 * problem of a video is typed before the first frame. Skipped without
 * `KADRION_FFMPEG` and `KADRION_FFPROBE`; required where the run is pinned.
 * The same holds for the fixture's stream copied into fragmented MP4, MOV and
 * MKV, which the Player reads through Mediabunny (D79.2), and for the fixture
 * turned by its container, a quarter turn mirrored or not, which both hosts
 * turn after the conversion to RGB (D81); a tilted one the Player refuses.
 */
import {
  awaitPresented,
  captureFrame,
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
  ROTATED_VIDEO_FIXTURES,
  TILTED_VIDEO_FIXTURE,
  VIDEO_FIXTURE,
  videoComposition,
  videoGoldenTimestamps,
} from '@kadrion/test-fixtures';
import { frameCount, frameToTimeUs, timeUsToFrame, validateComposition } from '@kadrion/schema';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  playback,
  playerState,
  playerWarnings,
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
import { makeRotatedVideoFixture, makeVideoFixture, remuxed, REMUXES } from './video-fixture.ts';

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

  it('shows every frame backwards as the Producer renders it forwards, from its run cache (D82.4)', async () => {
    const all = Array.from(
      { length: frameCount(validatedVideo.composition.durationUs, FPS) },
      (_, frame) => frameToTimeUs(frame, FPS),
    );
    const forward = await renderFrames({
      document: videoComposition,
      resolveAsset: ({ id }) => assets.find((asset) => asset.id === id) ?? null,
      timesUs: all,
      chromium,
      ffmpeg: { ffmpegPath: ffmpegPath ?? '', ffprobePath: ffprobePath ?? '' },
    });
    const backward = await openConformanceHost(chromium, TEXT, assets);
    try {
      for (const timeUs of [...all].reverse()) {
        const shown = await seekAndCapture(backward, timeUs, null);
        const frame = forward.frames.find((candidate) => candidate.timeUs === timeUs)?.png;
        if (frame === undefined) throw new Error(`No Producer frame of ${String(timeUs)}.`);
        const metric = measure(decodePng(shown.png), decodePng(frame));
        expect(metric.differingPixels, String(timeUs)).toBe(0);
      }
    } finally {
      await closeConformanceHost(backward);
    }
  });

  it.each(REMUXES)(
    "shows the Producer's frames of the fixture remuxed into %s, to the pixel (D34, D79.2)",
    async (_name, extension, options) => {
      const bytes = await remuxed(ffmpegPath ?? '', video, extension, options);
      const contentHash = sha256(bytes);
      const text = edited((draft) => {
        const asset = draft.assets.find((candidate) => candidate.id === VIDEO_FIXTURE.id);
        if (asset === undefined) throw new Error('No video asset.');
        asset.contentHash = contentHash;
      });
      const given = assets.map((asset) =>
        asset.id === VIDEO_FIXTURE.id ? { ...asset, bytes } : asset,
      );
      const resolveAsset: AssetResolver = ({ id }) =>
        given.find((asset) => asset.id === id) ?? null;
      const reference = await renderFrames({
        document: JSON.parse(text) as unknown,
        resolveAsset,
        timesUs: TIMES,
        chromium,
        ffmpeg: { ffmpegPath: ffmpegPath ?? '', ffprobePath: ffprobePath ?? '' },
      });
      const target = await openConformanceHost(chromium, text, given);
      try {
        const source = reference.manifest.video?.sources[0];
        expect(await preparedFacts(target, VIDEO_FIXTURE.id, contentHash)).toEqual({
          type: 'video',
          durationUs: source?.sourceDurationUs,
          width: VIDEO_FIXTURE.width,
          height: VIDEO_FIXTURE.height,
          frames: source?.frames,
        });
        for (const timeUs of TIMES) {
          const shown = await seekAndCapture(target, timeUs, null);
          const frame = reference.frames.find((candidate) => candidate.timeUs === timeUs)?.png;
          if (frame === undefined) throw new Error(`No Producer frame of ${String(timeUs)}.`);
          const metric = measure(decodePng(shown.png), decodePng(frame));
          expect(metric.differingPixels, String(timeUs)).toBe(0);
          expect(metric.maxChannelDifference, String(timeUs)).toBe(0);
        }
      } finally {
        await closeConformanceHost(target);
      }
    },
  );

  it.each(ROTATED_VIDEO_FIXTURES)(
    "shows the Producer's frames of the fixture $name, with the size as shown, to the pixel (D34, D81)",
    async (fixture) => {
      const bytes = await makeRotatedVideoFixture(ffmpegPath ?? '', video, fixture);
      const text = edited((draft) => {
        const asset = draft.assets.find((candidate) => candidate.id === VIDEO_FIXTURE.id);
        if (asset === undefined) throw new Error('No video asset.');
        asset.contentHash = fixture.contentHash;
      });
      const given = assets.map((asset) =>
        asset.id === VIDEO_FIXTURE.id ? { ...asset, bytes } : asset,
      );
      const resolveAsset: AssetResolver = ({ id }) =>
        given.find((asset) => asset.id === id) ?? null;
      const reference = await renderFrames({
        document: JSON.parse(text) as unknown,
        resolveAsset,
        timesUs: TIMES,
        chromium,
        ffmpeg: { ffmpegPath: ffmpegPath ?? '', ffprobePath: ffprobePath ?? '' },
      });
      const target = await openConformanceHost(chromium, text, given);
      try {
        expect(reference.manifest.video?.sources[0]).toMatchObject({
          width: fixture.width,
          height: fixture.height,
        });
        expect(await preparedFacts(target, VIDEO_FIXTURE.id, fixture.contentHash)).toEqual({
          type: 'video',
          durationUs: fixture.sourceDurationUs,
          width: fixture.width,
          height: fixture.height,
          frames: fixture.frames,
        });
        for (const timeUs of TIMES) {
          const shown = await seekAndCapture(target, timeUs, null);
          const frame = reference.frames.find((candidate) => candidate.timeUs === timeUs)?.png;
          if (frame === undefined) throw new Error(`No Producer frame of ${String(timeUs)}.`);
          const metric = measure(decodePng(shown.png), decodePng(frame));
          expect(metric.differingPixels, String(timeUs)).toBe(0);
          expect(metric.maxChannelDifference, String(timeUs)).toBe(0);
        }
      } finally {
        await closeConformanceHost(target);
      }
    },
  );

  it('refuses the fixture tilted by 45° with video-unsupported before the first frame (D81)', async () => {
    const bytes = await makeRotatedVideoFixture(ffmpegPath ?? '', video, TILTED_VIDEO_FIXTURE);
    const text = edited((draft) => {
      const asset = draft.assets.find((candidate) => candidate.id === VIDEO_FIXTURE.id);
      if (asset === undefined) throw new Error('No video asset.');
      asset.contentHash = TILTED_VIDEO_FIXTURE.contentHash;
    });
    const target = await openConformanceHost(chromium, TEXT, assets);
    try {
      expect(
        await loadCode(
          target,
          text,
          assets.map((asset) => (asset.id === VIDEO_FIXTURE.id ? { ...asset, bytes } : asset)),
        ),
      ).toBe('video-unsupported');
    } finally {
      await closeConformanceHost(target);
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

/**
 * The frames of a playing video (D87.6): decoded forward by a stream and
 * converted in the Player's workers, they equal the frames of the path of
 * D51.4, in the source pixels for every container, colour description, and
 * turn, and on the page for a clip at its own size; a scaled clip is measured.
 */
describe.skipIf(!available)('video played from streams and workers (D87.6)', () => {
  let chromium: LaunchedChromium;
  let video: Uint8Array;

  /** Plays at 25 fps for the whole source, one node at its own size: film frame i shows source frame i. */
  const sourceText = (contentHash: string): string => {
    const draft = structuredClone(videoComposition) as Draft;
    const asset = draft.assets.find((candidate) => candidate.id === VIDEO_FIXTURE.id);
    if (asset === undefined) throw new Error('No video asset.');
    asset.contentHash = contentHash;
    draft.fps = 25;
    draft.durationUs = VIDEO_FIXTURE.sourceDurationUs;
    const scene = draft.scenes[0] as Draft['scenes'][number] & { durationUs: number };
    scene.durationUs = VIDEO_FIXTURE.sourceDurationUs;
    scene.nodes = scene.nodes
      .filter((node) => node.id === 'node-background' || node.id === 'node-video-full')
      .map((node) => ({ ...node, durationUs: VIDEO_FIXTURE.sourceDurationUs }));
    return JSON.stringify(draft);
  };

  const givenWith = (bytes: Uint8Array) => [
    ...generateReferenceAssets(),
    { id: VIDEO_FIXTURE.id, mediaType: VIDEO_FIXTURE.mediaType, bytes },
  ];

  beforeAll(async () => {
    chromium = await launchChromium();
    video = await makeVideoFixture(ffmpegPath ?? '');
  });

  afterAll(async () => {
    await chromium.browser.close();
  });

  /** The variants of the source pixels: every container, colour description, and turn. */
  const sources = async (): Promise<{ name: string; bytes: Uint8Array }[]> => {
    const ffmpeg = ffmpegPath ?? '';
    const variants = [{ name: 'MP4', bytes: video }];
    for (const [name, extension, options] of REMUXES) {
      variants.push({ name, bytes: await remuxed(ffmpeg, video, extension, options) });
    }
    for (const [name, filter] of [
      [
        'BT.709',
        'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1',
      ],
      ['BT.601, full range', 'h264_metadata=video_full_range_flag=1:matrix_coefficients=6'],
    ] as const) {
      variants.push({ name, bytes: await remuxed(ffmpeg, video, 'mp4', ['-bsf:v', filter]) });
    }
    for (const fixture of ROTATED_VIDEO_FIXTURES) {
      variants.push({
        name: fixture.name,
        bytes: await makeRotatedVideoFixture(ffmpeg, video, fixture),
      });
    }
    return variants;
  };

  it('converts in a worker every frame of a stream, read across two later IDR samples, to the RGB of the path of D51.4 (D87.6)', async () => {
    const rows: { name: string; frames: number; differing: number[] }[] = [];
    for (const { name, bytes } of await sources()) {
      const contentHash = sha256(bytes);
      const text = sourceText(contentHash);
      const target = await openConformanceHost(chromium, text, givenWith(bytes));
      try {
        // Run in the page as a string: the Player's own modules, as the host serves them.
        const shown = await target.page.evaluate<{
          error?: string;
          frames: number;
          differing: number[];
          restarts: number;
        }>(`(async () => {
          const args = ${JSON.stringify({ base64: Buffer.from(bytes).toString('base64'), contentHash, text })};
          const player = await import('/pkg/player/video.js');
          const { VideoStream } = await import('/pkg/player/stream.js');
          const { createConversionPool } = await import('/pkg/player/pool.js');
          const schema = await import('/pkg/schema/index.js');
          const bytes = Uint8Array.from(atob(args.base64), (character) => character.charCodeAt(0));
          const verified = await player.verifyVideo(
            { id: 'asset-video', type: 'video', contentHash: args.contentHash },
            () => ({ bytes, mediaType: 'video/mp4' }),
            Blob,
          );
          const video = await player.readVideo(verified);
          const validated = schema.validateComposition(JSON.parse(args.text));
          if (!validated.ok) return { error: 'invalid document' };
          const composition = validated.composition;
          const placed = schema.placedVideos(composition).find(({ node }) => node.id === 'node-video-full');
          const sought = player.createVideoFrameSource(window, new Map([[video.contentHash, video]]), new player.RunCache());
          const pool = createConversionPool(window);
          if (pool === null || !(await pool.start())) return { error: 'no worker started' };
          const { timestamps, timeBase } = video.track;
          const indexAt = (frame) => {
            const sceneTimeUs = schema.videoSceneTimeUs(placed, schema.frameToTimeUs(frame, composition.fps));
            return schema.sourceFrameIndex(timestamps, timeBase, schema.sourceTimeUs(placed.node, sceneTimeUs));
          };
          const frames = schema.frameCount(composition.durationUs, composition.fps);
          const stream = new VideoStream({
            codecs: player.codecsOf(window),
            video,
            upcoming: (index) =>
              [1, 2, 3, 4, 5, 6].map((ahead) => index + ahead).filter((at) => at < video.track.samples.length),
            convert: (planes) => pool.convert(player.jobOf(video, planes)),
            release: (bitmap) => bitmap.close(),
          });
          const canvas = new OffscreenCanvas(1, 1);
          const context = canvas.getContext('2d', { willReadFrequently: true });
          const pixels = async (image) => {
            canvas.width = image.width;
            canvas.height = image.height;
            context.clearRect(0, 0, image.width, image.height);
            context.drawImage(image, 0, 0);
            return context.getImageData(0, 0, image.width, image.height).data;
          };
          const differing = [];
          for (let frame = 0; frame < frames; frame += 1) {
            const index = indexAt(frame);
            const bitmap = await stream.frame(index);
            const streamed = await pixels(bitmap);
            const [entry] = await sought.framesAt(composition, schema.frameToTimeUs(frame, composition.fps));
            const png = await createImageBitmap(new Blob([entry.bytes], { type: entry.mediaType }), {
              colorSpaceConversion: 'none',
              premultiplyAlpha: 'none',
            });
            const reference = await pixels(png);
            png.close();
            let count = streamed.length === reference.length ? 0 : -1;
            for (let at = 0; count >= 0 && at < streamed.length; at += 1) {
              if (streamed[at] !== reference[at]) count += 1;
            }
            differing.push(count);
          }
          stream.close();
          pool.close();
          return { frames, differing, restarts: stream.restarts };
        })()`);
        expect(shown.error, name).toBeUndefined();
        // One decoder for the whole read: 75 frames, three IDR samples.
        expect(shown.restarts, name).toBe(1);
        rows.push({ name, frames: shown.frames, differing: shown.differing });
      } finally {
        await closeConformanceHost(target);
      }
    }
    writeReport(join('player-video', 'stream-source-pixels.json'), rows);
    for (const { name, frames, differing } of rows) {
      expect(frames, name).toBe(VIDEO_FIXTURE.frames);
      expect(
        differing.filter((count) => count !== 0),
        name,
      ).toEqual([]);
    }
  }, 600_000);

  /** One video node shown alone, at `box` with `fit`, beside the background and the image. */
  const playedText = (
    contentHash: string,
    box: { readonly width: number; readonly height: number; readonly fit: string },
  ): string => {
    const draft = structuredClone(videoComposition) as Draft;
    const asset = draft.assets.find((candidate) => candidate.id === VIDEO_FIXTURE.id);
    if (asset === undefined) throw new Error('No video asset.');
    asset.contentHash = contentHash;
    const scene = draft.scenes[0];
    if (scene === undefined) throw new Error('No scene.');
    scene.nodes = scene.nodes
      .filter((node) =>
        ['node-background', 'node-image-contain', 'node-video-full'].includes(node.id),
      )
      .map((node) => (node.id === 'node-video-full' ? { ...node, ...box } : node));
    return JSON.stringify(draft);
  };

  const nodeTag = (host: ConformanceHost): Promise<string | undefined> =>
    host.renderFrame.evaluate(
      () => document.querySelector('[data-kadrion-node="node-video-full"]')?.localName,
    );

  /** Film frames whose source frames lie on both sides of the IDR sample at 1 s, before the last frame. */
  const PLAYED_FRAMES = [2, 14, 29, 31, 44, 58];

  it('shows a playing frame as the page shows the sought frame: gated at its own size, measured scaled (D87.6)', async () => {
    const rows: {
      name: string;
      timeUs: number;
      differingPixels: number;
      maxChannelDifference: number;
    }[] = [];
    const variants: {
      name: string;
      bytes: Uint8Array;
      box: { width: number; height: number; fit: string };
      gated: boolean;
    }[] = [
      {
        name: 'own size',
        bytes: video,
        box: { width: 320, height: 180, fit: 'fill' },
        gated: true,
      },
      { name: 'smaller', bytes: video, box: { width: 160, height: 90, fit: 'fill' }, gated: false },
      { name: 'larger', bytes: video, box: { width: 640, height: 360, fit: 'fill' }, gated: false },
      {
        name: 'cropped',
        bytes: video,
        box: { width: 160, height: 160, fit: 'cover' },
        gated: false,
      },
    ];
    for (const fixture of ROTATED_VIDEO_FIXTURES) {
      variants.push({
        name: `${fixture.name}, its own size`,
        bytes: await makeRotatedVideoFixture(ffmpegPath ?? '', video, fixture),
        box: { width: fixture.width, height: fixture.height, fit: 'fill' },
        gated: true,
      });
    }
    for (const { name, bytes, box } of variants) {
      const text = playedText(sha256(bytes), box);
      const target = await openConformanceHost(chromium, text, givenWith(bytes), {
        manualClock: true,
      });
      try {
        for (const frame of PLAYED_FRAMES) {
          const timeUs = frameToTimeUs(frame, FPS);
          await target.page.evaluate(
            (time) =>
              (
                window as unknown as { conformance: { seek(t: number): Promise<void> } }
              ).conformance.seek(time),
            frameToTimeUs(frame - 1, FPS),
          );
          await playback(target, 'play');
          await playback(target, { advanceMs: 0 });
          // More than one frame and less than two: the clock asks for the next frame.
          await playback(target, { advanceMs: 40 });
          await target.page.waitForFunction(
            (time) =>
              (
                window as unknown as { conformance: { state(): { timeUs: number | null } } }
              ).conformance.state().timeUs === time,
            timeUs,
          );
          await awaitPresented(target.page, 5_000);
          expect(await nodeTag(target), `${name} ${String(timeUs)}`).toBe('canvas');
          const playing = await captureFrame(target.page, target.width, target.height);
          await playback(target, 'pause');
          await target.page.waitForFunction(
            () =>
              (
                window as unknown as { conformance: { state(): { status: string } } }
              ).conformance.state().status === 'ready',
          );
          await expect.poll(() => nodeTag(target)).toBe('img');
          await awaitPresented(target.page, 5_000);
          const sought = await captureFrame(target.page, target.width, target.height);
          const metric = measure(decodePng(playing), decodePng(sought));
          if (metric.differingPixels > 0) {
            // Both captures of a differing row, for the reader of the report.
            const stem = join(
              OUTPUT_DIRECTORY,
              'player-video',
              `${name.replace(/[^a-z0-9]+/g, '-')}-${String(timeUs)}`,
            );
            writeFileSync(`${stem}-playing.png`, playing);
            writeFileSync(`${stem}-sought.png`, sought);
          }
          rows.push({
            name,
            timeUs,
            differingPixels: metric.differingPixels,
            maxChannelDifference: metric.maxChannelDifference,
          });
        }
        expect(await playerWarnings(target), name).toEqual([]);
      } finally {
        await closeConformanceHost(target);
      }
    }
    const file = writeReport(join('player-video', 'playing-frames.json'), rows);
    console.info(`Playing frames against sought frames: ${file}`);
    for (const row of rows) {
      if (variants.find((variant) => variant.name === row.name)?.gated !== true) continue;
      expect(row.differingPixels, `${row.name} ${String(row.timeUs)}`).toBe(0);
      expect(row.maxChannelDifference, `${row.name} ${String(row.timeUs)}`).toBe(0);
    }
  }, 600_000);
});

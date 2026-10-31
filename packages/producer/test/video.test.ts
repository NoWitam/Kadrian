/**
 * Video nodes in the Producer (D50.5) on a fake FFmpeg: which videos are
 * probed, the range check before any page opens, the source frame of every
 * active node by the rule of D49.5, a decoder that only reads forward, the
 * PNG it hands to the page, and the private copies it removes. The pinned
 * FFmpeg itself is exercised in `tests/pinned`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

import type { VerifiedAsset } from '@kadrion/renderer-dom';
import { validateComposition, type ValidatedComposition } from '@kadrion/schema';
import { VIDEO_FIXTURE, referenceComposition, videoComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import type { FfmpegTools, VideoProbe } from '../src/ffmpeg.js';
import { encodePng, prepareVideos, videoNodes } from '../src/video.js';

function composition(document: unknown): ValidatedComposition {
  const result = validateComposition(document);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.composition;
}

const VIDEO = composition(videoComposition);
const WIDTH = 4;
const HEIGHT = 2;
const BYTES = new Uint8Array([1, 2, 3, 4]);

const PROBE: VideoProbe = {
  width: WIDTH,
  height: HEIGHT,
  timeBase: VIDEO_FIXTURE.timeBase,
  timestamps: Array.from(
    { length: VIDEO_FIXTURE.frames },
    (_, at) => at * VIDEO_FIXTURE.frameTicks,
  ),
  lastDuration: VIDEO_FIXTURE.frameTicks,
};

const VIDEO_ASSET: VerifiedAsset = {
  id: VIDEO_FIXTURE.id,
  type: 'video',
  mediaType: VIDEO_FIXTURE.mediaType,
  contentHash: VIDEO_FIXTURE.contentHash,
  bytes: BYTES,
};

/** A frame whose every byte is its index, so a PNG tells which frame it holds. */
function frameBytes(index: number): Uint8Array {
  return new Uint8Array(WIDTH * HEIGHT * 3).fill(index);
}

interface FakeRun {
  readonly tools: FfmpegTools;
  readonly log: string[];
  readonly files: string[];
}

function fakeTools(probe: VideoProbe = PROBE, frames = probe.timestamps.length): FakeRun {
  const log: string[] = [];
  const files: string[] = [];
  const tools = {
    identity: {
      ffmpegSha256: 'sha256:ff',
      ffprobeSha256: 'sha256:fp',
      version: 'n8.1.3-20260921',
      configuration: 'configured',
      encoders: ['libx264'],
    },
    probeVideo(file: string) {
      files.push(file);
      log.push(`probe ${String(readFileSync(file).length)}`);
      return Promise.resolve(probe);
    },
    decodeVideo(file: string, width: number, height: number) {
      files.push(file);
      log.push(`decode ${String(width)}x${String(height)}`);
      let next = 0;
      return {
        next() {
          if (next >= frames) return Promise.resolve(null);
          log.push(`read ${String(next)}`);
          next += 1;
          return Promise.resolve(frameBytes(next - 1));
        },
        close() {
          log.push('close decoder');
        },
      };
    },
  } as unknown as FfmpegTools;
  return { tools, log, files };
}

/** The value of every byte of the image in a PNG of `encodePng`. */
function pixelOf(png: Uint8Array): number {
  const data = Buffer.from(png);
  const idat = data.indexOf('IDAT');
  const length = data.readUInt32BE(idat - 4);
  const rows = inflateSync(data.subarray(idat + 4, idat + 4 + length));
  return rows[1] ?? -1;
}

describe('which compositions need FFmpeg (D50.5)', () => {
  it('finds every video node, groups included, in document order', () => {
    expect(videoNodes(VIDEO).map(({ id }) => id)).toEqual([
      'node-video-full',
      'node-video-cover',
      'node-video-contain',
    ]);
  });

  it('prepares nothing and needs no FFmpeg for a composition without video nodes', async () => {
    await expect(prepareVideos(composition(referenceComposition), [], null)).resolves.toBeNull();
  });

  it('refuses a composition with video nodes and no FFmpeg with ffmpeg-missing', async () => {
    await expect(prepareVideos(VIDEO, [VIDEO_ASSET], null)).rejects.toMatchObject({
      code: 'ffmpeg-missing',
    });
  });
});

describe('the checks before a page opens (D49.6, D50.5)', () => {
  it('probes a private copy of each video once and removes it again', async () => {
    const run = fakeTools();
    const library = await prepareVideos(VIDEO, [VIDEO_ASSET], run.tools);
    expect(run.log).toEqual([`probe ${String(BYTES.length)}`]);
    expect(run.files.every((file) => !existsSync(file))).toBe(true);
    expect(library?.manifest).toEqual({
      decoder: expect.objectContaining({
        ffmpegSha256: 'sha256:ff',
        version: 'n8.1.3-20260921',
      }) as unknown,
      decodeArgs: expect.arrayContaining(['<input>', 'rgb24', 'passthrough']) as unknown,
      sources: [
        {
          assetId: VIDEO_FIXTURE.id,
          contentHash: VIDEO_FIXTURE.contentHash,
          width: WIDTH,
          height: HEIGHT,
          frames: VIDEO_FIXTURE.frames,
          timeBase: '1/12800',
          sourceDurationUs: VIDEO_FIXTURE.sourceDurationUs,
        },
      ],
    });
  });

  it('refuses a node that samples past the end of its source with source-range-exceeded', async () => {
    // One second of source: node-video-full alone samples two.
    const short = { ...PROBE, timestamps: PROBE.timestamps.slice(0, 25) };
    await expect(prepareVideos(VIDEO, [VIDEO_ASSET], fakeTools(short).tools)).rejects.toMatchObject(
      {
        code: 'source-range-exceeded',
        message: expect.stringContaining(
          'node-video-full: samples 0 to 2000000 µs of a source of 1000000 µs',
        ) as unknown,
      },
    );
  });

  it('accepts a range that ends exactly at the end of the source', async () => {
    // 2.5 s of source: node-video-cover samples [0.5 s, 2.5 s).
    const exact = { ...PROBE, timestamps: PROBE.timestamps.slice(0, 63), lastDuration: 256 };
    await expect(
      prepareVideos(VIDEO, [VIDEO_ASSET], fakeTools(exact).tools),
    ).resolves.not.toBeNull();
  });
});

describe('the frames of a frame loop (D49.5, D50.4)', () => {
  it('hands every active node the PNG of the source frame the rule selects', async () => {
    const run = fakeTools();
    const library = await prepareVideos(VIDEO, [VIDEO_ASSET], run.tools);
    const source = await library?.open();
    if (source === undefined) throw new Error('no source');
    // 1 s: full shows source 1 s (frame 25), cover 1.5 s (37), contain 1.5 s (37).
    const frames = await source.framesAt(1_000_000);
    expect(frames.map(({ nodeId, mediaType }) => [nodeId, mediaType])).toEqual([
      ['node-video-full', 'image/png'],
      ['node-video-cover', 'image/png'],
      ['node-video-contain', 'image/png'],
    ]);
    expect(frames.map(({ bytes }) => pixelOf(bytes))).toEqual([25, 37, 37]);
    // 0.4 s: node-video-contain is not active yet; 0.4 s is frame 10 of the source.
    const early = await source.framesAt(400_000);
    expect(early.map(({ nodeId, bytes }) => [nodeId, pixelOf(bytes)])).toEqual([
      ['node-video-full', 10],
      ['node-video-cover', 22],
    ]);
    await source.close();
    expect(run.files.every((file) => !existsSync(file))).toBe(true);
  });

  it('reads forward, keeps the last frame, and restarts only to go back', async () => {
    const run = fakeTools();
    const library = await prepareVideos(VIDEO, [VIDEO_ASSET], run.tools);
    const source = await library?.open();
    if (source === undefined) throw new Error('no source');
    await source.framesAt(0);
    expect(run.log.filter((line) => line.startsWith('decode'))).toEqual([
      'decode 4x2',
      'decode 4x2',
    ]);
    // 33 333 µs: node-video-full still shows source frame 0, kept; node-video-cover reads one.
    run.log.length = 0;
    await source.framesAt(33_333);
    expect(run.log).toEqual(['read 13']);
    // Back to 0: node-video-cover restarts its decoder and reads up to frame 12 again.
    run.log.length = 0;
    await source.framesAt(0);
    expect(run.log).toEqual([
      'close decoder',
      'decode 4x2',
      ...Array.from({ length: 13 }, (_, at) => `read ${String(at)}`),
    ]);
    await source.close();
  });

  it('refuses a video that decodes to fewer frames than it was probed with', async () => {
    const run = fakeTools(PROBE, 10);
    const library = await prepareVideos(VIDEO, [VIDEO_ASSET], run.tools);
    const source = await library?.open();
    if (source === undefined) throw new Error('no source');
    await expect(source.framesAt(1_000_000)).rejects.toMatchObject({ code: 'video-undecodable' });
    await source.close();
  });
});

describe('the PNG of a decoded frame (D50.5)', () => {
  it('is a valid RGB PNG of the frame, the same bytes every time', () => {
    const rgb = new Uint8Array(WIDTH * HEIGHT * 3).map((_, at) => at);
    const png = encodePng(WIDTH, HEIGHT, rgb);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const data = Buffer.from(png);
    expect(data.readUInt32BE(16)).toBe(WIDTH);
    expect(data.readUInt32BE(20)).toBe(HEIGHT);
    expect([...data.subarray(24, 29)]).toEqual([8, 2, 0, 0, 0]);
    const idat = data.indexOf('IDAT');
    const rows = inflateSync(data.subarray(idat + 4, idat + 4 + data.readUInt32BE(idat - 4)));
    const stride = WIDTH * 3;
    expect(rows[0]).toBe(0);
    expect([...rows.subarray(1, stride + 1)]).toEqual([...rgb.subarray(0, stride)]);
    expect(rows[stride + 1]).toBe(0);
    expect(encodePng(WIDTH, HEIGHT, rgb)).toEqual(png);
  });
});

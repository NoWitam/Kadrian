/**
 * Video nodes in the Producer (D50.5) on a fake FFmpeg: which videos are
 * probed, the range check before any page opens, the source frame of every
 * active node by the rule of D49.5, a decoder that only reads forward, the
 * PNG it hands to the page, and the private copies it removes. The pinned
 * FFmpeg itself is exercised in `tests/pinned`.
 */
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

import type { VerifiedAsset } from '@kadrion/renderer-dom';
import { validateComposition, type ValidatedComposition } from '@kadrion/schema';
import { VIDEO_FIXTURE, referenceComposition, videoComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  parseDataDump,
  parseDisplayMatrix,
  seekStart,
  videoSeekArgs,
  type FfmpegTools,
  type VideoProbe,
} from '../src/ffmpeg.js';
import { isPathAsset, resolveProducerAsset, type PathAsset } from '../src/media-path.js';
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
  orientation: { rotation: 0, flipped: false },
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

/** The frame of `probe` shown at `startUs`, a time rounded down to whole microseconds. */
function frameAtUs(probe: VideoProbe, startUs: number): number {
  const { num, den } = probe.timeBase;
  const index = probe.timestamps.findIndex(
    (ticks) => Math.floor((ticks * num * 1_000_000) / den) === startUs,
  );
  if (index < 0) throw new Error(`No frame starts at ${String(startUs)} µs.`);
  return index;
}

function fakeTools(
  probe: VideoProbe = PROBE,
  frames = probe.timestamps.length,
  // An IDR picture every 25 frames, as the fixture video has (-g 25).
  idrs: readonly number[] = probe.timestamps.filter((_, at) => at % 25 === 0),
): FakeRun {
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
    decodeVideo(file: string, width: number, height: number, startUs?: number) {
      files.push(file);
      log.push(
        `decode ${String(width)}x${String(height)}${startUs === undefined ? '' : ` from ${String(startUs)}`}`,
      );
      let next = startUs === undefined ? 0 : frameAtUs(probe, startUs);
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
    idrTimestamps(file: string) {
      files.push(file);
      log.push('idrs');
      return Promise.resolve([...idrs]);
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
    // Back to 0: node-video-cover goes back to frame 12, whose IDR picture is frame 0, so it
    // starts again from frame 0 without a seek and reads up to frame 12 again.
    run.log.length = 0;
    await source.framesAt(0);
    expect(run.log).toEqual([
      'close decoder',
      'idrs',
      'decode 4x2',
      ...Array.from({ length: 13 }, (_, at) => `read ${String(at)}`),
    ]);
    expect(library?.manifest).not.toHaveProperty('seekArgs');
    await source.close();
  });

  /** The video composition with node-video-full alone, which shows source frame i at i · 40 ms. */
  const fullOnly = composition(
    (() => {
      const draft = structuredClone(videoComposition) as {
        scenes: { nodes: { id: string }[] }[];
      };
      for (const scene of draft.scenes) {
        scene.nodes = scene.nodes.filter(
          ({ id }) => id === 'node-background' || id === 'node-video-full',
        );
      }
      return draft;
    })(),
  );

  it('goes back by a seek to the IDR picture before the frame, and keeps a window from there (D82.5)', async () => {
    const run = fakeTools();
    const library = await prepareVideos(fullOnly, [VIDEO_ASSET], run.tools);
    const source = await library?.open();
    if (source === undefined || library === null) throw new Error('no source');
    expect(library.manifest).not.toHaveProperty('seekArgs');
    run.log.length = 0;
    const shown: number[] = [];
    // Frames 49 down to 0, as a reversed clip asks for them.
    for (let frame = 49; frame >= 0; frame -= 1) {
      const [full] = await source.framesAt(frame * 40_000);
      shown.push(pixelOf(full?.bytes ?? new Uint8Array()));
    }
    expect(shown).toEqual(Array.from({ length: 50 }, (_, at) => 49 - at));
    const reads = (from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, at) => `read ${String(from + at)}`);
    expect(run.log).toEqual([
      // A fresh decoder reads forward, as before.
      'decode 4x2',
      ...reads(0, 49),
      // Frame 48 lies behind it: a seek to the IDR picture of frame 25 (1 s), read up to 48.
      'close decoder',
      'idrs',
      'decode 4x2 from 1000000',
      ...reads(25, 48),
      // Frames 47 to 25 come from the window; frame 24 starts again at frame 0, without a seek.
      'close decoder',
      'decode 4x2',
      ...reads(0, 24),
    ]);
    expect(library.manifest.seekArgs).toEqual(videoSeekArgs('<input>', '<start>'));
    expect(library.manifest.seekArgs).toEqual([
      ...['-nostdin', '-v', 'error', '-threads', '1', '-noautorotate'],
      ...['-seek_timestamp', '1', '-ss', '<start>', '-i', '<input>'],
      ...library.manifest.decodeArgs.slice(library.manifest.decodeArgs.indexOf('-map')),
    ]);
    await source.close();
  });

  it('keeps at most 64 frames in the window, so a long group of pictures is decoded again in parts (D82.5)', async () => {
    // 200 frames at 100 fps, one IDR picture at frame 0: node-video-full shows frame i at i · 10 ms.
    const probe: VideoProbe = {
      ...PROBE,
      timestamps: Array.from({ length: 200 }, (_, at) => at * 128),
      lastDuration: 128,
    };
    const run = fakeTools(probe, 200, [0]);
    const library = await prepareVideos(fullOnly, [VIDEO_ASSET], run.tools);
    const source = await library?.open();
    if (source === undefined || library === null) throw new Error('no source');
    const at = async (frame: number) =>
      pixelOf((await source.framesAt(frame * 10_000))[0]?.bytes ?? new Uint8Array());
    expect(await at(196)).toBe(196);
    run.log.length = 0;
    // Back to 193: from frame 0 again, the window keeps frames 130 to 193.
    expect(await at(193)).toBe(193);
    expect(run.log.filter((line) => line.startsWith('read'))).toHaveLength(194);
    run.log.length = 0;
    expect(await at(130)).toBe(130);
    expect(run.log).toEqual([]);
    expect(await at(129)).toBe(129);
    expect(run.log.filter((line) => line.startsWith('read'))).toHaveLength(130);
    // No IDR picture but the first: no seek, and the manifest stays as it was.
    expect(library.manifest).not.toHaveProperty('seekArgs');
    await source.close();
  });

  it('reads the IDR pictures of a video once for every frame loop of a render', async () => {
    const run = fakeTools();
    const library = await prepareVideos(fullOnly, [VIDEO_ASSET], run.tools);
    for (let loop = 0; loop < 2; loop += 1) {
      const source = await library?.open();
      if (source === undefined) throw new Error('no source');
      await source.framesAt(1_960_000);
      await source.framesAt(1_920_000);
      await source.close();
    }
    expect(run.log.filter((line) => line === 'idrs')).toHaveLength(1);
    expect(run.log.filter((line) => line === 'decode 4x2 from 1000000')).toHaveLength(2);
  });

  it('turns the frames of a rotated video after the conversion to RGB, and records the size as shown (D81)', async () => {
    const run = fakeTools({ ...PROBE, orientation: { rotation: 90, flipped: false } });
    const library = await prepareVideos(VIDEO, [VIDEO_ASSET], run.tools);
    expect(library?.manifest.sources[0]).toMatchObject({ width: HEIGHT, height: WIDTH });
    expect(library?.manifest.decodeArgs).toContain('-noautorotate');
    const source = await library?.open();
    if (source === undefined) throw new Error('no source');
    const [full] = await source.framesAt(1_000_000);
    // FFmpeg decodes the coded size; the PNG is of the turned picture.
    expect(run.log.filter((line) => line.startsWith('decode'))[0]).toBe('decode 4x2');
    const data = Buffer.from(full?.bytes ?? new Uint8Array());
    expect([data.readUInt32BE(16), data.readUInt32BE(20)]).toEqual([HEIGHT, WIDTH]);
    expect(pixelOf(full?.bytes ?? new Uint8Array())).toBe(25);
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

describe('a video read by path (D64)', () => {
  /** The video's bytes in a file of the host's, verified by path. */
  async function pathAsset(): Promise<{ readonly asset: PathAsset; readonly done: () => void }> {
    const dir = mkdtempSync(join(tmpdir(), 'kadrion-host-'));
    const path = join(dir, 'clip.mp4');
    writeFileSync(path, BYTES);
    const asset = await resolveProducerAsset(
      {
        id: VIDEO_FIXTURE.id,
        type: 'video',
        contentHash: `sha256:${createHash('sha256').update(BYTES).digest('hex')}`,
      },
      () => ({ path, mediaType: VIDEO_FIXTURE.mediaType }),
      () => Promise.reject(new Error('bytes are not hashed here')),
      undefined,
    );
    if (!isPathAsset(asset)) throw new Error('not read by path');
    return {
      asset,
      done: () => {
        rmSync(dir, { recursive: true, force: true });
      },
    };
  }

  it('probes and decodes the host file itself, and gives the same frames as bytes', async () => {
    const { asset, done } = await pathAsset();
    try {
      const run = fakeTools();
      const library = await prepareVideos(VIDEO, [asset], run.tools);
      const source = await library?.open();
      if (source === undefined) throw new Error('no source');
      const frames = await source.framesAt(1_000_000);
      expect(frames.map(({ bytes }) => pixelOf(bytes))).toEqual([25, 37, 37]);
      await source.close();
      expect(new Set(run.files)).toEqual(new Set([asset.path]));
      // The host's file stays; nothing of it was copied or removed.
      expect(existsSync(asset.path)).toBe(true);
      const copied = fakeTools();
      const fromBytes = await (await prepareVideos(VIDEO, [VIDEO_ASSET], copied.tools))?.open();
      const same = await fromBytes?.framesAt(1_000_000);
      await fromBytes?.close();
      expect(same?.map(({ bytes }) => [...bytes])).toEqual(frames.map(({ bytes }) => [...bytes]));
    } finally {
      done();
    }
  });

  it('refuses a file changed after the probe before any frame of it reaches the page', async () => {
    const { asset, done } = await pathAsset();
    try {
      const library = await prepareVideos(VIDEO, [asset], fakeTools().tools);
      const source = await library?.open();
      if (source === undefined) throw new Error('no source');
      await source.framesAt(0);
      appendFileSync(asset.path, 'x');
      await expect(source.framesAt(400_000)).rejects.toMatchObject({ code: 'asset-changed' });
      await source.close();
    } finally {
      done();
    }
  });

  it('refuses a file changed while it was probed', async () => {
    const { asset, done } = await pathAsset();
    try {
      const run = fakeTools();
      const probe = run.tools.probeVideo.bind(run.tools);
      const tools = {
        ...run.tools,
        probeVideo: async (path: string) => {
          const facts = await probe(path);
          appendFileSync(path, 'x');
          return facts;
        },
      };
      await expect(prepareVideos(VIDEO, [asset], tools)).rejects.toMatchObject({
        code: 'asset-changed',
      });
    } finally {
      done();
    }
  });
});

describe('the display matrix of ffprobe (D81)', () => {
  it('reads the fixed point of its three rows as real numbers', () => {
    expect(
      parseDisplayMatrix(
        '\n00000000:            0      -65536           0\n00000001:        65536           0           0\n00000002:            0           0  1073741824\n',
      ),
    ).toEqual([0, -1, 0, 1, 0, 0, 0, 0, 1]);
    expect(
      parseDisplayMatrix(
        '\n00000000:        46340      -46340           0\n00000001:        46340       46340           0\n00000002:            0           0  1073741824\n',
      )?.slice(0, 2),
    ).toEqual([46340 / 65536, -46340 / 65536]);
  });

  it('refuses text of another form', () => {
    expect(parseDisplayMatrix('')).toBeNull();
    expect(parseDisplayMatrix('\n00000000: 0 1\n')).toBeNull();
    expect(parseDisplayMatrix('\n00000000: a b c\n00000001: 0 0 0\n00000002: 0 0 1\n')).toBeNull();
  });
});

describe('the arguments of a seek (D82.5)', () => {
  it('writes a time of whole microseconds as FFmpeg reads it', () => {
    expect(seekStart(0)).toBe('0.000000');
    expect(seekStart(1_000_000)).toBe('1.000000');
    expect(seekStart(80_000)).toBe('0.080000');
    expect(seekStart(3_600_000_001)).toBe('3600.000001');
    expect(() => seekStart(-1)).toThrow();
    expect(() => seekStart(0.5)).toThrow();
  });

  it("seeks by the stream's own timestamps before the input, and decodes as the forward decode does", () => {
    const args = videoSeekArgs('/v.mp4', '1.000000');
    expect(args.slice(0, args.indexOf('-i') + 2)).toEqual([
      ...['-nostdin', '-v', 'error', '-threads', '1', '-noautorotate'],
      ...['-seek_timestamp', '1', '-ss', '1.000000', '-i', '/v.mp4'],
    ]);
  });
});

describe('the data dump of ffprobe (D82.5)', () => {
  it('reads the bytes of the hexadecimal groups before the text of each row', () => {
    const dump =
      '\n00000000: 0164 000c ffe1 001a 6764 000c acd9 4141  .d......gd....AA\n00000010: 9960 01                                  .`.\n';
    expect([...parseDataDump(dump)]).toEqual([
      0x01, 0x64, 0x00, 0x0c, 0xff, 0xe1, 0x00, 0x1a, 0x67, 0x64, 0x00, 0x0c, 0xac, 0xd9, 0x41,
      0x41, 0x99, 0x60, 0x01,
    ]);
    expect(parseDataDump('')).toHaveLength(0);
    expect(parseDataDump('00000000: zz')).toHaveLength(0);
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

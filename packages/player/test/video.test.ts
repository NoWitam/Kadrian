/**
 * The parts of the Player's video path that need no browser (D51, D79): the
 * incremental SHA-256, the container reader on Mediabunny and the verdict of
 * `inspectVideo`, the colour facts of the H.264 stream, the IDR check, and the
 * YUV-to-RGB conversion that repeats the Producer's FFmpeg. Files of every
 * container are written here by Mediabunny's own muxer around opaque samples;
 * that the reader's facts equal ffprobe's and the pixels equal FFmpeg's on
 * real files of the pinned FFmpeg is proven by the pinned tests
 * (`tests/pinned/inspect.pinned.test.ts`, `tests/pinned/player-video.pinned.test.ts`);
 * here the conversion is checked against three outputs of the pinned FFmpeg
 * for one small frame.
 */
import { createHash } from 'node:crypto';

import {
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedVideoPacketSource,
  MkvOutputFormat,
  MovOutputFormat,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
  type OutputFormat,
  type Rotation,
  type TransformationMatrix,
} from 'mediabunny';
import { holdsIdr } from '@kadrion/renderer-dom';
import { describe, expect, it } from 'vitest';

import { inspectVideo } from '../src/index.js';
import { avcColour } from '../src/avc.js';
import { readVideoTrack } from '../src/container.js';
import { Sha256 } from '../src/sha256.js';
import { blobSha256, RUN_CACHE_BYTES, RunCache, type DecodedPlanes } from '../src/video.js';
import { yuv420ToRgb } from '../src/yuv.js';
import { nalSample, payloadOf, testMp4, testSps, type TestSample } from './media.js';

function nodeSha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

describe('the incremental SHA-256 (D51.2)', () => {
  it('equals node:crypto for every length around the block boundaries, in any chunking', () => {
    const bytes = Uint8Array.from({ length: 300 }, (_, at) => (at * 37 + 11) & 255);
    for (const length of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 128, 300]) {
      const whole = bytes.subarray(0, length);
      expect(new Sha256().update(whole).digest(), String(length)).toBe(nodeSha256(whole));
      const chunked = new Sha256();
      for (let at = 0; at < length; at += 7) chunked.update(whole.subarray(at, at + 7));
      expect(chunked.digest(), `${String(length)} in chunks`).toBe(nodeSha256(whole));
    }
  });

  it('hashes a Blob chunk by chunk to the same digest', async () => {
    const bytes = Uint8Array.from({ length: 9 * 1024 * 1024 + 3 }, (_, at) => (at * 13) & 255);
    expect(await blobSha256(new Blob([bytes]))).toBe(nodeSha256(bytes));
  });

  it('refuses a second digest', () => {
    const hash = new Sha256();
    hash.digest();
    expect(() => hash.digest()).toThrow();
  });
});

/** The `avcC` record of a stream with this sequence parameter set (4-byte NAL lengths). */
function avcC(sps: Uint8Array): Uint8Array {
  return new Uint8Array([
    1,
    sps[1] ?? 66,
    0,
    30,
    0xff,
    0xe1,
    sps.length >> 8,
    sps.length & 255,
    ...sps,
    0,
  ]);
}

/** One track of a file Mediabunny's muxer writes: its packets and its configuration. */
interface Muxed {
  readonly format: OutputFormat;
  readonly codec?: 'avc' | 'hevc' | 'vp9' | 'av1';
  readonly config?: VideoDecoderConfig;
  readonly rotation?: Rotation;
  readonly flip?: boolean;
  /** A whole display matrix, which takes precedence over `rotation` and `flip`. */
  readonly matrix?: TransformationMatrix;
  /** Packets in decode order: presentation time in seconds and whether it is a key. */
  readonly packets?: readonly { readonly time: number; readonly key: boolean }[];
  readonly audioChannels?: number;
}

const AVC_CONFIG: VideoDecoderConfig = {
  codec: 'avc1.42001e',
  codedWidth: 32,
  codedHeight: 16,
  description: avcC(testSps(32, 16)),
};

/** I P B B P at 25 fps, in decode order, as an encoder with B-frames writes them. */
const REORDERED = [
  { time: 0, key: true },
  { time: 0.12, key: false },
  { time: 0.04, key: false },
  { time: 0.08, key: false },
  { time: 0.16, key: false },
];

/** A file of one video track, and optionally a sound, written by Mediabunny's muxer. */
async function muxed(options: Muxed): Promise<Uint8Array<ArrayBuffer>> {
  const target = new BufferTarget();
  const output = new Output({ format: options.format, target });
  const video = new EncodedVideoPacketSource(options.codec ?? 'avc');
  output.addVideoTrack(video, {
    frameRate: 25,
    rotation: options.rotation ?? 0,
    flip: options.flip ?? false,
    ...(options.matrix === undefined ? {} : { transformationMatrix: options.matrix }),
  });
  const audio =
    options.audioChannels === undefined ? null : new EncodedAudioPacketSource('pcm-s16');
  if (audio !== null) output.addAudioTrack(audio);
  await output.start();
  for (const [at, { time, key }] of (options.packets ?? REORDERED).entries()) {
    await video.add(
      new EncodedPacket(
        nalSample(new Uint8Array([16 + at, at]), key),
        key ? 'key' : 'delta',
        time,
        0.04,
      ),
      at === 0 ? { decoderConfig: options.config ?? AVC_CONFIG } : undefined,
    );
  }
  if (audio !== null) {
    const channels = options.audioChannels ?? 2;
    await audio.add(new EncodedPacket(new Uint8Array(channels * 2 * 480), 'key', 0, 0.01), {
      decoderConfig: { codec: 'pcm-s16', numberOfChannels: channels, sampleRate: 48_000 },
    });
  }
  await output.finalize();
  if (target.buffer === null) throw new Error('The muxer wrote nothing.');
  return new Uint8Array(target.buffer);
}

/** The codes of the reasons of a file's verdict. */
async function codesOf(bytes: Uint8Array): Promise<string[]> {
  return (await inspectVideo(bytes)).reasons.map(({ code }) => code);
}

describe('the container reader on Mediabunny (D51.3, D79)', () => {
  /** Five samples in decode order I P B B P, as an encoder with B-frames writes them. */
  const reordered: TestSample[] = [
    { data: new Uint8Array([10, 0]), duration: 40, offset: 80, sync: true },
    { data: new Uint8Array([20, 1]), duration: 40, offset: 160, sync: false },
    { data: new Uint8Array([30, 2]), duration: 40, offset: 40, sync: false },
    { data: new Uint8Array([40, 3]), duration: 40, offset: 40, sync: false },
    { data: new Uint8Array([50, 4]), duration: 40, offset: 80, sync: false },
  ];

  it('reads presentation timestamps in presentation order, shifted by the edit, and the last duration', async () => {
    const track = await readVideoTrack(
      new Blob([testMp4({ samples: reordered, editMediaTime: 80, timescale: 1000 })]),
    );
    // pts = dts + offset: 80, 200, 120, 160, 240; minus the edit of 80.
    expect(track.timestamps).toEqual([0, 40, 80, 120, 160]);
    expect(track.presentation).toEqual([0, 2, 3, 1, 4]);
    expect(track.samples.map(({ sync }) => sync)).toEqual([true, false, false, false, false]);
    expect(track.lastDuration).toBe(40);
    expect(track.timeBase).toEqual({ num: 1, den: 1000 });
    expect(track.codec).toBe('avc1.42001e');
    expect({ width: track.width, height: track.height }).toEqual({ width: 32, height: 16 });
    expect(track.colour).toEqual({ matrix: 'bt601', fullRange: false });
  });

  it('reads the bytes of every sample in decode order, from any sample', async () => {
    const track = await readVideoTrack(new Blob([testMp4({ samples: reordered })]));
    const all: number[][] = [];
    for await (const bytes of track.readSamples(0, 4)) all.push([...payloadOf(bytes)]);
    expect(all).toEqual(reordered.map(({ data }) => [...data]));
    const middle: number[][] = [];
    for await (const bytes of track.readSamples(2, 3)) middle.push([...payloadOf(bytes)]);
    expect(middle).toEqual([
      [30, 2],
      [40, 3],
    ]);
  });

  it.each([
    ['MP4', new Mp4OutputFormat(), 'mp4', { num: 1, den: 25 }],
    [
      'fragmented MP4',
      new Mp4OutputFormat({ fastStart: 'fragmented' }),
      'mp4',
      { num: 1, den: 25 },
    ],
    ['QuickTime', new MovOutputFormat(), 'mov', { num: 1, den: 25 }],
    ['Matroska', new MkvOutputFormat(), 'mkv', { num: 1, den: 1000 }],
  ] as const)('reads H.264 in %s with the same frames', async (_, format, container, timeBase) => {
    const bytes = await muxed({ format });
    const inspection = await inspectVideo(bytes);
    expect(inspection).toMatchObject({ playable: true, reasons: [], container });
    expect(inspection.video).toMatchObject({
      codec: 'avc',
      codecString: 'avc1.42001e',
      width: 32,
      height: 16,
      frames: 5,
      durationUs: 200_000,
      timeBase,
      frameRate: { num: 25, den: 1 },
    });
    const track = await readVideoTrack(new Blob([bytes]));
    const ticks = timeBase.den / 25;
    expect(track.timestamps).toEqual([0, 1, 2, 3, 4].map((frame) => frame * ticks));
    expect(track.presentation).toEqual([0, 2, 3, 1, 4]);
    const payloads: number[] = [];
    for await (const sample of track.readSamples(0, 4)) payloads.push(payloadOf(sample)[0] ?? 0);
    expect(payloads).toEqual([16, 17, 18, 19, 20]);
  });

  it.each([
    [
      'VP9 in WebM',
      {
        format: new WebMOutputFormat(),
        codec: 'vp9',
        config: { codec: 'vp09.00.10.08', codedWidth: 32, codedHeight: 16 },
      },
      'webm',
    ],
    [
      'AV1 in Matroska',
      {
        format: new MkvOutputFormat(),
        codec: 'av1',
        config: { codec: 'av01.0.04M.08', codedWidth: 32, codedHeight: 16 },
      },
      'mkv',
    ],
  ] as const)('gives the verdict "codec" for %s, with its facts', async (_, options, container) => {
    const inspection = await inspectVideo(await muxed(options));
    expect(inspection).toMatchObject({ playable: false, container });
    expect(inspection.reasons.map(({ code }) => code)).toEqual(['codec']);
    expect(inspection.video).toMatchObject({
      codec: options.codec,
      frames: 5,
      durationUs: 200_000,
    });
    await expect(readVideoTrack(new Blob([await muxed(options)]))).rejects.toMatchObject({
      code: 'video-unsupported',
      details: [expect.stringMatching(/^codec: /) as unknown],
    });
  });

  it.each([
    ['MP4', () => new Mp4OutputFormat(), 90, false],
    ['MP4', () => new Mp4OutputFormat(), 180, false],
    ['MP4', () => new Mp4OutputFormat(), 270, true],
    ['MOV', () => new MovOutputFormat(), 0, true],
    ['MKV', () => new MkvOutputFormat(), 90, true],
  ] as const)(
    'reads %s turned by %i° (mirrored: %s) as it is, with the size as shown (D81)',
    async (_, format, rotation, flip) => {
      const bytes = await muxed({ format: format(), rotation, flip });
      const inspection = await inspectVideo(bytes);
      expect(inspection.reasons).toEqual([]);
      const turned = rotation % 180 !== 0;
      expect(inspection.video).toMatchObject({
        width: turned ? 16 : 32,
        height: turned ? 32 : 16,
        rotation,
        flipped: flip,
      });
      const track = await readVideoTrack(new Blob([bytes]));
      // The decoder is configured with the coded size; the turn follows the conversion.
      expect(track).toMatchObject({
        width: 32,
        height: 16,
        orientation: { rotation, flipped: flip },
      });
    },
  );

  it('gives the verdict "rotation" for a display matrix that is not a quarter turn (D81)', async () => {
    const half = Math.SQRT1_2;
    const bytes = await muxed({
      format: new Mp4OutputFormat(),
      matrix: [half, half, 0, -half, half, 0, 0, 0, 1],
    });
    const inspection = await inspectVideo(bytes);
    expect(inspection.reasons.map(({ code }) => code)).toEqual(['rotation']);
    // Mediabunny rounds the angle to a quarter turn; the verdict states none.
    expect(inspection.video).toMatchObject({ width: 32, height: 16, rotation: 0, flipped: false });
    await expect(readVideoTrack(new Blob([bytes]))).rejects.toMatchObject({
      code: 'video-unsupported',
      details: [expect.stringMatching(/^rotation: /) as unknown],
    });
    const scaled = await inspectVideo(
      await muxed({ format: new Mp4OutputFormat(), matrix: [2, 0, 0, 0, 2, 0, 0, 0, 1] }),
    );
    expect(scaled.reasons.map(({ code }) => code)).toEqual(['rotation']);
  });

  it('states the sound, and refuses one of more than two channels for the sound only (D53.2)', async () => {
    const stereo = await inspectVideo(
      await muxed({ format: new MkvOutputFormat(), audioChannels: 2 }),
    );
    expect(stereo).toMatchObject({
      playable: true,
      audio: { codec: 'pcm-s16', channels: 2, sampleRate: 48_000 },
    });
    const surround = await muxed({ format: new MkvOutputFormat(), audioChannels: 6 });
    expect(await codesOf(surround)).toEqual(['audio-channels']);
    // The picture still plays: the Player refuses such a sound only where it plays it.
    expect((await readVideoTrack(new Blob([surround]))).timestamps).toHaveLength(5);
  });

  it('reads a frame rate only when every frame lasts as long', async () => {
    const uneven = await inspectVideo(
      await muxed({
        format: new MkvOutputFormat(),
        packets: [
          { time: 0, key: true },
          { time: 0.04, key: false },
          { time: 0.1, key: false },
        ],
      }),
    );
    expect(uneven.video).toMatchObject({ frames: 3, frameRate: null });
  });

  it.each([
    ['a file of no known format', new Uint8Array([1, 2, 3, 4, 5]), ['unreadable']],
    ['a file without a moov box', testMp4({ samples: reordered, withoutMoov: true }), ['no-video']],
    ['an edit that cuts frames', testMp4({ samples: reordered, editMediaTime: 120 }), ['timing']],
    [
      'two edits, which Mediabunny reads only in part',
      testMp4({
        samples: reordered,
        edits: [
          { duration: 80, mediaTime: 80 },
          { duration: 80, mediaTime: 200 },
        ],
      }),
      ['timing'],
    ],
    [
      'two frames at one time',
      testMp4({
        samples: [
          { data: new Uint8Array([1]), duration: 40, offset: 40, sync: true },
          { data: new Uint8Array([2]), duration: 40, offset: 0, sync: false },
        ],
      }),
      ['timing'],
    ],
    [
      'a first sample that is not a sync sample',
      testMp4({ samples: [reordered[1] as TestSample, reordered[0] as TestSample] }),
      ['timing'],
    ],
    [
      '10-bit H.264',
      testMp4({ samples: reordered, sps: { profile: 100, bitDepth: 10 } }),
      ['bit-depth'],
    ],
    [
      '4:2:2 H.264',
      testMp4({ samples: reordered, sps: { profile: 100, chromaFormat: 2 } }),
      ['chroma'],
    ],
    [
      'interlaced H.264',
      testMp4({ samples: reordered, sps: { progressive: false } }),
      ['interlaced'],
    ],
    [
      'BT.2020 H.264',
      testMp4({
        samples: reordered,
        sps: { vui: { fullRange: false, primaries: 9, transfer: 16, matrix: 9 } },
      }),
      ['colour'],
    ],
  ])(
    'gives the verdict of %s, and the Player refuses it with video-unsupported',
    async (_, bytes, codes) => {
      expect(await codesOf(bytes)).toEqual(codes);
      await expect(readVideoTrack(new Blob([bytes]))).rejects.toMatchObject({
        code: 'video-unsupported',
      });
    },
  );

  it('copies bytes, and takes a Blob as it is', async () => {
    const bytes = testMp4({ samples: reordered });
    const inspection = await inspectVideo(bytes);
    bytes.fill(0);
    expect(inspection.playable).toBe(true);
    expect((await inspectVideo(new Blob([testMp4({ samples: reordered })]))).playable).toBe(true);
    expect(Object.isFrozen(inspection) && Object.isFrozen(inspection.reasons)).toBe(true);
  });
});

describe('the IDR picture a decode starts from (D79.5)', () => {
  const record = avcC(testSps(32, 16));

  it('finds an IDR slice among the NAL units of a sample', () => {
    expect(holdsIdr(record, nalSample(new Uint8Array([1, 2]), true))).toBe(true);
    expect(holdsIdr(record, nalSample(new Uint8Array([1, 2]), false))).toBe(false);
    const both = new Uint8Array([
      ...nalSample(new Uint8Array([6]), false),
      ...nalSample(new Uint8Array([7]), true),
    ]);
    expect(holdsIdr(record, both)).toBe(true);
  });

  it('refuses bytes whose NAL lengths do not fit', () => {
    expect(holdsIdr(record, new Uint8Array([0, 0, 0, 9, 0x65]))).toBe(false);
    expect(holdsIdr(record, new Uint8Array([]))).toBe(false);
  });
});

describe('the colour facts of the stream (D51.4)', () => {
  it.each([
    ['no VUI', null, { matrix: 'bt601', fullRange: false }],
    [
      'a range without a colour description',
      { fullRange: true },
      { matrix: 'bt601', fullRange: true },
    ],
    [
      'BT.709',
      { fullRange: false, primaries: 1, transfer: 1, matrix: 1 },
      { matrix: 'bt709', fullRange: false },
    ],
    [
      'SMPTE 170M',
      { fullRange: false, primaries: 6, transfer: 6, matrix: 6 },
      { matrix: 'bt601', fullRange: false },
    ],
    [
      'BT.470 BG',
      { fullRange: false, primaries: 5, transfer: 5, matrix: 5 },
      { matrix: 'bt601', fullRange: false },
    ],
  ])('converts %s as FFmpeg does', (_, vui, expected) => {
    expect(avcColour(avcC(testSps(32, 16, { vui })), null)).toEqual(expected);
  });

  it.each([
    ['10-bit video', testSps(32, 16, { profile: 100, bitDepth: 10 }), null, 'bit-depth'],
    ['4:2:2 video', testSps(32, 16, { profile: 100, chromaFormat: 2 }), null, 'chroma'],
    ['interlaced video', testSps(32, 16, { progressive: false }), null, 'interlaced'],
    [
      'BT.2020',
      testSps(32, 16, { vui: { fullRange: false, primaries: 9, transfer: 16, matrix: 9 } }),
      null,
      'colour',
    ],
    [
      'a container colour that disagrees',
      testSps(32, 16, { vui: { fullRange: false, primaries: 1, transfer: 1, matrix: 1 } }),
      { primaries: 6, transfer: 6, matrix: 6, fullRange: false },
      'colour',
    ],
    [
      'a container colour where the stream says nothing',
      testSps(32, 16),
      { primaries: 1, transfer: 1, matrix: 1, fullRange: false },
      'colour',
    ],
    [
      'a container range that disagrees',
      testSps(32, 16, { vui: { fullRange: true } }),
      { primaries: null, transfer: null, matrix: null, fullRange: false },
      'colour',
    ],
    [
      'a container colour by a name the Player does not know',
      testSps(32, 16),
      { primaries: null, transfer: null, matrix: -1, fullRange: null },
      'colour',
    ],
  ] as const)('refuses %s with video-unsupported and its reason', (_, sps, colr, reason) => {
    expect(() => avcColour(avcC(sps), colr)).toThrow(
      expect.objectContaining({ code: 'video-unsupported', reason }),
    );
  });

  it('follows the stream where the container states nothing, field by field', () => {
    const sps = testSps(32, 16, {
      vui: { fullRange: false, primaries: 5, transfer: 5, matrix: 5 },
    });
    // Mediabunny names no transfer 5 (gamma 2.8): the container states nothing of it.
    expect(
      avcColour(avcC(sps), { primaries: 5, transfer: null, matrix: 5, fullRange: false }),
    ).toEqual({ matrix: 'bt601', fullRange: false });
  });

  it('accepts High profile 8-bit 4:2:0 and a colr box that agrees', () => {
    const sps = testSps(32, 16, {
      profile: 100,
      vui: { fullRange: false, primaries: 1, transfer: 1, matrix: 1 },
    });
    expect(
      avcColour(avcC(sps), { primaries: 1, transfer: 1, matrix: 1, fullRange: false }),
    ).toEqual({
      matrix: 'bt709',
      fullRange: false,
    });
  });
});

/** A 16x8 4:2:0 frame of pseudo-random samples in 16–239, the input the expected outputs were made from. */
function tinyFrame(): Uint8Array {
  const bytes = new Uint8Array(16 * 8 * 1.5);
  let state = 12345;
  for (let at = 0; at < bytes.length; at += 1) {
    // In doubles, as the generator that made the expected outputs: not Math.imul.
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    bytes[at] = 16 + ((state >> 16) % 224);
  }
  return bytes;
}

/**
 * The pinned FFmpeg's RGB of `tinyFrame()`, made with
 * `ffmpeg -f rawvideo -pix_fmt yuv420p -s 16x8 [-color_range pc | -colorspace bt709] -i tiny.yuv
 * -sws_flags bitexact+accurate_rnd+full_chroma_int -pix_fmt rgb24 -f rawvideo`.
 */
const FFMPEG_RGB = {
  bt601:
    'Qv9cAP8mAPYpWt64xBj/yDT/AIslAI8QWG3/XwB8uwAA/z0ArQAAmQAA/7Y/rhUAWrV1AF0YKaVWVIOfgA71/KL/u//bQ8FB+sv//67r5UQA0kwAjkQj7aGg/8uMyRwAmAC17DT3igBw/6H/RDv/TlnuXzAL/+dl/6Y8/6cg/8gAGhkACoGxlub/uUtv0gIA4ADH/xH4oABkskTZHVf/ADSw/9vM/3MMmBQAZxMA//9rMXcQa///J4Ta1GW1/4jV/5HfkAAEZwAV2Of/HJ7/ADugvcHFGw0AhdHYAHSZADBoADIshclB38JfbwA//2H/vztg4Xl9qHY64v/mM7D/AD25FgdFo5G3pv//AIPNW9L/HV9bcHEA//dH/2uXlABobfX/AFFrk38AUioAk7v/Sk3/7l///2r37rfvs4yHpS0T/44yok4A/+wq2jIA/4I/H///hP//a2IAcCwAk5zz4bz/mwDR/5H/02Oa/6+L/8F6/6cpliIArUgA/4gA8CIA',
  full: 'Rv9dBvAuAOUyXM+uuiP1vjv6AIkvAIwdW23zYwB9swkA/EQApwYAlgUA/6xDqCIAXKx0B2EkMp5ZV4CZfxvm6pr/sP/MSLdH577x/6Ta10oAx1EAi0ot3ZqZ/72GvycAlACv3TvniABy85r/SkL/U1zfYzkZ/9Zk/55B/58o/7wEJyYAF4Cpj9b/sE9vyBEO0wC9/xznnQBoqknMKFv8AD2q/8u/9XIXlCAAaiAA//dpOXccafX/MILNyGas/4PH/4vPjwATagsiydb+Jpj/AEOcsra5KBsBgsTKAHSVADprADw2gr5G0LZfcQBH/2H/tkFi03d7oXVA0vDVOqj3AEWyIxZMnIytnfP/AIHDXcX/KGJecHIA/+RK92qRkQBrbOP/DlZtj30AVzQAjbH+T1H/3mD/+mrm3a3eq4iEoDYf/4k4nFMA/9owzToA/39EJ/n/gP//bGQAcjUAjpXj0bH/mADG/4v/x2SV/6aG/7V2/54wky0Apk4A/4QA4iwA',
  bt709:
    'MP9WANwhAM4lUM+40Db/0k//AHIjAG4PVHT/aQCBzQcA/0gAvgIAqQEA/744vRsAU6l0AE8WH5RUT4Chhif9/7b/s//aOq4+/dP//8Dr9EwA4FAAlEkg9Kmf/9WH2ScApQC8+lH9lgB0/7T/Qkj/S2D0ZDMJ/+pe/7A1/68Y/8YAHBEAAHm0juX/wldv5RYA9QDO/zj+sgBouVfeFlz/ADW2/+HL/3sFpRkAcBMA//9kLGoNXfv/HoDe3XS3/6HW/63eoQADcAcV1uj/EJn/ADWmvcHFHQ0Af8raAGmdACVsACYtgbs8479aewBB/4D/ykpg6oN7rXc24P/lJ6n/ADrAFgxHpJW4nf//AHnTUMz/F1hccmYA//U//32WowBsYO//AEptl3gAVycAjrz/Rlj/93j//4L78sDxt5CGsDcQ/5Ysq0sA/+og6jsA/5I6Cf//d///blgAeCkAkaD34c3/qQDY/7H/3HGb/7iI/9F0/7QhoyMAuEYA/48A/y0A',
};

describe('YUV to RGB as the Producer converts it (D51.4)', () => {
  const frame = tinyFrame();
  const planes = {
    width: 16,
    height: 8,
    y: frame.subarray(0, 128),
    yStride: 16,
    u: frame.subarray(128, 160),
    uStride: 8,
    v: frame.subarray(160, 192),
    vStride: 8,
  };

  it.each([
    ['BT.601, limited range', 'bt601', false, FFMPEG_RGB.bt601],
    ['BT.601, full range', 'bt601', true, FFMPEG_RGB.full],
    ['BT.709, limited range', 'bt709', false, FFMPEG_RGB.bt709],
  ] as const)('gives the bytes of the pinned FFmpeg for %s', (_, matrix, fullRange, expected) => {
    expect(Buffer.from(yuv420ToRgb(planes, matrix, fullRange)).toString('base64')).toBe(expected);
  });

  it('reads the planes through their strides', () => {
    const padded = (plane: Uint8Array, width: number, stride: number): Uint8Array => {
      const rows = plane.length / width;
      const out = new Uint8Array(rows * stride).fill(7);
      for (let row = 0; row < rows; row += 1)
        out.set(plane.subarray(row * width, (row + 1) * width), row * stride);
      return out;
    };
    const strided = {
      ...planes,
      y: padded(planes.y, 16, 24),
      yStride: 24,
      u: padded(planes.u, 8, 12),
      uStride: 12,
      v: padded(planes.v, 8, 12),
      vStride: 12,
    };
    expect(Buffer.from(yuv420ToRgb(strided, 'bt601', false)).toString('base64')).toBe(
      FFMPEG_RGB.bt601,
    );
  });

  it('maps limited-range black, white, and grey to their RGB values', () => {
    const flat = (luma: number) => ({
      ...planes,
      y: new Uint8Array(128).fill(luma),
      u: new Uint8Array(32).fill(128),
      v: new Uint8Array(32).fill(128),
    });
    expect([...yuv420ToRgb(flat(16), 'bt601', false).subarray(0, 3)]).toEqual([0, 0, 0]);
    expect([...yuv420ToRgb(flat(235), 'bt601', false).subarray(0, 3)]).toEqual([255, 255, 255]);
    expect(new Set(yuv420ToRgb(flat(126), 'bt709', false))).toEqual(new Set([128]));
  });
});

describe('the cache of decode runs (D82.4)', () => {
  const planes = (size: number, value: number): DecodedPlanes => ({
    data: new Uint8Array(size).fill(value),
    layout: [
      { offset: 0, stride: 1 },
      { offset: 0, stride: 1 },
      { offset: 0, stride: 1 },
    ],
  });
  const run = (first: number, count: number, size = 10): Map<number, DecodedPlanes> =>
    new Map(Array.from({ length: count }, (_, at) => [first + at, planes(size, first + at)]));

  it('holds 256 MiB by default', () => {
    expect(new RunCache().budget).toBe(RUN_CACHE_BYTES);
    expect(RUN_CACHE_BYTES).toBe(256 * 1024 * 1024);
  });

  it('finds the frames of a run by video and index', () => {
    const cache = new RunCache(100);
    cache.put('a', run(0, 3));
    expect(cache.get('a', 2)?.data[0]).toBe(2);
    expect(cache.get('a', 3)).toBeUndefined();
    expect(cache.get('b', 2)).toBeUndefined();
    expect(cache.bytes).toBe(30);
  });

  it('lets go of the run used least recently first, and never holds more than its budget', () => {
    const cache = new RunCache(100);
    cache.put('a', run(0, 4));
    cache.put('a', run(25, 4));
    cache.get('a', 0);
    // 40 + 40 + 40 > 100: the run of 25, used least recently, goes; the run of 0 stays.
    cache.put('b', run(50, 4));
    expect(cache.get('a', 25)).toBeUndefined();
    expect(cache.get('a', 0)).toBeDefined();
    expect(cache.get('b', 53)).toBeDefined();
    expect(cache.bytes).toBe(80);
    for (let at = 0; at < 50; at += 1) {
      cache.put('c', run(at * 10, 1 + (at % 7)));
      expect(cache.bytes).toBeLessThanOrEqual(100);
    }
  });

  it('keeps no run larger than its budget, and a frame once', () => {
    const cache = new RunCache(100);
    cache.put('a', run(0, 11));
    expect(cache.bytes).toBe(0);
    cache.put('a', run(0, 5));
    cache.put('a', run(3, 5));
    expect(cache.bytes).toBe(80);
    expect(cache.get('a', 4)?.data[0]).toBe(4);
  });
});

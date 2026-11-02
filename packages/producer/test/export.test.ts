/**
 * The MP4 export of D29 and D47 without a browser or FFmpeg: the pure parts of
 * `encode.ts` and `segments.ts`, the verification of `ffmpeg.ts` on a fake
 * host, and the export, its jobs, the join, and stills on a fake frame loop
 * and a fake FFmpeg with a fake disk. Expected arguments and sample counts are
 * written out by hand from D29 and D47, not derived from the implementation.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { Writable } from 'node:stream';

import { audioPlan } from '@kadrion/runtime';
import { generateReferenceAssets, referenceComposition } from '@kadrion/test-fixtures';
import { frameToTimeUs, validateComposition, type ValidatedComposition } from '@kadrion/schema';
import type { Browser } from 'playwright-core';
import { describe, expect, it } from 'vitest';

import {
  audioLayout,
  TIME_SCALE_PER_FRAME,
  FRAMES_IN_FLIGHT,
  FrameSink,
  presetSize,
  receiptHashes,
  samplesAt,
  videoGraph,
  type StartTimer,
} from '../src/encode.js';
import { documentsProblem, type FrameDocument } from '../src/capture.js';
import { CHROMIUM_VERSION } from '../src/environment.js';
import {
  exportWith,
  joinPlan,
  joinSegmentsWith,
  renderAudioWith,
  renderSegmentsWith,
  type AudioRequest,
  type ExportDependencies,
  type ExportRequest,
  type JoinPart,
  type SegmentsRequest,
} from '../src/export.js';
import {
  FFMPEG_CONFIGURATION,
  FFMPEG_SHA256,
  FFPROBE_SHA256,
  REQUIRED_ENCODERS,
  verifyFfmpeg,
  type AudioProbe,
  type EncoderProcess,
  type FfmpegHost,
  type FfmpegTools,
} from '../src/ffmpeg.js';
import {
  canonicalJson,
  sha256,
  type AudioManifest,
  type ExportManifest,
  type RenderManifest,
  type SegmentsManifest,
} from '../src/manifest.js';
import { ProducerError } from '../src/errors.js';
import { estimatePlan } from '../src/estimate.js';
import type { ProgressEvent } from '../src/job.js';
import { customHtmlNodes, type FrameSequence } from '../src/render.js';
import {
  audioPassArgs,
  audioPassGraph,
  audioRangeOf,
  checkedSegmentFrames,
  checkedStillFormat,
  concatList,
  DEFAULT_SEGMENT_FRAMES,
  frameRange,
  joinArgs,
  MAX_SEGMENT_FRAMES,
  rangeSegmentsOf,
  segmentArgs,
  segmentFileName,
  segmentsOf,
  stillArgs,
} from '../src/segments.js';
import { renderStillWith, type StillDependencies, type StillRequest } from '../src/still.js';

function validated(input: unknown): ValidatedComposition {
  const result = validateComposition(input);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.composition;
}

function variant(edit: (draft: Record<string, unknown>) => void): unknown {
  const draft = structuredClone(referenceComposition) as Record<string, unknown>;
  edit(draft);
  return draft;
}

const reference = validated(referenceComposition);
const hex = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

describe('presets (D29.5)', () => {
  it('keeps 1080x1920 for 1080p and scales to 720x1280 for 720p', () => {
    expect(presetSize(reference, '1080p')).toEqual({ name: '1080p', width: 1080, height: 1920 });
    expect(presetSize(reference, '720p')).toEqual({ name: '720p', width: 720, height: 1280 });
  });

  it.each([
    ['an unknown name', reference, '480p'],
    ['a name from the prototype', reference, 'toString'],
    [
      'upscaling',
      validated(variant((d) => Object.assign(d, { width: 720, height: 1280 }))),
      '1080p',
    ],
    [
      'a fractional height',
      validated(variant((d) => Object.assign(d, { width: 1000, height: 1920 }))),
      '720p',
    ],
    [
      'an odd height',
      validated(variant((d) => Object.assign(d, { width: 1080, height: 1917 }))),
      '1080p',
    ],
  ])('refuses %s with preset-unsupported', (_, composition, name) => {
    expect(() => presetSize(composition, name)).toThrow(
      expect.objectContaining({ code: 'preset-unsupported' }),
    );
  });

  it('writes the video graphs of D29.5', () => {
    expect(videoGraph(presetSize(reference, '1080p'))).toBe(
      '[0:v]scale=1080:1920:flags=lanczos:out_color_matrix=bt709:out_range=tv,setsar=1,format=yuv420p[v]',
    );
    expect(videoGraph(presetSize(reference, '720p'))).toBe(
      '[0:v]scale=720:1280:flags=lanczos:out_color_matrix=bt709:out_range=tv,setsar=1,format=yuv420p[v]',
    );
  });
});

describe('samples at 48 kHz (D29.6)', () => {
  it.each([
    [0, 0],
    [10, 0], // 0.48
    [11, 1], // 0.528
    [20_822, 999], // 999.456
    [20_823, 1000], // 999.504
    [20_833, 1000], // 999.984
    [2_500_000, 120_000],
    [10_000_000, 480_000],
    [3_600_000_000, 172_800_000],
    // Beyond 2^52 µs a floating-point product rounds; the integer rule does not.
    [4_503_599_627_370_510, 216_172_782_113_784],
  ])('maps %i µs to sample %i', (timeUs, sample) => {
    expect(samplesAt(timeUs)).toBe(sample);
  });

  it('refuses a time that is not a non-negative safe integer', () => {
    for (const bad of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) {
      expect(() => samplesAt(bad)).toThrow(RangeError);
    }
  });

  it('places the reference clip over the whole composition', () => {
    const layout = audioLayout(audioPlan(reference));
    expect(layout.totalSamples).toBe(480_000);
    expect(layout.sounds.map(({ entry, ...placed }) => ({ id: entry.id, ...placed }))).toEqual([
      {
        id: 'clip-audio',
        startSample: 0,
        sampleCount: 480_000,
        sourceStartSample: 0,
        fadeIn: null,
        fadeOut: null,
      },
    ]);
  });

  it('places a later clip and hears it only up to the end of the composition', () => {
    const late = validated(
      variant((draft) => {
        const [clip] = draft.clips as Record<string, unknown>[];
        Object.assign(clip ?? {}, { startUs: 2_500_011, durationUs: 10_000_000 });
      }),
    );
    const layout = audioLayout(audioPlan(late));
    expect(layout.sounds[0]).toMatchObject({
      startSample: 120_001, // 120 000.528
      sampleCount: 359_999, // 480 000 − 120 001
      sourceStartSample: 0,
    });
    expect(audioPassGraph(layout, { startSample: 0, sampleCount: 480_000 })).toBe(
      '[0:a:0]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,atrim=start_sample=0:end_sample=359999,asetpts=N/SR/TB,adelay=delays=120001S:all=1,apad=whole_len=480000,atrim=end_sample=480000[s0];[s0]atrim=start_sample=0:end_sample=480000,asetpts=N/SR/TB[a]',
    );
  });

  it('places a source start, a volume, and both fades on the sample grid (D52.5)', () => {
    const faded = validated(
      variant((draft) => {
        const [clip] = draft.clips as Record<string, unknown>[];
        Object.assign(clip ?? {}, {
          startUs: 1_000_000,
          durationUs: 2_000_000,
          sourceStartUs: 500_000,
          volume: 0.5,
          fadeInUs: 250_000,
          fadeOutUs: 1_000_000,
        });
      }),
    );
    const layout = audioLayout(audioPlan(faded));
    expect(layout.sounds[0]).toMatchObject({
      startSample: 48_000,
      sampleCount: 96_000,
      sourceStartSample: 24_000,
      fadeIn: { startSample: 0, sampleCount: 12_000 },
      // From 2 s, the sample 96 000, to 3 s, the sample 144 000, counted from 48 000.
      fadeOut: { startSample: 48_000, sampleCount: 48_000 },
    });
    expect(audioPassGraph(layout, { startSample: 0, sampleCount: 480_000 })).toBe(
      '[0:a:0]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,atrim=start_sample=24000:end_sample=120000,asetpts=N/SR/TB,volume=volume=0.5:precision=float,afade=t=in:ss=0:ns=12000:curve=tri,afade=t=out:ss=48000:ns=48000:curve=tri,adelay=delays=48000S:all=1,apad=whole_len=480000,atrim=end_sample=480000[s0];[s0]atrim=start_sample=0:end_sample=480000,asetpts=N/SR/TB[a]',
    );
  });

  it('leaves out a fade-out that begins after the last sample heard, and a fade of no sample', () => {
    const cut = validated(
      variant((draft) => {
        const [clip] = draft.clips as Record<string, unknown>[];
        Object.assign(clip ?? {}, {
          startUs: 9_000_000,
          durationUs: 5_000_000,
          fadeInUs: 10,
          fadeOutUs: 2_000_000,
        });
      }),
    );
    expect(audioLayout(audioPlan(cut)).sounds[0]).toMatchObject({
      startSample: 432_000,
      sampleCount: 48_000,
      fadeIn: null,
      fadeOut: null,
    });
  });

  it('places a lifetime that reaches 2^53 − 1 without leaving the safe integers (the debt of D29.6)', () => {
    const long = validated(
      variant((draft) => {
        const [clip] = draft.clips as Record<string, unknown>[];
        Object.assign(clip ?? {}, {
          durationUs: Number.MAX_SAFE_INTEGER,
          fadeOutUs: Number.MAX_SAFE_INTEGER - 1,
        });
      }),
    );
    expect(audioLayout(audioPlan(long)).sounds[0]).toMatchObject({
      startSample: 0,
      sampleCount: 480_000,
      // ⌊(2^53 − 1) × 48 000 / 10^6 + ½⌋, from the sample of 1 µs, which is 0.
      fadeOut: { startSample: 0, sampleCount: 432_345_564_227_568 },
    });
  });

  it('mixes several sounds by summing them in the order of the plan', () => {
    const two = validated(
      variant((draft) => {
        (draft.clips as unknown[]).push({
          id: 'clip-second',
          type: 'audio',
          assetId: 'asset-audio',
          startUs: 5_000_000,
          durationUs: 1_000_000,
          sourceStartUs: 0,
          volume: 0.125,
          fadeInUs: 0,
          fadeOutUs: 0,
        });
      }),
    );
    const graph = audioPassGraph(audioLayout(audioPlan(two)), {
      startSample: 96_000,
      sampleCount: 96_000,
    });
    expect(graph.split(';')).toEqual([
      '[0:a:0]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,atrim=start_sample=0:end_sample=480000,asetpts=N/SR/TB,adelay=delays=0S:all=1,apad=whole_len=480000,atrim=end_sample=480000[s0]',
      '[1:a:0]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,atrim=start_sample=0:end_sample=48000,asetpts=N/SR/TB,volume=volume=0.125:precision=float,adelay=delays=240000S:all=1,apad=whole_len=480000,atrim=end_sample=480000[s1]',
      '[s0][s1]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,atrim=start_sample=96000:end_sample=192000,asetpts=N/SR/TB[a]',
    ]);
  });

  it('places nothing without a sound: no clip, or only silent ones', () => {
    expect(
      audioLayout(audioPlan(validated(variant((draft) => (draft.clips = []))))).sounds,
    ).toEqual([]);
    const silent = validated(
      variant((draft) => {
        const [clip] = draft.clips as Record<string, unknown>[];
        Object.assign(clip ?? {}, { volume: 0 });
      }),
    );
    expect(audioLayout(audioPlan(silent)).sounds).toEqual([]);
  });
});

describe('the arguments of a segment (D29.4, D47.3)', () => {
  const graph1080 =
    '[0:v]scale=1080:1920:flags=lanczos:out_color_matrix=bt709:out_range=tv,setsar=1,format=yuv420p[v]';

  it('are the encoder of D29.4 without audio and +faststart, with the output as the only file', () => {
    expect(segmentArgs({ fps: 30, videoGraph: graph1080, output: '/out/s.mp4' })).toEqual([
      ...['-hide_banner', '-nostdin', '-loglevel', 'error', '-threads', '1'],
      ...['-f', 'image2pipe', '-c:v', 'png', '-framerate', '30', '-i', 'pipe:0'],
      ...['-filter_complex_threads', '1', '-filter_complex', graph1080],
      ...['-map', '[v]', '-fps_mode', 'passthrough'],
      ...['-c:v', 'libx264', '-preset', 'medium', '-crf', '18'],
      ...['-profile:v', 'high', '-level:v', '4.0', '-pix_fmt', 'yuv420p', '-threads', '1'],
      ...['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'],
      ...['-color_range', 'tv', '-video_track_timescale', '15360'],
      ...['-map_metadata', '-1', '-map_chapters', '-1', '-fflags', '+bitexact'],
      ...['-flags:v', '+bitexact', '-f', 'mp4', '-y', '/out/s.mp4'],
      ...['-map', '0:v', '-c:v', 'copy', '-f', 'framehash', '-hash', 'sha256', 'pipe:1'],
    ]);
  });
});

describe('the audio pass (D47.4)', () => {
  it('mixes the whole composition as D52.5 does, then cuts the range and starts it at 0', () => {
    const layout = audioLayout(audioPlan(reference));
    const range = audioRangeOf(
      frameRange(reference, { fromUs: 2_000_000, toUs: 4_000_000 }, 60),
      samplesAt,
    );
    expect(range).toEqual({ startSample: 96_000, sampleCount: 96_000 });
    const graph = audioPassGraph(layout, range);
    expect(graph).toBe(
      '[0:a:0]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,atrim=start_sample=0:end_sample=480000,asetpts=N/SR/TB,adelay=delays=0S:all=1,apad=whole_len=480000,atrim=end_sample=480000[s0];[s0]atrim=start_sample=96000:end_sample=192000,asetpts=N/SR/TB[a]',
    );
    expect(audioPassArgs({ graph, inputs: ['/tmp/x/sound-0'], output: '/out/a.wav' })).toEqual([
      ...['-hide_banner', '-nostdin', '-loglevel', 'error', '-threads', '1'],
      ...['-i', 'file:/tmp/x/sound-0'],
      ...['-filter_complex_threads', '1', '-filter_complex', graph, '-map', '[a]'],
      ...['-c:a', 'pcm_f32le', '-ar', '48000', '-ac', '2'],
      ...['-map_metadata', '-1', '-map_chapters', '-1', '-fflags', '+bitexact'],
      ...['-flags:a', '+bitexact', '-f', 'wav', '-y', '/out/a.wav'],
    ]);
  });
});

describe('the join (D47.5)', () => {
  it('reads the list on a pipe, copies the video, encodes the audio once, and writes +faststart', () => {
    expect(joinArgs({ fps: 30, audio: '/parts/audio.wav', output: '/out/v.mp4' })).toEqual([
      ...['-hide_banner', '-nostdin', '-loglevel', 'error', '-threads', '1'],
      ...['-f', 'concat', '-safe', '0', '-protocol_whitelist', 'file,pipe', '-i', 'pipe:0'],
      ...['-f', 'wav', '-i', 'file:/parts/audio.wav', '-map', '0:v', '-map', '1:a'],
      ...['-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2'],
      ...['-video_track_timescale', '15360'],
      ...['-map_metadata', '-1', '-map_chapters', '-1', '-fflags', '+bitexact'],
      ...['-flags:v', '+bitexact', '-flags:a', '+bitexact'],
      ...['-movflags', '+faststart', '-f', 'mp4', '-y', '/out/v.mp4'],
    ]);
  });

  it('leaves out the audio without a clip', () => {
    const args = joinArgs({ fps: 30, audio: null, output: 'v.mp4' });
    expect(args).not.toContain('1:a');
    expect(args).not.toContain('aac');
    expect(args).not.toContain('-flags:a');
  });

  it('lists absolute file URLs in order, quoted, and refuses a relative path or a line break', () => {
    expect(concatList(['/a/segment-000000.mp4', "/b/it's.mp4"])).toBe(
      "ffconcat version 1.0\nfile 'file:/a/segment-000000.mp4'\nfile 'file:/b/it'\\''s.mp4'\n",
    );
    for (const bad of ['segment-000000.mp4', '/a/b\nfile x', '/a\rb']) {
      expect(() => concatList([bad])).toThrow(expect.objectContaining({ code: 'join-invalid' }));
    }
  });
});

describe('the arguments of a still (D47.7)', () => {
  it('encode JPEG in BT.601 full range 4:4:4 at q 2, and WebP lossy at quality 90', () => {
    const size = { width: 1080, height: 1920 };
    const jpeg = stillArgs('jpeg', size);
    expect(jpeg).toEqual(
      expect.arrayContaining([
        '[0:v]scale=1080:1920:flags=lanczos:out_color_matrix=bt601:out_range=pc,format=yuv444p[v]',
        'mjpeg',
        '-q:v',
        '2',
      ]),
    );
    expect(jpeg.slice(-3)).toEqual(['-f', 'mjpeg', 'pipe:1']);
    const webp = stillArgs('webp', size);
    expect(webp).toEqual(expect.arrayContaining(['libwebp', '-quality', '90', '-lossless', '0']));
    expect(webp.slice(-3)).toEqual(['-f', 'webp', 'pipe:1']);
    for (const args of [jpeg, webp]) {
      expect(args.slice(0, 10)).toEqual([
        ...['-hide_banner', '-nostdin', '-loglevel', 'error', '-threads', '1'],
        ...['-f', 'png_pipe', '-i', 'pipe:0'],
      ]);
      expect(args).toContain('+bitexact');
    }
  });

  it('accepts png, jpeg, and webp only', () => {
    expect(['png', 'jpeg', 'webp'].map(checkedStillFormat)).toEqual(['png', 'jpeg', 'webp']);
    for (const bad of ['jpg', 'PNG', 'gif', '']) {
      expect(() => checkedStillFormat(bad)).toThrow(
        expect.objectContaining({ code: 'still-format-unsupported' }),
      );
    }
  });
});

describe('the segment grid (D47.1, D47.2)', () => {
  it('cuts 300 frames into segments of 60, and leaves a shorter last one', () => {
    expect(segmentsOf(reference, 60)).toEqual(
      [0, 1, 2, 3, 4].map((index) => ({
        index,
        firstFrame: index * 60,
        frameCount: 60,
      })),
    );
    expect(segmentsOf(reference, 128).map(({ frameCount }) => frameCount)).toEqual([128, 128, 44]);
    expect(segmentsOf(reference, 300)).toEqual([{ index: 0, firstFrame: 0, frameCount: 300 }]);
    expect(segmentsOf(reference, 1_000)).toEqual([{ index: 0, firstFrame: 0, frameCount: 300 }]);
    expect(DEFAULT_SEGMENT_FRAMES).toBe(60);
  });

  it('accepts a whole number of frames from 1 to MAX_SEGMENT_FRAMES', () => {
    expect(checkedSegmentFrames(undefined)).toBe(60);
    expect(checkedSegmentFrames(1)).toBe(1);
    for (const bad of [0, -60, 1.5, Number.NaN, MAX_SEGMENT_FRAMES + 1]) {
      expect(() => checkedSegmentFrames(bad)).toThrow(
        expect.objectContaining({ code: 'segment-length-invalid' }),
      );
    }
  });

  it('takes a range on segment boundaries, and the composition end as the last one', () => {
    expect(frameRange(reference, undefined, 60)).toEqual({
      fromUs: 0,
      toUs: 10_000_000,
      firstFrame: 0,
      frameCount: 300,
    });
    const middle = frameRange(reference, { fromUs: 2_000_000, toUs: 6_000_000 }, 60);
    expect(middle).toEqual({ fromUs: 2_000_000, toUs: 6_000_000, firstFrame: 60, frameCount: 120 });
    expect(rangeSegmentsOf(reference, 60, middle).map(({ index }) => index)).toEqual([1, 2]);
    // 300 frames in segments of 128: the last segment ends at the composition's end.
    expect(
      frameRange(reference, { fromUs: frameToTimeUs(256, 30), toUs: 10_000_000 }, 128),
    ).toEqual({ fromUs: 8_533_333, toUs: 10_000_000, firstFrame: 256, frameCount: 44 });
  });

  it.each([
    ['a start inside a segment', { fromUs: 1_000_000, toUs: 4_000_000 }],
    ['an end inside a segment', { fromUs: 0, toUs: 3_000_000 }],
    ['a time between two frames', { fromUs: 0, toUs: 2_000_001 }],
    ['an empty range', { fromUs: 2_000_000, toUs: 2_000_000 }],
    ['a reversed range', { fromUs: 4_000_000, toUs: 2_000_000 }],
    ['an end after the composition', { fromUs: 0, toUs: 10_000_001 }],
    ['a negative start', { fromUs: -1, toUs: 2_000_000 }],
    ['a fraction', { fromUs: 0.5, toUs: 2_000_000 }],
  ])('refuses %s with range-invalid', (_, range) => {
    expect(() => frameRange(reference, range, 60)).toThrow(
      expect.objectContaining({ code: 'range-invalid' }),
    );
  });

  it('takes any frame times without a segment length: the range of an audio pass', () => {
    expect(frameRange(reference, { fromUs: 1_000_000, toUs: 3_000_000 })).toEqual({
      fromUs: 1_000_000,
      toUs: 3_000_000,
      firstFrame: 30,
      frameCount: 60,
    });
  });

  it('names a segment by its index alone', () => {
    expect(segmentFileName(0)).toBe('segment-000000.mp4');
    expect(segmentFileName(42)).toBe('segment-000042.mp4');
  });
});

describe('the receipt of FFmpeg (D29.3)', () => {
  const a = 'a'.repeat(64);
  const b = 'b'.repeat(64);

  it('lists the hash of every packet in order and skips the header', () => {
    // The format the pinned build printed in the container: the digest is bare.
    const text = [
      '#format: frame checksums',
      '#version: 2',
      '#hash: SHA256',
      '#tb 0: 1/30',
      '#stream#, dts,        pts, duration,     size, hash',
      `0,          0,          0,        1,    35530, ${a}`,
      `0,          1,          1,        1,    35612, ${b}`,
      '',
    ].join('\n');
    expect(receiptHashes(text)).toEqual([`sha256:${a}`, `sha256:${b}`]);
  });

  it('refuses a line it does not understand, so a changed format is not an empty receipt', () => {
    expect(() => receiptHashes(`1, 0, 0, 1, 10, ${a}\n`)).toThrow(
      expect.objectContaining({ code: 'encode-failed' }),
    );
    expect(() => receiptHashes(`0, 0, 0, 1, 10, SHA256=${a}\n`)).toThrow(
      expect.objectContaining({ code: 'encode-failed' }),
    );
    expect(() => receiptHashes(`0, 0, 0, 1, 10, MD5=${a.slice(0, 32)}\n`)).toThrow(
      expect.objectContaining({ code: 'encode-failed' }),
    );
    expect(() => receiptHashes(`0, 0, 0, 1, 10, ${a.slice(0, 63)}\n`)).toThrow(
      expect.objectContaining({ code: 'encode-failed' }),
    );
  });
});

/** A timer the test expires by hand. */
function manualTimer(): { start: StartTimer; expireAll: () => void; pending: () => number } {
  const timers = new Set<() => void>();
  return {
    start(expire) {
      timers.add(expire);
      return () => timers.delete(expire);
    },
    expireAll() {
      for (const expire of [...timers]) {
        timers.delete(expire);
        expire();
      }
    },
    pending: () => timers.size,
  };
}

/** A pipe that accepts a chunk only when the test says so. */
function heldPipe(): { stream: Writable; chunks: Uint8Array[]; release: () => void } {
  const chunks: Uint8Array[] = [];
  const held: (() => void)[] = [];
  const stream = new Writable({
    highWaterMark: 1,
    write(chunk: Uint8Array, _encoding, callback) {
      chunks.push(chunk);
      held.push(() => {
        callback();
      });
    },
  });
  return { stream, chunks, release: () => held.shift()?.() };
}

const settled = async (promise: Promise<unknown>): Promise<string> => {
  const marker = Symbol('pending');
  const result = await Promise.race([
    promise.then(
      () => 'resolved',
      () => 'rejected',
    ),
    new Promise((resolve) =>
      setImmediate(() => {
        resolve(marker);
      }),
    ),
  ]);
  return result === marker ? 'pending' : String(result);
};

describe('the frame sink (D29.3)', () => {
  it('admits FRAMES_IN_FLIGHT frames and holds the next until the pipe takes one', async () => {
    expect(FRAMES_IN_FLIGHT).toBe(2);
    const pipe = heldPipe();
    const timer = manualTimer();
    const sink = new FrameSink(pipe.stream, 1_000, timer.start);
    await sink.write(new Uint8Array([1]));
    await sink.write(new Uint8Array([2]));
    const third = sink.write(new Uint8Array([3]));
    expect(await settled(third)).toBe('pending');
    pipe.release();
    await third;
    expect(sink.maxInFlight).toBe(2);
    expect(sink.written).toBe(3);
    const end = sink.end();
    expect(await settled(end)).toBe('pending');
    pipe.release();
    pipe.release();
    await end;
    expect(pipe.chunks.map((chunk) => chunk[0])).toEqual([1, 2, 3]);
  });

  it('fails with encode-failed when the pipe accepts nothing in time, and stays failed', async () => {
    const pipe = heldPipe();
    const timer = manualTimer();
    const sink = new FrameSink(pipe.stream, 1_000, timer.start);
    await sink.write(new Uint8Array([1]));
    await sink.write(new Uint8Array([2]));
    const third = sink.write(new Uint8Array([3]));
    timer.expireAll();
    await expect(third).rejects.toMatchObject({ code: 'encode-failed' });
    await expect(sink.write(new Uint8Array([4]))).rejects.toMatchObject({ code: 'encode-failed' });
    expect(sink.written).toBe(2);
  });

  it('fails with encode-failed when the pipe breaks', async () => {
    const pipe = heldPipe();
    const sink = new FrameSink(pipe.stream, 1_000, manualTimer().start);
    await sink.write(new Uint8Array([1]));
    await sink.write(new Uint8Array([2]));
    const third = sink.write(new Uint8Array([3]));
    pipe.stream.destroy(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
    await expect(third).rejects.toMatchObject({ code: 'encode-failed' });
  });
});

/** A host that answers like the pinned build; each test changes one thing. */
function pinnedHost(change: Partial<FfmpegHost> = {}, log: string[] = []): FfmpegHost {
  return {
    platform: 'linux',
    arch: 'x64',
    isFile: (path) => {
      log.push(`isFile ${path}`);
      return true;
    },
    sha256: (path) => {
      log.push(`sha256 ${path}`);
      return Promise.resolve(path.endsWith('ffprobe') ? FFPROBE_SHA256 : FFMPEG_SHA256);
    },
    run: (path, args) => {
      log.push(`run ${path} ${args.join(' ')}`);
      if (args.includes('-encoders')) {
        return Promise.resolve({
          code: 0,
          stdout: [
            ' V....D libx264              libx264 H.264',
            ' A....D aac                  AAC (Advanced Audio Coding)',
            ' A....D pcm_f32le            PCM 32-bit floating point little-endian',
            ' VFS..D mjpeg                MJPEG (Motion JPEG)',
            ' V....D libwebp              libwebp WebP image (codec webp)',
            '',
          ].join('\n'),
          stderr: '',
        });
      }
      const name = path.endsWith('ffprobe') ? 'ffprobe' : 'ffmpeg';
      const years = name === 'ffprobe' ? '2007-2026' : '2000-2026';
      return Promise.resolve({
        code: 0,
        stdout: `${name} version n8.1.3-20260921 Copyright (c) ${years} the FFmpeg developers\nbuilt with gcc\nconfiguration: ${FFMPEG_CONFIGURATION}\n`,
        stderr: '',
      });
    },
    ...change,
  };
}

const PATHS = {
  ffmpegPath: '/opt/kadrion-ffmpeg/ffmpeg',
  ffprobePath: '/opt/kadrion-ffmpeg/ffprobe',
};

describe('verification of the pinned FFmpeg (D29.1)', () => {
  it('accepts the pinned build and reports its identity', async () => {
    await expect(verifyFfmpeg(PATHS, pinnedHost())).resolves.toEqual({
      ffmpegSha256: FFMPEG_SHA256,
      ffprobeSha256: FFPROBE_SHA256,
      version: 'n8.1.3-20260921',
      configuration: FFMPEG_CONFIGURATION,
      encoders: ['libx264', 'aac', 'pcm_f32le', 'mjpeg', 'libwebp'],
    });
  });

  it.each([
    ['a bare name, which PATH would resolve', { ...PATHS, ffmpegPath: 'ffmpeg' }],
    ['a relative path', { ...PATHS, ffprobePath: 'bin/ffprobe' }],
  ])('refuses %s with ffmpeg-missing before touching anything', async (_, paths) => {
    const log: string[] = [];
    await expect(verifyFfmpeg(paths, pinnedHost({}, log))).rejects.toMatchObject({
      code: 'ffmpeg-missing',
    });
    expect(log.filter((line) => !line.startsWith('isFile'))).toEqual([]);
  });

  it('refuses a missing file with ffmpeg-missing', async () => {
    await expect(
      verifyFfmpeg(PATHS, pinnedHost({ isFile: (path) => !path.endsWith('ffprobe') })),
    ).rejects.toMatchObject({ code: 'ffmpeg-missing' });
  });

  it('refuses another platform before hashing', async () => {
    const log: string[] = [];
    await expect(verifyFfmpeg(PATHS, pinnedHost({ platform: 'win32' }, log))).rejects.toMatchObject(
      {
        code: 'ffmpeg-mismatch',
      },
    );
    expect(log.some((line) => line.startsWith('sha256'))).toBe(false);
  });

  it.each([
    [
      'another ffmpeg',
      (path: string) => (path.endsWith('ffmpeg') ? `sha256:${'0'.repeat(64)}` : FFPROBE_SHA256),
    ],
    [
      'another ffprobe',
      (path: string) => (path.endsWith('ffprobe') ? `sha256:${'0'.repeat(64)}` : FFMPEG_SHA256),
    ],
  ])('refuses %s by checksum, before running anything', async (_, sha) => {
    const log: string[] = [];
    await expect(
      verifyFfmpeg(PATHS, pinnedHost({ sha256: (path) => Promise.resolve(sha(path)) }, log)),
    ).rejects.toMatchObject({ code: 'ffmpeg-mismatch' });
    expect(log.some((line) => line.startsWith('run'))).toBe(false);
  });

  const replaced = (
    from: string,
    to: string,
    when: (args: readonly string[], path: string) => boolean,
  ) =>
    pinnedHost({
      run: async (path, args) => {
        const result = await pinnedHost().run(path, args);
        return when(args, path) ? { ...result, stdout: result.stdout.replace(from, to) } : result;
      },
    });

  it.each([
    [
      'another ffmpeg version',
      replaced(
        'n8.1.3-20260921',
        'n8.1.2',
        (a, p) => a.includes('-version') && p.endsWith('ffmpeg'),
      ),
    ],
    [
      'another ffprobe version',
      replaced(
        'n8.1.3-20260921',
        'n8.1.2',
        (a, p) => a.includes('-version') && p.endsWith('ffprobe'),
      ),
    ],
    ['another configuration', replaced('--enable-libx264 ', '', (a) => a.includes('-version'))],
    [
      'no libx264',
      replaced('libx264              libx264', 'libx265              libx265', (a) =>
        a.includes('-encoders'),
      ),
    ],
    ['no aac', replaced(' aac ', ' mp3 ', (a) => a.includes('-encoders'))],
    [
      'a failing -version',
      pinnedHost({
        run: (path, args) =>
          pinnedHost()
            .run(path, args)
            .then((r) => ({ ...r, code: args.includes('-version') ? 1 : 0 })),
      }),
    ],
  ])('refuses %s with ffmpeg-mismatch', async (_, host) => {
    await expect(verifyFfmpeg(PATHS, host)).rejects.toMatchObject({ code: 'ffmpeg-mismatch' });
  });
});

const ASSETS = Object.fromEntries(generateReferenceAssets().map((asset) => [asset.id, asset]));
const AUDIO_BYTES = ASSETS['asset-audio']?.bytes ?? new Uint8Array();
/** The WAV fixture as ffprobe counts it: 480 000 samples at 48 kHz, and no stated start. */
const WAV_PROBE: AudioProbe = {
  audioStreams: 1,
  sampleRate: 48_000,
  samples: 480_000n,
  audioStart: null,
  videoStart: null,
};

/** A frame's bytes: distinct per index, and as large as the test wants. */
function frameBytes(index: number, size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  new DataView(bytes.buffer).setUint32(0, index);
  return bytes;
}

/** A file the fake FFmpeg wrote: its content stands for itself by a hash. */
interface FakeFile {
  readonly hash: string;
  readonly packets: number;
  readonly samples: number;
}

interface FakeRun {
  readonly dependencies: ExportDependencies;
  readonly log: string[];
  /** SHA-256 hex of every frame an encoder read, in order; the bytes are not kept. */
  readonly received: string[];
  /** The files on the fake disk, by path. */
  readonly files: Map<string, FakeFile>;
  /** What the audio pass and the join read on standard input. */
  readonly inputs: {
    readonly args: readonly string[];
    readonly text: string;
    readonly bytes: number;
  }[];
  readonly timer: ReturnType<typeof manualTimer>;
  deliveredFrames: number;
  /** The arguments of every segment encoder, in order. */
  readonly encoderArgs: (readonly string[])[];
}

interface FakeOptions {
  readonly frameSize?: number;
  readonly probe?: AudioProbe;
  /** Never accept a frame: the stalled encoder of D29.3. */
  readonly stall?: boolean;
  readonly exitCode?: number;
  readonly receipt?: (hashes: readonly string[]) => readonly string[];
  readonly packets?: (file: string, packets: number) => number;
  readonly timestamps?: (file: string, wanted: readonly number[]) => number[];
  readonly audioSamples?: (samples: number) => number;
  readonly passExitCode?: (args: readonly string[]) => number;
  readonly failAt?: { readonly index: number; readonly code: string };
  readonly toolsFail?: string;
  readonly onFrame?: (index: number) => void;
  /** Called when the audio pass or the join starts, before FFmpeg would write. */
  readonly onPass?: (args: readonly string[]) => void;
  /** The interface names the run reports; never the host's (D28.9). */
  readonly networkInterfaces?: readonly string[];
}

const outputOf = (args: readonly string[]): string => args[args.indexOf('-y') + 1] ?? '';

function fakeRun(options: FakeOptions = {}): FakeRun {
  const run: FakeRun = {
    log: [],
    received: [],
    files: new Map(),
    inputs: [],
    timer: manualTimer(),
    deliveredFrames: 0,
    encoderArgs: [],
    dependencies: undefined as unknown as ExportDependencies,
  };
  const sequence: FrameSequence = async (prepared, frames, deliver) => {
    run.log.push(`load ${prepared.composition.schemaVersion}`);
    for (const { index, timeUs } of frames) {
      if (options.failAt?.index === index) {
        throw Object.assign(new Error('failed'), { code: options.failAt.code });
      }
      run.deliveredFrames += 1;
      options.onFrame?.(index);
      await deliver({ index, timeUs, png: frameBytes(index, options.frameSize ?? 16) });
    }
    return { blockedRequests: [] };
  };
  const file = (path: string): FakeFile => {
    const found = run.files.get(path);
    if (found === undefined) throw new Error(`no file ${path}`);
    return found;
  };
  const tools: FfmpegTools = {
    identity: {
      ffmpegSha256: FFMPEG_SHA256,
      ffprobeSha256: FFPROBE_SHA256,
      version: 'n8.1.3-20260921',
      configuration: FFMPEG_CONFIGURATION,
      encoders: [...REQUIRED_ENCODERS],
    },
    async probeAudio(path) {
      // The private copy is a real file: the bytes the resolver verified.
      run.log.push(`probe ${basename(path)} ${String((await readFile(path)).length)}`);
      return options.probe ?? WAV_PROBE;
    },
    countVideoPackets(path) {
      run.log.push(`count ${basename(path)}`);
      return Promise.resolve((options.packets ?? ((_, n) => n))(path, file(path).packets));
    },
    videoTimestamps(path) {
      run.log.push(`timestamps ${basename(path)}`);
      const wanted = Array.from({ length: file(path).packets }, (_, i) => i * TIME_SCALE_PER_FRAME);
      return Promise.resolve((options.timestamps ?? ((_, given) => [...given]))(path, wanted));
    },
    sha256File: async (path) => {
      await Promise.resolve();
      return file(path).hash;
    },
    probeVideo: () => Promise.reject(new Error('no video in these documents')),
    decodeVideo: () => {
      throw new Error('no video in these documents');
    },
    audioStream(path) {
      const { samples } = file(path);
      return Promise.resolve({
        codec: 'pcm_f32le',
        sampleRate: 48_000,
        channels: 2,
        samples: (options.audioSamples ?? ((n) => n))(samples),
      });
    },
    run(args, input, _timeoutMs, signal) {
      options.onPass?.(args);
      const text = new TextDecoder().decode(input);
      const output = outputOf(args);
      run.inputs.push({ args, text: args.includes('concat') ? text : '', bytes: input.length });
      // A process whose signal aborted is killed: it ends without a code and writes nothing.
      if (signal?.aborted === true) {
        run.log.push('killed pass');
        return Promise.resolve({ code: null, stdout: new Uint8Array(), stderr: 'killed' });
      }
      const code = options.passExitCode?.(args) ?? 0;
      if (args.includes('concat')) {
        run.log.push(`join ${basename(output)}`);
        const listed = text
          .split('\n')
          .filter((line) => line.startsWith('file '))
          .map((line) => line.slice("file 'file:".length, -1));
        const packets = listed.reduce((sum, path) => sum + file(path).packets, 0);
        const audio = args.find((arg) => arg.startsWith('file:'));
        const hash = sha256(
          [
            ...listed.map((path) => file(path).hash),
            audio === undefined ? '' : file(audio.slice(5)).hash,
          ].join(','),
        );
        if (code === 0) run.files.set(output, { hash, packets, samples: 0 });
      } else {
        run.log.push(`audio ${basename(output)}`);
        const graph = args[args.indexOf('-filter_complex') + 1] ?? '';
        // The last cut of the graph is the range's (D52.5).
        const [, start = '0', end = '0'] =
          /atrim=start_sample=(\d+):end_sample=(\d+),asetpts=N\/SR\/TB\[a\]$/.exec(graph) ?? [];
        if (code === 0) {
          run.files.set(output, {
            hash: sha256(`audio ${graph} ${hex(input)}`),
            packets: 0,
            samples: Number(end) - Number(start),
          });
        }
      }
      return Promise.resolve({
        code,
        stdout: new Uint8Array(),
        stderr: code === 0 ? '' : 'fake error',
      });
    },
    spawnEncoder(args, withAudio) {
      run.log.push(`spawn ${basename(outputOf(args))} audio=${String(withAudio)}`);
      run.encoderArgs.push(args);
      const output = outputOf(args);
      const mine: string[] = [];
      let exit: (value: { code: number | null; stderr: string }) => void = () => undefined;
      const exited = new Promise<{ code: number | null; stderr: string }>((resolve) => {
        exit = resolve;
      });
      const video = new Writable({
        highWaterMark: 1,
        write(chunk: Uint8Array, _encoding, callback) {
          if (options.stall === true) return;
          const digest = hex(chunk);
          run.received.push(digest);
          mine.push(digest);
          setImmediate(callback);
        },
        final(callback) {
          callback();
          setImmediate(() => {
            const code = options.exitCode ?? 0;
            if (code === 0) {
              run.files.set(output, {
                hash: sha256(mine.join(',')),
                packets: mine.length,
                samples: 0,
              });
            }
            exit({ code, stderr: 'fake stderr' });
          });
        },
      });
      const encoder: EncoderProcess = {
        video,
        audio: null,
        get receipt() {
          const hashes = (options.receipt ?? ((h) => h))(mine);
          return Promise.resolve(
            hashes.map((h, i) => `0, ${String(i)}, ${String(i)}, 1, 16, ${h}`).join('\n'),
          );
        },
        exited,
        kill() {
          run.log.push('kill');
          exit({ code: null, stderr: 'killed' });
        },
      };
      return encoder;
    },
  };
  (run as { dependencies: ExportDependencies }).dependencies = {
    tools: () => {
      run.log.push('tools');
      return options.toolsFail === undefined
        ? Promise.resolve(tools)
        : Promise.reject(Object.assign(new Error('no ffmpeg'), { code: options.toolsFail }));
    },
    browser: () => {
      run.log.push('browser');
      return Promise.resolve({
        chromium: { browser: {} as Browser, reportedVersion: CHROMIUM_VERSION },
        sequence,
        close: () => {
          run.log.push('close');
          return Promise.resolve();
        },
      });
    },
    removeFile: (path) => {
      run.log.push(`remove ${basename(path)}`);
      run.files.delete(path);
      return Promise.resolve();
    },
    renameFile: (from, to) => {
      run.log.push(`rename ${basename(from)}`);
      run.files.set(to, file(from));
      run.files.delete(from);
      return Promise.resolve();
    },
    startTimer: run.timer.start,
    networkInterfaces: () => options.networkInterfaces ?? ['lo'],
  };
  return run;
}

function request(change: Partial<ExportRequest> = {}): ExportRequest {
  return {
    document: referenceComposition,
    resolveAsset: ({ id }) => ASSETS[id] ?? null,
    preset: '1080p',
    outputPath: '/out/video-1080p.mp4',
    ffmpeg: PATHS,
    ...change,
  };
}

const SEGMENT_NAMES = [0, 1, 2, 3, 4].map((index) => segmentFileName(index));

describe('the one-pass export on a fake frame loop and FFmpeg (D29.3, D47.6)', () => {
  it('pipes every frame in order into one encoder per segment, then the audio pass and the join', async () => {
    const run = fakeRun();
    const result = await exportWith(request(), run.dependencies);
    const { manifest } = result;
    expect(manifest.frames).toHaveLength(300);
    manifest.frames.forEach((frame, index) => {
      expect(frame).toEqual({
        index,
        timeUs: frameToTimeUs(index, 30),
        sha256: `sha256:${hex(frameBytes(index, 16))}`,
      });
    });
    expect(run.received).toEqual(manifest.frames.map(({ sha256: hash }) => hash.slice(7)));
    expect(result.stats).toEqual({ framesWritten: 300, maxFramesInFlight: 2 });
    const part = (name: string): string => `video-1080p.mp4.${name}`;
    expect(run.log).toEqual([
      'tools',
      `probe sound-0 ${String(AUDIO_BYTES.length)}`,
      'browser',
      'load 0.6',
      ...SEGMENT_NAMES.flatMap((name) => [
        `spawn ${part(name)}.partial audio=false`,
        `count ${part(name)}.partial`,
        `timestamps ${part(name)}.partial`,
        `rename ${part(name)}.partial`,
      ]),
      'close',
      `audio ${part('audio.wav')}.partial`,
      `rename ${part('audio.wav')}.partial`,
      'join video-1080p.mp4.partial',
      'count video-1080p.mp4.partial',
      'timestamps video-1080p.mp4.partial',
      'rename video-1080p.mp4.partial',
      ...SEGMENT_NAMES.map((name) => `remove ${part(name)}`),
      `remove ${part('audio.wav')}`,
    ]);
    // Only the MP4 is left; the parts are gone.
    expect([...run.files.keys()]).toEqual(['/out/video-1080p.mp4']);
    // The audio pass read the private copy of the asset, and nothing on standard input.
    expect(run.inputs[0]?.bytes).toBe(0);
    expect(run.inputs[0]?.args.filter((arg) => arg.startsWith('file:'))).toEqual([
      expect.stringMatching(/kadrion-sound-[^/]+\/sound-0$/) as unknown,
    ]);
    // The join read the segments in order, as absolute file URLs.
    expect(run.inputs[1]?.text).toBe(
      [
        'ffconcat version 1.0',
        ...SEGMENT_NAMES.map((name) => `file 'file:/out/${part(name)}'`),
        '',
      ].join('\n'),
    );
    expect(manifest.segments).toEqual(
      [0, 1, 2, 3, 4].map((index) => ({
        index,
        firstFrame: index * 60,
        frameCount: 60,
        sha256: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) as unknown,
      })),
    );
    expect(manifest.range).toEqual({ fromUs: 0, toUs: 10_000_000, firstFrame: 0, frameCount: 300 });
    expect(manifest.segmentFrames).toBe(60);
    expect(manifest.kind).toBe('export');
    expect(manifest.manifestVersion).toBe(5);
    expect(manifest.preset).toEqual({
      name: 'mp4-1080p',
      width: 1080,
      height: 1920,
      sourceWidth: 1080,
      sourceHeight: 1920,
      fps: 30,
      deviceScaleFactor: 1,
      videoGraph:
        '[0:v]scale=1080:1920:flags=lanczos:out_color_matrix=bt709:out_range=tv,setsar=1,format=yuv420p[v]',
    });
    expect(manifest.audio).toEqual({
      sampleRate: 48_000,
      totalSamples: 480_000,
      sounds: [
        {
          kind: 'clip',
          id: 'clip-audio',
          assetId: 'asset-audio',
          assetHash: reference.assets.find(({ id }) => id === 'asset-audio')?.contentHash,
          volume: 1,
          startSample: 0,
          sampleCount: 480_000,
          sourceStartSample: 0,
          fadeIn: null,
          fadeOut: null,
        },
      ],
      rangeStartSample: 0,
      rangeSampleCount: 480_000,
      channelLayout: 'stereo',
      codec: 'aac',
      bitrate: '128k',
      intermediate: {
        codec: 'pcm_f32le',
        format: 'wav',
        sha256: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) as unknown,
      },
    });
    // Every path of the run is a placeholder in the manifest.
    expect(manifest.ffmpeg.segmentArgs).toContain('<output>');
    expect(manifest.ffmpeg.audioArgs).toContain('<output>');
    expect(manifest.ffmpeg.joinArgs).toContain('<output>');
    expect(manifest.ffmpeg.joinArgs).toContain('file:<audio>');
    expect(manifest.ffmpeg.encoders).toEqual([...REQUIRED_ENCODERS]);
    expect(JSON.stringify(manifest)).not.toContain('/out/');
    expect(JSON.stringify(manifest)).not.toContain('.partial');
  });

  it('records the network the run reports, never one it assumed (D28.9)', async () => {
    const isolated = await exportWith(request(), fakeRun().dependencies);
    expect(isolated.manifest.environment.network).toEqual({
      interfaces: ['lo'],
      loopbackOnly: true,
    });
    const networked = await exportWith(
      request(),
      fakeRun({ networkInterfaces: ['lo', 'kadrion-test0'] }).dependencies,
    );
    expect(networked.manifest.environment.network).toEqual({
      interfaces: ['kadrion-test0', 'lo'],
      loopbackOnly: false,
    });
  });

  it('names the environment in one identity block that agrees with the other fields (D29.9)', async () => {
    const { manifest } = await exportWith(request(), fakeRun().dependencies);
    // The declared image of D26.2 when the run is pinned (the container), else nothing.
    const declared = manifest.environment.pinned
      ? (/@(sha256:[0-9a-f]{64})$/.exec(manifest.environment.image ?? '')?.[1] ?? null)
      : null;
    expect(manifest.identity).toEqual({
      playwrightImageDigest: declared,
      playwrightVersion: manifest.chromium.playwrightCore,
      chromiumRevision: manifest.chromium.revision,
      ffmpegSha256: manifest.ffmpeg.ffmpegSha256,
      ffprobeSha256: manifest.ffmpeg.ffprobeSha256,
      ffmpegVersion: manifest.ffmpeg.version,
      ffmpegBuildConfiguration: manifest.ffmpeg.configuration,
    });
  });

  it('exports the 720p preset from the same frames', async () => {
    const run720 = fakeRun();
    const a = await exportWith(request(), fakeRun().dependencies);
    const b = await exportWith(
      request({ preset: '720p', outputPath: '/out/v720.mp4' }),
      run720.dependencies,
    );
    expect(b.manifest.frames).toEqual(a.manifest.frames);
    expect(b.manifest.preset.width).toBe(720);
    expect(run720.encoderArgs[0]).toContain(
      '[0:v]scale=720:1280:flags=lanczos:out_color_matrix=bt709:out_range=tv,setsar=1,format=yuv420p[v]',
    );
  });

  it('takes another segment length from the settings, and a last segment that is shorter', async () => {
    const run = fakeRun();
    const { manifest } = await exportWith(request({ segmentFrames: 128 }), run.dependencies);
    expect(manifest.segmentFrames).toBe(128);
    expect(manifest.segments.map(({ frameCount }) => frameCount)).toEqual([128, 128, 44]);
    expect(run.encoderArgs).toHaveLength(3);
  });

  it('exports without an audio stream when the document has no clip', async () => {
    const run = fakeRun();
    const { manifest } = await exportWith(
      request({ document: variant((draft) => (draft.clips = [])) }),
      run.dependencies,
    );
    expect(manifest.audio).toBeNull();
    expect(manifest.ffmpeg.audioArgs).toBeNull();
    expect(manifest.ffmpeg.joinArgs).not.toContain('1:a');
    expect(run.log.some((line) => line.startsWith('probe') || line.startsWith('audio'))).toBe(
      false,
    );
  });

  it.each([
    ['preset-unsupported', { preset: '4k' }, {}],
    ['segment-length-invalid', { segmentFrames: 0 }, {}],
    ['invalid-document', { document: { schemaVersion: '0.2' } }, {}],
    ['asset-missing', { resolveAsset: () => null }, {}],
    ['ffmpeg-missing', {}, { toolsFail: 'ffmpeg-missing' }],
    ['source-range-exceeded', {}, { probe: { ...WAV_PROBE, samples: 479_999n } }],
    ['audio-invalid', {}, { probe: { ...WAV_PROBE, audioStreams: 2 } }],
    ['audio-invalid', {}, { probe: { ...WAV_PROBE, sampleRate: null } }],
  ] as const)(
    'fails with %s before a browser opens or FFmpeg starts',
    async (code, change, options) => {
      const run = fakeRun(options);
      await expect(exportWith(request(change), run.dependencies)).rejects.toMatchObject({ code });
      expect(run.log).not.toContain('browser');
      expect(run.log.some((line) => line.startsWith('spawn'))).toBe(false);
    },
  );

  it('hears nothing of a clip that starts at or after the end of the composition (D52.4)', async () => {
    const late = variant((draft) => {
      const [clip] = draft.clips as Record<string, unknown>[];
      Object.assign(clip ?? {}, { startUs: 10_000_000, durationUs: 1_000_000 });
    });
    const run = fakeRun();
    const { manifest } = await exportWith(request({ document: late }), run.dependencies);
    expect(manifest.audio).toBeNull();
    expect(run.log.some((line) => line.startsWith('probe'))).toBe(false);
  });

  it('checks where the audio starts for the sound of a video only: a clip passes whatever it states', async () => {
    // The refusal itself, for a video, is in video.test.ts.
    await expect(
      exportWith(
        request(),
        fakeRun({
          probe: {
            ...WAV_PROBE,
            audioStart: { pts: 1n, num: 1, den: 48_000 },
            videoStart: { pts: 0n, num: 1, den: 12_800 },
          },
        }).dependencies,
      ),
    ).resolves.toBeDefined();
  });

  it('accepts an asset exactly as long as the part of the clip that is heard', async () => {
    // 440 000 samples = 9 166 666.67 µs: too short for the reference clip…
    await expect(
      exportWith(request(), fakeRun({ probe: { ...WAV_PROBE, samples: 440_000n } }).dependencies),
    ).rejects.toMatchObject({ code: 'source-range-exceeded' });
    // …but the clip moved to 2.5 s is heard for 7.5 s = 360 000 samples only.
    const late = variant((draft) => {
      const [clip] = draft.clips as Record<string, unknown>[];
      Object.assign(clip ?? {}, { startUs: 2_500_000, durationUs: 10_000_000 });
    });
    await expect(
      exportWith(
        request({ document: late }),
        fakeRun({ probe: { ...WAV_PROBE, samples: 360_000n } }).dependencies,
      ),
    ).resolves.toBeDefined();
    await expect(
      exportWith(
        request({ document: late }),
        fakeRun({ probe: { ...WAV_PROBE, samples: 359_999n } }).dependencies,
      ),
    ).rejects.toMatchObject({ code: 'source-range-exceeded' });
  });

  it('renders at most FRAMES_IN_FLIGHT + 1 frames into an encoder that accepts nothing, then fails', async () => {
    const run = fakeRun({ stall: true });
    const pending = exportWith(request(), run.dependencies);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(run.deliveredFrames).toBe(FRAMES_IN_FLIGHT + 1);
    run.timer.expireAll();
    await expect(pending).rejects.toMatchObject({ code: 'encode-failed' });
    expect(run.deliveredFrames).toBe(FRAMES_IN_FLIGHT + 1);
    expect(run.log).toContain('kill');
    expect(run.log).toContain('remove video-1080p.mp4.segment-000000.mp4.partial');
    expect(run.log).toContain('remove video-1080p.mp4');
    expect(run.files.size).toBe(0);
  });

  it.each([
    ['FFmpeg exits with an error', { exitCode: 1 }],
    ['the receipt misses a frame', { receipt: (h: readonly string[]) => h.slice(1) }],
    [
      'the receipt has other bytes',
      { receipt: (h: readonly string[]) => h.map((x, i) => (i === 30 ? 'f'.repeat(64) : x)) },
    ],
    [
      'the receipt is reordered',
      { receipt: (h: readonly string[]) => [h[1] ?? '', h[0] ?? '', ...h.slice(2)] },
    ],
    ['a segment has another packet count', { packets: (_: string, n: number) => n - 1 }],
    [
      'a frame of a segment is at another presentation time',
      {
        timestamps: (_: string, w: readonly number[]) =>
          w.map((pts, at) => (at === 30 ? pts + 512 : pts)),
      },
    ],
    [
      'the joined file has another packet count',
      { packets: (f: string, n: number) => (f.endsWith('video-1080p.mp4.partial') ? n - 1 : n) },
    ],
    [
      'the joined file repeats a presentation time',
      {
        timestamps: (f: string, w: readonly number[]) =>
          f.endsWith('video-1080p.mp4.partial')
            ? w.map((pts, at) => (at === 150 ? (w[149] ?? 0) : pts))
            : [...w],
      },
    ],
    [
      'the audio pass exits with an error',
      { passExitCode: (a: readonly string[]) => (a.includes('concat') ? 0 : 1) },
    ],
    ['the audio pass writes another length', { audioSamples: (n: number) => n - 1 }],
    [
      'the join exits with an error',
      { passExitCode: (a: readonly string[]) => (a.includes('concat') ? 1 : 0) },
    ],
  ])('fails with encode-failed and leaves no file when %s', async (_, options) => {
    const run = fakeRun(options);
    await expect(exportWith(request(), run.dependencies)).rejects.toMatchObject({
      code: 'encode-failed',
    });
    expect(run.log).toContain('close');
    expect([...run.files.keys()]).toEqual([]);
  });

  it('ends on a navigated element with its code, kills FFmpeg, and removes the parts (D23.9)', async () => {
    const run = fakeRun({ failAt: { index: 150, code: 'custom-html-navigated' } });
    await expect(exportWith(request(), run.dependencies)).rejects.toMatchObject({
      code: 'custom-html-navigated',
    });
    expect(run.deliveredFrames).toBe(150);
    expect(run.log).toContain('kill');
    expect([...run.files.keys()]).toEqual([]);
  });
});

/** One job of a render: a range of segments into a directory of its own. */
async function segmentsJob(
  run: FakeRun,
  range: { fromUs: number; toUs: number } | undefined,
  directory: string,
  change: Partial<SegmentsRequest> = {},
): Promise<JoinPart<SegmentsManifest>> {
  const { manifest } = await renderSegmentsWith(
    {
      document: referenceComposition,
      resolveAsset: ({ id }) => ASSETS[id] ?? null,
      preset: '1080p',
      ...(range === undefined ? {} : { range }),
      outputDirectory: directory,
      ffmpeg: PATHS,
      ...change,
    },
    run.dependencies,
  );
  // As a host stores it: JSON, read back.
  return { manifest: JSON.parse(JSON.stringify(manifest)) as SegmentsManifest, directory };
}

async function audioJob(
  run: FakeRun,
  directory: string,
  change: Partial<AudioRequest> = {},
): Promise<JoinPart<AudioManifest>> {
  const { manifest } = await renderAudioWith(
    {
      document: referenceComposition,
      resolveAsset: ({ id }) => ASSETS[id] ?? null,
      outputDirectory: directory,
      ffmpeg: PATHS,
      ...change,
    },
    run.dependencies,
  );
  return { manifest: JSON.parse(JSON.stringify(manifest)) as AudioManifest, directory };
}

describe('jobs of one render on a fake frame loop and FFmpeg (D47.3–D47.6)', () => {
  it('render ranges in any order that join into the manifest of the one-pass export', async () => {
    const run = fakeRun();
    const late = await segmentsJob(run, { fromUs: 4_000_000, toUs: 10_000_000 }, '/jobs/c');
    const early = await segmentsJob(run, { fromUs: 0, toUs: 2_000_000 }, '/jobs/a');
    const middle = await segmentsJob(run, { fromUs: 2_000_000, toUs: 4_000_000 }, '/jobs/b');
    expect(late.manifest.segments.map(({ file }) => file)).toEqual(SEGMENT_NAMES.slice(2));
    expect(early.manifest.range).toEqual({
      fromUs: 0,
      toUs: 2_000_000,
      firstFrame: 0,
      frameCount: 60,
    });
    expect(late.manifest.frames.map(({ index }) => index)).toEqual(
      Array.from({ length: 180 }, (_, i) => 120 + i),
    );
    expect([...run.files.keys()].filter((path) => path.startsWith('/jobs/'))).toEqual([
      '/jobs/c/segment-000002.mp4',
      '/jobs/c/segment-000003.mp4',
      '/jobs/c/segment-000004.mp4',
      '/jobs/a/segment-000000.mp4',
      '/jobs/b/segment-000001.mp4',
    ]);
    const audio = await audioJob(run, '/jobs/audio');
    expect(run.files.has('/jobs/audio/audio.wav')).toBe(true);
    const joined = await joinSegmentsWith(
      {
        segments: [late, early, middle],
        audio,
        outputPath: '/jobs/video-1080p.mp4',
        ffmpeg: PATHS,
      },
      run.dependencies,
    );
    const onePass = await exportWith(request(), fakeRun().dependencies);
    expect(joined.manifest).toEqual(onePass.manifest);
    expect(run.files.get('/jobs/video-1080p.mp4')?.hash).toBe(fakeRunHash(onePass, run));
  });

  it('refuse a range off the segment grid before a browser opens', async () => {
    const run = fakeRun();
    await expect(
      segmentsJob(run, { fromUs: 1_000_000, toUs: 4_000_000 }, '/jobs/x'),
    ).rejects.toMatchObject({ code: 'range-invalid' });
    expect(run.log).not.toContain('browser');
  });

  it('render the audio of a range, and no file for a composition without a clip', async () => {
    const run = fakeRun();
    const part = await audioJob(run, '/jobs/p', { range: { fromUs: 2_000_000, toUs: 4_000_000 } });
    expect(part.manifest.range).toEqual({
      fromUs: 2_000_000,
      toUs: 4_000_000,
      firstFrame: 60,
      frameCount: 60,
    });
    expect(part.manifest.audio).toMatchObject({
      rangeStartSample: 96_000,
      rangeSampleCount: 96_000,
      file: 'audio.wav',
      codec: 'pcm_f32le',
      format: 'wav',
    });
    expect(part.manifest.audio?.sounds.map(({ assetHash }) => assetHash)).toEqual([
      referenceAssetHash('asset-audio'),
    ]);
    expect(run.log).not.toContain('browser');
    const silent = await audioJob(fakeRun(), '/jobs/q', {
      document: variant((draft) => (draft.clips = [])),
    });
    expect(silent.manifest.audio).toBeNull();
    expect(silent.manifest.ffmpeg.audioArgs).toBeNull();
  });

  it('join a range of a preview: the segments that cover the range of the audio pass', async () => {
    const run = fakeRun();
    const part = await segmentsJob(run, { fromUs: 2_000_000, toUs: 6_000_000 }, '/p', {
      preset: '720p',
    });
    const audio = await audioJob(run, '/p', { range: { fromUs: 2_000_000, toUs: 6_000_000 } });
    const { manifest } = await joinSegmentsWith(
      { segments: [part], audio, outputPath: '/p/preview.mp4', ffmpeg: PATHS },
      run.dependencies,
    );
    expect(manifest.range).toEqual({
      fromUs: 2_000_000,
      toUs: 6_000_000,
      firstFrame: 60,
      frameCount: 120,
    });
    expect(manifest.frames.map(({ index }) => index)).toEqual(
      Array.from({ length: 120 }, (_, i) => 60 + i),
    );
    expect(manifest.frameCount).toBe(300);
    expect(manifest.preset.name).toBe('mp4-720p');
  });
});

function referenceAssetHash(id: string): string {
  const assets = (referenceComposition as { assets: { id: string; contentHash: string }[] }).assets;
  return assets.find((asset) => asset.id === id)?.contentHash ?? '';
}

/** The hash the fake join gives the one-pass export's MP4, from the same segments and audio. */
function fakeRunHash(onePass: { manifest: ExportManifest }, run: FakeRun): string {
  const segments = onePass.manifest.segments.map(({ sha256: hash }) => hash);
  const audio = onePass.manifest.audio?.intermediate.sha256 ?? '';
  expect(run.files.size).toBeGreaterThan(0);
  return sha256([...segments, audio].join(','));
}

describe('the checks of a join (D47.5)', () => {
  async function parts(): Promise<{
    run: FakeRun;
    a: JoinPart<SegmentsManifest>;
    b: JoinPart<SegmentsManifest>;
    audio: JoinPart<AudioManifest>;
  }> {
    const run = fakeRun();
    const a = await segmentsJob(run, { fromUs: 0, toUs: 4_000_000 }, '/j/a');
    const b = await segmentsJob(run, { fromUs: 4_000_000, toUs: 10_000_000 }, '/j/b');
    const audio = await audioJob(run, '/j/audio');
    return { run, a, b, audio };
  }

  const edited = <M>(part: JoinPart<M>, edit: (manifest: M) => void): JoinPart<M> => {
    const manifest = structuredClone(part.manifest);
    edit(manifest);
    return { ...part, manifest };
  };

  it.each([
    [
      'a gap',
      ({ a, audio }: Awaited<ReturnType<typeof parts>>) => ({ segments: [a], audio }),
      /gap|cover/,
    ],
    [
      'an overlap',
      ({ a, b, audio }: Awaited<ReturnType<typeof parts>>) => ({ segments: [a, b, a], audio }),
      /more than once/,
    ],
    [
      'a foreign composition',
      ({ a, b, audio }: Awaited<ReturnType<typeof parts>>) => ({
        segments: [
          a,
          edited(b, (m) => Object.assign(m, { compositionHash: `sha256:${'0'.repeat(64)}` })),
        ],
        audio,
      }),
      /compositionHash/,
    ],
    [
      'another runtime',
      ({ a, b, audio }: Awaited<ReturnType<typeof parts>>) => ({
        segments: [
          a,
          edited(b, (m) => Object.assign(m, { runtime: { ...m.runtime, contentHash: 'x' } })),
        ],
        audio,
      }),
      /runtime/,
    ],
    [
      'another preset',
      ({ a, b, audio }: Awaited<ReturnType<typeof parts>>) => ({
        segments: [
          a,
          edited(b, (m) => Object.assign(m, { preset: { ...m.preset, name: 'mp4-720p' } })),
        ],
        audio,
      }),
      /preset/,
    ],
    [
      'another segment length',
      ({ a, b, audio }: Awaited<ReturnType<typeof parts>>) => ({
        segments: [a, edited(b, (m) => Object.assign(m, { segmentFrames: 30 }))],
        audio,
      }),
      /segmentFrames/,
    ],
    [
      'another FFmpeg',
      ({ a, b, audio }: Awaited<ReturnType<typeof parts>>) => ({
        segments: [
          a,
          edited(b, (m) => Object.assign(m, { ffmpeg: { ...m.ffmpeg, version: 'n7' } })),
        ],
        audio,
      }),
      /ffmpeg/,
    ],
    [
      'an audio pass of another composition',
      ({ a, b, audio }: Awaited<ReturnType<typeof parts>>) => ({
        segments: [a, b],
        audio: edited(audio, (m) =>
          Object.assign(m, { compositionHash: `sha256:${'1'.repeat(64)}` }),
        ),
      }),
      /audio manifest differs/,
    ],
    [
      'an audio pass of another FFmpeg',
      ({ a, b, audio }: Awaited<ReturnType<typeof parts>>) => ({
        segments: [a, b],
        audio: edited(audio, (m) =>
          Object.assign(m, { identity: { ...m.identity, ffmpegVersion: 'n7' } }),
        ),
      }),
      /audio manifest differs/,
    ],
    [
      'an audio pass of a shorter range',
      ({ a, b, audio }: Awaited<ReturnType<typeof parts>>) => ({
        segments: [a, b],
        audio: edited(audio, (m) =>
          Object.assign(m, { range: { ...m.range, toUs: 8_000_000, frameCount: 240 } }),
        ),
      }),
      /not the range/,
    ],
    [
      'a segment off the grid',
      ({ a, b, audio }: Awaited<ReturnType<typeof parts>>) => ({
        segments: [
          a,
          edited(b, (m) =>
            Object.assign(m, {
              segments: m.segments.map((s) => ({ ...s, firstFrame: s.firstFrame + 1 })),
            }),
          ),
        ],
        audio,
      }),
      /segment grid/,
    ],
    [
      'frames that are not the segments’',
      ({ a, b, audio }: Awaited<ReturnType<typeof parts>>) => ({
        segments: [a, edited(b, (m) => Object.assign(m, { frames: m.frames.slice(1) }))],
        audio,
      }),
      /other frames/,
    ],
    [
      'a file name that is a path',
      ({ a, b, audio }: Awaited<ReturnType<typeof parts>>) => ({
        segments: [
          a,
          edited(b, (m) =>
            Object.assign(m, { segments: m.segments.map((s) => ({ ...s, file: `../${s.file}` })) }),
          ),
        ],
        audio,
      }),
      /plain file name/,
    ],
    [
      'another kind of manifest',
      ({ a, b, audio }: Awaited<ReturnType<typeof parts>>) => ({
        segments: [a, b],
        audio: edited(audio, (m) => Object.assign(m, { kind: 'segments' })),
      }),
      /audio manifest of version 5/,
    ],
    [
      'no segments',
      ({ audio }: Awaited<ReturnType<typeof parts>>) => ({ segments: [], audio }),
      /at least one/,
    ],
  ])('refuses %s with join-invalid before FFmpeg runs', async (_, pick, message) => {
    const given = await parts();
    const before = given.run.log.length;
    const { segments, audio } = pick(given);
    await expect(
      joinSegmentsWith(
        { segments, audio, outputPath: '/j/v.mp4', ffmpeg: PATHS },
        given.run.dependencies,
      ),
    ).rejects.toMatchObject({
      code: 'join-invalid',
      message: expect.stringMatching(message) as unknown,
    });
    expect(given.run.log.slice(before).some((line) => line.startsWith('join'))).toBe(false);
  });

  it('refuses a segment file or an audio file that changed since its manifest', async () => {
    for (const path of ['/j/b/segment-000004.mp4', '/j/audio/audio.wav']) {
      const { run, a, b, audio } = await parts();
      const file = run.files.get(path);
      if (file === undefined) throw new Error(`no ${path}`);
      run.files.set(path, { ...file, hash: `sha256:${'2'.repeat(64)}` });
      await expect(
        joinSegmentsWith(
          { segments: [a, b], audio, outputPath: '/j/v.mp4', ffmpeg: PATHS },
          run.dependencies,
        ),
      ).rejects.toMatchObject({ code: 'join-invalid' });
      expect(run.files.has('/j/v.mp4')).toBe(false);
    }
  });

  it('refuses a segment file that is missing', async () => {
    const { run, a, b, audio } = await parts();
    run.files.delete('/j/a/segment-000000.mp4');
    await expect(
      joinSegmentsWith(
        { segments: [a, b], audio, outputPath: '/j/v.mp4', ffmpeg: PATHS },
        run.dependencies,
      ),
    ).rejects.toMatchObject({ code: 'join-invalid' });
  });

  it('is a pure function of the manifests, and orders the segments by index', async () => {
    const { a, b, audio } = await parts();
    const plan = joinPlan([b, a], audio);
    expect(plan.segments.map(({ index, path }) => [index, path])).toEqual([
      [0, '/j/a/segment-000000.mp4'],
      [1, '/j/a/segment-000001.mp4'],
      [2, '/j/b/segment-000002.mp4'],
      [3, '/j/b/segment-000003.mp4'],
      [4, '/j/b/segment-000004.mp4'],
    ]);
    expect(plan.frames.map(({ index }) => index)).toEqual(Array.from({ length: 300 }, (_, i) => i));
    expect(plan.audioPath).toBe('/j/audio/audio.wav');
  });
});

describe('a still frame on a fake render and FFmpeg (D47.7)', () => {
  const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
  const encoded = new Uint8Array([255, 216, 255, 9]);

  function stillRun(): { deps: StillDependencies; log: string[] } {
    const log: string[] = [];
    const tools = {
      identity: {
        ffmpegSha256: FFMPEG_SHA256,
        ffprobeSha256: FFPROBE_SHA256,
        version: 'n8.1.3-20260921',
        configuration: FFMPEG_CONFIGURATION,
        encoders: [...REQUIRED_ENCODERS],
      },
      run(args: readonly string[], input: Uint8Array) {
        log.push(`encode ${args[args.length - 2] ?? ''} ${String(input.length)}`);
        return Promise.resolve({ code: 0, stdout: encoded, stderr: '' });
      },
    } as unknown as FfmpegTools;
    return {
      log,
      deps: {
        render(given) {
          log.push(`render ${given.timesUs.join(',')}`);
          return Promise.resolve({
            frames: [{ index: 75, timeUs: 2_500_000, png }],
            manifest: {
              manifestVersion: 3,
              preset: {
                name: 'frames-png',
                width: 1080,
                height: 1920,
                fps: 30,
                deviceScaleFactor: 1,
              },
              frames: [{ index: 75, timeUs: 2_500_000, sha256: sha256(png) }],
              ffmpeg: null,
            } as unknown as RenderManifest,
          });
        },
        tools: () => {
          log.push('tools');
          return Promise.resolve(tools);
        },
      },
    };
  }

  const still = (change: Partial<StillRequest> = {}): StillRequest => ({
    document: referenceComposition,
    resolveAsset: ({ id }) => ASSETS[id] ?? null,
    timeUs: 2_500_000,
    format: 'png',
    ...change,
  });

  it('returns the captured PNG bytes unchanged, without FFmpeg', async () => {
    const { deps, log } = stillRun();
    const result = await renderStillWith(still(), deps);
    expect(result.bytes).toBe(png);
    expect(result.mediaType).toBe('image/png');
    expect(result.manifest).toMatchObject({
      manifestVersion: 5,
      kind: 'still',
      preset: { name: 'still-png' },
      output: { mediaType: 'image/png', sha256: sha256(png) },
      ffmpeg: null,
    });
    expect(log).toEqual(['render 2500000']);
  });

  it.each([
    ['jpeg', 'mjpeg', 'image/jpeg'],
    ['webp', 'webp', 'image/webp'],
  ])('encodes %s from the PNG with the pinned FFmpeg', async (format, muxer, mediaType) => {
    const { deps, log } = stillRun();
    const result = await renderStillWith(still({ format, ffmpeg: PATHS }), deps);
    expect(result.bytes).toBe(encoded);
    expect(result.manifest.output).toEqual({ mediaType, sha256: sha256(encoded) });
    expect(result.manifest.preset.name).toBe(`still-${format}`);
    expect(result.manifest.ffmpeg?.args).toEqual(stillArgs(format as 'jpeg' | 'webp', reference));
    expect(log).toEqual(['tools', 'render 2500000', `encode ${muxer} ${String(png.length)}`]);
  });

  it.each([
    ['still-format-unsupported', { format: 'gif' }],
    ['frame-out-of-range', { timeUs: 2_500_001 }],
    ['frame-out-of-range', { timeUs: 10_000_000 }],
    ['ffmpeg-missing', { format: 'jpeg' }],
    ['invalid-document', { document: { schemaVersion: '0.2' } }],
  ] as const)('refuses with %s before anything renders', async (code, change) => {
    const { deps, log } = stillRun();
    await expect(renderStillWith(still(change), deps)).rejects.toMatchObject({ code });
    expect(log).toEqual([]);
  });
});

describe('memory of the export (D29.3, specification §5 P5)', () => {
  it('premise: the garbage collector can be called', () => {
    expect(typeof globalThis.gc).toBe('function');
  });

  it(
    'keeps no frame: live memory does not grow with the number of frames',
    { timeout: 120_000 },
    async () => {
      const size = 4 * 1024 * 1024;
      const peaks: number[] = [];
      const measure = async (frames: number): Promise<number> => {
        let peak = 0;
        const document = variant((draft) => {
          draft.durationUs = Math.round((frames * 1_000_000) / 30);
          for (const scene of draft['scenes'] as { durationUs: number }[]) {
            scene.durationUs = draft['durationUs'] as number;
          }
          draft.clips = [];
        });
        const run = fakeRun({
          frameSize: size,
          onFrame: (index) => {
            if (index % 10 === 9) {
              globalThis.gc?.();
              peak = Math.max(peak, process.memoryUsage().arrayBuffers);
            }
          },
        });
        // The reference animations end within the shortened document; only its length matters here.
        await exportWith(request({ document }), run.dependencies).catch((reason: unknown) => {
          throw reason;
        });
        return peak;
      };
      globalThis.gc?.();
      const baseline = process.memoryUsage().arrayBuffers;
      peaks.push(await measure(30), await measure(300));
      const [short = 0, long = 0] = peaks;
      // Keeping every frame would grow the peak by the 270 extra frames of 4 MB; the window
      // of D29.3 holds three. A quarter of that growth is far above the collector's slack and
      // far below what retention would cost.
      const retained = (300 - 30) * size;
      expect(long - short).toBeLessThan(retained / 4);
      expect(long - baseline).toBeLessThan(retained / 4);
    },
  );
});

describe('the documents of the Custom HTML frames (D29.7)', () => {
  const shell = (loaderId: string): FrameDocument => ({ loaderId, url: 'about:srcdoc' });
  const one = new Map([['frame-a', shell('load-1')]]);

  it('counts the Custom HTML nodes of a composition, and none when there are none', () => {
    expect(customHtmlNodes(reference)).toBe(1);
    const two = validated(
      variant((draft) => {
        const [scene] = draft.scenes as Record<string, unknown>[];
        const nodes = (scene?.nodes ?? []) as Record<string, unknown>[];
        const element = nodes.find(({ type }) => type === 'custom-html');
        nodes.push({ ...structuredClone(element), id: 'node-second' });
      }),
    );
    expect(customHtmlNodes(two)).toBe(2);
    const none = validated(
      variant((draft) => {
        const [scene] = draft.scenes as Record<string, unknown>[];
        if (scene !== undefined) {
          scene.nodes = (scene.nodes as Record<string, unknown>[]).filter(
            ({ type }) => type !== 'custom-html',
          );
        }
      }),
    );
    expect(customHtmlNodes(none)).toBe(0);
  });

  it('counts an element inside a group, which schema 0.2 cannot express yet', () => {
    // Groups hold image and text nodes only (D16), so this document is forged on
    // purpose: the count must not depend on where an element sits in the tree.
    const nested = {
      scenes: [
        {
          nodes: [
            { type: 'group', children: [{ type: 'custom-html' }, { type: 'text' }] },
            { type: 'custom-html' },
          ],
        },
      ],
    } as unknown as ValidatedComposition;
    expect(customHtmlNodes(nested)).toBe(2);
  });

  it('accepts as many shells as the composition has nodes, and the same ones again', () => {
    expect(documentsProblem(1, null, one)).toBeNull();
    expect(documentsProblem(1, one, new Map([['frame-a', shell('load-1')]]))).toBeNull();
    expect(documentsProblem(0, null, new Map())).toBeNull();
  });

  it('refuses a page that shows another number of frames than the composition has', () => {
    // The fail-open case: a frame the Producer cannot see is not an empty check.
    expect(documentsProblem(1, null, new Map())).toContain('0 Custom HTML frames');
    expect(documentsProblem(1, null, new Map([...one, ['frame-b', shell('load-2')]]))).toContain(
      '2 Custom HTML frames',
    );
  });

  it('refuses a document that is not the shell, or another document than the first frame', () => {
    expect(
      documentsProblem(
        1,
        null,
        new Map([['frame-a', { loaderId: 'load-1', url: 'chrome-error://chromewebdata/' }]]),
      ),
    ).toContain('instead of its shell');
    expect(documentsProblem(1, one, new Map([['frame-a', shell('load-2')]]))).toContain(
      'loaded another document',
    );
    expect(documentsProblem(1, one, new Map([['frame-b', shell('load-1')]]))).toContain('is gone');
  });
});

/** Every progress event of a job, in order (D48.1). */
function progress(): { events: ProgressEvent[]; onProgress: (event: ProgressEvent) => void } {
  const events: ProgressEvent[] = [];
  return { events, onProgress: (event) => events.push(event) };
}

describe('the job contract on a fake frame loop and FFmpeg (D48)', () => {
  it('reports one start, a frame per frame, and a segment per finished segment, in order', async () => {
    const run = fakeRun();
    const { events, onProgress } = progress();
    await segmentsJob(run, { fromUs: 4_000_000, toUs: 10_000_000 }, '/jobs/c', { onProgress });
    expect(events[0]).toEqual({ event: 'start', frames: 180, segments: 3 });
    const frames = events.filter((event) => event.event === 'frame');
    expect(frames.map((event) => [event.frame, event.done, event.frames])).toEqual(
      Array.from({ length: 180 }, (_, i) => [120 + i, i + 1, 180]),
    );
    const order = events.map((event) =>
      event.event === 'frame'
        ? event.frame
        : event.event === 'segment'
          ? `s${String(event.segment)}`
          : event.event,
    );
    // A segment is reported after its last frame and before the next segment's first.
    expect(order.indexOf('s2')).toBe(order.indexOf(179) + 1);
    expect(order.indexOf(180)).toBe(order.indexOf('s2') + 1);
    expect(events.filter((event) => event.event === 'segment')).toEqual([
      { event: 'segment', segment: 2, done: 1, segments: 3 },
      { event: 'segment', segment: 3, done: 2, segments: 3 },
      { event: 'segment', segment: 4, done: 3, segments: 3 },
    ]);
    // Every event has exactly the keys of its kind.
    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual(
        {
          start: ['event', 'frames', 'segments'],
          frame: ['done', 'event', 'frame', 'frames'],
          segment: ['done', 'event', 'segment', 'segments'],
        }[event.event],
      );
    }
  });

  it('reports the same frames for a one-pass export, and a start without frames for the audio pass', async () => {
    const { events, onProgress } = progress();
    await exportWith(request({ onProgress }), fakeRun().dependencies);
    expect(events[0]).toEqual({ event: 'start', frames: 300, segments: 5 });
    expect(events.filter((event) => event.event === 'frame')).toHaveLength(300);
    const audio = progress();
    await audioJob(fakeRun(), '/jobs/audio', { onProgress: audio.onProgress });
    expect(audio.events).toEqual([{ event: 'start', frames: 0, segments: 0 }]);
  });

  it('cancels a range job: kills FFmpeg, closes the page, and leaves no file under any name', async () => {
    const controller = new AbortController();
    const run = fakeRun({
      onFrame: (index) => {
        if (index === 190) controller.abort();
      },
    });
    await expect(
      segmentsJob(run, { fromUs: 4_000_000, toUs: 10_000_000 }, '/jobs/c', {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'cancelled' });
    expect(run.log).toContain('kill');
    expect(run.log).toContain('close');
    // Segment 2 was finished before the signal; a cancelled job removes it again.
    expect(run.log).toContain('remove segment-000002.mp4');
    expect(run.log).toContain('remove segment-000003.mp4.partial');
    expect([...run.files.keys()]).toEqual([]);
    // The frame loop stops at the first frame after the signal.
    expect(run.deliveredFrames).toBe(190 - 120 + 1);
  });

  it('cancels a one-pass export, and removes its parts and its output', async () => {
    const controller = new AbortController();
    const run = fakeRun({
      onFrame: (index) => {
        if (index === 200) controller.abort();
      },
    });
    await expect(
      exportWith(request({ signal: controller.signal }), run.dependencies),
    ).rejects.toMatchObject({ code: 'cancelled' });
    expect(run.log).toContain('kill');
    expect([...run.files.keys()]).toEqual([]);
  });

  it('ends with the reason of the signal when it is a ProducerError: a wall time that ran out', async () => {
    const controller = new AbortController();
    const run = fakeRun({
      onFrame: (index) => {
        if (index === 10) {
          controller.abort(new ProducerError('limit-exceeded', 'The job ran for too long.'));
        }
      },
    });
    await expect(
      segmentsJob(run, undefined, '/jobs/all', { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'limit-exceeded', message: 'The job ran for too long.' });
    expect([...run.files.keys()]).toEqual([]);
  });

  it('starts nothing for a signal that already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const run = fakeRun();
    await expect(
      segmentsJob(run, undefined, '/jobs/all', { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'cancelled' });
    await expect(audioJob(run, '/jobs/audio', { signal: controller.signal })).rejects.toMatchObject(
      { code: 'cancelled' },
    );
    await expect(
      exportWith(request({ signal: controller.signal }), run.dependencies),
    ).rejects.toMatchObject({ code: 'cancelled' });
    expect(run.log).toEqual([]);
  });

  it('kills the audio pass and the join on the signal, and removes what they wrote', async () => {
    const audioCancel = new AbortController();
    const run = fakeRun({
      onPass: (args) => {
        if (!args.includes('concat')) audioCancel.abort();
      },
    });
    await expect(
      audioJob(run, '/jobs/audio', { signal: audioCancel.signal }),
    ).rejects.toMatchObject({ code: 'cancelled' });
    expect(run.log).toContain('killed pass');
    expect(run.log).toContain('remove audio.wav.partial');
    expect(run.files.has('/jobs/audio/audio.wav')).toBe(false);

    const joinCancel = new AbortController();
    const parts = fakeRun({
      onPass: (args) => {
        if (args.includes('concat')) joinCancel.abort();
      },
    });
    const range = await segmentsJob(parts, undefined, '/jobs/all');
    const audio = await audioJob(parts, '/jobs/audio');
    await expect(
      joinSegmentsWith(
        {
          segments: [range],
          audio,
          outputPath: '/jobs/video-1080p.mp4',
          ffmpeg: PATHS,
          signal: joinCancel.signal,
        },
        parts.dependencies,
      ),
    ).rejects.toMatchObject({ code: 'cancelled' });
    expect(parts.log).toContain('killed pass');
    expect(parts.files.has('/jobs/video-1080p.mp4')).toBe(false);
  });

  const imageBytes = ASSETS['asset-image']?.bytes.byteLength ?? 0;
  const totalBytes = Object.values(ASSETS).reduce((sum, { bytes }) => sum + bytes.byteLength, 0);
  const documentBytes = new TextEncoder().encode(canonicalJson(reference)).byteLength;

  it.each([
    ['the document size', { maxDocumentBytes: documentBytes - 1 }],
    ['the duration', { maxDurationUs: 9_999_999 }],
    ['the frames of the range', { maxFrames: 179 }],
    ['the number of assets', { maxAssets: 2 }],
    ['the size of one asset', { maxAssetBytes: imageBytes - 1 }],
    ['the size of all assets', { maxTotalAssetBytes: totalBytes - 1 }],
    ['a limit that is not a non-negative integer', { maxFrames: -1 }],
  ])('refuses %s with limit-exceeded before a browser or FFmpeg starts', async (_, limits) => {
    const run = fakeRun();
    await expect(
      segmentsJob(run, { fromUs: 4_000_000, toUs: 10_000_000 }, '/jobs/c', { limits }),
    ).rejects.toMatchObject({ code: 'limit-exceeded' });
    expect(run.log).toEqual([]);
  });

  it('accepts a job exactly at every limit', async () => {
    const run = fakeRun();
    const { manifest } = await segmentsJob(
      run,
      { fromUs: 4_000_000, toUs: 10_000_000 },
      '/jobs/c',
      {
        limits: {
          maxDocumentBytes: documentBytes,
          maxDurationUs: 10_000_000,
          maxFrames: 180,
          maxAssets: 3,
          maxAssetBytes: Math.max(...Object.values(ASSETS).map(({ bytes }) => bytes.byteLength)),
          maxTotalAssetBytes: totalBytes,
        },
      },
    );
    expect(manifest.segments).toHaveLength(3);
  });

  it('checks the frames of the audio pass and of the export against their ranges', async () => {
    await expect(
      audioJob(fakeRun(), '/jobs/audio', {
        range: { fromUs: 0, toUs: 2_000_000 },
        limits: { maxFrames: 59 },
      }),
    ).rejects.toMatchObject({ code: 'limit-exceeded' });
    await expect(
      exportWith(request({ limits: { maxFrames: 299 } }), fakeRun().dependencies),
    ).rejects.toMatchObject({ code: 'limit-exceeded' });
  });

  it('passes the signal, the progress, and the limits of a still to its render, and counts it as one frame', async () => {
    const seen: Parameters<StillDependencies['render']>[0][] = [];
    const controller = new AbortController();
    const { onProgress } = progress();
    const deps: StillDependencies = {
      render(given) {
        seen.push(given);
        return Promise.reject(new ProducerError('page-error', 'stop here'));
      },
      tools: () => Promise.reject(new Error('no FFmpeg for png')),
    };
    const base: StillRequest = {
      document: referenceComposition,
      resolveAsset: ({ id }) => ASSETS[id] ?? null,
      timeUs: 2_500_000,
      format: 'png',
    };
    await expect(
      renderStillWith(
        { ...base, signal: controller.signal, onProgress, limits: { maxFrames: 1 } },
        deps,
      ),
    ).rejects.toMatchObject({ code: 'page-error' });
    expect(seen[0]).toMatchObject({
      signal: controller.signal,
      onProgress,
      limits: { maxFrames: 1 },
    });
    await expect(
      renderStillWith({ ...base, limits: { maxDurationUs: 1 } }, deps),
    ).rejects.toMatchObject({ code: 'limit-exceeded' });
    expect(seen).toHaveLength(1);
    controller.abort();
    await expect(
      renderStillWith({ ...base, signal: controller.signal }, deps),
    ).rejects.toMatchObject({ code: 'cancelled' });
    expect(seen).toHaveLength(1);
  });
});

describe('the plan of an estimate (D48.5)', () => {
  it('samples the middle segment of the grid of its sample length', () => {
    // 300 frames in 30 segments of 10: segment 14 holds frames 140…149.
    expect(estimatePlan(referenceComposition)).toEqual({
      range: { fromUs: frameToTimeUs(140, 30), toUs: frameToTimeUs(150, 30) },
      sampleSegmentFrames: 10,
      frames: 10,
      segmentFrames: 60,
      segments: 5,
    });
    expect(estimatePlan(referenceComposition, 2, 45)).toMatchObject({
      range: { fromUs: frameToTimeUs(148, 30), toUs: frameToTimeUs(150, 30) },
      frames: 2,
      segmentFrames: 45,
      segments: 7,
    });
    expect(estimatePlan(referenceComposition, 300).range).toEqual({ fromUs: 0, toUs: 10_000_000 });
  });

  it('never samples the shorter last segment', () => {
    // 300 frames in segments of 200: the second holds 100.
    expect(estimatePlan(referenceComposition, 200)).toMatchObject({
      range: { fromUs: 0, toUs: frameToTimeUs(200, 30) },
      frames: 200,
    });
  });

  it.each([
    ['one frame', 1],
    ['more frames than the composition has', 301],
    ['a fraction', 2.5],
  ])('refuses %s with range-invalid', (_, samples) => {
    expect(() => estimatePlan(referenceComposition, samples)).toThrow(
      expect.objectContaining({ code: 'range-invalid' }),
    );
  });

  it('refuses an invalid document and segment length with their codes', () => {
    expect(() => estimatePlan({})).toThrow(expect.objectContaining({ code: 'invalid-document' }));
    expect(() => estimatePlan(referenceComposition, 10, 0)).toThrow(
      expect.objectContaining({ code: 'segment-length-invalid' }),
    );
  });
});

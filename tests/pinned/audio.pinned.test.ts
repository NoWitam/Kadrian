/**
 * The audio mix of the Producer (D52.5) with the pinned FFmpeg: the audio
 * intermediate of a document with several sounds — two clips with a source
 * start, a volume, and fades, one clip at volume 0, and the sound of a video
 * node — equals a mix computed here, sample for sample, from the sources as
 * the pinned FFmpeg decodes them. The sample positions are written out by hand
 * from the rules of D52.5, not taken from the implementation; the mix is
 * summed in TypeScript. Read by path (D64), the sources give the same bytes. Every problem of a sound is typed before any pass.
 *
 * The Player plays the same plan with Web Audio (D53): in pinned Chromium, its
 * graph rendered offline from the start and from a sample in the middle equals
 * the Producer's intermediate within the error of 32-bit float automation,
 * and the facts it reads are the decoded lengths. A second document adds a
 * video's fades and two volume curves, one on a clip at half speed (D85): the
 * Producer's mix equals the sum of the decoded sources, the stretch, and the
 * envelopes within 1e-5, and the Player's equals it within 1e-4 from sample 0
 * and from inside a ramp in decibels. Skipped without
 * `KADRION_FFMPEG` and `KADRION_FFPROBE`; required where the run is pinned.
 */
import { execFile } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import {
  AUDIO_FILE_NAME,
  launchChromium,
  PINNED_IMAGE,
  PINNED_IMAGE_VARIABLE,
  renderAudio,
  sha256,
  type AudioManifest,
  type ProducerAssetResolver,
  type LaunchedChromium,
} from '@kadrion/producer';
import type { AssetResolver } from '@kadrion/renderer-dom';
import { audioPlan } from '@kadrion/runtime';
import { stretchSound } from '@kadrion/runtime/stretch';
import { volumeEnvelope } from '@kadrion/runtime/volume';
import { validateComposition, type ValidatedComposition } from '@kadrion/schema';
import { VIDEO_FIXTURE, VIDEO_SOUND_FIXTURE } from '@kadrion/test-fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  closeConformanceHost,
  openConformanceHost,
  type ConformanceHost,
} from './conformance-host.js';
import { OUTPUT_DIRECTORY, writeReport } from './support.js';
import { makeVideoFixture, makeVideoSoundFixture } from './video-fixture.ts';

const run = promisify(execFile);
const ffmpegPath = process.env.KADRION_FFMPEG;
const ffprobePath = process.env.KADRION_FFPROBE;
const available = ffmpegPath !== undefined && ffprobePath !== undefined;
const pinned = process.env[PINNED_IMAGE_VARIABLE] === PINNED_IMAGE;
const FFMPEG = { ffmpegPath: ffmpegPath ?? '', ffprobePath: ffprobePath ?? '' };
const DIRECTORY = join(OUTPUT_DIRECTORY, 'audio');
const RATE = 48_000;

/** A WAV of signed 16-bit samples at 48 kHz, its channels interleaved. */
function wav(channels: number, frames: number, sample: (frame: number, channel: number) => number) {
  const data = frames * channels * 2;
  const bytes = new Uint8Array(44 + data);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      bytes[offset + index] = text.charCodeAt(index);
    }
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + data, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, data, true);
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      view.setInt16(44 + (frame * channels + channel) * 2, sample(frame, channel), true);
    }
  }
  return bytes;
}

/** Three seconds, mono: a triangle of 120 samples (400 Hz). */
const MUSIC = wav(1, 3 * RATE, (frame) => {
  const phase = frame % 120;
  return phase < 60 ? -9000 + 300 * phase : 9000 - 300 * (phase - 60);
});
/** One second, stereo: a falling saw on the left, a square on the right. */
const VOICE = wav(2, RATE, (frame, channel) =>
  channel === 0 ? 7000 - (frame % 70) * 200 : frame % 96 < 48 ? 6000 : -6000,
);

/** The document of this test: 2 s at 25 fps, a background, a video with sound, and three clips. */
function document(videoHash: string, videoVolume = 0.5): Record<string, unknown> {
  return {
    schemaVersion: '0.27',
    width: 320,
    height: 180,
    safeArea: { fromTop: 0, fromRight: 0, fromBottom: 0, fromLeft: 0 },
    fps: 25,
    durationUs: 2_000_000,
    assets: [
      { id: 'asset-music', type: 'audio', contentHash: sha256(MUSIC) },
      { id: 'asset-voice', type: 'audio', contentHash: sha256(VOICE) },
      { id: 'asset-video', type: 'video', contentHash: videoHash },
    ],
    scenes: [
      {
        id: 'scene-main',
        durationUs: 2_000_000,
        nodes: [
          {
            id: 'node-background',
            type: 'background',
            startUs: 0,
            durationUs: 2_000_000,
            color: '#000000',
            animations: [],
          },
          {
            id: 'node-video',
            type: 'video',
            startUs: 400_000,
            durationUs: 1_000_000,
            position: { x: 0, y: 0 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            origin: { x: 0, y: 0 },
            flip: { x: false, y: false },
            opacity: 1,
            animations: [],
            assetId: 'asset-video',
            sourceStartUs: 300_000,
            sourceStartRemainder: 0,
            speed: { num: 1, den: 1 },
            reverse: false,
            width: 320,
            height: 180,
            fit: 'fill',
            focus: { x: 500, y: 500 },
            crop: { top: 0, right: 0, bottom: 0, left: 0 },
            cornerRadius: 0,
            volume: videoVolume,
            fadeInUs: 0,
            fadeOutUs: 0,
            effects: [],
            mask: { kind: 'none' },
            matte: { kind: 'none' },
            blendMode: 'normal',
          },
        ],
        clips: [],
        transitions: [],
        effects: [],
      },
    ],
    clips: [
      {
        id: 'clip-music',
        type: 'audio',
        assetId: 'asset-music',
        startUs: 0,
        durationUs: 3_000_000,
        sourceStartUs: 250_000,
        sourceStartRemainder: 0,
        speed: { num: 1, den: 1 },
        reverse: false,
        volume: 0.6,
        fadeInUs: 333_333,
        fadeOutUs: 1_500_000,
        animations: [],
      },
      {
        id: 'clip-silent',
        type: 'audio',
        assetId: 'asset-voice',
        startUs: 0,
        durationUs: 2_000_000,
        sourceStartUs: 0,
        sourceStartRemainder: 0,
        speed: { num: 1, den: 1 },
        reverse: false,
        volume: 0,
        fadeInUs: 0,
        fadeOutUs: 0,
        animations: [],
      },
      {
        id: 'clip-voice',
        type: 'audio',
        assetId: 'asset-voice',
        startUs: 1_234_567,
        durationUs: 700_000,
        sourceStartUs: 0,
        sourceStartRemainder: 0,
        speed: { num: 1, den: 1 },
        reverse: false,
        volume: 1,
        fadeInUs: 0,
        fadeOutUs: 100_000,
        animations: [],
      },
    ],
    transitions: [],
    definitions: [],
    template: { inputs: [], bindings: [], conditions: [], repeats: [] },
  };
}

/**
 * The sounds of the document on the 48 kHz grid, by hand from D52.5: every
 * time to its nearest sample, an exact half up. The music is heard from 0 to
 * the end, 96 000 samples, from source sample 12 000; its fade-in of 333 333 µs
 * is 15 999.98 samples, so 16 000; its fade-out starts at 1.5 s of its 3 s
 * lifetime (sample 72 000) and lasts to 3 s (sample 144 000), past the end of
 * the composition. The voice starts at 59 259.216 (59 259) and ends at
 * 92 859.216 (92 859); its fade-out starts at 88 059.216 (88 059), 28 800
 * samples after its start, and lasts 4 800. The video is heard from sample 19 200 for 48 000,
 * from source sample 14 400. The silent clip is not heard.
 */
const SOUNDS = [
  {
    kind: 'clip',
    id: 'clip-music',
    assetId: 'asset-music',
    volume: 0.6,
    startSample: 0,
    sampleCount: 96_000,
    sourceStartSample: 12_000,
    fadeIn: { startSample: 0, sampleCount: 16_000 },
    fadeOut: { startSample: 72_000, sampleCount: 72_000 },
  },
  {
    kind: 'clip',
    id: 'clip-voice',
    assetId: 'asset-voice',
    volume: 1,
    startSample: 59_259,
    sampleCount: 33_600,
    sourceStartSample: 0,
    fadeIn: null,
    fadeOut: { startSample: 28_800, sampleCount: 4_800 },
  },
  {
    kind: 'video',
    id: 'node-video',
    assetId: 'asset-video',
    volume: 0.5,
    startSample: 19_200,
    sampleCount: 48_000,
    sourceStartSample: 14_400,
    fadeIn: null,
    fadeOut: null,
  },
] as const;

/** A source as the pinned FFmpeg decodes it: 32-bit float, stereo, 48 kHz, interleaved. */
async function decoded(bytes: Uint8Array): Promise<Float32Array> {
  const directory = mkdtempSync(join(tmpdir(), 'kadrion-audio-source-'));
  try {
    const input = join(directory, 'source');
    writeFileSync(input, bytes);
    const { stdout } = await run(
      ffmpegPath ?? '',
      [
        ...['-nostdin', '-v', 'error', '-threads', '1', '-i', `file:${input}`, '-map', '0:a:0'],
        ...['-ac', '2', '-ar', String(RATE), '-f', 'f32le', 'pipe:1'],
      ],
      { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
    );
    const copy = new Uint8Array(stdout);
    return new Float32Array(copy.buffer, 0, copy.byteLength / 4);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** The samples of a WAV of 32-bit floats, found by its `data` chunk. */
function wavFloats(bytes: Uint8Array): { channels: number; rate: number; samples: Float32Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let channels = 0;
  let rate = 0;
  while (offset + 8 <= bytes.byteLength) {
    const id = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    if (id === 'fmt ') {
      channels = view.getUint16(offset + 10, true);
      rate = view.getUint32(offset + 12, true);
    }
    if (id === 'data') {
      const copy = bytes.slice(offset + 8, offset + 8 + size);
      return { channels, rate, samples: new Float32Array(copy.buffer) };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error('The WAV has no data chunk.');
}

/**
 * Run in the conformance host (D33.2): the Player's graph for a document,
 * scheduled from output sample `fromSample` at time 0 of an offline context at
 * 48 kHz, through the built packages the host serves; the rendered samples
 * interleaved, and the decoded length of each source (D53). With `toSample`,
 * the graph of a loop of the play range `[fromSample, toSample)` (D61.2):
 * `passes` passes, each scheduled right after the one before, as the Player
 * schedules them.
 */
const PLAYED = `(async () => {
  const { text, sources, fromSample, toSample, passes } = INPUT;
  const player = await import('@kadrion/player');
  const runtime = await import('@kadrion/runtime');
  const schema = await import('@kadrion/schema');
  const layout = runtime.audioLayout(runtime.audioPlan(schema.validateComposition(JSON.parse(text)).composition));
  const pass = (toSample ?? layout.totalSamples) - fromSample;
  const context = new OfflineAudioContext(2, pass * (passes ?? 1), 48000);
  const buffers = new Map();
  const lengths = {};
  for (const [id, base64] of sources) {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const decoded = await player.decodeSound(context, id, bytes.buffer);
    buffers.set(id, decoded);
    lengths[id] = decoded.length;
  }
  if (toSample === undefined) player.scheduleSounds(context, layout, buffers, fromSample, 0);
  else {
    for (let k = 0; k < passes; k += 1) {
      player.scheduleSounds(context, layout, buffers, fromSample, (k * pass) / 48000, toSample);
    }
  }
  const rendered = await context.startRendering();
  const left = rendered.getChannelData(0);
  const right = rendered.getChannelData(1);
  const samples = [];
  for (let index = 0; index < rendered.length; index += 1) samples.push(left[index], right[index]);
  return { samples, lengths };
})()`;

/** The gain of a linear fade at sample `k` of the sound (D52.2). */
function gain(
  sound: Pick<(typeof SOUNDS)[number] | (typeof CURVED_SOUNDS)[number], 'fadeIn' | 'fadeOut'>,
  k: number,
): number {
  let value = 1;
  if (sound.fadeIn !== null && k < sound.fadeIn.sampleCount) {
    value *= k / sound.fadeIn.sampleCount;
  }
  if (sound.fadeOut !== null && k >= sound.fadeOut.startSample) {
    value *=
      Math.max(0, sound.fadeOut.sampleCount - (k - sound.fadeOut.startSample)) /
      sound.fadeOut.sampleCount;
  }
  return value;
}

describe('the pinned FFmpeg for the audio mix (D52.5)', () => {
  it('is given wherever the run is pinned, and its absence is stated elsewhere', () => {
    if (pinned) expect(available).toBe(true);
    if (!available) {
      console.info(
        'The audio mix tests are skipped: KADRION_FFMPEG and KADRION_FFPROBE are not set. The mix is not proven by this run.',
      );
    }
  });
});

describe.skipIf(!available)('the audio mix of the Producer (D52.5)', () => {
  let video: Uint8Array;
  let silentVideo: Uint8Array;
  let resolveAsset: AssetResolver;
  let manifest: AudioManifest;
  let mixed: { channels: number; rate: number; samples: Float32Array };

  beforeAll(async () => {
    video = await makeVideoSoundFixture(ffmpegPath ?? '');
    silentVideo = await makeVideoFixture(ffmpegPath ?? '');
    const bytes: Record<string, { bytes: Uint8Array; mediaType: string }> = {
      'asset-music': { bytes: MUSIC, mediaType: 'audio/wav' },
      'asset-voice': { bytes: VOICE, mediaType: 'audio/wav' },
    };
    resolveAsset = ({ id, contentHash }) => {
      if (id === 'asset-video') {
        const chosen = contentHash === VIDEO_FIXTURE.contentHash ? silentVideo : video;
        return { bytes: chosen, mediaType: 'video/mp4' };
      }
      return bytes[id] ?? null;
    };
    rmSync(DIRECTORY, { recursive: true, force: true });
    mkdirSync(DIRECTORY, { recursive: true });
    ({ manifest } = await renderAudio({
      document: document(VIDEO_SOUND_FIXTURE.contentHash),
      resolveAsset,
      outputDirectory: DIRECTORY,
      ffmpeg: FFMPEG,
    }));
    mixed = wavFloats(new Uint8Array(readFileSync(join(DIRECTORY, AUDIO_FILE_NAME))));
  }, 300_000);

  it('places every heard sound on the sample grid of D52.5, and leaves out the silent clip', () => {
    expect(manifest.audio?.sampleRate).toBe(RATE);
    expect(manifest.audio?.totalSamples).toBe(96_000);
    expect(
      manifest.audio?.sounds.map((sound) => ({
        kind: sound.kind,
        id: sound.id,
        assetId: sound.assetId,
        volume: sound.volume,
        startSample: sound.startSample,
        sampleCount: sound.sampleCount,
        sourceStartSample: sound.sourceStartSample,
        fadeIn: sound.fadeIn,
        fadeOut: sound.fadeOut,
      })),
    ).toEqual(SOUNDS);
  });

  it('writes the same intermediate and manifest when every source is read by path (D64)', async () => {
    // The host's storage: a directory of its own, outside the outputs of the run.
    const host = mkdtempSync(join(tmpdir(), 'kadrion-host-'));
    try {
      const sources: Record<string, { bytes: Uint8Array; mediaType: string }> = {
        'asset-music': { bytes: MUSIC, mediaType: 'audio/wav' },
        'asset-voice': { bytes: VOICE, mediaType: 'audio/wav' },
        'asset-video': { bytes: video, mediaType: 'video/mp4' },
      };
      for (const [id, { bytes }] of Object.entries(sources)) writeFileSync(join(host, id), bytes);
      const byPath: ProducerAssetResolver = ({ id }) => {
        const source = sources[id];
        return source === undefined ? null : { path: join(host, id), mediaType: source.mediaType };
      };
      const out = join(host, 'out');
      mkdirSync(out);
      const result = await renderAudio({
        document: document(VIDEO_SOUND_FIXTURE.contentHash),
        resolveAsset: byPath,
        outputDirectory: out,
        ffmpeg: FFMPEG,
      });
      expect(result.manifest).toEqual(manifest);
      expect(
        readFileSync(join(out, AUDIO_FILE_NAME)).equals(
          readFileSync(join(DIRECTORY, AUDIO_FILE_NAME)),
        ),
      ).toBe(true);
      // The host's files stay where they were, and the job wrote only its output.
      expect(readdirSync(host).sort()).toEqual([
        'asset-music',
        'asset-video',
        'asset-voice',
        'out',
      ]);
      expect(readdirSync(out)).toEqual([AUDIO_FILE_NAME]);
    } finally {
      rmSync(host, { recursive: true, force: true });
    }
  });

  it('writes 96 000 stereo samples of 32-bit float at 48 kHz', () => {
    expect([mixed.channels, mixed.rate, mixed.samples.length]).toEqual([2, RATE, 96_000 * 2]);
  });

  it('equals the mix computed here from the decoded sources, sample for sample', async () => {
    const sources = {
      'asset-music': await decoded(MUSIC),
      'asset-voice': await decoded(VOICE),
      'asset-video': await decoded(video),
    };
    const expected = new Float64Array(96_000 * 2);
    for (const sound of SOUNDS) {
      const source = sources[sound.assetId];
      for (let k = 0; k < sound.sampleCount; k += 1) {
        const factor = sound.volume * gain(sound, k);
        for (let channel = 0; channel < 2; channel += 1) {
          const value = source[(sound.sourceStartSample + k) * 2 + channel] ?? Number.NaN;
          const at = (sound.startSample + k) * 2 + channel;
          expected[at] = (expected[at] ?? Number.NaN) + value * factor;
        }
      }
    }
    let worst = { at: -1, difference: 0 };
    let peak = 0;
    for (let index = 0; index < expected.length; index += 1) {
      const difference = Math.abs((mixed.samples[index] ?? Number.NaN) - (expected[index] ?? 0));
      peak = Math.max(peak, Math.abs(expected[index] ?? 0));
      if (!(difference <= worst.difference)) worst = { at: index, difference };
    }
    writeReport('audio-report.json', { worst, peak, sounds: manifest.audio?.sounds });
    // The mix is not silent, so the comparison means something; 32-bit float rounding only.
    expect(peak).toBeGreaterThan(0.3);
    expect(worst.difference).toBeLessThan(1e-5);
    // Before the voice and the video, only the music is heard, and it starts at silence.
    expect(mixed.samples[0]).toBe(0);
  });

  describe("the Player's mix in Chromium (D53)", () => {
    let chromium: LaunchedChromium;
    let host: ConformanceHost;

    /** `PLAYED` for the document of this file, from output sample `from`, or a loop to `to`. */
    const played = async (
      from: number,
      loop?: { readonly to: number; readonly passes: number },
    ): Promise<{ samples: number[]; lengths: Record<string, number> }> => {
      const input = JSON.stringify({
        text: JSON.stringify(document(VIDEO_SOUND_FIXTURE.contentHash)),
        sources: [
          ['asset-music', Buffer.from(MUSIC).toString('base64')],
          ['asset-voice', Buffer.from(VOICE).toString('base64')],
          ['asset-video', Buffer.from(video).toString('base64')],
        ],
        fromSample: from,
        toSample: loop?.to,
        passes: loop?.passes,
      });
      // A script of its own, so that no transform of this file touches its imports.
      return host.page.evaluate(PLAYED.replace('INPUT', input));
    };

    beforeAll(async () => {
      chromium = await launchChromium();
      host = await openConformanceHost(
        chromium,
        JSON.stringify(document(VIDEO_SOUND_FIXTURE.contentHash)),
        [
          { id: 'asset-music', mediaType: 'audio/wav', bytes: MUSIC },
          { id: 'asset-voice', mediaType: 'audio/wav', bytes: VOICE },
          { id: 'asset-video', mediaType: 'video/mp4', bytes: video },
        ],
      );
    }, 120_000);

    afterAll(async () => {
      await closeConformanceHost(host);
      await chromium.browser.close();
    });

    it("equals the Producer's mix from the start and from the middle, within float automation", async () => {
      const report: Record<string, unknown> = {};
      // From the start, and from inside the music's fade-out and the video's sound.
      for (const from of [0, 75_001]) {
        const { samples, lengths } = await played(from);
        expect(samples).toHaveLength((96_000 - from) * 2);
        let worst = { at: -1, difference: 0 };
        for (let index = 0; index < samples.length; index += 1) {
          const difference = Math.abs(
            (samples[index] ?? Number.NaN) - (mixed.samples[from * 2 + index] ?? Number.NaN),
          );
          if (!(difference <= worst.difference)) worst = { at: index, difference };
        }
        report[`from-${String(from)}`] = { worst, lengths };
        expect(worst.difference, `from sample ${String(from)}`).toBeLessThan(1e-4);
        // The WAVs decode to their own lengths; the video's sound at least to what is heard.
        expect(lengths['asset-music']).toBe(3 * RATE);
        expect(lengths['asset-voice']).toBe(RATE);
        expect(lengths['asset-video']).toBeGreaterThanOrEqual(14_400 + 48_000);
      }
      writeReport('audio-player-report.json', report);
    }, 120_000);

    it("loops a play range as the Producer's mix of the range, pass after pass (D61.2)", async () => {
      // 1.0 s to 1.52 s at 25 fps: across the voice's start, the video's end, and the music's
      // fade-out start; three passes, each heard right after the one before.
      const from = 48_000;
      const to = 72_960;
      const passes = 3;
      const { samples } = await played(from, { to, passes });
      const length = to - from;
      expect(samples).toHaveLength(length * passes * 2);
      let worst = { at: -1, difference: 0 };
      for (let index = 0; index < samples.length; index += 1) {
        const inPass = index % (length * 2);
        const difference = Math.abs(
          (samples[index] ?? Number.NaN) - (mixed.samples[from * 2 + inPass] ?? Number.NaN),
        );
        if (!(difference <= worst.difference)) worst = { at: index, difference };
      }
      expect(worst.difference).toBeLessThan(1e-4);
    }, 120_000);
  });

  it('hears nothing of a video at volume 0, and reads no audio from it', async () => {
    const output = mkdtempSync(join(tmpdir(), 'kadrion-audio-'));
    try {
      const { manifest: silent } = await renderAudio({
        document: document(VIDEO_FIXTURE.contentHash, 0),
        resolveAsset,
        outputDirectory: output,
        ffmpeg: FFMPEG,
      });
      expect(silent.audio?.sounds.map(({ id }) => id)).toEqual(['clip-music', 'clip-voice']);
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });

  it.each([
    [
      'audio-invalid',
      'a video above volume 0 whose asset has no audio stream',
      () => document(VIDEO_FIXTURE.contentHash),
    ],
    [
      'source-range-exceeded',
      'a clip that reads past the end of its source',
      () => {
        const draft = document(VIDEO_SOUND_FIXTURE.contentHash);
        const [, , voice] = draft['clips'] as Record<string, unknown>[];
        if (voice !== undefined) voice['sourceStartUs'] = 400_000;
        return draft;
      },
    ],
  ])('refuses with %s %s, before any pass, and writes nothing', async (code, _, make) => {
    const output = mkdtempSync(join(tmpdir(), 'kadrion-audio-'));
    try {
      await expect(
        renderAudio({ document: make(), resolveAsset, outputDirectory: output, ffmpeg: FFMPEG }),
      ).rejects.toMatchObject({ code });
      expect(existsSync(join(output, AUDIO_FILE_NAME))).toBe(false);
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });
});

const linear = { kind: 'linear' } as const;
const hold = { kind: 'hold' } as const;

/**
 * The document of D85: that of this file with a video's sound faded in over
 * 200 000 µs and out over 300 000 µs, the music under a volume curve (a ramp
 * in decibels, a hold, and ramps to and from 0), and the voice at half speed
 * (D82) under a curve in decibels. No silent clip.
 */
function curvedDocument(videoHash: string): Record<string, unknown> {
  const draft = document(videoHash);
  const [scene] = draft['scenes'] as { nodes: Record<string, unknown>[] }[];
  Object.assign(scene?.nodes[1] ?? {}, { fadeInUs: 200_000, fadeOutUs: 300_000 });
  const [music, , voice] = draft['clips'] as Record<string, unknown>[];
  Object.assign(music ?? {}, {
    animations: [
      {
        id: 'clip-music-a-volume',
        property: 'volume',
        keyframes: [
          { timeUs: 200_000, value: 0.25, easing: linear },
          { timeUs: 1_000_000, value: 1, easing: hold },
          { timeUs: 1_400_000, value: 0.8, easing: linear },
          { timeUs: 1_600_000, value: 0, easing: linear },
          { timeUs: 1_900_000, value: 0.5, easing: linear },
        ],
      },
    ],
  });
  Object.assign(voice ?? {}, {
    speed: { num: 1, den: 2 },
    animations: [
      {
        id: 'clip-voice-a-volume',
        property: 'volume',
        keyframes: [
          { timeUs: 1_300_000, value: 1, easing: linear },
          { timeUs: 1_800_000, value: 0.1, easing: linear },
        ],
      },
    ],
  });
  draft['clips'] = [music, voice];
  return draft;
}

/**
 * The sounds of the curved document on the grid, by hand from D52.5 and D85.4.
 * The music's keyframes at 0.2 s, 1 s, 1.4 s, 1.6 s, and 1.9 s are its samples
 * 9 600, 48 000, 67 200, 76 800, and 91 200. The voice starts at sample
 * 59 259 (59 259.216) and its keyframes at 1.3 s and 1.8 s, samples 62 400
 * and 86 400, are its samples 3 141 and 27 141; at half speed it reads 16 800
 * source samples. The video's fade-in of 200 000 µs is 9 600 samples; its
 * lifetime ends at 1.4 s, sample 67 200, so its fade-out from 1.1 s starts at
 * its sample 33 600 and lasts 14 400.
 */
const CURVED_SOUNDS = [
  {
    id: 'clip-music',
    assetId: 'asset-music',
    volume: 0.6,
    startSample: 0,
    sampleCount: 96_000,
    sourceStartSample: 12_000,
    fadeIn: { startSample: 0, sampleCount: 16_000 },
    fadeOut: { startSample: 72_000, sampleCount: 72_000 },
    volumeKeys: [
      { sample: 9_600, value: 0.25, easing: linear },
      { sample: 48_000, value: 1, easing: hold },
      { sample: 67_200, value: 0.8, easing: linear },
      { sample: 76_800, value: 0, easing: linear },
      { sample: 91_200, value: 0.5, easing: linear },
    ],
  },
  {
    id: 'clip-voice',
    assetId: 'asset-voice',
    volume: 1,
    startSample: 59_259,
    sampleCount: 33_600,
    sourceStartSample: 0,
    fadeIn: null,
    fadeOut: { startSample: 28_800, sampleCount: 4_800 },
    volumeKeys: [
      { sample: 3_141, value: 1, easing: linear },
      { sample: 27_141, value: 0.1, easing: linear },
    ],
  },
  {
    id: 'node-video',
    assetId: 'asset-video',
    volume: 0.5,
    startSample: 19_200,
    sampleCount: 48_000,
    sourceStartSample: 14_400,
    fadeIn: { startSample: 0, sampleCount: 9_600 },
    fadeOut: { startSample: 33_600, sampleCount: 14_400 },
    volumeKeys: undefined,
  },
] as const;

describe.skipIf(!available)("a video's fades and volume curves in the mix (D85.5, D85.6)", () => {
  let video: Uint8Array;
  let manifest: AudioManifest;
  let mixed: { channels: number; rate: number; samples: Float32Array };
  const directory = join(OUTPUT_DIRECTORY, 'audio-curves');

  beforeAll(async () => {
    video = await makeVideoSoundFixture(ffmpegPath ?? '');
    const bytes: Record<string, { bytes: Uint8Array; mediaType: string }> = {
      'asset-music': { bytes: MUSIC, mediaType: 'audio/wav' },
      'asset-voice': { bytes: VOICE, mediaType: 'audio/wav' },
      'asset-video': { bytes: video, mediaType: 'video/mp4' },
    };
    rmSync(directory, { recursive: true, force: true });
    mkdirSync(directory, { recursive: true });
    ({ manifest } = await renderAudio({
      document: curvedDocument(VIDEO_SOUND_FIXTURE.contentHash),
      resolveAsset: ({ id }) => bytes[id] ?? null,
      outputDirectory: directory,
      ffmpeg: FFMPEG,
    }));
    mixed = wavFloats(new Uint8Array(readFileSync(join(directory, AUDIO_FILE_NAME))));
  }, 300_000);

  it('places the fades and the keyframes on the grid, and records each envelope', () => {
    const sounds = manifest.audio?.sounds ?? [];
    expect(
      sounds.map((sound) => ({
        id: sound.id,
        assetId: sound.assetId,
        volume: sound.volume,
        startSample: sound.startSample,
        sampleCount: sound.sampleCount,
        sourceStartSample: sound.sourceStartSample,
        fadeIn: sound.fadeIn,
        fadeOut: sound.fadeOut,
        volumeKeys: sound.volumeKeys,
      })),
    ).toEqual(CURVED_SOUNDS);
    for (const sound of CURVED_SOUNDS) {
      const stated = sounds.find(({ id }) => id === sound.id);
      if (sound.volumeKeys === undefined) {
        expect(stated?.envelopeSha256).toBeUndefined();
        continue;
      }
      const gains = volumeEnvelope({ volumeKeys: sound.volumeKeys }, 0, sound.sampleCount);
      const frames = new Float32Array(gains.length * 2);
      gains.forEach((gain, i) => {
        frames[2 * i] = gain;
        frames[2 * i + 1] = gain;
      });
      expect(stated?.envelopeSha256).toBe(sha256(new Uint8Array(frames.buffer)));
    }
    expect(manifest.ffmpeg.audioArgs).toEqual(
      expect.arrayContaining(['<envelope-0>', '<envelope-1>']),
    );
  });

  it('equals the mix summed here from the decoded sources and the envelopes, within 1e-5', async () => {
    const plan = audioPlan(validatedDocument(curvedDocument(VIDEO_SOUND_FIXTURE.contentHash)));
    const voiceMap = plan.entries.find(({ id }) => id === 'clip-voice')?.map;
    if (voiceMap === undefined) throw new Error('The voice is not mapped.');
    const sources: Record<string, Float32Array> = {
      'asset-music': await decoded(MUSIC),
      'asset-video': await decoded(video),
    };
    // The voice at half speed: `stretchSound` over its decoded channels, from source sample 0.
    const voice = await decoded(VOICE);
    const channels = [0, 1].map((channel) =>
      Float32Array.from({ length: voice.length / 2 }, (_, i) => voice[2 * i + channel] ?? 0),
    );
    const stretched = stretchSound({
      map: voiceMap,
      source: { channels, startSample: 0 },
      startSample: 59_259,
      sampleCount: 33_600,
    });
    const expected = new Float64Array(96_000 * 2);
    for (const sound of CURVED_SOUNDS) {
      const envelope =
        sound.volumeKeys === undefined
          ? null
          : volumeEnvelope({ volumeKeys: sound.volumeKeys }, 0, sound.sampleCount);
      for (let k = 0; k < sound.sampleCount; k += 1) {
        const factor = sound.volume * gain(sound, k) * (envelope?.[k] ?? 1);
        for (let channel = 0; channel < 2; channel += 1) {
          const value =
            sound.id === 'clip-voice'
              ? (stretched[channel]?.[k] ?? Number.NaN)
              : (sources[sound.assetId]?.[(sound.sourceStartSample + k) * 2 + channel] ??
                Number.NaN);
          const at = (sound.startSample + k) * 2 + channel;
          expected[at] = (expected[at] ?? Number.NaN) + value * factor;
        }
      }
    }
    let worst = { at: -1, difference: 0 };
    let peak = 0;
    for (let index = 0; index < expected.length; index += 1) {
      const difference = Math.abs((mixed.samples[index] ?? Number.NaN) - (expected[index] ?? 0));
      peak = Math.max(peak, Math.abs(expected[index] ?? 0));
      if (!(difference <= worst.difference)) worst = { at: index, difference };
    }
    writeReport('audio-curves-report.json', { worst, peak, sounds: manifest.audio?.sounds });
    expect(peak).toBeGreaterThan(0.3);
    expect(worst.difference).toBeLessThan(1e-5);
  });

  describe("the Player's mix in Chromium (D85.6, D53.5)", () => {
    let chromium: LaunchedChromium;
    let host: ConformanceHost;
    const text = JSON.stringify(curvedDocument(VIDEO_SOUND_FIXTURE.contentHash));

    beforeAll(async () => {
      chromium = await launchChromium();
      host = await openConformanceHost(chromium, text, [
        { id: 'asset-music', mediaType: 'audio/wav', bytes: MUSIC },
        { id: 'asset-voice', mediaType: 'audio/wav', bytes: VOICE },
        { id: 'asset-video', mediaType: 'video/mp4', bytes: video },
      ]);
    }, 120_000);

    afterAll(async () => {
      await closeConformanceHost(host);
      await chromium.browser.close();
    });

    it("equals the Producer's mix from sample 0 and from inside a ramp in decibels, within 1e-4", async () => {
      const report: Record<string, unknown> = {};
      // Sample 30 001 lies in the music's ramp in decibels, from 9 600 to 48 000.
      for (const from of [0, 30_001]) {
        const input = JSON.stringify({
          text,
          sources: [
            ['asset-music', Buffer.from(MUSIC).toString('base64')],
            ['asset-voice', Buffer.from(VOICE).toString('base64')],
            ['asset-video', Buffer.from(video).toString('base64')],
          ],
          fromSample: from,
        });
        const { samples } = await host.page.evaluate<{ samples: number[] }>(
          PLAYED.replace('INPUT', input),
        );
        expect(samples).toHaveLength((96_000 - from) * 2);
        let worst = { at: -1, difference: 0 };
        for (let index = 0; index < samples.length; index += 1) {
          const difference = Math.abs(
            (samples[index] ?? Number.NaN) - (mixed.samples[from * 2 + index] ?? Number.NaN),
          );
          if (!(difference <= worst.difference)) worst = { at: index, difference };
        }
        report[`from-${String(from)}`] = { worst };
        expect(worst.difference, `from sample ${String(from)}`).toBeLessThan(1e-4);
      }
      writeReport('audio-curves-player-report.json', report);
    }, 120_000);
  });
});

/** A document of this file, validated, or a failure that names its errors. */
function validatedDocument(input: unknown): ValidatedComposition {
  const result = validateComposition(input);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.composition;
}

/**
 * The audio mix of the Producer (D52.5) with the pinned FFmpeg: the audio
 * intermediate of a document with several sounds — two clips with a source
 * start, a volume, and fades, one clip at volume 0, and the sound of a video
 * node — equals a mix computed here, sample for sample, from the sources as
 * the pinned FFmpeg decodes them. The sample positions are written out by hand
 * from the rules of D52.5, not taken from the implementation; the mix is
 * summed in TypeScript. Every problem of a sound is typed before any pass.
 * Skipped without `KADRION_FFMPEG` and `KADRION_FFPROBE`; required where the
 * run is pinned.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import {
  AUDIO_FILE_NAME,
  PINNED_IMAGE,
  PINNED_IMAGE_VARIABLE,
  renderAudio,
  sha256,
  type AudioManifest,
} from '@kadrion/producer';
import type { AssetResolver } from '@kadrion/renderer-dom';
import { VIDEO_FIXTURE, VIDEO_SOUND_FIXTURE } from '@kadrion/test-fixtures';
import { beforeAll, describe, expect, it } from 'vitest';

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
    schemaVersion: '0.4',
    width: 320,
    height: 180,
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
        nodes: [
          {
            id: 'node-background',
            type: 'background',
            startUs: 0,
            durationUs: 2_000_000,
            color: '#000000',
          },
          {
            id: 'node-video',
            type: 'video',
            startUs: 400_000,
            durationUs: 1_000_000,
            position: { x: 0, y: 0 },
            scale: { x: 1, y: 1 },
            opacity: 1,
            animations: [],
            assetId: 'asset-video',
            sourceStartUs: 300_000,
            width: 320,
            height: 180,
            fit: 'fill',
            volume: videoVolume,
          },
        ],
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
        volume: 0.6,
        fadeInUs: 333_333,
        fadeOutUs: 1_500_000,
      },
      {
        id: 'clip-silent',
        type: 'audio',
        assetId: 'asset-voice',
        startUs: 0,
        durationUs: 2_000_000,
        sourceStartUs: 0,
        volume: 0,
        fadeInUs: 0,
        fadeOutUs: 0,
      },
      {
        id: 'clip-voice',
        type: 'audio',
        assetId: 'asset-voice',
        startUs: 1_234_567,
        durationUs: 700_000,
        sourceStartUs: 0,
        volume: 1,
        fadeInUs: 0,
        fadeOutUs: 100_000,
      },
    ],
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

/** The gain of a linear fade at sample `k` of the sound (D52.2). */
function gain(sound: (typeof SOUNDS)[number], k: number): number {
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

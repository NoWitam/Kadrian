/**
 * The sounds of the audio pass at another speed or reversed (D82.6): the
 * decode of the source range `stretchSourceRange` names, the samples of
 * `stretchSound` in a temporary 32-bit float WAV, the layout that reads it from
 * sample 0, and the `stretch` the manifest records. FFmpeg is a fake here; the
 * pinned test of the speed composition runs the real one.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { audioLayout, audioPlan, type AudioLayout } from '@kadrion/runtime';
import { stretchSound, stretchSourceRange } from '@kadrion/runtime/stretch';
import { validateComposition, type ValidatedComposition } from '@kadrion/schema';
import { referenceComposition, speedComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { ProducerError } from '../src/errors.js';
import type { FfmpegTools } from '../src/ffmpeg.js';
import {
  deinterleave,
  floatWav,
  interleave,
  statedSourceSamples,
  stretchDecodeArgs,
  stretchedAudio,
} from '../src/stretch.js';

/**
 * The speed composition cut to 0.6 s, its reversed clip moved inside it, so
 * each mapped sound is short enough to compute twice in a unit test.
 */
function shortSpeed(): unknown {
  const draft = structuredClone(speedComposition) as {
    durationUs: number;
    scenes: { durationUs: number; clips: Record<string, unknown>[] }[];
  };
  const [scene] = draft.scenes;
  if (scene === undefined) throw new Error('No scene.');
  draft.durationUs = 600_000;
  scene.durationUs = 600_000;
  Object.assign(scene.clips[1] ?? {}, { startUs: 100_000, durationUs: 400_000 });
  return draft;
}

function validated(document: unknown): ValidatedComposition {
  const result = validateComposition(document);
  if (!result.ok) throw new Error(result.errors.map(({ message }) => message).join('\n'));
  return result.composition;
}

/** A source of `channels` channels whose sample `i` of channel `c` is `(i % 997) / 997 − c / 4`. */
function sourceSample(index: number, channel: number): number {
  return Math.fround((index % 997) / 997 - channel / 4);
}

interface FakeRun {
  readonly args: readonly string[];
}

/** The tools of FFmpeg as far as the stretch uses them: the stream's channels and a decode. */
function fakeTools(
  channels: number,
  runs: FakeRun[],
  code = 0,
  stated = { samples: 480_000, sampleRate: 48_000 },
): FfmpegTools {
  return {
    audioStream: () => Promise.resolve({ codec: 'aac', channels, ...stated }),
    run: (args: readonly string[]) => {
      runs.push({ args });
      const trim = /atrim=start_sample=(\d+):end_sample=(\d+)/.exec(args.join(' '));
      const start = Number(trim?.[1]);
      const end = Number(trim?.[2]);
      const decoded = Array.from({ length: channels }, (_, channel) =>
        Float32Array.from({ length: end - start }, (_, offset) =>
          sourceSample(start + offset, channel),
        ),
      );
      return Promise.resolve({
        code,
        stdout: code === 0 ? interleave(decoded) : new Uint8Array(0),
        stderr: code === 0 ? '' : 'broken\n',
      });
    },
  } as unknown as FfmpegTools;
}

describe('the decode of a mapped sound (D82.6)', () => {
  it('decodes source samples [start, end) of the first audio stream to 32-bit floats at 48 kHz', () => {
    expect(stretchDecodeArgs('/media/voice.m4a', 4_800, 9_600)).toEqual([
      '-hide_banner',
      '-nostdin',
      '-loglevel',
      'error',
      '-threads',
      '1',
      '-i',
      'file:/media/voice.m4a',
      '-map',
      '0:a:0',
      '-af',
      'aresample=48000,aformat=sample_fmts=flt:sample_rates=48000,atrim=start_sample=4800:end_sample=9600',
      '-c:a',
      'pcm_f32le',
      '-f',
      'f32le',
      'pipe:1',
    ]);
  });

  it('interleaves and splits channels of little-endian floats without changing a bit', () => {
    const channels = [Float32Array.of(0.5, -1, 3e-8), Float32Array.of(-0, 1, Math.fround(0.1))];
    const bytes = interleave(channels);
    expect(bytes.byteLength).toBe(24);
    expect(new DataView(bytes.buffer).getFloat32(4, true)).toBe(-0);
    expect(deinterleave(bytes, 2)).toEqual(channels);
    // A partial frame at the end is dropped, never read past.
    expect(deinterleave(bytes.subarray(0, 20), 2).map((channel) => channel.length)).toEqual([2, 2]);
  });

  it('writes a WAV of IEEE floats: the RIFF header, fmt with format 3, and the data', () => {
    const samples = interleave([Float32Array.of(0.25, -0.5)]);
    const file = floatWav(samples, 1, 48_000);
    const view = new DataView(file.buffer);
    const ascii = (at: number): string => String.fromCharCode(...file.subarray(at, at + 4));
    expect([ascii(0), ascii(8), ascii(12), ascii(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(view.getUint32(4, true)).toBe(36 + 8);
    expect(view.getUint16(20, true)).toBe(3);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(48_000);
    expect(view.getUint32(28, true)).toBe(48_000 * 4);
    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint16(34, true)).toBe(32);
    expect(view.getUint32(40, true)).toBe(8);
    expect([...file.subarray(44)]).toEqual([...samples]);
  });
});

describe('the inputs of the audio pass (D82.6, D52.5)', () => {
  it('writes nothing and changes nothing without a mapped sound', async () => {
    const layout = audioLayout(audioPlan(validated(referenceComposition)));
    const inputs = ['/media/reference.wav'];
    const runs: FakeRun[] = [];
    const result = await stretchedAudio(layout, inputs, fakeTools(2, runs), 1_000);
    expect(result.graphLayout).toBe(layout);
    expect(result.inputs).toBe(inputs);
    expect(result.stretches).toEqual([null]);
    expect(runs).toEqual([]);
    await result.remove();
  });

  it('computes each mapped sound into a WAV read from sample 0, and records its stretch', async () => {
    const layout: AudioLayout = audioLayout(audioPlan(validated(shortSpeed())));
    const ids = layout.sounds.map(({ entry }) => entry.id);
    expect(ids.sort()).toEqual(['clip-half', 'clip-reversed', 'node-three-halves']);
    const inputs = layout.sounds.map(({ entry }) => `/media/${entry.id}.m4a`);
    const runs: FakeRun[] = [];
    const result = await stretchedAudio(layout, inputs, fakeTools(2, runs), 1_000);
    try {
      expect(runs).toHaveLength(3);
      for (const [index, sound] of layout.sounds.entries()) {
        const map = sound.entry.map;
        if (map === undefined) throw new Error('Every sound of the composition is mapped.');
        // The decode reads exactly the source range the grains read.
        const range = stretchSourceRange(map, sound.startSample, sound.sampleCount);
        expect(runs[index]?.args).toEqual(
          stretchDecodeArgs(inputs[index] ?? '', range.startSample, range.endSample),
        );
        const expected = stretchSound({
          map,
          source: {
            channels: [0, 1].map((channel) =>
              Float32Array.from({ length: range.endSample - range.startSample }, (_, offset) =>
                sourceSample(range.startSample + offset, channel),
              ),
            ),
            startSample: range.startSample,
          },
          startSample: sound.startSample,
          sampleCount: sound.sampleCount,
        });
        const samples = interleave(expected);
        const file = result.inputs[index] ?? '';
        expect(file).not.toBe(inputs[index]);
        expect(await readFile(file)).toEqual(Buffer.from(floatWav(samples, 2, 48_000)));
        expect(result.graphLayout.sounds[index]).toEqual({ ...sound, sourceStartSample: 0 });
        expect(result.stretches[index]).toEqual({
          speed: { num: Math.abs(map.slope), den: map.den },
          reverse: map.slope < 0,
          sha256: `sha256:${createHash('sha256').update(samples).digest('hex')}`,
        });
      }
      expect(result.graphLayout.totalSamples).toBe(layout.totalSamples);
    } finally {
      await result.remove();
    }
    expect(existsSync(dirname(result.inputs[0] ?? ''))).toBe(false);
  });

  it('reads no source sample past the length the stream states, as the Player decodes it', async () => {
    const layout = audioLayout(audioPlan(validated(shortSpeed())));
    const index = layout.sounds.findIndex(({ entry }) => entry.id === 'node-three-halves');
    const sound = layout.sounds[index];
    const map = sound?.entry.map;
    if (sound === undefined || map === undefined) throw new Error('No mapped video sound.');
    const range = stretchSourceRange(map, sound.startSample, sound.sampleCount);
    // A stream at 44.1 kHz that states fewer samples than the grains would read.
    const stated = Math.floor(((range.endSample - 1_000) * 44_100) / 48_000);
    const length = statedSourceSamples(stated, 44_100);
    expect(length).toBeLessThan(range.endSample);
    expect(statedSourceSamples(144_000, 48_000)).toBe(144_000);
    const runs: FakeRun[] = [];
    const inputs = layout.sounds.map(() => '/media/short.m4a');
    const result = await stretchedAudio(
      layout,
      inputs,
      fakeTools(2, runs, 0, { samples: stated, sampleRate: 44_100 }),
      1_000,
    );
    try {
      // A sound whose range starts past the stated length decodes nothing, so match by arguments.
      expect(runs.map(({ args }) => args)).toContainEqual(
        stretchDecodeArgs('/media/short.m4a', range.startSample, length),
      );
      const expected = stretchSound({
        map,
        source: {
          channels: [0, 1].map((channel) =>
            Float32Array.from({ length: length - range.startSample }, (_, offset) =>
              sourceSample(range.startSample + offset, channel),
            ),
          ),
          startSample: range.startSample,
        },
        startSample: sound.startSample,
        sampleCount: sound.sampleCount,
      });
      expect(await readFile(result.inputs[index] ?? '')).toEqual(
        Buffer.from(floatWav(interleave(expected), 2, 48_000)),
      );
    } finally {
      await result.remove();
    }
  });

  it('refuses a decode that fails, and leaves no file behind', async () => {
    const layout = audioLayout(audioPlan(validated(shortSpeed())));
    const inputs = layout.sounds.map(() => '/media/broken.m4a');
    const runs: FakeRun[] = [];
    const failed = stretchedAudio(layout, inputs, fakeTools(1, runs, 1), 1_000);
    await expect(failed).rejects.toBeInstanceOf(ProducerError);
    await expect(failed).rejects.toMatchObject({ code: 'encode-failed' });
    expect(runs).toHaveLength(1);
  });
});

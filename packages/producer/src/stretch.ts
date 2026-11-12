/**
 * The sounds of the audio pass at another speed or reversed (D82.6, amending
 * D52.5): for each, the pinned FFmpeg decodes the source samples
 * `stretchSourceRange` names to 32-bit floats at 48 kHz in the source's own
 * channels, `stretchSound` of `@kadrion/runtime/stretch` computes the samples
 * heard, and they are written to a temporary 32-bit float WAV that is the
 * sound's input of `audioPassGraph`, read from its sample 0. Upmix, volume,
 * fades, delay, and the mix are those of every sound. A sound at speed 1
 * forwards never comes here, so its input and its graph stay byte for byte.
 */
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ClipTimeMap } from '@kadrion/schema';
import type { AudioLayout, SoundLayout } from '@kadrion/runtime';
import { stretchSound, stretchSourceRange } from '@kadrion/runtime/stretch';

import { SAMPLE_RATE } from './encode.js';
import { ProducerError } from './errors.js';
import type { FfmpegTools } from './ffmpeg.js';
import type { ManifestStretch } from './manifest.js';

/** The arguments that decode source samples `[start, end)` of a file's first audio stream (D82.6). */
export function stretchDecodeArgs(input: string, startSample: number, endSample: number): string[] {
  return [
    ...['-hide_banner', '-nostdin', '-loglevel', 'error', '-threads', '1'],
    ...['-i', `file:${input}`, '-map', '0:a:0'],
    ...[
      '-af',
      [
        `aresample=${String(SAMPLE_RATE)}`,
        `aformat=sample_fmts=flt:sample_rates=${String(SAMPLE_RATE)}`,
        `atrim=start_sample=${String(startSample)}:end_sample=${String(endSample)}`,
      ].join(','),
    ],
    ...['-c:a', 'pcm_f32le', '-f', 'f32le', 'pipe:1'],
  ];
}

/** The channels of interleaved 32-bit little-endian floats. */
export function deinterleave(bytes: Uint8Array, channels: number): Float32Array[] {
  const frames = Math.floor(bytes.byteLength / (4 * channels));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      (out[channel] as Float32Array)[frame] = view.getFloat32(
        4 * (frame * channels + channel),
        true,
      );
    }
  }
  return out;
}

/** The samples of every channel interleaved, as 32-bit little-endian floats. */
export function interleave(channels: readonly Float32Array[]): Uint8Array {
  const frames = channels[0]?.length ?? 0;
  const bytes = new Uint8Array(4 * frames * channels.length);
  const view = new DataView(bytes.buffer);
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels.length; channel += 1) {
      view.setFloat32(
        4 * (frame * channels.length + channel),
        (channels[channel] as Float32Array)[frame] ?? 0,
        true,
      );
    }
  }
  return bytes;
}

/**
 * A WAV file of 32-bit float samples at `sampleRate` (format 3, IEEE float):
 * the RIFF header, the `fmt ` chunk, and the `data` chunk of `samples`,
 * interleaved little-endian floats of `channels` channels.
 */
export function floatWav(samples: Uint8Array, channels: number, sampleRate: number): Uint8Array {
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  const ascii = (at: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      header[at + index] = text.charCodeAt(index);
    }
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.byteLength, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 4, true);
  view.setUint16(32, channels * 4, true);
  view.setUint16(34, 32, true);
  ascii(36, 'data');
  view.setUint32(40, samples.byteLength, true);
  const file = new Uint8Array(44 + samples.byteLength);
  file.set(header, 0);
  file.set(samples, 44);
  return file;
}

/** The speed of a map, `|slope| / den` in lowest terms (D82.1). */
function speedOf(map: ClipTimeMap): { readonly num: number; readonly den: number } {
  return { num: Math.abs(map.slope), den: map.den };
}

/**
 * The samples of a source at 48 kHz: the length its first audio stream states
 * (`duration_ts` at its own rate), which is what the Player's decode holds. A
 * decoder's padding past it, such as the rest of an AAC stream's last frame, is
 * not part of the source (D82.6).
 */
export function statedSourceSamples(samples: number, sampleRate: number): number {
  return Number((BigInt(samples) * BigInt(SAMPLE_RATE)) / BigInt(sampleRate));
}

/**
 * The samples a mapped sound plays over its samples of the output (D82.6): the
 * source samples `stretchSourceRange` names within the length the source
 * states, decoded by the pinned FFmpeg, then `stretchSound`, which hears
 * silence past them as the Player does. Its channels are the source's own.
 */
export async function stretchedSamples(
  sound: SoundLayout,
  map: ClipTimeMap,
  input: string,
  tools: FfmpegTools,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Float32Array[]> {
  const stream = await tools.audioStream(input);
  const { channels } = stream;
  const range = stretchSourceRange(map, sound.startSample, sound.sampleCount);
  const endSample = Math.min(
    range.endSample,
    statedSourceSamples(stream.samples, stream.sampleRate),
  );
  let source: Float32Array[] = Array.from({ length: channels }, () => new Float32Array(0));
  if (endSample > range.startSample) {
    const result = await tools.run(
      stretchDecodeArgs(input, range.startSample, endSample),
      new Uint8Array(0),
      timeoutMs,
      signal,
    );
    if (result.code !== 0) {
      throw new ProducerError(
        'encode-failed',
        `FFmpeg exited with ${String(result.code)} decoding the sound of "${sound.entry.id}": ${result.stderr.trim()}`,
      );
    }
    source = deinterleave(result.stdout, channels);
  }
  return stretchSound({
    map,
    source: { channels: source, startSample: range.startSample },
    startSample: sound.startSample,
    sampleCount: sound.sampleCount,
  });
}

/** The inputs of the audio pass with every mapped sound computed, and what the manifest records of each. */
export interface StretchedAudio {
  /** The layout the graph reads: a mapped sound's source starts at sample 0 of its WAV. */
  readonly graphLayout: AudioLayout;
  /** The file of each sound, in the order of the layout. */
  readonly inputs: readonly string[];
  /** The stretch of each sound, `null` at speed 1 forwards. */
  readonly stretches: readonly (ManifestStretch | null)[];
  /** Removes the temporary WAV files. */
  remove(): Promise<void>;
}

/**
 * Computes every mapped sound of `layout` into a temporary 32-bit float WAV
 * (D82.6) and gives the inputs and the layout of the audio pass. Without a
 * mapped sound it writes nothing and gives the layout and the inputs back as
 * they are, so the pass is that of D52.5 byte for byte.
 */
export async function stretchedAudio(
  layout: AudioLayout,
  inputs: readonly string[],
  tools: FfmpegTools,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<StretchedAudio> {
  if (layout.sounds.every(({ entry }) => entry.map === undefined)) {
    return {
      graphLayout: layout,
      inputs,
      stretches: layout.sounds.map(() => null),
      remove: () => Promise.resolve(),
    };
  }
  const directory = await mkdtemp(join(tmpdir(), 'kadrion-stretch-'));
  const remove = (): Promise<void> => rm(directory, { recursive: true, force: true });
  try {
    const files: string[] = [];
    const stretches: (ManifestStretch | null)[] = [];
    const sounds: SoundLayout[] = [];
    for (const [index, sound] of layout.sounds.entries()) {
      const input = inputs[index] ?? '';
      const { map } = sound.entry;
      if (map === undefined) {
        files.push(input);
        stretches.push(null);
        sounds.push(sound);
        continue;
      }
      const computed = await stretchedSamples(sound, map, input, tools, timeoutMs, signal);
      const samples = interleave(computed);
      const file = join(directory, `stretch-${String(index)}.wav`);
      await writeFile(file, floatWav(samples, computed.length, SAMPLE_RATE), {
        mode: 0o600,
        flag: 'wx',
      });
      files.push(file);
      stretches.push({
        speed: speedOf(map),
        reverse: map.slope < 0,
        sha256: `sha256:${createHash('sha256').update(samples).digest('hex')}`,
      });
      sounds.push({ ...sound, sourceStartSample: 0 });
    }
    return {
      graphLayout: { totalSamples: layout.totalSamples, sounds },
      inputs: files,
      stretches,
      remove,
    };
  } catch (reason) {
    await remove();
    throw reason;
  }
}

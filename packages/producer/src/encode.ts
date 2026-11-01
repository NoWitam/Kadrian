/**
 * The pure parts of the MP4 export (D29): the preset sizes, the sample
 * arithmetic of the audio, the filter graphs and arguments of FFmpeg, the
 * receipt FFmpeg prints, and the sink that bounds the frames in flight. Nothing
 * here starts a process or touches a file.
 */
import type { Writable } from 'node:stream';

import type { AudioPlan, AudioPlanEntry } from '@kadrion/runtime';
import type { ValidatedComposition } from '@kadrion/schema';

import { ProducerError } from './errors.js';

/** The presets of D07, named by their short side (D29.5). */
export const PRESETS = Object.freeze({ '1080p': 1080, '720p': 720 } as const);
export type PresetName = keyof typeof PRESETS;

export interface PresetSize {
  readonly name: PresetName;
  readonly width: number;
  readonly height: number;
}

/** The output size of a preset for a composition, or `preset-unsupported` (D29.5). */
export function presetSize(composition: ValidatedComposition, name: string): PresetSize {
  if (!Object.hasOwn(PRESETS, name)) {
    throw new ProducerError(
      'preset-unsupported',
      `The preset must be one of ${Object.keys(PRESETS).join(', ')}, got ${JSON.stringify(name)}.`,
    );
  }
  const preset = name as PresetName;
  const shortSide = PRESETS[preset];
  const { width, height } = composition;
  const source = Math.min(width, height);
  if (shortSide > source) {
    throw new ProducerError(
      'preset-unsupported',
      `The preset ${preset} would upscale a composition of ${String(width)}x${String(height)}.`,
    );
  }
  const scaledWidth = (width * shortSide) / source;
  const scaledHeight = (height * shortSide) / source;
  if (
    !Number.isInteger(scaledWidth) ||
    !Number.isInteger(scaledHeight) ||
    scaledWidth % 2 !== 0 ||
    scaledHeight % 2 !== 0
  ) {
    throw new ProducerError(
      'preset-unsupported',
      `The preset ${preset} gives ${String(scaledWidth)}x${String(scaledHeight)}, not two even integers.`,
    );
  }
  return { name: preset, width: scaledWidth, height: scaledHeight };
}

/** The output sample rate of the audio (D29.6). */
export const SAMPLE_RATE = 48_000;
export const AUDIO_CHANNEL_LAYOUT = 'stereo';
export const AUDIO_CODEC = 'aac';
export const AUDIO_BITRATE = '128k';

/**
 * The nearest sample at `SAMPLE_RATE` to a time in microseconds, an exact half
 * rounded up: ⌊(us × 48 000 + 500 000) / 1 000 000⌋, in BigInt, so that no
 * floating-point value takes part (D29.6).
 */
export function samplesAt(timeUs: number): number {
  if (!Number.isSafeInteger(timeUs) || timeUs < 0) {
    throw new RangeError(`A time must be a non-negative safe integer, got ${String(timeUs)}.`);
  }
  return Number((BigInt(timeUs) * BigInt(SAMPLE_RATE) + 500_000n) / 1_000_000n);
}

/** The sample of `SAMPLE_RATE` nearest to a time that may lie beyond the safe integers. */
function sampleAt(timeUs: bigint): bigint {
  return (timeUs * BigInt(SAMPLE_RATE) + 500_000n) / 1_000_000n;
}

/** A fade in samples, from the first sample of its source as the output hears it. */
export interface SampleFade {
  readonly startSample: number;
  readonly sampleCount: number;
}

/** One sound of the audio plan on the output's sample grid (D52.5). */
export interface SoundLayout {
  readonly entry: AudioPlanEntry;
  /** The output sample where it starts: the sample of `entry.startUs`. */
  readonly startSample: number;
  /** How many output samples hear it: up to the sample of its end. May be 0. */
  readonly sampleCount: number;
  /** The sample of its source, at `SAMPLE_RATE`, heard at `startSample`. */
  readonly sourceStartSample: number;
  readonly fadeIn: SampleFade | null;
  readonly fadeOut: SampleFade | null;
}

/** The audio plan on the output's sample grid: every sound, and the samples of the composition. */
export interface AudioLayout {
  readonly totalSamples: number;
  readonly sounds: readonly SoundLayout[];
}

/**
 * Places the audio plan of `@kadrion/runtime` on the grid of `SAMPLE_RATE`
 * (D29.6, D52.5). Every time is rounded to its nearest sample, an exact half
 * up, in BigInt: a sound occupies the samples from the one of its start up to
 * the one of its end, and its source is read from the sample of
 * `sourceStartUs`. A fade runs from the sample of its first instant up to the
 * sample of its end; one that rounds to no sample is no fade, and a fade-out
 * that begins after the last sample heard is left out. A sound that rounds to
 * no sample at all is not heard and leaves the layout.
 */
export function audioLayout(plan: AudioPlan): AudioLayout {
  const placed = plan.entries.map((entry): SoundLayout => {
    const start = BigInt(entry.startUs);
    const first = sampleAt(start);
    const sampleCount = Number(sampleAt(start + BigInt(entry.durationUs)) - first);
    const fadeInCount = Number(sampleAt(start + BigInt(entry.fadeInUs)) - first);
    const lifetimeEnd = start + BigInt(entry.lifetimeUs);
    const fadeOutStart = sampleAt(lifetimeEnd - BigInt(entry.fadeOutUs)) - first;
    const fadeOutCount = Number(sampleAt(lifetimeEnd) - first - fadeOutStart);
    return {
      entry,
      startSample: Number(first),
      sampleCount,
      sourceStartSample: Number(sampleAt(BigInt(entry.sourceStartUs))),
      fadeIn:
        entry.fadeInUs > 0 && fadeInCount > 0 ? { startSample: 0, sampleCount: fadeInCount } : null,
      fadeOut:
        entry.fadeOutUs > 0 && fadeOutCount > 0 && fadeOutStart < BigInt(sampleCount)
          ? { startSample: Number(fadeOutStart), sampleCount: fadeOutCount }
          : null,
    };
  });
  // A sound that rounds to no sample is not heard (D52.5).
  const sounds = placed.filter(({ sampleCount }) => sampleCount > 0);
  return { totalSamples: samplesAt(plan.durationUs), sounds };
}

/** The video graph of D29.5: RGB to BT.709 limited range, square pixels, 4:2:0. */
export function videoGraph(size: PresetSize): string {
  // Always with its size, even when it equals the composition's: one form, one code path.
  const scale = `scale=${String(size.width)}:${String(size.height)}:flags=lanczos`;
  return `[0:v]${scale}:out_color_matrix=bt709:out_range=tv,setsar=1,format=yuv420p[v]`;
}

/** The time base of the video track is `fps × TIME_SCALE_PER_FRAME` (D29.4). */
export const TIME_SCALE_PER_FRAME = 512;

/** What the output path is replaced with in the manifest (D29.4). */
export const OUTPUT_PLACEHOLDER = '<output>';

/**
 * The SHA-256 of every packet FFmpeg read, from its `framehash` output (D29.3),
 * in the manifest's format. A line that is neither a comment nor a packet is
 * an error, so a changed format cannot pass as an empty receipt. The format of
 * the pinned build, measured: `0, <dts>, <pts>, <duration>, <size>, <hex>`.
 */
export function receiptHashes(text: string): string[] {
  const hashes: string[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const match = /^0,\s*-?\d+,\s*-?\d+,\s*\d+,\s*\d+,\s*([0-9a-f]{64})$/.exec(trimmed);
    if (match === null) {
      throw new ProducerError(
        'encode-failed',
        `FFmpeg printed an unexpected receipt line: ${trimmed}`,
      );
    }
    hashes.push(`sha256:${match[1] ?? ''}`);
  }
  return hashes;
}

/** At most this many frames are written but not yet handed to the pipe (D29.3). */
export const FRAMES_IN_FLIGHT = 2;

/** A host timer, lent so that tests control it. */
export type StartTimer = (expire: () => void, milliseconds: number) => () => void;

export const realTimer: StartTimer = (expire, milliseconds) => {
  const timer = setTimeout(expire, milliseconds);
  return () => {
    clearTimeout(timer);
  };
};

/**
 * Writes frames to a stream with a bounded window (D29.3): a frame is in
 * flight from `write` until the stream's callback reports it handed on, and
 * `write` resolves only once the frame is inside a window of
 * `FRAMES_IN_FLIGHT`. A window that does not open in time, a stream error, or
 * a failed write rejects with `encode-failed`, and so does every call after it.
 */
export class FrameSink {
  #inFlight = 0;
  #maxInFlight = 0;
  #written = 0;
  #failure: ProducerError | null = null;
  #waiters: (() => void)[] = [];
  readonly #stream: Writable;
  readonly #timeoutMs: number;
  readonly #startTimer: StartTimer;

  constructor(stream: Writable, timeoutMs: number, startTimer: StartTimer = realTimer) {
    this.#stream = stream;
    this.#timeoutMs = timeoutMs;
    this.#startTimer = startTimer;
    stream.on('error', (reason: unknown) => {
      this.#fail(`FFmpeg stopped reading frames: ${String(reason)}`);
    });
  }

  /** The largest number of frames that were in flight at once. */
  get maxInFlight(): number {
    return this.#maxInFlight;
  }

  /** How many frames were accepted into the window. */
  get written(): number {
    return this.#written;
  }

  #fail(message: string): void {
    this.#failure ??= new ProducerError('encode-failed', message);
    for (const wake of this.#waiters.splice(0)) wake();
  }

  async #window(limit: number): Promise<void> {
    while (this.#failure === null && this.#inFlight > limit) {
      await new Promise<void>((resolve) => {
        const cancel = this.#startTimer(() => {
          this.#fail(`FFmpeg accepted no frame for ${String(this.#timeoutMs)} ms.`);
        }, this.#timeoutMs);
        this.#waiters.push(() => {
          cancel();
          resolve();
        });
      });
    }
    if (this.#failure !== null) throw this.#failure;
  }

  async write(bytes: Uint8Array): Promise<void> {
    await this.#window(FRAMES_IN_FLIGHT - 1);
    this.#inFlight += 1;
    this.#written += 1;
    this.#maxInFlight = Math.max(this.#maxInFlight, this.#inFlight);
    this.#stream.write(bytes, (reason) => {
      this.#inFlight -= 1;
      if (reason) this.#fail(`A frame could not be written: ${String(reason)}`);
      for (const wake of this.#waiters.splice(0)) wake();
    });
  }

  /** Waits until every frame is handed on, then ends the stream. */
  async end(): Promise<void> {
    await this.#window(0);
    this.#stream.end();
  }
}

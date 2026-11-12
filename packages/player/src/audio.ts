/**
 * The sound of the Player (D53): the audio plan of `@kadrion/runtime`, placed
 * on the same sample grid as the Producer's mix (D52.5), played with Web Audio
 * in the host window. The sources are decoded by the browser at the grid's
 * rate; every sound is one buffer source, its volume, and its fades as gain
 * automation on the grid; the graph never decides what is heard, the plan
 * does. A mono source is heard at `√½` on both channels, as FFmpeg's upmix of
 * the Producer (D52.5) hears it. A sound at another speed or reversed plays the
 * samples `stretchSound` of `@kadrion/runtime/stretch` computes from the
 * decoded source, from the sample a play starts at, as one buffer source on
 * the same grid (D82.6).
 */
import { heardSourceRange, type ClipTimeMap } from '@kadrion/schema';
import { AUDIO_SAMPLE_RATE, type AudioLayout, type SoundLayout } from '@kadrion/runtime';
import { stretchSound } from '@kadrion/runtime/stretch';

import { PlayerError, type PlayerErrorAsset } from './errors.js';

/** The facts of a decoded sound: the length of its decoded samples at the grid's rate. */
export interface PlayerAudioFacts {
  readonly type: 'audio';
  /** The decoded samples, as whole microseconds, rounded down (D53). */
  readonly durationUs: number;
}

/** What the Player needs of a decoded sound. */
export interface DecodedSound {
  readonly length: number;
  readonly numberOfChannels: number;
  readonly sampleRate: number;
}

/** What the Player needs of a Web Audio context: a real one, an offline one, or a test double. */
export interface SoundContext {
  readonly sampleRate: number;
  readonly currentTime: number;
  readonly destination: AudioNode;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
  createBufferSource(): AudioBufferSourceNode;
  createGain(): GainNode;
  /** A buffer for the samples of a sound at another speed or reversed (D82.6). */
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer;
}

/**
 * Decodes the bytes of a sound with `context`, at its rate, which is the
 * grid's. Bytes the browser cannot decode are `audio-invalid`, as the Producer
 * calls a source without one readable audio stream; a sound of more than two
 * channels is `audio-unsupported`, since the browser would mix it down by
 * other rules than FFmpeg (D53).
 */
export async function decodeSound(
  context: Pick<SoundContext, 'decodeAudioData' | 'sampleRate'>,
  id: string,
  bytes: ArrayBuffer,
): Promise<AudioBuffer> {
  let buffer: AudioBuffer;
  try {
    // decodeAudioData detaches what it is given; it gets its own copy.
    buffer = await context.decodeAudioData(bytes.slice(0));
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason);
    throw new PlayerError('audio-invalid', `The sound of "${id}" cannot be decoded: ${message}`);
  }
  if (buffer.sampleRate !== AUDIO_SAMPLE_RATE || buffer.length === 0) {
    throw new PlayerError('audio-invalid', `The sound of "${id}" decoded to no sample at 48 kHz.`);
  }
  if (buffer.numberOfChannels > 2) {
    throw new PlayerError(
      'audio-unsupported',
      `The sound of "${id}" has ${String(buffer.numberOfChannels)} channels; the Player plays one or two (D53).`,
    );
  }
  return buffer;
}

/** The facts of a decoded sound (D53). */
export function soundFacts(buffer: DecodedSound): PlayerAudioFacts {
  return Object.freeze({
    type: 'audio',
    durationUs: Math.floor((buffer.length * 1_000_000) / AUDIO_SAMPLE_RATE),
  });
}

/**
 * Checks that every sound of the layout reads only samples its decoded source
 * holds (D49.6): a sound that would read past its end is
 * `source-range-exceeded`, before anything plays. The details name the sounds;
 * the error names the asset of the first, with its hash from `hashes` (D61.4).
 */
export function checkSoundRanges(
  layout: AudioLayout,
  buffers: ReadonlyMap<string, DecodedSound>,
  hashes: ReadonlyMap<string, string> = new Map(),
): void {
  const exceeded: string[] = [];
  let first: PlayerErrorAsset | null = null;
  const assetOf = (id: string): PlayerErrorAsset | null => {
    const contentHash = hashes.get(id);
    return contentHash === undefined ? null : { id, contentHash };
  };
  for (const sound of layout.sounds) {
    const buffer = buffers.get(sound.entry.assetId);
    if (buffer === undefined) {
      throw new PlayerError(
        'asset-missing',
        `The sound "${sound.entry.assetId}" was not decoded.`,
        [],
        assetOf(sound.entry.assetId),
      );
    }
    if (sound.entry.map !== undefined) {
      // The range its map hears, checked as the Producer checks it (D53.4, D82.6).
      const range = heardSourceRange(sound.entry);
      const endUs = BigInt(range.startUs) + BigInt(range.durationUs);
      if (BigInt(buffer.length) * 1_000_000n < endUs * BigInt(AUDIO_SAMPLE_RATE)) {
        first ??= assetOf(sound.entry.assetId);
        exceeded.push(
          `${sound.entry.id}: ${String(range.startUs)} to ${String(endUs)} µs of "${sound.entry.assetId}", which holds ${String(buffer.length)} samples at 48 kHz`,
        );
      }
    } else if (sound.sourceStartSample + sound.sampleCount > buffer.length) {
      first ??= assetOf(sound.entry.assetId);
      exceeded.push(
        `${sound.entry.id}: samples ${String(sound.sourceStartSample)} to ${String(sound.sourceStartSample + sound.sampleCount)} of "${sound.entry.assetId}", which holds ${String(buffer.length)} at 48 kHz`,
      );
    }
  }
  if (exceeded.length > 0) {
    throw new PlayerError(
      'source-range-exceeded',
      'A sound reads past the end of its source (D49.6).',
      exceeded,
      first,
    );
  }
}

/**
 * The samples of sounds at another speed or reversed that the Player computed
 * (D82.6), by source and map: each keeps the composition samples it holds, so
 * a play that starts inside them reads them again instead of computing them.
 * Grains are anchored on the map, so the samples of any range are those of the
 * whole: a seek computes from its own sample only.
 */
export class StretchCache {
  readonly #kept = new Map<
    string,
    {
      readonly buffer: AudioBuffer;
      readonly startSample: number;
      readonly channels: readonly Float32Array[];
    }
  >();

  /**
   * The samples of `map` over composition samples `[startSample, startSample +
   * sampleCount)`, computed by `stretchSound` from `buffer` unless kept.
   */
  samples(
    buffer: AudioBuffer,
    map: ClipTimeMap,
    startSample: number,
    sampleCount: number,
  ): readonly Float32Array[] {
    const key = `${String(map.intercept)}/${String(map.slope)}/${String(map.den)}`;
    let known = this.#kept.get(key);
    if (
      known?.buffer !== buffer ||
      known.startSample > startSample ||
      known.startSample + (known.channels[0]?.length ?? 0) < startSample + sampleCount
    ) {
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) =>
        buffer.getChannelData(channel),
      );
      known = {
        buffer,
        startSample,
        channels: stretchSound({
          map,
          source: { channels, startSample: 0 },
          startSample,
          sampleCount,
        }),
      };
      this.#kept.set(key, known);
    }
    const from = startSample - known.startSample;
    return known.channels.map((channel) => channel.subarray(from, from + sampleCount));
  }
}

/** The sounds scheduled by one call of `scheduleSounds`. */
export interface ScheduledSounds {
  /** Stops every sound and disconnects its nodes; calling it again does nothing. */
  stop(): void;
}

/** A gain node whose value is set for the first sample heard and then follows a fade. */
function fadeGain(
  context: SoundContext,
  at: (sample: number) => number,
  skip: number,
  fade: { readonly startSample: number; readonly sampleCount: number },
  direction: 'in' | 'out',
): GainNode {
  const node = context.createGain();
  const { startSample, sampleCount } = fade;
  const end = startSample + sampleCount;
  const rising = direction === 'in';
  /** The gain of D52.2 at sample `k` of the sound, as FFmpeg's `afade` gives it. */
  const value = (k: number): number => {
    if (k <= startSample) return rising ? 0 : 1;
    if (k >= end) return rising ? 1 : 0;
    const part = (k - startSample) / sampleCount;
    return rising ? part : 1 - part;
  };
  const param = node.gain;
  param.setValueAtTime(value(skip), at(skip));
  if (skip < startSample) param.setValueAtTime(value(startSample), at(startSample));
  if (skip < end) param.linearRampToValueAtTime(rising ? 1 : 0, at(end));
  return node;
}

/**
 * Schedules the layout in `context` from output sample `fromSample`, which is
 * heard at context time `when` (D53): every sound that is heard at or after
 * it starts at its own sample, from its own source sample, and plays to the
 * end of the samples it is heard, with its volume and fades as gain
 * automation on the grid. With `toSample`, nothing at or after that output
 * sample is heard: one pass of a play range (D61.2). The result stops them all.
 */
export function scheduleSounds(
  context: SoundContext,
  layout: AudioLayout,
  buffers: ReadonlyMap<string, AudioBuffer>,
  fromSample: number,
  when: number,
  toSample: number = Number.POSITIVE_INFINITY,
): ScheduledSounds {
  return scheduleSoundsWith(
    new StretchCache(),
    context,
    layout,
    buffers,
    fromSample,
    when,
    toSample,
  );
}

/**
 * `scheduleSounds` with the samples of mapped sounds kept in `stretches`
 * (D82.6): the Player keeps one cache across its plays, so a play that starts
 * inside samples it computed reads them again.
 */
export function scheduleSoundsWith(
  stretches: StretchCache,
  context: SoundContext,
  layout: AudioLayout,
  buffers: ReadonlyMap<string, AudioBuffer>,
  fromSample: number,
  when: number,
  toSample: number = Number.POSITIVE_INFINITY,
): ScheduledSounds {
  const rate = AUDIO_SAMPLE_RATE;
  const playing: { source: AudioBufferSourceNode; nodes: AudioNode[] }[] = [];
  for (const sound of layout.sounds) {
    const buffer = buffers.get(sound.entry.assetId);
    if (buffer === undefined) continue;
    const skip = Math.max(0, fromSample - sound.startSample);
    if (skip >= sound.sampleCount) continue;
    // The samples of the sound before `toSample`; a sound that starts there is not heard.
    const heard = Math.min(sound.sampleCount, toSample - sound.startSample);
    if (skip >= heard) continue;
    const at = (k: number): number => when + (sound.startSample + k - fromSample) / rate;
    playing.push(schedule(context, sound, buffer, skip, heard, at, stretches));
  }
  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      for (const { source, nodes } of playing) {
        try {
          source.stop();
        } catch {
          // It had not started or had ended; either way it is silent now.
        }
        for (const node of [source, ...nodes]) node.disconnect();
      }
    },
  };
}

function schedule(
  context: SoundContext,
  sound: SoundLayout,
  buffer: AudioBuffer,
  skip: number,
  heard: number,
  at: (sample: number) => number,
  stretches: StretchCache,
): { source: AudioBufferSourceNode; nodes: AudioNode[] } {
  const rate = AUDIO_SAMPLE_RATE;
  const source = context.createBufferSource();
  // A sound at another speed or reversed plays the samples its map computes,
  // from the first sample heard, in the source's own channels (D82.6).
  let offset = sound.sourceStartSample + skip;
  const { map } = sound.entry;
  if (map !== undefined) {
    const samples = stretches.samples(buffer, map, sound.startSample + skip, heard - skip);
    const computed = context.createBuffer(buffer.numberOfChannels, heard - skip, rate);
    samples.forEach((channel, index) => {
      computed.copyToChannel(channel as Float32Array<ArrayBuffer>, index);
    });
    source.buffer = computed;
    offset = 0;
  } else {
    source.buffer = buffer;
  }
  const nodes: AudioNode[] = [];
  // Volume and the upmix of a mono source in one factor (D52.5, D53).
  const factor = sound.entry.volume * (buffer.numberOfChannels === 1 ? Math.SQRT1_2 : 1);
  if (factor !== 1) {
    const volume = context.createGain();
    volume.gain.value = factor;
    nodes.push(volume);
  }
  if (sound.fadeIn !== null) nodes.push(fadeGain(context, at, skip, sound.fadeIn, 'in'));
  if (sound.fadeOut !== null) nodes.push(fadeGain(context, at, skip, sound.fadeOut, 'out'));
  let previous: AudioNode = source;
  for (const node of nodes) {
    // Every node has two channels: a mono source is copied to both (the speaker rule for one
    // channel), and its factor of √½ above makes it FFmpeg's upmix.
    node.channelCount = 2;
    node.channelCountMode = 'explicit';
    node.channelInterpretation = 'speakers';
    previous.connect(node);
    previous = node;
  }
  previous.connect(context.destination);
  source.start(at(skip), offset / rate, (heard - skip) / rate);
  return { source, nodes };
}

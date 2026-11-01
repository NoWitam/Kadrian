/**
 * The sound of the Player (D53): the audio plan of `@kadrion/runtime`, placed
 * on the same sample grid as the Producer's mix (D52.5), played with Web Audio
 * in the host window. The sources are decoded by the browser at the grid's
 * rate; every sound is one buffer source, its volume, and its fades as gain
 * automation on the grid; the graph never decides what is heard, the plan
 * does. A mono source is heard at `√½` on both channels, as FFmpeg's upmix of
 * the Producer (D52.5) hears it.
 */
import { AUDIO_SAMPLE_RATE, type AudioLayout, type SoundLayout } from '@kadrion/runtime';

import { PlayerError } from './errors.js';

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
 * `source-range-exceeded`, before anything plays. The details name the sounds.
 */
export function checkSoundRanges(
  layout: AudioLayout,
  buffers: ReadonlyMap<string, DecodedSound>,
): void {
  const exceeded: string[] = [];
  for (const sound of layout.sounds) {
    const buffer = buffers.get(sound.entry.assetId);
    if (buffer === undefined) {
      throw new PlayerError('asset-missing', `The sound "${sound.entry.assetId}" was not decoded.`);
    }
    if (sound.sourceStartSample + sound.sampleCount > buffer.length) {
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
    );
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
 * automation on the grid. The result stops them all.
 */
export function scheduleSounds(
  context: SoundContext,
  layout: AudioLayout,
  buffers: ReadonlyMap<string, AudioBuffer>,
  fromSample: number,
  when: number,
): ScheduledSounds {
  const rate = AUDIO_SAMPLE_RATE;
  const playing: { source: AudioBufferSourceNode; nodes: AudioNode[] }[] = [];
  for (const sound of layout.sounds) {
    const buffer = buffers.get(sound.entry.assetId);
    if (buffer === undefined) continue;
    const skip = Math.max(0, fromSample - sound.startSample);
    if (skip >= sound.sampleCount) continue;
    const at = (k: number): number => when + (sound.startSample + k - fromSample) / rate;
    playing.push(schedule(context, sound, buffer, skip, at));
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
  at: (sample: number) => number,
): { source: AudioBufferSourceNode; nodes: AudioNode[] } {
  const rate = AUDIO_SAMPLE_RATE;
  const source = context.createBufferSource();
  source.buffer = buffer;
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
  source.start(
    at(skip),
    (sound.sourceStartSample + skip) / rate,
    (sound.sampleCount - skip) / rate,
  );
  return { source, nodes };
}

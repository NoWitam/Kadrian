/**
 * The audio plan on the sample grid (D29.6, D52.5, D53). The plan itself — what
 * is heard when — is a pure function of the document in `@kadrion/schema`,
 * re-exported here; this module places it on the samples of the mix, which the
 * Producer and the Player share.
 */
import type { AudioPlan, AudioPlanEntry } from '@kadrion/schema';

export { audioPlan, type AudioPlan, type AudioPlanEntry } from '@kadrion/schema';

/**
 * The sample rate of every mix (D29.6): the Producer's output and the Player's
 * audio context run at it, so both place the plan on the same grid (D53).
 */
export const AUDIO_SAMPLE_RATE = 48_000;

/** The sample of `AUDIO_SAMPLE_RATE` nearest to a time that may lie beyond the safe integers, an exact half up. */
export function sampleAt(timeUs: bigint): bigint {
  return (timeUs * BigInt(AUDIO_SAMPLE_RATE) + 500_000n) / 1_000_000n;
}

/**
 * The sample nearest to a time that may lie before 0, an exact half up:
 * `sampleAt` for a time from 0, and the floor of the same quotient below it, so
 * a keyframe of a definition placed before composition time 0 lies on the
 * same grid (D85.4).
 */
function sampleAtSigned(timeUs: bigint): bigint {
  const numerator = timeUs * BigInt(AUDIO_SAMPLE_RATE) + 500_000n;
  const quotient = numerator / 1_000_000n;
  return numerator < 0n && quotient * 1_000_000n !== numerator ? quotient - 1n : quotient;
}

/** The easings a volume keyframe takes (D85.2): both are curves Web Audio defines exactly. */
export type VolumeEasing = { readonly kind: 'linear' } | { readonly kind: 'hold' };

/** A keyframe of a sound's `volume` animation in composition time (D85.3). */
export interface VolumeKey {
  readonly timeUs: number;
  /** A linear factor of the amplitude, from 0 to 1. */
  readonly value: number;
  /** How the curve moves from this keyframe to the next. */
  readonly easing: VolumeEasing;
}

/** A keyframe on the sample grid, counted from the sound's first sample (D85.4). */
export interface VolumeSampleKey {
  readonly sample: number;
  readonly value: number;
  readonly easing: VolumeEasing;
}

/** Refuses a volume keyframe's value outside 0 to 1 (D85.2). Internal to the package. */
export function checkVolumeValue(value: number): void {
  if (!(value >= 0 && value <= 1)) {
    throw new RangeError('A volume keyframe is a factor from 0 to 1 (D85.2).');
  }
}

/** Refuses an easing of a volume keyframe other than linear or hold (D85.2). Internal to the package. */
export function checkVolumeEasing(easing: VolumeEasing): void {
  const kind = (easing as { readonly kind?: unknown } | null)?.kind;
  if (kind !== 'linear' && kind !== 'hold') {
    throw new RangeError('A volume keyframe is eased linear or hold (D85.2).');
  }
}

/**
 * Places the keyframes of a sound's curve on the grid of `AUDIO_SAMPLE_RATE`
 * (D85.4): each at the sample of its time, an exact half up, counted from the
 * sample of `startUs`. It keeps those that shape the `sampleCount` samples
 * heard: the last at or before sample 0, every one between, and the first at
 * or after sample `sampleCount`. Of two keyframes on one sample the later is
 * kept, so the curve jumps there. A keyframe may lie before composition time 0
 * (one of a definition placed from after its time 0, D85.3); the start does
 * not.
 */
export function placeVolumeKeys(
  keys: readonly VolumeKey[],
  startUs: number,
  sampleCount: number,
): VolumeSampleKey[] {
  if (keys.length === 0) throw new RangeError('A volume curve has at least one keyframe.');
  if (!Number.isSafeInteger(startUs) || startUs < 0) {
    throw new RangeError('A sound starts at an integer time from 0.');
  }
  if (!Number.isSafeInteger(sampleCount) || sampleCount < 0) {
    throw new RangeError('A sound hears a whole number of samples.');
  }
  const first = sampleAt(BigInt(startUs));
  const placed: VolumeSampleKey[] = [];
  keys.forEach((key, index) => {
    if (!Number.isSafeInteger(key.timeUs)) {
      throw new RangeError('A volume keyframe is at an integer time.');
    }
    if (index > 0 && key.timeUs <= (keys[index - 1] as VolumeKey).timeUs) {
      throw new RangeError('The keyframes of a volume curve are in strictly increasing time.');
    }
    checkVolumeValue(key.value);
    checkVolumeEasing(key.easing);
    const sample = Number(sampleAtSigned(BigInt(key.timeUs)) - first);
    // Two keyframes on one sample: the later replaces the earlier (a jump).
    if (placed.length > 0 && (placed[placed.length - 1] as VolumeSampleKey).sample === sample) {
      placed.pop();
    }
    placed.push({ sample, value: key.value, easing: key.easing });
  });
  let from = 0;
  while (from + 1 < placed.length && (placed[from + 1] as VolumeSampleKey).sample <= 0) from += 1;
  let to = from;
  while (to + 1 < placed.length && (placed[to] as VolumeSampleKey).sample < sampleCount) to += 1;
  return placed.slice(from, to + 1);
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
  /** The sample of its source, at `AUDIO_SAMPLE_RATE`, heard at `startSample`. */
  readonly sourceStartSample: number;
  readonly fadeIn: SampleFade | null;
  readonly fadeOut: SampleFade | null;
  /**
   * The keyframes of its volume curve placed on the grid from its first
   * sample, those that shape the samples heard (D85.4); absent without a curve.
   */
  readonly volumeKeys?: readonly VolumeSampleKey[];
}

/** The audio plan on the output's sample grid: every sound, and the samples of the composition. */
export interface AudioLayout {
  readonly totalSamples: number;
  readonly sounds: readonly SoundLayout[];
}

/**
 * Places the audio plan of `@kadrion/runtime` on the grid of `AUDIO_SAMPLE_RATE`
 * (D29.6, D52.5, D53). Every time is rounded to its nearest sample, an exact half
 * up, in BigInt: a sound occupies the samples from the one of its start up to
 * the one of its end, and its source is read from the sample of
 * `sourceStartUs`. A fade runs from the sample of its first instant up to the
 * sample of its end; one that rounds to no sample is no fade, and a fade-out
 * that begins after the last sample heard is left out. The keyframes of a
 * volume curve are placed by `placeVolumeKeys` (D85.4). A sound that rounds to
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
      ...(entry.volumeKeys === undefined
        ? {}
        : { volumeKeys: placeVolumeKeys(entry.volumeKeys, entry.startUs, sampleCount) }),
    };
  });
  // A sound that rounds to no sample is not heard (D52.5).
  const sounds = placed.filter(({ sampleCount }) => sampleCount > 0);
  return { totalSamples: Number(sampleAt(BigInt(plan.durationUs))), sounds };
}

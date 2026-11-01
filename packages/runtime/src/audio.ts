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
  return { totalSamples: Number(sampleAt(BigInt(plan.durationUs))), sounds };
}

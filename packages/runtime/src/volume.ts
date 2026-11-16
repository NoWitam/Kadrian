/**
 * The volume curve of a sound on the sample grid (D85.2, D85.4): the placement
 * of its keyframes on the samples of `AUDIO_SAMPLE_RATE`, and its envelope,
 * the gain of every sample as a 32-bit float, which the Producer multiplies
 * into the sound (D85.5). Between two keyframes `(s0, g0)` and `(s1, g1)` the
 * gain at sample `n`, with `p = (n − s0) / (s1 − s0)`, is:
 *
 * - eased `linear` with `g0 > 0` and `g1 > 0`: `g0 · (g1 / g0)^p`, a straight
 *   line in decibels, computed as `g0 · 2^(p · (log2 g1 − log2 g0))` by the
 *   exponent and logarithm of `volume-arithmetic.ts` (`+ − · /` only);
 * - eased `linear` with `g0 = 0` or `g1 = 0`: `g0 + ((g1 − g0) · (n − s0)) /
 *   (s1 − s0)`, linear in amplitude, in the order of D18.3;
 * - eased `hold`: `g0` up to `s1`.
 *
 * Before the first keyframe and from the last one on, its value holds (D16).
 * The gain depends on the composition sample and the keyframes only, never on
 * the sound's start, so the halves of a split hear the curve of the whole.
 *
 * It is the entry `@kadrion/runtime/volume`, which the render page does not
 * import, so `volumeEnvelope` is no part of the runtime build (D21); the
 * Producer multiplies a sound by its envelope (D85.5) and the Player reads the
 * gain where a play starts from it (D85.6). The placement lives beside the
 * audio layout, which places every curve of a document (D85.4), and is
 * re-exported here.
 */
import {
  checkVolumeEasing,
  checkVolumeValue,
  placeVolumeKeys,
  type VolumeEasing,
  type VolumeKey,
  type VolumeSampleKey,
} from './audio.js';
import { log2, exp2Fraction, scaleByPowerOfTwo, splitPowerOfTwo } from './volume-arithmetic.js';

export { placeVolumeKeys, type VolumeEasing, type VolumeKey, type VolumeSampleKey };

/** A sound with a volume curve: its keyframes on the grid, at strictly increasing samples. */
export interface VolumeCurve {
  readonly volumeKeys: readonly VolumeSampleKey[];
}

/** What a segment needs per sample, computed once when the envelope enters it. */
interface Segment {
  readonly index: number;
  readonly gain: (n: number) => number;
}

function segmentAt(keys: readonly VolumeSampleKey[], index: number): Segment {
  const start = keys[index] as VolumeSampleKey;
  const end = keys[index + 1] as VolumeSampleKey;
  const s0 = start.sample;
  const span = end.sample - s0;
  const g0 = start.value;
  const g1 = end.value;
  if (start.easing.kind === 'hold' || g0 === g1) return { index, gain: () => g0 };
  if (g0 === 0 || g1 === 0) {
    return { index, gain: (n) => g0 + ((g1 - g0) * (n - s0)) / span };
  }
  const { mantissa, exponent } = splitPowerOfTwo(g0);
  const ratio = log2(g1) - log2(g0);
  const low = g0 < g1 ? g0 : g1;
  const high = g0 < g1 ? g1 : g0;
  return {
    index,
    gain: (n) => {
      const x = ((n - s0) / span) * ratio;
      const whole = Math.floor(x);
      const gain = scaleByPowerOfTwo(mantissa * exp2Fraction(x - whole), exponent + whole);
      // The curve is monotonic between its ends; rounding never leaves them.
      return gain < low ? low : gain > high ? high : gain;
    },
  };
}

/**
 * The gains of `count` samples of a sound from its sample `fromSample` (D85.4),
 * as 32-bit floats: the curve of its placed keyframes, the same in every
 * engine. `fromSample` counts from the sound's first sample, as the keyframes
 * do, and may be any integer.
 */
export function volumeEnvelope(
  sound: VolumeCurve,
  fromSample: number,
  count: number,
): Float32Array {
  const keys = sound.volumeKeys;
  if (keys.length === 0) throw new RangeError('A volume curve has at least one keyframe.');
  keys.forEach((key, index) => {
    if (!Number.isSafeInteger(key.sample)) {
      throw new RangeError('A placed volume keyframe is at an integer sample.');
    }
    if (index > 0 && key.sample <= (keys[index - 1] as VolumeSampleKey).sample) {
      throw new RangeError('The placed keyframes of a volume curve are at increasing samples.');
    }
    checkVolumeValue(key.value);
    checkVolumeEasing(key.easing);
  });
  if (!Number.isSafeInteger(fromSample) || !Number.isSafeInteger(count) || count < 0) {
    throw new RangeError('An envelope is of a whole number of samples from an integer sample.');
  }
  const out = new Float32Array(count);
  const last = keys.length - 1;
  // The last keyframe at or before the first sample asked, or −1 before the first keyframe.
  let low = -1;
  let high = last;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if ((keys[middle] as VolumeSampleKey).sample <= fromSample) low = middle;
    else high = middle - 1;
  }
  let at = low;
  let segment: Segment | null = null;
  for (let i = 0; i < count; i += 1) {
    const n = fromSample + i;
    while (at < last && (keys[at + 1] as VolumeSampleKey).sample <= n) at += 1;
    if (at < 0) out[i] = (keys[0] as VolumeSampleKey).value;
    else if (at === last) out[i] = (keys[last] as VolumeSampleKey).value;
    else {
      if (segment?.index !== at) segment = segmentAt(keys, at);
      out[i] = segment.gain(n);
    }
  }
  return out;
}

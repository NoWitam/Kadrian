/**
 * The sounds of the quality check of `stretchSound` (D82.6, PR-59): mono
 * signals at 48 kHz computed from code, so no recording is committed. Every
 * sample is computed with `+ − · /` and `Math.floor` only (a polynomial sine
 * and an integer generator of noise), so the samples are the same on every
 * platform, and a hash of what `stretchSound` makes of them can be compared
 * between Node and Chromium.
 *
 * - `speech`: a synthetic voice, not a recording. Syllables of 220 ms whose
 *   pitch glides between about 100 and 160 Hz, harmonics shaped by three
 *   formants of five vowels that blend into each other, an envelope per
 *   syllable, and a short burst of noise at the end of each, as a consonant.
 * - `music`: an arpeggio of eight notes, one every 250 ms, each with six
 *   decaying harmonics, over a held bass note, with a click of noise every
 *   125 ms, so that transients and sustained tones meet.
 * - `sine`: a 220 Hz sine, whose pitch a stretch must keep.
 */

export const SOUND_SAMPLE_RATE = 48_000;
export const SOUND_FIXTURES = ['speech', 'music', 'sine'] as const;
export type SoundFixture = (typeof SOUND_FIXTURES)[number];

const TWO_PI = 6.283185307179586;

/** `sin(2π · turns)` by a polynomial of degree 11 on a quarter turn: deterministic everywhere. */
export function fixtureSine(turns: number): number {
  let x = turns - Math.floor(turns);
  if (x >= 0.5) x -= 1;
  if (x > 0.25) x = 0.5 - x;
  else if (x < -0.25) x = -0.5 - x;
  const t = TWO_PI * x;
  const t2 = t * t;
  return t * (1 - (t2 / 6) * (1 - (t2 / 20) * (1 - (t2 / 42) * (1 - (t2 / 72) * (1 - t2 / 110)))));
}

/** A generator of noise in [−1, 1): the minimal standard generator, exact in doubles. */
function noise(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 48_271) % 2_147_483_647;
    return state / 1_073_741_823.5 - 1;
  };
}

/** Scales a signal so that its largest magnitude is `peak`. */
function normalized(samples: Float64Array, peak: number): Float32Array {
  let largest = 0;
  for (const value of samples) largest = Math.max(largest, Math.abs(value));
  return Float32Array.from(samples, (value) => (value / largest) * peak);
}

const VOWELS = [
  [700, 1_220, 2_600],
  [300, 2_300, 3_000],
  [500, 900, 2_400],
  [400, 2_000, 2_550],
  [600, 1_700, 2_500],
] as const;

function speech(samples: number): Float32Array {
  const out = new Float64Array(samples);
  const syllable = 0.22 * SOUND_SAMPLE_RATE;
  const hiss = noise(7);
  let phase = 0;
  let previousNoise = 0;
  for (let index = 0; index < samples; index += 1) {
    const count = Math.floor(index / syllable);
    const progress = (index - count * syllable) / syllable;
    const pitch = 105 + 25 * (count % 3) + 120 * progress * (1 - progress) - 10 * progress;
    phase += pitch / SOUND_SAMPLE_RATE;
    const from = VOWELS[count % VOWELS.length] ?? VOWELS[0];
    const to = VOWELS[(count + 1) % VOWELS.length] ?? VOWELS[0];
    const blend = progress < 0.7 ? 0 : (progress - 0.7) / 0.3;
    let value = 0;
    for (let harmonic = 1; harmonic * pitch <= 5_000; harmonic += 1) {
      const frequency = harmonic * pitch;
      let gain = 0;
      for (let formant = 0; formant < 3; formant += 1) {
        const low = from[formant] ?? 0;
        const centre = low + ((to[formant] ?? 0) - low) * blend;
        const distance = (frequency - centre) / (60 + 40 * formant);
        gain += 1 / (1 + distance * distance) / (formant + 1);
      }
      value += (gain / harmonic) * fixtureSine(phase * harmonic);
    }
    const envelope = progress < 0.15 ? progress / 0.15 : progress > 0.8 ? (1 - progress) / 0.2 : 1;
    value *= envelope;
    if (progress > 0.85) {
      const next = hiss();
      value += 0.16 * (next - previousNoise);
      previousNoise = next;
    }
    out[index] = value;
  }
  return normalized(out, 0.5);
}

const NOTES = [261.63, 329.63, 392, 523.25, 392, 329.63, 293.66, 349.23] as const;

function music(samples: number): Float32Array {
  const out = new Float64Array(samples);
  const step = 0.25 * SOUND_SAMPLE_RATE;
  const click = 0.125 * SOUND_SAMPLE_RATE;
  const clickLength = 0.01 * SOUND_SAMPLE_RATE;
  const hiss = noise(99);
  for (let index = 0; index < samples; index += 1) {
    let value = 0.5 * fixtureSine((65.41 * index) / SOUND_SAMPLE_RATE);
    for (let note = 0; note < NOTES.length; note += 1) {
      const start = note * step;
      if (index < start) continue;
      const seconds = (index - start) / SOUND_SAMPLE_RATE;
      const decay = 1 / (1 + 6 * seconds);
      for (let harmonic = 1; harmonic <= 6; harmonic += 1) {
        value +=
          (decay / (harmonic * harmonic)) * fixtureSine((NOTES[note] ?? 0) * harmonic * seconds);
      }
    }
    const sinceClick = index % click;
    if (sinceClick < clickLength) value += 0.3 * hiss() * (1 - sinceClick / clickLength);
    out[index] = value;
  }
  return normalized(out, 0.5);
}

function sine(samples: number): Float32Array {
  return Float32Array.from(
    { length: samples },
    (_, index) => 0.5 * fixtureSine((220 * index) / SOUND_SAMPLE_RATE),
  );
}

/** A sound of the quality check, `seconds` long at 48 kHz, mono; fresh on every call. */
export function generateSoundFixture(name: SoundFixture, seconds: number): Float32Array {
  const samples = Math.round(seconds * SOUND_SAMPLE_RATE);
  if (name === 'speech') return speech(samples);
  if (name === 'music') return music(samples);
  return sine(samples);
}

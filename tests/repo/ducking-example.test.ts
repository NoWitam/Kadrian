/**
 * The worked example of ducking in the host guide (section 5, D85.9), checked.
 *
 * The guide prints three curves of `volume` keyframes: a user's curve, the
 * ducking a host computed, and the one curve the host writes, their product at
 * each time of the union of their keyframes, rounded to six decimals. This
 * test reads the block, computes the product again by the interpolation of
 * D85.2, and checks the printed values; then it places the three curves on the
 * sample grid and has `volumeEnvelope` show that the product curve is heard as
 * the product of the two, sample by sample, within the rounding of the 32-bit
 * gains. It is evidence for this example, whose times lie on the grid; it
 * exports no helper, since D85.9 leaves the computation to the host.
 */
import { placeVolumeKeys, volumeEnvelope, type VolumeKey } from '@kadrion/runtime/volume';
import { describe, expect, it } from 'vitest';

import { readText } from './repo.js';

const guide = readText('docs', 'integration', 'host-guide.md');

interface Example {
  readonly user: readonly VolumeKey[];
  readonly ducking: readonly VolumeKey[];
  readonly product: readonly VolumeKey[];
}

const block =
  /<!-- ducking-example:start -->\n\n```json\n([\s\S]*?\n)```\n\n<!-- ducking-example:end -->/.exec(
    guide,
  )?.[1];

/** The value of a curve at a time by D85.2, in binary64. */
function valueAt(keys: readonly VolumeKey[], timeUs: number): number {
  const first = keys[0] as VolumeKey;
  const last = keys[keys.length - 1] as VolumeKey;
  if (timeUs <= first.timeUs) return first.value;
  if (timeUs >= last.timeUs) return last.value;
  const index = keys.findIndex((key, at) => (keys[at + 1]?.timeUs ?? Infinity) > timeUs);
  const k0 = keys[index] as VolumeKey;
  const k1 = keys[index + 1] as VolumeKey;
  const p = (timeUs - k0.timeUs) / (k1.timeUs - k0.timeUs);
  if (k0.easing.kind === 'hold') return k0.value;
  if (k0.value === 0 || k1.value === 0) return k0.value + (k1.value - k0.value) * p;
  return k0.value * (k1.value / k0.value) ** p;
}

describe('the worked example of ducking in the host guide (D85.9)', () => {
  const example = JSON.parse(block ?? 'null') as Example;
  const times = [...new Set([...example.user, ...example.ducking].map((key) => key.timeUs))].sort(
    (a, b) => a - b,
  );
  const exact = times.map((timeUs) => ({
    timeUs,
    value: valueAt(example.user, timeUs) * valueAt(example.ducking, timeUs),
    easing: { kind: 'linear' } as const,
  }));

  it('prints the product at every time of the union, rounded to six decimals', () => {
    expect(block).toBeDefined();
    expect(example.product.map((key) => key.timeUs)).toEqual(times);
    example.product.forEach((key, index) => {
      expect(key.value.toFixed(6), String(key.timeUs)).toBe(exact[index]?.value.toFixed(6));
      expect(key.easing).toEqual({ kind: 'linear' });
    });
    // Every curve of the example is linear between values above 0, and on the grid.
    for (const key of [...example.user, ...example.ducking]) {
      expect(key.value).toBeGreaterThan(0);
      expect(key.easing).toEqual({ kind: 'linear' });
      expect(key.timeUs % 125).toBe(0);
    }
  });

  it('is heard as the product of the two curves at every sample', () => {
    const sampleCount = 13 * 48_000;
    const envelope = (keys: readonly VolumeKey[]) =>
      volumeEnvelope({ volumeKeys: placeVolumeKeys(keys, 0, sampleCount) }, 0, sampleCount);
    const user = envelope(example.user);
    const ducking = envelope(example.ducking);
    const product = envelope(exact);
    let worst = 0;
    for (let n = 0; n < sampleCount; n += 1) {
      const expected = (user[n] as number) * (ducking[n] as number);
      worst = Math.max(worst, Math.abs((product[n] as number) - expected) / expected);
    }
    // Three gains rounded to 32 bits, each within 2^-24 relative, and the 1e-9 of D85.4.
    expect(worst).toBeLessThan(2e-7);
  });
});

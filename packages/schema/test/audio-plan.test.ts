/**
 * The audio plan of sounds at another speed, reversed, or frozen (D82.3,
 * D82.6). The expectations are derived by hand from D82.1 for the clips of
 * `speedComposition`, never from the code.
 */
import { referenceComposition, speedComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  audioPlan,
  heardSourceRange,
  validateComposition,
  type AudioPlanEntry,
  type ValidatedComposition,
} from '../src/index.js';

function validated(document: unknown): ValidatedComposition {
  const result = validateComposition(document);
  if (!result.ok) throw new Error(result.errors.map(({ message }) => message).join('\n'));
  return result.composition;
}

function entryOf(entries: readonly AudioPlanEntry[], id: string): AudioPlanEntry {
  const entry = entries.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`No entry ${id}.`);
  return entry;
}

describe('the audio plan of mapped sounds (D82.6)', () => {
  const { entries } = audioPlan(validated(speedComposition));

  it('carries the map of a sound at half speed, moved into composition time', () => {
    // F(e) = 1 000 000 + ⌊e / 2⌋: (2 000 000 + u) / 2 in composition time.
    const half = entryOf(entries, 'clip-half');
    expect(half).toEqual({
      kind: 'clip',
      id: 'clip-half',
      assetId: 'asset-audio',
      startUs: 0,
      durationUs: 2_000_000,
      sourceStartUs: 1_000_000,
      map: { intercept: 2_000_000n, slope: 1, den: 2 },
      volume: 0.5,
      lifetimeUs: 2_000_000,
      fadeInUs: 0,
      fadeOutUs: 200_000,
    });
    expect(Object.keys(half).indexOf('map')).toBe(Object.keys(half).indexOf('sourceStartUs') + 1);
    expect(heardSourceRange(half)).toEqual({ startUs: 1_000_000, durationUs: 1_000_000 });
  });

  it('carries the map of a reversed sound at three halves, which hears the range it plays forwards', () => {
    // Forwards F(e) = 2 000 000 + ⌊3e / 2⌋ for e < 1 000 000; reversed it starts at
    // F(999 999) = 3 499 998 and ends at F(0) = 2 000 000.
    const reversed = entryOf(entries, 'clip-reversed');
    expect(reversed).toMatchObject({
      startUs: 500_000,
      durationUs: 1_000_000,
      sourceStartUs: 3_499_998,
      map: { intercept: 8_500_000n, slope: -3, den: 2 },
      lifetimeUs: 1_000_000,
    });
    expect(heardSourceRange(reversed)).toEqual({ startUs: 2_000_000, durationUs: 1_499_999 });
  });

  it('carries the map of the sound of a video at three halves', () => {
    const video = entryOf(entries, 'node-three-halves');
    expect(video).toMatchObject({
      kind: 'video',
      startUs: 0,
      durationUs: 2_000_000,
      sourceStartUs: 0,
      map: { intercept: 0n, slope: 3, den: 2 },
      volume: 0.5,
    });
    // ⌊1 999 999 · 3 / 2⌋ = 2 999 998: inside the 3 s of the source.
    expect(heardSourceRange(video)).toEqual({ startUs: 0, durationUs: 2_999_999 });
  });

  it('never hears a frozen video, whatever its volume, nor a silent one (D82.3)', () => {
    expect(entries.map(({ id }) => id).sort()).toEqual([
      'clip-half',
      'clip-reversed',
      'node-three-halves',
    ]);
  });

  it('keeps the entry of D52.4 byte for byte at speed 1 forwards: no map', () => {
    const [entry] = audioPlan(validated(referenceComposition)).entries;
    expect(entry).toBeDefined();
    expect(Object.keys(entry ?? {})).not.toContain('map');
    expect(heardSourceRange(entry as AudioPlanEntry)).toEqual({
      startUs: entry?.sourceStartUs,
      durationUs: entry?.durationUs,
    });
  });

  it('keeps the map of a sound its scene cuts, so the cut changes no sample heard', () => {
    const document = structuredClone(speedComposition) as {
      durationUs: number;
      scenes: { durationUs: number }[];
    };
    const [scene] = document.scenes;
    if (scene === undefined) throw new Error('No scene.');
    scene.durationUs = 1_000_000;
    document.durationUs = 1_000_000;
    const cut = audioPlan(validated(document)).entries;
    const whole = entryOf(entries, 'clip-reversed');
    const reversed = entryOf(cut, 'clip-reversed');
    expect(reversed.map).toEqual(whole.map);
    expect(reversed).toMatchObject({
      startUs: 500_000,
      durationUs: 500_000,
      lifetimeUs: 1_000_000,
    });
    // Scene times 500 000 … 999 999 hear F(999 999) down to F(500 000) = 2 750 000.
    expect(heardSourceRange(reversed)).toEqual({ startUs: 2_750_000, durationUs: 749_999 });
  });
});

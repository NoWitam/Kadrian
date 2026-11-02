/**
 * Transitions as overlaps (D49.4, D56): a scene transition pulls the incoming
 * scene back by its duration, so both sides are evaluated inside it, and the
 * transition under way is the one whose incoming scene started at most its
 * duration before. The expectations are derived by hand from the rule and the
 * transitions fixture (five scenes, four transitions of 400 000 µs each).
 */
import { transitionsComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  sceneTransitionAt,
  scenePlacements,
  scenesAt,
  validateComposition,
  type ValidatedComposition,
} from '../src/index.js';

function validated(document: unknown): ValidatedComposition {
  const result = validateComposition(document);
  if (!result.ok) throw new Error(result.errors.map(({ message }) => message).join('\n'));
  return result.composition;
}

const sequence = validated(transitionsComposition);

describe('the placements of scenes with transitions (D56)', () => {
  it('start each scene the transition before it earlier', () => {
    // start(k + 1) = start(k) + 1 000 000 − 400 000.
    expect(scenePlacements(sequence).map(({ id, startUs }) => [id, startUs])).toEqual([
      ['scene-a', 0],
      ['scene-b', 600_000],
      ['scene-c', 1_200_000],
      ['scene-d', 1_800_000],
      ['scene-e', 2_400_000],
    ]);
    // The last scene ends where the composition does: 2 400 000 + 1 200 000.
    expect(sequence.durationUs).toBe(3_600_000);
  });

  it('place scenes end to end where there is no transition', () => {
    const placements = scenePlacements({
      scenes: [
        { id: 'x', durationUs: 10 },
        { id: 'y', durationUs: 20 },
        { id: 'z', durationUs: 30 },
      ],
      transitions: [{ id: 't', fromSceneId: 'y', toSceneId: 'z', durationUs: 5 }],
    });
    expect(placements.map(({ startUs }) => startUs)).toEqual([0, 10, 25]);
  });

  it('ignore a transition whose sides are not the two scenes in that order', () => {
    const placements = scenePlacements({
      scenes: [
        { id: 'x', durationUs: 10 },
        { id: 'y', durationUs: 20 },
      ],
      transitions: [{ id: 't', fromSceneId: 'y', toSceneId: 'x', durationUs: 5 }],
    });
    expect(placements.map(({ startUs }) => startUs)).toEqual([0, 10]);
  });
});

describe('the scenes at one instant with transitions (D49.4)', () => {
  it.each([
    [0, [['scene-a', 0]]],
    [599_999, [['scene-a', 599_999]]],
    [
      600_000,
      [
        ['scene-a', 600_000],
        ['scene-b', 0],
      ],
    ],
    [
      999_999,
      [
        ['scene-a', 999_999],
        ['scene-b', 399_999],
      ],
    ],
    [1_000_000, [['scene-b', 400_000]]],
    [
      1_500_000,
      [
        ['scene-b', 900_000],
        ['scene-c', 300_000],
      ],
    ],
    [
      2_400_000,
      [
        ['scene-d', 600_000],
        ['scene-e', 0],
      ],
    ],
    [3_599_999, [['scene-e', 1_199_999]]],
    [3_600_000, []],
  ] as const)('at %i are %j', (timeUs, expected) => {
    expect(scenesAt(sequence, timeUs).map(({ placement, timeUs: t }) => [placement.id, t])).toEqual(
      expected,
    );
  });
});

describe('the scene transition at one instant (D56)', () => {
  it.each([
    [0, null],
    [599_999, null],
    [600_000, { id: 'transition-crossfade', fromIndex: 0, elapsedUs: 0 }],
    [999_999, { id: 'transition-crossfade', fromIndex: 0, elapsedUs: 399_999 }],
    [1_000_000, null],
    [1_300_000, { id: 'transition-fade', fromIndex: 1, elapsedUs: 100_000 }],
    [2_000_000, { id: 'transition-slide', fromIndex: 2, elapsedUs: 200_000 }],
    [2_799_999, { id: 'transition-wipe', fromIndex: 3, elapsedUs: 399_999 }],
    [2_800_000, null],
    [3_600_000, null],
  ] as const)('at %i is %j', (timeUs, expected) => {
    const instant = sceneTransitionAt(sequence, timeUs);
    expect(instant).toEqual(expected === null ? null : { ...expected, durationUs: 400_000 });
  });

  it('is under way exactly while two scenes are evaluated', () => {
    for (let timeUs = 0; timeUs < sequence.durationUs; timeUs += 10_000) {
      const both = scenesAt(sequence, timeUs).length === 2;
      expect(sceneTransitionAt(sequence, timeUs) !== null, String(timeUs)).toBe(both);
    }
  });
});

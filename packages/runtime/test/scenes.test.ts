/**
 * Scenes in sequence (D49.3, D54.3): the state at a composition time holds the
 * one scene evaluated then, with its scene time, and that scene's nodes are
 * evaluated at scene time exactly as the same scene would be on its own.
 */
import { scenesComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { evaluateComposition } from '../src/index.js';
import { stateNode, validated } from './support.js';

const sequence = validated(scenesComposition);

type Draft = { durationUs: number; scenes: { id: string; durationUs: number }[]; clips: unknown[] };

/** The fixture with only the scene at `index`, and the duration of that scene. */
function alone(index: number) {
  const draft = structuredClone(scenesComposition) as Draft;
  const scene = draft.scenes[index];
  if (scene === undefined) throw new Error('No scene.');
  draft.scenes = [scene];
  draft.durationUs = scene.durationUs;
  draft.clips = [];
  return validated(draft);
}

describe('the state of scenes in sequence (D49.3)', () => {
  it.each([
    [0, 'scene-intro', 0],
    [999_999, 'scene-intro', 999_999],
    [1_000_000, 'scene-middle', 0],
    [2_499_999, 'scene-middle', 1_499_999],
    [2_500_000, 'scene-outro', 0],
    [3_199_999, 'scene-outro', 699_999],
  ])('at %i holds %s alone, at scene time %i', (timeUs, id, local) => {
    const state = evaluateComposition(sequence, timeUs);
    expect(state.timeUs).toBe(timeUs);
    expect(state.scenes.map((scene) => [scene.id, scene.timeUs])).toEqual([[id, local]]);
  });

  it('evaluates keyframes and lifetimes in scene time', () => {
    // The intro title moves from y 400 to y 1000 over its scene.
    const middle = evaluateComposition(sequence, 500_000);
    expect(stateNode(middle, 'intro-title')).toMatchObject({ position: { x: 90, y: 700 } });
    // The image fades in over the middle scene: half way at scene time 750 000.
    const image = stateNode(evaluateComposition(sequence, 1_750_000), 'middle-image');
    expect(image).toMatchObject({ opacity: 0.5 });
    // The outro title starts at scene time 200 000.
    expect(stateNode(evaluateComposition(sequence, 2_699_999), 'outro-title').active).toBe(false);
    expect(stateNode(evaluateComposition(sequence, 2_700_000), 'outro-title').active).toBe(true);
  });

  it('evaluates each scene as the same scene does on its own', () => {
    const starts = [0, 1_000_000, 2_500_000];
    starts.forEach((startUs, index) => {
      const single = alone(index);
      for (const local of [0, 1, 333_334, single.durationUs - 1]) {
        const inSequence = evaluateComposition(sequence, startUs + local).scenes;
        const onItsOwn = evaluateComposition(single, local).scenes;
        expect(inSequence, `${String(index)} at ${String(local)}`).toEqual(onItsOwn);
      }
    });
  });
});

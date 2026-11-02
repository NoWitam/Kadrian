/**
 * Transitions in the evaluated state (D49.4, D56): what each scene effect does
 * to its two sides, that a transition at progress 0 leaves the outgoing scene
 * as it is alone, and the factors clip transitions multiply into opacities.
 * The expectations are derived by hand from the transitions fixture: a
 * 640×360 frame, transitions of 400 000 µs starting at 600 000 (crossfade),
 * 1 200 000 (fade through white), 1 800 000 (slide left) and 2 400 000
 * (wipe up), and in the last scene a crossfade from `e-image` to `e-title`
 * from scene time 400 000.
 */
import { transitionsComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { evaluateComposition, type CompositionState } from '../src/index.js';
import { stateNode, validated, type Draft } from './support.js';

const sequence = validated(transitionsComposition);

/** `[id, transition]` of every scene at `timeUs`, the transition `null` where there is none. */
function sides(timeUs: number): [string, unknown][] {
  return evaluateComposition(sequence, timeUs).scenes.map((scene) => [
    scene.id,
    scene.transition ?? null,
  ]);
}

function backdrop(state: CompositionState): string | null {
  return state.backdrop ?? null;
}

describe('a crossfade between scenes', () => {
  it('raises the incoming scene from opacity 0 and leaves the outgoing one as it is', () => {
    const id = 'transition-crossfade';
    expect(sides(600_000)).toEqual([
      ['scene-a', null],
      ['scene-b', { id, opacity: 0 }],
    ]);
    expect(sides(800_000)).toEqual([
      ['scene-a', null],
      ['scene-b', { id, opacity: 0.5 }],
    ]);
    expect(sides(1_000_000)).toEqual([['scene-b', null]]);
  });
});

describe('a fade through a colour', () => {
  const id = 'transition-fade';

  it('shows no colour and the outgoing scene whole at its first instant', () => {
    const state = evaluateComposition(sequence, 1_200_000);
    expect(backdrop(state)).toBeNull();
    expect(sides(1_200_000)).toEqual([
      ['scene-b', { id, opacity: 1 }],
      ['scene-c', { id, opacity: 0 }],
    ]);
  });

  it('fades the outgoing scene out over the first half', () => {
    expect(backdrop(evaluateComposition(sequence, 1_300_000))).toBe('#ffffff');
    expect(sides(1_300_000)).toEqual([
      ['scene-b', { id, opacity: 0.5 }],
      ['scene-c', { id, opacity: 0 }],
    ]);
  });

  it('fades the incoming scene in over the second half', () => {
    expect(sides(1_400_000)).toEqual([
      ['scene-b', { id, opacity: 0 }],
      ['scene-c', { id, opacity: 0 }],
    ]);
    expect(sides(1_500_000)).toEqual([
      ['scene-b', { id, opacity: 0 }],
      ['scene-c', { id, opacity: 0.5 }],
    ]);
    expect(backdrop(evaluateComposition(sequence, 1_599_999))).toBe('#ffffff');
  });

  it('shows no colour after the transition', () => {
    expect(backdrop(evaluateComposition(sequence, 1_600_000))).toBeNull();
    expect(sides(1_600_000)).toEqual([['scene-c', null]]);
  });
});

describe('a slide and a wipe', () => {
  it('move the incoming scene from one frame width away to its place', () => {
    const id = 'transition-slide';
    expect(sides(1_800_000)).toEqual([
      ['scene-c', null],
      ['scene-d', { id, offset: { x: 640, y: 0 } }],
    ]);
    expect(sides(2_000_000)).toEqual([
      ['scene-c', null],
      ['scene-d', { id, offset: { x: 320, y: 0 } }],
    ]);
  });

  it('cut the incoming scene to the part an edge moving up has passed', () => {
    const id = 'transition-wipe';
    const clip = (fromTop: number) => ({
      id,
      clip: { fromTop, fromRight: 0, fromBottom: 0, fromLeft: 0 },
    });
    expect(sides(2_400_000)).toEqual([
      ['scene-d', null],
      ['scene-e', clip(360)],
    ]);
    expect(sides(2_500_000)).toEqual([
      ['scene-d', null],
      ['scene-e', clip(270)],
    ]);
  });
});

/** The fixture with only the scene at `index`, no transitions between scenes, and that scene's duration. */
function alone(index: number) {
  const draft = structuredClone(transitionsComposition) as Draft;
  const scene = draft.scenes[index];
  if (scene === undefined) throw new Error('No scene.');
  draft.scenes = [scene];
  draft.transitions = [];
  draft.durationUs = scene.durationUs;
  return validated(draft);
}

describe('both sides of a scene transition', () => {
  it.each([
    [600_000, 0],
    [1_300_000, 1],
    [2_000_000, 2],
    [2_799_999, 3],
  ])('at %i hold the nodes each scene has on its own', (timeUs, fromIndex) => {
    const [outgoing, incoming] = evaluateComposition(sequence, timeUs).scenes;
    if (outgoing === undefined || incoming === undefined) throw new Error('Not two sides.');
    expect(outgoing.nodes).toEqual(
      evaluateComposition(alone(fromIndex), outgoing.timeUs).scenes[0]?.nodes,
    );
    expect(incoming.nodes).toEqual(
      evaluateComposition(alone(fromIndex + 1), incoming.timeUs).scenes[0]?.nodes,
    );
  });
});

describe('a crossfade between clips (D56)', () => {
  const sceneE = 2_400_000;

  it('raises the incoming node and keeps an outgoing node below it', () => {
    const at = (local: number) => evaluateComposition(sequence, sceneE + local);
    // Before the overlap: the title is not active yet and has no factor.
    expect(stateNode(at(399_999), 'e-title')).toMatchObject({ active: false, opacity: 1 });
    expect(stateNode(at(400_000), 'e-title')).toMatchObject({ active: true, opacity: 0 });
    expect(stateNode(at(500_000), 'e-title')).toMatchObject({ opacity: 0.25 });
    // The image lies below the title, so it keeps its opacity.
    expect(stateNode(at(500_000), 'e-image')).toMatchObject({ opacity: 1 });
    // After the overlap: the title as it is without the transition.
    expect(stateNode(at(800_000), 'e-title')).toMatchObject({ opacity: 1 });
  });

  it('fades an outgoing node out when it lies above the incoming one', () => {
    const draft = structuredClone(transitionsComposition) as Draft;
    const scene = draft.scenes[4];
    if (scene === undefined) throw new Error('No scene e.');
    const [background, image, title] = scene.nodes;
    if (background === undefined || image === undefined || title === undefined) {
      throw new Error('Unexpected scene e.');
    }
    scene.nodes = [background, title, image];
    const swapped = validated(draft);
    const state = evaluateComposition(swapped, sceneE + 500_000);
    expect(stateNode(state, 'e-title')).toMatchObject({ opacity: 0.25 });
    expect(stateNode(state, 'e-image')).toMatchObject({ opacity: 0.75 });
  });
});

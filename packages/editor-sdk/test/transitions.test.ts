/**
 * The commands of transitions (D56): scene and clip transitions added,
 * removed, resized, and given another effect. A scene transition changes the
 * composition's duration by its own; a clip transition keeps the outgoing
 * clip ending its duration after the incoming one starts. Each edit is undone
 * by its inverse to the exact text of the document before it, and a command
 * of another kind that would break a transition is refused with the IDs of
 * the transitions in its way.
 */
import type { ValidatedComposition } from '@kadrion/schema';
import { scenesComposition, transitionsComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  applyCommand as applyWithFacts,
  type Command,
  type CommandResult,
  type MediaFacts,
} from '../src/index.js';

import { codeOf, errorOf, json, validated } from './support.js';

const plain = validated(scenesComposition);
const sequence = validated(transitionsComposition);
const AUDIO_HASH = plain.assets.find(({ type }) => type === 'audio')?.contentHash ?? '';

/** The reference sound lasts 5 s: moving a scene moves the source range of its sounds (D49.6). */
function mediaFacts(contentHash: string): MediaFacts | null {
  return contentHash === AUDIO_HASH ? { type: 'audio', durationUs: 5_000_000 } : null;
}

function applyCommand(document: ValidatedComposition, command: Command): CommandResult {
  return applyWithFacts(document, command, { mediaFacts });
}

interface TransitionView {
  id: string;
  durationUs: number;
  effect: Record<string, unknown>;
  fromNodeId?: string;
  toNodeId?: string;
}

interface SceneView {
  id: string;
  nodes: { id: string; durationUs: number }[];
  transitions: TransitionView[];
}

interface DocumentView {
  durationUs: number;
  scenes: SceneView[];
  transitions: TransitionView[];
}

function view(document: unknown): DocumentView {
  return document as DocumentView;
}

function sceneOf(document: unknown, id: string): SceneView {
  const scene = view(document).scenes.find((item) => item.id === id);
  if (scene === undefined) throw new Error(`No scene "${id}".`);
  return scene;
}

/** Applies a command and its inverse, checks the restored text, and returns the edited document. */
function roundTrip(document: ValidatedComposition, command: Command): ValidatedComposition {
  const result = applyCommand(document, command);
  expect(result.inverse).not.toBeNull();
  const restored = applyCommand(result.document, result.inverse as Command).document;
  expect(json(restored)).toBe(json(document));
  return result.document;
}

const INTRO_TO_MIDDLE = Object.freeze({
  id: 'transition-new',
  fromSceneId: 'scene-intro',
  toSceneId: 'scene-middle',
  durationUs: 200_000,
  effect: { kind: 'crossfade' },
});

describe('AddSceneTransition (D56)', () => {
  it('inserts the transition and shortens the composition by its duration', () => {
    const result = applyCommand(plain, {
      type: 'AddSceneTransition',
      index: 0,
      transition: INTRO_TO_MIDDLE,
    });
    expect(view(result.document).transitions).toEqual([INTRO_TO_MIDDLE]);
    expect(view(result.document).durationUs).toBe(3_000_000);
    expect(result.createdIds).toEqual(['transition-new']);
    expect(result.inverse).toEqual({ type: 'RemoveTransition', transitionId: 'transition-new' });
    roundTrip(plain, { type: 'AddSceneTransition', index: 0, transition: INTRO_TO_MIDDLE });
  });

  it('refuses an ID in use, an index past the end, and a pair that is not adjacent', () => {
    const taken = { ...INTRO_TO_MIDDLE, id: 'scene-outro' };
    expect(
      errorOf(() =>
        applyCommand(plain, { type: 'AddSceneTransition', index: 0, transition: taken }),
      ).code,
    ).toBe('id-in-use');
    expect(
      codeOf(() =>
        applyCommand(plain, { type: 'AddSceneTransition', index: 1, transition: INTRO_TO_MIDDLE }),
      ),
    ).toBe('index-out-of-range');
    const apart = { ...INTRO_TO_MIDDLE, toSceneId: 'scene-outro' };
    expect(
      codeOf(() =>
        applyCommand(plain, { type: 'AddSceneTransition', index: 0, transition: apart }),
      ),
    ).toBe('invalid-result');
  });

  it('refuses a second transition between the same two scenes', () => {
    const twice = {
      ...INTRO_TO_MIDDLE,
      id: 'transition-twice',
      fromSceneId: 'scene-a',
      toSceneId: 'scene-b',
    };
    expect(
      codeOf(() =>
        applyCommand(sequence, { type: 'AddSceneTransition', index: 4, transition: twice }),
      ),
    ).toBe('invalid-result');
  });
});

describe('AddClipTransition (D56)', () => {
  it('inserts the transition into its scene and leaves the duration as it is', () => {
    const removed = applyCommand(sequence, {
      type: 'RemoveTransition',
      transitionId: 'transition-e',
    }).document;
    const transition = sceneOf(sequence, 'scene-e').transitions[0];
    const result = applyCommand(removed, {
      type: 'AddClipTransition',
      sceneId: 'scene-e',
      index: 0,
      transition: transition as unknown as Record<string, unknown>,
    });
    expect(json(result.document)).toBe(json(sequence));
    expect(result.createdIds).toEqual(['transition-e']);
  });

  it('refuses an unknown scene and an effect that is not a crossfade', () => {
    const transition = { ...sceneOf(sequence, 'scene-e').transitions[0], id: 'transition-x' };
    expect(
      codeOf(() =>
        applyCommand(sequence, {
          type: 'AddClipTransition',
          sceneId: 'scene-missing',
          index: 0,
          transition,
        }),
      ),
    ).toBe('unknown-scene');
    const removed = applyCommand(sequence, {
      type: 'RemoveTransition',
      transitionId: 'transition-e',
    }).document;
    const slide = { ...transition, effect: { kind: 'slide', direction: 'left' } };
    expect(() =>
      applyCommand(removed, {
        type: 'AddClipTransition',
        sceneId: 'scene-e',
        index: 0,
        transition: slide,
      }),
    ).toThrow();
  });
});

describe('RemoveTransition (D56)', () => {
  it('removes a scene transition and lengthens the composition by its duration', () => {
    const result = applyCommand(sequence, {
      type: 'RemoveTransition',
      transitionId: 'transition-fade',
    });
    expect(view(result.document).transitions.map(({ id }) => id)).toEqual([
      'transition-crossfade',
      'transition-slide',
      'transition-wipe',
    ]);
    expect(view(result.document).durationUs).toBe(4_000_000);
    expect(result.inverse).toEqual({
      type: 'AddSceneTransition',
      index: 1,
      transition: view(sequence).transitions[1],
    });
    roundTrip(sequence, { type: 'RemoveTransition', transitionId: 'transition-wipe' });
  });

  it('removes a clip transition, with an inverse that adds it back in its scene', () => {
    const result = applyCommand(sequence, {
      type: 'RemoveTransition',
      transitionId: 'transition-e',
    });
    expect(sceneOf(result.document, 'scene-e').transitions).toEqual([]);
    expect(view(result.document).durationUs).toBe(3_600_000);
    expect(result.inverse).toMatchObject({
      type: 'AddClipTransition',
      sceneId: 'scene-e',
      index: 0,
    });
    roundTrip(sequence, { type: 'RemoveTransition', transitionId: 'transition-e' });
  });

  it('refuses an ID that is no transition', () => {
    for (const transitionId of ['transition-missing', 'scene-a', 'e-title']) {
      expect(codeOf(() => applyCommand(sequence, { type: 'RemoveTransition', transitionId }))).toBe(
        'unknown-transition',
      );
    }
  });
});

describe('SetTransitionDuration (D56)', () => {
  it('changes the composition by the opposite of the change of a scene transition', () => {
    const result = applyCommand(sequence, {
      type: 'SetTransitionDuration',
      transitionId: 'transition-crossfade',
      durationUs: 200_000,
    });
    expect(view(result.document).transitions[0]?.durationUs).toBe(200_000);
    expect(view(result.document).durationUs).toBe(3_800_000);
    roundTrip(sequence, {
      type: 'SetTransitionDuration',
      transitionId: 'transition-wipe',
      durationUs: 600_000,
    });
  });

  it('keeps the outgoing clip ending the new duration after the incoming one starts', () => {
    const result = applyCommand(sequence, {
      type: 'SetTransitionDuration',
      transitionId: 'transition-e',
      durationUs: 200_000,
    });
    const scene = sceneOf(result.document, 'scene-e');
    expect(scene.transitions[0]?.durationUs).toBe(200_000);
    expect(scene.nodes.find(({ id }) => id === 'e-image')?.durationUs).toBe(600_000);
    expect(view(result.document).durationUs).toBe(3_600_000);
    roundTrip(sequence, {
      type: 'SetTransitionDuration',
      transitionId: 'transition-e',
      durationUs: 1,
    });
  });

  it('is no edit at its own duration, and refuses one longer than a side allows', () => {
    expect(
      applyCommand(sequence, {
        type: 'SetTransitionDuration',
        transitionId: 'transition-slide',
        durationUs: 400_000,
      }).inverse,
    ).toBeNull();
    // Scene c is 1 000 000 long and already has a transition of 400 000 into it.
    expect(
      codeOf(() =>
        applyCommand(sequence, {
          type: 'SetTransitionDuration',
          transitionId: 'transition-slide',
          durationUs: 700_000,
        }),
      ),
    ).toBe('invalid-result');
  });
});

describe('SetTransitionEffect (D56)', () => {
  it('replaces the effect and restores the same bytes on undo', () => {
    const effect = { kind: 'wipe', direction: 'right' };
    const result = applyCommand(sequence, {
      type: 'SetTransitionEffect',
      transitionId: 'transition-slide',
      effect,
    });
    expect(view(result.document).transitions[2]?.effect).toEqual(effect);
    expect(result.inverse).toEqual({
      type: 'SetTransitionEffect',
      transitionId: 'transition-slide',
      effect: { kind: 'slide', direction: 'left' },
    });
    roundTrip(sequence, {
      type: 'SetTransitionEffect',
      transitionId: 'transition-crossfade',
      effect: { kind: 'fade-through-color', color: '#000000' },
    });
  });

  it('is no edit for the same effect, and refuses a scene effect on a clip transition', () => {
    expect(
      applyCommand(sequence, {
        type: 'SetTransitionEffect',
        transitionId: 'transition-fade',
        effect: { kind: 'fade-through-color', color: '#ffffff' },
      }).inverse,
    ).toBeNull();
    expect(() =>
      applyCommand(sequence, {
        type: 'SetTransitionEffect',
        transitionId: 'transition-e',
        effect: { kind: 'slide', direction: 'up' },
      }),
    ).toThrow();
  });
});

describe('a command that would break a transition (D56)', () => {
  it('is refused with the IDs of the transitions in its way', () => {
    const removeScene = errorOf(() =>
      applyCommand(sequence, { type: 'RemoveScene', sceneId: 'scene-c' }),
    );
    expect(removeScene.code).toBe('transition-in-use');
    expect(removeScene.details).toEqual(['transition-fade', 'transition-slide']);
    const removeNode = errorOf(() =>
      applyCommand(sequence, { type: 'RemoveNode', nodeId: 'e-title' }),
    );
    expect(removeNode.code).toBe('transition-in-use');
    expect(removeNode.details).toEqual(['transition-e']);
    const shorter = errorOf(() =>
      applyCommand(sequence, { type: 'SetSceneDuration', sceneId: 'scene-b', durationUs: 500_000 }),
    );
    expect(shorter.code).toBe('transition-in-use');
  });

  it('goes through once the transition is removed first', () => {
    const removed = applyCommand(sequence, {
      type: 'RemoveTransition',
      transitionId: 'transition-e',
    }).document;
    expect(() => applyCommand(removed, { type: 'RemoveNode', nodeId: 'e-title' })).not.toThrow();
  });
});

describe('DuplicateScene with clip transitions (D56)', () => {
  it('gives the copied transitions new IDs that name the copied nodes', () => {
    const result = applyCommand(sequence, {
      type: 'DuplicateScene',
      sceneId: 'scene-e',
      newSceneId: 'scene-f',
    });
    expect(sceneOf(result.document, 'scene-f').transitions).toEqual([
      {
        id: 'scene-f-t0',
        fromNodeId: 'scene-f-n1',
        toNodeId: 'scene-f-n2',
        durationUs: 400_000,
        effect: { kind: 'crossfade' },
      },
    ]);
    expect(result.createdIds).toContain('scene-f-t0');
  });
});

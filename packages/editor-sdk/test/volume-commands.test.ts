/**
 * The commands of D85.8 that PR-77 widens: `SetClipFades` on a video node, the
 * animation commands on an audio clip, and `volume` in `SetKeyframeValue`.
 * Every edit is undone byte for byte, and every refusal changes nothing. The
 * timeline rules of D85.8 are tested in `timeline.test.ts`.
 */
import { referenceComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { applyCommand, createCommandBus, type Command } from '../src/index.js';

import { codeOf, errorOf, json, validated, VIDEO_ASSET, VIDEO_NODE } from './support.js';

type Json = Record<string, unknown>;

/** A video child of the group, silent, as `VIDEO_NODE` is. */
const CHILD_VIDEO = Object.freeze({ ...VIDEO_NODE, id: 'node-child-video' });

/** An audio clip of the given ID, from 0 for 2 s, with no animation. */
function clip(id: string): Json {
  return {
    id,
    type: 'audio',
    assetId: 'asset-audio',
    startUs: 0,
    durationUs: 2_000_000,
    sourceStartUs: 0,
    sourceStartRemainder: 0,
    speed: { num: 1, den: 1 },
    reverse: false,
    volume: 1,
    fadeInUs: 0,
    fadeOutUs: 0,
    animations: [],
  };
}

/**
 * The reference composition with the silent video at the top of its scene and
 * another inside the group, a clip in the scene (`clip-scene`), and a
 * definition that holds a clip (`clip-definition`); `clip-audio` is the
 * composition's.
 */
function document(): ReturnType<typeof validated> {
  const draft = structuredClone(referenceComposition) as {
    assets: unknown[];
    scenes: { nodes: Json[]; clips: unknown[] }[];
    definitions: unknown[];
  };
  draft.assets.push(structuredClone(VIDEO_ASSET));
  const scene = draft.scenes[0];
  if (scene === undefined) throw new Error('The fixture has no scene.');
  scene.nodes.push(structuredClone(VIDEO_NODE));
  const group = scene.nodes.find((node) => node['id'] === 'node-group');
  (group?.['children'] as unknown[]).push(structuredClone(CHILD_VIDEO));
  scene.clips.push(clip('clip-scene'));
  draft.definitions.push({
    id: 'definition-sound',
    sourceHash: '',
    width: 320,
    height: 180,
    durationUs: 2_000_000,
    nodes: [],
    clips: [clip('clip-definition')],
    transitions: [],
    template: { inputs: [], bindings: [], conditions: [], repeats: [] },
  });
  return validated(draft);
}

/** Every item of a document with that ID: a node, a group's child, or an audio clip. */
function itemOf(value: unknown, id: string): Json {
  const found: Json[] = [];
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) item.forEach(visit);
    else if (typeof item === 'object' && item !== null) {
      if ((item as Json)['id'] === id) found.push(item as Json);
      Object.values(item).forEach(visit);
    }
  };
  visit(value);
  const [item] = found;
  if (item === undefined || found.length > 1) throw new Error(`No single item ${id}.`);
  return item;
}

/** Applies `command`, checks its inverse restores every byte, and returns the result. */
function roundTrip(before: unknown, command: Command): unknown {
  const result = applyCommand(before as Parameters<typeof applyCommand>[0], command);
  if (result.inverse === null) throw new Error('The command changed nothing.');
  const restored = applyCommand(result.document, result.inverse);
  expect(json(restored.document)).toBe(json(before));
  return result.document;
}

/** A volume animation from 1 down to `low` between 1 s and 1.5 s, held after. */
function volumeAnimation(id: string, low = 0.2): Json {
  return {
    id,
    property: 'volume',
    keyframes: [
      { timeUs: 1_000_000, value: 1, easing: { kind: 'linear' } },
      { timeUs: 1_500_000, value: low, easing: { kind: 'hold' } },
    ],
  };
}

function addVolume(nodeId: string, id = `${nodeId}-a-volume`): Command {
  return { type: 'AddAnimation', nodeId, index: 0, animation: volumeAnimation(id) };
}

describe("SetClipFades reaches a video node's sound (D85.8)", () => {
  it.each([
    ['a video of a scene', 'node-video'],
    ["a group's video child", 'node-child-video'],
  ])('sets the fades of %s, and its inverse restores every byte', (_, clipId) => {
    const after = roundTrip(document(), {
      type: 'SetClipFades',
      clipId,
      fadeInUs: 200_000,
      fadeOutUs: 300_000,
    });
    expect(itemOf(after, clipId)).toMatchObject({ fadeInUs: 200_000, fadeOutUs: 300_000 });
    // The fields keep their places after the volume (D85.1).
    const keys = Object.keys(itemOf(after, clipId));
    expect(keys.slice(keys.indexOf('volume'), keys.indexOf('volume') + 3)).toEqual([
      'volume',
      'fadeInUs',
      'fadeOutUs',
    ]);
  });

  it("states the video's fades in the inverse", () => {
    const start = applyCommand(document(), {
      type: 'SetClipFades',
      clipId: 'node-video',
      fadeInUs: 100_000,
      fadeOutUs: 0,
    }).document;
    expect(
      applyCommand(start, {
        type: 'SetClipFades',
        clipId: 'node-video',
        fadeInUs: 0,
        fadeOutUs: 400_000,
      }).inverse,
    ).toEqual({ type: 'SetClipFades', clipId: 'node-video', fadeInUs: 100_000, fadeOutUs: 0 });
  });

  it('changes nothing for the fades a video has', () => {
    const before = document();
    const bus = createCommandBus(before);
    bus.dispatch({ type: 'SetClipFades', clipId: 'node-video', fadeInUs: 0, fadeOutUs: 0 });
    expect(bus.getDocument()).toBe(before);
    expect(bus.canUndo()).toBe(false);
  });

  it('still sets the fades of an audio clip of the composition, a scene, and a definition', () => {
    for (const clipId of ['clip-audio', 'clip-scene', 'clip-definition']) {
      const after = roundTrip(document(), {
        type: 'SetClipFades',
        clipId,
        fadeInUs: 500_000,
        fadeOutUs: 500_000,
      });
      expect(itemOf(after, clipId)).toMatchObject({ fadeInUs: 500_000, fadeOutUs: 500_000 });
    }
  });

  it.each([
    ['a text node', 'node-title', 'unsupported-node'],
    ['a group', 'node-group', 'unsupported-node'],
    ['a missing ID', 'node-none', 'unknown-clip'],
    ['an animation', 'anim-title-opacity', 'unknown-clip'],
    ['the scene', 'scene-main', 'unknown-clip'],
  ])('refuses %s with %s and changes nothing', (_, clipId, code) => {
    const before = document();
    const bus = createCommandBus(before);
    expect(
      codeOf(() => bus.dispatch({ type: 'SetClipFades', clipId, fadeInUs: 1, fadeOutUs: 1 })),
    ).toBe(code);
    expect(bus.getDocument()).toBe(before);
    expect(bus.canUndo()).toBe(false);
  });

  it.each([
    ['node-video', '/scenes/0/nodes/4/fadeOutUs'],
    ['node-child-video', '/scenes/0/nodes/1/children/2/fadeOutUs'],
  ])("refuses fades longer than the lifetime of %s at the rule's path", (clipId, path) => {
    const fades = (fadeOutUs: number): Command => ({
      type: 'SetClipFades',
      clipId,
      fadeInUs: 600_000,
      fadeOutUs,
    });
    const error = errorOf(() => applyCommand(document(), fades(400_001)));
    expect(error.code).toBe('invalid-result');
    expect(error.details.join('\n')).toContain(path);
    // Exactly the lifetime is allowed.
    expect(applyCommand(document(), fades(400_000)).inverse).not.toBeNull();
  });
});

describe('the animation commands reach an audio clip (D85.8)', () => {
  it.each([
    ['of the composition', 'clip-audio'],
    ['of a scene', 'clip-scene'],
    ['of a definition', 'clip-definition'],
  ])('adds a volume curve to a clip %s, as its last field, and undoes it', (_, clipId) => {
    const before = document();
    const bus = createCommandBus(before);
    const result = bus.dispatch(addVolume(clipId));
    expect(result.createdIds).toEqual([`${clipId}-a-volume`]);
    const edited = itemOf(bus.getDocument(), clipId);
    expect(edited['animations']).toEqual([volumeAnimation(`${clipId}-a-volume`)]);
    expect(Object.keys(edited).at(-1)).toBe('animations');
    bus.undo();
    expect(json(bus.getDocument())).toBe(json(before));
  });

  it('adds a volume curve to a video node', () => {
    const after = roundTrip(document(), addVolume('node-video'));
    expect(itemOf(after, 'node-video')['animations']).toEqual([
      volumeAnimation('node-video-a-volume'),
    ]);
  });

  it.each([
    ['a scale of a clip', 'clip-audio', { ...volumeAnimation('a'), property: 'opacity' }],
    ['a volume of a text', 'node-title', volumeAnimation('a')],
    ['a volume of an image', 'node-image', volumeAnimation('a')],
    [
      'a volume eased ease-in',
      'clip-audio',
      {
        ...volumeAnimation('a'),
        keyframes: [
          { timeUs: 0, value: 1, easing: { kind: 'ease-in' } },
          { timeUs: 1, value: 0, easing: { kind: 'linear' } },
        ],
      },
    ],
    [
      'a volume above 1',
      'clip-audio',
      {
        ...volumeAnimation('a'),
        keyframes: [
          { timeUs: 0, value: 1.5, easing: { kind: 'linear' } },
          { timeUs: 1, value: 1, easing: { kind: 'linear' } },
        ],
      },
    ],
  ])('refuses %s with invalid-result', (_, nodeId, animation) => {
    expect(
      codeOf(() => applyCommand(document(), { type: 'AddAnimation', nodeId, index: 0, animation })),
    ).toBe('invalid-result');
  });

  it("refuses a second volume curve on a clip, naming the first, and a missing clip's ID", () => {
    const once = applyCommand(document(), addVolume('clip-audio')).document;
    const error = errorOf(() => applyCommand(once, addVolume('clip-audio', 'another')));
    expect(error.code).toBe('duplicate-animation-target');
    expect(error.details).toEqual(['clip-audio-a-volume']);
    expect(codeOf(() => applyCommand(document(), addVolume('clip-none')))).toBe('unknown-node');
  });

  it("finds a clip's animation by its ID for every keyframe command, each undone byte for byte", () => {
    const animationId = 'clip-scene-a-volume';
    const start = applyCommand(document(), addVolume('clip-scene', animationId)).document;
    const keyframes = (after: unknown): unknown =>
      (itemOf(after, 'clip-scene')['animations'] as Json[])[0]?.['keyframes'];

    const added = roundTrip(start, {
      type: 'AddKeyframe',
      animationId,
      keyframe: { timeUs: 1_800_000, value: 0.5, easing: { kind: 'linear' } },
    });
    expect(keyframes(added)).toHaveLength(3);
    const removed = roundTrip(added, { type: 'RemoveKeyframe', animationId, timeUs: 1_800_000 });
    expect(json(removed)).toBe(json(start));
    const moved = roundTrip(start, {
      type: 'MoveKeyframe',
      animationId,
      timeUs: 1_500_000,
      toTimeUs: 1_250_000,
    });
    expect(keyframes(moved)).toMatchObject([{ timeUs: 1_000_000 }, { timeUs: 1_250_000 }]);
    const held = roundTrip(start, {
      type: 'SetKeyframeEasing',
      animationId,
      timeUs: 1_000_000,
      easing: { kind: 'hold' },
    });
    expect(keyframes(held)).toMatchObject([{ easing: { kind: 'hold' } }, {}]);
    const gone = roundTrip(start, { type: 'RemoveAnimation', animationId });
    expect(itemOf(gone, 'clip-scene')['animations']).toEqual([]);
    expect(
      codeOf(() => applyCommand(start, { type: 'RemoveKeyframe', animationId, timeUs: 1_000_000 })),
    ).toBe('too-few-keyframes');
  });

  it('restores a removed curve of a clip at its clip, under the same ID', () => {
    const start = applyCommand(document(), addVolume('clip-definition')).document;
    const result = applyCommand(start, {
      type: 'RemoveAnimation',
      animationId: 'clip-definition-a-volume',
    });
    expect(result.inverse).toEqual({
      type: 'AddAnimation',
      nodeId: 'clip-definition',
      index: 0,
      animation: volumeAnimation('clip-definition-a-volume'),
    });
  });

  it('refuses an easing of a volume keyframe other than linear or hold with invalid-result', () => {
    const start = applyCommand(document(), addVolume('clip-audio')).document;
    for (const easing of [{ kind: 'ease-in' }, { kind: 'steps', count: 2, position: 'end' }]) {
      expect(
        codeOf(() =>
          applyCommand(start, {
            type: 'SetKeyframeEasing',
            animationId: 'clip-audio-a-volume',
            timeUs: 1_000_000,
            easing,
          }),
        ),
      ).toBe('invalid-result');
    }
  });
});

describe('SetKeyframeValue sets a volume keyframe (D85.8)', () => {
  const animationId = 'clip-audio-a-volume';
  const start = (): unknown => applyCommand(document(), addVolume('clip-audio')).document;
  const keyframes = (after: unknown): unknown =>
    (itemOf(after, 'clip-audio')['animations'] as Json[])[0]?.['keyframes'];

  it('replaces the value at a time, keeping its easing, and its inverse restores it', () => {
    const after = roundTrip(start(), {
      type: 'SetKeyframeValue',
      animationId,
      timeUs: 1_500_000,
      value: 0.1,
    });
    expect(keyframes(after)).toEqual([
      { timeUs: 1_000_000, value: 1, easing: { kind: 'linear' } },
      { timeUs: 1_500_000, value: 0.1, easing: { kind: 'hold' } },
    ]);
  });

  it('inserts a keyframe eased as the one before it, and writes -0 as 0', () => {
    const after = roundTrip(start(), {
      type: 'SetKeyframeValue',
      animationId,
      timeUs: 2_000_000,
      value: -0,
    });
    expect(json(keyframes(after))).toBe(
      json([
        { timeUs: 1_000_000, value: 1, easing: { kind: 'linear' } },
        { timeUs: 1_500_000, value: 0.2, easing: { kind: 'hold' } },
        { timeUs: 2_000_000, value: 0, easing: { kind: 'hold' } },
      ]),
    );
  });

  it("sets a video's volume keyframe the same way", () => {
    const video = applyCommand(document(), addVolume('node-video')).document;
    const after = roundTrip(video, {
      type: 'SetKeyframeValue',
      animationId: 'node-video-a-volume',
      timeUs: 1_000_000,
      value: 0.5,
    });
    const curve = (itemOf(after, 'node-video')['animations'] as Json[])[0];
    expect(curve?.['keyframes']).toMatchObject([{ value: 0.5 }, { value: 0.2 }]);
  });

  it.each([
    ['above 1', 1.5, 'invalid-result'],
    ['below 0', -0.25, 'invalid-result'],
    ['not finite', Number.POSITIVE_INFINITY, 'invalid-argument'],
    ['a string', '0.5', 'invalid-argument'],
    ['an object', { value: 0.5 }, 'invalid-argument'],
  ])('refuses a value %s with %s and changes nothing', (_, value, code) => {
    const before = start();
    const bus = createCommandBus(before);
    expect(
      codeOf(() =>
        bus.dispatch({
          type: 'SetKeyframeValue',
          animationId,
          timeUs: 1_000_000,
          value: value as number,
        }),
      ),
    ).toBe(code);
    expect(bus.getDocument()).toBe(before);
  });
});

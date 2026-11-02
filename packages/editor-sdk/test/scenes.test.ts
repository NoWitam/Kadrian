/**
 * The commands of scenes (D54.5): scenes added, removed, duplicated,
 * reordered, and resized, nodes moved between scenes, and clips added to a
 * scene. The composition's duration follows the sum of the scenes; each edit
 * is undone by its inverse to the exact text of the document before it.
 */
import type { ValidatedComposition } from '@kadrion/schema';
import { scenesComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  applyCommand as applyWithFacts,
  type Command,
  type CommandResult,
  type MediaFacts,
} from '../src/index.js';

import { codeOf, errorOf, json, validated, VIDEO_ASSET, VIDEO_NODE } from './support.js';

const sequence = validated(scenesComposition);
const AUDIO_HASH = sequence.assets.find(({ type }) => type === 'audio')?.contentHash ?? '';

/** The reference sound lasts 5 s; the video of `withVideo` 1 s, without sound. */
function mediaFacts(contentHash: string): MediaFacts | null {
  if (contentHash === AUDIO_HASH) return { type: 'audio', durationUs: 5_000_000 };
  if (contentHash === VIDEO_ASSET.contentHash) {
    return { type: 'video', durationUs: 1_000_000, audioDurationUs: null };
  }
  return null;
}

function applyCommand(document: ValidatedComposition, command: Command): CommandResult {
  return applyWithFacts(document, command, { mediaFacts });
}

interface SceneView {
  id: string;
  durationUs: number;
  nodes: { id: string; animations?: { id: string }[]; children?: { id: string }[] }[];
  clips: { id: string }[];
}

function scenesOf(document: unknown): SceneView[] {
  return (document as { scenes: SceneView[] }).scenes;
}

function sceneIds(document: unknown): string[] {
  return scenesOf(document).map(({ id }) => id);
}

function durationOf(document: unknown): number {
  return (document as { durationUs: number }).durationUs;
}

/** Applies a command and its inverse, checks the restored text, and returns the edited document. */
function roundTrip(document: ValidatedComposition, command: Command): ValidatedComposition {
  const result = applyCommand(document, command);
  expect(result.inverse).not.toBeNull();
  const restored = applyCommand(result.document, result.inverse as Command).document;
  expect(json(restored)).toBe(json(document));
  return result.document;
}

const OUTRO2 = Object.freeze({
  id: 'scene-extra',
  durationUs: 400_000,
  nodes: [
    {
      id: 'extra-background',
      type: 'background',
      startUs: 0,
      durationUs: 400_000,
      color: '#000000',
    },
  ],
  clips: [],
  transitions: [],
});

/** The fixture with a muted video in the outro, lasting the whole scene time 0 to 2 s. */
function withVideo(): ValidatedComposition {
  const draft = structuredClone(scenesComposition) as {
    assets: unknown[];
    scenes: { nodes: unknown[] }[];
  };
  draft.assets.push(structuredClone(VIDEO_ASSET));
  draft.scenes[2]?.nodes.push({ ...structuredClone(VIDEO_NODE), durationUs: 2_000_000 });
  return validated(draft);
}

describe('AddScene and RemoveScene (D54.5)', () => {
  it('inserts a complete scene, grows the composition, and creates its IDs', () => {
    const result = applyCommand(sequence, { type: 'AddScene', index: 1, scene: OUTRO2 });
    expect(sceneIds(result.document)).toEqual([
      'scene-intro',
      'scene-extra',
      'scene-middle',
      'scene-outro',
    ]);
    expect(durationOf(result.document)).toBe(3_600_000);
    expect(result.createdIds).toEqual(['scene-extra', 'extra-background']);
    expect(result.inverse).toEqual({ type: 'RemoveScene', sceneId: 'scene-extra' });
    roundTrip(sequence, { type: 'AddScene', index: 3, scene: OUTRO2 });
  });

  it('refuses an index past the end and an ID in use', () => {
    expect(
      codeOf(() => applyCommand(sequence, { type: 'AddScene', index: 4, scene: OUTRO2 })),
    ).toBe('index-out-of-range');
    const taken = { ...OUTRO2, id: 'scene-middle' };
    expect(
      errorOf(() => applyCommand(sequence, { type: 'AddScene', index: 0, scene: taken })).code,
    ).toBe('id-in-use');
  });

  it('refuses a scene that is not complete', () => {
    const partial: Record<string, unknown> = { ...OUTRO2 };
    delete partial['durationUs'];
    expect(
      codeOf(() => applyCommand(sequence, { type: 'AddScene', index: 0, scene: partial })),
    ).toBe('invalid-result');
  });

  it('removes a scene with its nodes and clips, and its inverse restores the same bytes', () => {
    const result = applyCommand(sequence, { type: 'RemoveScene', sceneId: 'scene-middle' });
    expect(sceneIds(result.document)).toEqual(['scene-intro', 'scene-outro']);
    expect(durationOf(result.document)).toBe(1_700_000);
    expect(result.inverse).toMatchObject({ type: 'AddScene', index: 1 });
    roundTrip(sequence, { type: 'RemoveScene', sceneId: 'scene-middle' });
    roundTrip(sequence, { type: 'RemoveScene', sceneId: 'scene-intro' });
  });

  it('refuses an unknown scene and the last scene', () => {
    expect(
      codeOf(() => applyCommand(sequence, { type: 'RemoveScene', sceneId: 'scene-none' })),
    ).toBe('unknown-scene');
    let document = applyCommand(sequence, { type: 'RemoveScene', sceneId: 'scene-intro' }).document;
    document = applyCommand(document, { type: 'RemoveScene', sceneId: 'scene-middle' }).document;
    expect(
      codeOf(() => applyCommand(document, { type: 'RemoveScene', sceneId: 'scene-outro' })),
    ).toBe('last-scene');
  });
});

describe('DuplicateScene (D54.5)', () => {
  it('copies the scene directly after itself under IDs derived from the new one', () => {
    const result = applyCommand(sequence, {
      type: 'DuplicateScene',
      sceneId: 'scene-middle',
      newSceneId: 'scene-again',
    });
    expect(sceneIds(result.document)).toEqual([
      'scene-intro',
      'scene-middle',
      'scene-again',
      'scene-outro',
    ]);
    expect(durationOf(result.document)).toBe(4_700_000);
    const copy = scenesOf(result.document)[2];
    expect(copy?.nodes.map(({ id }) => id)).toEqual([
      'scene-again-n0',
      'scene-again-n1',
      'scene-again-n2',
    ]);
    expect(copy?.nodes[1]?.animations?.map(({ id }) => id)).toEqual(['scene-again-n1-a-opacity']);
    expect(copy?.clips.map(({ id }) => id)).toEqual(['scene-again-k0']);
    expect(result.createdIds).toEqual([
      'scene-again',
      'scene-again-n0',
      'scene-again-n1',
      'scene-again-n1-a-opacity',
      'scene-again-n2',
      'scene-again-k0',
    ]);
    // Only the IDs differ from the source.
    const source = scenesOf(sequence)[1];
    const strip = (text: string) => text.replaceAll(/"id":"[^"]*"/g, '');
    expect(strip(json(copy))).toBe(strip(json(source)));
    roundTrip(sequence, {
      type: 'DuplicateScene',
      sceneId: 'scene-middle',
      newSceneId: 'scene-again',
    });
  });

  it('refuses a derived ID that is in use', () => {
    const taken = applyCommand(sequence, {
      type: 'DuplicateScene',
      sceneId: 'scene-intro',
      newSceneId: 'scene-again',
    }).document;
    expect(
      codeOf(() =>
        applyCommand(taken, {
          type: 'DuplicateScene',
          sceneId: 'scene-outro',
          newSceneId: 'scene-again',
        }),
      ),
    ).toBe('id-in-use');
  });
});

describe('ReorderScene (D54.5)', () => {
  it('moves a scene and keeps the duration; the inverse moves it back', () => {
    const result = applyCommand(sequence, {
      type: 'ReorderScene',
      sceneId: 'scene-outro',
      index: 0,
    });
    expect(sceneIds(result.document)).toEqual(['scene-outro', 'scene-intro', 'scene-middle']);
    expect(durationOf(result.document)).toBe(3_200_000);
    expect(result.inverse).toEqual({ type: 'ReorderScene', sceneId: 'scene-outro', index: 2 });
    roundTrip(sequence, { type: 'ReorderScene', sceneId: 'scene-intro', index: 2 });
  });

  it('is no edit at its own index, and refuses an index past the last', () => {
    expect(
      applyCommand(sequence, { type: 'ReorderScene', sceneId: 'scene-middle', index: 1 }).inverse,
    ).toBeNull();
    expect(
      codeOf(() =>
        applyCommand(sequence, { type: 'ReorderScene', sceneId: 'scene-middle', index: 3 }),
      ),
    ).toBe('index-out-of-range');
  });
});

describe('SetSceneDuration (D54.5)', () => {
  it('sets the scene and changes the composition by the same amount', () => {
    const result = applyCommand(sequence, {
      type: 'SetSceneDuration',
      sceneId: 'scene-middle',
      durationUs: 2_000_000,
    });
    expect(scenesOf(result.document)[1]?.durationUs).toBe(2_000_000);
    expect(durationOf(result.document)).toBe(3_700_000);
    roundTrip(sequence, { type: 'SetSceneDuration', sceneId: 'scene-outro', durationUs: 100_000 });
  });

  it('is no edit at the duration the scene has', () => {
    expect(
      applyCommand(sequence, {
        type: 'SetSceneDuration',
        sceneId: 'scene-intro',
        durationUs: 1_000_000,
      }).inverse,
    ).toBeNull();
  });

  it('checks the source range a video in the scene would sample afterwards', () => {
    const document = withVideo();
    // The outro shows 700 000 of a video lasting 1 s; 900 000 still fits.
    roundTrip(document, { type: 'SetSceneDuration', sceneId: 'scene-outro', durationUs: 900_000 });
    const error = errorOf(() =>
      applyCommand(document, {
        type: 'SetSceneDuration',
        sceneId: 'scene-outro',
        durationUs: 1_500_000,
      }),
    );
    expect(error.code).toBe('source-range-exceeded');
    expect(error.details).toEqual([
      'node-video: samples 0 to 1500000 µs of a source of 1000000 µs',
    ]);
    expect(
      codeOf(() =>
        applyWithFacts(document, {
          type: 'SetSceneDuration',
          sceneId: 'scene-outro',
          durationUs: 800_000,
        }),
      ),
    ).toBe('media-facts-missing');
  });

  it('checks the scene clips a longer scene would let be heard', () => {
    // The voice plays scene time 250 000 to 1 250 000 from 1 s of a 5 s sound.
    const draft = structuredClone(scenesComposition) as {
      scenes: { clips: Record<string, unknown>[] }[];
    };
    const voice = draft.scenes[1]?.clips[0];
    if (voice === undefined) throw new Error('No clip.');
    voice['durationUs'] = 10_000_000;
    voice['sourceStartUs'] = 0;
    const document = validated(draft);
    expect(
      codeOf(() =>
        applyCommand(document, {
          type: 'SetSceneDuration',
          sceneId: 'scene-middle',
          durationUs: 6_000_000,
        }),
      ),
    ).toBe('source-range-exceeded');
    roundTrip(document, {
      type: 'SetSceneDuration',
      sceneId: 'scene-middle',
      durationUs: 5_000_000,
    });
  });
});

describe('MoveNodeToScene (D54.5)', () => {
  it('moves a node into another scene with its scene times; the inverse moves it back', () => {
    const result = applyCommand(sequence, {
      type: 'MoveNodeToScene',
      nodeId: 'intro-title',
      sceneId: 'scene-outro',
      index: 1,
    });
    const [intro, , outro] = scenesOf(result.document);
    expect(intro?.nodes.map(({ id }) => id)).toEqual(['intro-background']);
    expect(outro?.nodes.map(({ id }) => id)).toEqual([
      'outro-background',
      'intro-title',
      'outro-title',
    ]);
    expect(json(outro?.nodes[1])).toBe(json(scenesOf(sequence)[0]?.nodes[1]));
    expect(result.inverse).toEqual({
      type: 'MoveNodeToScene',
      nodeId: 'intro-title',
      sceneId: 'scene-intro',
      index: 1,
    });
    roundTrip(sequence, {
      type: 'MoveNodeToScene',
      nodeId: 'middle-html',
      sceneId: 'scene-intro',
      index: 0,
    });
  });

  it('reorders within its own scene, and is no edit at its own place', () => {
    roundTrip(sequence, {
      type: 'MoveNodeToScene',
      nodeId: 'middle-html',
      sceneId: 'scene-middle',
      index: 0,
    });
    expect(
      applyCommand(sequence, {
        type: 'MoveNodeToScene',
        nodeId: 'middle-html',
        sceneId: 'scene-middle',
        index: 2,
      }).inverse,
    ).toBeNull();
    expect(
      codeOf(() =>
        applyCommand(sequence, {
          type: 'MoveNodeToScene',
          nodeId: 'middle-html',
          sceneId: 'scene-middle',
          index: 3,
        }),
      ),
    ).toBe('index-out-of-range');
  });

  it('refuses an unknown node, an unknown scene, and an index past the end of the target', () => {
    expect(
      codeOf(() =>
        applyCommand(sequence, {
          type: 'MoveNodeToScene',
          nodeId: 'nope',
          sceneId: 'scene-outro',
          index: 0,
        }),
      ),
    ).toBe('unknown-node');
    expect(
      codeOf(() =>
        applyCommand(sequence, {
          type: 'MoveNodeToScene',
          nodeId: 'intro-title',
          sceneId: 'nope',
          index: 0,
        }),
      ),
    ).toBe('unknown-scene');
    expect(
      codeOf(() =>
        applyCommand(sequence, {
          type: 'MoveNodeToScene',
          nodeId: 'intro-title',
          sceneId: 'scene-outro',
          index: 3,
        }),
      ),
    ).toBe('index-out-of-range');
  });

  it('checks a video that would sample more of its source in a longer scene', () => {
    const document = withVideo();
    // In the middle scene the video samples 1 500 000 of a 1 s source.
    expect(
      codeOf(() =>
        applyCommand(document, {
          type: 'MoveNodeToScene',
          nodeId: 'node-video',
          sceneId: 'scene-middle',
          index: 0,
        }),
      ),
    ).toBe('source-range-exceeded');
    roundTrip(document, {
      type: 'MoveNodeToScene',
      nodeId: 'node-video',
      sceneId: 'scene-intro',
      index: 0,
    });
  });
});

describe('AddSceneAudioClip and RemoveAudioClip in a scene (D54.5)', () => {
  const CLIP = Object.freeze({
    id: 'clip-scene-voice',
    type: 'audio',
    assetId: 'asset-audio',
    startUs: 100_000,
    durationUs: 500_000,
    sourceStartUs: 0,
    volume: 1,
    fadeInUs: 0,
    fadeOutUs: 0,
  });

  it('inserts a clip into the scene; the inverse removes it, and its inverse adds it back', () => {
    const result = applyCommand(sequence, {
      type: 'AddSceneAudioClip',
      sceneId: 'scene-outro',
      index: 0,
      clip: CLIP,
    });
    expect(scenesOf(result.document)[2]?.clips.map(({ id }) => id)).toEqual(['clip-scene-voice']);
    expect(result.createdIds).toEqual(['clip-scene-voice']);
    expect(result.inverse).toEqual({ type: 'RemoveAudioClip', clipId: 'clip-scene-voice' });
    roundTrip(sequence, {
      type: 'AddSceneAudioClip',
      sceneId: 'scene-middle',
      index: 1,
      clip: CLIP,
    });
    const removed = applyCommand(sequence, { type: 'RemoveAudioClip', clipId: 'middle-voice' });
    expect(removed.inverse).toMatchObject({
      type: 'AddSceneAudioClip',
      sceneId: 'scene-middle',
      index: 0,
    });
    roundTrip(sequence, { type: 'RemoveAudioClip', clipId: 'middle-voice' });
  });

  it('edits a scene clip with the clip commands', () => {
    roundTrip(sequence, { type: 'SetClipVolume', clipId: 'middle-voice', volume: 0.25 });
  });

  it('refuses an unknown scene, an index past the end, an ID in use, and a sound it cannot check', () => {
    const add = (sceneId: string, index: number, clip: Readonly<Record<string, unknown>>) =>
      codeOf(() => applyCommand(sequence, { type: 'AddSceneAudioClip', sceneId, index, clip }));
    expect(add('nope', 0, CLIP)).toBe('unknown-scene');
    expect(add('scene-middle', 2, CLIP)).toBe('index-out-of-range');
    expect(add('scene-middle', 0, { ...CLIP, id: 'clip-music' })).toBe('id-in-use');
    expect(add('scene-middle', 0, { ...CLIP, sourceStartUs: 4_800_000 })).toBe(
      'source-range-exceeded',
    );
    expect(
      codeOf(() =>
        applyWithFacts(sequence, {
          type: 'AddSceneAudioClip',
          sceneId: 'scene-middle',
          index: 0,
          clip: CLIP,
        }),
      ),
    ).toBe('media-facts-missing');
  });
});

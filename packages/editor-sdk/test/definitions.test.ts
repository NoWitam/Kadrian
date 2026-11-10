/**
 * The commands of nested compositions (D76): definitions added and removed,
 * a run of nodes converted to a definition and an instance and expanded back,
 * and the existing commands at work inside a definition. Each edit is undone
 * by its inverse to the exact text of the document before it.
 */
import type { ValidatedComposition } from '@kadrion/schema';
import { nestedComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  applyCommand as applyWithFacts,
  describeDocument,
  type Command,
  type CommandResult,
  type MediaFacts,
} from '../src/index.js';

import { codeOf, errorOf, json, reference, validated } from './support.js';

const nested = validated(nestedComposition);
const AUDIO_HASH = nested.assets.find(({ type }) => type === 'audio')?.contentHash ?? '';

/** The sound of the fixture lasts 5 s. */
function mediaFacts(contentHash: string): MediaFacts | null {
  return contentHash === AUDIO_HASH ? { type: 'audio', durationUs: 5_000_000 } : null;
}

function applyCommand(document: ValidatedComposition, command: Command): CommandResult {
  return applyWithFacts(document, command, { mediaFacts });
}

/** Applies a command and its inverse, checks the restored text, and returns the edited document. */
function roundTrip(document: ValidatedComposition, command: Command): ValidatedComposition {
  const result = applyCommand(document, command);
  expect(result.inverse).not.toBeNull();
  const restored = applyCommand(result.document, result.inverse as Command).document;
  expect(json(restored)).toBe(json(document));
  return result.document;
}

interface HolderView {
  id: string;
  nodes: { id: string; type: string; [field: string]: unknown }[];
  clips: { id: string; volume?: number }[];
  transitions: { id: string }[];
}

function definitionsOf(document: unknown): HolderView[] {
  return (document as { definitions: HolderView[] }).definitions;
}

function scenesOf(document: unknown): HolderView[] {
  return (document as { scenes: HolderView[] }).scenes;
}

function definition(document: unknown, id: string): HolderView {
  const found = definitionsOf(document).find((item) => item.id === id);
  if (found === undefined) throw new Error(`No definition ${id}.`);
  return found;
}

const EXTRA = Object.freeze({
  id: 'definition-extra',
  width: 100,
  height: 50,
  durationUs: 500_000,
  nodes: [
    {
      id: 'extra-background',
      type: 'background',
      startUs: 0,
      durationUs: 500_000,
      color: '#102030',
      animations: [],
    },
  ],
  clips: [],
  transitions: [],
});

describe('the existing commands inside a definition (D76)', () => {
  it('edits a node of a definition by its ID, once for every instance, and undoes it', () => {
    const edited = roundTrip(nested, {
      type: 'SetNodePosition',
      nodeId: 'card-title',
      position: { x: 30, y: 40 },
    });
    const title = definition(edited, 'card').nodes.find(({ id }) => id === 'card-title');
    expect(title?.['position']).toEqual({ x: 30, y: 40 });
    // The scenes, which place the definition three times, are the same objects.
    expect(scenesOf(edited)).toBe(scenesOf(nested));
  });

  it('adds a node to a definition named as the parent', () => {
    const edited = roundTrip(nested, {
      type: 'AddNode',
      parentId: 'badge',
      index: 0,
      node: {
        id: 'badge-back',
        type: 'background',
        startUs: 0,
        durationUs: 1_000_000,
        color: '#ffffff',
        animations: [],
      },
    });
    expect(definition(edited, 'badge').nodes.map(({ id }) => id)).toEqual([
      'badge-back',
      'badge-disc',
      'badge-square',
    ]);
  });

  it('edits, adds, and removes the clips and transitions of a definition', () => {
    const louder = roundTrip(nested, { type: 'SetClipVolume', clipId: 'card-sound', volume: 1 });
    expect(definition(louder, 'card').clips[0]?.volume).toBe(1);
    const added = roundTrip(nested, {
      type: 'AddSceneAudioClip',
      sceneId: 'badge',
      index: 0,
      clip: {
        id: 'badge-sound',
        type: 'audio',
        assetId: 'asset-audio',
        startUs: 0,
        durationUs: 500_000,
        sourceStartUs: 0,
        volume: 1,
        fadeInUs: 0,
        fadeOutUs: 0,
      },
    });
    expect(definition(added, 'badge').clips.map(({ id }) => id)).toEqual(['badge-sound']);
    const removed = applyCommand(nested, { type: 'RemoveTransition', transitionId: 'card-bars' });
    expect(definition(removed.document, 'card').transitions).toEqual([]);
    expect(removed.inverse).toMatchObject({ type: 'AddClipTransition', sceneId: 'card', index: 0 });
    roundTrip(nested, { type: 'RemoveTransition', transitionId: 'card-bars' });
  });

  it('refuses to move a node of a definition to a scene', () => {
    expect(
      codeOf(() =>
        applyCommand(nested, {
          type: 'MoveNodeToScene',
          nodeId: 'card-title',
          sceneId: 'scene-nested',
          index: 0,
        }),
      ),
    ).toBe('unsupported-node');
  });

  it('names an unknown holder of a clip as unknown-scene', () => {
    expect(
      codeOf(() =>
        applyCommand(nested, {
          type: 'AddSceneAudioClip',
          sceneId: 'none',
          index: 0,
          clip: {},
        }),
      ),
    ).toBe('unknown-scene');
  });
});

describe('AddDefinition and RemoveDefinition (D76)', () => {
  it('inserts a definition at an index and removes it again', () => {
    const result = applyCommand(nested, { type: 'AddDefinition', index: 1, definition: EXTRA });
    expect(definitionsOf(result.document).map(({ id }) => id)).toEqual([
      'card',
      'definition-extra',
      'badge',
    ]);
    expect(result.createdIds).toEqual(['definition-extra', 'extra-background']);
    expect(result.inverse).toEqual({ type: 'RemoveDefinition', definitionId: 'definition-extra' });
    roundTrip(nested, { type: 'AddDefinition', index: 2, definition: EXTRA });
    const added = result.document;
    const removed = applyCommand(added, {
      type: 'RemoveDefinition',
      definitionId: 'definition-extra',
    });
    expect(json(removed.document)).toBe(json(nested));
    roundTrip(added, { type: 'RemoveDefinition', definitionId: 'definition-extra' });
  });

  it('refuses an index past the end, a taken ID, and a definition the document cannot hold', () => {
    expect(
      codeOf(() => applyCommand(nested, { type: 'AddDefinition', index: 3, definition: EXTRA })),
    ).toBe('index-out-of-range');
    expect(
      errorOf(() =>
        applyCommand(nested, {
          type: 'AddDefinition',
          index: 0,
          definition: { ...EXTRA, id: 'card' },
        }),
      ).code,
    ).toBe('id-in-use');
    expect(
      codeOf(() =>
        applyCommand(nested, {
          type: 'AddDefinition',
          index: 0,
          definition: { ...EXTRA, width: 0 },
        }),
      ),
    ).toBe('invalid-result');
  });

  it('refuses to remove a definition an instance places, naming the instances', () => {
    const error = errorOf(() =>
      applyCommand(nested, { type: 'RemoveDefinition', definitionId: 'badge' }),
    );
    expect(error.code).toBe('definition-in-use');
    expect(error.details).toEqual(['badge-solo', 'card-badge']);
    expect(
      codeOf(() => applyCommand(nested, { type: 'RemoveDefinition', definitionId: 'none' })),
    ).toBe('unknown-definition');
  });
});

describe('ConvertToDefinition and ExpandInstance (D76)', () => {
  it('converts a node of a scene into a definition of the canvas and an instance that shows it', () => {
    const document = reference();
    const command: Command = {
      type: 'ConvertToDefinition',
      fromNodeId: 'node-group',
      toNodeId: 'node-group',
      definitionId: 'definition-group',
      instanceId: 'node-group-instance',
      index: 0,
    };
    const result = applyCommand(document, command);
    expect(scenesOf(result.document)[0]?.nodes.map(({ id }) => id)).toEqual([
      'node-background',
      'node-group-instance',
      'node-title',
      'node-custom-html',
    ]);
    const group = scenesOf(document)[0]?.nodes[1];
    expect(definitionsOf(result.document)).toEqual([
      {
        id: 'definition-group',
        width: 1080,
        height: 1920,
        durationUs: 10_000_000,
        nodes: [group],
        clips: [],
        transitions: [],
      },
    ]);
    expect(scenesOf(result.document)[0]?.nodes[1]).toEqual({
      id: 'node-group-instance',
      type: 'instance',
      startUs: 0,
      durationUs: 10_000_000,
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      origin: { x: 0, y: 0 },
      opacity: 1,
      animations: [],
      definitionId: 'definition-group',
      sourceStartUs: 0,
      width: 1080,
      height: 1920,
      fit: 'fill',
      effects: [],
      mask: { kind: 'none' },
      matte: { kind: 'none' },
      blendMode: 'normal',
    });
    expect(result.createdIds).toEqual(['definition-group', 'node-group-instance']);
    expect(result.inverse).toEqual({ type: 'ExpandInstance', instanceId: 'node-group-instance' });
    roundTrip(document, command);
    // And the expansion is undone by the conversion it reverses.
    const expanded = applyCommand(result.document, {
      type: 'ExpandInstance',
      instanceId: 'node-group-instance',
    });
    expect(json(expanded.document)).toBe(json(document));
    expect(expanded.inverse).toEqual(command);
  });

  it('converts a run of instances of a scene and a run of nodes inside a definition', () => {
    const scene = roundTrip(nested, {
      type: 'ConvertToDefinition',
      fromNodeId: 'card-left',
      toNodeId: 'card-small',
      definitionId: 'cards',
      instanceId: 'cards-instance',
      index: 2,
    });
    expect(scenesOf(scene)[0]?.nodes.map(({ id }) => id)).toEqual([
      'node-background',
      'cards-instance',
      'badge-solo',
    ]);
    expect(definition(scene, 'cards')).toMatchObject({ width: 640, height: 360 });
    const inside = roundTrip(nested, {
      type: 'ConvertToDefinition',
      fromNodeId: 'card-photo',
      toNodeId: 'card-title',
      definitionId: 'card-face',
      instanceId: 'card-face-instance',
      index: 0,
    });
    expect(definition(inside, 'card').nodes.map(({ id }) => id)).toEqual([
      'card-background',
      'card-face-instance',
      'card-bar-a',
      'card-bar-b',
      'card-badge',
    ]);
    expect(definition(inside, 'card-face')).toMatchObject({
      width: 320,
      height: 180,
      durationUs: 1_500_000,
    });
    roundTrip(inside, { type: 'ExpandInstance', instanceId: 'card-face-instance' });
  });

  it('refuses a child of a group, a run that is no run, and nodes a definition cannot hold', () => {
    const document = reference();
    const convert = (fromNodeId: string, toNodeId: string): string =>
      codeOf(() =>
        applyCommand(document, {
          type: 'ConvertToDefinition',
          fromNodeId,
          toNodeId,
          definitionId: 'definition-new',
          instanceId: 'instance-new',
          index: 0,
        }),
      );
    expect(convert('node-image', 'node-image')).toBe('unsupported-node');
    expect(convert('node-title', 'node-group')).toBe('unsupported-node');
    expect(convert('node-group', 'node-image')).toBe('unsupported-node');
    expect(convert('node-none', 'node-group')).toBe('unknown-node');
    expect(convert('node-title', 'node-custom-html')).toBe('invalid-result');
    expect(convert('node-title', 'node-title')).toBe('did not throw');
  });

  it('refuses a transition that would join a moved and a staying node', () => {
    expect(
      codeOf(() =>
        applyCommand(nested, {
          type: 'ConvertToDefinition',
          fromNodeId: 'card-bar-b',
          toNodeId: 'card-badge',
          definitionId: 'definition-new',
          instanceId: 'instance-new',
          index: 0,
        }),
      ),
    ).toBe('transition-in-use');
  });

  it('expands only an instance that shows its definition as its nodes placed directly', () => {
    expect(
      codeOf(() => applyCommand(nested, { type: 'ExpandInstance', instanceId: 'card-left' })),
    ).toBe('instance-not-expandable');
    expect(
      codeOf(() => applyCommand(nested, { type: 'ExpandInstance', instanceId: 'node-background' })),
    ).toBe('unsupported-node');
    expect(codeOf(() => applyCommand(nested, { type: 'ExpandInstance', instanceId: 'none' }))).toBe(
      'unknown-node',
    );
    const converted = applyCommand(reference(), {
      type: 'ConvertToDefinition',
      fromNodeId: 'node-title',
      toNodeId: 'node-title',
      definitionId: 'definition-title',
      instanceId: 'title-instance',
      index: 0,
    }).document;
    const instance = scenesOf(converted)[0]?.nodes[2];
    const twice = applyCommand(converted, {
      type: 'AddNode',
      parentId: 'scene-main',
      index: 3,
      node: { ...instance, id: 'title-instance-2' },
    }).document;
    const error = errorOf(() =>
      applyCommand(twice, { type: 'ExpandInstance', instanceId: 'title-instance' }),
    );
    expect(error.code).toBe('instance-not-expandable');
    expect(error.details).toEqual(['title-instance-2']);
    const moved = applyCommand(converted, {
      type: 'SetNodeOpacity',
      nodeId: 'title-instance',
      opacity: 0.5,
    }).document;
    expect(
      codeOf(() => applyCommand(moved, { type: 'ExpandInstance', instanceId: 'title-instance' })),
    ).toBe('instance-not-expandable');
  });
});

describe('describeDocument and definitions (D76)', () => {
  it('lists each definition with its nodes, clips, transitions, and the instances that place it', () => {
    const { definitions } = describeDocument(nested);
    expect(
      definitions.map(({ id, width, height, durationUs, instanceIds }) => ({
        id,
        width,
        height,
        durationUs,
        instanceIds,
      })),
    ).toEqual([
      {
        id: 'card',
        width: 320,
        height: 180,
        durationUs: 1_500_000,
        instanceIds: ['card-left', 'card-right', 'card-small'],
      },
      {
        id: 'badge',
        width: 80,
        height: 80,
        durationUs: 1_000_000,
        instanceIds: ['badge-solo', 'card-badge'],
      },
    ]);
    const [card] = definitions;
    expect(card?.nodes.map(({ id, parentId, layer }) => [id, parentId, layer])[2]).toEqual([
      'card-title',
      'card',
      2,
    ]);
    expect(card?.clips).toHaveLength(1);
    expect(card?.transitions).toHaveLength(1);
  });
});

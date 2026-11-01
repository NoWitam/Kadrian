/**
 * The commands of audio (D52.6): clips added, removed, and edited, and the
 * volume of a video's sound. Each edit is undone by its inverse to the exact
 * text of the document before it; a value the clip has already is no edit.
 */
import type { ValidatedComposition } from '@kadrion/schema';
import { describe, expect, it } from 'vitest';

import { applyCommand, createCommandBus, type Command } from '../src/index.js';

import { codeOf, errorOf, everyType, json, reference } from './support.js';

const VOICE = Object.freeze({
  id: 'clip-voice',
  type: 'audio',
  assetId: 'asset-audio',
  startUs: 2_000_000,
  durationUs: 3_000_000,
  sourceStartUs: 500_000,
  volume: 0.8,
  fadeInUs: 250_000,
  fadeOutUs: 1_000_000,
});

function clipsOf(document: unknown): Record<string, unknown>[] {
  return (document as { clips: Record<string, unknown>[] }).clips;
}

/** Applies a command and its inverse, and returns the edited document. */
function roundTrip(document: ValidatedComposition, command: Command): unknown {
  const result = applyCommand(document, command);
  expect(result.inverse).not.toBeNull();
  const restored = applyCommand(result.document, result.inverse as Command).document;
  expect(json(restored)).toBe(json(document));
  return result.document;
}

describe('AddAudioClip and RemoveAudioClip (D52.6)', () => {
  it('inserts a complete clip at its index and creates its ID; the inverse removes it', () => {
    const result = applyCommand(reference(), { type: 'AddAudioClip', index: 0, clip: VOICE });
    expect(clipsOf(result.document).map((clip) => clip['id'])).toEqual([
      'clip-voice',
      'clip-audio',
    ]);
    expect(result.createdIds).toEqual(['clip-voice']);
    expect(result.inverse).toEqual({ type: 'RemoveAudioClip', clipId: 'clip-voice' });
    roundTrip(reference(), { type: 'AddAudioClip', index: 1, clip: VOICE });
  });

  it('copies the clip, so the caller cannot reach the history through its object', () => {
    const clip = structuredClone(VOICE) as Record<string, unknown>;
    const bus = createCommandBus(reference());
    bus.dispatch({ type: 'AddAudioClip', index: 1, clip });
    clip['volume'] = 0.1;
    expect(clipsOf(bus.getDocument())[1]?.['volume']).toBe(0.8);
    expect(Object.isFrozen(clip)).toBe(false);
  });

  it('removes a clip, and its inverse restores the same clip at the same index', () => {
    const added = applyCommand(reference(), { type: 'AddAudioClip', index: 1, clip: VOICE });
    const result = applyCommand(added.document, { type: 'RemoveAudioClip', clipId: 'clip-audio' });
    expect(clipsOf(result.document).map((clip) => clip['id'])).toEqual(['clip-voice']);
    expect(result.inverse).toEqual({
      type: 'AddAudioClip',
      index: 0,
      clip: clipsOf(reference())[0],
    });
    roundTrip(added.document, { type: 'RemoveAudioClip', clipId: 'clip-audio' });
  });

  it('refuses an index past the clips, a taken ID, and a clip the document cannot hold', () => {
    expect(
      codeOf(() => applyCommand(reference(), { type: 'AddAudioClip', index: 2, clip: VOICE })),
    ).toBe('index-out-of-range');
    const taken = errorOf(() =>
      applyCommand(reference(), {
        type: 'AddAudioClip',
        index: 0,
        clip: { ...VOICE, id: 'node-title' },
      }),
    );
    expect([taken.code, taken.details]).toEqual(['id-in-use', ['node-title']]);
    for (const clip of [
      { ...VOICE, fadeInUs: 2_000_000, fadeOutUs: 1_000_001 },
      { ...VOICE, assetId: 'asset-font' },
      { ...VOICE, volume: 2 },
      { ...VOICE, muted: true },
    ]) {
      expect(
        codeOf(() => applyCommand(reference(), { type: 'AddAudioClip', index: 0, clip })),
      ).toBe('invalid-result');
    }
    expect(
      codeOf(() =>
        applyCommand(reference(), { type: 'AddAudioClip', index: 0, clip: 'clip' } as never),
      ),
    ).toBe('invalid-argument');
  });

  it('refuses to remove a clip the document does not have', () => {
    expect(
      codeOf(() => applyCommand(reference(), { type: 'RemoveAudioClip', clipId: 'node-title' })),
    ).toBe('unknown-clip');
  });
});

describe('SetClipVolume, SetClipFades, and SetClipSource (D52.6)', () => {
  it('sets each field, keeps the keys in their places, and undoes to the exact text', () => {
    const volume = roundTrip(reference(), {
      type: 'SetClipVolume',
      clipId: 'clip-audio',
      volume: 0.5,
    });
    expect(clipsOf(volume)[0]?.['volume']).toBe(0.5);
    const fades = roundTrip(reference(), {
      type: 'SetClipFades',
      clipId: 'clip-audio',
      fadeInUs: 500_000,
      fadeOutUs: 2_000_000,
    });
    expect(Object.keys(clipsOf(fades)[0] ?? {})).toEqual(Object.keys(VOICE));
    expect(clipsOf(fades)[0]).toMatchObject({ fadeInUs: 500_000, fadeOutUs: 2_000_000 });
    const source = roundTrip(reference(), {
      type: 'SetClipSource',
      clipId: 'clip-audio',
      assetId: 'asset-audio',
      sourceStartUs: 1_000_000,
    });
    expect(clipsOf(source)[0]).toMatchObject({ assetId: 'asset-audio', sourceStartUs: 1_000_000 });
  });

  it('writes the inverse from the clip it edited', () => {
    expect(
      applyCommand(reference(), { type: 'SetClipVolume', clipId: 'clip-audio', volume: 0 }).inverse,
    ).toEqual({ type: 'SetClipVolume', clipId: 'clip-audio', volume: 1 });
    expect(
      applyCommand(reference(), {
        type: 'SetClipFades',
        clipId: 'clip-audio',
        fadeInUs: 1,
        fadeOutUs: 0,
      }).inverse,
    ).toEqual({ type: 'SetClipFades', clipId: 'clip-audio', fadeInUs: 0, fadeOutUs: 0 });
  });

  it.each<Command>([
    { type: 'SetClipVolume', clipId: 'clip-audio', volume: 1 },
    { type: 'SetClipFades', clipId: 'clip-audio', fadeInUs: 0, fadeOutUs: 0 },
    { type: 'SetClipSource', clipId: 'clip-audio', assetId: 'asset-audio', sourceStartUs: 0 },
  ])('changes nothing for the values the clip has: $type', (command) => {
    const document = reference();
    const result = applyCommand(document, command);
    expect(result.document).toBe(document);
    expect(result.inverse).toBeNull();
  });

  it('refuses fades that together exceed the clip, with the rule of the document', () => {
    const error = errorOf(() =>
      applyCommand(reference(), {
        type: 'SetClipFades',
        clipId: 'clip-audio',
        fadeInUs: 5_000_000,
        fadeOutUs: 5_000_001,
      }),
    );
    expect(error.code).toBe('invalid-result');
    expect(error.details.join('\n')).toContain('/clips/0/fadeOutUs');
    // Exactly the duration is allowed.
    expect(
      applyCommand(reference(), {
        type: 'SetClipFades',
        clipId: 'clip-audio',
        fadeInUs: 5_000_000,
        fadeOutUs: 5_000_000,
      }).inverse,
    ).not.toBeNull();
  });

  it('refuses an unknown clip, an unknown asset, and an asset that is not audio', () => {
    expect(
      codeOf(() =>
        applyCommand(reference(), { type: 'SetClipVolume', clipId: 'clip-none', volume: 0 }),
      ),
    ).toBe('unknown-clip');
    expect(
      codeOf(() =>
        applyCommand(reference(), {
          type: 'SetClipSource',
          clipId: 'clip-audio',
          assetId: 'asset-none',
          sourceStartUs: 0,
        }),
      ),
    ).toBe('unknown-asset');
    expect(
      codeOf(() =>
        applyCommand(reference(), {
          type: 'SetClipSource',
          clipId: 'clip-audio',
          assetId: 'asset-font',
          sourceStartUs: 0,
        }),
      ),
    ).toBe('asset-type-mismatch');
  });

  it.each([
    { type: 'SetClipVolume', clipId: 'clip-audio', volume: 1.5 },
    { type: 'SetClipVolume', clipId: 'clip-audio', volume: -0.1 },
    { type: 'SetClipVolume', clipId: 'clip-audio', volume: Number.NaN },
    { type: 'SetClipFades', clipId: 'clip-audio', fadeInUs: 0.5, fadeOutUs: 0 },
    { type: 'SetClipFades', clipId: 'clip-audio', fadeInUs: 0, fadeOutUs: -1 },
    { type: 'SetClipSource', clipId: 'clip-audio', assetId: 'asset-audio', sourceStartUs: -1 },
    { type: 'SetClipSource', clipId: '', assetId: 'asset-audio', sourceStartUs: 0 },
    { type: 'SetVideoVolume', nodeId: 'node-video', volume: 2 },
  ])('refuses arguments outside the bounds of the schema: %o', (command) => {
    expect(codeOf(() => applyCommand(everyType(), command as never))).toBe('invalid-argument');
  });

  it('turns -0 into 0, so a no-op stays a no-op', () => {
    const document = reference();
    const result = applyCommand(document, {
      type: 'SetClipFades',
      clipId: 'clip-audio',
      fadeInUs: -0,
      fadeOutUs: -0,
    });
    expect(result.document).toBe(document);
  });
});

describe('SetVideoVolume (D52.6)', () => {
  it('sets the volume of a video, and its inverse restores it', () => {
    const edited = roundTrip(everyType(), {
      type: 'SetVideoVolume',
      nodeId: 'node-video',
      volume: 0.75,
    });
    const video = (
      edited as { scenes: { nodes: Record<string, unknown>[] }[] }
    ).scenes[0]?.nodes.find((node) => node['id'] === 'node-video');
    expect(video?.['volume']).toBe(0.75);
  });

  it('changes nothing for the volume the video has, and refuses a node that is not a video', () => {
    const document = everyType();
    expect(
      applyCommand(document, { type: 'SetVideoVolume', nodeId: 'node-video', volume: 0 }).document,
    ).toBe(document);
    expect(
      codeOf(() =>
        applyCommand(document, { type: 'SetVideoVolume', nodeId: 'node-image', volume: 1 }),
      ),
    ).toBe('unsupported-node');
    expect(
      codeOf(() =>
        applyCommand(document, { type: 'SetVideoVolume', nodeId: 'node-none', volume: 1 }),
      ),
    ).toBe('unknown-node');
  });
});

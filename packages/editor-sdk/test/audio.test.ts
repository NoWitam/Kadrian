/**
 * The commands of audio (D52.6): clips added, removed, and edited, and the
 * volume of a video's sound. Each edit is undone by its inverse to the exact
 * text of the document before it; a value the clip has already is no edit.
 */
import type { ValidatedComposition } from '@kadrion/schema';
import { describe, expect, it } from 'vitest';

import {
  applyCommand as applyWithFacts,
  createCommandBus,
  type Command,
  type CommandResult,
  type MediaFacts,
} from '../src/index.js';

import { codeOf, errorOf, everyType, json, reference, VIDEO_ASSET } from './support.js';

const AUDIO_HASH = (reference().assets.find(({ type }) => type === 'audio') ?? { contentHash: '' })
  .contentHash;

/** The facts of this file's host: the reference sound lasts 20 s, the video and its sound 1 s (D53). */
function mediaFacts(contentHash: string): MediaFacts | null {
  if (contentHash === AUDIO_HASH) return { type: 'audio', durationUs: 20_000_000 };
  if (contentHash === VIDEO_ASSET.contentHash) {
    return { type: 'video', durationUs: 1_000_000, audioDurationUs: 1_000_000 };
  }
  return null;
}

/** `applyCommand` with the facts of this file's host. */
function applyCommand(document: ValidatedComposition, command: Command): CommandResult {
  return applyWithFacts(document, command, { mediaFacts });
}

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
    const bus = createCommandBus(reference(), { mediaFacts });
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

describe('the source ranges a sound hears, against the facts of the host (D49.6, D53)', () => {
  const longer = { type: 'SetClipSource', clipId: 'clip-audio', assetId: 'asset-audio' } as const;

  it('refuses a clip that would hear past the end of its sound, and names it', () => {
    const error = errorOf(() =>
      applyCommand(reference(), { ...longer, sourceStartUs: 10_000_001 }),
    );
    expect([error.code, error.details]).toEqual([
      'source-range-exceeded',
      ['clip-audio: hears 10000001 to 20000001 µs of a sound of 20000000 µs'],
    ]);
    expect(
      applyCommand(reference(), { ...longer, sourceStartUs: 10_000_000 }).inverse,
    ).not.toBeNull();
  });

  it('refuses a new sound without facts, and lets a clip read less than before', () => {
    const none = { mediaFacts: () => null };
    expect(
      errorOf(() => applyWithFacts(reference(), { ...longer, sourceStartUs: 1 }, none)),
    ).toMatchObject({ code: 'media-facts-missing', details: ['clip-audio'] });
    expect(
      codeOf(() => applyWithFacts(reference(), { type: 'AddAudioClip', index: 0, clip: VOICE })),
    ).toBe('media-facts-missing');
    // Silent, it reads nothing; quieter or with fades, it reads what it read before.
    for (const command of [
      { type: 'SetClipVolume', clipId: 'clip-audio', volume: 0 },
      { type: 'SetClipVolume', clipId: 'clip-audio', volume: 0.5 },
      { type: 'SetClipFades', clipId: 'clip-audio', fadeInUs: 1, fadeOutUs: 1 },
      { type: 'AddAudioClip', index: 0, clip: { ...VOICE, volume: 0 } },
    ] as const) {
      expect(applyWithFacts(reference(), command, none).inverse).not.toBeNull();
    }
  });

  it('checks the sound of a video once it is heard, and refuses a video without sound', () => {
    const louder = { type: 'SetVideoVolume', nodeId: 'node-video', volume: 1 } as const;
    expect(codeOf(() => applyWithFacts(everyType(), louder, { mediaFacts: () => null }))).toBe(
      'media-facts-missing',
    );
    const silent = (): MediaFacts => ({
      type: 'video',
      durationUs: 1_000_000,
      audioDurationUs: null,
    });
    expect(
      errorOf(() => applyWithFacts(everyType(), louder, { mediaFacts: silent })),
    ).toMatchObject({
      code: 'source-range-exceeded',
      details: ['node-video: hears 0 to 1000000 µs of a source with no sound'],
    });
    const unread = (): MediaFacts => ({ type: 'video', durationUs: 1_000_000 });
    expect(codeOf(() => applyWithFacts(everyType(), louder, { mediaFacts: unread }))).toBe(
      'media-facts-missing',
    );
    const short = (): MediaFacts => ({
      type: 'video',
      durationUs: 1_000_000,
      audioDurationUs: 999_999,
    });
    expect(codeOf(() => applyWithFacts(everyType(), louder, { mediaFacts: short }))).toBe(
      'source-range-exceeded',
    );
  });
});

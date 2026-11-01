/**
 * The timeline commands (D55): a clip — a node or an audio clip — moved,
 * trimmed at either edge, split, and joined again. Each edit is undone by its
 * inverse to the exact text of the document before it, a split followed by its
 * inverse is the identity, and every refusal has a case that passes only with
 * its guard.
 */
import type { ValidatedComposition } from '@kadrion/schema';
import { referenceComposition, scenesComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  applyCommand as applyWithFacts,
  type Command,
  type CommandResult,
  type MediaFacts,
} from '../src/index.js';

import { codeOf, errorOf, json, validated, VIDEO_ASSET, VIDEO_NODE } from './support.js';

const sequence = validated(scenesComposition);
const reference = validated(referenceComposition);
const AUDIO_HASH = sequence.assets.find(({ type }) => type === 'audio')?.contentHash ?? '';

/** The sound of the fixtures lasts 5 s; the video of `withVideo` 3 s, with a sound of 3 s. */
function mediaFacts(contentHash: string): MediaFacts | null {
  if (contentHash === AUDIO_HASH) return { type: 'audio', durationUs: 5_000_000 };
  if (contentHash === VIDEO_ASSET.contentHash) {
    return { type: 'video', durationUs: 3_000_000, audioDurationUs: 3_000_000 };
  }
  return null;
}

function applyCommand(document: ValidatedComposition, command: Command): CommandResult {
  return applyWithFacts(document, command, { mediaFacts });
}

/** Applies a command and its inverse, checks the restored text, and returns the result. */
function roundTrip(document: ValidatedComposition, command: Command): CommandResult {
  const result = applyCommand(document, command);
  expect(result.inverse).not.toBeNull();
  const restored = applyCommand(result.document, result.inverse as Command).document;
  expect(json(restored)).toBe(json(document));
  return result;
}

type Json = Record<string, unknown>;

/** Every list of the document that holds clips: the scenes' nodes, groups' children, and clips. */
function lists(document: unknown): Json[][] {
  const root = document as { clips: Json[]; scenes: { nodes: Json[]; clips: Json[] }[] };
  return [
    root.clips,
    ...root.scenes.flatMap((scene) => [
      scene.nodes,
      scene.clips,
      ...scene.nodes.flatMap((node) =>
        Array.isArray(node['children']) ? [node['children'] as Json[]] : [],
      ),
    ]),
  ];
}

/** The clip with that ID. */
function clipOf(document: unknown, id: string): Json {
  for (const list of lists(document)) {
    const found = list.find((item) => item['id'] === id);
    if (found !== undefined) return found;
  }
  throw new Error(`No clip ${id}.`);
}

/** The IDs of the list that holds the clip, in order. */
function siblingsOf(document: unknown, id: string): string[] {
  const list = lists(document).find((items) => items.some((item) => item['id'] === id));
  if (list === undefined) throw new Error(`No clip ${id}.`);
  return list.map((item) => String(item['id']));
}

function keyframeTimes(clip: Json): number[][] {
  return (clip['animations'] as { keyframes: { timeUs: number }[] }[]).map(({ keyframes }) =>
    keyframes.map(({ timeUs }) => timeUs),
  );
}

/** The fixture with a video in the middle scene, at scene time 0 for 1 s, from source 0.5 s. */
function withVideo(volume: number): ValidatedComposition {
  const draft = structuredClone(scenesComposition) as {
    assets: unknown[];
    scenes: { nodes: unknown[] }[];
  };
  draft.assets.push(structuredClone(VIDEO_ASSET));
  draft.scenes[1]?.nodes.push({
    ...structuredClone(VIDEO_NODE),
    sourceStartUs: 500_000,
    volume,
  });
  return validated(draft);
}

describe('MoveClip (D55.2, D55.3)', () => {
  it('moves a node with its keyframes and undoes to the same text', () => {
    const result = roundTrip(sequence, {
      type: 'MoveClip',
      clipId: 'intro-title',
      startUs: 250_000,
    });
    const moved = clipOf(result.document, 'intro-title');
    expect(moved['startUs']).toBe(250_000);
    expect(moved['durationUs']).toBe(1_000_000);
    expect(keyframeTimes(moved)).toEqual([[250_000, 1_250_000]]);
    expect(result.inverse).toEqual({ type: 'MoveClip', clipId: 'intro-title', startUs: 0 });
    expect(result.createdIds).toEqual([]);
  });

  it("moves a group with its children's lifetimes and keyframes", () => {
    const result = roundTrip(reference, {
      type: 'MoveClip',
      clipId: 'node-group',
      startUs: 500_000,
    });
    const group = clipOf(result.document, 'node-group');
    expect(group['startUs']).toBe(500_000);
    expect(keyframeTimes(group)).toEqual([[500_000, 8_000_000]]);
    const image = clipOf(result.document, 'node-image');
    expect(image['startUs']).toBe(500_000);
    expect(keyframeTimes(image)).toEqual(
      keyframeTimes(clipOf(reference, 'node-image')).map((times) =>
        times.map((time) => time + 500_000),
      ),
    );
    expect(clipOf(result.document, 'node-caption')['startUs']).toBe(500_000);
  });

  it('moves a child of a group alone', () => {
    const result = roundTrip(reference, { type: 'MoveClip', clipId: 'node-caption', startUs: 1 });
    expect(clipOf(result.document, 'node-caption')['startUs']).toBe(1);
    expect(clipOf(result.document, 'node-group')['startUs']).toBe(0);
  });

  it('moves an audio clip of a scene and of the composition, keeping source and fades', () => {
    const voice = roundTrip(sequence, { type: 'MoveClip', clipId: 'middle-voice', startUs: 0 });
    expect(clipOf(voice.document, 'middle-voice')).toEqual({
      ...clipOf(sequence, 'middle-voice'),
      startUs: 0,
    });
    const music = roundTrip(sequence, {
      type: 'MoveClip',
      clipId: 'clip-music',
      startUs: 1_000_000,
    });
    expect(clipOf(music.document, 'clip-music')['sourceStartUs']).toBe(0);
  });

  it('changes nothing for the start the clip has', () => {
    const result = applyCommand(sequence, { type: 'MoveClip', clipId: 'intro-title', startUs: 0 });
    expect(result.inverse).toBeNull();
    expect(result.document).toBe(sequence);
  });

  it('refuses an unknown clip and a keyframe moved below 0', () => {
    expect(
      errorOf(() => applyCommand(sequence, { type: 'MoveClip', clipId: 'nothing', startUs: 0 }))
        .code,
    ).toBe('unknown-clip');
    // The title starts after its first keyframe, so moving it to 0 moves that keyframe below 0.
    const late = applyCommand(sequence, {
      type: 'SetNodeLifetime',
      nodeId: 'intro-title',
      startUs: 500_000,
      durationUs: 500_000,
    }).document;
    expect(
      codeOf(() => applyCommand(late, { type: 'MoveClip', clipId: 'intro-title', startUs: 0 })),
    ).toBe('invalid-result');
  });

  it('checks a video that would sample further against the facts', () => {
    const video = withVideo(0);
    // Moved later, the video is cut at the scene's end and samples less: it fits.
    roundTrip(video, { type: 'MoveClip', clipId: 'node-video', startUs: 1_000_000 });
    expect(
      codeOf(() =>
        applyWithFacts(video, { type: 'MoveClip', clipId: 'node-video', startUs: 1_000_000 }),
      ),
    ).toBe('media-facts-missing');
  });

  it('refuses an argument out of bounds', () => {
    expect(
      codeOf(() =>
        applyCommand(sequence, { type: 'MoveClip', clipId: 'intro-title', startUs: -1 }),
      ),
    ).toBe('invalid-argument');
    expect(
      codeOf(() =>
        applyCommand(sequence, { type: 'MoveClip', clipId: 'intro-title', startUs: 0.5 }),
      ),
    ).toBe('invalid-argument');
  });
});

describe('TrimClipStart (D49.1, D55.2)', () => {
  it('moves the start of a node, keeps its end, and moves no keyframe', () => {
    const result = roundTrip(sequence, {
      type: 'TrimClipStart',
      clipId: 'intro-title',
      startUs: 300_000,
    });
    const trimmed = clipOf(result.document, 'intro-title');
    expect([trimmed['startUs'], trimmed['durationUs']]).toEqual([300_000, 700_000]);
    expect(keyframeTimes(trimmed)).toEqual([[0, 1_000_000]]);
    expect(Object.keys(trimmed)).toEqual(Object.keys(clipOf(sequence, 'intro-title')));
    expect(result.inverse).toEqual({ type: 'TrimClipStart', clipId: 'intro-title', startUs: 0 });
  });

  it('moves the source of a video and of an audio clip by the same amount, keeping the fades', () => {
    const video = roundTrip(withVideo(0), {
      type: 'TrimClipStart',
      clipId: 'node-video',
      startUs: 200_000,
    });
    const node = clipOf(video.document, 'node-video');
    expect([node['startUs'], node['durationUs'], node['sourceStartUs']]).toEqual([
      200_000, 800_000, 700_000,
    ]);
    // Earlier: the start and the source move back.
    const voice = roundTrip(sequence, {
      type: 'TrimClipStart',
      clipId: 'middle-voice',
      startUs: 50_000,
    });
    expect(clipOf(voice.document, 'middle-voice')).toEqual({
      ...clipOf(sequence, 'middle-voice'),
      startUs: 50_000,
      durationUs: 1_200_000,
      sourceStartUs: 800_000,
    });
  });

  it('refuses a source that would start before its first instant, before reading facts', () => {
    const error = errorOf(() =>
      applyWithFacts(sequence, { type: 'TrimClipStart', clipId: 'middle-voice', startUs: 0 }),
    );
    expect(error.code).toBe('media-facts-missing');
    // From 0.5 s before the start of a source at 0 s, there is no source.
    const atZero = applyCommand(sequence, {
      type: 'SetClipSource',
      clipId: 'middle-voice',
      assetId: 'asset-audio',
      sourceStartUs: 100_000,
    }).document;
    const refused = errorOf(() =>
      applyWithFacts(atZero, { type: 'TrimClipStart', clipId: 'middle-voice', startUs: 0 }),
    );
    expect(refused.code).toBe('source-range-exceeded');
    expect(refused.details).toEqual(['middle-voice: would start 150000 µs before its source']);
    // Exactly at the source's first instant is allowed.
    roundTrip(atZero, { type: 'TrimClipStart', clipId: 'middle-voice', startUs: 150_000 });
  });

  it('refuses a start at or after the end', () => {
    expect(
      codeOf(() =>
        applyCommand(sequence, {
          type: 'TrimClipStart',
          clipId: 'intro-title',
          startUs: 1_000_000,
        }),
      ),
    ).toBe('time-outside-clip');
    roundTrip(sequence, { type: 'TrimClipStart', clipId: 'intro-title', startUs: 999_999 });
  });

  it('refuses a trim that leaves less than both fades', () => {
    expect(
      codeOf(() =>
        applyCommand(sequence, {
          type: 'TrimClipStart',
          clipId: 'middle-voice',
          startUs: 1_000_000,
        }),
      ),
    ).toBe('invalid-result');
  });

  it('changes nothing for the start the clip has', () => {
    const result = applyCommand(sequence, {
      type: 'TrimClipStart',
      clipId: 'intro-title',
      startUs: 0,
    });
    expect(result.inverse).toBeNull();
  });
});

describe('TrimClipEnd (D49.1, D55.2)', () => {
  it('moves the end of a node and keeps its start and keyframes', () => {
    const result = roundTrip(sequence, {
      type: 'TrimClipEnd',
      clipId: 'intro-title',
      endUs: 600_000,
    });
    const trimmed = clipOf(result.document, 'intro-title');
    expect([trimmed['startUs'], trimmed['durationUs']]).toEqual([0, 600_000]);
    expect(keyframeTimes(trimmed)).toEqual([[0, 1_000_000]]);
    expect(result.inverse).toEqual({
      type: 'TrimClipEnd',
      clipId: 'intro-title',
      endUs: 1_000_000,
    });
  });

  it('refuses an end at or before the start', () => {
    expect(
      codeOf(() =>
        applyCommand(sequence, { type: 'TrimClipEnd', clipId: 'outro-title', endUs: 200_000 }),
      ),
    ).toBe('time-outside-clip');
    roundTrip(sequence, { type: 'TrimClipEnd', clipId: 'outro-title', endUs: 200_001 });
  });

  it('refuses a sound heard past the end of its source', () => {
    // The voice reads 4 to 5 s of a sound of 5 s; 150 000 µs longer it would read past it.
    const late = applyCommand(sequence, {
      type: 'SetClipSource',
      clipId: 'middle-voice',
      assetId: 'asset-audio',
      sourceStartUs: 4_000_000,
    }).document;
    const refused = errorOf(() =>
      applyCommand(late, { type: 'TrimClipEnd', clipId: 'middle-voice', endUs: 1_400_000 }),
    );
    expect(refused.code).toBe('source-range-exceeded');
    roundTrip(late, { type: 'TrimClipEnd', clipId: 'middle-voice', endUs: 1_100_000 });
  });

  it('refuses a trim whose old end lies past the largest time, since its inverse cannot name it', () => {
    const long = applyCommand(sequence, {
      type: 'SetNodeLifetime',
      nodeId: 'intro-title',
      startUs: 1,
      durationUs: Number.MAX_SAFE_INTEGER,
    }).document;
    expect(
      errorOf(() =>
        applyCommand(long, { type: 'TrimClipEnd', clipId: 'intro-title', endUs: 1_000_000 }),
      ).code,
    ).toBe('time-outside-clip');
  });

  it('changes nothing for the end the clip has', () => {
    const result = applyCommand(sequence, {
      type: 'TrimClipEnd',
      clipId: 'intro-title',
      endUs: 1_000_000,
    });
    expect(result.inverse).toBeNull();
  });
});

describe('SplitClip and JoinClips (D55.4, D55.5)', () => {
  it('splits a node into two halves that meet, copying its animations, and joins them back', () => {
    const result = roundTrip(sequence, {
      type: 'SplitClip',
      clipId: 'intro-title',
      atUs: 400_000,
      newClipId: 'intro-tail',
    });
    expect(siblingsOf(result.document, 'intro-title')).toEqual([
      'intro-background',
      'intro-title',
      'intro-tail',
    ]);
    const first = clipOf(result.document, 'intro-title');
    const second = clipOf(result.document, 'intro-tail');
    const original = clipOf(sequence, 'intro-title');
    expect(first).toEqual({ ...original, durationUs: 400_000 });
    const animations = original['animations'] as Json[];
    expect(second).toEqual({
      ...original,
      id: 'intro-tail',
      startUs: 400_000,
      durationUs: 600_000,
      animations: animations.map((animation) => ({
        ...animation,
        id: 'intro-tail-a-position',
      })),
    });
    expect(Object.keys(second)).toEqual(Object.keys(original));
    expect(result.createdIds).toEqual(['intro-tail', 'intro-tail-a-position']);
    expect(result.inverse).toEqual({
      type: 'JoinClips',
      clipId: 'intro-title',
      nextClipId: 'intro-tail',
    });
    // The join's own inverse is the split again.
    const join = applyCommand(result.document, result.inverse as Command);
    expect(join.inverse).toEqual({
      type: 'SplitClip',
      clipId: 'intro-title',
      atUs: 400_000,
      newClipId: 'intro-tail',
    });
    expect(json(applyCommand(join.document, join.inverse as Command).document)).toBe(
      json(result.document),
    );
  });

  it('splits a child of a group inside the group, and refuses a group', () => {
    const result = roundTrip(reference, {
      type: 'SplitClip',
      clipId: 'node-image',
      atUs: 5_000_000,
      newClipId: 'image-tail',
    });
    expect(siblingsOf(result.document, 'node-image')).toEqual([
      'node-image',
      'image-tail',
      'node-caption',
    ]);
    expect(
      errorOf(() =>
        applyCommand(reference, {
          type: 'SplitClip',
          clipId: 'node-group',
          atUs: 5_000_000,
          newClipId: 'group-tail',
        }),
      ).code,
    ).toBe('unsupported-node');
  });

  it('continues the source of a silent video in the second half, at any time', () => {
    const result = roundTrip(withVideo(0), {
      type: 'SplitClip',
      clipId: 'node-video',
      atUs: 333_333,
      newClipId: 'video-tail',
    });
    const second = clipOf(result.document, 'video-tail');
    expect([second['startUs'], second['durationUs'], second['sourceStartUs']]).toEqual([
      333_333, 666_667, 833_333,
    ]);
    expect(
      codeOf(() =>
        applyWithFacts(withVideo(0), {
          type: 'SplitClip',
          clipId: 'node-video',
          atUs: 333_333,
          newClipId: 'video-tail',
        }),
      ),
    ).toBe('media-facts-missing');
  });

  it('splits a heard clip only on the 125 µs grid from its start', () => {
    const offGrid = errorOf(() =>
      applyCommand(withVideo(1), {
        type: 'SplitClip',
        clipId: 'node-video',
        atUs: 333_333,
        newClipId: 'video-tail',
      }),
    );
    expect(offGrid.code).toBe('split-not-exact');
    expect(offGrid.message).toContain('333250 or 333375');
    roundTrip(withVideo(1), {
      type: 'SplitClip',
      clipId: 'node-video',
      atUs: 333_375,
      newClipId: 'video-tail',
    });
    // The voice starts at 250 000 µs: 375 000 is 125 000 µs after it, 375 001 is not.
    expect(
      codeOf(() =>
        applyCommand(sequence, {
          type: 'SplitClip',
          clipId: 'middle-voice',
          atUs: 375_001,
          newClipId: 'voice-tail',
        }),
      ),
    ).toBe('split-not-exact');
  });

  it('gives the fade-in to the first half and the fade-out to the second', () => {
    const result = roundTrip(sequence, {
      type: 'SplitClip',
      clipId: 'middle-voice',
      atUs: 750_000,
      newClipId: 'voice-tail',
    });
    expect(siblingsOf(result.document, 'middle-voice')).toEqual(['middle-voice', 'voice-tail']);
    const original = clipOf(sequence, 'middle-voice');
    expect(clipOf(result.document, 'middle-voice')).toEqual({
      ...original,
      durationUs: 500_000,
      fadeOutUs: 0,
    });
    expect(clipOf(result.document, 'voice-tail')).toEqual({
      ...original,
      id: 'voice-tail',
      startUs: 750_000,
      durationUs: 500_000,
      sourceStartUs: 1_500_000,
      fadeInUs: 0,
    });
    expect(result.createdIds).toEqual(['voice-tail']);
  });

  it('refuses a split inside a fade, and accepts one at its edge', () => {
    // The voice fades in from 250 000 to 350 000 µs and out from 1 050 000 to 1 250 000 µs.
    for (const atUs of [250_125, 1_125_000]) {
      expect(
        codeOf(() =>
          applyCommand(sequence, {
            type: 'SplitClip',
            clipId: 'middle-voice',
            atUs,
            newClipId: 'voice-tail',
          }),
        ),
      ).toBe('split-not-exact');
    }
    for (const atUs of [350_000, 1_050_000]) {
      roundTrip(sequence, {
        type: 'SplitClip',
        clipId: 'middle-voice',
        atUs,
        newClipId: 'voice-tail',
      });
    }
  });

  it('refuses a time not strictly inside the clip', () => {
    for (const atUs of [0, 1_000_000, 2_000_000]) {
      expect(
        codeOf(() =>
          applyCommand(sequence, {
            type: 'SplitClip',
            clipId: 'intro-title',
            atUs,
            newClipId: 'intro-tail',
          }),
        ),
      ).toBe('time-outside-clip');
    }
    roundTrip(sequence, {
      type: 'SplitClip',
      clipId: 'intro-title',
      atUs: 1,
      newClipId: 'intro-tail',
    });
    roundTrip(sequence, {
      type: 'SplitClip',
      clipId: 'intro-title',
      atUs: 999_999,
      newClipId: 'intro-tail',
    });
  });

  it('refuses IDs in use and an ID not of the document form', () => {
    const taken = errorOf(() =>
      applyCommand(sequence, {
        type: 'SplitClip',
        clipId: 'intro-title',
        atUs: 400_000,
        newClipId: 'middle-image',
      }),
    );
    expect([taken.code, taken.details]).toEqual(['id-in-use', ['middle-image']]);
    // The animation ID the copy would get is taken by the title's own.
    const derived = errorOf(() =>
      applyCommand(sequence, {
        type: 'SplitClip',
        clipId: 'intro-title',
        atUs: 400_000,
        newClipId: 'intro-title',
      }),
    );
    expect([derived.code, derived.details]).toEqual([
      'id-in-use',
      ['intro-title', 'intro-title-a-position'],
    ]);
    expect(
      codeOf(() =>
        applyCommand(sequence, {
          type: 'SplitClip',
          clipId: 'intro-title',
          atUs: 400_000,
          newClipId: 'not an id',
        }),
      ),
    ).toBe('invalid-argument');
  });

  it('joins two clips built by hand exactly as a split would have made them', () => {
    const document = applyCommand(sequence, {
      type: 'AddSceneAudioClip',
      sceneId: 'scene-outro',
      index: 0,
      clip: { ...clipOf(sequence, 'middle-voice'), id: 'a', fadeOutUs: 0, durationUs: 250_000 },
    }).document;
    const both = applyCommand(document, {
      type: 'AddSceneAudioClip',
      sceneId: 'scene-outro',
      index: 1,
      clip: {
        ...clipOf(sequence, 'middle-voice'),
        id: 'b',
        startUs: 500_000,
        durationUs: 100_000,
        sourceStartUs: 1_250_000,
        fadeInUs: 0,
        fadeOutUs: 50_000,
      },
    }).document;
    const result = roundTrip(both, { type: 'JoinClips', clipId: 'a', nextClipId: 'b' });
    expect(siblingsOf(result.document, 'a')).toEqual(['a']);
    expect(clipOf(result.document, 'a')).toMatchObject({ durationUs: 350_000, fadeOutUs: 50_000 });
  });

  function split(): ValidatedComposition {
    return applyCommand(sequence, {
      type: 'SplitClip',
      clipId: 'intro-title',
      atUs: 400_000,
      newClipId: 'intro-tail',
    }).document;
  }

  function joinCode(document: ValidatedComposition, clipId: string, nextClipId: string): string {
    return codeOf(() => applyCommand(document, { type: 'JoinClips', clipId, nextClipId }));
  }

  it('refuses clips not directly after each other in one list', () => {
    const halves = split();
    expect(joinCode(halves, 'intro-tail', 'intro-title')).toBe('clips-not-joinable');
    expect(joinCode(halves, 'intro-background', 'intro-tail')).toBe('clips-not-joinable');
    const apart = applyCommand(halves, {
      type: 'ReorderNode',
      nodeId: 'intro-tail',
      index: 0,
    }).document;
    expect(joinCode(apart, 'intro-title', 'intro-tail')).toBe('clips-not-joinable');
    // A node and an audio clip are never in one list.
    expect(joinCode(sequence, 'middle-html', 'middle-voice')).toBe('clips-not-joinable');
    expect(joinCode(sequence, 'intro-title', 'nothing')).toBe('unknown-clip');
    expect(joinCode(reference, 'node-group', 'node-title')).toBe('unsupported-node');
  });

  it('refuses a second clip that does not start where the first ends', () => {
    const moved = applyCommand(split(), {
      type: 'MoveClip',
      clipId: 'intro-tail',
      startUs: 400_001,
    }).document;
    const error = errorOf(() =>
      applyCommand(moved, { type: 'JoinClips', clipId: 'intro-title', nextClipId: 'intro-tail' }),
    );
    expect(error.code).toBe('clips-not-joinable');
    expect(error.message).toContain('does not start where `intro-title` ends');
  });

  it('refuses a second clip that differs from what a split would make', () => {
    const recoloured = applyCommand(split(), {
      type: 'SetNodeOpacity',
      nodeId: 'intro-tail',
      opacity: 0.5,
    }).document;
    expect(joinCode(recoloured, 'intro-title', 'intro-tail')).toBe('clips-not-joinable');
    const rekeyed = applyCommand(split(), {
      type: 'MoveKeyframe',
      animationId: 'intro-tail-a-position',
      timeUs: 0,
      toTimeUs: 1,
    }).document;
    expect(joinCode(rekeyed, 'intro-title', 'intro-tail')).toBe('clips-not-joinable');
    // Two silent nodes of one shape meet, but the second is not a split's: its ID is foreign to its animations.
    expect(joinCode(sequence, 'middle-background', 'middle-image')).toBe('clips-not-joinable');
  });

  it('refuses audio clips whose join could not be split again exactly', () => {
    const halves = applyCommand(sequence, {
      type: 'SplitClip',
      clipId: 'middle-voice',
      atUs: 750_000,
      newClipId: 'voice-tail',
    }).document;
    const faded = applyCommand(halves, {
      type: 'SetClipFades',
      clipId: 'middle-voice',
      fadeInUs: 100_000,
      fadeOutUs: 10_000,
    }).document;
    expect(joinCode(faded, 'middle-voice', 'voice-tail')).toBe('clips-not-joinable');
  });
});

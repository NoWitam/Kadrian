/**
 * The audio plan of schema 0.26 (D85.1, D85.3): a video's fades counted in its
 * node's lifetime, and the volume curve of every sound carried in composition
 * time. The expectations are derived by hand from D85 for the document
 * `volume-0-26` of the compatibility corpus, never from the code.
 */
import { compatibilityCorpus } from '@kadrion/test-fixtures/compatibility';
import { describe, expect, it } from 'vitest';

import {
  audioPlan,
  validateComposition,
  type AudioPlanEntry,
  type ValidatedComposition,
} from '../src/index.js';

function validated(document: unknown): ValidatedComposition {
  const result = validateComposition(document);
  if (!result.ok) throw new Error(result.errors.map(({ message }) => message).join('\n'));
  return result.composition;
}

function entryOf(entries: readonly AudioPlanEntry[], id: string): AudioPlanEntry {
  const entry = entries.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`No entry ${id}.`);
  return entry;
}

/** A node or a clip of a draft: its fields, read and changed by name. */
type Fields = Record<string, unknown> & {
  animations: { keyframes: unknown[] }[];
  children: Fields[];
};

/** The parts of the document `volume-0-26` the tests change. */
interface Draft {
  clips: Fields[];
  scenes: { nodes: Fields[]; clips: Fields[] }[];
}

/** A copy of the document `volume-0-26`, to change before it is validated. */
function draft(): Draft {
  const entry = compatibilityCorpus.find(({ id }) => id === 'volume-0-26');
  if (entry === undefined) throw new Error('No volume-0-26 in the corpus.');
  return structuredClone(entry.input) as Draft;
}

/** The item at `index` of a list of a draft, which the test knows is there. */
function at<T>(list: readonly T[] | undefined, index: number): T {
  const item = list?.[index];
  if (item === undefined) throw new Error(`No item ${String(index)}.`);
  return item;
}

const linear = { kind: 'linear' } as const;
const hold = { kind: 'hold' } as const;

describe('the volume curves of the plan (D85.3)', () => {
  const { entries } = audioPlan(validated(draft()));

  it('carries the curve of a clip of the composition as it is, after its fades', () => {
    const music = entryOf(entries, 'clip-music');
    expect(music).toEqual({
      kind: 'clip',
      id: 'clip-music',
      assetId: 'asset-audio',
      startUs: 0,
      durationUs: 2_000_000,
      sourceStartUs: 0,
      volume: 1,
      lifetimeUs: 2_000_000,
      fadeInUs: 100_000,
      fadeOutUs: 100_000,
      volumeKeys: [
        { timeUs: 0, value: 0.5, easing: hold },
        { timeUs: 1_000_000, value: 0, easing: linear },
        { timeUs: 1_500_000, value: 0.75, easing: linear },
      ],
    });
    expect(Object.keys(music).at(-1)).toBe('volumeKeys');
  });

  it("moves the curve of a scene's clip by its scene's start", () => {
    // One scene, which starts at 0: scene time is composition time.
    expect(entryOf(entries, 'clip-scene-bed').volumeKeys).toEqual([
      { timeUs: 250_000, value: 1, easing: linear },
      { timeUs: 1_000_000, value: 0.1, easing: linear },
      { timeUs: 1_750_000, value: 1, easing: linear },
    ]);
  });

  it("moves the curve of a definition's clip by its instance's offset, cut where the instance cuts it", () => {
    // The instance shows definition time 200 000 at scene time 1 000 000: definition time d is
    // heard at 800 000 + d, so the keyframes at 0 and 600 000 lie at 800 000 and 1 400 000.
    const sting = entryOf(entries, 'badge-solo/badge-sting');
    expect(sting).toMatchObject({
      startUs: 1_000_000,
      durationUs: 800_000,
      sourceStartUs: 200_000,
      lifetimeUs: 800_000,
      fadeInUs: 0,
      fadeOutUs: 0,
    });
    expect(sting.volumeKeys).toEqual([
      { timeUs: 800_000, value: 0.25, easing: linear },
      { timeUs: 1_400_000, value: 1, easing: linear },
    ]);
  });

  it('carries the fades and the curve of a video, and of a video in a group', () => {
    expect(entryOf(entries, 'node-video-full')).toMatchObject({
      kind: 'video',
      volume: 0.8,
      lifetimeUs: 2_000_000,
      fadeInUs: 200_000,
      fadeOutUs: 300_000,
      volumeKeys: [
        { timeUs: 0, value: 1, easing: linear },
        { timeUs: 800_000, value: 0.2, easing: linear },
        { timeUs: 1_200_000, value: 0.2, easing: linear },
        { timeUs: 1_500_000, value: 1, easing: linear },
      ],
    });
    expect(entryOf(entries, 'node-video-contain')).toMatchObject({
      startUs: 500_000,
      durationUs: 1_000_000,
      lifetimeUs: 1_000_000,
      fadeInUs: 100_000,
      fadeOutUs: 200_000,
      volumeKeys: [
        { timeUs: 500_000, value: 0, easing: linear },
        { timeUs: 700_000, value: 0.5, easing: hold },
        { timeUs: 1_300_000, value: 1, easing: linear },
      ],
    });
  });

  it('keeps the entry of 0.25 byte for byte for a sound without a curve: no volumeKeys', () => {
    const document = draft();
    at(document.clips, 0).animations = [];
    const music = entryOf(audioPlan(validated(document)).entries, 'clip-music');
    expect(Object.keys(music)).toEqual([
      'kind',
      'id',
      'assetId',
      'startUs',
      'durationUs',
      'sourceStartUs',
      'volume',
      'lifetimeUs',
      'fadeInUs',
      'fadeOutUs',
    ]);
  });

  it('keeps a sound whose curve is 0 everywhere, and leaves out one at volume 0', () => {
    const document = draft();
    at(at(document.clips, 0).animations, 0).keyframes = [
      { timeUs: 0, value: 0, easing: linear },
      { timeUs: 1_000_000, value: 0, easing: hold },
    ];
    at(at(document.scenes, 0).clips, 0)['volume'] = 0;
    const ids = audioPlan(validated(document)).entries.map(({ id }) => id);
    expect(ids).toContain('clip-music');
    expect(ids).not.toContain('clip-scene-bed');
  });

  it('shares no object with the document', () => {
    const composition = validated(draft());
    const music = entryOf(audioPlan(composition).entries, 'clip-music');
    const stored = composition.clips[0]?.animations[0]?.keyframes[0];
    expect(music.volumeKeys?.[0]?.easing).not.toBe(stored?.easing);
  });
});

describe('the fades of a video (D85.1)', () => {
  it('counts a fade-out in the whole lifetime where the scene cuts the node', () => {
    const document = draft();
    const video = at(at(document.scenes, 0).nodes, 1);
    // Scene time 1 500 000 to 3 500 000; the scene ends at 2 000 000.
    video['startUs'] = 1_500_000;
    video['durationUs'] = 2_000_000;
    video['fadeInUs'] = 100_000;
    video['fadeOutUs'] = 1_800_000;
    video.animations = [];
    const entry = entryOf(audioPlan(validated(document)).entries, 'node-video-full');
    expect(entry).toMatchObject({
      startUs: 1_500_000,
      durationUs: 500_000,
      lifetimeUs: 2_000_000,
      fadeInUs: 100_000,
      fadeOutUs: 1_800_000,
    });
  });

  it('hears a video from its group start with no fade-in, its fade-out in its place', () => {
    const document = draft();
    const group = at(at(document.scenes, 0).nodes, 4);
    const child = at(group.children, 0);
    // The child lives 500 000 to 1 500 000; the group from 800 000 to 1 300 000.
    group['startUs'] = 800_000;
    group['durationUs'] = 500_000;
    group.animations = [];
    child['fadeInUs'] = 400_000;
    child['fadeOutUs'] = 600_000;
    const entry = entryOf(audioPlan(validated(document)).entries, 'node-video-contain');
    expect(entry).toMatchObject({
      startUs: 800_000,
      durationUs: 500_000,
      // The rest of the lifetime from 800 000: 700 000, whose last 600 000 fade out.
      lifetimeUs: 700_000,
      fadeInUs: 0,
      fadeOutUs: 600_000,
    });
  });

  it('cuts a fade-out longer than the rest of the lifetime to that rest', () => {
    const document = draft();
    const group = at(at(document.scenes, 0).nodes, 4);
    const child = at(group.children, 0);
    group['startUs'] = 1_000_000;
    group['durationUs'] = 1_000_000;
    group.animations = [];
    child['fadeInUs'] = 0;
    child['fadeOutUs'] = 900_000;
    const entry = entryOf(audioPlan(validated(document)).entries, 'node-video-contain');
    expect(entry).toMatchObject({ startUs: 1_000_000, lifetimeUs: 500_000, fadeOutUs: 500_000 });
  });

  it('hears no frozen video and no silent one, whose fades stay stored', () => {
    const document = draft();
    const video = at(at(document.scenes, 0).nodes, 1);
    video['volume'] = 0;
    const ids = audioPlan(validated(document)).entries.map(({ id }) => id);
    expect(ids).not.toContain('node-video-full');
    expect(video['fadeInUs']).toBe(200_000);
  });
});

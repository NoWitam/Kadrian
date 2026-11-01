/**
 * The audio plan (D52.4): what is heard of a composition, from the document
 * alone. The expectations are derived by hand from the documents below.
 */
import { validateComposition, type ValidatedComposition } from '@kadrion/schema';
import { referenceComposition, videoComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { audioPlan, type AudioPlanEntry } from '../src/index.js';

function validated(input: unknown): ValidatedComposition {
  const result = validateComposition(input);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.composition;
}

type Draft = {
  assets: Record<string, unknown>[];
  scenes: { nodes: Record<string, unknown>[] }[];
  clips: Record<string, unknown>[];
};

const MAX = Number.MAX_SAFE_INTEGER;

function clip(id: string, fields: Record<string, number>): Record<string, unknown> {
  return {
    id,
    type: 'audio',
    assetId: 'asset-sound',
    startUs: 0,
    durationUs: 1_000_000,
    sourceStartUs: 0,
    volume: 1,
    fadeInUs: 0,
    fadeOutUs: 0,
    ...fields,
  };
}

/** The video composition (2 s) with sound: the clips below, and its videos at their volumes. */
function withSound(): ValidatedComposition {
  const draft = structuredClone(videoComposition) as Draft;
  draft.assets.push({ id: 'asset-sound', type: 'audio', contentHash: `sha256:${'a'.repeat(64)}` });
  const nodes = draft.scenes[0]?.nodes ?? [];
  const byId = (id: string): Record<string, unknown> => {
    for (const node of nodes) {
      if (node['id'] === id) return node;
      for (const child of (node['children'] as Record<string, unknown>[] | undefined) ?? []) {
        if (child['id'] === id) return child;
      }
    }
    throw new Error(id);
  };
  byId('node-video-full')['volume'] = 1;
  byId('node-video-cover')['volume'] = 0;
  byId('node-video-contain')['volume'] = 0.75;
  Object.assign(byId('node-group'), { startUs: 700_000, durationUs: 2_000_000 });
  draft.clips = [
    clip('clip-music', {
      durationUs: 4_000_000,
      volume: 0.25,
      fadeInUs: 500_000,
      fadeOutUs: 1_500_000,
    }),
    clip('clip-at-end', { startUs: 2_000_000 }),
    clip('clip-silent', { volume: 0 }),
    clip('clip-long', {
      startUs: 1_999_999,
      durationUs: MAX - 1_999_999,
      sourceStartUs: 7,
      fadeOutUs: MAX - 1_999_999,
    }),
  ];
  return validated(draft);
}

describe('the audio plan (D52.4)', () => {
  it('holds the one clip of the reference composition, as the step to 0.4 left it', () => {
    expect(audioPlan(validated(referenceComposition))).toEqual({
      durationUs: 10_000_000,
      entries: [
        {
          kind: 'clip',
          id: 'clip-audio',
          assetId: 'asset-audio',
          startUs: 0,
          durationUs: 10_000_000,
          sourceStartUs: 0,
          volume: 1,
          lifetimeUs: 10_000_000,
          fadeInUs: 0,
          fadeOutUs: 0,
        },
      ],
    });
  });

  it('hears clips first, then the videos above volume 0, each in document order', () => {
    const plan = audioPlan(withSound());
    expect(plan.durationUs).toBe(2_000_000);
    expect(plan.entries.map(({ kind, id }) => `${kind} ${id}`)).toEqual([
      'clip clip-music',
      'clip clip-long',
      'video node-video-full',
      'video node-video-contain',
    ]);
  });

  it('cuts a clip at the composition end and keeps its fades in its whole lifetime', () => {
    const music = audioPlan(withSound()).entries[0];
    expect(music).toEqual({
      kind: 'clip',
      id: 'clip-music',
      assetId: 'asset-sound',
      startUs: 0,
      durationUs: 2_000_000,
      sourceStartUs: 0,
      volume: 0.25,
      lifetimeUs: 4_000_000,
      fadeInUs: 500_000,
      fadeOutUs: 1_500_000,
    } satisfies AudioPlanEntry);
  });

  it('never adds past the safe integers: a lifetime that reaches 2^53 − 1 is cut by subtraction', () => {
    const long = audioPlan(withSound()).entries[1];
    expect(long).toMatchObject({
      startUs: 1_999_999,
      durationUs: 1,
      sourceStartUs: 7,
      lifetimeUs: MAX - 1_999_999,
      fadeOutUs: MAX - 1_999_999,
    });
  });

  it('hears a video in a group only while the group is active, from the source time it shows then', () => {
    const [, , full, contain] = audioPlan(withSound()).entries;
    expect(full).toEqual({
      kind: 'video',
      id: 'node-video-full',
      assetId: 'asset-video',
      startUs: 0,
      durationUs: 2_000_000,
      sourceStartUs: 0,
      volume: 1,
      lifetimeUs: 2_000_000,
      fadeInUs: 0,
      fadeOutUs: 0,
    });
    // The node lives 0.5 s to 1.5 s, its group from 0.7 s: 0.2 s later in its source too.
    expect(contain).toEqual({
      kind: 'video',
      id: 'node-video-contain',
      assetId: 'asset-video',
      startUs: 700_000,
      durationUs: 800_000,
      sourceStartUs: 1_200_000,
      volume: 0.75,
      lifetimeUs: 800_000,
      fadeInUs: 0,
      fadeOutUs: 0,
    });
  });

  it('hears nothing of a document whose videos are silent and which has no clip', () => {
    expect(audioPlan(validated(videoComposition)).entries).toEqual([]);
  });

  it('hears no video whose group is over before the video begins', () => {
    const draft = structuredClone(videoComposition) as Draft;
    const group = draft.scenes[0]?.nodes.find((node) => node['id'] === 'node-group');
    const child = (group?.['children'] as Record<string, unknown>[] | undefined)?.[0];
    if (group === undefined || child === undefined) throw new Error('No group.');
    Object.assign(group, { startUs: 0, durationUs: 500_000 });
    child['volume'] = 1;
    expect(audioPlan(validated(draft)).entries).toEqual([]);
  });

  it('is a pure function of the document: the same entries every time, and a frozen input is enough', () => {
    const composition = withSound();
    expect(JSON.stringify(audioPlan(composition))).toBe(JSON.stringify(audioPlan(composition)));
  });
});

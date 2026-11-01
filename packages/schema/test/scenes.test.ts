/**
 * The placement of scenes (D49.3, D54.3): starts as sums of the durations
 * before, half-open scene intervals that meet end to end, videos with their
 * scene, and the audio plan of scene clips. The expectations are derived by
 * hand from the rule and the scenes fixture, never from the code.
 */
import { scenesComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  audioPlan,
  placedVideos,
  sampledSourceRange,
  scenePlacements,
  scenesAt,
  validateComposition,
  videoSceneTimeUs,
  type ValidatedComposition,
} from '../src/index.js';

function validated(document: unknown): ValidatedComposition {
  const result = validateComposition(document);
  if (!result.ok) throw new Error(result.errors.map(({ message }) => message).join('\n'));
  return result.composition;
}

const scenes = validated(scenesComposition);

type Draft = {
  durationUs: number;
  assets: unknown[];
  scenes: { id: string; durationUs: number; nodes: unknown[]; clips: Record<string, unknown>[] }[];
  clips: unknown[];
};

function draft(): Draft {
  return structuredClone(scenesComposition) as Draft;
}

describe('the placements of scenes (D49.3)', () => {
  it('starts each scene at the sum of the durations before it', () => {
    expect(scenePlacements(scenes.scenes)).toEqual([
      { id: 'scene-intro', index: 0, startUs: 0, durationUs: 1_000_000 },
      { id: 'scene-middle', index: 1, startUs: 1_000_000, durationUs: 1_500_000 },
      { id: 'scene-outro', index: 2, startUs: 2_500_000, durationUs: 700_000 },
    ]);
  });

  it('ends the last scene at the duration of the composition', () => {
    const last = scenePlacements(scenes.scenes).at(-1);
    expect((last?.startUs ?? 0) + (last?.durationUs ?? 0)).toBe(scenes.durationUs);
  });
});

describe('the scenes evaluated at an instant (D49.3)', () => {
  it.each([
    [0, 'scene-intro', 0],
    [999_999, 'scene-intro', 999_999],
    [1_000_000, 'scene-middle', 0],
    [2_499_999, 'scene-middle', 1_499_999],
    [2_500_000, 'scene-outro', 0],
    [3_199_999, 'scene-outro', 699_999],
  ])('at %i is %s at scene time %i', (timeUs, id, local) => {
    const found = scenesAt(scenes.scenes, timeUs);
    expect(found.map(({ placement, timeUs: at }) => [placement.id, at])).toEqual([[id, local]]);
  });

  it('is no scene before 0 or at and after the end, which is exclusive', () => {
    expect(scenesAt(scenes.scenes, -1)).toEqual([]);
    expect(scenesAt(scenes.scenes, 3_200_000)).toEqual([]);
    expect(scenesAt(scenes.scenes, Number.MAX_SAFE_INTEGER)).toEqual([]);
  });

  it('is exactly one scene at every frame of the composition', () => {
    for (let frame = 0; frame < 96; frame += 1) {
      const timeUs = Math.ceil((frame * 1_000_000) / 30);
      expect(scenesAt(scenes.scenes, timeUs), String(frame)).toHaveLength(1);
    }
  });
});

describe('videos with their scene (D54.3)', () => {
  const video = {
    id: 'node-video',
    type: 'video',
    startUs: 200_000,
    durationUs: 2_000_000,
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    opacity: 1,
    animations: [],
    assetId: 'asset-video',
    sourceStartUs: 3_000_000,
    width: 320,
    height: 180,
    fit: 'contain',
    volume: 0.5,
  };
  const withVideo = (() => {
    const document = draft();
    document.assets.push({
      id: 'asset-video',
      type: 'video',
      contentHash: `sha256:${'c'.repeat(64)}`,
    });
    document.scenes[2]?.nodes.push(video);
    return validated(document);
  })();

  it('finds the video in the outro, placed at its start', () => {
    const placed = placedVideos(withVideo);
    expect(placed.map(({ node, scene }) => [node.id, scene.id, scene.startUs])).toEqual([
      ['node-video', 'scene-outro', 2_500_000],
    ]);
  });

  it('shows a frame in scene time only while its scene and its lifetime both contain it', () => {
    const [placed] = placedVideos(withVideo);
    if (placed === undefined) throw new Error('No video.');
    expect(videoSceneTimeUs(placed, 2_699_999)).toBeNull();
    expect(videoSceneTimeUs(placed, 2_700_000)).toBe(200_000);
    expect(videoSceneTimeUs(placed, 3_199_999)).toBe(699_999);
    // The node lives on in scene time, the scene does not.
    expect(videoSceneTimeUs(placed, 3_200_000)).toBeNull();
    expect(videoSceneTimeUs(placed, 1_000_000)).toBeNull();
  });

  it('samples only the part of the source its scene shows', () => {
    const [placed] = placedVideos(withVideo);
    if (placed === undefined) throw new Error('No video.');
    // Scene time 200 000 to 700 000: 500 000 of source from 3 000 000.
    expect(sampledSourceRange(placed.node, placed.scene.durationUs)).toEqual({
      startUs: 3_000_000,
      durationUs: 500_000,
    });
  });

  it('is heard from its scene start, cut to its scene', () => {
    const entry = audioPlan(withVideo).entries.find(({ id }) => id === 'node-video');
    expect(entry).toMatchObject({
      kind: 'video',
      startUs: 2_700_000,
      durationUs: 500_000,
      sourceStartUs: 3_000_000,
      lifetimeUs: 500_000,
    });
  });
});

describe('the audio plan of scene clips (D54.3)', () => {
  it('holds the composition clips first, then the clips of each scene placed at its start', () => {
    expect(audioPlan(scenes).entries).toEqual([
      {
        kind: 'clip',
        id: 'clip-music',
        assetId: 'asset-audio',
        startUs: 0,
        durationUs: 3_200_000,
        sourceStartUs: 0,
        volume: 0.5,
        lifetimeUs: 3_200_000,
        fadeInUs: 0,
        fadeOutUs: 500_000,
      },
      {
        kind: 'clip',
        id: 'middle-voice',
        assetId: 'asset-audio',
        startUs: 1_250_000,
        durationUs: 1_000_000,
        sourceStartUs: 1_000_000,
        volume: 0.8,
        lifetimeUs: 1_000_000,
        fadeInUs: 100_000,
        fadeOutUs: 200_000,
      },
    ]);
  });

  it('cuts a scene clip at the end of its scene and keeps its fades in its whole lifetime', () => {
    const document = draft();
    const clip = document.scenes[1]?.clips[0];
    if (clip === undefined) throw new Error('No clip.');
    clip['startUs'] = 1_000_000;
    const entry = audioPlan(validated(document)).entries.find(({ id }) => id === 'middle-voice');
    // Scene time 1 000 000 to 1 500 000, at composition time 2 000 000.
    expect(entry).toMatchObject({ startUs: 2_000_000, durationUs: 500_000, lifetimeUs: 1_000_000 });
  });

  it('leaves out a scene clip that starts at or after the end of its scene', () => {
    const document = draft();
    const clip = document.scenes[1]?.clips[0];
    if (clip === undefined) throw new Error('No clip.');
    clip['startUs'] = 1_500_000;
    const ids = audioPlan(validated(document)).entries.map(({ id }) => id);
    expect(ids).toEqual(['clip-music']);
  });
});

describe('the duration of a composition with scenes (D54.2)', () => {
  it('is refused when it is not the sum of the durations of the scenes', () => {
    const document = draft();
    document.durationUs = 3_200_001;
    const result = validateComposition(document);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map(({ code, path }) => [code, path])).toEqual([
      ['composition-duration-mismatch', '/durationUs'],
    ]);
  });

  it('is refused for scenes whose durations would add up past the safe integers', () => {
    const document = draft();
    for (const scene of document.scenes) scene.durationUs = Number.MAX_SAFE_INTEGER;
    document.durationUs = Number.MAX_SAFE_INTEGER;
    const result = validateComposition(document);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map(({ code }) => code)).toContain('composition-duration-mismatch');
  });
});

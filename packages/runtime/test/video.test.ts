/**
 * The state of video nodes (D49.5, D50.3): an active video reports the source
 * time it shows, an inactive one reports none, and the runtime knows no frame.
 * The expectations are derived by hand from the fixture.
 */
import { validateComposition, type ValidatedComposition } from '@kadrion/schema';
import { videoComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { evaluateComposition, type NodeState, type VideoNodeState } from '../src/index.js';

function validated(input: unknown): ValidatedComposition {
  const result = validateComposition(input);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.composition;
}

const composition = validated(videoComposition);

function videosAt(timeUs: number): Record<string, VideoNodeState> {
  const found: Record<string, VideoNodeState> = {};
  const visit = (node: NodeState): void => {
    if (node.type === 'video') found[node.id] = node;
    if (node.type === 'group') node.children.forEach(visit);
  };
  evaluateComposition(composition, timeUs).scenes.forEach((scene) => {
    scene.nodes.forEach(visit);
  });
  return found;
}

describe('the source time of video nodes (D49.5)', () => {
  it.each([
    // [time, full (from 0), cover (from 0.5 s), contain (0.5 s to 1.5 s, from 1 s)]
    [0, 0, 500_000, null],
    [499_999, 499_999, 999_999, null],
    [500_000, 500_000, 1_000_000, 1_000_000],
    [1_000_000, 1_000_000, 1_500_000, 1_500_000],
    [1_499_999, 1_499_999, 1_999_999, 1_999_999],
    [1_500_000, 1_500_000, 2_000_000, null],
    [1_966_666, 1_966_666, 2_466_666, null],
  ])('at %i is %s, %s, and %s', (timeUs, full, cover, contain) => {
    const videos = videosAt(timeUs);
    expect(videos['node-video-full']?.sourceTimeUs).toBe(full);
    expect(videos['node-video-cover']?.sourceTimeUs).toBe(cover);
    expect(videos['node-video-contain']?.sourceTimeUs).toBe(contain);
    expect(videos['node-video-contain']?.active).toBe(contain !== null);
  });

  it('carries the transform of a video like that of an image', () => {
    const cover = videosAt(0)['node-video-cover'];
    expect(cover).toEqual({
      id: 'node-video-cover',
      type: 'video',
      active: true,
      position: { x: 160, y: 190 },
      scale: { x: 1, y: 1 },
      opacity: 1,
      sourceTimeUs: 500_000,
    });
  });
});

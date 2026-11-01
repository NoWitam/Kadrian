/**
 * Scenes in sequence in pinned Chromium (D49.3, D54.3): a frame of the scenes
 * fixture is, pixel for pixel, the frame of the same scene rendered as a
 * composition of its own at its scene time, at the first instant of each
 * scene, inside it, and at its last frame; the scenes that are not evaluated
 * leave no pixel behind, in any order of the frames; and a Custom HTML element
 * of a later scene draws the time of its scene.
 */
import { launchChromium, renderFrames, type LaunchedChromium } from '@kadrion/producer';
import { frameToTimeUs } from '@kadrion/schema';
import { scenesComposition } from '@kadrion/test-fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  decodePng,
  expectedBar,
  measuredBar,
  pixelReport,
  referenceResolver,
  samePixels,
  writeReport,
} from './support.js';

interface SceneDraft {
  id: string;
  durationUs: number;
}

interface CompositionDraft {
  durationUs: number;
  scenes: SceneDraft[];
  clips: unknown[];
}

const FPS = 30;
const draft = structuredClone(scenesComposition) as CompositionDraft;
const STARTS = [0, 1_000_000, 2_500_000];

/** The fixture with only the scene at `index`. */
function alone(index: number): unknown {
  const copy = structuredClone(scenesComposition) as CompositionDraft;
  const scene = copy.scenes[index];
  if (scene === undefined) throw new Error('No scene.');
  copy.scenes = [scene];
  copy.durationUs = scene.durationUs;
  copy.clips = [];
  return copy;
}

/** Frame times of a scene in scene time: its first, one inside, and its last. */
function localTimes(durationUs: number): number[] {
  const frames = Math.ceil((durationUs * FPS) / 1_000_000);
  return [0, Math.floor(frames / 2), frames - 1].map((frame) => frameToTimeUs(frame, FPS));
}

describe('scenes in sequence in pinned Chromium (D54.3)', () => {
  let chromium: LaunchedChromium;

  const render = async (document: unknown, timesUs: readonly number[]) =>
    renderFrames({ document, resolveAsset: referenceResolver, timesUs, chromium });

  beforeAll(async () => {
    chromium = await launchChromium();
  });

  afterAll(async () => {
    await chromium.browser.close();
  });

  it('renders each scene as the same scene on its own, in any order', async () => {
    const rows: { scene: string; timeUs: number; sceneTimeUs: number; same: boolean }[] = [];
    const sequenceTimes = draft.scenes.flatMap((scene, index) =>
      localTimes(scene.durationUs).map((local) => (STARTS[index] ?? 0) + local),
    );
    const forward = await render(scenesComposition, sequenceTimes);
    const backward = await render(scenesComposition, [...sequenceTimes].reverse());
    for (const [index, scene] of draft.scenes.entries()) {
      const times = localTimes(scene.durationUs);
      const single = await render(alone(index), times);
      for (const { timeUs: local, png } of single.frames) {
        const timeUs = (STARTS[index] ?? 0) + local;
        const inSequence = forward.frames.find((frame) => frame.timeUs === timeUs)?.png;
        const reversed = backward.frames.find((frame) => frame.timeUs === timeUs)?.png;
        if (inSequence === undefined || reversed === undefined) {
          throw new Error(`No frame at ${String(timeUs)}.`);
        }
        const same = samePixels(inSequence, png);
        rows.push({ scene: scene.id, timeUs, sceneTimeUs: local, same });
        expect(same, pixelReport(`${scene.id} at ${String(local)}`, inSequence, png)).toBe(true);
        expect(samePixels(reversed, inSequence), String(timeUs)).toBe(true);
      }
    }
    writeReport('scenes/alone-vs-sequence.json', rows);
    expect(rows).toHaveLength(9);
  });

  it('draws the time of its scene in a Custom HTML element of the middle scene', async () => {
    const timeUs = 1_500_000;
    const { frames } = await render(scenesComposition, [timeUs]);
    const png = frames[0]?.png;
    if (png === undefined) throw new Error('No frame.');
    const bar = measuredBar(decodePng(png));
    // Scene time 500 000, where composition time would draw three times as much.
    expect(Math.abs(bar - expectedBar(500_000))).toBeLessThanOrEqual(1);
  });
});

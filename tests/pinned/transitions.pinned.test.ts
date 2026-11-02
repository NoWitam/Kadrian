/**
 * Transitions in pinned Chromium (D49.4, D56.5): at progress 0 the frame of the
 * transitions fixture is, pixel for pixel, the outgoing scene rendered as a
 * composition of its own, and at the end of the transition the incoming one;
 * a clip crossfade at progress 0 is the frame without its incoming node; and
 * the frames in the middle of each effect meet their golden frames in the
 * pinned environment.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { launchChromium, renderFrames, type LaunchedChromium } from '@kadrion/producer';
import { transitionsComposition, transitionsGoldenTimestamps } from '@kadrion/test-fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  decodePng,
  difference,
  GOLDEN_DIRECTORY,
  OUTPUT_DIRECTORY,
  pinnedRun,
  pixelReport,
  referenceResolver,
  samePixels,
  writeReport,
} from './support.js';

interface SceneDraft {
  id: string;
  durationUs: number;
  nodes: { id: string }[];
  transitions: unknown[];
}

interface CompositionDraft {
  durationUs: number;
  scenes: SceneDraft[];
  transitions: unknown[];
}

const TRANSITIONS_MANIFEST = join(GOLDEN_DIRECTORY, 'transitions.golden-frames.json');
/** Where each scene starts, and the duration of every transition (D56.2). */
const STARTS = [0, 600_000, 1_200_000, 1_800_000, 2_400_000];
const TRANSITION_US = 400_000;

/** The fixture with only the scene at `index`, without scene transitions. */
function alone(index: number, edit: (scene: SceneDraft) => void = () => undefined): unknown {
  const copy = structuredClone(transitionsComposition) as CompositionDraft;
  const scene = copy.scenes[index];
  if (scene === undefined) throw new Error('No scene.');
  edit(scene);
  copy.scenes = [scene];
  copy.transitions = [];
  copy.durationUs = scene.durationUs;
  return copy;
}

describe('transitions in pinned Chromium (D56.5)', () => {
  let chromium: LaunchedChromium;

  const render = async (document: unknown, timesUs: readonly number[]) =>
    renderFrames({ document, resolveAsset: referenceResolver, timesUs, chromium });

  const frameAt = async (document: unknown, timeUs: number): Promise<Uint8Array> => {
    const png = (await render(document, [timeUs])).frames[0]?.png;
    if (png === undefined) throw new Error(`No frame at ${String(timeUs)}.`);
    return png;
  };

  beforeAll(async () => {
    chromium = await launchChromium();
  });

  afterAll(async () => {
    await chromium.browser.close();
  });

  it('shows the outgoing scene alone at progress 0 and the incoming one at the end', async () => {
    const rows: { transition: number; side: string; timeUs: number; same: boolean }[] = [];
    // Both edges of all four transitions, in one render and in reverse order.
    const starts = STARTS.slice(1);
    const ends = starts.map((startUs) => startUs + TRANSITION_US);
    const times = [...starts, ...ends];
    const sequence = await render(transitionsComposition, [...times].reverse());
    const at = (timeUs: number): Uint8Array => {
      const png = sequence.frames.find((frame) => frame.timeUs === timeUs)?.png;
      if (png === undefined) throw new Error(`No frame at ${String(timeUs)}.`);
      return png;
    };
    for (const [index, startUs] of starts.entries()) {
      // At progress 0 the outgoing scene, at scene time `startUs − start(k)`.
      const outgoing = await frameAt(alone(index), startUs - (STARTS[index] ?? 0));
      const first = samePixels(at(startUs), outgoing);
      rows.push({ transition: index, side: 'outgoing', timeUs: startUs, same: first });
      expect(first, pixelReport(`progress 0 of ${String(index)}`, at(startUs), outgoing)).toBe(
        true,
      );
      // At the end the incoming scene alone, at scene time TRANSITION_US.
      const endUs = startUs + TRANSITION_US;
      const incoming = await frameAt(alone(index + 1), TRANSITION_US);
      const last = samePixels(at(endUs), incoming);
      rows.push({ transition: index, side: 'incoming', timeUs: endUs, same: last });
      expect(last, pixelReport(`end of ${String(index)}`, at(endUs), incoming)).toBe(true);
    }
    writeReport('transitions/edges.json', rows);
    expect(rows).toHaveLength(8);
  });

  it('shows a clip crossfade at progress 0 as the frame without its incoming node', async () => {
    // Scene e: `e-title` starts at scene time 400 000, the start of the crossfade.
    const withTransition = await frameAt(alone(4), 400_000);
    const without = await frameAt(
      alone(4, (scene) => {
        scene.nodes = scene.nodes.filter(({ id }) => id !== 'e-title');
        scene.transitions = [];
      }),
      400_000,
    );
    expect(
      samePixels(withTransition, without),
      pixelReport('clip crossfade at progress 0', withTransition, without),
    ).toBe(true);
  });

  it('meets the golden frames of the transitions composition in the pinned environment only (D26.5)', async () => {
    const environment = pinnedRun(chromium);
    const times = transitionsGoldenTimestamps.map(({ timeUs }) => timeUs);
    const { frames } = await render(transitionsComposition, times);
    const goldens = existsSync(TRANSITIONS_MANIFEST)
      ? (JSON.parse(readFileSync(TRANSITIONS_MANIFEST, 'utf8')) as {
          environment: { pinned: boolean };
          frames: { file: string; timeUs: number }[];
        })
      : null;
    const report = frames.map(({ timeUs, png }) => {
      const file = goldens?.frames.find((frame) => frame.timeUs === timeUs)?.file;
      return {
        timeUs,
        difference:
          file === undefined
            ? null
            : difference(decodePng(readFileSync(join(GOLDEN_DIRECTORY, file))), decodePng(png)),
      };
    });
    rmSync(join(OUTPUT_DIRECTORY, 'transitions', 'golden-comparison.json'), { force: true });
    writeReport('transitions/golden-comparison.json', {
      environment,
      goldens: goldens !== null,
      report,
    });
    if (!environment.pinned) {
      console.info('Not the pinned environment: the transition golden frames are not asserted.');
      return;
    }
    expect(
      goldens,
      'Run "node --run goldens:update" in the pinned container first.',
    ).not.toBeNull();
    expect(goldens?.environment.pinned).toBe(true);
    expect(report).toHaveLength(times.length);
    for (const { timeUs, difference: found } of report) {
      expect(found?.differingPixels, String(timeUs)).toBe(0);
    }
  });
});

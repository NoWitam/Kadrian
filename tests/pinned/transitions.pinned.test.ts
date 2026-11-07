/**
 * Transitions in pinned Chromium (D49.4, D56.5, D66): at progress 0 the frame of
 * the transitions fixture is, pixel for pixel, the outgoing scene rendered as a
 * composition of its own, and at the end of the transition the incoming one;
 * a clip crossfade at progress 0 is the frame without its incoming node; and
 * the frames in the middle of each effect meet their golden frames in the
 * pinned environment. The clip transitions fixture does the same for every
 * kind between clips, in both orders of the layers and inside a group, and for
 * the scene effects push, zoom, and iris.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { launchChromium, renderFrames, type LaunchedChromium } from '@kadrion/producer';
import {
  clipTransitionsComposition,
  clipTransitionsGoldenTimestamps,
  transitionsComposition,
  transitionsGoldenTimestamps,
} from '@kadrion/test-fixtures';
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

interface NodeDraft {
  id: string;
  children?: NodeDraft[];
}

interface TransitionDraft {
  id: string;
  fromNodeId?: string;
  toNodeId?: string;
}

interface SceneDraft {
  id: string;
  durationUs: number;
  nodes: NodeDraft[];
  transitions: TransitionDraft[];
}

interface CompositionDraft {
  durationUs: number;
  scenes: SceneDraft[];
  transitions: unknown[];
}

const TRANSITIONS_MANIFEST = join(GOLDEN_DIRECTORY, 'transitions.golden-frames.json');
const CLIP_TRANSITIONS_MANIFEST = join(GOLDEN_DIRECTORY, 'clip-transitions.golden-frames.json');
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

/** The frames at `times` against the golden frames of `manifest`, reported to `reportPath` (D26.5). */
async function goldenComparison(
  chromium: LaunchedChromium,
  document: unknown,
  times: readonly number[],
  manifest: string,
  reportPath: string,
): Promise<void> {
  const environment = pinnedRun(chromium);
  const { frames } = await renderFrames({
    document,
    resolveAsset: referenceResolver,
    timesUs: times,
    chromium,
  });
  const goldens = existsSync(manifest)
    ? (JSON.parse(readFileSync(manifest, 'utf8')) as {
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
  rmSync(join(OUTPUT_DIRECTORY, reportPath), { force: true });
  writeReport(reportPath, { environment, goldens: goldens !== null, report });
  if (!environment.pinned) {
    console.info(`Not the pinned environment: ${reportPath} is not asserted.`);
    return;
  }
  expect(goldens, 'Run "node --run goldens:update" in the pinned container first.').not.toBeNull();
  expect(goldens?.environment.pinned).toBe(true);
  expect(report).toHaveLength(times.length);
  for (const { timeUs, difference: found } of report) {
    expect(found?.differingPixels, String(timeUs)).toBe(0);
  }
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
    await goldenComparison(
      chromium,
      transitionsComposition,
      transitionsGoldenTimestamps.map(({ timeUs }) => timeUs),
      TRANSITIONS_MANIFEST,
      'transitions/golden-comparison.json',
    );
  });
});

/** The kinds of the clip transitions fixture, in the order of its clips. */
const KINDS = ['crossfade', 'fade', 'slide', 'wipe', 'push', 'zoom', 'iris'] as const;
/** Where the scenes of the clip transitions fixture start, and their transitions' duration. */
const CLIP_SCENE_STARTS = [0, 4_600_000, 9_200_000, 10_200_000];
const CLIP_SCENE_TRANSITION_US = 400_000;
const CLIP_TRANSITION_US = 200_000;

/** The clip transitions fixture with only the scene at `index`, without scene transitions. */
function clipScene(index: number, edit: (scene: SceneDraft) => void = () => undefined): unknown {
  const copy = structuredClone(clipTransitionsComposition) as CompositionDraft;
  const scene = copy.scenes[index];
  if (scene === undefined) throw new Error('No scene.');
  edit(scene);
  copy.scenes = [scene];
  copy.transitions = [];
  copy.durationUs = scene.durationUs;
  return copy;
}

/** Removes a node, at the top level or in a group, and every transition that names it. */
function withoutNode(scene: SceneDraft, id: string): void {
  const keep = (nodes: NodeDraft[]): NodeDraft[] =>
    nodes
      .filter((node) => node.id !== id)
      .map((node) =>
        node.children === undefined ? node : { ...node, children: keep(node.children) },
      );
  scene.nodes = keep(scene.nodes);
  scene.transitions = scene.transitions.filter(
    ({ fromNodeId, toNodeId }) => fromNodeId !== id && toNodeId !== id,
  );
}

describe('clip transitions and the new scene effects in pinned Chromium (D66)', () => {
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

  it('shows every clip transition at progress 0 as the frame without it, and at its end too', async () => {
    const rows: { transition: string; edge: string; timeUs: number; same: boolean }[] = [];
    const check = async (
      sceneIndex: number,
      transitionId: string,
      incomingId: string,
      startUs: number,
    ) => {
      // At progress 0: the frame without the incoming node (and its transitions).
      const first = await frameAt(clipScene(sceneIndex), startUs);
      const without = await frameAt(
        clipScene(sceneIndex, (scene) => {
          withoutNode(scene, incomingId);
        }),
        startUs,
      );
      const same0 = samePixels(first, without);
      rows.push({ transition: transitionId, edge: 'start', timeUs: startUs, same: same0 });
      expect(same0, pixelReport(`${transitionId} at progress 0`, first, without)).toBe(true);
      // At the end: the frame without the transition.
      const endUs = startUs + CLIP_TRANSITION_US;
      const last = await frameAt(clipScene(sceneIndex), endUs);
      const plain = await frameAt(
        clipScene(sceneIndex, (scene) => {
          scene.transitions = scene.transitions.filter(({ id }) => id !== transitionId);
        }),
        endUs,
      );
      const same1 = samePixels(last, plain);
      rows.push({ transition: transitionId, edge: 'end', timeUs: endUs, same: same1 });
      expect(same1, pixelReport(`${transitionId} at its end`, last, plain)).toBe(true);
    };
    for (const [sceneIndex, prefix] of [
      [0, 'up'],
      [1, 'down'],
    ] as const) {
      for (const [k, kind] of KINDS.entries()) {
        await check(
          sceneIndex,
          `${prefix}-${kind}`,
          `${prefix}-clip-${String(k + 1)}`,
          600_000 * (k + 1),
        );
      }
    }
    await check(2, 'group-slide', 'group-second', 600_000);
    writeReport('transitions/clip-edges.json', rows);
    expect(rows).toHaveLength(30);
  });

  it('shows the outgoing scene of a push, a zoom, and an iris alone at progress 0 and the incoming one at the end', async () => {
    for (const [index, startUs] of CLIP_SCENE_STARTS.slice(1).entries()) {
      const outgoingAt = startUs - (CLIP_SCENE_STARTS[index] ?? 0);
      const sequenceStart = await frameAt(clipTransitionsComposition, startUs);
      const outgoing = await frameAt(clipScene(index), outgoingAt);
      expect(
        samePixels(sequenceStart, outgoing),
        pixelReport(`scene transition ${String(index)} at progress 0`, sequenceStart, outgoing),
      ).toBe(true);
      const endUs = startUs + CLIP_SCENE_TRANSITION_US;
      const sequenceEnd = await frameAt(clipTransitionsComposition, endUs);
      const incoming = await frameAt(clipScene(index + 1), CLIP_SCENE_TRANSITION_US);
      expect(
        samePixels(sequenceEnd, incoming),
        pixelReport(`scene transition ${String(index)} at its end`, sequenceEnd, incoming),
      ).toBe(true);
    }
  });

  it('meets the golden frames of the clip transitions composition in the pinned environment only (D26.5)', async () => {
    await goldenComparison(
      chromium,
      clipTransitionsComposition,
      clipTransitionsGoldenTimestamps.map(({ timeUs }) => timeUs),
      CLIP_TRANSITIONS_MANIFEST,
      'transitions/clip-golden-comparison.json',
    );
  });
});

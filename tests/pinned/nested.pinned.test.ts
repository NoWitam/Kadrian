/**
 * Nested compositions in pinned Chromium (D76): an instance that fills a
 * canvas of its definition's size from time 0 renders exactly the pixels of
 * the definition's nodes placed directly in a scene, at every time tried, with
 * the mask, the SVG effect, the clip transition, and the nested instance of
 * the definition named by their paths inside the instance; and the frames of
 * the nested composition, which places one definition three times, fitted and
 * transformed, beside a blurred instance of another, meet their golden frames
 * in the pinned environment (D26.5). The composition has no video, so no
 * FFmpeg is needed.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { launchChromium, renderFrames, type LaunchedChromium } from '@kadrion/producer';
import { frameToTimeUs } from '@kadrion/schema';
import { nestedComposition, nestedGoldenTimestamps } from '@kadrion/test-fixtures';
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

const MANIFEST = join(GOLDEN_DIRECTORY, 'nested.golden-frames.json');

interface Holder {
  id: string;
  width: number;
  height: number;
  durationUs: number;
  nodes: unknown[];
  clips: unknown[];
  transitions: unknown[];
}

interface Draft {
  width: number;
  height: number;
  durationUs: number;
  scenes: {
    id: string;
    durationUs: number;
    nodes: unknown[];
    clips: unknown[];
    transitions: unknown[];
    effects: unknown[];
  }[];
  definitions: Holder[];
}

/** The card of the fixture as the only content of a scene of its canvas size: placed directly, or by one instance. */
function card(placed: 'directly' | 'instance'): unknown {
  const draft = structuredClone(nestedComposition) as Draft;
  const definition = draft.definitions.find(({ id }) => id === 'card');
  if (definition === undefined) throw new Error('No card.');
  draft.width = definition.width;
  draft.height = definition.height;
  draft.durationUs = definition.durationUs;
  const scene = {
    id: 'scene-card',
    durationUs: definition.durationUs,
    nodes: [] as unknown[],
    clips: [] as unknown[],
    transitions: [] as unknown[],
    effects: [] as unknown[],
  };
  if (placed === 'directly') {
    scene.nodes = definition.nodes;
    scene.transitions = definition.transitions;
    draft.definitions = draft.definitions.filter(({ id }) => id !== 'card');
  } else {
    scene.nodes = [
      {
        id: 'card-instance',
        type: 'instance',
        startUs: 0,
        durationUs: definition.durationUs,
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        origin: { x: 0, y: 0 },
        opacity: 1,
        animations: [],
        definitionId: 'card',
        sourceStartUs: 0,
        width: definition.width,
        height: definition.height,
        fit: 'fill',
        effects: [],
        mask: { kind: 'none' },
        matte: { kind: 'none' },
        blendMode: 'normal',
      },
    ];
  }
  draft.scenes = [scene];
  return draft;
}

describe('nested compositions in pinned Chromium (D76)', () => {
  let chromium: LaunchedChromium;

  const framesOf = async (document: unknown, timesUs: number[]): Promise<Uint8Array[]> => {
    const { frames } = await renderFrames({
      document,
      resolveAsset: referenceResolver,
      timesUs,
      chromium,
    });
    return frames.map(({ png }) => png);
  };

  beforeAll(async () => {
    chromium = await launchChromium();
  });

  afterAll(async () => {
    await chromium.browser.close();
  });

  it("renders an instance as the definition's nodes placed directly, pixel for pixel", async () => {
    // Before, inside, and after the crossfade of the bars, and the badge turning.
    const times = [0, 12, 22, 30, 44].map((frame) => frameToTimeUs(frame, 30));
    const direct = await framesOf(card('directly'), times);
    const placed = await framesOf(card('instance'), times);
    times.forEach((timeUs, at) => {
      const a = direct[at];
      const b = placed[at];
      if (a === undefined || b === undefined) throw new Error(`No frame at ${String(timeUs)}.`);
      expect(samePixels(a, b), pixelReport(`instance at ${String(timeUs)}`, a, b)).toBe(true);
    });
    // And the premise: the card changes over time, so equal frames are not empty ones.
    const [first, , , , last] = direct;
    if (first === undefined || last === undefined) throw new Error('No frames.');
    expect(samePixels(first, last)).toBe(false);
  });

  it('renders the nested composition as its golden frames (D26.5)', async () => {
    const reportPath = 'nested/golden-comparison.json';
    const environment = pinnedRun(chromium);
    const times = nestedGoldenTimestamps.map(({ timeUs }) => timeUs);
    const { frames } = await renderFrames({
      document: nestedComposition,
      resolveAsset: referenceResolver,
      timesUs: times,
      chromium,
    });
    const goldens = existsSync(MANIFEST)
      ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
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

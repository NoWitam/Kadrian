/**
 * Nested compositions in pinned Chromium (D76): an instance that fills a
 * canvas of its definition's size from time 0 renders exactly the pixels of
 * the definition's nodes placed directly in a scene, at every time tried, with
 * the mask, the SVG effect, the clip transition, and the nested instance of
 * the definition named by their paths inside the instance; and the frames of
 * the nested composition, which places one definition three times, fitted and
 * transformed, beside a blurred instance of another, meet their golden frames
 * in the pinned environment (D26.5); an element instance renders exactly the
 * pixels of its definition instantiated with its values and placed directly,
 * and the frames of the elements fixture meet their golden frames (D77). The
 * compositions have no video, so no FFmpeg is needed.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { launchChromium, renderFrames, type LaunchedChromium } from '@kadrion/producer';
import { frameToTimeUs } from '@kadrion/schema';
import { instantiateTemplate } from '@kadrion/schema/template';
import {
  elementsComposition,
  elementsGoldenTimestamps,
  nestedComposition,
  nestedGoldenTimestamps,
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

const MANIFEST = join(GOLDEN_DIRECTORY, 'nested.golden-frames.json');
const ELEMENTS_MANIFEST = join(GOLDEN_DIRECTORY, 'elements.golden-frames.json');

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
        inputs: [],
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

interface ElementDraft extends Draft {
  definitions: (Holder & { template: unknown })[];
  template: unknown;
}

/**
 * The lower third of the elements fixture as the only content of a scene of
 * its canvas size: an instance that gives the values of `third-a`, or the
 * definition instantiated with those values and placed directly (D77).
 */
function lowerThird(placed: 'directly' | 'instance'): unknown {
  const draft = structuredClone(elementsComposition) as ElementDraft;
  const definition = draft.definitions.find(({ id }) => id === 'lower-third');
  if (definition === undefined) throw new Error('No lower third.');
  draft.width = definition.width;
  draft.height = definition.height;
  draft.durationUs = definition.durationUs;
  const instance = (
    draft.scenes[0]?.nodes as { id: string; inputs: unknown[] }[] | undefined
  )?.find(({ id }) => id === 'third-a');
  if (instance === undefined) throw new Error('No third-a.');
  const scene = {
    id: 'scene-third',
    durationUs: definition.durationUs,
    nodes: [] as unknown[],
    clips: [] as unknown[],
    transitions: [] as unknown[],
    effects: [] as unknown[],
  };
  if (placed === 'instance') {
    scene.nodes = [
      {
        ...instance,
        startUs: 0,
        durationUs: definition.durationUs,
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        sourceStartUs: 0,
        width: definition.width,
        height: definition.height,
        fit: 'fill',
      },
    ];
    draft.definitions = [definition];
    draft.scenes = [scene];
    return draft;
  }
  scene.nodes = definition.nodes;
  draft.definitions = [];
  draft.template = definition.template;
  draft.scenes = [scene];
  const values = Object.fromEntries(
    (instance.inputs as { inputId: string; value: unknown }[]).map(({ inputId, value }) => [
      inputId,
      value,
    ]),
  );
  const result = instantiateTemplate(
    draft as unknown as Parameters<typeof instantiateTemplate>[0],
    values,
  );
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.composition;
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

  it('renders an element instance as its definition instantiated and placed directly (D77)', async () => {
    const times = [0, 15, 30, 48].map((frame) => frameToTimeUs(frame, 30));
    const direct = await framesOf(lowerThird('directly'), times);
    const placed = await framesOf(lowerThird('instance'), times);
    times.forEach((timeUs, at) => {
      const a = direct[at];
      const b = placed[at];
      if (a === undefined || b === undefined) throw new Error(`No frame at ${String(timeUs)}.`);
      expect(samePixels(a, b), pixelReport(`element at ${String(timeUs)}`, a, b)).toBe(true);
    });
  });

  it.each([
    ['nested composition', 'nested', nestedComposition, nestedGoldenTimestamps, MANIFEST],
    ['elements', 'elements', elementsComposition, elementsGoldenTimestamps, ELEMENTS_MANIFEST],
  ] as const)(
    'renders the %s as its golden frames (D26.5)',
    async (_, name, document, golden, manifest) => {
      const reportPath = `${name}/golden-comparison.json`;
      const environment = pinnedRun(chromium);
      const times = golden.map(({ timeUs }) => timeUs);
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
      expect(
        goldens,
        'Run "node --run goldens:update" in the pinned container first.',
      ).not.toBeNull();
      expect(goldens?.environment.pinned).toBe(true);
      expect(report).toHaveLength(times.length);
      for (const { timeUs, difference: found } of report) {
        expect(found?.differingPixels, String(timeUs)).toBe(0);
      }
    },
  );
});

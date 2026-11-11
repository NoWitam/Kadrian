/**
 * A frame does not depend on the frames rendered before it (D22.9): pinned
 * Chromium draws a transformed element whose opacity was once below 1
 * differently at opacity 1 than a fresh one, on the anti-aliased edges of a
 * stroked or shadowed text, unless the element carries `will-change: opacity`
 * from its mount on. Two documents derived from the fixtures hold a stroked and
 * shadowed text faded as a whole node, a text faded in letters, lines, and
 * words (D69), and captions whose words enter and leave by their opacity
 * (D70). Every frame of their grid must come out byte for byte the same when
 * the Producer renders the grid forward, in reverse, and a frame alone after
 * the fades, and the Player must show the same pixels seeking in reverse and
 * then forward. This holds in any environment, so it is asserted everywhere.
 */
import { launchChromium, renderFrames, type LaunchedChromium } from '@kadrion/producer';
import { evaluateComposition, type CompositionState, type NodeState } from '@kadrion/runtime';
import { frameCount, frameToTimeUs, validateComposition } from '@kadrion/schema';
import {
  captionsMotionComposition,
  generateReferenceAssets,
  textComposition,
} from '@kadrion/test-fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  closeConformanceHost,
  openConformanceHost,
  seekAndCapture,
  type ConformanceHost,
} from './conformance-host.js';
import {
  decodePng,
  difference,
  pinnedRun,
  pixelReport,
  referenceResolver,
  writeReport,
} from './support.js';

type Draft = { scenes: { nodes: Record<string, unknown>[] }[] };

const LINEAR = { kind: 'linear' };
const SHADOW = {
  kind: 'drop',
  color: '#000000',
  opacity: 0.6,
  offset: { x: 3, y: 3 },
  blur: 2,
};
const STROKE = { kind: 'outside', color: '#f04438', width: 2 };

function nodeOf(draft: Draft, id: string): Record<string, unknown> {
  const node = draft.scenes[0]?.nodes.find((item) => item['id'] === id);
  if (node === undefined) throw new Error(`The fixture has no ${id}.`);
  return node;
}

/**
 * The text composition with a stroke and a shadow on two texts: `node-words`
 * in one piece, faded in as a node over 400 ms, and `node-letters`, whose
 * letters fade in one after another (D69); `node-lines` fades its lines out
 * at the end and `node-accent` its words in, as in the fixture.
 */
function textHistory(): unknown {
  const draft = structuredClone(textComposition) as Draft;
  const letters = nodeOf(draft, 'node-letters');
  letters['style'] = { ...(letters['style'] as object), shadow: SHADOW };
  const words = nodeOf(draft, 'node-words');
  words['style'] = { ...(words['style'] as object), stroke: STROKE };
  words['textAnimations'] = [];
  words['animations'] = [
    {
      id: 'history-words-fade',
      property: 'opacity',
      keyframes: [
        { timeUs: 0, value: 0, easing: LINEAR },
        { timeUs: 400_000, value: 1, easing: LINEAR },
      ],
    },
  ];
  return draft;
}

/**
 * The outlined captions of the animated captions fixture whose words enter and
 * leave by their opacity (D70), with a shadow, and without the scale and the
 * underline of the highlight and without the second captions node: those draw
 * a frame after the frames before it apart from any opacity, which this file
 * does not cover (an open question of D22.9).
 */
function captionsHistory(): unknown {
  const draft = structuredClone(captionsMotionComposition) as Draft;
  const scene = draft.scenes[0];
  if (scene !== undefined) {
    scene.nodes = scene.nodes.filter((node) => node['id'] !== 'captions-bounce');
  }
  const pop = nodeOf(draft, 'captions-pop');
  const style = pop['style'] as { highlight: object };
  pop['style'] = {
    ...style,
    shadow: SHADOW,
    highlight: { ...style.highlight, scale: 1, underline: { kind: 'none' } },
  };
  return draft;
}

/** Every opacity of a state: of the nodes, of the fragments of texts, and of the pieces of captions. */
function opacities(state: CompositionState): number[] {
  const of = (node: NodeState): number[] => {
    const own = 'opacity' in node ? [node.opacity] : [];
    const children = node.type === 'group' ? node.children.flatMap(of) : [];
    const fragments =
      node.type === 'text' && node.fragments !== null
        ? [...node.fragments.lines, ...node.fragments.words, ...node.fragments.letters]
        : node.type === 'captions' && node.fragments !== null
          ? [...node.fragments.lines, ...node.fragments.words]
          : [];
    return [...own, ...children, ...fragments.map((fragment) => fragment.opacity)];
  };
  return state.scenes.flatMap((scene) => scene.nodes.flatMap(of));
}

interface Case {
  readonly name: string;
  readonly document: unknown;
  readonly times: readonly number[];
  /** Frames where every opacity is 1 again after a frame where one was below 1. */
  readonly afterFades: readonly number[];
}

function caseOf(name: string, document: unknown): Case {
  const result = validateComposition(document);
  if (!result.ok) throw new Error(`The ${name} document is invalid.`);
  const composition = result.composition;
  const times = Array.from(
    { length: frameCount(composition.durationUs, composition.fps) },
    (_, frame) => frameToTimeUs(frame, composition.fps),
  );
  let faded = false;
  const afterFades: number[] = [];
  for (const timeUs of times) {
    const values = opacities(evaluateComposition(composition, timeUs));
    if (faded && values.every((value) => value === 1)) afterFades.push(timeUs);
    if (values.some((value) => value < 1)) faded = true;
  }
  return { name, document, times, afterFades };
}

const CASES: readonly Case[] = [
  caseOf('text', textHistory()),
  caseOf('captions', captionsHistory()),
];

let chromium: LaunchedChromium;

beforeAll(async () => {
  chromium = await launchChromium();
}, 60_000);

afterAll(async () => {
  await chromium.browser.close();
});

async function produced(
  document: unknown,
  times: readonly number[],
): Promise<Map<number, Uint8Array>> {
  const { frames } = await renderFrames({
    document,
    resolveAsset: referenceResolver,
    timesUs: times,
    chromium,
  });
  return new Map(frames.map(({ timeUs, png }) => [timeUs, png]));
}

function frameAt(frames: ReadonlyMap<number, Uint8Array>, timeUs: number): Uint8Array {
  const png = frames.get(timeUs);
  if (png === undefined) throw new Error(`No frame at ${String(timeUs)}.`);
  return png;
}

function differing(a: Uint8Array, b: Uint8Array): number {
  return difference(decodePng(a), decodePng(b)).differingPixels;
}

/** The frames of the grid rendered forward, by case, kept by the Producer's test for the Player's. */
const forward = new Map<string, Map<number, Uint8Array>>();

describe.each(CASES)(
  'the frames of the $name document do not depend on the frames before them (D22.9)',
  (item) => {
    it('has frames after its fades, where every opacity is 1 again (the premise)', () => {
      expect(item.afterFades.length).toBeGreaterThan(2);
    });

    it('come out of the Producer byte for byte the same forward, in reverse, and alone', async () => {
      const ahead = await produced(item.document, item.times);
      const back = await produced(item.document, [...item.times].reverse());
      forward.set(item.name, ahead);
      const reversed = item.times.filter(
        (timeUs) => !Buffer.from(frameAt(ahead, timeUs)).equals(frameAt(back, timeUs)),
      );
      // A few frames after the fades, each rendered alone in a page of its own.
      const picked = [0, Math.floor(item.afterFades.length / 2), item.afterFades.length - 1].map(
        (index) => item.afterFades[index] ?? -1,
      );
      const alone: { timeUs: number; differingPixels: number }[] = [];
      for (const timeUs of picked) {
        const single = frameAt(await produced(item.document, [timeUs]), timeUs);
        alone.push({ timeUs, differingPixels: differing(single, frameAt(ahead, timeUs)) });
        for (const [order, frames] of [
          ['forward', ahead],
          ['in reverse', back],
        ] as const) {
          const other = frameAt(frames, timeUs);
          expect(
            Buffer.from(single).equals(other),
            pixelReport(`${String(timeUs)} alone and ${order}`, single, other),
          ).toBe(true);
        }
      }
      writeReport(`opacity-history/${item.name}-producer.json`, {
        environment: pinnedRun(chromium),
        frames: item.times.length,
        afterFades: item.afterFades,
        differingForwardAndReverse: reversed.map((timeUs) => ({
          timeUs,
          differingPixels: differing(frameAt(ahead, timeUs), frameAt(back, timeUs)),
        })),
        alone,
      });
      expect(reversed).toEqual([]);
    });

    describe('in the Player', () => {
      let host: ConformanceHost;

      beforeAll(async () => {
        host = await openConformanceHost(
          chromium,
          JSON.stringify(item.document),
          generateReferenceAssets().filter(({ id }) => id === 'asset-font'),
        );
      }, 120_000);

      afterAll(async () => {
        await closeConformanceHost(host);
      });

      it('shows the frames of the Producer seeking in reverse, then forward', async () => {
        const expected = forward.get(item.name) ?? (await produced(item.document, item.times));
        const report: { timeUs: number; order: string; differingPixels: number }[] = [];
        for (const [order, times] of [
          ['reverse', [...item.times].reverse()],
          ['forward', item.times],
        ] as const) {
          for (const timeUs of times) {
            const shown = await seekAndCapture(host, timeUs, null);
            const pixels = differing(frameAt(expected, timeUs), shown.png);
            if (pixels > 0) report.push({ timeUs, order, differingPixels: pixels });
          }
        }
        writeReport(`opacity-history/${item.name}-player.json`, {
          environment: pinnedRun(chromium),
          differing: report,
        });
        expect(report).toEqual([]);
      });
    });
  },
);

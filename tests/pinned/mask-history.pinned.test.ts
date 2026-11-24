/**
 * A frame with turned and animated content inside an SVG mask (D75) does not
 * depend on the frames rendered before it (D90). The document is the
 * composition of compositing with the photo of its feathered and morphing
 * shape mask turned by 30°: the star matte turns, the polygon mask of the text
 * morphs, the shape mask of the photo morphs and feathers, and the gradient
 * matte moves. At each probed time the Producer's frame rendered alone, on a
 * fresh page, is the frame rendered after the first frame, after itself, and
 * after the last frame, byte for byte; the Player shows that frame when it
 * seeks the time first and when it seeks it again after another time.
 *
 * Before D90 the pinned Chromium rastered only the part of a tile that a frame
 * changed (partial raster), and a mask's content turned off the axes was
 * painted differently into that part than into a whole tile: the first frame
 * of a page differed from the same frame after any other, in both hosts
 * (D89, implementation notes of PR-89; D90).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { launchChromium, renderFrames, type LaunchedChromium } from '@kadrion/producer';
import { frameCount, frameToTimeUs, validateComposition } from '@kadrion/schema';
import { compositingComposition, generateReferenceAssets } from '@kadrion/test-fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeConformanceHost, openConformanceHost, seekAndCapture } from './conformance-host.js';
import {
  decodePng,
  difference,
  differingPixels,
  OUTPUT_DIRECTORY,
  pinnedRun,
  referenceResolver,
  samePixels,
  writeReport,
} from './support.js';

type DraftNode = Record<string, unknown> & { id: string; children?: DraftNode[] };
type Draft = { scenes: { nodes: DraftNode[] }[] };

/** The node whose shape mask morphs and feathers, turned so that its mask is too. */
const TURNED = 'mask-shape-photo';

function nodesOf(draft: Draft): DraftNode[] {
  const all = (nodes: readonly DraftNode[]): DraftNode[] =>
    nodes.flatMap((node) => [node, ...all(node.children ?? [])]);
  return all(draft.scenes.flatMap((scene) => scene.nodes));
}

function maskHistory(): unknown {
  const draft = structuredClone(compositingComposition) as Draft;
  const turned = nodesOf(draft).find(({ id }) => id === TURNED);
  if (turned === undefined) throw new Error(`The fixture has no ${TURNED}.`);
  turned['rotation'] = 30;
  return draft;
}

const DOCUMENT = maskHistory();
const validated = validateComposition(DOCUMENT);
if (!validated.ok) throw new Error('The document of the probe is not valid.');
const { fps, durationUs } = validated.composition;
const FIRST_US = 0;
const LAST_US = frameToTimeUs(frameCount(durationUs, fps) - 1, fps);
/** Times when both mattes are active and every animation of a mask is under way. */
const TIMES_US = [frameToTimeUs(20, fps), frameToTimeUs(30, fps), frameToTimeUs(45, fps)];

const ASSETS = generateReferenceAssets().filter(
  ({ id }) => id === 'asset-image' || id === 'asset-font',
);

let chromium: LaunchedChromium;

beforeAll(async () => {
  chromium = await launchChromium();
}, 60_000);

afterAll(async () => {
  await chromium.browser.close();
});

/** The Producer's frame at `timeUs`, after the frames at `before` in the same render. */
async function produced(timeUs: number, before: readonly number[] = []): Promise<Uint8Array> {
  const { frames } = await renderFrames({
    document: DOCUMENT,
    resolveAsset: referenceResolver,
    timesUs: [...before, timeUs],
    chromium,
  });
  const png = frames.at(-1)?.png;
  if (png === undefined) throw new Error(`No frame at ${String(timeUs)}.`);
  return png;
}

/** The PNGs and the differing pixels of two frames that should be equal, beside the report. */
function evidence(name: string, expected: Uint8Array, found: Uint8Array): void {
  const slug = name.replace(/[^a-z0-9]+/g, '-');
  mkdirSync(join(OUTPUT_DIRECTORY, 'mask-history'), { recursive: true });
  writeFileSync(join(OUTPUT_DIRECTORY, 'mask-history', `${slug}-expected.png`), expected);
  writeFileSync(join(OUTPUT_DIRECTORY, 'mask-history', `${slug}-found.png`), found);
  writeReport(join('mask-history', `${slug}-pixels.json`), {
    pixels: differingPixels(decodePng(expected), decodePng(found), 2000),
  });
}

/** The differing pixels of `found` against `expected`, with the evidence written when there are any. */
function compared(name: string, expected: Uint8Array, found: Uint8Array): number {
  const { differingPixels: count } = difference(decodePng(expected), decodePng(found));
  if (count > 0) evidence(name, expected, found);
  return count;
}

describe('a frame with turned and animated masks and mattes, whatever came before (D90, D75)', () => {
  const alone = new Map<number, Uint8Array>();

  it('renders each time in the Producer alone and after other frames with the same bytes', async () => {
    const rows: {
      timeUs: number;
      changesFromTheFirstFrame: boolean;
      afterTheFirstFrame: number;
      afterItself: number;
      afterTheLastFrame: number;
    }[] = [];
    const first = await produced(FIRST_US);
    for (const timeUs of TIMES_US) {
      const cold = await produced(timeUs);
      alone.set(timeUs, cold);
      rows.push({
        timeUs,
        // The premise: the masks and mattes at this time are not those of the first frame.
        changesFromTheFirstFrame: !samePixels(first, cold),
        afterTheFirstFrame: compared(
          `${String(timeUs)} after the first frame`,
          cold,
          await produced(timeUs, [FIRST_US]),
        ),
        afterItself: compared(
          `${String(timeUs)} after itself`,
          cold,
          await produced(timeUs, [timeUs]),
        ),
        afterTheLastFrame: compared(
          `${String(timeUs)} after the last frame`,
          cold,
          await produced(timeUs, [LAST_US]),
        ),
      });
    }
    writeReport(join('mask-history', 'producer.json'), { environment: pinnedRun(chromium), rows });
    expect(rows).toHaveLength(TIMES_US.length);
    for (const row of rows) {
      expect(row, String(row.timeUs)).toEqual({
        timeUs: row.timeUs,
        changesFromTheFirstFrame: true,
        afterTheFirstFrame: 0,
        afterItself: 0,
        afterTheLastFrame: 0,
      });
    }
  }, 600_000);

  it('shows each time in the Player as the Producer renders it alone, sought first and again', async () => {
    const rows: { timeUs: number; soughtFirst: number; soughtAgain: number }[] = [];
    for (const timeUs of TIMES_US) {
      const cold = alone.get(timeUs) ?? (await produced(timeUs));
      const host = await openConformanceHost(chromium, JSON.stringify(DOCUMENT), ASSETS);
      try {
        const shown = await seekAndCapture(host, timeUs, null);
        await seekAndCapture(host, FIRST_US, null);
        await seekAndCapture(host, LAST_US, null);
        const again = await seekAndCapture(host, timeUs, null);
        rows.push({
          timeUs,
          soughtFirst: compared(`${String(timeUs)} in the Player`, cold, shown.png),
          soughtAgain: compared(`${String(timeUs)} in the Player again`, cold, again.png),
        });
      } finally {
        await closeConformanceHost(host);
      }
    }
    writeReport(join('mask-history', 'player.json'), { environment: pinnedRun(chromium), rows });
    expect(rows).toHaveLength(TIMES_US.length);
    for (const row of rows) {
      expect(row, String(row.timeUs)).toEqual({
        timeUs: row.timeUs,
        soughtFirst: 0,
        soughtAgain: 0,
      });
    }
  }, 600_000);
});

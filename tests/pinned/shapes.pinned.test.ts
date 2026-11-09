/**
 * Vector shapes in pinned Chromium (D73): a stroke trimmed to nothing draws
 * nothing, not even its caps; a stroke drawn on the edge of the box leaves the
 * box; the even-odd rule leaves a hole where a subpath lies inside another,
 * which the non-zero rule fills; and the frames of the composition of shapes
 * meet their golden frames in the pinned environment (D26.5). The composition
 * has no video, so no FFmpeg is needed.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { launchChromium, renderFrames, type LaunchedChromium } from '@kadrion/producer';
import { shapesComposition, shapesGoldenTimestamps } from '@kadrion/test-fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  decodePng,
  difference,
  GOLDEN_DIRECTORY,
  OUTPUT_DIRECTORY,
  pinnedRun,
  pixel,
  pixelReport,
  referenceResolver,
  samePixels,
  writeReport,
} from './support.js';

const MANIFEST = join(GOLDEN_DIRECTORY, 'shapes.golden-frames.json');
/** The background of the composition of shapes, #101828. */
const BACKGROUND: [number, number, number] = [16, 24, 40];

interface ShapeDraft {
  id: string;
  geometry?: { fillRule?: string };
  stroke?: { width: number };
  animations: { property: string; keyframes: { value: unknown }[] }[];
  children?: ShapeDraft[];
}

interface Draft {
  scenes: { nodes: ShapeDraft[] }[];
}

/** The composition with `edit` applied to a copy. */
function edited(edit: (draft: Draft) => void): unknown {
  const draft = structuredClone(shapesComposition) as Draft;
  edit(draft);
  return draft;
}

function nodeOf(draft: Draft, id: string): ShapeDraft {
  for (const node of draft.scenes.flatMap((scene) => scene.nodes)) {
    if (node.id === id) return node;
    const child = node.children?.find((item) => item.id === id);
    if (child !== undefined) return child;
  }
  throw new Error(`No node ${id}.`);
}

describe('vector shapes in pinned Chromium (D73)', () => {
  let chromium: LaunchedChromium;

  const frameAt = async (document: unknown, timeUs: number): Promise<Uint8Array> => {
    const { frames } = await renderFrames({
      document,
      resolveAsset: referenceResolver,
      timesUs: [timeUs],
      chromium,
    });
    const png = frames[0]?.png;
    if (png === undefined) throw new Error(`No frame at ${String(timeUs)}.`);
    return png;
  };

  beforeAll(async () => {
    chromium = await launchChromium();
  });

  afterAll(async () => {
    await chromium.browser.close();
  });

  it('draws nothing of a stroke trimmed to nothing, not even its round caps (D65.5)', async () => {
    // At 0 s the trim of shape-star ends at 0: its stroke, with round caps, is
    // left out, exactly as a stroke of width 0 is.
    const trimmed = await frameAt(shapesComposition, 0);
    const unstroked = await frameAt(
      edited((draft) => {
        const stroke = nodeOf(draft, 'shape-star').stroke;
        if (stroke !== undefined) stroke.width = 0;
      }),
      0,
    );
    expect(samePixels(trimmed, unstroked), pixelReport('trimmed', trimmed, unstroked)).toBe(true);
    // And the premise: at 1 s the whole stroke is drawn, which changes the frame.
    const drawn = await frameAt(shapesComposition, 1_000_000);
    const drawnUnstroked = await frameAt(
      edited((draft) => {
        const stroke = nodeOf(draft, 'shape-star').stroke;
        if (stroke !== undefined) stroke.width = 0;
      }),
      1_000_000,
    );
    expect(samePixels(drawn, drawnUnstroked)).toBe(false);
  });

  it('lets a stroke on the edge of the box leave the box', async () => {
    // shape-ellipse fills its box at x 250 to 390, y 30 to 130; its stroke of
    // width 4 at 0 s is centred on the outline, so it reaches 2 px beyond the
    // rightmost point of the box, at (390, 80).
    const stroked = decodePng(await frameAt(shapesComposition, 0));
    expect(pixel(stroked, 391, 80)).not.toEqual(BACKGROUND);
    expect(pixel(stroked, 395, 80)).toEqual(BACKGROUND);
  });

  it('leaves a hole by the even-odd rule, which the non-zero rule fills', async () => {
    // shape-morph at (40, 190): its second subpath, x 30 to 60 and y 80 to 105
    // at 0 s, lies inside the first one.
    const [x, y] = [40 + 45, 190 + 92];
    const evenOdd = decodePng(await frameAt(shapesComposition, 0));
    const nonZero = decodePng(
      await frameAt(
        edited((draft) => {
          const node = nodeOf(draft, 'shape-morph');
          for (const geometry of [
            node.geometry,
            ...node.animations.flatMap((animation) =>
              animation.keyframes.map((keyframe) => keyframe.value as { fillRule?: string }),
            ),
          ]) {
            if (geometry !== undefined) geometry.fillRule = 'nonzero';
          }
        }),
        0,
      ),
    );
    expect(pixel(evenOdd, x, y)).toEqual(BACKGROUND);
    expect(pixel(nonZero, x, y)).toEqual([0x2e, 0x90, 0xfa]);
  });

  it('renders the composition of shapes as its golden frames (D26.5)', async () => {
    const reportPath = 'shapes/golden-comparison.json';
    const environment = pinnedRun(chromium);
    const times = shapesGoldenTimestamps.map(({ timeUs }) => timeUs);
    const { frames } = await renderFrames({
      document: shapesComposition,
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

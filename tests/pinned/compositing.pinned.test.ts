/**
 * Masks, mattes, and blend modes in pinned Chromium (D75): a matte that is not
 * active covers nothing, so its node is drawn exactly as without a matte; and
 * the frames of the composition of compositing, which holds every blend mode,
 * an image mask, a feathered and animated shape mask, an inverted text mask,
 * an alpha matte inside a group that blends, and a luminance-inverted matte,
 * meet their golden frames in the pinned environment (D26.5). The composition
 * has no video, so no FFmpeg is needed.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { launchChromium, renderFrames, type LaunchedChromium } from '@kadrion/producer';
import { compositingComposition, compositingGoldenTimestamps } from '@kadrion/test-fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  decodePng,
  difference,
  differingPixels,
  GOLDEN_DIRECTORY,
  OUTPUT_DIRECTORY,
  pinnedRun,
  pixelReport,
  referenceResolver,
  samePixels,
  writeReport,
} from './support.js';

const MANIFEST = join(GOLDEN_DIRECTORY, 'compositing.golden-frames.json');

interface Draft {
  scenes: { nodes: { id: string; matte?: unknown }[] }[];
}

/** The composition with `edit` applied to a copy. */
function edited(edit: (draft: Draft) => void): unknown {
  const draft = structuredClone(compositingComposition) as Draft;
  edit(draft);
  return draft;
}

describe('masks, mattes, and blend modes in pinned Chromium (D75)', () => {
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

  it('draws a node whose matte is not active as a node without a matte', async () => {
    // matte-gradient starts at 0.5 s: before it, the luminance-inverted matte of
    // matte-luminance-photo covers nothing, so the photo shows whole.
    const unmatted = edited((draft) => {
      for (const node of draft.scenes.flatMap((scene) => scene.nodes)) {
        if (node.id === 'matte-luminance-photo') node.matte = { kind: 'none' };
      }
    });
    const before = await frameAt(compositingComposition, 0);
    const plain = await frameAt(unmatted, 0);
    expect(samePixels(before, plain), pixelReport('inactive matte', before, plain)).toBe(true);
    // And the premise: once the matte is active, it changes the frame.
    const active = await frameAt(compositingComposition, 1_000_000);
    const activePlain = await frameAt(unmatted, 1_000_000);
    expect(samePixels(active, activePlain)).toBe(false);
  });

  it('renders the composition of compositing as its golden frames (D26.5)', async () => {
    const reportPath = 'compositing/golden-comparison.json';
    const environment = pinnedRun(chromium);
    const times = compositingGoldenTimestamps.map(({ timeUs }) => timeUs);
    const { frames } = await renderFrames({
      document: compositingComposition,
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
    rmSync(join(OUTPUT_DIRECTORY, 'compositing'), { recursive: true, force: true });
    const report = frames.map(({ timeUs, png }) => {
      const file = goldens?.frames.find((frame) => frame.timeUs === timeUs)?.file;
      if (file === undefined) return { timeUs, difference: null };
      const golden = decodePng(readFileSync(join(GOLDEN_DIRECTORY, file)));
      const frame = decodePng(png);
      const found = difference(golden, frame);
      if (found.differingPixels === 0) return { timeUs, difference: found };
      // The evidence of a difference that only some runners show: the frame
      // itself and where it differs from its golden, in the CI artifact.
      const framePath = `compositing/frame-${String(timeUs)}.png`;
      mkdirSync(join(OUTPUT_DIRECTORY, 'compositing'), { recursive: true });
      writeFileSync(join(OUTPUT_DIRECTORY, framePath), png);
      return {
        timeUs,
        difference: found,
        frame: framePath,
        pixels: differingPixels(golden, frame),
      };
    });
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

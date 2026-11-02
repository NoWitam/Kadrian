/**
 * Captions in pinned Chromium (D57): what is shown follows from the word
 * timings alone — the same words, moved in time together with the times they
 * are rendered at, give the same frames — the highlight is the only difference
 * between a word being spoken and the pause on the same page, and the frames
 * of the captions fixture meet their golden frames in the pinned environment.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { launchChromium, renderFrames, type LaunchedChromium } from '@kadrion/producer';
import { captionsComposition, captionsGoldenTimestamps } from '@kadrion/test-fixtures';
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

interface CaptionsDraft {
  type: string;
  style: { color: string; highlightColor: string };
  words: { startUs: number }[];
}

interface CompositionDraft {
  scenes: { nodes: CaptionsDraft[] }[];
}

const CAPTIONS_MANIFEST = join(GOLDEN_DIRECTORY, 'captions.golden-frames.json');

/** The fixture with its captions node changed by `edit`. */
function edited(edit: (node: CaptionsDraft) => void): unknown {
  const copy = structuredClone(captionsComposition) as CompositionDraft;
  for (const node of copy.scenes.flatMap((scene) => scene.nodes)) {
    if (node.type === 'captions') edit(node);
  }
  return copy;
}

describe('captions in pinned Chromium (D57)', () => {
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

  it('shows the same frame when every word and the time move together (D57.4)', async () => {
    const shiftUs = 100_000;
    const later = edited((node) => {
      for (const word of node.words) word.startUs += shiftUs;
    });
    const rows: { timeUs: number; same: boolean }[] = [];
    for (const timeUs of [300_000, 1_200_000, 1_700_000, 2_600_000]) {
      const original = await frameAt(captionsComposition, timeUs);
      const moved = await frameAt(later, timeUs + shiftUs);
      const same = samePixels(original, moved);
      rows.push({ timeUs, same });
      expect(same, pixelReport(`words moved at ${String(timeUs)}`, original, moved)).toBe(true);
    }
    writeReport('captions/timing.json', rows);
  });

  it('differs between a spoken word and the pause of its page by the highlight alone (D57.6)', async () => {
    // At 1.2 s "on" is spoken; at 1.7 s the same page shows no highlight. Without a
    // highlight colour of its own, the spoken word looks like the pause.
    const plain = edited((node) => {
      node.style.highlightColor = node.style.color;
    });
    const spoken = await frameAt(captionsComposition, 1_200_000);
    const pause = await frameAt(captionsComposition, 1_700_000);
    const unhighlighted = await frameAt(plain, 1_200_000);
    expect(samePixels(spoken, pause)).toBe(false);
    expect(
      samePixels(unhighlighted, pause),
      pixelReport('no highlight', unhighlighted, pause),
    ).toBe(true);
  });

  it('meets the golden frames of the captions composition in the pinned environment only (D26.5)', async () => {
    const environment = pinnedRun(chromium);
    const times = captionsGoldenTimestamps.map(({ timeUs }) => timeUs);
    const { frames } = await renderFrames({
      document: captionsComposition,
      resolveAsset: referenceResolver,
      timesUs: times,
      chromium,
    });
    const goldens = existsSync(CAPTIONS_MANIFEST)
      ? (JSON.parse(readFileSync(CAPTIONS_MANIFEST, 'utf8')) as {
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
    rmSync(join(OUTPUT_DIRECTORY, 'captions', 'golden-comparison.json'), { force: true });
    writeReport('captions/golden-comparison.json', {
      environment,
      goldens: goldens !== null,
      report,
    });
    if (!environment.pinned) {
      console.info('Not the pinned environment: the caption golden frames are not asserted.');
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

/**
 * Animated captions in pinned Chromium (D70): captions drawn in pieces at rest
 * paint exactly what the same captions in one piece paint, so that the pieces
 * move nothing; the entrance, the highlight, and the exit follow from the word
 * timings alone — the same words, moved in time together with the times they
 * are rendered at, give the same frames; the box and the underline of the
 * highlight are painted on the word being spoken and on no other; and the
 * frames of the animated captions fixture meet their golden frames in the
 * pinned environment (D26.5).
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { launchChromium, renderFrames, type LaunchedChromium } from '@kadrion/producer';
import { captionsMotionComposition, captionsMotionGoldenTimestamps } from '@kadrion/test-fixtures';
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

type NodeDraft = Record<string, unknown> & {
  id: string;
  type: string;
  style: Record<string, unknown> & { highlight: Record<string, unknown> };
  words: { startUs: number }[];
};

const MANIFEST = join(GOLDEN_DIRECTORY, 'captions-motion.golden-frames.json');
const linear = { kind: 'linear' };

/** The fixture with every captions node changed by `edit`. */
function edited(edit: (node: NodeDraft) => void): unknown {
  const draft = structuredClone(captionsMotionComposition) as { scenes: { nodes: NodeDraft[] }[] };
  for (const node of draft.scenes.flatMap((scene) => scene.nodes)) {
    if (node.type === 'captions') edit(node);
  }
  return draft;
}

/** Every captions node in one piece: no box, no motion, no pieces of the highlight (D57). */
function inOnePiece(node: NodeDraft): void {
  node.style['box'] = { kind: 'none' };
  node.style['pageIn'] = { kind: 'none' };
  node.style['pageOut'] = { kind: 'none' };
  node.style.highlight = {
    ...node.style.highlight,
    scale: 1,
    tracks: [],
    underline: { kind: 'none' },
    box: { kind: 'none' },
  };
}

/** An entrance of `unit` that leaves every fragment where it is. */
function atRest(unit: string): unknown {
  return {
    kind: 'animate',
    unit,
    staggerUs: 50_000,
    order: { kind: 'forward' },
    tracks: [
      {
        property: 'opacity',
        keyframes: [
          { timeUs: 0, value: 1, easing: linear },
          { timeUs: 200_000, value: 1, easing: linear },
        ],
      },
    ],
  };
}

describe('animated captions in pinned Chromium (D70)', () => {
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

  it('draws captions in pieces at rest exactly as the same captions in one piece', async () => {
    const whole = edited(inOnePiece);
    for (const unit of ['word', 'line']) {
      const pieces = edited((node) => {
        inOnePiece(node);
        node.style['pageIn'] = atRest(unit);
      });
      // Frame times: a word spoken on each node, a pause on one, and the second pages.
      for (const timeUs of [266_666, 400_000, 1_200_000, 1_900_000]) {
        const one = await frameAt(whole, timeUs);
        const many = await frameAt(pieces, timeUs);
        expect(samePixels(one, many), pixelReport(`${unit} at ${String(timeUs)}`, one, many)).toBe(
          true,
        );
      }
    }
  });

  it('shows the same frame when every word and the time move together (D70)', async () => {
    // Three frames at 30 fps, so that every time moved is a frame time too.
    const shiftUs = 100_000;
    const later = edited((node) => {
      for (const word of node.words) word.startUs += shiftUs;
    });
    const rows: { timeUs: number; same: boolean }[] = [];
    for (const timeUs of [166_666, 300_000, 1_033_333, 1_200_000, 1_600_000]) {
      const original = await frameAt(captionsMotionComposition, timeUs);
      const moved = await frameAt(later, timeUs + shiftUs);
      const same = samePixels(original, moved);
      rows.push({ timeUs, same });
      expect(same, pixelReport(`words moved at ${String(timeUs)}`, original, moved)).toBe(true);
    }
    writeReport('captions-motion/timing.json', rows);
  });

  it('paints the box and the underline of the highlight on the spoken word alone', async () => {
    // At 1.9 s no word is spoken on either node; at 333 333 µs 'sings' and 'stars' are.
    const without = edited((node) => {
      node.style.highlight = {
        ...node.style.highlight,
        underline: { kind: 'none' },
        box: { kind: 'none' },
      };
    });
    const pause = await frameAt(captionsMotionComposition, 1_900_000);
    const pauseWithout = await frameAt(without, 1_900_000);
    expect(samePixels(pause, pauseWithout), pixelReport('pause', pause, pauseWithout)).toBe(true);
    const spoken = await frameAt(captionsMotionComposition, 333_333);
    const spokenWithout = await frameAt(without, 333_333);
    expect(samePixels(spoken, spokenWithout)).toBe(false);
  });

  it('renders the animated captions composition as its golden frames (D26.5)', async () => {
    const reportPath = 'captions-motion/golden-comparison.json';
    const environment = pinnedRun(chromium);
    const times = captionsMotionGoldenTimestamps.map(({ timeUs }) => timeUs);
    const { frames } = await renderFrames({
      document: captionsMotionComposition,
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

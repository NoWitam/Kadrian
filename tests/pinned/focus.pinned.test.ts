/**
 * The focus point of images and videos in pinned Chromium (D63): the focus is
 * the point of the picture that lies at the same fraction of the box, so under
 * `cover` it chooses which part is cropped away — the edge it names stays in
 * frame — under `contain` it moves the picture towards its bars, and under
 * `fill` it changes nothing. The frames of the focus composition meet their
 * golden frames in the pinned environment. Skipped without `KADRION_FFMPEG`
 * and `KADRION_FFPROBE`, since the composition has video nodes; required where
 * the run is pinned.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  launchChromium,
  PINNED_IMAGE,
  PINNED_IMAGE_VARIABLE,
  renderFrames,
  type LaunchedChromium,
} from '@kadrion/producer';
import type { AssetResolver } from '@kadrion/renderer-dom';
import {
  focusComposition,
  focusGoldenTimestamps,
  generateReferenceAssets,
  VIDEO_FIXTURE,
} from '@kadrion/test-fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  decodePng,
  difference,
  GOLDEN_DIRECTORY,
  OUTPUT_DIRECTORY,
  pinnedRun,
  pixel,
  pixelReport,
  samePixels,
  writeReport,
} from './support.js';
import { makeVideoFixture } from './video-fixture.ts';

const ffmpegPath = process.env.KADRION_FFMPEG;
const ffprobePath = process.env.KADRION_FFPROBE;
const available = ffmpegPath !== undefined && ffprobePath !== undefined;
const pinned = process.env[PINNED_IMAGE_VARIABLE] === PINNED_IMAGE;
const FFMPEG = { ffmpegPath: ffmpegPath ?? '', ffprobePath: ffprobePath ?? '' };
const FOCUS_MANIFEST = join(GOLDEN_DIRECTORY, 'focus.golden-frames.json');
/** A frame where every video of the fixture is past its first source frame. */
const LATER_US = 500_000;

const generated = Object.fromEntries(
  generateReferenceAssets().map(({ id, mediaType, bytes }) => [id, { mediaType, bytes }]),
);

interface PictureDraft {
  id: string;
  type: string;
  fit?: string;
  focus?: { x: number; y: number };
}

interface FocusDraft {
  scenes: { nodes: PictureDraft[] }[];
}

/** The focus composition with every picture changed by `edit`. */
function edited(edit: (node: PictureDraft) => void): unknown {
  const draft = structuredClone(focusComposition) as FocusDraft;
  for (const node of draft.scenes.flatMap((scene) => scene.nodes)) {
    if (node.type === 'image' || node.type === 'video') edit(node);
  }
  return draft;
}

/** The focus composition with one node's focus set. */
function focusedAt(id: string, focus: { x: number; y: number }): unknown {
  return edited((node) => {
    if (node.id === id) node.focus = focus;
  });
}

function white([r, g, b]: [number, number, number]): boolean {
  return r > 240 && g > 240 && b > 240;
}

describe('the pinned FFmpeg for the focus composition (D63)', () => {
  it('is given wherever the run is pinned', () => {
    if (pinned) expect(available).toBe(true);
    if (!available) {
      console.info('The focus tests are skipped: KADRION_FFMPEG and KADRION_FFPROBE are not set.');
    }
  });
});

describe.skipIf(!available)('the focus of images and videos in pinned Chromium (D63)', () => {
  let chromium: LaunchedChromium;
  let video: Uint8Array;

  const resolveAsset: AssetResolver = ({ id }) =>
    id === VIDEO_FIXTURE.id
      ? { bytes: video, mediaType: VIDEO_FIXTURE.mediaType }
      : (generated[id] ?? null);

  const frameAt = async (document: unknown, timeUs: number): Promise<Uint8Array> => {
    const { frames } = await renderFrames({
      document,
      resolveAsset,
      timesUs: [timeUs],
      chromium,
      ffmpeg: FFMPEG,
    });
    const png = frames[0]?.png;
    if (png === undefined) throw new Error(`No frame at ${String(timeUs)}.`);
    return png;
  };

  beforeAll(async () => {
    chromium = await launchChromium();
    video = await makeVideoFixture(FFMPEG.ffmpegPath);
  });

  afterAll(async () => {
    await chromium.browser.close();
  });

  it('keeps the edge it names in frame under cover, and the centre crops both (D63.2)', async () => {
    // The image is 128 px square with an 8 px white border; in the 120 x 300
    // box of cover it is 300 px wide, so its border is about 19 px wide and
    // only the focus decides which of its sides is in the box. The probes lie
    // in the upper half, away from the diagonals of the pattern.
    const box = { left: 10, right: 129, y: 90 };
    const left = decodePng(await frameAt(focusedAt('node-image-cover', { x: 0, y: 500 }), 0));
    const right = decodePng(await frameAt(focusedAt('node-image-cover', { x: 1000, y: 500 }), 0));
    const centre = decodePng(await frameAt(focusedAt('node-image-cover', { x: 500, y: 500 }), 0));
    expect(white(pixel(left, box.left + 2, box.y))).toBe(true);
    expect(white(pixel(left, box.right - 2, box.y))).toBe(false);
    expect(white(pixel(right, box.right - 2, box.y))).toBe(true);
    expect(white(pixel(right, box.left + 2, box.y))).toBe(false);
    expect(white(pixel(centre, box.left + 2, box.y))).toBe(false);
    expect(white(pixel(centre, box.right - 2, box.y))).toBe(false);
  });

  it.each(['node-image-cover', 'node-image-contain', 'node-video-cover', 'node-video-contain'])(
    'shows %s otherwise than with the centre as its focus',
    async (id) => {
      const focused = await frameAt(focusComposition, LATER_US);
      const centred = await frameAt(focusedAt(id, { x: 500, y: 500 }), LATER_US);
      expect(samePixels(focused, centred)).toBe(false);
    },
  );

  it('changes nothing under fill, where the picture is the box (D63.3)', async () => {
    const filled = edited((node) => {
      node.fit = 'fill';
    });
    const centred = edited((node) => {
      node.fit = 'fill';
      node.focus = { x: 500, y: 500 };
    });
    const a = await frameAt(filled, LATER_US);
    const b = await frameAt(centred, LATER_US);
    expect(samePixels(a, b), pixelReport('fill with and without a focus', a, b)).toBe(true);
  });

  it('meets the golden frames of the focus composition in the pinned environment only (D26.5)', async () => {
    const environment = pinnedRun(chromium);
    const times = focusGoldenTimestamps.map(({ timeUs }) => timeUs);
    const { frames } = await renderFrames({
      document: focusComposition,
      resolveAsset,
      timesUs: times,
      chromium,
      ffmpeg: FFMPEG,
    });
    const goldens = existsSync(FOCUS_MANIFEST)
      ? (JSON.parse(readFileSync(FOCUS_MANIFEST, 'utf8')) as {
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
    rmSync(join(OUTPUT_DIRECTORY, 'focus', 'golden-comparison.json'), { force: true });
    writeReport('focus/golden-comparison.json', { environment, goldens: goldens !== null, report });
    if (!environment.pinned) {
      console.info('Not the pinned environment: the focus golden frames are not asserted.');
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

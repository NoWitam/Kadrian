/**
 * Rotation, the origin point, and the properties of D68 in pinned Chromium: a
 * node turns about its origin, a point of its box, and the origin alone moves
 * nothing; the crop is the view box of the picture; the corner radius rounds
 * the box. The frames of the motion composition meet their golden frames in
 * the pinned environment. Skipped without `KADRION_FFMPEG` and
 * `KADRION_FFPROBE`, since the composition has a video node; required where
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
  generateReferenceAssets,
  motionComposition,
  motionGoldenTimestamps,
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
const MOTION_MANIFEST = join(GOLDEN_DIRECTORY, 'motion.golden-frames.json');
/** The colour of the background at 0, before its animation moves it: #1d2939. */
const BACKGROUND: [number, number, number] = [29, 41, 57];

const generated = Object.fromEntries(
  generateReferenceAssets().map(({ id, mediaType, bytes }) => [id, { mediaType, bytes }]),
);

type NodeDraft = Record<string, unknown> & { id: string; children?: NodeDraft[] };

interface MotionDraft {
  scenes: { nodes: NodeDraft[] }[];
}

/** The motion composition with one node changed by `edit`, its animations removed. */
function still(id: string, edit: (node: NodeDraft) => void): unknown {
  const draft = structuredClone(motionComposition) as MotionDraft;
  const nodes = draft.scenes.flatMap((scene) =>
    scene.nodes.flatMap((node) => [node, ...(node.children ?? [])]),
  );
  const node = nodes.find((item) => item.id === id);
  if (node === undefined) throw new Error(`The motion composition has no ${id}.`);
  node['animations'] = [];
  edit(node);
  return draft;
}

function near(found: [number, number, number], expected: [number, number, number]): boolean {
  return found.every((channel, index) => Math.abs(channel - (expected[index] ?? 0)) <= 2);
}

describe('the pinned FFmpeg for the motion composition (D68)', () => {
  it('is given wherever the run is pinned', () => {
    if (pinned) expect(available).toBe(true);
    if (!available) {
      console.info('The motion tests are skipped: KADRION_FFMPEG and KADRION_FFPROBE are not set.');
    }
  });
});

describe.skipIf(!available)('rotation, origin, crop, and corners in pinned Chromium (D68)', () => {
  let chromium: LaunchedChromium;
  let video: Uint8Array;

  const resolveAsset: AssetResolver = ({ id }) =>
    id === VIDEO_FIXTURE.id
      ? { bytes: video, mediaType: VIDEO_FIXTURE.mediaType }
      : (generated[id] ?? null);

  const frameAt = async (document: unknown, timeUs = 0): Promise<Uint8Array> => {
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

  it('turns a node about its origin: about the top-left corner it leaves its box, about the centre it stays', async () => {
    // The spinning image is 120 px square at (40, 40). A quarter turn clockwise
    // about its top-left corner puts it at x from -80 to 40; about its centre
    // it covers its own box again.
    const turned = (origin: { x: number; y: number }): unknown =>
      still('node-image-spin', (node) => {
        node['rotation'] = 90;
        node['origin'] = origin;
      });
    const corner = decodePng(await frameAt(turned({ x: 0, y: 0 })));
    const centre = decodePng(await frameAt(turned({ x: 500, y: 500 })));
    expect(near(pixel(corner, 20, 100), BACKGROUND)).toBe(false);
    expect(near(pixel(centre, 20, 100), BACKGROUND)).toBe(true);
    expect(near(pixel(centre, 100, 100), BACKGROUND)).toBe(false);
  });

  it('moves nothing by the origin alone, without rotation or scale (D68)', async () => {
    const at = (origin: { x: number; y: number }): unknown =>
      still('node-image-spin', (node) => {
        node['rotation'] = 0;
        node['origin'] = origin;
      });
    const a = await frameAt(at({ x: 0, y: 0 }));
    const b = await frameAt(at({ x: 500, y: 500 }));
    expect(samePixels(a, b), pixelReport('the origin alone', a, b)).toBe(true);
  });

  it('cuts the picture by its crop, and a crop of nothing is no crop', async () => {
    const cropped = (crop: Record<string, number>): unknown =>
      still('node-image-crop', (node) => {
        node['crop'] = crop;
      });
    const none = await frameAt(cropped({ top: 0, right: 0, bottom: 0, left: 0 }));
    const some = await frameAt(cropped({ top: 0, right: 300, bottom: 0, left: 300 }));
    expect(samePixels(none, some)).toBe(false);
  });

  it('rounds the corners of the box by its radius', async () => {
    // The round image is 120 px square at (440, 40), its picture framed in white.
    const rounded = (cornerRadius: number): unknown =>
      still('node-image-round', (node) => {
        node['width'] = 120;
        node['height'] = 120;
        node['cornerRadius'] = cornerRadius;
      });
    const square = decodePng(await frameAt(rounded(0)));
    const round = decodePng(await frameAt(rounded(60)));
    expect(near(pixel(square, 442, 42), BACKGROUND)).toBe(false);
    expect(near(pixel(round, 442, 42), BACKGROUND)).toBe(true);
    expect(pixel(round, 500, 100)).toEqual(pixel(square, 500, 100));
  });

  it('meets the golden frames of the motion composition in the pinned environment only (D26.5)', async () => {
    const environment = pinnedRun(chromium);
    const times = motionGoldenTimestamps.map(({ timeUs }) => timeUs);
    const { frames } = await renderFrames({
      document: motionComposition,
      resolveAsset,
      timesUs: times,
      chromium,
      ffmpeg: FFMPEG,
    });
    const goldens = existsSync(MOTION_MANIFEST)
      ? (JSON.parse(readFileSync(MOTION_MANIFEST, 'utf8')) as {
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
    rmSync(join(OUTPUT_DIRECTORY, 'motion', 'golden-comparison.json'), { force: true });
    writeReport('motion/golden-comparison.json', {
      environment,
      goldens: goldens !== null,
      report,
    });
    if (!environment.pinned) {
      console.info('Not the pinned environment: the motion golden frames are not asserted.');
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

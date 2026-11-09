/**
 * Effects drawn by SVG filters in pinned Chromium (D72): every kind changes
 * what it applies to, over an image, a text, and a video; a glow spills beyond
 * the box of its node; an SVG filter takes its place among the CSS functions in
 * the order of the list; a chroma key makes its key colour transparent, so the
 * node under it shows through; and the frames of the composition meet their
 * golden frames in the pinned environment (D26.5). Skipped without
 * `KADRION_FFMPEG` and `KADRION_FFPROBE`, since the composition has video
 * nodes; required where the run is pinned.
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
  effectsSvgComposition,
  effectsSvgGoldenTimestamps,
  generateReferenceAssets,
  GREEN_SCREEN_FIXTURE,
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
  samePixels,
  writeReport,
} from './support.js';
import { makeGreenScreenFixture, makeVideoFixture } from './video-fixture.ts';

const ffmpegPath = process.env.KADRION_FFMPEG;
const ffprobePath = process.env.KADRION_FFPROBE;
const available = ffmpegPath !== undefined && ffprobePath !== undefined;
const pinned = process.env[PINNED_IMAGE_VARIABLE] === PINNED_IMAGE;
const FFMPEG = { ffmpegPath: ffmpegPath ?? '', ffprobePath: ffprobePath ?? '' };
const MANIFEST = join(GOLDEN_DIRECTORY, 'effects-svg.golden-frames.json');
/** A frame of `scene-kinds`, which starts at 1.2 s, where every kind is at rest over every subject. */
const KINDS_US = 1_300_000;

const generated = Object.fromEntries(
  generateReferenceAssets().map(({ id, mediaType, bytes }) => [id, { mediaType, bytes }]),
);

interface NodeDraft {
  id: string;
  type: string;
  effects?: unknown[];
  children?: NodeDraft[];
}

interface Draft {
  scenes: { id: string; nodes: NodeDraft[] }[];
}

/** The composition with `edit` applied to a copy. */
function edited(edit: (draft: Draft) => void): unknown {
  const draft = structuredClone(effectsSvgComposition) as Draft;
  edit(draft);
  return draft;
}

function nodeOf(draft: Draft, id: string): NodeDraft {
  for (const node of draft.scenes.flatMap((scene) => scene.nodes)) {
    if (node.id === id) return node;
    const child = node.children?.find((item) => item.id === id);
    if (child !== undefined) return child;
  }
  throw new Error(`No node ${id}.`);
}

function without(draft: Draft, id: string): void {
  for (const scene of draft.scenes) scene.nodes = scene.nodes.filter((node) => node.id !== id);
}

describe('the pinned FFmpeg for the SVG effects composition (D72)', () => {
  it('is given wherever the run is pinned', () => {
    if (pinned) expect(available).toBe(true);
    if (!available) {
      console.info(
        'The SVG effects tests are skipped: KADRION_FFMPEG and KADRION_FFPROBE are not set.',
      );
    }
  });
});

describe.skipIf(!available)('effects drawn by SVG filters in pinned Chromium (D72)', () => {
  let chromium: LaunchedChromium;
  let video: Uint8Array;
  let green: Uint8Array;

  const resolveAsset: AssetResolver = ({ id }) => {
    if (id === VIDEO_FIXTURE.id) return { bytes: video, mediaType: VIDEO_FIXTURE.mediaType };
    if (id === GREEN_SCREEN_FIXTURE.id) {
      return { bytes: green, mediaType: GREEN_SCREEN_FIXTURE.mediaType };
    }
    return generated[id] ?? null;
  };

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
    green = await makeGreenScreenFixture(FFMPEG.ffmpegPath);
  });

  afterAll(async () => {
    await chromium.browser.close();
  });

  // One test per subject, so that each renders a third of the frames: every
  // frame is a whole job of the Producer.
  it.each(['image', 'text', 'video'])(
    'changes the picture of the %s with every kind',
    async (subject) => {
      const all = await frameAt(effectsSvgComposition, KINDS_US);
      const kinds = (effectsSvgComposition as Draft).scenes
        .find((scene) => scene.id === 'scene-kinds')
        ?.nodes.filter((node) => node.type !== 'background');
      expect(kinds).toHaveLength(16);
      const ofSubject = (kinds ?? []).filter((node) => node.type === subject);
      expect(ofSubject.length).toBeGreaterThan(0);
      for (const node of ofSubject) {
        const plain = await frameAt(
          edited((draft) => {
            nodeOf(draft, node.id).effects = [];
          }),
          KINDS_US,
        );
        expect(samePixels(all, plain), node.id).toBe(false);
      }
    },
  );

  it('spills a glow beyond the box of its node', async () => {
    // kinds-image-glow is at x 262 to 372, y 10 to 110, with a glow of radius
    // 5; the probe lies 3 px left of its box, on the background.
    const glowing = decodePng(await frameAt(effectsSvgComposition, KINDS_US));
    const plain = decodePng(
      await frameAt(
        edited((draft) => {
          nodeOf(draft, 'kinds-image-glow').effects = [];
        }),
        KINDS_US,
      ),
    );
    expect(pixel(glowing, 259, 60)).not.toEqual(pixel(plain, 259, 60));
    // Far from every node, the background is the same in both.
    expect(pixel(glowing, 630, 125)).toEqual(pixel(plain, 630, 125));
  });

  it('applies an SVG filter at its place among the CSS functions', async () => {
    const reversed = edited((draft) => {
      const node = nodeOf(draft, 'svg-chain');
      node.effects = [...(node.effects ?? [])].reverse();
    });
    const a = await frameAt(effectsSvgComposition, 600_000);
    const b = await frameAt(reversed, 600_000);
    expect(samePixels(a, b)).toBe(false);
  });

  it('makes the key colour transparent, so the node under it shows through', async () => {
    // A corner of svg-key (x 330 to 618, y 186 to 348) that is the green of
    // the plate of the video, where the scene's vignette is at rest at 0 s.
    const [x, y] = [334, 190];
    const keyed = decodePng(await frameAt(effectsSvgComposition, 0));
    const plateAlone = decodePng(
      await frameAt(
        edited((draft) => {
          without(draft, 'svg-key');
        }),
        0,
      ),
    );
    const noPlate = decodePng(
      await frameAt(
        edited((draft) => {
          without(draft, 'svg-plate');
        }),
        0,
      ),
    );
    const unkeyed = decodePng(
      await frameAt(
        edited((draft) => {
          nodeOf(draft, 'svg-key').effects = [];
        }),
        0,
      ),
    );
    expect(pixel(keyed, x, y)).toEqual(pixel(plateAlone, x, y));
    expect(pixel(keyed, x, y)).not.toEqual(pixel(noPlate, x, y));
    expect(pixel(keyed, x, y)).not.toEqual(pixel(unkeyed, x, y));
  });

  it('renders the SVG effects composition as its golden frames (D26.5)', async () => {
    const reportPath = 'effects-svg/golden-comparison.json';
    const environment = pinnedRun(chromium);
    const times = effectsSvgGoldenTimestamps.map(({ timeUs }) => timeUs);
    const { frames } = await renderFrames({
      document: effectsSvgComposition,
      resolveAsset,
      timesUs: times,
      chromium,
      ffmpeg: FFMPEG,
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

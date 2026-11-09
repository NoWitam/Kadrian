/**
 * Effects in pinned Chromium (D71): every kind changes what it applies to, over
 * an image, a text, and a video; a blur spills beyond the box of its node; the
 * order of the effects is the order they apply in; an effect animated in scene
 * time shows the same frame when its node, its keyframes, and the time move
 * together; and the frames of the effects composition meet their golden frames
 * in the pinned environment (D26.5). Skipped without `KADRION_FFMPEG` and
 * `KADRION_FFPROBE`, since the composition has video nodes; required where the
 * run is pinned.
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
  effectsComposition,
  effectsGoldenTimestamps,
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
const MANIFEST = join(GOLDEN_DIRECTORY, 'effects.golden-frames.json');
/** A frame of `scene-kinds`, where every kind is at rest over every subject. */
const KINDS_US = 2_000_000;

const generated = Object.fromEntries(
  generateReferenceAssets().map(({ id, mediaType, bytes }) => [id, { mediaType, bytes }]),
);

interface NodeDraft {
  id: string;
  type: string;
  startUs: number;
  effects?: { animations: { keyframes: { timeUs: number }[] }[] }[];
  children?: NodeDraft[];
}

interface Draft {
  scenes: { id: string; nodes: NodeDraft[] }[];
}

/** The effects composition with `edit` applied to a copy. */
function edited(edit: (draft: Draft) => void): unknown {
  const draft = structuredClone(effectsComposition) as Draft;
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

describe('the pinned FFmpeg for the effects composition (D71)', () => {
  it('is given wherever the run is pinned', () => {
    if (pinned) expect(available).toBe(true);
    if (!available) {
      console.info(
        'The effects tests are skipped: KADRION_FFMPEG and KADRION_FFPROBE are not set.',
      );
    }
  });
});

describe.skipIf(!available)('effects in pinned Chromium (D71)', () => {
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

  // One test per subject, so that each renders a third of the frames: every
  // frame is a whole job of the Producer.
  it.each(['image', 'text', 'video'])(
    'changes the picture of the %s with every kind',
    async (subject) => {
      const all = await frameAt(effectsComposition, KINDS_US);
      const kinds = (effectsComposition as Draft).scenes
        .find((scene) => scene.id === 'scene-kinds')
        ?.nodes.filter((node) => node.type !== 'background');
      expect(kinds).toHaveLength(27);
      const ofSubject = (kinds ?? []).filter((node) => node.type === subject);
      expect(ofSubject.length).toBeGreaterThan(0);
      for (const node of ofSubject) {
        const without = await frameAt(
          edited((draft) => {
            nodeOf(draft, node.id).effects = [];
          }),
          KINDS_US,
        );
        expect(samePixels(all, without), node.id).toBe(false);
      }
    },
  );

  it('spills a blur beyond the box of its node', async () => {
    // effects-blur is at x 20 to 160, y 20 to 160, blurred by 8 at 0 s; the
    // probe lies 4 px left of its box, on the background.
    const blurred = decodePng(await frameAt(effectsComposition, 0));
    const sharp = decodePng(
      await frameAt(
        edited((draft) => {
          nodeOf(draft, 'effects-blur').effects = [];
        }),
        0,
      ),
    );
    expect(pixel(blurred, 16, 90)).not.toEqual(pixel(sharp, 16, 90));
    // Far from every node, the background is the same in both.
    expect(pixel(blurred, 330, 175)).toEqual(pixel(sharp, 330, 175));
  });

  it('applies the effects in their order', async () => {
    const reversed = edited((draft) => {
      const node = nodeOf(draft, 'effects-text');
      node.effects = [...(node.effects ?? [])].reverse();
    });
    const a = await frameAt(effectsComposition, 600_000);
    const b = await frameAt(reversed, 600_000);
    expect(samePixels(a, b)).toBe(false);
  });

  it('shows the same frame when a node, the keyframes of its effects, and the time move together', async () => {
    // Three frames at 30 fps, so that every time moved is a frame time too. The
    // blurred image is alone on its scene's background, so nothing else moves.
    const shiftUs = 100_000;
    const alone = (shift: number) =>
      edited((draft) => {
        const [scene] = draft.scenes;
        if (scene === undefined) throw new Error('No scene.');
        scene.nodes = scene.nodes.filter(
          (node) => node.type === 'background' || node.id === 'effects-blur',
        );
        const node = nodeOf(draft, 'effects-blur');
        node.startUs += shift;
        for (const effect of node.effects ?? []) {
          for (const animation of effect.animations) {
            for (const keyframe of animation.keyframes) keyframe.timeUs += shift;
          }
        }
      });
    for (const timeUs of [133_333, 200_000, 400_000]) {
      const original = await frameAt(alone(0), timeUs);
      const moved = await frameAt(alone(shiftUs), timeUs + shiftUs);
      expect(
        samePixels(original, moved),
        pixelReport(`blur moved at ${String(timeUs)}`, original, moved),
      ).toBe(true);
    }
  });

  it('renders the effects composition as its golden frames (D26.5)', async () => {
    const reportPath = 'effects/golden-comparison.json';
    const environment = pinnedRun(chromium);
    const times = effectsGoldenTimestamps.map(({ timeUs }) => timeUs);
    const { frames } = await renderFrames({
      document: effectsComposition,
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

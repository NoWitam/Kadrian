/**
 * SVG assets in pinned Chromium (D74): an asset the sanitiser refuses fails the
 * render with `svg-refused`, naming its offence, and nothing is drawn; the
 * shape nodes that `svgToShapes` gives for a drawing show what an image node
 * of the same asset shows, but for the edges that each draws with its own
 * anti-aliasing; and the frames of the SVG composition meet their golden
 * frames in the pinned environment (D26.5). The composition has no video, so
 * no FFmpeg is needed.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { svgToShapes } from '@kadrion/editor-sdk';
import { launchChromium, renderFrames, sha256, type LaunchedChromium } from '@kadrion/producer';
import { SVG_BADGE, svgComposition, svgGoldenTimestamps } from '@kadrion/test-fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Pixels } from '../parity/parity.js';

import {
  decodePng,
  difference,
  GOLDEN_DIRECTORY,
  OUTPUT_DIRECTORY,
  pinnedRun,
  referenceResolver,
  writeReport,
} from './support.js';

const MANIFEST = join(GOLDEN_DIRECTORY, 'svg.golden-frames.json');
/** The box both the image and the shapes are drawn in, for the comparison. */
const BOX = { x: 340, y: 40, width: 280, height: 210 } as const;
/** A pixel whose channels differ by more than this is an edge drawn otherwise, or worse. */
const EDGE_DELTA = 48;

interface NodeDraft {
  id: string;
  type: string;
  position?: { x: number; y: number };
  animations: unknown[];
}

interface Draft {
  assets: { id: string; contentHash: string }[];
  scenes: { nodes: NodeDraft[] }[];
}

function draftOf(): Draft {
  return structuredClone(svgComposition) as Draft;
}

/** The pixels of `box` in `a` and `b` whose channels differ by more than `delta`. */
function differingIn(a: Pixels, b: Pixels, delta: number): number {
  let count = 0;
  for (let y = BOX.y; y < BOX.y + BOX.height; y += 1) {
    for (let x = BOX.x; x < BOX.x + BOX.width; x += 1) {
      const at = (y * a.width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const found = Math.abs((a.data[at + channel] ?? 0) - (b.data[at + channel] ?? 0));
        if (found > delta) {
          count += 1;
          break;
        }
      }
    }
  }
  return count;
}

describe('SVG assets in pinned Chromium (D74)', () => {
  let chromium: LaunchedChromium;

  const frameAt = async (
    document: unknown,
    timeUs: number,
    resolveAsset = referenceResolver,
  ): Promise<Uint8Array> => {
    const { frames } = await renderFrames({ document, resolveAsset, timesUs: [timeUs], chromium });
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

  it('refuses an SVG asset with a script, naming the offence (D74.2)', async () => {
    const hostile = new TextEncoder().encode(
      SVG_BADGE.replace('</svg>', '<script>parent.postMessage(1, "*")</script></svg>'),
    );
    const draft = draftOf();
    const asset = draft.assets.find(({ id }) => id === 'asset-svg');
    if (asset === undefined) throw new Error('No asset-svg.');
    asset.contentHash = sha256(hostile);
    await expect(
      frameAt(draft, 0, ({ id }) =>
        id === 'asset-svg' ? { bytes: hostile, mediaType: 'image/svg+xml' } : null,
      ),
    ).rejects.toMatchObject({
      name: 'ProducerError',
      code: 'svg-refused',
      message: expect.stringContaining('svg-script') as unknown,
    });
  });

  it('shows the shapes of svgToShapes as the image of the same asset shows them (D74.5)', async () => {
    // The same box, once with the image of the badge and once with its shapes,
    // nothing animated and nothing else drawn over the background.
    const background = draftOf().scenes[0]?.nodes[0];
    if (background === undefined) throw new Error('No background.');
    const imageOnly = draftOf();
    const image = imageOnly.scenes[0]?.nodes.find(({ id }) => id === 'image-svg');
    if (image === undefined) throw new Error('No image-svg.');
    image.position = { x: BOX.x, y: BOX.y };
    imageOnly.scenes[0] = { ...imageOnly.scenes[0], nodes: [background, image] };
    const shapesOnly = draftOf();
    const shapes = svgToShapes(SVG_BADGE, {
      idPrefix: 'badge',
      ...BOX,
      startUs: 0,
      durationUs: 1_600_000,
    });
    shapesOnly.scenes[0] = {
      ...shapesOnly.scenes[0],
      nodes: [background, ...(shapes as unknown as NodeDraft[])],
    };
    const fromImage = decodePng(await frameAt(imageOnly, 0));
    const fromShapes = decodePng(await frameAt(shapesOnly, 0));
    const whole = difference(fromImage, fromShapes);
    const edges = differingIn(fromImage, fromShapes, EDGE_DELTA);
    const share = edges / (BOX.width * BOX.height);
    writeReport('svg/shapes-against-image.json', {
      box: BOX,
      edgeDelta: EDGE_DELTA,
      edges,
      share,
      whole,
    });
    // The drawing is the same: the two differ in more than a small share of
    // the box only where an edge is anti-aliased otherwise.
    expect(share).toBeLessThan(0.001);
    // And the premise: the drawing is there, unlike the bare background.
    const bare = draftOf();
    bare.scenes[0] = { ...bare.scenes[0], nodes: [background] };
    const empty = decodePng(await frameAt(bare, 0));
    expect(differingIn(fromImage, empty, EDGE_DELTA) / (BOX.width * BOX.height)).toBeGreaterThan(
      0.3,
    );
  });

  it('renders the SVG composition as its golden frames (D26.5)', async () => {
    const reportPath = 'svg/golden-comparison.json';
    const environment = pinnedRun(chromium);
    const times = svgGoldenTimestamps.map(({ timeUs }) => timeUs);
    const { frames } = await renderFrames({
      document: svgComposition,
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

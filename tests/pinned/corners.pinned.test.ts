/**
 * The four corners of a node in pinned Chromium (D91.1, D65.8). The fixture of
 * corners holds the probes of D91.1: the corners of an image (with a crop, a
 * corner radius, a shape mask, and a drop shadow), a text with a frame, a
 * shape turned 30° about `250, 750` and flipped, a group, and an instance; and
 * a shape whose animated quadrilateral turns concave after 555 556 µs. Its
 * frames meet their golden frames (D26.5); every probe is a frame that does not
 * depend on the frames rendered before it, the Player shows the Producer's
 * frame exactly, and each host gives the same frame twice. Each corner lands
 * where it is sent, and a frame where the quadrilateral is concave draws
 * nothing of the node. Every document of 0.29 writes the transform it wrote
 * before, which the golden frames of the other compositions prove: their PNG
 * files keep their bytes.
 *
 * The matte probe of question 2 of D91: the same perspective `matrix3d` on an
 * HTML element and on an SVG element in a `<mask>`. Chromium draws the SVG
 * element as the affine map without its perspective (PR-95), so a matte has no
 * corners (`invalid-corners`), and this test keeps the measurement.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  contextOptions,
  launchChromium,
  renderFrames,
  type LaunchedChromium,
} from '@kadrion/producer';
import type { AssetResolver } from '@kadrion/renderer-dom';
import { movedCorners, type CornerOffsets, type CornerTransform } from '@kadrion/schema';
import {
  cornersComposition,
  cornersGoldenTimestamps,
  generateProportionalFontAsset,
  generateReferenceAssets,
} from '@kadrion/test-fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeConformanceHost, openConformanceHost, seekAndCapture } from './conformance-host.js';
import {
  decodePng,
  difference,
  differingPixels,
  GOLDEN_DIRECTORY,
  OUTPUT_DIRECTORY,
  pinnedRun,
  pixel,
  samePixels,
  writeReport,
  type Pixels,
} from './support.js';

const MANIFEST = join(GOLDEN_DIRECTORY, 'corners.golden-frames.json');
const TIMES = cornersGoldenTimestamps.map(({ timeUs }) => timeUs);
/** The first frame whose animated quadrilateral is concave, and the frame before it. */
const CONCAVE_US = 566_666;
const CONVEX_US = 533_333;
/** The probes: the golden timestamps and the frames on either side of the concave turn. */
const PROBE_TIMES = [...TIMES, CONVEX_US, CONCAVE_US];
/** Another time, rendered or sought before a probe's time. */
const OTHER_US = 233_333;

const FONT = generateProportionalFontAsset();
const IMAGE = generateReferenceAssets().find(({ id }) => id === 'asset-image');
if (IMAGE === undefined) throw new Error('No image asset.');
const ASSETS = [IMAGE, FONT];
const resolver: AssetResolver = ({ id }) => {
  const asset = ASSETS.find((candidate) => candidate.id === id);
  return asset === undefined ? null : { mediaType: asset.mediaType, bytes: asset.bytes };
};

type DraftNode = Record<string, unknown> & { id: string };
type Draft = { scenes: { nodes: DraftNode[] }[] };

/** The node of the fixture by ID, as the document stores it. */
function fixtureNode(id: string): DraftNode {
  const node = (cornersComposition as Draft).scenes[0]?.nodes.find(
    (candidate) => candidate.id === id,
  );
  if (node === undefined) throw new Error(`No node ${id}.`);
  return node;
}

/** The fixture without the node `id`. */
function without(id: string): unknown {
  const draft = structuredClone(cornersComposition) as Draft;
  for (const scene of draft.scenes) scene.nodes = scene.nodes.filter((node) => node.id !== id);
  return draft;
}

let chromium: LaunchedChromium;

beforeAll(async () => {
  chromium = await launchChromium();
}, 60_000);

afterAll(async () => {
  await chromium.browser.close();
});

/** The Producer's frame at `timeUs`, after the frames at `before` in the same render. */
async function produced(
  document: unknown,
  timeUs: number,
  before: readonly number[] = [],
): Promise<Uint8Array> {
  const { frames } = await renderFrames({
    document,
    resolveAsset: resolver,
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
  mkdirSync(join(OUTPUT_DIRECTORY, 'corners'), { recursive: true });
  writeFileSync(join(OUTPUT_DIRECTORY, 'corners', `${slug}-expected.png`), expected);
  writeFileSync(join(OUTPUT_DIRECTORY, 'corners', `${slug}-found.png`), found);
  writeReport(join('corners', `${slug}-pixels.json`), {
    pixels: differingPixels(decodePng(expected), decodePng(found), 2000),
  });
}

describe('the corners in pinned Chromium (D91.1)', () => {
  it('renders the fixture of corners as its golden frames (D26.5)', async () => {
    const reportPath = 'corners/golden-comparison.json';
    const environment = pinnedRun(chromium);
    const { frames } = await renderFrames({
      document: cornersComposition,
      resolveAsset: resolver,
      timesUs: TIMES,
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
    expect(report).toHaveLength(TIMES.length);
    for (const { timeUs, difference: found } of report) {
      expect(found?.differingPixels, String(timeUs)).toBe(0);
    }
  }, 300_000);

  it('shows every probe in the Player as the Producer renders it, each host twice the same', async () => {
    const rows: {
      timeUs: number;
      producerTwice: boolean;
      afterAnotherFrame: boolean;
      playerTwice: boolean;
      differingPixels: number;
    }[] = [];
    const host = await openConformanceHost(chromium, JSON.stringify(cornersComposition), ASSETS);
    try {
      for (const timeUs of PROBE_TIMES) {
        const first = await produced(cornersComposition, timeUs);
        const second = await produced(cornersComposition, timeUs);
        const later = await produced(cornersComposition, timeUs, [OTHER_US]);
        const shown = await seekAndCapture(host, timeUs, null);
        await seekAndCapture(host, OTHER_US, null);
        const again = await seekAndCapture(host, timeUs, null);
        rows.push({
          timeUs,
          producerTwice: samePixels(first, second),
          afterAnotherFrame: samePixels(first, later),
          playerTwice: samePixels(shown.png, again.png),
          differingPixels: difference(decodePng(first), decodePng(shown.png)).differingPixels,
        });
        if (!samePixels(first, later)) evidence(`${String(timeUs)} after another`, first, later);
        if (!samePixels(first, shown.png)) evidence(`${String(timeUs)} player`, first, shown.png);
      }
    } finally {
      await closeConformanceHost(host);
    }
    writeReport(join('corners', 'probes.json'), { environment: pinnedRun(chromium), rows });
    expect(rows).toHaveLength(PROBE_TIMES.length);
    for (const row of rows) {
      expect(row, String(row.timeUs)).toEqual({
        timeUs: row.timeUs,
        producerTwice: true,
        afterAnotherFrame: true,
        playerTwice: true,
        differingPixels: 0,
      });
    }
  }, 900_000);

  it('sends each corner of a solid shape where its offset says, and draws nothing of it while concave', async () => {
    // `corners-animated`: #fdb022 at 452, 210, 100 by 100, its top-left corner
    // moved by 90, 90 over 1 s, linearly; at 500 000 µs by 45, 45.
    const node = fixtureNode('corners-animated');
    const transform = node as unknown as CornerTransform;
    const offsets: CornerOffsets = {
      topLeft: { x: 45, y: 45 },
      topRight: { x: 0, y: 0 },
      bottomRight: { x: 0, y: 0 },
      bottomLeft: { x: 0, y: 0 },
    };
    const quadrilateral = movedCorners({ width: 100, height: 100 }, transform, offsets);
    const centre = {
      x: quadrilateral.reduce((sum, { x }) => sum + x, 0) / 4,
      y: quadrilateral.reduce((sum, { y }) => sum + y, 0) / 4,
    };
    const frame = decodePng(await produced(cornersComposition, 500_000));
    const yellow = (image: Pixels, x: number, y: number): boolean => {
      const [r, g, b] = pixel(image, Math.floor(x), Math.floor(y));
      return Math.abs(r - 0xfd) <= 2 && Math.abs(g - 0xb0) <= 2 && Math.abs(b - 0x22) <= 2;
    };
    const rows = quadrilateral.map((corner) => {
      const towards = { x: centre.x - corner.x, y: centre.y - corner.y };
      const length = Math.hypot(towards.x, towards.y);
      const step = (distance: number): { x: number; y: number } => ({
        x: corner.x + (towards.x / length) * distance,
        y: corner.y + (towards.y / length) * distance,
      });
      return {
        corner,
        inside: yellow(frame, step(4).x, step(4).y),
        outside: yellow(frame, step(-4).x, step(-4).y),
      };
    });
    // Concave: the frame is the fixture's without the node, pixel for pixel.
    const concave = await produced(cornersComposition, CONCAVE_US);
    const absent = await produced(without('corners-animated'), CONCAVE_US);
    const convex = await produced(cornersComposition, CONVEX_US);
    const absentBefore = await produced(without('corners-animated'), CONVEX_US);
    writeReport(join('corners', 'landing.json'), {
      environment: pinnedRun(chromium),
      rows,
      concaveDrawsNothing: samePixels(concave, absent),
      convexDraws: !samePixels(convex, absentBefore),
    });
    for (const row of rows) {
      expect(row.inside, JSON.stringify(row.corner)).toBe(true);
      expect(row.outside, JSON.stringify(row.corner)).toBe(false);
    }
    expect(samePixels(concave, absent)).toBe(true);
    expect(samePixels(convex, absentBefore)).toBe(false);
  }, 300_000);
});

describe('the matte probe of question 2 of D91 (PR-95)', () => {
  /** A perspective homography of a 100 by 100 box, as the renderer writes one. */
  const PERSPECTIVE =
    'matrix3d(1.2, 0.1, 0, 0.0008, -0.2, 0.9, 0, 0.0005, 0, 0, 1, 0, 40, 30, 0, 1)';
  /** The same matrix without its perspective: what an affine map draws. */
  const AFFINE = 'matrix3d(1.2, 0.1, 0, 0, -0.2, 0.9, 0, 0, 0, 0, 1, 0, 40, 30, 0, 1)';
  const box = (matrix: string): string =>
    `<div style="position:absolute;left:0;top:0;width:100px;height:100px;background:#fff;transform-origin:0 0;transform:${matrix}"></div>`;
  /**
   * Four panels of 200 by 200 on black: the HTML element with the perspective,
   * the same box as an SVG `<rect>` in a `<mask>` of a white rectangle (a
   * matte, D75), the HTML element with the affine matrix, and the `<rect>`
   * outside a mask.
   */
  const PAGE = `<!doctype html><html><head><meta name="color-scheme" content="normal"></head>
<body style="margin:0;background:#000;width:800px;height:200px;overflow:hidden">
<div style="position:absolute;left:0;top:0;width:200px;height:200px">${box(PERSPECTIVE)}</div>
<svg style="position:absolute;left:200px;top:0" width="200" height="200">
  <defs><mask id="matte" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
    <rect x="0" y="0" width="100" height="100" fill="#fff" style="transform-origin:0 0;transform:${PERSPECTIVE}"/>
  </mask></defs>
  <rect x="0" y="0" width="200" height="200" fill="#fff" mask="url(#matte)"/>
</svg>
<div style="position:absolute;left:400px;top:0;width:200px;height:200px">${box(AFFINE)}</div>
<svg style="position:absolute;left:600px;top:0" width="200" height="200">
  <rect x="0" y="0" width="100" height="100" fill="#fff" style="transform-origin:0 0;transform:${PERSPECTIVE}"/>
</svg>
</body></html>`;

  /** The pixels of panel `a` and of panel `b` whose red differs by more than `tolerance`. */
  function panelDifference(image: Pixels, a: number, b: number, tolerance = 0): number {
    let count = 0;
    for (let y = 0; y < 200; y += 1) {
      for (let x = 0; x < 200; x += 1) {
        const [first] = pixel(image, a * 200 + x, y);
        const [second] = pixel(image, b * 200 + x, y);
        if (Math.abs(first - second) > tolerance) count += 1;
      }
    }
    return count;
  }

  async function shot(): Promise<Pixels> {
    const context = await chromium.browser.newContext(contextOptions(800, 200));
    try {
      const page = await context.newPage();
      await page.setContent(PAGE);
      return decodePng(new Uint8Array(await page.screenshot({ type: 'png' })));
    } finally {
      await context.close();
    }
  }

  it('measures that Chromium draws a perspective matrix3d in an SVG mask as the affine map', async () => {
    const first = await shot();
    const second = await shot();
    const pixels = (image: Pixels): number[] => [...image.data];
    const row = {
      twice: JSON.stringify(pixels(first)) === JSON.stringify(pixels(second)),
      matteVsPerspective: panelDifference(first, 1, 0, 8),
      matteVsAffine: panelDifference(first, 1, 2, 8),
      plainSvgVsAffine: panelDifference(first, 3, 2, 8),
      perspectiveVsAffine: panelDifference(first, 0, 2, 8),
    };
    writeReport(join('corners', 'matte-probe.json'), { environment: pinnedRun(chromium), row });
    expect(row.twice).toBe(true);
    // The premise: the perspective changes what an HTML element draws.
    expect(row.perspectiveVsAffine).toBeGreaterThan(500);
    // The matte draws the affine map, not the perspective: a matte has no corners.
    expect(row.matteVsPerspective).toBeGreaterThan(500);
    expect(row.matteVsAffine).toBeLessThan(row.matteVsPerspective / 10);
    expect(row.plainSvgVsAffine).toBeLessThan(row.perspectiveVsAffine / 10);
  }, 120_000);
});

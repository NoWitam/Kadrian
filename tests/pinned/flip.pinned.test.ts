/**
 * The mirror flip of a node in pinned Chromium (D89.3, D65.8): the probes of
 * the flip on `x`, on `y`, and on both; with a rotation of 30° about
 * `250, 750`; and on an image with a crop, a corner radius, and a drop shadow.
 * Each is made on the composition of compositing (D75), with the flip on an
 * image, a text, a shape, a group, and a matte that is itself flipped, at a
 * time when that matte is active. Every probe is a frame that does not depend
 * on the frames rendered before it; the Player shows the Producer's frame of
 * every probe exactly, and each host gives the same frame twice. A flip
 * changes nothing outside the node's box, and inside it the picture is its
 * source mirrored, pixel for pixel. No probe has golden frames: the frames of
 * the existing compositions keep theirs, since no flip writes nothing (D89.3).
 *
 * The probes hold still what the composition of compositing turns inside its
 * masks (the geometry and feather of two shape masks, the turn of the star
 * matte), and the rotation probe turns every flipped node but the matte.
 * Content turned off the axes inside an SVG mask is painted differently by the
 * first frame of a page than by every frame after it, flip or no flip: the
 * unflipped composition at 1 s differs in 186 pixels, by 1 level, between a
 * frame rendered alone and one rendered after any other frame, the same time
 * included, in both hosts (PR-89, measured in the pinned container). That is
 * a defect of masks (D75) of its own, outside the flip; the probes measure the
 * flip on frames that are free of it, and the test asserts that they are.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { launchChromium, renderFrames, type LaunchedChromium } from '@kadrion/producer';
import {
  compositingComposition,
  generateReferenceAssets,
  IMAGE_SIZE,
} from '@kadrion/test-fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeConformanceHost, openConformanceHost, seekAndCapture } from './conformance-host.js';
import {
  decodePng,
  difference,
  differingPixels,
  OUTPUT_DIRECTORY,
  pinnedRun,
  pixel,
  referenceResolver,
  samePixels,
  writeReport,
  type Pixels,
} from './support.js';

/** A time when the matte `matte-gradient` is active (it starts at 0.5 s). */
const TIME_US = 1_000_000;
/** Another time, rendered or sought before a probe's time. */
const OTHER_US = 0;

/** The nodes each probe flips: an image, a text, a shape, a group, and a flipped matte (D89.3). */
const FLIPPED = [
  'mask-shape-photo',
  'mask-text',
  'mask-image-bar',
  'matte-group',
  'matte-gradient',
];
/** The matte among them, which the rotation probe flips but does not turn. */
const MATTE = 'matte-gradient';

/** The image of the probe with a crop, a corner radius, and a drop shadow. */
const PHOTO = 'mask-shape-photo';
/** Its position in the frame (`compositing.json`). */
const PHOTO_AT = { x: 300, y: 12 } as const;

type Flip = { readonly x: boolean; readonly y: boolean };
type DraftNode = Record<string, unknown> & { id: string; children?: DraftNode[] };
type Draft = { scenes: { nodes: DraftNode[] }[] };

function nodesOf(draft: Draft): DraftNode[] {
  const all = (nodes: readonly DraftNode[]): DraftNode[] =>
    nodes.flatMap((node) => [node, ...all(node.children ?? [])]);
  return all(draft.scenes.flatMap((scene) => scene.nodes));
}

/**
 * The composition of compositing with what it turns inside its masks held
 * still: no animation of a mask, and the star matte at its rest turn, 0 (see
 * the header).
 */
function still(): Draft {
  const draft = structuredClone(compositingComposition) as Draft;
  for (const node of nodesOf(draft)) {
    const mask = node['mask'] as Record<string, unknown> | undefined;
    if (mask !== undefined && 'animations' in mask) mask['animations'] = [];
    if (node.id === 'matte-star') node['animations'] = [];
  }
  return draft;
}

/** That composition with `edit` applied to every node a probe names, children included. */
function edited(ids: readonly string[], edit: (node: DraftNode) => void): unknown {
  const draft = still();
  const found = nodesOf(draft).filter(({ id }) => ids.includes(id));
  expect(found.map(({ id }) => id).sort()).toEqual([...ids].sort());
  for (const node of found) edit(node);
  return draft;
}

function flipped(flip: Flip, ids: readonly string[] = FLIPPED): unknown {
  return edited(ids, (node) => {
    node['flip'] = flip;
  });
}

const PROBES: readonly { readonly name: string; readonly document: unknown }[] = [
  { name: 'x', document: flipped({ x: true, y: false }) },
  { name: 'y', document: flipped({ x: false, y: true }) },
  { name: 'both', document: flipped({ x: true, y: true }) },
  {
    name: 'x with a rotation of 30 degrees about 250, 750',
    document: edited(FLIPPED, (node) => {
      node['flip'] = { x: true, y: false };
      if (node.id === MATTE) return;
      node['rotation'] = 30;
      node['origin'] = { x: 250, y: 750 };
    }),
  },
  ...[
    { name: 'x', flip: { x: true, y: false } },
    { name: 'both', flip: { x: true, y: true } },
  ].map(({ name, flip }) => ({
    name: `${name} of an image with a crop, a corner radius, and a drop shadow`,
    document: edited([PHOTO], (node) => {
      node['flip'] = flip;
      node['crop'] = { top: 100, right: 0, bottom: 0, left: 200 };
      node['cornerRadius'] = 24;
      node['effects'] = [
        {
          id: 'flip-shadow',
          kind: 'drop-shadow',
          color: '#f04438',
          opacity: 1,
          offset: { x: 12, y: 6 },
          blur: 4,
          animations: [],
        },
      ];
    }),
  })),
];

const ASSETS = generateReferenceAssets().filter(
  ({ id }) => id === 'asset-image' || id === 'asset-font',
);

let chromium: LaunchedChromium;

beforeAll(async () => {
  chromium = await launchChromium();
}, 60_000);

afterAll(async () => {
  await chromium.browser.close();
});

/** The Producer's frame at the probe's time, after the frames at `before` in the same render. */
async function produced(document: unknown, before: readonly number[] = []): Promise<Uint8Array> {
  const { frames } = await renderFrames({
    document,
    resolveAsset: referenceResolver,
    timesUs: [...before, TIME_US],
    chromium,
  });
  const png = frames.at(-1)?.png;
  if (png === undefined) throw new Error(`No frame at ${String(TIME_US)}.`);
  return png;
}

/** The PNGs and the differing pixels of two frames that should be equal, beside the report. */
function evidence(name: string, expected: Uint8Array, found: Uint8Array): void {
  const slug = name.replace(/[^a-z0-9]+/g, '-');
  mkdirSync(join(OUTPUT_DIRECTORY, 'flip'), { recursive: true });
  writeFileSync(join(OUTPUT_DIRECTORY, 'flip', `${slug}-expected.png`), expected);
  writeFileSync(join(OUTPUT_DIRECTORY, 'flip', `${slug}-found.png`), found);
  writeReport(join('flip', `${slug}-pixels.json`), {
    pixels: differingPixels(decodePng(expected), decodePng(found), 2000),
  });
}

describe('the probes of the flip in both hosts (D89.3, D65.8)', () => {
  it('shows every probe in the Player as the Producer renders it, each host twice the same', async () => {
    const plain = await produced(still());
    const rows: {
      name: string;
      producerTwice: boolean;
      afterAnotherFrame: boolean;
      playerTwice: boolean;
      differingPixels: number;
      changesTheFrame: boolean;
    }[] = [];
    for (const { name, document } of PROBES) {
      const first = await produced(document);
      const second = await produced(document);
      const later = await produced(document, [OTHER_US]);
      const host = await openConformanceHost(chromium, JSON.stringify(document), ASSETS);
      try {
        const shown = await seekAndCapture(host, TIME_US, null);
        await seekAndCapture(host, OTHER_US, null);
        const again = await seekAndCapture(host, TIME_US, null);
        rows.push({
          name,
          producerTwice: samePixels(first, second),
          afterAnotherFrame: samePixels(first, later),
          playerTwice: samePixels(shown.png, again.png),
          differingPixels: difference(decodePng(first), decodePng(shown.png)).differingPixels,
          changesTheFrame: !samePixels(first, plain),
        });
        if (!samePixels(first, later)) evidence(`${name} after another frame`, first, later);
        if (!samePixels(first, shown.png)) evidence(`${name} in the Player`, first, shown.png);
      } finally {
        await closeConformanceHost(host);
      }
    }
    writeReport(join('flip', 'probes.json'), { environment: pinnedRun(chromium), rows });
    expect(rows).toHaveLength(PROBES.length);
    for (const row of rows) {
      expect(row, row.name).toEqual({
        name: row.name,
        producerTwice: true,
        afterAnotherFrame: true,
        playerTwice: true,
        differingPixels: 0,
        changesTheFrame: true,
      });
    }
  }, 600_000);
});

describe('what a flip changes in the frame (D89.3)', () => {
  /**
   * The photo at its natural size, 128 by 128 with `fill`, and without its
   * mask, flipped as given: the frame then holds the source's pixels
   * unresampled, so its mirror is exact. At the 150 pixels of the fixture the
   * picture is resampled, and the browser's sampling positions, quantised to
   * a fraction of a pixel, are not symmetric about the box's centre: at the
   * sharp edges of the fixture's quadrants a mirrored pixel differed from its
   * original by up to 10 levels, with no pixel outside the box changed (PR-89,
   * measured in the pinned container).
   */
  const photo = (flip: Flip): unknown =>
    edited([PHOTO], (node) => {
      node['mask'] = { kind: 'none' };
      node['width'] = IMAGE_SIZE;
      node['height'] = IMAGE_SIZE;
      node['fit'] = 'fill';
      node['flip'] = flip;
    });

  const asset = ASSETS.find(({ id }) => id === 'asset-image');
  if (asset === undefined) throw new Error('No image asset.');
  const source = decodePng(asset.bytes);

  const inBox = (x: number, y: number): boolean =>
    x >= PHOTO_AT.x &&
    x < PHOTO_AT.x + IMAGE_SIZE &&
    y >= PHOTO_AT.y &&
    y < PHOTO_AT.y + IMAGE_SIZE;

  /** The pixels of the box that are not the source's pixel mirrored as `flip` says. */
  function notMirrored(frame: Pixels, flip: Flip): number {
    let count = 0;
    for (let y = 0; y < IMAGE_SIZE; y += 1) {
      for (let x = 0; x < IMAGE_SIZE; x += 1) {
        const shown = pixel(frame, PHOTO_AT.x + x, PHOTO_AT.y + y);
        const mirrored = pixel(
          source,
          flip.x ? IMAGE_SIZE - 1 - x : x,
          flip.y ? IMAGE_SIZE - 1 - y : y,
        );
        if (shown.some((channel, at) => channel !== mirrored[at])) count += 1;
      }
    }
    return count;
  }

  it('keeps every pixel outside the box, and shows the source mirrored inside it, pixel for pixel', async () => {
    const unflipped = decodePng(await produced(photo({ x: false, y: false })));
    const rows: { flip: Flip; outsideChanged: number; notMirrored: number; changed: number }[] = [];
    for (const flip of [
      { x: true, y: false },
      { x: false, y: true },
      { x: true, y: true },
    ]) {
      const frame = decodePng(await produced(photo(flip)));
      let outsideChanged = 0;
      for (let y = 0; y < frame.height; y += 1) {
        for (let x = 0; x < frame.width; x += 1) {
          if (inBox(x, y)) continue;
          const [r, g, b] = pixel(frame, x, y);
          const [r0, g0, b0] = pixel(unflipped, x, y);
          if (r !== r0 || g !== g0 || b !== b0) outsideChanged += 1;
        }
      }
      rows.push({
        flip,
        outsideChanged,
        notMirrored: notMirrored(frame, flip),
        // The source is not symmetric, so a flip changes the box.
        changed: notMirrored(frame, { x: false, y: false }),
      });
    }
    writeReport(join('flip', 'mirror.json'), {
      environment: pinnedRun(chromium),
      unflippedNotSource: notMirrored(unflipped, { x: false, y: false }),
      rows,
    });
    // The premise: unflipped, the box holds the source as it is.
    expect(notMirrored(unflipped, { x: false, y: false })).toBe(0);
    for (const row of rows) {
      expect(row.outsideChanged, JSON.stringify(row.flip)).toBe(0);
      expect(row.notMirrored, JSON.stringify(row.flip)).toBe(0);
      expect(row.changed, JSON.stringify(row.flip)).toBeGreaterThan(0);
    }
  }, 300_000);
});

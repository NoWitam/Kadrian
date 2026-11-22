/**
 * The transparent clear in pinned Chromium (D89.2). Every frame of the
 * transparent composition is a PNG with alpha: what no node covers is
 * transparent black, an opaque node is opaque, a node at half opacity and a
 * gradient to transparent leave the alpha they paint, and a node of blend mode
 * `multiply` multiplies where it lies over a node and is itself where it lies
 * over the clear (D75). Its frames meet their golden frames (D26.5). A PNG
 * still is the frame; a WebP still keeps the alpha; a JPEG still and an MP4 of
 * the transparent document are, byte for byte, those of the same document with
 * a white clear. In the Player, a dark host page shows through what no node
 * covers of a transparent document, and a white document stays white, because
 * the frame and the page both state the colour scheme `normal` (D28.1). No
 * node has a mask or a matte, whose rotated content a page paints differently
 * by its render history (PR-89).
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import {
  awaitPresented,
  captureFrame,
  exportMp4,
  launchChromium,
  renderFrames,
  renderStill,
  sha256,
  type LaunchedChromium,
} from '@kadrion/producer';
import { frameToTimeUs } from '@kadrion/schema';
import { clearComposition, clearGoldenTimestamps } from '@kadrion/test-fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeConformanceHost, openConformanceHost, playerState } from './conformance-host.js';
import {
  decodePng,
  difference,
  GOLDEN_DIRECTORY,
  OUTPUT_DIRECTORY,
  pinnedRun,
  referenceResolver,
  samePixels,
  writeReport,
  type Pixels,
} from './support.js';

const MANIFEST = join(GOLDEN_DIRECTORY, 'clear.golden-frames.json');
const ffmpegPath = process.env.KADRION_FFMPEG;
const ffprobePath = process.env.KADRION_FFPROBE;
const available = ffmpegPath !== undefined && ffprobePath !== undefined;
const FFMPEG = { ffmpegPath: ffmpegPath ?? '', ffprobePath: ffprobePath ?? '' };

/** The composition's frames: 1 s at 30 fps. */
const FRAMES = 30;
const FPS = 30;

/** The same document with a white clear: what a JPEG and a video draw (D89.2). */
const WHITE = { ...(clearComposition as Record<string, unknown>), clear: 'white' };

/** The transparent composition on a canvas of 1280x720, for the MP4 of the preset 720p. */
const VIDEO = { ...(clearComposition as Record<string, unknown>), width: 1280, height: 720 };

/** `clear-square`, #1d4ed8, at 40..240 on both axes. */
const SQUARE: Rgba = [0x1d, 0x4e, 0xd8, 255];
/** `clear-multiply`, #f79009, at 160..320 on both axes, of blend mode `multiply`. */
const ORANGE: Rgba = [0xf7, 0x90, 0x09, 255];
/** The orange multiplied by the square, channel by channel. */
const MULTIPLIED: Rgba = [
  Math.round((0x1d * 0xf7) / 255),
  Math.round((0x4e * 0x90) / 255),
  Math.round((0xd8 * 0x09) / 255),
  255,
];
/** Where no node is, in every frame. */
const UNCOVERED: readonly (readonly [number, number])[] = [
  [0, 0],
  [639, 0],
  [0, 359],
  [639, 359],
  [20, 300],
  [400, 20],
];
/** The column of `clear-gradient` (460..600, 40..320) whose alpha is measured. */
const GRADIENT_X = 530;
/** The dark colour of the host page in the Player's test. */
const HOST_COLOUR = [32, 32, 32] as const;

type Rgba = readonly [number, number, number, number];

function rgba(image: Pixels, x: number, y: number): Rgba {
  const at = (y * image.width + x) * 4;
  const channel = (offset: number): number => image.data[at + offset] ?? -1;
  return [channel(0), channel(1), channel(2), channel(3)];
}

function near(found: Rgba, expected: Rgba, tolerance: number): boolean {
  return found.every((value, index) => Math.abs(value - (expected[index] ?? -1)) <= tolerance);
}

/** The colour type of a PNG's `IHDR`: 2 for RGB, 6 for RGB with alpha. */
function colourType(png: Uint8Array): number {
  return png[25] ?? -1;
}

/** The disc's opacity and centre at `timeUs`, from its keyframes in `clear.json`. */
function disc(timeUs: number): { opacity: number; x: number; y: number } {
  const t = timeUs / 1_000_000;
  return {
    opacity: 0.25 + 0.5 * t,
    x: Math.floor(300 + 40 * t + 60),
    y: Math.floor(60 + 80 * t + 60),
  };
}

/** The problems of one frame of the transparent composition; empty when it is right. */
function frameProblems(png: Uint8Array, timeUs: number): string[] {
  const problems: string[] = [];
  if (colourType(png) !== 6) problems.push(`colour type ${String(colourType(png))}, not 6`);
  const image = decodePng(png);
  for (const [x, y] of UNCOVERED) {
    const found = rgba(image, x, y);
    if (!near(found, [0, 0, 0, 0], 0))
      problems.push(`(${String(x)}, ${String(y)}) is ${found.join(',')}`);
  }
  const square = rgba(image, 100, 100);
  if (!near(square, SQUARE, 0)) problems.push(`the square is ${square.join(',')}`);
  const over = rgba(image, 200, 200);
  if (!near(over, MULTIPLIED, 2)) problems.push(`multiply over the square is ${over.join(',')}`);
  for (const [x, y] of [
    [280, 280],
    [200, 300],
  ] as const) {
    const found = rgba(image, x, y);
    if (!near(found, ORANGE, 0)) problems.push(`multiply over the clear is ${found.join(',')}`);
  }
  const { opacity, x, y } = disc(timeUs);
  const centre = rgba(image, x, y);
  if (Math.abs(centre[3] - Math.round(opacity * 255)) > 2) {
    problems.push(`the disc's alpha is ${String(centre[3])}, not ${String(opacity * 255)}`);
  }
  let previous = -1;
  for (let row = 41; row <= 318; row += 1) {
    const alpha = rgba(image, GRADIENT_X, row)[3];
    if (alpha < previous) problems.push(`the gradient's alpha falls at ${String(row)}`);
    previous = alpha;
  }
  const [top, bottom] = [rgba(image, GRADIENT_X, 42)[3], rgba(image, GRADIENT_X, 318)[3]];
  if (top > 8 || bottom < 247) {
    problems.push(`the gradient's alpha runs from ${String(top)} to ${String(bottom)}`);
  }
  return problems;
}

/** Whether a WebP has an alpha channel: a `VP8X` header with its alpha flag (RFC 9649 §2.7). */
function webpHasAlpha(bytes: Uint8Array): boolean {
  const text = (from: number, to: number): string =>
    String.fromCharCode(...bytes.subarray(from, to));
  return (
    text(0, 4) === 'RIFF' &&
    text(8, 12) === 'WEBP' &&
    text(12, 16) === 'VP8X' &&
    ((bytes[20] ?? 0) & 0x10) !== 0
  );
}

describe('the transparent clear in pinned Chromium (D89.2)', () => {
  let chromium: LaunchedChromium;

  beforeAll(async () => {
    chromium = await launchChromium();
  });

  afterAll(async () => {
    await chromium.browser.close();
  });

  it('keeps alpha in every frame, where no node is, under opacity, and under a blend mode', async () => {
    const times = Array.from({ length: FRAMES }, (_, frame) => frameToTimeUs(frame, FPS));
    const { frames, manifest } = await renderFrames({
      document: clearComposition,
      resolveAsset: referenceResolver,
      timesUs: times,
      chromium,
    });
    const report = frames.map(({ timeUs, png }) => ({
      timeUs,
      problems: frameProblems(png, timeUs),
    }));
    writeReport('clear/alpha.json', { schemaVersion: manifest.schemaVersion, report });
    expect(frames).toHaveLength(FRAMES);
    for (const { timeUs, problems } of report) expect(problems, String(timeUs)).toEqual([]);
    // And the premise: the white copy is opaque, and white where no node is.
    const white = await renderFrames({
      document: WHITE,
      resolveAsset: referenceResolver,
      timesUs: [0],
      chromium,
    });
    const png = white.frames[0]?.png;
    if (png === undefined) throw new Error('No frame of the white document.');
    expect(colourType(png)).toBe(2);
    expect(rgba(decodePng(png), 20, 300)).toEqual([255, 255, 255, 255]);
  });

  it('renders the transparent composition as its golden frames (D26.5)', async () => {
    const reportPath = 'clear/golden-comparison.json';
    const environment = pinnedRun(chromium);
    const times = clearGoldenTimestamps.map(({ timeUs }) => timeUs);
    const { frames } = await renderFrames({
      document: clearComposition,
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

  it('shows a dark host page through a transparent document in the Player, and white for a white one', async () => {
    const shown: Record<string, unknown> = {};
    for (const [name, composition] of [
      ['transparent', clearComposition],
      ['white', WHITE],
    ] as const) {
      const host = await openConformanceHost(chromium, JSON.stringify(composition), []);
      try {
        // A host page in the dark colour scheme, with a background of its own.
        await host.page.evaluate((colour) => {
          const root = document.documentElement;
          root.style.setProperty('color-scheme', 'dark');
          root.style.setProperty('background-color', `rgb(${colour.join(',')})`);
        }, HOST_COLOUR);
        // The seek of the conformance host, without its preflight, which refuses
        // a host page with a style of its own (D33.2).
        await host.page.evaluate(() =>
          (
            window as unknown as { conformance: { seek(timeUs: number): Promise<void> } }
          ).conformance.seek(0),
        );
        await awaitPresented(host.page, 5_000);
        expect(await playerState(host)).toMatchObject({ status: 'ready', timeUs: 0, error: null });
        const png = await captureFrame(host.page, host.width, host.height);
        const image = decodePng(png);
        shown[name] = { uncovered: rgba(image, 20, 300), square: rgba(image, 100, 100) };
        expect(rgba(image, 100, 100), name).toEqual(SQUARE);
        expect(rgba(image, 20, 300), name).toEqual(
          name === 'transparent' ? [...HOST_COLOUR, 255] : [255, 255, 255, 255],
        );
      } finally {
        await closeConformanceHost(host);
      }
    }
    writeReport('clear/player.json', { hostColour: HOST_COLOUR, shown });
  });

  describe.skipIf(!available)('stills and a video of a transparent document (D47.7, D89.2)', () => {
    it('makes a PNG still of the frame, a WebP with alpha, and the JPEG and MP4 of the white document', async () => {
      const timeUs = 500_000;
      const still = (document: unknown, format: 'png' | 'jpeg' | 'webp') =>
        renderStill({
          document,
          resolveAsset: referenceResolver,
          timeUs,
          format,
          ffmpeg: FFMPEG,
          chromium,
        });
      const { frames } = await renderFrames({
        document: clearComposition,
        resolveAsset: referenceResolver,
        timesUs: [timeUs],
        chromium,
      });
      const frame = frames[0]?.png;
      if (frame === undefined) throw new Error('No frame.');
      const png = await still(clearComposition, 'png');
      const webp = await still(clearComposition, 'webp');
      const webpWhite = await still(WHITE, 'webp');
      const jpeg = await still(clearComposition, 'jpeg');
      const jpegWhite = await still(WHITE, 'jpeg');

      const directory = join(OUTPUT_DIRECTORY, 'clear', 'exports');
      rmSync(directory, { recursive: true, force: true });
      mkdirSync(directory, { recursive: true });
      const video = (document: unknown, name: string) =>
        exportMp4({
          document,
          resolveAsset: referenceResolver,
          preset: '720p',
          outputPath: join(directory, `${name}.mp4`),
          ffmpeg: FFMPEG,
          chromium,
        });
      // At 1280x720, which the preset 720p draws without scaling: a video job
      // refuses to upscale the 640x360 of the composition.
      const mp4 = await video({ ...VIDEO, clear: 'transparent' }, 'transparent');
      const mp4White = await video({ ...VIDEO, clear: 'white' }, 'white');
      const mp4Bytes = readFileSync(join(directory, 'transparent.mp4'));
      const mp4WhiteBytes = readFileSync(join(directory, 'white.mp4'));
      // The videos are compared here and not kept: the run leaves only its report.
      rmSync(directory, { recursive: true, force: true });

      writeReport('clear/outputs.json', {
        png: { clear: png.manifest.clear, sha256: sha256(png.bytes), frame: sha256(frame) },
        webp: {
          clear: webp.manifest.clear,
          alpha: webpHasAlpha(webp.bytes),
          whiteAlpha: webpHasAlpha(webpWhite.bytes),
        },
        jpeg: {
          clear: jpeg.manifest.clear,
          sha256: sha256(jpeg.bytes),
          white: sha256(jpegWhite.bytes),
        },
        mp4: {
          clear: mp4.manifest.clear,
          sha256: sha256(mp4Bytes),
          white: sha256(mp4WhiteBytes),
        },
      });

      expect(png.manifest.clear).toBe('transparent');
      expect(colourType(png.bytes)).toBe(6);
      expect(samePixels(png.bytes, frame)).toBe(true);

      expect(webp.manifest.clear).toBe('transparent');
      expect(webpHasAlpha(webp.bytes)).toBe(true);

      expect(jpeg.manifest.clear).toBe('white');
      expect(sha256(jpeg.bytes)).toBe(sha256(jpegWhite.bytes));
      expect(jpeg.manifest.output).toEqual(jpegWhite.manifest.output);
      // Each manifest names the document it was given (D89.2).
      expect(jpeg.manifest.compositionHash).toBe(png.manifest.compositionHash);
      expect(jpeg.manifest.compositionHash).not.toBe(jpegWhite.manifest.compositionHash);

      expect(mp4.manifest.clear).toBe('white');
      expect(mp4White.manifest.clear).toBe('white');
      expect(sha256(mp4Bytes)).toBe(sha256(mp4WhiteBytes));
      expect(mp4.manifest.compositionHash).not.toBe(mp4White.manifest.compositionHash);
    });
  });
});

/**
 * The gate of D89.1 in pinned Chromium: the probe of `canvas-probe.ts` on a
 * canvas of the bound of the schema on both sides, rendered twice, each time
 * on a fresh page with the Producer's own timeouts, gives the same bytes both
 * times, and every pattern in every corner of every frame is intact. The first
 * frame is, pixel for pixel, the image of noise: nothing of the canvas is
 * clipped or scaled. The PNG of noise is the largest a canvas of the bound
 * gives. No frame enters Git: the report records each frame by its SHA-256.
 */
import process from 'node:process';

import { launchChromium, renderFrames, sha256, type LaunchedChromium } from '@kadrion/producer';
import { compositionSchema } from '@kadrion/schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  canvasProbe,
  differingFromNoise,
  NOISE_ASSET,
  noiseImage,
  patternProblems,
  PROBE_FRAMES,
  probeTimeUs,
  sha256Of,
} from './canvas-probe.js';
import { decodePng, pinnedRun, writeReport } from './support.js';

/** The bound of a side of the canvas, read from the schema (D89.1). */
const BOUND = compositionSchema.properties.width.maximum;

describe('the gate of D89.1: a canvas of the bound in pinned Chromium', () => {
  let chromium: LaunchedChromium;

  beforeAll(async () => {
    chromium = await launchChromium();
  });

  afterAll(async () => {
    await chromium.browser.close();
  });

  it(
    'renders the probe twice with the same bytes and every pattern intact',
    { timeout: 900_000 },
    async () => {
      const environment = pinnedRun(chromium);
      const noise = noiseImage(BOUND, BOUND);
      const document = canvasProbe(BOUND, BOUND, sha256Of(noise.png));
      const times = PROBE_FRAMES.map(probeTimeUs);
      const passes: {
        milliseconds: number;
        frames: { frame: string; sha256: string; bytes: number; problems: string[] }[];
      }[] = [];
      let differing = -1;
      for (let pass = 0; pass < 2; pass += 1) {
        const started = process.hrtime.bigint();
        // The Producer's own timeouts: none is given (D89.1).
        const { frames } = await renderFrames({
          document,
          resolveAsset: ({ id }) =>
            id === NOISE_ASSET ? { mediaType: 'image/png', bytes: noise.png } : null,
          timesUs: times,
          chromium,
        });
        const milliseconds = Number(process.hrtime.bigint() - started) / 1e6;
        passes.push({
          milliseconds,
          frames: frames.map(({ png }, index) => {
            const frame = PROBE_FRAMES[index] ?? 'noise';
            return {
              frame,
              sha256: sha256(png),
              bytes: png.length,
              problems: patternProblems(decodePng(png), frame),
            };
          }),
        });
        if (pass === 0 && frames[0] !== undefined)
          differing = differingFromNoise(decodePng(frames[0].png), noise);
      }
      writeReport('canvas/gate.json', {
        environment: { pinned: environment.pinned, chromium: chromium.reportedVersion },
        bound: BOUND,
        noise: { sha256: sha256Of(noise.png), bytes: noise.png.length },
        noiseFrameDifferingPixels: differing,
        passes,
      });
      const [first, second] = passes;
      expect(first?.frames).toHaveLength(PROBE_FRAMES.length);
      for (const { frame, problems } of first?.frames ?? []) expect(problems, frame).toEqual([]);
      expect(second?.frames.map(({ sha256: hash }) => hash)).toEqual(
        first?.frames.map(({ sha256: hash }) => hash),
      );
      expect(differing).toBe(0);
    },
  );
});

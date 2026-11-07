/**
 * Easing in pinned Chromium (D67): the runtime's modules, as built, compute the
 * same bits in the pinned Chromium as in Node — the eased progress of every
 * Bézier curve at a fixed set of points, and the state of the easing fixture
 * at every frame — and the frames of the easing fixture meet their golden
 * frames in the pinned environment (D26.5).
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';

import {
  contextOptions,
  launchChromium,
  renderFrames,
  type LaunchedChromium,
} from '@kadrion/producer';
import { evaluateComposition } from '@kadrion/runtime';
import { frameCount, frameToTimeUs, validateComposition } from '@kadrion/schema';
import { easingComposition, easingGoldenTimestamps } from '@kadrion/test-fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bezierProgress } from '../../packages/runtime/dist/easing.js';

import {
  decodePng,
  difference,
  GOLDEN_DIRECTORY,
  OUTPUT_DIRECTORY,
  pinnedRun,
  referenceResolver,
  repoRoot,
  writeReport,
} from './support.js';

const ORIGIN = 'http://localhost:4523';
const POLICY = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
const PACKAGES = ['runtime', 'schema'];
const MANIFEST = join(GOLDEN_DIRECTORY, 'easing.golden-frames.json');

/** The named curves of CSS and four curves of the schema's extremes (D67.3). */
const CURVES = [
  { x1: 0.42, y1: 0, x2: 1, y2: 1 },
  { x1: 0, y1: 0, x2: 0.58, y2: 1 },
  { x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
  { x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 },
  { x1: 0.36, y1: -0.64, x2: 0.6, y2: 1.4 },
  { x1: 0, y1: -1, x2: 1, y2: 2 },
  { x1: 1, y1: -1, x2: 0, y2: 2 },
];
/** Every 1024th of the progress, and three points near the ends and the middle. */
const POINTS = [
  ...Array.from({ length: 1023 }, (_, index) => (index + 1) / 1024),
  1e-9,
  0.5 + 2 ** -40,
  1 - 2 ** -30,
];

/**
 * The page computes what the test computes in Node, with the same built
 * modules: the bits of every eased progress, and the state at every frame.
 */
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">${JSON.stringify({
  imports: Object.fromEntries(
    PACKAGES.map((name) => [`@kadrion/${name}`, `/pkg/${name}/index.js`]),
  ),
})}</script>
<script type="module">
import { evaluateComposition } from '@kadrion/runtime';
import { frameCount, frameToTimeUs, validateComposition } from '@kadrion/schema';
import { bezierProgress } from '/pkg/runtime/easing.js';

const bits = (value) => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  return view.getBigUint64(0).toString(16);
};
window.easing = {
  progress: (curves, points) => curves.map((curve) => points.map((p) => bits(bezierProgress(curve, p)))),
  states(text) {
    const result = validateComposition(JSON.parse(text));
    if (!result.ok) throw new Error('invalid');
    const document = result.composition;
    const frames = frameCount(document.durationUs, document.fps);
    return Array.from({ length: frames }, (_, frame) =>
      JSON.stringify(evaluateComposition(document, frameToTimeUs(frame, document.fps))),
    );
  },
};
window.ready = true;
</script></head><body></body></html>`;

interface EasingWindow {
  readonly easing: {
    progress(curves: typeof CURVES, points: readonly number[]): string[][];
    states(text: string): string[];
  };
}

function bits(value: number): string {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  return view.getBigUint64(0).toString(16);
}

/** A file of a built package that the page imports, and the page itself. */
function served(pathname: string): { body: Buffer; type: string } | null {
  if (pathname === '/') return { body: Buffer.from(PAGE), type: 'text/html; charset=utf-8' };
  const pkg = /^\/pkg\/([a-z-]+)\/(.+\.js)$/.exec(pathname);
  if (pkg?.[1] === undefined || pkg[2] === undefined || !PACKAGES.includes(pkg[1])) return null;
  const base = join(repoRoot, 'packages', pkg[1], 'dist');
  const file = normalize(join(base, ...pkg[2].split('/')));
  if (!file.startsWith(base + sep) || extname(file) !== '.js' || !existsSync(file)) return null;
  return { body: readFileSync(file), type: 'text/javascript; charset=utf-8' };
}

/** The states of the easing fixture at every frame, as Node computes them. */
function nodeStates(): string[] {
  const result = validateComposition(easingComposition);
  if (!result.ok) throw new Error('The easing fixture is invalid.');
  const document = result.composition;
  return Array.from({ length: frameCount(document.durationUs, document.fps) }, (_, frame) =>
    JSON.stringify(evaluateComposition(document, frameToTimeUs(frame, document.fps))),
  );
}

describe('easing in pinned Chromium (D67)', () => {
  let chromium: LaunchedChromium;

  beforeAll(async () => {
    chromium = await launchChromium();
  });

  afterAll(async () => {
    await chromium.browser.close();
  });

  it('computes the same bits in Chromium as in Node, the progress and the state', async () => {
    const context = await chromium.browser.newContext(contextOptions(640, 360));
    const unexpected: string[] = [];
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      const file = url.origin === ORIGIN ? served(url.pathname) : null;
      if (file === null) {
        unexpected.push(route.request().url());
        return route.abort('blockedbyclient');
      }
      return route.fulfill({
        status: 200,
        body: file.body,
        headers: {
          'content-type': file.type,
          'content-security-policy': POLICY,
          'cache-control': 'no-store',
        },
      });
    });
    try {
      const page = await context.newPage();
      await page.goto(`${ORIGIN}/`);
      await page.waitForFunction(() => 'ready' in window);
      const progress = await page.evaluate(
        ([curves, points]) => (window as unknown as EasingWindow).easing.progress(curves, points),
        [CURVES, POINTS] as const,
      );
      const states = await page.evaluate(
        (text) => (window as unknown as EasingWindow).easing.states(text),
        JSON.stringify(easingComposition),
      );
      const expectedProgress = CURVES.map((curve) =>
        POINTS.map((p) => bits(bezierProgress(curve, p))),
      );
      const expectedStates = nodeStates();
      const differingProgress = expectedProgress
        .flatMap((row, curve) =>
          row.map((value, point) => (progress[curve]?.[point] === value ? null : [curve, point])),
        )
        .filter((entry) => entry !== null);
      const differingFrames = expectedStates
        .map((state, frame) => (states[frame] === state ? null : frame))
        .filter((frame) => frame !== null);
      writeReport('easing/node-vs-chromium.json', {
        environment: pinnedRun(chromium),
        curves: CURVES.length,
        points: POINTS.length,
        frames: expectedStates.length,
        differingProgress,
        differingFrames,
      });
      expect(unexpected).toEqual([]);
      // The premise: every curve and every frame was computed on both sides.
      expect(progress.map((row) => row.length)).toEqual(CURVES.map(() => POINTS.length));
      expect(states).toHaveLength(78);
      expect(differingProgress).toEqual([]);
      expect(differingFrames).toEqual([]);
    } finally {
      await context.close();
    }
  });

  it('renders the eased motion as its golden frames (D26.5)', async () => {
    const reportPath = 'easing/golden-comparison.json';
    const environment = pinnedRun(chromium);
    const times = easingGoldenTimestamps.map(({ timeUs }) => timeUs);
    const { frames } = await renderFrames({
      document: easingComposition,
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

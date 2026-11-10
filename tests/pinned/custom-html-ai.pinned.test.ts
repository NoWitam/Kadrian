/**
 * Custom HTML for AI authors in pinned Chromium (D78): elements that hold no
 * protocol code — one of CSS animations alone, with a font and parameters, one
 * of script reading `Date.now`, `performance.now`, `Math.random`, and
 * `requestAnimationFrame` — render each frame from its time alone: the same
 * pixels forward, backward, and shuffled, in the Producer and in the Player,
 * and the frames of the fixture meet their golden frames (D26.5). The render
 * check of `check_custom_html` finds nothing in them, and finds the frames of an
 * element that counts its frames or reads the document timeline.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  checkCustomHtml,
  launchChromium,
  renderFrames,
  type LaunchedChromium,
} from '@kadrion/producer';
import {
  customHtmlComposition,
  customHtmlGoldenTimestamps,
  generateReferenceAssets,
} from '@kadrion/test-fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  closeConformanceHost,
  openConformanceHost,
  seekAndCapture,
  type ConformanceHost,
} from './conformance-host.js';
import {
  decodePng,
  difference,
  GOLDEN_DIRECTORY,
  OUTPUT_DIRECTORY,
  pinnedRun,
  pixelReport,
  referenceResolver,
  samePixels,
  writeReport,
} from './support.js';

const MANIFEST = join(GOLDEN_DIRECTORY, 'custom-html.golden-frames.json');
const TIMES = customHtmlGoldenTimestamps.map(({ timeUs }) => timeUs);
const MORE = [...TIMES, 1_000_000, 1_033_333, 3_966_666, 6_000_000];

let chromium: LaunchedChromium;

beforeAll(async () => {
  chromium = await launchChromium();
}, 60_000);

afterAll(async () => {
  await chromium.browser.close();
});

async function framesAt(
  document: unknown,
  timesUs: readonly number[],
): Promise<Map<number, Uint8Array>> {
  const { frames } = await renderFrames({
    document,
    resolveAsset: referenceResolver,
    timesUs,
    chromium,
  });
  return new Map(frames.map(({ timeUs, png }) => [timeUs, png]));
}

/** The fixture with the html of `nodeId` replaced. */
function withHtml(nodeId: string, html: string): unknown {
  const draft = structuredClone(customHtmlComposition) as {
    scenes: { nodes: { id: string; html?: string }[] }[];
  };
  const node = draft.scenes[0]?.nodes.find(({ id }) => id === nodeId);
  if (node === undefined) throw new Error(`No node ${nodeId}.`);
  node.html = html;
  return draft;
}

describe('an element with no protocol code renders each frame from its time alone (D78)', () => {
  it('gives the same pixels forward, backward, and shuffled, and differs from frame to frame', async () => {
    const forward = await framesAt(customHtmlComposition, MORE);
    const backward = await framesAt(customHtmlComposition, [...MORE].reverse());
    const shuffled = await framesAt(customHtmlComposition, [
      ...MORE.filter((_, at) => at % 2 === 1),
      ...MORE.filter((_, at) => at % 2 === 0),
    ]);
    for (const timeUs of MORE) {
      const a = forward.get(timeUs);
      const b = backward.get(timeUs);
      const c = shuffled.get(timeUs);
      if (a === undefined || b === undefined || c === undefined) {
        throw new Error(`No frame at ${String(timeUs)}.`);
      }
      expect(samePixels(a, b), pixelReport(`backward at ${String(timeUs)}`, a, b)).toBe(true);
      expect(samePixels(a, c), pixelReport(`shuffled at ${String(timeUs)}`, a, c)).toBe(true);
    }
    // The premise: the elements move, so the comparison means something.
    const first = forward.get(1_000_000);
    const next = forward.get(1_033_333);
    if (first === undefined || next === undefined) throw new Error('No frames.');
    expect(samePixels(first, next)).toBe(false);
  }, 180_000);

  it('finds nothing in the elements of the fixture with the render check', async () => {
    for (const nodeId of ['html-css', 'html-script']) {
      const check = await checkCustomHtml({
        document: customHtmlComposition,
        nodeId,
        resolveAsset: referenceResolver,
        chromium,
      });
      expect(check.problems, nodeId).toEqual([]);
      expect(check.timesUs.length).toBe(5);
    }
  }, 180_000);

  it('finds an element that counts its frames, and one that reads the document timeline', async () => {
    const counting = withHtml(
      'html-script',
      '<div id="n" style="font:40px sans-serif;color:#fff"></div><script>var n=0;function draw(){n+=1;document.getElementById("n").style.width=String(n*20)+"px";document.getElementById("n").style.height="20px";document.getElementById("n").style.background="#fff";requestAnimationFrame(draw)}requestAnimationFrame(draw)</script>',
    );
    const timeline = withHtml(
      'html-script',
      '<div id="t" style="height:20px;background:#fff"></div><script>function draw(){document.getElementById("t").style.width=String(Math.round(document.timeline.currentTime%600))+"px";requestAnimationFrame(draw)}requestAnimationFrame(draw)</script>',
    );
    for (const [what, document] of [
      ['counting', counting],
      ['timeline', timeline],
    ] as const) {
      const check = await checkCustomHtml({
        document,
        nodeId: 'html-script',
        resolveAsset: referenceResolver,
        chromium,
      });
      expect(
        check.problems.some(({ code }) => code === 'frames-differ'),
        what,
      ).toBe(true);
    }
  }, 180_000);

  it('reports an element that listens to messages and never answers', async () => {
    const silent = withHtml(
      'html-script',
      '<script>addEventListener("message", function () {})</script>',
    );
    const check = await checkCustomHtml({
      document: silent,
      nodeId: 'html-script',
      resolveAsset: referenceResolver,
      chromium,
      ackTimeoutMs: 500,
    });
    expect(check.problems.map(({ code }) => code)).toEqual(['no-acknowledgement']);
  }, 60_000);
});

describe('the Player shows the frames of the Producer (D33, D78)', () => {
  let host: ConformanceHost;

  beforeAll(async () => {
    host = await openConformanceHost(
      chromium,
      JSON.stringify(customHtmlComposition),
      generateReferenceAssets().filter(({ id }) => id === 'asset-font'),
    );
  }, 120_000);

  afterAll(async () => {
    await closeConformanceHost(host);
  });

  it('pixel for pixel at every time, seeking backward and forward', async () => {
    const produced = await framesAt(customHtmlComposition, MORE);
    const report: { timeUs: number; differingPixels: number }[] = [];
    for (const timeUs of [...MORE].reverse()) {
      const shown = await seekAndCapture(host, timeUs, null);
      const expected = produced.get(timeUs);
      if (expected === undefined) throw new Error(`No frame at ${String(timeUs)}.`);
      report.push({
        timeUs,
        differingPixels: difference(decodePng(expected), decodePng(shown.png)).differingPixels,
      });
    }
    writeReport('custom-html-ai/player-parity.json', { environment: pinnedRun(chromium), report });
    expect(report.filter(({ differingPixels }) => differingPixels > 0)).toEqual([]);
  }, 180_000);
});

describe('the golden frames of the Custom HTML fixture (D26.5)', () => {
  it('renders the fixture as its golden frames', async () => {
    const reportPath = 'custom-html-ai/golden-comparison.json';
    const environment = pinnedRun(chromium);
    const frames = await framesAt(customHtmlComposition, TIMES);
    const goldens = existsSync(MANIFEST)
      ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
          environment: { pinned: boolean };
          frames: { file: string; timeUs: number }[];
        })
      : null;
    const report = TIMES.map((timeUs) => {
      const png = frames.get(timeUs);
      const file = goldens?.frames.find((frame) => frame.timeUs === timeUs)?.file;
      return {
        timeUs,
        difference:
          file === undefined || png === undefined
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
    for (const { timeUs, difference: found } of report) {
      expect(found?.differingPixels, String(timeUs)).toBe(0);
    }
  }, 120_000);
});

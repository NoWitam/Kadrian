/**
 * Text style and text animated in fragments in pinned Chromium (D69): the
 * runtime's modules, as built, cut the same letters and compute the same
 * fragments in the pinned Chromium as in Node; a text in fragments at rest is
 * drawn exactly as the same text in one piece; the stroke, the shadow, and the
 * box paint where D69 places them; and the frames of the text composition
 * meet their golden frames in the pinned environment (D26.5).
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';

import {
  contextOptions,
  launchChromium,
  renderFrames,
  type LaunchedChromium,
} from '@kadrion/producer';
import { evaluateComposition, graphemes } from '@kadrion/runtime';
import { frameCount, frameToTimeUs, validateComposition } from '@kadrion/schema';
import { textComposition, textGoldenTimestamps } from '@kadrion/test-fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  decodePng,
  difference,
  GOLDEN_DIRECTORY,
  OUTPUT_DIRECTORY,
  pinnedRun,
  pixel,
  pixelReport,
  referenceResolver,
  repoRoot,
  samePixels,
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
const MANIFEST = join(GOLDEN_DIRECTORY, 'text.golden-frames.json');
/** The background of the text composition, #101828. */
const BACKGROUND: [number, number, number] = [16, 24, 40];

/**
 * Every case of the conformance file of the table's Unicode version, joined
 * by a line feed, which breaks between any two clusters (GB4, GB5).
 */
const CONFORMANCE = readFileSync(
  join(repoRoot, 'packages', 'runtime', 'test', 'unicode', 'GraphemeBreakTest-17.0.0.txt'),
  'utf8',
)
  .split('\n')
  .map((line) => line.replace(/#.*/, '').trim())
  .filter((line) => line !== '')
  .map((line) =>
    line
      .split(/\s+/)
      .filter((token) => token !== '÷' && token !== '×')
      .map((token) => String.fromCodePoint(Number.parseInt(token, 16)))
      .join(''),
  )
  .join('\n');

/** The page computes what the test computes in Node, with the same built modules. */
const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">${JSON.stringify({
  imports: Object.fromEntries(
    PACKAGES.map((name) => [`@kadrion/${name}`, `/pkg/${name}/index.js`]),
  ),
})}</script>
<script type="module">
import { evaluateComposition, graphemes } from '@kadrion/runtime';
import { frameCount, frameToTimeUs, validateComposition } from '@kadrion/schema';

window.text = {
  graphemes: (text) => graphemes(text),
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

interface TextWindow {
  readonly text: {
    graphemes(text: string): string[];
    states(text: string): string[];
  };
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

/** The states of the text composition at every frame, as Node computes them. */
function nodeStates(): string[] {
  const result = validateComposition(textComposition);
  if (!result.ok) throw new Error('The text fixture is invalid.');
  const document = result.composition;
  return Array.from({ length: frameCount(document.durationUs, document.fps) }, (_, frame) =>
    JSON.stringify(evaluateComposition(document, frameToTimeUs(frame, document.fps))),
  );
}

type NodeDraft = Record<string, unknown> & { id: string };

/** The text composition with every text plain and still, then `edit` applied to the node `id`. */
function still(id: string, edit: (node: NodeDraft) => void = () => undefined): unknown {
  const draft = structuredClone(textComposition) as { scenes: { nodes: NodeDraft[] }[] };
  const nodes = draft.scenes.flatMap((scene) => scene.nodes);
  for (const node of nodes) {
    if (node['type'] !== 'text') continue;
    node['style'] = {
      stroke: { kind: 'none' },
      shadow: { kind: 'none' },
      box: { kind: 'none' },
      align: 'left',
      verticalAlign: 'top',
    };
    node['textAnimations'] = [];
  }
  const node = nodes.find((item) => item.id === id);
  if (node === undefined) throw new Error(`The text composition has no ${id}.`);
  edit(node);
  return draft;
}

/** A text animation of `unit` that leaves every fragment where it is. */
function atRest(unit: string, id = `text-rest-${unit}`): unknown {
  const linear = { kind: 'linear' };
  return {
    id,
    unit,
    phase: { kind: 'in' },
    staggerUs: 100_000,
    order: { kind: 'forward' },
    tracks: [
      {
        property: 'opacity',
        keyframes: [
          { timeUs: 0, value: 1, easing: linear },
          { timeUs: 300_000, value: 1, easing: linear },
        ],
      },
    ],
  };
}

function near(found: [number, number, number], expected: [number, number, number]): boolean {
  return found.every((channel, index) => Math.abs(channel - (expected[index] ?? 0)) <= 2);
}

describe('text style and fragments in pinned Chromium (D69)', () => {
  let chromium: LaunchedChromium;

  const frameAt = async (document: unknown, timeUs = 0): Promise<Uint8Array> => {
    const { frames } = await renderFrames({
      document,
      resolveAsset: referenceResolver,
      timesUs: [timeUs],
      chromium,
    });
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

  it('cuts the same letters and computes the same fragments in Chromium as in Node', async () => {
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
      const letters = await page.evaluate(
        (text) => (window as unknown as TextWindow).text.graphemes(text),
        CONFORMANCE,
      );
      const states = await page.evaluate(
        (text) => (window as unknown as TextWindow).text.states(text),
        JSON.stringify(textComposition),
      );
      const expectedLetters = graphemes(CONFORMANCE);
      const expectedStates = nodeStates();
      const differingFrames = expectedStates
        .map((state, frame) => (states[frame] === state ? null : frame))
        .filter((frame) => frame !== null);
      writeReport('text/node-vs-chromium.json', {
        environment: pinnedRun(chromium),
        letters: expectedLetters.length,
        sameLetters: JSON.stringify(letters) === JSON.stringify(expectedLetters),
        frames: expectedStates.length,
        differingFrames,
      });
      expect(unexpected).toEqual([]);
      expect(expectedLetters.length).toBeGreaterThan(1000);
      expect(JSON.stringify(letters) === JSON.stringify(expectedLetters)).toBe(true);
      expect(states).toHaveLength(60);
      expect(differingFrames).toEqual([]);
    } finally {
      await context.close();
    }
  });

  it('draws a text in fragments at rest exactly as the same text in one piece', async () => {
    for (const [id, units] of [
      ['node-letters', ['letter']],
      ['node-words', ['word']],
      ['node-lines', ['line']],
      ['node-accent', ['line', 'word', 'letter']],
    ] as const) {
      const whole = await frameAt(still(id));
      const pieces = await frameAt(
        still(id, (node) => {
          node['textAnimations'] = units.map((unit) => atRest(unit));
        }),
      );
      expect(samePixels(whole, pieces), pixelReport(`${id} at rest`, whole, pieces)).toBe(true);
    }
  });

  it('paints a stroke, a shadow, and a box, each beside the plain text', async () => {
    const plain = await frameAt(still('node-letters'));
    const original = (textComposition as { scenes: { nodes: NodeDraft[] }[] }).scenes[0]?.nodes;
    const styleOf = (id: string): unknown => original?.find((node) => node.id === id)?.['style'];
    for (const id of ['node-letters', 'node-words', 'node-lines']) {
      const styled = await frameAt(
        still(id, (node) => {
          node['style'] = styleOf(id);
        }),
      );
      expect(samePixels(plain, styled), id).toBe(false);
    }
  });

  it('puts the box its padding beyond the lines, behind them, and moves nothing', async () => {
    // The lines are at (24, 180), two lines of 50 px: the box reaches from
    // (16, 172), #344054 at 0.8 over the background.
    const boxed = decodePng(
      await frameAt(
        still('node-lines', (node) => {
          node['style'] = {
            stroke: { kind: 'none' },
            shadow: { kind: 'none' },
            box: { kind: 'solid', color: '#344054', opacity: 0.8, padding: 8, cornerRadius: 0 },
          };
        }),
      ),
    );
    const plain = decodePng(await frameAt(still('node-lines')));
    expect(near(pixel(boxed, 18, 230), [45, 56, 75])).toBe(true);
    expect(near(pixel(boxed, 14, 230), BACKGROUND)).toBe(true);
    expect(near(pixel(boxed, 18, 170), BACKGROUND)).toBe(true);
    expect(near(pixel(plain, 18, 230), BACKGROUND)).toBe(true);
  });

  it('renders the text composition as its golden frames (D26.5)', async () => {
    const reportPath = 'text/golden-comparison.json';
    const environment = pinnedRun(chromium);
    const times = textGoldenTimestamps.map(({ timeUs }) => timeUs);
    const { frames } = await renderFrames({
      document: textComposition,
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

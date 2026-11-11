/**
 * Lines measured from the font in pinned Chromium (D83, PR-65): `fontMetrics`
 * and `frameLayout` of `@kadrion/runtime/text-frame`, as built, give the same
 * result in the pinned Chromium as in Node — the same SHA-256 of the metrics
 * of every fixture font and of the layout of a fixed set of framed texts and
 * captions, in every alignment, with overflow, in both modes of captions. The
 * render page and the Player will compute the lines with these functions from
 * schema `0.25` on (PR-66), so this is the premise of their parity of lines.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';

import { contextOptions, launchChromium, type LaunchedChromium } from '@kadrion/producer';
import {
  fontMetrics,
  frameLayout,
  type CaptionsFrameInput,
  type FontMetrics,
  type FrameAlign,
  type FrameVerticalAlign,
  type TextFrameInput,
} from '@kadrion/runtime/text-frame';
import { generateProportionalFont, generateReferenceAssets } from '@kadrion/test-fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pinnedRun, repoRoot, writeReport } from './support.js';

const ORIGIN = 'http://localhost:4525';
const POLICY = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
const PACKAGES = ['runtime'];

type FontName = 'proportional' | 'format-4' | 'format-12' | 'monospaced';

/** One case: the metrics of a font, or the layout of a node with the metrics of a font. */
type LayoutCase =
  | { readonly name: string; readonly font: FontName; readonly kind: 'metrics' }
  | {
      readonly name: string;
      readonly font: FontName;
      readonly kind: 'layout';
      readonly node: TextFrameInput | CaptionsFrameInput;
    };

function fonts(): Record<FontName, Uint8Array> {
  const monospaced = generateReferenceAssets().find(({ id }) => id === 'asset-font');
  if (monospaced === undefined) throw new Error('The reference assets hold no font.');
  return {
    proportional: generateProportionalFont('both'),
    'format-4': generateProportionalFont('format-4'),
    'format-12': generateProportionalFont('format-12'),
    monospaced: monospaced.bytes,
  };
}

const ALIGNS: readonly FrameAlign[] = ['left', 'center', 'right'];
const VERTICAL_ALIGNS: readonly FrameVerticalAlign[] = ['top', 'middle', 'bottom'];
const TEXT = 'Kadrion draws time\n  wild Zebra \u{1F642} mmmmmmmmmmmm i\n\ndraws ';
const WORDS = 'Kadrion draws time in a wild frame mmmmmmmmmmmmmmmm i i i Zebra \u{1F642} draws'
  .split(' ')
  .map((text, at) => ({ text, startUs: at * 200_000, durationUs: 200_000 }));

/** The fixed cases: four fonts, framed texts in every alignment, a text without a frame, and captions. */
function cases(): LayoutCase[] {
  const out: LayoutCase[] = (['proportional', 'format-4', 'format-12', 'monospaced'] as const).map(
    (font) => ({ name: `metrics ${font}`, font, kind: 'metrics' }),
  );
  for (const align of ALIGNS) {
    for (const verticalAlign of VERTICAL_ALIGNS) {
      for (const [width, height, fontSize] of [
        [300, 200, 50],
        [333, 101, 37],
      ] as const) {
        out.push({
          name: `text ${align} ${verticalAlign} ${String(width)}x${String(height)} at ${String(fontSize)}`,
          font: 'proportional',
          kind: 'layout',
          node: {
            type: 'text',
            text: TEXT,
            fontSize,
            frame: { kind: 'fixed', width, height },
            style: { align, verticalAlign },
          },
        });
      }
    }
    out.push({
      name: `text ${align} without a frame`,
      font: 'proportional',
      kind: 'layout',
      node: {
        type: 'text',
        text: TEXT,
        fontSize: 41,
        frame: { kind: 'none' },
        style: { align, verticalAlign: 'top' },
      },
    });
    for (const lineBreak of ['characters', 'width'] as const) {
      for (const font of ['proportional', 'monospaced'] as const) {
        out.push({
          name: `captions ${align} by ${lineBreak} in ${font}`,
          font,
          kind: 'layout',
          node: {
            type: 'captions',
            width: 900,
            height: 250,
            words: WORDS,
            style: {
              fontSize: 72,
              lineHeight: 90,
              align,
              verticalAlign: 'middle',
              maxLineLength: 24,
              maxLines: 2,
              lineBreak,
            },
          },
        });
      }
    }
  }
  return out;
}

/** The result of a case as JSON: the metrics with their advances in ascending order of code point. */
function described(item: LayoutCase, metrics: FontMetrics): string {
  if (item.kind === 'metrics') {
    return JSON.stringify({
      unitsPerEm: metrics.unitsPerEm,
      notdefAdvance: metrics.notdefAdvance,
      advances: [...metrics.advances].sort(([a], [b]) => a - b),
    });
  }
  return JSON.stringify(
    item.node.type === 'text' ? frameLayout(item.node, metrics) : frameLayout(item.node, metrics),
  );
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<script type="module">
import { fontMetrics, frameLayout } from '/pkg/runtime/text-frame.js';

window.layout = (fonts, cases) => {
  const metrics = {};
  for (const [name, bytes] of Object.entries(fonts)) metrics[name] = fontMetrics(Uint8Array.from(bytes));
  const out = {};
  for (const item of cases) {
    const font = metrics[item.font];
    out[item.name] =
      item.kind === 'metrics'
        ? JSON.stringify({
            unitsPerEm: font.unitsPerEm,
            notdefAdvance: font.notdefAdvance,
            advances: [...font.advances].sort(([a], [b]) => a - b),
          })
        : JSON.stringify(frameLayout(item.node, font));
  }
  return out;
};
window.ready = true;
</script></head><body></body></html>`;

interface LayoutWindow {
  layout(
    fonts: Readonly<Record<string, readonly number[]>>,
    cases: readonly LayoutCase[],
  ): Record<string, string>;
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
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

describe('lines measured from the font in pinned Chromium (D83, PR-65)', () => {
  let chromium: LaunchedChromium;

  beforeAll(async () => {
    chromium = await launchChromium();
  });

  afterAll(async () => {
    await chromium.browser.close();
  });

  it('gives the same SHA-256 of the metrics and the layouts in Chromium as in Node', async () => {
    const bytes = fonts();
    const all = cases();
    const metrics = Object.fromEntries(
      Object.entries(bytes).map(([name, font]) => [name, fontMetrics(font)]),
    ) as Record<FontName, FontMetrics>;
    const node = Object.fromEntries(
      all.map((item) => [item.name, sha256(described(item, metrics[item.font]))]),
    );
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
      const plain = Object.fromEntries(
        Object.entries(bytes).map(([name, font]) => [name, [...font]]),
      );
      const results = await page.evaluate(
        ([fontBytes, items]) => (window as unknown as LayoutWindow).layout(fontBytes, items),
        [plain, all] as const,
      );
      const browser = Object.fromEntries(
        Object.entries(results).map(([name, json]) => [name, sha256(json)]),
      );
      const differingFromNode = all
        .map(({ name }) => name)
        .filter((name) => browser[name] !== node[name]);
      writeReport('text-frame/node-vs-chromium.json', {
        environment: pinnedRun(chromium),
        cases: all.length,
        node,
        differingFromNode,
      });
      expect(unexpected).toEqual([]);
      // The premise: every case was computed on both sides, and the cases differ.
      expect(Object.keys(browser).sort()).toEqual(Object.keys(node).sort());
      expect(all).toHaveLength(4 + 3 * (3 * 2 + 1 + 4));
      expect(new Set(Object.values(node)).size).toBeGreaterThan(all.length / 2);
      expect(differingFromNode).toEqual([]);
    } finally {
      await context.close();
    }
  });
});

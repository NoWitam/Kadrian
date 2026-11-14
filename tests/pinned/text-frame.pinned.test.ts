/**
 * Lines measured from the font in pinned Chromium (D83, PR-65): `fontMetrics`
 * and `frameLayout` of `@kadrion/runtime/text-frame`, as built, give the same
 * result in the pinned Chromium as in Node — the same SHA-256 of the metrics
 * of every fixture font and of the layout of a fixed set of framed texts and
 * captions, in every alignment, with overflow, in both modes of captions. The
 * render page and the Player will compute the lines with these functions from
 * schema `0.25` on (PR-66), so this is the premise of their parity of lines.
 *
 * Beside it, the width probe the owner asked for in PR-65 (2026-11-11), before
 * PR-66: the pinned Chromium draws a measured line as wide as `measureText`
 * and `unitsToPixels` say, read from the DOM at sub-pixel precision, at
 * fractional font sizes too. Headless Chromium on Linux may round glyph
 * advances to whole pixels, which would break the premise of D83.2.
 *
 * Since PR-72 (D84), every fixture font as WOFF and as WOFF2, written by the
 * test encoders of `packages/runtime/test`, gives the same SHA-256 of its
 * metrics in the pinned Chromium and in Node as the sfnt font, and loads as a
 * face through Chromium's own decoder, which is the check of the encoders.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';

import { contextOptions, launchChromium, type LaunchedChromium } from '@kadrion/producer';
import {
  fontMetrics,
  frameLayout,
  measureText,
  unitsToPixels,
  type CaptionsFrameInput,
  type FontMetrics,
  type FrameAlign,
  type FrameVerticalAlign,
  type TextFrameInput,
} from '@kadrion/runtime/text-frame';
import { generateProportionalFont, generateReferenceAssets } from '@kadrion/test-fixtures';
import type { BrowserContext, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { encodeWoff } from '../../packages/runtime/test/woff-support.js';
import { encodeWoff2 } from '../../packages/runtime/test/woff2-support.js';

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

// --- the width probe ---------------------------------------------------------

/**
 * The tolerance of the probe, per line: D83 states it (Verification: every
 * measured line is drawn as wide as `frameLayout` says, within half a pixel,
 * read from the DOM), so the probe asserts that and not the 1/64 px of a
 * LayoutUnit; the report records every difference, and whether it is within
 * 1/64 px, so the tighter bound is visible as evidence. The texts are long
 * enough that advances rounded to whole pixels drift past half a pixel at
 * every fractional size (asserted below), so the tolerance cannot hide them.
 */
const WIDTH_TOLERANCE_PX = 0.5;
const LAYOUT_UNIT_PX = 1 / 64;

/** Font sizes in CSS pixels: a scaled node draws its letters at fractional sizes too. */
const PROBE_SIZES: readonly number[] = [13.5, 17, 37, 50, 96];
const PROBE_FONTS = ['proportional', 'monospaced'] as const;
type ProbeFont = (typeof PROBE_FONTS)[number];

/** Single lines in a font's own characters: Latin of mixed advances, digits, runs of spaces, and U+1F642 (format 12). */
const PROBE_TEXTS: readonly {
  readonly label: string;
  readonly font: ProbeFont;
  readonly text: string;
}[] = [
  { label: 'latin', font: 'proportional', text: 'Kadrion draws wild lines in time mmm iii lll' },
  { label: 'digits', font: 'proportional', text: '0123456789 1111 7777 2026 1538' },
  { label: 'spaces', font: 'proportional', text: '   sound   out  a  b    c   ' },
  { label: 'U+1F642', font: 'proportional', text: 'smile \u{1F642} \u{1F642}\u{1F642} done' },
  { label: 'latin', font: 'monospaced', text: 'Kadrion bends time on a grid' },
  { label: 'spaces', font: 'monospaced', text: '  Kadrion   sends  ' },
];

interface ProbeCase {
  readonly name: string;
  readonly font: ProbeFont;
  readonly family: string;
  readonly text: string;
  readonly fontSize: number;
}

function probeCases(): ProbeCase[] {
  return PROBE_TEXTS.flatMap(({ label, font, text }) =>
    PROBE_SIZES.map((fontSize) => ({
      name: `${label} in ${font} at ${String(fontSize)} px`,
      font,
      family: `kadrion-probe-${font}`,
      text,
      fontSize,
    })),
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
// The width probe: each case one line of its own, drawn as D83.2 draws a
// measured line, its width read from a Range over its text (sub-pixel).
window.drawn = async (fonts, cases) => {
  for (const [family, bytes] of Object.entries(fonts)) {
    const face = new FontFace(family, Uint8Array.from(bytes).buffer);
    await face.load();
    document.fonts.add(face);
  }
  await document.fonts.ready;
  const out = {};
  for (const item of cases) {
    const line = document.createElement('div');
    line.style.position = 'absolute';
    line.style.left = '0';
    line.style.top = '0';
    line.style.width = 'max-content';
    const span = document.createElement('span');
    span.style.fontFamily = '"' + item.family + '"';
    span.style.fontSize = item.fontSize + 'px';
    span.style.whiteSpace = 'pre';
    span.style.fontKerning = 'none';
    span.style.fontVariantLigatures = 'none';
    span.textContent = item.text;
    line.append(span);
    document.body.append(line);
    const range = document.createRange();
    range.selectNodeContents(span);
    out[item.name] = {
      width: range.getBoundingClientRect().width,
      lines: new Set(Array.from(range.getClientRects(), (rect) => rect.top)).size,
      loaded: document.fonts.check(item.fontSize + 'px "' + item.family + '"', item.text),
    };
    line.remove();
  }
  return out;
};
// The fonts as WOFF and WOFF2 (D84, PR-72): each one measured by the runtime,
// and loaded as a face by Chromium's own decoder, which checks the test encoders.
window.formats = async (fonts) => {
  const out = {};
  let index = 0;
  for (const [name, bytes] of Object.entries(fonts)) {
    const data = Uint8Array.from(bytes);
    const result = { metrics: null, refusal: null, loaded: false, loadError: null };
    try {
      const font = fontMetrics(data);
      result.metrics = JSON.stringify({
        unitsPerEm: font.unitsPerEm,
        notdefAdvance: font.notdefAdvance,
        advances: [...font.advances].sort(([a], [b]) => a - b),
      });
    } catch (error) {
      result.refusal = String(error && error.code) + ': ' + String(error && error.message);
    }
    try {
      const face = new FontFace('kadrion-format-' + index, data.slice().buffer);
      await face.load();
      result.loaded = face.status === 'loaded';
    } catch (error) {
      result.loadError = String(error);
    }
    index += 1;
    out[name] = result;
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
  drawn(
    fonts: Readonly<Record<string, readonly number[]>>,
    cases: readonly ProbeCase[],
  ): Promise<Record<string, { width: number; lines: number; loaded: boolean }>>;
  formats(
    fonts: Readonly<Record<string, readonly number[]>>,
  ): Promise<
    Record<
      string,
      { metrics: string | null; refusal: string | null; loaded: boolean; loadError: string | null }
    >
  >;
}

// --- WOFF and WOFF2 (D84, PR-72) --------------------------------------------

/**
 * Each fixture font as the test encoders write it: WOFF, WOFF2 with `glyf`
 * and `loca` left as they are, and WOFF2 with `glyf` and `loca` transformed
 * and every bearing of `hmtx` omitted, the most the readers must undo.
 */
function formats(): { name: string; font: FontName; bytes: Uint8Array }[] {
  return Object.entries(fonts()).flatMap(([font, sfnt]) => [
    { name: `${font} as WOFF`, font: font as FontName, bytes: encodeWoff(sfnt) },
    {
      name: `${font} as WOFF2, glyf not transformed`,
      font: font as FontName,
      bytes: encodeWoff2(sfnt, { glyf: 'null' }),
    },
    {
      name: `${font} as WOFF2, glyf and hmtx transformed`,
      font: font as FontName,
      bytes: encodeWoff2(sfnt, { glyf: 'transformed', hmtx: 3 }),
    },
  ]);
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

const REPORT = 'text-frame/node-vs-chromium.json';

describe('lines measured from the font in pinned Chromium (D83, PR-65)', () => {
  let chromium: LaunchedChromium;
  // One report for both tests, written by each before its assertions.
  const report: Record<string, unknown> = {};

  /** A page of the served origin, every other request refused and recorded. */
  async function openPage(): Promise<{
    context: BrowserContext;
    page: Page;
    unexpected: string[];
  }> {
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
    const page = await context.newPage();
    await page.goto(`${ORIGIN}/`);
    await page.waitForFunction(() => 'ready' in window);
    return { context, page, unexpected };
  }

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
    const { context, page, unexpected } = await openPage();
    try {
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
      Object.assign(report, {
        environment: pinnedRun(chromium),
        cases: all.length,
        node,
        differingFromNode,
      });
      writeReport(REPORT, report);
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

  it('draws a measured line as wide as measureText says, within half a pixel (the width probe)', async () => {
    const bytes = fonts();
    const metrics: Record<ProbeFont, FontMetrics> = {
      proportional: fontMetrics(bytes.proportional),
      monospaced: fontMetrics(bytes.monospaced),
    };
    const all = probeCases();
    const { context, page, unexpected } = await openPage();
    try {
      const plain = Object.fromEntries(
        PROBE_FONTS.map((font) => [`kadrion-probe-${font}`, [...bytes[font]]]),
      );
      const drawn = await page.evaluate(
        ([fontBytes, items]) => (window as unknown as LayoutWindow).drawn(fontBytes, items),
        [plain, all] as const,
      );
      const widths = all.map(({ name, font, text, fontSize }) => {
        const face = metrics[font];
        const codePoints = Array.from(text, (character) => character.codePointAt(0) ?? 0);
        const measuredPx = unitsToPixels(measureText(text, face), fontSize, face);
        // What the line would be if every advance were rounded to a whole pixel.
        const wholePixelAdvancesPx = codePoints.reduce(
          (sum, codePoint) =>
            sum + Math.round(unitsToPixels(face.advances.get(codePoint) ?? 0, fontSize, face)),
          0,
        );
        const drawnPx = drawn[name]?.width ?? Number.NaN;
        const differencePx = drawnPx - measuredPx;
        return {
          name,
          text,
          fontSize,
          measuredPx,
          drawnPx,
          differencePx,
          withinLayoutUnit: Math.abs(differencePx) <= LAYOUT_UNIT_PX,
          wholePixelAdvancesPx,
          lines: drawn[name]?.lines ?? 0,
          fontLoaded: drawn[name]?.loaded ?? false,
          unmapped: codePoints.filter((codePoint) => !face.advances.has(codePoint)),
        };
      });
      const beyond = widths
        .filter(({ differencePx }) => !(Math.abs(differencePx) <= WIDTH_TOLERANCE_PX))
        .map(({ name, measuredPx, drawnPx, differencePx }) => ({
          name,
          measuredPx,
          drawnPx,
          differencePx,
        }));
      Object.assign(report, {
        widths: {
          environment: pinnedRun(chromium),
          toleranceInPixels: WIDTH_TOLERANCE_PX,
          layoutUnitInPixels: LAYOUT_UNIT_PX,
          cases: widths.length,
          maxAbsoluteDifferencePx: Math.max(
            ...widths.map(({ differencePx }) => Math.abs(differencePx)),
          ),
          withinLayoutUnit: widths.filter(({ withinLayoutUnit }) => withinLayoutUnit).length,
          beyondTolerance: beyond.length,
          widths,
        },
      });
      writeReport(REPORT, report);
      expect(unexpected).toEqual([]);
      // The premise: every case drawn as one line in its own characters, with its font loaded.
      expect(widths).toHaveLength(PROBE_SIZES.length * PROBE_TEXTS.length);
      expect(widths.filter(({ unmapped }) => unmapped.length > 0)).toEqual([]);
      expect(widths.filter(({ lines, fontLoaded }) => lines !== 1 || !fontLoaded)).toEqual([]);
      // The premise: at every size whose advances are fractional, advances rounded to
      // whole pixels would draw some line more than the tolerance away from the measure.
      for (const fontSize of PROBE_SIZES.filter((size) => size !== 50)) {
        expect(
          widths.some(
            (item) =>
              item.fontSize === fontSize &&
              Math.abs(item.wholePixelAdvancesPx - item.measuredPx) > WIDTH_TOLERANCE_PX,
          ),
          `${String(fontSize)} px`,
        ).toBe(true);
      }
      expect(
        beyond,
        'the pinned Chromium draws these measured lines wider or narrower than measureText says (D83.2)',
      ).toEqual([]);
    } finally {
      await context.close();
    }
  });
  it('measures every fixture font as WOFF and WOFF2 as it does as sfnt, in Chromium and in Node, and Chromium loads each (D84)', async () => {
    const sfnt = fonts();
    const expected = Object.fromEntries(
      Object.entries(sfnt).map(([name, font]) => [
        name,
        sha256(described({ name, font: name as FontName, kind: 'metrics' }, fontMetrics(font))),
      ]),
    ) as Record<FontName, string>;
    const all = formats();
    const { context, page, unexpected } = await openPage();
    try {
      const results = await page.evaluate(
        (fontBytes) => (window as unknown as LayoutWindow).formats(fontBytes),
        Object.fromEntries(all.map(({ name, bytes }) => [name, [...bytes]])),
      );
      const rows = all.map(({ name, font, bytes }) => {
        const inBrowser = results[name];
        const metrics = inBrowser?.metrics ?? null;
        return {
          name,
          bytes: bytes.length,
          sfnt: expected[font],
          node: sha256(described({ name, font, kind: 'metrics' }, fontMetrics(bytes))),
          chromium: metrics === null ? null : sha256(metrics),
          refusal: inBrowser === undefined ? 'not computed' : inBrowser.refusal,
          loaded: inBrowser?.loaded ?? false,
          loadError: inBrowser?.loadError ?? null,
        };
      });
      Object.assign(report, { formats: { environment: pinnedRun(chromium), rows } });
      writeReport(REPORT, report);
      expect(unexpected).toEqual([]);
      // The premise: three forms of each of the four fonts, the forms of one font differing in bytes.
      expect(rows).toHaveLength(4 * 3);
      expect(new Set(all.map(({ bytes }) => sha256(bytes.join(',')))).size).toBe(rows.length);
      expect(rows.filter(({ node, sfnt: of }) => node !== of)).toEqual([]);
      expect(rows.filter(({ chromium: of, sfnt: want }) => of !== want)).toEqual([]);
      expect(rows.filter(({ loaded }) => !loaded)).toEqual([]);
    } finally {
      await context.close();
    }
  });
});

/**
 * Texts in frames and captions broken by width in pinned Chromium (D83, PR-66):
 * every measured line of the framed-text composition — the lines of its
 * framed texts and of its captions broken by width — is drawn as wide as
 * `frameLayout` says from the metrics of the font's own bytes, within half a
 * pixel, read from the DOM of the Player's render page at sub-pixel precision
 * (D83.2); the Player shows the Producer's frames to the pixel at every golden
 * timestamp and between them (D33, D34); and the frames meet their golden
 * frames in the pinned environment (D26.5). The outline and the shadow of the
 * spoken word are painted on the spoken word alone and move no other (D83.8).
 * Since PR-72 (D84), the composition with its font given as WOFF and as WOFF2
 * renders its golden frames in the Producer, the load step reading the
 * metrics from those bytes with the runtime build.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { launchChromium, renderFrames, sha256, type LaunchedChromium } from '@kadrion/producer';
import type { AssetResolver } from '@kadrion/renderer-dom';
import { fontMetrics, frameLayout } from '@kadrion/runtime';
import { validateComposition, type CaptionsNode, type TextNode } from '@kadrion/schema';
import {
  framedTextComposition,
  framedTextGoldenTimestamps,
  generateProportionalFontAsset,
} from '@kadrion/test-fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { encodeWoff } from '../../packages/runtime/test/woff-support.js';
import { encodeWoff2 } from '../../packages/runtime/test/woff2-support.js';

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
  samePixels,
  writeReport,
} from './support.js';

const MANIFEST = join(GOLDEN_DIRECTORY, 'framed-text.golden-frames.json');
const TIMES = framedTextGoldenTimestamps.map(({ timeUs }) => timeUs);
/** The golden timestamps and frame times between them: a line entering, and every caption page. */
const MORE = [...TIMES, 0, 966_666, 1_000_000, 1_066_666, 1_333_333, 1_633_333];
/**
 * The times the lines are read at: every line at rest — the entrance of the
 * outlined text by line moves its lines until 1.6 s — on both scenes and both
 * pages of the captions.
 */
const AT_REST = [0, 500_000, 1_633_333, 1_966_666];
/** How far a line drawn by the browser may be from the width the runtime measured (D83.2). */
const HALF_PIXEL = 0.5;

const FONT = generateProportionalFontAsset();
const resolver: AssetResolver = ({ id }) =>
  id === FONT.id ? { mediaType: FONT.mediaType, bytes: FONT.bytes } : null;

const validated = validateComposition(framedTextComposition);
if (!validated.ok) throw new Error('The framed-text composition is not valid.');
const composition = validated.composition;
const METRICS = fontMetrics(FONT.bytes);

type MeasuredNode = TextNode | CaptionsNode;

/** Every measured node of the composition by ID: framed texts, and captions broken by width. */
const MEASURED: ReadonlyMap<string, MeasuredNode> = new Map(
  composition.scenes
    .flatMap((scene) => scene.nodes)
    .filter(
      (node): node is MeasuredNode =>
        (node.type === 'text' && node.frame.kind === 'fixed') ||
        (node.type === 'captions' && node.style.lineBreak === 'width'),
    )
    .map((node) => [node.id, node]),
);

/** The width `frameLayout` gives line `index` of a measured node, in composition pixels. */
function measuredWidth(nodeId: string, index: number): number {
  const node = MEASURED.get(nodeId);
  if (node === undefined) throw new Error(`"${nodeId}" is no measured node.`);
  const line =
    node.type === 'text'
      ? frameLayout(node, METRICS).lines[index]
      : frameLayout(node, METRICS).lines[index];
  if (line === undefined) throw new Error(`"${nodeId}" has no line ${String(index)}.`);
  return line.width;
}

/** One measured line the render page shows: its node, its index, and the width of its glyphs. */
interface DrawnLine {
  readonly nodeId: string;
  readonly index: number;
  readonly text: string;
  readonly width: number;
}

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
  const { frames } = await renderFrames({ document, resolveAsset: resolver, timesUs, chromium });
  return new Map(frames.map(({ timeUs, png }) => [timeUs, png]));
}

/** The fixture with the highlight of its captions changed by `edit`. */
function withHighlight(edit: (highlight: Record<string, unknown>) => void): unknown {
  const draft = structuredClone(framedTextComposition) as {
    scenes: { nodes: { type: string; style: { highlight: Record<string, unknown> } }[] }[];
  };
  for (const node of draft.scenes.flatMap((scene) => scene.nodes)) {
    if (node.type === 'captions') edit(node.style.highlight);
  }
  return draft;
}

describe('the measured lines of the Player (D83.2, D83.5)', () => {
  let host: ConformanceHost;

  beforeAll(async () => {
    host = await openConformanceHost(chromium, JSON.stringify(framedTextComposition), [FONT]);
  }, 120_000);

  afterAll(async () => {
    await closeConformanceHost(host);
  });

  it('draws every measured line as wide as frameLayout says, within half a pixel', async () => {
    const rows: (DrawnLine & { readonly timeUs: number; readonly expected: number })[] = [];
    for (const timeUs of AT_REST) {
      await seekAndCapture(host, timeUs, null);
      const drawn = await host.renderFrame.evaluate(() => {
        const lines: { nodeId: string; index: number; text: string; width: number }[] = [];
        for (const line of document.querySelectorAll<HTMLElement>('[data-kadrion-text-line]')) {
          const range = document.createRange();
          range.selectNodeContents(line);
          const rect = range.getBoundingClientRect();
          // A line of a page not shown is drawn nowhere.
          if (rect.width === 0 && rect.height === 0) continue;
          lines.push({
            nodeId: line.closest('[data-kadrion-node]')?.getAttribute('data-kadrion-node') ?? '',
            index: Number(line.getAttribute('data-kadrion-text-line')),
            text: line.textContent,
            width: rect.width,
          });
        }
        return lines;
      });
      for (const line of drawn) {
        rows.push({ ...line, timeUs, expected: measuredWidth(line.nodeId, line.index) });
      }
    }
    writeReport('framed-text/line-widths.json', { environment: pinnedRun(chromium), rows });
    // The premise: every measured node shows lines, the captions on both of their pages.
    expect(new Set(rows.map(({ nodeId }) => nodeId))).toEqual(new Set(MEASURED.keys()));
    const captions = rows.filter(({ nodeId }) => MEASURED.get(nodeId)?.type === 'captions');
    expect(new Set(captions.map(({ index }) => index)).size).toBeGreaterThan(2);
    const off = rows.filter(({ width, expected }) => Math.abs(width - expected) > HALF_PIXEL);
    expect(off).toEqual([]);
  }, 180_000);

  it('shows the frames of the Producer, pixel for pixel, seeking backward and forward (D33)', async () => {
    const produced = await framesAt(framedTextComposition, MORE);
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
    writeReport('framed-text/player-parity.json', { environment: pinnedRun(chromium), report });
    expect(report.filter(({ differingPixels }) => differingPixels > 0)).toEqual([]);
  }, 180_000);
});

describe('the outline and the shadow of the spoken word (D83.8)', () => {
  it('paints them on the spoken word and moves nothing: a pause looks the same without them', async () => {
    const plain = withHighlight((highlight) => {
      highlight['stroke'] = { kind: 'none' };
      highlight['shadow'] = { kind: 'none' };
    });
    // At 1.966 s no word is spoken; at 1.5 s the long word is.
    const [pause, spoken] = [1_966_666, 1_500_000];
    const lit = await framesAt(framedTextComposition, [pause, spoken]);
    const unlit = await framesAt(plain, [pause, spoken]);
    const [litPause, unlitPause] = [lit.get(pause), unlit.get(pause)];
    const [litSpoken, unlitSpoken] = [lit.get(spoken), unlit.get(spoken)];
    if (litPause === undefined || unlitPause === undefined) throw new Error('No pause frame.');
    if (litSpoken === undefined || unlitSpoken === undefined) throw new Error('No spoken frame.');
    expect(samePixels(litPause, unlitPause), pixelReport('pause', litPause, unlitPause)).toBe(true);
    expect(samePixels(litSpoken, unlitSpoken)).toBe(false);
  }, 120_000);
});

describe('the golden frames of the framed-text composition (D26.5)', () => {
  it('renders the composition as its golden frames', async () => {
    const reportPath = 'framed-text/golden-comparison.json';
    const environment = pinnedRun(chromium);
    const frames = await framesAt(framedTextComposition, TIMES);
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
    expect(report).toHaveLength(TIMES.length);
    for (const { timeUs, difference: found } of report) {
      expect(found?.differingPixels, String(timeUs)).toBe(0);
    }
  }, 120_000);
});

/** The golden frames as the manifest names them, or `null` before they are written. */
function goldenFiles(): {
  environment: { pinned: boolean };
  frames: { file: string; timeUs: number }[];
} | null {
  return existsSync(MANIFEST)
    ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
        environment: { pinned: boolean };
        frames: { file: string; timeUs: number }[];
      })
    : null;
}

/** The fixture with its font asset pinned to `bytes`, and a resolver that serves them as `mediaType`. */
function withFont(
  bytes: Uint8Array,
  mediaType: string,
): { document: unknown; resolveAsset: AssetResolver } {
  const draft = structuredClone(framedTextComposition) as {
    assets: { id: string; contentHash: string }[];
  };
  const asset = draft.assets.find(({ id }) => id === FONT.id);
  if (asset === undefined) throw new Error('The framed-text composition has no font asset.');
  asset.contentHash = sha256(bytes);
  return {
    document: draft,
    resolveAsset: ({ id }) => (id === FONT.id ? { mediaType, bytes } : null),
  };
}

describe('the framed-text composition with its font as WOFF and as WOFF2 (D84)', () => {
  it.each([
    ['WOFF', 'font/woff', encodeWoff(FONT.bytes)],
    ['WOFF2', 'font/woff2', encodeWoff2(FONT.bytes, { glyf: 'transformed', hmtx: 3 })],
  ])('renders the golden frames from its font as %s', async (format, mediaType, bytes) => {
    const reportPath = `framed-text/golden-comparison-${format.toLowerCase()}.json`;
    const environment = pinnedRun(chromium);
    // The premise: the bytes are the other format, and Node measures them as the sfnt font.
    expect(sha256(bytes)).not.toBe(sha256(FONT.bytes));
    expect(fontMetrics(bytes)).toEqual(METRICS);
    const { document, resolveAsset } = withFont(bytes, mediaType);
    const { frames } = await renderFrames({ document, resolveAsset, timesUs: TIMES, chromium });
    const goldens = goldenFiles();
    const report = TIMES.map((timeUs) => {
      const png = frames.find((frame) => frame.timeUs === timeUs)?.png;
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
    writeReport(reportPath, { environment, format, goldens: goldens !== null, report });
    if (!environment.pinned) {
      console.info(`Not the pinned environment: ${reportPath} is not asserted.`);
      return;
    }
    expect(
      goldens,
      'Run "node --run goldens:update" in the pinned container first.',
    ).not.toBeNull();
    expect(report).toHaveLength(TIMES.length);
    for (const { timeUs, difference: found } of report) {
      expect(found?.differingPixels, String(timeUs)).toBe(0);
    }
  });
});

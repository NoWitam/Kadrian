/**
 * A number in a text in pinned Chromium (D91.2, D65.8). The fixture of numbers
 * holds the probes of D91.2: a count from 0 to 1 234 567,89 grouped by spaces
 * with a decimal comma, a whole number from -3 through zero to 3, six
 * decimals after a prefix in a frame eased by a curve that overshoots, a
 * score with a prefix and a suffix wrapped in a frame whose letters fade in
 * one after another, a count grouped by full stops that jumps in steps, and a
 * still number below half a millionth without a sign. Its frames meet their
 * golden frames (D26.5); every probe is a frame that does not depend on the
 * frames rendered before it, the Player shows the Producer's frame exactly,
 * and each host gives the same frame twice. In the Player's render page, the
 * box of every number and the box behind its lines are the same in every
 * frame, every line is as wide as `numberTextLayout` says within half a pixel,
 * every digit stands in a cell as wide as the widest digit, and every glyph
 * comes from the numeral font, none from a fallback.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { launchChromium, renderFrames, type LaunchedChromium } from '@kadrion/producer';
import type { AssetResolver } from '@kadrion/renderer-dom';
import {
  evaluateComposition,
  fontMetrics,
  numberTextLayout,
  numberValueAt,
  type NumberTextNode,
} from '@kadrion/runtime';
import { validateComposition } from '@kadrion/schema';
import {
  generateNumeralFontAsset,
  NUMERAL_FONT_FAMILY_NAME,
  numberComposition,
  numberGoldenTimestamps,
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
  differingPixels,
  frameSession,
  GOLDEN_DIRECTORY,
  OUTPUT_DIRECTORY,
  pinnedRun,
  samePixels,
  writeReport,
} from './support.js';

const MANIFEST = join(GOLDEN_DIRECTORY, 'number.golden-frames.json');
const TIMES = numberGoldenTimestamps.map(({ timeUs }) => timeUs);
/** The probes: the golden timestamps, the whole number at zero, and the steps between two jumps. */
const PROBE_TIMES = [...TIMES, 466_666, 233_333];
/** Another time, rendered or sought before a probe's time. */
const OTHER_US = 833_333;
/** Every frame of the fixture: 1 s at 30 fps. */
const EVERY_FRAME = Array.from({ length: 30 }, (_, frame) => Math.floor((frame * 1_000_000) / 30));
/** From here every letter of the score is at rest, so a line is as wide as it is laid out. */
const AT_REST_US = 500_000;
const HALF_PIXEL = 0.5;
/** Chromium lays boxes out in sixty-fourths of a pixel: a box of 19.2 px is 19.1875 px wide. */
const LAYOUT_UNIT = 1 / 64;

const FONT = generateNumeralFontAsset();
const ASSETS = [FONT];
const resolver: AssetResolver = ({ id }) =>
  id === FONT.id ? { mediaType: FONT.mediaType, bytes: FONT.bytes } : null;
const METRICS = fontMetrics(FONT.bytes);
const FONTS = new Map([[FONT.id, METRICS]]);

const validated = validateComposition(numberComposition);
if (!validated.ok) throw new Error('The number composition is not valid.');
const composition = validated.composition;

/** Every text with a number of the fixture by ID. */
const NUMBERS: ReadonlyMap<string, NumberTextNode> = new Map(
  (composition.scenes[0]?.nodes ?? [])
    .filter((node): node is NumberTextNode => node.type === 'text' && node.number.kind === 'number')
    .map((node) => [node.id, node]),
);

let chromium: LaunchedChromium;

beforeAll(async () => {
  chromium = await launchChromium();
}, 60_000);

afterAll(async () => {
  await chromium.browser.close();
});

/** The Producer's frame at `timeUs`, after the frames at `before` in the same render. */
async function produced(timeUs: number, before: readonly number[] = []): Promise<Uint8Array> {
  const { frames } = await renderFrames({
    document: numberComposition,
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
  mkdirSync(join(OUTPUT_DIRECTORY, 'number'), { recursive: true });
  writeFileSync(join(OUTPUT_DIRECTORY, 'number', `${slug}-expected.png`), expected);
  writeFileSync(join(OUTPUT_DIRECTORY, 'number', `${slug}-found.png`), found);
  writeReport(join('number', `${slug}-pixels.json`), {
    pixels: differingPixels(decodePng(expected), decodePng(found), 2000),
  });
}

describe('a number in a text in pinned Chromium (D91.2)', () => {
  it('renders the fixture of numbers as its golden frames (D26.5)', async () => {
    const reportPath = 'number/golden-comparison.json';
    const environment = pinnedRun(chromium);
    const { frames } = await renderFrames({
      document: numberComposition,
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
    const host = await openConformanceHost(chromium, JSON.stringify(numberComposition), ASSETS);
    try {
      for (const timeUs of PROBE_TIMES) {
        const first = await produced(timeUs);
        const second = await produced(timeUs);
        const later = await produced(timeUs, [OTHER_US]);
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
    writeReport(join('number', 'probes.json'), { environment: pinnedRun(chromium), rows });
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
});

/** What the render page draws of one text with a number at one instant. */
interface DrawnNumber {
  readonly nodeId: string;
  /** The rectangle of the node's element, which is its box. */
  readonly box: readonly number[];
  /** The rectangle of the text's box behind its lines, or null without one. */
  readonly textBox: readonly number[] | null;
  readonly lines: readonly { readonly text: string; readonly width: number }[];
  /** The width of every cell of a digit. */
  readonly cells: readonly number[];
}

describe('the box, the lines, and the cells in the Player (D83.2, D91.2)', () => {
  let host: ConformanceHost;

  beforeAll(async () => {
    host = await openConformanceHost(chromium, JSON.stringify(numberComposition), ASSETS);
  }, 120_000);

  afterAll(async () => {
    await closeConformanceHost(host);
  });

  /** What the render page draws of every text with a number, read twice. */
  async function drawn(): Promise<DrawnNumber[]> {
    const read = (): Promise<DrawnNumber[]> =>
      host.renderFrame.evaluate(() => {
        const rect = (element: Element): number[] => {
          const { x, y, width, height } = element.getBoundingClientRect();
          return [x, y, width, height];
        };
        return [...document.querySelectorAll<HTMLElement>('[data-kadrion-number]')].map(
          (element) => {
            const textBox = element.querySelector(':scope > [data-kadrion-text-box]');
            const lines = [
              ...element.querySelectorAll<HTMLElement>(':scope > [data-kadrion-text-line]'),
            ].map((line) => {
              const range = document.createRange();
              range.selectNodeContents(line);
              return { text: line.textContent, width: range.getBoundingClientRect().width };
            });
            return {
              nodeId: element.getAttribute('data-kadrion-node') ?? '',
              box: rect(element),
              textBox: textBox === null ? null : rect(textBox),
              lines,
              cells: [...element.querySelectorAll('[data-kadrion-digit-cell]')].map(
                (cell) => cell.getBoundingClientRect().width,
              ),
            };
          },
        );
      });
    const first = await read();
    expect(await read()).toEqual(first);
    return first;
  }

  it('keeps the box of every number and the box behind its lines in every frame, as the layout says', async () => {
    const boxes = new Map<string, string>();
    const rows: { timeUs: number; nodeId: string; box: readonly number[] }[] = [];
    for (const timeUs of EVERY_FRAME) {
      await seekAndCapture(host, timeUs, null);
      const state = evaluateComposition(composition, timeUs, FONTS);
      for (const number of await drawn()) {
        const node = NUMBERS.get(number.nodeId);
        if (node === undefined) throw new Error(`No number ${number.nodeId}.`);
        const layout = numberTextLayout(node, numberValueAt(node, timeUs), METRICS);
        const key = JSON.stringify([number.box, number.textBox]);
        expect(boxes.get(number.nodeId) ?? key, `${number.nodeId} at ${String(timeUs)}`).toBe(key);
        boxes.set(number.nodeId, key);
        rows.push({ timeUs, nodeId: number.nodeId, box: number.box });
        // The box is the layout's, and the text the state's.
        expect(Math.abs((number.box[2] ?? 0) - layout.width)).toBeLessThanOrEqual(LAYOUT_UNIT);
        expect(Math.abs((number.box[3] ?? 0) - layout.height)).toBeLessThanOrEqual(LAYOUT_UNIT);
        const shown = state.scenes[0]?.nodes.find((each) => each.id === number.nodeId);
        if (shown?.type !== 'text') throw new Error(number.nodeId);
        expect(number.lines.map(({ text }) => text)).toEqual(
          shown.number?.lines.map(({ text }) => text),
        );
      }
    }
    writeReport(join('number', 'boxes.json'), { environment: pinnedRun(chromium), rows });
    expect(boxes.size).toBe(NUMBERS.size);
  }, 300_000);

  it('draws every line as wide as numberTextLayout says, within half a pixel, every digit in its cell', async () => {
    const rows: {
      timeUs: number;
      nodeId: string;
      text: string;
      width: number;
      expected: number;
    }[] = [];
    const cells: { nodeId: string; width: number; expected: number }[] = [];
    for (const timeUs of EVERY_FRAME.filter((time) => time >= AT_REST_US)) {
      await seekAndCapture(host, timeUs, null);
      for (const number of await drawn()) {
        const node = NUMBERS.get(number.nodeId);
        if (node === undefined) throw new Error(`No number ${number.nodeId}.`);
        const layout = numberTextLayout(node, numberValueAt(node, timeUs), METRICS);
        number.lines.forEach((line, index) => {
          rows.push({
            timeUs,
            nodeId: number.nodeId,
            text: line.text,
            width: line.width,
            expected: layout.lines[index]?.width ?? Number.NaN,
          });
        });
        for (const width of number.cells) {
          cells.push({ nodeId: number.nodeId, width, expected: layout.cell });
        }
      }
    }
    writeReport(join('number', 'line-widths.json'), {
      environment: pinnedRun(chromium),
      rows,
      cells,
    });
    expect(new Set(rows.map(({ nodeId }) => nodeId))).toEqual(new Set(NUMBERS.keys()));
    expect(
      rows.filter(({ width, expected }) => !(Math.abs(width - expected) <= HALF_PIXEL)),
    ).toEqual([]);
    expect(cells.length).toBeGreaterThan(100);
    expect(
      cells.filter(({ width, expected }) => !(Math.abs(width - expected) <= LAYOUT_UNIT)),
    ).toEqual([]);
  }, 300_000);

  it('draws every glyph of every number from the numeral font, none from a fallback', async () => {
    await seekAndCapture(host, 966_666, null);
    const session = await frameSession(host.page, host.renderFrame);
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    interface DomNode {
      readonly nodeId: number;
      readonly nodeType: number;
      readonly attributes?: readonly string[];
      readonly children?: readonly DomNode[];
      readonly contentDocument?: DomNode;
    }
    const { root } = (await session.send('DOM.getDocument', { depth: -1, pierce: true })) as {
      root: DomNode;
    };
    // Every element inside a text with a number that holds text of its own.
    const holders: { nodeId: string; domId: number }[] = [];
    const visit = (node: DomNode, inside: string | null): void => {
      const attributes = node.attributes ?? [];
      const at = attributes.indexOf('data-kadrion-node');
      const id = at >= 0 ? (attributes[at + 1] ?? null) : null;
      const owner = id !== null && NUMBERS.has(id) ? id : inside;
      const children = node.children ?? [];
      if (owner !== null && children.some((child) => child.nodeType === 3)) {
        holders.push({ nodeId: owner, domId: node.nodeId });
      }
      for (const child of children) visit(child, owner);
      if (node.contentDocument !== undefined) visit(node.contentDocument, owner);
    };
    visit(root, null);
    const fonts: { nodeId: string; familyName: string; isCustomFont: boolean }[] = [];
    for (const { nodeId, domId } of holders) {
      const { fonts: used } = (await session.send('CSS.getPlatformFontsForNode', {
        nodeId: domId,
      })) as { fonts: { familyName: string; isCustomFont: boolean }[] };
      for (const { familyName, isCustomFont } of used) {
        fonts.push({ nodeId, familyName, isCustomFont });
      }
    }
    writeReport(join('number', 'fonts.json'), { environment: pinnedRun(chromium), fonts });
    expect(new Set(fonts.map(({ nodeId }) => nodeId))).toEqual(new Set(NUMBERS.keys()));
    expect(
      fonts.filter(
        ({ familyName, isCustomFont }) => familyName !== NUMERAL_FONT_FAMILY_NAME || !isCustomFont,
      ),
    ).toEqual([]);
  }, 120_000);
});

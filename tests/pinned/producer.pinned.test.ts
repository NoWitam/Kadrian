/**
 * P2 in Chromium (D26, D28): the Producer renders the five golden timestamps of
 * the reference composition to PNG. Repeatability, order independence, and
 * clock independence (§6.1), the typed errors before the first frame, the
 * rendered tree and the fonts, pixel checks that need no golden file, and the
 * lifetime of a node in pixels (D42.6).
 * Golden frames are compared only in the pinned environment (D26.2); anywhere
 * else this file proves nothing about P2 and says so.
 */
import { rmSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';

import {
  awaitPresented,
  captureFrame,
  launchChromium,
  networkFacts,
  openRenderSession,
  PINNED_IMAGE,
  PINNED_IMAGE_VARIABLE,
  renderFrames,
  sha256,
  type LaunchedChromium,
  type RenderResult,
} from '@kadrion/producer';
import { resolveAssets } from '@kadrion/renderer-dom';
import { goldenTimestamps, referenceComposition } from '@kadrion/test-fixtures';
import { validateComposition } from '@kadrion/schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  BAR,
  customHtmlNode,
  decodePng,
  difference,
  expectedBar,
  expectedTree,
  fontsUsed,
  frameSession,
  goldenFileName,
  HEIGHT,
  imageBox,
  inSinglePrecision,
  measuredBar,
  pinnedRun,
  pixel,
  readGoldens,
  observingResolver,
  OUTPUT_DIRECTORY,
  referenceResolver,
  pixelReport,
  samePixels,
  shownTree,
  variant,
  WIDTH,
  writeReport,
  type Draft,
  type DraftNode,
} from './support.js';

const times = goldenTimestamps.map(({ timeUs }) => timeUs);
let chromium: LaunchedChromium;
let baseline: RenderResult;

const observed = observingResolver();
const render = (timesUs: readonly number[], document: unknown = referenceComposition) =>
  renderFrames({ document, resolveAsset: observed.resolve, timesUs, chromium });

const frameAt = (result: RenderResult, timeUs: number): Uint8Array => {
  const found = result.frames.find((frame) => frame.timeUs === timeUs);
  if (found === undefined) throw new Error(`No frame at ${String(timeUs)}.`);
  return found.png;
};

beforeAll(async () => {
  chromium = await launchChromium();
  baseline = await render(times);
});

afterAll(async () => {
  await chromium.browser.close();
});

describe('the pinned Chromium (D26.3)', () => {
  it('records the network interfaces this host reports, not assumed ones (D28.9)', () => {
    expect(baseline.manifest.environment.network).toEqual(
      networkFacts(Object.keys(networkInterfaces())),
    );
  });

  it('reports the expected build', () => {
    expect(chromium.reportedVersion).toBe('153.0.8010.12');
    expect(baseline.manifest.chromium).toMatchObject({
      playwrightCore: '1.63.0',
      revision: '1243',
      expectedVersion: '153.0.8010.12',
      reportedVersion: '153.0.8010.12',
      channel: 'chromium',
    });
  });
});

describe('P2: the five golden timestamps (D28.4, D28.7)', () => {
  it('are rendered as 1080 x 1920 PNG frames, with their frame indices and hashes', () => {
    expect(baseline.frames.map(({ index, timeUs }) => [index, timeUs])).toEqual(
      goldenTimestamps.map(({ frame, timeUs }) => [frame, timeUs]),
    );
    for (const frame of baseline.frames) {
      const image = decodePng(frame.png);
      expect([image.width, image.height]).toEqual([WIDTH, HEIGHT]);
    }
    expect(baseline.manifest.frames.map(({ sha256: hash }) => hash)).toEqual(
      baseline.frames.map(({ png }) => sha256(png)),
    );
  });

  it('record the render manifest of §8', () => {
    const { manifest } = baseline;
    expect(manifest).toMatchObject({
      manifestVersion: 2,
      schemaVersion: '0.2',
      preset: { name: 'frames-png', width: 1080, height: 1920, fps: 30, deviceScaleFactor: 1 },
      durationUs: 10_000_000,
      frameCount: 300,
      ffmpeg: null,
    });
    expect(manifest.compositionHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(manifest.assets).toEqual([
      expect.objectContaining({ id: 'asset-image', type: 'image', mediaType: 'image/png' }),
      expect.objectContaining({ id: 'asset-audio', type: 'audio', mediaType: 'audio/wav' }),
      expect.objectContaining({
        id: 'asset-font',
        type: 'font',
        mediaType: 'font/ttf',
        family: 'kadrion-font-asset-font',
      }),
    ]);
    expect(Object.keys(manifest).join()).not.toMatch(/time(stamp)?At|date|elapsed/i);
  });

  it('show the Custom HTML bar at the width of each time (D23, D28.5)', () => {
    for (const timeUs of times) {
      expect(measuredBar(decodePng(frameAt(baseline, timeUs))), String(timeUs)).toBe(
        expectedBar(timeUs),
      );
    }
  });

  it('place the scaled image inside its group at the box of the expected tree (D22)', () => {
    for (const timeUs of times) {
      const image = decodePng(frameAt(baseline, timeUs));
      const box = imageBox(timeUs);
      const inside = (x: number, y: number) => pixel(image, Math.round(x), Math.round(y));
      // The generated image has a white border; the background is #0b1020.
      expect(inside(box.x0 + 3, box.y0 + 3), `${String(timeUs)} top-left`).toEqual([255, 255, 255]);
      expect(inside(box.x1 - 4, box.y1 - 4), `${String(timeUs)} bottom-right`).toEqual([
        255, 255, 255,
      ]);
      expect(inside(box.x0 - 3, box.y0 - 3), `${String(timeUs)} outside`).toEqual([11, 16, 32]);
      expect(inside(box.x1 + 3, box.y1 + 3), `${String(timeUs)} outside`).toEqual([11, 16, 32]);
    }
  });

  it('are compared with the golden frames in the pinned environment only (D26.5)', () => {
    const environment = pinnedRun(chromium);
    const goldens = readGoldens();
    const report = times.map((timeUs) => {
      const golden = goldens?.frames.get(timeUs);
      return {
        timeUs,
        file: goldenFileName(timeUs),
        difference:
          golden === undefined
            ? null
            : difference(decodePng(golden), decodePng(frameAt(baseline, timeUs))),
      };
    });
    // A run that claims the pinned image never falls back to a report: CI (Q14,
    // criterion 8) and the reference run set the variable (D26.2).
    const claimed = process.env[PINNED_IMAGE_VARIABLE];
    // A comparison that fails its gate is kept for diagnosis, but never under the
    // name of a good one, which CI publishes and Q14 evidence requires.
    const failed =
      (claimed !== undefined && (claimed !== PINNED_IMAGE || !environment.pinned)) ||
      (environment.pinned &&
        (goldens?.manifest.environment.pinned !== true ||
          report.some(
            (row) =>
              row.difference?.differingPixels !== 0 || row.difference.maxChannelDifference !== 0,
          )));
    for (const name of ['golden-comparison.json', 'golden-comparison.failed.json']) {
      rmSync(join(OUTPUT_DIRECTORY, name), { force: true });
    }
    writeReport(failed ? 'golden-comparison.failed.json' : 'golden-comparison.json', {
      environment,
      goldens: goldens !== null,
      report,
      assetsServed: [...observed.served]
        .map(([id, hash]) => ({ id, sha256: hash }))
        .sort((a, b) => (a.id < b.id ? -1 : 1)),
    });
    if (claimed !== undefined) {
      expect(claimed, `${PINNED_IMAGE_VARIABLE} names another image`).toBe(PINNED_IMAGE);
      expect(environment.pinned, 'a run that claims the pinned image is not pinned').toBe(true);
    }
    if (!environment.pinned) {
      // Informative only (§5 P2): nothing is asserted against goldens outside the container.
      console.info(
        `Not the pinned environment (${environment.os}/${environment.arch}, image ${String(environment.image)}): golden frames are not asserted. P2 is not proven by this run.`,
      );
      return;
    }
    expect(
      goldens,
      'Run "node --run goldens:update" in the pinned container first.',
    ).not.toBeNull();
    expect(goldens?.manifest.environment.pinned).toBe(true);
    for (const { timeUs, difference: found } of report) {
      expect(found?.differingPixels, String(timeUs)).toBe(0);
    }
  });
});

describe('determinism of the reference output (§6.1)', () => {
  it('repeats: three renders, each in a fresh page, give identical pixels', async () => {
    const renders = [baseline, await render(times), await render(times)];
    for (const timeUs of times) {
      const [first, ...rest] = renders.map((result) => frameAt(result, timeUs));
      for (const other of rest)
        expect(
          samePixels(first ?? new Uint8Array(0), other),
          pixelReport(`repeat of ${String(timeUs)}`, first ?? new Uint8Array(0), other),
        ).toBe(true);
    }
  });

  it.each([
    ['descending', [...times].reverse()],
    ['shuffled', [times[2], times[0], times[4], times[1], times[3]]],
  ])('is independent of order: %s in one page gives the same frames', async (_, order) => {
    const result = await render(order as number[]);
    for (const timeUs of times) {
      expect(
        samePixels(frameAt(baseline, timeUs), frameAt(result, timeUs)),
        pixelReport(String(timeUs), frameAt(baseline, timeUs), frameAt(result, timeUs)),
      ).toBe(true);
    }
  });

  it('loads once per render and renders every frame in the same page (D28.4)', async () => {
    const composition = validateComposition(referenceComposition);
    if (!composition.ok) throw new Error('invalid');
    const session = await openRenderSession({
      chromium,
      width: WIDTH,
      height: HEIGHT,
      customHtmlNodes: 1,
    });
    try {
      const assets = await resolveAssets(composition.composition, referenceResolver, (bytes) =>
        Promise.resolve(sha256(bytes)),
      );
      await session.load(JSON.stringify(composition.composition), assets);
      await session.frame(0, 0);
      await session.frame(297, 9_900_000);
      await expect(session.stats()).resolves.toEqual({ loads: 1, frames: 2 });
    } finally {
      await session.close();
    }
  });

  it('does not depend on the clocks of the page: they throw, and the frames are the same', async () => {
    const composition = validateComposition(referenceComposition);
    if (!composition.ok) throw new Error('invalid');
    const session = await openRenderSession({
      chromium,
      width: WIDTH,
      height: HEIGHT,
      customHtmlNodes: 1,
    });
    try {
      // After the agent captured its timer and font constructor, and before anything renders.
      const poisoned = await session.renderFrame.evaluate(() => {
        const fail = (name: string) => () => {
          throw new Error(`${name} is poisoned`);
        };
        const view = window as unknown as Record<string, unknown>;
        for (const name of [
          'setTimeout',
          'setInterval',
          'requestAnimationFrame',
          'requestIdleCallback',
          'queueMicrotask',
          'FontFace',
        ]) {
          view[name] = fail(name);
        }
        Date.now = fail('Date.now');
        view.Date = fail('Date');
        Object.defineProperty(performance, 'now', { value: fail('performance.now') });
        Math.random = fail('Math.random');
        const probes: Record<string, string> = {};
        for (const [name, call] of Object.entries({
          'Date.now': () => Date.now(),
          'performance.now': () => performance.now(),
          setTimeout: () => setTimeout(() => undefined, 0),
          requestAnimationFrame: () => requestAnimationFrame(() => undefined),
          'Math.random': () => Math.random(),
        })) {
          try {
            call();
            probes[name] = 'ran';
          } catch {
            probes[name] = 'threw';
          }
        }
        return probes;
      });
      // Premise: the page's clocks really throw now.
      expect(Object.values(poisoned)).toEqual(['threw', 'threw', 'threw', 'threw', 'threw']);
      const assets = await resolveAssets(composition.composition, referenceResolver, (bytes) =>
        Promise.resolve(sha256(bytes)),
      );
      await session.load(JSON.stringify(composition.composition), assets);
      for (const { frame, timeUs } of goldenTimestamps) {
        const png = await session.frame(frame, timeUs);
        expect(
          samePixels(frameAt(baseline, timeUs), png),
          pixelReport(String(timeUs), frameAt(baseline, timeUs), png),
        ).toBe(true);
      }
    } finally {
      await session.close();
    }
  });
});

describe('the rendered page (D22, D27)', () => {
  it('holds the hand-derived tree at every golden timestamp, and loads nothing', async () => {
    const composition = validateComposition(referenceComposition);
    if (!composition.ok) throw new Error('invalid');
    const session = await openRenderSession({
      chromium,
      width: WIDTH,
      height: HEIGHT,
      customHtmlNodes: 1,
    });
    try {
      const assets = await resolveAssets(composition.composition, referenceResolver, (bytes) =>
        Promise.resolve(sha256(bytes)),
      );
      await session.load(JSON.stringify(composition.composition), assets);
      for (const { frame, timeUs } of goldenTimestamps) {
        await session.frame(frame, timeUs);
        const shown = await shownTree(session.renderFrame, expectedTree(timeUs));
        expect(inSinglePrecision(shown), String(timeUs)).toEqual(
          inSinglePrecision(expectedTree(timeUs)),
        );
      }
      const view = await session.renderFrame.evaluate(() => ({
        dpr: devicePixelRatio,
        origin: self.origin,
        width: innerWidth,
        height: innerHeight,
      }));
      expect(view).toEqual({ dpr: 1, origin: 'null', width: WIDTH, height: HEIGHT });
      // Every text node is drawn with the fixture font only: no system fallback (D27).
      const fonts = await fontsUsed(await frameSession(session.page, session.renderFrame));
      expect(fonts).toEqual({
        'node-title': [{ familyName: 'Kadrion Fixture', isCustomFont: true, glyphCount: 7 }],
        'node-caption': [{ familyName: 'Kadrion Fixture', isCustomFont: true, glyphCount: 23 }],
      });
      expect(session.requests).toEqual([]);
      writeReport('producer-processes.json', {
        outOfProcessFrames: await session.outOfProcessFrames(),
        note: 'Frames of the page with a CDP target of their own (D28.5); informative outside the pinned environment.',
      });
    } finally {
      await session.close();
    }
  });
});

describe('typed errors before the first frame (D28.6)', () => {
  const silent = variant((draft) => {
    customHtmlNode(draft).html = '<p>no answer</p>';
  });
  const corruptImage = variant(() => undefined, {
    'asset-image': Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13),
  });
  const corruptFont = variant(() => undefined, { 'asset-font': Uint8Array.of(0, 1, 0, 0, 0, 0) });

  it.each([
    ['a Custom HTML element that never answers', silent, 'custom-html-timeout'],
    ['an image that does not decode', corruptImage, 'asset-decode-failed'],
    ['a font that does not load', corruptFont, 'font-load-failed'],
    [
      'a missing asset',
      { document: referenceComposition, resolveAsset: () => null },
      'asset-missing',
    ],
    [
      'bytes of another hash',
      {
        document: referenceComposition,
        resolveAsset: () => ({ bytes: Uint8Array.of(1), mediaType: 'image/png' }),
      },
      'asset-hash-mismatch',
    ],
  ])('reports %s and delivers no frame', async (_, { document, resolveAsset }, code) => {
    await expect(
      renderFrames({ document, resolveAsset, timesUs: [0], chromium, ackTimeoutMs: 300 }),
    ).rejects.toMatchObject({ name: 'ProducerError', code });
  });

  // D28.1: the runtime loads nothing, so a request of the render page itself fails
  // the render; a Custom HTML element's attempt does not (custom-html.pinned.test.ts).
  it('fails with network-request when the render page itself requests something', async () => {
    const composition = validateComposition(referenceComposition);
    if (!composition.ok) throw new Error('invalid');
    const session = await openRenderSession({
      chromium,
      width: WIDTH,
      height: HEIGHT,
      customHtmlNodes: 1,
    });
    try {
      const assets = await resolveAssets(composition.composition, referenceResolver, (bytes) =>
        Promise.resolve(sha256(bytes)),
      );
      await session.load(JSON.stringify(composition.composition), assets);
      await session.renderFrame.evaluate(() => {
        const image = new Image();
        image.src = 'https://kadrion-probe.invalid/from-the-render-page.png';
      });
      await expect(session.frame(0, 0)).rejects.toMatchObject({ code: 'network-request' });
      expect(session.blockedRequests).toEqual([]);
    } finally {
      await session.close();
    }
  });
});

describe('the presentation barrier (D25, D28.5)', () => {
  /** An element that adds a nested frame of its own after its first acknowledgement. */
  const nesting = variant((draft) => {
    customHtmlNode(draft).html = [
      "<!doctype html><meta charset='utf-8'><div id='bar'></div><script>(function(){var added=false;",
      "var id=document.querySelector('meta[name=kadrion-instance]').getAttribute('content');",
      "addEventListener('message',function(e){if(e.source!==window.parent)return;var d=e.data;if(!d||d.type!=='kadrion:time')return;",
      "window.parent.postMessage({type:'kadrion:time-ack',version:1,instanceId:id,requestId:d.requestId,timeUs:d.timeUs},'*');",
      "if(!added){added=true;var f=document.createElement('iframe');f.setAttribute('srcdoc','<p>nested</p>');document.body.appendChild(f)}})})()",
      '</script>',
    ].join('');
  });

  it('waits for every frame of the page, including one that appeared after the load', async () => {
    const composition = validateComposition(nesting.document);
    if (!composition.ok) throw new Error('invalid');
    const session = await openRenderSession({
      chromium,
      width: WIDTH,
      height: HEIGHT,
      customHtmlNodes: 1,
    });
    try {
      const assets = await resolveAssets(composition.composition, nesting.resolveAsset, (bytes) =>
        Promise.resolve(sha256(bytes)),
      );
      await session.load(JSON.stringify(composition.composition), assets);
      await session.frame(0, 0);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const frames = session.page.frames().length;
      // Premise: host, render page, element, and the element's own frame.
      expect(frames).toBe(4);
      await expect(awaitPresented(session.page, 5_000)).resolves.toBe(frames);
      await session.frame(75, 2_500_000);
    } finally {
      await session.close();
    }
  });

  /**
   * An element that replaces its own `requestAnimationFrame` so that it answers
   * at once, acknowledges the time, and applies it only in the next real
   * animation frame: a barrier in the page's realm would be fooled.
   */
  const late = variant((draft) => {
    customHtmlNode(draft).html = [
      "<!doctype html><meta charset='utf-8'><style>html,body{margin:0;height:100%;background:#1d2939}#bar{width:0;height:100%;background:#f79009}</style><div id='bar'></div><script>",
      '(function(){var real=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=function(cb){cb(0);return 0};',
      "var id=document.querySelector('meta[name=kadrion-instance]').getAttribute('content');",
      "addEventListener('message',function(e){if(e.source!==window.parent)return;var d=e.data;if(!d||d.type!=='kadrion:time')return;",
      "window.parent.postMessage({type:'kadrion:time-ack',version:1,instanceId:id,requestId:d.requestId,timeUs:d.timeUs},'*');",
      "real(function(){document.getElementById('bar').style.width=d.timeUs/100000+'%'})})})()",
      '</script>',
    ].join('');
  });

  it('captures an element that paints one frame after its acknowledgement with its new state', async () => {
    const order = [9_900_000, 0, 7_500_000, 2_500_000, 5_000_000, 0];
    const result = await renderFrames({ ...late, timesUs: order, chromium });
    result.frames.forEach(({ timeUs, png }) => {
      expect(measuredBar(decodePng(png)), String(timeUs)).toBe(expectedBar(timeUs));
    });
  });

  it('is measured: captures without it, right after ready, are reported', async () => {
    const composition = validateComposition(late.document);
    if (!composition.ok) throw new Error('invalid');
    const session = await openRenderSession({
      chromium,
      width: WIDTH,
      height: HEIGHT,
      customHtmlNodes: 1,
    });
    const rows: {
      timeUs: number;
      withoutBarrier: number;
      withBarrier: number;
      expected: number;
    }[] = [];
    try {
      const assets = await resolveAssets(composition.composition, late.resolveAsset, (bytes) =>
        Promise.resolve(sha256(bytes)),
      );
      await session.load(JSON.stringify(composition.composition), assets);
      for (let round = 0; round < 6; round += 1) {
        const timeUs = round % 2 === 0 ? 9_900_000 : 0;
        const outcome = await session.renderFrame.evaluate(
          ([time, id]) =>
            (
              window as unknown as {
                kadrionProducer: {
                  frame(t: number, r: number, a: number): Promise<{ ok: boolean }>;
                };
              }
            ).kadrionProducer.frame(time, id, 2_000),
          [timeUs, 1_000 + round] as const,
        );
        expect(outcome.ok).toBe(true);
        const immediate = measuredBar(decodePng(await captureFrame(session.page, WIDTH, HEIGHT)));
        await awaitPresented(session.page, 5_000);
        const presented = measuredBar(decodePng(await captureFrame(session.page, WIDTH, HEIGHT)));
        rows.push({
          timeUs,
          withoutBarrier: immediate,
          withBarrier: presented,
          expected: expectedBar(timeUs),
        });
      }
    } finally {
      await session.close();
    }
    const stale = rows.filter((row) => row.withoutBarrier !== row.expected).length;
    writeReport('presentation-barrier.json', {
      rows,
      staleWithoutBarrier: stale,
      note: 'Informative outside the pinned environment (D28).',
    });
    console.info(
      `Presentation barrier: ${String(stale)} of ${String(rows.length)} captures without it were stale.`,
    );
    for (const row of rows) expect(row.withBarrier).toBe(row.expected);
  });
});

describe('the lifetime of a node in pixels (D42.4, D42.5, D42.6)', () => {
  /**
   * A lifetime that begins after every time these tests render at, at a time
   * that is not on the frame grid: the node is never active on a rendered frame.
   */
  const NEVER = { startUs: 9_990_000, durationUs: 1 } as const;
  /**
   * Every node of the reference composition but its Custom HTML element. A
   * hidden Custom HTML frame is the pending assumption of D42.4, and only the
   * rows of "a Custom HTML element with a lifetime" below carry it: no other row
   * hides one.
   */
  const OTHER_NODES = ['node-background', 'node-group', 'node-image', 'node-caption', 'node-title'];
  /** A golden timestamp, on the frame grid: frame 75 at 30 fps. */
  const T = 2_500_000;

  function nodeOf(draft: Draft, id: string): DraftNode {
    for (const node of draft.scenes[0]?.nodes ?? []) {
      if (node.id === id) return node;
      const child = node.children?.find((candidate) => candidate.id === id);
      if (child !== undefined) return child;
    }
    throw new Error(`The reference composition has no node ${id}.`);
  }

  /** The reference composition with the lifetime of some nodes replaced. */
  function living(lifetimes: Readonly<Record<string, { startUs: number; durationUs: number }>>) {
    return variant((draft) => {
      for (const [id, { startUs, durationUs }] of Object.entries(lifetimes)) {
        const node = nodeOf(draft, id);
        node['startUs'] = startUs;
        node['durationUs'] = durationUs;
      }
    });
  }

  /** The reference composition without one node, wherever it is. */
  function without(id: string) {
    return variant((draft) => {
      for (const scene of draft.scenes) {
        scene.nodes = scene.nodes.filter((node) => node.id !== id);
        for (const node of scene.nodes) {
          if (node.children !== undefined) {
            node.children = node.children.filter((child) => child.id !== id);
          }
        }
      }
    });
  }

  /** One time of a document, rendered alone in a page of its own: a fresh render. */
  async function fresh(document: ReturnType<typeof variant>, timeUs: number): Promise<Uint8Array> {
    const result = await renderFrames({ ...document, timesUs: [timeUs], chromium });
    const png = result.frames[0]?.png;
    if (png === undefined) throw new Error(`No frame at ${String(timeUs)}.`);
    return png;
  }

  /** How many pixels of a region are not opaque white, alpha included. */
  function notWhite(
    png: Uint8Array,
    region: { x0: number; y0: number; x1: number; y1: number },
  ): number {
    const image = decodePng(png);
    let count = 0;
    for (let y = Math.ceil(region.y0); y < Math.floor(region.y1); y += 1) {
      for (let x = Math.ceil(region.x0); x < Math.floor(region.x1); x += 1) {
        const at = (y * image.width + x) * 4;
        const white = [0, 1, 2, 3].every((channel) => image.data[at + channel] === 255);
        if (!white) count += 1;
      }
    }
    return count;
  }

  const WHOLE = { x0: 0, y0: 0, x1: WIDTH, y1: HEIGHT };

  it('hides an inactive background alone: an uncovered region is white and the other nodes are drawn', async () => {
    // A controlled scene: the reference composition with its title in a colour
    // that shows on white. The title of the fixture is white, and would be
    // invisible on the clear colour whether it was drawn or not.
    const TITLE_COLOUR = '#b42318';
    const scene = (lifetimes: Parameters<typeof living>[0] = {}) => {
      const { document } = living(lifetimes);
      nodeOf(document as Draft, 'node-title')['color'] = TITLE_COLOUR;
      return { ...living({}), document };
    };
    const absentBackground = (() => {
      const { document } = without('node-background');
      nodeOf(document as Draft, 'node-title')['color'] = TITLE_COLOUR;
      return { ...living({}), document };
    })();

    const inactive = await fresh(scene({ 'node-background': NEVER }), T);
    const absent = await fresh(absentBackground, T);
    const always = await fresh(scene(), T);
    expect(samePixels(inactive, absent), pixelReport('background', inactive, absent)).toBe(true);
    // The premise: the background was there to hide.
    expect(samePixels(inactive, always)).toBe(false);

    // A region no node of the reference composition covers: the band above the
    // title, whose box begins at y = 160 (the group is at y >= 420 and the
    // Custom HTML element at y = 1760). With the background shown every pixel
    // of it is the background's colour; with the background hidden every pixel
    // of it is the page's clear colour, opaque white, alpha included (D42.5).
    const band = { x0: 0, y0: 0, x1: WIDTH, y1: 120 };
    expect(notWhite(always, band)).toBe(WIDTH * 120);
    expect(notWhite(inactive, band)).toBe(0);

    // The remaining active nodes are drawn. The Custom HTML element shows the bar
    // of this time, and, being opaque, the same pixels as over the background.
    const [shown, reference] = [decodePng(inactive), decodePng(always)];
    expect(measuredBar(shown)).toBe(expectedBar(T));
    for (let x = BAR.x; x < BAR.x + BAR.width; x += 50) {
      expect(pixel(shown, x, BAR.y + 20), String(x)).toEqual(pixel(reference, x, BAR.y + 20));
    }
    // The image and the title are there: their boxes are not white.
    expect(notWhite(inactive, imageBox(T))).toBeGreaterThan(1000);
    expect(notWhite(inactive, { x0: 90, y0: 160, x1: WIDTH, y1: 340 })).toBeGreaterThan(1000);
    // And each node is really the one shown: hidden as well, the frame differs.
    // The Custom HTML element is not hidden here: that it is drawn is shown by
    // its bar above, and hiding one is the subject of the dedicated rows below.
    for (const id of OTHER_NODES.filter((other) => other !== 'node-background')) {
      const gone = await fresh(scene({ 'node-background': NEVER, [id]: NEVER }), T);
      expect(samePixels(inactive, gone), id).toBe(false);
    }
  });

  it('hides the children of an inactive group although they are active themselves', async () => {
    const inactive = await fresh(living({ 'node-group': NEVER }), T);
    const absent = await fresh(without('node-group'), T);
    expect(samePixels(inactive, absent), pixelReport('group', inactive, absent)).toBe(true);
    // The premise: the group and its children were there to hide.
    expect(samePixels(inactive, await fresh(living({}), T))).toBe(false);
  });

  it('hides an inactive child of an active group, and nothing else of the group', async () => {
    const inactive = await fresh(living({ 'node-image': NEVER }), T);
    const absent = await fresh(without('node-image'), T);
    expect(samePixels(inactive, absent), pixelReport('child', inactive, absent)).toBe(true);
    expect(samePixels(inactive, await fresh(living({}), T))).toBe(false);
    // The premise: the caption, the other child, is still shown.
    expect(samePixels(inactive, await fresh(without('node-group'), T))).toBe(false);
  });

  /**
   * The boundaries of the interval in rendered pixels. The Producer renders
   * times on the frame grid only, so the frame time T stays where it is and the
   * lifetime is placed around it: each row makes T one exact microsecond of the
   * interval. The arithmetic of every microsecond is proven in
   * `packages/runtime/test/lifetime.test.ts`; this proves that the renderer
   * shows and hides by it.
   */
  it.each([
    ['one microsecond before the start', { startUs: T + 1, durationUs: 1_000_000 }, false],
    ['the start', { startUs: T, durationUs: 1_000_000 }, true],
    ['the last microsecond', { startUs: 0, durationUs: T + 1 }, true],
    ['the end', { startUs: 0, durationUs: T }, false],
    ['a lifetime of that one microsecond', { startUs: T, durationUs: 1 }, true],
  ])('renders a frame whose time is %s of the lifetime', async (_, lifetime, shown) => {
    const timed = await fresh(living({ 'node-title': lifetime }), T);
    const always = await fresh(living({}), T);
    const absent = await fresh(without('node-title'), T);
    // The premise: the title is visible where it is shown.
    expect(samePixels(always, absent)).toBe(false);
    const expected = shown ? always : absent;
    expect(samePixels(timed, expected), pixelReport('title', timed, expected)).toBe(true);
  });

  it('clears to opaque white when no node is active (D42.5)', async () => {
    // The reference composition without its Custom HTML element, and every node
    // that is left outside its lifetime: this row is about the clear colour of
    // the page alone, and has no hidden frame to wait for.
    const { document } = without('node-custom-html');
    for (const id of OTHER_NODES) Object.assign(nodeOf(document as Draft, id), NEVER);
    const nothing = { ...living({}), document };
    const frame = await fresh(nothing, 0);
    const decoded = decodePng(frame);
    expect(decoded.width).toBe(WIDTH);
    expect(decoded.height).toBe(HEIGHT);
    expect(decoded.data).toHaveLength(WIDTH * HEIGHT * 4);
    // Every channel of every pixel, alpha included.
    expect(decoded.data.every((byte) => byte === 255)).toBe(true);
    expect(notWhite(frame, WHOLE)).toBe(0);
    // The premise: the reference frame is not white. (Not every pixel of it: the
    // image of the fixture has a white border.)
    expect(notWhite(frameAt(baseline, 0), WHOLE)).toBeGreaterThan((WIDTH * HEIGHT) / 2);
  });

  /**
   * The measurement D42.4 waits for, and the only rows that hide a Custom HTML
   * frame: while it is hidden the element still receives and acknowledges every
   * time (D23.4) and the presentation barrier still completes in its frame
   * (D28.5), with the Producer's own timeouts; and the first frame it is shown
   * on paints the time of that frame, whichever way the times are walked. Every
   * frame of one page is compared with a fresh render of that time alone.
   */
  describe('a Custom HTML element with a lifetime', () => {
    const START = 5_000_000;
    const TIMES = [0, 2_500_000, 5_000_000, 7_500_000];
    const expected = new Map<number, Uint8Array>();

    beforeAll(async () => {
      for (const timeUs of TIMES) {
        const document = timeUs >= START ? living({}) : without('node-custom-html');
        expected.set(timeUs, await fresh(document, timeUs));
      }
    });

    it('is visible where it is shown: the premise of the rows below', async () => {
      for (const timeUs of [0, 2_500_000]) {
        const shown = await fresh(living({}), timeUs);
        expect(samePixels(shown, expected.get(timeUs) ?? shown), String(timeUs)).toBe(false);
      }
    });

    it.each([
      ['outside, then inside', [0, 2_500_000, 5_000_000, 7_500_000]],
      ['inside, then outside', [7_500_000, 5_000_000, 2_500_000, 0]],
      ['in and out', [5_000_000, 0, 7_500_000, 2_500_000, 5_000_000]],
    ])('renders every frame like a fresh render of its time: %s', async (_, order) => {
      const timed = living({ 'node-custom-html': { startUs: START, durationUs: 5_000_000 } });
      const result = await renderFrames({ ...timed, timesUs: order, chromium });
      expect(result.frames.map(({ timeUs }) => timeUs)).toEqual(order);
      for (const { timeUs, png } of result.frames) {
        const wanted = expected.get(timeUs);
        if (wanted === undefined) throw new Error(`No expected frame at ${String(timeUs)}.`);
        expect(samePixels(png, wanted), pixelReport(String(timeUs), png, wanted)).toBe(true);
        // Shown, the bar has the width of this frame's time, not of an earlier one.
        if (timeUs >= START) {
          expect(measuredBar(decodePng(png)), String(timeUs)).toBe(expectedBar(timeUs));
        }
      }
    });
  });

  it('renders a migrated reference composition like the reference composition', async () => {
    const { migrateComposition } = await import('@kadrion/schema/migrate');
    const { referenceCompositionV01 } = await import('@kadrion/test-fixtures');
    const migrated = migrateComposition(referenceCompositionV01);
    if (!migrated.ok) throw new Error('The reference of 0.1 did not migrate.');
    const result = await render(times, migrated.composition);
    for (const { timeUs, png } of result.frames) {
      const expected = frameAt(baseline, timeUs);
      expect(samePixels(png, expected), pixelReport(String(timeUs), png, expected)).toBe(true);
    }
    expect(result.manifest.compositionHash).toBe(baseline.manifest.compositionHash);
  });
});

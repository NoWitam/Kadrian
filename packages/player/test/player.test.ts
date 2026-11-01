/**
 * The Player against its real render page (D25), in jsdom through `harness.ts`.
 * What only a real browser shows — sandbox, policy, decoding, fonts, pixels — is
 * P1's automated browser test in pinned Chromium (PR-06).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { RENDER_PAGE_POLICY } from '@kadrion/renderer-dom';
import {
  generateReferenceAssets,
  referenceComposition,
  referenceExpectedRender,
  videoComposition,
  type ExpectedElement,
  type ExpectedText,
} from '@kadrion/test-fixtures';
import type { DOMWindow } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createPlayer,
  type Player,
  type PlayerAsset,
  type PlayerAssetRequest,
  type PlayerAssetResolver,
  type PlayerScheduler,
} from '../src/index.js';
import { PAGE_AGENT_SCRIPT } from '../src/agent.js';
import { playerCode } from '../src/errors.js';
import { encodePng } from '../src/video.js';
import { yuv420ToRgb } from '../src/yuv.js';
import { createHarness, sleep, type Harness } from './harness.js';
import { installCodecs, testMp4 } from './media.js';

const buildDirectory = new URL('../../renderer-dom/dist/runtime-build/', import.meta.url);
const artifact = new Uint8Array(
  readFileSync(fileURLToPath(new URL('kadrion-runtime.js', buildDirectory))),
);
const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL('kadrion-runtime.json', buildDirectory)), 'utf8'),
) as { contentHash: string };
const runtime = { bytes: artifact, contentHash: manifest.contentHash };

const image = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const bytesOf: Readonly<Record<string, PlayerAsset>> = {
  'asset-image': { bytes: image, mediaType: 'image/png' },
  'asset-font': { bytes: new Uint8Array([0, 1, 0, 0]), mediaType: 'font/ttf' },
  'asset-audio': { bytes: new Uint8Array([82, 73, 70, 70]), mediaType: 'audio/wav' },
};

async function hashOf(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice());
  return `sha256:${Buffer.from(digest).toString('hex')}`;
}

/**
 * The reference composition pinned to the test bytes (D14). Its own hashes are
 * those of the generated fixture assets (D27.5), which one test below uses.
 */
async function pinnedTo(
  document: unknown,
  bytes: Readonly<Record<string, PlayerAsset>>,
): Promise<unknown> {
  const copy = structuredClone(document) as { assets: { id: string; contentHash: string }[] };
  for (const asset of copy.assets) {
    const given = bytes[asset.id];
    if (given !== undefined) asset.contentHash = await hashOf(given.bytes);
  }
  return copy;
}

const pinned = await pinnedTo(referenceComposition, bytesOf);

/** A resolver over a map, recording what it was asked for. */
function resolverOf(
  map: Readonly<Record<string, PlayerAsset | undefined>>,
  asked: PlayerAssetRequest[] = [],
): PlayerAssetResolver {
  return (request) => {
    asked.push(request);
    return map[request.id] ?? null;
  };
}

const resolve = resolverOf(bytesOf);
const imageUrl = `data:image/png;base64,${Buffer.from(image).toString('base64')}`;
const goldenTimes = referenceExpectedRender.golden.map(({ timeUs }) => timeUs);

let players: Player[] = [];
afterEach(() => {
  for (const player of players) player.destroy();
  players = [];
});

/**
 * A started Player. It trusts Custom HTML unless the test says otherwise: the
 * tests of D23 and D25 need the element, and the default, which never runs it,
 * has its own tests (D36).
 */
async function started(
  harness: Harness,
  options: Partial<Parameters<typeof createPlayer>[1]> = {},
) {
  const player = await createPlayer(harness.container, {
    runtime,
    customHtml: { mode: 'trusted' },
    ...options,
  });
  players.push(player);
  return player;
}

function pageFrame(harness: Harness): HTMLIFrameElement {
  const frame = harness.container.querySelector('iframe');
  if (frame === null) throw new Error('The Player made no frame.');
  return frame;
}

function pageView(harness: Harness): DOMWindow {
  return pageFrame(harness).contentWindow as unknown as DOMWindow;
}

/** The DOM below the render page's root, in the shape of the expected trees. */
function describe_(node: Node, view: DOMWindow): ExpectedElement | ExpectedText {
  if (node.nodeType === view.Node.TEXT_NODE) return { text: node.textContent ?? '' };
  const element = node as HTMLElement;
  return {
    tag: element.localName,
    attributes: Object.fromEntries(
      [...element.attributes]
        .filter(({ name }) => name !== 'style')
        .map(({ name, value }) => [name, value]),
    ),
    style: Object.fromEntries(
      Array.from({ length: element.style.length }, (_, index) => {
        const name = element.style.item(index);
        return [name, element.style.getPropertyValue(name)];
      }),
    ),
    children: [...element.childNodes].map((child) => describe_(child, view)),
  };
}

function shownTree(harness: Harness) {
  const view = pageView(harness);
  const root = view.document.getElementById('kadrion-root');
  if (root === null) throw new Error('The render page has no root.');
  return [...root.childNodes].map((child) => describe_(child, view));
}

/** The hand-derived tree, with the image URL that the page builds from the bytes. */
function expectedTree(timeUs: number) {
  const tree = referenceExpectedRender.golden.find((golden) => golden.timeUs === timeUs)?.tree;
  const text = JSON.stringify(tree).replace('https://assets.invalid/asset-image', imageUrl);
  return [JSON.parse(text) as ExpectedElement];
}

function barWidth(harness: Harness): string {
  const element = pageView(harness).document.querySelector('iframe');
  const view = element?.contentWindow as unknown as DOMWindow | null | undefined;
  return view?.document.getElementById('bar')?.style.width ?? 'no element';
}

describe('the render page the Player creates (D25.2, D25.5)', () => {
  it('is the renderer page with the verified runtime and the agent, in a sandboxed frame', async () => {
    const harness = createHarness();
    const player = await started(harness);
    const frame = pageFrame(harness);
    expect(frame.getAttributeNames()).toEqual(['sandbox', 'srcdoc', 'style']);
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    const srcdoc = frame.getAttribute('srcdoc') ?? '';
    expect(srcdoc).toContain(
      `<meta http-equiv="Content-Security-Policy" content="${RENDER_PAGE_POLICY}">`,
    );
    expect(srcdoc.split('<script>')).toHaveLength(3);
    expect(srcdoc.split(new TextDecoder().decode(artifact))).toHaveLength(2);
    expect(srcdoc).not.toMatch(/\ssrc=|\shref=/);
    expect(player.getState()).toEqual({
      status: 'empty',
      timeUs: null,
      runtimeHash: manifest.contentHash,
      error: null,
    });
  });

  it.each([
    ['another hash', { contentHash: `sha256:${'0'.repeat(64)}` }, 'runtime-hash-mismatch'],
    ['a malformed hash', { contentHash: 'sha256:abc' }, 'runtime-hash-mismatch'],
  ])('refuses a runtime build with %s, before any frame exists', async (_, change, code) => {
    const harness = createHarness();
    await expect(
      createPlayer(harness.container, { runtime: { ...runtime, ...change } }),
    ).rejects.toMatchObject({
      name: 'PlayerError',
      code,
    });
    expect(harness.container.childNodes).toHaveLength(0);
  });

  it.each([
    ['bytes that are not UTF-8', new Uint8Array([0xff, 0xfe, 0x00])],
    [
      'a runtime that would end its script element',
      new TextEncoder().encode('var a = "</script>";'),
    ],
  ])('refuses %s even with a matching hash', async (_, bytes) => {
    const harness = createHarness();
    const digest = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
    await expect(
      createPlayer(harness.container, { runtime: { bytes, contentHash: `sha256:${digest}` } }),
    ).rejects.toMatchObject({ code: 'runtime-unsafe' });
    expect(harness.container.childNodes).toHaveLength(0);
  });

  it('fails typed when the page never starts', async () => {
    const harness = createHarness({ loadFrames: false });
    await expect(
      createPlayer(harness.container, { runtime, requestTimeoutMs: 50 }),
    ).rejects.toMatchObject({
      code: 'page-timeout',
    });
    expect(harness.container.childNodes).toHaveLength(0);
  });
});

describe('load and seek (P1, D25.3, D25.6)', () => {
  it('loads, shows frame 0, and reports ready only then', async () => {
    const harness = createHarness();
    const player = await started(harness);
    await player.load(pinned, resolve);
    expect(player.getState()).toMatchObject({ status: 'ready', timeUs: 0, error: null });
    expect(shownTree(harness)).toStrictEqual(expectedTree(0));
    expect(barWidth(harness)).toBe('0%');
    expect(pageFrame(harness).style.width).toBe('1080px');
    expect(pageFrame(harness).style.height).toBe('1920px');
  });

  it.each(goldenTimes)('shows the hand-derived frame at %i', async (timeUs) => {
    const harness = createHarness();
    const player = await started(harness);
    await player.load(pinned, resolve);
    await player.seek(timeUs);
    expect(player.getState()).toMatchObject({ status: 'ready', timeUs });
    expect(shownTree(harness)).toStrictEqual(expectedTree(timeUs));
    expect(barWidth(harness)).toBe(`${String(timeUs / 100_000)}%`);
  });

  it('shows the same frame whatever was shown before: fresh, after playing, after seeking back', async () => {
    const fresh = new Map<number, unknown>();
    for (const timeUs of goldenTimes) {
      const harness = createHarness();
      const player = await started(harness);
      await player.load(pinned, resolve);
      await player.seek(timeUs);
      fresh.set(timeUs, [shownTree(harness), barWidth(harness)]);
    }
    const harness = createHarness();
    const clock = manualScheduler();
    const player = await started(harness, { scheduler: clock.scheduler });
    await player.load(pinned, resolve);
    player.play();
    for (let step = 0; step < 5; step += 1) {
      clock.advance(40);
      await harness.settle();
    }
    player.pause();
    await harness.settle();
    for (const timeUs of [...goldenTimes].reverse()) {
      await player.seek(timeUs);
      expect([shownTree(harness), barWidth(harness)], String(timeUs)).toStrictEqual(
        fresh.get(timeUs),
      );
    }
  });

  it('lets a newer seek supersede a waiting one, and settles in order', async () => {
    const harness = createHarness();
    const player = await started(harness);
    await player.load(pinned, resolve);
    const order: string[] = [];
    const track = (name: string, promise: Promise<void>) =>
      promise.then(
        () => order.push(`${name} ready`),
        (error: unknown) => order.push(`${name} ${(error as { code: string }).code}`),
      );
    const all = [
      track('a', player.seek(2_500_000)),
      track('b', player.seek(5_000_000)),
      track('c', player.seek(7_500_000)),
    ];
    expect(player.getState().status).toBe('seeking');
    await Promise.all(all);
    expect(order).toEqual(['b superseded', 'a ready', 'c ready']);
    expect(player.getState()).toMatchObject({ status: 'ready', timeUs: 7_500_000 });
    expect(shownTree(harness)).toStrictEqual(expectedTree(7_500_000));
  });

  it.each([-1, 10_000_000, 0.5, Number.NaN])(
    'rejects the time %d before anything is sent',
    async (timeUs) => {
      const harness = createHarness();
      const player = await started(harness);
      await player.load(pinned, resolve);
      const before = harness.log.length;
      await expect(player.seek(timeUs)).rejects.toMatchObject({ code: 'time-out-of-range' });
      expect(harness.log).toHaveLength(before);
      expect(player.getState().status).toBe('ready');
    },
  );

  it('rejects a seek before a document was loaded', async () => {
    const harness = createHarness();
    const player = await started(harness);
    await expect(player.seek(0)).rejects.toMatchObject({ code: 'not-loaded' });
  });
});

describe('assets through the resolver of D14', () => {
  it('asks for every asset of the document once, in order, with its hash', async () => {
    const harness = createHarness();
    const player = await started(harness);
    const asked: PlayerAssetRequest[] = [];
    await player.load(pinned, resolverOf(bytesOf, asked));
    const declared = (pinned as { assets: { id: string; type: string; contentHash: string }[] })
      .assets;
    expect(asked).toEqual(declared);
    expect(asked.every((request) => Object.isFrozen(request))).toBe(true);
  });

  // The fixture's hashes are those of its generated bytes since PR-06 (D27.5):
  // exactly those bytes verify, and the test bytes of this file do not.
  it('verifies the fixture hashes with the generated bytes only', async () => {
    const harness = createHarness();
    const player = await started(harness);
    await expect(player.load(referenceComposition, resolve)).rejects.toMatchObject({
      code: 'asset-hash-mismatch',
    });
    const generated = Object.fromEntries(
      generateReferenceAssets().map(({ id, mediaType, bytes }) => [id, { mediaType, bytes }]),
    );
    await player.load(referenceComposition, resolverOf(generated));
    expect(player.getState()).toMatchObject({ status: 'ready', timeUs: 0 });
  });

  it('sends the page exactly the verified bytes, whatever the caller does later', async () => {
    const harness = createHarness();
    const player = await started(harness);
    const font = new Uint8Array([0, 1, 0, 0]);
    const handOver: PlayerAssetResolver = (request) => {
      if (request.id !== 'asset-font') return bytesOf[request.id] ?? null;
      // The caller changes the bytes right after handing them over.
      setTimeout(() => {
        font[0] = 9;
      }, 0);
      return { bytes: font, mediaType: 'font/ttf' };
    };
    const loading = player.load(pinned, handOver);
    await loading;
    const load = harness.log.find(
      (delivery) => (delivery.data as { type?: string }).type === 'kadrion-player:load',
    );
    const sent = (load?.data as { assets: { id: string; bytes: ArrayBuffer }[] }).assets;
    const fontBytes = sent.find((asset) => asset.id === 'asset-font')?.bytes;
    expect([...new Uint8Array(fontBytes ?? new ArrayBuffer(0))]).toEqual([0, 1, 0, 0]);
    expect(sent.map((asset) => asset.id)).toEqual(['asset-image', 'asset-audio', 'asset-font']);
  });
});

describe('fonts from the verified bytes (D27.1, D27.2)', () => {
  it('registers the font a text node uses, with its family and its verified bytes, once', async () => {
    const harness = createHarness();
    const player = await started(harness);
    await player.load(pinned, resolve);
    const faces = harness.fontsOf(pageView(harness) as unknown as Window);
    expect(faces.map(({ family }) => family)).toEqual(['kadrion-font-asset-font']);
    expect([...new Uint8Array(faces[0]?.bytes ?? new ArrayBuffer(0))]).toEqual([0, 1, 0, 0]);
    // A second load clears the set first, so the page never holds a face of an older document.
    await player.load(pinned, resolve);
    expect(harness.fontsOf(pageView(harness) as unknown as Window)).toHaveLength(1);
  });

  it('leaves the bytes to the artifact: the agent has no URL or base64 code of its own', () => {
    for (const fragment of ['btoa', 'base64', 'data:', 'fromCharCode', 'mount(']) {
      expect(PAGE_AGENT_SCRIPT).not.toContain(fragment);
    }
    expect(PAGE_AGENT_SCRIPT).toContain('.load(');
    expect(PAGE_AGENT_SCRIPT).toContain('createFont');
  });
});

describe('typed errors before the first frame, never ready (P1, D25.7)', () => {
  const tampered = {
    ...bytesOf,
    'asset-font': { bytes: new Uint8Array([7]), mediaType: 'font/ttf' },
  };
  const failing: PlayerAssetResolver = (request) => {
    if (request.id === 'asset-audio') throw new Error('storage is down');
    return bytesOf[request.id] ?? null;
  };

  it.each([
    [
      'a missing asset',
      pinned,
      resolverOf({ ...bytesOf, 'asset-image': undefined }),
      'asset-missing',
    ],
    ['a resolver that fails', pinned, failing, 'asset-missing'],
    ['bytes with another hash', pinned, resolverOf(tampered), 'asset-hash-mismatch'],
    [
      'an asset without a media type',
      pinned,
      resolverOf({
        ...bytesOf,
        'asset-font': { bytes: new Uint8Array([0, 1, 0, 0]), mediaType: 'font' },
      }),
      'asset-invalid',
    ],
    ['an invalid document', { ...(pinned as object), fps: 0 }, resolve, 'invalid-document'],
  ])('reports %s', async (_, document, given, code) => {
    const harness = createHarness();
    const player = await started(harness);
    await expect(player.load(document, given)).rejects.toMatchObject({ name: 'PlayerError', code });
    expect(player.getState()).toMatchObject({ status: 'error', timeUs: null, error: { code } });
    expect(shownTree(harness)).toEqual([]);
  });

  // D25.4: the Player refuses these itself; the page never sees them.
  it.each([
    ['a missing asset', pinned, resolverOf({ ...bytesOf, 'asset-image': undefined })],
    ['bytes with another hash', pinned, resolverOf(tampered)],
    ['an invalid document', { ...(pinned as object), fps: 0 }, resolve],
  ])('sends nothing to the page for %s', async (_, document, given) => {
    const harness = createHarness();
    const player = await started(harness);
    await player.load(document, given).catch(() => undefined);
    await harness.settle();
    const toPage = harness.log.filter(
      (delivery) => delivery.target === (pageView(harness) as unknown as Window),
    );
    expect(toPage).toEqual([]);
  });

  it('lists the validation errors of an invalid document', async () => {
    const harness = createHarness();
    const player = await started(harness);
    const error: unknown = await player
      .load({ ...(pinned as object), fps: 0 }, resolve)
      .catch((reason: unknown) => reason);
    expect((error as { details: string[] }).details.join('\n')).toContain('/fps');
  });

  it('reports a font that does not load before anything is mounted (D27.1)', async () => {
    const harness = createHarness({ font: 'reject' });
    const player = await started(harness);
    await expect(player.load(pinned, resolve)).rejects.toMatchObject({
      code: 'font-load-failed',
    });
    expect(player.getState()).toMatchObject({ status: 'error', timeUs: null });
    expect(shownTree(harness)).toEqual([]);
    expect(harness.fontsOf(pageView(harness) as unknown as Window)).toEqual([]);
  });

  it('reports an image that cannot be decoded', async () => {
    const harness = createHarness({ decode: 'reject' });
    const player = await started(harness);
    await expect(player.load(pinned, resolve)).rejects.toMatchObject({
      code: 'asset-decode-failed',
    });
    expect(player.getState().status).toBe('error');
  });

  it('reports a Custom HTML element that never answers, and is never ready', async () => {
    const silent = structuredClone(pinned) as {
      scenes: { nodes: { id: string; html?: string }[] }[];
    };
    const node = silent.scenes[0]?.nodes.find((candidate) => candidate.id === 'node-custom-html');
    if (node !== undefined) node.html = '<p>silent</p>';
    const harness = createHarness();
    const player = await started(harness, { ackTimeoutMs: 20 });
    await expect(player.load(silent, resolve)).rejects.toMatchObject({
      code: 'custom-html-timeout',
    });
    expect(player.getState()).toMatchObject({ status: 'error', timeUs: null });
    // The frame was rendered, but it is not reported: preview may be stale, never ready.
    expect(shownTree(harness)).not.toEqual([]);
  });
});

describe('one request at a time (D25.4, D25.6)', () => {
  it('lets a load wait for the seek in flight, and settles both', async () => {
    const harness = createHarness();
    const player = await started(harness);
    await player.load(pinned, resolve);
    const seek = player.seek(5_000_000);
    const load = player.load(pinned, resolve);
    await expect(seek).resolves.toBeUndefined();
    await expect(load).resolves.toBeUndefined();
    expect(player.getState()).toMatchObject({ status: 'ready', timeUs: 0, error: null });
    expect(shownTree(harness)).toStrictEqual(expectedTree(0));
  });

  it('lets a load supersede a waiting seek while playing', async () => {
    const harness = createHarness();
    const clock = manualScheduler();
    const player = await started(harness, { scheduler: clock.scheduler });
    await player.load(pinned, resolve);
    player.play();
    clock.advance(100);
    const waiting = player.seek(7_500_000);
    const inFlight = player.seek(2_500_000);
    const load = player.load(pinned, resolve);
    const outcomes = await Promise.allSettled([waiting, inFlight, load]);
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      'rejected',
      'rejected',
      'fulfilled',
    ]);
    expect(clock.frames()).toBe(0);
    expect(player.getState()).toMatchObject({ status: 'ready', timeUs: 0 });
  });

  it('ignores the late result of a request that timed out', async () => {
    const silent = structuredClone(pinned) as {
      scenes: { nodes: { id: string; html?: string }[] }[];
    };
    const node = silent.scenes[0]?.nodes.find((candidate) => candidate.id === 'node-custom-html');
    if (node !== undefined) node.html = '<p>silent</p>';
    const harness = createHarness();
    const player = await started(harness, { ackTimeoutMs: 150, requestTimeoutMs: 50 });
    await expect(player.load(silent, resolve)).rejects.toMatchObject({ code: 'page-timeout' });
    await sleep(250);
    await harness.settle();
    // The page's own answer (custom-html-timeout) came late and changed nothing.
    expect(harness.log.some((delivery) => (delivery.data as { ok?: boolean }).ok === false)).toBe(
      true,
    );
    expect(player.getState()).toMatchObject({ status: 'error', error: { code: 'page-timeout' } });
  });
});

describe('messages from anyone but the page or the Player (D25.4)', () => {
  it('ignores a ready message from anyone but its own page', async () => {
    const harness = createHarness({ loadFrames: false });
    const stranger = harness.window.document.createElement('iframe');
    harness.window.document.body.append(stranger);
    const starting = createPlayer(harness.container, { runtime, requestTimeoutMs: 80 });
    await sleep(20);
    const ready = { type: 'kadrion-player:ready', version: 2 };
    await harness.deliver(harness.window as unknown as Window, ready, stranger.contentWindow);
    await harness.deliver(harness.window as unknown as Window, ready, harness.window);
    await expect(starting).rejects.toMatchObject({ code: 'page-timeout' });
  });

  it('ignores a forged result for the pending request', async () => {
    const harness = createHarness();
    const player = await started(harness);
    await player.load(pinned, resolve);
    const stranger = harness.window.document.createElement('iframe');
    harness.window.document.body.append(stranger);
    const pending = player.seek(5_000_000);
    const lastRequest = harness.log
      .filter((delivery) => delivery.target === (pageView(harness) as unknown as Window))
      .at(-1);
    const requestId = (lastRequest?.data as { requestId: number }).requestId;
    const failure = { code: 'custom-html-timeout', message: 'forged', details: [] };
    const forged = {
      type: 'kadrion-player:result',
      version: 2,
      requestId,
      ok: false,
      error: failure,
    };
    await harness.deliver(harness.window as unknown as Window, forged, stranger.contentWindow);
    await harness.deliver(harness.window as unknown as Window, forged, harness.window);
    await pending;
    expect(player.getState()).toMatchObject({ status: 'ready', timeUs: 5_000_000, error: null });
  });

  it.each([
    ['an extra key', { frame: 297 }],
    ['another version', { version: 1 }],
    ['a fractional time', { timeUs: 0.5 }],
    ['video frames that are not an array', { videoFrames: null }],
  ])('lets the page ignore a request from its parent with %s', async (_, change) => {
    const harness = createHarness();
    const player = await started(harness);
    await player.load(pinned, resolve);
    const view = pageView(harness) as unknown as Window;
    const seek = {
      type: 'kadrion-player:seek',
      version: 2,
      requestId: 98,
      timeUs: 9_900_000,
      videoFrames: [],
    };
    await harness.deliver(view, { ...seek, ...change }, harness.parentOf(view));
    await harness.settle();
    await sleep(10);
    expect(shownTree(harness)).toStrictEqual(expectedTree(0));
    // The same request without the change is served, so only the change was refused.
    await harness.deliver(view, seek, harness.parentOf(view));
    await harness.settle();
    await sleep(20);
    await harness.settle();
    expect(shownTree(harness)).toStrictEqual(expectedTree(9_900_000));
  });

  it('lets the page ignore a request whose source is not its parent', async () => {
    const harness = createHarness();
    const player = await started(harness);
    await player.load(pinned, resolve);
    const view = pageView(harness) as unknown as Window;
    const element = pageView(harness).document.querySelector('iframe')?.contentWindow;
    const seek = {
      type: 'kadrion-player:seek',
      version: 2,
      requestId: 99,
      timeUs: 9_900_000,
      videoFrames: [],
    };
    await harness.deliver(view, seek, element);
    await harness.deliver(view, seek, harness.window);
    await harness.settle();
    await sleep(10);
    expect(shownTree(harness)).toStrictEqual(expectedTree(0));
    expect(
      harness.log.some(
        (delivery) =>
          (delivery.data as { requestId?: number }).requestId === 99 && delivery.target !== view,
      ),
    ).toBe(false);
  });
});

function manualScheduler() {
  let now = 0;
  let callbacks = new Map<number, () => void>();
  let next = 1;
  const scheduler: PlayerScheduler = {
    now: () => now,
    requestFrame: (callback) => {
      callbacks.set(next, callback);
      return next++;
    },
    cancelFrame: (handle) => {
      callbacks.delete(handle);
    },
  };
  return {
    scheduler,
    frames: () => callbacks.size,
    advance(milliseconds: number) {
      now += milliseconds;
      const due = callbacks;
      callbacks = new Map();
      for (const callback of due.values()) callback();
    },
  };
}

describe('play and pause with the preview clock (D25.6)', () => {
  it('plays on the frame grid, skips ticks while a seek is in flight, and stops at the last frame', async () => {
    const harness = createHarness();
    const clock = manualScheduler();
    const player = await started(harness, { scheduler: clock.scheduler });
    await player.load(pinned, resolve);
    const seeks = () =>
      harness.log
        .filter((delivery) => (delivery.data as { type?: string }).type === 'kadrion-player:seek')
        .map((delivery) => (delivery.data as { timeUs: number }).timeUs);
    const before = seeks().length;
    player.play();
    expect(player.getState().status).toBe('playing');
    clock.advance(100);
    // 100 ms at 30 fps is frame 3, which starts at 100 000 µs (D13).
    clock.advance(1);
    await harness.settle();
    await sleep(5);
    expect(seeks().slice(before)).toEqual([100_000]);
    expect(player.getState()).toMatchObject({ status: 'playing', timeUs: 100_000 });
    clock.advance(20_000);
    await harness.settle();
    await sleep(5);
    await harness.settle();
    expect(seeks().at(-1)).toBe(9_966_666);
    expect(clock.frames()).toBe(0);
    expect(player.getState()).toMatchObject({ status: 'ready', timeUs: 9_966_666 });
  });

  it('stops when paused', async () => {
    const harness = createHarness();
    const clock = manualScheduler();
    const player = await started(harness, { scheduler: clock.scheduler });
    await player.load(pinned, resolve);
    player.play();
    player.pause();
    expect(clock.frames()).toBe(0);
    expect(player.getState().status).toBe('ready');
  });
});

/** A copy of `document` with `change` applied, re-pinned to `bytes`. */
async function edited(
  document: unknown,
  change: (copy: Composition) => void,
  bytes: Readonly<Record<string, PlayerAsset>> = bytesOf,
): Promise<unknown> {
  const copy = structuredClone(document) as Composition;
  change(copy);
  return pinnedTo(copy, bytes);
}

interface Composition {
  fps: number;
  durationUs: number;
  clips: { durationUs: number }[];
  scenes: { durationUs: number; nodes: CompositionNode[] }[];
}

interface CompositionNode {
  id: string;
  durationUs: number;
  text?: string;
  children?: CompositionNode[];
  animations?: { keyframes: { timeUs: number }[] }[];
}

function eachNode(copy: Composition, visit: (node: CompositionNode) => void): void {
  const walk = (node: CompositionNode): void => {
    visit(node);
    node.children?.forEach(walk);
  };
  for (const scene of copy.scenes) scene.nodes.forEach(walk);
}

/** The reference composition with another title. */
const retitled = await edited(pinned, (copy) => {
  eachNode(copy, (node) => {
    if (node.id === 'node-title') node.text = 'Edited';
  });
});

/** The reference composition cut to 5 s: every lifetime and keyframe ends there. */
const shortened = await edited(pinned, (copy) => {
  copy.durationUs = 5_000_000;
  for (const scene of copy.scenes) scene.durationUs = 5_000_000;
  for (const clip of copy.clips) clip.durationUs = 5_000_000;
  eachNode(copy, (node) => {
    node.durationUs = 5_000_000;
    for (const animation of node.animations ?? []) {
      for (const keyframe of animation.keyframes) {
        keyframe.timeUs = Math.min(keyframe.timeUs, 5_000_000);
      }
    }
  });
});

const typesSent = (harness: Harness, from = 0): string[] =>
  harness.log
    .slice(from)
    .filter((delivery) => delivery.target === (pageView(harness) as unknown as Window))
    .map((delivery) => (delivery.data as { type: string }).type)
    .filter((type) => type.startsWith('kadrion-player:'));

/** What a fresh Player shows for `document` at `timeUs`, and the bar of its element. */
async function freshly(document: unknown, timeUs: number) {
  const harness = createHarness();
  const player = await started(harness);
  await player.load(document, resolve);
  if (timeUs !== 0) await player.seek(timeUs);
  return [shownTree(harness), barWidth(harness)];
}

describe('update in the same page (D44)', () => {
  it('shows the edited document at the time shown, in one request, as a fresh load and seek would', async () => {
    const harness = createHarness();
    const player = await started(harness);
    await player.load(pinned, resolve);
    await player.seek(5_000_000);
    const frame = pageFrame(harness);
    const before = harness.log.length;
    const asked: PlayerAssetRequest[] = [];
    await player.update(retitled, resolverOf(bytesOf, asked));
    expect(player.getState()).toMatchObject({ status: 'ready', timeUs: 5_000_000, error: null });
    expect(typesSent(harness, before)).toEqual(['kadrion-player:update']);
    expect(pageFrame(harness)).toBe(frame);
    expect(asked).toEqual([]);
    expect([shownTree(harness), barWidth(harness)]).toStrictEqual(
      await freshly(retitled, 5_000_000),
    );
  });

  it('keeps the time on the new frame grid', async () => {
    const harness = createHarness();
    const player = await started(harness);
    await player.load(pinned, resolve);
    await player.seek(100_000);
    // Frame 3 at 30 fps starts at 100 000 µs; at 24 fps it falls in frame 2 (D13).
    const slower = await edited(pinned, (copy) => {
      copy.fps = 24;
    });
    await player.update(slower, resolve);
    expect(player.getState()).toMatchObject({ status: 'ready', timeUs: 83_333 });
    expect([shownTree(harness), barWidth(harness)]).toStrictEqual(await freshly(slower, 83_333));
  });

  it('shows the last frame when the document became shorter', async () => {
    const harness = createHarness();
    const player = await started(harness);
    await player.load(pinned, resolve);
    await player.seek(9_900_000);
    await player.update(shortened, resolve);
    expect(player.getState()).toMatchObject({ status: 'ready', timeUs: 4_966_666 });
    expect([shownTree(harness), barWidth(harness)]).toStrictEqual(
      await freshly(shortened, 4_966_666),
    );
    await expect(player.seek(5_000_000)).rejects.toMatchObject({ code: 'time-out-of-range' });
  });

  it('asks only for assets it has not verified for the document shown', async () => {
    const harness = createHarness();
    const player = await started(harness);
    await player.load(pinned, resolve);
    const other = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 9, 9, 9]);
    const otherBytes = { ...bytesOf, 'asset-image': { bytes: other, mediaType: 'image/png' } };
    const reimaged = await edited(pinned, () => undefined, otherBytes);
    const asked: PlayerAssetRequest[] = [];
    await player.update(reimaged, resolverOf(otherBytes, asked));
    expect(asked.map((request) => request.id)).toEqual(['asset-image']);
    // The first image is no longer verified: the document shown does not use it.
    asked.length = 0;
    await player.update(pinned, resolverOf(bytesOf, asked));
    expect(asked.map((request) => request.id)).toEqual(['asset-image']);
    expect([shownTree(harness), barWidth(harness)]).toStrictEqual(await freshly(pinned, 0));
  });

  it('rejects new bytes without their hash and leaves nothing loaded', async () => {
    const harness = createHarness();
    const player = await started(harness);
    await player.load(pinned, resolve);
    const other = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 9, 9, 9]);
    const reimaged = await edited(pinned, () => undefined, {
      ...bytesOf,
      'asset-image': { bytes: other, mediaType: 'image/png' },
    });
    const before = harness.log.length;
    await expect(player.update(reimaged, resolve)).rejects.toMatchObject({
      code: 'asset-hash-mismatch',
    });
    expect(typesSent(harness, before)).toEqual([]);
    expect(player.getState()).toMatchObject({
      status: 'error',
      timeUs: null,
      error: { code: 'asset-hash-mismatch' },
    });
    await expect(player.seek(0)).rejects.toMatchObject({ code: 'not-loaded' });
    await expect(player.update(pinned, resolve)).rejects.toMatchObject({ code: 'not-loaded' });
  });

  it('rejects an invalid document and an update before a load, sending nothing', async () => {
    const harness = createHarness();
    const player = await started(harness);
    await expect(player.update(pinned, resolve)).rejects.toMatchObject({ code: 'not-loaded' });
    await player.load(pinned, resolve);
    const before = harness.log.length;
    await expect(player.update({ schemaVersion: '0.2' }, resolve)).rejects.toMatchObject({
      code: 'invalid-document',
    });
    expect(typesSent(harness, before)).toEqual([]);
  });

  it('lets an update wait for the seek in flight and supersede a waiting one', async () => {
    const harness = createHarness();
    const player = await started(harness);
    await player.load(pinned, resolve);
    const inFlight = player.seek(2_500_000);
    const waiting = player.seek(7_500_000);
    const update = player.update(retitled, resolve);
    const outcomes = await Promise.allSettled([inFlight, waiting, update]);
    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      'fulfilled',
      'rejected',
      'fulfilled',
    ]);
    expect(outcomes[1]).toMatchObject({ reason: { code: 'superseded' } });
    expect(player.getState()).toMatchObject({ status: 'ready', timeUs: 2_500_000 });
    expect([shownTree(harness), barWidth(harness)]).toStrictEqual(
      await freshly(retitled, 2_500_000),
    );
  });

  it('runs updates one after another, the last one shown', async () => {
    const harness = createHarness();
    const player = await started(harness);
    await player.load(pinned, resolve);
    await player.seek(5_000_000);
    await Promise.all([player.update(retitled, resolve), player.update(pinned, resolve)]);
    expect(player.getState()).toMatchObject({ status: 'ready', timeUs: 5_000_000 });
    expect([shownTree(harness), barWidth(harness)]).toStrictEqual(await freshly(pinned, 5_000_000));
  });

  it('plays on after an update', async () => {
    const harness = createHarness();
    const clock = manualScheduler();
    const player = await started(harness, { scheduler: clock.scheduler });
    await player.load(pinned, resolve);
    player.play();
    await player.update(retitled, resolve);
    expect(player.getState().status).toBe('playing');
    expect(clock.frames()).toBe(1);
    player.pause();
  });

  it('lets the page ignore an update with an extra key', async () => {
    const harness = createHarness();
    const player = await started(harness);
    await player.load(pinned, resolve);
    const view = pageView(harness) as unknown as Window;
    const update = {
      type: 'kadrion-player:update',
      version: 2,
      requestId: 97,
      document: JSON.stringify(retitled),
      assets: [],
      ackTimeoutMs: 1000,
      customHtml: { mode: 'trusted' },
      timeUs: 0,
      videoFrames: [],
    };
    await harness.deliver(view, { ...update, frame: 0 }, harness.parentOf(view));
    await harness.settle();
    await sleep(10);
    const answered = () =>
      harness.log.some(
        (delivery) =>
          delivery.target !== view && (delivery.data as { requestId?: number }).requestId === 97,
      );
    expect(answered()).toBe(false);
    // Without the key it is served, and answered (here: the assets are missing).
    await harness.deliver(view, update, harness.parentOf(view));
    await harness.settle();
    await sleep(20);
    await harness.settle();
    expect(answered()).toBe(true);
  });
});

describe('subscribe (D44)', () => {
  it('needs a handler for the errors of listeners', async () => {
    const harness = createHarness();
    const player = await started(harness);
    expect(() => player.subscribe(() => undefined)).toThrow(
      expect.objectContaining({ code: 'invalid-options' }) as Error,
    );
  });

  it('reports every change once, in order, until unsubscribed', async () => {
    const harness = createHarness();
    const player = await started(harness, { onListenerError: () => undefined });
    const seen: string[] = [];
    const stop = player.subscribe((state) => {
      seen.push(`${state.status} ${String(state.timeUs)}`);
      expect(Object.isFrozen(state)).toBe(true);
    });
    await player.load(pinned, resolve);
    await player.seek(2_500_000);
    await player.update(retitled, resolve);
    stop();
    await player.seek(5_000_000);
    expect(seen).toEqual([
      'loading null',
      'seeking null',
      'ready 0',
      'seeking 0',
      'ready 2500000',
      'loading 2500000',
      'ready 2500000',
    ]);
  });

  it('gives what a listener threw to the handler, and tells the other listeners all the same', async () => {
    const harness = createHarness();
    const failures: [unknown, string][] = [];
    const player = await started(harness, {
      onListenerError: (error, state) => {
        failures.push([error, state.status]);
        throw new Error('the handler broke its contract');
      },
    });
    const boom = new Error('listener');
    player.subscribe(() => {
      throw boom;
    });
    const seen: string[] = [];
    player.subscribe((state) => seen.push(state.status));
    await player.load(pinned, resolve);
    expect(seen).toEqual(['loading', 'seeking', 'ready']);
    expect(failures).toEqual([
      [boom, 'loading'],
      [boom, 'seeking'],
      [boom, 'ready'],
    ]);
  });
});

describe('destroy', () => {
  it('rejects what is pending and removes the page', async () => {
    const harness = createHarness();
    const player = await createPlayer(harness.container, { runtime });
    await player.load(pinned, resolve);
    const pending = player.seek(5_000_000);
    player.destroy();
    await expect(pending).rejects.toMatchObject({ code: 'destroyed' });
    expect(harness.container.childNodes).toHaveLength(0);
  });
});

describe('the Custom HTML policy of the host (D36)', () => {
  const typeOf = (data: unknown): string =>
    typeof data === 'object' && data !== null ? String((data as { type?: unknown }).type) : '';
  const loadsOf = (harness: Harness): unknown[] =>
    harness.log
      .filter(({ data }) => typeOf(data) === 'kadrion-player:load')
      .map(({ data }) => (data as { customHtml?: unknown }).customHtml);
  const timeMessages = (harness: Harness) =>
    harness.log.filter(({ data }) => typeOf(data).startsWith('kadrion:time'));
  const placeholderOf = (harness: Harness) =>
    pageView(harness).document.querySelector('[data-kadrion-node="node-custom-html"]');

  it('runs no Custom HTML when the host states no policy: no frame, no time message', async () => {
    const harness = createHarness();
    const player = await createPlayer(harness.container, { runtime });
    players.push(player);
    await player.load(pinned, resolve);
    await player.seek(5_000_000);
    expect(loadsOf(harness)).toEqual([{ mode: 'disabled' }]);
    expect(pageView(harness).document.querySelectorAll('iframe')).toHaveLength(0);
    expect(placeholderOf(harness)?.getAttribute('data-kadrion-custom-html')).toBe('disabled');
    expect(placeholderOf(harness)?.childNodes).toHaveLength(0);
    expect(timeMessages(harness)).toEqual([]);
    expect(player.getState()).toMatchObject({ status: 'ready', timeUs: 5_000_000, error: null });
  });

  it('treats an explicit disabled policy as the default', async () => {
    const harness = createHarness();
    const player = await started(harness, { customHtml: { mode: 'disabled' } });
    await player.load(pinned, resolve);
    expect(loadsOf(harness)).toEqual([{ mode: 'disabled' }]);
    expect(pageView(harness).document.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('runs Custom HTML only when trusted explicitly: sandboxed, and on the time protocol', async () => {
    const harness = createHarness();
    const player = await started(harness, { customHtml: { mode: 'trusted' } });
    await player.load(pinned, resolve);
    await player.seek(2_500_000);
    expect(loadsOf(harness)).toEqual([{ mode: 'trusted' }]);
    const frames = pageView(harness).document.querySelectorAll('iframe');
    expect(frames).toHaveLength(1);
    expect(frames[0]?.getAttribute('sandbox')).toBe('allow-scripts');
    const answered = timeMessages(harness).map(({ data }) => {
      const { type, timeUs } = data as { type: string; timeUs: number };
      return `${type} ${String(timeUs)}`;
    });
    expect(answered).toContain('kadrion:time 2500000');
    expect(answered).toContain('kadrion:time-ack 2500000');
    expect(shownTree(harness)).toStrictEqual(expectedTree(2_500_000));
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['a boolean', true],
    ['a string', 'trusted'],
    ['an empty object', {}],
    ['an unknown mode', { mode: 'all' }],
    ['an extra key', { mode: 'trusted', elementIds: [] }],
    ['an array', [{ mode: 'trusted' }]],
    [
      'a getter instead of a value',
      {
        get mode() {
          return 'trusted';
        },
      },
    ],
    ['a symbol key beside it', { mode: 'trusted', [Symbol('extra')]: 1 }],
  ])('refuses %s as the policy before the render page exists', async (_, customHtml) => {
    const harness = createHarness();
    await expect(
      createPlayer(harness.container, {
        runtime,
        customHtml: customHtml as { mode: 'trusted' },
      }),
    ).rejects.toMatchObject({ code: 'invalid-options' });
    expect(harness.container.childNodes).toHaveLength(0);
  });

  it.each<[string, (load: Record<string, unknown>) => void]>([
    ['no policy', (load) => delete load.customHtml],
    ['an unknown mode', (load) => (load.customHtml = { mode: 'all' })],
    ['an extra key in the policy', (load) => (load.customHtml = { mode: 'trusted', ids: [] })],
  ])('lets the page ignore a load with %s', async (_, change) => {
    const harness = createHarness();
    const player = await started(harness, { customHtml: { mode: 'disabled' } });
    await player.load(pinned, resolve);
    const view = pageView(harness) as unknown as Window;
    const sent = harness.log.find(({ data }) => typeOf(data) === 'kadrion-player:load');
    const load = { ...(sent?.data as Record<string, unknown>), requestId: 97 };
    change(load);
    await harness.deliver(view, load, harness.parentOf(view));
    await harness.settle();
    await sleep(20);
    await harness.settle();
    const answered = (requestId: number) =>
      harness.log.filter(
        ({ data }) =>
          typeOf(data) === 'kadrion-player:result' &&
          (data as { requestId?: number }).requestId === requestId,
      );
    expect(answered(97)).toEqual([]);
    expect(pageView(harness).document.querySelectorAll('iframe')).toHaveLength(0);
    // The same load without the change is served, so only the change was refused.
    await harness.deliver(
      view,
      { ...(sent?.data as Record<string, unknown>), requestId: 96 },
      harness.parentOf(view),
    );
    await harness.settle();
    await sleep(20);
    await harness.settle();
    expect(answered(96)).toHaveLength(1);
  });

  it('keeps invalid-options as its own code when the page reports it (D25.7)', () => {
    expect(playerCode('invalid-options')).toBe('invalid-options');
    expect(playerCode('invalid-option')).toBe('page-error');
  });

  it('removes the page, the element frames, and its message listener on destroy', async () => {
    const harness = createHarness();
    const listeners = new Set<unknown>();
    const view = harness.window as unknown as Window;
    const add = view.addEventListener.bind(view);
    const remove = view.removeEventListener.bind(view);
    view.addEventListener = ((type: string, listener: unknown, ...rest: never[]) => {
      if (type === 'message') listeners.add(listener);
      add(type, listener as EventListener, ...rest);
    }) as typeof view.addEventListener;
    view.removeEventListener = ((type: string, listener: unknown, ...rest: never[]) => {
      if (type === 'message') listeners.delete(listener);
      remove(type, listener as EventListener, ...rest);
    }) as typeof view.removeEventListener;
    const player = await started(harness, { customHtml: { mode: 'trusted' } });
    await player.load(pinned, resolve);
    expect(pageView(harness).document.querySelectorAll('iframe')).toHaveLength(1);
    expect(listeners.size).toBe(1);
    player.destroy();
    expect(harness.container.childNodes).toHaveLength(0);
    expect(listeners.size).toBe(0);
    await expect(player.seek(0)).rejects.toMatchObject({ code: 'destroyed' });
  });
});

describe('video in the host window (D51)', () => {
  /** 75 frames at 25 fps, a sync sample every 25, luma 16 + the frame's index. */
  const samples = Array.from({ length: 75 }, (_, at) => ({
    data: new Uint8Array([16 + at, at]),
    duration: 40,
    sync: at % 25 === 0,
  }));
  const mp4 = testMp4({ width: 32, height: 16, timescale: 1000, samples });
  const videoBytes: Readonly<Record<string, PlayerAsset>> = {
    'asset-video': { bytes: mp4, mediaType: 'video/mp4' },
    'asset-image': { bytes: image, mediaType: 'image/png' },
  };
  const videoResolve = resolverOf(videoBytes);
  let videoDocument: unknown;

  const withVideoDocument = async (edit: (draft: VideoDraft) => void = () => undefined) => {
    const draft = (await pinnedTo(videoComposition, videoBytes)) as VideoDraft;
    edit(draft);
    return draft;
  };

  /** The luma of the flat frame the stand-in decoder gives for presentation frame `index`. */
  const expectedPng = async (index: number): Promise<string> => {
    const luma = 16 + index;
    const rgb = yuv420ToRgb(
      {
        width: 32,
        height: 16,
        y: new Uint8Array(32 * 16).fill(luma),
        yStride: 32,
        u: new Uint8Array(16 * 8).fill(128),
        uStride: 16,
        v: new Uint8Array(16 * 8).fill(128),
        vStride: 16,
      },
      'bt601',
      false,
    );
    const png = await encodePng({ CompressionStream }, 32, 16, rgb);
    return `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
  };

  const sourceOf = (harness: Harness, nodeId: string): string | null =>
    pageView(harness)
      .document.querySelector(`[data-kadrion-node="${nodeId}"]`)
      ?.getAttribute('src') ?? null;

  const sent = (harness: Harness) =>
    harness.log.filter((delivery) => delivery.target === (pageView(harness) as unknown as Window));

  it('shows the source frame of every active video node, decoded and converted in the host window', async () => {
    videoDocument = await withVideoDocument();
    const harness = createHarness();
    const log = installCodecs(harness.window);
    const player = await started(harness);
    await player.load(videoDocument, videoResolve);
    await player.seek(1_000_000);
    // The rule of D49.5 at 25 fps: full 1.0 s → 25; cover 1.5 s → 37; contain 0.5 + 1.0 s → 37.
    expect(sourceOf(harness, 'node-video-full')).toBe(await expectedPng(25));
    expect(sourceOf(harness, 'node-video-cover')).toBe(await expectedPng(37));
    expect(sourceOf(harness, 'node-video-contain')).toBe(await expectedPng(37));
    expect(log.configured.at(-1)).toMatchObject({
      codec: 'avc1.42001e',
      codedWidth: 32,
      codedHeight: 16,
      hardwareAcceleration: 'prefer-software',
    });
    // The page received the frames with the seek, and the video bytes never.
    const seekMessage = sent(harness).at(-1)?.data as {
      videoFrames: { nodeId: string; mediaType: string }[];
    };
    expect(seekMessage.videoFrames.map(({ nodeId, mediaType }) => [nodeId, mediaType])).toEqual([
      ['node-video-full', 'image/png'],
      ['node-video-cover', 'image/png'],
      ['node-video-contain', 'image/png'],
    ]);
    const load = sent(harness).find(
      (delivery) => (delivery.data as { type?: string }).type === 'kadrion-player:load',
    )?.data as { assets: { id: string }[] };
    expect(load.assets.map(({ id }) => id)).toEqual(['asset-image']);
  });

  it('decodes from the sync sample before the frame, so a frame does not depend on the frames before it', async () => {
    videoDocument = await withVideoDocument();
    const harness = createHarness();
    const log = installCodecs(harness.window);
    const player = await started(harness);
    await player.load(videoDocument, videoResolve);
    await player.seek(1_500_000);
    const later = sourceOf(harness, 'node-video-full');
    log.decoded.length = 0;
    await player.seek(400_000);
    await player.seek(1_500_000);
    expect(sourceOf(harness, 'node-video-full')).toBe(later);
    // Frame 10 (0.4 s) decodes 0..10; frame 37 is kept from before and not decoded again.
    expect(
      log.decoded.filter(({ type }) => type === 'key').map(({ first }) => first - 16),
    ).toContain(0);
    const fresh = createHarness();
    const freshLog = installCodecs(fresh.window);
    const other = await started(fresh);
    await other.load(videoDocument, videoResolve);
    freshLog.decoded.length = 0;
    await other.seek(1_500_000);
    expect(sourceOf(fresh, 'node-video-full')).toBe(later);
    const keys = freshLog.decoded
      .filter(({ type }) => type === 'key')
      .map(({ first }) => first - 16);
    expect(keys).toEqual([25, 50]);
  });

  it('removes the frame of a video node that is not active', async () => {
    videoDocument = await withVideoDocument();
    const harness = createHarness();
    installCodecs(harness.window);
    const player = await started(harness);
    await player.load(videoDocument, videoResolve);
    await player.seek(1_000_000);
    expect(sourceOf(harness, 'node-video-contain')).not.toBeNull();
    await player.seek(1_600_000);
    expect(sourceOf(harness, 'node-video-contain')).toBeNull();
    const seekMessage = sent(harness).at(-1)?.data as { videoFrames: { nodeId: string }[] };
    expect(seekMessage.videoFrames.map(({ nodeId }) => nodeId)).toEqual([
      'node-video-full',
      'node-video-cover',
    ]);
  });

  it('takes a video as a Blob, verified chunk by chunk, and refuses a Blob for anything else', async () => {
    videoDocument = await withVideoDocument();
    const harness = createHarness();
    installCodecs(harness.window);
    const player = await started(harness);
    const blobs =
      (map: Readonly<Record<string, unknown>>): PlayerAssetResolver =>
      (request) =>
        (map[request.id] ?? null) as ReturnType<PlayerAssetResolver>;
    await player.load(
      videoDocument,
      blobs({
        ...videoBytes,
        'asset-video': {
          blob: new harness.window.Blob([mp4.slice().buffer]),
          mediaType: 'video/mp4',
        },
      }),
    );
    await player.seek(1_000_000);
    expect(sourceOf(harness, 'node-video-full')).toBe(await expectedPng(25));
    const tampered = mp4.slice();
    tampered[tampered.length - 1] = (tampered.at(-1) ?? 0) ^ 1;
    await expect(
      player.load(
        videoDocument,
        blobs({
          ...videoBytes,
          'asset-video': {
            blob: new harness.window.Blob([tampered.buffer]),
            mediaType: 'video/mp4',
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'asset-hash-mismatch' });
    await expect(
      player.load(
        videoDocument,
        blobs({
          ...videoBytes,
          'asset-image': {
            blob: new harness.window.Blob([image.slice().buffer]),
            mediaType: 'image/png',
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'asset-invalid' });
    await expect(
      player.load(
        videoDocument,
        blobs({
          ...videoBytes,
          'asset-video': {
            blob: new harness.window.Blob([mp4.slice().buffer]),
            mediaType: 'image/png',
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'asset-invalid' });
  });

  it.each([
    [
      'a source range past the end of the video',
      (draft: VideoDraft) => {
        nodeOf(draft, 'node-video-cover').sourceStartUs = 1_500_000;
      },
      'source-range-exceeded',
    ],
  ])('refuses %s before the first frame, sending the page nothing', async (_, edit, code) => {
    const document = await withVideoDocument(edit);
    const harness = createHarness();
    installCodecs(harness.window);
    const player = await started(harness);
    await expect(player.load(document, videoResolve)).rejects.toMatchObject({ code });
    await harness.settle();
    expect(sent(harness)).toEqual([]);
  });

  it('refuses video in a window without a decoder for it, before the first frame', async () => {
    videoDocument = await withVideoDocument();
    const bare = createHarness();
    const player = await started(bare);
    await expect(player.load(videoDocument, videoResolve)).rejects.toMatchObject({
      code: 'video-unsupported',
    });
    const refusing = createHarness();
    installCodecs(refusing.window, { supported: false });
    const other = await started(refusing);
    await expect(other.load(videoDocument, videoResolve)).rejects.toMatchObject({
      code: 'video-unsupported',
    });
    expect(sent(refusing)).toEqual([]);
  });

  it('verifies a video asset that no node shows, but does not read it', async () => {
    const junk = new Uint8Array([1, 2, 3]);
    const document = await withVideoDocument((draft) => {
      draft.assets.push({ id: 'asset-spare', type: 'video', contentHash: nodeHash(junk) });
    });
    const harness = createHarness();
    installCodecs(harness.window);
    const player = await started(harness);
    await player.load(
      document,
      resolverOf({ ...videoBytes, 'asset-spare': { bytes: junk, mediaType: 'video/mp4' } }),
    );
    expect(player.getState()).toMatchObject({ status: 'ready', timeUs: 0 });
  });

  it('prepares a video before any document uses it: its facts, and no second request (D51.5)', async () => {
    videoDocument = await withVideoDocument();
    const harness = createHarness();
    installCodecs(harness.window);
    const player = await started(harness);
    const contentHash = nodeHash(mp4);
    const asked: PlayerAssetRequest[] = [];
    const facts = await player.prepareVideo(
      { id: 'asset-video', type: 'video', contentHash },
      resolverOf(videoBytes, asked),
    );
    expect(facts).toEqual({
      type: 'video',
      durationUs: 3_000_000,
      width: 32,
      height: 16,
      frames: 75,
    });
    expect(Object.isFrozen(facts)).toBe(true);
    asked.length = 0;
    await player.load(videoDocument, resolverOf(videoBytes, asked));
    expect(asked.map(({ id }) => id)).toEqual(['asset-image']);
    asked.length = 0;
    await player.update(videoDocument, resolverOf(videoBytes, asked));
    expect(asked).toEqual([]);
    await expect(
      player.prepareVideo({ id: 'x', type: 'image', contentHash } as never, videoResolve),
    ).rejects.toMatchObject({ code: 'invalid-options' });
    await expect(
      player.prepareVideo(
        { id: 'x', type: 'video', contentHash: nodeHash(new Uint8Array([9])) },
        resolverOf({ x: { bytes: new Uint8Array([9]), mediaType: 'video/mp4' } }),
      ),
    ).rejects.toMatchObject({ code: 'video-unsupported' });
  });

  it('brings an edit of a video node to the preview at the time shown (D44)', async () => {
    videoDocument = await withVideoDocument();
    const harness = createHarness();
    installCodecs(harness.window);
    const player = await started(harness);
    await player.load(videoDocument, videoResolve);
    await player.seek(1_000_000);
    const moved = await withVideoDocument((draft) => {
      nodeOf(draft, 'node-video-full').sourceStartUs = 400_000;
    });
    await player.update(moved, videoResolve);
    expect(sourceOf(harness, 'node-video-full')).toBe(await expectedPng(35));
  });
});

interface VideoDraft {
  assets: { id: string; type: string; contentHash: string }[];
  scenes: {
    nodes: {
      id: string;
      sourceStartUs?: number;
      children?: { id: string; sourceStartUs?: number }[];
    }[];
  }[];
}

function nodeOf(draft: VideoDraft, id: string): { sourceStartUs?: number } {
  for (const node of draft.scenes[0]?.nodes ?? []) {
    if (node.id === id) return node;
    for (const child of node.children ?? []) if (child.id === id) return child;
  }
  throw new Error(`No node ${id}.`);
}

function nodeHash(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/**
 * The rendering probes of PR-45 (D65): which visual primitives the DOM path of
 * D03 renders deterministically in the pinned Chromium, before any schema field
 * maps to one. Run by hand in the pinned container, outside the pinned suite,
 * through `motion-probes.probe.ts` (see there).
 *
 * One probe composition at 1920x1080 (an image, a text, and a video node, each
 * on its own part of the canvas) is loaded into the Producer's render session
 * and into the public Player in the conformance host of D33.2, and rendered at
 * one time. Then, for every probe of `catalogue.ts` and every subject, the same
 * change is made to the render page's DOM in both hosts, every frame of the
 * page is waited for (D28.5), and both are captured by the Producer's capture
 * (D28.5). The whole run is done twice, each with its own browser process. A
 * row records the SHA-256 of the decoded pixels, whether the two runs agree
 * byte for byte, the pixels in which the Player and the Producer differ, the
 * pixels in which the probe differs from the unchanged frame, and the time of
 * one change, presentation, and capture at 1080p. With `--against`, the rows
 * are also compared with an earlier record, which proves repeatability across
 * two fresh containers. The record holds no media; nothing here writes a PNG.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

import {
  awaitPresented,
  canonicalJson,
  captureFrame,
  environmentManifest,
  launchChromium,
  openRenderSession,
  type LaunchedChromium,
  type RenderSession,
} from '@kadrion/producer';
import { frameToTimeUs, timeUsToFrame, validateComposition } from '@kadrion/schema';
import {
  generateReferenceAssets,
  VIDEO_FIXTURE,
  referenceComposition,
} from '@kadrion/test-fixtures';
import type { Frame, Page } from 'playwright-core';

import { decodePng, measure, sha256, type Pixels } from '../parity/parity.js';
import {
  closeConformanceHost,
  openConformanceHost,
  playerState,
  type ConformanceHost,
} from '../pinned/conformance-host.js';
import { decodedFixtureFrames, makeVideoFixture } from '../pinned/video-fixture.ts';

import { PROBES, type Probe, type Subject } from './catalogue.ts';

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const TIME_US = 1_100_000;
/** The source frame of the video at `TIME_US`: 1.1 s at 25 frames per second, PTS 1.08 s. */
const VIDEO_SOURCE_FRAME = 27;
const RECORD_VERSION = 1;

const NODE_OF: Readonly<Record<Exclude<Subject, 'shape'>, string>> = {
  image: 'node-image',
  text: 'node-text',
  video: 'node-video',
};

/** Where the probe's own shape stands, in composition pixels. */
const SHAPE_BOX = { x: 1160, y: 600, width: 600, height: 400 } as const;

function assetHash(id: string): string {
  const assets = (referenceComposition as { assets: { id: string; contentHash: string }[] }).assets;
  const found = assets.find((asset) => asset.id === id);
  if (found === undefined) throw new Error(`The reference composition has no ${id}.`);
  return found.contentHash;
}

const node = (id: string, x: number, y: number) => ({
  id,
  startUs: 0,
  durationUs: 2_000_000,
  position: { x, y },
  scale: { x: 1, y: 1 },
  rotation: 0,
  origin: { x: 0, y: 0 },
  opacity: 1,
  animations: [],
});

/** The probe composition: schema 0.13, one scene, three subjects on a dark background. */
export function probeComposition(): unknown {
  return {
    schemaVersion: '0.19',
    width: WIDTH,
    height: HEIGHT,
    safeArea: { fromTop: 0, fromRight: 0, fromBottom: 0, fromLeft: 0 },
    fps: FPS,
    durationUs: 2_000_000,
    assets: [
      { id: 'asset-image', type: 'image', contentHash: assetHash('asset-image') },
      { id: 'asset-font', type: 'font', contentHash: assetHash('asset-font') },
      { id: VIDEO_FIXTURE.id, type: 'video', contentHash: VIDEO_FIXTURE.contentHash },
    ],
    clips: [],
    transitions: [],
    template: { inputs: [], bindings: [], conditions: [], repeats: [] },
    scenes: [
      {
        id: 'scene-probe',
        durationUs: 2_000_000,
        clips: [],
        transitions: [],
        effects: [],
        nodes: [
          {
            id: 'node-background',
            type: 'background',
            startUs: 0,
            durationUs: 2_000_000,
            color: '#1d2939',
            animations: [],
          },
          {
            ...node('node-image', 160, 80),
            type: 'image',
            assetId: 'asset-image',
            width: 400,
            height: 400,
            fit: 'fill',
            focus: { x: 500, y: 500 },
            crop: { top: 0, right: 0, bottom: 0, left: 0 },
            cornerRadius: 0,
            effects: [],
          },
          {
            ...node('node-text', 960, 200),
            type: 'text',
            text: 'Kadrion',
            fontAssetId: 'asset-font',
            fontSize: 144,
            color: '#fec84b',
            style: { stroke: { kind: 'none' }, shadow: { kind: 'none' }, box: { kind: 'none' } },
            textAnimations: [],
            effects: [],
          },
          {
            ...node('node-video', 120, 600),
            type: 'video',
            assetId: VIDEO_FIXTURE.id,
            sourceStartUs: 0,
            width: 640,
            height: 360,
            fit: 'fill',
            focus: { x: 500, y: 500 },
            crop: { top: 0, right: 0, bottom: 0, left: 0 },
            cornerRadius: 0,
            volume: 0,
            effects: [],
          },
        ],
      },
    ],
  };
}

/** A PNG of packed RGB, as the Producer hands a video frame to the page (D50.4). */
function encodePng(width: number, height: number, rgb: Uint8Array): Uint8Array {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Uint8Array): number => {
    let c = 0xffffffff;
    for (const byte of bytes) c = (table[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array): Buffer => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), Buffer.from(data)]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1);
  }
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', new Uint8Array(0)),
    ]),
  );
}

interface PageProbe {
  readonly nodeId: string | null;
  readonly css: Readonly<Record<string, string>>;
  readonly transformList: string | null;
  readonly defs: string | null;
  readonly underlay: boolean;
  readonly overlay: Readonly<Record<string, string>> | null;
  readonly shape: string | null;
  readonly shapeBox: typeof SHAPE_BOX;
  readonly fragments: readonly Readonly<Record<string, string>>[] | null;
}

/**
 * Runs in the render page: undoes the previous probe, then makes the change of
 * this one. Every element it adds carries `data-kadrion-probe`; the subject's
 * own `style` attribute is restored from the text it had before the first probe.
 */
function applyInPage(probe: PageProbe | null): void {
  const marker = 'data-kadrion-probe';
  const saved = 'data-kadrion-probe-style';
  const savedText = 'data-kadrion-probe-text';
  for (const element of [...document.querySelectorAll<HTMLElement>(`[${savedText}]`)]) {
    element.textContent = element.getAttribute(savedText);
    element.removeAttribute(savedText);
  }
  for (const added of [...document.querySelectorAll(`[${marker}]`)]) added.remove();
  for (const element of [...document.querySelectorAll<HTMLElement>(`[${saved}]`)]) {
    element.setAttribute('style', element.getAttribute(saved) ?? '');
    element.removeAttribute(saved);
  }
  if (probe === null) return;
  const svgNs = 'http://www.w3.org/2000/svg';
  const scene = document.querySelector('[data-kadrion-scene]');
  if (scene === null) throw new Error('No scene is mounted.');
  if (probe.defs !== null) {
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute(marker, '');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.setProperty('position', 'absolute');
    const parsed = new DOMParser().parseFromString(
      `<svg xmlns="${svgNs}"><defs>${probe.defs}</defs></svg>`,
      'image/svg+xml',
    );
    for (const child of [...parsed.documentElement.childNodes])
      svg.append(document.importNode(child, true));
    document.body.append(svg);
  }
  if (probe.shape !== null) {
    const { x, y, width, height } = probe.shapeBox;
    const parsed = new DOMParser().parseFromString(
      `<svg xmlns="${svgNs}" width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}">${probe.shape}</svg>`,
      'image/svg+xml',
    );
    const svg = document.importNode(parsed.documentElement, true) as unknown as SVGElement;
    svg.setAttribute(marker, '');
    for (const [name, value] of Object.entries({
      position: 'absolute',
      left: `${String(x)}px`,
      top: `${String(y)}px`,
    }))
      svg.style.setProperty(name, value);
    scene.append(svg);
  }
  if (probe.nodeId === null) return;
  const element = document.querySelector<HTMLElement>(`[data-kadrion-node="${probe.nodeId}"]`);
  if (element === null) throw new Error(`No element of ${probe.nodeId}.`);
  const box = element.getBoundingClientRect();
  const place = (added: HTMLElement, left: number, width: number): void => {
    added.setAttribute(marker, '');
    for (const [name, value] of Object.entries({
      position: 'absolute',
      left: `${String(left)}px`,
      top: `${String(box.top)}px`,
      width: `${String(width)}px`,
      height: `${String(box.height)}px`,
    }))
      added.style.setProperty(name, value);
  };
  if (probe.underlay) {
    const underlay = document.createElement('div');
    place(underlay, box.left, box.width);
    underlay.style.setProperty(
      'background-image',
      'linear-gradient(115deg, #f04438 0%, #f04438 25%, #12b76a 25%, #12b76a 50%, #2e90fa 50%, #2e90fa 75%, #ffffff 75%)',
    );
    element.before(underlay);
  }
  if (probe.overlay !== null) {
    const overlay = document.createElement('div');
    place(overlay, box.left + box.width / 2, box.width / 2);
    for (const [name, value] of Object.entries(probe.overlay))
      overlay.style.setProperty(name, value);
    element.after(overlay);
  }
  if (probe.fragments !== null) {
    const text = element.textContent;
    element.setAttribute(savedText, text);
    element.textContent = '';
    // The fixture text is ASCII, so a UTF-16 unit is a letter here.
    for (let index = 0; index < text.length; index += 1) {
      const span = document.createElement('span');
      span.append(document.createTextNode(text.charAt(index)));
      const styles = probe.fragments[index % probe.fragments.length] ?? {};
      for (const [name, value] of Object.entries(styles)) span.style.setProperty(name, value);
      element.append(span);
    }
  }
  element.setAttribute(saved, element.getAttribute('style') ?? '');
  if (probe.transformList !== null) {
    // The renderer writes `translate(<x>px, <y>px) scale(…)` for every subject
    // of the probe composition, at origin (0, 0) without rotation.
    const written = element.style.getPropertyValue('transform');
    const translation = /^translate\([^)]*\)/.exec(written)?.[0];
    if (translation === undefined) throw new Error(`An unexpected transform: ${written}.`);
    element.style.setProperty('transform', `${translation} ${probe.transformList}`);
    if (!element.style.getPropertyValue('transform').includes(probe.transformList.slice(0, 9)))
      throw new Error(`The pinned Chromium does not parse transform: ${probe.transformList}.`);
  }
  for (const [name, value] of Object.entries(probe.css)) {
    element.style.setProperty(name, value);
    if (element.style.getPropertyValue(name) === '')
      throw new Error(`The pinned Chromium does not parse ${name}: ${value}.`);
  }
}

function pageProbe(probe: Probe | null, subject: Subject): PageProbe | null {
  if (probe === null) return null;
  return {
    nodeId: subject === 'shape' ? null : NODE_OF[subject],
    css: subject === 'shape' ? {} : (probe.css ?? {}),
    transformList: subject === 'shape' ? null : (probe.transformList ?? null),
    defs: probe.defs ?? null,
    underlay: subject !== 'shape' && probe.underlay === true,
    overlay: subject === 'shape' ? null : (probe.overlay ?? null),
    shape: subject === 'shape' ? (probe.shape ?? '') : null,
    shapeBox: SHAPE_BOX,
    fragments: subject === 'shape' ? null : (probe.fragments ?? null),
  };
}

interface Host {
  readonly page: Page;
  readonly renderFrame: Frame;
}

interface Shot {
  readonly pixels: Pixels;
  readonly milliseconds: number;
}

async function shoot(host: Host, probe: PageProbe | null): Promise<Shot> {
  const started = performance.now();
  await host.renderFrame.evaluate(applyInPage, probe);
  await awaitPresented(host.page, 10_000);
  const png = await captureFrame(host.page, WIDTH, HEIGHT);
  const milliseconds = performance.now() - started;
  return { pixels: decodePng(png), milliseconds };
}

interface Sample {
  readonly producer: Pixels;
  readonly player: Pixels;
  readonly producerMs: number;
  readonly playerMs: number;
}

interface Run {
  readonly runtimeHash: string;
  readonly samples: Map<string, Sample>;
}

const key = (id: string, subject: Subject): string => `${id}|${subject}`;

async function oneRun(
  documentText: string,
  assets: readonly { id: string; type: string; mediaType: string; bytes: Uint8Array }[],
  videoPng: Uint8Array,
): Promise<Run> {
  const chromium: LaunchedChromium = await launchChromium();
  let session: RenderSession | null = null;
  let player: ConformanceHost | null = null;
  try {
    session = await openRenderSession({
      chromium,
      width: WIDTH,
      height: HEIGHT,
      customHtmlNodes: 0,
    });
    await session.load(
      documentText,
      assets.map(({ id, type, mediaType, bytes }) => ({
        id,
        type: type as 'image',
        mediaType,
        bytes,
        contentHash: sha256(bytes),
      })),
    );
    const index = timeUsToFrame(TIME_US, FPS);
    if (frameToTimeUs(index, FPS) !== TIME_US) throw new Error('The probe time is off the grid.');
    await session.frame(index, TIME_US, [
      { nodeId: 'node-video', mediaType: 'image/png', bytes: videoPng },
    ]);
    player = await openConformanceHost(chromium, documentText, assets);
    await player.page.evaluate(
      (time) =>
        (window as unknown as { conformance: { seek(t: number): Promise<void> } }).conformance.seek(
          time,
        ),
      TIME_US,
    );
    const state = await playerState(player);
    if (state.status !== 'ready' || state.timeUs !== TIME_US || state.error !== null)
      throw new Error(`The Player is ${JSON.stringify(state)}.`);
    if (state.runtimeHash !== session.runtime.contentHash)
      throw new Error('The Player and the Producer run different runtime builds.');
    const samples = new Map<string, Sample>();
    const hosts = { producer: session, player };
    for (const probe of PROBES) {
      for (const subject of probe.subjects) {
        const change = pageProbe(probe, subject);
        const producer = await shoot(hosts.producer, change);
        const shown = await shoot(hosts.player, change);
        samples.set(key(probe.id, subject), {
          producer: producer.pixels,
          player: shown.pixels,
          producerMs: producer.milliseconds,
          playerMs: shown.milliseconds,
        });
      }
    }
    // Undoing every probe gives the unchanged frame back, so no row saw an earlier one.
    const after = await shoot(hosts.producer, null);
    const before = samples.get(key('baseline/none', 'image'));
    if (before === undefined || measure(after.pixels, before.producer).differingPixels !== 0)
      throw new Error('Undoing the probes did not give the unchanged frame back.');
    return { runtimeHash: session.runtime.contentHash, samples };
  } finally {
    if (player !== null) await closeConformanceHost(player);
    if (session !== null) await session.close();
    await chromium.browser.close();
  }
}

export interface ProbeRow {
  readonly id: string;
  readonly group: Probe['group'];
  readonly subject: Subject;
  readonly css: Readonly<Record<string, string>> | null;
  /** SHA-256 of the RGBA pixels the Producer captured in the first run. */
  readonly pixelsSha256: string;
  /** Both runs gave the same pixels, in the Producer and in the Player. */
  readonly repeatable: boolean;
  /** The most pixels in which the Player and the Producer differ, over both runs. */
  readonly playerProducerDifferingPixels: number;
  /** Pixels in which the probe differs from the unchanged frame of its subject. */
  readonly differsFromNonePixels: number;
  /** The largest difference of one channel from the unchanged frame, 0 to 255. */
  readonly differsFromNoneMaxChannel: number;
  /** Whether an earlier record has the same pixels for this row; `null` without one. */
  readonly sameAsEarlierRecord: boolean | null;
  /** The slower of the two runs: change, presentation, and capture at 1080p, rounded to ms. */
  readonly producerMs: number;
  readonly playerMs: number;
}

export interface ProbeRecord {
  readonly recordVersion: number;
  readonly script: string;
  readonly environment: unknown;
  readonly runtimeHash: string;
  readonly compositionSha256: string;
  readonly videoFrameSha256: string;
  readonly width: number;
  readonly height: number;
  readonly timeUs: number;
  readonly runs: number;
  readonly earlierRecord: string | null;
  readonly rows: readonly ProbeRow[];
  /** Per probe ID: `exact` when every subject is repeatable and at zero difference. */
  readonly verdicts: Readonly<Record<string, 'exact' | 'not-repeatable' | 'player-differs'>>;
}

function pixelsHash(pixels: Pixels): string {
  return sha256(pixels.data);
}

export interface ProbeOptions {
  /** The file the record is written to. */
  readonly out: string;
  /** The record of an earlier run in another container, or `null`. */
  readonly against: string | null;
  /** The pinned FFmpeg, which makes the fixture video and decodes its frame (D50.5). */
  readonly ffmpeg: string;
}

/** Runs every probe twice and writes the record; returns it as well. */
export async function runProbes({ out, against, ffmpeg }: ProbeOptions): Promise<ProbeRecord> {
  const composition = probeComposition();
  const validated = validateComposition(composition);
  if (!validated.ok)
    throw new Error(`The probe composition is invalid: ${JSON.stringify(validated)}`);
  const documentText = JSON.stringify(composition);
  const video = await makeVideoFixture(ffmpeg);
  const frames = await decodedFixtureFrames(ffmpeg, video);
  const frame = frames[VIDEO_SOURCE_FRAME];
  if (frame === undefined) throw new Error('The fixture video has too few frames.');
  const videoPng = encodePng(VIDEO_FIXTURE.width, VIDEO_FIXTURE.height, frame);
  const reference = generateReferenceAssets();
  const bytesOf = (id: string): { mediaType: string; bytes: Uint8Array } => {
    const found = reference.find((asset) => asset.id === id);
    if (found === undefined) throw new Error(`No fixture asset ${id}.`);
    return found;
  };
  const assets = [
    { id: 'asset-image', type: 'image', ...bytesOf('asset-image') },
    { id: 'asset-font', type: 'font', ...bytesOf('asset-font') },
    { id: VIDEO_FIXTURE.id, type: 'video', mediaType: VIDEO_FIXTURE.mediaType, bytes: video },
  ];

  const first = await oneRun(documentText, assets, videoPng);
  const second = await oneRun(documentText, assets, videoPng);
  if (first.runtimeHash !== second.runtimeHash) throw new Error('The runtime build changed.');

  const earlier =
    against === null ? null : (JSON.parse(readFileSync(against, 'utf8')) as ProbeRecord);
  const earlierRows = new Map(
    (earlier?.rows ?? []).map((row) => [key(row.id, row.subject), row.pixelsSha256]),
  );
  const rows: ProbeRow[] = [];
  for (const probe of PROBES) {
    for (const subject of probe.subjects) {
      const a = first.samples.get(key(probe.id, subject));
      const b = second.samples.get(key(probe.id, subject));
      const none = first.samples.get(key('baseline/none', subject));
      if (a === undefined || b === undefined || none === undefined)
        throw new Error(`A sample of ${probe.id} is missing.`);
      const hash = pixelsHash(a.producer);
      const repeatable =
        hash === pixelsHash(b.producer) && pixelsHash(a.player) === pixelsHash(b.player);
      const parity = Math.max(
        measure(a.player, a.producer).differingPixels,
        measure(b.player, b.producer).differingPixels,
      );
      const recorded = earlierRows.get(key(probe.id, subject));
      const fromNone = measure(a.producer, none.producer);
      rows.push({
        id: probe.id,
        group: probe.group,
        subject,
        css:
          subject === 'shape'
            ? null
            : probe.transformList === undefined
              ? (probe.css ?? null)
              : { ...probe.css, transform: `translate(<position>) ${probe.transformList}` },
        pixelsSha256: hash,
        repeatable,
        playerProducerDifferingPixels: parity,
        differsFromNonePixels: fromNone.differingPixels,
        differsFromNoneMaxChannel: fromNone.maxChannelDifference,
        sameAsEarlierRecord: earlier === null ? null : recorded === hash,
        producerMs: Math.round(Math.max(a.producerMs, b.producerMs)),
        playerMs: Math.round(Math.max(a.playerMs, b.playerMs)),
      });
    }
  }
  const verdicts: Record<string, 'exact' | 'not-repeatable' | 'player-differs'> = {};
  for (const probe of PROBES) {
    const own = rows.filter((row) => row.id === probe.id);
    verdicts[probe.id] = own.some((row) => !row.repeatable || row.sameAsEarlierRecord === false)
      ? 'not-repeatable'
      : own.some((row) => row.playerProducerDifferingPixels !== 0)
        ? 'player-differs'
        : 'exact';
  }
  const chromium = await launchChromium();
  const environment = environmentManifest(chromium.reportedVersion, {
    width: WIDTH,
    height: HEIGHT,
  });
  await chromium.browser.close();
  const record: ProbeRecord = {
    recordVersion: RECORD_VERSION,
    script: 'tests/probes/motion-probes.ts',
    environment,
    runtimeHash: first.runtimeHash,
    compositionSha256: sha256(canonicalJson(validated.composition)),
    videoFrameSha256: sha256(frame),
    width: WIDTH,
    height: HEIGHT,
    timeUs: TIME_US,
    runs: 2,
    earlierRecord: earlier === null ? null : sha256(readFileSync(against ?? '')),
    rows,
    verdicts,
  };
  writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
  const counts = Object.values(verdicts).reduce<Record<string, number>>((all, verdict) => {
    all[verdict] = (all[verdict] ?? 0) + 1;
    return all;
  }, {});
  console.info(`${String(rows.length)} rows, verdicts ${JSON.stringify(counts)} → ${out}`);
  return record;
}

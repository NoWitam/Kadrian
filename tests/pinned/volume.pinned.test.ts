/**
 * The volume curve of a sound with the pinned Chromium and the pinned FFmpeg
 * (D85.4 to D85.6, PR-75), before any document field uses it:
 *
 * - `volumeEnvelope` of `@kadrion/runtime/volume`, as built, gives the same
 *   32-bit gains in the pinned Chromium as in Node for the fixed envelopes of
 *   `packages/runtime/test/volume-support.ts`, and both equal the SHA-256 that
 *   `packages/runtime/test/volume.sha256.json` pins;
 * - a `GainNode` of an `OfflineAudioContext` automated as D85.6 says
 *   (`exponentialRampToValueAtTime` between two values above 0,
 *   `linearRampToValueAtTime` where one is 0, `setValueAtTime` for a hold),
 *   from the first sample and from a sample inside a ramp in decibels, equals
 *   the envelope within 1e-5 per sample: the premise of the parity of D85.6;
 * - the pinned FFmpeg's `amultiply` of a sound by its envelope, streamed as raw
 *   stereo `f32le` on an extra pipe of the process, equals the product computed
 *   here from the decoded source, byte for byte: the premise of D85.5.
 *
 * The FFmpeg check is skipped without `KADRION_FFMPEG`; required where the run
 * is pinned.
 */
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import process from 'node:process';
import type { Readable, Writable } from 'node:stream';
import { promisify } from 'node:util';

import {
  contextOptions,
  launchChromium,
  PINNED_IMAGE,
  PINNED_IMAGE_VARIABLE,
  type LaunchedChromium,
} from '@kadrion/producer';
import { volumeEnvelope, type VolumeSampleKey } from '@kadrion/runtime/volume';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ENVELOPE_CASES } from '../../packages/runtime/test/volume-support.js';

import { pinnedRun, repoRoot, writeReport } from './support.js';

const run = promisify(execFile);
const ffmpegPath = process.env.KADRION_FFMPEG;
const available = ffmpegPath !== undefined;
const pinned = process.env[PINNED_IMAGE_VARIABLE] === PINNED_IMAGE;

const RATE = 48_000;
const ORIGIN = 'http://localhost:4527';
const POLICY = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
/** The packages the page imports: the runtime's entry reaches its audio module, which reaches the schema. */
const PACKAGES = ['runtime', 'schema'];

/** The bound of D85.6: the error of 32-bit float automation is about 1e-5. */
const RAMP_BOUND = 1e-5;

const linear = { kind: 'linear' } as const;
const hold = { kind: 'hold' } as const;

/**
 * The curve that Chromium automates: a ramp down in decibels, a level, a hold
 * and its jump, a ramp to 0 and from 0 in amplitude, and a long ramp of 5 s in
 * decibels, 9.5 s in all.
 */
const RAMP_KEYS: readonly VolumeSampleKey[] = [
  { sample: 0, value: 1, easing: linear },
  { sample: 24_000, value: 0.2, easing: linear },
  { sample: 72_000, value: 0.2, easing: hold },
  { sample: 96_000, value: 0.6, easing: linear },
  { sample: 144_000, value: 0, easing: linear },
  { sample: 168_000, value: 0.5, easing: linear },
  { sample: 408_000, value: 0.01, easing: linear },
];
const RAMP_SAMPLES = 456_000;
/** A seek inside the long ramp in decibels, and one inside the first. */
const RAMP_STARTS = [0, 300_001, 9_999];

/** One automation event of D85.6, in seconds from the first sample rendered. */
interface Automation {
  readonly method: 'setValueAtTime' | 'exponentialRampToValueAtTime' | 'linearRampToValueAtTime';
  readonly value: number;
  readonly time: number;
}

/**
 * The automation of D85.6 from sample `start`: the gain of the envelope there,
 * then per keyframe after it a ramp in decibels between two values above 0, a
 * ramp in amplitude where one is 0, or a step after a hold.
 */
function automation(keys: readonly VolumeSampleKey[], start: number): Automation[] {
  const [first] = volumeEnvelope({ volumeKeys: keys }, start, 1);
  const events: Automation[] = [{ method: 'setValueAtTime', value: first ?? 0, time: 0 }];
  let before: VolumeSampleKey | null = null;
  for (const key of keys) {
    if (key.sample <= start) {
      before = key;
      continue;
    }
    const time = (key.sample - start) / RATE;
    const method =
      before === null || before.easing.kind === 'hold'
        ? 'setValueAtTime'
        : before.value > 0 && key.value > 0
          ? 'exponentialRampToValueAtTime'
          : 'linearRampToValueAtTime';
    events.push({ method, value: key.value, time });
    before = key;
  }
  return events;
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{"imports":{"@kadrion/schema":"/pkg/schema/index.js"}}</script>
<script type="module">
import { volumeEnvelope } from '/pkg/runtime/volume.js';

const hex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

window.envelopes = async (cases) => {
  const hashes = {};
  for (const item of cases) {
    const gains = volumeEnvelope({ volumeKeys: item.volumeKeys }, item.fromSample, item.count);
    hashes[item.name] = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', gains)));
  }
  return hashes;
};

window.automate = async (events, length) => {
  const context = new OfflineAudioContext(1, length, ${String(RATE)});
  const source = new ConstantSourceNode(context, { offset: 1 });
  const gain = new GainNode(context, { gain: events[0].value });
  for (const event of events) gain.gain[event.method](event.value, event.time);
  source.connect(gain).connect(context.destination);
  source.start(0);
  const rendered = (await context.startRendering()).getChannelData(0);
  const bytes = new Uint8Array(rendered.buffer, rendered.byteOffset, rendered.byteLength);
  let text = '';
  for (let at = 0; at < bytes.length; at += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(text);
};
window.ready = true;
</script></head><body></body></html>`;

interface VolumeWindow {
  envelopes(cases: typeof ENVELOPE_CASES): Promise<Record<string, string>>;
  automate(events: readonly Automation[], length: number): Promise<string>;
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

function sha256(samples: Float32Array): string {
  return createHash('sha256')
    .update(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength))
    .digest('hex');
}

describe('the volume curve in pinned Chromium (D85.4, D85.6)', () => {
  let chromium: LaunchedChromium;

  beforeAll(async () => {
    chromium = await launchChromium();
  });

  afterAll(async () => {
    await chromium.browser.close();
  });

  it('gives the envelopes of Node, as pinned, and follows them with Web Audio ramps within 1e-5', async () => {
    const node = Object.fromEntries(
      ENVELOPE_CASES.map(({ name, volumeKeys, fromSample, count }) => [
        name,
        sha256(volumeEnvelope({ volumeKeys }, fromSample, count)),
      ]),
    );
    const pinnedHashes = JSON.parse(
      readFileSync(join(repoRoot, 'packages', 'runtime', 'test', 'volume.sha256.json'), 'utf8'),
    ) as Record<string, string>;
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
      const browser = await page.evaluate(
        (cases) => (window as unknown as VolumeWindow).envelopes(cases),
        ENVELOPE_CASES,
      );
      const names = ENVELOPE_CASES.map(({ name }) => name);
      const differingFromNode = names.filter((name) => browser[name] !== node[name]);
      const differingFromPinned = names.filter((name) => node[name] !== pinnedHashes[name]);

      const ramps = [];
      for (const start of RAMP_STARTS) {
        const length = RAMP_SAMPLES - start;
        const events = automation(RAMP_KEYS, start);
        const encoded = await page.evaluate(
          ([items, count]) => (window as unknown as VolumeWindow).automate(items, count),
          [events, length] as const,
        );
        const bytes = Buffer.from(encoded, 'base64');
        const rendered = new Float32Array(new Uint8Array(bytes).buffer);
        const envelope = volumeEnvelope({ volumeKeys: RAMP_KEYS }, start, length);
        let maxDifference = 0;
        let atSample = start;
        for (let i = 0; i < length; i += 1) {
          const difference = Math.abs((rendered[i] ?? NaN) - (envelope[i] as number));
          if (!(difference <= maxDifference)) {
            maxDifference = difference;
            atSample = start + i;
          }
        }
        ramps.push({ start, samples: rendered.length, events, maxDifference, atSample });
      }
      writeReport('volume/node-vs-chromium.json', {
        environment: pinnedRun(chromium),
        cases: names.length,
        node,
        differingFromNode,
        differingFromPinned,
        rampBound: RAMP_BOUND,
        ramps,
      });
      expect(unexpected).toEqual([]);
      // The premise: every case was computed on both sides.
      expect(Object.keys(browser).sort()).toEqual(Object.keys(node).sort());
      expect(names).toHaveLength(7);
      expect(differingFromNode).toEqual([]);
      expect(differingFromPinned).toEqual([]);
      for (const ramp of ramps) {
        expect(ramp.samples, `from ${String(ramp.start)}`).toBe(RAMP_SAMPLES - ramp.start);
        expect(ramp.maxDifference, `from ${String(ramp.start)}`).toBeLessThanOrEqual(RAMP_BOUND);
      }
      // Every kind of segment was automated.
      const methods = new Set(ramps.flatMap(({ events }) => events.map(({ method }) => method)));
      expect([...methods].sort()).toEqual([
        'exponentialRampToValueAtTime',
        'linearRampToValueAtTime',
        'setValueAtTime',
      ]);
    } finally {
      await context.close();
    }
  });
});

// --- amultiply with the pinned FFmpeg ---------------------------------------------

/** A WAV of signed 16-bit stereo samples at 48 kHz: a falling saw on the left, a triangle on the right. */
function source(frames: number): Uint8Array {
  const data = frames * 4;
  const bytes = new Uint8Array(44 + data);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      bytes[offset + index] = text.charCodeAt(index);
    }
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + data, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, data, true);
  for (let frame = 0; frame < frames; frame += 1) {
    const phase = frame % 120;
    view.setInt16(44 + frame * 4, 9_000 - (frame % 70) * 250, true);
    view.setInt16(
      44 + frame * 4 + 2,
      phase < 60 ? -9_000 + 300 * phase : 9_000 - 300 * (phase - 60),
      true,
    );
  }
  return bytes;
}

/** The source as the pinned FFmpeg decodes it: 32-bit float, stereo, interleaved. */
async function decoded(file: string): Promise<Float32Array> {
  const { stdout } = await run(
    ffmpegPath ?? '',
    [
      ...['-nostdin', '-v', 'error', '-threads', '1', '-i', `file:${file}`, '-map', '0:a:0'],
      ...['-ac', '2', '-ar', String(RATE), '-f', 'f32le', 'pipe:1'],
    ],
    { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
  );
  const copy = new Uint8Array(stdout);
  return new Float32Array(copy.buffer, 0, copy.byteLength / 4);
}

/** Writes the envelope as raw stereo f32le in chunks, waiting whenever the pipe is full. */
async function writeEnvelope(
  pipe: Writable,
  keys: readonly VolumeSampleKey[],
  count: number,
): Promise<{ readonly bytes: number; readonly sha256: string }> {
  const hash = createHash('sha256');
  const CHUNK = 4_096;
  let written = 0;
  for (let from = 0; from < count; from += CHUNK) {
    const gains = volumeEnvelope({ volumeKeys: keys }, from, Math.min(CHUNK, count - from));
    const frames = new Float32Array(gains.length * 2);
    for (let i = 0; i < gains.length; i += 1) {
      frames[2 * i] = gains[i] as number;
      frames[2 * i + 1] = gains[i] as number;
    }
    const bytes = new Uint8Array(frames.buffer);
    hash.update(bytes);
    written += bytes.byteLength;
    if (!pipe.write(bytes)) {
      await new Promise<void>((resolve, reject) => {
        const failed = (reason: Error): void => {
          reject(reason);
        };
        pipe.once('error', failed);
        pipe.once('drain', () => {
          pipe.off('error', failed);
          resolve();
        });
      });
    }
  }
  await new Promise<void>((resolve) => {
    pipe.end(resolve);
  });
  return { bytes: written, sha256: hash.digest('hex') };
}

describe('the pinned FFmpeg for the volume envelope (D85.5)', () => {
  it('is given wherever the run is pinned, and its absence is stated elsewhere', () => {
    if (pinned) expect(available).toBe(true);
    if (!available) {
      console.info(
        'The amultiply test is skipped: KADRION_FFMPEG is not set. The envelope pipe is not proven by this run.',
      );
    }
  });
});

describe.skipIf(!available)('amultiply by an envelope on a pipe (D85.5)', () => {
  it('equals the product in TypeScript of the decoded sound and the envelope, byte for byte', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'kadrion-volume-'));
    try {
      const file = join(directory, 'source.wav');
      writeFileSync(file, source(12 * RATE));
      // 10 s of the source from its sample 7 200, about 3.8 MB of envelope: far more than a pipe holds.
      const from = 7_200;
      const count = 10 * RATE;
      const keys: readonly VolumeSampleKey[] = [
        { sample: -4_800, value: 0.05, easing: linear },
        { sample: 96_000, value: 1, easing: linear },
        { sample: 120_000, value: 0.3, easing: hold },
        { sample: 200_000, value: 0.8, easing: linear },
        { sample: 240_000, value: 0, easing: linear },
        { sample: 260_000, value: 0.4, easing: linear },
        { sample: 470_000, value: 0.002, easing: linear },
      ];
      const sound = [
        `[0:a:0]aresample=${String(RATE)}`,
        `aformat=sample_fmts=fltp:sample_rates=${String(RATE)}:channel_layouts=stereo`,
        `atrim=start_sample=${String(from)}:end_sample=${String(from + count)}`,
        'asetpts=N/SR/TB',
        'volume=volume=0.5:precision=float[s0pre]',
      ].join(',');
      const graph = [
        sound,
        `[1:a:0]aformat=sample_fmts=fltp:sample_rates=${String(RATE)}:channel_layouts=stereo[e0]`,
        '[s0pre][e0]amultiply[s0post]',
      ].join(';');
      const args = [
        ...['-hide_banner', '-nostdin', '-loglevel', 'error', '-threads', '1'],
        ...['-i', `file:${file}`],
        ...['-f', 'f32le', '-ar', String(RATE), '-ch_layout', 'stereo', '-i', 'pipe:3'],
        ...['-filter_complex_threads', '1', '-filter_complex', graph, '-map', '[s0post]'],
        ...['-c:a', 'pcm_f32le', '-f', 'f32le', 'pipe:1'],
      ];
      const child = spawn(ffmpegPath ?? '', args, { stdio: ['ignore', 'pipe', 'pipe', 'pipe'] });
      const output: Buffer[] = [];
      const errors: Buffer[] = [];
      const [, stdout, stderr, pipe] = child.stdio as unknown as [
        null,
        Readable,
        Readable,
        Writable,
      ];
      stdout.on('data', (chunk: Buffer) => output.push(chunk));
      stderr.on('data', (chunk: Buffer) => errors.push(chunk));
      const exited = new Promise<number | null>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', resolve);
      });
      const envelope = await writeEnvelope(pipe, keys, count);
      const code = await exited;
      const bytes = new Uint8Array(Buffer.concat(output));
      const product = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);

      const samples = await decoded(file);
      const gains = volumeEnvelope({ volumeKeys: keys }, 0, count);
      const expected = new Float32Array(count * 2);
      for (let i = 0; i < count; i += 1) {
        for (let channel = 0; channel < 2; channel += 1) {
          const half = Math.fround((samples[2 * (from + i) + channel] as number) * 0.5);
          expected[2 * i + channel] = Math.fround(half * (gains[i] as number));
        }
      }
      let differing = 0;
      let first = -1;
      for (let i = 0; i < expected.length; i += 1) {
        if (!Object.is(product[i], expected[i])) {
          differing += 1;
          if (first < 0) first = i;
        }
      }
      writeReport('volume/amultiply.json', {
        ffmpeg: ffmpegPath,
        graph,
        args: args.map((arg) => (arg === `file:${file}` ? 'file:<source>' : arg)),
        exitCode: code,
        stderr: Buffer.concat(errors).toString('utf8'),
        envelopeBytes: envelope.bytes,
        envelopeSha256: envelope.sha256,
        outputSamples: product.length,
        expectedSamples: expected.length,
        outputSha256: sha256(product),
        expectedSha256: sha256(expected),
        differing,
        firstDifferingSample: first,
      });
      expect(code).toBe(0);
      expect(envelope.bytes).toBe(count * 8);
      expect(product.length).toBe(expected.length);
      expect(differing).toBe(0);
      // The premise: the curve shaped the sound, so a product that ignored it would differ.
      expect(sha256(expected)).not.toBe(sha256(samples.subarray(2 * from, 2 * (from + count))));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

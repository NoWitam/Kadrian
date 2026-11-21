/**
 * The stream of a playing video node and the pool of conversion workers
 * (D87.1, D87.2), with a stand-in decoder that gives frames in presentation
 * order as a real one does, holding a frame back until the frames before it
 * in presentation order were decoded, and stand-in workers. That a stream's
 * frame is the pixels of the path of D51.4 in Chromium is proven by the
 * pinned tests of PR-83; here the order, the bound, the restarts, the skipped
 * frames, and the pool's rules.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { UPRIGHT } from '@kadrion/renderer-dom';
import { describe, expect, it } from 'vitest';

import type { VideoTrack } from '../src/container.js';
import { planesToRgb, shownRgb, shownRgba, type ConvertJob } from '../src/convert.js';
import { answer } from '../src/convert-worker.js';
import {
  ConversionPool,
  createConversionPool,
  MOST_WORKERS,
  PoolClosed,
  poolSize,
  WORKER_MODULE,
  type ConvertWorker,
} from '../src/pool.js';
import { STREAM_AHEAD, StreamSuperseded, VideoStream, type StreamCodecs } from '../src/stream.js';
import type { DecodedPlanes, VerifiedVideo } from '../src/video.js';
import { bundleWorker, WORKER_FILE } from '../scripts/build-worker.js';
import { nalSample } from './media.js';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

// --- a track and a decoder ------------------------------------------------

interface TestTrack {
  readonly frames: number;
  /** A sync sample with an IDR picture every `gop` samples in decode order. */
  readonly gop: number;
  /** Decode order with B-frames: I P B B P B B …, presentation reordered. */
  readonly bFrames?: boolean;
}

interface Log {
  decoded: number[];
  configured: number;
  closed: number;
  converted: number[];
  released: number[];
  read: [number, number][];
}

/**
 * For `bFrames`, each group after its I-frame is `P(k+3) B(k+1) B(k+2)` in
 * decode order. The luma of a frame is its presentation index.
 */
function videoOf(options: TestTrack, log: Log): VerifiedVideo {
  const { frames, gop } = options;
  // decodeToPresentation[d] = presentation index of decode index d.
  const decodeToPresentation: number[] = [];
  for (let d = 0; d < frames; d += 1) decodeToPresentation.push(d);
  if (options.bFrames === true) {
    for (let groupStart = 0; groupStart < frames; groupStart += gop) {
      for (let k = groupStart + 1; k + 2 < Math.min(groupStart + gop, frames); k += 3) {
        decodeToPresentation[k] = k + 2;
        decodeToPresentation[k + 1] = k;
        decodeToPresentation[k + 2] = k + 1;
      }
    }
  }
  const presentation = new Array<number>(frames);
  decodeToPresentation.forEach((p, d) => {
    presentation[p] = d;
  });
  const samples = decodeToPresentation.map((p, d) => ({ pts: p * 1000, sync: d % gop === 0 }));
  const bytesOf = (d: number): Uint8Array =>
    nalSample(new Uint8Array([decodeToPresentation[d] as number]), d % gop === 0);
  const track: VideoTrack = {
    codec: 'avc1.42001e',
    description: new Uint8Array([1, 66, 0, 30, 0xff, 0xe0, 0]),
    colour: { matrix: 'bt601', fullRange: false },
    width: 2,
    height: 2,
    orientation: UPRIGHT,
    timeBase: { numerator: 1, denominator: 30_000 },
    samples,
    presentation,
    timestamps: presentation.map((_, p) => p * 1000),
    lastDuration: 1000,
    async *readSamples(from: number, to: number) {
      log.read.push([from, to]);
      for (let d = from; d <= to; d += 1) {
        await Promise.resolve();
        yield bytesOf(d);
      }
    },
  } as unknown as VideoTrack;
  return {
    id: 'clip',
    contentHash: 'sha256:clip',
    mediaType: 'video/mp4',
    blob: new Blob([]),
    track,
    facts: { type: 'video', durationUs: frames * 33_333, width: 2, height: 2, frames },
  };
}

function codecsOf(video: VerifiedVideo, log: Log): StreamCodecs {
  const presentationOf = (d: number): number =>
    video.track.presentation.indexOf(d) === -1 ? d : video.track.presentation.indexOf(d);
  class Chunk {
    readonly timestamp: number;
    readonly data: Uint8Array;
    constructor(init: EncodedVideoChunkInit) {
      this.timestamp = init.timestamp;
      this.data = new Uint8Array(init.data as Uint8Array);
    }
  }
  class Decoder {
    state = 'unconfigured';
    decodeQueueSize = 0;
    ondequeue: (() => void) | null = null;
    private readonly output: (frame: VideoFrame) => void;
    private readonly buffered = new Map<number, number>();
    private nextOut = -1;
    private work: Promise<void> = Promise.resolve();
    constructor(init: { output: (frame: VideoFrame) => void }) {
      this.output = init.output;
    }
    configure(): void {
      this.state = 'configured';
      log.configured += 1;
    }
    decode(chunk: Chunk): void {
      this.decodeQueueSize += 1;
      this.work = this.work.then(async () => {
        await Promise.resolve();
        if (this.state === 'closed') return;
        this.decodeQueueSize -= 1;
        this.ondequeue?.();
        log.decoded.push(chunk.timestamp);
        const p = presentationOf(chunk.timestamp);
        if (this.nextOut === -1) this.nextOut = p;
        this.buffered.set(p, chunk.timestamp);
        this.emit(false);
      });
    }
    private emit(all: boolean): void {
      for (;;) {
        let p = this.nextOut;
        if (!this.buffered.has(p)) {
          if (!all || this.buffered.size === 0) return;
          p = Math.min(...this.buffered.keys());
        }
        const d = this.buffered.get(p) as number;
        this.buffered.delete(p);
        this.nextOut = p + 1;
        const luma = p;
        this.output({
          format: 'I420',
          timestamp: d,
          visibleRect: { x: 0, y: 0, width: 2, height: 2 },
          allocationSize: () => 6,
          copyTo: (buffer: Uint8Array) => {
            buffer.fill(luma, 0, 4);
            buffer.fill(128, 4);
            return Promise.resolve([
              { offset: 0, stride: 2 },
              { offset: 4, stride: 1 },
              { offset: 5, stride: 1 },
            ]);
          },
          close: () => undefined,
        } as unknown as VideoFrame);
      }
    }
    async flush(): Promise<void> {
      await this.work;
      this.emit(true);
    }
    close(): void {
      this.state = 'closed';
      log.closed += 1;
    }
  }
  return {
    VideoDecoder: Decoder as unknown as StreamCodecs['VideoDecoder'],
    EncodedVideoChunk: Chunk as unknown as StreamCodecs['EncodedVideoChunk'],
  };
}

interface Converted {
  readonly index: number;
  readonly luma: number;
}

function streamOf(
  options: TestTrack & { upcoming?: (index: number) => readonly number[]; ahead?: number },
): { stream: VideoStream<Converted>; log: Log; video: VerifiedVideo } {
  const log: Log = { decoded: [], configured: 0, closed: 0, converted: [], released: [], read: [] };
  const video = videoOf(options, log);
  const stream = new VideoStream<Converted>({
    codecs: codecsOf(video, log),
    video,
    upcoming:
      options.upcoming ??
      ((index) => Array.from({ length: STREAM_AHEAD }, (_, at) => index + 1 + at)),
    convert: (planes: DecodedPlanes, index) => {
      log.converted.push(index);
      return Promise.resolve({ index, luma: planes.data[0] as number });
    },
    release: (frame) => {
      log.released.push(frame.index);
    },
    ...(options.ahead === undefined ? {} : { ahead: options.ahead }),
  });
  return { stream, log, video };
}

/** Lets every queued step of the stand-ins and the stream run. */
async function settled(): Promise<void> {
  for (let round = 0; round < 50; round += 1) await new Promise((resolve) => setTimeout(resolve));
}

describe('the stream of a playing video node (D87.1)', () => {
  it('gives every frame in ascending order from one decoder that decodes each sample once', async () => {
    const { stream, log } = streamOf({ frames: 30, gop: 10 });
    for (let index = 0; index < 30; index += 1) {
      expect(await stream.frame(index)).toEqual({ index, luma: index });
    }
    expect(stream.restarts).toBe(1);
    expect(log.configured).toBe(1);
    expect(log.decoded).toEqual(Array.from({ length: 30 }, (_, at) => at));
    expect(log.converted).toEqual(Array.from({ length: 30 }, (_, at) => at));
    stream.close();
  });

  it('gives the frames of B-frames in presentation order', async () => {
    const { stream, video } = streamOf({ frames: 20, gop: 10, bFrames: true });
    expect(video.track.presentation.slice(0, 4)).toEqual([0, 2, 3, 1]);
    for (let index = 0; index < 20; index += 1) {
      expect((await stream.frame(index)).luma).toBe(index);
    }
    expect(stream.restarts).toBe(1);
    stream.close();
  });

  it('starts at the last IDR sample before the first frame and flushes once at the end', async () => {
    const { stream, log } = streamOf({ frames: 30, gop: 10 });
    expect((await stream.frame(25)).luma).toBe(25);
    expect(log.decoded[0]).toBe(20);
    expect((await stream.frame(29)).luma).toBe(29);
    stream.close();
  });

  it('stays at most `ahead` converted frames beyond the frame asked for, and stops feeding', async () => {
    const { stream, log } = streamOf({ frames: 300, gop: 300 });
    await stream.frame(0);
    await settled();
    expect(stream.held).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(log.converted).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // The decoder is fed no further than the frames wanted, a queued sample or two.
    expect(log.decoded.length).toBeLessThanOrEqual(STREAM_AHEAD + 1 + 2);
    await stream.frame(1);
    await settled();
    expect(stream.held).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(log.released).toEqual([0]);
    stream.close();
  });

  it('decodes a frame the film skips and does not convert it', async () => {
    const even = (index: number): number[] =>
      Array.from({ length: STREAM_AHEAD }, (_, at) => index + 2 * (at + 1));
    const { stream, log } = streamOf({ frames: 40, gop: 40, upcoming: even });
    for (let index = 0; index < 40; index += 2)
      expect((await stream.frame(index)).luma).toBe(index);
    expect(log.converted).toEqual(Array.from({ length: 20 }, (_, at) => at * 2));
    expect(log.decoded).toEqual(Array.from({ length: 40 }, (_, at) => at));
    expect(stream.restarts).toBe(1);
    stream.close();
  });

  it('holds a frame shown for several film frames, converted once, until a later frame is asked for', async () => {
    const slow = (index: number): number[] => [index, index, index + 1, index + 1, index + 2];
    const { stream, log } = streamOf({ frames: 20, gop: 20, upcoming: slow });
    const first = await stream.frame(3);
    expect(await stream.frame(3)).toBe(first);
    expect(await stream.frame(3)).toBe(first);
    expect(log.converted.filter((at) => at === 3)).toHaveLength(1);
    expect(log.released).toEqual([]);
    await stream.frame(4);
    expect(log.released).toEqual([3]);
    stream.close();
  });

  it('starts again at the IDR before a frame behind it', async () => {
    const { stream, log } = streamOf({ frames: 30, gop: 10 });
    await stream.frame(14);
    expect((await stream.frame(12)).luma).toBe(12);
    expect(stream.restarts).toBe(2);
    expect(log.decoded.filter((at) => at === 10)).toHaveLength(2);
    stream.close();
  });

  it('starts again at the IDR before a frame beyond the next IDR it would feed', async () => {
    const { stream, log } = streamOf({ frames: 60, gop: 10 });
    await stream.frame(0);
    await settled();
    expect((await stream.frame(45)).luma).toBe(45);
    expect(stream.restarts).toBe(2);
    expect(log.decoded).not.toContain(20);
    expect(log.decoded).toContain(40);
    stream.close();
  });

  it('does not start again for a jump inside the group it decodes', async () => {
    const { stream } = streamOf({ frames: 60, gop: 30 });
    await stream.frame(0);
    expect((await stream.frame(20)).luma).toBe(20);
    expect(stream.restarts).toBe(1);
    stream.close();
  });

  it('converts a frame it passed from the planes it kept, and starts again for one it let go', async () => {
    const far = (index: number): number[] => [index + 10];
    const { stream, log } = streamOf({ frames: 30, gop: 30, upcoming: far });
    await stream.frame(0);
    await stream.frame(10);
    await settled();
    expect(log.converted).toEqual([0, 10, 20]);
    expect(stream.restarts).toBe(1);
    // Frames 1 to 8 came before they were wanted and were kept as planes; 9 was let go.
    const again = streamOf({ frames: 30, gop: 30, upcoming: far });
    await again.stream.frame(0);
    await settled();
    expect((await again.stream.frame(3)).luma).toBe(3);
    expect(again.stream.restarts).toBe(1);
    expect((await again.stream.frame(9)).luma).toBe(9);
    expect(again.stream.restarts).toBe(2);
    stream.close();
    again.stream.close();
  });

  it('when closed, lets go of every frame it holds, closes its decoder, and refuses more', async () => {
    const { stream, log } = streamOf({ frames: 30, gop: 30 });
    await stream.frame(0);
    await settled();
    stream.close();
    expect([...log.released].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(log.closed).toBe(1);
    expect(stream.held).toEqual([]);
    await expect(stream.frame(1)).rejects.toBeInstanceOf(StreamSuperseded);
  });

  it('lets go of a frame whose conversion ends after the stream closed', async () => {
    const { stream, log } = streamOf({ frames: 30, gop: 30 });
    const pending = stream.frame(0);
    stream.close();
    await expect(pending).rejects.toBeInstanceOf(StreamSuperseded);
    await settled();
    expect(log.converted.every((at) => log.released.includes(at))).toBe(true);
  });

  it('refuses a frame the track does not have', async () => {
    const { stream } = streamOf({ frames: 10, gop: 10 });
    await expect(stream.frame(10)).rejects.toMatchObject({ code: 'video-undecodable' });
    stream.close();
  });
});

// --- the conversion and its worker ----------------------------------------

const JOB: ConvertJob = {
  width: 2,
  height: 2,
  matrix: 'bt709',
  fullRange: false,
  orientation: { rotation: 90, flipped: false },
  data: new Uint8Array([16, 80, 160, 235, 100, 200]),
  layout: [
    { offset: 0, stride: 2 },
    { offset: 4, stride: 1 },
    { offset: 5, stride: 1 },
  ],
};

describe('the conversion of a frame (D51.4, D87.2)', () => {
  it('adds only an alpha of 255 to the turned RGB of the path of D51', () => {
    const { width, height, rgb } = shownRgb(JOB);
    const { rgba } = shownRgba(JOB);
    expect([width, height]).toEqual([2, 2]);
    expect(rgba.length).toBe(16);
    for (let pixel = 0; pixel < 4; pixel += 1) {
      expect([...rgba.subarray(pixel * 4, pixel * 4 + 3)]).toEqual([
        ...rgb.subarray(pixel * 3, pixel * 3 + 3),
      ]);
      expect(rgba[pixel * 4 + 3]).toBe(255);
    }
    // A quarter turn moves whole pixels of the unturned conversion.
    expect([...rgb].sort()).toEqual([...planesToRgb(JOB)].sort());
  });

  it('is answered by the worker as a transferred bitmap of exactly those bytes', async () => {
    class TestImageData {
      readonly data: Uint8ClampedArray;
      readonly width: number;
      readonly height: number;
      constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    }
    const scope = globalThis as unknown as { ImageData?: unknown };
    const before = scope.ImageData;
    scope.ImageData = TestImageData;
    try {
      const seen: { image: ImageData; options: ImageBitmapOptions }[] = [];
      const bitmap = { close: () => undefined } as unknown as ImageBitmap;
      const [reply, transfer] = await answer({ id: 7, job: JOB }, (image, options) => {
        seen.push({ image, options });
        return Promise.resolve(bitmap);
      });
      expect(reply).toEqual({ id: 7, bitmap });
      expect(transfer).toEqual([bitmap]);
      expect(seen[0]?.options).toEqual({ premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      expect([...(seen[0]?.image.data ?? [])]).toEqual([...shownRgba(JOB).rgba]);
      expect(await answer({ id: 8 }, () => Promise.reject(new Error('unused')))).toEqual([
        { id: 8 },
        [],
      ]);
      const [failed] = await answer({ id: 9, job: { ...JOB, layout: [] } }, () =>
        Promise.resolve(bitmap),
      );
      expect(failed).toMatchObject({ id: 9, error: expect.any(String) as string });
    } finally {
      scope.ImageData = before;
    }
  });
});

// --- the pool -------------------------------------------------------------

class TestWorker implements ConvertWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readonly received: { id: number; job?: ConvertJob }[] = [];
  terminated = false;
  private readonly startsWell: boolean;
  constructor(startsWell = true) {
    this.startsWell = startsWell;
  }
  postMessage(message: { id: number; job?: ConvertJob }): void {
    this.received.push(message);
    if (message.job === undefined) {
      queueMicrotask(() => {
        if (this.startsWell) this.onmessage?.({ data: { id: message.id } } as MessageEvent);
        else this.onerror?.(new Event('error'));
      });
    }
  }
  /** Answers the job of `id` with a bitmap. */
  finish(id: number): void {
    this.onmessage?.({ data: { id, bitmap: { id } } } as unknown as MessageEvent);
  }
  terminate(): void {
    this.terminated = true;
  }
}

const job = (): ConvertJob => ({ ...JOB, data: JOB.data.slice() });

describe('the pool of conversion workers (D87.2)', () => {
  it('has min(4, max(1, cores − 2)) workers', () => {
    expect([undefined, 0, 1, 2, 3, 4, 5, 6, 7, 16].map(poolSize)).toEqual([
      1, 1, 1, 1, 1, 2, 3, 4, 4, 4,
    ]);
    expect(MOST_WORKERS).toBe(4);
  });

  it('starts when every worker answers, and gives each job to the worker with the fewest in hand', async () => {
    const workers = [new TestWorker(), new TestWorker()];
    const pool = new ConversionPool(workers);
    expect(await pool.start()).toBe(true);
    const first = pool.convert(job());
    const second = pool.convert(job());
    const third = pool.convert(job());
    expect(pool.load).toEqual([2, 1]);
    const ids = workers.map((worker) => worker.received.filter((m) => m.job).map((m) => m.id));
    workers[0]?.finish(ids[0]?.[0] as number);
    workers[1]?.finish(ids[1]?.[0] as number);
    workers[0]?.finish(ids[0]?.[1] as number);
    expect(await first).toEqual({ id: ids[0]?.[0] });
    expect(await second).toEqual({ id: ids[1]?.[0] });
    expect(await third).toEqual({ id: ids[0]?.[1] });
    expect(pool.load).toEqual([0, 0]);
    pool.close();
    expect(workers.every((worker) => worker.terminated)).toBe(true);
  });

  it('does not start when a worker fails, and refuses its jobs from then on', async () => {
    const pool = new ConversionPool([new TestWorker(), new TestWorker(false)]);
    expect(await pool.start()).toBe(false);
    await expect(pool.convert(job())).rejects.toBeInstanceOf(PoolClosed);
    pool.close();
  });

  it('refuses the jobs in hand when it closes', async () => {
    const pool = new ConversionPool([new TestWorker()]);
    await pool.start();
    const pending = pool.convert(job());
    pool.close();
    await expect(pending).rejects.toBeInstanceOf(PoolClosed);
  });

  it('is made of module workers of the window, or not at all where the window makes none', () => {
    const made: { url: URL; options: WorkerOptions }[] = [];
    const view = {
      navigator: { hardwareConcurrency: 8 },
      Worker: class extends TestWorker {
        constructor(url: URL, options: WorkerOptions) {
          super();
          made.push({ url, options });
        }
      },
    };
    const pool = createConversionPool(view, new URL('https://host.example/worker.js'));
    expect(pool?.size).toBe(4);
    expect(made.map(({ options }) => options.type)).toEqual([
      'module',
      'module',
      'module',
      'module',
    ]);
    pool?.close();
    expect(createConversionPool({})).toBeNull();
    const refusing = {
      Worker: function refuse(): never {
        throw new DOMException('refused', 'SecurityError');
      } as unknown as new (url: URL, options: WorkerOptions) => ConvertWorker,
    };
    expect(createConversionPool(refusing, new URL('https://host.example/worker.js'))).toBeNull();
  });

  it('points at the bundle of the worker next to its own module', () => {
    const view = {
      Worker: class extends TestWorker {
        static url: URL | null = null;
        constructor(url: URL) {
          super();
          (view.Worker as unknown as { url: URL }).url = url;
        }
      },
    };
    createConversionPool(view)?.close();
    expect(String((view.Worker as unknown as { url: URL }).url)).toMatch(
      /\/worker\/kadrion-convert-worker\.js$/,
    );
  });
});

describe('the bundle of the worker (D87.2)', () => {
  it('is the build of today, a module that imports nothing, where the pool looks for it', async () => {
    const written = readFileSync(WORKER_FILE);
    expect(Buffer.from(await bundleWorker()).equals(written)).toBe(true);
    const text = written.toString('utf8');
    expect(text).not.toMatch(/^\s*import\b/m);
    expect(text).not.toMatch(/\bimport\s*\(/);
    expect(text).toContain('packages/renderer-dom/dist/video-orientation.js');
    expect(text).not.toContain('packages/renderer-dom/dist/index.js');
    const fromPool = fileURLToPath(
      new URL(WORKER_MODULE, pathToFileURL(join(repoRoot, 'packages/player/dist/pool.js'))),
    );
    expect(fromPool).toBe(WORKER_FILE);
    // A bundler finds the file only by the literal form of the URL in the built pool.
    const pool = readFileSync(join(repoRoot, 'packages/player/dist/pool.js'), 'utf8');
    expect(pool).toContain(`new URL('${WORKER_MODULE}', import.meta.url)`);
  });
});

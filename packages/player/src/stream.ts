/**
 * The stream of one video node while the film plays (D87.1). One decoder,
 * configured as in D51.4, is fed forward from the last sample that holds an
 * IDR picture before the first frame asked for, in decode order, without a
 * flush between frames; after the source's last sample it flushes once. The
 * frames the clock will ask for next (`upcoming`) are converted as the
 * decoder gives them, at most `ahead` beyond the frame asked for last; every
 * other frame is closed unconverted. The stream holds each converted frame
 * until a later frame is asked for, so a frame shown for several film frames
 * is converted once; the caller copies it before it asks for the next one.
 *
 * The stream starts again by itself at the last IDR sample before a frame
 * that lies behind it (a frame it passed, or one before the frame asked for
 * last) or beyond the next IDR sample it would feed; a seek, a pause, or an
 * update of the document ends it (`close`). It never reads or fills the
 * caches of D51 and D82. Its position is decode state: it selects no frame
 * and changes no pixel, since decoding from an IDR picture is exact (D79.5)
 * and the conversion is the one of D51.4.
 */
import { PlayerError } from './errors.js';
import {
  configOf,
  copyPlanes,
  idrBefore,
  presentationIndices,
  undecodable,
  type DecodedPlanes,
  type VerifiedVideo,
} from './video.js';

/** The part of WebCodecs a stream uses. */
export interface StreamCodecs {
  readonly VideoDecoder: new (init: {
    output: (frame: VideoFrame) => void;
    error: (error: DOMException) => void;
  }) => VideoDecoder;
  readonly EncodedVideoChunk: new (init: EncodedVideoChunkInit) => EncodedVideoChunk;
}

/** How many converted frames a stream holds at most beyond the frame asked for (D87.1). */
export const STREAM_AHEAD = 6;

/** How many samples a stream lets wait in the decoder's queue. */
const QUEUED_SAMPLES = 2;

/**
 * How many frames beyond the wanted ones a stream keeps as planes, not
 * converted: the decoder gives a frame or two past the last wanted one, which
 * the next frame asked for usually wants.
 */
const SPARE_FRAMES = 8;

/** A frame of a stream that ended, or that started again, before the frame came. */
export class StreamSuperseded extends Error {
  constructor() {
    super('The stream ended or started again before the frame came.');
    this.name = 'StreamSuperseded';
  }
}

export interface StreamOptions<T> {
  readonly codecs: StreamCodecs;
  readonly video: VerifiedVideo;
  /**
   * The presentation indices the clock asks for after `index`, in order: the
   * source frames of the next film frames by the rule of D49.5. Only the first
   * `ahead` at or after `index` are converted ahead.
   */
  readonly upcoming: (index: number) => readonly number[];
  /** Converts the planes of a frame; the stream gives each frame's planes once. */
  readonly convert: (planes: DecodedPlanes, index: number) => Promise<T>;
  /** Lets go of a converted frame the stream no longer holds. */
  readonly release: (frame: T) => void;
  readonly ahead?: number;
}

interface Entry<T> {
  readonly index: number;
  readonly promise: Promise<T>;
  resolve(frame: T): void;
  reject(reason: unknown): void;
  /** The converted frame, once it came and while the stream holds it. */
  frame: T | undefined;
  settled: boolean;
  /** Let go before its conversion ended: the frame is released when it comes. */
  dropped: boolean;
}

/** One decoder and its position: what a stream throws away when it starts again. */
interface Run {
  readonly decoder: VideoDecoder;
  readonly samples: AsyncIterator<Uint8Array>;
  /** The decode index of the next sample to feed. */
  next: number;
  /** The presentation index of the last frame the decoder gave, or −1. */
  lastOut: number;
  flushed: boolean;
  /** Wakes the feeding: a frame was asked for, the decoder gave one or took a sample, or the run ended. */
  signal: (() => void) | null;
}

/** The stream of one video node (D87.1). */
export class VideoStream<T> {
  readonly ahead: number;
  private readonly options: StreamOptions<T>;
  private readonly presentation: readonly number[];
  private readonly entries = new Map<number, Entry<T>>();
  /** The planes of frames the decoder gave before they were wanted. */
  private readonly spares = new Map<number, Promise<DecodedPlanes>>();
  private run: Run | null = null;
  /** The frame asked for last, or −1. */
  private current = -1;
  private closed = false;
  private failure: PlayerError | null = null;
  private starts = 0;

  constructor(options: StreamOptions<T>) {
    this.options = options;
    this.ahead = options.ahead ?? STREAM_AHEAD;
    this.presentation = presentationIndices(options.video.track);
  }

  /** How many times the stream started a decoder: a measure for tests, never a pixel. */
  get restarts(): number {
    return this.starts;
  }

  /** The presentation indices of the converted frames the stream holds or awaits. */
  get held(): number[] {
    return [...this.entries.keys()].sort((a, b) => a - b);
  }

  /**
   * The converted frame of presentation index `index`. The stream holds it
   * until a later frame is asked for; the caller copies or shows it before
   * that. Asking for frames in ascending order, as the clock does, decodes
   * every sample once.
   */
  async frame(index: number): Promise<T> {
    if (this.closed) throw new StreamSuperseded();
    if (this.failure !== null) throw this.failure;
    const { video } = this.options;
    const target = video.track.presentation[index];
    if (target === undefined) throw undecodable(video, `there is no frame ${String(index)}.`);
    if (await this.startsAgain(index, target)) {
      if (this.ended()) throw new StreamSuperseded();
      await this.restart(target);
    }
    if (this.ended()) throw new StreamSuperseded();
    this.current = index;
    for (const [at, entry] of this.entries) {
      if (at < index) this.drop(entry);
    }
    for (const at of this.spares.keys()) {
      if (at < index) this.spares.delete(at);
    }
    const wanted = [index, ...this.options.upcoming(index).filter((at) => at > index)];
    for (const at of [...new Set(wanted)].sort((a, b) => a - b).slice(0, this.ahead + 1)) {
      if (this.entries.has(at)) continue;
      const spare = this.spares.get(at);
      if (spare !== undefined) {
        this.spares.delete(at);
        const entry = entryOf<T>(at);
        this.entries.set(at, entry);
        this.convertInto(entry, spare);
      } else if (at > (this.run?.lastOut ?? -1)) {
        this.entries.set(at, entryOf(at));
      }
    }
    const entry = this.entries.get(index);
    if (entry === undefined) throw undecodable(video, `frame ${String(index)} was passed.`);
    this.run?.signal?.();
    return entry.promise;
  }

  /** Whether the stream was closed, read afresh after an `await`. */
  private ended(): boolean {
    return this.closed;
  }

  /** Ends the stream: its decoder is closed, every frame it holds let go. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.endRun();
    for (const entry of this.entries.values()) this.drop(entry);
    this.spares.clear();
  }

  /** Whether frame `index` (decode index `target`) lies behind the stream or beyond its next IDR. */
  private async startsAgain(index: number, target: number): Promise<boolean> {
    const run = this.run;
    if (run === null || run.flushed) return !this.entries.has(index);
    if (this.entries.has(index) || this.spares.has(index)) return false;
    if (index < this.current || index <= run.lastOut) return true;
    if (target < run.next) return false;
    const { start } = await idrBefore(this.options.video, target);
    return start > run.next;
  }

  private async restart(target: number): Promise<void> {
    this.endRun();
    for (const entry of this.entries.values()) this.drop(entry);
    this.spares.clear();
    const { codecs, video } = this.options;
    const { start, first } = await idrBefore(video, target);
    if (this.ended()) return;
    const { track } = video;
    let run: Run | null = null;
    const decoder = new codecs.VideoDecoder({
      output: (frame) => {
        if (run === null || this.run !== run) {
          frame.close();
          return;
        }
        this.output(run, frame);
      },
      error: (error) => {
        if (run !== null && this.run === run) this.fail(error);
      },
    });
    const last = track.samples.length - 1;
    const samples =
      start < last
        ? track.readSamples(start + 1, last)[Symbol.asyncIterator]()
        : (async function* () {})();
    const created: Run = {
      decoder,
      samples,
      next: start + 1,
      lastOut: -1,
      flushed: false,
      signal: null,
    };
    run = created;
    decoder.ondequeue = () => created.signal?.();
    this.run = created;
    this.starts += 1;
    decoder.configure(configOf(track));
    decoder.decode(new codecs.EncodedVideoChunk({ type: 'key', timestamp: start, data: first }));
    void this.feed(run);
  }

  private endRun(): void {
    const run = this.run;
    if (run === null) return;
    this.run = null;
    run.signal?.();
    void run.samples.return?.();
    if (run.decoder.state !== 'closed') run.decoder.close();
  }

  /** Whether an entry waits for a frame the decoder has not given yet. */
  private needs(run: Run): boolean {
    for (const entry of this.entries.values()) {
      if (!entry.settled && entry.index > run.lastOut) return true;
    }
    return false;
  }

  /** Feeds the decoder while a wanted frame has not come, a few samples queued at most. */
  private async feed(run: Run): Promise<void> {
    const { codecs } = this.options;
    try {
      while (this.run === run && !this.closed) {
        if (!this.needs(run) || run.decoder.decodeQueueSize >= QUEUED_SAMPLES) {
          await new Promise<void>((resolve) => {
            run.signal = resolve;
          });
          run.signal = null;
          continue;
        }
        const sample = await run.samples.next();
        if (this.run !== run) return;
        if (sample.done === true) {
          await run.decoder.flush();
          run.flushed = true;
          if (this.run !== run) return;
          for (const entry of this.entries.values()) {
            if (!entry.settled && entry.index > run.lastOut) {
              this.settle(
                entry,
                undecodable(
                  this.options.video,
                  `the decoder gave no frame ${String(entry.index)}.`,
                ),
              );
            }
          }
          return;
        }
        run.decoder.decode(
          new codecs.EncodedVideoChunk({ type: 'delta', timestamp: run.next, data: sample.value }),
        );
        run.next += 1;
      }
    } catch (reason) {
      if (this.run === run && !this.closed) this.fail(reason);
    }
  }

  private output(run: Run, frame: VideoFrame): void {
    const at = this.presentation[frame.timestamp] ?? -1;
    run.lastOut = Math.max(run.lastOut, at);
    run.signal?.();
    const entry = this.entries.get(at);
    const planes = (): Promise<DecodedPlanes> =>
      copyPlanes(this.options.video, frame, at).finally(() => {
        frame.close();
      });
    if (entry !== undefined && !entry.settled && !entry.dropped) {
      this.convertInto(entry, planes());
    } else if (entry === undefined && at > this.current && this.spares.size < SPARE_FRAMES) {
      const spare = planes();
      // A spare nobody wants fails silently; a wanted one fails its frame.
      spare.catch(() => undefined);
      this.spares.set(at, spare);
    } else {
      frame.close();
    }
  }

  private convertInto(entry: Entry<T>, planes: Promise<DecodedPlanes>): void {
    const { video, convert } = this.options;
    const at = entry.index;
    void planes
      .then((given) => convert(given, at))
      .then(
        (converted) => {
          this.settle(entry, null, converted);
        },
        (reason: unknown) => {
          this.settle(
            entry,
            reason instanceof PlayerError || reason instanceof StreamSuperseded
              ? reason
              : undecodable(video, `frame ${String(at)} cannot be converted: ${messageOf(reason)}`),
          );
        },
      );
  }

  private settle(entry: Entry<T>, reason: unknown, frame?: T): void {
    if (entry.settled) {
      if (frame !== undefined) this.options.release(frame);
      return;
    }
    entry.settled = true;
    if (reason !== null) {
      entry.reject(reason);
      return;
    }
    if (entry.dropped || this.closed || this.entries.get(entry.index) !== entry) {
      if (frame !== undefined) this.options.release(frame);
      entry.reject(new StreamSuperseded());
      return;
    }
    entry.frame = frame;
    entry.resolve(frame as T);
  }

  private drop(entry: Entry<T>): void {
    if (this.entries.get(entry.index) === entry) this.entries.delete(entry.index);
    entry.dropped = true;
    if (entry.frame !== undefined) {
      this.options.release(entry.frame);
      entry.frame = undefined;
    } else if (!entry.settled && (this.run === null || entry.index > this.run.lastOut)) {
      // No conversion of it is under way: nothing will come for it.
      entry.settled = true;
      entry.reject(new StreamSuperseded());
    }
  }

  private fail(reason: unknown): void {
    this.failure =
      reason instanceof PlayerError ? reason : undecodable(this.options.video, messageOf(reason));
    this.endRun();
    for (const entry of this.entries.values()) {
      if (!entry.settled) {
        entry.settled = true;
        entry.reject(this.failure);
      }
    }
  }
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function entryOf<T>(index: number): Entry<T> {
  let resolve!: (frame: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, failed) => {
    resolve = done;
    reject = failed;
  });
  // A frame nobody awaits any more is no unhandled rejection.
  promise.catch(() => undefined);
  return { index, promise, resolve, reject, frame: undefined, settled: false, dropped: false };
}

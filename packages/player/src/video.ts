/**
 * Video in the Player (D51). A video asset is delivered by the host as a
 * `Blob` (or as bytes), verified against its `contentHash` with an incremental
 * SHA-256 before anything reads it, and read by the container reader of
 * `container.ts` (Mediabunny, D79). Its media facts give the source duration of D50.3, and every
 * sampled source range is checked against it before the first frame (D49.6).
 * For each frame the Player asks for, the source frame of every active video
 * node is chosen by the rule of `@kadrion/schema` (D49.5), decoded by the
 * browser's own decoder (WebCodecs) in the host window, never in the render
 * page, converted to RGB exactly as the Producer's FFmpeg converts it
 * (`yuv.ts`), turned as its container's display matrix asks, by the same
 * function as the Producer (D81), and handed to the page as a PNG (D50.4). Decoding
 * starts at the last IDR sample before the frame every time (D79.5), so the
 * pixels of a frame do not depend on the frames shown before it; the planes of
 * every sampled frame of that run are kept in a cache bounded by bytes, so
 * frames shown backwards decode each group of pictures once (D82.4).
 */
import {
  holdsIdr,
  mediaTypeFits,
  orientedSize,
  orientRgb,
  type AssetRequest,
} from '@kadrion/renderer-dom';
import {
  placedVideos,
  sampledSourceRange,
  sourceDurationUs,
  sourceFrameIndex,
  sourceRangeFits,
  sourceTimeUs,
  videoSceneTimeUs,
  type SceneNode,
  type ValidatedComposition,
  type VideoNode,
} from '@kadrion/schema';

import { readVideoTrack, type VideoTrack } from './container.js';
import { PlayerError, withAsset } from './errors.js';
import { Sha256 } from './sha256.js';
import { yuv420ToRgb } from './yuv.js';

/** A video delivered as a `Blob`: the host's file, never read whole into memory (D51.2). */
export interface PlayerVideoBlob {
  readonly blob: Blob;
  readonly mediaType: string;
}

/** What the Player knows of a verified video's bytes: the media facts of D49.6. */
export interface PlayerVideoFacts {
  readonly type: 'video';
  /** The source duration of D50.3, in microseconds. */
  readonly durationUs: number;
  /** The size of the picture as it is shown, after the rotation of its container (D81). */
  readonly width: number;
  readonly height: number;
  /** The number of frames of the first video track. */
  readonly frames: number;
}

/** A video whose bytes have their `contentHash` (D14), not read yet. */
export interface VerifiedBlob {
  readonly id: string;
  readonly contentHash: string;
  readonly mediaType: string;
  readonly blob: Blob;
}

/** A verified video that was read: its track and its facts. */
export interface VerifiedVideo extends VerifiedBlob {
  readonly track: VideoTrack;
  readonly facts: PlayerVideoFacts;
}

/** The frame of one video node, as the page receives it (D50.4). */
export interface VideoFrameMessage {
  readonly nodeId: string;
  readonly mediaType: 'image/png';
  readonly bytes: ArrayBuffer;
}

/** How many bytes of a `Blob` are hashed at once. */
const HASH_CHUNK = 4 * 1024 * 1024;

/** A `Blob` of any realm: a resolver may run in another window than the Player. */
export function isBlob(value: unknown): value is Blob {
  const tag = Object.prototype.toString.call(value);
  return tag === '[object Blob]' || tag === '[object File]';
}

function isBytes(value: unknown): value is Uint8Array {
  return Object.prototype.toString.call(value) === '[object Uint8Array]';
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/** The SHA-256 of a `Blob`, chunk by chunk (D51.2). */
export async function blobSha256(blob: Blob): Promise<string> {
  const hash = new Sha256();
  for (let offset = 0; offset < blob.size; offset += HASH_CHUNK) {
    hash.update(new Uint8Array(await blob.slice(offset, offset + HASH_CHUNK).arrayBuffer()));
  }
  return hash.digest();
}

/** The Blob constructor of the Player's window, or of this realm. */
type BlobConstructor = new (parts: BlobPart[], options?: BlobPropertyBag) => Blob;

/**
 * Asks the resolver for one video asset, once, with a frozen request, accepts
 * a `Blob` or bytes with a `video/…` media type, and verifies the SHA-256. A
 * missing asset, a failing resolver, anything else, or a mismatch is a typed
 * error. Nothing of the file is read but its hash.
 */
export async function verifyVideo(
  asset: AssetRequest,
  resolve: (request: AssetRequest) => unknown,
  BlobOf: BlobConstructor,
): Promise<VerifiedBlob> {
  const { id, type, contentHash } = asset;
  let given: unknown;
  try {
    given = await resolve(Object.freeze({ id, type, contentHash }));
  } catch (reason) {
    throw new PlayerError('asset-missing', `The resolver failed for "${id}": ${messageOf(reason)}`);
  }
  if (given === null || given === undefined) {
    throw new PlayerError('asset-missing', `The host has no bytes for "${id}".`);
  }
  const { blob, bytes, mediaType } = given as Partial<Record<string, unknown>>;
  const delivered =
    isBlob(blob) && bytes === undefined
      ? blob
      : isBytes(bytes) && blob === undefined
        ? bytes
        : null;
  if (delivered === null || typeof mediaType !== 'string' || !mediaTypeFits('video', mediaType)) {
    throw new PlayerError(
      'asset-invalid',
      `The video "${id}" needs a Blob or bytes and a media type of the form video/….`,
    );
  }
  // Bytes become a Blob of their own copy; a Blob cannot change after it was made.
  const source = isBlob(delivered)
    ? delivered
    : new BlobOf([Uint8Array.prototype.slice.call(delivered)]);
  const actual = await blobSha256(source);
  if (actual !== contentHash) {
    throw new PlayerError(
      'asset-hash-mismatch',
      `The bytes of "${id}" have ${actual}, not ${contentHash}.`,
    );
  }
  return { id, contentHash, mediaType, blob: source };
}

/**
 * Reads the primary video track of a verified video (D51.3, D79) and its
 * facts; a file the reader refuses is `video-unsupported`, every reason of
 * D79.4 in its details.
 */
export async function readVideo(verified: VerifiedBlob): Promise<VerifiedVideo> {
  const { id } = verified;
  let track: VideoTrack;
  try {
    track = await readVideoTrack(verified.blob);
  } catch (reason) {
    if (reason instanceof PlayerError) {
      throw new PlayerError(reason.code, `The video "${id}": ${reason.message}`, reason.details);
    }
    throw new PlayerError(
      'video-unsupported',
      `The video "${id}" cannot be read: ${messageOf(reason)}`,
    );
  }
  const shown = orientedSize(track.width, track.height, track.orientation);
  return {
    ...verified,
    track,
    facts: Object.freeze({
      type: 'video',
      durationUs: sourceDurationUs(track.timestamps, track.lastDuration, track.timeBase),
      width: shown.width,
      height: shown.height,
      frames: track.timestamps.length,
    }),
  };
}

/** The video nodes of a composition, group children included, in document order. */
export function videoNodes(composition: ValidatedComposition): VideoNode[] {
  const found: VideoNode[] = [];
  const visit = (node: SceneNode | VideoNode): void => {
    if (node.type === 'video') found.push(node);
    else if (node.type === 'group') node.children.forEach(visit);
  };
  for (const scene of composition.scenes) scene.nodes.forEach(visit);
  return found;
}

/**
 * Every sampled source range of the document inside its video (D49.6), before
 * the first frame: `source-range-exceeded` names the node, the range, and the
 * duration, as the Producer does (D50.5).
 */
export function checkSourceRanges(
  composition: ValidatedComposition,
  videos: ReadonlyMap<string, VerifiedVideo>,
): void {
  const hashes = new Map(composition.assets.map((asset) => [asset.id, asset.contentHash]));
  for (const { node, scene } of placedVideos(composition)) {
    const video = videos.get(hashes.get(node.assetId) ?? '');
    const contentHash = hashes.get(node.assetId) ?? '';
    if (video === undefined) {
      throw new PlayerError('asset-missing', `The video "${node.assetId}" was not resolved.`, [], {
        id: node.assetId,
        contentHash,
      });
    }
    const duration = video.facts.durationUs;
    // The lifetime cut to its scene (D49.6, D54.3).
    const range = sampledSourceRange(node, scene.durationUs);
    if (range !== null && !sourceRangeFits(range, duration)) {
      throw new PlayerError(
        'source-range-exceeded',
        `${node.id}: samples ${String(range.startUs)} to ${String(range.startUs + range.durationUs)} µs of a source of ${String(duration)} µs (D49.6).`,
        [],
        { id: node.assetId, contentHash },
      );
    }
  }
}

// --- decoding in the host window ------------------------------------------

/** The part of WebCodecs the Player uses, from the host window (D51.4). */
interface Codecs {
  readonly VideoDecoder: {
    new (init: {
      output: (frame: VideoFrame) => void;
      error: (error: DOMException) => void;
    }): VideoDecoder;
    isConfigSupported(config: VideoDecoderConfig): Promise<VideoDecoderSupport>;
  };
  readonly EncodedVideoChunk: new (init: EncodedVideoChunkInit) => EncodedVideoChunk;
  readonly CompressionStream: new (format: CompressionFormat) => CompressionStream;
}

function codecsOf(view: Window): Codecs {
  const scope = view as unknown as Partial<Codecs>;
  const global = globalThis as unknown as Partial<Codecs>;
  const { VideoDecoder, EncodedVideoChunk } = scope;
  const CompressionStream = scope.CompressionStream ?? global.CompressionStream;
  if (VideoDecoder === undefined || EncodedVideoChunk === undefined) {
    throw new PlayerError(
      'video-unsupported',
      'The host window has no WebCodecs decoder; the Player needs one in a secure context (D51.4).',
    );
  }
  if (CompressionStream === undefined) {
    throw new PlayerError('video-unsupported', 'The host window has no CompressionStream (D51.4).');
  }
  return { VideoDecoder, EncodedVideoChunk, CompressionStream };
}

/** The decoder configuration of a track: software decoding, so pixels never depend on a GPU. */
function configOf(track: VideoTrack): VideoDecoderConfig {
  return {
    codec: track.codec,
    description: track.description,
    codedWidth: track.width,
    codedHeight: track.height,
    hardwareAcceleration: 'prefer-software',
  };
}

/** Whether the host window decodes every video, before the first frame (D51.4). */
export async function checkDecodable(view: Window, videos: Iterable<VerifiedVideo>): Promise<void> {
  const codecs = codecsOf(view);
  for (const video of videos) {
    let supported: boolean;
    try {
      supported =
        (await codecs.VideoDecoder.isConfigSupported(configOf(video.track))).supported === true;
    } catch {
      supported = false;
    }
    if (!supported) {
      throw new PlayerError(
        'video-unsupported',
        `The browser cannot decode ${video.track.codec} at ${String(video.track.width)}x${String(video.track.height)} (${video.contentHash}).`,
        [],
        { id: video.id, contentHash: video.contentHash },
      );
    }
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(parts: readonly Uint8Array[]): number {
  let crc = 0xffffffff;
  for (const part of parts) {
    for (const byte of part) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflate(codecs: Codecs, bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes.slice()])
    .stream()
    .pipeThrough(new codecs.CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A PNG of packed RGB: one IHDR, one IDAT of filter-0 rows, zlib by the browser. */
export async function encodePng(
  codecs: Pick<Codecs, 'CompressionStream'>,
  width: number,
  height: number,
  rgb: Uint8Array,
): Promise<Uint8Array> {
  const stride = width * 3;
  const rows = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    rows.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const data = await deflate(codecs as Codecs, rows);
  const chunk = (type: string, body: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + body.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, body.length);
    for (let at = 0; at < 4; at += 1) out[4 + at] = type.charCodeAt(at);
    out.set(body, 8);
    view.setUint32(8 + body.length, crc32([out.subarray(4, 8 + body.length)]));
    return out;
  };
  const header = new Uint8Array(13);
  const head = new DataView(header.buffer);
  head.setUint32(0, width);
  head.setUint32(4, height);
  header.set([8, 2, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', data),
    chunk('IEND', new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    png.set(part, at);
    at += part.length;
  }
  return png;
}

function undecodable(video: VerifiedVideo, message: string): PlayerError {
  return new PlayerError('video-undecodable', `The video ${video.contentHash}: ${message}`);
}

/**
 * The decode index of the last sync sample at or before `target` whose bytes
 * hold an IDR picture (D79.5), and those bytes; a sync sample that is only a
 * recovery point is passed over for the one before it.
 */
async function idrBefore(
  video: VerifiedVideo,
  target: number,
): Promise<{ start: number; first: Uint8Array }> {
  const { track } = video;
  for (let start = target; start >= 0; start -= 1) {
    if (track.samples[start]?.sync !== true) continue;
    for await (const bytes of track.readSamples(start, start)) {
      if (holdsIdr(track.description, bytes)) return { start, first: bytes };
    }
  }
  throw undecodable(video, `no IDR picture precedes sample ${String(target)}.`);
}

/** The decoded planes of one frame (I420), as the decoder laid them out (D82.4). */
export interface DecodedPlanes {
  readonly data: Uint8Array;
  readonly layout: readonly { readonly offset: number; readonly stride: number }[];
}

/** For decode index `d` of a track, the presentation index of its frame. */
const presentationOf = new WeakMap<VideoTrack, readonly number[]>();

function presentationIndices(track: VideoTrack): readonly number[] {
  const known = presentationOf.get(track);
  if (known !== undefined) return known;
  const indices = new Array<number>(track.presentation.length).fill(-1);
  track.presentation.forEach((decode, presentation) => {
    indices[decode] = presentation;
  });
  presentationOf.set(track, indices);
  return indices;
}

/**
 * Decodes the run of frame `index` (D51.4, D82.4): a new decoder, every
 * sample from the IDR sample before it in decode order up to its own sample,
 * then a flush. The planes of every frame of the run that `wanted` names, the
 * frame `index` always, are copied as the decoder gives them, and every frame
 * is closed at once; while they hold more than `budget` bytes, the frames of
 * the lowest presentation index other than `index` are let go, so a run longer
 * than the budget is decoded again in parts. The planes are of the coded size,
 * before the orientation of D81.
 */
async function decodeRun(
  codecs: Codecs,
  video: VerifiedVideo,
  index: number,
  wanted: (index: number) => boolean,
  budget: number,
): Promise<Map<number, DecodedPlanes>> {
  const { track } = video;
  const target = track.presentation[index];
  if (target === undefined) throw undecodable(video, `there is no frame ${String(index)}.`);
  const presentation = presentationIndices(track);
  const kept = new Map<number, DecodedPlanes>();
  const copies: Promise<void>[] = [];
  let bytes = 0;
  let failure: unknown = null;
  const keep = async (frame: VideoFrame, at: number): Promise<void> => {
    try {
      const rect = frame.visibleRect;
      if (rect === null || rect.width !== track.width || rect.height !== track.height) {
        throw undecodable(
          video,
          `frame ${String(at)} is not ${String(track.width)}x${String(track.height)}.`,
        );
      }
      if (frame.format !== 'I420') {
        throw undecodable(video, `frame ${String(at)} is ${String(frame.format)}, not I420.`);
      }
      // The decoded planes, which are FFmpeg's to the bit (H.264 decoding is exact), kept
      // for FFmpeg's own conversion of them (D51.4): never the browser's colour conversion.
      const data = new Uint8Array(frame.allocationSize({ rect }));
      const layout = await frame.copyTo(data, { rect });
      if (layout.length < 3) throw undecodable(video, `frame ${String(at)} has no three planes.`);
      kept.set(at, { data, layout: layout.map(({ offset, stride }) => ({ offset, stride })) });
      bytes += data.length;
      while (bytes > budget) {
        let lowest: number | null = null;
        for (const key of kept.keys()) {
          if (key !== index && (lowest === null || key < lowest)) lowest = key;
        }
        if (lowest === null) break;
        bytes -= kept.get(lowest)?.data.length ?? 0;
        kept.delete(lowest);
      }
    } catch (reason) {
      failure ??=
        reason instanceof PlayerError
          ? reason
          : undecodable(video, `frame ${String(at)} cannot be read: ${messageOf(reason)}`);
    } finally {
      frame.close();
    }
  };
  const decoder = new codecs.VideoDecoder({
    output: (frame) => {
      const at = presentation[frame.timestamp] ?? -1;
      if (at !== index && (at < 0 || !wanted(at))) {
        frame.close();
        return;
      }
      copies.push(keep(frame, at));
    },
    error: (error) => {
      failure = error;
    },
  });
  try {
    const { start, first } = await idrBefore(video, target);
    decoder.configure(configOf(track));
    decoder.decode(new codecs.EncodedVideoChunk({ type: 'key', timestamp: start, data: first }));
    if (start < target) {
      let at = start + 1;
      for await (const data of track.readSamples(start + 1, target)) {
        decoder.decode(new codecs.EncodedVideoChunk({ type: 'delta', timestamp: at, data }));
        at += 1;
      }
    }
    await decoder.flush();
  } catch (reason) {
    failure ??= reason;
  } finally {
    if (decoder.state !== 'closed') decoder.close();
  }
  await Promise.all(copies);
  if (failure !== null || !kept.has(index)) {
    if (failure instanceof PlayerError) throw failure;
    throw undecodable(
      video,
      failure === null ? `the decoder gave no frame ${String(index)}.` : messageOf(failure),
    );
  }
  return kept;
}

/** The packed RGB of decoded planes, by FFmpeg's own conversion (D51.4), before D81. */
function rgbOf(video: VerifiedVideo, planes: DecodedPlanes): Uint8Array {
  const { track } = video;
  const [y, u, v] = planes.layout;
  if (y === undefined || u === undefined || v === undefined) {
    throw undecodable(video, 'a frame has no three planes.');
  }
  const { data } = planes;
  const chromaHeight = (track.height + 1) >> 1;
  return yuv420ToRgb(
    {
      width: track.width,
      height: track.height,
      y: data.subarray(y.offset, y.offset + y.stride * track.height),
      yStride: y.stride,
      u: data.subarray(u.offset, u.offset + u.stride * chromaHeight),
      uStride: u.stride,
      v: data.subarray(v.offset, v.offset + v.stride * chromaHeight),
      vStride: v.stride,
    },
    track.colour.matrix,
    track.colour.fullRange,
  );
}

/** The bytes the run cache of a Player holds at most (D82.4): 256 MiB. */
export const RUN_CACHE_BYTES = 256 * 1024 * 1024;

/** The frames of one decode run, by presentation index, and their size. */
interface Run {
  readonly video: string;
  readonly frames: ReadonlyMap<number, DecodedPlanes>;
  readonly bytes: number;
}

/**
 * The cache of decode runs (D82.4): the planes of the frames of each run, by
 * video and presentation index, within a budget of bytes; the run used least
 * recently is let go first. A frame found here is converted and encoded as a
 * frame decoded afresh; decoding is exact, so its PNG is the same.
 */
export class RunCache {
  readonly budget: number;
  /** The runs, the one used least recently first. */
  private readonly runs = new Map<number, Run>();
  /** The run that holds each frame, by `${video} ${index}`. */
  private readonly frames = new Map<string, number>();
  private next = 0;
  private held = 0;

  constructor(budget: number = RUN_CACHE_BYTES) {
    this.budget = budget;
  }

  /** The bytes of planes held now, never above the budget. */
  get bytes(): number {
    return this.held;
  }

  /** The planes of frame `index` of a video, or `undefined`; its run becomes the most recent. */
  get(video: string, index: number): DecodedPlanes | undefined {
    const id = this.frames.get(`${video} ${String(index)}`);
    const run = id === undefined ? undefined : this.runs.get(id);
    if (id === undefined || run === undefined) return undefined;
    this.runs.delete(id);
    this.runs.set(id, run);
    return run.frames.get(index);
  }

  /**
   * Keeps the frames of a run that no other run holds (decoding is exact, so a
   * frame decoded twice is the same), letting go of the runs used least
   * recently until they fit.
   */
  put(video: string, decoded: ReadonlyMap<number, DecodedPlanes>): void {
    const frames = new Map<number, DecodedPlanes>();
    let bytes = 0;
    for (const [index, planes] of decoded) {
      if (this.frames.has(`${video} ${String(index)}`)) continue;
      frames.set(index, planes);
      bytes += planes.data.length;
    }
    if (frames.size === 0 || bytes > this.budget) return;
    for (const [id, run] of this.runs) {
      if (this.held + bytes <= this.budget) break;
      this.drop(id, run);
    }
    const id = this.next;
    this.next += 1;
    for (const index of frames.keys()) this.frames.set(`${video} ${String(index)}`, id);
    this.runs.set(id, { video, frames, bytes });
    this.held += bytes;
  }

  private drop(id: number, run: Run): void {
    this.runs.delete(id);
    this.held -= run.bytes;
    for (const index of run.frames.keys()) {
      const key = `${run.video} ${String(index)}`;
      if (this.frames.get(key) === id) this.frames.delete(key);
    }
  }
}

/** The source frames of a document's video nodes, one instant at a time (D51.4). */
export interface VideoFrameSource {
  framesAt(composition: ValidatedComposition, timeUs: number): Promise<VideoFrameMessage[]>;
}

/** How many PNG frames of each video are kept, so that a repeated frame is not decoded twice. */
const KEPT_FRAMES = 4;

/**
 * The frames of each video that a composition samples, as ranges of
 * presentation indices: the sampled source range of every node (D49.6), cut
 * to its scene. A run keeps only these frames (D82.4).
 */
function sampledFrames(
  composition: ValidatedComposition,
  videos: ReadonlyMap<string, VerifiedVideo>,
): Map<string, (readonly [number, number])[]> {
  const hashes = new Map(composition.assets.map((asset) => [asset.id, asset.contentHash]));
  const ranges = new Map<string, (readonly [number, number])[]>();
  for (const { node, scene } of placedVideos(composition)) {
    const contentHash = hashes.get(node.assetId) ?? '';
    const video = videos.get(contentHash);
    const range = sampledSourceRange(node, scene.durationUs);
    if (video === undefined || range === null || range.durationUs <= 0) continue;
    const { timestamps, timeBase } = video.track;
    const first = sourceFrameIndex(timestamps, timeBase, range.startUs);
    const last = sourceFrameIndex(timestamps, timeBase, range.startUs + range.durationUs - 1);
    const list = ranges.get(contentHash) ?? [];
    list.push([first, last]);
    ranges.set(contentHash, list);
  }
  return ranges;
}

/**
 * The decoders of the host window over the verified videos. It keeps the
 * planes of the frames of each decode run in `runs`, the Player's cache
 * bounded by bytes (D82.4), which outlives a load or an update, and the PNG of
 * the last few frames of each video by index; a frame converted from the
 * cache, or decoded again, gives the same bytes, so neither cache changes a
 * pixel.
 */
export function createVideoFrameSource(
  view: Window,
  videos: ReadonlyMap<string, VerifiedVideo>,
  runs: RunCache,
): VideoFrameSource {
  const kept = new Map<string, Map<number, Uint8Array>>();
  const sampled = new WeakMap<ValidatedComposition, Map<string, (readonly [number, number])[]>>();
  const pngOf = async (
    codecs: Codecs,
    video: VerifiedVideo,
    index: number,
    wanted: (index: number) => boolean,
  ): Promise<Uint8Array> => {
    const frames = kept.get(video.contentHash) ?? new Map<number, Uint8Array>();
    kept.set(video.contentHash, frames);
    const found = frames.get(index);
    if (found !== undefined) return found;
    let planes = runs.get(video.contentHash, index);
    if (planes === undefined) {
      const run = await decodeRun(codecs, video, index, wanted, runs.budget);
      planes = run.get(index);
      runs.put(video.contentHash, run);
    }
    if (planes === undefined)
      throw undecodable(video, `the decoder gave no frame ${String(index)}.`);
    const { track } = video;
    // After the conversion of colour, as the Producer turns its frames (D81).
    const rgb = orientRgb(rgbOf(video, planes), track.width, track.height, track.orientation);
    const shown = orientedSize(track.width, track.height, track.orientation);
    const png = await encodePng(codecs, shown.width, shown.height, rgb);
    frames.set(index, png);
    if (frames.size > KEPT_FRAMES) frames.delete(frames.keys().next().value as number);
    return png;
  };
  return {
    async framesAt(composition, timeUs) {
      // Each video at the time of its scene, while its scene is evaluated (D54.3).
      const nodes = placedVideos(composition).flatMap((placed) => {
        const sceneTimeUs = videoSceneTimeUs(placed, timeUs);
        return sceneTimeUs === null ? [] : [{ node: placed.node, sceneTimeUs }];
      });
      if (nodes.length === 0) return [];
      const codecs = codecsOf(view);
      const hashes = new Map(composition.assets.map((asset) => [asset.id, asset.contentHash]));
      const ranges = sampled.get(composition) ?? sampledFrames(composition, videos);
      sampled.set(composition, ranges);
      const frames: VideoFrameMessage[] = [];
      for (const { node, sceneTimeUs } of nodes) {
        const contentHash = hashes.get(node.assetId) ?? '';
        const video = videos.get(contentHash);
        const asset = { id: node.assetId, contentHash };
        if (video === undefined) {
          throw new PlayerError(
            'asset-missing',
            `The video "${node.assetId}" was not resolved.`,
            [],
            asset,
          );
        }
        const { timestamps, timeBase } = video.track;
        const index = sourceFrameIndex(timestamps, timeBase, sourceTimeUs(node, sceneTimeUs));
        const own = ranges.get(contentHash) ?? [];
        const wanted = (at: number): boolean =>
          own.some(([first, last]) => at >= first && at <= last);
        let png: Uint8Array;
        try {
          png = await pngOf(codecs, video, index, wanted);
        } catch (reason) {
          throw reason instanceof PlayerError ? withAsset(reason, asset) : reason;
        }
        frames.push({ nodeId: node.id, mediaType: 'image/png', bytes: png.slice().buffer });
      }
      return frames;
    },
  };
}

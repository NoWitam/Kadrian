/**
 * Video in the Player (D51). A video asset is delivered by the host as a
 * `Blob` (or as bytes), verified against its `contentHash` with an incremental
 * SHA-256 before anything reads it, and read by the container reader of
 * `mp4.ts`. Its media facts give the source duration of D50.3, and every
 * sampled source range is checked against it before the first frame (D49.6).
 * For each frame the Player asks for, the source frame of every active video
 * node is chosen by the rule of `@kadrion/schema` (D49.5), decoded by the
 * browser's own decoder (WebCodecs) in the host window, never in the render
 * page, converted to RGB exactly as the Producer's FFmpeg converts it
 * (`yuv.ts`), and handed to the page as a PNG (D50.4). Decoding
 * starts at the sync sample before the frame every time, so the pixels of a
 * frame do not depend on the frames shown before it.
 */
import { mediaTypeFits, type AssetRequest } from '@kadrion/renderer-dom';
import {
  sampledSourceRange,
  sourceDurationUs,
  sourceFrameIndex,
  sourceRangeFits,
  sourceTimeUs,
  type SceneNode,
  type ValidatedComposition,
  type VideoNode,
} from '@kadrion/schema';

import { PlayerError } from './errors.js';
import { readMp4VideoTrack, type ByteSource, type Mp4VideoTrack } from './mp4.js';
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
  readonly track: Mp4VideoTrack;
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

function blobSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    read: async (offset, length) =>
      new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer()),
  };
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
 * Reads the first video track of a verified video (D51.3) and its facts; a
 * file the reader refuses is `video-unsupported`.
 */
export async function readVideo(verified: VerifiedBlob): Promise<VerifiedVideo> {
  const { id } = verified;
  let track: Mp4VideoTrack;
  try {
    track = await readMp4VideoTrack(blobSource(verified.blob));
  } catch (reason) {
    if (reason instanceof PlayerError) {
      throw new PlayerError(reason.code, `The video "${id}": ${reason.message}`);
    }
    throw new PlayerError(
      'video-unsupported',
      `The video "${id}" cannot be read: ${messageOf(reason)}`,
    );
  }
  return {
    ...verified,
    track,
    facts: Object.freeze({
      type: 'video',
      durationUs: sourceDurationUs(track.timestamps, track.lastDuration, track.timeBase),
      width: track.width,
      height: track.height,
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

/** Whether a lifetime contains `timeUs` (D42.2), as the runtime evaluates it. */
function isActive(node: VideoNode, timeUs: number): boolean {
  return timeUs >= node.startUs && timeUs - node.startUs < node.durationUs;
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
  for (const node of videoNodes(composition)) {
    const video = videos.get(hashes.get(node.assetId) ?? '');
    if (video === undefined) {
      throw new PlayerError('asset-missing', `The video "${node.assetId}" was not resolved.`);
    }
    const duration = video.facts.durationUs;
    const range = sampledSourceRange(node, composition.durationUs);
    if (range !== null && !sourceRangeFits(range, duration)) {
      throw new PlayerError(
        'source-range-exceeded',
        `${node.id}: samples ${String(range.startUs)} to ${String(range.startUs + range.durationUs)} µs of a source of ${String(duration)} µs (D49.6).`,
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
function configOf(track: Mp4VideoTrack): VideoDecoderConfig {
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
 * Decodes presentation frame `index` of a video to packed RGB (D51.4): a new
 * decoder, every sample from the sync sample before it in decode order up to
 * its own sample, then a flush. The output whose timestamp names its sample is
 * kept; every other output is closed at once.
 */
async function decodeRgb(codecs: Codecs, video: VerifiedVideo, index: number): Promise<Uint8Array> {
  const { track } = video;
  const target = track.presentation[index];
  if (target === undefined) throw undecodable(video, `there is no frame ${String(index)}.`);
  let start = target;
  while (start > 0 && track.samples[start]?.sync !== true) start -= 1;
  let kept: VideoFrame | null = null;
  let failure: unknown = null;
  const decoder = new codecs.VideoDecoder({
    output: (frame) => {
      if (kept === null && frame.timestamp === target) kept = frame;
      else frame.close();
    },
    error: (error) => {
      failure = error;
    },
  });
  try {
    decoder.configure(configOf(track));
    for (let at = start; at <= target; at += 1) {
      const sample = track.samples[at];
      if (sample === undefined) break;
      const data = new Uint8Array(
        await video.blob.slice(sample.offset, sample.offset + sample.size).arrayBuffer(),
      );
      decoder.decode(
        new codecs.EncodedVideoChunk({ type: at === start ? 'key' : 'delta', timestamp: at, data }),
      );
    }
    await decoder.flush();
  } catch (reason) {
    failure ??= reason;
  } finally {
    if (decoder.state !== 'closed') decoder.close();
  }
  const frame = kept as VideoFrame | null;
  if (failure !== null || frame === null) {
    frame?.close();
    throw undecodable(
      video,
      failure === null ? `the decoder gave no frame ${String(index)}.` : messageOf(failure),
    );
  }
  try {
    const rect = frame.visibleRect;
    if (rect === null || rect.width !== track.width || rect.height !== track.height) {
      throw undecodable(
        video,
        `frame ${String(index)} is not ${String(track.width)}x${String(track.height)}.`,
      );
    }
    if (frame.format !== 'I420') {
      throw undecodable(video, `frame ${String(index)} is ${String(frame.format)}, not I420.`);
    }
    // The decoded planes, which are FFmpeg's to the bit (H.264 decoding is exact), and
    // FFmpeg's own conversion of them (D51.4): never the browser's colour conversion.
    const planes = new Uint8Array(frame.allocationSize({ rect }));
    const layout = await frame.copyTo(planes, { rect });
    const [y, u, v] = layout;
    if (y === undefined || u === undefined || v === undefined) {
      throw undecodable(video, `frame ${String(index)} has no three planes.`);
    }
    const chromaHeight = (track.height + 1) >> 1;
    return yuv420ToRgb(
      {
        width: track.width,
        height: track.height,
        y: planes.subarray(y.offset, y.offset + y.stride * track.height),
        yStride: y.stride,
        u: planes.subarray(u.offset, u.offset + u.stride * chromaHeight),
        uStride: u.stride,
        v: planes.subarray(v.offset, v.offset + v.stride * chromaHeight),
        vStride: v.stride,
      },
      track.colour.matrix,
      track.colour.fullRange,
    );
  } catch (reason) {
    if (reason instanceof PlayerError) throw reason;
    throw undecodable(video, `frame ${String(index)} cannot be read: ${messageOf(reason)}`);
  } finally {
    frame.close();
  }
}

/** The source frames of a document's video nodes, one instant at a time (D51.4). */
export interface VideoFrameSource {
  framesAt(composition: ValidatedComposition, timeUs: number): Promise<VideoFrameMessage[]>;
}

/** How many PNG frames of each video are kept, so that a repeated frame is not decoded twice. */
const KEPT_FRAMES = 4;

/**
 * The decoders of the host window over the verified videos. It keeps the PNG
 * of the last few frames of each video by index; a frame decoded again gives
 * the same bytes, so the cache changes no pixel.
 */
export function createVideoFrameSource(
  view: Window,
  videos: ReadonlyMap<string, VerifiedVideo>,
): VideoFrameSource {
  const kept = new Map<string, Map<number, Uint8Array>>();
  const pngOf = async (
    codecs: Codecs,
    video: VerifiedVideo,
    index: number,
  ): Promise<Uint8Array> => {
    const frames = kept.get(video.contentHash) ?? new Map<number, Uint8Array>();
    kept.set(video.contentHash, frames);
    const found = frames.get(index);
    if (found !== undefined) return found;
    const rgb = await decodeRgb(codecs, video, index);
    const png = await encodePng(codecs, video.track.width, video.track.height, rgb);
    frames.set(index, png);
    if (frames.size > KEPT_FRAMES) frames.delete(frames.keys().next().value as number);
    return png;
  };
  return {
    async framesAt(composition, timeUs) {
      const nodes = videoNodes(composition).filter((node) => isActive(node, timeUs));
      if (nodes.length === 0) return [];
      const codecs = codecsOf(view);
      const hashes = new Map(composition.assets.map((asset) => [asset.id, asset.contentHash]));
      const frames: VideoFrameMessage[] = [];
      for (const node of nodes) {
        const video = videos.get(hashes.get(node.assetId) ?? '');
        if (video === undefined) {
          throw new PlayerError('asset-missing', `The video "${node.assetId}" was not resolved.`);
        }
        const { timestamps, timeBase } = video.track;
        const index = sourceFrameIndex(timestamps, timeBase, sourceTimeUs(node, timeUs));
        const png = await pngOf(codecs, video, index);
        frames.push({ nodeId: node.id, mediaType: 'image/png', bytes: png.slice().buffer });
      }
      return frames;
    },
  };
}

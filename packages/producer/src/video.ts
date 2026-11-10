/**
 * Video nodes in the Producer (D50.5). A video asset arrives through the
 * resolver as bytes or, read by path, as a file of the host's (D64); either is
 * verified first (D27.3, D64.1). Bytes get a private copy in a directory of
 * the Producer's own, because a container such as MP4 is read by seeking,
 * never from a pipe; a file is read where it is, and after each read of FFmpeg
 * the Producer checks that it is still the file verified (D64.3). The pinned
 * ffprobe reads the media facts of D49.6, every sampled source range is
 * checked against them before the first frame (D49.6), and for each frame the
 * source frame of every active video node is chosen by the rule of
 * `@kadrion/schema` (D49.5), decoded by the pinned FFmpeg, turned as the
 * display matrix of its container asks after the conversion to RGB, by the
 * same function as the Player (D81), and handed to the page as a PNG (D50.4). The copies are removed when the frame loop ends.
 *
 * The sound sources of the audio pass are given to FFmpeg by the same means
 * (`mediaFiles`, D52.5, D64): this module alone writes copies.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

import { orientedSize, orientRgb } from '@kadrion/renderer-dom';
import {
  placedVideos,
  sampledSourceRange,
  sourceDurationUs,
  sourceFrameIndex,
  sourceRangeFits,
  sourceTimeUs,
  videoSceneTimeUs,
  type PlacedVideo,
  type SceneNode,
  type ValidatedComposition,
  type VideoNode,
} from '@kadrion/schema';

import { ProducerError } from './errors.js';
import {
  FFMPEG_ARCHIVE_SHA256,
  FFMPEG_ASSET,
  FFMPEG_RELEASE,
  FFMPEG_URL,
  videoDecodeArgs,
  type FfmpegTools,
  type VideoDecoder,
  type VideoProbe,
} from './ffmpeg.js';
import type { ManifestVideo } from './manifest.js';
import { checkUnchanged, isPathAsset, type ProducerAsset } from './media-path.js';

/** The frame of one video node as the page receives it (D50.4). */
export interface NodeVideoFrame {
  readonly nodeId: string;
  readonly mediaType: 'image/png';
  readonly bytes: Uint8Array;
}

/** The decoders of one frame loop: the frames of an instant, then `close`. */
export interface VideoFrameSource {
  framesAt(timeUs: number): Promise<readonly NodeVideoFrame[]>;
  close(): Promise<void>;
}

/** The checked videos of a render; every frame loop opens its own decoders. */
export interface VideoLibrary {
  /** The facts of each video asset a node uses, by asset ID, for the manifest and the tests. */
  readonly probes: ReadonlyMap<string, VideoProbe>;
  /** What the render manifest records of the decode (D50.5). */
  readonly manifest: ManifestVideo;
  open(): Promise<VideoFrameSource>;
}

/** The video nodes of a composition, groups included, in document order. */
export function videoNodes(composition: ValidatedComposition): VideoNode[] {
  const found: VideoNode[] = [];
  const visit = (node: SceneNode | VideoNode): void => {
    if (node.type === 'video') found.push(node);
    else if (node.type === 'group') node.children.forEach(visit);
  };
  for (const scene of composition.scenes) scene.nodes.forEach(visit);
  return found;
}

/** A PNG of packed RGB: one IHDR, one IDAT of filter-0 rows, deflated by node:zlib. */
export function encodePng(width: number, height: number, rgb: Uint8Array): Uint8Array {
  const chunk = (type: string, data: Uint8Array): Buffer => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(data, crc32(head.subarray(4))), 0);
    return Buffer.concat([head, data, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const stride = width * 3;
  const rows = Buffer.alloc((stride + 1) * height);
  for (let row = 0; row < height; row += 1) {
    rows.set(rgb.subarray(row * stride, (row + 1) * stride), row * (stride + 1) + 1);
  }
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(rows, { level: 6 })),
      chunk('IEND', new Uint8Array(0)),
    ]),
  );
}

/** The file FFmpeg reads for each asset, by asset ID, until `remove` is called. */
export interface MediaFiles {
  readonly files: ReadonlyMap<string, string>;
  /** Checks that every file read by path is still the file verified (D64.3). */
  check(): Promise<void>;
  remove(): Promise<void>;
}

/**
 * The file FFmpeg reads for each asset: a file read by path is read where it
 * is (D64), and the bytes of any other asset get a private copy, mode `0600`,
 * in a new directory of the Producer's own (D50.5, D52.5), created only when
 * there is a copy to write. `remove` deletes that directory, and a failure
 * while writing deletes it at once.
 */
export async function mediaFiles(
  assets: readonly ProducerAsset[],
  prefix: string,
): Promise<MediaFiles> {
  const files = new Map<string, string>();
  const read = assets.filter(isPathAsset);
  for (const asset of read) files.set(asset.id, asset.path);
  const copied = assets.filter((asset) => !isPathAsset(asset));
  const check = (): Promise<void> => checkUnchanged(read);
  if (copied.length === 0) return { files, check, remove: () => Promise.resolve() };
  const directory = await mkdtemp(join(tmpdir(), `kadrion-${prefix}-`));
  const remove = (): Promise<void> => rm(directory, { recursive: true, force: true });
  try {
    for (const [at, asset] of assets.entries()) {
      if (isPathAsset(asset)) continue;
      const file = join(directory, `${prefix}-${String(at)}`);
      await writeFile(file, asset.bytes, { mode: 0o600, flag: 'wx' });
      files.set(asset.id, file);
    }
  } catch (reason) {
    await remove();
    throw reason;
  }
  return { files, check, remove };
}

/**
 * Probes every video asset a node uses and checks every sampled range (D49.6):
 * `null` for a composition without video nodes, which needs no FFmpeg.
 * Everything here happens before a page opens.
 */
export async function prepareVideos(
  composition: ValidatedComposition,
  assets: readonly ProducerAsset[],
  tools: FfmpegTools | null,
): Promise<VideoLibrary | null> {
  const nodes = videoNodes(composition);
  if (nodes.length === 0) return null;
  if (tools === null) {
    throw new ProducerError(
      'ffmpeg-missing',
      'The document has video nodes, which the pinned FFmpeg decodes, and no paths were given.',
    );
  }
  const used = new Set(nodes.map(({ assetId }) => assetId));
  const videos = assets.filter(({ id, type }) => type === 'video' && used.has(id));
  const probes = new Map<string, VideoProbe>();
  const media = await mediaFiles(videos, 'video');
  try {
    for (const [id, file] of media.files) probes.set(id, await tools.probeVideo(file));
    // What ffprobe read is used only if every file is still the one verified (D64.3).
    await media.check();
  } finally {
    await media.remove();
  }
  const durations = new Map<string, number>();
  for (const [id, probe] of probes) {
    durations.set(id, sourceDurationUs(probe.timestamps, probe.lastDuration, probe.timeBase));
  }
  const placed = placedVideos(composition);
  for (const { node, scene } of placed) {
    const probe = probes.get(node.assetId);
    if (probe === undefined) {
      // Unreachable: validation checked that the asset exists and is a video.
      throw new ProducerError('asset-missing', `The video "${node.assetId}" was not resolved.`);
    }
    const duration = durations.get(node.assetId) ?? 0;
    // The lifetime cut to its scene (D49.6, D54.3).
    const range = sampledSourceRange(node, scene.durationUs);
    if (range !== null && !sourceRangeFits(range, duration)) {
      throw new ProducerError(
        'source-range-exceeded',
        `${node.id}: samples ${String(range.startUs)} to ${String(range.startUs + range.durationUs)} µs of a source of ${String(duration)} µs (D49.6).`,
      );
    }
  }
  const { identity } = tools;
  const manifest: ManifestVideo = {
    decoder: {
      release: FFMPEG_RELEASE,
      asset: FFMPEG_ASSET,
      url: FFMPEG_URL,
      archiveSha256: FFMPEG_ARCHIVE_SHA256,
      ffmpegSha256: identity.ffmpegSha256,
      ffprobeSha256: identity.ffprobeSha256,
      version: identity.version,
      configuration: identity.configuration,
      encoders: identity.encoders,
    },
    decodeArgs: videoDecodeArgs('<input>'),
    sources: videos.map(({ id, contentHash }) => {
      const probe = probes.get(id);
      // The size of the picture as it is shown (D81).
      const shown =
        probe === undefined
          ? { width: 0, height: 0 }
          : orientedSize(probe.width, probe.height, probe.orientation);
      return {
        assetId: id,
        contentHash,
        width: shown.width,
        height: shown.height,
        frames: probe?.timestamps.length ?? 0,
        timeBase: `${String(probe?.timeBase.num)}/${String(probe?.timeBase.den)}`,
        sourceDurationUs: durations.get(id) ?? 0,
      };
    }),
  };
  return {
    probes,
    manifest,
    open: () => openFrameSource(placed, videos, probes, tools),
  };
}

/** A decoder of one node: where it is, and the last frame it read, as a PNG. */
interface NodeDecoder {
  decoder: VideoDecoder | null;
  /** The index of the frame the next `next()` returns. */
  position: number;
  last: { readonly index: number; readonly png: Uint8Array } | null;
}

async function openFrameSource(
  nodes: readonly PlacedVideo[],
  videos: readonly ProducerAsset[],
  probes: ReadonlyMap<string, VideoProbe>,
  tools: FfmpegTools,
): Promise<VideoFrameSource> {
  const decoders = new Map<string, NodeDecoder>();
  const media = await mediaFiles(videos, 'video');
  const { files } = media;
  /** The PNG of source frame `index` of a node: read forward, restarted to go back. */
  const frameOf = async (
    node: VideoNode,
    probe: VideoProbe,
    index: number,
  ): Promise<Uint8Array> => {
    const state = decoders.get(node.id) ?? { decoder: null, position: 0, last: null };
    decoders.set(node.id, state);
    if (state.last?.index === index) return state.last.png;
    if (state.decoder === null || index < state.position) {
      state.decoder?.close();
      const file = files.get(node.assetId) ?? '';
      state.decoder = tools.decodeVideo(file, probe.width, probe.height);
      state.position = 0;
    }
    let rgb: Uint8Array | null = null;
    while (state.position <= index) {
      rgb = await state.decoder.next();
      if (rgb === null) {
        throw new ProducerError(
          'video-undecodable',
          `The video "${node.assetId}" decodes to ${String(state.position)} frames, not ${String(probe.timestamps.length)}.`,
        );
      }
      state.position += 1;
    }
    // After the conversion of colour, as the Player turns its frames (D81).
    const shown = orientedSize(probe.width, probe.height, probe.orientation);
    const png = encodePng(
      shown.width,
      shown.height,
      orientRgb(rgb ?? new Uint8Array(0), probe.width, probe.height, probe.orientation),
    );
    state.last = { index, png };
    return png;
  };
  return {
    async framesAt(timeUs) {
      const frames: NodeVideoFrame[] = [];
      for (const placed of nodes) {
        // Each video at the time of its scene, while its scene is evaluated (D54.3).
        const sceneTimeUs = videoSceneTimeUs(placed, timeUs);
        if (sceneTimeUs === null) continue;
        const { node } = placed;
        const probe = probes.get(node.assetId);
        if (probe === undefined) throw new ProducerError('asset-missing', node.assetId);
        const index = sourceFrameIndex(
          probe.timestamps,
          probe.timeBase,
          sourceTimeUs(node, sceneTimeUs),
        );
        frames.push({
          nodeId: node.id,
          mediaType: 'image/png',
          bytes: await frameOf(node, probe, index),
        });
      }
      // No frame decoded from a file changed after its verification reaches the page (D64.3).
      if (frames.length > 0) await media.check();
      return frames;
    },
    async close() {
      for (const { decoder } of decoders.values()) decoder?.close();
      decoders.clear();
      await media.remove();
    },
  };
}

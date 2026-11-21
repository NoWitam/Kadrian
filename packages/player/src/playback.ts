/**
 * The frames of the video nodes while a film plays (D87.1). Each active video
 * node that is not reversed gets a stream (`stream.ts`) whose frames the pool
 * of workers converts (`pool.ts`), and gives the page its frame as an
 * `ImageBitmap`; a reversed clip (D82.4) keeps the path of D51 and gives image
 * bytes, as a sought frame does. The stream holds the bitmap of the frame a
 * node shows until the node shows another, so the message carries a copy of
 * it (the page receives a structured clone), and every message has exactly
 * one frame per active node (D50.4). A seek, a pause, or an update ends every
 * stream (`close`); the next playing frame starts them again. Neither the
 * frames kept for seeks nor the runs of D82.4 are read or filled here.
 */
import {
  frameToTimeUs,
  placedVideos,
  sourceFrameIndex,
  sourceTimeUs,
  timeUsToFrame,
  videoSceneTimeUs,
  type PlacedVideo,
  type ValidatedComposition,
} from '@kadrion/schema';

import { PlayerError, withAsset } from './errors.js';
import { PoolClosed, type ConversionPool } from './pool.js';
import { STREAM_AHEAD, StreamSuperseded, VideoStream, type StreamCodecs } from './stream.js';
import {
  jobOf,
  type VerifiedVideo,
  type VideoFrameMessage,
  type VideoFrameSource,
} from './video.js';

/** The frame of a playing video node, as the page receives it (D87.3). */
export interface VideoBitmapMessage {
  readonly nodeId: string;
  readonly bitmap: ImageBitmap;
}

/** One entry of `videoFrames` in protocol version 3. */
export type VideoFrameEntry = VideoFrameMessage | VideoBitmapMessage;

/** The frames of a playing film, one instant at a time. */
export interface PlaybackFrameSource {
  framesAt(composition: ValidatedComposition, timeUs: number): Promise<VideoFrameEntry[]>;
  /** Ends every stream: after a seek, a pause, or an update of the document. */
  close(): void;
}

interface Streamed {
  readonly stream: VideoStream<ImageBitmap>;
  readonly contentHash: string;
  /** The film's time of the frame asked for last, which `upcoming` counts from. */
  timeUs: number;
  placed: PlacedVideo;
}

/** The presentation index a placed video node shows at the film's time `timeUs`, or `null`. */
function indexAt(placed: PlacedVideo, video: VerifiedVideo, timeUs: number): number | null {
  const sceneTimeUs = videoSceneTimeUs(placed, timeUs);
  if (sceneTimeUs === null) return null;
  const { timestamps, timeBase } = video.track;
  return sourceFrameIndex(timestamps, timeBase, sourceTimeUs(placed.node, sceneTimeUs));
}

/**
 * The frame source of a playing film over the verified videos: streams whose
 * frames the pool converts, and `fallback` (the path of D51) for reversed
 * clips.
 */
export function createPlaybackFrameSource(
  codecs: StreamCodecs,
  videos: ReadonlyMap<string, VerifiedVideo>,
  pool: ConversionPool,
  fallback: VideoFrameSource,
): PlaybackFrameSource {
  const streams = new Map<string, Streamed>();
  const close = (): void => {
    for (const { stream } of streams.values()) stream.close();
    streams.clear();
  };
  const streamOf = (
    composition: ValidatedComposition,
    placed: PlacedVideo,
    video: VerifiedVideo,
  ): Streamed => {
    const known = streams.get(placed.node.id);
    if (known !== undefined && known.contentHash === video.contentHash) {
      known.placed = placed;
      return known;
    }
    known?.stream.close();
    const { fps, durationUs } = composition;
    const entry: Streamed = {
      contentHash: video.contentHash,
      timeUs: 0,
      placed,
      stream: new VideoStream<ImageBitmap>({
        codecs,
        video,
        // The source frames of the next film frames, by the rule of D49.5 through the time map of D82.
        upcoming: () => {
          const frame = timeUsToFrame(entry.timeUs, fps);
          const next: number[] = [];
          for (let ahead = 1; ahead <= STREAM_AHEAD; ahead += 1) {
            const timeUs = frameToTimeUs(frame + ahead, fps);
            if (timeUs >= durationUs) break;
            const index = indexAt(entry.placed, video, timeUs);
            if (index !== null) next.push(index);
          }
          return next;
        },
        // A pool that refuses the job ends the stream's frame, not the film: the Player
        // shows it by the path of D51 and says once that the workers are gone (D87.2).
        convert: (planes) =>
          pool.convert(jobOf(video, planes)).catch((reason: unknown) => {
            throw reason instanceof PoolClosed ? new StreamSuperseded() : reason;
          }),
        release: (bitmap) => {
          bitmap.close();
        },
      }),
    };
    streams.set(placed.node.id, entry);
    return entry;
  };
  return {
    close,
    async framesAt(composition, timeUs) {
      const hashes = new Map(composition.assets.map((asset) => [asset.id, asset.contentHash]));
      const active = placedVideos(composition).flatMap((placed) => {
        const contentHash = hashes.get(placed.node.assetId) ?? '';
        const video = videos.get(contentHash);
        const asset = { id: placed.node.assetId, contentHash };
        if (videoSceneTimeUs(placed, timeUs) === null) return [];
        if (video === undefined) {
          throw new PlayerError(
            'asset-missing',
            `The video "${placed.node.assetId}" was not resolved.`,
            [],
            asset,
          );
        }
        return [{ placed, video, asset }];
      });
      // A node that is no longer active, or no longer in the document, lets go of its stream.
      const shown = new Set(active.map(({ placed }) => placed.node.id));
      for (const [nodeId, { stream }] of streams) {
        if (!shown.has(nodeId)) {
          stream.close();
          streams.delete(nodeId);
        }
      }
      const reversed = active.some(({ placed }) => placed.node.reverse);
      const sought = reversed ? await fallback.framesAt(composition, timeUs) : [];
      const entries: VideoFrameEntry[] = [];
      for (const { placed, video, asset } of active) {
        const { node } = placed;
        if (node.reverse) {
          const frame = sought.find(({ nodeId }) => nodeId === node.id);
          if (frame === undefined) {
            throw new PlayerError(
              'video-undecodable',
              `No frame of ${node.id} at ${String(timeUs)} µs.`,
            );
          }
          entries.push(frame);
          continue;
        }
        const index = indexAt(placed, video, timeUs);
        if (index === null) continue;
        const streamed = streamOf(composition, placed, video);
        streamed.timeUs = timeUs;
        try {
          entries.push({ nodeId: node.id, bitmap: await streamed.stream.frame(index) });
        } catch (reason) {
          throw reason instanceof PlayerError ? withAsset(reason, asset) : reason;
        }
      }
      return entries;
    },
  };
}

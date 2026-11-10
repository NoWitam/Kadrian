/**
 * The container reader of the Player (D79, replacing the MP4 reader of
 * D51.3): Mediabunny (MPL-2.0, D12) demultiplexes MP4, fragmented MP4,
 * QuickTime, and Matroska, and this module turns what it reads into the facts
 * the Player decodes with and the verdict of `inspectVideo`. Both come from
 * one examination, so the verdict never says "plays" for a file the Player
 * would refuse, or the reverse.
 *
 * The rules are D51.1's, widened to these containers only (D79.2): the
 * primary video track is H.264, 8-bit 4:2:0, progressive, BT.601 or BT.709,
 * not rotated or flipped; its presentation times are whole ticks of its time
 * base, strictly ascending, and never before zero; the first sample is a sync
 * sample that holds an IDR picture. The facts are those the pinned ffprobe reads for the same bytes:
 * the time base, the presentation timestamps, and the duration of the last
 * frame (D49.6, D50.5). Pure: no DOM; it reads only the `Blob` it is given.
 */
import {
  ALL_FORMATS,
  CustomSource,
  EncodedPacketSink,
  Input,
  Logging,
  MATROSKA,
  MP4,
  QTFF,
  WEBM,
  type EncodedPacket,
  type InputFormat,
  type InputVideoTrack,
} from 'mediabunny';
import { sourceDurationUs, type TimeBase } from '@kadrion/schema';

import {
  avcColour,
  AvcUnsupported,
  holdsIdr,
  type AvcColour,
  type ContainerColour,
} from './avc.js';
import { PlayerError } from './errors.js';

/** Why the Player does not show a file as it is (D79.4). */
export type VideoInspectionCode =
  /** Not a media file Mediabunny reads, or a damaged one. */
  | 'unreadable'
  /** A container other than MP4 (fragmented or not), QuickTime, or Matroska/WebM. */
  | 'container'
  /** No video track. */
  | 'no-video'
  /** A video codec other than H.264 (HEVC, VP9, AV1, …). */
  | 'codec'
  /** H.264 of a bit depth other than 8. */
  | 'bit-depth'
  /** H.264 whose chroma is not 4:2:0. */
  | 'chroma'
  /** Interlaced H.264. */
  | 'interlaced'
  /** Colour other than BT.601 or BT.709, or a container that says other colours than the stream. */
  | 'colour'
  /** A track rotated or flipped by its container. */
  | 'rotation'
  /** Timestamps the Player cannot read exactly as the Producer's ffprobe does. */
  | 'timing'
  /** A sound of more than two channels, which the Player does not play (D53.2). */
  | 'audio-channels';

/** One reason, with what was found. */
export interface VideoInspectionReason {
  readonly code: VideoInspectionCode;
  readonly message: string;
}

/** The container of a file, by its family; `other` names a format Kadrion does not read. */
export type VideoContainer = 'mp4' | 'mov' | 'mkv' | 'webm' | 'other';

/** The primary video track of a file as it was read. */
export interface InspectedVideoTrack {
  /** Mediabunny's name of the codec (`avc`, `hevc`, `vp9`, `av1`, …), or `null` when unknown. */
  readonly codec: string | null;
  /** The codec string of RFC 6381, for example `avc1.64001f`, or `null`. */
  readonly codecString: string | null;
  /** The coded size, as the container states it. */
  readonly width: number;
  readonly height: number;
  /** The clockwise rotation the container asks for. */
  readonly rotation: 0 | 90 | 180 | 270;
  /** Whether the container asks for a horizontal flip after the rotation. */
  readonly flipped: boolean;
  /** The number of frames, or `null` when the timestamps could not be read. */
  readonly frames: number | null;
  /** The source duration of D50.3 in microseconds, or `null`. */
  readonly durationUs: number | null;
  /** The time base of the timestamps, or `null`. */
  readonly timeBase: TimeBase | null;
  /** The exact frame rate when every frame lasts as long, reduced; `null` otherwise. */
  readonly frameRate: { readonly num: number; readonly den: number } | null;
}

/** The primary audio track of a file. */
export interface InspectedAudioTrack {
  /** Mediabunny's name of the codec (`aac`, `opus`, `pcm-s16`, …), or `null` when unknown. */
  readonly codec: string | null;
  readonly channels: number;
  readonly sampleRate: number;
}

/**
 * The verdict of `inspectVideo` (D79.4): whether the Player shows the file as
 * it is, and if not, every reason found; and the facts that were read.
 */
export interface VideoInspection {
  /** `true` exactly when `reasons` is empty. */
  readonly playable: boolean;
  readonly reasons: readonly VideoInspectionReason[];
  /** The container's family, or `null` when the file is unreadable. */
  readonly container: VideoContainer | null;
  /** Mediabunny's name of the format, for example `Matroska`, or `null`. */
  readonly format: string | null;
  readonly video: InspectedVideoTrack | null;
  readonly audio: InspectedAudioTrack | null;
}

/** One sample of the track, in decode order. */
export interface VideoSample {
  /** The presentation time in ticks of the time base. */
  readonly pts: number;
  readonly sync: boolean;
}

/** The primary video track of a file the Player shows (D79). */
export interface VideoTrack {
  /** The WebCodecs codec string, for example `avc1.64000c`. */
  readonly codec: string;
  /** The decoder configuration record (`avcC`), the WebCodecs `description`. */
  readonly description: Uint8Array;
  /** How the Producer's decode converts its frames to RGB (D51.4). */
  readonly colour: AvcColour;
  readonly width: number;
  readonly height: number;
  readonly timeBase: TimeBase;
  /** Every sample in decode order. */
  readonly samples: readonly VideoSample[];
  /** For presentation index `i`, the decode index of its sample. */
  readonly presentation: readonly number[];
  /** The presentation timestamps in presentation order, strictly ascending (D49.5). */
  readonly timestamps: readonly number[];
  /** The duration of the last frame in presentation order, in ticks (D50.3). */
  readonly lastDuration: number;
  /** The bytes of the samples `from` to `to` (both included), in decode order. */
  readSamples(from: number, to: number): AsyncIterable<Uint8Array>;
}

/** The containers whose timestamps the Player reads as FFmpeg does (D79.2). */
const CONTAINERS: readonly (readonly [InputFormat, VideoContainer])[] = [
  [MP4, 'mp4'],
  [QTFF, 'mov'],
  [MATROSKA, 'mkv'],
  [WEBM, 'webm'],
];

/**
 * Mediabunny's warnings that mean it reads a track's timeline otherwise than
 * FFmpeg: it keeps the first edit of several, or skips a fragment's run.
 */
const TIMELINE_WARNING = /edit list|traf/i;

/** H.273 code points of the colour names of WebCodecs (D79.3). */
const PRIMARIES: Readonly<Record<string, number>> = {
  bt709: 1,
  bt470bg: 5,
  smpte170m: 6,
  bt2020: 9,
  smpte432: 12,
};
const TRANSFERS: Readonly<Record<string, number>> = {
  bt709: 1,
  smpte170m: 6,
  linear: 8,
  'iec61966-2-1': 13,
  pq: 16,
  hlg: 18,
};
const MATRICES: Readonly<Record<string, number>> = {
  rgb: 0,
  bt709: 1,
  bt470bg: 5,
  smpte170m: 6,
  'bt2020-ncl': 9,
};

/** A code point of a stated name; a name this table does not know is never a match. */
function codeOf(table: Readonly<Record<string, number>>, name: unknown): number | null {
  if (name === undefined || name === null) return null;
  return typeof name === 'string' && name in table ? (table[name] as number) : -1;
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/** `value` as a whole number when it is one to within rounding, else `null`. */
function whole(value: number): number | null {
  const rounded = Math.round(value);
  return Math.abs(value - rounded) < 1e-6 && Number.isSafeInteger(rounded) ? rounded : null;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** What the timestamps of a track give, or why they cannot be read exactly. */
interface Timing {
  readonly timeBase: TimeBase;
  readonly packets: readonly EncodedPacket[];
  readonly samples: readonly VideoSample[];
  readonly presentation: readonly number[];
  readonly timestamps: readonly number[];
  readonly lastDuration: number;
}

/**
 * The timestamps of a track as the pinned ffprobe reads them (D50.5): whole
 * ticks of the track's time base, in presentation order, strictly ascending;
 * the duration of the last frame is its own, rounded down to a tick as FFmpeg
 * divides a Matroska default duration, or the interval before it.
 */
async function timingOf(track: InputVideoTrack): Promise<Timing | string> {
  const resolution = await track.getTimeResolution();
  if (!Number.isSafeInteger(resolution) || resolution <= 0) {
    return `The time base is not a whole number of ticks per second (${String(resolution)}).`;
  }
  const packets: EncodedPacket[] = [];
  const samples: VideoSample[] = [];
  for await (const packet of new EncodedPacketSink(track).packets(undefined, undefined, {
    metadataOnly: true,
  })) {
    const pts = whole(packet.timestamp * resolution);
    if (pts === null) {
      return `Sample ${String(samples.length)} is not at a whole tick of 1/${String(resolution)} s.`;
    }
    packets.push(packet);
    samples.push({ pts, sync: packet.type === 'key' });
  }
  if (samples.length === 0) return 'The video track has no sample.';
  if (samples[0]?.sync !== true) return 'The first sample is not a sync sample.';
  const presentation = [...samples.keys()].sort(
    (a, b) => (samples[a]?.pts ?? 0) - (samples[b]?.pts ?? 0),
  );
  const timestamps = presentation.map((index) => samples[index]?.pts ?? 0);
  if ((timestamps[0] ?? 0) < 0) {
    return 'A frame is presented before zero: an edit list cuts frames from the start.';
  }
  for (let at = 1; at < timestamps.length; at += 1) {
    if ((timestamps[at] ?? 0) <= (timestamps[at - 1] ?? 0)) {
      return 'Two frames of the video track have the same presentation time.';
    }
  }
  const last = packets[presentation.at(-1) ?? 0];
  const ticks = (last?.duration ?? 0) * resolution;
  const own = whole(ticks) ?? Math.floor(ticks);
  const before = timestamps.at(-2);
  const lastDuration = own > 0 ? own : before === undefined ? 0 : (timestamps.at(-1) ?? 0) - before;
  if (lastDuration <= 0) return 'The last frame of the video track has no duration.';
  return {
    timeBase: { num: 1, den: resolution },
    packets,
    samples,
    presentation,
    timestamps,
    lastDuration,
  };
}

/** The frame rate when every frame lasts the same number of ticks, reduced. */
function frameRateOf(timing: Timing): { num: number; den: number } | null {
  const { timestamps, lastDuration, timeBase } = timing;
  for (let at = 1; at < timestamps.length; at += 1) {
    if ((timestamps[at] ?? 0) - (timestamps[at - 1] ?? 0) !== lastDuration) return null;
  }
  const divisor = gcd(timeBase.den, lastDuration * timeBase.num);
  return { num: timeBase.den / divisor, den: (lastDuration * timeBase.num) / divisor };
}

/** What the container states about colour, as code points (D79.3). */
async function containerColour(track: InputVideoTrack): Promise<ContainerColour> {
  const space = await track.getColorSpace();
  return {
    primaries: codeOf(PRIMARIES, space.primaries),
    transfer: codeOf(TRANSFERS, space.transfer),
    matrix: codeOf(MATRICES, space.matrix),
    fullRange: typeof space.fullRange === 'boolean' ? space.fullRange : null,
  };
}

/** One examination: the verdict, and the track when the Player shows the file. */
interface Examination {
  readonly inspection: VideoInspection;
  readonly track: VideoTrack | null;
}

function frozen(
  reasons: VideoInspectionReason[],
  rest: Omit<VideoInspection, 'playable' | 'reasons'>,
): VideoInspection {
  return Object.freeze({
    playable: reasons.length === 0,
    reasons: Object.freeze(reasons.map((reason) => Object.freeze(reason))),
    ...rest,
  });
}

/**
 * Reads a file with Mediabunny and checks every rule of D79.2. It never
 * throws for the file's sake: whatever goes wrong is a reason of the verdict.
 */
async function examine(blob: Blob): Promise<Examination> {
  const reasons: VideoInspectionReason[] = [];
  const add = (code: VideoInspectionCode, message: string): void => {
    reasons.push({ code, message });
  };
  const warnings: string[] = [];
  const stopListening = Logging.on('warn', (data) => {
    warnings.push(data.map((part) => messageOf(part)).join(' '));
  });
  let container: VideoContainer | null = null;
  let format: string | null = null;
  let video: InspectedVideoTrack | null = null;
  let audio: InspectedAudioTrack | null = null;
  let track: VideoTrack | null = null;
  try {
    // A `Blob` of any realm (a resolver may run in another window), read in slices.
    const input = new Input({
      source: new CustomSource({
        getSize: () => blob.size,
        read: async (start, end) => new Uint8Array(await blob.slice(start, end).arrayBuffer()),
        prefetchProfile: 'fileSystem',
      }),
      formats: ALL_FORMATS,
    });
    let found: InputFormat;
    try {
      found = await input.getFormat();
    } catch (reason) {
      add('unreadable', `The file is not a media file Kadrion reads: ${messageOf(reason)}`);
      return { inspection: frozen(reasons, { container, format, video, audio }), track };
    }
    format = found.name;
    container = CONTAINERS.find(([candidate]) => candidate === found)?.[1] ?? 'other';
    if (container === 'other') {
      add('container', `The Player reads MP4, QuickTime, and Matroska files, not ${format}.`);
    }
    // The sound is a fact of the verdict only: the browser decodes it (D53.2).
    try {
      const audioTrack = await input.getPrimaryAudioTrack();
      audio =
        audioTrack === null
          ? null
          : Object.freeze({
              codec: await audioTrack.getCodec(),
              channels: await audioTrack.getNumberOfChannels(),
              sampleRate: await audioTrack.getSampleRate(),
            });
    } catch {
      audio = null;
    }
    if (audio !== null && audio.channels > 2) {
      add(
        'audio-channels',
        `The sound has ${String(audio.channels)} channels; the Player plays one or two (D53.2).`,
      );
    }
    const videoTrack = await input.getPrimaryVideoTrack();
    if (videoTrack === null) {
      add('no-video', 'The file has no video track.');
      return { inspection: frozen(reasons, { container, format, video, audio }), track };
    }
    const codec = await videoTrack.getCodec();
    const codecString = await videoTrack.getCodecParameterString();
    const width = await videoTrack.getCodedWidth();
    const height = await videoTrack.getCodedHeight();
    const rotation = await videoTrack.getRotation();
    const flipped = await videoTrack.getFlip();
    if (codec !== 'avc') {
      add('codec', `The Player decodes H.264, not ${codec ?? codecString ?? 'an unknown codec'}.`);
    }
    if (rotation !== 0 || flipped) {
      add(
        'rotation',
        `The container rotates the picture by ${String(rotation)}°${flipped ? ' and flips it' : ''}.`,
      );
    }
    if (width <= 0 || height <= 0) add('unreadable', 'The video track has no size.');
    const timing = await timingOf(videoTrack);
    if (typeof timing === 'string') add('timing', timing);
    video = Object.freeze({
      codec,
      codecString,
      width,
      height,
      rotation,
      flipped,
      frames: typeof timing === 'string' ? null : timing.timestamps.length,
      durationUs:
        typeof timing === 'string'
          ? null
          : sourceDurationUs(timing.timestamps, timing.lastDuration, timing.timeBase),
      timeBase: typeof timing === 'string' ? null : Object.freeze({ ...timing.timeBase }),
      frameRate: typeof timing === 'string' ? null : frameRateOf(timing),
    });
    let colour: AvcColour | null = null;
    let description: Uint8Array | null = null;
    if (codec === 'avc') {
      const config = await videoTrack.getDecoderConfig();
      const given = config?.description;
      description =
        given === undefined
          ? null
          : ArrayBuffer.isView(given)
            ? new Uint8Array(given.buffer, given.byteOffset, given.byteLength).slice()
            : new Uint8Array(given).slice();
      if (description === null) {
        add('codec', 'The H.264 track has no decoder configuration record ("avcC").');
      } else {
        try {
          colour = avcColour(description, await containerColour(videoTrack));
        } catch (reason) {
          if (!(reason instanceof AvcUnsupported)) throw reason;
          add(reason.reason ?? 'unreadable', reason.message);
        }
        // Mediabunny counts the first sample a key sample whatever the file says: its
        // bytes tell whether a decoder can start there, as the Producer's does (D79.5).
        const first = await new EncodedPacketSink(videoTrack).getFirstPacket();
        if (first === null || !holdsIdr(description, first.data)) {
          add('timing', 'The first sample is not an IDR picture, where a decode can start.');
        }
      }
    }
    const timeline = warnings.find((warning) => TIMELINE_WARNING.test(warning));
    if (timeline !== undefined) {
      add('timing', `The container's timeline is read only in part: ${timeline}`);
    }
    // A sound of more than two channels refuses the sound, not the picture (D53.2).
    if (
      reasons.every(({ code }) => code === 'audio-channels') &&
      typeof timing !== 'string' &&
      colour !== null &&
      description !== null &&
      codecString !== null
    ) {
      track = videoTrackOf(videoTrack, timing, {
        codec: codecString,
        description,
        colour,
        width,
        height,
      });
    }
  } catch (reason) {
    // A format Kadrion does not read is refused for that; what else fails in it is no news.
    if (container !== 'other') add('unreadable', `The file cannot be read: ${messageOf(reason)}`);
    track = null;
  } finally {
    stopListening();
  }
  return { inspection: frozen(reasons, { container, format, video, audio }), track };
}

/** The track the Player decodes, reading sample bytes through Mediabunny on demand. */
function videoTrackOf(
  input: InputVideoTrack,
  timing: Timing,
  fixed: Pick<VideoTrack, 'codec' | 'description' | 'colour' | 'width' | 'height'>,
): VideoTrack {
  const sink = new EncodedPacketSink(input);
  const { packets } = timing;
  return {
    ...fixed,
    timeBase: timing.timeBase,
    samples: timing.samples,
    presentation: timing.presentation,
    timestamps: timing.timestamps,
    lastDuration: timing.lastDuration,
    async *readSamples(from, to) {
      const first = packets[from];
      if (first === undefined) throw new Error(`There is no sample ${String(from)}.`);
      // A packet of its own presentation time is that packet: times are distinct.
      let packet = await sink.getPacket(first.timestamp);
      for (let at = from; at <= to; at += 1) {
        if (packet === null || packet.sequenceNumber !== packets[at]?.sequenceNumber) {
          throw new Error(`Sample ${String(at)} is not where it was when the file was read.`);
        }
        yield packet.data;
        if (at < to) packet = await sink.getNextPacket(packet);
      }
    },
  };
}

/**
 * Reads the primary video track of a verified video (D51.3, D79): a file
 * outside D79.2 is `video-unsupported`, its message the first reason and its
 * details every reason as `code: message`.
 */
export async function readVideoTrack(blob: Blob): Promise<VideoTrack> {
  const { inspection, track } = await examine(blob);
  if (track !== null) return track;
  const [first] = inspection.reasons;
  throw new PlayerError(
    'video-unsupported',
    first?.message ?? 'The file cannot be read.',
    inspection.reasons.map(({ code, message }) => `${code}: ${message}`),
  );
}

/**
 * Whether the Player shows a video file as it is, and if not, why (D79.4),
 * with the facts it read: the same examination the Player makes before it
 * decodes, so the verdict and the Player never disagree on a file. The
 * verdict does not say that the host window has a decoder (WebCodecs), which
 * only the window can tell (`video-unsupported` at load), nor that the bytes
 * have an asset's `contentHash`, which the Player verifies first (D51.2).
 * It takes bytes or a `Blob` (a `File`, or `fs.openAsBlob` in Node.js) and
 * never fetches a URL (D25.8). Bytes are copied; a `Blob` is read in slices.
 */
export async function inspectVideo(file: Blob | Uint8Array): Promise<VideoInspection> {
  // Bytes of any realm: a host may pass an array made in another window.
  const blob =
    Object.prototype.toString.call(file) === '[object Uint8Array]'
      ? new Blob([Uint8Array.prototype.slice.call(file as Uint8Array)])
      : (file as Blob);
  return (await examine(blob)).inspection;
}

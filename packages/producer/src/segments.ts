/**
 * The canonical segment grid of D47 and the pure parts of the segmented
 * export: which frames a segment holds, which segments a range covers, the
 * arguments of the FFmpeg processes of a segment, of the audio pass, and of the
 * join, the concat list, and the checks a join makes of the manifests it is
 * given. Nothing here starts a process or touches a file.
 */
import {
  frameCount,
  frameToTimeUs,
  timeUsToFrame,
  type ValidatedComposition,
} from '@kadrion/schema';

import {
  AUDIO_BITRATE,
  AUDIO_CHANNEL_LAYOUT,
  AUDIO_CODEC,
  SAMPLE_RATE,
  TIME_SCALE_PER_FRAME,
  type AudioPlan,
} from './encode.js';
import { ProducerError } from './errors.js';

/** The frames of one segment unless the export settings name another length (D47.1). */
export const DEFAULT_SEGMENT_FRAMES = 60;
/** The longest segment the settings accept; a longer one would only be one segment. */
export const MAX_SEGMENT_FRAMES = 1_000_000;

/** One segment of the grid (D47.1): frames `firstFrame` to `firstFrame + frameCount − 1`. */
export interface Segment {
  readonly index: number;
  readonly firstFrame: number;
  readonly frameCount: number;
}

/** A range of the composition's frame grid, in frames and in microseconds (D47.2). */
export interface FrameRange {
  readonly fromUs: number;
  /** Exclusive: the time of the first frame after the range, or the composition's end. */
  readonly toUs: number;
  readonly firstFrame: number;
  readonly frameCount: number;
}

/** A segment length of the settings, or `segment-length-invalid`. */
export function checkedSegmentFrames(value: number | undefined): number {
  const frames = value ?? DEFAULT_SEGMENT_FRAMES;
  if (!Number.isSafeInteger(frames) || frames < 1 || frames > MAX_SEGMENT_FRAMES) {
    throw new ProducerError(
      'segment-length-invalid',
      `The segment length must be an integer number of frames in [1, ${String(MAX_SEGMENT_FRAMES)}], got ${String(frames)}.`,
    );
  }
  return frames;
}

/** Every segment of a composition's grid, in order; the last one may be shorter (D47.1). */
export function segmentsOf(composition: ValidatedComposition, segmentFrames: number): Segment[] {
  const total = frameCount(composition.durationUs, composition.fps);
  const segments: Segment[] = [];
  for (let first = 0; first < total; first += segmentFrames) {
    segments.push({
      index: segments.length,
      firstFrame: first,
      frameCount: Math.min(segmentFrames, total - first),
    });
  }
  return segments;
}

/** The time a frame index starts at, or the composition's end for the frame after the last. */
function boundaryUs(composition: ValidatedComposition, frame: number): number {
  const total = frameCount(composition.durationUs, composition.fps);
  return frame >= total ? composition.durationUs : frameToTimeUs(frame, composition.fps);
}

/** The whole grid as a range. */
export function wholeRange(composition: ValidatedComposition): FrameRange {
  const total = frameCount(composition.durationUs, composition.fps);
  return { fromUs: 0, toUs: composition.durationUs, firstFrame: 0, frameCount: total };
}

function rangeInvalid(message: string): ProducerError {
  return new ProducerError('range-invalid', message);
}

/** The frame a boundary time names: a frame time of the grid, or the composition's end. */
function boundaryFrame(composition: ValidatedComposition, timeUs: number, name: string): number {
  const { fps, durationUs } = composition;
  const total = frameCount(durationUs, fps);
  if (!Number.isSafeInteger(timeUs) || timeUs < 0 || timeUs > durationUs) {
    throw rangeInvalid(
      `${name} must be an integer in [0, ${String(durationUs)}], got ${String(timeUs)}.`,
    );
  }
  if (timeUs === durationUs) return total;
  const frame = timeUsToFrame(timeUs, fps);
  if (frameToTimeUs(frame, fps) !== timeUs) {
    throw rangeInvalid(`${name} ${String(timeUs)} is not a frame time at ${String(fps)} fps.`);
  }
  return frame;
}

/**
 * A range given in microseconds, as frames (D47.2): `fromUs` a frame time,
 * `toUs` a later frame time or the composition's end. Without `segmentFrames`
 * any frame times will do (the audio pass); with it, both ends must lie on
 * segment boundaries. Anything else is `range-invalid`, before a page opens.
 */
export function frameRange(
  composition: ValidatedComposition,
  range: { readonly fromUs: number; readonly toUs: number } | undefined,
  segmentFrames?: number,
): FrameRange {
  if (range === undefined) return wholeRange(composition);
  const first = boundaryFrame(composition, range.fromUs, 'fromUs');
  const end = boundaryFrame(composition, range.toUs, 'toUs');
  if (end <= first) {
    throw rangeInvalid(
      `The range [${String(range.fromUs)}, ${String(range.toUs)}) holds no frame.`,
    );
  }
  if (segmentFrames !== undefined) {
    const total = frameCount(composition.durationUs, composition.fps);
    for (const [name, frame] of [
      ['fromUs', first],
      ['toUs', end],
    ] as const) {
      if (frame % segmentFrames !== 0 && frame !== total) {
        const below = frame - (frame % segmentFrames);
        throw rangeInvalid(
          `${name} is frame ${String(frame)}, not a boundary of segments of ${String(segmentFrames)} frames; the nearest below is ${String(boundaryUs(composition, below))} µs.`,
        );
      }
    }
  }
  return {
    fromUs: boundaryUs(composition, first),
    toUs: boundaryUs(composition, end),
    firstFrame: first,
    frameCount: end - first,
  };
}

/** The segments a range on the segment grid covers. */
export function rangeSegmentsOf(
  composition: ValidatedComposition,
  segmentFrames: number,
  range: FrameRange,
): Segment[] {
  return segmentsOf(composition, segmentFrames).filter(
    ({ firstFrame }) =>
      firstFrame >= range.firstFrame && firstFrame < range.firstFrame + range.frameCount,
  );
}

/** `segment-000003.mp4`: the file of a segment, named by its index alone (D47.3). */
export function segmentFileName(index: number): string {
  return `segment-${String(index).padStart(6, '0')}.mp4`;
}

/** What a file is written as until it is complete, and then renamed from (D47.6). */
export const PARTIAL_SUFFIX = '.partial';

/** What the audio intermediate's path is replaced with in the manifest. */
export const AUDIO_PLACEHOLDER = '<audio>';

/** The lossless intermediate of the audio pass (D47.4): 32-bit float PCM in WAV, stereo, 48 kHz. */
export const AUDIO_INTERMEDIATE_CODEC = 'pcm_f32le';
export const AUDIO_INTERMEDIATE_FORMAT = 'wav';

const BITEXACT = ['-map_metadata', '-1', '-map_chapters', '-1', '-fflags', '+bitexact'] as const;

/**
 * The arguments of the FFmpeg process of one segment (D47.3): the encoder of
 * D29.4 without audio and without `+faststart`, writing an MP4 that starts at
 * presentation time 0 with an IDR frame, and the receipt of D29.3.
 */
export function segmentArgs(options: {
  readonly fps: number;
  readonly videoGraph: string;
  readonly output: string;
}): string[] {
  const fps = String(options.fps);
  return [
    ...['-hide_banner', '-nostdin', '-loglevel', 'error', '-threads', '1'],
    ...['-f', 'image2pipe', '-c:v', 'png', '-framerate', fps, '-i', 'pipe:0'],
    ...['-filter_complex_threads', '1', '-filter_complex', options.videoGraph],
    ...['-map', '[v]', '-fps_mode', 'passthrough'],
    ...['-c:v', 'libx264', '-preset', 'medium', '-crf', '18'],
    ...['-profile:v', 'high', '-level:v', '4.0', '-pix_fmt', 'yuv420p', '-threads', '1'],
    ...['-color_primaries', 'bt709', '-color_trc', 'bt709'],
    ...['-colorspace', 'bt709', '-color_range', 'tv'],
    ...['-video_track_timescale', String(options.fps * TIME_SCALE_PER_FRAME)],
    ...BITEXACT,
    ...['-flags:v', '+bitexact'],
    ...['-f', 'mp4', '-y', options.output],
    ...['-map', '0:v', '-c:v', 'copy', '-f', 'framehash', '-hash', 'sha256', 'pipe:1'],
  ];
}

/** The samples of a range at 48 kHz: from the sample of `fromUs` up to the one of `toUs` (D47.4). */
export interface AudioRange {
  readonly startSample: number;
  readonly sampleCount: number;
}

/**
 * The audio graph of the pass (D47.4): the mix of D29.6 over the whole
 * composition, cut to the range's samples and started again at 0.
 */
export function audioPassGraph(plan: AudioPlan, range: AudioRange): string {
  return [
    `[0:a]aresample=${String(SAMPLE_RATE)}`,
    `atrim=end_sample=${String(plan.sampleCount)}`,
    `adelay=delays=${String(plan.startSample)}S:all=1`,
    `apad=whole_len=${String(plan.totalSamples)}`,
    `atrim=end_sample=${String(plan.totalSamples)}`,
    `aformat=sample_fmts=fltp:sample_rates=${String(SAMPLE_RATE)}:channel_layouts=${AUDIO_CHANNEL_LAYOUT}`,
    `atrim=start_sample=${String(range.startSample)}:end_sample=${String(range.startSample + range.sampleCount)}`,
    'asetpts=N/SR/TB[a]',
  ].join(',');
}

/** The arguments of the audio pass (D47.4): the asset on `pipe:0`, a WAV at `output`. */
export function audioPassArgs(options: {
  readonly graph: string;
  readonly output: string;
}): string[] {
  return [
    ...['-hide_banner', '-nostdin', '-loglevel', 'error', '-threads', '1'],
    ...['-i', 'pipe:0'],
    ...['-filter_complex_threads', '1', '-filter_complex', options.graph, '-map', '[a]'],
    ...['-c:a', AUDIO_INTERMEDIATE_CODEC, '-ar', String(SAMPLE_RATE), '-ac', '2'],
    ...BITEXACT,
    ...['-flags:a', '+bitexact'],
    ...['-f', AUDIO_INTERMEDIATE_FORMAT, '-y', options.output],
  ];
}

/**
 * The arguments of the join (D47.5): the segments through the concat demuxer
 * with stream copy, read from the list on `pipe:0`; the audio intermediate,
 * when there is one, encoded to AAC once; one MP4 with `+faststart`.
 */
export function joinArgs(options: {
  readonly fps: number;
  readonly audio: string | null;
  readonly output: string;
}): string[] {
  const { audio } = options;
  return [
    ...['-hide_banner', '-nostdin', '-loglevel', 'error', '-threads', '1'],
    ...['-f', 'concat', '-safe', '0', '-protocol_whitelist', 'file,pipe', '-i', 'pipe:0'],
    ...(audio === null ? [] : ['-f', AUDIO_INTERMEDIATE_FORMAT, '-i', `file:${audio}`]),
    ...['-map', '0:v', ...(audio === null ? [] : ['-map', '1:a'])],
    ...['-c:v', 'copy'],
    ...(audio === null
      ? []
      : ['-c:a', AUDIO_CODEC, '-b:a', AUDIO_BITRATE, '-ar', String(SAMPLE_RATE), '-ac', '2']),
    ...['-video_track_timescale', String(options.fps * TIME_SCALE_PER_FRAME)],
    ...BITEXACT,
    ...['-flags:v', '+bitexact', ...(audio === null ? [] : ['-flags:a', '+bitexact'])],
    ...['-movflags', '+faststart', '-f', 'mp4', '-y', options.output],
  ];
}

/**
 * The concat list of the join (D47.5), in the `ffconcat` format: one absolute
 * `file:` URL per segment, in order, each quoted, with a single quote written
 * as the format escapes it.
 */
export function concatList(paths: readonly string[]): string {
  const quoted = (path: string): string => `'${path.replaceAll("'", "'\\''")}'`;
  return [
    'ffconcat version 1.0',
    ...paths.map((path) => {
      if (!path.startsWith('/') || path.includes('\n') || path.includes('\r')) {
        throw new ProducerError(
          'join-invalid',
          `A segment must be named by an absolute path on one line, got ${JSON.stringify(path)}.`,
        );
      }
      return `file ${quoted(`file:${path}`)}`;
    }),
    '',
  ].join('\n');
}

/** The output formats of a still frame (D47.7, amendment of D07). */
export const STILL_FORMATS = Object.freeze({
  png: { mediaType: 'image/png', extension: 'png' },
  jpeg: { mediaType: 'image/jpeg', extension: 'jpg' },
  webp: { mediaType: 'image/webp', extension: 'webp' },
} as const);
export type StillFormat = keyof typeof STILL_FORMATS;

/** A still format, or `still-format-unsupported`. */
export function checkedStillFormat(name: string): StillFormat {
  if (!Object.hasOwn(STILL_FORMATS, name)) {
    throw new ProducerError(
      'still-format-unsupported',
      `A still frame is one of ${Object.keys(STILL_FORMATS).join(', ')}, got ${JSON.stringify(name)}.`,
    );
  }
  return name as StillFormat;
}

/**
 * The arguments that encode one PNG on `pipe:0` as JPEG or WebP on `pipe:1`
 * (D47.7), with fixed quality settings: JPEG at `-q:v 2` in BT.601 full range
 * 4:4:4, the colours JFIF defines; WebP lossy at quality 90 from BGRA.
 */
export function stillArgs(
  format: Exclude<StillFormat, 'png'>,
  size: { readonly width: number; readonly height: number },
): string[] {
  const scale = `scale=${String(size.width)}:${String(size.height)}:flags=lanczos`;
  const encoder =
    format === 'jpeg'
      ? [
          ...[
            '-filter_complex',
            `[0:v]${scale}:out_color_matrix=bt601:out_range=pc,format=yuv444p[v]`,
          ],
          ...['-map', '[v]', '-frames:v', '1'],
          ...['-c:v', 'mjpeg', '-q:v', '2', '-color_range', 'pc', '-huffman', 'optimal'],
          ...['-threads', '1'],
        ]
      : [
          ...['-filter_complex', '[0:v]format=bgra[v]'],
          ...['-map', '[v]', '-frames:v', '1'],
          ...['-c:v', 'libwebp', '-lossless', '0', '-quality', '90', '-compression_level', '4'],
          ...['-preset', 'none', '-threads', '1'],
        ];
  return [
    ...['-hide_banner', '-nostdin', '-loglevel', 'error', '-threads', '1'],
    ...['-f', 'png_pipe', '-i', 'pipe:0', '-filter_complex_threads', '1'],
    ...encoder,
    ...BITEXACT,
    ...['-flags:v', '+bitexact'],
    ...['-f', format === 'jpeg' ? 'mjpeg' : 'webp', 'pipe:1'],
  ];
}

/** The audio range of a frame range at 48 kHz (D29.6's rounding, D47.4). */
export function audioRangeOf(range: FrameRange, samplesAt: (timeUs: number) => number): AudioRange {
  const startSample = samplesAt(range.fromUs);
  return { startSample, sampleCount: samplesAt(range.toUs) - startSample };
}

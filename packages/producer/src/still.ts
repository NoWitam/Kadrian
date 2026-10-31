/**
 * Still frames (D47.7, amendment of D07): one frame time of a composition,
 * rendered by the frame loop of `renderFrames` (D28). A PNG is the captured
 * bytes, unchanged; a JPEG or a WebP is those bytes encoded by the pinned
 * FFmpeg with fixed quality settings, on pipes, so the Producer still writes
 * no file. The manifest names the frame, the output, and the encoder.
 */
import type { AssetResolver } from '@kadrion/renderer-dom';

import { asProducerError, ProducerError } from './errors.js';
import type { LaunchedChromium } from './environment.js';
import {
  FFMPEG_ARCHIVE_SHA256,
  FFMPEG_ASSET,
  FFMPEG_RELEASE,
  FFMPEG_URL,
  pinnedFfmpeg,
  type FfmpegPaths,
  type FfmpegTools,
} from './ffmpeg.js';
import { checkDocumentLimits, failure, throwIfCancelled, type JobOptions } from './job.js';
import { EXPORT_MANIFEST_VERSION, sha256, type StillManifest } from './manifest.js';
import {
  frameIndexOf,
  renderFrames,
  validated,
  type RenderResult,
  type RenderTimeouts,
} from './render.js';
import type { RuntimeBuild } from './runtime.js';
import { checkedStillFormat, STILL_FORMATS, stillArgs, type StillFormat } from './segments.js';

export interface StillRequest extends RenderTimeouts, JobOptions {
  readonly document: unknown;
  readonly resolveAsset: AssetResolver;
  /** A frame time of the composition (D13.2). */
  readonly timeUs: number;
  /** `png`, `jpeg`, or `webp`. */
  readonly format: string;
  /** The pinned executables; required for `jpeg` and `webp`, unused for `png`. */
  readonly ffmpeg?: FfmpegPaths;
  readonly chromium?: LaunchedChromium;
  readonly runtime?: RuntimeBuild;
  /** How long FFmpeg may take to encode the frame. */
  readonly encoderTimeoutMs?: number;
}

export interface StillResult {
  readonly format: StillFormat;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
  readonly manifest: StillManifest;
}

/** What a still runs on; tests pass fakes (not exported by the package). */
export interface StillDependencies {
  readonly render: (request: Parameters<typeof renderFrames>[0]) => Promise<RenderResult>;
  readonly tools: (paths: FfmpegPaths) => Promise<FfmpegTools>;
}

/** `renderStill` on the given dependencies. */
export async function renderStillWith(
  request: StillRequest,
  dependencies: StillDependencies,
): Promise<StillResult> {
  try {
    return await stillOf(request, dependencies);
  } catch (reason) {
    throw failure(reason, request.signal);
  }
}

async function stillOf(
  request: StillRequest,
  dependencies: StillDependencies,
): Promise<StillResult> {
  const { signal } = request;
  // Everything that can be checked before a page opens is checked first.
  throwIfCancelled(signal);
  const format = checkedStillFormat(request.format);
  const composition = validated(request.document);
  frameIndexOf(composition, request.timeUs);
  checkDocumentLimits(request.limits, composition, 1);
  let tools: FfmpegTools | null = null;
  if (format !== 'png') {
    if (request.ffmpeg === undefined) {
      throw new ProducerError(
        'ffmpeg-missing',
        `A ${format} still is encoded by the pinned FFmpeg, and no paths were given.`,
      );
    }
    tools = await dependencies.tools(request.ffmpeg);
  }
  const rendered = await dependencies.render({
    document: request.document,
    resolveAsset: request.resolveAsset,
    timesUs: [request.timeUs],
    ...(request.chromium === undefined ? {} : { chromium: request.chromium }),
    ...(request.runtime === undefined ? {} : { runtime: request.runtime }),
    ...(request.ackTimeoutMs === undefined ? {} : { ackTimeoutMs: request.ackTimeoutMs }),
    ...(request.pageTimeoutMs === undefined ? {} : { pageTimeoutMs: request.pageTimeoutMs }),
    ...(request.presentationTimeoutMs === undefined
      ? {}
      : { presentationTimeoutMs: request.presentationTimeoutMs }),
    ...(signal === undefined ? {} : { signal }),
    ...(request.onProgress === undefined ? {} : { onProgress: request.onProgress }),
    ...(request.limits === undefined ? {} : { limits: request.limits }),
  });
  const [frame] = rendered.frames;
  if (frame === undefined) throw new ProducerError('page-error', 'The render returned no frame.');
  let bytes = frame.png;
  let args: string[] | null = null;
  if (tools !== null && format !== 'png') {
    args = stillArgs(format, composition);
    throwIfCancelled(signal);
    const result = await tools
      .run(args, frame.png, request.encoderTimeoutMs ?? 30_000, signal)
      .catch((reason: unknown) => {
        throw asProducerError(reason);
      });
    throwIfCancelled(signal);
    if (result.code !== 0 || result.stdout.length === 0) {
      throw new ProducerError(
        'encode-failed',
        `FFmpeg could not encode the still as ${format} (exit ${String(result.code)}): ${result.stderr.trim()}`,
      );
    }
    bytes = result.stdout;
  }
  const { mediaType } = STILL_FORMATS[format];
  const { preset, ...base } = rendered.manifest;
  const identity = tools?.identity;
  const manifest: StillManifest = {
    ...base,
    manifestVersion: EXPORT_MANIFEST_VERSION,
    kind: 'still',
    preset: { ...preset, name: `still-${format}` },
    output: { mediaType, sha256: sha256(bytes) },
    ffmpeg:
      identity === undefined || args === null
        ? null
        : {
            release: FFMPEG_RELEASE,
            asset: FFMPEG_ASSET,
            url: FFMPEG_URL,
            archiveSha256: FFMPEG_ARCHIVE_SHA256,
            ffmpegSha256: identity.ffmpegSha256,
            ffprobeSha256: identity.ffprobeSha256,
            version: identity.version,
            configuration: identity.configuration,
            encoders: identity.encoders,
            args,
          },
  };
  return { format, mediaType, bytes, manifest };
}

/**
 * Renders one frame time of `document` as a still image (D47.7): PNG as
 * captured, JPEG or WebP encoded by the pinned FFmpeg.
 */
export function renderStill(request: StillRequest): Promise<StillResult> {
  return renderStillWith(request, {
    render: renderFrames,
    tools: (paths) => pinnedFfmpeg(paths),
  });
}

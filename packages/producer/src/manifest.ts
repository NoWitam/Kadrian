/**
 * The render manifest (specification §8, D28.7): what makes "pinned"
 * observable. It holds no wall-clock value, so the manifest of a render is as
 * reproducible as its frames.
 */
import { createHash } from 'node:crypto';

import type { EnvironmentManifest } from './environment.js';

/**
 * 2 since PR-07: `environment.network` (D28.9) and the export manifest (D29.9);
 * 3 since PR-28a: `video` (D50.5).
 */
export const MANIFEST_VERSION = 3;

/**
 * The version of the manifests of a segmented render (D47.8): segments, audio,
 * export, and still. 3 since PR-25a, 4 since PR-28a (`video`, D50.5), 5 since
 * PR-29 (the sounds of the mix, D52.5); a render of frames keeps `MANIFEST_VERSION`.
 */
export const EXPORT_MANIFEST_VERSION = 5;

/** `sha256:` and 64 lowercase hex digits of the bytes, the format of D14. */
export function sha256(bytes: Uint8Array | string): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/**
 * JSON with object keys sorted by UTF-16 code units, arrays in order, and no
 * whitespace; numbers and strings as `JSON.stringify` writes them. A validated
 * document holds only JSON values (D16), so this is total over it.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const record = value as Readonly<Record<string, unknown>>;
    const entries = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${entries.join(',')}}`;
  }
  // `undefined` for a function, a symbol, or `undefined`, which no JSON document holds.
  const text = JSON.stringify(value) as string | undefined;
  if (text === undefined) throw new TypeError('A document holds JSON values only.');
  return text;
}

export interface ManifestAsset {
  readonly id: string;
  readonly type: string;
  readonly mediaType: string;
  readonly contentHash: string;
  /** The family a font is registered under (D22.6, D27.1). */
  readonly family?: string;
}

export interface ManifestFrame {
  readonly index: number;
  readonly timeUs: number;
  /** SHA-256 of the PNG bytes of the frame. */
  readonly sha256: string;
}

export interface RenderManifest {
  readonly manifestVersion: number;
  readonly compositionHash: string;
  readonly schemaVersion: string;
  readonly runtime: {
    readonly contentHash: string;
    readonly bundler: string;
    readonly compiler: string;
  };
  readonly chromium: {
    readonly playwrightCore: string;
    readonly revision: string;
    readonly expectedVersion: string;
    readonly reportedVersion: string;
    readonly channel: string;
    readonly args: readonly string[];
  };
  readonly environment: EnvironmentManifest;
  readonly assets: readonly ManifestAsset[];
  readonly preset: {
    readonly name: 'frames-png';
    readonly width: number;
    readonly height: number;
    readonly fps: number;
    readonly deviceScaleFactor: number;
  };
  readonly durationUs: number;
  /** Frames of the composition, not of this render (D13.2). */
  readonly frameCount: number;
  readonly frames: readonly ManifestFrame[];
  /**
   * What Custom HTML frames tried to load: blocked by the page policy and aborted
   * by the Producer, recorded without failing the render (D28.1).
   */
  readonly blockedRequests: readonly string[];
  /** How the frames of video nodes were decoded, or `null` without video nodes (D50.5). */
  readonly video: ManifestVideo | null;
  /** A render of frames runs no FFmpeg encoder; an export records it (D29.9). */
  readonly ffmpeg: null;
}

/** One video asset a node samples, with the media facts the run read from it (D49.6, D50.5). */
export interface ManifestVideoSource {
  readonly assetId: string;
  readonly contentHash: string;
  readonly width: number;
  readonly height: number;
  readonly frames: number;
  /** `num/den` seconds per tick. */
  readonly timeBase: string;
  readonly sourceDurationUs: number;
}

/**
 * How the frames of the video nodes were made (D50.5): the pinned FFmpeg that
 * decoded them, its arguments with the path written as `<input>`, and every
 * source. `null` for a composition without video nodes.
 */
export interface ManifestVideo {
  readonly decoder: ManifestFfmpegBuild;
  readonly decodeArgs: readonly string[];
  readonly sources: readonly ManifestVideoSource[];
}

/** The pinned FFmpeg a run verified (D29.1). */
export interface ManifestFfmpegBuild {
  readonly release: string;
  readonly asset: string;
  readonly url: string;
  readonly archiveSha256: string;
  readonly ffmpegSha256: string;
  readonly ffprobeSha256: string;
  readonly version: string;
  readonly configuration: string;
  readonly encoders: readonly string[];
}

/**
 * The pinned FFmpeg of an export and what each of its processes was asked to do
 * (D29.4, D47): the arguments of a segment, of the audio pass (`null` without
 * audio), and of the join, each with its paths written as placeholders.
 */
export interface ManifestFfmpeg extends ManifestFfmpegBuild {
  readonly segmentArgs: readonly string[];
  readonly audioArgs: readonly string[] | null;
  readonly joinArgs: readonly string[];
}

/** A fade of a sound, in samples from the first sample the output hears of it (D52.5). */
export interface ManifestFade {
  readonly startSample: number;
  readonly sampleCount: number;
}

/** One sound of the mix (D52.5): what is heard, where, from which sample of which source. */
export interface ManifestSound {
  /** `clip` for an audio clip, `video` for the sound of a video node. */
  readonly kind: 'clip' | 'video';
  /** The clip's or the video node's ID. */
  readonly id: string;
  readonly assetId: string;
  readonly assetHash: string;
  readonly volume: number;
  /** The output sample where it starts, and how many output samples hear it. */
  readonly startSample: number;
  readonly sampleCount: number;
  /** The sample of its source, at `sampleRate`, heard at `startSample`. */
  readonly sourceStartSample: number;
  readonly fadeIn: ManifestFade | null;
  readonly fadeOut: ManifestFade | null;
}

/** The audio mix of D52.5, in samples at 48 kHz, and the intermediate it was encoded from (D47.4). */
export interface ManifestAudio {
  readonly sampleRate: number;
  readonly totalSamples: number;
  /** Every sound of the mix, in the order of the audio plan. */
  readonly sounds: readonly ManifestSound[];
  /** The samples of the range, from the composition's first: what the output holds. */
  readonly rangeStartSample: number;
  readonly rangeSampleCount: number;
  readonly channelLayout: string;
  readonly codec: string;
  readonly bitrate: string;
  /** The lossless intermediate of the audio pass: its codec, container, and SHA-256. */
  readonly intermediate: {
    readonly codec: string;
    readonly format: string;
    readonly sha256: string;
  };
}

/** A range of the grid, in microseconds and frames (D47.2). */
export interface ManifestRange {
  readonly fromUs: number;
  readonly toUs: number;
  readonly firstFrame: number;
  readonly frameCount: number;
}

/** One encoded segment (D47.3): its frames and the SHA-256 of its file. */
export interface ManifestSegment {
  readonly index: number;
  readonly firstFrame: number;
  readonly frameCount: number;
  /** The file's name, relative to the manifest's directory. */
  readonly file: string;
  readonly sha256: string;
}

/** The MP4 preset of D29.5, as an export and its segments record it. */
export interface ManifestMp4Preset {
  readonly name: 'mp4-1080p' | 'mp4-720p';
  readonly width: number;
  readonly height: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly fps: number;
  readonly deviceScaleFactor: number;
  readonly videoGraph: string;
}

/** The one block that names the render environment (D29.9). */
export interface RenderIdentity {
  /** The digest of the declared pinned image (D26.2), or `null` when the run is not pinned. */
  readonly playwrightImageDigest: string | null;
  readonly playwrightVersion: string;
  readonly chromiumRevision: string;
  readonly ffmpegSha256: string;
  readonly ffprobeSha256: string;
  readonly ffmpegVersion: string;
  readonly ffmpegBuildConfiguration: string;
}

/** The identity of FFmpeg alone, for a pass that runs no browser (D47.4). */
export type FfmpegIdentityBlock = Pick<
  RenderIdentity,
  'ffmpegSha256' | 'ffprobeSha256' | 'ffmpegVersion' | 'ffmpegBuildConfiguration'
>;

/**
 * The manifest of a range of segments (D47.3, D47.8): the render manifest with
 * the preset, the segment length, the range, one entry per segment file, the
 * frames FFmpeg read, and the FFmpeg that encoded them.
 */
export interface SegmentsManifest extends Omit<RenderManifest, 'preset' | 'ffmpeg'> {
  readonly kind: 'segments';
  readonly preset: ManifestMp4Preset;
  readonly segmentFrames: number;
  readonly range: ManifestRange;
  readonly segments: readonly ManifestSegment[];
  readonly ffmpeg: ManifestFfmpegBuild & { readonly segmentArgs: readonly string[] };
  readonly identity: RenderIdentity;
}

/** The audio of a range, or `null` for a composition without an audio clip (D47.4). */
export interface ManifestAudioPass {
  readonly sampleRate: number;
  readonly totalSamples: number;
  readonly sounds: readonly ManifestSound[];
  readonly rangeStartSample: number;
  readonly rangeSampleCount: number;
  readonly channelLayout: string;
  readonly codec: string;
  readonly format: string;
  /** The intermediate's name, relative to the manifest's directory. */
  readonly file: string;
  readonly sha256: string;
}

/** The manifest of the audio pass (D47.4, D47.8). It needs no browser, so it names none. */
export interface AudioManifest {
  readonly manifestVersion: number;
  readonly kind: 'audio';
  readonly compositionHash: string;
  readonly schemaVersion: string;
  readonly durationUs: number;
  readonly frameCount: number;
  readonly fps: number;
  readonly range: ManifestRange;
  readonly audio: ManifestAudioPass | null;
  readonly ffmpeg: ManifestFfmpegBuild & { readonly audioArgs: readonly string[] | null };
  readonly identity: FfmpegIdentityBlock;
}

/**
 * The manifest of an MP4 (D29.9, D47.8): the render manifest with FFmpeg,
 * audio, identity, the range it holds, and the segments it was joined from. A
 * one-pass export and a join of the same segments write the same manifest.
 */
export interface ExportManifest extends Omit<RenderManifest, 'preset' | 'ffmpeg'> {
  readonly kind: 'export';
  readonly preset: ManifestMp4Preset;
  readonly segmentFrames: number;
  readonly range: ManifestRange;
  readonly segments: readonly Omit<ManifestSegment, 'file'>[];
  readonly ffmpeg: ManifestFfmpeg;
  readonly audio: ManifestAudio | null;
  readonly identity: RenderIdentity;
}

/** The manifest of a still frame (D47.7): the render manifest of its one frame, and the output. */
export interface StillManifest extends Omit<RenderManifest, 'preset' | 'ffmpeg'> {
  readonly kind: 'still';
  readonly preset: {
    readonly name: 'still-png' | 'still-jpeg' | 'still-webp';
    readonly width: number;
    readonly height: number;
    readonly fps: number;
    readonly deviceScaleFactor: number;
  };
  readonly output: { readonly mediaType: string; readonly sha256: string };
  /** `null` for PNG, which is the captured bytes; else the FFmpeg that encoded them. */
  readonly ffmpeg: (ManifestFfmpegBuild & { readonly args: readonly string[] }) | null;
}

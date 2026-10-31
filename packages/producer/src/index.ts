/**
 * @kadrion/producer — Chromium/FFmpeg render orchestration.
 *
 * `renderFrames` renders frame times of a document to PNG in the pinned
 * Chromium and returns them with the render manifest (D26, D28). The launch,
 * the presentation barrier, and the capture are exported as well, because the
 * Player's browser test measures through exactly the same functions (D28.5).
 * `exportMp4` streams every frame of the grid into the pinned FFmpeg and writes an
 * H.264 MP4 with the audio clip muxed (D29), as segments of the canonical grid
 * joined into one file (D47). `renderSegments`, `renderAudio`, and
 * `joinSegments` are the same export split into jobs a host runs on its own
 * queue; `renderStill` renders one frame as PNG, JPEG, or WebP (D47.7).
 */
export { PRODUCER_AGENT_SCRIPT } from './agent.js';
export { awaitPresented, captureFrame, presentationSessions } from './capture.js';
export type { PresentationSessions } from './capture.js';
export {
  CHROMIUM_ARGS,
  CHROMIUM_CHANNEL,
  CHROMIUM_REVISION,
  CHROMIUM_VERSION,
  DEVICE_SCALE_FACTOR,
  LOCALE,
  PINNED_IMAGE,
  PINNED_IMAGE_VARIABLE,
  PINNED_PLATFORM,
  PLAYWRIGHT_CORE_VERSION,
  TIMEZONE,
  contextOptions,
  environmentManifest,
  goldenRefusal,
  installedPlaywright,
  isPinned,
  launchChromium,
  networkFacts,
} from './environment.js';
export type {
  EnvironmentFacts,
  EnvironmentManifest,
  LaunchedChromium,
  NetworkFacts,
  LaunchOptions,
} from './environment.js';
export { ProducerError } from './errors.js';
export {
  AUDIO_FILE_NAME,
  exportMp4,
  joinPlan,
  joinSegments,
  renderAudio,
  renderSegments,
} from './export.js';
export type {
  AudioRequest,
  AudioResult,
  ExportRequest,
  ExportResult,
  ExportStats,
  JoinPart,
  JoinPlan,
  JoinRequest,
  JoinResult,
  JoinSegment,
  RangeRequest,
  SegmentsRequest,
  SegmentsResult,
} from './export.js';
export {
  checkedSegmentFrames,
  DEFAULT_SEGMENT_FRAMES,
  frameRange,
  MAX_SEGMENT_FRAMES,
  PARTIAL_SUFFIX,
  rangeSegmentsOf,
  segmentFileName,
  segmentsOf,
  STILL_FORMATS,
} from './segments.js';
export type { FrameRange, Segment, StillFormat } from './segments.js';
export { renderStill } from './still.js';
export type { StillRequest, StillResult } from './still.js';
export {
  FFMPEG_ARCHIVE_SHA256,
  FFMPEG_ASSET,
  FFMPEG_DOWNLOAD_URL,
  FFMPEG_RELEASE,
  FFMPEG_SHA256,
  FFMPEG_URL,
  FFPROBE_SHA256,
  verifyFfmpeg,
} from './ffmpeg.js';
export type { FfmpegIdentity, FfmpegPaths } from './ffmpeg.js';
export type { ProducerErrorCode } from './errors.js';
export { canonicalJson, EXPORT_MANIFEST_VERSION, MANIFEST_VERSION, sha256 } from './manifest.js';
export type {
  AudioManifest,
  ExportManifest,
  FfmpegIdentityBlock,
  ManifestAsset,
  ManifestAudio,
  ManifestAudioPass,
  ManifestFfmpeg,
  ManifestFfmpegBuild,
  ManifestFrame,
  ManifestMp4Preset,
  ManifestRange,
  ManifestSegment,
  RenderIdentity,
  RenderManifest,
  SegmentsManifest,
  StillManifest,
} from './manifest.js';
export { frameIndexOf, hostDocument, openRenderSession, renderFrames } from './render.js';
export type {
  RenderedFrame,
  RenderRequest,
  RenderResult,
  RenderSession,
  RenderSessionOptions,
  RenderTimeouts,
} from './render.js';
export { loadRuntimeBuild, verifiedScript } from './runtime.js';
export type { RuntimeBuild } from './runtime.js';

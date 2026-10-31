/**
 * @kadrion/cli — local rendering and diagnostics.
 *
 * `runCli` implements `kadrion render-frames` (D28.8) and `kadrion export` (D29.10)
 * on top of the Producer's `renderFrames` and `exportMp4`, the jobs of a
 * segmented render `render-range`, `render-audio`, and `join`, and
 * `render-still` (D47), and `kadrion
 * fetch-ffmpeg` and `kadrion doctor` for a host's worker (D45); `bin.ts` is the
 * executable.
 */
export {
  AUDIO_MANIFEST_NAME,
  EXIT_NOT_REFERENCE,
  EXIT_OK,
  EXIT_PRODUCER_ERROR,
  EXIT_USAGE,
  exportFileNames,
  FFMPEG_VARIABLE,
  FFPROBE_VARIABLE,
  frameFileName,
  parseAssetMap,
  parseTimes,
  runCli,
  segmentsManifestName,
  stillFileNames,
  USAGE,
} from './cli.js';
export type {
  CliHosts,
  CliIo,
  Doctor,
  Export,
  FetchFfmpeg,
  Join,
  Render,
  RenderAudio,
  RenderRange,
  RenderStill,
} from './cli.js';
export { DOCTOR_CHECKS, DOCTOR_REPORT_VERSION, runDoctor, systemDoctorHost } from './doctor.js';
export type { DoctorCheck, DoctorCheckId, DoctorHost, DoctorReport } from './doctor.js';
export { fetchFfmpeg } from './fetch-ffmpeg.js';
export type { FetchFfmpegOptions } from './fetch-ffmpeg.js';
export {
  archiveMembers,
  chooseDecompressor,
  extractArchive,
  FFMPEG_INSTALL_ERROR_CODES,
  FfmpegInstallError,
  installFfmpeg,
  PYTHON_LZMA,
  PYTHON_LZMA_SCRIPT,
  tarArguments,
  XZ,
} from './ffmpeg-install.js';
export type {
  Decompressor,
  FfmpegInstallErrorCode,
  InstallOptions,
  Installed,
  Probe,
  Spawn,
  SpawnedProcess,
} from './ffmpeg-install.js';

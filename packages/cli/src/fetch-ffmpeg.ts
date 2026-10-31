/**
 * `kadrion fetch-ffmpeg` (D45): the fetch-and-verify step of the pinned FFmpeg
 * (D29.1) for a host's worker. It downloads the pinned archive from
 * `FFMPEG_DOWNLOAD_URL` unless a verified one is cached, accepts it only with
 * `FFMPEG_ARCHIVE_SHA256`, and installs `bin/ffmpeg`, `bin/ffprobe`, and
 * `LICENSE.txt` into `<dir>/<release>/` only when both binaries hash to their
 * pins. Kadrion does not ship these binaries in its packages (D29.2, D45): the
 * host fetches them, and the render that uses them runs without a network.
 */
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import {
  FFMPEG_ARCHIVE_SHA256,
  FFMPEG_ASSET,
  FFMPEG_DOWNLOAD_URL,
  FFMPEG_RELEASE,
  FFMPEG_SHA256,
  FFPROBE_SHA256,
} from '@kadrion/producer';

import { FfmpegInstallError, installFfmpeg, type Installed } from './ffmpeg-install.js';

export interface FetchFfmpegOptions {
  /** The cache directory; the binaries land in `<dir>/<release>/bin/`. */
  readonly dir: string;
  readonly log: (line: string) => void;
  /** The archive's bytes; by default fetched from `FFMPEG_DOWNLOAD_URL`. */
  readonly download?: () => Promise<Uint8Array>;
}

async function downloadPinnedArchive(): Promise<Uint8Array> {
  const response = await fetch(FFMPEG_DOWNLOAD_URL);
  if (!response.ok) {
    throw new FfmpegInstallError(
      'download-failed',
      `The download answered ${String(response.status)}.`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Installs the pinned FFmpeg into `<dir>/<release>/`, or reuses a verified installation. */
export function fetchFfmpeg(options: FetchFfmpegOptions): Promise<Installed> {
  const download = options.download ?? downloadPinnedArchive;
  return installFfmpeg({
    cache: resolve(options.dir),
    asset: FFMPEG_ASSET,
    release: FFMPEG_RELEASE,
    archiveSha256: FFMPEG_ARCHIVE_SHA256,
    ffmpegSha256: FFMPEG_SHA256,
    ffprobeSha256: FFPROBE_SHA256,
    async download() {
      options.log(`Downloading ${FFMPEG_DOWNLOAD_URL}`);
      return download();
    },
    probe: (command, args) => {
      const result = spawnSync(command, [...args], { stdio: 'ignore' });
      return result.error === undefined && result.status === 0;
    },
    spawn: (command, args, spawnOptions) =>
      spawn(command, [...args], { cwd: spawnOptions.cwd, stdio: [...spawnOptions.stdio] }),
    log: options.log,
  });
}

/**
 * `node --run ffmpeg:fetch` (D29.1, amended by PR-36): installs the pinned FFmpeg build into
 * `.kadrion-cache/ffmpeg/<release>/` unless a verified installation is there,
 * refuses an archive or binaries with other checksums, and prints the two
 * paths to mount read-only into the pinned container. It needs a network; the
 * render that uses the binaries does not (D28.9). Since PR-26 the installation
 * is `fetchFfmpeg` of `@kadrion/cli`, the step a host runs as
 * `kadrion fetch-ffmpeg` (D45); this script adds the repository's cache
 * directory and, in GitHub Actions, leaves
 * `.kadrion-out/diagnostics/pinned-ffmpeg.json` on a failure
 * (`tests/ci/diagnostic.ts`), which is never evidence.
 */
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { FfmpegInstallError, fetchFfmpeg } from '@kadrion/cli';
import { FFMPEG_SHA256, FFPROBE_SHA256 } from '@kadrion/producer';

import { writeCiDiagnostic } from '../ci/diagnostic.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));

try {
  const installed = await fetchFfmpeg({
    dir: fileURLToPath(new URL('../../.kadrion-cache/ffmpeg/', import.meta.url)),
    log: (line) => {
      console.log(line);
    },
  });
  console.log(`ffmpeg ${installed.ffmpeg} ${FFMPEG_SHA256}`);
  console.log(`ffprobe ${installed.ffprobe} ${FFPROBE_SHA256}`);
} catch (reason) {
  const code = reason instanceof FfmpegInstallError ? reason.code : 'unexpected';
  // The error first: a diagnostic that cannot be written must not hide it.
  console.error(
    `Refusing the FFmpeg build (${code}): ${reason instanceof Error ? reason.message : String(reason)} See docs/adr/D29-mp4-export.md, 29.1.`,
  );
  process.exitCode = 1;
  writeCiDiagnostic(root, 'pinned-ffmpeg', code, process.env);
}

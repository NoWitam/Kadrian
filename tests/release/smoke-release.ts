/**
 * `node --experimental-strip-types tests/release/smoke-release.ts --dir <dir> [--render] [--flow --ffmpeg-dir <dir>] [--keep]`
 * (D45): installs the release in `<dir>` into a clean project outside the
 * workspace and runs the smoke test of `smoke.ts`. `--render` also renders one
 * frame, which needs the pinned Chromium. `--flow` also runs the host flow of
 * `host-flow.ts` (PR-43), which needs the pinned Chromium and installs the
 * pinned FFmpeg into `--ffmpeg-dir` with `kadrion fetch-ffmpeg`, or reuses
 * the verified archive or installation there.
 */
import process from 'node:process';
import { parseArgs } from 'node:util';

import { smokeRelease } from './smoke.ts';

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    render: { type: 'boolean', default: false },
    keep: { type: 'boolean', default: false },
    flow: { type: 'boolean', default: false },
    'ffmpeg-dir': { type: 'string' },
  },
  strict: true,
});

if (values.dir === undefined || values.flow !== (values['ffmpeg-dir'] !== undefined)) {
  console.error(
    'Usage: smoke-release.ts --dir <dir> [--render] [--flow --ffmpeg-dir <dir>] [--keep]',
  );
  process.exit(2);
}
const ffmpegDir = values['ffmpeg-dir'];

try {
  smokeRelease({
    dir: values.dir,
    render: values.render,
    keep: values.keep,
    ...(ffmpegDir === undefined ? {} : { flow: { ffmpegDir } }),
    log: (line) => {
      console.log(line);
    },
  });
  console.log('The release installs and runs.');
} catch (reason) {
  console.error(reason instanceof Error ? reason.message : String(reason));
  process.exitCode = 1;
}

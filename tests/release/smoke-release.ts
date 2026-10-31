/**
 * `node --experimental-strip-types tests/release/smoke-release.ts --dir <dir> [--render] [--keep]`
 * (D45): installs the release in `<dir>` into a clean project outside the
 * workspace and runs the smoke test of `smoke.ts`. `--render` also renders one
 * frame, which needs the pinned Chromium.
 */
import process from 'node:process';
import { parseArgs } from 'node:util';

import { smokeRelease } from './smoke.ts';

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    render: { type: 'boolean', default: false },
    keep: { type: 'boolean', default: false },
  },
  strict: true,
});

if (values.dir === undefined) {
  console.error('Usage: smoke-release.ts --dir <dir> [--render] [--keep]');
  process.exit(2);
}

try {
  smokeRelease({
    dir: values.dir,
    render: values.render,
    keep: values.keep,
    log: (line) => {
      console.log(line);
    },
  });
  console.log('The release installs and runs.');
} catch (reason) {
  console.error(reason instanceof Error ? reason.message : String(reason));
  process.exitCode = 1;
}

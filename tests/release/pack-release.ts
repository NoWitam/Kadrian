/**
 * `node --experimental-strip-types tests/release/pack-release.ts --tag v0.1.0 --out <dir>`
 * (D45): packs every shipped package of the built workspace into `<dir>` and
 * writes `kadrion-release.json`. The tag must be `v` and the one version of
 * the packages. The commit comes from `GITHUB_SHA` or `git rev-parse HEAD`.
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { packRelease } from './release.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
const { values } = parseArgs({
  options: { tag: { type: 'string' }, out: { type: 'string' } },
  strict: true,
});

if (values.tag === undefined || values.out === undefined) {
  console.error('Usage: pack-release.ts --tag v<version> --out <dir>');
  process.exit(2);
}

const commit =
  process.env.GITHUB_SHA ??
  spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();

try {
  const manifest = packRelease({ root, out: values.out, tag: values.tag, commit });
  for (const entry of manifest.packages) console.log(`${entry.file} ${entry.sha256}`);
  console.log(`kadrion-release.json ${manifest.tag} ${manifest.commit}`);
} catch (reason) {
  console.error(reason instanceof Error ? reason.message : String(reason));
  process.exitCode = 1;
}

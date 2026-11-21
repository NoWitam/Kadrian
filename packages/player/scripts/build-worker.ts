/**
 * Builds the module of the conversion worker (D87.2): `dist/convert-worker.js`
 * and every module it imports, the turn of D81 included, bundled into
 * one module without an import, `dist/worker/kadrion-convert-worker.js`. A
 * worker does not see the import map of the page that starts it, so it must
 * not import a package by name. `node --run build` runs it after `tsc -b`,
 * because its input is the output of `tsc`. A host's bundler may bundle the
 * file again; it imports nothing, so nothing changes.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, type BuildOptions } from 'esbuild';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

/** Where the worker's bundle is written; `pool.ts` names the same path. */
export const WORKER_FILE = join(
  repoRoot,
  'packages',
  'player',
  'dist',
  'worker',
  'kadrion-convert-worker.js',
);

/**
 * Every option that influences the bytes. The worker uses only the turn of
 * D81 from `@kadrion/renderer-dom`, so the package's name resolves to that
 * module alone, which imports nothing: the bundle holds the conversion and the
 * turn, not the renderer.
 */
export const WORKER_OPTIONS = {
  absWorkingDir: repoRoot,
  entryPoints: ['packages/player/dist/convert-worker.js'],
  alias: { '@kadrion/renderer-dom': './packages/renderer-dom/dist/video-orientation.js' },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: false,
  sourcemap: false,
  legalComments: 'none',
  charset: 'utf8',
  write: false,
  logLevel: 'silent',
} as const satisfies BuildOptions;

/** Bundles the worker in memory; nothing is written. */
export async function bundleWorker(): Promise<Uint8Array> {
  const result = await build(WORKER_OPTIONS);
  const [output, ...rest] = result.outputFiles;
  if (output === undefined || rest.length > 0) {
    throw new Error('The worker build must produce exactly one file.');
  }
  return output.contents;
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  resolve(invokedPath).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
) {
  const bytes = await bundleWorker();
  mkdirSync(dirname(WORKER_FILE), { recursive: true });
  writeFileSync(WORKER_FILE, bytes);
  console.log(`kadrion-convert-worker.js (${String(bytes.byteLength)} bytes)`);
}

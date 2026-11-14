/**
 * Builds the runtime build artifact (D21): one classic script that Player and
 * Producer load byte for byte, and a manifest that records its content hash.
 * `node --run build` runs it after `tsc -b`, because its input is the output of
 * `tsc`. The tests import `bundleRuntime` and `BUNDLE_OPTIONS` from here, so
 * the build and its checks cannot drift apart.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, version, type BuildOptions } from 'esbuild';
import typescript from 'typescript';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

export const OUTPUT_DIRECTORY = join(repoRoot, 'packages', 'renderer-dom', 'dist', 'runtime-build');
export const ARTIFACT_FILE = 'kadrion-runtime.js';
export const MANIFEST_FILE = 'kadrion-runtime.json';

/**
 * The licence record that travels with the build (D37, D84.8). The bundle
 * keeps no comment of its sources (`legalComments: 'none'`), so the MIT notice
 * of the Brotli static dictionary, which the build holds deflated in the
 * module of `packages/runtime/dist/brotli-dictionary.js`, is written as a
 * banner, the first bytes of the artifact. A banner, and not kept legal
 * comments, so that the build carries this one record and no legal comment of
 * a source or a future dependency enters it unseen; `runtime-build.test.ts`
 * holds its notice to the header of the generated module, word for word.
 */
export const LICENCE_BANNER = `/*
 * The Kadrion runtime build (D21). It holds the static dictionary of Brotli
 * (RFC 7932, appendix A), from the Brotli project of Google,
 * https://github.com/google/brotli, under this notice (D84.8):
 *
 * Copyright (c) 2009, 2010, 2013-2016 by the Brotli Authors.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */`;

/**
 * Every option that influences the bytes. Paths in the output are relative to
 * the repository root, so the artifact does not depend on where the repository
 * is checked out.
 */
export const BUNDLE_OPTIONS = {
  absWorkingDir: repoRoot,
  entryPoints: ['packages/renderer-dom/dist/page.js'],
  bundle: true,
  format: 'iife',
  globalName: 'KadrionRuntime',
  platform: 'browser',
  target: 'es2022',
  minify: false,
  sourcemap: false,
  legalComments: 'none',
  banner: { js: LICENCE_BANNER },
  charset: 'utf8',
  write: false,
  logLevel: 'silent',
} as const satisfies BuildOptions;

export interface RuntimeManifest {
  readonly file: string;
  readonly format: 'iife';
  readonly globalName: string;
  readonly byteLength: number;
  readonly bundler: string;
  /** The input is the output of `tsc`, so its version shapes the bytes as well. */
  readonly compiler: string;
  /** `sha256:` and the SHA-256 of the exact bytes, in the format of D14. */
  readonly contentHash: string;
}

export interface RuntimeBuild {
  readonly bytes: Uint8Array;
  readonly manifest: RuntimeManifest;
}

/** Bundles the page entry in memory; nothing is written. */
export async function bundleRuntime(): Promise<RuntimeBuild> {
  const result = await build(BUNDLE_OPTIONS);
  const [output, ...rest] = result.outputFiles;
  if (output === undefined || rest.length > 0) {
    throw new Error('The runtime build must produce exactly one file.');
  }
  const bytes = output.contents;
  return {
    bytes,
    manifest: {
      file: ARTIFACT_FILE,
      format: BUNDLE_OPTIONS.format,
      globalName: BUNDLE_OPTIONS.globalName,
      byteLength: bytes.byteLength,
      bundler: `esbuild@${version}`,
      compiler: `typescript@${typescript.version}`,
      contentHash: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    },
  };
}

async function writeRuntime(): Promise<void> {
  const { bytes, manifest } = await bundleRuntime();
  mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
  writeFileSync(join(OUTPUT_DIRECTORY, ARTIFACT_FILE), bytes);
  writeFileSync(join(OUTPUT_DIRECTORY, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${ARTIFACT_FILE} ${manifest.contentHash} (${String(manifest.byteLength)} bytes)`);
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  resolve(invokedPath).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
) {
  await writeRuntime();
}

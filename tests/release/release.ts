/**
 * The release of D45: one `pnpm pack` tarball per shipped package, and the
 * manifest `kadrion-release.json` that names each tarball by its SHA-256 and
 * its integrity, together with what the release validates and needs: the
 * schema version and the versions its migration accepts (D43), the runtime
 * build (D21), the pinned image (D26), and the pinned FFmpeg (D29.1).
 *
 * The functions that only read their arguments come first; `packRelease` runs
 * `pnpm pack` and `tar`, each through `spawnSync` without a shell. The entry
 * scripts are `pack-release.ts` and `smoke-release.ts`; the release workflow
 * runs them (`.github/workflows/release.yml`), and
 * `tests/repo/release.test.ts` packs every package in every `check`.
 *
 * Self-contained apart from the workspace packages, because the workflow runs it
 * with `--experimental-strip-types`.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  CHROMIUM_REVISION,
  CHROMIUM_VERSION,
  FFMPEG_ARCHIVE_SHA256,
  FFMPEG_ASSET,
  FFMPEG_DOWNLOAD_URL,
  FFMPEG_RELEASE,
  FFMPEG_SHA256,
  FFMPEG_URL,
  FFPROBE_SHA256,
  PINNED_IMAGE,
  PINNED_PLATFORM,
  PLAYWRIGHT_CORE_VERSION,
} from '@kadrion/producer';
import { SCHEMA_VERSION } from '@kadrion/schema';
import { SUPPORTED_SCHEMA_VERSIONS } from '@kadrion/schema/migrate';

export const RELEASE_MANIFEST_VERSION = 1;
export const RELEASE_MANIFEST_FILE = 'kadrion-release.json';

/**
 * The packages a release ships, in the order of their dependencies (D45.2).
 * `@kadrion/test-fixtures` is a development dependency only (D12) and is not
 * shipped.
 */
export const SHIPPED_PACKAGES = Object.freeze([
  'schema',
  'runtime',
  'renderer-dom',
  'player',
  'editor-sdk',
  'editor-session',
  'ai-sdk',
  'producer',
  'cli',
] as const);
export type ShippedPackage = (typeof SHIPPED_PACKAGES)[number];

/** The `files` of every shipped package: its build output without build state and source maps. */
export const SHIPPED_FILES = Object.freeze(['dist', '!dist/.tsbuildinfo', '!dist/**/*.map']);

/** A release version and its tag: `0.1.0` and `v0.1.0`. */
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** `@kadrion/editor-sdk` 0.1.0 is packed as `kadrion-editor-sdk-0.1.0.tgz`. */
export function tarballName(dir: string, version: string): string {
  return `kadrion-${dir}-${version}.tgz`;
}

/** Why a tag cannot release packages of these versions, or nothing. */
export function tagProblems(tag: string, versions: readonly string[]): string[] {
  const problems: string[] = [];
  const distinct = [...new Set(versions)];
  if (distinct.length !== 1) {
    problems.push(`the packages have more than one version: ${distinct.join(', ')}`);
  }
  const version = distinct[0] ?? '';
  if (!VERSION.test(version)) problems.push(`"${version}" is not a release version such as 0.1.0`);
  if (tag !== `v${version}`) problems.push(`the tag "${tag}" is not v${version}`);
  return problems;
}

interface PackedManifest {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly private?: unknown;
  readonly license?: unknown;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
}

/**
 * Why a packed tarball is not what D45.3 ships, or nothing: it holds only
 * `package.json` and build output, no source map and no build state; it stays
 * private and unlicensed (D37.3); and every Kadrion dependency names the exact
 * version of the same release, never a `workspace:` range.
 */
export function tarballProblems(
  dir: string,
  version: string,
  entries: readonly string[],
  packageJsonText: string,
): string[] {
  const problems: string[] = [];
  if (!entries.includes('package/package.json')) problems.push('it has no package.json');
  for (const entry of entries) {
    if (entry === 'package/package.json') continue;
    if (!entry.startsWith('package/dist/')) problems.push(`it holds ${entry}`);
    else if (entry.endsWith('.map') || entry.endsWith('.tsbuildinfo')) {
      problems.push(`it holds ${entry}`);
    }
  }
  if (packageJsonText.includes('workspace:'))
    problems.push('its package.json has a workspace range');
  const manifest = JSON.parse(packageJsonText) as PackedManifest;
  if (manifest.name !== `@kadrion/${dir}`) problems.push(`it is named ${String(manifest.name)}`);
  if (manifest.version !== version) problems.push(`it has the version ${String(manifest.version)}`);
  if (manifest.private !== true) problems.push('it is not private');
  if (manifest.license !== 'UNLICENSED') problems.push('it is not UNLICENSED');
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies'] as const) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      if (!name.startsWith('@kadrion/')) continue;
      const target = name.slice('@kadrion/'.length);
      if (!(SHIPPED_PACKAGES as readonly string[]).includes(target)) {
        problems.push(`its ${field} name ${name}, which is not shipped`);
      }
      if (range !== version) problems.push(`its ${field} give ${name} the range ${range}`);
    }
  }
  return problems;
}

export interface ReleasedPackage {
  readonly name: string;
  readonly version: string;
  readonly file: string;
  readonly size: number;
  /** `sha256:<hex>`, as every other hash of Kadrion. */
  readonly sha256: string;
  /** `sha512-<base64>`, the form a lockfile records. */
  readonly integrity: string;
}

export interface ReleaseManifest {
  readonly manifestVersion: typeof RELEASE_MANIFEST_VERSION;
  readonly version: string;
  readonly tag: string;
  readonly commit: string;
  readonly schema: {
    /** The version `validateComposition` accepts. */
    readonly version: string;
    /** The versions `parseComposition` and `migrateComposition` accept (D43). */
    readonly accepted: readonly string[];
  };
  /** The runtime build that the Player and the Producer of this release execute (D21). */
  readonly runtime: { readonly contentHash: string };
  /** The one environment whose output is reference output (D26.2, D28.9, D29.1). */
  readonly environment: {
    readonly image: string;
    readonly platform: string;
    readonly playwrightCore: string;
    readonly chromiumRevision: string;
    readonly chromiumVersion: string;
    readonly network: 'none';
    readonly ffmpeg: {
      readonly release: string;
      readonly asset: string;
      readonly provenance: string;
      readonly downloadUrl: string;
      readonly archiveSha256: string;
      readonly ffmpegSha256: string;
      readonly ffprobeSha256: string;
    };
  };
  readonly packages: readonly ReleasedPackage[];
}

export function sha256Of(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function integrityOf(bytes: Uint8Array): string {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
}

/** The manifest of a release; everything but the packages, the tag, and the commit is a pin. */
export function releaseManifest(input: {
  readonly version: string;
  readonly tag: string;
  readonly commit: string;
  readonly runtimeContentHash: string;
  readonly packages: readonly ReleasedPackage[];
}): ReleaseManifest {
  return {
    manifestVersion: RELEASE_MANIFEST_VERSION,
    version: input.version,
    tag: input.tag,
    commit: input.commit,
    schema: { version: SCHEMA_VERSION, accepted: [...SUPPORTED_SCHEMA_VERSIONS] },
    runtime: { contentHash: input.runtimeContentHash },
    environment: {
      image: PINNED_IMAGE,
      platform: PINNED_PLATFORM,
      playwrightCore: PLAYWRIGHT_CORE_VERSION,
      chromiumRevision: CHROMIUM_REVISION,
      chromiumVersion: CHROMIUM_VERSION,
      network: 'none',
      ffmpeg: {
        release: FFMPEG_RELEASE,
        asset: FFMPEG_ASSET,
        provenance: FFMPEG_URL,
        downloadUrl: FFMPEG_DOWNLOAD_URL,
        archiveSha256: FFMPEG_ARCHIVE_SHA256,
        ffmpegSha256: FFMPEG_SHA256,
        ffprobeSha256: FFPROBE_SHA256,
      },
    },
    packages: input.packages,
  };
}

/**
 * Why the files of a release directory do not match its manifest, or nothing:
 * exactly the manifest and the tarballs it names, each with its size and hashes.
 */
export function releaseDirectoryProblems(dir: string, manifest: ReleaseManifest): string[] {
  const problems: string[] = [];
  const expected = [RELEASE_MANIFEST_FILE, ...manifest.packages.map((entry) => entry.file)].sort();
  const found = readdirSync(dir).sort();
  if (JSON.stringify(found) !== JSON.stringify(expected)) {
    problems.push(`the directory holds ${found.join(', ')}, not ${expected.join(', ')}`);
  }
  const names = manifest.packages.map((entry) => entry.name);
  const shipped = SHIPPED_PACKAGES.map((name) => `@kadrion/${name}`);
  if (JSON.stringify(names) !== JSON.stringify(shipped)) {
    problems.push(`the manifest names ${names.join(', ')}, not ${shipped.join(', ')}`);
  }
  for (const entry of manifest.packages) {
    if (!found.includes(entry.file)) continue;
    const bytes = new Uint8Array(readFileSync(join(dir, entry.file)));
    if (bytes.length !== entry.size)
      problems.push(`${entry.file} has ${String(bytes.length)} bytes`);
    if (sha256Of(bytes) !== entry.sha256) problems.push(`${entry.file} has another SHA-256`);
    if (integrityOf(bytes) !== entry.integrity)
      problems.push(`${entry.file} has another integrity`);
  }
  return problems;
}

function run(command: string, args: readonly string[], cwd: string): string {
  const result = spawnSync(command, [...args], { cwd, encoding: 'utf8' });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} exited with ${String(result.status)}: ${result.stderr}`,
    );
  }
  return result.stdout;
}

/** The entries of a tarball and the text of its `package.json`. */
export function readTarball(
  path: string,
  cwd: string,
): {
  readonly entries: string[];
  readonly packageJson: string;
} {
  const entries = run('tar', ['-tzf', path], cwd)
    .split('\n')
    .filter((line) => line !== '')
    .sort();
  return { entries, packageJson: run('tar', ['-xzOf', path, 'package/package.json'], cwd) };
}

/** The version of every workspace package that a release ships. */
export function shippedVersions(root: string): string[] {
  return SHIPPED_PACKAGES.map(
    (dir) =>
      (
        JSON.parse(readFileSync(join(root, 'packages', dir, 'package.json'), 'utf8')) as {
          version: string;
        }
      ).version,
  );
}

/**
 * Packs every shipped package of a built workspace into `out`, which must not
 * exist or be empty, checks each tarball (`tarballProblems`), and writes the
 * manifest. `pnpm pack` replaces each `workspace:` range by the exact version
 * of the same release; it publishes nothing (D37.3).
 */
export function packRelease(options: {
  readonly root: string;
  readonly out: string;
  readonly tag: string;
  readonly commit: string;
  /** How pnpm is started; `corepack pnpm` by default. */
  readonly pnpm?: readonly [string, ...string[]];
}): ReleaseManifest {
  const versions = shippedVersions(options.root);
  const problems = tagProblems(options.tag, versions);
  if (problems.length > 0) throw new Error(`Cannot release: ${problems.join('; ')}.`);
  const version = versions[0] ?? '';
  // pnpm runs in each package's directory, so a relative directory would land there.
  const out = resolve(options.out);
  mkdirSync(out, { recursive: true });
  if (readdirSync(out).length > 0) throw new Error(`${out} is not empty.`);
  const [pnpm, ...pnpmArgs] = options.pnpm ?? ['corepack', 'pnpm'];
  const packages: ReleasedPackage[] = [];
  try {
    for (const dir of SHIPPED_PACKAGES) {
      run(
        pnpm,
        [...pnpmArgs, 'pack', '--pack-destination', out],
        join(options.root, 'packages', dir),
      );
      const file = tarballName(dir, version);
      const path = join(out, file);
      const tarball = readTarball(path, options.root);
      const found = tarballProblems(dir, version, tarball.entries, tarball.packageJson);
      if (found.length > 0) throw new Error(`${file}: ${found.join('; ')}.`);
      const bytes = new Uint8Array(readFileSync(path));
      packages.push({
        name: `@kadrion/${dir}`,
        version,
        file,
        size: statSync(path).size,
        sha256: sha256Of(bytes),
        integrity: integrityOf(bytes),
      });
    }
    const runtime = JSON.parse(
      readFileSync(
        join(options.root, 'packages/renderer-dom/dist/runtime-build/kadrion-runtime.json'),
        'utf8',
      ),
    ) as { contentHash: string };
    const manifest = releaseManifest({
      version,
      tag: options.tag,
      commit: options.commit,
      runtimeContentHash: runtime.contentHash,
      packages,
    });
    writeFileSync(join(out, RELEASE_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  } catch (reason) {
    // A partial release is never left behind to be uploaded.
    rmSync(out, { recursive: true, force: true });
    throw reason;
  }
}

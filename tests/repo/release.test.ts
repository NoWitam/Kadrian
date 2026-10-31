/**
 * The release of D45 in every `check`: which packages ship, their one version,
 * and that each one packs into a tarball of `package.json` and build output
 * only, private, unlicensed, and with exact versions instead of `workspace:`
 * ranges. The manifest names every tarball by its hashes and repeats the pins.
 * The install in a clean project needs a registry and runs in the release
 * workflow (`tests/release/smoke-release.ts`); its lockfile check runs here.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  FFMPEG_ARCHIVE_SHA256,
  FFMPEG_DOWNLOAD_URL,
  FFMPEG_SHA256,
  FFPROBE_SHA256,
  PINNED_IMAGE,
} from '@kadrion/producer';
import { SCHEMA_VERSION } from '@kadrion/schema';
import { SUPPORTED_SCHEMA_VERSIONS } from '@kadrion/schema/migrate';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  packRelease,
  RELEASE_MANIFEST_FILE,
  releaseDirectoryProblems,
  SHIPPED_FILES,
  SHIPPED_PACKAGES,
  shippedVersions,
  tagProblems,
  tarballProblems,
  type ReleaseManifest,
} from '../release/release.js';
import { lockfileProblems } from '../release/smoke.js';

import { packageDirs, readJson, readText, repoPath } from './repo.js';

const version = shippedVersions(repoPath())[0] ?? '';

describe('the shipped packages (D45)', () => {
  it('are every package except the fixtures', () => {
    expect([...SHIPPED_PACKAGES].sort()).toEqual(
      packageDirs.filter((dir) => dir !== 'test-fixtures'),
    );
  });

  it('share one release version, as every workspace package does', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    for (const dir of packageDirs) {
      expect((readJson('packages', dir, 'package.json') as { version: string }).version, dir).toBe(
        version,
      );
    }
  });

  it.each(SHIPPED_PACKAGES)('@kadrion/%s ships its build output only', (dir) => {
    const manifest = readJson('packages', dir, 'package.json') as {
      files?: string[];
      dependencies?: Record<string, string>;
    };
    expect(manifest.files).toEqual([...SHIPPED_FILES]);
    // A shipped package depends at run time on shipped packages only.
    for (const name of Object.keys(manifest.dependencies ?? {})) {
      if (name.startsWith('@kadrion/')) {
        expect(SHIPPED_PACKAGES as readonly string[]).toContain(name.slice('@kadrion/'.length));
      }
    }
  });
});

describe('packing a release (D45)', () => {
  let out: string;
  let manifest: ReleaseManifest;

  beforeAll(() => {
    out = join(mkdtempSync(join(tmpdir(), 'kadrion-release-')), 'release');
    manifest = packRelease({ root: repoPath(), out, tag: `v${version}`, commit: 'commit' });
  }, 120_000);

  it('packs every shipped package, and the directory matches the manifest', () => {
    expect(manifest.packages.map((entry) => entry.file)).toEqual(
      SHIPPED_PACKAGES.map((dir) => `kadrion-${dir}-${version}.tgz`),
    );
    expect(releaseDirectoryProblems(out, manifest)).toEqual([]);
    expect(JSON.parse(readFileSync(join(out, RELEASE_MANIFEST_FILE), 'utf8'))).toEqual(manifest);
  });

  it('names the schema, the runtime build, and the pins of the reference environment', () => {
    const runtime = readJson(
      'packages',
      'renderer-dom',
      'dist',
      'runtime-build',
      'kadrion-runtime.json',
    ) as { contentHash: string };
    expect(manifest).toMatchObject({
      manifestVersion: 1,
      version,
      tag: `v${version}`,
      commit: 'commit',
      schema: { version: SCHEMA_VERSION, accepted: [...SUPPORTED_SCHEMA_VERSIONS] },
      runtime: { contentHash: runtime.contentHash },
      environment: {
        image: PINNED_IMAGE,
        network: 'none',
        ffmpeg: {
          downloadUrl: FFMPEG_DOWNLOAD_URL,
          archiveSha256: FFMPEG_ARCHIVE_SHA256,
          ffmpegSha256: FFMPEG_SHA256,
          ffprobeSha256: FFPROBE_SHA256,
        },
      },
    });
  });

  it('notices a tarball that changed after the manifest was written', () => {
    const changed = join(out, '..', 'changed');
    packRelease({ root: repoPath(), out: changed, tag: `v${version}`, commit: 'commit' });
    const first = manifest.packages[0]?.file ?? '';
    writeFileSync(join(changed, first), 'other bytes');
    expect(releaseDirectoryProblems(changed, manifest)).toEqual([
      expect.stringContaining(`${first} has`),
      `${first} has another SHA-256`,
      `${first} has another integrity`,
    ]);
  }, 120_000);

  it('refuses a tag that is not the version, and leaves nothing behind', () => {
    const refused = join(out, '..', 'refused');
    expect(() =>
      packRelease({ root: repoPath(), out: refused, tag: 'v9.9.9', commit: 'commit' }),
    ).toThrow(/is not v/);
  });
});

describe('the rules of a release (D45)', () => {
  it('takes a tag only when it is v and the one version', () => {
    expect(tagProblems('v0.1.0', ['0.1.0', '0.1.0'])).toEqual([]);
    expect(tagProblems('0.1.0', ['0.1.0'])).toHaveLength(1);
    expect(tagProblems('v0.1.0', ['0.1.0', '0.2.0'])).toHaveLength(1);
    expect(tagProblems('v0.2.0', ['0.1.0', '0.2.0'])).toHaveLength(2);
    expect(tagProblems('v0.1', ['0.1'])).toHaveLength(1);
  });

  const packed = {
    name: '@kadrion/editor-sdk',
    version: '0.1.0',
    private: true,
    license: 'UNLICENSED',
    dependencies: { '@kadrion/schema': '0.1.0' },
  };
  const entries = ['package/package.json', 'package/dist/index.js', 'package/dist/index.d.ts'];

  it('accepts a tarball of package.json and build output with exact versions', () => {
    expect(tarballProblems('editor-sdk', '0.1.0', entries, JSON.stringify(packed))).toEqual([]);
  });

  it.each<[string, string[], object]>([
    ['a source file', [...entries, 'package/src/index.ts'], packed],
    ['a source map', [...entries, 'package/dist/index.js.map'], packed],
    ['build state', [...entries, 'package/dist/.tsbuildinfo'], packed],
    ['no package.json', entries.slice(1), packed],
    [
      'a workspace range',
      entries,
      { ...packed, dependencies: { '@kadrion/schema': 'workspace:*' } },
    ],
    ['another version', entries, { ...packed, dependencies: { '@kadrion/schema': '0.0.9' } }],
    [
      'a package that is not shipped',
      entries,
      { ...packed, dependencies: { '@kadrion/test-fixtures': '0.1.0' } },
    ],
    ['no private flag', entries, { ...packed, private: false }],
    ['a licence', entries, { ...packed, license: 'MIT' }],
    ['another name', entries, { ...packed, name: '@kadrion/schema' }],
  ])('refuses a tarball with %s', (_, given, manifest) => {
    expect(tarballProblems('editor-sdk', '0.1.0', given, JSON.stringify(manifest))).not.toEqual([]);
  });

  const release = {
    packages: [
      { name: '@kadrion/schema', file: 'kadrion-schema-0.1.0.tgz', integrity: 'sha512-a' },
      { name: '@kadrion/editor-sdk', file: 'kadrion-editor-sdk-0.1.0.tgz', integrity: 'sha512-b' },
    ],
  } as unknown as ReleaseManifest;
  const lock = {
    packages: {
      '': {},
      'node_modules/@kadrion/schema': {
        resolved: 'file:vendor/kadrion-schema-0.1.0.tgz',
        integrity: 'sha512-a',
      },
      'node_modules/@kadrion/editor-sdk': {
        resolved: 'file:vendor/kadrion-editor-sdk-0.1.0.tgz',
        integrity: 'sha512-b',
      },
      'node_modules/playwright-core': { resolved: 'https://registry.npmjs.org/x', integrity: 'x' },
    },
  };

  it('accepts a lockfile that installs every Kadrion package from its tarball by integrity', () => {
    expect(lockfileProblems(lock, release)).toEqual([]);
  });

  it('refuses a Kadrion package from a registry, with another integrity, or missing', () => {
    expect(
      lockfileProblems(
        {
          packages: {
            ...lock.packages,
            'node_modules/@kadrion/schema': {
              resolved: 'https://registry.npmjs.org/@kadrion/schema/-/schema-0.1.0.tgz',
              integrity: 'sha512-a',
            },
            'node_modules/x/node_modules/@kadrion/editor-sdk': {
              resolved: 'file:vendor/kadrion-editor-sdk-0.1.0.tgz',
              integrity: 'sha512-other',
            },
            'node_modules/@kadrion/test-fixtures': {},
          },
        },
        release,
      ),
    ).toHaveLength(3);
    expect(lockfileProblems({ packages: {} }, release)).toHaveLength(2);
  });
});

describe('the release workflow (D45)', () => {
  const workflow = readText('.github', 'workflows', 'release.yml');

  it('runs on version tags only, in its own file', () => {
    expect(workflow).toMatch(/on:\n {2}push:\n {4}tags:\n {6}- 'v\*\.\*\.\*'\n/);
    expect(readText('.github', 'workflows', 'ci.yml')).not.toContain('release');
  });

  it('packs, smoke-tests with a rendered frame in the pinned image, and then publishes', () => {
    expect(workflow).toContain(`image: ${PINNED_IMAGE}`);
    expect(workflow).toContain('tests/release/pack-release.ts');
    expect(workflow).toContain('tests/release/smoke-release.ts --dir .kadrion-release --render');
    expect(workflow).toContain('gh release create');
    // Every action is pinned by its commit.
    for (const line of workflow.split('\n').filter((entry) => entry.includes('uses:'))) {
      expect(line).toMatch(/uses: [\w/-]+@[0-9a-f]{40} # v\d/);
    }
  });
});

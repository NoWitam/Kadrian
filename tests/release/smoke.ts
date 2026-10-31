/**
 * The install smoke test of D45.6: a clean project outside the workspace
 * installs the tarballs of one release by integrity, as a host does, and uses
 * them.
 *
 * 1. Every tarball is a direct dependency `file:vendor/<file>`, and the same
 *    specifier overrides every `@kadrion/*` name, so no Kadrion package can
 *    come from a registry. Other dependencies (`playwright-core`, and `esbuild`
 *    for the bundle) come from the registry at their pinned versions.
 * 2. The lockfile must name every `@kadrion/*` package once, from its tarball,
 *    with the integrity of the manifest.
 * 3. In Node: the schema validates and migrates, the bus dispatches, the AI
 *    tool dispatches on the same bus, the runtime build has the manifest's
 *    hash, and `kadrion doctor` reports. With `render`, the Producer renders
 *    one frame, which needs the pinned Chromium (the release workflow runs in
 *    the pinned image).
 * 4. A bundler builds the browser packages for the browser.
 *
 * It needs npm and a registry; it never writes into the workspace.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  RELEASE_MANIFEST_FILE,
  releaseDirectoryProblems,
  type ReleaseManifest,
} from './release.ts';

/** The bundler of the browser smoke test: the version the workspace pins (D21). */
export const SMOKE_ESBUILD_VERSION = '0.28.2';

/** A composition without assets, so the smoke test needs no bytes but the release's. */
export const SMOKE_COMPOSITION = Object.freeze({
  schemaVersion: '0.3',
  width: 320,
  height: 240,
  fps: 30,
  durationUs: 1_000_000,
  assets: [],
  scenes: [
    {
      id: 'scene-main',
      nodes: [
        {
          id: 'node-background',
          type: 'background',
          startUs: 0,
          durationUs: 1_000_000,
          color: '#102030',
        },
        {
          id: 'node-group',
          type: 'group',
          startUs: 0,
          durationUs: 1_000_000,
          position: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          opacity: 1,
          animations: [],
          children: [],
        },
      ],
    },
  ],
  clips: [],
});

/** The Node part of the smoke test, run in the clean project as `node smoke-node.mjs`. */
export const SMOKE_NODE_SCRIPT = `import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { SCHEMA_VERSION, validateComposition } from '@kadrion/schema';
import { parseComposition } from '@kadrion/schema/migrate';
import { evaluateComposition } from '@kadrion/runtime';
import { createCommandBus } from '@kadrion/editor-sdk';
import { executeSetNodePosition, setNodePositionTool } from '@kadrion/ai-sdk';
import { renderFrames } from '@kadrion/producer';
import { DOCTOR_CHECKS } from '@kadrion/cli';

const release = JSON.parse(readFileSync('release.json', 'utf8'));
const composition = JSON.parse(readFileSync('composition.json', 'utf8'));

assert.equal(SCHEMA_VERSION, release.schema.version);
assert.equal(validateComposition(composition).ok, true);
assert.equal(parseComposition(JSON.stringify(composition)).ok, true);
assert.equal(evaluateComposition(validateComposition(composition).composition, 500_000).timeUs, 500_000);

const bus = createCommandBus(composition);
bus.dispatch({ type: 'SetNodePosition', nodeId: 'node-group', position: { x: 10, y: 20 } });
assert.equal(setNodePositionTool.name, 'set_node_position');
executeSetNodePosition(bus, { nodeId: 'node-group', position: { x: 30, y: 40 } });
assert.deepEqual(bus.getDocument().scenes[0].nodes[1].position, { x: 30, y: 40 });
bus.undo();
assert.deepEqual(bus.getDocument().scenes[0].nodes[1].position, { x: 10, y: 20 });

const runtime = readFileSync(
  fileURLToPath(import.meta.resolve('@kadrion/renderer-dom/runtime-build/kadrion-runtime.js')),
);
assert.equal(
  'sha256:' + createHash('sha256').update(runtime).digest('hex'),
  release.runtime.contentHash,
);

const doctor = spawnSync(process.execPath, ['node_modules/@kadrion/cli/dist/bin.js', 'doctor'], {
  encoding: 'utf8',
});
assert.ok(doctor.status === 0 || doctor.status === 3, doctor.stderr);
const report = JSON.parse(doctor.stdout);
assert.deepEqual(report.checks.map((check) => check.id), [...DOCTOR_CHECKS]);
console.log('doctor reference ' + String(report.reference));

if (process.argv.includes('--render')) {
  const { frames, manifest } = await renderFrames({
    document: bus.getDocument(),
    resolveAsset: () => null,
    timesUs: [0],
  });
  assert.equal(frames.length, 1);
  assert.equal(manifest.runtime.contentHash, release.runtime.contentHash);
  console.log('frame 0 ' + manifest.frames[0].sha256 + ' pinned ' + String(manifest.environment.pinned));
}
console.log('node smoke passed');
`;

/** The browser part: every browser package bundled for the browser, with nothing of Node. */
export const SMOKE_BROWSER_ENTRY = `import { createEditorSession } from '@kadrion/editor-session';
import { createPlayer } from '@kadrion/player';
import { createCommandBus } from '@kadrion/editor-sdk';
import { setNodePositionTool } from '@kadrion/ai-sdk';
import { validateComposition } from '@kadrion/schema';

export const entries = [createEditorSession, createPlayer, createCommandBus, validateComposition];
export const tool = setNodePositionTool.name;
`;

interface LockPackage {
  readonly resolved?: string;
  readonly integrity?: string;
}

/**
 * Why the lockfile of the clean project does not install exactly the release,
 * or nothing: every `@kadrion/*` package anywhere in the tree comes from its
 * tarball with the manifest's integrity, and each shipped package is there.
 */
export function lockfileProblems(
  lock: { readonly packages?: Readonly<Record<string, LockPackage>> },
  manifest: ReleaseManifest,
): string[] {
  const problems: string[] = [];
  const byName = new Map(manifest.packages.map((entry) => [entry.name, entry]));
  const seen = new Set<string>();
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    const match = /(?:^|\/)node_modules\/(@kadrion\/[^/]+)$/.exec(path);
    if (match === null) continue;
    const name = match[1] ?? '';
    const released = byName.get(name);
    if (released === undefined) {
      problems.push(`${path} is not a package of the release`);
      continue;
    }
    seen.add(name);
    if (entry.resolved !== `file:vendor/${released.file}`) {
      problems.push(`${path} resolves to ${String(entry.resolved)}`);
    }
    if (entry.integrity !== released.integrity) {
      problems.push(`${path} has the integrity ${String(entry.integrity)}`);
    }
  }
  for (const name of byName.keys()) {
    if (!seen.has(name)) problems.push(`${name} is not installed`);
  }
  return problems;
}

function run(
  command: string,
  args: readonly string[],
  cwd: string,
  log: (line: string) => void,
): void {
  log(`$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, [...args], { cwd, encoding: 'utf8', stdio: 'pipe' });
  if (result.stdout !== '') log(result.stdout.trimEnd());
  if (result.stderr !== '') log(result.stderr.trimEnd());
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${String(result.status)}.`);
  }
}

/** Runs the smoke test against a release directory; throws on the first failure. */
export function smokeRelease(options: {
  readonly dir: string;
  readonly render: boolean;
  readonly log: (line: string) => void;
  /** Keep the clean project for inspection instead of removing it. */
  readonly keep?: boolean;
}): void {
  const manifest = JSON.parse(
    readFileSync(join(options.dir, RELEASE_MANIFEST_FILE), 'utf8'),
  ) as ReleaseManifest;
  const problems = releaseDirectoryProblems(options.dir, manifest);
  if (problems.length > 0)
    throw new Error(`The release does not match its manifest: ${problems.join('; ')}.`);

  const project = mkdtempSync(join(tmpdir(), 'kadrion-release-smoke-'));
  options.log(`Clean project: ${project}`);
  try {
    mkdirSync(join(project, 'vendor'));
    const specifiers: Record<string, string> = {};
    for (const entry of manifest.packages) {
      copyFileSync(join(options.dir, entry.file), join(project, 'vendor', entry.file));
      specifiers[entry.name] = `file:vendor/${entry.file}`;
    }
    writeFileSync(
      join(project, 'package.json'),
      `${JSON.stringify(
        {
          name: 'kadrion-release-smoke',
          private: true,
          type: 'module',
          dependencies: specifiers,
          devDependencies: { esbuild: SMOKE_ESBUILD_VERSION },
          overrides: specifiers,
        },
        null,
        2,
      )}\n`,
    );
    writeFileSync(join(project, 'release.json'), JSON.stringify(manifest));
    writeFileSync(join(project, 'composition.json'), JSON.stringify(SMOKE_COMPOSITION));
    writeFileSync(join(project, 'smoke-node.mjs'), SMOKE_NODE_SCRIPT);
    writeFileSync(join(project, 'browser.js'), SMOKE_BROWSER_ENTRY);

    run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], project, options.log);
    const lock = JSON.parse(readFileSync(join(project, 'package-lock.json'), 'utf8')) as {
      packages?: Record<string, LockPackage>;
    };
    const locked = lockfileProblems(lock, manifest);
    if (locked.length > 0)
      throw new Error(`The lockfile is not the release: ${locked.join('; ')}.`);
    options.log('lockfile: every @kadrion package from its tarball, by integrity');

    run(
      process.execPath,
      ['smoke-node.mjs', ...(options.render ? ['--render'] : [])],
      project,
      options.log,
    );
    run(
      join(project, 'node_modules', '.bin', 'esbuild'),
      ['browser.js', '--bundle', '--format=esm', '--platform=browser', '--outfile=out/browser.js'],
      project,
      options.log,
    );
    options.log('browser bundle built');
  } finally {
    if (options.keep !== true) rmSync(project, { recursive: true, force: true });
  }
}

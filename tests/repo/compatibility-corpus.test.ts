/**
 * The compatibility corpus of `@kadrion/test-fixtures/compatibility` (D43.6):
 * the saved documents that must keep loading, and the manifest that names them.
 *
 * This test owns the boundary of the corpus. The directory
 * `packages/test-fixtures/src/compatibility` is the corpus, whole and alone:
 * every file in it other than `manifest.json` is the input or the expected
 * document of an entry, and no entry names a file outside it. The fixtures of
 * `compositions/` that the corpus began with are in it as copies of their bytes,
 * so later work on those fixtures cannot change what must keep loading.
 *
 * Two roles of a file, which one file may have both of:
 *
 * - a **frozen input** — the saved document of an entry. It never changes once
 *   committed, formatting included;
 * - an **expectation** — the hand-written document of the current version an
 *   input must load as. A later schema version adds its own expectations and
 *   leaves every earlier file where it is, as an input.
 *
 * Two kinds of hash are checked, and they are not the same thing:
 *
 * - `inputSha256` and `expectedSha256` are hashes of the bytes of a file. They
 *   freeze the file: any edit of it, white space included, fails here.
 * - `expectedCompositionHash` is the composition hash of D28.7, the hash of the
 *   canonical JSON of the document. It is what loading must reproduce, whatever
 *   the text.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

import { canonicalJson } from '@kadrion/producer';
import { SCHEMA_VERSION, validateComposition } from '@kadrion/schema';
import { parseComposition, SUPPORTED_SCHEMA_VERSIONS } from '@kadrion/schema/migrate';
import { compatibilityCorpus } from '@kadrion/test-fixtures/compatibility';
import { describe, expect, it } from 'vitest';

import { filesBelow, readJson, repoPath } from './repo.js';

const FIXTURES = ['packages', 'test-fixtures', 'src'] as const;
const CORPUS = 'compatibility';
const MANIFEST = `${CORPUS}/manifest.json`;
const HASH = /^sha256:[0-9a-f]{64}$/;
/** A corpus document: in the directory of a schema version, and nowhere else. */
const DOCUMENT = /^compatibility\/v(\d+)-(\d+)\/[a-z0-9-]+\.json$/;

interface ManifestEntry {
  readonly id: string;
  readonly schemaVersion: string;
  readonly input: string;
  readonly inputSha256: string;
  readonly versions: readonly string[];
  readonly expected: string;
  readonly expectedSha256: string;
  readonly expectedCompositionHash: string;
}

const manifest = readJson(...FIXTURES, ...MANIFEST.split('/')) as {
  readonly provenance: readonly Readonly<Record<string, unknown>>[];
  readonly entries: readonly ManifestEntry[];
};
const { entries, provenance } = manifest;

const directory = repoPath(...FIXTURES, CORPUS);
/** Every file of the corpus directory but its manifest, as the manifest would name it. */
const onDisk = filesBelow(directory)
  .map((path) => `${CORPUS}/${relative(directory, path).replaceAll('\\', '/')}`)
  .filter((path) => path !== MANIFEST)
  .sort();

function bytesOf(path: string): Buffer {
  return readFileSync(repoPath(...FIXTURES, ...path.split('/')));
}

function documentOf(path: string): unknown {
  return JSON.parse(bytesOf(path).toString('utf8'));
}

function sha256(bytes: Uint8Array | string): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/** The schema version the directory of a corpus document stands for: `v0-1` is `0.1`. */
function versionOfDirectory(path: string): string | null {
  const match = DOCUMENT.exec(path);
  return match === null ? null : `${match[1] ?? ''}.${match[2] ?? ''}`;
}

/** The same document in another spelling: its keys reversed at every level, tab-indented. */
function respelled(value: unknown): string {
  const reverse = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(reverse);
    if (typeof node !== 'object' || node === null) return node;
    return Object.fromEntries(
      Object.entries(node)
        .reverse()
        .map(([key, child]) => [key, reverse(child)]),
    );
  };
  return JSON.stringify(reverse(value), null, '\t');
}

describe('the boundary of the compatibility corpus (D43.6)', () => {
  it('accounts for every file of its directory, the manifest excepted', () => {
    const named = [...new Set(entries.flatMap(({ input, expected }) => [input, expected]))].sort();
    // The premise: the directory holds documents beside its manifest.
    expect(onDisk.length).toBeGreaterThan(3);
    expect(named).toEqual(onDisk);
  });

  it('depends on no file outside its directory: every path is a document of a version directory', () => {
    for (const { id, input, expected } of entries) {
      for (const path of [input, expected]) {
        expect(path, id).toMatch(DOCUMENT);
        expect(path.split('/'), id).not.toContain('..');
      }
    }
  });

  it('gives every entry an ID of its own', () => {
    const ids = entries.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[a-z0-9-]+$/.test(id))).toBe(true);
  });

  it('keeps every document in the directory of the version it names', () => {
    for (const path of onDisk) {
      const version = versionOfDirectory(path);
      expect(SUPPORTED_SCHEMA_VERSIONS, path).toContain(version);
      expect((documentOf(path) as { schemaVersion?: unknown }).schemaVersion, path).toBe(version);
    }
    for (const entry of entries) {
      // An input lies with its own version, an expectation with the current one.
      expect(versionOfDirectory(entry.input), entry.id).toBe(entry.schemaVersion);
      expect(versionOfDirectory(entry.expected), entry.id).toBe(SCHEMA_VERSION);
    }
  });

  it('records where the bytes of every file come from', () => {
    expect(provenance.map(({ file }) => file)).toEqual(onDisk);
    for (const record of provenance) {
      const file = String(record['file']);
      if (record['origin'] === 'copy') {
        // The bytes of a fixture at a commit: the fixture may change later, the copy may not.
        expect(Object.keys(record), file).toEqual(['file', 'origin', 'of', 'commit']);
        expect(record['of'], file).toMatch(
          /^packages\/test-fixtures\/src\/compositions\/[a-z0-9.-]+\.json$/,
        );
        expect(record['commit'], file).toMatch(/^[0-9a-f]{40}$/);
      } else {
        expect(record['origin'], file).toBe('written');
        expect(Object.keys(record), file).toEqual(['file', 'origin', 'in']);
        expect(record['in'], file).toMatch(/^PR-\d+$/);
      }
    }
    // The premise: the corpus holds both kinds.
    expect(new Set(provenance.map(({ origin }) => origin))).toEqual(new Set(['copy', 'written']));
  });
});

describe('the frozen files of the corpus (D43.6)', () => {
  it.each(entries)('holds $id byte for byte: input and expected document', (entry) => {
    for (const hash of [entry.inputSha256, entry.expectedSha256, entry.expectedCompositionHash]) {
      expect(hash).toMatch(HASH);
    }
    // The bytes of the files: an edit of either, white space included, fails here.
    expect(sha256(bytesOf(entry.input))).toBe(entry.inputSha256);
    expect(sha256(bytesOf(entry.expected))).toBe(entry.expectedSha256);
  });

  it.each(entries)('states the version $id names and the composition hash it loads as', (entry) => {
    const input = documentOf(entry.input) as { schemaVersion?: unknown };
    const expected = documentOf(entry.expected);
    expect(input.schemaVersion).toBe(entry.schemaVersion);
    // The canonical hash of the document, which no white space and no key order changes:
    // another spelling of it, parsed, has the same composition hash.
    expect(sha256(canonicalJson(expected))).toBe(entry.expectedCompositionHash);
    expect(sha256(canonicalJson(JSON.parse(respelled(expected))))).toBe(
      entry.expectedCompositionHash,
    );
    // What every entry must load as is a valid document of the current version.
    expect(validateComposition(expected).ok).toBe(true);
    expect((expected as { schemaVersion?: unknown }).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('holds no audio clip whose end is no safe integer, and one that ends at the largest', () => {
    const ends = onDisk.flatMap((path) => {
      const { clips } = documentOf(path) as {
        readonly clips: readonly { readonly startUs: number; readonly durationUs: number }[];
      };
      return clips.map(({ startUs, durationUs }) => ({ path, end: startUs + durationUs }));
    });
    expect(ends.filter(({ end }) => !Number.isSafeInteger(end))).toEqual([]);
    // The premise, and the bound the corpus does hold: a clip in every version that ends there.
    for (const version of SUPPORTED_SCHEMA_VERSIONS) {
      expect(
        ends.filter(({ path }) => versionOfDirectory(path) === version).map(({ end }) => end),
        version,
      ).toContain(Number.MAX_SAFE_INTEGER);
    }
  });

  it('expects a document of the current version to load as itself', () => {
    const current = entries.filter(({ schemaVersion }) => schemaVersion === SCHEMA_VERSION);
    expect(current.length).toBeGreaterThan(1);
    for (const entry of current) {
      expect(entry.expected, entry.id).toBe(entry.input);
      expect(entry.expectedSha256, entry.id).toBe(entry.inputSha256);
      expect(entry.versions, entry.id).toEqual([SCHEMA_VERSION]);
    }
    for (const entry of entries.filter(({ schemaVersion }) => schemaVersion !== SCHEMA_VERSION)) {
      expect(entry.expected, entry.id).not.toBe(entry.input);
      expect(entry.versions[0], entry.id).toBe(entry.schemaVersion);
      expect(entry.versions.at(-1), entry.id).toBe(SCHEMA_VERSION);
    }
  });
});

describe('the corpus and the versions this build supports (D43.5, D43.6)', () => {
  it('holds at least one document of every supported version, and of no other', () => {
    for (const version of SUPPORTED_SCHEMA_VERSIONS) {
      expect(
        entries.filter(({ schemaVersion }) => schemaVersion === version).length,
        version,
      ).toBeGreaterThan(0);
    }
    for (const { id, schemaVersion } of entries) {
      expect(SUPPORTED_SCHEMA_VERSIONS, id).toContain(schemaVersion);
    }
  });

  it('is exported by the corpus entry as the manifest states it, document for document', () => {
    expect(compatibilityCorpus.map(({ id }) => id)).toEqual(entries.map(({ id }) => id));
    for (const [index, entry] of entries.entries()) {
      const exported = compatibilityCorpus[index];
      expect(exported, entry.id).toBeDefined();
      expect({
        schemaVersion: exported?.schemaVersion,
        inputFile: exported?.inputFile,
        inputSha256: exported?.inputSha256,
        versions: exported?.versions,
        expectedFile: exported?.expectedFile,
        expectedSha256: exported?.expectedSha256,
        expectedCompositionHash: exported?.expectedCompositionHash,
      }).toEqual({
        schemaVersion: entry.schemaVersion,
        inputFile: entry.input,
        inputSha256: entry.inputSha256,
        versions: entry.versions,
        expectedFile: entry.expected,
        expectedSha256: entry.expectedSha256,
        expectedCompositionHash: entry.expectedCompositionHash,
      });
      // The documents the package exports are the files, key for key.
      expect(JSON.stringify(exported?.input)).toBe(JSON.stringify(documentOf(entry.input)));
      expect(JSON.stringify(exported?.expected)).toBe(JSON.stringify(documentOf(entry.expected)));
    }
  });

  it.each(entries)('loads the file of $id, as it is on disk, as its expected document', (entry) => {
    // The text of the file itself: pretty-printed, with a trailing newline.
    const result = parseComposition(bytesOf(entry.input).toString('utf8'));
    if (!result.ok) throw new Error(`${entry.id} did not load: ${JSON.stringify(result)}`);
    expect(result.versions).toEqual(entry.versions);
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(documentOf(entry.expected)));
    expect(sha256(canonicalJson(result.composition))).toBe(entry.expectedCompositionHash);
  });
});

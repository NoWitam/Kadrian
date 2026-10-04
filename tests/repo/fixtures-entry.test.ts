/**
 * The compatibility corpus lives behind its own entry point of
 * `@kadrion/test-fixtures` (D43.6). The main entry — what many suites import,
 * and what the playground loads unbundled in a browser — reaches neither the
 * corpus loader, nor its manifest, nor one of its documents, so the corpus
 * costs nothing where nobody reads it, and a mistake in its manifest cannot
 * break the import of the reference fixtures.
 *
 * The other direction holds too: the corpus entry reaches its manifest and the
 * documents the manifest names, and nothing of the main entry. It is read by
 * tests only.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import * as mainEntry from '@kadrion/test-fixtures';
import * as corpusEntry from '@kadrion/test-fixtures/compatibility';
import { describe, expect, it } from 'vitest';

import { reached, sourcesBelow } from './module-graph.js';
import { listDirs, readJson, repoPath } from './repo.js';

const DIST = repoPath('packages', 'test-fixtures', 'dist');
const CORPUS_ENTRY = 'compatibility.js';

function names(modules: ReadonlySet<string>): string[] {
  return [...modules].map((path) => relative(DIST, path).replaceAll('\\', '/')).sort();
}

/** A file of the corpus: its loader, its manifest, or one of its documents. */
function isOfCorpus(name: string): boolean {
  return name === CORPUS_ENTRY || name.startsWith('compatibility/');
}

const manifest = readJson('packages', 'test-fixtures', 'src', 'compatibility', 'manifest.json') as {
  readonly entries: readonly { readonly input: string; readonly expected: string }[];
};

describe('the entry points of @kadrion/test-fixtures (D43.6)', () => {
  it('reaches no file of the corpus from the main entry: no loader, manifest, or document', () => {
    const main = names(reached(join(DIST, 'index.js')));
    // The premise: the walk follows the imports of JSON modules, and the reference is among them.
    expect(main).toContain('index.js');
    expect(main).toContain('compositions/reference.json');
    expect(main.filter(isOfCorpus)).toEqual([]);
  });

  it('exports the corpus from its own entry and not from the main one', () => {
    expect(Object.keys(corpusEntry)).toEqual(['compatibilityCorpus']);
    expect(Object.keys(mainEntry)).not.toContain('compatibilityCorpus');
    // The premise: the main entry is the one of the reference fixtures.
    expect(Object.keys(mainEntry)).toContain('referenceComposition');
  });

  it('reaches exactly the manifest and the documents it names from the corpus entry', () => {
    const named = new Set(manifest.entries.flatMap(({ input, expected }) => [input, expected]));
    expect(named.size).toBeGreaterThan(3);
    // Nothing of the main entry and no fixture of `compositions/`: the corpus stands alone.
    expect(names(reached(join(DIST, CORPUS_ENTRY)))).toEqual(
      [CORPUS_ENTRY, 'compatibility/manifest.json', ...named].sort(),
    );
  });
});

describe('who reads the corpus (D43.6)', () => {
  it('is tests: no package or application source imports the corpus entry', () => {
    const roots = [
      ...listDirs('packages').map((name) => repoPath('packages', name, 'src')),
      ...listDirs('apps').map((name) => repoPath('apps', name, 'src')),
    ].filter((root) => existsSync(root));
    expect(roots.length).toBeGreaterThan(9);
    const importers = roots
      .flatMap(sourcesBelow)
      .filter((path) =>
        /['"]@kadrion\/test-fixtures\/compatibility['"]/.test(readFileSync(path, 'utf8')),
      )
      .map((path) => relative(repoPath(), path).replaceAll('\\', '/'));
    expect(importers).toEqual([]);
  });
});

/**
 * The migration lives behind its own entry point (D42.8). The main entry of
 * `@kadrion/schema` — what the render page, the Player, and the Producer import
 * — reaches neither a historical schema nor a step, by a static or a dynamic
 * import, so a change of a migration changes neither the runtime artifact nor
 * the Player's dist tree. No source of a package or an application imports the
 * migration entry: migrating is the host's explicit act (D35.3, D42.9).
 *
 * The saved text of D43 — `parseComposition`, `serializeComposition`, and the
 * list of supported versions — lives behind the same entry. The modules of the
 * main entry are named here one by one, so a module of any name that the main
 * entry starts to reach fails this test, not only one whose name looks
 * historical.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import * as mainEntry from '@kadrion/schema';
import * as migrateEntry from '@kadrion/schema/migrate';
import { describe, expect, it } from 'vitest';

import { reached, sourcesBelow, specifiers } from './module-graph.js';
import { listDirs, repoPath } from './repo.js';

const SCHEMA_DIST = repoPath('packages', 'schema', 'dist');

function names(modules: ReadonlySet<string>): string[] {
  return [...modules].map((path) => relative(SCHEMA_DIST, path).replaceAll('\\', '/')).sort();
}

const HISTORICAL = /migrat|v0-1/;

/** Every module the main entry of `@kadrion/schema` may reach, and it reaches each. */
const MAIN_ENTRY_MODULES = [
  'composition-schema.js',
  'errors.js',
  'frame-grid.js',
  'index.js',
  'json-schema.js',
  'validate-semantics.js',
  'validate-structure.js',
  'validate.js',
];

/** What only a host calls: behind the migration entry, never in the main one (D42.9, D43). */
const HOST_APIS = [
  'migrateComposition',
  'parseComposition',
  'serializeComposition',
  'SUPPORTED_SCHEMA_VERSIONS',
];

describe('the entry points of @kadrion/schema (D42.8)', () => {
  it('follows static, bare, and dynamic imports: the premise of the walk', () => {
    const source = [
      `import { a } from './a.js';`,
      `export * from "../b.js";`,
      `import './c.js';`,
      `const d = await import('./d.js');`,
      `const e = import( "./e.js" );`,
      `import { f } from '@kadrion/schema';`,
    ].join('\n');
    expect(specifiers(source)).toEqual(['./a.js', '../b.js', './c.js', './d.js', './e.js']);
  });

  it('keeps every historical schema and step out of the main entry', () => {
    const main = names(reached(join(SCHEMA_DIST, 'index.js')));
    // The premise: the walk follows imports, and the validator is among them.
    expect(main).toContain('validate.js');
    expect(main).toContain('composition-schema.js');
    expect(main.filter((name) => HISTORICAL.test(name))).toEqual([]);
  });

  it('reaches exactly its own modules from the main entry, whatever a new one is called', () => {
    expect(names(reached(join(SCHEMA_DIST, 'index.js')))).toEqual(MAIN_ENTRY_MODULES);
  });

  it('exports the explicit host APIs from the migration entry and none from the main one', () => {
    for (const name of HOST_APIS) {
      expect(Object.keys(migrateEntry), name).toContain(name);
      expect(Object.keys(mainEntry), name).not.toContain(name);
    }
    // The premise: the main entry is the validator's.
    expect(Object.keys(mainEntry)).toContain('validateComposition');
  });

  it('reaches the historical schema and the step through the migration entry', () => {
    const migrate = names(reached(join(SCHEMA_DIST, 'migrate.js')));
    expect(migrate).toEqual(
      expect.arrayContaining([
        'migrate.js',
        'migration/run.js',
        'migration/step-0-1-to-0-2.js',
        'migration/text.js',
        'v0-1/composition-schema.js',
      ]),
    );
  });
});

describe('who migrates (D35.3, D42.9)', () => {
  it('is the host: no package or application source imports the migration entry', () => {
    const roots = [
      ...listDirs('packages').map((name) => repoPath('packages', name, 'src')),
      ...listDirs('apps').map((name) => repoPath('apps', name, 'src')),
    ].filter((root) => existsSync(root));
    expect(roots.length).toBeGreaterThan(9);
    const importers = roots
      .flatMap(sourcesBelow)
      .filter((path) => /['"]@kadrion\/schema\/migrate['"]/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(repoPath(), path).replaceAll('\\', '/'));
    expect(importers).toEqual([]);
  });
});

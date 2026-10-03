/**
 * The migration lives behind its own entry point (D42.8). The main entry of
 * `@kadrion/schema` — what the render page, the Player, and the Producer import
 * — reaches neither a historical schema nor a step, by a static or a dynamic
 * import, so a change of a migration changes neither the runtime artifact nor
 * the Player's dist tree. No source of a package or an application imports the
 * migration entry: migrating is the host's explicit act (D35.3, D42.9).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { listDirs, repoPath } from './repo.js';

const SCHEMA_DIST = repoPath('packages', 'schema', 'dist');

/**
 * The relative specifiers a module imports: `from '…'`, a bare `import '…'`, and
 * a dynamic `import('…')` alike.
 */
function specifiers(source: string): string[] {
  return [...source.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)].map(
    (match) => match[1] ?? '',
  );
}

/** Every module a built module reaches through relative imports, itself included. */
function reached(entry: string, seen = new Set<string>()): Set<string> {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  for (const specifier of specifiers(readFileSync(entry, 'utf8'))) {
    reached(join(dirname(entry), specifier), seen);
  }
  return seen;
}

function names(modules: ReadonlySet<string>): string[] {
  return [...modules].map((path) => relative(SCHEMA_DIST, path).replaceAll('\\', '/')).sort();
}

/** Every `.ts` file below a directory. */
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

const HISTORICAL = /migrat|v0-1/;

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

  it('reaches the historical schema and the step through the migration entry', () => {
    const migrate = names(reached(join(SCHEMA_DIST, 'migrate.js')));
    expect(migrate).toEqual(
      expect.arrayContaining([
        'migrate.js',
        'migration/run.js',
        'migration/step-0-1-to-0-2.js',
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
      .flatMap(sources)
      .filter((path) => /['"]@kadrion\/schema\/migrate['"]/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(repoPath(), path).replaceAll('\\', '/'));
    expect(importers).toEqual([]);
  });
});

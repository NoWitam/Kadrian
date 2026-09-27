/**
 * The repository scan of these tests (`listFiles`) finds the files of the
 * repository and never enters a generated directory: `node_modules` and `dist`
 * are pruned while it recurses, not filtered from its result, so neither their
 * contents nor their size can slow a scan down.
 */
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { filesBelow, listFiles, PRUNED_DIRECTORIES, type DirectoryEntry } from './repo.js';

/** A directory tree in memory: a string is a file, an object a directory. */
type Tree = { readonly [name: string]: string | Tree };

function entry(name: string, value: string | Tree): DirectoryEntry {
  return {
    name,
    isDirectory: () => typeof value !== 'string',
    isFile: () => typeof value === 'string',
  };
}

/**
 * A reader over `tree` below `root` that records every directory it is asked to
 * read and counts every entry it hands out.
 */
function readerOf(root: string, tree: Tree) {
  const reads: string[] = [];
  const counted = { entries: 0 };
  const read = (directory: string): DirectoryEntry[] => {
    reads.push(directory);
    const parts = directory
      .slice(root.length)
      .split(/[\\/]/)
      .filter((part) => part !== '');
    let at: string | Tree = tree;
    for (const part of parts) {
      if (typeof at === 'string' || at[part] === undefined) throw new Error(`No ${directory}.`);
      at = at[part];
    }
    if (typeof at === 'string') throw new Error(`${directory} is a file.`);
    const entries = Object.entries(at).map(([name, value]) => entry(name, value));
    counted.entries += entries.length;
    return entries;
  };
  return { read, reads, counted };
}

/** A generated directory of `count` files. */
function generated(count: number): Tree {
  return Object.fromEntries(Array.from({ length: count }, (_, at) => [`f${String(at)}.js`, '']));
}

const ROOT = join('/', 'scan');

function tree(pruned: number): Tree {
  return {
    src: { 'a.ts': '', nested: { 'b.ts': '', dist: generated(pruned) } },
    node_modules: { pkg: generated(pruned) },
    dist: generated(pruned),
    // A file that is merely named like a pruned directory is still a file.
    notes: { dist: '', node_modules: '' },
  };
}

describe('the repository scan', () => {
  it('prunes exactly the generated directories', () => {
    expect([...PRUNED_DIRECTORIES]).toEqual(['dist', 'node_modules']);
  });

  it('finds every ordinary file, and nothing of node_modules or dist', () => {
    const { read } = readerOf(ROOT, tree(3));
    expect(filesBelow(ROOT, read).sort()).toEqual(
      [
        join(ROOT, 'notes', 'dist'),
        join(ROOT, 'notes', 'node_modules'),
        join(ROOT, 'src', 'a.ts'),
        join(ROOT, 'src', 'nested', 'b.ts'),
      ].sort(),
    );
  });

  it('never reads a pruned directory: it skips it while recursing', () => {
    const { read, reads } = readerOf(ROOT, tree(3));
    filesBelow(ROOT, read);
    expect(reads.sort()).toEqual(
      [ROOT, join(ROOT, 'notes'), join(ROOT, 'src'), join(ROOT, 'src', 'nested')].sort(),
    );
  });

  it('does the same work whatever a pruned directory holds', () => {
    const small = readerOf(ROOT, tree(1));
    const large = readerOf(ROOT, tree(1_000));
    expect(filesBelow(ROOT, large.read)).toEqual(filesBelow(ROOT, small.read));
    expect(large.reads).toEqual(small.reads);
    // Not one entry of a pruned directory is handed out, however many it holds.
    expect(large.counted.entries).toBe(small.counted.entries);
  });

  it('lists the files of the checkout, relative and sorted, without generated ones', () => {
    const repo = listFiles('tests', 'repo');
    expect(repo).toContain('tests/repo/repo.ts');
    expect(repo).toEqual([...repo].sort());
    const playground = listFiles('apps', 'playground');
    expect(playground).toContain('apps/playground/src/main.ts');
    const fixtures = listFiles('packages', 'test-fixtures');
    expect(fixtures).toContain('packages/test-fixtures/src/index.ts');
    for (const path of [...playground, ...fixtures]) {
      expect(
        path.split('/').some((part) => PRUNED_DIRECTORIES.includes(part)),
        path,
      ).toBe(false);
    }
  });
});

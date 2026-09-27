import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export function repoPath(...segments: string[]): string {
  return join(repoRoot, ...segments);
}

export function readText(...segments: string[]): string {
  return readFileSync(repoPath(...segments), 'utf8');
}

/** Callers assert the shape they expect; these files are part of the repository. */
export function readJson(...segments: string[]): unknown {
  return JSON.parse(readText(...segments));
}

/** Collapses whitespace so that re-wrapped prose and CRLF checkouts compare equal. */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function listDirs(...segments: string[]): string[] {
  return readdirSync(repoPath(...segments), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Generated directories that no repository scan reads: installed packages and build output. */
export const PRUNED_DIRECTORIES: readonly string[] = Object.freeze(['dist', 'node_modules']);

/** The part of a directory entry that the walk reads. */
export interface DirectoryEntry {
  readonly name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

/**
 * Every file below `directory`, as paths joined onto it, in the order found. A
 * directory named in `PRUNED_DIRECTORIES` is never read, so what it holds costs
 * nothing, however much that is. `read` lists one directory; tests lend their own.
 */
export function filesBelow(
  directory: string,
  read: (directory: string) => readonly DirectoryEntry[] = (at) =>
    readdirSync(at, { withFileTypes: true }),
): string[] {
  const files: string[] = [];
  const walk = (at: string): void => {
    for (const entry of read(at)) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) {
        if (!PRUNED_DIRECTORIES.includes(entry.name)) walk(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  };
  walk(directory);
  return files;
}

/**
 * Files below a directory, as repository-relative paths with forward slashes,
 * sorted. Generated directories (`PRUNED_DIRECTORIES`) are not entered.
 */
export function listFiles(...segments: string[]): string[] {
  return filesBelow(repoPath(...segments))
    .map((path) => relative(repoRoot, path).replaceAll('\\', '/'))
    .sort();
}

export const packageDirs = listDirs('packages');

/** `AGENTS.md` is the binding source that ADRs and package manifests are checked against. */
export const agentsText = normalizeWhitespace(readText('AGENTS.md'));

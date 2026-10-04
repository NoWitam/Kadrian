/**
 * The modules a built entry point reaches, for the guards that keep something
 * out of an entry: the migration out of the main entry of `@kadrion/schema`
 * (D42.8), the compatibility corpus out of the main entry of
 * `@kadrion/test-fixtures` (D43.6).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * The relative specifiers a module imports: `from '…'`, a bare `import '…'`, and
 * a dynamic `import('…')` alike.
 */
export function specifiers(source: string): string[] {
  return [...source.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)].map(
    (match) => match[1] ?? '',
  );
}

/**
 * Every file a built module reaches through relative imports, itself included.
 * A JSON module is reached and not read: it imports nothing, and its text is
 * data that may look like an import.
 */
export function reached(entry: string, seen = new Set<string>()): Set<string> {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  if (entry.endsWith('.json')) return seen;
  for (const specifier of specifiers(readFileSync(entry, 'utf8'))) {
    reached(join(dirname(entry), specifier), seen);
  }
  return seen;
}

/** Every `.ts` file below a directory. */
export function sourcesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourcesBelow(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

/**
 * The API report of a package (D60): every export of every typed entry of its
 * `exports` map, read from the built `.d.ts` through the TypeScript compiler
 * API, in code point order, each with its declaration as the compiler prints
 * it without comments. The report is the surface a host compiles against, so a
 * change of it is visible in review: `tests/api/api-report.test.ts` fails when
 * the committed report and the built surface differ, and
 * `node --run api:update` writes the reports again.
 *
 * What a report holds: the package name, each entry of the `exports` map in
 * map order (an untyped entry, such as a file of the runtime build, by its path
 * only), and per entry each exported name with the declarations it resolves to.
 * An interface, a class, an enum, or an object type is printed whole, so a
 * changed member changes the report. A type that the package does not export
 * appears only by name inside the signatures that use it.
 *
 * Self-contained apart from TypeScript, because `update-api-reports.ts` runs
 * it with `--experimental-strip-types`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, posix, relative, resolve } from 'node:path';

import ts from 'typescript';

/** The file of a package that holds its committed report. */
export const API_REPORT_FILE = 'api-report.txt';

/** One entry of a package's `exports` map. */
export interface PackageEntry {
  /** The subpath as the map names it: `.`, `./migrate`, … */
  readonly subpath: string;
  /** The absolute path of its built `.d.ts`, or `null` for an untyped entry. */
  readonly types: string | null;
  /** The target of an untyped entry, as the map names it. */
  readonly target: string | null;
}

export interface PackageSurface {
  /** The directory below `packages/`. */
  readonly dir: string;
  /** The package name from its manifest. */
  readonly name: string;
  readonly entries: readonly PackageEntry[];
}

interface Manifest {
  readonly name: string;
  readonly exports?: Readonly<Record<string, unknown>>;
}

/** Code point order, so the report does not depend on a locale. */
function byCodePoint(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/** The surfaces of every package below `packagesDir`, in directory order. */
export function packageSurfaces(packagesDir: string): PackageSurface[] {
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(byCodePoint)
    .map((dir) => {
      const root = join(packagesDir, dir);
      const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Manifest;
      const entries = Object.entries(manifest.exports ?? {}).map(([subpath, value]) => {
        if (typeof value === 'string') return { subpath, types: null, target: value };
        const types = (value as { readonly types?: unknown }).types;
        if (typeof types !== 'string') {
          throw new Error(`${manifest.name}: the export ${subpath} names no "types" file.`);
        }
        return { subpath, types: resolve(root, types), target: null };
      });
      return { dir, name: manifest.name, entries };
    });
}

const COMPILER_OPTIONS: ts.CompilerOptions = {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2023,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  types: [],
};

/** Whether the export statement that names `symbol` is `export type`. */
function isTypeOnlyExport(symbol: ts.Symbol): boolean {
  return (symbol.declarations ?? []).some((declaration) => {
    if (ts.isExportSpecifier(declaration)) {
      return declaration.isTypeOnly || declaration.parent.parent.isTypeOnly;
    }
    return ts.isNamespaceExport(declaration) && declaration.parent.isTypeOnly;
  });
}

/** The declaration as the report shows it: the whole statement for a variable. */
function printable(declaration: ts.Declaration): ts.Node {
  if (ts.isVariableDeclaration(declaration)) {
    const list = declaration.parent;
    if (
      ts.isVariableDeclarationList(list) &&
      list.declarations.length === 1 &&
      ts.isVariableStatement(list.parent)
    ) {
      return list.parent;
    }
  }
  return declaration;
}

/** Every line without trailing spaces, so an editor setting cannot change the report. */
function trimmed(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');
}

/**
 * The reports of `surfaces`, keyed by package directory. One program reads
 * every entry, so a type re-exported from another package resolves to the
 * declaration that package built.
 */
export function apiReports(surfaces: readonly PackageSurface[]): Map<string, string> {
  const files = surfaces.flatMap((surface) =>
    surface.entries.flatMap((entry) => (entry.types === null ? [] : [entry.types])),
  );
  const program = ts.createProgram(files, COMPILER_OPTIONS);
  const checker = program.getTypeChecker();
  const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });

  const reports = new Map<string, string>();
  for (const surface of surfaces) {
    const lines = [
      `API report of ${surface.name}`,
      'Generated from the built .d.ts by `node --run api:update` (D60). Do not edit by hand.',
    ];
    for (const entry of surface.entries) {
      lines.push('', `==== Entry ${JSON.stringify(entry.subpath)}`);
      if (entry.types === null) {
        lines.push('', `Untyped file: ${entry.target ?? ''}`);
        continue;
      }
      const source = program.getSourceFile(entry.types);
      if (source === undefined) {
        throw new Error(`${surface.name}: ${entry.types} was not built. Run node --run build.`);
      }
      const moduleSymbol = checker.getSymbolAtLocation(source);
      const exported = moduleSymbol === undefined ? [] : checker.getExportsOfModule(moduleSymbol);
      const root = posix.dirname(entry.types.split('\\').join('/'));
      for (const symbol of [...exported].sort((a, b) => byCodePoint(a.name, b.name))) {
        const target =
          (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
        const marker = isTypeOnlyExport(symbol) ? ' (type only)' : '';
        lines.push('', `---- ${symbol.name}${marker}`);
        for (const declaration of target.declarations ?? []) {
          const file = declaration.getSourceFile();
          if (ts.isSourceFile(declaration)) {
            const path = relative(root, file.fileName).split('\\').join('/');
            lines.push(`module ${path}`);
            continue;
          }
          lines.push(
            trimmed(printer.printNode(ts.EmitHint.Unspecified, printable(declaration), file)),
          );
        }
      }
    }
    reports.set(surface.dir, `${lines.join('\n')}\n`);
  }
  return reports;
}

/** The first line on which two reports differ, for a failure that names it. */
export function firstDifference(actual: string, expected: string): string | null {
  if (actual === expected) return null;
  const left = actual.split('\n');
  const right = expected.split('\n');
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) {
      return `line ${String(index + 1)}: built ${JSON.stringify(left[index] ?? null)}, committed ${JSON.stringify(right[index] ?? null)}`;
    }
  }
  return 'the reports differ';
}

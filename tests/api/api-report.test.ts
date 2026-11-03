/**
 * The committed API reports match the built surface of every package (D60).
 * A failure names the first differing line; `node --run api:update` writes
 * the reports again, and the pull request says whether the change is additive
 * or breaking (phase four rules).
 */
import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { packageDirs, repoPath } from '../repo/repo.js';

import { API_REPORT_FILE, apiReports, firstDifference, packageSurfaces } from './api-report.ts';

const surfaces = packageSurfaces(repoPath('packages'));
const reports = apiReports(surfaces);

describe('API reports', () => {
  it('cover every package of the workspace', () => {
    expect([...reports.keys()]).toEqual(packageDirs);
  });

  it('are generated the same way twice', () => {
    expect(apiReports(surfaces)).toEqual(reports);
  });

  it.each(packageDirs)('match the built surface of @kadrion/%s', (dir) => {
    const path = repoPath('packages', dir, API_REPORT_FILE);
    expect(existsSync(path), `packages/${dir}/${API_REPORT_FILE} is missing`).toBe(true);
    const difference = firstDifference(reports.get(dir) ?? '', readFileSync(path, 'utf8'));
    expect(
      difference,
      `packages/${dir}/${API_REPORT_FILE} differs from the build; run node --run api:update`,
    ).toBeNull();
  });

  it('name every typed entry of the exports map and every untyped file', () => {
    for (const surface of surfaces) {
      const report = reports.get(surface.dir) ?? '';
      for (const entry of surface.entries) {
        expect(report).toContain(`==== Entry ${JSON.stringify(entry.subpath)}`);
      }
    }
  });

  it('show one name for the objects of the document: DocumentObject, not NodeData', () => {
    const editor = reports.get('editor-sdk') ?? '';
    expect(editor).toContain('---- DocumentObject (type only)');
    expect(editor).toContain('export type DocumentObject = Readonly<Record<string, unknown>>;');
    for (const report of reports.values()) expect(report).not.toMatch(/\bNodeData\b/);
  });

  it('print the members of an exported interface, so a changed member changes the report', () => {
    const session = reports.get('editor-session') ?? '';
    expect(session).toContain('---- EditorSession (type only)\nexport interface EditorSession {');
    expect(session).toContain('    seek(timeUs: number): Promise<void>;');
  });
});

describe('firstDifference', () => {
  it('is null for equal reports and names the first differing line otherwise', () => {
    expect(firstDifference('a\nb\n', 'a\nb\n')).toBeNull();
    expect(firstDifference('a\nb\n', 'a\nc\n')).toBe('line 2: built "b", committed "c"');
    expect(firstDifference('a\n', 'a\nb\n')).toBe('line 2: built "", committed "b"');
  });
});

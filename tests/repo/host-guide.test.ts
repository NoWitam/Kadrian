/**
 * The host guide of PR-43 (`docs/integration/host-guide.md`): every relative
 * link resolves, every rule links an accepted ADR, and its tasks keep the order
 * of the host flow test (`tests/release/host-flow.ts`).
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readText, repoPath } from './repo.js';

const GUIDE = ['docs', 'integration', 'host-guide.md'] as const;
const guide = readText(...GUIDE);
const links = [...guide.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1] ?? '');
const local = links.filter((link) => !/^[a-z]+:/.test(link) && !link.startsWith('#'));

describe('the host guide (PR-43)', () => {
  it('links only files that exist', () => {
    expect(local.length).toBeGreaterThan(0);
    for (const link of local) {
      const file = link.split('#')[0] ?? '';
      expect(existsSync(join(dirname(repoPath(...GUIDE)), file)), link).toBe(true);
    }
  });

  it('names an ADR in every task, and every ADR it links is accepted', () => {
    const sections = guide.split(/^## \d+\. /m).slice(1);
    expect(sections).toHaveLength(16);
    for (const section of sections) {
      expect(section, section.split('\n')[0]).toContain('**Authority:**');
    }
    const adrs = [...new Set(local.filter((link) => link.startsWith('../adr/D')))];
    expect(adrs.length).toBeGreaterThan(30);
    for (const link of adrs) {
      const text = readText('docs', 'adr', link.slice('../adr/'.length).split('#')[0] ?? '');
      expect(text, link).toMatch(/^- Status: Accepted/m);
    }
  });

  it('lists the tasks of the host flow in its order, each one run by the flow', () => {
    const flow = readText('tests', 'release', 'host-flow.ts');
    const order = [
      ['Load a saved document', "'migrate'"],
      ['Open the editor', 'createEditorSession'],
      ['Edit from the UI', 'bus.dispatch(edits.ui)'],
      ['Edit from a model', 'executeTool(bus'],
      ['Undo, redo', 'bus.undo()'],
      ['Save the document', 'serializeComposition(bus.getDocument())'],
      ['Make a template and instantiate it', 'instantiateTemplate(template.composition'],
      ['Set up the worker', "'fetch-ffmpeg'"],
      ['Estimate a render', "'estimate'"],
      ['Render in jobs and join', "'join'"],
      ['Export in one pass', "'export'"],
      ['Render a still', "'render-still'"],
    ] as const;
    let at = -1;
    for (const [heading, call] of order) {
      const next = guide.indexOf(`. ${heading}`);
      expect(next, heading).toBeGreaterThan(at);
      expect(flow, heading).toContain(call);
      at = next;
    }
  });
});

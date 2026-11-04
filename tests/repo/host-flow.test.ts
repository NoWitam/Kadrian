/**
 * The host flow of PR-43 in every `check`, as far as it runs without the
 * tarballs, Chromium, and FFmpeg: its saved document migrates from `0.1`, its
 * edits are accepted by a bus of the workspace in the order the page dispatches
 * them, and the template they make instantiates with the flow's values into the
 * document the worker renders. The flow itself runs on the tarballs of a release
 * in the release workflow (`tests/release/smoke-release.ts --flow`).
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { executeTool } from '@kadrion/ai-sdk';
import { createCommandBus } from '@kadrion/editor-sdk';
import { SCHEMA_VERSION, validateComposition } from '@kadrion/schema';
import {
  parseComposition,
  serializeComposition,
  SUPPORTED_SCHEMA_VERSIONS,
} from '@kadrion/schema/migrate';
import { instantiateTemplate } from '@kadrion/schema/template';
import { FONT_GLYPHS, generateReferenceAssets } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  FLOW_ASSET_FILES,
  FLOW_DURATION_US,
  FLOW_EDITS,
  FLOW_NODE_SCRIPT,
  FLOW_SEGMENT_US,
  FLOW_VALUES,
  savedDocument,
  writeHostFlow,
} from '../release/host-flow.js';

const hashes = Object.fromEntries(
  generateReferenceAssets().map((asset) => [
    asset.id,
    `sha256:${createHash('sha256').update(asset.bytes).digest('hex')}`,
  ]),
);

function migrated() {
  const loaded = parseComposition(JSON.stringify(savedDocument(hashes)));
  if (!loaded.ok) throw new Error(JSON.stringify(loaded));
  return loaded;
}

describe('the host flow (PR-43)', () => {
  it('starts from a document saved by 0.1, which migrates through every version', () => {
    expect((savedDocument(hashes) as { schemaVersion: string }).schemaVersion).toBe('0.1');
    const loaded = migrated();
    expect(loaded.versions).toEqual([...SUPPORTED_SCHEMA_VERSIONS]);
    expect(loaded.composition.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('dispatches edits that the bus accepts, and the template instantiates with its values', () => {
    const bus = createCommandBus(migrated().composition);
    bus.dispatch(FLOW_EDITS.ui);
    expect(executeTool(bus, FLOW_EDITS.tool.name, FLOW_EDITS.tool.args).kind).toBe('command');
    const before = JSON.stringify(bus.getDocument());
    bus.dispatchTransaction(FLOW_EDITS.template);
    const after = JSON.stringify(bus.getDocument());
    bus.undo();
    expect(JSON.stringify(bus.getDocument())).toBe(before);
    bus.redo();
    expect(JSON.stringify(bus.getDocument())).toBe(after);

    const saved = serializeComposition(bus.getDocument());
    if (!saved.ok) throw new Error(JSON.stringify(saved.errors));
    const template = parseComposition(saved.text);
    if (!template.ok) throw new Error(JSON.stringify(template));
    expect(template.versions).toEqual([SCHEMA_VERSION]);
    const instance = instantiateTemplate(template.composition, FLOW_VALUES);
    if (!instance.ok) throw new Error(JSON.stringify(instance.errors));
    expect(validateComposition(instance.composition).ok).toBe(true);
    const nodes = instance.composition.scenes[0]?.nodes ?? [];
    expect(nodes.find((node) => node.id === 'node-title')).toMatchObject({
      text: FLOW_VALUES.name,
      position: FLOW_EDITS.ui.position,
    });
    expect(nodes.find((node) => node.id === 'node-background')).toMatchObject({
      color: FLOW_VALUES.brand,
    });
    expect(instance.composition.clips[0]).toMatchObject({ volume: FLOW_EDITS.tool.args.volume });
  });

  it('renders text only in characters of the fixture font', () => {
    for (const character of `${FLOW_VALUES.name}Kadrion`.split('')) {
      expect(Object.keys(FONT_GLYPHS), character).toContain(character);
    }
  });

  it('splits the render into whole segments of the default 60 frames at 30 fps', () => {
    expect(FLOW_SEGMENT_US).toBe(2_000_000);
    expect(FLOW_DURATION_US % FLOW_SEGMENT_US).toBe(0);
    expect(FLOW_DURATION_US / FLOW_SEGMENT_US).toBe(2);
  });

  it('runs every job of the plan through the installed CLI', () => {
    for (const command of [
      'migrate',
      'fetch-ffmpeg',
      'doctor',
      'estimate',
      'render-range',
      'render-audio',
      'join',
      'export',
      'render-still',
    ]) {
      expect(FLOW_NODE_SCRIPT, command).toContain(`'${command}'`);
    }
    expect(FLOW_NODE_SCRIPT).toContain('joined.equals(exported)');
    expect(FLOW_NODE_SCRIPT).not.toContain('@kadrion/test-fixtures');
  });

  it('writes the host files into the clean project, with the hashes the document names', () => {
    const project = mkdtempSync(join(tmpdir(), 'kadrion-host-flow-'));
    writeHostFlow(project);
    expect(readdirSync(project).sort()).toEqual([
      'assets',
      'assets.json',
      'flow-browser.js',
      'flow.html',
      'flow.json',
      'host-flow.mjs',
      'saved-0.1.json',
    ]);
    const saved = JSON.parse(readFileSync(join(project, 'saved-0.1.json'), 'utf8')) as {
      assets: { id: string; contentHash: string }[];
    };
    for (const asset of saved.assets) {
      const file = FLOW_ASSET_FILES[asset.id as keyof typeof FLOW_ASSET_FILES];
      const bytes = readFileSync(join(project, file));
      expect(`sha256:${createHash('sha256').update(bytes).digest('hex')}`, asset.id).toBe(
        asset.contentHash,
      );
    }
  });
});

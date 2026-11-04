/**
 * The showcases of the playground stay current (D32.8). Every entry of the
 * manifest must be a valid composition that the page can render with the
 * assets it generates or serves and the glyphs of the generated font, read
 * its media only inside their sources, name a node the grip may drag (D32.4),
 * carry a call of a catalogue tool that changes it (D32.5, D46), and, for a
 * template, carry values it instantiates with (D58) — so a schema change, a
 * new rule, or a renamed node forces the showcases to follow instead of
 * letting them rot. That each one loads and plays in Chromium without an
 * error is `tests/pinned/showcases.pinned.test.ts` (D32.10).
 */
import { executeTool, TOOL_CATALOGUE } from '@kadrion/ai-sdk';
import { createCommandBus, type MediaFacts } from '@kadrion/editor-sdk';
import { validateComposition, type ValidatedComposition } from '@kadrion/schema';
import { instantiateTemplate, isTemplate, templateDefaults } from '@kadrion/schema/template';
import {
  AUDIO_SECONDS,
  FONT_GLYPHS,
  referenceComposition,
  VIDEO_FIXTURE,
} from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { draggableNodes } from '../../apps/playground/src/app.js';
import { SHOWCASES } from '../../apps/playground/src/showcases.js';

import { listFiles, readText } from './repo.js';

interface Node {
  readonly id: string;
  readonly type: string;
  readonly text?: string;
  readonly words?: readonly { text: string }[];
  readonly assetId?: string;
  readonly sourceStartUs?: number;
  readonly durationUs: number;
  readonly children?: readonly Node[];
}

interface Clip {
  readonly id: string;
  readonly assetId: string;
  readonly sourceStartUs: number;
  readonly durationUs: number;
}

interface Document {
  readonly assets: readonly { id: string; type: string; contentHash: string }[];
  readonly scenes: readonly { nodes: readonly Node[]; clips: readonly Clip[] }[];
  readonly clips: readonly Clip[];
}

const sourceOf = (file: string): unknown => JSON.parse(readText(...file.split('/'))) as unknown;

/**
 * The assets the page generates, as the reference composition declares them
 * (D32.2), and the video it serves from the recipe of the fixtures (D32.10).
 */
const PROVIDED = new Map([
  ...(referenceComposition as Document).assets.map((asset) => [asset.id, asset] as const),
  [
    VIDEO_FIXTURE.id,
    { id: VIDEO_FIXTURE.id, type: 'video', contentHash: VIDEO_FIXTURE.contentHash },
  ] as const,
]);

/** How much source time each provided medium has, in microseconds. */
const SOURCE_US: Readonly<Record<string, number>> = {
  'asset-audio': AUDIO_SECONDS * 1_000_000,
  [VIDEO_FIXTURE.id]: VIDEO_FIXTURE.sourceDurationUs,
};

/** The media facts the session gives the page's bus, by content hash (D49.6). */
const FACTS = new Map<string, MediaFacts>([
  [VIDEO_FIXTURE.contentHash, { type: 'video', durationUs: VIDEO_FIXTURE.sourceDurationUs }],
]);

const nodesOf = (document: Document): Node[] =>
  document.scenes.flatMap((scene) =>
    scene.nodes.flatMap((node) => [node, ...(node.children ?? [])]),
  );

/** What the generated font must draw: the texts and the words of captions. */
function textsOf(document: Document): string[] {
  return nodesOf(document).flatMap((node) =>
    node.type === 'text'
      ? [node.text ?? '']
      : node.type === 'captions'
        ? (node.words ?? []).map((word) => word.text)
        : [],
  );
}

function validated(source: unknown): ValidatedComposition {
  const result = validateComposition(source);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.composition;
}

/** What the page renders of a document: a template with its defaults (D58.4), or the document. */
function rendered(source: unknown): ValidatedComposition {
  const composition = validated(source);
  if (!isTemplate(composition)) return composition;
  const made = instantiateTemplate(composition, templateDefaults(composition));
  if (!made.ok) throw new Error(JSON.stringify(made.errors));
  return made.composition;
}

describe('the showcase manifest (D32.1)', () => {
  it('has unique IDs and a built URL for every source', () => {
    const ids = SHOWCASES.map((showcase) => showcase.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const showcase of SHOWCASES) {
      if (showcase.sourceFile.startsWith('apps/playground/src/showcases/')) {
        const name = showcase.sourceFile.slice('apps/playground/src/showcases/'.length);
        expect(showcase.url, showcase.id).toBe(`/app/showcases/${name}`);
      } else {
        // Only the reference fixture is shown from where the tests already keep it.
        expect(showcase.sourceFile).toBe('packages/test-fixtures/src/compositions/reference.json');
        expect(showcase.url).toBe('/pkg/test-fixtures/compositions/reference.json');
      }
    }
  });

  it('lists every JSON in the showcase directory, and no file that does not exist', () => {
    const files = listFiles('apps', 'playground', 'src', 'showcases').filter((file) =>
      file.endsWith('.json'),
    );
    const listed = SHOWCASES.map((showcase) => showcase.sourceFile).filter((file) =>
      file.startsWith('apps/'),
    );
    expect([...listed].sort()).toEqual([...files].sort());
  });
});

describe('the features the showcases show (D32.10)', () => {
  const documents = SHOWCASES.map((showcase) => validated(sourceOf(showcase.sourceFile)));
  const some = (test: (document: ValidatedComposition) => boolean): boolean => documents.some(test);
  const nodes = (document: ValidatedComposition): Node[] => nodesOf(document);

  it('include each feature of phase three', () => {
    // A video in every fit (D50).
    for (const fit of ['fill', 'contain', 'cover']) {
      expect(
        some((document) =>
          nodes(document).some(
            (node) => node.type === 'video' && (node as { fit?: string }).fit === fit,
          ),
        ),
        fit,
      ).toBe(true);
    }
    // Audio clips with fades (D52).
    expect(
      some((document) => document.clips.some((clip) => clip.fadeInUs > 0 && clip.fadeOutUs > 0)),
    ).toBe(true);
    // Scenes in sequence with scene and clip transitions (D54, D56).
    expect(some((document) => document.scenes.length > 1 && document.transitions.length > 0)).toBe(
      true,
    );
    expect(some((document) => document.scenes.some((scene) => scene.transitions.length > 0))).toBe(
      true,
    );
    // Captions (D57) and a template with a condition and a repeat (D58, D59).
    expect(some((document) => nodes(document).some((node) => node.type === 'captions'))).toBe(true);
    expect(
      some(
        (document) =>
          document.template.conditions.length > 0 && document.template.repeats.length > 0,
      ),
    ).toBe(true);
  });

  it('call a tool of another command than set_node_position for each feature of phase three', () => {
    const names = new Set(SHOWCASES.map((showcase) => showcase.toolCall.name));
    for (const name of [
      'set_node_fit',
      'set_clip_fades',
      'set_transition_effect',
      'set_caption_word',
      'set_template_input',
    ]) {
      expect(names, name).toContain(name);
    }
  });
});

describe.each(SHOWCASES)('the showcase $id (D32.8)', (showcase) => {
  const source = sourceOf(showcase.sourceFile);

  it('is a valid composition', () => {
    const result = validateComposition(source);
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  it('uses only the assets the page generates, with their hashes', () => {
    for (const asset of (source as Document).assets) {
      expect(PROVIDED.get(asset.id), asset.id).toEqual(asset);
    }
  });

  it('reads its media only inside their sources (D49.6, D53)', () => {
    const document = source as Document;
    const reads = [
      ...nodesOf(document).filter((node) => node.type === 'video'),
      ...document.clips,
      ...document.scenes.flatMap((scene) => scene.clips),
    ];
    for (const read of reads) {
      const length = SOURCE_US[read.assetId ?? ''];
      expect(length, read.id).toBeDefined();
      expect((read.sourceStartUs ?? 0) + read.durationUs, read.id).toBeLessThanOrEqual(length ?? 0);
    }
  });

  it('writes its texts with glyphs the generated font has, as the page renders it', () => {
    const shown: unknown[] = [rendered(source)];
    if (showcase.templateValues !== null) {
      const made = instantiateTemplate(validated(source), showcase.templateValues);
      if (made.ok) shown.push(made.composition);
    }
    for (const text of shown.flatMap((document) => textsOf(document as Document))) {
      const missing: string[] = [];
      // Code points, one per glyph of the generated font.
      for (const glyph of text) if (!(glyph in FONT_GLYPHS)) missing.push(glyph);
      expect(missing, text).toEqual([]);
    }
  });

  it('names a node the grip may drag (D32.4)', () => {
    if (showcase.dragNodeId !== null) {
      expect(draggableNodes(source)).toContain(showcase.dragNodeId);
    }
  });

  it('carries a call of a catalogue tool that changes it (D31, D32.5, D46)', () => {
    expect(Object.keys(showcase.toolCall).sort()).toEqual(['arguments', 'name']);
    expect(TOOL_CATALOGUE.map((tool) => tool.name)).toContain(showcase.toolCall.name);
    const bus = createCommandBus(source, {
      mediaFacts: (contentHash: string) => FACTS.get(contentHash) ?? null,
    });
    const before = JSON.stringify(bus.getDocument());
    const result = executeTool(bus, showcase.toolCall.name, showcase.toolCall.arguments);
    expect(result.kind).toBe('command');
    if (result.kind === 'command') expect(result.result.inverse).not.toBeNull();
    expect(JSON.stringify(bus.getDocument())).not.toBe(before);
  });

  it('carries values exactly when it is a template, and they instantiate it (D58)', () => {
    const composition = validated(source);
    expect(showcase.templateValues !== null, showcase.id).toBe(isTemplate(composition));
    if (showcase.templateValues === null) return;
    const made = instantiateTemplate(composition, showcase.templateValues);
    expect(made.ok ? [] : made.errors).toEqual([]);
    // The values make another document than the defaults, or the button shows nothing new.
    expect(JSON.stringify(made.ok ? made.composition : null)).not.toBe(
      JSON.stringify(rendered(source)),
    );
  });
});

describe('draggableNodes (D32.4)', () => {
  it('offers top-level nodes with a position and no position animation', () => {
    // The reference: the group and the image inside it move by animation or are
    // children; the background has no position.
    expect(draggableNodes(referenceComposition)).toEqual(['node-title', 'node-custom-html']);
  });

  it('refuses a group child and a node with a position animation', () => {
    const keyframes = sourceOf('apps/playground/src/showcases/keyframes.json');
    expect(draggableNodes(keyframes)).not.toContain('node-position');
    const group = sourceOf('apps/playground/src/showcases/group.json');
    expect(draggableNodes(group)).not.toContain('node-card-caption');
    expect(draggableNodes(group)).not.toContain('node-card-image');
  });
});

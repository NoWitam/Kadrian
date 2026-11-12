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
import {
  sampledSourceRange,
  validateComposition,
  type ValidatedComposition,
} from '@kadrion/schema';
import { instantiateTemplate, isTemplate, templateDefaults } from '@kadrion/schema/template';
import {
  AUDIO_SECONDS,
  FONT_GLYPHS,
  framedTextComposition,
  PROPORTIONAL_FONT_GLYPHS,
  referenceComposition,
  svgComposition,
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
  readonly fontAssetId?: string;
  readonly assetId?: string;
  readonly startUs: number;
  readonly sourceStartUs?: number;
  readonly sourceStartRemainder?: number;
  readonly speed?: { num: number; den: number };
  readonly reverse?: boolean;
  readonly durationUs: number;
  readonly children?: readonly Node[];
}

interface Clip {
  readonly id: string;
  readonly assetId: string;
  readonly startUs: number;
  readonly sourceStartUs: number;
  readonly sourceStartRemainder: number;
  readonly speed: { num: number; den: number };
  readonly reverse: boolean;
  readonly durationUs: number;
}

interface Document {
  readonly durationUs: number;
  readonly assets: readonly { id: string; type: string; contentHash: string }[];
  readonly scenes: readonly {
    durationUs: number;
    nodes: readonly Node[];
    clips: readonly Clip[];
  }[];
  readonly clips: readonly Clip[];
}

const sourceOf = (file: string): unknown => JSON.parse(readText(...file.split('/'))) as unknown;

/**
 * The assets the page generates, as the reference composition, since PR-57 the
 * SVG composition, and since PR-68 the framed-text composition declare them
 * (D32.2, D74, D83), and the video it serves from the recipe of the fixtures
 * (D32.10).
 */
const PROVIDED = new Map([
  ...[
    ...(referenceComposition as Document).assets,
    ...(svgComposition as Document).assets,
    ...(framedTextComposition as Document).assets,
  ].map((asset) => [asset.id, asset] as const),
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

/** The glyphs of each font the page generates, by asset ID (D27.5, D83). */
const GLYPHS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  'asset-font': FONT_GLYPHS,
  'asset-font-proportional': PROPORTIONAL_FONT_GLYPHS,
};

/** What a generated font must draw: the texts and the words of captions, with their font. */
function textsOf(document: Document): { text: string; font: string }[] {
  return nodesOf(document).flatMap((node) => {
    const font = node.fontAssetId ?? '';
    if (node.type === 'text') return [{ text: node.text ?? '', font }];
    if (node.type === 'captions') return (node.words ?? []).map(({ text }) => ({ text, font }));
    return [];
  });
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

describe('the features of phase five the showcases show (D32.11)', () => {
  const documents = SHOWCASES.map((showcase) => validated(sourceOf(showcase.sourceFile)));
  /** Every node of a document: in scenes, in groups, and in definitions (D76). */
  const everyNode = (document: ValidatedComposition): Record<string, unknown>[] => {
    const found: Record<string, unknown>[] = [];
    const visit = (node: Record<string, unknown>): void => {
      found.push(node);
      for (const child of (node['children'] as Record<string, unknown>[] | undefined) ?? []) {
        visit(child);
      }
    };
    for (const scene of document.scenes) for (const node of scene.nodes) visit(node);
    for (const definition of document.definitions) for (const node of definition.nodes) visit(node);
    return found;
  };
  const nodes = documents.flatMap(everyNode);
  const animations = nodes.flatMap(
    (node) =>
      (node['animations'] as
        { property: string; keyframes: { easing: { kind: string } }[] }[] | undefined) ?? [],
  );
  const effects = [
    ...nodes.flatMap((node) => (node['effects'] as { kind: string }[] | undefined) ?? []),
    ...documents.flatMap((document) => document.scenes.flatMap((scene) => scene.effects)),
  ];
  const clipTransitions = documents.flatMap((document) =>
    document.scenes.flatMap((scene) => scene.transitions),
  );

  it('include clip transitions of the kinds of D66 and their easing (D66, D67)', () => {
    const kinds = new Set(clipTransitions.map((transition) => transition.effect.kind));
    for (const kind of ['push', 'zoom', 'iris', 'blur-dissolve'])
      expect(kinds, kind).toContain(kind);
    expect(clipTransitions.some((transition) => transition.easing.kind !== 'linear')).toBe(true);
  });

  it('include every kind of easing (D67)', () => {
    const kinds = new Set(
      animations.flatMap((animation) =>
        animation.keyframes.map((keyframe) => keyframe.easing.kind),
      ),
    );
    for (const kind of [
      'linear',
      'hold',
      'ease-in',
      'ease-out',
      'ease-in-out',
      'cubic-bezier',
      'steps',
    ]) {
      expect(kinds, kind).toContain(kind);
    }
  });

  it('include rotation, origin, crop, and corner radius, animated (D68)', () => {
    const properties = new Set(animations.map((animation) => animation.property));
    for (const property of [
      'rotation',
      'crop',
      'cornerRadius',
      'size',
      'color',
      'fill',
      'trim/end',
      'geometry',
    ]) {
      expect(properties, property).toContain(property);
    }
    expect(nodes.some((node) => (node['origin'] as { x: number } | undefined)?.x === 500)).toBe(
      true,
    );
    expect(
      nodes.some((node) => typeof node['rotation'] === 'number' && node['rotation'] !== 0),
    ).toBe(true);
  });

  it('include text styles and text animated by letter and by word (D69)', () => {
    const texts = nodes.filter((node) => node['type'] === 'text');
    const units = new Set(
      texts.flatMap((node) =>
        (node['textAnimations'] as { unit: string }[]).map((animation) => animation.unit),
      ),
    );
    for (const unit of ['letter', 'word']) expect(units, unit).toContain(unit);
    for (const part of ['stroke', 'shadow', 'box']) {
      expect(
        texts.some(
          (node) => (node['style'] as Record<string, { kind: string }>)[part]?.kind !== 'none',
        ),
        part,
      ).toBe(true);
    }
  });

  it('include animated captions inside a safe area (D70)', () => {
    const captions = nodes.filter((node) => node['type'] === 'captions');
    const styles = captions.map(
      (node) =>
        node['style'] as {
          highlight: { scale: number; tracks: unknown[]; box: { kind: string } };
          pageIn: { kind: string };
          pageOut: { kind: string };
        },
    );
    expect(
      styles.some(
        (style) =>
          style.highlight.scale !== 1 &&
          style.highlight.tracks.length > 0 &&
          style.highlight.box.kind !== 'none' &&
          style.pageIn.kind === 'animate' &&
          style.pageOut.kind === 'animate',
      ),
    ).toBe(true);
    expect(
      documents.some((document) => Object.values(document.safeArea).some((inset) => inset > 0)),
    ).toBe(true);
  });

  it('include CSS and SVG effects on nodes and on a scene (D71, D72)', () => {
    const kinds = new Set(effects.map((effect) => effect.kind));
    for (const kind of [
      'blur',
      'drop-shadow',
      'hue-rotate',
      'grayscale',
      'sepia',
      'curves',
      'color-grade',
      'glow',
      'vignette',
    ]) {
      expect(kinds, kind).toContain(kind);
    }
    expect(
      documents.some((document) => document.scenes.some((scene) => scene.effects.length > 0)),
    ).toBe(true);
  });

  it('include every kind of shape geometry and fill, and an SVG asset (D73, D74)', () => {
    const shapes = nodes.filter((node) => node['type'] === 'shape');
    const geometries = new Set(shapes.map((node) => (node['geometry'] as { kind: string }).kind));
    for (const kind of ['rect', 'ellipse', 'polygon', 'path'])
      expect(geometries, kind).toContain(kind);
    const fills = new Set(shapes.map((node) => (node['fill'] as { kind: string }).kind));
    for (const kind of ['none', 'solid', 'linear-gradient', 'radial-gradient'])
      expect(fills, kind).toContain(kind);
    expect(
      documents.some((document) => document.assets.some((asset) => asset.type === 'svg')),
    ).toBe(true);
  });

  it('include a blend mode, a shape and an image mask, and a track matte (D75)', () => {
    expect(
      nodes.some((node) => node['blendMode'] !== undefined && node['blendMode'] !== 'normal'),
    ).toBe(true);
    const masks = new Set(
      nodes.map((node) => (node['mask'] as { kind: string } | undefined)?.kind),
    );
    for (const kind of ['shape', 'image']) expect(masks, kind).toContain(kind);
    expect(
      nodes.some((node) => (node['matte'] as { kind: string } | undefined)?.kind === 'node'),
    ).toBe(true);
  });

  it('include a definition placed more than once and an Element with values (D76, D77)', () => {
    const instances = nodes.filter((node) => node['type'] === 'instance');
    const placed = instances.map((node) => node['definitionId']);
    expect(placed.some((id, index) => placed.indexOf(id) !== index)).toBe(true);
    expect(instances.some((node) => (node['sourceStartUs'] as number) > 0)).toBe(true);
    expect(instances.some((node) => (node['inputs'] as unknown[]).length > 0)).toBe(true);
  });

  it('include Custom HTML with parameters and no script (D78)', () => {
    expect(
      nodes.some(
        (node) =>
          node['type'] === 'custom-html' &&
          (node['parameters'] as unknown[]).length > 0 &&
          !(node['html'] as string).includes('<script'),
      ),
    ).toBe(true);
  });

  it('call a tool of the feature of each step of phase five', () => {
    const names = new Set(SHOWCASES.map((showcase) => showcase.toolCall.name));
    for (const name of [
      'set_transition_easing',
      'set_keyframe_easing',
      'add_text_animation',
      'set_caption_highlight',
      'add_effect',
      'set_shape_fill',
      'set_blend_mode',
      'set_instance_input',
      'set_custom_html',
    ]) {
      expect(names, name).toContain(name);
    }
  });
});

describe('the features of phase six the showcases show (D32.12)', () => {
  const documents = SHOWCASES.map(
    (showcase) => validated(sourceOf(showcase.sourceFile)) as unknown as Document,
  );
  const videos = documents.flatMap((document) =>
    nodesOf(document).filter((node) => node.type === 'video'),
  );
  const sounds = documents.flatMap((document) => [
    ...document.clips,
    ...document.scenes.flatMap((scene) => scene.clips),
  ]);
  const texts = documents.flatMap((document) =>
    nodesOf(document).filter((node) => node.type === 'text'),
  ) as unknown as {
    frame: { kind: string };
    style: { align: string; verticalAlign: string };
    textAnimations: { unit: string }[];
  }[];

  it('include a video slower and faster than recorded, a freeze frame, and a reverse (D82)', () => {
    const speeds = videos.map((node) => (node.speed?.num ?? 1) / (node.speed?.den ?? 1));
    expect(speeds.some((speed) => speed > 0 && speed < 1)).toBe(true);
    expect(speeds.some((speed) => speed > 1)).toBe(true);
    expect(speeds).toContain(0);
    expect(videos.some((node) => node.reverse === true)).toBe(true);
    // A speed that only a fraction states, as the multiplier x1/3 (D82.11): a
    // denominator with a prime factor other than 2 and 5, whose decimal never ends.
    const endless = (den: number): boolean => {
      let rest = den;
      for (const prime of [2, 5]) while (rest % prime === 0) rest /= prime;
      return rest > 1;
    };
    expect(videos.some((node) => endless(node.speed?.den ?? 1))).toBe(true);
  });

  it('include a sound at another speed and a sound reversed (D82.6)', () => {
    expect(sounds.some((clip) => clip.speed.num !== clip.speed.den && !clip.reverse)).toBe(true);
    expect(sounds.some((clip) => clip.reverse)).toBe(true);
  });

  it('include framed texts in every alignment, lines by line, and captions broken by width (D83)', () => {
    const framed = texts.filter((node) => node.frame.kind === 'fixed');
    for (const align of ['left', 'center', 'right']) {
      expect(
        framed.some((node) => node.style.align === align),
        align,
      ).toBe(true);
    }
    for (const verticalAlign of ['top', 'middle', 'bottom']) {
      expect(
        framed.some((node) => node.style.verticalAlign === verticalAlign),
        verticalAlign,
      ).toBe(true);
    }
    expect(
      framed.some((node) => node.textAnimations.some((animation) => animation.unit === 'line')),
    ).toBe(true);
    const captions = documents
      .flatMap((document) => nodesOf(document))
      .filter((node) => node.type === 'captions') as unknown as {
      style: {
        lineBreak: string;
        highlight: { stroke: { kind: string }; shadow: { kind: string } };
      };
    }[];
    expect(
      captions.some(
        (node) =>
          node.style.lineBreak === 'width' &&
          node.style.highlight.stroke.kind !== 'none' &&
          node.style.highlight.shadow.kind !== 'none',
      ),
    ).toBe(true);
  });

  it('call the tool of a speed and the tool of a text frame', () => {
    const names = new Set(SHOWCASES.map((showcase) => showcase.toolCall.name));
    for (const name of ['set_clip_speed', 'set_node_size']) expect(names, name).toContain(name);
    const sized = SHOWCASES.find((showcase) => showcase.toolCall.name === 'set_node_size');
    const nodeId = (sized?.toolCall.arguments as { nodeId?: string } | undefined)?.nodeId;
    const document = sourceOf(sized?.sourceFile ?? '') as Document;
    expect(nodesOf(document).find((node) => node.id === nodeId)?.type).toBe('text');
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

  it('reads its media only inside their sources, through the time map (D49.6, D53, D82.1)', () => {
    const document = validated(source) as unknown as Document;
    const reads = [
      ...document.clips.map((clip) => [clip, document.durationUs] as const),
      ...document.scenes.flatMap((scene) => [
        ...scene.nodes
          .flatMap((node) => [node, ...(node.children ?? [])])
          .filter((node) => node.type === 'video')
          .map((node) => [node as Node & Clip, scene.durationUs] as const),
        ...scene.clips.map((clip) => [clip, scene.durationUs] as const),
      ]),
    ];
    for (const [read, holderUs] of reads) {
      const length = SOURCE_US[read.assetId];
      expect(length, read.id).toBeDefined();
      const range = sampledSourceRange(read, holderUs);
      if (range !== null) {
        expect(range.startUs + range.durationUs, read.id).toBeLessThanOrEqual(length ?? 0);
      }
    }
  });

  it('writes its texts with glyphs the generated font has, as the page renders it', () => {
    const shown: unknown[] = [rendered(source)];
    if (showcase.templateValues !== null) {
      const made = instantiateTemplate(validated(source), showcase.templateValues);
      if (made.ok) shown.push(made.composition);
    }
    for (const { text, font } of shown.flatMap((document) => textsOf(document as Document))) {
      const glyphs = GLYPHS[font];
      expect(glyphs, `${text} in ${font}`).toBeDefined();
      const missing: string[] = [];
      // Code points, one per glyph of the generated font; a line feed is a break (D22.6).
      for (const glyph of text)
        if (glyph !== '\n' && !(glyph in (glyphs ?? {}))) missing.push(glyph);
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

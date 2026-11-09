/**
 * Conditions and repeats of a template (D59): the instantiation of the
 * repeats fixture with its defaults against its hand-written result, n items
 * giving n copies with predictable IDs and contiguous times, a false condition
 * removing its element and every transition that names it, item bindings and
 * item assets, and the typed limits.
 */
import { repeatsComposition, repeatsInstantiated } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { isTemplate, validateComposition, type ValidatedComposition } from '../src/index.js';
import {
  instantiateTemplate,
  MAX_REPEAT_IDS,
  templateDefaults,
  type TemplateError,
} from '../src/template.js';

type Mutable = Record<string, unknown>;

function validated(document: unknown): ValidatedComposition {
  const result = validateComposition(document);
  if (!result.ok) throw new Error(JSON.stringify(result.errors.slice(0, 3)));
  return result.composition;
}

const template = validated(repeatsComposition);

function instantiated(values: unknown, from = template): ValidatedComposition {
  const result = instantiateTemplate(from, values);
  if (!result.ok) throw new Error(JSON.stringify(result.errors.slice(0, 3)));
  return result.composition;
}

function errorsOf(values: unknown, from = template): readonly TemplateError[] {
  const result = instantiateTemplate(from, values);
  if (result.ok) throw new Error('The values were accepted.');
  return result.errors;
}

function copy(value: unknown): Mutable {
  return JSON.parse(JSON.stringify(value)) as Mutable;
}

const scenesOf = (composition: unknown): Mutable[] => (composition as { scenes: Mutable[] }).scenes;
const sceneIds = (composition: unknown): string[] =>
  scenesOf(composition).map((scene) => scene['id'] as string);
const nodesOf = (composition: unknown, sceneId: string): Mutable[] =>
  (scenesOf(composition).find((scene) => scene['id'] === sceneId)?.['nodes'] ?? []) as Mutable[];

const PORTRAIT_A = `sha256:${'a'.repeat(64)}`;
const PORTRAIT_B = `sha256:${'b'.repeat(64)}`;
const PORTRAIT_C = `sha256:${'c'.repeat(64)}`;

function person(name: string, durationUs: number, portrait = PORTRAIT_A): Mutable {
  return { name, accent: '#123456', portrait, durationUs };
}

describe('the repeats fixture (D59)', () => {
  it('is a valid template', () => {
    expect(isTemplate(template)).toBe(true);
  });

  it('instantiates with its defaults to its hand-written result, key for key', () => {
    expect(JSON.stringify(instantiated({}))).toBe(JSON.stringify(repeatsInstantiated));
    expect(JSON.stringify(instantiated(templateDefaults(template)))).toBe(
      JSON.stringify(repeatsInstantiated),
    );
  });

  it('is pure and deterministic', () => {
    const text = JSON.stringify(template);
    const values = { people: [person('Dina', 500_000), person('Kim', 700_000)] };
    const first = JSON.stringify(instantiated(values));
    expect(JSON.stringify(instantiated(structuredClone(values)))).toBe(first);
    expect(JSON.stringify(template)).toBe(text);
  });
});

describe('repeats (D59.2)', () => {
  it('gives n items n copies with the IDs <id>--<index> and contiguous times', () => {
    const people = [
      person('Dina', 500_000),
      person('Kim', 700_000),
      person('Dan', 900_000),
      person('Kai', 1_100_000),
    ];
    const composition = instantiated({ people });
    expect(sceneIds(composition)).toEqual([
      'scene-intro',
      'scene-person--0',
      'scene-person--1',
      'scene-person--2',
      'scene-person--3',
      'scene-credits',
    ]);
    expect(scenesOf(composition).map((scene) => scene['durationUs'])).toEqual([
      1_000_000, 500_000, 700_000, 900_000, 1_100_000, 1_000_000,
    ]);
    // The scenes follow each other; the composition lasts as long as they do, less the transition.
    expect(composition.durationUs).toBe(1_000_000 + 3_200_000 + 1_000_000 - 200_000);
    // The node repeat: one line per person, each starting where the one before it ends.
    const lines = nodesOf(composition, 'scene-credits').filter((node) =>
      String(node['id']).startsWith('credit-line'),
    );
    expect(
      lines.map((line) => [line['id'], line['startUs'], line['durationUs'], line['text']]),
    ).toEqual([
      ['credit-line--0', 100_000, 400_000, 'Dina'],
      ['credit-line--1', 500_000, 400_000, 'Kim'],
      ['credit-line--2', 900_000, 400_000, 'Dan'],
      ['credit-line--3', 1_300_000, 400_000, 'Kai'],
    ]);
    // Keyframes move with their copy.
    const keyframes = lines.map((line) =>
      ((line['animations'] as Mutable[])[0]?.['keyframes'] as Mutable[]).map(
        (keyframe) => keyframe['timeUs'],
      ),
    );
    expect(keyframes).toEqual([
      [100_000, 500_000],
      [500_000, 900_000],
      [900_000, 1_300_000],
      [1_300_000, 1_700_000],
    ]);
    // Every ID is distinct.
    const text = JSON.stringify(composition);
    const ids = [...text.matchAll(/"id":"([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('renames the effects of each copy and moves their keyframes with it (D71)', () => {
    const document = copy(template);
    const line = nodesOf(document, 'scene-credits').find((node) => node['id'] === 'credit-line');
    if (line === undefined) throw new Error('No line.');
    line['effects'] = [
      {
        id: 'credit-blur',
        kind: 'blur',
        radius: 0,
        animations: [
          {
            id: 'credit-blur-radius',
            property: 'radius',
            keyframes: [
              { timeUs: 100_000, value: 4, easing: { kind: 'linear' } },
              { timeUs: 300_000, value: 0, easing: { kind: 'linear' } },
            ],
          },
        ],
      },
    ];
    const composition = instantiated(
      { people: [person('Dina', 500_000), person('Kim', 700_000)] },
      validated(document),
    );
    const effects = nodesOf(composition, 'scene-credits')
      .filter((node) => String(node['id']).startsWith('credit-line'))
      .map((node) => (node['effects'] as Mutable[])[0]);
    expect(effects.map((effect) => effect?.['id'])).toEqual(['credit-blur--0', 'credit-blur--1']);
    expect(
      effects.map((effect) => {
        const [animation] = effect?.['animations'] as Mutable[];
        return [
          animation?.['id'],
          (animation?.['keyframes'] as Mutable[]).map((keyframe) => keyframe['timeUs']),
        ];
      }),
    ).toEqual([
      ['credit-blur-radius--0', [100_000, 300_000]],
      ['credit-blur-radius--1', [500_000, 700_000]],
    ]);
  });

  it('writes the fields of each item into its copy, and makes one asset per item', () => {
    const composition = instantiated({
      title: 'Kadrion',
      people: [
        { name: 'Dina', accent: '#f79009', portrait: PORTRAIT_B, durationUs: 400_000 },
        { name: 'Kim', accent: '#12b76a', portrait: PORTRAIT_C, durationUs: 600_000 },
      ],
    });
    expect(composition.assets.map(({ id, type, contentHash }) => [id, type, contentHash])).toEqual([
      ['asset-portrait--0', 'image', PORTRAIT_B],
      ['asset-portrait--1', 'image', PORTRAIT_C],
      ['asset-font', 'font', template.assets[1]?.contentHash],
    ]);
    const [background, portrait, name] = nodesOf(composition, 'scene-person--1');
    expect(background?.['color']).toBe('#12b76a');
    expect(portrait?.['assetId']).toBe('asset-portrait--1');
    expect(name?.['text']).toBe('Kim Kadrion');
  });

  it('keeps the text of a value verbatim, even when it looks like a placeholder', () => {
    const composition = instantiated({ title: '{{mood}}', people: [person('{{title}}', 400_000)] });
    expect(nodesOf(composition, 'scene-person--0')[2]?.['text']).toBe('{{title}} {{mood}}');
    expect(nodesOf(composition, 'scene-intro')[1]?.['text']).toBe('{{mood}}');
  });

  it('removes a repeated scene for an empty list, with the transition into it', () => {
    const composition = instantiated({ people: [] });
    expect(sceneIds(composition)).toEqual(['scene-intro', 'scene-credits']);
    expect(composition.transitions).toEqual([]);
    expect(composition.durationUs).toBe(2_000_000);
    // The repeated node is gone, the note for no one is kept, and the item asset has no copy.
    expect(nodesOf(composition, 'scene-credits').map((node) => node['id'])).toEqual([
      'credits-background',
      'credits-empty',
      'credits-stars',
    ]);
    expect(composition.assets.map(({ id }) => id)).toEqual(['asset-font']);
  });

  it('meets the first copy with a transition into the repeated scene, and the last with one out of it', () => {
    const document = copy(template);
    (document['transitions'] as Mutable[]).push({
      id: 'person-to-credits',
      fromSceneId: 'scene-person',
      toSceneId: 'scene-credits',
      durationUs: 100_000,
      effect: { kind: 'crossfade' },
      easing: { kind: 'linear' },
    });
    document['durationUs'] = 2_700_000;
    const composition = instantiated({}, validated(document));
    expect(
      composition.transitions.map(({ id, fromSceneId, toSceneId }) => [id, fromSceneId, toSceneId]),
    ).toEqual([
      ['intro-to-person', 'scene-intro', 'scene-person--0'],
      ['person-to-credits', 'scene-person--1', 'scene-credits'],
    ]);
    expect(composition.durationUs).toBe(4_000_000 - 300_000);
  });

  it('refuses a duration of an item that is no whole number of microseconds', () => {
    expect(
      errorsOf({ people: [person('Dina', 400_000), person('Kim', 150_000.5)] }).map(
        ({ code, inputId, path }) => ({ code, inputId, path }),
      ),
    ).toEqual([{ code: 'invalid-input-value', inputId: 'people', path: '/people/1/durationUs' }]);
  });

  it('refuses more items than the list allows, naming the input', () => {
    const people = Array.from({ length: 21 }, (_, index) => person(`Kim${String(index)}`, 100_000));
    expect(
      errorsOf({ people }).map(({ code, inputId, path }) => ({ code, inputId, path })),
    ).toEqual([{ code: 'invalid-input-value', inputId: 'people', path: '/people' }]);
  });

  it('refuses copies that would hold more IDs than the limit with repeat-limit', () => {
    const document = copy(template);
    const inputs = (document['template'] as { inputs: Mutable[] }).inputs;
    const list = inputs.find((input) => input['id'] === 'people');
    if (list === undefined) throw new Error('No list.');
    list['maxItems'] = 10_000;
    const scene = scenesOf(document).find((item) => item['id'] === 'scene-person');
    const nodes = scene?.['nodes'] as Mutable[];
    for (let index = 0; index < 15; index += 1) {
      nodes.push({
        id: `filler-${String(index)}`,
        type: 'background',
        startUs: 0,
        durationUs: 1,
        color: '#000000',
        animations: [],
      });
    }
    const big = validated(document);
    // 5 IDs of the scene, 15 fillers, and the portrait: 21 per item.
    const people = Array.from({ length: Math.ceil(MAX_REPEAT_IDS / 21) + 1 }, () =>
      person('Kim', 300_000),
    );
    expect(
      errorsOf({ people }, big).map(({ code, inputId, path }) => ({ code, inputId, path })),
    ).toEqual([{ code: 'repeat-limit', inputId: 'people', path: '/people' }]);
    // One item fewer than the limit allows instantiates.
    const fewer = Array.from({ length: Math.floor((MAX_REPEAT_IDS - 2) / 23) }, () =>
      person('Kim', 300_000),
    );
    expect(instantiateTemplate(big, { people: fewer }).ok).toBe(true);
  });

  it('refuses node copies that would start past the safe integers with repeat-limit', () => {
    const document = copy(template);
    const repeats = (document['template'] as { repeats: Mutable[] }).repeats;
    repeats[1] = {
      id: 'repeat-credit',
      duration: 'field',
      targetId: 'credit-line',
      inputId: 'people',
      key: 'durationUs',
    };
    const list = (document['template'] as { inputs: Mutable[] }).inputs[3];
    if (list === undefined) throw new Error('No list.');
    list['fields'] = [
      { key: 'name', type: 'text', minLength: 1, maxLength: 24 },
      { key: 'accent', type: 'color' },
      { key: 'portrait', type: 'image' },
      { key: 'durationUs', type: 'number', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
    ];
    const huge = Number.MAX_SAFE_INTEGER - 10;
    const errors = errorsOf(
      { people: [person('Dina', huge), person('Kim', huge)] },
      validated(document),
    );
    expect(errors.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'repeat-limit', path: '/people/1' },
    ]);
  });
});

describe('conditions (D59.1)', () => {
  it('removes a scene whose boolean is false, and every transition that names it', () => {
    const composition = instantiated({ 'show-intro': false });
    expect(sceneIds(composition)).toEqual(['scene-person--0', 'scene-person--1', 'scene-credits']);
    expect(composition.transitions).toEqual([]);
    expect(composition.durationUs).toBe(800_000 + 1_200_000 + 1_000_000);
  });

  it('removes a node whose text differs from the value of equal-text', () => {
    const composition = instantiated({ mood: 'rain' });
    expect(nodesOf(composition, 'scene-credits').map((node) => node['id'])).not.toContain(
      'credits-stars',
    );
  });

  it('removes a group with its children and the clip transitions that name them', () => {
    const document = copy(template);
    const credits = scenesOf(document).find((scene) => scene['id'] === 'scene-credits');
    if (credits === undefined) throw new Error('No scene.');
    const nodes = credits['nodes'] as Mutable[];
    const text = (id: string, startUs: number): Mutable => ({
      ...(nodes[2] as Mutable),
      id,
      startUs,
      durationUs: 400_000,
    });
    nodes.push({
      id: 'badge',
      type: 'group',
      startUs: 0,
      durationUs: 1_000_000,
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      origin: { x: 0, y: 0 },
      opacity: 1,
      animations: [],
      children: [text('badge-a', 0), text('badge-b', 300_000)],
      effects: [],
      mask: { kind: 'none' },
      matte: { kind: 'none' },
      blendMode: 'normal',
    });
    credits['transitions'] = [
      {
        id: 'badge-fade',
        fromNodeId: 'badge-a',
        toNodeId: 'badge-b',
        durationUs: 100_000,
        effect: { kind: 'crossfade' },
        easing: { kind: 'linear' },
      },
    ];
    const section = document['template'] as { inputs: Mutable[]; conditions: Mutable[] };
    section.inputs.push({ id: 'level', type: 'number', minimum: 0, maximum: 9, default: 1 });
    section.conditions.push({
      id: 'when-level',
      test: 'equal-number',
      targetId: 'badge',
      inputId: 'level',
      value: 1,
    });
    const source = validated(document);
    const kept = instantiated({}, source);
    expect(nodesOf(kept, 'scene-credits').map((node) => node['id'])).toContain('badge');
    expect(scenesOf(kept).at(-1)?.['transitions']).toHaveLength(1);
    const removed = instantiated({ level: 2 }, source);
    expect(nodesOf(removed, 'scene-credits').map((node) => node['id'])).not.toContain('badge');
    expect(scenesOf(removed).at(-1)?.['transitions']).toEqual([]);
  });
});

describe('mattes in a template (D75)', () => {
  /** A plain shape node of a scene, which a sibling may take as its matte. */
  function frame(id: string): Mutable {
    return {
      id,
      type: 'shape',
      startUs: 0,
      durationUs: 400_000,
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      origin: { x: 0, y: 0 },
      opacity: 1,
      animations: [],
      width: 100,
      height: 100,
      geometry: { kind: 'ellipse' },
      fill: { kind: 'solid', color: '#ffffff' },
      stroke: { color: '#ffffff', width: 0, dash: [], cap: 'butt', join: 'miter' },
      trim: { start: 0, end: 1000 },
      effects: [],
      mask: { kind: 'none' },
      matte: { kind: 'none' },
      blendMode: 'normal',
    };
  }

  it('renames the matte of each copy of a repeated scene to the copy of its shape', () => {
    const document = copy(template);
    const repeated = scenesOf(document).find((scene) => scene['id'] === 'scene-person');
    if (repeated === undefined) throw new Error('No scene.');
    const nodes = repeated['nodes'] as Mutable[];
    nodes.splice(1, 0, frame('person-frame'));
    const portrait = nodes.find((node) => node['id'] === 'person-portrait');
    if (portrait === undefined) throw new Error('No portrait.');
    portrait['matte'] = { kind: 'node', nodeId: 'person-frame', mode: 'alpha' };
    const result = instantiated(
      { people: [person('Dina', 500_000), person('Kim', 700_000)] },
      validated(document),
    );
    const copies = scenesOf(result).filter((scene) =>
      String(scene['id']).startsWith('scene-person--'),
    );
    expect(copies).toHaveLength(2);
    for (const scene of copies) {
      const sceneNodes = scene['nodes'] as Mutable[];
      const shape = sceneNodes.find((node) => String(node['id']).startsWith('person-frame'));
      const matted = sceneNodes.find((node) => String(node['id']).startsWith('person-portrait'));
      expect(matted?.['matte']).toEqual({ kind: 'node', nodeId: shape?.['id'], mode: 'alpha' });
    }
  });

  it('gives a node no matte when a condition removes its matte', () => {
    const document = copy(template);
    const credits = scenesOf(document).find((scene) => scene['id'] === 'scene-credits');
    if (credits === undefined) throw new Error('No scene.');
    const nodes = credits['nodes'] as Mutable[];
    nodes.splice(1, 0, frame('credits-frame'));
    const stars = nodes.find((node) => node['id'] === 'credits-stars');
    if (stars === undefined) throw new Error('No text.');
    stars['matte'] = { kind: 'node', nodeId: 'credits-frame', mode: 'luminance' };
    const section = document['template'] as { inputs: Mutable[]; conditions: Mutable[] };
    section.inputs.push({ id: 'framed', type: 'boolean', default: true });
    section.conditions.push({
      id: 'when-framed',
      test: 'true',
      targetId: 'credits-frame',
      inputId: 'framed',
    });
    const source = validated(document);
    const kept = nodesOf(instantiated({}, source), 'scene-credits');
    expect(kept.find((node) => node['id'] === 'credits-stars')?.['matte']).toEqual({
      kind: 'node',
      nodeId: 'credits-frame',
      mode: 'luminance',
    });
    const removed = nodesOf(instantiated({ framed: false }, source), 'scene-credits');
    expect(removed.map((node) => node['id'])).not.toContain('credits-frame');
    expect(removed.find((node) => node['id'] === 'credits-stars')?.['matte']).toEqual({
      kind: 'none',
    });
  });
});

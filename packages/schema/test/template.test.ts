/**
 * Instantiating a template (D58.4): the defaults, values written through each
 * kind of binding, typed refusals that name the input and the path of the
 * value, and a pure, deterministic result that is a composition, not a
 * template.
 */
import { referenceComposition, templateComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { isTemplate, validateComposition, type ValidatedComposition } from '../src/index.js';
import { instantiateTemplate, templateDefaults, type TemplateError } from '../src/template.js';

function validated(document: unknown): ValidatedComposition {
  const result = validateComposition(document);
  if (!result.ok) throw new Error(result.errors[0]?.message ?? 'invalid');
  return result.composition;
}

const template = validated(templateComposition);

function instantiated(values: unknown): ValidatedComposition {
  const result = instantiateTemplate(template, values);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.composition;
}

function errorsOf(values: unknown): readonly TemplateError[] {
  const result = instantiateTemplate(template, values);
  if (result.ok) throw new Error('The values were accepted.');
  return result.errors;
}

function nodeOf(composition: unknown, id: string): Record<string, unknown> {
  const scenes = (composition as { scenes: { nodes: Record<string, unknown>[] }[] }).scenes;
  const node = scenes.flatMap((scene) => scene.nodes).find((item) => item['id'] === id);
  if (node === undefined) throw new Error(`No node "${id}".`);
  return node;
}

const PHOTO = `sha256:${'b'.repeat(64)}`;

describe('isTemplate (D58.4)', () => {
  it('is true for a composition with inputs or bindings, false for an empty section', () => {
    expect(isTemplate(template)).toBe(true);
    expect(isTemplate(validated(referenceComposition))).toBe(false);
    expect(isTemplate(instantiated({}))).toBe(false);
  });
});

describe('instantiateTemplate with the defaults (D58.4)', () => {
  it('writes every default and empties the template section', () => {
    const composition = instantiated({});
    expect(composition.template).toEqual({ inputs: [], bindings: [], conditions: [], repeats: [] });
    expect(nodeOf(composition, 'card-title')['text']).toBe('Kadrion dd 1');
    expect(nodeOf(composition, 'card-tagline')['text']).toBe('Made by Kadrion');
    expect(nodeOf(composition, 'card-background')['color']).toBe('#101828');
  });

  it('gives the same composition for the defaults stated and left out', () => {
    expect(JSON.stringify(instantiated(templateDefaults(template)))).toBe(
      JSON.stringify(instantiated({})),
    );
  });

  it('lists the defaults by input ID, a list as objects keyed by field', () => {
    expect(templateDefaults(template)).toEqual({
      name: 'Kadrion',
      rank: 1,
      brand: '#101828',
      tagline: 'Made by Kadrion',
      photo: template.assets[0]?.contentHash,
      'show-photo': true,
      team: [
        { name: 'Ada', accent: '#f79009' },
        { name: 'Kian', accent: '#12b76a' },
      ],
    });
  });

  it('gives a composition without inputs back as it is', () => {
    const reference = validated(referenceComposition);
    const result = instantiateTemplate(reference, {});
    if (!result.ok) throw new Error('refused');
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(reference));
  });
});

describe('instantiateTemplate with values (D58.2, D58.4)', () => {
  const values = {
    name: 'Ada',
    rank: 42,
    brand: '#000000',
    tagline: '',
    photo: PHOTO,
    team: [],
  };

  it('writes each value through its binding', () => {
    const composition = instantiated(values);
    expect(nodeOf(composition, 'card-title')['text']).toBe('Ada dd 42');
    expect(nodeOf(composition, 'card-tagline')['text']).toBe('');
    expect(nodeOf(composition, 'card-background')['color']).toBe('#000000');
    expect(composition.assets.find((asset) => asset.id === 'asset-photo')?.contentHash).toBe(PHOTO);
  });

  it('writes a number as ECMAScript writes it', () => {
    expect(nodeOf(instantiated({ rank: 1.5 }), 'card-title')['text']).toBe('Kadrion dd 1.5');
    expect(nodeOf(instantiated({ rank: 99 }), 'card-title')['text']).toBe('Kadrion dd 99');
  });

  it('writes a placeholder value as text, verbatim, with no second expansion', () => {
    expect(nodeOf(instantiated({ name: '{{rank}}' }), 'card-title')['text']).toBe('{{rank}} dd 1');
  });

  it('is deterministic and never writes the template or the values', () => {
    const before = JSON.stringify(template);
    const given = JSON.parse(JSON.stringify(values)) as typeof values;
    const first = JSON.stringify(instantiated(given));
    expect(JSON.stringify(instantiated(given))).toBe(first);
    expect(JSON.stringify(template)).toBe(before);
    expect(given).toEqual(values);
  });

  it('returns a tree that shares nothing with the template', () => {
    const composition = instantiated({});
    expect(composition.scenes[0]).not.toBe(template.scenes[0]);
    expect(composition.assets[0]).not.toBe(template.assets[0]);
  });
});

describe('instantiateTemplate refuses (D58.4)', () => {
  it('values that are not a plain object', () => {
    for (const values of [null, [], 'name', 7, new Map()]) {
      expect(errorsOf(values).map((error) => error.code)).toEqual(['invalid-values']);
    }
  });

  it('a value for no input, naming it', () => {
    expect(errorsOf({ nobody: 1 })).toEqual([
      {
        code: 'unknown-input',
        inputId: 'nobody',
        path: '/nobody',
        message: 'The template has no input "nobody".',
      },
    ]);
  });

  it('a value of the wrong type or outside its constraints, naming the input and path', () => {
    const cases: readonly [Record<string, unknown>, string, string][] = [
      [{ name: '' }, 'name', '/name'],
      [{ name: 'x'.repeat(25) }, 'name', '/name'],
      [{ name: 3 }, 'name', '/name'],
      [{ rank: 0 }, 'rank', '/rank'],
      [{ rank: Number.NaN }, 'rank', '/rank'],
      [{ rank: '1' }, 'rank', '/rank'],
      [{ brand: 'red' }, 'brand', '/brand'],
      [{ photo: 'sha256:00' }, 'photo', '/photo'],
      [{ 'show-photo': 'yes' }, 'show-photo', '/show-photo'],
      [{ team: {} }, 'team', '/team'],
      [{ team: [{ name: 'Ada' }] }, 'team', '/team/0/accent'],
      [{ team: [{ name: '', accent: '#000000' }] }, 'team', '/team/0/name'],
      [{ team: [{ name: 'Ada', accent: '#000000', age: 3 }] }, 'team', '/team/0/age'],
      [{ team: ['Ada'] }, 'team', '/team/0'],
    ];
    for (const [values, inputId, path] of cases) {
      const errors = errorsOf(values);
      expect(errors.map((error) => [error.code, error.inputId, error.path])).toEqual([
        ['invalid-input-value', inputId, path],
      ]);
    }
  });

  it('a list with too many items', () => {
    const item = { name: 'Ada', accent: '#000000' };
    const errors = errorsOf({ team: Array.from({ length: 9 }, () => item) });
    expect(errors.map((error) => error.path)).toEqual(['/team']);
  });

  it('reports every error at once, values before unknown keys', () => {
    const errors = errorsOf({ zeta: 1, name: '', rank: 100 });
    expect(errors.map((error) => [error.code, error.path])).toEqual([
      ['invalid-input-value', '/name'],
      ['invalid-input-value', '/rank'],
      ['unknown-input', '/zeta'],
    ]);
  });
});

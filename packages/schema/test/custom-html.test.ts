/**
 * Custom HTML for AI authors in the schema (D78): fonts and parameters of an
 * element, and a template input that fills a parameter through a binding.
 */
import { customHtmlComposition, referenceComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { validateComposition, type ValidatedComposition } from '../src/index.js';
import { instantiateTemplate } from '../src/template.js';

function validated(document: unknown): ValidatedComposition {
  const result = validateComposition(document);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.composition;
}

/** The reference composition with an accent parameter of its element bound to a colour input. */
function boundAccent(): unknown {
  const document = structuredClone(referenceComposition) as {
    scenes: { nodes: Record<string, unknown>[] }[];
    template: { inputs: unknown[]; bindings: unknown[] };
  };
  const element = document.scenes[0]?.nodes.find((node) => node['id'] === 'node-custom-html');
  if (element === undefined) throw new Error('No element.');
  element['parameters'] = [
    { key: 'accent', type: 'color', value: '#f79009' },
    { key: 'label', type: 'text', value: 'Kadrion' },
  ];
  document.template.inputs.push({ id: 'accent', type: 'color', default: '#f79009' });
  document.template.bindings.push({
    id: 'bind-accent',
    kind: 'parameter',
    nodeId: 'node-custom-html',
    key: 'accent',
    inputId: 'accent',
  });
  return document;
}

function parametersOf(composition: ValidatedComposition): unknown {
  const element = composition.scenes[0]?.nodes.find((node) => node.id === 'node-custom-html');
  if (element?.type !== 'custom-html') throw new Error('No element.');
  return element.parameters;
}

describe('the fonts and parameters of a Custom HTML element (D78)', () => {
  it('validates the fixture of two elements with fonts and parameters of every type', () => {
    const composition = validated(customHtmlComposition);
    const elements = composition.scenes[0]?.nodes.filter((node) => node.type === 'custom-html');
    expect(elements?.map(({ id }) => id)).toEqual(['html-css', 'html-script']);
    const types = new Set(elements?.flatMap((node) => node.parameters.map(({ type }) => type)));
    expect([...types].sort()).toEqual(['color', 'number', 'text']);
  });

  it('accepts a parameter of each type, sorted by key', () => {
    const document = structuredClone(referenceComposition) as {
      scenes: { nodes: Record<string, unknown>[] }[];
    };
    const element = document.scenes[0]?.nodes.find((node) => node['id'] === 'node-custom-html');
    if (element === undefined) throw new Error('No element.');
    element['fontAssetIds'] = ['asset-font'];
    element['parameters'] = [
      { key: 'Z', type: 'number', value: -3.5 },
      { key: 'a_1', type: 'boolean', value: true },
      { key: 'accent', type: 'color', value: '#000000' },
      { key: 'label', type: 'text', value: '' },
    ];
    expect(validateComposition(document).ok).toBe(true);
  });
});

describe('a parameter bound to a template input (D78)', () => {
  it('holds the default of its input', () => {
    expect(parametersOf(validated(boundAccent()))).toEqual([
      { key: 'accent', type: 'color', value: '#f79009' },
      { key: 'label', type: 'text', value: 'Kadrion' },
    ]);
  });

  it('takes the value of the input when the template is instantiated, and nothing else changes', () => {
    const template = validated(boundAccent());
    const result = instantiateTemplate(template, { accent: '#12b76a' });
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(parametersOf(result.composition)).toEqual([
      { key: 'accent', type: 'color', value: '#12b76a' },
      { key: 'label', type: 'text', value: 'Kadrion' },
    ]);
    expect(result.composition.template.bindings).toEqual([]);
    expect(validateComposition(result.composition).ok).toBe(true);
  });

  it('refuses a value of another type at the path of the input', () => {
    const result = instantiateTemplate(validated(boundAccent()), { accent: 'red' });
    expect(result.ok).toBe(false);
  });
});

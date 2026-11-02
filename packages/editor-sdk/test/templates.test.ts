/**
 * The commands of templates (D58.6): an input added, removed, and replaced, a
 * binding added and removed, each undone by its inverse to the exact text of
 * the document before it; `SetTemplateInput` writes the new default into its
 * bound targets (D58.3); and a command that is no template command refuses to
 * break a binding with `binding-in-use`.
 */
import type { ValidatedComposition } from '@kadrion/schema';
import { templateComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { applyCommand, EditorError, type Command } from '../src/index.js';

import { codeOf, json, validated } from './support.js';

const document = validated(templateComposition);

interface TemplateView {
  readonly inputs: readonly Record<string, unknown>[];
  readonly bindings: readonly Record<string, unknown>[];
}

function templateOf(composition: unknown): TemplateView {
  return (composition as { template: TemplateView }).template;
}

function nodeOf(composition: unknown, id: string): Record<string, unknown> {
  const scenes = (composition as { scenes: { nodes: Record<string, unknown>[] }[] }).scenes;
  const node = scenes.flatMap((scene) => scene.nodes).find((item) => item['id'] === id);
  if (node === undefined) throw new Error(`No node "${id}".`);
  return node;
}

function assetOf(composition: unknown, id: string): Record<string, unknown> {
  const assets = (composition as { assets: Record<string, unknown>[] }).assets;
  const asset = assets.find((item) => item['id'] === id);
  if (asset === undefined) throw new Error(`No asset "${id}".`);
  return asset;
}

/** Applies a command and its inverse, checks the restored text, and returns the edited document. */
function roundTrip(from: ValidatedComposition, command: Command): ValidatedComposition {
  const result = applyCommand(from, command);
  expect(result.inverse).not.toBeNull();
  const restored = applyCommand(result.document, result.inverse as Command).document;
  expect(json(restored)).toBe(json(from));
  return result.document;
}

/** The `EditorError` a call throws. */
function errorOf(run: () => unknown): EditorError {
  try {
    run();
  } catch (reason) {
    if (reason instanceof EditorError) return reason;
    throw reason;
  }
  throw new Error('The call threw nothing.');
}

const SUBTITLE = Object.freeze({
  id: 'subtitle',
  type: 'text',
  minLength: 0,
  maxLength: 30,
  default: 'Made by Kadrion',
});

describe('AddTemplateInput and RemoveTemplateInput (D58.6)', () => {
  it('inserts an input at its index and is undone exactly', () => {
    const edited = roundTrip(document, { type: 'AddTemplateInput', index: 1, input: SUBTITLE });
    expect(templateOf(edited).inputs.map((input) => input['id'])).toEqual([
      'name',
      'subtitle',
      'rank',
      'brand',
      'tagline',
      'photo',
      'show-photo',
      'team',
    ]);
  });

  it('removes an unbound input and is undone exactly, at its index', () => {
    const edited = roundTrip(document, { type: 'RemoveTemplateInput', inputId: 'show-photo' });
    expect(templateOf(edited).inputs.map((input) => input['id'])).not.toContain('show-photo');
  });

  it('refuses a taken ID, an index past the end, and an input the schema rejects', () => {
    expect(
      codeOf(() =>
        applyCommand(document, {
          type: 'AddTemplateInput',
          index: 0,
          input: { ...SUBTITLE, id: 'card-title' },
        }),
      ),
    ).toBe('id-in-use');
    expect(
      codeOf(() => applyCommand(document, { type: 'AddTemplateInput', index: 9, input: SUBTITLE })),
    ).toBe('index-out-of-range');
    expect(
      codeOf(() =>
        applyCommand(document, {
          type: 'AddTemplateInput',
          index: 0,
          input: { ...SUBTITLE, default: 'x'.repeat(31) },
        }),
      ),
    ).toBe('invalid-result');
  });

  it('refuses to remove a bound input, naming its bindings, and an unknown input', () => {
    const inUse = errorOf(() =>
      applyCommand(document, { type: 'RemoveTemplateInput', inputId: 'name' }),
    );
    expect(inUse.code).toBe('input-in-use');
    expect(inUse.details).toEqual(['bind-title']);
    expect(
      errorOf(() => applyCommand(document, { type: 'RemoveTemplateInput', inputId: 'tagline' }))
        .details,
    ).toEqual(['bind-tagline']);
    expect(
      codeOf(() => applyCommand(document, { type: 'RemoveTemplateInput', inputId: 'nothing' })),
    ).toBe('unknown-input');
  });
});

describe('SetTemplateInput (D58.3, D58.6)', () => {
  it('writes the new default into a bound text and a bound color, undone exactly', () => {
    const tagline = { ...templateOf(document).inputs[3], default: 'Rendered by Kadrion' };
    const edited = roundTrip(document, {
      type: 'SetTemplateInput',
      inputId: 'tagline',
      input: tagline,
    });
    expect(nodeOf(edited, 'card-tagline')['text']).toBe('Rendered by Kadrion');

    const brand = { id: 'brand', type: 'color', default: '#000000' };
    const recoloured = roundTrip(document, {
      type: 'SetTemplateInput',
      inputId: 'brand',
      input: brand,
    });
    expect(nodeOf(recoloured, 'card-background')['color']).toBe('#000000');
  });

  it('writes the new default into a bound asset', () => {
    const hash = `sha256:${'a'.repeat(64)}`;
    const edited = roundTrip(document, {
      type: 'SetTemplateInput',
      inputId: 'photo',
      input: { id: 'photo', type: 'image', default: hash },
    });
    expect(assetOf(edited, 'asset-photo')['contentHash']).toBe(hash);
  });

  it('changes constraints without touching the pattern of a placeholder text', () => {
    const edited = roundTrip(document, {
      type: 'SetTemplateInput',
      inputId: 'rank',
      input: { id: 'rank', type: 'number', minimum: 0, maximum: 9, default: 3 },
    });
    expect(nodeOf(edited, 'card-title')['text']).toBe('{{name}} dd {{rank}}');
  });

  it('is no edit when the input is the same', () => {
    const input = templateOf(document).inputs[0] as Record<string, unknown>;
    const result = applyCommand(document, { type: 'SetTemplateInput', inputId: 'name', input });
    expect(result.inverse).toBeNull();
    expect(json(result.document)).toBe(json(document));
  });

  it('refuses another ID, a changed type the bindings cannot take, and an unknown input', () => {
    expect(
      codeOf(() =>
        applyCommand(document, {
          type: 'SetTemplateInput',
          inputId: 'name',
          input: { ...SUBTITLE },
        }),
      ),
    ).toBe('invalid-result');
    expect(
      codeOf(() =>
        applyCommand(document, {
          type: 'SetTemplateInput',
          inputId: 'brand',
          input: { id: 'brand', type: 'boolean', default: false },
        }),
      ),
    ).toBe('invalid-result');
    expect(
      codeOf(() =>
        applyCommand(document, {
          type: 'SetTemplateInput',
          inputId: 'nothing',
          input: { ...SUBTITLE, id: 'nothing' },
        }),
      ),
    ).toBe('unknown-input');
  });
});

describe('AddTemplateBinding and RemoveTemplateBinding (D58.6)', () => {
  it('removes a binding, whose target keeps its value, and is undone exactly', () => {
    const edited = roundTrip(document, { type: 'RemoveTemplateBinding', bindingId: 'bind-brand' });
    expect(templateOf(edited).bindings.map((binding) => binding['id'])).toEqual([
      'bind-title',
      'bind-tagline',
      'bind-photo',
    ]);
    expect(nodeOf(edited, 'card-background')['color']).toBe('#101828');
  });

  it('adds a binding whose target holds the default, undone exactly', () => {
    const unbound = applyCommand(document, {
      type: 'RemoveTemplateBinding',
      bindingId: 'bind-tagline',
    }).document;
    const edited = roundTrip(unbound, {
      type: 'AddTemplateBinding',
      index: 0,
      binding: {
        id: 'bind-tagline-again',
        kind: 'property',
        nodeId: 'card-tagline',
        property: 'text',
        inputId: 'tagline',
      },
    });
    expect(templateOf(edited).bindings[0]?.['id']).toBe('bind-tagline-again');
  });

  it('refuses a target that does not hold the default, a second binding of a target, and an unknown binding', () => {
    expect(
      codeOf(() =>
        applyCommand(document, {
          type: 'AddTemplateBinding',
          index: 0,
          binding: {
            id: 'bind-name',
            kind: 'property',
            nodeId: 'card-tagline',
            property: 'text',
            inputId: 'name',
          },
        }),
      ),
    ).toBe('invalid-result');
    expect(
      codeOf(() =>
        applyCommand(document, {
          type: 'AddTemplateBinding',
          index: 0,
          binding: { id: 'bind-title-again', kind: 'placeholders', nodeId: 'card-title' },
        }),
      ),
    ).toBe('invalid-result');
    expect(
      codeOf(() => applyCommand(document, { type: 'RemoveTemplateBinding', bindingId: 'nothing' })),
    ).toBe('unknown-binding');
  });
});

describe('binding-in-use (D58.6)', () => {
  it('refuses to change a bound text or color away from its default', () => {
    const text = errorOf(() =>
      applyCommand(document, { type: 'SetTextContent', nodeId: 'card-tagline', text: 'Other' }),
    );
    expect(text.code).toBe('binding-in-use');
    expect(text.details).toEqual(['bind-tagline']);
    expect(
      errorOf(() =>
        applyCommand(document, {
          type: 'SetNodeColor',
          nodeId: 'card-background',
          color: '#ffffff',
        }),
      ).details,
    ).toEqual(['bind-brand']);
  });

  it('refuses a placeholder text that is no pattern, and a removed bound node', () => {
    expect(
      codeOf(() =>
        applyCommand(document, { type: 'SetTextContent', nodeId: 'card-title', text: '{{nope}}' }),
      ),
    ).toBe('binding-in-use');
    expect(
      errorOf(() => applyCommand(document, { type: 'RemoveNode', nodeId: 'card-title' })).details,
    ).toEqual(['bind-title']);
  });

  it('lets a placeholder text change to another pattern of known inputs', () => {
    const edited = roundTrip(document, {
      type: 'SetTextContent',
      nodeId: 'card-title',
      text: '{{rank}}. {{name}}',
    });
    expect(nodeOf(edited, 'card-title')['text']).toBe('{{rank}}. {{name}}');
  });

  it('takes the change and the binding removal in one transaction', () => {
    const unbound = applyCommand(document, {
      type: 'RemoveTemplateBinding',
      bindingId: 'bind-tagline',
    }).document;
    const edited = applyCommand(unbound, {
      type: 'SetTextContent',
      nodeId: 'card-tagline',
      text: 'Other',
    }).document;
    expect(nodeOf(edited, 'card-tagline')['text']).toBe('Other');
  });
});

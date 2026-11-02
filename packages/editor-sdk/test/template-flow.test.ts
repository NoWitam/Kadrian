/**
 * The commands of conditions and repeats (D59.6): each added and removed, and
 * undone by its inverse to the exact text of the document before it; typed
 * refusals; and the commands that are no template commands refusing to break
 * a condition or a repeat with `binding-in-use`, naming them.
 */
import { repeatsComposition } from '@kadrion/test-fixtures';
import type { ValidatedComposition } from '@kadrion/schema';
import { describe, expect, it } from 'vitest';

import { applyCommand, EditorError, type Command } from '../src/index.js';

import { codeOf, json, validated } from './support.js';

const document = validated(repeatsComposition);

interface TemplateView {
  readonly conditions: readonly Record<string, unknown>[];
  readonly repeats: readonly Record<string, unknown>[];
}

function templateOf(composition: unknown): TemplateView {
  return (composition as { template: TemplateView }).template;
}

/** Applies a command and its inverse, checks the restored text, and returns the result. */
function roundTrip(from: ValidatedComposition, command: Command): ReturnType<typeof applyCommand> {
  const result = applyCommand(from, command);
  expect(result.inverse).not.toBeNull();
  const restored = applyCommand(result.document, result.inverse as Command).document;
  expect(json(restored)).toBe(json(from));
  return result;
}

function errorOf(run: () => unknown): EditorError {
  try {
    run();
  } catch (reason) {
    if (reason instanceof EditorError) return reason;
    throw reason;
  }
  throw new Error('The call threw nothing.');
}

describe('AddTemplateCondition and RemoveTemplateCondition (D59.6)', () => {
  it('inserts a condition at its index and is undone exactly', () => {
    const result = roundTrip(document, {
      type: 'AddTemplateCondition',
      index: 1,
      condition: {
        id: 'when-mood',
        test: 'not-empty',
        targetId: 'credits-background',
        inputId: 'mood',
      },
    });
    expect(templateOf(result.document).conditions.map(({ id }) => id)).toEqual([
      'when-intro',
      'when-mood',
      'when-no-one',
      'when-stars',
    ]);
    expect(result.createdIds).toEqual(['when-mood']);
  });

  it('removes a condition and is undone exactly, at its index', () => {
    const result = roundTrip(document, {
      type: 'RemoveTemplateCondition',
      conditionId: 'when-no-one',
    });
    expect(templateOf(result.document).conditions.map(({ id }) => id)).toEqual([
      'when-intro',
      'when-stars',
    ]);
  });

  it('refuses a taken ID, an index past the end, a test that does not fit, and an unknown condition', () => {
    const condition = {
      id: 'when-x',
      test: 'true',
      targetId: 'scene-intro',
      inputId: 'show-intro',
    };
    expect(
      codeOf(() =>
        applyCommand(document, {
          type: 'AddTemplateCondition',
          index: 0,
          condition: { ...condition, id: 'scene-intro' },
        }),
      ),
    ).toBe('id-in-use');
    expect(
      codeOf(() => applyCommand(document, { type: 'AddTemplateCondition', index: 4, condition })),
    ).toBe('index-out-of-range');
    expect(
      codeOf(() =>
        applyCommand(document, {
          type: 'AddTemplateCondition',
          index: 0,
          condition: { ...condition, inputId: 'title' },
        }),
      ),
    ).toBe('invalid-result');
    expect(
      codeOf(() =>
        applyCommand(document, { type: 'RemoveTemplateCondition', conditionId: 'when-x' }),
      ),
    ).toBe('unknown-condition');
  });
});

describe('AddTemplateRepeat and RemoveTemplateRepeat (D59.6)', () => {
  it('inserts a repeat and is undone exactly', () => {
    const result = roundTrip(document, {
      type: 'AddTemplateRepeat',
      index: 2,
      repeat: {
        id: 'repeat-stars',
        duration: 'target',
        targetId: 'credits-stars',
        inputId: 'people',
      },
    });
    expect(templateOf(result.document).repeats.map(({ id }) => id)).toEqual([
      'repeat-person',
      'repeat-credit',
      'repeat-stars',
    ]);
  });

  it('removes a repeat once nothing reads its items, and is undone exactly', () => {
    expect(
      codeOf(() =>
        applyCommand(document, { type: 'RemoveTemplateRepeat', repeatId: 'repeat-credit' }),
      ),
    ).toBe('invalid-result');
    const unbound = applyCommand(document, {
      type: 'RemoveTemplateBinding',
      bindingId: 'bind-credit',
    }).document;
    const result = roundTrip(unbound, { type: 'RemoveTemplateRepeat', repeatId: 'repeat-credit' });
    expect(templateOf(result.document).repeats.map(({ id }) => id)).toEqual(['repeat-person']);
  });

  it('refuses a nested repeat, a field that is no number, and an unknown repeat', () => {
    expect(
      codeOf(() =>
        applyCommand(document, {
          type: 'AddTemplateRepeat',
          index: 0,
          repeat: {
            id: 'repeat-name',
            duration: 'target',
            targetId: 'person-name',
            inputId: 'people',
          },
        }),
      ),
    ).toBe('invalid-result');
    expect(
      codeOf(() =>
        applyCommand(document, {
          type: 'AddTemplateRepeat',
          index: 0,
          repeat: {
            id: 'repeat-stars',
            duration: 'field',
            targetId: 'credits-stars',
            inputId: 'people',
            key: 'name',
          },
        }),
      ),
    ).toBe('invalid-result');
    expect(
      codeOf(() => applyCommand(document, { type: 'RemoveTemplateRepeat', repeatId: 'repeat-x' })),
    ).toBe('unknown-repeat');
  });
});

describe('binding-in-use for conditions and repeats (D59.6)', () => {
  it('refuses to remove a node that a condition or a repeat names, naming them', () => {
    expect(
      errorOf(() => applyCommand(document, { type: 'RemoveNode', nodeId: 'credits-stars' })),
    ).toMatchObject({ code: 'binding-in-use', details: ['when-stars'] });
    expect(
      errorOf(() => applyCommand(document, { type: 'RemoveNode', nodeId: 'credit-line' })).details,
    ).toEqual(['bind-credit', 'repeat-credit']);
  });

  it('refuses to remove an input that a condition or a repeat reads, naming them', () => {
    expect(
      errorOf(() => applyCommand(document, { type: 'RemoveTemplateInput', inputId: 'show-intro' })),
    ).toMatchObject({ code: 'input-in-use', details: ['when-intro'] });
  });

  it('takes the removal of the condition and of its node in one transaction', () => {
    const free = applyCommand(document, {
      type: 'RemoveTemplateCondition',
      conditionId: 'when-stars',
    }).document;
    const edited = applyCommand(free, { type: 'RemoveNode', nodeId: 'credits-stars' }).document;
    expect(json(edited)).not.toContain('credits-stars');
  });
});

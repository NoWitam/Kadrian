/**
 * `SetCompositionClear` (D89.2) through `applyCommand` and the bus: it sets
 * the clear of the composition and nothing else, in its place after the safe
 * area, the same value is no edit (D38.9), and the inverse sets the old clear
 * back, byte for byte. The expected values are written out by hand from the
 * reference composition, whose clear is white.
 */
import { describe, expect, it } from 'vitest';

import {
  applyCommand,
  createCommandBus,
  describeDocument,
  parseCommand,
  type Command,
} from '../src/index.js';

import { codeOf, everyType, json, reference } from './support.js';

function clearOf(clear: 'white' | 'transparent'): Command {
  return { type: 'SetCompositionClear', clear };
}

function fieldOf(document: unknown, field: string): unknown {
  return (document as Record<string, unknown>)[field];
}

describe('SetCompositionClear (D89.2)', () => {
  it('premise: the reference composition clears to white', () => {
    expect(fieldOf(reference(), 'clear')).toBe('white');
  });

  it('sets a transparent clear and nothing else, in its place, and its inverse gives the bytes back', () => {
    const before = everyType();
    const result = applyCommand(before, clearOf('transparent'));
    expect(fieldOf(result.document, 'clear')).toBe('transparent');
    // The clear keeps its place, right after the safe area (D30.7).
    expect(Object.keys(result.document)).toEqual(Object.keys(before));
    const keys = Object.keys(result.document);
    expect(keys[keys.indexOf('safeArea') + 1]).toBe('clear');
    expect(json(Object.assign({}, result.document, { clear: 'white' }))).toBe(json(before));
    expect(result.createdIds).toEqual([]);
    if (result.inverse === null) throw new Error('The command changed nothing.');
    expect(result.inverse).toEqual(clearOf('white'));
    expect(json(applyCommand(result.document, result.inverse).document)).toBe(json(before));
  });

  it('sets a white clear back on a transparent document', () => {
    const transparent = applyCommand(reference(), clearOf('transparent')).document;
    const result = applyCommand(transparent, clearOf('white'));
    expect(json(result.document)).toBe(json(reference()));
    expect(result.inverse).toEqual(clearOf('transparent'));
  });

  it.each(['white', 'transparent'] as const)(
    'is no edit for the clear %s the document has',
    (clear) => {
      const before =
        clear === 'white' ? reference() : applyCommand(reference(), clearOf(clear)).document;
      const result = applyCommand(before, clearOf(clear));
      expect(result.inverse).toBeNull();
      expect(json(result.document)).toBe(json(before));
    },
  );

  it.each([['black'], ['#ffffff'], [''], [null], [0], [{ r: 0, g: 0, b: 0, a: 0 }], [undefined]])(
    'refuses the clear %j with invalid-argument',
    (clear) => {
      expect(
        codeOf(() =>
          applyCommand(reference(), { type: 'SetCompositionClear', clear } as unknown as Command),
        ),
      ).toBe('invalid-argument');
    },
  );

  it('refuses an unknown field with invalid-argument, and parses a known clear frozen', () => {
    expect(
      codeOf(() =>
        parseCommand({ type: 'SetCompositionClear', clear: 'white', colour: '#ffffff' }),
      ),
    ).toBe('invalid-argument');
    const parsed = parseCommand({ type: 'SetCompositionClear', clear: 'transparent' });
    expect(parsed).toEqual(clearOf('transparent'));
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it('is shown by describeDocument', () => {
    const transparent = applyCommand(reference(), clearOf('transparent')).document;
    expect(describeDocument(reference()).clear).toBe('white');
    expect(describeDocument(transparent).clear).toBe('transparent');
  });

  it('is undone and redone by the bus as one edit', () => {
    const bus = createCommandBus(reference());
    const before = json(bus.getDocument());
    bus.dispatch(clearOf('transparent'));
    expect(fieldOf(bus.getDocument(), 'clear')).toBe('transparent');
    bus.undo();
    expect(json(bus.getDocument())).toBe(before);
    bus.redo();
    expect(fieldOf(bus.getDocument(), 'clear')).toBe('transparent');
  });
});

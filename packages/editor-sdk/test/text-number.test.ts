/**
 * `SetTextNumber` (D91.2) through `applyCommand` and the bus: it gives a text
 * a number and empties its text, `null` takes the number away and leaves the
 * text empty, the same number and text is no edit, a node that is no text is
 * `unsupported-node`, a document the result cannot hold is `invalid-result`,
 * and the inverse sets the old number and the old text back, byte for byte.
 * The row `number` is animated by the generic keyframe commands.
 */
import { describe, expect, it } from 'vitest';

import { applyCommand, createCommandBus, type Command } from '../src/index.js';

import { codeOf, errorOf, everyType, json, nodeOf, reference } from './support.js';

function fieldOf(document: unknown, nodeId: string, field: string): unknown {
  return (nodeOf(document, nodeId) as unknown as Record<string, unknown>)[field];
}

const NUMBER = {
  value: 1_234_567.89,
  decimals: 2,
  decimalSeparator: ',',
  groupSeparator: ' ',
  prefix: '',
  suffix: ' zł',
} as const;

function numbered(nodeId: string, number: unknown = NUMBER): Command {
  return { type: 'SetTextNumber', nodeId, number } as unknown as Command;
}

describe('SetTextNumber (D91.2)', () => {
  it.each([
    ['a text', 'node-title', 'Kadrion'],
    ['a text in a group', 'node-caption', 'Deterministic by design'],
  ])(
    'gives %s a number and empties its text, and its inverse gives the bytes back',
    (_, nodeId, text) => {
      const before = reference();
      const result = applyCommand(before, numbered(nodeId));
      expect(JSON.stringify(fieldOf(result.document, nodeId, 'number'))).toBe(
        '{"kind":"number","value":1234567.89,"decimals":2,"decimalSeparator":",","groupSeparator":" ","prefix":"","suffix":" zł"}',
      );
      expect(fieldOf(result.document, nodeId, 'text')).toBe('');
      // The number stands right after the text, as the schema orders the keys.
      const keys = Object.keys(nodeOf(result.document, nodeId));
      expect(keys[keys.indexOf('text') + 1]).toBe('number');
      if (result.inverse === null) throw new Error('The command changed nothing.');
      expect(JSON.stringify(result.inverse)).toBe(
        `{"type":"SetTextNumber","nodeId":"${nodeId}","number":null,"text":${JSON.stringify(text)}}`,
      );
      expect(json(applyCommand(result.document, result.inverse).document)).toBe(json(before));
    },
  );

  it('keeps the keys of the number in the order of the schema, whatever order the call has', () => {
    const result = applyCommand(
      reference(),
      numbered('node-title', {
        suffix: ' zł',
        prefix: '',
        groupSeparator: ' ',
        decimalSeparator: ',',
        decimals: 2,
        value: 1_234_567.89,
      }),
    );
    expect(Object.keys(fieldOf(result.document, 'node-title', 'number') as object)).toEqual([
      'kind',
      'value',
      'decimals',
      'decimalSeparator',
      'groupSeparator',
      'prefix',
      'suffix',
    ]);
  });

  it('is no edit for the number and the text the node has', () => {
    const once = applyCommand(reference(), numbered('node-title')).document;
    const again = applyCommand(once, numbered('node-title'));
    expect(again.inverse).toBeNull();
    expect(json(again.document)).toBe(json(once));
    // null on a text without a number, whose text is not empty, sets its text to ''.
    const cleared = applyCommand(reference(), numbered('node-title', null));
    expect(fieldOf(cleared.document, 'node-title', 'text')).toBe('');
    expect(JSON.stringify(fieldOf(cleared.document, 'node-title', 'number'))).toBe(
      '{"kind":"none"}',
    );
  });

  it('takes null as no number, leaves the text empty, and its inverse sets the old number back', () => {
    const once = applyCommand(reference(), numbered('node-title')).document;
    const result = applyCommand(once, numbered('node-title', null));
    expect(JSON.stringify(fieldOf(result.document, 'node-title', 'number'))).toBe(
      '{"kind":"none"}',
    );
    expect(fieldOf(result.document, 'node-title', 'text')).toBe('');
    if (result.inverse === null) throw new Error('The command changed nothing.');
    expect(json(applyCommand(result.document, result.inverse).document)).toBe(json(once));
  });

  it('writes the text a call gives with null, as the inverse of a number does', () => {
    const once = applyCommand(reference(), numbered('node-title')).document;
    const result = applyCommand(once, {
      type: 'SetTextNumber',
      nodeId: 'node-title',
      number: null,
      text: 'Kadrion',
    } as unknown as Command);
    expect(json(result.document)).toBe(json(reference()));
  });

  it.each(['node-image', 'node-group', 'node-captions', 'node-shape', 'node-background'])(
    'refuses %s, which is no text, with unsupported-node',
    (nodeId) => {
      expect(codeOf(() => applyCommand(everyType(), numbered(nodeId)))).toBe('unsupported-node');
    },
  );

  it('refuses a node that does not exist with unknown-node', () => {
    expect(codeOf(() => applyCommand(reference(), numbered('node-missing')))).toBe('unknown-node');
  });

  it('refuses equal separators, and a number that would keep a text of its own, with invalid-result', () => {
    const equal = errorOf(() =>
      applyCommand(reference(), numbered('node-title', { ...NUMBER, groupSeparator: ',' })),
    );
    expect(equal.code).toBe('invalid-result');
    expect(equal.details.join('\n')).toContain('/number/groupSeparator');
    const kept = errorOf(() =>
      applyCommand(reference(), {
        type: 'SetTextNumber',
        nodeId: 'node-title',
        number: NUMBER,
        text: 'Kadrion',
      } as unknown as Command),
    );
    expect(kept.code).toBe('invalid-result');
    expect(kept.details.join('\n')).toContain('/text');
  });

  it('refuses taking the number of a text whose number is animated, with invalid-result', () => {
    const once = applyCommand(reference(), numbered('node-title')).document;
    const animated = applyCommand(once, {
      type: 'AddAnimation',
      nodeId: 'node-title',
      index: 1,
      animation: {
        id: 'animation-title-number',
        property: 'number',
        keyframes: [
          { timeUs: 0, value: 0, easing: { kind: 'linear' } },
          { timeUs: 1_000_000, value: 100, easing: { kind: 'linear' } },
        ],
      },
    } as unknown as Command).document;
    const error = errorOf(() => applyCommand(animated, numbered('node-title', null)));
    expect(error.code).toBe('invalid-result');
    expect(error.details.join('\n')).toContain('/animations/1');
  });

  it.each([
    [{ ...NUMBER, decimals: 7 }],
    [{ ...NUMBER, decimals: 1.5 }],
    [{ ...NUMBER, value: Number.NaN }],
    [{ ...NUMBER, value: '1' }],
    [{ ...NUMBER, value: Number.MAX_SAFE_INTEGER + 2 }],
    [{ ...NUMBER, groupSeparator: '_' }],
    [{ ...NUMBER, decimalSeparator: ' ' }],
    [{ ...NUMBER, prefix: 1 }],
    [{ ...NUMBER, kind: 'number' }],
    [{ kind: 'none' }],
    [{ value: 1 }],
    ['none'],
    [0],
  ])('refuses the argument %o with invalid-argument', (number) => {
    expect(codeOf(() => applyCommand(reference(), numbered('node-title', number)))).toBe(
      'invalid-argument',
    );
  });

  it('refuses a text that is no string with invalid-argument', () => {
    expect(
      codeOf(() =>
        applyCommand(reference(), {
          type: 'SetTextNumber',
          nodeId: 'node-title',
          number: null,
          text: 5,
        } as unknown as Command),
      ),
    ).toBe('invalid-argument');
  });

  it('goes through the bus with one undo and one redo', () => {
    const bus = createCommandBus(reference());
    const before = json(bus.getDocument());
    bus.dispatch(numbered('node-title'));
    const after = json(bus.getDocument());
    expect(after).not.toBe(before);
    bus.undo();
    expect(json(bus.getDocument())).toBe(before);
    bus.redo();
    expect(json(bus.getDocument())).toBe(after);
  });

  it('animates the value with SetKeyframeValue, a finite number', () => {
    const once = applyCommand(reference(), numbered('node-title')).document;
    const animated = applyCommand(once, {
      type: 'AddAnimation',
      nodeId: 'node-title',
      index: 1,
      animation: {
        id: 'animation-title-number',
        property: 'number',
        keyframes: [
          { timeUs: 0, value: 0, easing: { kind: 'linear' } },
          { timeUs: 1_000_000, value: 100, easing: { kind: 'linear' } },
        ],
      },
    } as unknown as Command).document;
    const result = applyCommand(animated, {
      type: 'SetKeyframeValue',
      animationId: 'animation-title-number',
      timeUs: 1_000_000,
      value: -2.5,
    } as unknown as Command);
    const animations = fieldOf(result.document, 'node-title', 'animations') as {
      keyframes: { value: unknown }[];
    }[];
    expect(animations[1]?.keyframes[1]?.value).toBe(-2.5);
    expect(
      codeOf(() =>
        applyCommand(animated, {
          type: 'SetKeyframeValue',
          animationId: 'animation-title-number',
          timeUs: 1_000_000,
          value: Number.POSITIVE_INFINITY,
        } as unknown as Command),
      ),
    ).toBe('invalid-argument');
  });
});

/**
 * `SetNodeOpacity` and `SetTextContent` (D38.2, D38.3) through `applyCommand`,
 * in the same order D30.4 fixes for `SetNodePosition`: parse, find, read the
 * previous value, rebuild the path to the node, validate the result in full.
 */
import { describe, expect, it } from 'vitest';

import { applyCommand, parseCommand, type Command } from '../src/index.js';

import { codeOf, errorOf, json, nodeOf, reference } from './support.js';

/** `node-title`: a top-level text node, opacity 0.75, text "Kadrion". */
const TITLE = 'node-title';
/** `node-caption`: a text node inside `node-group`, opacity 1. */
const CAPTION = 'node-caption';

function fade(nodeId: string, opacity: number): Command {
  return { type: 'SetNodeOpacity', nodeId, opacity };
}

function retext(nodeId: string, text: string): Command {
  return { type: 'SetTextContent', nodeId, text };
}

function fieldOf(document: unknown, nodeId: string, field: string): unknown {
  return (nodeOf(document, nodeId) as unknown as Record<string, unknown>)[field];
}

describe('SetNodeOpacity (D38.2)', () => {
  it('sets the base opacity and returns the previous one as the inverse', () => {
    const document = reference();
    const result = applyCommand(document, fade(TITLE, 0.25));
    expect(fieldOf(result.document, TITLE, 'opacity')).toBe(0.25);
    expect(result.inverse).toEqual(fade(TITLE, 0.75));
    expect(Object.isFrozen(result.inverse)).toBe(true);
  });

  it('changes only the opacity byte of the document and keeps the animations', () => {
    const document = reference();
    const { document: edited } = applyCommand(document, fade(TITLE, 0.25));
    const before = json(document);
    const at = before.indexOf('"id":"node-title"');
    const expected =
      before.slice(0, at) + before.slice(at).replace('"opacity":0.75', '"opacity":0.25');
    expect(json(edited)).toBe(expected);
    expect(nodeOf(edited, TITLE).animations).toBe(nodeOf(document, TITLE).animations);
    expect(json(document)).toBe(json(reference()));
  });

  it('undoes to a byte-identical document (P3)', () => {
    const document = reference();
    const forward = applyCommand(document, fade(TITLE, 0));
    if (forward.inverse === null) throw new Error('The command reported no change.');
    expect(json(applyCommand(forward.document, forward.inverse).document)).toBe(json(document));
  });

  it('fades a node inside a group and a group itself', () => {
    const document = reference();
    expect(fieldOf(applyCommand(document, fade(CAPTION, 0.5)).document, CAPTION, 'opacity')).toBe(
      0.5,
    );
    const group = applyCommand(document, fade('node-group', 0.5));
    expect(fieldOf(group.document, 'node-group', 'opacity')).toBe(0.5);
    expect(fieldOf(group.document, CAPTION, 'opacity')).toBe(1);
  });

  it('keeps a fraction to the last bit: nothing is rounded or clamped', () => {
    const { document } = applyCommand(reference(), fade(TITLE, 0.30000000000000004));
    expect(fieldOf(document, TITLE, 'opacity')).toBe(0.30000000000000004);
  });

  it('is a no-op when the opacity does not change, -0 included', () => {
    const document = reference();
    const same = applyCommand(document, fade(TITLE, 0.75));
    expect(same.document).toBe(document);
    expect(same.inverse).toBeNull();
    const zero = applyCommand(document, fade(TITLE, 0));
    if (zero.inverse === null) throw new Error('The command reported no change.');
    const negative = applyCommand(zero.document, fade(TITLE, -0));
    expect(negative.document).toBe(zero.document);
    expect(negative.inverse).toBeNull();
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['a value above 1', 1.0000000000000002],
    ['a value below 0', -5e-324],
    ['2', 2],
    ['-1', -1],
  ])('refuses %s as invalid-argument, not by clamping', (_, opacity) => {
    const document = reference();
    expect(codeOf(() => applyCommand(document, fade(TITLE, opacity)))).toBe('invalid-argument');
    expect(json(document)).toBe(json(reference()));
  });

  it('names the refused value', () => {
    expect(errorOf(() => parseCommand(fade(TITLE, 1.5))).message).toBe(
      '`opacity` must be a finite number from 0 to 1, not 1.5.',
    );
  });

  it.each([
    ['a node without an opacity', fade('node-background', 0.5), 'unsupported-node'],
    ['an unknown node', fade('node-missing', 0.5), 'unknown-node'],
    ['an animation, which is not a node', fade('anim-title-opacity', 0.5), 'unknown-node'],
    ['a string', { type: 'SetNodeOpacity', nodeId: TITLE, opacity: '0.5' }, 'invalid-argument'],
    ['a missing opacity', { type: 'SetNodeOpacity', nodeId: TITLE }, 'invalid-argument'],
    ['an extra field', { ...fade(TITLE, 0.5), text: 'x' }, 'invalid-argument'],
    ['an empty nodeId', fade('', 0.5), 'invalid-argument'],
  ])('rejects %s with %s', (_, command, code) => {
    expect(codeOf(() => applyCommand(reference(), command as Command))).toBe(code);
  });

  it('parses to a frozen command, idempotently, and normalises -0 to 0', () => {
    const command = parseCommand(fade(TITLE, -0));
    expect(Object.isFrozen(command)).toBe(true);
    expect(command).toEqual(fade(TITLE, 0));
    expect(Object.is((command as { opacity: number }).opacity, 0)).toBe(true);
    expect(parseCommand(parseCommand(command))).toEqual(command);
  });
});

describe('SetTextContent (D38.3)', () => {
  it('replaces the text and returns the previous one as the inverse', () => {
    const result = applyCommand(reference(), retext(TITLE, 'Hello'));
    expect(fieldOf(result.document, TITLE, 'text')).toBe('Hello');
    expect(result.inverse).toEqual(retext(TITLE, 'Kadrion'));
    expect(Object.isFrozen(result.inverse)).toBe(true);
  });

  it('keeps the text exactly as given: nothing is trimmed or normalised', () => {
    for (const text of ['', '  padded  ', 'line\nbreak\r\n', 'é', 'é', 'a'.repeat(100_000)]) {
      const { document } = applyCommand(reference(), retext(CAPTION, text));
      expect(fieldOf(document, CAPTION, 'text')).toBe(text);
    }
  });

  it('changes only the text of the node and undoes to a byte-identical document (P3)', () => {
    const document = reference();
    const forward = applyCommand(document, retext(TITLE, 'Hello'));
    expect(json(forward.document)).toBe(
      json(document).replace('"text":"Kadrion"', '"text":"Hello"'),
    );
    if (forward.inverse === null) throw new Error('The command reported no change.');
    expect(json(applyCommand(forward.document, forward.inverse).document)).toBe(json(document));
  });

  it('is a no-op when the text does not change', () => {
    const document = reference();
    const result = applyCommand(document, retext(TITLE, 'Kadrion'));
    expect(result.document).toBe(document);
    expect(result.inverse).toBeNull();
  });

  it('tells texts apart that differ only in normalisation', () => {
    const composed = applyCommand(reference(), retext(TITLE, 'é'));
    const decomposed = applyCommand(composed.document, retext(TITLE, 'é'));
    expect(decomposed.inverse).toEqual(retext(TITLE, 'é'));
  });

  it.each([
    ['an image', retext('node-image', 'x'), 'unsupported-node'],
    ['a group', retext('node-group', 'x'), 'unsupported-node'],
    ['a Custom HTML element', retext('node-custom-html', 'x'), 'unsupported-node'],
    ['the background', retext('node-background', 'x'), 'unsupported-node'],
    ['an unknown node', retext('node-missing', 'x'), 'unknown-node'],
    ['a number', { type: 'SetTextContent', nodeId: TITLE, text: 7 }, 'invalid-argument'],
    ['null', { type: 'SetTextContent', nodeId: TITLE, text: null }, 'invalid-argument'],
    ['a missing text', { type: 'SetTextContent', nodeId: TITLE }, 'invalid-argument'],
    ['an extra field', { ...retext(TITLE, 'x'), opacity: 1 }, 'invalid-argument'],
  ])('rejects %s with %s', (_, command, code) => {
    expect(codeOf(() => applyCommand(reference(), command as Command))).toBe(code);
  });
});

/**
 * The property commands of D40.1 — `SetNodeScale`, `SetNodeSize`,
 * `SetNodeColor`, and `SetTextFontSize` — through `applyCommand` and the bus.
 * Each sets a base value, normalises it as its field requires, compares for a
 * no-op after the normalisation, and refuses a node without the field. The
 * expected values are written out by hand from the reference composition.
 */
import { referenceComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { applyCommand, createCommandBus, parseCommand, type Command } from '../src/index.js';

import { codeOf, errorOf, json, nodeOf, reference } from './support.js';

const TITLE = 'node-title';
const IMAGE = 'node-image';
const HTML = 'node-custom-html';

function fieldOf(document: unknown, nodeId: string, field: string): unknown {
  return (nodeOf(document, nodeId) as unknown as Record<string, unknown>)[field];
}

function scale(nodeId: string, x: unknown, y: unknown): Command {
  return { type: 'SetNodeScale', nodeId, scale: { x, y } } as Command;
}

function size(nodeId: string, width: unknown, height: unknown): Command {
  return { type: 'SetNodeSize', nodeId, width, height } as Command;
}

function color(nodeId: string, value: unknown): Command {
  return { type: 'SetNodeColor', nodeId, color: value } as Command;
}

function fontSize(nodeId: string, value: unknown): Command {
  return { type: 'SetTextFontSize', nodeId, fontSize: value } as Command;
}

/** Applies a command and undoes it through its inverse; the bytes must come back. */
function roundTrip(command: Command): unknown {
  const document = reference();
  const forward = applyCommand(document, command);
  if (forward.inverse === null) throw new Error('The command changed nothing.');
  expect(json(applyCommand(forward.document, forward.inverse).document)).toBe(json(document));
  expect(Object.isFrozen(forward.inverse)).toBe(true);
  return forward.document;
}

describe('SetNodeScale (D40.1)', () => {
  it('sets the base scale, keeps the scale animation, and undoes byte for byte', () => {
    const edited = roundTrip(scale(IMAGE, 2, 0.5));
    expect(fieldOf(edited, IMAGE, 'scale')).toEqual({ x: 2, y: 0.5 });
    expect(nodeOf(edited, IMAGE).animations).toBe(nodeOf(reference(), IMAGE).animations);
    const inverse = applyCommand(reference(), scale(IMAGE, 2, 0.5)).inverse;
    expect(inverse).toEqual(scale(IMAGE, 1.25, 1.25));
  });

  it('scales a group and a Custom HTML element, which carry a scale', () => {
    for (const nodeId of ['node-group', HTML]) roundTrip(scale(nodeId, 3, 3));
  });

  it('keeps a factor to the last bit and accepts the bounds 0 and 1000', () => {
    const edited = applyCommand(reference(), scale(TITLE, 0.30000000000000004, 1000)).document;
    expect(fieldOf(edited, TITLE, 'scale')).toEqual({ x: 0.30000000000000004, y: 1000 });
    expect(fieldOf(applyCommand(reference(), scale(TITLE, 0, 0)).document, TITLE, 'scale')).toEqual(
      {
        x: 0,
        y: 0,
      },
    );
  });

  it('normalises -0 to 0 in both factors, which Object.is tells apart (D40.1)', () => {
    // `-0 === 0` holds, so only Object.is sees whether the parser normalised.
    const command = parseCommand(scale(TITLE, -0, -0)) as { scale: { x: number; y: number } };
    expect(Object.is(command.scale.x, 0)).toBe(true);
    expect(Object.is(command.scale.y, 0)).toBe(true);
  });

  it('is a no-op for the current scale, -0 included', () => {
    const document = reference();
    const same = applyCommand(document, scale(TITLE, 1, 1));
    expect(same.document).toBe(document);
    expect(same.inverse).toBeNull();
    const zero = applyCommand(document, scale(TITLE, 0, 0)).document;
    expect(applyCommand(zero, scale(TITLE, -0, -0)).inverse).toBeNull();
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a negative factor', -0.5],
    ['a factor above 1000', 1000.0001],
    ['a string', '2'],
  ])('refuses %s as invalid-argument, never clamping', (_, value) => {
    expect(codeOf(() => applyCommand(reference(), scale(TITLE, value, 1)))).toBe(
      'invalid-argument',
    );
    expect(codeOf(() => applyCommand(reference(), scale(TITLE, 1, value)))).toBe(
      'invalid-argument',
    );
  });

  it('refuses a node without a scale, and a node that is not there', () => {
    expect(codeOf(() => applyCommand(reference(), scale('node-background', 2, 2)))).toBe(
      'unsupported-node',
    );
    expect(codeOf(() => applyCommand(reference(), scale('asset-image', 2, 2)))).toBe(
      'unknown-node',
    );
  });
});

describe('SetNodeSize (D40.1)', () => {
  it('sets both sides of an image and of a Custom HTML element', () => {
    const edited = roundTrip(size(IMAGE, 300, 200));
    expect([fieldOf(edited, IMAGE, 'width'), fieldOf(edited, IMAGE, 'height')]).toEqual([300, 200]);
    roundTrip(size(HTML, 800, 60));
  });

  it.each([
    ['rounds down', 299.4, 299],
    ['rounds up', 299.6, 300],
    ['rounds a half towards +Infinity', 299.5, 300],
  ])('%s: %d becomes %d, as a position does (D15)', (_, given, expected) => {
    const command = parseCommand(size(IMAGE, given, 200)) as { width: number };
    expect(command.width).toBe(expected);
  });

  it('is a no-op when the rounded size is the current one', () => {
    const document = reference();
    const result = applyCommand(document, size(IMAGE, 399.6, 400.4));
    expect(result.document).toBe(document);
    expect(result.inverse).toBeNull();
  });

  it('leaves the range to the document: a size that rounds to 0 is invalid-result', () => {
    expect(codeOf(() => applyCommand(reference(), size(IMAGE, 0.4, 10)))).toBe('invalid-result');
    expect(codeOf(() => applyCommand(reference(), size(IMAGE, 10, 1_000_000.5)))).toBe(
      'invalid-result',
    );
    expect(codeOf(() => applyCommand(reference(), size(IMAGE, 0.5, 1_000_000.4)))).toBe(
      'did not throw',
    );
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a string', '300'],
    ['null', null],
  ])('refuses %s as invalid-argument', (_, value) => {
    expect(codeOf(() => applyCommand(reference(), size(IMAGE, value, 200)))).toBe(
      'invalid-argument',
    );
  });

  it.each([
    ['a text', TITLE],
    ['a group', 'node-group'],
    ['the background', 'node-background'],
  ])('refuses %s, which has no size', (_, nodeId) => {
    expect(codeOf(() => applyCommand(reference(), size(nodeId, 10, 10)))).toBe('unsupported-node');
  });
});

describe('SetNodeColor (D40.1)', () => {
  it('sets the colour of a text and of the background', () => {
    const edited = roundTrip(color(TITLE, '#1a2b3c'));
    expect(fieldOf(edited, TITLE, 'color')).toBe('#1a2b3c');
    expect(
      fieldOf(roundTrip(color('node-background', '#000000')), 'node-background', 'color'),
    ).toBe('#000000');
  });

  it('stores an upper-case colour in lower case', () => {
    const edited = applyCommand(reference(), color(TITLE, '#1A2B3C')).document;
    expect(fieldOf(edited, TITLE, 'color')).toBe('#1a2b3c');
    expect(parseCommand(color(TITLE, '#AbCdEf'))).toEqual(color(TITLE, '#abcdef'));
  });

  it('is a no-op when only the case differs from the current colour', () => {
    const document = reference();
    const result = applyCommand(document, color(TITLE, '#FFFFFF'));
    expect(result.document).toBe(document);
    expect(result.inverse).toBeNull();
  });

  it.each([
    ['a short form', '#fff'],
    ['a name', 'white'],
    ['alpha', '#ffffffff'],
    ['no hash', 'ffffff'],
    ['a non-hex digit', '#fffffg'],
    ['rgb()', 'rgb(0,0,0)'],
    ['a number', 0xffffff],
  ])('refuses %s as invalid-argument', (_, value) => {
    expect(codeOf(() => applyCommand(reference(), color(TITLE, value)))).toBe('invalid-argument');
  });

  it('refuses a node without a colour', () => {
    expect(codeOf(() => applyCommand(reference(), color(IMAGE, '#000000')))).toBe(
      'unsupported-node',
    );
    expect(codeOf(() => applyCommand(reference(), color('node-group', '#000000')))).toBe(
      'unsupported-node',
    );
  });
});

describe('SetTextFontSize (D40.1)', () => {
  it('sets the font size of a text, rounding a fraction', () => {
    const edited = roundTrip(fontSize(TITLE, 99.5));
    expect(fieldOf(edited, TITLE, 'fontSize')).toBe(100);
  });

  it('is a no-op when the rounded size is the current one', () => {
    const document = reference();
    expect(applyCommand(document, fontSize(TITLE, 144.4)).document).toBe(document);
  });

  it('leaves the range to the document', () => {
    expect(codeOf(() => applyCommand(reference(), fontSize(TITLE, 0.2)))).toBe('invalid-result');
    expect(codeOf(() => applyCommand(reference(), fontSize(TITLE, -3)))).toBe('invalid-result');
  });

  it('refuses a node without a font size, and a malformed size', () => {
    expect(codeOf(() => applyCommand(reference(), fontSize(IMAGE, 10)))).toBe('unsupported-node');
    expect(codeOf(() => applyCommand(reference(), fontSize(TITLE, Number.NaN)))).toBe(
      'invalid-argument',
    );
  });

  it('reports the refused value', () => {
    expect(errorOf(() => parseCommand(fontSize(TITLE, 'big'))).message).toBe(
      '`fontSize` must be a finite number, not string.',
    );
  });
});

describe('the property commands on the bus', () => {
  it('undo one change at a time and write no history for a no-op', () => {
    const bus = createCommandBus(referenceComposition);
    bus.dispatch(scale(TITLE, 2, 2));
    bus.dispatch(size(IMAGE, 10, 10));
    bus.dispatch(color(TITLE, '#FFFFFF'));
    bus.dispatch(fontSize(TITLE, 12));
    for (let step = 0; step < 3; step += 1) bus.undo();
    expect(bus.canUndo()).toBe(false);
    expect(json(bus.getDocument())).toBe(json(reference()));
  });

  it('report exactly the IDs they create, for every command of D40 (D39.4)', () => {
    const hash = `sha256:${'b'.repeat(64)}`;
    const bus = createCommandBus(referenceComposition);
    const created = (command: Command): readonly string[] => bus.dispatch(command).createdIds;
    expect(
      created({
        type: 'AddAsset',
        asset: { id: 'img-2', type: 'image', contentHash: hash },
        index: 3,
      }),
    ).toEqual(['img-2']);
    expect(
      created({
        type: 'AddAsset',
        asset: { id: 'font-2', type: 'font', contentHash: hash },
        index: 4,
      }),
    ).toEqual(['font-2']);
    expect(created(scale(TITLE, 2, 2))).toEqual([]);
    expect(created(size(IMAGE, 10, 10))).toEqual([]);
    expect(created(color(TITLE, '#123456'))).toEqual([]);
    expect(created(fontSize(TITLE, 12))).toEqual([]);
    expect(created({ type: 'SetTextFont', nodeId: TITLE, fontAssetId: 'font-2' })).toEqual([]);
    expect(created({ type: 'SetImageAsset', nodeId: IMAGE, assetId: 'img-2' })).toEqual([]);
    expect(created({ type: 'SetImageAsset', nodeId: IMAGE, assetId: 'asset-image' })).toEqual([]);
    expect(created({ type: 'RemoveAsset', assetId: 'img-2' })).toEqual([]);
  });
});

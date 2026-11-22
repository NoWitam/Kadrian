/**
 * `SetNodeFlip` (D89.3) through `applyCommand` and the bus: it sets the flip
 * of every transformable node and nothing else, the same value is no edit, a
 * background has no flip, and the inverse sets the old flip back, byte for
 * byte. The expected values are written out by hand from the reference
 * composition and the nodes of `everyType`.
 */
import { describe, expect, it } from 'vitest';

import { applyCommand, createCommandBus, type Command } from '../src/index.js';

import { codeOf, everyType, json, nodeOf, reference } from './support.js';

function fieldOf(document: unknown, nodeId: string, field: string): unknown {
  return (nodeOf(document, nodeId) as unknown as Record<string, unknown>)[field];
}

function flipOf(nodeId: string, x: boolean, y: boolean): Command {
  return { type: 'SetNodeFlip', nodeId, flip: { x, y } };
}

describe('SetNodeFlip (D89.3)', () => {
  it.each([
    ['an image in a group', 'node-image'],
    ['a group', 'node-group'],
    ['a text', 'node-title'],
    ['a Custom HTML element', 'node-custom-html'],
    ['a video', 'node-video'],
    ['a captions node', 'node-captions'],
    ['a shape', 'node-shape'],
    ['an instance', 'node-instance'],
  ])('flips %s and nothing else, and its inverse gives the bytes back', (_, nodeId) => {
    const before = everyType();
    const result = applyCommand(before, flipOf(nodeId, true, false));
    expect(JSON.stringify(fieldOf(result.document, nodeId, 'flip'))).toBe('{"x":true,"y":false}');
    // Only the flip of that node changed: the box, the position, and the origin stay.
    const restored = JSON.parse(json(result.document)) as unknown;
    (nodeOf(restored, nodeId) as unknown as Record<string, unknown>)['flip'] = {
      x: false,
      y: false,
    };
    expect(json(restored)).toBe(json(before));
    if (result.inverse === null) throw new Error('The command changed nothing.');
    expect(result.inverse).toEqual(flipOf(nodeId, false, false));
    expect(json(applyCommand(result.document, result.inverse).document)).toBe(json(before));
  });

  it('keeps the keys of the flip in the order of the schema, whatever order the call has', () => {
    const result = applyCommand(reference(), {
      type: 'SetNodeFlip',
      nodeId: 'node-title',
      flip: { y: true, x: true },
    } as unknown as Command);
    expect(JSON.stringify(fieldOf(result.document, 'node-title', 'flip'))).toBe(
      '{"x":true,"y":true}',
    );
  });

  it('is no edit for the flip the node has', () => {
    const before = reference();
    const result = applyCommand(before, flipOf('node-title', false, false));
    expect(result.inverse).toBeNull();
    expect(json(result.document)).toBe(json(before));
  });

  it('refuses a background with unsupported-node, and a node that does not exist with unknown-node', () => {
    expect(codeOf(() => applyCommand(reference(), flipOf('node-background', true, false)))).toBe(
      'unsupported-node',
    );
    expect(codeOf(() => applyCommand(reference(), flipOf('node-missing', true, false)))).toBe(
      'unknown-node',
    );
  });

  it.each([
    { x: 1, y: false },
    { x: true },
    { x: true, y: 'false' },
    { x: true, y: false, z: false },
    [true, false],
    null,
  ])('refuses the flip %j with invalid-argument', (flip) => {
    expect(
      codeOf(() =>
        applyCommand(reference(), { type: 'SetNodeFlip', nodeId: 'node-title', flip } as never),
      ),
    ).toBe('invalid-argument');
  });

  it('is undone and redone by the bus as one edit', () => {
    const bus = createCommandBus(reference());
    const before = json(bus.getDocument());
    bus.dispatch(flipOf('node-image', true, true));
    expect(JSON.stringify(fieldOf(bus.getDocument(), 'node-image', 'flip'))).toBe(
      '{"x":true,"y":true}',
    );
    bus.undo();
    expect(json(bus.getDocument())).toBe(before);
    bus.redo();
    expect(JSON.stringify(fieldOf(bus.getDocument(), 'node-image', 'flip'))).toBe(
      '{"x":true,"y":true}',
    );
  });
});

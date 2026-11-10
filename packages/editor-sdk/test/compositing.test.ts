/**
 * The commands of compositing (D75): SetBlendMode, SetNodeMask, and
 * SetNodeMatte each replace one field of a node whole, are undone by their
 * inverse, write no history when nothing changes, and refuse a background and
 * Custom HTML. The rules of a matte are the schema's: a matte that is no
 * sibling, no shape, or not plain is refused as invalid-result, and any other
 * command that would break a matte already in use is refused as matte-in-use
 * with the IDs of the nodes it mattes.
 */
import { describe, expect, it } from 'vitest';

import { applyCommand, type Command } from '../src/index.js';

import { codeOf, errorOf, everyType, json, nodeOf, SHAPE_NODE } from './support.js';

const TITLE = 'node-title';
const SHAPE = SHAPE_NODE.id;

function fieldOf(document: unknown, nodeId: string, field: string): unknown {
  return (nodeOf(document, nodeId) as unknown as Record<string, unknown>)[field];
}

const SHAPE_MASK = {
  kind: 'shape',
  x: 0,
  y: 0,
  width: 400,
  height: 200,
  geometry: { kind: 'ellipse' },
  inverted: false,
  feather: 12,
  animations: [
    {
      id: 'mask-title-feather',
      property: 'feather',
      keyframes: [
        { timeUs: 0, value: 0, easing: { kind: 'linear' } },
        { timeUs: 500_000, value: 24, easing: { kind: 'ease-out' } },
      ],
    },
  ],
} as const;

const IMAGE_MASK = {
  kind: 'image',
  assetId: 'asset-image',
  x: 10,
  y: 20,
  width: 300,
  height: 300,
  mode: 'luminance',
  inverted: true,
  feather: 0,
  animations: [],
} as const;

const MATTE = { kind: 'node', nodeId: SHAPE, mode: 'alpha' } as const;

const ROWS: readonly { field: string; command: Command; expected: unknown }[] = [
  {
    field: 'blendMode',
    command: { type: 'SetBlendMode', nodeId: TITLE, blendMode: 'screen' },
    expected: 'screen',
  },
  {
    field: 'mask',
    command: { type: 'SetNodeMask', nodeId: TITLE, mask: SHAPE_MASK },
    expected: SHAPE_MASK,
  },
  {
    field: 'mask',
    command: { type: 'SetNodeMask', nodeId: TITLE, mask: IMAGE_MASK },
    expected: IMAGE_MASK,
  },
  {
    field: 'matte',
    command: { type: 'SetNodeMatte', nodeId: TITLE, matte: MATTE },
    expected: MATTE,
  },
];

/** The reference of every node type, its title matted by the shape. */
function matted(): ReturnType<typeof everyType> {
  return applyCommand(everyType(), { type: 'SetNodeMatte', nodeId: TITLE, matte: MATTE }).document;
}

describe('the commands of compositing (D75)', () => {
  it.each(ROWS)(
    '$command.type replaces the $field of a node and is undone by its inverse',
    (row) => {
      const document = everyType();
      const result = applyCommand(document, row.command);
      expect(fieldOf(result.document, TITLE, row.field)).toEqual(row.expected);
      expect(Object.keys(nodeOf(result.document, TITLE)).slice(-4)).toEqual([
        'effects',
        'mask',
        'matte',
        'blendMode',
      ]);
      if (result.inverse === null) throw new Error('No inverse.');
      expect(json(applyCommand(result.document, result.inverse).document)).toBe(json(document));
    },
  );

  it.each(ROWS)(
    '$command.type writes no history when the $field is already the one given',
    (row) => {
      const once = applyCommand(everyType(), row.command).document;
      expect(applyCommand(once, row.command).inverse).toBeNull();
    },
  );

  it.each(ROWS)('$command.type refuses a background and Custom HTML', (row) => {
    for (const nodeId of ['node-background', 'node-custom-html']) {
      const command = { ...row.command, nodeId } as Command;
      expect(
        codeOf(() => applyCommand(everyType(), command)),
        nodeId,
      ).toBe('unsupported-node');
    }
  });

  it('reaches every node type that composites: image, video, text, captions, shape, and group', () => {
    for (const nodeId of [
      'node-image',
      'node-video',
      TITLE,
      'node-captions',
      SHAPE,
      'node-group',
    ]) {
      const result = applyCommand(everyType(), {
        type: 'SetBlendMode',
        nodeId,
        blendMode: 'multiply',
      });
      expect(fieldOf(result.document, nodeId, 'blendMode'), nodeId).toBe('multiply');
    }
  });

  it('refuses a blend mode CSS does not have as an invalid argument', () => {
    const command: Command = {
      type: 'SetBlendMode',
      nodeId: TITLE,
      blendMode: 'plus-lighter' as 'normal',
    };
    expect(codeOf(() => applyCommand(everyType(), command))).toBe('invalid-argument');
  });

  it('leaves the mask, its asset, and the rules of a matte to the validation of the result', () => {
    const results: readonly Command[] = [
      { type: 'SetNodeMask', nodeId: TITLE, mask: { kind: 'circle' } },
      { type: 'SetNodeMatte', nodeId: TITLE, matte: { kind: 'layer', nodeId: SHAPE } },
      { type: 'SetNodeMask', nodeId: TITLE, mask: { ...IMAGE_MASK, assetId: 'asset-font' } },
      { type: 'SetNodeMask', nodeId: TITLE, mask: { ...IMAGE_MASK, assetId: 'asset-gone' } },
      { type: 'SetNodeMatte', nodeId: TITLE, matte: { ...MATTE, nodeId: TITLE } },
      { type: 'SetNodeMatte', nodeId: TITLE, matte: { ...MATTE, nodeId: 'node-image' } },
      { type: 'SetNodeMatte', nodeId: TITLE, matte: { ...MATTE, nodeId: 'node-video' } },
    ];
    for (const command of results) {
      expect(
        codeOf(() => applyCommand(everyType(), command)),
        json(command),
      ).toBe('invalid-result');
    }
  });

  it('refuses a matte that has a blend mode of its own', () => {
    const blended = applyCommand(everyType(), {
      type: 'SetBlendMode',
      nodeId: SHAPE,
      blendMode: 'multiply',
    }).document;
    const command: Command = { type: 'SetNodeMatte', nodeId: TITLE, matte: MATTE };
    expect(codeOf(() => applyCommand(blended, command))).toBe('invalid-result');
  });
});

describe('a matte in use (D75)', () => {
  it.each<[string, Command]>([
    ['removing it', { type: 'RemoveNode', nodeId: SHAPE }],
    ['giving it a blend mode', { type: 'SetBlendMode', nodeId: SHAPE, blendMode: 'screen' }],
    ['giving it a mask', { type: 'SetNodeMask', nodeId: SHAPE, mask: SHAPE_MASK }],
  ])('refuses %s with matte-in-use and the nodes it mattes', (_, command) => {
    const error = errorOf(() => applyCommand(matted(), command));
    expect(error.code).toBe('matte-in-use');
    expect(error.details).toEqual([TITLE]);
  });

  it('is removed once the matte of the node it mattes is none', () => {
    const freed = applyCommand(matted(), {
      type: 'SetNodeMatte',
      nodeId: TITLE,
      matte: { kind: 'none' },
    }).document;
    const result = applyCommand(freed, { type: 'RemoveNode', nodeId: SHAPE });
    expect(json(result.document)).not.toContain(`"${SHAPE}"`);
  });

  it('may be changed by SetNodeMatte itself, which the validation of the result judges', () => {
    const result = applyCommand(matted(), {
      type: 'SetNodeMatte',
      nodeId: TITLE,
      matte: { ...MATTE, mode: 'luminance-inverted' },
    });
    expect(fieldOf(result.document, TITLE, 'matte')).toEqual({
      ...MATTE,
      mode: 'luminance-inverted',
    });
  });
});

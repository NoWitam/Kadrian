/**
 * The commands of schema 0.1, their argument schemas, and the parsers of their
 * fields (D30.1, D30.3, D38.2, D38.3). A command is a plain JSON value, so it
 * survives the transport between a host, the UI, and an AI tool call. The
 * JSON Schema of each command's arguments lives here, next to the parser it
 * must agree with, so an AI tool contract wraps it instead of restating it
 * (D31.2). `parseCommand` (in `registry.ts`) is the only way a command comes
 * into existence; the parsers here read the fields of one command type.
 */
import { compositionSchema, type Asset } from '@kadrion/schema';

import { EditorError } from './errors.js';

export interface CommandPosition {
  readonly x: number;
  readonly y: number;
}

/** What a caller states for `SetNodePosition`; the command adds its discriminator (D31.2). */
export interface SetNodePositionArguments {
  readonly nodeId: string;
  readonly position: CommandPosition;
}

/** Replaces the node's base position with an absolute one, in composition pixels (D15, D30.1). */
export interface SetNodePositionCommand extends SetNodePositionArguments {
  readonly type: 'SetNodePosition';
}

/** What a caller states for `SetNodeOpacity` (D38.2). */
export interface SetNodeOpacityArguments {
  readonly nodeId: string;
  readonly opacity: number;
}

/** Replaces the node's base opacity, from 0 to 1 inclusive; an opacity animation multiplies it (D16). */
export interface SetNodeOpacityCommand extends SetNodeOpacityArguments {
  readonly type: 'SetNodeOpacity';
}

/** What a caller states for `SetTextContent` (D38.3). */
export interface SetTextContentArguments {
  readonly nodeId: string;
  readonly text: string;
}

/** Replaces the text of a text node, exactly as given; line breaks are kept. */
export interface SetTextContentCommand extends SetTextContentArguments {
  readonly type: 'SetTextContent';
}

/**
 * A node as a command carries it: a deep-frozen copy of composition data. Its
 * shape is the schema's, checked by the full validation, not restated here (D39.1).
 */
export type NodeData = Readonly<Record<string, unknown>>;

/** What a caller states for `AddNode` (D39.1). */
export interface AddNodeArguments {
  /** The scene, or a group, whose list receives the node. */
  readonly parentId: string;
  /** The node's index in that list after the insertion, from 0 to the list's length. */
  readonly index: number;
  /** The complete node, with every ID of its subtree and its `animations` arrays. */
  readonly node: NodeData;
}

/** Inserts a complete node, with its animations and children, into a list (D39.1). */
export interface AddNodeCommand extends AddNodeArguments {
  readonly type: 'AddNode';
}

/** What a caller states for `RemoveNode` (D39.1). */
export interface RemoveNodeArguments {
  readonly nodeId: string;
}

/** Removes a node with its whole subtree: its animations, and a group's children with theirs. */
export interface RemoveNodeCommand extends RemoveNodeArguments {
  readonly type: 'RemoveNode';
}

/** What a caller states for `DuplicateNode` (D39.1). */
export interface DuplicateNodeArguments {
  readonly nodeId: string;
  /** The ID of the copy; every other ID of the copy derives from it (D39.3). */
  readonly newNodeId: string;
}

/** Copies a node's subtree directly after the source in the same list (D39.2). */
export interface DuplicateNodeCommand extends DuplicateNodeArguments {
  readonly type: 'DuplicateNode';
}

/** What a caller states for `ReorderNode` (D39.1). */
export interface ReorderNodeArguments {
  readonly nodeId: string;
  /** The node's index in its own list after the move. */
  readonly index: number;
}

/** Moves a node within its own list; the only command that moves an existing node (D39.2). */
export interface ReorderNodeCommand extends ReorderNodeArguments {
  readonly type: 'ReorderNode';
}

/** A scale as the document stores it: two factors from 0 to 1000 (D15, D40.1). */
export interface CommandScale {
  readonly x: number;
  readonly y: number;
}

/** What a caller states for `SetNodeScale` (D40.1). */
export interface SetNodeScaleArguments {
  readonly nodeId: string;
  readonly scale: CommandScale;
}

/** Replaces the node's base scale; a scale animation multiplies it (D16.6). */
export interface SetNodeScaleCommand extends SetNodeScaleArguments {
  readonly type: 'SetNodeScale';
}

/** What a caller states for `SetNodeSize` (D40.1). */
export interface SetNodeSizeArguments {
  readonly nodeId: string;
  readonly width: number;
  readonly height: number;
}

/** Replaces the size of an image or a Custom HTML element, in composition pixels (D40.1). */
export interface SetNodeSizeCommand extends SetNodeSizeArguments {
  readonly type: 'SetNodeSize';
}

/** What a caller states for `SetNodeColor` (D40.1). */
export interface SetNodeColorArguments {
  readonly nodeId: string;
  readonly color: string;
}

/** Replaces the colour of a text or a background, stored in lower case (D40.1). */
export interface SetNodeColorCommand extends SetNodeColorArguments {
  readonly type: 'SetNodeColor';
}

/** What a caller states for `SetTextFontSize` (D40.1). */
export interface SetTextFontSizeArguments {
  readonly nodeId: string;
  readonly fontSize: number;
}

/** Replaces the font size of a text, in composition pixels (D40.1). */
export interface SetTextFontSizeCommand extends SetTextFontSizeArguments {
  readonly type: 'SetTextFontSize';
}

/** What a caller states for `SetTextFont` (D40.2). */
export interface SetTextFontArguments {
  readonly nodeId: string;
  readonly fontAssetId: string;
}

/** Points a text at another font asset of the document (D40.2). */
export interface SetTextFontCommand extends SetTextFontArguments {
  readonly type: 'SetTextFont';
}

/** What a caller states for `SetImageAsset` (D40.2). */
export interface SetImageAssetArguments {
  readonly nodeId: string;
  readonly assetId: string;
}

/** Points an image at another image asset of the document (D40.2). */
export interface SetImageAssetCommand extends SetImageAssetArguments {
  readonly type: 'SetImageAsset';
}

/** The type of an asset, as the document's schema lists it (D40.3). */
export type AssetType = Asset['type'];

/** An asset as a command carries it: the document's own shape, copied and frozen (D40.3). */
export interface AssetData {
  readonly id: string;
  readonly type: AssetType;
  readonly contentHash: string;
}

/** What a caller states for `AddAsset` (D40.3). */
export interface AddAssetArguments {
  readonly asset: AssetData;
  /** The asset's index in `assets` after the insertion, from 0 to the length. */
  readonly index: number;
}

/** Declares an asset, pinned by its content hash (D14, D40.3). */
export interface AddAssetCommand extends AddAssetArguments {
  readonly type: 'AddAsset';
}

/** What a caller states for `RemoveAsset` (D40.3). */
export interface RemoveAssetArguments {
  readonly assetId: string;
}

/** Removes an asset that nothing uses (D40.3, D40.4). */
export interface RemoveAssetCommand extends RemoveAssetArguments {
  readonly type: 'RemoveAsset';
}

export type Command =
  | SetNodePositionCommand
  | SetNodeOpacityCommand
  | SetTextContentCommand
  | AddNodeCommand
  | RemoveNodeCommand
  | DuplicateNodeCommand
  | ReorderNodeCommand
  | SetNodeScaleCommand
  | SetNodeSizeCommand
  | SetNodeColorCommand
  | SetTextFontSizeCommand
  | SetTextFontCommand
  | SetImageAssetCommand
  | AddAssetCommand
  | RemoveAssetCommand;

/** A JSON Schema of one property of a command's arguments. */
export type ArgumentSchema =
  | { readonly type: 'string'; readonly description: string; readonly minLength: number }
  | { readonly type: 'string'; readonly description: string; readonly pattern: string }
  | { readonly type: 'string'; readonly description: string; readonly enum: readonly string[] }
  | { readonly type: 'string'; readonly description: string }
  | { readonly type: 'number'; readonly description: string }
  | {
      readonly type: 'number';
      readonly description: string;
      readonly minimum: number;
      readonly maximum: number;
    }
  | {
      readonly type: 'integer';
      readonly description: string;
      readonly minimum: number;
      readonly maximum: number;
    }
  | ClosedObjectSchema<string>;

/** A JSON Schema of a JSON object with exactly the fields `K`, all of them required. */
export interface ClosedObjectSchema<K extends string> {
  readonly type: 'object';
  readonly description: string;
  readonly properties: { readonly [P in K]: ArgumentSchema };
  readonly required: readonly K[];
  readonly additionalProperties: false;
}

/** The argument schema of `SetNodePosition`, typed by the fields of its arguments. */
export interface SetNodePositionArgumentsSchema extends ClosedObjectSchema<
  keyof SetNodePositionArguments
> {
  readonly properties: {
    readonly nodeId: ArgumentSchema;
    readonly position: ClosedObjectSchema<keyof CommandPosition>;
  };
}

/** The argument schema of `SetNodeOpacity`, typed by the fields of its arguments. */
export type SetNodeOpacityArgumentsSchema = ClosedObjectSchema<keyof SetNodeOpacityArguments>;

/** The argument schema of `SetTextContent`, typed by the fields of its arguments. */
export type SetTextContentArgumentsSchema = ClosedObjectSchema<keyof SetTextContentArguments>;

/** The JSON Schema of an object whose shape the command does not restate (D39.1). */
export interface OpenObjectSchema {
  readonly type: 'object';
  readonly description: string;
}

/**
 * The argument schema of `AddNode`: closed, with `node` an open object, since
 * the document's schema checks the node itself (D30.6, D31.2).
 */
export interface AddNodeArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly parentId: ArgumentSchema;
    readonly index: ArgumentSchema;
    readonly node: OpenObjectSchema;
  };
  readonly required: readonly (keyof AddNodeArguments)[];
  readonly additionalProperties: false;
}
export type RemoveNodeArgumentsSchema = ClosedObjectSchema<keyof RemoveNodeArguments>;
export type DuplicateNodeArgumentsSchema = ClosedObjectSchema<keyof DuplicateNodeArguments>;
export type ReorderNodeArgumentsSchema = ClosedObjectSchema<keyof ReorderNodeArguments>;
export type SetNodeScaleArgumentsSchema = ClosedObjectSchema<keyof SetNodeScaleArguments>;
export type SetNodeSizeArgumentsSchema = ClosedObjectSchema<keyof SetNodeSizeArguments>;
export type SetNodeColorArgumentsSchema = ClosedObjectSchema<keyof SetNodeColorArguments>;
export type SetTextFontSizeArgumentsSchema = ClosedObjectSchema<keyof SetTextFontSizeArguments>;
export type SetTextFontArgumentsSchema = ClosedObjectSchema<keyof SetTextFontArguments>;
export type SetImageAssetArgumentsSchema = ClosedObjectSchema<keyof SetImageAssetArguments>;
export type AddAssetArgumentsSchema = ClosedObjectSchema<keyof AddAssetArguments>;
export type RemoveAssetArgumentsSchema = ClosedObjectSchema<keyof RemoveAssetArguments>;

/** Freezes a JSON value and everything in it, so no caller can edit a shared value. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

const COORDINATE =
  'composition pixels. A fraction is rounded to an integer, halves towards +Infinity (2.5 becomes 3, -2.5 becomes -2), and -0 becomes 0.';

/**
 * The JSON Schema (draft 2020-12) of the arguments of `SetNodePosition`, which
 * the AI tool contract passes on as it is (D31.2). `x` and `y` are numbers, not
 * integers: `parseCommand` accepts a fraction and rounds it, so `integer` would
 * describe the document after normalisation, not this input. The bounds of a
 * coordinate are the document's (D15); a position the document cannot hold is
 * refused as `invalid-result` (D30.6), not restated here. A test feeds one
 * corpus to this schema and to `parseCommand` and demands the same verdict.
 */
export const setNodePositionArgumentsSchema: SetNodePositionArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Moves one node to an absolute base position.',
  properties: {
    nodeId: {
      type: 'string',
      description:
        'The stable ID of the node to move. A node without a position, such as the background, is refused.',
      minLength: 1,
    },
    position: {
      type: 'object',
      description:
        "The node's new base position, absolute, in composition pixels. A position animation adds its offsets on top of it.",
      properties: {
        x: { type: 'number', description: `Distance from the left edge, in ${COORDINATE}` },
        y: { type: 'number', description: `Distance from the top edge, in ${COORDINATE}` },
      },
      required: ['x', 'y'],
      additionalProperties: false,
    },
  },
  required: ['nodeId', 'position'],
  additionalProperties: false,
});

/**
 * The JSON Schema of the arguments of `SetNodeOpacity` (D38.2). The range 0 to
 * 1 inclusive is part of the command's public contract, so the schema states it
 * and `parseCommand` refuses a value outside it as `invalid-argument`; a test
 * demands the same verdict from both on one corpus.
 */
export const setNodeOpacityArgumentsSchema: SetNodeOpacityArgumentsSchema = deepFreeze({
  type: 'object',
  description: "Sets one node's base opacity.",
  properties: {
    nodeId: {
      type: 'string',
      description:
        'The stable ID of the node. A node without an opacity, such as the background, is refused.',
      minLength: 1,
    },
    opacity: {
      type: 'number',
      description:
        'The base opacity, from 0 (transparent) to 1 (opaque) inclusive; a fraction is kept as it is, and -0 becomes 0. An opacity animation multiplies it.',
      minimum: 0,
      maximum: 1,
    },
  },
  required: ['nodeId', 'opacity'],
  additionalProperties: false,
});

/**
 * The JSON Schema of the arguments of `SetTextContent` (D38.3). Any string is a
 * text, the empty one included: schema 0.1 sets no limit, so neither does this.
 */
export const setTextContentArgumentsSchema: SetTextContentArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Replaces the text of one text node.',
  properties: {
    nodeId: {
      type: 'string',
      description: 'The stable ID of a text node. Any other node is refused.',
      minLength: 1,
    },
    text: {
      type: 'string',
      description:
        'The new text, exactly as given: nothing is trimmed or normalised, and line breaks are kept.',
    },
  },
  required: ['nodeId', 'text'],
  additionalProperties: false,
});

/**
 * The document's own ID pattern, read from its schema rather than written out
 * again (D16.3, D30.8), for the one ID a command introduces by name: the copy of
 * `DuplicateNode` (D39.3).
 */
const ID_PATTERN: string = compositionSchema.properties.scenes.items.properties.id.pattern;

const NODE_ID = 'The stable ID of the node.';

const INDEX_BOUNDS = { minimum: 0, maximum: Number.MAX_SAFE_INTEGER } as const;

/** The document's own shape of an asset, read from its schema (D16.3, D30.8, D40.3). */
const ASSET = compositionSchema.properties.assets.items.properties;
const ASSET_TYPES: readonly string[] = ASSET.type.enum;
const HASH_PATTERN: string = ASSET.contentHash.pattern;

/**
 * A colour as a command accepts it: six hexadecimal digits after `#`, in either
 * case. The document stores lower case only; the parser lowercases (D40.1).
 */
const COLOR_INPUT = '^#[0-9A-Fa-f]{6}$';

/**
 * The JSON Schema of the arguments of `AddNode` (D39.1). `node` is an object and
 * nothing more: its shape is the document's schema, which the full validation
 * applies to the result (D30.6, D31.2), so this schema does not restate it.
 */
export const addNodeArgumentsSchema: AddNodeArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Inserts a complete node, with its animations and children, into a list.',
  properties: {
    parentId: {
      type: 'string',
      description:
        'The ID of the scene, or of a group, whose list receives the node. A group takes image and text nodes only.',
      minLength: 1,
    },
    index: {
      type: 'integer',
      description:
        "The node's index in that list after the insertion, from 0 (the bottom layer) to the list's length (the top).",
      ...INDEX_BOUNDS,
    },
    node: {
      type: 'object',
      description:
        'The complete node as the document stores it, with every ID of its subtree chosen by the caller and unused in the document, and its animations in its own `animations` array.',
    },
  },
  required: ['parentId', 'index', 'node'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `RemoveNode` (D39.1). */
export const removeNodeArgumentsSchema: RemoveNodeArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Removes a node with its animations and, for a group, its children.',
  properties: {
    nodeId: { type: 'string', description: NODE_ID, minLength: 1 },
  },
  required: ['nodeId'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `DuplicateNode` (D39.1, D39.3). */
export const duplicateNodeArgumentsSchema: DuplicateNodeArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Copies a node, with its animations and children, directly above it.',
  properties: {
    nodeId: { type: 'string', description: NODE_ID, minLength: 1 },
    newNodeId: {
      type: 'string',
      description:
        'The ID of the copy, unused in the document. Every other ID of the copy derives from it: a child at index i becomes `<newNodeId>-c<i>`, an animation `<newNodeId>-a-<property>`, and an animation of that child `<newNodeId>-c<i>-a-<property>`.',
      pattern: ID_PATTERN,
    },
  },
  required: ['nodeId', 'newNodeId'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `ReorderNode` (D39.1). */
export const reorderNodeArgumentsSchema: ReorderNodeArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Moves a node within its own list, which changes the layer order.',
  properties: {
    nodeId: { type: 'string', description: NODE_ID, minLength: 1 },
    index: {
      type: 'integer',
      description:
        "The node's index in its own list after the move, from 0 (the bottom layer) to the list's length minus 1 (the top).",
      ...INDEX_BOUNDS,
    },
  },
  required: ['nodeId', 'index'],
  additionalProperties: false,
});

const PIXELS =
  'in composition pixels. A fraction is rounded to an integer, halves towards +Infinity, and -0 becomes 0; the document takes 1 to 1 000 000, and a rounded value outside that range is refused.';

const SCALE_FACTOR = {
  type: 'number',
  description: 'A factor from 0 to 1000 inclusive, kept as it is; -0 becomes 0.',
  minimum: 0,
  maximum: 1000,
} as const;

/** The JSON Schema of the arguments of `SetNodeScale` (D40.1). */
export const setNodeScaleArgumentsSchema: SetNodeScaleArgumentsSchema = deepFreeze({
  type: 'object',
  description: "Sets one node's base scale.",
  properties: {
    nodeId: {
      type: 'string',
      description: `${NODE_ID} A node without a scale, such as the background, is refused.`,
      minLength: 1,
    },
    scale: {
      type: 'object',
      description:
        "The node's new base scale about its own origin. A scale animation multiplies it.",
      properties: { x: SCALE_FACTOR, y: SCALE_FACTOR },
      required: ['x', 'y'],
      additionalProperties: false,
    },
  },
  required: ['nodeId', 'scale'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetNodeSize` (D40.1): numbers, since the parser rounds. */
export const setNodeSizeArgumentsSchema: SetNodeSizeArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Sets the size of an image or a Custom HTML element.',
  properties: {
    nodeId: {
      type: 'string',
      description: `${NODE_ID} Only images and Custom HTML elements have a size.`,
      minLength: 1,
    },
    width: { type: 'number', description: `The width, ${PIXELS}` },
    height: { type: 'number', description: `The height, ${PIXELS}` },
  },
  required: ['nodeId', 'width', 'height'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetNodeColor` (D40.1): either case, since the parser lowercases. */
export const setNodeColorArgumentsSchema: SetNodeColorArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Sets the colour of a text or a background.',
  properties: {
    nodeId: {
      type: 'string',
      description: `${NODE_ID} Only texts and backgrounds have a colour.`,
      minLength: 1,
    },
    color: {
      type: 'string',
      description:
        'An sRGB colour as `#` and six hexadecimal digits, in either case; it is stored in lower case. Short forms, names, and alpha are refused.',
      pattern: COLOR_INPUT,
    },
  },
  required: ['nodeId', 'color'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetTextFontSize` (D40.1): a number, since the parser rounds. */
export const setTextFontSizeArgumentsSchema: SetTextFontSizeArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Sets the font size of a text.',
  properties: {
    nodeId: {
      type: 'string',
      description: `${NODE_ID} Only texts have a font size.`,
      minLength: 1,
    },
    fontSize: { type: 'number', description: `The font size, ${PIXELS}` },
  },
  required: ['nodeId', 'fontSize'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetTextFont` (D40.2). */
export const setTextFontArgumentsSchema: SetTextFontArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Points a text at another font asset of the document.',
  properties: {
    nodeId: {
      type: 'string',
      description: `${NODE_ID} Only texts have a font.`,
      minLength: 1,
    },
    fontAssetId: {
      type: 'string',
      description: 'The ID of a font asset the document declares.',
      minLength: 1,
    },
  },
  required: ['nodeId', 'fontAssetId'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetImageAsset` (D40.2). */
export const setImageAssetArgumentsSchema: SetImageAssetArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Points an image at another image asset of the document; its size stays.',
  properties: {
    nodeId: {
      type: 'string',
      description: `${NODE_ID} Only images have an image asset.`,
      minLength: 1,
    },
    assetId: {
      type: 'string',
      description: 'The ID of an image asset the document declares.',
      minLength: 1,
    },
  },
  required: ['nodeId', 'assetId'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `AddAsset` (D40.3): the asset in the document's own form. */
export const addAssetArgumentsSchema: AddAssetArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    'Declares an asset, pinned by the hash of its exact bytes. The host must then supply those bytes whenever the document is loaded, even while nothing uses the asset.',
  properties: {
    asset: {
      type: 'object',
      description: 'The asset as the document stores it.',
      properties: {
        id: {
          type: 'string',
          description: 'The ID of the asset, unused in the document.',
          pattern: ID_PATTERN,
        },
        type: { type: 'string', description: 'The kind of the asset.', enum: ASSET_TYPES },
        contentHash: {
          type: 'string',
          description: 'The algorithm, a colon, and the lower-case hex digest of the exact bytes.',
          pattern: HASH_PATTERN,
        },
      },
      required: ['id', 'type', 'contentHash'],
      additionalProperties: false,
    },
    index: {
      type: 'integer',
      description:
        "The asset's index in the document's assets after the insertion, from 0 to their number.",
      ...INDEX_BOUNDS,
    },
  },
  required: ['asset', 'index'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `RemoveAsset` (D40.3). */
export const removeAssetArgumentsSchema: RemoveAssetArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Removes an asset that nothing uses; an asset in use is refused with its users.',
  properties: {
    assetId: {
      type: 'string',
      description: 'The ID of an asset the document declares.',
      minLength: 1,
    },
  },
  required: ['assetId'],
  additionalProperties: false,
});

export function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Rejects anything that is not an object with exactly `fields` as its own keys. */
export function fieldsOf(
  value: unknown,
  fields: readonly string[],
  what: string,
): Readonly<Record<string, unknown>> {
  if (!isPlainObject(value)) {
    throw new EditorError('invalid-argument', `${what} is not an object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((key, at) => key !== expected[at])) {
    throw new EditorError(
      'invalid-argument',
      `${what} must have exactly the fields ${expected.join(', ')}, not ${actual.join(', ') || '(none)'}.`,
    );
  }
  return value;
}

function nodeIdOf(fields: Readonly<Record<string, unknown>>, name = 'nodeId'): string {
  const nodeId: unknown = fields[name];
  if (typeof nodeId !== 'string' || nodeId === '') {
    throw new EditorError('invalid-argument', `\`${name}\` must be a non-empty string.`);
  }
  return nodeId;
}

/**
 * A position in a list: a safe integer from 0, never rounded (D39.2). Whether it
 * fits the list depends on the document, so that is decided when the command is
 * applied (`index-out-of-range`). A -0 becomes 0, as everywhere (D30.3).
 */
function indexOf(fields: Readonly<Record<string, unknown>>): number {
  const index: unknown = fields['index'];
  if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) {
    throw new EditorError(
      'invalid-argument',
      `\`index\` must be a safe integer from 0, not ${typeof index === 'number' ? String(index) : typeof index}.`,
    );
  }
  return index === 0 ? 0 : index;
}

/** An object the validator reads as JSON data: its prototype is `Object.prototype` or none. */
function isDataObject(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function notDataOf(path: string, what: string): never {
  throw new EditorError(
    'invalid-argument',
    `${path} holds ${what}; a node is composition data, which JSON can carry.`,
  );
}

/**
 * A copy of composition data that keeps every value as it is (D39.5): strings,
 * numbers, booleans, and null, arrays by index, and objects by their own
 * enumerable keys in their order, each value read once. What the validator would
 * not read as data — a function, a symbol, a bigint, `undefined`, a hole, an
 * object of another prototype such as a `Date`, or a cycle — is refused, so the
 * copy accepts no more than the document can hold and changes nothing through a
 * `toJSON`. The copy owns every object it has; the caller's are left alone.
 */
function copyData(value: unknown, path: string, ancestors: readonly object[]): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value !== 'object') return notDataOf(path, typeof value);
  if (ancestors.includes(value)) return notDataOf(path, 'a cycle');
  const inner = [...ancestors, value];
  if (Array.isArray(value)) {
    const items = value as readonly unknown[];
    const length = items.length;
    const copy: unknown[] = [];
    for (let at = 0; at < length; at += 1) {
      const itemPath = `${path}/${String(at)}`;
      if (!Object.prototype.hasOwnProperty.call(items, at)) return notDataOf(itemPath, 'a hole');
      copy.push(copyData(items[at], itemPath, inner));
    }
    return copy;
  }
  if (!isDataObject(value)) return notDataOf(path, 'an object that is not plain data');
  const fields = value as Readonly<Record<string, unknown>>;
  // `fromEntries` defines each key as data, so even `__proto__` stays a plain key.
  return Object.fromEntries(
    Object.keys(fields).map((key) => [key, copyData(fields[key], `${path}/${key}`, inner)]),
  );
}

/**
 * One coordinate as the document stores it: an integer number of composition
 * pixels (D15, D30.3). `Math.round` rounds halves towards +Infinity, so -2.5
 * becomes -2; a resulting -0 is normalised to 0, because -0 and 0 are the same
 * text after JSON.stringify but differ under Object.is, which would otherwise
 * make a no-op look like a change. Rounding is not clamping: a coordinate
 * outside the canvas stays as it is and the schema has the last word (D30.6).
 */
function integerPixels(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new EditorError(
      'invalid-argument',
      `${what} must be a finite number, not ${typeof value === 'number' ? String(value) : typeof value}.`,
    );
  }
  const rounded = Math.round(value);
  return rounded === 0 ? 0 : rounded;
}

function parsePosition(value: unknown, what: string): CommandPosition {
  const fields = fieldsOf(value, ['x', 'y'], what);
  return Object.freeze({
    x: integerPixels(fields['x'], `${what}.x`),
    y: integerPixels(fields['y'], `${what}.y`),
  });
}

/** The fields of a `SetNodePosition` (D30.3): closed, a non-empty ID, integer coordinates. */
export function parseSetNodePosition(value: unknown): SetNodePositionCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'position'], 'The command `SetNodePosition`');
  return Object.freeze({
    type: 'SetNodePosition',
    nodeId: nodeIdOf(fields),
    position: parsePosition(fields['position'], '`position`'),
  });
}

/**
 * The fields of a `SetNodeOpacity` (D38.2): a finite number from 0 to 1
 * inclusive. Nothing is rounded or clamped; -0 becomes 0, for the reason given
 * at `integerPixels`.
 */
export function parseSetNodeOpacity(value: unknown): SetNodeOpacityCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'opacity'], 'The command `SetNodeOpacity`');
  const opacity: unknown = fields['opacity'];
  if (typeof opacity !== 'number' || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw new EditorError(
      'invalid-argument',
      `\`opacity\` must be a finite number from 0 to 1, not ${typeof opacity === 'number' ? String(opacity) : typeof opacity}.`,
    );
  }
  return Object.freeze({
    type: 'SetNodeOpacity',
    nodeId: nodeIdOf(fields),
    opacity: opacity === 0 ? 0 : opacity,
  });
}

/** The fields of a `SetTextContent` (D38.3): any string, taken exactly as given. */
export function parseSetTextContent(value: unknown): SetTextContentCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'text'], 'The command `SetTextContent`');
  const text: unknown = fields['text'];
  if (typeof text !== 'string') {
    throw new EditorError('invalid-argument', `\`text\` must be a string, not ${typeof text}.`);
  }
  return Object.freeze({ type: 'SetTextContent', nodeId: nodeIdOf(fields), text });
}

/**
 * The fields of an `AddNode` (D39.1): a parent ID, an index, and the complete
 * node, copied and deep-frozen here, so the caller's object never reaches the
 * history and is never frozen itself (D39.5).
 */
export function parseAddNode(value: unknown): AddNodeCommand {
  const fields = fieldsOf(value, ['type', 'parentId', 'index', 'node'], 'The command `AddNode`');
  const parentId = nodeIdOf(fields, 'parentId');
  const index = indexOf(fields);
  const node: unknown = fields['node'];
  if (!isPlainObject(node) || !isDataObject(node)) {
    throw new EditorError('invalid-argument', '`node` must be an object.');
  }
  const copy = deepFreeze(copyData(node, '`node`', []) as NodeData);
  return Object.freeze({ type: 'AddNode', parentId, index, node: copy });
}

/** The fields of a `RemoveNode` (D39.1). */
export function parseRemoveNode(value: unknown): RemoveNodeCommand {
  const fields = fieldsOf(value, ['type', 'nodeId'], 'The command `RemoveNode`');
  return Object.freeze({ type: 'RemoveNode', nodeId: nodeIdOf(fields) });
}

/**
 * The fields of a `DuplicateNode` (D39.1): the new ID must match the document's
 * ID pattern, so every ID derived from it does too (D39.3).
 */
export function parseDuplicateNode(value: unknown): DuplicateNodeCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'newNodeId'], 'The command `DuplicateNode`');
  const nodeId = nodeIdOf(fields);
  const newNodeId: unknown = fields['newNodeId'];
  if (typeof newNodeId !== 'string' || !new RegExp(ID_PATTERN).test(newNodeId)) {
    throw new EditorError(
      'invalid-argument',
      `\`newNodeId\` must be an ID of the document's form, ${ID_PATTERN}.`,
    );
  }
  return Object.freeze({ type: 'DuplicateNode', nodeId, newNodeId });
}

/** The fields of a `ReorderNode` (D39.1). */
export function parseReorderNode(value: unknown): ReorderNodeCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'index'], 'The command `ReorderNode`');
  return Object.freeze({ type: 'ReorderNode', nodeId: nodeIdOf(fields), index: indexOf(fields) });
}

/** A mutable copy of a node of a validated document, for a command to rename (D39.3). */
export function copyNode(node: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return copyData(node, '`node`', []) as Record<string, unknown>;
}

/** A scale factor as the document takes it: finite, from 0 to 1000; -0 becomes 0 (D40.1). */
function scaleFactor(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000) {
    throw new EditorError(
      'invalid-argument',
      `${what} must be a finite number from 0 to 1000, not ${typeof value === 'number' ? String(value) : typeof value}.`,
    );
  }
  return value === 0 ? 0 : value;
}

/** The fields of a `SetNodeScale` (D40.1): both factors, checked, never rounded. */
export function parseSetNodeScale(value: unknown): SetNodeScaleCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'scale'], 'The command `SetNodeScale`');
  const nodeId = nodeIdOf(fields);
  const scale = fieldsOf(fields['scale'], ['x', 'y'], '`scale`');
  return Object.freeze({
    type: 'SetNodeScale',
    nodeId,
    scale: Object.freeze({
      x: scaleFactor(scale['x'], '`scale`.x'),
      y: scaleFactor(scale['y'], '`scale`.y'),
    }),
  });
}

/** The fields of a `SetNodeSize` (D40.1): rounded like a position (D15), not clamped. */
export function parseSetNodeSize(value: unknown): SetNodeSizeCommand {
  const fields = fieldsOf(
    value,
    ['type', 'nodeId', 'width', 'height'],
    'The command `SetNodeSize`',
  );
  const nodeId = nodeIdOf(fields);
  return Object.freeze({
    type: 'SetNodeSize',
    nodeId,
    width: integerPixels(fields['width'], '`width`'),
    height: integerPixels(fields['height'], '`height`'),
  });
}

/** The fields of a `SetNodeColor` (D40.1): six hex digits in either case, stored in lower case. */
export function parseSetNodeColor(value: unknown): SetNodeColorCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'color'], 'The command `SetNodeColor`');
  const nodeId = nodeIdOf(fields);
  const color: unknown = fields['color'];
  if (typeof color !== 'string' || !new RegExp(COLOR_INPUT).test(color)) {
    throw new EditorError(
      'invalid-argument',
      '`color` must be `#` and six hexadecimal digits, such as #1a2b3c.',
    );
  }
  return Object.freeze({ type: 'SetNodeColor', nodeId, color: color.toLowerCase() });
}

/** The fields of a `SetTextFontSize` (D40.1): rounded like a position (D15), not clamped. */
export function parseSetTextFontSize(value: unknown): SetTextFontSizeCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'fontSize'], 'The command `SetTextFontSize`');
  const nodeId = nodeIdOf(fields);
  return Object.freeze({
    type: 'SetTextFontSize',
    nodeId,
    fontSize: integerPixels(fields['fontSize'], '`fontSize`'),
  });
}

/** The fields of a `SetTextFont` (D40.2): the asset is looked up when the command applies. */
export function parseSetTextFont(value: unknown): SetTextFontCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'fontAssetId'], 'The command `SetTextFont`');
  const nodeId = nodeIdOf(fields);
  return Object.freeze({
    type: 'SetTextFont',
    nodeId,
    fontAssetId: nodeIdOf(fields, 'fontAssetId'),
  });
}

/** The fields of a `SetImageAsset` (D40.2): the asset is looked up when the command applies. */
export function parseSetImageAsset(value: unknown): SetImageAssetCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'assetId'], 'The command `SetImageAsset`');
  const nodeId = nodeIdOf(fields);
  return Object.freeze({ type: 'SetImageAsset', nodeId, assetId: nodeIdOf(fields, 'assetId') });
}

/**
 * Checks, field by field, that a copied asset has the document's own form — an
 * ID, a type, and a hash as the schema states them — and tells the compiler so;
 * the check at run time is what makes the narrower type true (D40.3).
 */
function assertAsset(
  asset: Readonly<Record<string, unknown>>,
): asserts asset is Readonly<Record<string, unknown>> & AssetData {
  const id: unknown = asset['id'];
  const type: unknown = asset['type'];
  const contentHash: unknown = asset['contentHash'];
  if (typeof id !== 'string' || !new RegExp(ID_PATTERN).test(id)) {
    throw new EditorError(
      'invalid-argument',
      `\`asset\`.id must be an ID of the form ${ID_PATTERN}.`,
    );
  }
  if (typeof type !== 'string' || !ASSET_TYPES.includes(type)) {
    throw new EditorError(
      'invalid-argument',
      `\`asset\`.type must be one of ${ASSET_TYPES.join(', ')}.`,
    );
  }
  if (typeof contentHash !== 'string' || !new RegExp(HASH_PATTERN).test(contentHash)) {
    throw new EditorError(
      'invalid-argument',
      `\`asset\`.contentHash must be of the form ${HASH_PATTERN}.`,
    );
  }
}

/**
 * The fields of an `AddAsset` (D40.3): an asset of the document's own form and an
 * index. The asset is copied with its keys in their order, each value read once,
 * then checked and frozen, so undoing its removal restores the same bytes and
 * the caller's object never reaches the history.
 */
export function parseAddAsset(value: unknown): AddAssetCommand {
  const fields = fieldsOf(value, ['type', 'asset', 'index'], 'The command `AddAsset`');
  const given = fieldsOf(fields['asset'], ['id', 'type', 'contentHash'], '`asset`');
  const copy = Object.fromEntries(Object.keys(given).map((key) => [key, given[key]]));
  assertAsset(copy);
  const index = indexOf(fields);
  return Object.freeze({ type: 'AddAsset', asset: Object.freeze(copy), index });
}

/** The fields of a `RemoveAsset` (D40.3). */
export function parseRemoveAsset(value: unknown): RemoveAssetCommand {
  const fields = fieldsOf(value, ['type', 'assetId'], 'The command `RemoveAsset`');
  return Object.freeze({ type: 'RemoveAsset', assetId: nodeIdOf(fields, 'assetId') });
}

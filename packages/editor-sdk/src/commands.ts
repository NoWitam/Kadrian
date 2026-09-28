/**
 * The commands of schema 0.1, their argument schemas, and the parsers of their
 * fields (D30.1, D30.3, D38.2, D38.3). A command is a plain JSON value, so it
 * survives the transport between a host, the UI, and an AI tool call. The
 * JSON Schema of each command's arguments lives here, next to the parser it
 * must agree with, so an AI tool contract wraps it instead of restating it
 * (D31.2). `parseCommand` (in `registry.ts`) is the only way a command comes
 * into existence; the parsers here read the fields of one command type.
 */
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

export type Command = SetNodePositionCommand | SetNodeOpacityCommand | SetTextContentCommand;

/** A JSON Schema of one property of a command's arguments. */
export type ArgumentSchema =
  | { readonly type: 'string'; readonly description: string; readonly minLength: number }
  | { readonly type: 'string'; readonly description: string }
  | { readonly type: 'number'; readonly description: string }
  | {
      readonly type: 'number';
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

function nodeIdOf(fields: Readonly<Record<string, unknown>>): string {
  const nodeId: unknown = fields['nodeId'];
  if (typeof nodeId !== 'string' || nodeId === '') {
    throw new EditorError('invalid-argument', '`nodeId` must be a non-empty string.');
  }
  return nodeId;
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

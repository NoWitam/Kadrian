/**
 * A freeze frame (D82.3, D82.9): the frame a video node shows at one instant,
 * held for a while. This helper builds the commands of one transaction that cut
 * the clip and make the freeze frame, a video clip at speed 0, so that a host
 * or a model does it in one step and one undo (D30.5, D38), as the cut helper
 * of D66 does for a transition. It reads the document and changes nothing: the
 * bus applies the commands, and every rule of the bus holds for each of them.
 */
import {
  compositionSchema,
  sourceTimeOfScene,
  type ClipTiming,
  type ValidatedComposition,
} from '@kadrion/schema';

import {
  deepFreeze,
  fieldsOf,
  parseAddNode,
  parseMoveClip,
  parseSetClipReverse,
  parseSetClipSpeed,
  parseSetVideoSource,
  parseSplitClip,
  type Command,
} from './commands.js';
import type { DocumentObject } from './document.js';
import { EditorError } from './errors.js';
import { lifetimeBounds } from './lifetimes.js';
import { splitSecondHalf } from './registry.js';

/**
 * How a freeze frame meets the clip (D82.9): `overwrite` puts it in the place
 * of the part of the clip it covers, and `insert` adds it between the halves of
 * the clip cut at `atUs` and moves the second half later.
 */
export type FreezeFrameMode = 'overwrite' | 'insert';

/** What a caller states for a freeze frame (D82.9). */
export interface FreezeFrameArguments {
  /** The video node whose frame is held. */
  readonly clipId: string;
  /** The scene time of the frame held, strictly inside the clip's lifetime. */
  readonly atUs: number;
  /** How long the frame is held, at least 1 µs. */
  readonly holdUs: number;
  readonly mode: FreezeFrameMode;
  /**
   * Two IDs unused in the document: the first names the freeze frame, the
   * second the part of the clip after it, which an overwrite that reaches the
   * clip's end does not make.
   */
  readonly newClipIds: readonly [string, string];
}

/** The JSON Schema of an integer field of a JSON Schema. */
interface IntegerField {
  readonly type: 'integer';
  readonly description: string;
  readonly minimum: number;
  readonly maximum: number;
}

/** The JSON Schema of the arguments of `freezeFrame` and its tool (D82.9). */
export interface FreezeFrameArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly clipId: {
      readonly type: 'string';
      readonly description: string;
      readonly minLength: 1;
    };
    readonly atUs: IntegerField;
    readonly holdUs: IntegerField;
    readonly mode: {
      readonly type: 'string';
      readonly description: string;
      readonly enum: readonly FreezeFrameMode[];
    };
    readonly newClipIds: {
      readonly type: 'array';
      readonly description: string;
      readonly items: { readonly type: 'string'; readonly pattern: string };
      readonly minItems: 2;
      readonly maxItems: 2;
      readonly uniqueItems: true;
    };
  };
  readonly required: readonly (keyof FreezeFrameArguments)[];
  readonly additionalProperties: false;
}

const LIFETIME = lifetimeBounds(compositionSchema);
const ID_PATTERN: string = compositionSchema.properties.scenes.items.properties.id.pattern;
const MODES: readonly FreezeFrameMode[] = ['overwrite', 'insert'];

export const freezeFrameArgumentsSchema: FreezeFrameArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    'Holds the frame a video node shows at atUs for holdUs, as a freeze frame, in one step (D82.9).',
  properties: {
    clipId: {
      type: 'string',
      description: 'The stable ID of a video node, a child of a group included.',
      minLength: 1,
    },
    atUs: {
      type: 'integer',
      description:
        "The time of the frame held, strictly between the start and the end of the clip, in integer microseconds of the time of the clip's scene; never rounded. -0 becomes 0.",
      minimum: LIFETIME.startUs.minimum,
      maximum: LIFETIME.startUs.maximum,
    },
    holdUs: {
      type: 'integer',
      description: 'How long the frame is held, in integer microseconds, at least 1.',
      minimum: LIFETIME.durationUs.minimum,
      maximum: LIFETIME.durationUs.maximum,
    },
    mode: {
      type: 'string',
      description:
        'overwrite: the freeze frame takes the place of the part of the clip from atUs to atUs + holdUs, which must end at the latest where the clip ends, and nothing moves; insert: the clip is cut at atUs, the freeze frame goes between the halves, and the second half moves holdUs later.',
      enum: ['overwrite', 'insert'],
    },
    newClipIds: {
      type: 'array',
      description:
        "Two different IDs unused in the document: the first names the freeze frame, the second the part of the clip after it (not made when an overwrite reaches the clip's end). The animations and effects of each are renamed after it, as split_clip does.",
      items: { type: 'string', pattern: ID_PATTERN },
      minItems: 2,
      maxItems: 2,
      uniqueItems: true,
    },
  },
  required: ['clipId', 'atUs', 'holdUs', 'mode', 'newClipIds'],
  additionalProperties: false,
});

function refused(message: string): EditorError {
  return new EditorError('invalid-argument', message);
}

/** A safe integer within the bounds, never rounded; -0 becomes 0. */
function integerWithin(
  value: unknown,
  bounds: { readonly minimum: number; readonly maximum: number },
  name: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < bounds.minimum ||
    value > bounds.maximum
  ) {
    throw refused(
      `\`${name}\` must be an integer number of microseconds from ${String(bounds.minimum)} to ${String(bounds.maximum)}.`,
    );
  }
  return value === 0 ? 0 : value;
}

/** The arguments, read as `freezeFrameArgumentsSchema` states them. */
function argumentsOf(args: unknown): FreezeFrameArguments {
  const fields = fieldsOf(
    args,
    ['clipId', 'atUs', 'holdUs', 'mode', 'newClipIds'],
    'A freeze frame',
  );
  const clipId = fields['clipId'];
  if (typeof clipId !== 'string' || clipId === '') {
    throw refused('`clipId` must be a non-empty string.');
  }
  const atUs = integerWithin(fields['atUs'], LIFETIME.startUs, 'atUs');
  const holdUs = integerWithin(fields['holdUs'], LIFETIME.durationUs, 'holdUs');
  const mode = MODES.find((known) => known === fields['mode']);
  if (mode === undefined) throw refused('`mode` must be overwrite or insert.');
  const ids: unknown = fields['newClipIds'];
  const pattern = new RegExp(ID_PATTERN);
  if (
    !Array.isArray(ids) ||
    ids.length !== 2 ||
    !ids.every((id): id is string => typeof id === 'string' && pattern.test(id)) ||
    ids[0] === ids[1]
  ) {
    throw refused(
      `\`newClipIds\` must be two different IDs of the document's form, ${ID_PATTERN}.`,
    );
  }
  const [freezeId, afterId] = ids as [string, string];
  return { clipId, atUs, holdUs, mode, newClipIds: [freezeId, afterId] };
}

type SceneNode = ValidatedComposition['scenes'][number]['nodes'][number];
type ChildNode = Extract<SceneNode, { type: 'group' }>['children'][number];
type VideoNode = Extract<SceneNode | ChildNode, { type: 'video' }>;

/** A video node with the ID of the list that holds it and its index there. */
interface PlacedVideo {
  readonly node: VideoNode;
  readonly parentId: string;
  readonly index: number;
}

function notVideo(clipId: string, what: string): EditorError {
  return new EditorError(
    'unsupported-node',
    `The clip \`${clipId}\` is ${what}; only a video node has a frame to hold (D82.9).`,
  );
}

/** The video node `clipId` and where it lies, or the refusal the helper gives. */
function placedVideo(document: ValidatedComposition, clipId: string): PlacedVideo {
  for (const holder of [...document.scenes, ...document.definitions]) {
    for (const [index, node] of holder.nodes.entries()) {
      if (node.id === clipId) {
        if (node.type !== 'video') throw notVideo(clipId, `a ${node.type} node`);
        return { node, parentId: holder.id, index };
      }
      if (node.type !== 'group') continue;
      for (const [childIndex, child] of node.children.entries()) {
        if (child.id !== clipId) continue;
        if (child.type !== 'video') throw notVideo(clipId, `a ${child.type} node`);
        return { node: child, parentId: node.id, index: childIndex };
      }
    }
    if (holder.clips.some(({ id }) => id === clipId)) throw notVideo(clipId, 'an audio clip');
  }
  if (document.clips.some(({ id }) => id === clipId)) throw notVideo(clipId, 'an audio clip');
  throw new EditorError('unknown-clip', `The document has no node or audio clip \`${clipId}\`.`);
}

function timingOf(node: VideoNode): ClipTiming {
  return {
    startUs: node.startUs,
    durationUs: node.durationUs,
    sourceStartUs: node.sourceStartUs,
    sourceStartRemainder: node.sourceStartRemainder,
    speed: node.speed,
    reverse: node.reverse,
  };
}

/**
 * The commands of one transaction that hold the frame the video node `clipId`
 * shows at `atUs` for `holdUs` (D82.9):
 *
 * - `overwrite`: `SplitClip` at `atUs` into `newClipIds[0]`, `SplitClip` of it
 *   at `atUs + holdUs` into `newClipIds[1]` unless that is the clip's end, then
 *   `SetClipReverse` false, `SetClipSpeed` x0, and `SetVideoSource` at the
 *   source time shown at `atUs`, which make the middle clip the freeze frame.
 *   Nothing moves.
 * - `insert`: `SplitClip` at `atUs` into `newClipIds[1]`, `MoveClip` of it
 *   `holdUs` later, and `AddNode` of the freeze frame `newClipIds[0]` between
 *   the halves: the second half a split would make, with its animations and
 *   effects renamed after it (D55.3), at speed x0 on the source time shown at
 *   `atUs`, lasting `holdUs`. No other clip moves: a ripple of the rest of the
 *   timeline is the host's (D49.8).
 *
 * Dispatched with `dispatchTransaction`, they are one step and one undo, and
 * the undo leaves the document byte for byte as it was. The freeze frame is
 * silent (D82.3) and keeps the keyframes of the clip in scene time (D82.7).
 *
 * Refused with `invalid-argument` for arguments that are not as
 * `freezeFrameArgumentsSchema` states, `unknown-clip`, `unsupported-node` for
 * anything but a video node, `time-outside-clip` when `atUs` is not strictly
 * inside the clip or an overwrite would reach past its end, `split-not-exact`
 * for a heard video cut off the grid of 125 µs, and by the bus with `id-in-use`
 * and whatever it refuses for the commands, as it would for each alone.
 */
export function freezeFrame(document: ValidatedComposition, args: unknown): readonly Command[] {
  const { clipId, atUs, holdUs, mode, newClipIds } = argumentsOf(args);
  const [freezeId, afterId] = newClipIds;
  const placed = placedVideo(document, clipId);
  const timing = timingOf(placed.node);
  // Differences, never sums, which need not be safe integers (D42.2).
  const offsetUs = atUs - timing.startUs;
  if (!(offsetUs > 0 && offsetUs < timing.durationUs)) {
    throw new EditorError(
      'time-outside-clip',
      `The time ${String(atUs)} µs does not lie strictly inside the lifetime of the clip \`${clipId}\` (D82.9).`,
    );
  }
  const restUs = timing.durationUs - offsetUs;
  const shownUs = sourceTimeOfScene(timing, atUs);
  if (mode === 'overwrite') {
    if (holdUs > restUs) {
      throw new EditorError(
        'time-outside-clip',
        `A freeze frame of ${String(holdUs)} µs from ${String(atUs)} µs would reach past the end of the clip \`${clipId}\`, ${String(restUs)} µs later; insert it instead, or hold it shorter (D82.9).`,
      );
    }
    return Object.freeze([
      parseSplitClip({ type: 'SplitClip', clipId, atUs, newClipId: freezeId }),
      ...(holdUs === restUs
        ? []
        : [
            parseSplitClip({
              type: 'SplitClip',
              clipId: freezeId,
              atUs: atUs + holdUs,
              newClipId: afterId,
            }),
          ]),
      parseSetClipReverse({ type: 'SetClipReverse', clipId: freezeId, reverse: false }),
      parseSetClipSpeed({ type: 'SetClipSpeed', clipId: freezeId, speed: { num: 0, den: 1 } }),
      parseSetVideoSource({ type: 'SetVideoSource', nodeId: freezeId, sourceStartUs: shownUs }),
    ]);
  }
  const half = splitSecondHalf(document as unknown as DocumentObject, clipId, atUs, freezeId);
  const frozen: DocumentObject = {
    ...half,
    durationUs: holdUs,
    sourceStartUs: shownUs,
    sourceStartRemainder: 0,
    speed: { num: 0, den: 1 },
    reverse: false,
  };
  return Object.freeze([
    parseSplitClip({ type: 'SplitClip', clipId, atUs, newClipId: afterId }),
    parseMoveClip({ type: 'MoveClip', clipId: afterId, startUs: atUs + holdUs }),
    // Directly after the first half: between the halves in the list, as in time.
    parseAddNode({
      type: 'AddNode',
      parentId: placed.parentId,
      index: placed.index + 1,
      node: frozen,
    }),
  ]);
}

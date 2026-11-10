/**
 * A transition at a cut (D66): two clips of one layer that meet end to end
 * have no overlap, which a clip transition needs (D56.3). This helper builds
 * the commands of one transaction that make the overlap and add the
 * transition, so that a host or a model does it in one step and one undo
 * (D30.5, D38). It reads the document and changes nothing: the bus applies the
 * commands, and every rule of the bus holds for each of them.
 */
import type { ValidatedComposition } from '@kadrion/schema';

import {
  deepFreeze,
  fieldsOf,
  isPlainObject,
  parseAddClipTransition,
  parseTrimClipEnd,
  parseTrimClipStart,
  type Command,
} from './commands.js';
import { EditorError } from './errors.js';

/** Where the transition lies against the cut (D66). */
export type CutAlignment = 'start' | 'center' | 'end';

/** What a caller states for a transition at a cut (D66). */
export interface ClipTransitionAtCutArguments {
  /**
   * The complete clip transition, as `AddClipTransition` takes it: its ID,
   * `fromNodeId` the clip before the cut, `toNodeId` the clip after it,
   * `durationUs`, `effect`, and `easing` (D67).
   */
  readonly transition: unknown;
  /**
   * `start`: the transition starts at the cut, and the outgoing clip lasts
   * `durationUs` longer; `end`: it ends at the cut, and the incoming clip starts
   * `durationUs` earlier; `center`: it is centred on the cut, the incoming clip
   * starting half of it earlier (rounded down) and the outgoing one lasting the
   * rest longer.
   */
  readonly alignment: CutAlignment;
}

/** A non-empty string field of a JSON Schema. */
interface StringField {
  readonly type: 'string';
  readonly description: string;
  readonly minLength: 1;
}

/**
 * The JSON Schema of the arguments of `clipTransitionAtCut` and its tool (D66):
 * the transition is open, as `AddClipTransition`'s, but names its two clips and
 * its duration, which the helper reads.
 */
export interface ClipTransitionAtCutArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly transition: {
      readonly type: 'object';
      readonly description: string;
      readonly properties: {
        readonly fromNodeId: StringField;
        readonly toNodeId: StringField;
        readonly durationUs: {
          readonly type: 'integer';
          readonly description: string;
          readonly minimum: 1;
          readonly maximum: number;
        };
      };
      readonly required: readonly ['fromNodeId', 'toNodeId', 'durationUs'];
    };
    readonly alignment: {
      readonly type: 'string';
      readonly description: string;
      readonly enum: readonly CutAlignment[];
    };
  };
  readonly required: readonly ['transition', 'alignment'];
  readonly additionalProperties: false;
}

export const clipTransitionAtCutArgumentsSchema: ClipTransitionAtCutArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    'Adds a transition between two clips of one layer that meet end to end, and makes their overlap in the same step.',
  properties: {
    transition: {
      type: 'object',
      description:
        'The complete clip transition, as add_clip_transition takes it: its ID, unused in the document; fromNodeId, the clip that ends at the cut; toNodeId, the clip that starts there, a sibling of it; durationUs; effect; and easing, {"kind":"linear"} for a constant speed or another easing as set_transition_easing describes.',
      properties: {
        fromNodeId: {
          type: 'string',
          description: 'The clip that ends at the cut.',
          minLength: 1,
        },
        toNodeId: {
          type: 'string',
          description: 'The clip that starts at the cut, a sibling of the other.',
          minLength: 1,
        },
        durationUs: {
          type: 'integer',
          description: 'How long the transition lasts, in integer microseconds, at least 1.',
          minimum: 1,
          maximum: Number.MAX_SAFE_INTEGER,
        },
      },
      required: ['fromNodeId', 'toNodeId', 'durationUs'],
    },
    alignment: {
      type: 'string',
      description:
        'Where the transition lies against the cut: start (it starts at the cut; the outgoing clip lasts durationUs longer), center (it is centred on the cut; the incoming clip starts half of it earlier, rounded down, and the outgoing one lasts the rest longer), or end (it ends at the cut; the incoming clip starts durationUs earlier).',
      enum: ['start', 'center', 'end'],
    },
  },
  required: ['transition', 'alignment'],
  additionalProperties: false,
});

/** A node of a scene or a definition with the holder it lies in (D76). */
interface Placed {
  readonly sceneId: string;
  readonly transitions: number;
  readonly startUs: number;
  readonly durationUs: number;
}

function placed(document: ValidatedComposition, nodeId: string): Placed | null {
  // A clip transition joins siblings of a scene or of a definition alike (D76).
  for (const scene of [...document.scenes, ...document.definitions]) {
    for (const node of scene.nodes) {
      const found =
        node.id === nodeId
          ? node
          : node.type === 'group'
            ? node.children.find(({ id }) => id === nodeId)
            : undefined;
      if (found !== undefined) {
        return {
          sceneId: scene.id,
          transitions: scene.transitions.length,
          startUs: found.startUs,
          durationUs: found.durationUs,
        };
      }
    }
  }
  return null;
}

function nodeIdField(transition: Readonly<Record<string, unknown>>, name: string): string {
  const value = transition[name];
  if (typeof value !== 'string' || value === '') {
    throw new EditorError('invalid-argument', `\`transition.${name}\` must be a non-empty string.`);
  }
  return value;
}

/**
 * The commands of one transaction that put `transition` on the cut between
 * two clips of one layer (D66): `TrimClipStart` of the incoming clip, when it
 * starts earlier, `TrimClipEnd` of the outgoing clip, when it lasts longer, and
 * `AddClipTransition` at the end of the scene's transitions. Dispatched with
 * `dispatchTransaction`, they are one step and one undo, and the undo leaves
 * the document byte for byte as it was.
 *
 * Refused with `invalid-argument` for arguments that are not as
 * `clipTransitionAtCutArgumentsSchema` states, `unknown-node` for a clip the
 * document lacks, `not-a-cut` when the outgoing clip does not end exactly where
 * the incoming one starts in the same scene, and `no-room-at-cut` when the
 * incoming clip would start before its scene or the outgoing one end past the
 * largest time; `details` name the clip. A clip without enough source before or
 * after it is refused by the bus, which names it (`source-range-exceeded`), and
 * everything else the bus refuses for the commands, as it would for each alone.
 */
export function clipTransitionAtCut(
  document: ValidatedComposition,
  args: unknown,
): readonly Command[] {
  const fields = fieldsOf(args, ['transition', 'alignment'], 'A transition at a cut');
  const alignment = fields['alignment'];
  if (alignment !== 'start' && alignment !== 'center' && alignment !== 'end') {
    throw new EditorError('invalid-argument', '`alignment` must be one of start, center, and end.');
  }
  const transition = fields['transition'];
  if (!isPlainObject(transition)) {
    throw new EditorError('invalid-argument', '`transition` must be an object.');
  }
  const fromNodeId = nodeIdField(transition, 'fromNodeId');
  const toNodeId = nodeIdField(transition, 'toNodeId');
  const durationUs = transition['durationUs'];
  if (typeof durationUs !== 'number' || !Number.isSafeInteger(durationUs) || durationUs < 1) {
    throw new EditorError(
      'invalid-argument',
      '`transition.durationUs` must be a safe integer of at least 1.',
    );
  }
  const from = placed(document, fromNodeId);
  const to = placed(document, toNodeId);
  for (const [id, found] of [
    [fromNodeId, from],
    [toNodeId, to],
  ] as const) {
    if (found === null) throw new EditorError('unknown-node', `No node has the ID "${id}".`, [id]);
  }
  if (from === null || to === null) return [];
  // Compared as a difference, so that no end is formed past the safe integers.
  if (from.sceneId !== to.sceneId || to.startUs - from.startUs !== from.durationUs) {
    throw new EditorError(
      'not-a-cut',
      `"${fromNodeId}" does not end where "${toNodeId}" starts in the same scene.`,
      [fromNodeId, toNodeId],
    );
  }
  const earlierUs =
    alignment === 'end' ? durationUs : alignment === 'center' ? Math.floor(durationUs / 2) : 0;
  const longerUs = durationUs - earlierUs;
  if (earlierUs > to.startUs) {
    throw new EditorError(
      'no-room-at-cut',
      `"${toNodeId}" would start ${String(earlierUs - to.startUs)} µs before its scene.`,
      [toNodeId],
    );
  }
  if (longerUs > Number.MAX_SAFE_INTEGER - to.startUs) {
    throw new EditorError('no-room-at-cut', `"${fromNodeId}" would end past the largest time.`, [
      fromNodeId,
    ]);
  }
  return Object.freeze([
    ...(earlierUs === 0
      ? []
      : [
          parseTrimClipStart({
            type: 'TrimClipStart',
            clipId: toNodeId,
            startUs: to.startUs - earlierUs,
          }),
        ]),
    ...(longerUs === 0
      ? []
      : [
          parseTrimClipEnd({
            type: 'TrimClipEnd',
            clipId: fromNodeId,
            endUs: to.startUs + longerUs,
          }),
        ]),
    parseAddClipTransition({
      type: 'AddClipTransition',
      sceneId: to.sceneId,
      index: to.transitions,
      transition,
    }),
  ]);
}

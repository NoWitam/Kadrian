/**
 * Nested compositions (D65.4, D76): what a definition placed by an instance
 * shows, and when. Like the placement of scenes (D54) and the source frame of
 * a video (D49.5), these are pure functions of the document that every host
 * shares: the runtime evaluates by them, the renderer mounts by them, and the
 * audio plan places the sounds of a definition by them.
 *
 * An instance shows its definition at `sourceStartUs + (t − startUs)` (D65.4).
 * Inside an instance, every ID of its definition is addressed by the path of
 * instance IDs to it, `instance/node`, or `outer/inner/node` for an instance
 * inside another (D76.3): an ID of a document never holds a `/`, so a path
 * names one placed entity and never collides with an ID of the document.
 */
import type { Composition, Definition, InstanceNode } from './types.js';

/** How many instances may hold each other, counted from a scene (D65.4, D76). */
export const MAX_INSTANCE_DEPTH = 8;

/** The separator of the path of an ID inside an instance (D76.3). */
export const INSTANCE_PATH_SEPARATOR = '/';

/**
 * The definition time an instance shows at time `timeUs` of what holds it
 * (D65.4): `sourceStartUs + (timeUs − startUs)` within its lifetime, and the
 * nearest instant of its lifetime outside it, so that an inactive instance is
 * evaluated at a time its definition has, as a node outside its lifetime is
 * evaluated at all (D42.3). Every value is a safe integer: validation keeps
 * `sourceStartUs + durationUs` within the definition's `durationUs`.
 */
export function definitionTimeUs(
  instance: Pick<InstanceNode, 'startUs' | 'durationUs' | 'sourceStartUs'>,
  timeUs: number,
): number {
  if (timeUs <= instance.startUs) return instance.sourceStartUs;
  const elapsed = Math.min(timeUs - instance.startUs, instance.durationUs - 1);
  return instance.sourceStartUs + elapsed;
}

/** The keys whose values are IDs of the entities of a definition, or references to them. */
const SCOPED_KEYS: readonly string[] = Object.freeze(['id', 'nodeId', 'fromNodeId', 'toNodeId']);

/** A value with every ID and every reference to a node prefixed by `prefix`. */
function scoped<T>(value: T, prefix: string): T {
  if (Array.isArray(value)) {
    return (value as readonly unknown[]).map((item) => scoped(item, prefix)) as T;
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]): [string, unknown] => [
        key,
        SCOPED_KEYS.includes(key) && typeof child === 'string'
          ? `${prefix}${child}`
          : scoped(child, prefix),
      ]),
    ) as T;
  }
  return value;
}

/**
 * The definition an instance places, with every ID inside it addressed by its
 * path through `instance` (D76.3): the IDs of its nodes, animations, effects,
 * clips, and transitions, and the references to its nodes of its mattes and
 * transitions. Assets and definitions are named as the document names them.
 * `instance.id` is itself a path when the instance lies inside another, so the
 * paths of nested instances compose. `null` when the document has no such
 * definition, which validation refuses (`unresolved-definition-reference`).
 *
 * The result is a new value that shares no object with the document.
 */
export function instanceDefinition(
  composition: Pick<Composition, 'definitions'>,
  instance: Pick<InstanceNode, 'id' | 'definitionId'>,
): Definition | null {
  const definition = composition.definitions.find(({ id }) => id === instance.definitionId);
  if (definition === undefined) return null;
  // The definition keeps its own ID; everything inside it takes the path.
  return { ...scoped(definition, `${instance.id}${INSTANCE_PATH_SEPARATOR}`), id: definition.id };
}

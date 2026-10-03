/**
 * What the composition schema says about the lifetime of a node, read from it
 * rather than written out again (D30.8, D42.10). The function takes the schema
 * as data, so a test can hand it other metadata; the command hands it
 * `compositionSchema`.
 *
 * `SetNodeLifetime` takes any node, so the bounds must not depend on the node's
 * type: every node shape of the schema is read — those of the scene and those
 * of a group's children — and a shape that states no bound, or shapes that
 * disagree, are an error, never a silent choice among the others (D41.4's
 * manner).
 */

/** The bounds of an integer field. */
export interface Bounds {
  readonly minimum: number;
  readonly maximum: number;
}

/** The bounds of the two fields of a lifetime. */
export interface LifetimeBounds {
  readonly startUs: Bounds;
  readonly durationUs: Bounds;
}

/** A value inside a JSON value, by keys, or `undefined`. */
function at(value: unknown, ...path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Readonly<Record<string, unknown>>)[key];
  }
  return current;
}

function variantsOf(value: unknown): readonly unknown[] {
  const oneOf = at(value, 'oneOf');
  return Array.isArray(oneOf) ? (oneOf as readonly unknown[]) : [];
}

/** The shapes of every node type, group children included. */
function nodeShapes(schema: unknown): readonly unknown[] {
  const nodes = variantsOf(
    at(schema, 'properties', 'scenes', 'items', 'properties', 'nodes', 'items'),
  );
  return nodes.flatMap((node) => [
    node,
    ...variantsOf(at(node, 'properties', 'children', 'items')),
  ]);
}

/** The bounds a shape states for a field, or an error: a shape without them is not skipped. */
function boundsOf(shape: unknown, field: string): Bounds {
  const minimum = at(shape, 'properties', field, 'minimum');
  const maximum = at(shape, 'properties', field, 'maximum');
  if (typeof minimum !== 'number' || typeof maximum !== 'number') {
    throw new Error(`A node shape of the schema states no bounds for ${field}.`);
  }
  return { minimum, maximum };
}

/** The one value the shapes state, or an error when there is no shape or they disagree. */
function agreed(values: readonly Bounds[], field: string): Bounds {
  const [first, ...others] = values;
  if (first === undefined) throw new Error(`The schema has no node shape to read ${field} from.`);
  const text = JSON.stringify(first);
  if (others.some((other) => JSON.stringify(other) !== text)) {
    throw new Error(`The node shapes of the schema disagree on the bounds of ${field}.`);
  }
  return first;
}

/** The bounds of `startUs` and `durationUs` of a node: those every node shape states (D42.1). */
export function lifetimeBounds(schema: unknown): LifetimeBounds {
  const shapes = nodeShapes(schema);
  return {
    startUs: agreed(
      shapes.map((shape) => boundsOf(shape, 'startUs')),
      'startUs',
    ),
    durationUs: agreed(
      shapes.map((shape) => boundsOf(shape, 'durationUs')),
      'durationUs',
    ),
  };
}

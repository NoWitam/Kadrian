/**
 * What the composition schema says about animations and keyframes, read from
 * it rather than written out again (D30.8, D41.2, D41.4). Each function takes
 * the schema as data, so a test can hand it other metadata; the commands hand
 * it `compositionSchema`.
 *
 * The commands ask by property alone, so the answer must not depend on the type
 * of the node that holds the animation: every animation shape of the schema is
 * read — those of the scene's nodes and those of a group's children — and a
 * shape that states no value, or shapes that disagree, are an error, never a
 * silent choice among the others.
 */

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

/** The animation shapes of every node type that has animations, group children included. */
function animationBranches(schema: unknown): readonly unknown[] {
  const nodes = variantsOf(
    at(schema, 'properties', 'scenes', 'items', 'properties', 'nodes', 'items'),
  );
  const owners = nodes.flatMap((node) => [
    node,
    ...variantsOf(at(node, 'properties', 'children', 'items')),
  ]);
  return owners.flatMap((owner) => variantsOf(at(owner, 'properties', 'animations', 'items')));
}

/** The number a shape states, or an error: a shape without it is not skipped. */
function stated(value: unknown, what: string): number {
  if (typeof value !== 'number') {
    throw new Error(`An animation shape of the schema states no ${what}.`);
  }
  return value;
}

/** The one value the shapes state, or an error when there is no shape or they disagree. */
function agreed<T>(values: readonly T[], what: string): T {
  const [first, ...others] = values;
  if (first === undefined) throw new Error(`The schema states no ${what}.`);
  const text = JSON.stringify(first);
  if (others.some((other) => JSON.stringify(other) !== text)) {
    throw new Error(`The animation shapes of the schema disagree on the ${what}.`);
  }
  return first;
}

/**
 * The fewest keyframes an animation of `property` may have: the `minItems` of
 * its keyframes in the schema (D16.6, D41.4).
 */
export function keyframeMinimum(schema: unknown, property: string): number {
  const what = `minimum number of keyframes for ${property}`;
  const minimums = animationBranches(schema)
    .filter((branch) => at(branch, 'properties', 'property', 'const') === property)
    .map((branch) => stated(at(branch, 'properties', 'keyframes', 'minItems'), what));
  return agreed(minimums, what);
}

/** The bounds of a keyframe's time: those of its `timeUs` in the schema (D04, D41.2). */
export function keyframeTimeBounds(schema: unknown): {
  readonly minimum: number;
  readonly maximum: number;
} {
  const what = 'bounds for the time of a keyframe';
  const bounds = animationBranches(schema).map((branch) => {
    const time = at(branch, 'properties', 'keyframes', 'items', 'properties', 'timeUs');
    return {
      minimum: stated(at(time, 'minimum'), what),
      maximum: stated(at(time, 'maximum'), what),
    };
  });
  return agreed(bounds, what);
}

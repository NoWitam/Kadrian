/**
 * Composition schema 0.5: the persistent data contract, as JSON Schema draft
 * 2020-12 authored in TypeScript so that document types can be derived from it
 * (D17). `JSON.stringify(compositionSchema)` is the schema in its standard form.
 *
 * It accepts the reference composition and nothing beyond it (D16): no optional
 * fields, no defaults, no unknown fields. 0.2 is 0.1 plus the lifetime of every
 * node (D42.1); 0.3 is 0.2 plus the asset type `video`, the node `video`, and
 * the `fit` of images and videos (D50); 0.4 is 0.3 plus any number of audio
 * clips with a source start, a volume, and fades, and the sound of a video
 * node (D52); 0.5 is 0.4 plus a sequence of scenes, each with its own duration
 * and its own audio clips, and every time inside a scene local to it (D49.3,
 * D54); 0.6 is 0.5 plus transitions on the boundaries between scenes and
 * between two clips of one layer (D49.4, D56). The schemas of 0.1 to 0.5 are
 * kept as data in `v0-1` to `v0-5` (D35.4).
 */
import {
  closedObject,
  type ArraySchema,
  type JsonSchema,
  type NumberSchema,
  type StringSchema,
  type UnionSchema,
} from './json-schema.js';

export const SCHEMA_VERSION = '0.6';

const MAX_SAFE_INTEGER = 9_007_199_254_740_991;

const id = {
  type: 'string',
  description: 'Stable ID, unique across the whole document whatever the kind of entity (D16).',
  pattern: '^[A-Za-z0-9_-]+$',
} as const satisfies StringSchema;

const assetReference = {
  type: 'string',
  description: 'ID of an asset of the type that the referring entity expects (D14).',
  pattern: '^[A-Za-z0-9_-]+$',
} as const satisfies StringSchema;

const timeUs = {
  type: 'integer',
  description:
    'Time in integer microseconds (D04): scene time inside a scene, composition time in the composition (D49.3).',
  minimum: 0,
  maximum: MAX_SAFE_INTEGER,
} as const satisfies NumberSchema;

const durationUs = {
  type: 'integer',
  description: 'Duration in integer microseconds (D04).',
  minimum: 1,
  maximum: MAX_SAFE_INTEGER,
} as const satisfies NumberSchema;

const canvasLength = {
  type: 'integer',
  description: 'Canvas side in composition pixels (D15).',
  minimum: 1,
  maximum: 1920,
} as const satisfies NumberSchema;

const coordinate = {
  type: 'integer',
  description: 'Coordinate or offset in composition pixels; x grows right, y grows down (D15).',
  minimum: -1_000_000,
  maximum: 1_000_000,
} as const satisfies NumberSchema;

const length = {
  type: 'integer',
  description: 'Length in composition pixels (D15).',
  minimum: 1,
  maximum: 1_000_000,
} as const satisfies NumberSchema;

const opacity = {
  type: 'number',
  description: 'Opacity from 0 (transparent) to 1 (opaque). A group is composited first (D15).',
  minimum: 0,
  maximum: 1,
} as const satisfies NumberSchema;

/**
 * The volume of a sound (D52.2): a linear factor of its amplitude, from 0
 * (silent) to 1 (the source as it is). Like an opacity, a JSON number.
 */
const volume = {
  type: 'number',
  description:
    'Linear factor of the amplitude, from 0 (silent) to 1 (the source as it is); it never amplifies (D52).',
  minimum: 0,
  maximum: 1,
} as const satisfies NumberSchema;

const scaleFactor = {
  type: 'number',
  description: 'Scale factor (D15).',
  minimum: 0,
  maximum: 1000,
} as const satisfies NumberSchema;

const color = {
  type: 'string',
  description: 'Lowercase #rrggbb sRGB colour (D15).',
  pattern: '^#[0-9a-f]{6}$',
} as const satisfies StringSchema;

const position = closedObject(
  "Offset of the node's origin, the top-left corner of its box, from its parent's origin (D15).",
  { x: coordinate, y: coordinate },
);

const scale = closedObject("Scale about the node's own origin, applied after the translation.", {
  x: scaleFactor,
  y: scaleFactor,
});

const interpolation = {
  type: 'string',
  description: 'How values between two keyframes are computed. The schema knows linear only.',
  enum: ['linear'],
} as const satisfies StringSchema;

/** Keyframe times ascend strictly; outside the keyframes the nearest value holds (D16). */
function animation<const N extends string, const V extends JsonSchema>(
  property: N,
  description: string,
  value: V,
) {
  return closedObject(description, {
    id,
    property: { type: 'string', const: property },
    interpolation,
    keyframes: {
      type: 'array',
      minItems: 2,
      items: closedObject('Value of the animation at one instant.', { timeUs, value }),
    },
  });
}

export const opacityAnimationSchema = animation(
  'opacity',
  "Factors multiplied with the node's opacity (D16).",
  opacity,
);

export const positionAnimationSchema = animation(
  'position',
  "Offsets added to the node's position (D16).",
  position,
);

export const scaleAnimationSchema = animation(
  'scale',
  "Factors multiplied with the node's scale (D16).",
  scale,
);

export const animationSchema = {
  description: 'An animation modifies the base value of one property of the node that owns it.',
  oneOf: [opacityAnimationSchema, positionAnimationSchema, scaleAnimationSchema],
} as const satisfies UnionSchema;

const animations = {
  type: 'array',
  description: 'At most one animation per property.',
  items: animationSchema,
} as const satisfies ArraySchema;

const transform = { position, scale, opacity, animations } as const;

/**
 * The lifetime of a node, in the time of its scene (D42.1, D42.2, D49.3): it is active at
 * `t` when `t >= startUs` and `t - startUs < durationUs`. Every node has one,
 * directly after its `type`.
 */
const lifetime = {
  startUs: {
    ...timeUs,
    description:
      'Scene time, in integer microseconds from the start of its scene, from which the node is active (D42.2, D49.3). It may lie at or after the end of the scene.',
  },
  durationUs: {
    ...durationUs,
    description:
      'How long the node is active, in integer microseconds, from startUs (D42.2). Whatever lies past the end of its scene is cut (D49.3).',
  },
} as const;

export const backgroundNodeSchema = closedObject('Solid fill that covers the whole canvas.', {
  id,
  type: { type: 'string', const: 'background' },
  ...lifetime,
  color,
});

const fadeUs = {
  type: 'integer',
  description:
    'Length of a linear fade, in integer microseconds of the lifetime of the clip; 0 is no fade (D52).',
  minimum: 0,
  maximum: MAX_SAFE_INTEGER,
} as const satisfies NumberSchema;

/** How the pixels of an image or a video meet the box of their node (D50), as CSS `object-fit`. */
const fit = {
  type: 'string',
  description:
    'How the picture meets the box: fill stretches it to the box, contain shows all of it inside the box, cover fills the box and crops; contain and cover keep the aspect ratio and centre the picture (D50).',
  enum: ['fill', 'contain', 'cover'],
} as const satisfies StringSchema;

export const imageNodeSchema = closedObject('An image asset fitted to the box of the node.', {
  id,
  type: { type: 'string', const: 'image' },
  ...lifetime,
  ...transform,
  assetId: assetReference,
  width: length,
  height: length,
  fit,
});

export const videoNodeSchema = closedObject(
  'A video asset: at each instant of its lifetime the source frame of D49.5, fitted to the box of the node, and, at a volume above 0, the sound of its source at the same source time (D50, D52).',
  {
    id,
    type: { type: 'string', const: 'video' },
    ...lifetime,
    ...transform,
    assetId: assetReference,
    sourceStartUs: {
      ...timeUs,
      description:
        'Source time, in integer microseconds from the presentation time of the first frame, shown at startUs; speed is 1 (D49.1, D49.5).',
    },
    width: length,
    height: length,
    fit,
    volume: {
      ...volume,
      description:
        'Linear factor of the amplitude of the sound of the video, from 0 to 1. At 0 the video is silent and its source needs no sound; above 0 it needs exactly one audio stream (D52).',
    },
  },
);

export const textNodeSchema = closedObject('One run of text; line breaks are preserved.', {
  id,
  type: { type: 'string', const: 'text' },
  ...lifetime,
  ...transform,
  text: { type: 'string' },
  fontAssetId: assetReference,
  fontSize: length,
  color,
});

export const customHtmlNodeSchema = closedObject(
  'Isolated, capability-limited HTML element (D05). The schema defines no capability.',
  {
    id,
    type: { type: 'string', const: 'custom-html' },
    ...lifetime,
    ...transform,
    width: length,
    height: length,
    html: { type: 'string', description: 'Inline document shown inside the sandbox.' },
  },
);

export const groupNodeSchema = closedObject(
  "Children follow the group's transform; a child is shown only while its group is active too (D42.4). Groups do not nest (D16).",
  {
    id,
    type: { type: 'string', const: 'group' },
    ...lifetime,
    ...transform,
    children: {
      type: 'array',
      description: 'Array order is the z-order; the first child is at the bottom.',
      items: { oneOf: [imageNodeSchema, textNodeSchema, videoNodeSchema] },
    },
  },
);

export const sceneNodeSchema = {
  oneOf: [
    backgroundNodeSchema,
    groupNodeSchema,
    imageNodeSchema,
    textNodeSchema,
    customHtmlNodeSchema,
    videoNodeSchema,
  ],
} as const satisfies UnionSchema;

/**
 * The audio clip of D52, in the time of what holds it: composition time in the
 * composition's `clips`, scene time in a scene's `clips` (D49.3, D54).
 */
export const audioClipSchema = closedObject(
  'Plays an audio asset from sourceStartUs for durationUs, at its volume and with its fades; whatever lies past the end of what holds it — the composition, or its scene — is cut. Clips are mixed regardless of their order (D52, D54).',
  {
    id,
    type: { type: 'string', const: 'audio' },
    assetId: assetReference,
    startUs: timeUs,
    durationUs,
    sourceStartUs: {
      ...timeUs,
      description:
        'Source time, in integer microseconds from the first sample, heard at startUs; speed is 1 (D49.1, D52).',
    },
    volume,
    fadeInUs: {
      ...fadeUs,
      description:
        'The clip rises linearly from silence to its volume over the first fadeInUs of its lifetime (D52).',
    },
    fadeOutUs: {
      ...fadeUs,
      description:
        'The clip falls linearly from its volume to silence over the last fadeOutUs of its lifetime, even where its scene or the composition cuts it earlier (D52).',
    },
  },
);

const sceneReference = {
  type: 'string',
  description: 'ID of a scene of this composition (D56).',
  pattern: '^[A-Za-z0-9_-]+$',
} as const satisfies StringSchema;

const nodeReference = {
  type: 'string',
  description: 'ID of a node of the same scene (D56).',
  pattern: '^[A-Za-z0-9_-]+$',
} as const satisfies StringSchema;

const direction = {
  type: 'string',
  description: 'The direction in which the incoming side moves across the frame (D56).',
  enum: ['left', 'right', 'up', 'down'],
} as const satisfies StringSchema;

export const crossfadeEffectSchema = closedObject(
  'The incoming side fades in, from transparent to its own opacity, over the outgoing one (D56).',
  { kind: { type: 'string', const: 'crossfade' } },
);

export const fadeThroughColorEffectSchema = closedObject(
  'The outgoing scene fades out to the colour over the first half, and the incoming scene fades in from it over the second half (D56).',
  { kind: { type: 'string', const: 'fade-through-color' }, color },
);

export const slideEffectSchema = closedObject(
  'The incoming scene slides in over the outgoing one from the edge opposite to its direction (D56).',
  { kind: { type: 'string', const: 'slide' }, direction },
);

export const wipeEffectSchema = closedObject(
  'An edge travels across the frame in its direction and uncovers the incoming scene behind it (D56).',
  { kind: { type: 'string', const: 'wipe' }, direction },
);

/** How a transition between two scenes combines their images (D56). */
export const sceneTransitionEffectSchema = {
  description: 'How the two images are combined; a pure function of the progress (D49.4, D56).',
  oneOf: [crossfadeEffectSchema, fadeThroughColorEffectSchema, slideEffectSchema, wipeEffectSchema],
} as const satisfies UnionSchema;

/** How a transition between two clips combines them (D56): a node's box is not the frame. */
export const clipTransitionEffectSchema = {
  description: 'How the two clips are combined; a pure function of the progress (D49.4, D56).',
  oneOf: [crossfadeEffectSchema],
} as const satisfies UnionSchema;

const transitionDurationUs = {
  ...durationUs,
  description:
    'How long the two sides overlap, in integer microseconds; at most the duration of either side (D49.4, D56).',
} as const satisfies NumberSchema;

/**
 * A transition on the boundary between two scenes (D49.4, D56): the incoming
 * scene starts durationUs before the outgoing one ends.
 */
export const sceneTransitionSchema = closedObject(
  'The overlap of two adjacent scenes: during its durationUs the outgoing scene shows its last durationUs and the incoming scene its first, combined by the effect (D49.4, D56).',
  {
    id,
    fromSceneId: {
      ...sceneReference,
      description: 'The outgoing scene (D56).',
    },
    toSceneId: {
      ...sceneReference,
      description: 'The incoming scene, directly after the outgoing one (D56).',
    },
    durationUs: transitionDurationUs,
    effect: sceneTransitionEffectSchema,
  },
);

/**
 * A transition between two clips of one layer (D49.2, D49.4, D56): two
 * siblings whose lifetimes overlap by exactly its duration.
 */
export const clipTransitionSchema = closedObject(
  'The overlap of two clips of one layer, siblings of one parent whose lifetimes overlap by exactly durationUs; it adds no time and moves nothing (D49.4, D56).',
  {
    id,
    fromNodeId: {
      ...nodeReference,
      description: 'The outgoing node, which ends durationUs after the incoming one starts (D56).',
    },
    toNodeId: {
      ...nodeReference,
      description: 'The incoming node, a sibling of the outgoing one (D56).',
    },
    durationUs: transitionDurationUs,
    effect: clipTransitionEffectSchema,
  },
);

export const sceneSchema = closedObject(
  'One scene of the sequence (D49.3): it starts where the scene before it ends and lasts durationUs; every time inside it is scene time, from 0 at its start (D54).',
  {
    id,
    durationUs: {
      ...durationUs,
      description:
        'How long the scene lasts, in integer microseconds. The scenes follow each other in their order, and the durationUs of the composition is the sum of theirs less the durations of the scene transitions (D49.3, D54, D56).',
    },
    nodes: {
      type: 'array',
      description: 'Array order is the z-order; the first node is at the bottom.',
      items: sceneNodeSchema,
    },
    clips: {
      type: 'array',
      description:
        'Audio clips in scene time, which move with the scene; mixed with every other clip regardless of their order (D49.3, D54).',
      items: audioClipSchema,
    },
    transitions: {
      type: 'array',
      description:
        'Transitions between two clips of one layer of this scene; their order has no meaning (D49.4, D56).',
      items: clipTransitionSchema,
    },
  },
);

export const assetSchema = closedObject(
  'Pinned by content hash; the host resolves the bytes and the engine verifies them (D14).',
  {
    id,
    type: { type: 'string', enum: ['image', 'audio', 'font', 'video'] },
    contentHash: {
      type: 'string',
      description: 'Algorithm, a colon, and the lowercase hex digest of the exact bytes.',
      pattern: '^sha256:[0-9a-f]{64}$',
    },
  },
);

/**
 * Freezes a schema and everything reachable from it. `validate-structure.ts`
 * remembers which schema objects it has checked; a frozen schema cannot change
 * after that check, so the memo can never change a verdict (D24.2).
 */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const compositionSchema = deepFreeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Kadrion composition 0.6',
  ...closedObject('A video composition: the only source of rendering truth.', {
    schemaVersion: { type: 'string', const: SCHEMA_VERSION },
    width: canvasLength,
    height: canvasLength,
    fps: {
      type: 'integer',
      description: 'Integer frame rate; the frame grid follows D13.',
      minimum: 1,
      maximum: 120,
    },
    durationUs,
    assets: { type: 'array', items: assetSchema },
    scenes: {
      type: 'array',
      description:
        'The scenes in the order they are played, at least one; scene k + 1 starts where scene k ends, less the duration of the transition between them (D49.3, D54, D56).',
      minItems: 1,
      items: sceneSchema,
    },
    clips: {
      type: 'array',
      description:
        'Audio clips in composition time, for sound that spans scenes, mixed by summing regardless of their order (D52, D54).',
      items: audioClipSchema,
    },
    transitions: {
      type: 'array',
      description:
        'Transitions on the boundaries between scenes, at most one per boundary; their order has no meaning (D49.4, D56).',
      items: sceneTransitionSchema,
    },
  }),
} as const satisfies JsonSchema);

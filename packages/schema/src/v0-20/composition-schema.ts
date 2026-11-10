/**
 * Composition schema 0.20, kept as frozen data (D35.4, D76): the schema exactly
 * as the build of 0.20 had it, so that `migrateComposition` validates a document
 * of 0.20 against what 0.20 was and not against a reconstruction. Nothing here is
 * edited again; `historical-schema.test.ts` pins its hash. It is reachable only
 * through `@kadrion/schema/migrate`, never through the main entry point, so it
 * is no part of the runtime artifact (D21).
 */
import {
  closedObject,
  type ArraySchema,
  type BooleanSchema,
  type JsonSchema,
  type NumberSchema,
  type ObjectSchema,
  type StringSchema,
  type UnionSchema,
  type Infer,
} from '../json-schema.js';

export const SCHEMA_VERSION_V020 = '0.20';

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

/** How far the safe area lies from one edge of the canvas (D70). */
const safeInset = {
  type: 'integer',
  description:
    'Composition pixels from the edge of the canvas to the safe area, from 0; two opposite insets leave at least 1 pixel (D70).',
  minimum: 0,
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
  "Offset of the top-left corner of the node's box from its parent's origin (D15, D68).",
  { x: coordinate, y: coordinate },
);

const scale = closedObject(
  "Scale about the node's origin point, applied before the rotation and after nothing else of the node (D15, D68).",
  {
    x: scaleFactor,
    y: scaleFactor,
  },
);

/** A rotation in degrees (D68): a JSON number, several turns allowed (D65.3). */
const rotation = {
  type: 'number',
  description:
    "Rotation about the node's origin point, in degrees; positive turns clockwise, and a whole number of turns is no rotation (D68).",
  minimum: -360_000,
  maximum: 360_000,
} as const satisfies NumberSchema;

/** One coordinate of a point of a box, in per mille of its side (D63.1, D68). */
const permille = {
  type: 'integer',
  description:
    'Per mille of a side, from 0 at the left or top edge to 1000 at the right or bottom edge (D68).',
  minimum: 0,
  maximum: 1000,
} as const satisfies NumberSchema;

/** The point scale and rotation are about (D68), as CSS `transform-origin`. */
const origin = closedObject(
  "The point of the node's box that scale and rotation are about, in per mille of the width and height of the box; 0, 0 is the top-left corner of D15 and 500, 500 the centre. A group's box is the canvas. It moves nothing by itself: the position is that of the top-left corner (D68).",
  { x: permille, y: permille },
);

/** The radius of the corners of an image or a video, in composition pixels (D68). */
const cornerRadius = {
  type: 'integer',
  description:
    "Radius of the four corners of the node's box, in composition pixels; 0 is square, and a radius above half a side is reduced as CSS does (D68).",
  minimum: 0,
  maximum: 1_000_000,
} as const satisfies NumberSchema;

/** What is cut away of the picture of an image or a video before it is fitted (D65.6, D68). */
const crop = closedObject(
  'What is cut away of the picture before it meets the box, in per mille of the side of the picture from each edge; the rest is fitted and focused as if it were the whole picture. Two opposite insets leave at least 1 per mille (D68).',
  { top: permille, right: permille, bottom: permille, left: permille },
);

/** One control coordinate of a cubic Bézier along the axis of time: 0 to 1, so that the curve is a function of time (D67). */
const bezierTime = {
  type: 'number',
  description:
    'A coordinate of a control point along the progress, from 0 to 1, so that the curve is a function of time (D67).',
  minimum: 0,
  maximum: 1,
} as const satisfies NumberSchema;

/** One control coordinate of a cubic Bézier along the axis of the value: -1 to 2, room for an overshoot (D67). */
const bezierValue = {
  type: 'number',
  description:
    'A coordinate of a control point along the value, from -1 to 2: below 0 or above 1 the motion overshoots, and the sampled value is held within the bounds of its property (D67).',
  minimum: -1,
  maximum: 2,
} as const satisfies NumberSchema;

const linearEasingSchema = closedObject(
  'The value moves at a constant speed: the arithmetic of D18.3 (D67).',
  { kind: { type: 'string', const: 'linear' } },
);

const holdEasingSchema = closedObject(
  'The value stays at its start until the end of the segment and then jumps (D67).',
  { kind: { type: 'string', const: 'hold' } },
);

const easeInEasingSchema = closedObject(
  'Starts slowly and speeds up: the cubic Bézier (0.42, 0, 1, 1) of CSS (D67).',
  { kind: { type: 'string', const: 'ease-in' } },
);

const easeOutEasingSchema = closedObject(
  'Starts fast and slows down: the cubic Bézier (0, 0, 0.58, 1) of CSS (D67).',
  { kind: { type: 'string', const: 'ease-out' } },
);

const easeInOutEasingSchema = closedObject(
  'Starts slowly, speeds up, and slows down: the cubic Bézier (0.42, 0, 0.58, 1) of CSS (D67).',
  { kind: { type: 'string', const: 'ease-in-out' } },
);

const cubicBezierEasingSchema = closedObject(
  'A cubic Bézier from (0, 0) to (1, 1) with the control points (x1, y1) and (x2, y2), as in CSS; x is the progress and y the eased progress (D67).',
  {
    kind: { type: 'string', const: 'cubic-bezier' },
    x1: bezierTime,
    y1: bezierValue,
    x2: bezierTime,
    y2: bezierValue,
  },
);

const stepsEasingSchema = closedObject(
  'The value moves in count equal jumps: at the end of each of count equal intervals (end), or at their start (start), as steps() of CSS (D67).',
  {
    kind: { type: 'string', const: 'steps' },
    count: {
      type: 'integer',
      description: 'The number of jumps, from 1 to 1000 (D67).',
      minimum: 1,
      maximum: 1000,
    },
    position: {
      type: 'string',
      description: 'Whether each jump comes at the start or at the end of its interval (D67).',
      enum: ['start', 'end'],
    },
  },
);

/** How a segment moves from its start value to its end value (D67). */
const easingSchema = {
  description:
    'How the value moves through a segment, from its start to its end: a pure function of the progress, computed by the runtime with + - * / and comparisons only (D18, D67).',
  oneOf: [
    linearEasingSchema,
    holdEasingSchema,
    easeInEasingSchema,
    easeOutEasingSchema,
    easeInOutEasingSchema,
    cubicBezierEasingSchema,
    stepsEasingSchema,
  ],
} as const satisfies UnionSchema;

/** Keyframe times ascend strictly; outside the keyframes the nearest value holds (D16). */
function animation<const N extends string, const V extends JsonSchema>(
  property: N,
  description: string,
  value: V,
) {
  return closedObject(description, {
    id,
    property: { type: 'string', const: property },
    keyframes: {
      type: 'array',
      minItems: 2,
      items: closedObject(
        'Value of the animation at one instant, and how it moves from here to the next keyframe; the easing of the last keyframe is never read (D67).',
        { timeUs, value, easing: easingSchema },
      ),
    },
  });
}

const opacityAnimationSchema = animation(
  'opacity',
  "Factors multiplied with the node's opacity (D16).",
  opacity,
);

const positionAnimationSchema = animation(
  'position',
  "Offsets added to the node's position (D16).",
  position,
);

const scaleAnimationSchema = animation(
  'scale',
  "Factors multiplied with the node's scale (D16).",
  scale,
);

const rotationAnimationSchema = animation(
  'rotation',
  "Offsets in degrees added to the node's rotation (D65.1, D68).",
  rotation,
);

const originOffset = {
  type: 'integer',
  description: 'Per mille of a side of the box, added to the coordinate of the origin (D68).',
  minimum: -1000,
  maximum: 1000,
} as const satisfies NumberSchema;

const originAnimationSchema = animation(
  'origin',
  "Offsets in per mille added to the node's origin (D65.1, D68).",
  closedObject('An offset of the origin, in per mille of the width and height of the box (D68).', {
    x: originOffset,
    y: originOffset,
  }),
);

const sizeAnimationSchema = animation(
  'size',
  "The width and height of the node's box, which replace its own while the animation is sampled (D65.1, D68).",
  closedObject('The width and height of the box, in composition pixels (D68).', {
    width: length,
    height: length,
  }),
);

const colorAnimationSchema = animation(
  'color',
  "Colours that replace the node's colour: each channel moves on its own and is rounded to an integer (D65.1, D68).",
  color,
);

const cropAnimationSchema = animation(
  'crop',
  "Crops that replace the node's crop (D65.1, D68).",
  crop,
);

const cornerRadiusAnimationSchema = animation(
  'cornerRadius',
  "Radii that replace the node's corner radius (D65.1, D68).",
  cornerRadius,
);

/** A coordinate of a point of a shape, in composition pixels of the node's box; a JSON number (D73). */
const shapeCoordinate = {
  type: 'number',
  description:
    "A coordinate in composition pixels of the node's box, from its top-left corner; x grows right, y grows down; any number, fractions included, so that a drawing keeps its detail (D73).",
  minimum: -1_000_000,
  maximum: 1_000_000,
} as const satisfies NumberSchema;

/** A point of a polygon (D73). */
const shapePoint = closedObject("A point in composition pixels of the node's box (D73).", {
  x: shapeCoordinate,
  y: shapeCoordinate,
});

/** A length of a shape, such as a radius of an arc, in composition pixels (D73). */
const shapeLength = {
  type: 'number',
  description: 'A length in composition pixels, from 0 (D73).',
  minimum: 0,
  maximum: 1_000_000,
} as const satisfies NumberSchema;

const moveCommandSchema = closedObject(
  'Starts a new subpath at the point x, y without drawing (SVG M, D73).',
  { kind: { type: 'string', const: 'move' }, x: shapeCoordinate, y: shapeCoordinate },
);

const lineCommandSchema = closedObject(
  'A straight line from the current point to x, y (SVG L, D73).',
  { kind: { type: 'string', const: 'line' }, x: shapeCoordinate, y: shapeCoordinate },
);

const cubicCommandSchema = closedObject(
  'A cubic Bézier curve from the current point to x, y, with the control points x1, y1 and x2, y2 (SVG C, D73).',
  {
    kind: { type: 'string', const: 'cubic' },
    x1: shapeCoordinate,
    y1: shapeCoordinate,
    x2: shapeCoordinate,
    y2: shapeCoordinate,
    x: shapeCoordinate,
    y: shapeCoordinate,
  },
);

const quadraticCommandSchema = closedObject(
  'A quadratic Bézier curve from the current point to x, y, with the control point x1, y1 (SVG Q, D73).',
  {
    kind: { type: 'string', const: 'quadratic' },
    x1: shapeCoordinate,
    y1: shapeCoordinate,
    x: shapeCoordinate,
    y: shapeCoordinate,
  },
);

const arcCommandSchema = closedObject(
  'An elliptical arc from the current point to x, y, of radii rx and ry, its axes turned by rotation degrees; largeArc and sweep choose one of the four arcs as SVG A does (D73).',
  {
    kind: { type: 'string', const: 'arc' },
    rx: shapeLength,
    ry: shapeLength,
    rotation: {
      type: 'number',
      description: 'Degrees the axes of the ellipse are turned by, positive clockwise (D73).',
      minimum: -360,
      maximum: 360,
    },
    largeArc: { type: 'boolean', description: 'The arc of more than 180 degrees (D73).' },
    sweep: { type: 'boolean', description: 'The arc drawn clockwise (D73).' },
    x: shapeCoordinate,
    y: shapeCoordinate,
  },
);

const closeCommandSchema = closedObject(
  'A straight line back to the start of the subpath, which closes it (SVG Z, D73).',
  { kind: { type: 'string', const: 'close' } },
);

/** One command of a path, absolute (D73). */
const pathCommandSchema = {
  description:
    'One command of a path, in absolute coordinates of the node box: move, line, cubic, quadratic, arc, or close; the commands of SVG path data in a parsed form, without relative or shorthand commands (D73).',
  oneOf: [
    moveCommandSchema,
    lineCommandSchema,
    cubicCommandSchema,
    quadraticCommandSchema,
    arcCommandSchema,
    closeCommandSchema,
  ],
} as const satisfies UnionSchema;

const rectGeometrySchema = closedObject(
  "A rectangle that fills the node's box, its corners rounded by cornerRadius composition pixels; a radius above half a side is reduced to it. Its stroke starts at the top edge, where the rounding of the top-left corner ends, and runs clockwise (D73).",
  {
    kind: { type: 'string', const: 'rect' },
    cornerRadius: shapeLength,
  },
);

const ellipseGeometrySchema = closedObject(
  "An ellipse that fills the node's box. Its stroke starts at its rightmost point and runs clockwise (D73).",
  { kind: { type: 'string', const: 'ellipse' } },
);

const polygonGeometrySchema = closedObject(
  'A closed polygon through its points in their order, at least 3; its stroke starts at the first point (D73).',
  {
    kind: { type: 'string', const: 'polygon' },
    points: { type: 'array', minItems: 3, maxItems: 1000, items: shapePoint },
  },
);

const pathGeometrySchema = closedObject(
  'A path of absolute commands, the first a move; fillRule says which areas a path that crosses itself fills, as SVG fill-rule (D73).',
  {
    kind: { type: 'string', const: 'path' },
    fillRule: {
      type: 'string',
      description: 'nonzero fills every area the path winds around; evenodd leaves holes (D73).',
      enum: ['nonzero', 'evenodd'],
    },
    commands: { type: 'array', minItems: 1, maxItems: 1000, items: pathCommandSchema },
  },
);

/** The geometry of a shape, in composition pixels of the node's box (D73). */
const shapeGeometrySchema = {
  description:
    "What a shape draws, in composition pixels of the node's box: a rect or an ellipse fills the box and follows its size, a polygon and a path lie at their own coordinates, which may leave the box (D73).",
  oneOf: [rectGeometrySchema, ellipseGeometrySchema, polygonGeometrySchema, pathGeometrySchema],
} as const satisfies UnionSchema;

/** One stop of a gradient (D73). */
const gradientStop = closedObject(
  'A colour of a gradient at offset per mille of its length, from 0 at its start to 1000 at its end, with an opacity from 0 to 1; stops are in ascending order of offset, two may share one (D73).',
  { offset: permille, color, opacity },
);

const gradientStops = {
  type: 'array',
  description:
    'At least two stops, ascending in offset; before the first and after the last the nearest colour holds (D73).',
  minItems: 2,
  maxItems: 16,
  items: gradientStop,
} as const satisfies ArraySchema;

const noFillSchema = closedObject('The shape is not filled (D73).', {
  kind: { type: 'string', const: 'none' },
});

const solidFillSchema = closedObject('The shape is filled with one colour (D73).', {
  kind: { type: 'string', const: 'solid' },
  color,
});

const linearGradientFillSchema = closedObject(
  "The shape is filled with a linear gradient from the point start to the point end, in composition pixels of the node's box (D73).",
  {
    kind: { type: 'string', const: 'linear-gradient' },
    start: shapePoint,
    end: shapePoint,
    stops: gradientStops,
  },
);

const radialGradientFillSchema = closedObject(
  "The shape is filled with a radial gradient about the point center, of radius composition pixels, in the node's box (D73).",
  {
    kind: { type: 'string', const: 'radial-gradient' },
    center: shapePoint,
    radius: { ...shapeLength, minimum: 1 },
    stops: gradientStops,
  },
);

/** What a shape is filled with (D73). */
const shapeFillSchema = {
  description:
    'What the inside of the shape is painted with: nothing, one colour, or a linear or radial gradient (D73).',
  oneOf: [noFillSchema, solidFillSchema, linearGradientFillSchema, radialGradientFillSchema],
} as const satisfies UnionSchema;

/** The width of a stroke, in composition pixels (D73). */
const strokeWidth = {
  type: 'number',
  description:
    'Width of the stroke in composition pixels, centred on the outline; 0 draws no stroke (D73).',
  minimum: 0,
  maximum: 1000,
} as const satisfies NumberSchema;

/** The outline of a shape (D73). */
const shapeStrokeSchema = closedObject(
  'The outline of the shape: its colour and width, its dashes in per mille of the length of the outline, and its caps and joins as SVG draws them (D73).',
  {
    color,
    width: strokeWidth,
    dash: {
      type: 'array',
      description:
        'Lengths of dashes and gaps in turn, in per mille of the length of the whole outline, repeated from its start; an even number of them, [] for a solid stroke (D73).',
      maxItems: 16,
      items: {
        type: 'integer',
        description: 'A dash or a gap, in per mille of the length of the outline (D73).',
        minimum: 1,
        maximum: 1000,
      },
    },
    cap: {
      type: 'string',
      description: 'The ends of open subpaths and dashes, as SVG stroke-linecap (D73).',
      enum: ['butt', 'round', 'square'],
    },
    join: {
      type: 'string',
      description:
        'The corners of the outline, as SVG stroke-linejoin, a miter limited to 4 (D73).',
      enum: ['miter', 'round', 'bevel'],
    },
  },
);

/** The part of the outline that is drawn (D73). */
const shapeTrimSchema = closedObject(
  'The part of the outline the stroke draws, from start to end per mille of its length, measured by the browser as pathLength 1000 so that no length is computed; 0 and 1000 is the whole outline, and an end at or before the start draws nothing. The fill is not trimmed (D73).',
  { start: permille, end: permille },
);

const strokeColorAnimationSchema = animation(
  'stroke/color',
  "Colours that replace the colour of the shape's stroke: each channel moves on its own and is rounded to an integer (D65.1, D73).",
  color,
);

const fillAnimationSchema = animation(
  'fill',
  "Colours that replace the colour of a shape's solid fill: each channel moves on its own and is rounded to an integer (D65.1, D73).",
  color,
);

const strokeWidthAnimationSchema = animation(
  'stroke/width',
  "Widths in composition pixels that replace the width of the shape's stroke (D65.1, D73).",
  strokeWidth,
);

const trimStartAnimationSchema = animation(
  'trim/start',
  'Per mille that replace where the drawn part of the outline starts (D65.1, D73).',
  permille,
);

const trimEndAnimationSchema = animation(
  'trim/end',
  'Per mille that replace where the drawn part of the outline ends (D65.1, D73).',
  permille,
);

const geometryAnimationSchema = animation(
  'geometry',
  "Geometries that replace the shape's own: every keyframe has the structure of the shape's geometry (its kind, the number of its points, its commands in the same order, the same arc flags), and every number moves on its own, so that a path morphs into another (D65.1, D73).",
  shapeGeometrySchema,
);

/**
 * Every animation of the table of D65.1 that schema 0.13 has: a transform row
 * modifies its base value (offset or factor), every other row replaces it
 * (D16.6 as amended by D68).
 */
export const animationSchema = {
  description:
    'An animation of one property of the node that owns it: position, rotation, and origin are offsets added to the base value, scale and opacity factors multiplied with it, and size, color, crop, cornerRadius, and the fill, stroke/color, stroke/width, trim/start, trim/end, and geometry of a shape values that replace it (D16.6, D65.1, D68, D73).',
  oneOf: [
    opacityAnimationSchema,
    positionAnimationSchema,
    scaleAnimationSchema,
    rotationAnimationSchema,
    originAnimationSchema,
    sizeAnimationSchema,
    colorAnimationSchema,
    cropAnimationSchema,
    cornerRadiusAnimationSchema,
    fillAnimationSchema,
    strokeColorAnimationSchema,
    strokeWidthAnimationSchema,
    trimStartAnimationSchema,
    trimEndAnimationSchema,
    geometryAnimationSchema,
  ],
} as const satisfies UnionSchema;

const TRANSFORM_ANIMATIONS = [
  opacityAnimationSchema,
  positionAnimationSchema,
  scaleAnimationSchema,
  rotationAnimationSchema,
  originAnimationSchema,
] as const;

/** The animations a node type may have: the rows of D65.1 that name it. */
function animations<const S extends readonly ObjectSchema[]>(rows: S) {
  return {
    type: 'array',
    description:
      'At most one animation per property; the node type decides which properties (D65.1).',
    items: { oneOf: rows },
  } as const satisfies ArraySchema;
}

function transform<const S extends readonly ObjectSchema[]>(rows: S) {
  return { position, scale, rotation, origin, opacity, animations: animations(rows) } as const;
}

/** A group, a Custom HTML element: the transform rows only. */
const plainTransform = transform(TRANSFORM_ANIMATIONS);

/** A text, captions: the transform rows and the colour. */
const coloredTransform = transform([...TRANSFORM_ANIMATIONS, colorAnimationSchema] as const);

/** An image or a video: the transform rows, size, crop, and corner radius. */
const pictureTransform = transform([
  ...TRANSFORM_ANIMATIONS,
  sizeAnimationSchema,
  cropAnimationSchema,
  cornerRadiusAnimationSchema,
] as const);

/** A shape: the transform rows, size, and the rows of its fill, stroke, trim, and geometry (D73). */
const shapeTransform = transform([
  ...TRANSFORM_ANIMATIONS,
  sizeAnimationSchema,
  fillAnimationSchema,
  strokeColorAnimationSchema,
  strokeWidthAnimationSchema,
  trimStartAnimationSchema,
  trimEndAnimationSchema,
  geometryAnimationSchema,
] as const);

/** A length of a blur, in composition pixels (D71). */
const blurLength = {
  type: 'number',
  description: 'Length in composition pixels, from 0 to 1000; fractions are allowed (D71).',
  minimum: 0,
  maximum: 1000,
} as const satisfies NumberSchema;

/** A factor of brightness, contrast, or saturation: 1 leaves the pixels as they are (D71). */
const effectFactor = {
  type: 'number',
  description:
    'Factor from 0 to 10: 1 leaves the pixels as they are, below 1 lessens and above 1 strengthens (D71).',
  minimum: 0,
  maximum: 10,
} as const satisfies NumberSchema;

/** How much of a conversion is applied: 0 none, 1 all of it (D71). */
const effectAmount = {
  type: 'number',
  description: 'How much of the conversion applies, from 0 (none) to 1 (all of it) (D71).',
  minimum: 0,
  maximum: 1,
} as const satisfies NumberSchema;

/** A turn of the hue, in degrees (D71). */
const hueAngle = {
  type: 'number',
  description:
    'Degrees the hue of every pixel turns around the colour wheel; a whole number of turns changes nothing, several turns are allowed (D71).',
  minimum: -360_000,
  maximum: 360_000,
} as const satisfies NumberSchema;

/** One coordinate of the offset of a drop shadow, in composition pixels (D71). */
const effectOffsetCoordinate = {
  type: 'number',
  description:
    'Offset in composition pixels, from -1000 to 1000; x grows right, y grows down; fractions are allowed (D71).',
  minimum: -1000,
  maximum: 1000,
} as const satisfies NumberSchema;

const effectOffset = closedObject('How far the shadow lies from what casts it (D71).', {
  x: effectOffsetCoordinate,
  y: effectOffsetCoordinate,
});

const effectAnimations = <const S extends readonly ObjectSchema[]>(rows: S) =>
  ({
    type: 'array',
    description:
      "Animations of the effect's parameters, at most one per parameter; a sampled value replaces the parameter's own, in the time of the scene, like a keyframe of the node (D65.1, D71).",
    items: { oneOf: rows },
  }) as const satisfies ArraySchema;

const effectAnimation = <const N extends string, const V extends JsonSchema>(
  parameter: N,
  value: V,
) =>
  animation(
    parameter,
    `Values of the parameter ${parameter} that replace the effect's own while the animation is sampled (D65.1, D71).`,
    value,
  );

const blurEffectSchema = closedObject(
  'Blurs what it applies to by a Gaussian of standard deviation radius, as CSS blur(); the blur spills beyond the box. 0 blurs nothing (D71).',
  {
    id,
    kind: { type: 'string', const: 'blur' },
    radius: {
      ...blurLength,
      description:
        'The standard deviation of the Gaussian, in composition pixels, from 0 to 1000 (D71).',
    },
    animations: effectAnimations([effectAnimation('radius', blurLength)] as const),
  },
);

const brightnessEffectSchema = closedObject(
  'Multiplies every colour channel by amount, as CSS brightness(); 1 changes nothing, 0 is black (D71).',
  {
    id,
    kind: { type: 'string', const: 'brightness' },
    amount: effectFactor,
    animations: effectAnimations([effectAnimation('amount', effectFactor)] as const),
  },
);

const contrastEffectSchema = closedObject(
  'Moves every colour channel away from or towards the middle grey by amount, as CSS contrast(); 1 changes nothing, 0 is grey (D71).',
  {
    id,
    kind: { type: 'string', const: 'contrast' },
    amount: effectFactor,
    animations: effectAnimations([effectAnimation('amount', effectFactor)] as const),
  },
);

const saturateEffectSchema = closedObject(
  'Scales the saturation of every pixel by amount, as CSS saturate(); 1 changes nothing, 0 is grey (D71).',
  {
    id,
    kind: { type: 'string', const: 'saturate' },
    amount: effectFactor,
    animations: effectAnimations([effectAnimation('amount', effectFactor)] as const),
  },
);

const hueRotateEffectSchema = closedObject(
  'Turns the hue of every pixel by angle degrees, as CSS hue-rotate(); 0 changes nothing (D71).',
  {
    id,
    kind: { type: 'string', const: 'hue-rotate' },
    angle: hueAngle,
    animations: effectAnimations([effectAnimation('angle', hueAngle)] as const),
  },
);

const grayscaleEffectSchema = closedObject(
  'Turns every pixel towards its grey by amount, as CSS grayscale(); 0 changes nothing, 1 is all grey (D71).',
  {
    id,
    kind: { type: 'string', const: 'grayscale' },
    amount: effectAmount,
    animations: effectAnimations([effectAnimation('amount', effectAmount)] as const),
  },
);

const invertEffectSchema = closedObject(
  'Turns every colour channel towards its inverse by amount, as CSS invert(); 0 changes nothing, 1 is the negative (D71).',
  {
    id,
    kind: { type: 'string', const: 'invert' },
    amount: effectAmount,
    animations: effectAnimations([effectAnimation('amount', effectAmount)] as const),
  },
);

const sepiaEffectSchema = closedObject(
  'Turns every pixel towards its sepia tone by amount, as CSS sepia(); 0 changes nothing, 1 is all sepia (D71).',
  {
    id,
    kind: { type: 'string', const: 'sepia' },
    amount: effectAmount,
    animations: effectAnimations([effectAnimation('amount', effectAmount)] as const),
  },
);

const effectOpacity = {
  ...opacity,
  description: 'Opacity of the colour of the shadow, from 0 (transparent) to 1 (opaque) (D71).',
} as const satisfies NumberSchema;

const dropShadowEffectSchema = closedObject(
  'A shadow of the shape of what it applies to, its alpha in color, moved by offset and blurred by blur, drawn under it, as CSS drop-shadow() (D71).',
  {
    id,
    kind: { type: 'string', const: 'drop-shadow' },
    color,
    opacity: effectOpacity,
    offset: effectOffset,
    blur: {
      ...blurLength,
      description:
        'The blur radius of the shadow, in composition pixels, from 0 (sharp) to 1000, as the blur of CSS drop-shadow(): twice the standard deviation (D71).',
    },
    animations: effectAnimations([
      effectAnimation('color', color),
      effectAnimation('opacity', effectOpacity),
      effectAnimation('offset', effectOffset),
      effectAnimation('blur', blurLength),
    ] as const),
  },
);

/** One value of a curve: an output level from 0 (none) to 1 (full) (D72). */
const curveLevel = {
  type: 'number',
  description: 'An output level of the channel, from 0 (none) to 1 (full) (D72).',
  minimum: 0,
  maximum: 1,
} as const satisfies NumberSchema;

/** The curve of one colour channel as a table, as SVG feFuncR, feFuncG, and feFuncB of type table (D72). */
const curveTable = (channel: string) =>
  ({
    type: 'array',
    description: `The curve of the ${channel} channel: 2 to 32 output levels at evenly spaced input levels from 0 to 1, joined by straight lines, as an SVG table transfer; [0, 1] changes nothing (D72).`,
    minItems: 2,
    maxItems: 32,
    items: curveLevel,
  }) as const satisfies ArraySchema;

const curvesEffectSchema = closedObject(
  'Maps every level of the red, green, and blue channels through a curve of its own, then mixes the result with the pixels it was given by amount (D72).',
  {
    id,
    kind: { type: 'string', const: 'curves' },
    red: curveTable('red'),
    green: curveTable('green'),
    blue: curveTable('blue'),
    amount: {
      ...effectAmount,
      description:
        'How much of the curves applies, from 0 (none) to 1 (all of it); the curves themselves are not animated (D72).',
    },
    animations: effectAnimations([effectAnimation('amount', effectAmount)] as const),
  },
);

/** The black level of a colour grade (D72). */
const gradeLift = {
  type: 'number',
  description:
    'The level black is lifted to, from -1 to 1: 0 changes nothing, above 0 greys the shadows, below 0 crushes them (D72).',
  minimum: -1,
  maximum: 1,
} as const satisfies NumberSchema;

/** The mid-tones of a colour grade (D72). */
const gradeGamma = {
  type: 'number',
  description:
    'The gamma of the mid-tones, from 0.1 to 10: 1 changes nothing, above 1 brightens them, below 1 darkens them (D72).',
  minimum: 0.1,
  maximum: 10,
} as const satisfies NumberSchema;

/** The white level of a colour grade (D72). */
const gradeGain = {
  type: 'number',
  description:
    'The level white is scaled to, from 0 to 10: 1 changes nothing, above 1 brightens the highlights, below 1 dims them (D72).',
  minimum: 0,
  maximum: 10,
} as const satisfies NumberSchema;

/** One axis of the white balance of a colour grade (D72). */
const gradeBalance = (axis: string) =>
  ({
    type: 'number',
    description: `${axis}, from -1 to 1; 0 changes nothing (D72).`,
    minimum: -1,
    maximum: 1,
  }) as const satisfies NumberSchema;

const gradeTemperature = gradeBalance(
  'The temperature: above 0 warmer (red up by a quarter of it, blue down), below 0 cooler',
);
const gradeTint = gradeBalance(
  'The tint: above 0 towards magenta (green down by a quarter of it), below 0 towards green',
);

const colorGradeEffectSchema = closedObject(
  'A primary colour grade of every channel: the white balance scales it, lift and gain set its black and white levels, and gamma bends its mid-tones; alpha is kept (D72).',
  {
    id,
    kind: { type: 'string', const: 'color-grade' },
    lift: gradeLift,
    gamma: gradeGamma,
    gain: gradeGain,
    temperature: gradeTemperature,
    tint: gradeTint,
    animations: effectAnimations([
      effectAnimation('lift', gradeLift),
      effectAnimation('gamma', gradeGamma),
      effectAnimation('gain', gradeGain),
      effectAnimation('temperature', gradeTemperature),
      effectAnimation('tint', gradeTint),
    ] as const),
  },
);

const glowOpacity = {
  ...opacity,
  description: 'Opacity of the colour of the glow, from 0 (transparent) to 1 (opaque) (D72).',
} as const satisfies NumberSchema;

const glowRadius = {
  ...blurLength,
  description:
    'The standard deviation of the blur of the glow, in composition pixels, from 0 to 1000; the glow spills beyond the box (D72).',
} as const satisfies NumberSchema;

const glowEffectSchema = closedObject(
  'A glow: the shape of what it applies to, blurred by radius and filled with color, drawn under it (D72).',
  {
    id,
    kind: { type: 'string', const: 'glow' },
    color,
    opacity: glowOpacity,
    radius: glowRadius,
    animations: effectAnimations([
      effectAnimation('color', color),
      effectAnimation('opacity', glowOpacity),
      effectAnimation('radius', glowRadius),
    ] as const),
  },
);

const vignetteAmount = {
  ...effectAmount,
  description:
    'How dark the vignette makes the edges, from 0 (not at all) to 1 (its full falloff) (D72).',
} as const satisfies NumberSchema;

const vignetteSize = {
  type: 'number',
  description:
    'How far the bright middle reaches, from 0.05 to 10: the height above the centre of the box of a light whose falloff, to the fourth power, darkens the box, in units of the root mean square of its sides; small is a tight vignette, large a gentle one (D72).',
  minimum: 0.05,
  maximum: 10,
} as const satisfies NumberSchema;

const vignetteEffectSchema = closedObject(
  'Darkens the box of what it applies to towards its edges and corners, its centre untouched; alpha is kept (D72).',
  {
    id,
    kind: { type: 'string', const: 'vignette' },
    amount: vignetteAmount,
    size: vignetteSize,
    animations: effectAnimations([
      effectAnimation('amount', vignetteAmount),
      effectAnimation('size', vignetteSize),
    ] as const),
  },
);

const keyTolerance = {
  ...effectAmount,
  description:
    'How far the key channel must exceed the mean of the other two before a pixel starts to turn transparent, from 0 to 1 (D72).',
} as const satisfies NumberSchema;

const keySoftness = {
  type: 'number',
  description:
    'Over how much more of that excess a pixel goes from opaque to transparent, from 0.01 (a hard edge) to 1 (D72).',
  minimum: 0.01,
  maximum: 1,
} as const satisfies NumberSchema;

const keySpill = {
  ...effectAmount,
  description:
    'How much of the key channel is pulled towards the mean of the other two in what remains, from 0 (none) to 1 (all of it) (D72).',
} as const satisfies NumberSchema;

const chromaKeyEffectSchema = closedObject(
  'A key by channel difference: a pixel turns transparent as its key channel exceeds the mean of the other two by more than tolerance, over softness; spill pulls the key colour out of what remains (D72).',
  {
    id,
    kind: { type: 'string', const: 'chroma-key' },
    key: {
      type: 'string',
      description: 'The channel of the screen: green or blue (D72).',
      enum: ['green', 'blue'],
    },
    tolerance: keyTolerance,
    softness: keySoftness,
    spill: keySpill,
    animations: effectAnimations([
      effectAnimation('tolerance', keyTolerance),
      effectAnimation('softness', keySoftness),
      effectAnimation('spill', keySpill),
    ] as const),
  },
);

const effectSchemaValue = {
  description:
    'One effect: a filter of the pixels of what holds it, applied after its content and its corner radius and before its opacity and transform; effects apply in the order of their list (D65.6, D71, D72).',
  oneOf: [
    blurEffectSchema,
    brightnessEffectSchema,
    contrastEffectSchema,
    saturateEffectSchema,
    hueRotateEffectSchema,
    grayscaleEffectSchema,
    invertEffectSchema,
    sepiaEffectSchema,
    dropShadowEffectSchema,
    curvesEffectSchema,
    colorGradeEffectSchema,
    glowEffectSchema,
    vignetteEffectSchema,
    chromaKeyEffectSchema,
  ],
} as const satisfies UnionSchema;

/**
 * The type of `effectSchema`, named so that the declarations of the schemas
 * that hold effects refer to it instead of spelling it out at every holder.
 *
 * An interface, not an alias: an alias would be spelled out again and pass the
 * limit of TypeScript on the length of an inferred type (TS7056).
 */
interface EffectSchema extends EffectSchemaValue {
  readonly oneOf: EffectSchemaValue['oneOf'];
}
type EffectSchemaValue = typeof effectSchemaValue;

/** One effect of a node, a group, or a scene: a CSS or an SVG filter the probes found exact (D65.5, D71, D72). */
const effectSchema: EffectSchema = effectSchemaValue;

/** The effects of a node, a group, or a scene, in the order they apply (D71). */
const effects = {
  type: 'array',
  description:
    'Effects in the order they apply, the first to the content itself; none leaves the pixels exactly as they are. Any effect, even one whose values change nothing, draws its holder in a pass of its own, which may move a channel by a few levels (D65.5, D71).',
  items: effectSchema,
} as const satisfies ArraySchema;

/** How a node blends with what lies below it, as CSS mix-blend-mode; every value was probed exact (D65, D75). */
const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
] as const;

const blendMode = {
  type: 'string',
  description:
    'How the node, once drawn, meets what lies below it in its scene or group, as CSS mix-blend-mode: normal lays it over, the others blend each pixel with the pixel below. A scene or a group holding a node that blends is composited on its own, so nothing outside it is blended (D75).',
  enum: BLEND_MODES,
} as const satisfies StringSchema;

/** The box of a mask in the node's own coordinates, before its transform (D75). */
const maskBox = {
  x: {
    ...coordinate,
    description:
      "Left edge of the mask's box, in composition pixels from the top-left corner of the node's box, before the node's transform (D75).",
  },
  y: {
    ...coordinate,
    description:
      "Top edge of the mask's box, in composition pixels from the top-left corner of the node's box, before the node's transform (D75).",
  },
  width: { ...length, description: "Width of the mask's box, in composition pixels (D75)." },
  height: { ...length, description: "Height of the mask's box, in composition pixels (D75)." },
} as const;

const maskInverted = {
  type: 'boolean',
  description:
    'false shows the node where the mask covers it; true shows it where the mask does not, out to 4 000 000 pixels about the node (D75).',
} as const satisfies BooleanSchema;

const feather = {
  ...blurLength,
  description:
    "How soft the mask's edge is: the standard deviation of a Gaussian blur of the mask, in composition pixels, from 0 (a hard edge) to 1000 (D75).",
} as const;

const maskAnimation = <const N extends string, const V extends JsonSchema>(
  property: N,
  value: V,
  description: string,
) => animation(property, description, value);

const noMaskSchema = closedObject('The node is not masked (D75).', {
  kind: { type: 'string', const: 'none' },
});

const shapeMaskSchema = closedObject(
  "The node is shown only inside a shape: a geometry of D73 drawn in the mask's box, which moves, scales, and turns with the node. A rect or an ellipse fills the box; polygon and path points are in pixels of the box (D73, D75).",
  {
    kind: { type: 'string', const: 'shape' },
    ...maskBox,
    geometry: shapeGeometrySchema,
    inverted: maskInverted,
    feather,
    animations: {
      type: 'array',
      description:
        "Animations of the mask's geometry and feather, at most one each, in the time of the scene; a sampled value replaces the mask's own. Every geometry keyframe has the structure of the mask's geometry (D65.1, D73, D75).",
      items: {
        oneOf: [
          maskAnimation(
            'geometry',
            shapeGeometrySchema,
            "Geometries that replace the mask's own, morphed number by number as a shape's are (D73, D75).",
          ),
          maskAnimation(
            'feather',
            blurLength,
            "Values of the feather that replace the mask's own (D75).",
          ),
        ],
      },
    },
  },
);

const imageMaskSchema = closedObject(
  "The node is shown through an image asset stretched over the mask's box, which moves, scales, and turns with the node: by the image's alpha, or by its luminance times its alpha. Outside the box the mask is empty (D75).",
  {
    kind: { type: 'string', const: 'image' },
    assetId: {
      ...assetReference,
      description: 'ID of an image asset; an svg asset is not a mask (D75).',
    },
    ...maskBox,
    mode: {
      type: 'string',
      description:
        "alpha takes the image's opacity; luminance takes its brightness times its opacity, so white shows the node and black hides it (D75).",
      enum: ['alpha', 'luminance'],
    },
    inverted: maskInverted,
    feather,
    animations: {
      type: 'array',
      description:
        "Animations of the mask's feather, at most one, in the time of the scene; a sampled value replaces the mask's own (D65.1, D75).",
      items: {
        oneOf: [
          maskAnimation(
            'feather',
            blurLength,
            "Values of the feather that replace the mask's own (D75).",
          ),
        ],
      },
    },
  },
);

/** What masks a node: nothing, a shape, or an image (D65.6, D75). */
const maskSchema = {
  description:
    'What masks the node, applied after its effects and before its matte, opacity, transform, and blend mode (D65.6, D75).',
  oneOf: [noMaskSchema, shapeMaskSchema, imageMaskSchema],
} as const satisfies UnionSchema;

const noMatteSchema = closedObject('The node takes no matte (D75).', {
  kind: { type: 'string', const: 'none' },
});

const nodeMatteSchema = closedObject(
  "The node is shown through a sibling shape node, its matte, as an editor's track matte: the matte is drawn where it is, with its own transform, lifetime, opacity, and effects, into the mask of this node, and is not drawn by itself. While the matte is not active it covers nothing (D75).",
  {
    kind: { type: 'string', const: 'node' },
    nodeId: {
      type: 'string',
      description:
        'ID of a shape node with the same parent (the scene or the group), other than this node, that has no matte itself (D75).',
      pattern: '^[A-Za-z0-9_-]+$',
    },
    mode: {
      type: 'string',
      description:
        'alpha shows the node where the matte is opaque; luminance where it is bright and opaque; the inverted modes the opposite (D75).',
      enum: ['alpha', 'alpha-inverted', 'luminance', 'luminance-inverted'],
    },
  },
);

/** Which sibling, if any, mattes a node (D75). */
const matteSchema = {
  description:
    'A sibling shape node that mattes the node, applied after its mask, in the space of its parent (D65.6, D75).',
  oneOf: [noMatteSchema, nodeMatteSchema],
} as const satisfies UnionSchema;

/** The keys of D75 that every image, video, text, captions, shape, and group carries after its effects. */
const compositing = { mask: maskSchema, matte: matteSchema, blendMode } as const;

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

const backgroundNodeSchema = closedObject('Solid fill that covers the whole canvas.', {
  id,
  type: { type: 'string', const: 'background' },
  ...lifetime,
  color,
  animations: animations([colorAnimationSchema] as const),
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
    'How the picture meets the box: fill stretches it to the box, contain shows all of it inside the box, cover fills the box and crops; contain and cover keep the aspect ratio and place the picture by its focus (D50, D63).',
  enum: ['fill', 'contain', 'cover'],
} as const satisfies StringSchema;

/** One coordinate of a focus point, in per mille of the side of the picture (D63.1). */
const focusCoordinate = {
  type: 'integer',
  description:
    'Per mille of the side of the picture, from 0 at its left or top edge to 1000 at its right or bottom edge (D63.1).',
  minimum: 0,
  maximum: 1000,
} as const satisfies NumberSchema;

/** Which point of the picture `fit` keeps in place, as CSS `object-position` (D63). */
const focus = closedObject(
  'The point of the picture that stays in the box: the point at x per mille of its width and y per mille of its height lies at the same fraction of the width and height of the box. It chooses what cover crops and where contain leaves its bars; under fill the picture is the box, so it changes nothing. 500, 500 is the centre (D63).',
  {
    x: focusCoordinate,
    y: focusCoordinate,
  },
);

const imageNodeSchema = closedObject(
  'An image asset, or an SVG asset shown as an image (D74), fitted to the box of the node.',
  {
    id,
    type: { type: 'string', const: 'image' },
    ...lifetime,
    ...pictureTransform,
    assetId: assetReference,
    width: length,
    height: length,
    fit,
    focus,
    crop,
    cornerRadius,
    effects,
    ...compositing,
  },
);

const videoNodeSchema = closedObject(
  'A video asset: at each instant of its lifetime the source frame of D49.5, fitted to the box of the node, and, at a volume above 0, the sound of its source at the same source time (D50, D52).',
  {
    id,
    type: { type: 'string', const: 'video' },
    ...lifetime,
    ...pictureTransform,
    assetId: assetReference,
    sourceStartUs: {
      ...timeUs,
      description:
        'Source time, in integer microseconds from the presentation time of the first frame, shown at startUs; speed is 1 (D49.1, D49.5).',
    },
    width: length,
    height: length,
    fit,
    focus,
    crop,
    cornerRadius,
    volume: {
      ...volume,
      description:
        'Linear factor of the amplitude of the sound of the video, from 0 to 1. At 0 the video is silent and its source needs no sound; above 0 it needs exactly one audio stream (D52).',
    },
    effects,
    ...compositing,
  },
);

/** One side of a box, in composition pixels, from 0 (D69). */
const styleLength = {
  type: 'integer',
  description: 'Length in composition pixels, from 0 to 1000 (D69).',
  minimum: 0,
  maximum: 1000,
} as const satisfies NumberSchema;

/** The opacity of a colour of a text style (D69). */
const styleOpacity = {
  ...opacity,
  description:
    'Opacity of the colour, from 0 (transparent) to 1 (opaque); the browser draws it in 256 levels (D69).',
} as const satisfies NumberSchema;

const noStrokeSchema = closedObject('The glyphs have no outline (D69).', {
  kind: { type: 'string', const: 'none' },
});

const outsideStrokeSchema = closedObject(
  'An outline of width pixels drawn outside every glyph and under its fill, so that a thin letter keeps its shape (D69).',
  {
    kind: { type: 'string', const: 'outside' },
    color,
    width: {
      ...styleLength,
      minimum: 1,
      description: 'Width of the outline, in composition pixels, from 1 to 1000 (D69).',
    },
  },
);

const noShadowSchema = closedObject('The glyphs cast no shadow (D69).', {
  kind: { type: 'string', const: 'none' },
});

const shadowOffset = {
  type: 'integer',
  description:
    'Offset of the shadow in composition pixels, from -1000 to 1000; x grows right, y grows down (D69).',
  minimum: -1000,
  maximum: 1000,
} as const satisfies NumberSchema;

const dropShadowSchema = closedObject(
  'A shadow of every glyph and its outline, moved by offset and blurred by blur pixels, as CSS text-shadow (D69).',
  {
    kind: { type: 'string', const: 'drop' },
    color,
    opacity: styleOpacity,
    offset: closedObject('How far the shadow lies from the glyphs (D69).', {
      x: shadowOffset,
      y: shadowOffset,
    }),
    blur: {
      ...styleLength,
      description:
        'Blur radius of the shadow, in composition pixels, from 0 (sharp) to 1000 (D69).',
    },
  },
);

const noBoxSchema = closedObject('No box behind the text (D69).', {
  kind: { type: 'string', const: 'none' },
});

const solidBoxSchema = closedObject(
  'A filled box behind the text: the box of its lines grown by padding on every side, with rounded corners. It does not move the text, and the origin of the node stays a point of the box of its lines (D69).',
  {
    kind: { type: 'string', const: 'solid' },
    color,
    opacity: styleOpacity,
    padding: {
      ...styleLength,
      description:
        'How far the box reaches beyond the lines on every side, in composition pixels (D69).',
    },
    cornerRadius: {
      ...styleLength,
      description:
        'Radius of the corners of the box, in composition pixels; a radius above half a side is reduced as CSS does (D69).',
    },
  },
);

/** How a text node is drawn besides its font, size, and colour (D69). */
const textStyleSchema = closedObject(
  'The outline, the shadow, and the box of a text, each of them or none (D69).',
  {
    stroke: { oneOf: [noStrokeSchema, outsideStrokeSchema] },
    shadow: { oneOf: [noShadowSchema, dropShadowSchema] },
    box: { oneOf: [noBoxSchema, solidBoxSchema] },
  },
);

/** A time in the own time of a fragment: 0 is the instant its stagger reaches it (D69). */
const fragmentTimeUs = {
  type: 'integer',
  description:
    "Time in integer microseconds (D04) of the fragment's own time, from 0, the instant the stagger reaches the fragment (D69).",
  minimum: 0,
  maximum: MAX_SAFE_INTEGER,
} as const satisfies NumberSchema;

/** Keyframe times ascend strictly; outside the keyframes the nearest value holds (D16, D69). */
function fragmentTrack<const N extends string, const V extends JsonSchema>(
  property: N,
  description: string,
  value: V,
) {
  return closedObject(description, {
    property: { type: 'string', const: property },
    keyframes: {
      type: 'array',
      minItems: 2,
      items: closedObject(
        "Value of the track at one instant of the fragment's own time, and how it moves from here to the next keyframe; the easing of the last keyframe is never read (D67, D69).",
        { timeUs: fragmentTimeUs, value, easing: easingSchema },
      ),
    },
  });
}

const fragmentOpacityTrackSchema = fragmentTrack(
  'opacity',
  "Factors multiplied with the fragment's opacity, 1 (D69).",
  opacity,
);

const fragmentOffsetTrackSchema = fragmentTrack(
  'offset',
  'Offsets in composition pixels by which the fragment is moved from its place in the text (D69).',
  position,
);

const fragmentScaleTrackSchema = fragmentTrack(
  'scale',
  "Factors of the fragment's size about its centre (D69).",
  scale,
);

const fragmentRotationTrackSchema = fragmentTrack(
  'rotation',
  'Degrees the fragment turns about its centre, positive clockwise (D69).',
  rotation,
);

const fragmentColorTrackSchema = fragmentTrack(
  'color',
  "Colours that replace the colour of the fragment's glyphs; each channel moves on its own and is rounded to an integer (D68, D69).",
  color,
);

/** The tracks of a fragment animation: the rows `fragment/…` of D65.1 (D69). */
const fragmentTrackSchema = {
  description:
    "One property of every fragment, in the fragment's own time: opacity and scale are factors, offset and rotation are added, and color replaces the text's colour (D65.1, D69).",
  oneOf: [
    fragmentOpacityTrackSchema,
    fragmentOffsetTrackSchema,
    fragmentScaleTrackSchema,
    fragmentRotationTrackSchema,
    fragmentColorTrackSchema,
  ],
} as const satisfies UnionSchema;

const inPhaseSchema = closedObject(
  "The first fragment starts its own time at the node's startUs (D69).",
  { kind: { type: 'string', const: 'in' } },
);

const outPhaseSchema = closedObject(
  "The last fragment ends its own time, at its last keyframe, at the end of the node's lifetime (D69).",
  { kind: { type: 'string', const: 'out' } },
);

const accentPhaseSchema = closedObject('The first fragment starts its own time at startUs (D69).', {
  kind: { type: 'string', const: 'accent' },
  startUs: {
    ...timeUs,
    description:
      'Scene time, in integer microseconds, at which the first fragment starts its own time; it moves with the node like a keyframe (D55.3, D69).',
  },
});

const forwardOrderSchema = closedObject('From the first fragment to the last (D69).', {
  kind: { type: 'string', const: 'forward' },
});

const backwardOrderSchema = closedObject('From the last fragment to the first (D69).', {
  kind: { type: 'string', const: 'backward' },
});

const centerOrderSchema = closedObject(
  'From the middle outwards: the fragments as far from the middle start together (D69).',
  { kind: { type: 'string', const: 'center' } },
);

const edgesOrderSchema = closedObject(
  'From both ends inwards: the fragments as far from the ends start together (D69).',
  { kind: { type: 'string', const: 'edges' } },
);

const randomOrderSchema = closedObject(
  'In an order shuffled by the pseudo-random generator of D69 from seed: the same seed and text give the same order everywhere (D69).',
  {
    kind: { type: 'string', const: 'random' },
    seed: {
      type: 'integer',
      description: 'The seed of the generator, an unsigned 32-bit integer (D69).',
      minimum: 0,
      maximum: 4_294_967_295,
    },
  },
);

/** An animation of the letters, words, or lines of a text node, one after another (D65.3, D69). */
const textAnimationSchema = closedObject(
  "Animates every letter, word, or line of the text with the same tracks, each fragment staggerUs after the one before it in the order: the fragment's own time starts at the node's start (in), ends at the node's end (out), or starts at a stated time (accent). The text is drawn in fragments for the node's whole lifetime (D65.3, D69).",
  {
    id,
    unit: {
      type: 'string',
      description:
        'What a fragment is: a letter (an extended grapheme cluster of Unicode 17.0), a word (a run without white space), or a line (a line of the text as written that holds a word) (D69).',
      enum: ['letter', 'word', 'line'],
    },
    phase: { oneOf: [inPhaseSchema, outPhaseSchema, accentPhaseSchema] },
    staggerUs: {
      type: 'integer',
      description:
        'Time in integer microseconds (D04) between the starts of two fragments that follow each other in the order (D69).',
      minimum: 0,
      maximum: MAX_SAFE_INTEGER,
    },
    order: {
      oneOf: [
        forwardOrderSchema,
        backwardOrderSchema,
        centerOrderSchema,
        edgesOrderSchema,
        randomOrderSchema,
      ],
    },
    tracks: {
      type: 'array',
      description: 'At least one track, at most one per property (D69).',
      minItems: 1,
      items: fragmentTrackSchema,
    },
  },
);

const textNodeSchema = closedObject('One run of text; line breaks are preserved.', {
  id,
  type: { type: 'string', const: 'text' },
  ...lifetime,
  ...coloredTransform,
  text: { type: 'string' },
  fontAssetId: assetReference,
  fontSize: length,
  color,
  style: textStyleSchema,
  textAnimations: {
    type: 'array',
    description:
      'Animations of the letters, words, or lines of the text, combined in their order: opacities and scales multiply, offsets and rotations add, and the last colour wins (D69).',
    items: textAnimationSchema,
  },
  effects,
  ...compositing,
});

/** One timed word of a caption (D57), in the time of its scene like a keyframe (D55.3). */
const captionWordSchema = closedObject(
  'One word of a transcription: its text, shown from startUs for durationUs in the time of its scene; while it is spoken it carries the highlight (D57).',
  {
    text: {
      type: 'string',
      description:
        'The word as it is shown, at least one character and no white space; words are joined by one space (D57).',
      pattern: '^\\S+$',
    },
    startUs: {
      ...timeUs,
      description:
        'Scene time, in integer microseconds, at which the word is spoken; a word starts no earlier than the word before it ends (D57).',
    },
    durationUs: {
      ...durationUs,
      description: 'How long the word is spoken, in integer microseconds (D57).',
    },
  },
);

/** An underline of the word being spoken, or none (D70). */
const noUnderlineSchema = closedObject('The word being spoken is not underlined (D70).', {
  kind: { type: 'string', const: 'none' },
});

const solidUnderlineSchema = closedObject(
  "A bar under the word being spoken, as wide as the word: thickness pixels tall, its bottom edge offset pixels below the bottom of the word's line box. It moves and scales with the word (D70).",
  {
    kind: { type: 'string', const: 'solid' },
    color,
    thickness: {
      ...styleLength,
      minimum: 1,
      description: 'Height of the bar, in composition pixels, from 1 to 1000 (D70).',
    },
    offset: {
      ...shadowOffset,
      description:
        "How far the bottom edge of the bar lies below the bottom of the word's line box, in composition pixels, from -1000 to 1000; a negative offset lifts it into the word (D70).",
    },
  },
);

/** What the word being spoken shows besides the other words (D57, D70). */
const captionHighlightSchema = closedObject(
  "What the word being spoken shows, from its startUs for its durationUs and at no other time: its colour, a scale about its centre, tracks in the word's own time (a bounce, a pop), an underline, and a box behind it. A scaled or moving word never pushes its neighbours: lines and pages stay those of D57.3 (D70).",
  {
    color: {
      ...color,
      description: 'Colour of the word being spoken, lowercase #rrggbb (D57, D70).',
    },
    scale: {
      ...scaleFactor,
      description:
        'Factor of the size of the word being spoken about its centre, on both axes; 1 leaves it as it is (D70).',
    },
    tracks: {
      type: 'array',
      description:
        'Tracks of the word being spoken in its own time, 0 at its startUs: opacity and scale are factors, offset and rotation are added, and color replaces the highlight colour; at most one per property, none for no motion (D69, D70).',
      items: fragmentTrackSchema,
    },
    underline: { oneOf: [noUnderlineSchema, solidUnderlineSchema] },
    box: { oneOf: [noBoxSchema, solidBoxSchema] },
  },
);

const noPageAnimationSchema = closedObject(
  'A page appears or leaves at once, with no animation (D70).',
  { kind: { type: 'string', const: 'none' } },
);

const pageAnimationSchema = closedObject(
  "Animates every word or line of a page with the same tracks, each fragment staggerUs after the one before it in the order. An entrance starts the first fragment's own time at the start of the page's first word; an exit ends the last fragment's last keyframe at the start of the next page, or, on the last page, at the end of the last word (D69, D70).",
  {
    kind: { type: 'string', const: 'animate' },
    unit: {
      type: 'string',
      description: 'What a fragment is: a word of the page, or a line of the page (D70).',
      enum: ['word', 'line'],
    },
    staggerUs: {
      type: 'integer',
      description:
        'Time in integer microseconds (D04) between the starts of two fragments that follow each other in the order (D69, D70).',
      minimum: 0,
      maximum: MAX_SAFE_INTEGER,
    },
    order: {
      oneOf: [
        forwardOrderSchema,
        backwardOrderSchema,
        centerOrderSchema,
        edgesOrderSchema,
        randomOrderSchema,
      ],
    },
    tracks: {
      type: 'array',
      description: 'At least one track, at most one per property (D69, D70).',
      minItems: 1,
      items: fragmentTrackSchema,
    },
  },
);

/** How a captions node shows its words (D57, D70). */
const captionStyleSchema = closedObject(
  'How the words are shown: their font size, line height, colours, the highlight of the word being spoken, alignment in the box, how many fit on a line and on a page, the outline, shadow, and box of every line, and how a page enters and leaves (D57, D70).',
  {
    fontSize: length,
    lineHeight: {
      ...length,
      description: 'Height of one line, in composition pixels (D57).',
    },
    color,
    highlight: captionHighlightSchema,
    align: {
      type: 'string',
      description: 'Where each line lies across the width of the box (D57).',
      enum: ['left', 'center', 'right'],
    },
    verticalAlign: {
      type: 'string',
      description: 'Where the lines of a page lie along the height of the box (D57).',
      enum: ['top', 'middle', 'bottom'],
    },
    maxLineLength: {
      type: 'integer',
      description:
        'The most characters of one line, counted as Unicode code points with one space between two words; a longer word stands alone on its line (D57).',
      minimum: 1,
      maximum: 1000,
    },
    maxLines: {
      type: 'integer',
      description: 'The most lines of one page (D57).',
      minimum: 1,
      maximum: 100,
    },
    stroke: { oneOf: [noStrokeSchema, outsideStrokeSchema] },
    shadow: { oneOf: [noShadowSchema, dropShadowSchema] },
    box: {
      description:
        'A box behind every line of the page shown: the box of the words of the line grown by padding on every side (D70).',
      oneOf: [noBoxSchema, solidBoxSchema],
    },
    pageIn: { oneOf: [noPageAnimationSchema, pageAnimationSchema] },
    pageOut: { oneOf: [noPageAnimationSchema, pageAnimationSchema] },
  },
);

const captionsNodeSchema = closedObject(
  'Captions from a transcription (D57): the words are broken into lines and the lines into pages by the runtime, from the document alone; a page is shown from its first word until the next page starts, and the word being spoken carries the highlight.',
  {
    id,
    type: { type: 'string', const: 'captions' },
    ...lifetime,
    ...coloredTransform,
    fontAssetId: assetReference,
    width: length,
    height: length,
    style: captionStyleSchema,
    words: {
      type: 'array',
      description: 'The words in the order they are spoken (D57).',
      items: captionWordSchema,
    },
    effects,
    ...compositing,
  },
);

const customHtmlNodeSchema = closedObject(
  'Isolated, capability-limited HTML element (D05). The schema defines no capability.',
  {
    id,
    type: { type: 'string', const: 'custom-html' },
    ...lifetime,
    ...plainTransform,
    width: length,
    height: length,
    html: { type: 'string', description: 'Inline document shown inside the sandbox.' },
  },
);

const shapeNodeSchema = closedObject(
  "A vector shape drawn as inline SVG in the node's box: its geometry, filled and stroked, the stroke drawn from trim.start to trim.end of its length. Its fill lies under its stroke, and neither is cut by the box (D73).",
  {
    id,
    type: { type: 'string', const: 'shape' },
    ...lifetime,
    ...shapeTransform,
    width: length,
    height: length,
    geometry: shapeGeometrySchema,
    fill: shapeFillSchema,
    stroke: shapeStrokeSchema,
    trim: shapeTrimSchema,
    effects,
    ...compositing,
  },
);

const groupNodeSchema = closedObject(
  "Children follow the group's transform; a child is shown only while its group is active too (D42.4). Groups do not nest (D16).",
  {
    id,
    type: { type: 'string', const: 'group' },
    ...lifetime,
    ...plainTransform,
    children: {
      type: 'array',
      description: 'Array order is the z-order; the first child is at the bottom.',
      items: { oneOf: [imageNodeSchema, textNodeSchema, videoNodeSchema, shapeNodeSchema] },
    },
    effects: {
      ...effects,
      description:
        'Effects of the group, applied to its children composited together, in the order they apply; none leaves the pixels exactly as they are (D15, D65.5, D71).',
    },
    ...compositing,
  },
);

const sceneNodeSchema = {
  oneOf: [
    backgroundNodeSchema,
    groupNodeSchema,
    imageNodeSchema,
    textNodeSchema,
    customHtmlNodeSchema,
    videoNodeSchema,
    captionsNodeSchema,
    shapeNodeSchema,
  ],
} as const satisfies UnionSchema;

/**
 * The audio clip of D52, in the time of what holds it: composition time in the
 * composition's `clips`, scene time in a scene's `clips` (D49.3, D54).
 */
const audioClipSchema = closedObject(
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
  description:
    'The direction in which the incoming side moves across the frame, or the edge that uncovers it (D56, D66).',
  enum: ['left', 'right', 'up', 'down'],
} as const satisfies StringSchema;

const crossfadeEffectSchema = closedObject(
  'The incoming side fades in, from transparent to its own opacity, over the outgoing one (D56).',
  { kind: { type: 'string', const: 'crossfade' } },
);

const fadeThroughColorEffectSchema = closedObject(
  'The outgoing side fades out to the colour over the first half, and the incoming side fades in from it over the second half; between two clips the colour covers the frame directly below the lower of them (D56, D66).',
  { kind: { type: 'string', const: 'fade-through-color' }, color },
);

const slideEffectSchema = closedObject(
  'The incoming side slides in over the outgoing one from the edge opposite to its direction; a clip that lies below the outgoing one is uncovered as it slides out instead (D56, D66).',
  { kind: { type: 'string', const: 'slide' }, direction },
);

const wipeEffectSchema = closedObject(
  'An edge travels across the frame in its direction and uncovers the incoming side behind it (D56, D66).',
  { kind: { type: 'string', const: 'wipe' }, direction },
);

const pushEffectSchema = closedObject(
  'The incoming side moves in from the edge opposite to its direction and pushes the outgoing one out across the other edge, both by one frame (D66).',
  { kind: { type: 'string', const: 'push' }, direction },
);

const zoomEffectSchema = closedObject(
  'The incoming side grows or shrinks from fromScale to its own size about the centre of the frame while it fades in (D66).',
  {
    kind: { type: 'string', const: 'zoom' },
    fromScale: {
      type: 'number',
      description:
        'The factor the incoming side starts at, about the centre of the frame: below 1 it grows into place, above 1 it shrinks into place (D66).',
      minimum: 0,
      maximum: 16,
    },
  },
);

/** One coordinate of the centre of an iris, in per mille of the frame's side (D66). */
const irisCoordinate = {
  type: 'integer',
  description: "Per mille of the frame's width (x) or height (y), from its left or top edge (D66).",
  minimum: 0,
  maximum: 1000,
} as const satisfies NumberSchema;

const irisEffectSchema = closedObject(
  'A circle opens from the centre point until the incoming side fills the frame (D66).',
  {
    kind: { type: 'string', const: 'iris' },
    center: closedObject('The point the circle opens from, in per mille of the frame (D66).', {
      x: irisCoordinate,
      y: irisCoordinate,
    }),
  },
);

const blurDissolveEffectSchema = closedObject(
  'The incoming side fades in over the outgoing one while the outgoing side blurs from sharp to radius and the incoming side sharpens from radius (D71).',
  {
    kind: { type: 'string', const: 'blur-dissolve' },
    radius: {
      ...blurLength,
      description:
        'The standard deviation of the strongest blur, in composition pixels, from 0 to 1000, as CSS blur() (D71).',
    },
  },
);

/** How a transition combines the images of its two sides (D56, D66, D71). */
const transitionEffectSchema = {
  description:
    'How the two sides are combined; a pure function of the progress that leaves either side alone at progress 0 and 1 (D49.4, D56, D66).',
  oneOf: [
    crossfadeEffectSchema,
    fadeThroughColorEffectSchema,
    slideEffectSchema,
    wipeEffectSchema,
    pushEffectSchema,
    zoomEffectSchema,
    irisEffectSchema,
    blurDissolveEffectSchema,
  ],
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
const sceneTransitionSchema = closedObject(
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
    effect: transitionEffectSchema,
    easing: {
      ...easingSchema,
      description:
        'How the progress of the effect moves through the overlap; the eased progress is held within 0 and 1, and fade-through-color eases each of its halves (D67).',
    },
  },
);

/**
 * A transition between two clips of one layer (D49.2, D49.4, D56): two
 * siblings whose lifetimes overlap by exactly its duration.
 */
const clipTransitionSchema = closedObject(
  'The overlap of two clips of one layer, siblings of one parent whose lifetimes overlap by exactly durationUs; it adds no time and moves nothing. Its frame is the canvas, in the space of the parent of the two (D49.4, D56, D66).',
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
    effect: transitionEffectSchema,
    easing: {
      ...easingSchema,
      description:
        'How the progress of the effect moves through the overlap; the eased progress is held within 0 and 1, and fade-through-color eases each of its halves (D67).',
    },
  },
);

const sceneSchema = closedObject(
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
        'Transitions between two clips of one layer of this scene; their order has no meaning (D49.4, D56, D66).',
      items: clipTransitionSchema,
    },
    effects: {
      ...effects,
      description:
        'Effects of the whole scene, applied to its nodes composited together and animated in scene time, in the order they apply; a scene transition then acts on the result. None leaves the pixels exactly as they are (D65.5, D71).',
    },
  },
);

const assetSchema = closedObject(
  'Pinned by content hash; the host resolves the bytes and the engine verifies them (D14).',
  {
    id,
    type: {
      type: 'string',
      description:
        'image, audio, font, or video; svg is a drawing of the closed subset of SVG that readSvg accepts, shown by an image node as an image (D14, D50, D74).',
      enum: ['image', 'audio', 'font', 'video', 'svg'],
    },
    contentHash: {
      type: 'string',
      description: 'Algorithm, a colon, and the lowercase hex digest of the exact bytes.',
      pattern: '^sha256:[0-9a-f]{64}$',
    },
  },
);

const contentHash = {
  type: 'string',
  description: 'Algorithm, a colon, and the lowercase hex digest of the exact bytes.',
  pattern: '^sha256:[0-9a-f]{64}$',
} as const satisfies StringSchema;

const textLength = {
  type: 'integer',
  description: 'A number of characters, counted as Unicode code points (D58.1).',
  minimum: 0,
  maximum: 1_000_000,
} as const satisfies NumberSchema;

const numberBound = {
  type: 'number',
  description: 'A bound of a number input, inclusive (D58.1).',
  minimum: -MAX_SAFE_INTEGER,
  maximum: MAX_SAFE_INTEGER,
} as const satisfies NumberSchema;

const fieldKey = {
  type: 'string',
  description:
    'The key of a field of the items of a list input, unique among its fields; the name of the field in a value (D58.1).',
  pattern: '^[A-Za-z0-9_-]+$',
} as const satisfies StringSchema;

const textValue = {
  type: 'string',
  description: 'A text (D58.1).',
} as const satisfies StringSchema;
const numberValue = {
  ...numberBound,
  description: 'A number (D58.1).',
} as const satisfies NumberSchema;
const booleanValue = {
  type: 'boolean',
  description: 'true or false (D58.1).',
} as const satisfies BooleanSchema;
const colorValue = color;
const assetValue = {
  ...contentHash,
  description:
    'The content hash of the bytes of an asset, which the host resolves like those of any asset (D14, D58.1).',
} as const satisfies StringSchema;

const textConstraints = {
  minLength: {
    ...textLength,
    description: 'The fewest characters of a value, code points (D58.1).',
  },
  maxLength: { ...textLength, description: 'The most characters of a value, code points (D58.1).' },
} as const;

const numberConstraints = {
  minimum: { ...numberBound, description: 'The least value, inclusive (D58.1).' },
  maximum: { ...numberBound, description: 'The greatest value, inclusive (D58.1).' },
} as const;

const fieldType = <const T extends string>(type: T) => ({ type: 'string', const: type }) as const;

/** One field of the items of a list input: a key, a type, and its constraints (D58.1). */
const templateFieldSchema = {
  description: 'One field of the items of a list input (D58.1).',
  oneOf: [
    closedObject('A text field, with its least and greatest number of characters (D58.1).', {
      key: fieldKey,
      type: fieldType('text'),
      ...textConstraints,
    }),
    closedObject('A number field, with its least and greatest value (D58.1).', {
      key: fieldKey,
      type: fieldType('number'),
      ...numberConstraints,
    }),
    closedObject('A field that is true or false (D58.1).', {
      key: fieldKey,
      type: fieldType('boolean'),
    }),
    closedObject('A colour field, lowercase #rrggbb (D58.1).', {
      key: fieldKey,
      type: fieldType('color'),
    }),
    closedObject('A field that holds the content hash of an image (D58.1).', {
      key: fieldKey,
      type: fieldType('image'),
    }),
    closedObject('A field that holds the content hash of a video (D58.1).', {
      key: fieldKey,
      type: fieldType('video'),
    }),
    closedObject('A field that holds the content hash of a sound (D58.1).', {
      key: fieldKey,
      type: fieldType('audio'),
    }),
  ],
} as const satisfies UnionSchema;

/** The value of one field of one item of a list, as the document stores a default (D58.1). */
const templateFieldValueSchema = {
  description:
    'The value of one field of one item, tagged with its key and type; an item lists one value for each field, in the order of the fields (D58.1).',
  oneOf: [
    closedObject('The value of a text field of one item (D58.1).', {
      key: fieldKey,
      type: fieldType('text'),
      value: textValue,
    }),
    closedObject('The value of a number field of one item (D58.1).', {
      key: fieldKey,
      type: fieldType('number'),
      value: numberValue,
    }),
    closedObject('The value of a boolean field of one item (D58.1).', {
      key: fieldKey,
      type: fieldType('boolean'),
      value: booleanValue,
    }),
    closedObject('The value of a colour field of one item (D58.1).', {
      key: fieldKey,
      type: fieldType('color'),
      value: colorValue,
    }),
    closedObject('The value of an image field of one item (D58.1).', {
      key: fieldKey,
      type: fieldType('image'),
      value: assetValue,
    }),
    closedObject('The value of a video field of one item (D58.1).', {
      key: fieldKey,
      type: fieldType('video'),
      value: assetValue,
    }),
    closedObject('The value of an audio field of one item (D58.1).', {
      key: fieldKey,
      type: fieldType('audio'),
      value: assetValue,
    }),
  ],
} as const satisfies UnionSchema;

const DEFAULT =
  'The value of the input when the host gives none; every property or asset bound to the input holds it (D58.1, D58.3).';

const listInputSchema = closedObject(
  'A list of items, each an object with the same fields; a repeat makes one copy of its target for each item, and item bindings read their fields (D58.1, D59).',
  {
    id,
    type: fieldType('list'),
    minItems: {
      type: 'integer',
      description: 'The fewest items of a value (D58.1).',
      minimum: 0,
      maximum: 10_000,
    },
    maxItems: {
      type: 'integer',
      description: 'The most items of a value (D58.1).',
      minimum: 0,
      maximum: 10_000,
    },
    fields: {
      type: 'array',
      description: 'The fields of every item, in their order, at least one (D58.1).',
      minItems: 1,
      items: templateFieldSchema,
    },
    default: {
      type: 'array',
      description: 'The items of the input when the host gives none (D58.1).',
      items: {
        type: 'array',
        description: 'One item: a value for each field, in the order of the fields (D58.1).',
        items: templateFieldValueSchema,
      },
    },
  },
);

/** One input of a template: a stable ID, a type, its constraints, and a default (D58.1). */
const templateInputSchema = {
  description: 'One input of a template (D58.1).',
  oneOf: [
    closedObject('A text, with its least and greatest number of characters (D58.1).', {
      id,
      type: fieldType('text'),
      ...textConstraints,
      default: { ...textValue, description: DEFAULT },
    }),
    closedObject('A number, with its least and greatest value (D58.1).', {
      id,
      type: fieldType('number'),
      ...numberConstraints,
      default: { ...numberValue, description: DEFAULT },
    }),
    closedObject('true or false (D58.1).', {
      id,
      type: fieldType('boolean'),
      default: { ...booleanValue, description: DEFAULT },
    }),
    closedObject('A colour, lowercase #rrggbb (D58.1).', {
      id,
      type: fieldType('color'),
      default: { ...colorValue, description: DEFAULT },
    }),
    closedObject('An image, as the content hash of its bytes (D58.1).', {
      id,
      type: fieldType('image'),
      default: { ...assetValue, description: DEFAULT },
    }),
    closedObject('A video, as the content hash of its bytes (D58.1).', {
      id,
      type: fieldType('video'),
      default: { ...assetValue, description: DEFAULT },
    }),
    closedObject('A sound, as the content hash of its bytes (D58.1).', {
      id,
      type: fieldType('audio'),
      default: { ...assetValue, description: DEFAULT },
    }),
    listInputSchema,
  ],
} as const satisfies UnionSchema;

const inputReference = {
  type: 'string',
  description: 'ID of an input of the template (D58).',
  pattern: '^[A-Za-z0-9_-]+$',
} as const satisfies StringSchema;

const boundNode = {
  type: 'string',
  description: 'ID of a node of any scene of the composition (D58.2).',
  pattern: '^[A-Za-z0-9_-]+$',
} as const satisfies StringSchema;

/** A binding of a whole property of a node to an input of its type (D58.2). */
const propertyBindingSchema = closedObject(
  'The whole property of the node holds the value of the input: the text of a text node takes a text input, the color of a text or a background a colour input (D58.2).',
  {
    id,
    kind: { type: 'string', const: 'property' },
    nodeId: boundNode,
    property: {
      type: 'string',
      description: 'The bound property of the node (D58.2).',
      enum: ['text', 'color'],
    },
    inputId: inputReference,
  },
);

/** A binding of the placeholders in the text of a text node (D58.2). */
const placeholdersBindingSchema = closedObject(
  'The text of the text node is a pattern: every {{inputId}} in it stands for the value of a text or number input (D58.2).',
  {
    id,
    kind: { type: 'string', const: 'placeholders' },
    nodeId: boundNode,
  },
);

/** A binding of an asset to an input of its type (D58.2). */
const assetBindingSchema = closedObject(
  'The asset takes the content hash of the value of an image, video, or audio input of its type; every node and clip that uses it shows or plays the new bytes (D58.2).',
  {
    id,
    kind: { type: 'string', const: 'asset' },
    assetId: assetReference,
    inputId: inputReference,
  },
);

const listReference = {
  type: 'string',
  description: 'ID of a list input of the template (D59).',
  pattern: '^[A-Za-z0-9_-]+$',
} as const satisfies StringSchema;

const itemKey = {
  ...fieldKey,
  description: 'The key of a field of the items of the list input (D59).',
} as const satisfies StringSchema;

/** A binding of a whole property of a node to a field of the items of a list (D59.3). */
const itemPropertyBindingSchema = closedObject(
  'In the copy of a repeat over the list, the whole property of the node holds the value of the field of its item: the text of a text node takes a text field, the color of a text or a background a colour field (D59.3).',
  {
    id,
    kind: { type: 'string', const: 'item-property' },
    nodeId: boundNode,
    property: {
      type: 'string',
      description: 'The bound property of the node (D59.3).',
      enum: ['text', 'color'],
    },
    inputId: listReference,
    key: itemKey,
  },
);

/** A binding of an asset to a field of the items of a list (D59.3). */
const itemAssetBindingSchema = closedObject(
  'The asset is copied once for each item of the list and takes the content hash of the field of its item; each copy of the repeat that uses it uses the copy of its item (D59.3).',
  {
    id,
    kind: { type: 'string', const: 'item-asset' },
    assetId: assetReference,
    inputId: listReference,
    key: itemKey,
  },
);

const templateBindingSchema = {
  description: 'Where the value of an input or of a field of an item goes (D58.2, D59.3).',
  oneOf: [
    propertyBindingSchema,
    placeholdersBindingSchema,
    assetBindingSchema,
    itemPropertyBindingSchema,
    itemAssetBindingSchema,
  ],
} as const satisfies UnionSchema;

const targetReference = {
  type: 'string',
  description: 'ID of a scene of the composition, or of a node of any scene (D59).',
  pattern: '^[A-Za-z0-9_-]+$',
} as const satisfies StringSchema;

const testedInput = {
  type: 'string',
  description: 'ID of the input the test reads (D59.1).',
  pattern: '^[A-Za-z0-9_-]+$',
} as const satisfies StringSchema;

const test = <const T extends string>(test: T) => ({ type: 'string', const: test }) as const;

/** A condition: the target is kept only while its test of an input holds (D59.1). */
const templateConditionSchema = {
  description:
    'The target scene or node, with everything inside it, is kept only when the test holds; every condition of a target must hold (D59.1).',
  oneOf: [
    closedObject('Holds when the text input is empty or the list input has no items (D59.1).', {
      id,
      test: test('empty'),
      targetId: targetReference,
      inputId: testedInput,
    }),
    closedObject('Holds when the text input is not empty or the list input has an item (D59.1).', {
      id,
      test: test('not-empty'),
      targetId: targetReference,
      inputId: testedInput,
    }),
    closedObject('Holds when the boolean input is true (D59.1).', {
      id,
      test: test('true'),
      targetId: targetReference,
      inputId: testedInput,
    }),
    closedObject('Holds when the boolean input is false (D59.1).', {
      id,
      test: test('false'),
      targetId: targetReference,
      inputId: testedInput,
    }),
    closedObject(
      'Holds when the text input is exactly the value, code point for code point (D59.1).',
      {
        id,
        test: test('equal-text'),
        targetId: targetReference,
        inputId: testedInput,
        value: textValue,
      },
    ),
    closedObject('Holds when the number input is exactly the value (D59.1).', {
      id,
      test: test('equal-number'),
      targetId: targetReference,
      inputId: testedInput,
      value: numberValue,
    }),
  ],
} as const satisfies UnionSchema;

/** A repeat: one copy of the target for each item of a list, one after the other (D59.2). */
const templateRepeatSchema = {
  description:
    'The target scene or node is replaced by one copy for each item of the list, in the order of the items, each copy starting where the one before it ends (D59.2).',
  oneOf: [
    closedObject('Every copy lasts the durationUs of the target (D59.2).', {
      id,
      duration: { type: 'string', const: 'target' },
      targetId: targetReference,
      inputId: listReference,
    }),
    closedObject(
      'Every copy lasts the value of a number field of its item, a whole number of microseconds from 1 (D59.2).',
      {
        id,
        duration: { type: 'string', const: 'field' },
        targetId: targetReference,
        inputId: listReference,
        key: itemKey,
      },
    ),
  ],
} as const satisfies UnionSchema;

/** The template section (D58, D59): empty in a composition that is no template. */
const templateSchema = closedObject(
  'The inputs of a template, their bindings, the conditions, and the repeats; every list is empty in a composition that is no template, and instantiating one empties them (D58, D59).',
  {
    inputs: {
      type: 'array',
      description: 'The inputs, in the order a host shows them (D58.1).',
      items: templateInputSchema,
    },
    bindings: {
      type: 'array',
      description: 'The bindings; their order has no meaning (D58.2).',
      items: templateBindingSchema,
    },
    conditions: {
      type: 'array',
      description: 'The conditions; their order has no meaning (D59.1).',
      items: templateConditionSchema,
    },
    repeats: {
      type: 'array',
      description: 'The repeats; their order has no meaning (D59.2).',
      items: templateRepeatSchema,
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

export const compositionSchemaV020 = deepFreeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Kadrion composition 0.20',
  ...closedObject('A video composition: the only source of rendering truth.', {
    schemaVersion: { type: 'string', const: SCHEMA_VERSION_V020 },
    width: canvasLength,
    height: canvasLength,
    safeArea: closedObject(
      'The safe area: a frame of reference inside the canvas, given by how far it lies from each edge, where captions and other text that must be read belong. It is reported to hosts and models and cuts nothing: a node outside it is drawn as everywhere else. All zero is the whole canvas (D70).',
      {
        fromTop: safeInset,
        fromRight: safeInset,
        fromBottom: safeInset,
        fromLeft: safeInset,
      },
    ),
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
    template: templateSchema,
  }),
} as const satisfies JsonSchema);

/** A document of schema 0.20. It never carries the brand of a validated composition (D76). */
export type CompositionV020 = Infer<typeof compositionSchemaV020>;

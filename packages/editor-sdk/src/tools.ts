/**
 * The AI metadata of every command (D46.1): what a model reads about a command
 * before it calls the tool that dispatches it. The table is keyed by the
 * members of `Command['type']`, so a command without metadata, or metadata
 * without a command, fails compilation — the rule of phase three that "a
 * command without AI metadata does not compile". Each entry pairs the
 * command's own argument schema (D31.2), a description written for a model,
 * and an example typed by the command's arguments, so an example with a
 * missing or extra field fails compilation too.
 *
 * `@kadrion/ai-sdk` derives the tool catalogue from this table; it adds the
 * tool name and the example to the text and copies nothing else.
 */
import {
  addAnimationArgumentsSchema,
  addAssetArgumentsSchema,
  addKeyframeArgumentsSchema,
  addNodeArgumentsSchema,
  deepFreeze,
  duplicateNodeArgumentsSchema,
  moveKeyframeArgumentsSchema,
  removeAnimationArgumentsSchema,
  removeAssetArgumentsSchema,
  removeKeyframeArgumentsSchema,
  removeNodeArgumentsSchema,
  reorderNodeArgumentsSchema,
  setImageAssetArgumentsSchema,
  setNodeColorArgumentsSchema,
  setNodeFitArgumentsSchema,
  setNodeLifetimeArgumentsSchema,
  setNodeOpacityArgumentsSchema,
  setNodePositionArgumentsSchema,
  setNodeScaleArgumentsSchema,
  setNodeSizeArgumentsSchema,
  setOpacityKeyframeArgumentsSchema,
  setPositionKeyframeArgumentsSchema,
  setScaleKeyframeArgumentsSchema,
  setTextContentArgumentsSchema,
  setTextFontArgumentsSchema,
  setTextFontSizeArgumentsSchema,
  setVideoAssetArgumentsSchema,
  setVideoSourceArgumentsSchema,
  type AddAnimationArgumentsSchema,
  type AddKeyframeArgumentsSchema,
  type AddNodeArgumentsSchema,
  type ClosedObjectSchema,
  type Command,
} from './commands.js';
import { COMMAND_TYPES } from './registry.js';

/** The arguments of one command type: the command without its discriminator (D31.3). */
export type CommandArguments<T extends Command['type']> = Omit<
  Extract<Command, { type: T }>,
  'type'
>;

/** The JSON Schema of the arguments of any command, as `editor-sdk` exports it (D31.2). */
export type CommandArgumentsSchema =
  | ClosedObjectSchema<string>
  | AddNodeArgumentsSchema
  | AddAnimationArgumentsSchema
  | AddKeyframeArgumentsSchema;

/** What a model is told about one command (D46.1). */
export interface CommandToolMetadata<T extends Command['type'] = Command['type']> {
  readonly commandType: T;
  /**
   * For a model that cannot see the canvas: what the command changes, its
   * units, and the error codes it is refused with.
   */
  readonly description: string;
  /** Arguments that are valid against `argumentsSchema`. */
  readonly example: CommandArguments<T>;
  /** The very schema object `editor-sdk` exports for the command. */
  readonly argumentsSchema: CommandArgumentsSchema;
}

type MetadataTable = {
  readonly [T in Command['type']]: Omit<CommandToolMetadata<T>, 'commandType'>;
};

/** The metadata of one command type, with its type attached. */
export type AnyCommandToolMetadata = {
  readonly [T in Command['type']]: CommandToolMetadata<T>;
}[Command['type']];

const TIME_US =
  'Times are composition times in integer microseconds (1 second is 1000000), never rounded.';

const PIXELS = 'Lengths and coordinates are composition pixels, rounded to integers.';

const ANIMATED =
  'Use describe_document to read the IDs of animations and the times of their keyframes.';

// The type argument makes the literal itself a `MetadataTable`: a missing entry
// and an entry for a type outside the union both fail compilation.
const METADATA = deepFreeze<MetadataTable>({
  SetNodePosition: {
    description: `Moves one node to an absolute base position: x from the left edge, y from the top edge, of the canvas, or of its group for a node inside a group. ${PIXELS} A position animation of the node adds its offsets on top of this base. Refused with unknown-node when no node has the ID, unsupported-node for a node without a position (the background), and invalid-result when the document cannot hold the position.`,
    example: { nodeId: 'node-title', position: { x: 120, y: 240 } },
    argumentsSchema: setNodePositionArgumentsSchema,
  },
  SetNodeOpacity: {
    description:
      "Sets one node's base opacity, from 0 (transparent) to 1 (opaque) inclusive. An opacity animation of the node multiplies it. Refused with invalid-argument outside 0 to 1, unknown-node when no node has the ID, and unsupported-node for a node without an opacity (the background).",
    example: { nodeId: 'node-title', opacity: 0.5 },
    argumentsSchema: setNodeOpacityArgumentsSchema,
  },
  SetTextContent: {
    description:
      'Replaces the text of one text node, exactly as given: nothing is trimmed, and line breaks (\\n) are kept. Refused with unknown-node when no node has the ID and unsupported-node for a node that is not a text.',
    example: { nodeId: 'node-title', text: 'Hello' },
    argumentsSchema: setTextContentArgumentsSchema,
  },
  AddNode: {
    description: `Inserts one complete node into the scene, or into a group, at a layer index: 0 is the bottom layer and the length of the list the top. The node is given exactly as the document stores it, with every field of its type (describe_document shows the stored fields of existing nodes): an ID unused in the document, its type (text, image, video, group, or custom-html), startUs and durationUs, position, scale, opacity, animations, and its own fields. A group takes text, image, and video nodes only. ${TIME_US} A video must sample inside its source. Refused with unknown-parent, unsupported-node when the parent takes no children, index-out-of-range, id-in-use with the IDs already taken, and invalid-result when the node is not one the document can hold; a video also with media-facts-missing and source-range-exceeded.`,
    example: {
      parentId: 'scene-main',
      index: 4,
      node: {
        id: 'node-subtitle',
        type: 'text',
        startUs: 1_000_000,
        durationUs: 4_000_000,
        position: { x: 90, y: 400 },
        scale: { x: 1, y: 1 },
        opacity: 1,
        animations: [],
        text: 'Made with Kadrion',
        fontAssetId: 'asset-font',
        fontSize: 64,
        color: '#ffffff',
      },
    },
    argumentsSchema: addNodeArgumentsSchema,
  },
  RemoveNode: {
    description:
      'Removes one node together with its animations and, for a group, its children. Refused with unknown-node when no node has the ID and invalid-result when the document would no longer be valid without it.',
    example: { nodeId: 'node-custom-html' },
    argumentsSchema: removeNodeArgumentsSchema,
  },
  DuplicateNode: {
    description:
      'Copies one node, with its animations and children, into the same list directly above the original. The copy takes newNodeId; a child at index i of the copy becomes <newNodeId>-c<i>, an animation <newNodeId>-a-<property>. Refused with unknown-node, id-in-use when an ID of the copy is taken, and invalid-result.',
    example: { nodeId: 'node-title', newNodeId: 'node-title-copy' },
    argumentsSchema: duplicateNodeArgumentsSchema,
  },
  ReorderNode: {
    description:
      'Moves one node to another index of its own list, which changes the layer order: 0 is the bottom layer and the length of the list minus 1 the top. It never moves a node into or out of a group. Refused with unknown-node and index-out-of-range.',
    example: { nodeId: 'node-title', index: 1 },
    argumentsSchema: reorderNodeArgumentsSchema,
  },
  SetNodeScale: {
    description:
      "Sets one node's base scale about its top-left corner: 1 is the natural size, from 0 to 1000 on each axis. A scale animation of the node multiplies it. Refused with invalid-argument outside 0 to 1000, unknown-node, and unsupported-node for a node without a scale (the background).",
    example: { nodeId: 'node-image', scale: { x: 1.5, y: 1.5 } },
    argumentsSchema: setNodeScaleArgumentsSchema,
  },
  SetNodeSize: {
    description: `Sets the width and height of an image, a video, or a Custom HTML element, from 1 to 1000000 each. ${PIXELS} A text has no size; change its font size instead. Refused with invalid-argument for a size outside the range after rounding, unknown-node, and unsupported-node for any other node.`,
    example: { nodeId: 'node-image', width: 480, height: 270 },
    argumentsSchema: setNodeSizeArgumentsSchema,
  },
  SetNodeColor: {
    description:
      'Sets the colour of a text or a background, as # and six hexadecimal digits (sRGB), stored in lower case. Refused with invalid-argument for short forms, names, or alpha, unknown-node, and unsupported-node for a node without a colour.',
    example: { nodeId: 'node-title', color: '#ffcc00' },
    argumentsSchema: setNodeColorArgumentsSchema,
  },
  SetTextFontSize: {
    description: `Sets the font size of a text, from 1 to 1000000. ${PIXELS} Refused with invalid-argument outside the range after rounding, unknown-node, and unsupported-node for a node that is not a text.`,
    example: { nodeId: 'node-title', fontSize: 96 },
    argumentsSchema: setTextFontSizeArgumentsSchema,
  },
  SetTextFont: {
    description:
      'Points a text at another font asset that the document declares (add one with add_asset first). Refused with unknown-node, unsupported-node for a node that is not a text, unknown-asset, and asset-type-mismatch when the asset is not a font.',
    example: { nodeId: 'node-title', fontAssetId: 'asset-font-bold' },
    argumentsSchema: setTextFontArgumentsSchema,
  },
  SetImageAsset: {
    description:
      'Points an image node at another image asset that the document declares; the node keeps its size. Refused with unknown-node, unsupported-node for a node that is not an image, unknown-asset, and asset-type-mismatch when the asset is not an image.',
    example: { nodeId: 'node-image', assetId: 'asset-photo' },
    argumentsSchema: setImageAssetArgumentsSchema,
  },
  AddAsset: {
    description:
      "Declares an image, audio, font, or video asset at an index of the document's assets, under an unused ID and the SHA-256 of its exact bytes. Declare only assets whose bytes the host has: the host must supply them whenever the document is loaded, even while nothing uses the asset. Refused with id-in-use and index-out-of-range.",
    example: {
      asset: {
        id: 'asset-photo',
        type: 'image',
        contentHash: 'sha256:2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
      },
      index: 3,
    },
    argumentsSchema: addAssetArgumentsSchema,
  },
  RemoveAsset: {
    description:
      'Removes an asset that nothing uses. Refused with unknown-asset, and with asset-in-use, whose details list the IDs of its users: point them at another asset or remove them first.',
    example: { assetId: 'asset-photo' },
    argumentsSchema: removeAssetArgumentsSchema,
  },
  AddAnimation: {
    description: `Adds one complete animation to a node, at an index of its animations: an ID unused in the document; the property (position, scale, or opacity), which the node must not animate yet; the interpolation ("linear"); and at least two keyframes in ascending time, each {timeUs, value}. A position value is an offset {x, y} in pixels added to the base position, a scale value factors {x, y} multiplied with the base scale, an opacity value a factor from 0 to 1. ${TIME_US} Refused with unknown-node, unsupported-node for a node without animations (the background), duplicate-animation-target, index-out-of-range, id-in-use, and invalid-result.`,
    example: {
      nodeId: 'node-custom-html',
      index: 0,
      animation: {
        id: 'anim-html-opacity',
        property: 'opacity',
        interpolation: 'linear',
        keyframes: [
          { timeUs: 0, value: 0 },
          { timeUs: 1_000_000, value: 1 },
        ],
      },
    },
    argumentsSchema: addAnimationArgumentsSchema,
  },
  RemoveAnimation: {
    description: `Removes one animation with all its keyframes; the node keeps its base values. ${ANIMATED} Refused with unknown-animation.`,
    example: { animationId: 'anim-title-opacity' },
    argumentsSchema: removeAnimationArgumentsSchema,
  },
  SetOpacityKeyframe: {
    description: `Sets the opacity factor (0 to 1) of an opacity animation at a time: replaces the value of the keyframe at that time, or inserts one. ${TIME_US} ${ANIMATED} Refused with unknown-animation and animation-property-mismatch when the animation does not animate opacity.`,
    example: { animationId: 'anim-title-opacity', timeUs: 5_000_000, opacity: 0.5 },
    argumentsSchema: setOpacityKeyframeArgumentsSchema,
  },
  SetPositionKeyframe: {
    description: `Sets the offset {x, y} of a position animation at a time, added to the node's base position: replaces the value of the keyframe at that time, or inserts one. ${PIXELS} ${TIME_US} ${ANIMATED} Refused with unknown-animation and animation-property-mismatch when the animation does not animate position.`,
    example: { animationId: 'anim-group-position', timeUs: 5_000_000, offset: { x: 40, y: 200 } },
    argumentsSchema: setPositionKeyframeArgumentsSchema,
  },
  SetScaleKeyframe: {
    description: `Sets the factors {x, y} of a scale animation at a time, from 0 to 1000, multiplied with the node's base scale: replaces the value of the keyframe at that time, or inserts one. ${TIME_US} ${ANIMATED} Refused with unknown-animation and animation-property-mismatch when the animation does not animate scale.`,
    example: { animationId: 'anim-image-scale', timeUs: 5_000_000, factor: { x: 1.1, y: 1.1 } },
    argumentsSchema: setScaleKeyframeArgumentsSchema,
  },
  AddKeyframe: {
    description: `Inserts one keyframe given exactly as the document stores it, {timeUs, value}, into an animation, at the place its time gives it; the value must fit the animated property. ${TIME_US} ${ANIMATED} Refused with unknown-animation, keyframe-exists when the time is taken, and invalid-result for a value of the wrong form.`,
    example: { animationId: 'anim-title-opacity', keyframe: { timeUs: 9_000_000, value: 0.5 } },
    argumentsSchema: addKeyframeArgumentsSchema,
  },
  RemoveKeyframe: {
    description: `Removes the keyframe at a time from an animation. An animation keeps at least two keyframes; remove the whole animation instead. ${TIME_US} ${ANIMATED} Refused with unknown-animation, unknown-keyframe, and too-few-keyframes.`,
    example: { animationId: 'anim-title-opacity', timeUs: 5_000_000 },
    argumentsSchema: removeKeyframeArgumentsSchema,
  },
  MoveKeyframe: {
    description: `Moves the keyframe at timeUs of an animation to toTimeUs, keeping its value. ${TIME_US} ${ANIMATED} Refused with unknown-animation, unknown-keyframe, and keyframe-exists when toTimeUs is taken.`,
    example: { animationId: 'anim-title-opacity', timeUs: 7_500_000, toTimeUs: 6_000_000 },
    argumentsSchema: moveKeyframeArgumentsSchema,
  },
  SetNodeLifetime: {
    description: `Sets when a node is shown: from startUs, for durationUs (at least 1). ${TIME_US} The part after the end of the composition is cut. It moves no keyframe: keyframe times stay composition times. A video keeps its sourceStartUs, so its lifetime must fit inside its source. Refused with unknown-node, invalid-result, and for a video media-facts-missing and source-range-exceeded.`,
    example: { nodeId: 'node-title', startUs: 1_000_000, durationUs: 5_000_000 },
    argumentsSchema: setNodeLifetimeArgumentsSchema,
  },
  SetNodeFit: {
    description:
      'Sets how the picture of an image or a video meets the box of its node: fill stretches it to the box, contain shows all of it inside the box, cover fills the box and crops; contain and cover keep the aspect ratio and centre the picture. Refused with invalid-argument for another fit, unknown-node, and unsupported-node for a node that is neither an image nor a video.',
    example: { nodeId: 'node-image', fit: 'cover' },
    argumentsSchema: setNodeFitArgumentsSchema,
  },
  SetVideoAsset: {
    description: `Points a video node at another video asset that the document declares (add one with add_asset first); its source start, size, and fit stay. The part of the source the node samples must lie inside the new video: describe_document reports a video's sourceDurationUs when the host knows it. Refused with unknown-node, unsupported-node for a node that is not a video, unknown-asset, asset-type-mismatch when the asset is not a video, media-facts-missing when the host does not know the video's duration, and source-range-exceeded when the node would sample past its end.`,
    example: { nodeId: 'node-video', assetId: 'asset-clip' },
    argumentsSchema: setVideoAssetArgumentsSchema,
  },
  SetVideoSource: {
    description: `Sets the source time a video node shows at the start of its lifetime; it then plays at speed 1. ${TIME_US} Source times count from the video's first frame. The node samples sourceStartUs up to sourceStartUs plus the part of its lifetime inside the composition, which must lie inside the video: describe_document reports its sourceDurationUs when the host knows it. To trim the start of a clip by d, add d to startUs and sourceStartUs and subtract it from durationUs in one transaction. Refused with invalid-argument, unknown-node, unsupported-node for a node that is not a video, media-facts-missing, and source-range-exceeded.`,
    example: { nodeId: 'node-video', sourceStartUs: 2_000_000 },
    argumentsSchema: setVideoSourceArgumentsSchema,
  },
});

/**
 * The metadata of one command type, with its type attached. The table's type
 * pairs each key with its own entry, which TypeScript cannot follow through an
 * indexed access by a union key, hence the assertion.
 */
function metadataOf(commandType: Command['type']): AnyCommandToolMetadata {
  return Object.freeze({ commandType, ...METADATA[commandType] }) as AnyCommandToolMetadata;
}

/**
 * The AI metadata of every command, in the order of `COMMAND_TYPES` (D46.1).
 * Deep-frozen: its descriptions and examples are shared by every host.
 */
export const COMMAND_TOOL_METADATA: readonly AnyCommandToolMetadata[] = Object.freeze(
  COMMAND_TYPES.map(metadataOf),
);

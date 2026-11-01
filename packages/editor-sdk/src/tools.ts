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
  addAudioClipArgumentsSchema,
  addKeyframeArgumentsSchema,
  addNodeArgumentsSchema,
  addSceneArgumentsSchema,
  addSceneAudioClipArgumentsSchema,
  deepFreeze,
  joinClipsArgumentsSchema,
  moveClipArgumentsSchema,
  splitClipArgumentsSchema,
  trimClipEndArgumentsSchema,
  trimClipStartArgumentsSchema,
  duplicateNodeArgumentsSchema,
  duplicateSceneArgumentsSchema,
  moveNodeToSceneArgumentsSchema,
  removeSceneArgumentsSchema,
  reorderSceneArgumentsSchema,
  setSceneDurationArgumentsSchema,
  moveKeyframeArgumentsSchema,
  removeAnimationArgumentsSchema,
  removeAssetArgumentsSchema,
  removeAudioClipArgumentsSchema,
  removeKeyframeArgumentsSchema,
  removeNodeArgumentsSchema,
  reorderNodeArgumentsSchema,
  setClipFadesArgumentsSchema,
  setClipSourceArgumentsSchema,
  setClipVolumeArgumentsSchema,
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
  setVideoVolumeArgumentsSchema,
  type AddAnimationArgumentsSchema,
  type AddAudioClipArgumentsSchema,
  type AddKeyframeArgumentsSchema,
  type AddNodeArgumentsSchema,
  type AddSceneArgumentsSchema,
  type AddSceneAudioClipArgumentsSchema,
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
  | AddKeyframeArgumentsSchema
  | AddAudioClipArgumentsSchema
  | AddSceneArgumentsSchema
  | AddSceneAudioClipArgumentsSchema;

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
  "Times are integer microseconds (1 second is 1000000), never rounded: a node's lifetime, a keyframe, and a scene's clip are in the time of its scene, from 0 at the scene's start; the composition's own clips are in composition time.";

const SCENES =
  "Scenes play one after another in their order; a scene has no start of its own, it starts where the scene before it ends, and the composition's durationUs is the sum of the scenes' durations, which every scene command keeps.";

const CLIPS =
  'A clip is named by its ID: a node (a child of a group included) or an audio clip of the composition or of a scene; to move a clip to another layer use reorder_node, to another scene move_node_to_scene.';

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
    description: `Inserts one complete node into a scene, or into a group, at a layer index: 0 is the bottom layer and the length of the list the top. The node is given exactly as the document stores it, with every field of its type (describe_document shows the stored fields of existing nodes): an ID unused in the document, its type (text, image, video, group, or custom-html), startUs and durationUs, position, scale, opacity, animations, and its own fields. A group takes text, image, and video nodes only. ${TIME_US} A video must sample inside its source. Refused with unknown-parent, unsupported-node when the parent takes no children, index-out-of-range, id-in-use with the IDs already taken, and invalid-result when the node is not one the document can hold; a video also with media-facts-missing and source-range-exceeded.`,
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
    description: `Sets the source time a video node shows at the start of its lifetime; it then plays at speed 1. ${TIME_US} Source times count from the video's first frame. The node samples sourceStartUs up to sourceStartUs plus the part of its lifetime inside its scene, which must lie inside the video: describe_document reports its sourceDurationUs when the host knows it. To trim the start of a clip by d, add d to startUs and sourceStartUs and subtract it from durationUs in one transaction. Refused with invalid-argument, unknown-node, unsupported-node for a node that is not a video, media-facts-missing, and source-range-exceeded.`,
    example: { nodeId: 'node-video', sourceStartUs: 2_000_000 },
    argumentsSchema: setVideoSourceArgumentsSchema,
  },
  SetVideoVolume: {
    description: `Sets how loud the sound of a video node is heard: a linear factor of the amplitude from 0 (silent) to 1 (the source as it is); it never amplifies. A video above 0 is heard from the source time it shows, and its asset must then have exactly one audio stream that starts with its picture, long enough for what is heard: describe_document reports a video's soundDurationUs when the host knows it, null when it has no sound. Refused with invalid-argument outside 0 to 1, unknown-node, unsupported-node for a node that is not a video, media-facts-missing when the host does not know the video's sound, and source-range-exceeded when the node would hear past its end or the video has no sound.`,
    example: { nodeId: 'node-video', volume: 0.5 },
    argumentsSchema: setVideoVolumeArgumentsSchema,
  },
  AddAudioClip: {
    description: `Adds one complete audio clip at an index of the document's clips; every clip is heard, mixed by adding, whatever the order. The clip is given exactly as the document stores it: an ID unused in the document, type "audio", the ID of an audio asset the document declares (add one with add_asset first), startUs and durationUs (at least 1) in composition time, sourceStartUs (the source time heard at startUs; speed is 1), volume from 0 to 1, and fadeInUs and fadeOutUs, linear, which together take at most durationUs. ${TIME_US} The part after the end of the composition is cut; the source must be long enough for the part that is heard: describe_document reports an audio asset's sourceDurationUs when the host knows it. Refused with index-out-of-range, id-in-use, invalid-result, media-facts-missing when the host does not know the asset's duration, and source-range-exceeded when the clip would hear past its end.`,
    example: {
      index: 1,
      clip: {
        id: 'clip-voice',
        type: 'audio',
        assetId: 'asset-audio',
        startUs: 2_000_000,
        durationUs: 3_000_000,
        sourceStartUs: 500_000,
        volume: 0.8,
        fadeInUs: 250_000,
        fadeOutUs: 1_000_000,
      },
    },
    argumentsSchema: addAudioClipArgumentsSchema,
  },
  RemoveAudioClip: {
    description:
      "Removes one audio clip, of the composition's clips or of a scene's; its asset stays declared. Refused with unknown-clip.",
    example: { clipId: 'clip-audio' },
    argumentsSchema: removeAudioClipArgumentsSchema,
  },
  SetClipVolume: {
    description:
      'Sets the volume of one audio clip: a linear factor of the amplitude from 0 (silent) to 1 (the source as it is); it never amplifies. Refused with invalid-argument outside 0 to 1 and unknown-clip.',
    example: { clipId: 'clip-audio', volume: 0.5 },
    argumentsSchema: setClipVolumeArgumentsSchema,
  },
  SetClipFades: {
    description: `Sets the linear fade-in and fade-out of one audio clip: the clip rises from silence to its volume over the first fadeInUs of its lifetime and falls back to silence over the last fadeOutUs, counted in its whole lifetime even where its scene or the composition cuts it. 0 is no fade, and both together take at most the clip's durationUs. ${TIME_US} Refused with invalid-argument, unknown-clip, and invalid-result when the fades exceed the duration.`,
    example: { clipId: 'clip-audio', fadeInUs: 500_000, fadeOutUs: 2_000_000 },
    argumentsSchema: setClipFadesArgumentsSchema,
  },
  SetClipSource: {
    description: `Points one audio clip at an audio asset the document declares, which may be the one it has, and sets the source time heard at the clip's start; it then plays at speed 1 and keeps its lifetime. ${TIME_US} Source times count from the first sample. To move a clip in time, run remove_audio_clip and add_audio_clip in one transaction. The part heard must lie inside the source: describe_document reports an audio asset's sourceDurationUs when the host knows it. Refused with invalid-argument, unknown-clip, unknown-asset, asset-type-mismatch when the asset is not audio, media-facts-missing, and source-range-exceeded.`,
    example: { clipId: 'clip-audio', assetId: 'asset-audio', sourceStartUs: 1_000_000 },
    argumentsSchema: setClipSourceArgumentsSchema,
  },
  AddScene: {
    description: `Inserts one complete scene at an index of the sequence. ${SCENES} The scene is given exactly as the document stores it: an ID unused in the document, durationUs (at least 1), its nodes from the bottom layer to the top (each as add_node takes one), and its audio clips (each as add_scene_audio_clip takes one), every ID unused in the document. ${TIME_US} Refused with index-out-of-range, id-in-use with the IDs already taken, and invalid-result when the scene is not one the document can hold; a scene with video or sound also with media-facts-missing and source-range-exceeded.`,
    example: {
      index: 1,
      scene: {
        id: 'scene-outro',
        durationUs: 3_000_000,
        nodes: [
          {
            id: 'node-outro-background',
            type: 'background',
            startUs: 0,
            durationUs: 3_000_000,
            color: '#000000',
          },
        ],
        clips: [],
      },
    },
    argumentsSchema: addSceneArgumentsSchema,
  },
  RemoveScene: {
    description: `Removes one scene with its nodes and clips; its assets stay declared. ${SCENES} Every later scene starts earlier by the removed scene's duration. Refused with unknown-scene, and last-scene for the only scene of the document.`,
    example: { sceneId: 'scene-outro' },
    argumentsSchema: removeSceneArgumentsSchema,
  },
  DuplicateScene: {
    description: `Copies one scene, with its nodes, animations, and clips, directly after it. ${SCENES} The copy's IDs derive from newSceneId: the node at index i becomes <newSceneId>-n<i>, its child at index j <newSceneId>-n<i>-c<j>, an animation <owner>-a-<property>, and the clip at index k <newSceneId>-k<k>. Refused with invalid-argument for an ID not of the document's form, unknown-scene, id-in-use with the derived IDs already taken, and invalid-result; a scene with video or sound also with media-facts-missing and source-range-exceeded.`,
    example: { sceneId: 'scene-main', newSceneId: 'scene-again' },
    argumentsSchema: duplicateSceneArgumentsSchema,
  },
  ReorderScene: {
    description: `Moves one scene to another index of the sequence: 0 is the first scene. ${SCENES} Nothing inside the scene moves, since its times are its own. Refused with unknown-scene and index-out-of-range.`,
    example: { sceneId: 'scene-outro', index: 0 },
    argumentsSchema: reorderSceneArgumentsSchema,
  },
  SetSceneDuration: {
    description: `Sets how long one scene lasts. ${SCENES} Every later scene starts earlier or later by the change, and whatever in the scene lies past its new end is cut; nothing moves inside it. ${TIME_US} Refused with invalid-argument, unknown-scene, invalid-result when the composition would last too long, and, when a video or sound would then be heard further, media-facts-missing and source-range-exceeded.`,
    example: { sceneId: 'scene-main', durationUs: 8_000_000 },
    argumentsSchema: setSceneDurationArgumentsSchema,
  },
  MoveNodeToScene: {
    description: `Moves one node of a scene, with its animations and, for a group, its children, into the nodes of a scene at a layer index: 0 is the bottom layer. Its startUs, durationUs, and keyframe times stay the same scene times, so it plays at the same moment of its new scene. Within its own scene it acts as reorder_node. A child of a group moves only with its group. Refused with unknown-node, unsupported-node for a child of a group, unknown-scene, index-out-of-range, and, when a video would then be seen or heard further, media-facts-missing and source-range-exceeded.`,
    example: { nodeId: 'node-title', sceneId: 'scene-outro', index: 1 },
    argumentsSchema: moveNodeToSceneArgumentsSchema,
  },
  AddSceneAudioClip: {
    description: `Adds one complete audio clip at an index of a scene's clips, in the time of that scene: it moves with its scene, which cuts it at its end. The clip is given as add_audio_clip takes one: an ID unused in the document, type "audio", the ID of an audio asset, startUs and durationUs in scene time, sourceStartUs, volume from 0 to 1, fadeInUs and fadeOutUs. ${TIME_US} The source must be long enough for the part that is heard: describe_document reports an audio asset's sourceDurationUs when the host knows it. Refused with unknown-scene, index-out-of-range, id-in-use, invalid-result, media-facts-missing, and source-range-exceeded.`,
    example: {
      sceneId: 'scene-main',
      index: 0,
      clip: {
        id: 'clip-scene-voice',
        type: 'audio',
        assetId: 'asset-audio',
        startUs: 1_000_000,
        durationUs: 2_000_000,
        sourceStartUs: 0,
        volume: 1,
        fadeInUs: 0,
        fadeOutUs: 500_000,
      },
    },
    argumentsSchema: addSceneAudioClipArgumentsSchema,
  },
  MoveClip: {
    description: `Moves one clip — a node of any type, or an audio clip — to a new start, keeping its duration and, for a video or an audio clip, its source: it plays the same, only earlier or later. A node's keyframes move with it, and a group's children with theirs, so its animation keeps its place in the clip; set_node_lifetime is the command that changes when a node is shown without moving keyframes. ${CLIPS} ${TIME_US} Refused with invalid-argument, unknown-clip, invalid-result when a keyframe or a child would leave the times of the document, and, when a video or sound would then be seen or heard further, media-facts-missing and source-range-exceeded.`,
    example: { clipId: 'node-title', startUs: 1_000_000 },
    argumentsSchema: moveClipArgumentsSchema,
  },
  TrimClipStart: {
    description: `Moves the start of one clip and keeps its end, as dragging the left edge on a timeline: startUs becomes the given time, durationUs changes by the opposite amount, and a video's or an audio clip's sourceStartUs moves by the same amount, so what remains plays exactly where it did. No keyframe moves, and an audio clip's fades stay at its edges. ${CLIPS} ${TIME_US} Refused with invalid-argument, unknown-clip, time-outside-clip when the start would reach the end, source-range-exceeded when the source would start before its first instant or run past its end, invalid-result when the fades no longer fit, and media-facts-missing.`,
    example: { clipId: 'clip-audio', startUs: 2_000_000 },
    argumentsSchema: trimClipStartArgumentsSchema,
  },
  TrimClipEnd: {
    description: `Moves the end of one clip and keeps its start, as dragging the right edge on a timeline: durationUs becomes endUs minus startUs. No keyframe moves. ${CLIPS} ${TIME_US} Refused with invalid-argument, unknown-clip, time-outside-clip when the end would reach the start, invalid-result when an audio clip's fades no longer fit, and, when a video or sound would then be seen or heard further, media-facts-missing and source-range-exceeded.`,
    example: { clipId: 'node-title', endUs: 6_000_000 },
    argumentsSchema: trimClipEndArgumentsSchema,
  },
  SplitClip: {
    description: `Cuts one clip at atUs into two that meet there, as a razor on a timeline: the first keeps its ID and ends at atUs, the second gets newClipId, starts at atUs, and is placed directly after the first (for a node, the layer right above it). A video or audio clip's second half continues its source where the first stops. Every animation is copied to the second half unchanged, as <newClipId>-a-<property>, so both halves look exactly like the whole. A group is not split. A clip that is heard (an audio clip, or a video above volume 0) is split only at a multiple of 125 microseconds from its start and outside its fades, so the halves sound exactly like the whole; the first half then has no fade-out and the second no fade-in. join_clips undoes it. ${CLIPS} ${TIME_US} Refused with invalid-argument, unknown-clip, unsupported-node for a group, time-outside-clip when atUs is not strictly inside the clip, split-not-exact, id-in-use with the IDs already taken, media-facts-missing, and source-range-exceeded.`,
    example: { clipId: 'node-title', atUs: 5_000_000, newClipId: 'node-title-tail' },
    argumentsSchema: splitClipArgumentsSchema,
  },
  JoinClips: {
    description: `Joins two halves of a split back into one clip: nextClipId must be directly after clipId in the same list, start where it ends, and be exactly what split_clip would make of the joined clip (same fields, its source continuing, its animations those of the first under its own ID). The joined clip keeps clipId and the second is removed. ${CLIPS} Refused with unknown-clip, unsupported-node for a group, clips-not-joinable, invalid-result, media-facts-missing, and source-range-exceeded.`,
    example: { clipId: 'node-title', nextClipId: 'node-title-tail' },
    argumentsSchema: joinClipsArgumentsSchema,
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

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
  addClipTransitionArgumentsSchema,
  addSceneTransitionArgumentsSchema,
  removeTransitionArgumentsSchema,
  setTransitionDurationArgumentsSchema,
  setTransitionEffectArgumentsSchema,
  setTransitionEasingArgumentsSchema,
  setKeyframeEasingArgumentsSchema,
  EASINGS,
  setCaptionStyleArgumentsSchema,
  setCaptionWordArgumentsSchema,
  setCaptionWordsArgumentsSchema,
  addTemplateBindingArgumentsSchema,
  addTemplateInputArgumentsSchema,
  removeTemplateBindingArgumentsSchema,
  addTemplateConditionArgumentsSchema,
  removeTemplateConditionArgumentsSchema,
  addTemplateRepeatArgumentsSchema,
  removeTemplateRepeatArgumentsSchema,
  removeTemplateInputArgumentsSchema,
  setTemplateInputArgumentsSchema,
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
  setNodeFocusArgumentsSchema,
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
  type AddClipTransitionArgumentsSchema,
  type AddSceneTransitionArgumentsSchema,
  type SetTransitionEffectArgumentsSchema,
  type SetTransitionEasingArgumentsSchema,
  type SetKeyframeEasingArgumentsSchema,
  type SetCaptionStyleArgumentsSchema,
  type SetCaptionWordArgumentsSchema,
  type SetCaptionWordsArgumentsSchema,
  type AddTemplateBindingArgumentsSchema,
  type AddTemplateConditionArgumentsSchema,
  type AddTemplateRepeatArgumentsSchema,
  type AddTemplateInputArgumentsSchema,
  type SetTemplateInputArgumentsSchema,
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
  | AddSceneAudioClipArgumentsSchema
  | AddSceneTransitionArgumentsSchema
  | AddClipTransitionArgumentsSchema
  | SetTransitionEffectArgumentsSchema
  | SetTransitionEasingArgumentsSchema
  | SetKeyframeEasingArgumentsSchema
  | SetCaptionWordsArgumentsSchema
  | SetCaptionWordArgumentsSchema
  | SetCaptionStyleArgumentsSchema
  | AddTemplateInputArgumentsSchema
  | SetTemplateInputArgumentsSchema
  | AddTemplateBindingArgumentsSchema
  | AddTemplateConditionArgumentsSchema
  | AddTemplateRepeatArgumentsSchema;

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
  "Scenes play one after another in their order; a scene has no start of its own, it starts where the scene before it ends, less the duration of a transition between them, and the composition's durationUs is the sum of the scenes' durations less those of the scene transitions, which every scene command keeps. A command that would break a transition — remove or move one of its scenes or nodes, or shorten one so that it no longer fits — is refused with transition-in-use and the IDs of those transitions: remove them first, in the same transaction.";

const CLIPS =
  'A clip is named by its ID: a node (a child of a group included) or an audio clip of the composition or of a scene; to move a clip to another layer use reorder_node, to another scene move_node_to_scene. A change that would break a clip transition is refused with transition-in-use and its ID.';

const TRANSITIONS =
  'A scene transition overlaps two adjacent scenes: the incoming scene starts durationUs before the outgoing one ends, so the composition is that much shorter, and at most two scenes play at once. A clip transition overlaps two clips of one layer, two children of one parent, whose lifetimes overlap by exactly its durationUs; it moves nothing. A transition is at most as long as either side, and the two transitions of one side together at most as long as it. describe_document lists the transitions.';

const CAPTIONS =
  'A captions node shows timed words in a style: the runtime breaks them into lines of at most maxLineLength characters and every maxLines lines into a page, from the document alone; a page is shown from its first word until the next page starts, and the word being spoken takes highlightColor. Words are in scene time, like keyframes. describe_document shows the words and the style; a word is addressed by its index in words, from 0.';

const TEMPLATE =
  'A template is a composition with inputs a host fills: instantiateTemplate makes a composition from it and their values, and the preview shows it with the defaults. A binding writes an input into a property of a node (the text of a text, the color of a text or a background), into the {{inputId}} placeholders of the text of a text node, or into an asset (its content hash), and inside a repeat over a list an item binding writes a field of the item of each copy; a property or asset bound to an input always holds its default. A condition keeps a scene or a node only while its test of an input holds; a repeat makes one copy of a scene or a node per item of a list, one after the other, with IDs <id>--<index>. Another command that changes a bound property, removes a bound node, a scene or node named by a condition or repeat, or a bound asset, spoils the placeholders of a bound text, or moves an item-bound node out of its repeat is refused with binding-in-use and the IDs of the bindings, conditions, or repeats: set the input with set_template_input instead, or remove them first. describe_document shows the template section.';

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
    description: `Inserts one complete node into a scene, or into a group, at a layer index: 0 is the bottom layer and the length of the list the top. The node is given exactly as the document stores it, with every field of its type (describe_document shows the stored fields of existing nodes): an ID unused in the document, its type (text, image, video, captions, group, or custom-html), startUs and durationUs, position, scale, opacity, animations, and its own fields. A group takes text, image, and video nodes only. ${TIME_US} A video must sample inside its source. Refused with unknown-parent, unsupported-node when the parent takes no children, index-out-of-range, id-in-use with the IDs already taken, and invalid-result when the node is not one the document can hold; a video also with media-facts-missing and source-range-exceeded.`,
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
      'Points a text or captions node at another font asset that the document declares (add one with add_asset first). Refused with unknown-node, unsupported-node for a node that is neither a text nor captions, unknown-asset, and asset-type-mismatch when the asset is not a font.',
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
    description: `Adds one complete animation to a node, at an index of its animations: an ID unused in the document; the property (position, scale, or opacity), which the node must not animate yet; and at least two keyframes in ascending time, each {timeUs, value, easing}, where the easing says how the value moves from this keyframe to the next one ({"kind":"linear"} for a constant speed; the easing of the last keyframe is never read). A position value is an offset {x, y} in pixels added to the base position, a scale value factors {x, y} multiplied with the base scale, an opacity value a factor from 0 to 1. ${TIME_US} Refused with unknown-node, unsupported-node for a node without animations (the background), duplicate-animation-target, index-out-of-range, id-in-use, and invalid-result.`,
    example: {
      nodeId: 'node-custom-html',
      index: 0,
      animation: {
        id: 'anim-html-opacity',
        property: 'opacity',
        keyframes: [
          { timeUs: 0, value: 0, easing: { kind: 'ease-out' } },
          { timeUs: 1_000_000, value: 1, easing: { kind: 'linear' } },
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
    description: `Inserts one keyframe given exactly as the document stores it, {timeUs, value, easing}, into an animation, at the place its time gives it; the value must fit the animated property. ${TIME_US} ${ANIMATED} Refused with unknown-animation, keyframe-exists when the time is taken, and invalid-result for a value of the wrong form.`,
    example: {
      animationId: 'anim-title-opacity',
      keyframe: { timeUs: 9_000_000, value: 0.5, easing: { kind: 'linear' } },
    },
    argumentsSchema: addKeyframeArgumentsSchema,
  },
  RemoveKeyframe: {
    description: `Removes the keyframe at a time from an animation. An animation keeps at least two keyframes; remove the whole animation instead. ${TIME_US} ${ANIMATED} Refused with unknown-animation, unknown-keyframe, and too-few-keyframes.`,
    example: { animationId: 'anim-title-opacity', timeUs: 5_000_000 },
    argumentsSchema: removeKeyframeArgumentsSchema,
  },
  MoveKeyframe: {
    description: `Moves the keyframe at timeUs of an animation to toTimeUs, keeping its value and its easing. ${TIME_US} ${ANIMATED} Refused with unknown-animation, unknown-keyframe, and keyframe-exists when toTimeUs is taken.`,
    example: { animationId: 'anim-title-opacity', timeUs: 7_500_000, toTimeUs: 6_000_000 },
    argumentsSchema: moveKeyframeArgumentsSchema,
  },
  SetKeyframeEasing: {
    description: `Sets how the value of an animation moves from the keyframe at a time to the next keyframe; the value stays the same at every keyframe. ${EASINGS} A keyframe that set_opacity_keyframe, set_position_keyframe, or set_scale_keyframe inserts takes the easing of the keyframe before it, or linear; call this afterwards, in the same transaction, to change it. ${TIME_US} ${ANIMATED} Refused with unknown-animation, unknown-keyframe, and invalid-result for an easing the document cannot hold.`,
    example: {
      animationId: 'anim-group-position',
      timeUs: 0,
      easing: { kind: 'cubic-bezier', x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 },
    },
    argumentsSchema: setKeyframeEasingArgumentsSchema,
  },
  SetNodeLifetime: {
    description: `Sets when a node is shown: from startUs, for durationUs (at least 1). ${TIME_US} The part after the end of the composition is cut. It moves no keyframe: keyframe times stay composition times. A video keeps its sourceStartUs, so its lifetime must fit inside its source. Refused with unknown-node, invalid-result, and for a video media-facts-missing and source-range-exceeded.`,
    example: { nodeId: 'node-title', startUs: 1_000_000, durationUs: 5_000_000 },
    argumentsSchema: setNodeLifetimeArgumentsSchema,
  },
  SetNodeFit: {
    description:
      'Sets how the picture of an image or a video meets the box of its node: fill stretches it to the box, contain shows all of it inside the box, cover fills the box and crops; contain and cover keep the aspect ratio and place the picture by its focus (set_node_focus), the centre by default. Refused with invalid-argument for another fit, unknown-node, and unsupported-node for a node that is neither an image nor a video.',
    example: { nodeId: 'node-image', fit: 'cover' },
    argumentsSchema: setNodeFitArgumentsSchema,
  },
  SetNodeFocus: {
    description:
      'Sets the focus point of an image or a video: the point of its picture that its fit keeps in place, as integers in per mille of the picture, x of its width from the left edge and y of its height from the top edge; 500, 500 is the centre. The point lies at the same fraction of the box, so under cover it chooses which part is cropped away and always stays in frame, under contain it moves the picture towards that side of its bars, and under fill, where the picture is the box, it changes nothing. It is not animated. Refused with invalid-argument for a coordinate that is not an integer from 0 to 1000, unknown-node, and unsupported-node for a node that is neither an image nor a video.',
    example: { nodeId: 'node-image', focus: { x: 500, y: 250 } },
    argumentsSchema: setNodeFocusArgumentsSchema,
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
        transitions: [],
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
    description: `Moves one clip — a node of any type, or an audio clip — to a new start, keeping its duration and, for a video or an audio clip, its source: it plays the same, only earlier or later. A node's keyframes and a captions node's words move with it, and a group's children with theirs, so its animation keeps its place in the clip; set_node_lifetime is the command that changes when a node is shown without moving keyframes. ${CLIPS} ${TIME_US} Refused with invalid-argument, unknown-clip, invalid-result when a keyframe or a child would leave the times of the document, and, when a video or sound would then be seen or heard further, media-facts-missing and source-range-exceeded.`,
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
  AddSceneTransition: {
    description: `Adds a transition on the boundary between a scene and the scene directly after it: during durationUs both play, the outgoing one in its last durationUs and the incoming one in its first, combined by the effect — crossfade, fade-through-color with a colour, slide, wipe, or push with a direction (left, right, up, down), zoom with a fromScale, or iris with a center. Every later scene starts durationUs earlier and the composition's durationUs shrinks by as much; no time inside a scene moves. A boundary takes at most one transition. ${TRANSITIONS} ${TIME_US} Refused with index-out-of-range, id-in-use, and invalid-result when the scenes are not adjacent, the boundary has a transition already, or the transition does not fit its scenes.`,
    example: {
      index: 0,
      transition: {
        id: 'transition-outro',
        fromSceneId: 'scene-main',
        toSceneId: 'scene-outro',
        durationUs: 500_000,
        effect: { kind: 'crossfade' },
        easing: { kind: 'linear' },
      },
    },
    argumentsSchema: addSceneTransitionArgumentsSchema,
  },
  AddClipTransition: {
    description: `Adds a transition between two clips of one layer of a scene — two children of one parent, neither a background — whose lifetimes already overlap by exactly durationUs: the outgoing node ends durationUs after the incoming one starts. During the overlap the effect combines them in the frame of the canvas — crossfade, fade-through-color, slide, wipe, push, zoom, or iris, as for scenes; nothing moves in time. Make the overlap first with move_clip, trim_clip_start, or trim_clip_end, or call add_clip_transition_at_cut for two clips that meet end to end. ${TRANSITIONS} ${TIME_US} Refused with unknown-scene, index-out-of-range, id-in-use, and invalid-result when the nodes are not siblings of this scene, a background, or do not overlap by exactly durationUs.`,
    example: {
      sceneId: 'scene-main',
      index: 0,
      transition: {
        id: 'transition-title',
        fromNodeId: 'node-title',
        toNodeId: 'node-custom-html',
        durationUs: 500_000,
        effect: { kind: 'crossfade' },
        easing: { kind: 'linear' },
      },
    },
    argumentsSchema: addClipTransitionArgumentsSchema,
  },
  RemoveTransition: {
    description: `Removes a scene or clip transition. Without a scene transition the incoming scene starts where the outgoing one ends again: every later scene starts durationUs later and the composition grows by as much. Without a clip transition the two clips stay where they are and simply overlap. ${TRANSITIONS} Refused with unknown-transition.`,
    example: { transitionId: 'transition-outro' },
    argumentsSchema: removeTransitionArgumentsSchema,
  },
  SetTransitionDuration: {
    description: `Sets how long a transition lasts. A longer scene transition makes the incoming scene, and every later one, start earlier, and the composition shorter, by the change. A longer clip transition makes the outgoing clip last longer by the change, so that it still ends durationUs after the incoming one starts: a video then shows more of its source. ${TRANSITIONS} ${TIME_US} Refused with invalid-argument, unknown-transition, invalid-result when it would not fit its sides, media-facts-missing, and source-range-exceeded.`,
    example: { transitionId: 'transition-outro', durationUs: 1_000_000 },
    argumentsSchema: setTransitionDurationArgumentsSchema,
  },
  SetTransitionEffect: {
    description: `Replaces how a transition combines its two sides with a complete effect: {"kind":"crossfade"}, {"kind":"fade-through-color","color":"#000000"}, {"kind":"slide","direction":"left"}, {"kind":"wipe","direction":"up"}, {"kind":"push","direction":"right"}, {"kind":"zoom","fromScale":0.5}, or {"kind":"iris","center":{"x":500,"y":500}}; directions are left, right, up, and down, the way the incoming side moves. Scene and clip transitions take the same effects. No time changes. ${TRANSITIONS} Refused with unknown-transition and invalid-result.`,
    example: { transitionId: 'transition-outro', effect: { kind: 'wipe', direction: 'left' } },
    argumentsSchema: setTransitionEffectArgumentsSchema,
  },
  SetTransitionEasing: {
    description: `Sets how the progress of a transition's effect moves through its overlap: ease-in-out, for example, starts and ends the effect gently; a curve that overshoots is held within the two ends of each motion, and fade-through-color eases each of its halves. ${EASINGS} No time changes. ${TRANSITIONS} Refused with unknown-transition and invalid-result.`,
    example: { transitionId: 'transition-outro', easing: { kind: 'ease-in-out' } },
    argumentsSchema: setTransitionEasingArgumentsSchema,
  },
  SetCaptionWords: {
    description: `Replaces every word of a captions node with a new list, as for a new transcription: each word {text, startUs, durationUs}, in the order they are spoken, each starting no earlier than the one before it ends; text is at least one character and no white space. ${CAPTIONS} ${TIME_US} Refused with invalid-argument, unknown-node, unsupported-node for a node that is not captions, and invalid-result when a word is not one the document can hold or two words overlap.`,
    example: {
      nodeId: 'node-captions',
      words: [
        { text: 'Made', startUs: 0, durationUs: 300_000 },
        { text: 'with', startUs: 300_000, durationUs: 200_000 },
        { text: 'Kadrion', startUs: 500_000, durationUs: 600_000 },
      ],
    },
    argumentsSchema: setCaptionWordsArgumentsSchema,
  },
  SetCaptionWord: {
    description: `Replaces one word of a captions node with a complete word {text, startUs, durationUs}: a corrected text, a new timing, or both; it must still start no earlier than the word before it ends and end no later than the next one starts. ${CAPTIONS} ${TIME_US} Refused with invalid-argument, unknown-node, unsupported-node for a node that is not captions, index-out-of-range, and invalid-result.`,
    example: {
      nodeId: 'node-captions',
      index: 2,
      word: { text: 'Kadrion', startUs: 500_000, durationUs: 600_000 },
    },
    argumentsSchema: setCaptionWordArgumentsSchema,
  },
  SetCaptionStyle: {
    description: `Replaces the style of a captions node with a complete style {fontSize, lineHeight, color, highlightColor, align, verticalAlign, maxLineLength, maxLines}: its size and colours, where its lines lie in its box, and how many characters fit on a line and lines on a page, which changes how the words are grouped. No word and no time changes. ${CAPTIONS} ${PIXELS} Refused with invalid-argument, unknown-node, unsupported-node for a node that is not captions, and invalid-result.`,
    example: {
      nodeId: 'node-captions',
      style: {
        fontSize: 64,
        lineHeight: 80,
        color: '#ffffff',
        highlightColor: '#ffd400',
        align: 'center',
        verticalAlign: 'bottom',
        maxLineLength: 24,
        maxLines: 2,
      },
    },
    argumentsSchema: setCaptionStyleArgumentsSchema,
  },
  AddTemplateInput: {
    description: `Inserts an input into the template: {id, type, ...constraints, default}, with an ID unused in the document. A text has minLength and maxLength in code points, a number minimum and maximum, a boolean, a color (lowercase #rrggbb), an image, video, or audio only a default content hash, and a list minItems, maxItems, fields ({key, type, ...constraints}, no list among them), and a default whose items each list one {key, type, value} per field in their order; the default meets the constraints. Nothing reads a new input until a binding does; a boolean or a list is read by no binding yet. ${TEMPLATE} Refused with index-out-of-range, id-in-use, and invalid-result when the input is not one the document can hold.`,
    example: {
      index: 0,
      input: { id: 'headline', type: 'text', minLength: 1, maxLength: 40, default: 'Kadrion' },
    },
    argumentsSchema: addTemplateInputArgumentsSchema,
  },
  RemoveTemplateInput: {
    description: `Removes an input of the template. ${TEMPLATE} Refused with unknown-input, and input-in-use with the IDs of the bindings that still use it, a placeholder included: remove them first, in the same transaction.`,
    example: { inputId: 'headline' },
    argumentsSchema: removeTemplateInputArgumentsSchema,
  },
  SetTemplateInput: {
    description: `Replaces an input with a complete new one of the same ID — new constraints, a new default, or both — and writes its default into every property and asset bound to it, so that the preview shows it. ${TEMPLATE} Refused with invalid-argument when input.id is not inputId, unknown-input, and invalid-result when the input is not one the document can hold or no longer fits its bindings.`,
    example: {
      inputId: 'headline',
      input: { id: 'headline', type: 'text', minLength: 1, maxLength: 40, default: 'Launch day' },
    },
    argumentsSchema: setTemplateInputArgumentsSchema,
  },
  AddTemplateBinding: {
    description: `Inserts a binding: {id, kind: "property", nodeId, property: "text" or "color", inputId}, {id, kind: "placeholders", nodeId}, {id, kind: "asset", assetId, inputId}, {id, kind: "item-property", nodeId, property, inputId, key}, or {id, kind: "item-asset", assetId, inputId, key}, with an ID unused in the document. The target of an input binding must already hold the input's default (set it first, in the same transaction); a text with placeholders names text or number inputs, or {{list.key}} text or number fields of a list that repeats the node; an item binding reads a field of a list whose repeat holds its node, or every use of its asset; and at most one binding writes a target. ${TEMPLATE} Refused with index-out-of-range, id-in-use, and invalid-result.`,
    example: {
      index: 0,
      binding: {
        id: 'bind-headline',
        kind: 'property',
        nodeId: 'node-title',
        property: 'text',
        inputId: 'headline',
      },
    },
    argumentsSchema: addTemplateBindingArgumentsSchema,
  },
  RemoveTemplateBinding: {
    description: `Removes a binding; its property, text, or asset keeps the value it holds. ${TEMPLATE} Refused with unknown-binding.`,
    example: { bindingId: 'bind-headline' },
    argumentsSchema: removeTemplateBindingArgumentsSchema,
  },
  AddTemplateCondition: {
    description: `Inserts a condition: {id, test: "empty" or "not-empty", targetId, inputId} for a text or list input, {id, test: "true" or "false", targetId, inputId} for a boolean, {id, test: "equal-text", targetId, inputId, value} for a text, or {id, test: "equal-number", targetId, inputId, value} for a number, with an ID unused in the document; targetId names a scene or a node. The template shows the target as it stands; an instantiation removes it, with everything in it and every transition that names it, when the test does not hold. ${TEMPLATE} Refused with index-out-of-range, id-in-use, and invalid-result.`,
    example: {
      index: 0,
      condition: { id: 'when-title', test: 'true', targetId: 'node-title', inputId: 'show-title' },
    },
    argumentsSchema: addTemplateConditionArgumentsSchema,
  },
  RemoveTemplateCondition: {
    description: `Removes a condition; its target is kept whatever the inputs. ${TEMPLATE} Refused with unknown-condition.`,
    example: { conditionId: 'when-title' },
    argumentsSchema: removeTemplateConditionArgumentsSchema,
  },
  AddTemplateRepeat: {
    description: `Inserts a repeat: {id, duration: "target", targetId, inputId}, every copy as long as the target, or {id, duration: "field", targetId, inputId, key}, every copy as long as the number field key of its item names in microseconds, with an ID unused in the document; inputId names a list input and targetId a scene or a node. An instantiation replaces the target by one copy per item, in their order and one after the other, with IDs <id>--<index>: a scene copy follows the scene before it, a node copy starts where the one before it ends, its keyframes and words moved with it; transitions into a repeated scene meet its first copy and those out of it its last. A target is repeated once at most and never inside another repeated one, a repeated node is no side of a clip transition, and no ID of the document may have the form of a copy's. ${TEMPLATE} Refused with index-out-of-range, id-in-use, and invalid-result.`,
    example: {
      index: 0,
      repeat: {
        id: 'each-title',
        duration: 'target',
        targetId: 'node-title',
        inputId: 'people',
      },
    },
    argumentsSchema: addTemplateRepeatArgumentsSchema,
  },
  RemoveTemplateRepeat: {
    description: `Removes a repeat; its target is shown once, as it stands. ${TEMPLATE} Refused with unknown-repeat, and invalid-result while an item binding or a {{list.key}} placeholder still needs it: remove those first, in the same transaction.`,
    example: { repeatId: 'each-title' },
    argumentsSchema: removeTemplateRepeatArgumentsSchema,
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

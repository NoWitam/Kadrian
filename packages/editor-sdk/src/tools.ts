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
  KEYFRAME_VALUES,
  setCaptionStyleArgumentsSchema,
  setTextStyleArgumentsSchema,
  setShapeGeometryArgumentsSchema,
  setShapeFillArgumentsSchema,
  setBlendModeArgumentsSchema,
  setNodeMaskArgumentsSchema,
  setNodeMatteArgumentsSchema,
  setShapeStrokeArgumentsSchema,
  setShapeTrimArgumentsSchema,
  addTextAnimationArgumentsSchema,
  removeTextAnimationArgumentsSchema,
  setTextAnimationArgumentsSchema,
  setCaptionHighlightArgumentsSchema,
  setCaptionPageAnimationArgumentsSchema,
  setSafeAreaArgumentsSchema,
  addEffectArgumentsSchema,
  removeEffectArgumentsSchema,
  reorderEffectArgumentsSchema,
  setEffectArgumentsSchema,
  setCaptionWordArgumentsSchema,
  setCaptionWordsArgumentsSchema,
  addTemplateBindingArgumentsSchema,
  addTemplateInputArgumentsSchema,
  removeTemplateBindingArgumentsSchema,
  addTemplateConditionArgumentsSchema,
  removeTemplateConditionArgumentsSchema,
  addTemplateRepeatArgumentsSchema,
  removeTemplateRepeatArgumentsSchema,
  addDefinitionArgumentsSchema,
  removeDefinitionArgumentsSchema,
  convertToDefinitionArgumentsSchema,
  expandInstanceArgumentsSchema,
  setInstanceInputArgumentsSchema,
  clearInstanceInputArgumentsSchema,
  replaceDefinitionArgumentsSchema,
  setCustomHtmlArgumentsSchema,
  removeTemplateInputArgumentsSchema,
  setTemplateInputArgumentsSchema,
  deepFreeze,
  joinClipsArgumentsSchema,
  setClipReverseArgumentsSchema,
  setClipSpeedArgumentsSchema,
  SPEEDS,
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
  setNodeRotationArgumentsSchema,
  setNodeOriginArgumentsSchema,
  setNodeCropArgumentsSchema,
  setNodeCornerRadiusArgumentsSchema,
  setKeyframeValueArgumentsSchema,
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
  type AddDefinitionArgumentsSchema,
  type SetInstanceInputArgumentsSchema,
  type ReplaceDefinitionArgumentsSchema,
  type SetCustomHtmlArgumentsSchema,
  type AddSceneAudioClipArgumentsSchema,
  type AddClipTransitionArgumentsSchema,
  type AddSceneTransitionArgumentsSchema,
  type SetTransitionEffectArgumentsSchema,
  type SetTransitionEasingArgumentsSchema,
  type SetKeyframeEasingArgumentsSchema,
  type SetKeyframeValueArgumentsSchema,
  type SetCaptionStyleArgumentsSchema,
  type SetTextStyleArgumentsSchema,
  type SetShapeGeometryArgumentsSchema,
  type SetShapeFillArgumentsSchema,
  type SetBlendModeArgumentsSchema,
  type SetNodeMaskArgumentsSchema,
  type SetNodeMatteArgumentsSchema,
  type SetShapeStrokeArgumentsSchema,
  type AddTextAnimationArgumentsSchema,
  type RemoveTextAnimationArgumentsSchema,
  type SetTextAnimationArgumentsSchema,
  type SetCaptionHighlightArgumentsSchema,
  type SetCaptionPageAnimationArgumentsSchema,
  type SetSafeAreaArgumentsSchema,
  type AddEffectArgumentsSchema,
  type SetEffectArgumentsSchema,
  type SetCaptionWordArgumentsSchema,
  type SetCaptionWordsArgumentsSchema,
  type AddTemplateBindingArgumentsSchema,
  type AddTemplateConditionArgumentsSchema,
  type AddTemplateRepeatArgumentsSchema,
  type AddTemplateInputArgumentsSchema,
  type SetTemplateInputArgumentsSchema,
  type SetClipReverseArgumentsSchema,
  type SetClipSpeedArguments,
  type SetClipSpeedArgumentsSchema,
  type ClosedObjectSchema,
  type Command,
} from './commands.js';
import { COMMAND_TYPES } from './registry.js';

/**
 * The arguments of one command type: the command without its discriminator
 * (D31.3). `SetClipSpeed` takes its speed as a caller writes it, which the
 * command holds exactly (D82.11).
 */
export type CommandArguments<T extends Command['type']> = T extends 'SetClipSpeed'
  ? SetClipSpeedArguments
  : Omit<Extract<Command, { type: T }>, 'type'>;

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
  | SetKeyframeValueArgumentsSchema
  | SetCaptionWordsArgumentsSchema
  | SetCaptionWordArgumentsSchema
  | SetCaptionStyleArgumentsSchema
  | SetTextStyleArgumentsSchema
  | SetShapeGeometryArgumentsSchema
  | SetShapeFillArgumentsSchema
  | SetBlendModeArgumentsSchema
  | SetNodeMaskArgumentsSchema
  | SetNodeMatteArgumentsSchema
  | SetShapeStrokeArgumentsSchema
  | AddTextAnimationArgumentsSchema
  | RemoveTextAnimationArgumentsSchema
  | SetTextAnimationArgumentsSchema
  | SetCaptionHighlightArgumentsSchema
  | SetCaptionPageAnimationArgumentsSchema
  | SetSafeAreaArgumentsSchema
  | AddEffectArgumentsSchema
  | SetEffectArgumentsSchema
  | AddTemplateInputArgumentsSchema
  | SetTemplateInputArgumentsSchema
  | AddTemplateBindingArgumentsSchema
  | AddTemplateConditionArgumentsSchema
  | AddTemplateRepeatArgumentsSchema
  | AddDefinitionArgumentsSchema
  | SetInstanceInputArgumentsSchema
  | ReplaceDefinitionArgumentsSchema
  | SetCustomHtmlArgumentsSchema
  | SetClipSpeedArgumentsSchema
  | SetClipReverseArgumentsSchema;

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
  'A captions node shows timed words in a style: the runtime breaks them into lines of at most maxLineLength characters and every maxLines lines into a page, from the document alone; a page is shown from its first word until the next page starts, and the word being spoken shows the highlight of the style. Words are in scene time, like keyframes. describe_document shows the words and the style; a word is addressed by its index in words, from 0.';

const TEMPLATE =
  'A template is a composition with inputs a host fills: instantiateTemplate makes a composition from it and their values, and the preview shows it with the defaults. A binding writes an input into a property of a node (the text of a text, the color of a text or a background), into a parameter of a Custom HTML element (an input of the type of the parameter), into the {{inputId}} placeholders of the text of a text node, into the words of a captions node (a list whose fields are text, startUs, and durationUs), or into an asset (its content hash), and inside a repeat over a list an item binding writes a field of the item of each copy; a property or asset bound to an input always holds its default. A condition keeps a scene or a node only while its test of an input holds; a repeat makes one copy of a scene or a node per item of a list, one after the other, with IDs <id>--<index>. Another command that changes a bound property, removes a bound node, a scene or node named by a condition or repeat, or a bound asset, spoils the placeholders of a bound text, or moves an item-bound node out of its repeat is refused with binding-in-use and the IDs of the bindings, conditions, or repeats: set the input with set_template_input instead, or remove them first. describe_document shows the template section.';

const DEFINITIONS =
  "A definition is a composition built once, with its own canvas (width, height), durationUs, nodes, clips, and clip transitions, and no video or Custom HTML; an instance node places it as one layer: at scene time t it shows the definition at sourceStartUs + (t - startUs), its canvas fitted to the instance's box. Every node, clip, and transition command works inside a definition as in a scene, by the IDs of its nodes, and a definition's ID is a parentId of add_node and a sceneId of add_scene_audio_clip and add_clip_transition; an edit inside a definition changes every instance of it. A definition with a template is an element: an instance gives values to its inputs (set_instance_input, clear_instance_input), and shows the definition instantiated with them, the inputs it gives no value taking their defaults; an element's inputs hold no assets, and its template is edited by replace_definition only. describe_document shows the definitions with their templates, and the values of each instance.";

const CUSTOM_HTML =
  "A Custom HTML element is a sandboxed page of width x height pixels with no network: inline HTML, CSS, and scripts only, fonts from font assets alone (font-family is the asset's ID), and no storage. Its clock is the time of its scene, from the node's startUs: CSS animations and transitions, the Web Animations API, requestAnimationFrame (called once per frame, with the time in milliseconds), Date.now, new Date(), and performance.now all read that time, every frame is rendered as if the page had run from time 0, and Math.random restarts from the same seed at every frame, so plain CSS @keyframes animate deterministically without any script. setTimeout and setInterval do not follow it: do not use them. Parameters are read in a script as kadrion.parameters.<key>, and a number or colour also in CSS as var(--<key>); a template binds a parameter to an input of its type. An element that listens to message events speaks the time protocol itself and must answer every kadrion:time message. check_custom_html renders the element at sampled times twice and reports what fails or differs.";

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
    description: `Inserts one complete node into a scene, or into a group, at a layer index: 0 is the bottom layer and the length of the list the top. The node is given exactly as the document stores it, with every field of its type (describe_document shows the stored fields of existing nodes): an ID unused in the document, its type (text, image, video, captions, shape, group, instance, or custom-html), startUs and durationUs, position, scale, rotation, origin, opacity, animations, and its own fields; an image, video, text, captions node, shape, group, or instance ends with its effects, [] for none (add_effect describes one), then mask {"kind":"none"}, matte {"kind":"none"}, and blendMode "normal" (set_node_mask, set_node_matte, and set_blend_mode describe each). A shape is {width, height, geometry, fill, stroke, trim, effects} after its animations, drawn in its box: set_shape_geometry, set_shape_fill, set_shape_stroke, and set_shape_trim describe each field. An instance places a definition (add_definition describes one) and is {definitionId, inputs, sourceStartUs, width, height, fit, effects} after its animations: inputs [] or the values of an Element's inputs as set_instance_input takes them, sorted by inputId; sourceStartUs the definition time shown at its startUs; fit "fill", "contain", or "cover" of the definition's canvas in its box. A video stores its time map after sourceStartUs: sourceStartRemainder 0, speed {"num":1,"den":1} (describe_document shows a speed as a multiplier such as "x0.5"; stored, it is the fraction {"num":1,"den":2}, from 1/4 to 4, or {"num":0,"den":1} for a freeze frame of the frame at sourceStartUs), and reverse false. A group takes text, image, video, and shape nodes only. ${TIME_US} A video must sample inside its source. Refused with unknown-parent, unsupported-node when the parent takes no children, index-out-of-range, id-in-use with the IDs already taken, and invalid-result when the node is not one the document can hold; a video also with media-facts-missing and source-range-exceeded.`,
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
        rotation: 0,
        origin: { x: 0, y: 0 },
        opacity: 1,
        animations: [],
        text: 'Made with Kadrion',
        fontAssetId: 'asset-font',
        fontSize: 64,
        frame: { kind: 'none' },
        color: '#ffffff',
        style: {
          stroke: { kind: 'none' },
          shadow: { kind: 'none' },
          box: { kind: 'none' },
          align: 'left',
          verticalAlign: 'top',
        },
        textAnimations: [],
        effects: [],
        mask: { kind: 'none' },
        matte: { kind: 'none' },
        blendMode: 'normal',
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
      'Copies one node, with its animations and children, into the same list directly above the original. The copy takes newNodeId; a child at index i of the copy becomes <newNodeId>-c<i>, an animation <newNodeId>-a-<property>, a text animation at index t <newNodeId>-t<t>, an effect at index e <newNodeId>-e<e> and its animations <newNodeId>-e<e>-a-<parameter>. Refused with unknown-node, id-in-use when an ID of the copy is taken, and invalid-result.',
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
      "Sets one node's base scale about its origin point (the top-left corner unless set_node_origin moved it): 1 is the natural size, from 0 to 1000 on each axis. A scale animation of the node multiplies it. Refused with invalid-argument outside 0 to 1000, unknown-node, and unsupported-node for a node without a scale (the background).",
    example: { nodeId: 'node-image', scale: { x: 1.5, y: 1.5 } },
    argumentsSchema: setNodeScaleArgumentsSchema,
  },
  SetNodeSize: {
    description: `Sets the width and height of an image, a video, a Custom HTML element, or an instance, from 1 to 1000000 each. ${PIXELS} A text has no size; change its font size instead. Refused with invalid-argument for a size outside the range after rounding, unknown-node, and unsupported-node for any other node.`,
    example: { nodeId: 'node-image', width: 480, height: 270 },
    argumentsSchema: setNodeSizeArgumentsSchema,
  },
  SetNodeColor: {
    description:
      'Sets the colour of a text or a background, as # and six hexadecimal digits (sRGB), stored in lower case. A color animation of the node replaces it while the animation is sampled. Refused with invalid-argument for short forms, names, or alpha, unknown-node, and unsupported-node for a node without a colour.',
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
      'Points an image node at another image or SVG asset that the document declares; the node keeps its size, and an SVG asset is shown as an image. Refused with unknown-node, unsupported-node for a node that is not an image, unknown-asset, and asset-type-mismatch when the asset is neither an image nor an SVG.',
    example: { nodeId: 'node-image', assetId: 'asset-photo' },
    argumentsSchema: setImageAssetArgumentsSchema,
  },
  AddAsset: {
    description:
      "Declares an image, audio, font, video, or svg asset at an index of the document's assets, under an unused ID and the SHA-256 of its exact bytes. An svg asset is a drawing of a closed subset of SVG that an image node shows as an image; the host loads it only if the sanitiser accepts its bytes. Declare only assets whose bytes the host has: the host must supply them whenever the document is loaded, even while nothing uses the asset. Refused with id-in-use and index-out-of-range.",
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
    description: `Adds one complete animation to a node, at an index of its animations: an ID unused in the document; the property, which the node must not animate yet (position, scale, opacity, rotation, or origin on every node but a background; size, crop, and cornerRadius on an image or a video; color on a text, captions, or a background, which has no other animation; size, fill (a solid fill only), stroke/color, stroke/width, trim/start, trim/end, and geometry on a shape); and at least two keyframes in ascending time, each {timeUs, value, easing}, where the easing says how the value moves from this keyframe to the next one ({"kind":"linear"} for a constant speed, or any easing set_keyframe_easing describes; the easing of the last keyframe is never read). A position value is an offset {x, y} in pixels added to the base position, a scale value factors {x, y} multiplied with the base scale, an opacity value a factor from 0 to 1. ${KEYFRAME_VALUES} ${TIME_US} Refused with unknown-node, duplicate-animation-target, index-out-of-range, id-in-use, and invalid-result.`,
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
  SetKeyframeValue: {
    description: `Sets the value of an animation of rotation, origin, size, color, crop, cornerRadius, or of a shape's fill, stroke/color, stroke/width, trim/start, trim/end, or geometry at a time: replaces the value of the keyframe at that time, or inserts one, eased as the keyframe before it. ${KEYFRAME_VALUES} ${TIME_US} ${ANIMATED} Refused with unknown-animation, use-typed-command for an animation of opacity, position, or scale (use set_opacity_keyframe, set_position_keyframe, or set_scale_keyframe), invalid-argument for a value of the wrong form, and invalid-result for a value outside the range of the property.`,
    example: { animationId: 'anim-image-rotation', timeUs: 1_000_000, value: 360 },
    argumentsSchema: setKeyframeValueArgumentsSchema,
  },
  SetNodeLifetime: {
    description: `Sets when a node is shown: from startUs, for durationUs (at least 1). ${TIME_US} The part after the end of the composition is cut. It moves no keyframe: keyframe times stay composition times. A video keeps its sourceStartUs, so its lifetime must fit inside its source. Refused with unknown-node, invalid-result, and for a video media-facts-missing and source-range-exceeded.`,
    example: { nodeId: 'node-title', startUs: 1_000_000, durationUs: 5_000_000 },
    argumentsSchema: setNodeLifetimeArgumentsSchema,
  },
  SetNodeFit: {
    description:
      "Sets how the picture of an image or a video, or the canvas of an instance's definition, meets the box of its node: fill stretches it to the box, contain shows all of it inside the box, cover fills the box and crops; contain and cover keep the aspect ratio and place the picture by its focus (set_node_focus), the centre by default, and an instance's canvas at the centre. Refused with invalid-argument for another fit, unknown-node, and unsupported-node for a node that is neither an image, a video, nor an instance.",
    example: { nodeId: 'node-image', fit: 'cover' },
    argumentsSchema: setNodeFitArgumentsSchema,
  },
  SetNodeFocus: {
    description:
      'Sets the focus point of an image or a video: the point of its picture that its fit keeps in place, as integers in per mille of the picture, x of its width from the left edge and y of its height from the top edge; 500, 500 is the centre. The point lies at the same fraction of the box, so under cover it chooses which part is cropped away and always stays in frame, under contain it moves the picture towards that side of its bars, and under fill, where the picture is the box, it changes nothing. It is not animated. Refused with invalid-argument for a coordinate that is not an integer from 0 to 1000, unknown-node, and unsupported-node for a node that is neither an image nor a video.',
    example: { nodeId: 'node-image', focus: { x: 500, y: 250 } },
    argumentsSchema: setNodeFocusArgumentsSchema,
  },
  SetNodeRotation: {
    description:
      "Sets a node's base rotation about its origin point, in degrees, positive clockwise, from -360000 to 360000: several turns are allowed for a spin, and a whole number of turns is no rotation. It is applied after the scale and before the position, and a rotation animation of the node adds to it. Refused with invalid-argument outside the range, unknown-node, and unsupported-node for a background.",
    example: { nodeId: 'node-image', rotation: 15 },
    argumentsSchema: setNodeRotationArgumentsSchema,
  },
  SetNodeOrigin: {
    description:
      "Sets the point of a node's box that its scale and rotation are about, as integers in per mille of the box: 0, 0 is the top-left corner and 500, 500 the centre; a group's box is the canvas, a text's box the box of its lines. The position still places the top-left corner, so the node does not move while it is neither rotated nor scaled; to keep a rotated or scaled node in place, set its position in the same transaction. An origin animation of the node adds to it. Refused with invalid-argument for a coordinate that is not an integer from 0 to 1000, unknown-node, and unsupported-node for a background.",
    example: { nodeId: 'node-image', origin: { x: 500, y: 500 } },
    argumentsSchema: setNodeOriginArgumentsSchema,
  },
  SetNodeCrop: {
    description:
      'Sets what is cut away of the picture of an image or a video before it is fitted to its box, as integer insets in per mille of the sides of the picture from its top, right, bottom, and left edge; the rest is then fitted and focused as if it were the whole picture. Two opposite insets add up to at most 999. A crop animation of the node replaces it. Refused with invalid-argument for an inset that is not an integer from 0 to 1000, unknown-node, unsupported-node for a node that is neither an image nor a video, and invalid-result when two opposite insets leave nothing.',
    example: { nodeId: 'node-image', crop: { top: 100, right: 0, bottom: 100, left: 0 } },
    argumentsSchema: setNodeCropArgumentsSchema,
  },
  SetNodeCornerRadius: {
    description: `Sets the radius of the four corners of an image or a video, in composition pixels; 0 is square, and a radius above half a side is reduced as CSS does. ${PIXELS} A cornerRadius animation of the node replaces it. Refused with invalid-argument, unknown-node, unsupported-node for a node that is neither an image nor a video, and invalid-result outside 0 to 1000000 after rounding.`,
    example: { nodeId: 'node-image', cornerRadius: 24 },
    argumentsSchema: setNodeCornerRadiusArgumentsSchema,
  },
  SetVideoAsset: {
    description: `Points a video node at another video asset that the document declares (add one with add_asset first); its source start, size, and fit stay. The part of the source the node samples must lie inside the new video: describe_document reports a video's sourceDurationUs when the host knows it. Refused with unknown-node, unsupported-node for a node that is not a video, unknown-asset, asset-type-mismatch when the asset is not a video, media-facts-missing when the host does not know the video's duration, and source-range-exceeded when the node would sample past its end.`,
    example: { nodeId: 'node-video', assetId: 'asset-clip' },
    argumentsSchema: setVideoAssetArgumentsSchema,
  },
  SetVideoSource: {
    description: `Sets the source time a video node shows at the start of its lifetime; it keeps its speed and its direction. ${TIME_US} Source times count from the video's first frame. The node samples the source range describe_document states as its sampledSourceRange, from sourceStartUs at speed 1 forwards, which must lie inside the video: describe_document reports its sourceDurationUs when the host knows it. To trim the start of a clip, use trim_clip_start, which keeps every frame that remains at any speed. Refused with invalid-argument, unknown-node, unsupported-node for a node that is not a video, media-facts-missing, and source-range-exceeded.`,
    example: { nodeId: 'node-video', sourceStartUs: 2_000_000 },
    argumentsSchema: setVideoSourceArgumentsSchema,
  },
  SetVideoVolume: {
    description: `Sets how loud the sound of a video node is heard: a linear factor of the amplitude from 0 (silent) to 1 (the source as it is); it never amplifies. A video above 0 is heard from the source time it shows, and its asset must then have exactly one audio stream that starts with its picture, long enough for what is heard: describe_document reports a video's soundDurationUs when the host knows it, null when it has no sound. Refused with invalid-argument outside 0 to 1, unknown-node, unsupported-node for a node that is not a video, media-facts-missing when the host does not know the video's sound, and source-range-exceeded when the node would hear past its end or the video has no sound.`,
    example: { nodeId: 'node-video', volume: 0.5 },
    argumentsSchema: setVideoVolumeArgumentsSchema,
  },
  AddAudioClip: {
    description: `Adds one complete audio clip at an index of the document's clips; every clip is heard, mixed by adding, whatever the order. The clip is given exactly as the document stores it: an ID unused in the document, type "audio", the ID of an audio asset the document declares (add one with add_asset first), startUs and durationUs (at least 1) in composition time, sourceStartUs (the source time heard at startUs), sourceStartRemainder 0, speed {"num":1,"den":1} (the source's own speed; describe_document shows a speed as a multiplier such as "x1.5", stored as the fraction {"num":3,"den":2}, from 1/4 to 4, the pitch kept), reverse false (true plays the same source range backwards), volume from 0 to 1, and fadeInUs and fadeOutUs, linear, which together take at most durationUs. ${TIME_US} The part after the end of the composition is cut; the source must be long enough for the part that is heard: describe_document reports an audio asset's sourceDurationUs when the host knows it. Refused with index-out-of-range, id-in-use, invalid-result, media-facts-missing when the host does not know the asset's duration, and source-range-exceeded when the clip would hear past its end.`,
    example: {
      index: 1,
      clip: {
        id: 'clip-voice',
        type: 'audio',
        assetId: 'asset-audio',
        startUs: 2_000_000,
        durationUs: 3_000_000,
        sourceStartUs: 500_000,
        sourceStartRemainder: 0,
        speed: { num: 1, den: 1 },
        reverse: false,
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
    description: `Points one audio clip at an audio asset the document declares, which may be the one it has, and sets the source time heard at the clip's start; it keeps its lifetime, its speed, and its direction. ${TIME_US} Source times count from the first sample. To move a clip in time, run remove_audio_clip and add_audio_clip in one transaction. The part heard must lie inside the source: describe_document reports an audio asset's sourceDurationUs when the host knows it. Refused with invalid-argument, unknown-clip, unknown-asset, asset-type-mismatch when the asset is not audio, media-facts-missing, and source-range-exceeded.`,
    example: { clipId: 'clip-audio', assetId: 'asset-audio', sourceStartUs: 1_000_000 },
    argumentsSchema: setClipSourceArgumentsSchema,
  },
  AddScene: {
    description: `Inserts one complete scene at an index of the sequence. ${SCENES} The scene is given exactly as the document stores it: an ID unused in the document, durationUs (at least 1), its nodes from the bottom layer to the top (each as add_node takes one), its audio clips (each as add_scene_audio_clip takes one), its clip transitions, and its effects ([] for none; add_effect describes one), every ID unused in the document. ${TIME_US} Refused with index-out-of-range, id-in-use with the IDs already taken, and invalid-result when the scene is not one the document can hold; a scene with video or sound also with media-facts-missing and source-range-exceeded.`,
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
            animations: [],
          },
        ],
        clips: [],
        transitions: [],
        effects: [],
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
    description: `Copies one scene, with its nodes, animations, and clips, directly after it. ${SCENES} The copy's IDs derive from newSceneId: the node at index i becomes <newSceneId>-n<i>, its child at index j <newSceneId>-n<i>-c<j>, an animation <owner>-a-<property>, an effect at index e of the scene or a node <owner>-e<e> with its animations <owner>-e<e>-a-<parameter>, and the clip at index k <newSceneId>-k<k>. Refused with invalid-argument for an ID not of the document's form, unknown-scene, id-in-use with the derived IDs already taken, and invalid-result; a scene with video or sound also with media-facts-missing and source-range-exceeded.`,
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
    description: `Adds one complete audio clip at an index of a scene's clips, in the time of that scene: it moves with its scene, which cuts it at its end. The clip is given as add_audio_clip takes one: an ID unused in the document, type "audio", the ID of an audio asset, startUs and durationUs in scene time, sourceStartUs, sourceStartRemainder, speed, reverse, volume from 0 to 1, fadeInUs and fadeOutUs. ${TIME_US} The source must be long enough for the part that is heard: describe_document reports an audio asset's sourceDurationUs when the host knows it. Refused with unknown-scene, index-out-of-range, id-in-use, invalid-result, media-facts-missing, and source-range-exceeded.`,
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
        sourceStartRemainder: 0,
        speed: { num: 1, den: 1 },
        reverse: false,
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
    description: `Moves the start of one clip and keeps its end, as dragging the left edge on a timeline: startUs becomes the given time, durationUs changes by the opposite amount, and a video's or an audio clip's source moves by the same amount times its speed (a reversed clip's source stays), so what remains plays exactly where it did. No keyframe moves, and an audio clip's fades stay at its edges. ${CLIPS} ${TIME_US} Refused with invalid-argument, unknown-clip, time-outside-clip when the start would reach the end, source-range-exceeded when the source would start before its first instant or run past its end, invalid-result when the fades no longer fit, and media-facts-missing.`,
    example: { clipId: 'clip-audio', startUs: 2_000_000 },
    argumentsSchema: trimClipStartArgumentsSchema,
  },
  TrimClipEnd: {
    description: `Moves the end of one clip and keeps its start, as dragging the right edge on a timeline: durationUs becomes endUs minus startUs. No keyframe moves. ${CLIPS} ${TIME_US} Refused with invalid-argument, unknown-clip, time-outside-clip when the end would reach the start, invalid-result when an audio clip's fades no longer fit, and, when a video or sound would then be seen or heard further, media-facts-missing and source-range-exceeded.`,
    example: { clipId: 'node-title', endUs: 6_000_000 },
    argumentsSchema: trimClipEndArgumentsSchema,
  },
  SplitClip: {
    description: `Cuts one clip at atUs into two that meet there, as a razor on a timeline: the first keeps its ID and ends at atUs, the second gets newClipId, starts at atUs, and is placed directly after the first (for a node, the layer right above it). A video or audio clip's second half continues its source where the first stops, at its speed and in its direction, so each half shows exactly what the whole showed there. Every animation is copied to the second half unchanged, as <newClipId>-a-<property>, every effect as <newClipId>-e<e> with its animations as <newClipId>-e<e>-a-<parameter>, and every text animation as <newClipId>-t<t>, one of phase in as an accent at the start of the whole, so both halves look exactly like the whole; a text with a text animation of phase out is refused with split-not-exact. A group is not split. A clip that is heard (an audio clip, or a video above volume 0) is split only at a multiple of 125 microseconds from its start and outside its fades, so the halves sound exactly like the whole; the first half then has no fade-out and the second no fade-in. join_clips undoes it. ${CLIPS} ${TIME_US} Refused with invalid-argument, unknown-clip, unsupported-node for a group, time-outside-clip when atUs is not strictly inside the clip, split-not-exact, id-in-use with the IDs already taken, media-facts-missing, and source-range-exceeded.`,
    example: { clipId: 'node-title', atUs: 5_000_000, newClipId: 'node-title-tail' },
    argumentsSchema: splitClipArgumentsSchema,
  },
  JoinClips: {
    description: `Joins two halves of a split back into one clip: nextClipId must be directly after clipId in the same list, start where it ends, and be exactly what split_clip would make of the joined clip (same fields, its source continuing, its animations those of the first under its own ID). The joined clip keeps clipId and the second is removed. ${CLIPS} Refused with unknown-clip, unsupported-node for a group, clips-not-joinable, invalid-result, media-facts-missing, and source-range-exceeded.`,
    example: { clipId: 'node-title', nextClipId: 'node-title-tail' },
    argumentsSchema: joinClipsArgumentsSchema,
  },
  SetClipSpeed: {
    description: `Sets the speed of a video node or an audio clip: how fast it plays its source, picture and sound, the pitch kept. ${SPEEDS} "x0" is for a video only; freeze_frame holds the frame shown at a given time instead. The clip keeps its startUs, its sourceStartUs, and its direction, and plays the same part of its source by default: durationUs becomes the one given or, left out, the duration of that part at the new speed, rounded up (twice as long at "x0.5", half as long at "x2"; kept when either speed is "x0"). Nothing else moves: no keyframe, and no clip after it. ${CLIPS} ${TIME_US} Refused with invalid-argument, speed-invalid for a speed outside x0.25 to x4 other than x0, not in the notation, or with no exact fraction (the message names the nearest one), x0 for an audio clip or a reversed clip, or a sourceStartRemainder not below the new denominator, unknown-clip, unsupported-node for a node that is neither a video nor an audio clip, invalid-result when an audio clip's fades no longer fit, transition-in-use, and, when the clip would then read more of its source, media-facts-missing and source-range-exceeded.`,
    example: { clipId: 'clip-audio', speed: 'x0.5' },
    argumentsSchema: setClipSpeedArgumentsSchema,
  },
  SetClipReverse: {
    description: `Plays a video node or an audio clip backwards (reverse true) or forwards again (false), picture and sound: it plays the same part of its source over the same lifetime, from the last instant of that part to the first, at its speed. Its lifetime, speed, and sourceStartUs stay, and no keyframe moves; describe_document states each clip's reverse and its sampledSourceRange. A freeze frame (speed x0) has no direction. ${CLIPS} Refused with invalid-argument, unknown-clip, unsupported-node for a node that is neither a video nor an audio clip, speed-invalid for a freeze frame, invalid-result for a reversed clip that would read more than 600000000 microseconds (10 minutes) of its source, and, when its sound would then read other source, media-facts-missing and source-range-exceeded.`,
    example: { clipId: 'clip-audio', reverse: true },
    argumentsSchema: setClipReverseArgumentsSchema,
  },
  AddSceneTransition: {
    description: `Adds a transition on the boundary between a scene and the scene directly after it: during durationUs both play, the outgoing one in its last durationUs and the incoming one in its first, combined by the effect — crossfade, fade-through-color with a colour, slide, wipe, or push with a direction (left, right, up, down), zoom with a fromScale, iris with a center, or blur-dissolve with a radius. Every later scene starts durationUs earlier and the composition's durationUs shrinks by as much; no time inside a scene moves. A boundary takes at most one transition. ${TRANSITIONS} ${TIME_US} Refused with index-out-of-range, id-in-use, and invalid-result when the scenes are not adjacent, the boundary has a transition already, or the transition does not fit its scenes.`,
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
    description: `Adds a transition between two clips of one layer of a scene — two children of one parent, neither a background — whose lifetimes already overlap by exactly durationUs: the outgoing node ends durationUs after the incoming one starts. During the overlap the effect combines them in the frame of the canvas — crossfade, fade-through-color, slide, wipe, push, zoom, iris, or blur-dissolve, as for scenes; nothing moves in time. Make the overlap first with move_clip, trim_clip_start, or trim_clip_end, or call add_clip_transition_at_cut for two clips that meet end to end. ${TRANSITIONS} ${TIME_US} Refused with unknown-scene, index-out-of-range, id-in-use, and invalid-result when the nodes are not siblings of this scene, a background, or do not overlap by exactly durationUs.`,
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
    description: `Replaces how a transition combines its two sides with a complete effect: {"kind":"crossfade"}, {"kind":"fade-through-color","color":"#000000"}, {"kind":"slide","direction":"left"}, {"kind":"wipe","direction":"up"}, {"kind":"push","direction":"right"}, {"kind":"zoom","fromScale":0.5}, {"kind":"iris","center":{"x":500,"y":500}}, or {"kind":"blur-dissolve","radius":12} (the outgoing side blurs and the incoming one sharpens while it fades in); directions are left, right, up, and down, the way the incoming side moves. Scene and clip transitions take the same effects. No time changes. ${TRANSITIONS} Refused with unknown-transition and invalid-result.`,
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
    description: `Replaces the style of a captions node with a complete style {fontSize, lineHeight, color, highlight, align, verticalAlign, maxLineLength, maxLines, lineBreak, stroke, shadow, box, pageIn, pageOut}: its size and colours, what the word being spoken shows (as set_caption_highlight describes it), where its lines lie in its box, how many characters fit on a line and lines on a page, which changes how the words are grouped (lineBreak "characters", or "width" to also fit each line to the box's width), the outline, shadow, and box of its lines (as set_text_style describes them, the box lying behind every line of the page shown), and how a page enters and leaves (as set_caption_page_animation describes it). No word and no time changes. ${CAPTIONS} ${PIXELS} Refused with invalid-argument, unknown-node, unsupported-node for a node that is not captions, and invalid-result.`,
    example: {
      nodeId: 'node-captions',
      style: {
        fontSize: 64,
        lineHeight: 80,
        color: '#ffffff',
        highlight: {
          color: '#ffd400',
          scale: 1,
          tracks: [],
          underline: { kind: 'none' },
          box: { kind: 'none' },
          stroke: { kind: 'none' },
          shadow: { kind: 'none' },
        },
        align: 'center',
        verticalAlign: 'bottom',
        maxLineLength: 24,
        maxLines: 2,
        lineBreak: 'width',
        stroke: { kind: 'outside', color: '#000000', width: 3 },
        shadow: { kind: 'none' },
        box: { kind: 'none' },
        pageIn: { kind: 'none' },
        pageOut: { kind: 'none' },
      },
    },
    argumentsSchema: setCaptionStyleArgumentsSchema,
  },
  SetTextStyle: {
    description:
      'Replaces how a text node is drawn besides its font, size, and colour, with a complete style {stroke, shadow, box, align, verticalAlign}; the first three each {"kind":"none"} or: stroke {"kind":"outside", color, width}, an outline of width pixels (1 to 1000) drawn outside every glyph and under its fill; shadow {"kind":"drop", color, opacity, offset: {x, y}, blur}, a shadow of the glyphs and their outline moved by offset pixels (-1000 to 1000) and blurred by blur pixels (0 to 1000); box {"kind":"solid", color, opacity, padding, cornerRadius}, a filled box behind the text that reaches padding pixels beyond its lines on every side, with rounded corners, without moving the text. align (left, center, right) and verticalAlign (top, middle, bottom) place the lines in the frame. Colours are lowercase #rrggbb, opacities 0 to 1, lengths integers. Refused with invalid-argument, unknown-node, unsupported-node for a node that is not a text, and invalid-result.',
    example: {
      nodeId: 'node-title',
      style: {
        stroke: { kind: 'outside', color: '#000000', width: 4 },
        shadow: { kind: 'drop', color: '#000000', opacity: 0.6, offset: { x: 4, y: 4 }, blur: 8 },
        box: { kind: 'none' },
        align: 'center',
        verticalAlign: 'middle',
      },
    },
    argumentsSchema: setTextStyleArgumentsSchema,
  },
  SetShapeGeometry: {
    description:
      'Replaces what a shape draws with a complete geometry, in composition pixels of its box: {"kind":"rect", cornerRadius} fills the box with its corners rounded by cornerRadius pixels (above half a side it is reduced to half), its outline starting on the top edge and running clockwise; {"kind":"ellipse"} fills the box, its outline starting at its rightmost point and running clockwise; {"kind":"polygon", points} is closed through 3 to 1000 points {x, y}; {"kind":"path", fillRule, commands} is 1 to 1000 absolute commands, the first a move: {"kind":"move", x, y} starts a subpath, {"kind":"line", x, y}, {"kind":"cubic", x1, y1, x2, y2, x, y}, {"kind":"quadratic", x1, y1, x, y}, {"kind":"arc", rx, ry, rotation, largeArc, sweep, x, y} as SVG path data A, and {"kind":"close"}; fillRule "evenodd" leaves holes where subpaths overlap, "nonzero" fills them. No relative or shorthand commands: convert SVG path data to absolute M, L, C, Q, A, and Z first. Coordinates are numbers from -1000000 to 1000000 and may leave the box; a rect and an ellipse follow a size animation, a polygon and a path do not. A geometry animation must keep the structure: replace it in the same transaction. Refused with invalid-argument, unknown-node, unsupported-node for a node that is not a shape, and invalid-result, also when a path does not start with a move or a geometry animation no longer has its structure.',
    example: {
      nodeId: 'node-shape',
      geometry: {
        kind: 'path',
        fillRule: 'nonzero',
        commands: [
          { kind: 'move', x: 0, y: 100 },
          { kind: 'quadratic', x1: 100, y1: -60, x: 200, y: 100 },
          { kind: 'close' },
        ],
      },
    },
    argumentsSchema: setShapeGeometryArgumentsSchema,
  },
  SetShapeFill: {
    description:
      'Replaces what the inside of a shape is painted with: {"kind":"none"}; {"kind":"solid", color}; {"kind":"linear-gradient", start: {x, y}, end: {x, y}, stops} from the point start to the point end; or {"kind":"radial-gradient", center: {x, y}, radius, stops} about center, points and radius (at least 1) in composition pixels of its box. stops are 2 to 16 {offset, color, opacity}: offset an integer per mille of the gradient (0 at its start, 1000 at its end) in ascending order, two may share one; opacity 0 to 1; before the first and after the last stop its colour holds. Colours are lowercase #rrggbb. Only a solid fill is animated (a fill animation replaces its colour); remove a fill animation in the same transaction before another kind. Refused with invalid-argument, unknown-node, unsupported-node for a node that is not a shape, and invalid-result.',
    example: {
      nodeId: 'node-shape',
      fill: {
        kind: 'linear-gradient',
        start: { x: 0, y: 0 },
        end: { x: 200, y: 0 },
        stops: [
          { offset: 0, color: '#7a5af8', opacity: 1 },
          { offset: 1000, color: '#ee46bc', opacity: 1 },
        ],
      },
    },
    argumentsSchema: setShapeFillArgumentsSchema,
  },
  SetShapeStroke: {
    description:
      'Replaces the outline of a shape with a complete stroke {color, width, dash, cap, join}: color lowercase #rrggbb; width in composition pixels from 0 to 1000, centred on the outline, 0 for none; dash an even list of at most 16 integers, the lengths of dashes and gaps in turn in per mille of the length of the whole outline (1 to 1000), repeated from its start, [] for a solid line; cap "butt", "round", or "square" for the ends of open paths and of dashes; join "miter" (limited to 4), "round", or "bevel" for its corners. The stroke is drawn over the fill and is not cut by the box; stroke/color and stroke/width animations replace its colour and width, and the trim (set_shape_trim) chooses the part drawn. Refused with invalid-argument, unknown-node, unsupported-node for a node that is not a shape, and invalid-result, also for an odd number of dashes.',
    example: {
      nodeId: 'node-shape',
      stroke: { color: '#ffffff', width: 6, dash: [], cap: 'round', join: 'round' },
    },
    argumentsSchema: setShapeStrokeArgumentsSchema,
  },
  SetShapeTrim: {
    description:
      'Sets the part of the outline of a shape that its stroke draws, as integers in per mille of the length of the outline from where it starts: start 0 and end 1000 draw it all, and an end at or before the start draws none of it, caps included. The browser measures the outline; nothing about its length need be known. To draw a stroke on, animate trim/end from 0 to 1000 with add_animation; to run a segment along it, animate trim/start and trim/end together. The fill is not trimmed: set the fill to {"kind":"none"} for a line alone. Refused with invalid-argument for a value that is not an integer from 0 to 1000, unknown-node, and unsupported-node for a node that is not a shape.',
    example: { nodeId: 'node-shape', trim: { start: 0, end: 500 } },
    argumentsSchema: setShapeTrimArgumentsSchema,
  },
  SetBlendMode: {
    description:
      'Sets how an image, video, text, captions, shape, group, or instance node blends with what lies below it in its scene or group: "normal" lays it over; "multiply" darkens (white leaves what lies below, black makes black); "screen" lightens (black leaves it, white makes white); "overlay", "soft-light", and "hard-light" raise contrast; "darken" and "lighten" keep the darker or lighter channel; "color-dodge" and "color-burn" brighten or darken what lies below by the node; "difference" and "exclusion" subtract; "hue", "saturation", "color", and "luminosity" take that part of the node and the rest from what lies below. A scene or group holding a node that blends is composited on its own, so a node never blends with another scene or with what lies outside its group. The blend mode applies last, after the mask, matte, opacity, and transform. Refused with invalid-argument, unknown-node, and unsupported-node for a background or a Custom HTML node.',
    example: { nodeId: 'node-title', blendMode: 'screen' },
    argumentsSchema: setBlendModeArgumentsSchema,
  },
  SetNodeMask: {
    description:
      'Replaces what masks an image, video, text, captions, shape, group, or instance node, applied after its effects and moving, scaling, and turning with it: {"kind":"none"}; {"kind":"shape", x, y, width, height, geometry, inverted, feather, animations} shows the node only inside a geometry ({"kind":"rect", cornerRadius} and {"kind":"ellipse"} fill the box; polygon and path as set_shape_geometry describes, in pixels of the box) drawn in the box x, y, width, height, integers in pixels from the top-left corner of the node\'s own box (a group\'s box is the canvas); {"kind":"image", assetId, x, y, width, height, mode, inverted, feather, animations} shows the node through an image asset stretched over that box, by its opacity (mode "alpha") or its brightness times its opacity (mode "luminance"), nothing outside the box. inverted true shows the node where the mask does not cover it. feather softens the edge by a blur of that many composition pixels (0 to 1000). animations are [] or at most one each of {id, property: "geometry", keyframes} (shape masks; every keyframe a geometry of the same structure, morphed number by number) and {id, property: "feather", keyframes}, keyframes {timeUs, value, easing} in scene time. Refused with invalid-argument, unknown-node, unsupported-node for a background or a Custom HTML node, and invalid-result (an unknown or non-image asset, a path that does not start with a move, a geometry keyframe of another structure).',
    example: {
      nodeId: 'node-title',
      mask: {
        kind: 'shape',
        x: 0,
        y: 0,
        width: 400,
        height: 400,
        geometry: { kind: 'ellipse' },
        inverted: false,
        feather: 12,
        animations: [],
      },
    },
    argumentsSchema: setNodeMaskArgumentsSchema,
  },
  SetNodeMatte: {
    description:
      'Replaces which sibling shape node mattes an image, video, text, captions, shape, group, or instance node, as a track matte: {"kind":"none"}, or {"kind":"node", nodeId, mode}. The matte is a shape node of the same scene or group (not the node itself) with no mask, no matte, the normal blend mode, and no clip transition of its own; it keeps its own transform, lifetime, opacity, effects, and animations, is drawn only into the mask of the nodes it mattes, and covers nothing while it is not active. mode "alpha" shows the node where the matte is opaque, "luminance" where it is bright and opaque, "alpha-inverted" and "luminance-inverted" the opposite. The matte lies in the space of the parent: moving the node moves it under the matte, while a mask (set_node_mask) moves with the node. A node that mattes another cannot be removed or given a matte of its own until the matte is set to none, in the same transaction. Refused with invalid-argument, unknown-node, unsupported-node for a background or a Custom HTML node, and invalid-result (no such sibling, not a shape, or a matte that is not plain).',
    example: {
      nodeId: 'node-title',
      matte: { kind: 'node', nodeId: 'node-shape', mode: 'alpha' },
    },
    argumentsSchema: setNodeMatteArgumentsSchema,
  },
  AddTextAnimation: {
    description: `Animates the letters, words, or lines of a text node one after another, at an index of its text animations: {id, unit, phase, staggerUs, order, tracks}. unit is "letter" (a character as a reader sees it, an emoji or an accented letter included; white space is no letter), "word" (a run without white space), or "line" (a line of the text as written that holds a word). Every fragment runs the same tracks in its own time, which starts staggerUs (integer microseconds) after the fragment before it in the order: phase {"kind":"in"} starts the first fragment at the node's startUs, {"kind":"out"} ends the last fragment's last keyframe at the node's end, {"kind":"accent", startUs} starts the first at that scene time, which moves with the node. order is {"kind":"forward"}, {"kind":"backward"}, {"kind":"center"} (from the middle outwards), {"kind":"edges"} (from both ends inwards), or {"kind":"random", seed} (an unsigned 32-bit integer; the same seed gives the same order). tracks are at least one, at most one per property: {property, keyframes} with property "opacity" (factor 0 to 1), "offset" ({x, y} integer pixels from the fragment's place), "scale" ({x, y} factors about its centre), "rotation" (degrees about its centre), or "color" (#rrggbb that replaces the text's colour), and at least two keyframes {timeUs, value, easing} in ascending time, timeUs in the fragment's own time from 0. Before its first keyframe a fragment holds the first value, after its last the last, so an entrance usually starts at opacity 0. Several text animations combine in their order: opacities and scales multiply, offsets and rotations add, the last colour wins. A text with a text animation is drawn in fragments for its whole lifetime, without kerning between them. Refused with unknown-node, unsupported-node for a node that is not a text, index-out-of-range, id-in-use, and invalid-result.`,
    example: {
      nodeId: 'node-title',
      index: 0,
      animation: {
        id: 'text-title-in',
        unit: 'letter',
        phase: { kind: 'in' },
        staggerUs: 50_000,
        order: { kind: 'forward' },
        tracks: [
          {
            property: 'opacity',
            keyframes: [
              { timeUs: 0, value: 0, easing: { kind: 'ease-out' } },
              { timeUs: 300_000, value: 1, easing: { kind: 'linear' } },
            ],
          },
          {
            property: 'offset',
            keyframes: [
              { timeUs: 0, value: { x: 0, y: 40 }, easing: { kind: 'ease-out' } },
              { timeUs: 300_000, value: { x: 0, y: 0 }, easing: { kind: 'linear' } },
            ],
          },
        ],
      },
    },
    argumentsSchema: addTextAnimationArgumentsSchema,
  },
  RemoveTextAnimation: {
    description:
      'Removes one text animation of a text node with all its tracks; a text left without text animations is drawn in one piece again. Refused with unknown-animation when no text animation has the ID and invalid-result.',
    example: { textAnimationId: 'text-title-in' },
    argumentsSchema: removeTextAnimationArgumentsSchema,
  },
  SetTextAnimation: {
    description:
      'Replaces a text animation with a complete new one of the same ID, as add_text_animation describes it: its unit, phase, staggerUs, order, and tracks. Refused with unknown-animation when no text animation has its id, and invalid-result.',
    example: {
      animation: {
        id: 'text-title-in',
        unit: 'word',
        phase: { kind: 'in' },
        staggerUs: 120_000,
        order: { kind: 'center' },
        tracks: [
          {
            property: 'scale',
            keyframes: [
              { timeUs: 0, value: { x: 0, y: 0 }, easing: { kind: 'ease-out' } },
              { timeUs: 400_000, value: { x: 1, y: 1 }, easing: { kind: 'linear' } },
            ],
          },
        ],
      },
    },
    argumentsSchema: setTextAnimationArgumentsSchema,
  },
  SetCaptionHighlight: {
    description: `Replaces what the word being spoken shows in a captions node, from its startUs for its durationUs and at no other time, with a complete highlight {color, scale, tracks, underline, box, stroke, shadow}: color its colour (lowercase #rrggbb); scale a factor of its size about its centre on both axes (1 for none, 1.2 to make it grow); tracks, at most one per property, {property, keyframes} as the tracks of add_text_animation (opacity, offset, scale, rotation, color) in the word's own time from 0 at its startUs, for a bounce or a pop, [] for none; underline {"kind":"none"} or {"kind":"solid", color, thickness, offset}, a bar as wide as the word, thickness pixels (1 to 1000) tall, its bottom edge offset pixels (-1000 to 1000) below the bottom of the word's line; box {"kind":"none"} or {"kind":"solid", color, opacity, padding, cornerRadius}, a filled box behind the word; stroke and shadow as set_text_style's, on the spoken word. A scaled or moving word never pushes its neighbours: lines and pages stay as they are. Any scale, track, underline, or box draws the node in pieces (an element per line and per word) for its whole lifetime. ${CAPTIONS} Refused with invalid-argument, unknown-node, unsupported-node for a node that is not captions, and invalid-result.`,
    example: {
      nodeId: 'node-captions',
      highlight: {
        color: '#ffd400',
        scale: 1.15,
        tracks: [
          {
            property: 'offset',
            keyframes: [
              { timeUs: 0, value: { x: 0, y: 0 }, easing: { kind: 'ease-out' } },
              { timeUs: 100_000, value: { x: 0, y: -12 }, easing: { kind: 'ease-in' } },
              { timeUs: 200_000, value: { x: 0, y: 0 }, easing: { kind: 'linear' } },
            ],
          },
        ],
        underline: { kind: 'solid', color: '#ffd400', thickness: 4, offset: 2 },
        box: { kind: 'none' },
        stroke: { kind: 'outside', color: '#000000', width: 3 },
        shadow: { kind: 'none' },
      },
    },
    argumentsSchema: setCaptionHighlightArgumentsSchema,
  },
  SetCaptionPageAnimation: {
    description: `Replaces how every page of a captions node enters (phase "in") or leaves (phase "out") with a complete page animation: {"kind":"none"} for at once, or {"kind":"animate", unit, staggerUs, order, tracks}: unit "word" or "line" of the page; every fragment runs the same tracks in its own time, which starts staggerUs (integer microseconds) after the fragment before it in the order; order and tracks as for add_text_animation. An entrance starts the first fragment's own time at the start of the page's first word; an exit ends the last fragment's last keyframe at the start of the next page, or on the last page at the end of the last word, so an exit usually ends at opacity 0. The page shown, and the words and lines on it, stay those of the style. An animated page draws the node in pieces for its whole lifetime. ${CAPTIONS} Refused with invalid-argument, unknown-node, unsupported-node for a node that is not captions, and invalid-result.`,
    example: {
      nodeId: 'node-captions',
      phase: 'in',
      animation: {
        kind: 'animate',
        unit: 'word',
        staggerUs: 60_000,
        order: { kind: 'forward' },
        tracks: [
          {
            property: 'opacity',
            keyframes: [
              { timeUs: 0, value: 0, easing: { kind: 'linear' } },
              { timeUs: 200_000, value: 1, easing: { kind: 'linear' } },
            ],
          },
          {
            property: 'offset',
            keyframes: [
              { timeUs: 0, value: { x: 0, y: 24 }, easing: { kind: 'ease-out' } },
              { timeUs: 200_000, value: { x: 0, y: 0 }, easing: { kind: 'linear' } },
            ],
          },
        ],
      },
    },
    argumentsSchema: setCaptionPageAnimationArgumentsSchema,
  },
  SetSafeArea: {
    description: `Replaces the safe area of the composition, {fromTop, fromRight, fromBottom, fromLeft}: integer composition pixels from each edge of the canvas to the part of the frame where captions and other text that must be read belong, clear of what a platform draws over the video; two opposite insets leave at least 1 pixel, and all zero is the whole canvas. It is a frame of reference, not a clip: it cuts and moves nothing, and nothing outside it is hidden. Keep captions inside it by placing their box with set_node_position and set_node_size. describe_document shows it. Refused with invalid-argument and invalid-result.`,
    example: { safeArea: { fromTop: 160, fromRight: 64, fromBottom: 320, fromLeft: 64 } },
    argumentsSchema: setSafeAreaArgumentsSchema,
  },
  AddEffect: {
    description: `Adds an effect to an image, video, text, captions node, group, or instance, or to a whole scene, at an index of its effects: effects apply in their order, the first to the content itself, after the corner radius and before the opacity and the transform, so a blur or a shadow turns and scales with the node; a group's or a scene's effects apply to everything in it composited together, and a scene transition then acts on the result. The effect is {id, kind, ...parameters, animations}: "blur" {radius} blurs by a Gaussian of that standard deviation in composition pixels (0 to 1000) and spills beyond the box; "brightness", "contrast", and "saturate" {amount} scale by a factor from 0 to 10 (1 changes nothing; brightness 0 is black, contrast and saturate 0 grey); "grayscale", "invert", and "sepia" {amount} apply from 0 (nothing) to 1 (all grey, the negative, all sepia); "hue-rotate" {angle} turns every hue by degrees; "drop-shadow" {color, opacity, offset {x, y}, blur} casts the shape's shadow (lowercase #rrggbb, 0 to 1, pixels -1000 to 1000, a blur radius 0 to 1000). Drawn by SVG filters in sRGB: "curves" {red, green, blue, amount} maps each channel through a table of 2 to 32 output levels from 0 to 1 at evenly spaced inputs ([0, 1] changes nothing, [1, 0] inverts) and mixes the result in by amount 0 to 1 (only amount animates); "color-grade" {lift, gamma, gain, temperature, tint} is a primary grade: white balance first (temperature -1 to 1 warms above 0, tint -1 to 1 goes magenta above 0), then black to lift (-1 to 1) and white to gain (0 to 10), then gamma 0.1 to 10 brightens the mid-tones above 1 (0, 1, 1, 0, 0 change nothing); "glow" {color, opacity, radius} draws the shape blurred by radius (0 to 1000, it spills beyond the box) and filled with the colour under it; "vignette" {amount, size} darkens the box towards its edges, amount 0 to 1, size 0.05 to 10 (small is tight, 0.5 typical); "chroma-key" {key, tolerance, softness, spill} makes a green or blue screen transparent by channel difference: a pixel goes transparent as its key channel exceeds the mean of the other two by tolerance (0 to 1, about 0.1) over softness (0.01 to 1, about 0.1), and spill 0 to 1 pulls the key colour out of what remains; it keys a channel, not any colour. animations animate parameters: at most one per parameter, {id, property, keyframes} with property the parameter's name (radius, amount, angle, color, opacity, offset, blur, lift, gamma, gain, temperature, tint, size, tolerance, softness, spill) and at least two keyframes {timeUs, value, easing} in ascending scene time, like a node's keyframes; a sampled value replaces the parameter, and before the first and after the last keyframe the nearest value holds; [] for none. ${EASINGS} An effect whose values change nothing still draws its holder in a pass of its own, a few levels from none; remove_effect for none. Refused with unknown-node when ownerId names no node or scene, unsupported-node for a background or Custom HTML, index-out-of-range, id-in-use, and invalid-result.`,
    example: {
      ownerId: 'node-image',
      index: 0,
      effect: {
        id: 'effect-image-blur',
        kind: 'blur',
        radius: 0,
        animations: [
          {
            id: 'effect-image-blur-a-radius',
            property: 'radius',
            keyframes: [
              { timeUs: 0, value: 12, easing: { kind: 'ease-out' } },
              { timeUs: 600_000, value: 0, easing: { kind: 'linear' } },
            ],
          },
        ],
      },
    },
    argumentsSchema: addEffectArgumentsSchema,
  },
  RemoveEffect: {
    description:
      'Removes one effect of a node or a scene with its animations; a node or a scene left without effects is drawn without a filter again, exactly as before it had one. Refused with unknown-effect when no effect has the ID.',
    example: { effectId: 'effect-image-blur' },
    argumentsSchema: removeEffectArgumentsSchema,
  },
  ReorderEffect: {
    description:
      "Moves one effect to another index of its owner's effects: 0 applies first, to the content itself. The order matters: a blur before a drop shadow blurs the shape whose shadow is cast, after it blurs the shadow too. Refused with unknown-effect and index-out-of-range.",
    example: { effectId: 'effect-image-blur', index: 1 },
    argumentsSchema: reorderEffectArgumentsSchema,
  },
  SetEffect: {
    description:
      'Replaces an effect with a complete new one of the same ID, as add_effect describes it: its kind, its parameters, and its animations, whose new IDs are unused in the document. To change one keyframe, send the whole effect with that keyframe changed. Refused with unknown-effect when no effect has its id, id-in-use, and invalid-result.',
    example: {
      effect: {
        id: 'effect-image-blur',
        kind: 'drop-shadow',
        color: '#000000',
        opacity: 0.5,
        offset: { x: 0, y: 8 },
        blur: 16,
        animations: [],
      },
    },
    argumentsSchema: setEffectArgumentsSchema,
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
  AddDefinition: {
    description: `Inserts one complete definition at an index of the definitions. ${DEFINITIONS} The definition is given exactly as the document stores it: an ID unused in the document, a sourceHash ('' or the host's sha256: label of the source it was made from, never checked), width and height in pixels, durationUs (at least 1), its nodes from the bottom layer to the top (each as add_node takes one), its audio clips, its clip transitions, and its template (inputs, bindings, conditions, repeats; all empty for a definition that is no element), every ID unused in the document, every time in definition time. Place it with add_node and an instance node. Refused with index-out-of-range, id-in-use with the IDs already taken, and invalid-result when the definition is not one the document can hold.`,
    example: {
      index: 0,
      definition: {
        id: 'definition-badge',
        sourceHash: '',
        width: 200,
        height: 200,
        durationUs: 1_000_000,
        nodes: [
          {
            id: 'node-badge-background',
            type: 'background',
            startUs: 0,
            durationUs: 1_000_000,
            color: '#000000',
            animations: [],
          },
        ],
        clips: [],
        transitions: [],
        template: { inputs: [], bindings: [], conditions: [], repeats: [] },
      },
    },
    argumentsSchema: addDefinitionArgumentsSchema,
  },
  RemoveDefinition: {
    description: `Removes one definition with its nodes and clips; its assets stay declared. ${DEFINITIONS} Refused with unknown-definition, and definition-in-use with the IDs of the instances that place it: remove or expand them first, in the same transaction.`,
    example: { definitionId: 'definition-badge' },
    argumentsSchema: removeDefinitionArgumentsSchema,
  },
  ConvertToDefinition: {
    description: `Moves a run of sibling nodes, from fromNodeId up to toNodeId in layer order, out of a scene or a definition into a new definition with the canvas and duration of that holder, and puts one instance of it in their place, showing them as before: from time 0 over the whole holder, filling the canvas, untransformed. The nodes keep their IDs and times. ${DEFINITIONS} The instance composites its nodes as one layer, so a blend mode inside it blends with the nodes of the definition only. Refused with unknown-node, unsupported-node for a child of a group or when toNodeId is not a sibling at or above fromNodeId, invalid-argument when a new ID is not of the document's form or the two new IDs are equal, index-out-of-range, id-in-use, transition-in-use and matte-in-use while a transition or a matte joins a moved and a staying node (remove them first, in the same transaction), and invalid-result when a moved node cannot be in a definition (a video or Custom HTML node).`,
    example: {
      fromNodeId: 'node-group',
      toNodeId: 'node-group',
      definitionId: 'definition-group',
      instanceId: 'node-group-instance',
      index: 0,
    },
    argumentsSchema: convertToDefinitionArgumentsSchema,
  },
  ExpandInstance: {
    description: `Puts the nodes of an instance's definition in the instance's place, with their IDs and times, and removes the definition: the inverse of convert_to_definition. ${DEFINITIONS} Refused with unknown-node, unsupported-node when the node is not an instance, and instance-not-expandable unless the instance shows its definition exactly as its nodes placed directly would (from time 0 over the whole holder, filling the holder's canvas, untransformed, without effects, mask, matte, blend mode, or input values, the definition of the holder's canvas and duration with nodes and without clips, transitions, source hash, or template) and no other instance places the definition.`,
    example: { instanceId: 'node-group-instance' },
    argumentsSchema: expandInstanceArgumentsSchema,
  },
  SetInstanceInput: {
    description: `Gives one input of an element instance a value, replacing the instance's value of that input; the instance shows its definition instantiated with its values at once. ${DEFINITIONS} The value is given as the instance stores it: { inputId, type, value }, with the input's ID and type (text, number, boolean, color, or list) and a value within the input's constraints; a list value is an array of items, each an array of { key, type, value } in the order of the list's fields. Refused with unknown-node, unsupported-node when the node is not an instance, unknown-input when its definition has no such input, and invalid-result when the value does not fit the input or the definition instantiated with it is not one the document can hold.`,
    example: {
      instanceId: 'node-lower-third',
      input: { inputId: 'title', type: 'text', value: 'Ada Lovelace' },
    },
    argumentsSchema: setInstanceInputArgumentsSchema,
  },
  ClearInstanceInput: {
    description: `Removes an instance's value of one input, which then takes its default; nothing changes when the instance gives it no value. ${DEFINITIONS} Refused with unknown-node, unsupported-node when the node is not an instance, unknown-input when its definition has no such input, and invalid-result when the definition instantiated with the defaults is not one the document can hold.`,
    example: { instanceId: 'node-lower-third', inputId: 'title' },
    argumentsSchema: clearInstanceInputArgumentsSchema,
  },
  ReplaceDefinition: {
    description: `Replaces one definition whole, keeping its ID and its place among the definitions: its sourceHash, canvas, duration, nodes, clips, transitions, and template, given exactly as the document stores them (see add_definition). It is how an element's template, its inputs, bindings, conditions, and repeats, is edited, and how a host brings an element up to a new version of its source. ${DEFINITIONS} Refused with unknown-definition, invalid-result when definition.id is not definitionId or the definition is not one the document can hold, id-in-use with the IDs it would add that the document already uses, and instance-inputs-mismatch with the IDs of the instances whose values would no longer fit it: set or clear them first, in the same transaction.`,
    example: {
      definitionId: 'definition-badge',
      definition: {
        id: 'definition-badge',
        sourceHash: '',
        width: 200,
        height: 200,
        durationUs: 1_000_000,
        nodes: [
          {
            id: 'node-badge-background',
            type: 'background',
            startUs: 0,
            durationUs: 1_000_000,
            color: '#ffffff',
            animations: [],
          },
        ],
        clips: [],
        transitions: [],
        template: { inputs: [], bindings: [], conditions: [], repeats: [] },
      },
    },
    argumentsSchema: replaceDefinitionArgumentsSchema,
  },
  SetCustomHtml: {
    description: `Replaces the html, the fonts, and the parameters of a Custom HTML element at once. ${CUSTOM_HTML} Refused with invalid-argument when html is longer than 262144 characters, unknown-node, unsupported-node when the node is not Custom HTML, binding-in-use when a template binds a parameter whose value changes, and invalid-result when a font is no font asset of the document or listed twice, or the parameters are not sorted by key.`,
    example: {
      nodeId: 'node-custom-html',
      html: '<style>html,body{margin:0;height:100%}#dot{width:40px;height:40px;border-radius:50%;background:var(--accent);animation:move 2s linear infinite alternate}@keyframes move{to{transform:translateX(200px)}}</style><div id="dot"></div>',
      fontAssetIds: [],
      parameters: [{ key: 'accent', type: 'color', value: '#f79009' }],
    },
    argumentsSchema: setCustomHtmlArgumentsSchema,
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

/**
 * The commands of the schema, their argument schemas, and the parsers of their
 * fields (D30.1, D30.3, D38.2, D38.3). A command is a plain JSON value, so it
 * survives the transport between a host, the UI, and an AI tool call. The
 * JSON Schema of each command's arguments lives here, next to the parser it
 * must agree with, so an AI tool contract wraps it instead of restating it
 * (D31.2). `parseCommand` (in `registry.ts`) is the only way a command comes
 * into existence; the parsers here read the fields of one command type.
 */
import {
  BLEND_MODES,
  compositionSchema,
  type Asset,
  type BlendMode,
  type Crop,
  type Fit,
  type Focus,
  type Origin,
} from '@kadrion/schema';

import { keyframeTimeBounds } from './animations.js';
import { lifetimeBounds, type Bounds } from './lifetimes.js';
import type { DocumentObject } from './document.js';
import { EditorError } from './errors.js';

export interface CommandPosition {
  readonly x: number;
  readonly y: number;
}

/** What a caller states for `SetNodePosition`; the command adds its discriminator (D31.2). */
export interface SetNodePositionArguments {
  readonly nodeId: string;
  readonly position: CommandPosition;
}

/** Replaces the node's base position with an absolute one, in composition pixels (D15, D30.1). */
export interface SetNodePositionCommand extends SetNodePositionArguments {
  readonly type: 'SetNodePosition';
}

/** What a caller states for `SetNodeOpacity` (D38.2). */
export interface SetNodeOpacityArguments {
  readonly nodeId: string;
  readonly opacity: number;
}

/** Replaces the node's base opacity, from 0 to 1 inclusive; an opacity animation multiplies it (D16). */
export interface SetNodeOpacityCommand extends SetNodeOpacityArguments {
  readonly type: 'SetNodeOpacity';
}

/** What a caller states for `SetTextContent` (D38.3). */
export interface SetTextContentArguments {
  readonly nodeId: string;
  readonly text: string;
}

/** Replaces the text of a text node, exactly as given; line breaks are kept. */
export interface SetTextContentCommand extends SetTextContentArguments {
  readonly type: 'SetTextContent';
}

/** What a caller states for `AddNode` (D39.1). */
export interface AddNodeArguments {
  /** The scene, or a group, whose list receives the node. */
  readonly parentId: string;
  /** The node's index in that list after the insertion, from 0 to the list's length. */
  readonly index: number;
  /** The complete node, with every ID of its subtree and its `animations` arrays. */
  readonly node: DocumentObject;
}

/** Inserts a complete node, with its animations and children, into a list (D39.1). */
export interface AddNodeCommand extends AddNodeArguments {
  readonly type: 'AddNode';
}

/** What a caller states for `RemoveNode` (D39.1). */
export interface RemoveNodeArguments {
  readonly nodeId: string;
}

/** Removes a node with its whole subtree: its animations, and a group's children with theirs. */
export interface RemoveNodeCommand extends RemoveNodeArguments {
  readonly type: 'RemoveNode';
}

/** What a caller states for `DuplicateNode` (D39.1). */
export interface DuplicateNodeArguments {
  readonly nodeId: string;
  /** The ID of the copy; every other ID of the copy derives from it (D39.3). */
  readonly newNodeId: string;
}

/** Copies a node's subtree directly after the source in the same list (D39.2). */
export interface DuplicateNodeCommand extends DuplicateNodeArguments {
  readonly type: 'DuplicateNode';
}

/** What a caller states for `ReorderNode` (D39.1). */
export interface ReorderNodeArguments {
  readonly nodeId: string;
  /** The node's index in its own list after the move. */
  readonly index: number;
}

/** Moves a node within its own list; the only command that moves an existing node (D39.2). */
export interface ReorderNodeCommand extends ReorderNodeArguments {
  readonly type: 'ReorderNode';
}

/** A scale as the document stores it: two factors from 0 to 1000 (D15, D40.1). */
export interface CommandScale {
  readonly x: number;
  readonly y: number;
}

/** What a caller states for `SetNodeScale` (D40.1). */
export interface SetNodeScaleArguments {
  readonly nodeId: string;
  readonly scale: CommandScale;
}

/** Replaces the node's base scale; a scale animation multiplies it (D16.6). */
export interface SetNodeScaleCommand extends SetNodeScaleArguments {
  readonly type: 'SetNodeScale';
}

/** What a caller states for `SetNodeSize` (D40.1). */
export interface SetNodeSizeArguments {
  readonly nodeId: string;
  readonly width: number;
  readonly height: number;
}

/** Replaces the size of an image or a Custom HTML element, in composition pixels (D40.1). */
export interface SetNodeSizeCommand extends SetNodeSizeArguments {
  readonly type: 'SetNodeSize';
}

/** What a caller states for `SetNodeColor` (D40.1). */
export interface SetNodeColorArguments {
  readonly nodeId: string;
  readonly color: string;
}

/** Replaces the colour of a text or a background, stored in lower case (D40.1). */
export interface SetNodeColorCommand extends SetNodeColorArguments {
  readonly type: 'SetNodeColor';
}

/** What a caller states for `SetTextFontSize` (D40.1). */
export interface SetTextFontSizeArguments {
  readonly nodeId: string;
  readonly fontSize: number;
}

/** Replaces the font size of a text, in composition pixels (D40.1). */
export interface SetTextFontSizeCommand extends SetTextFontSizeArguments {
  readonly type: 'SetTextFontSize';
}

/** What a caller states for `SetTextFont` (D40.2). */
export interface SetTextFontArguments {
  readonly nodeId: string;
  readonly fontAssetId: string;
}

/** Points a text at another font asset of the document (D40.2). */
export interface SetTextFontCommand extends SetTextFontArguments {
  readonly type: 'SetTextFont';
}

/** What a caller states for `SetImageAsset` (D40.2). */
export interface SetImageAssetArguments {
  readonly nodeId: string;
  readonly assetId: string;
}

/** Points an image at another image asset of the document (D40.2). */
export interface SetImageAssetCommand extends SetImageAssetArguments {
  readonly type: 'SetImageAsset';
}

/** The type of an asset, as the document's schema lists it (D40.3). */
export type AssetType = Asset['type'];

/** An asset as a command carries it: the document's own shape, copied and frozen (D40.3). */
export interface AssetData {
  readonly id: string;
  readonly type: AssetType;
  readonly contentHash: string;
}

/** What a caller states for `AddAsset` (D40.3). */
export interface AddAssetArguments {
  readonly asset: AssetData;
  /** The asset's index in `assets` after the insertion, from 0 to the length. */
  readonly index: number;
}

/** Declares an asset, pinned by its content hash (D14, D40.3). */
export interface AddAssetCommand extends AddAssetArguments {
  readonly type: 'AddAsset';
}

/** What a caller states for `RemoveAsset` (D40.3). */
export interface RemoveAssetArguments {
  readonly assetId: string;
}

/** Removes an asset that nothing uses (D40.3, D40.4). */
export interface RemoveAssetCommand extends RemoveAssetArguments {
  readonly type: 'RemoveAsset';
}

/** What a caller states for `AddAnimation` (D41.1). */
export interface AddAnimationArguments {
  readonly nodeId: string;
  /** The animation's index in the node's `animations` after the insertion, from 0 to the length. */
  readonly index: number;
  /** The complete animation, with its ID and its keyframes, as exact data (D41.3). */
  readonly animation: DocumentObject;
}

/** Inserts a complete animation into a node's `animations` (D41.1). */
export interface AddAnimationCommand extends AddAnimationArguments {
  readonly type: 'AddAnimation';
}

/** What a caller states for `RemoveAnimation` (D41.1). */
export interface RemoveAnimationArguments {
  readonly animationId: string;
}

/** Removes one animation (D41.1). */
export interface RemoveAnimationCommand extends RemoveAnimationArguments {
  readonly type: 'RemoveAnimation';
}

/** What a caller states for `SetOpacityKeyframe` (D41.1). */
export interface SetOpacityKeyframeArguments {
  readonly animationId: string;
  readonly timeUs: number;
  readonly opacity: number;
}

/** Sets, or inserts, the keyframe at a time of an opacity animation (D41.1). */
export interface SetOpacityKeyframeCommand extends SetOpacityKeyframeArguments {
  readonly type: 'SetOpacityKeyframe';
}

/** What a caller states for `SetPositionKeyframe` (D41.1). */
export interface SetPositionKeyframeArguments {
  readonly animationId: string;
  readonly timeUs: number;
  readonly offset: CommandPosition;
}

/** Sets, or inserts, the keyframe at a time of a position animation (D41.1). */
export interface SetPositionKeyframeCommand extends SetPositionKeyframeArguments {
  readonly type: 'SetPositionKeyframe';
}

/** What a caller states for `SetScaleKeyframe` (D41.1). */
export interface SetScaleKeyframeArguments {
  readonly animationId: string;
  readonly timeUs: number;
  readonly factor: CommandScale;
}

/** Sets, or inserts, the keyframe at a time of a scale animation (D41.1). */
export interface SetScaleKeyframeCommand extends SetScaleKeyframeArguments {
  readonly type: 'SetScaleKeyframe';
}

/** What a caller states for `AddKeyframe` (D41.1). */
export interface AddKeyframeArguments {
  readonly animationId: string;
  /** The keyframe as exact data; its `timeUs` is checked, the rest is the validator's (D41.3). */
  readonly keyframe: DocumentObject;
}

/** Inserts a keyframe given as exact data, at the place its time gives it (D41.1). */
export interface AddKeyframeCommand extends AddKeyframeArguments {
  readonly type: 'AddKeyframe';
}

/** What a caller states for `RemoveKeyframe` (D41.1). */
export interface RemoveKeyframeArguments {
  readonly animationId: string;
  readonly timeUs: number;
}

/** Removes the keyframe at a time; refused below the schema's minimum (D41.4). */
export interface RemoveKeyframeCommand extends RemoveKeyframeArguments {
  readonly type: 'RemoveKeyframe';
}

/** What a caller states for `MoveKeyframe` (D41.1). */
export interface MoveKeyframeArguments {
  readonly animationId: string;
  readonly timeUs: number;
  readonly toTimeUs: number;
}

/** Gives the keyframe at a time another, free time (D41.1). */
export interface MoveKeyframeCommand extends MoveKeyframeArguments {
  readonly type: 'MoveKeyframe';
}

/** What a caller states for `SetKeyframeEasing` (D67.7). */
export interface SetKeyframeEasingArguments {
  readonly animationId: string;
  readonly timeUs: number;
  /** The complete easing, as the document stores it. */
  readonly easing: DocumentObject;
}

/** Replaces how the segment that starts at the keyframe at a time moves (D67.7). */
export interface SetKeyframeEasingCommand extends SetKeyframeEasingArguments {
  readonly type: 'SetKeyframeEasing';
}

/** The arguments of `SetNodeLifetime`, in the time of its scene (D42.10, D54.3). */
export interface SetNodeLifetimeArguments {
  readonly nodeId: string;
  /** From when the node is active, in integer microseconds. */
  readonly startUs: number;
  /** For how long, in integer microseconds, at least 1. */
  readonly durationUs: number;
}

/**
 * Sets the lifetime of a node: when it is shown (D42.2, D42.10). It moves no
 * keyframe; an animation keeps its scene times.
 */
export interface SetNodeLifetimeCommand extends SetNodeLifetimeArguments {
  readonly type: 'SetNodeLifetime';
}

/** What a caller states for `SetNodeFit` (D50.6). */
export interface SetNodeFitArguments {
  readonly nodeId: string;
  readonly fit: Fit;
}

/** How an image or a video meets its box: `fill`, `contain`, or `cover` (D50.1, D50.6). */
export interface SetNodeFitCommand extends SetNodeFitArguments {
  readonly type: 'SetNodeFit';
}

/** What a caller states for `SetNodeFocus` (D63.4). */
export interface SetNodeFocusArguments {
  readonly nodeId: string;
  readonly focus: Focus;
}

/**
 * Which point of the picture of an image or a video its fit keeps in place, in
 * per mille of the picture's width and height (D63.1, D63.4).
 */
export interface SetNodeFocusCommand extends SetNodeFocusArguments {
  readonly type: 'SetNodeFocus';
}

/** What a caller states for `SetNodeRotation` (D68). */
export interface SetNodeRotationArguments {
  readonly nodeId: string;
  /** Degrees, positive clockwise; never rounded. */
  readonly rotation: number;
}

/** The rotation of a node about its origin, in degrees (D68). */
export interface SetNodeRotationCommand extends SetNodeRotationArguments {
  readonly type: 'SetNodeRotation';
}

/** What a caller states for `SetNodeOrigin` (D68). */
export interface SetNodeOriginArguments {
  readonly nodeId: string;
  readonly origin: Origin;
}

/**
 * The point of a node's box that its scale and rotation are about, in per
 * mille of the box (D68). The node's position is not changed.
 */
export interface SetNodeOriginCommand extends SetNodeOriginArguments {
  readonly type: 'SetNodeOrigin';
}

/** What a caller states for `SetNodeCrop` (D68). */
export interface SetNodeCropArguments {
  readonly nodeId: string;
  readonly crop: Crop;
}

/** What is cut away of the picture of an image or a video, in per mille from each edge (D68). */
export interface SetNodeCropCommand extends SetNodeCropArguments {
  readonly type: 'SetNodeCrop';
}

/** What a caller states for `SetNodeCornerRadius` (D68). */
export interface SetNodeCornerRadiusArguments {
  readonly nodeId: string;
  /** Composition pixels, rounded like a position (D15). */
  readonly cornerRadius: number;
}

/** The radius of the corners of an image or a video, in composition pixels (D68). */
export interface SetNodeCornerRadiusCommand extends SetNodeCornerRadiusArguments {
  readonly type: 'SetNodeCornerRadius';
}

/** A keyframe value of `SetKeyframeValue` as given: the animation's property says what it is (D65.2). */
export type KeyframeValueData = number | string | DocumentObject;

/** What a caller states for `SetKeyframeValue` (D65.2, D68). */
export interface SetKeyframeValueArguments {
  readonly animationId: string;
  readonly timeUs: number;
  /** Judged by the property of the animation when the command applies. */
  readonly value: KeyframeValueData;
}

/**
 * Sets, or inserts, the keyframe at a time of an animation of a property of
 * schema 0.13 — rotation, origin, size, color, crop, or cornerRadius (D65.2,
 * D68) — or of a shape — fill, stroke/color, stroke/width, trim/start,
 * trim/end, or geometry (D73). Opacity, position, and scale keep their typed
 * commands.
 */
export interface SetKeyframeValueCommand extends SetKeyframeValueArguments {
  readonly type: 'SetKeyframeValue';
}

/** What a caller states for `SetVideoAsset` (D50.6). */
export interface SetVideoAssetArguments {
  readonly nodeId: string;
  readonly assetId: string;
}

/**
 * Points a video node at another video asset of the document; its source start,
 * size, and fit stay. Its sampled source range is checked against the media
 * facts of the new asset (D49.6, D50.6).
 */
export interface SetVideoAssetCommand extends SetVideoAssetArguments {
  readonly type: 'SetVideoAsset';
}

/** What a caller states for `SetVideoSource` (D50.6). */
export interface SetVideoSourceArguments {
  readonly nodeId: string;
  readonly sourceStartUs: number;
}

/**
 * Sets the source time a video node shows at its start (D49.1); its lifetime
 * stays. The sampled source range is checked against the media facts (D49.6).
 */
export interface SetVideoSourceCommand extends SetVideoSourceArguments {
  readonly type: 'SetVideoSource';
}

/** What a caller states for `SetVideoVolume` (D52.6). */
export interface SetVideoVolumeArguments {
  readonly nodeId: string;
  readonly volume: number;
}

/** Sets how loud the sound of a video node is heard: 0 is silent, 1 the source as it is (D52.1). */
export interface SetVideoVolumeCommand extends SetVideoVolumeArguments {
  readonly type: 'SetVideoVolume';
}

/** What a caller states for `AddAudioClip` (D52.6). */
export interface AddAudioClipArguments {
  /** The clip's index in `clips` after the insertion, from 0 to their number. */
  readonly index: number;
  /** The complete clip, as the document stores it. */
  readonly clip: DocumentObject;
}

/** Inserts a complete audio clip into the document's clips (D52.6); their order is not heard. */
export interface AddAudioClipCommand extends AddAudioClipArguments {
  readonly type: 'AddAudioClip';
}

/** What a caller states for `RemoveAudioClip` (D52.6). */
export interface RemoveAudioClipArguments {
  readonly clipId: string;
}

/** Removes one audio clip (D52.6). */
export interface RemoveAudioClipCommand extends RemoveAudioClipArguments {
  readonly type: 'RemoveAudioClip';
}

/** What a caller states for `SetClipVolume` (D52.6). */
export interface SetClipVolumeArguments {
  readonly clipId: string;
  readonly volume: number;
}

/** Sets the volume of an audio clip, from 0 (silent) to 1 (the source as it is) (D52.1). */
export interface SetClipVolumeCommand extends SetClipVolumeArguments {
  readonly type: 'SetClipVolume';
}

/** What a caller states for `SetClipFades` (D52.6). */
export interface SetClipFadesArguments {
  readonly clipId: string;
  readonly fadeInUs: number;
  readonly fadeOutUs: number;
}

/** Sets both linear fades of an audio clip; together they fit in its lifetime (D52.2). */
export interface SetClipFadesCommand extends SetClipFadesArguments {
  readonly type: 'SetClipFades';
}

/** What a caller states for `SetClipSource` (D52.6). */
export interface SetClipSourceArguments {
  readonly clipId: string;
  readonly assetId: string;
  readonly sourceStartUs: number;
}

/** Points an audio clip at an audio asset and the source time it plays from (D52.6). */
export interface SetClipSourceCommand extends SetClipSourceArguments {
  readonly type: 'SetClipSource';
}

/** What a caller states for `AddScene` (D54.5). */
export interface AddSceneArguments {
  /** The scene's index in `scenes` after the insertion, from 0 to their number. */
  readonly index: number;
  /** The complete scene, with its duration, nodes, and clips, as the document stores it. */
  readonly scene: DocumentObject;
}

/** Inserts a complete scene into the sequence; the composition grows by its duration (D54.5). */
export interface AddSceneCommand extends AddSceneArguments {
  readonly type: 'AddScene';
}

/** What a caller states for `RemoveScene` (D54.5). */
export interface RemoveSceneArguments {
  readonly sceneId: string;
}

/** Removes a scene with everything in it; the composition shrinks by its duration (D54.5). */
export interface RemoveSceneCommand extends RemoveSceneArguments {
  readonly type: 'RemoveScene';
}

/** What a caller states for `DuplicateScene` (D54.5). */
export interface DuplicateSceneArguments {
  readonly sceneId: string;
  /** The ID of the copy; every other ID of the copy derives from it (D39.3, D54.5). */
  readonly newSceneId: string;
}

/** Copies a scene directly after the source; the composition grows by its duration (D54.5). */
export interface DuplicateSceneCommand extends DuplicateSceneArguments {
  readonly type: 'DuplicateScene';
}

/** What a caller states for `ReorderScene` (D54.5). */
export interface ReorderSceneArguments {
  readonly sceneId: string;
  /** The scene's index in `scenes` after the move. */
  readonly index: number;
}

/** Moves a scene to another place in the sequence; nothing inside it moves (D54.5). */
export interface ReorderSceneCommand extends ReorderSceneArguments {
  readonly type: 'ReorderScene';
}

/** What a caller states for `SetSceneDuration` (D54.5). */
export interface SetSceneDurationArguments {
  readonly sceneId: string;
  readonly durationUs: number;
}

/** Sets how long a scene lasts; the composition's duration changes by the same amount (D54.5). */
export interface SetSceneDurationCommand extends SetSceneDurationArguments {
  readonly type: 'SetSceneDuration';
}

/** What a caller states for `MoveNodeToScene` (D54.5). */
export interface MoveNodeToSceneArguments {
  readonly nodeId: string;
  readonly sceneId: string;
  /** The node's index in the nodes of that scene after the move. */
  readonly index: number;
}

/** Moves a node of a scene's own list into a list of another scene, keeping its scene times (D49.3, D54.5). */
export interface MoveNodeToSceneCommand extends MoveNodeToSceneArguments {
  readonly type: 'MoveNodeToScene';
}

/** What a caller states for `AddSceneAudioClip` (D54.5). */
export interface AddSceneAudioClipArguments {
  readonly sceneId: string;
  /** The clip's index in the scene's clips after the insertion, from 0 to their number. */
  readonly index: number;
  /** The complete clip, as the document stores it, in scene time. */
  readonly clip: DocumentObject;
}

/** Inserts a complete audio clip into a scene's clips (D54.5); it moves with the scene. */
export interface AddSceneAudioClipCommand extends AddSceneAudioClipArguments {
  readonly type: 'AddSceneAudioClip';
}

/** What a caller states for `MoveClip` (D55.2). */
export interface MoveClipArguments {
  /** The ID of a node or of an audio clip (D55.1). */
  readonly clipId: string;
  /** The clip's new start, in the time of its scene, or composition time for a composition clip. */
  readonly startUs: number;
}

/**
 * Moves a clip to a new start, keeping its duration and source; a node's
 * keyframes, and a group's children with theirs, move by the same amount (D55.3).
 */
export interface MoveClipCommand extends MoveClipArguments {
  readonly type: 'MoveClip';
}

/** What a caller states for `TrimClipStart` (D55.2). */
export interface TrimClipStartArguments {
  readonly clipId: string;
  /** The clip's new start; its end stays where it is. */
  readonly startUs: number;
}

/** Moves a clip's start and keeps its end; a source's start moves by the same amount (D49.1, D55.2). */
export interface TrimClipStartCommand extends TrimClipStartArguments {
  readonly type: 'TrimClipStart';
}

/** What a caller states for `TrimClipEnd` (D55.2). */
export interface TrimClipEndArguments {
  readonly clipId: string;
  /** The clip's new end, exclusive; its start stays where it is. */
  readonly endUs: number;
}

/** Moves a clip's end and keeps its start (D49.1, D55.2). */
export interface TrimClipEndCommand extends TrimClipEndArguments {
  readonly type: 'TrimClipEnd';
}

/** What a caller states for `SplitClip` (D55.2). */
export interface SplitClipArguments {
  readonly clipId: string;
  /** The time of the cut, strictly inside the clip's lifetime. */
  readonly atUs: number;
  /** The ID of the second half, unused in the document (D39.3). */
  readonly newClipId: string;
}

/** Cuts a clip into two that meet at `atUs`, the second directly after the first (D49.1, D55.4). */
export interface SplitClipCommand extends SplitClipArguments {
  readonly type: 'SplitClip';
}

/** What a caller states for `JoinClips` (D55.5). */
export interface JoinClipsArguments {
  readonly clipId: string;
  /** The clip directly after it, exactly as a split of the joined clip would make it. */
  readonly nextClipId: string;
}

/** Joins a clip with the one a split made of it: the inverse of `SplitClip` (D55.5). */
export interface JoinClipsCommand extends JoinClipsArguments {
  readonly type: 'JoinClips';
}

/** What a caller states for `AddSceneTransition` (D56.6). */
export interface AddSceneTransitionArguments {
  /** The transition's index in the composition's transitions after the insertion; their order has no meaning. */
  readonly index: number;
  /** The complete transition, as the document stores it. */
  readonly transition: DocumentObject;
}

/**
 * Inserts a transition on the boundary between two adjacent scenes; the
 * composition becomes shorter by its duration, and every later scene starts
 * that much earlier (D49.3, D56.6).
 */
export interface AddSceneTransitionCommand extends AddSceneTransitionArguments {
  readonly type: 'AddSceneTransition';
}

/** What a caller states for `AddClipTransition` (D56.6). */
export interface AddClipTransitionArguments {
  readonly sceneId: string;
  /** The transition's index in the scene's transitions after the insertion; their order has no meaning. */
  readonly index: number;
  /** The complete transition, as the document stores it. */
  readonly transition: DocumentObject;
}

/** Inserts a transition between two clips of one layer of a scene; nothing moves (D49.4, D56.6). */
export interface AddClipTransitionCommand extends AddClipTransitionArguments {
  readonly type: 'AddClipTransition';
}

/** What a caller states for `RemoveTransition` (D56.6). */
export interface RemoveTransitionArguments {
  readonly transitionId: string;
}

/** Removes a scene or clip transition; a scene transition's duration is given back to the composition (D56.6). */
export interface RemoveTransitionCommand extends RemoveTransitionArguments {
  readonly type: 'RemoveTransition';
}

/** What a caller states for `SetTransitionDuration` (D56.6). */
export interface SetTransitionDurationArguments {
  readonly transitionId: string;
  readonly durationUs: number;
}

/**
 * Sets how long a transition lasts: a scene transition changes the
 * composition's duration by the opposite amount; a clip transition changes the
 * outgoing clip's duration by the same amount, so that the overlap follows
 * (D56.6).
 */
export interface SetTransitionDurationCommand extends SetTransitionDurationArguments {
  readonly type: 'SetTransitionDuration';
}

/** What a caller states for `SetTransitionEffect` (D56.6). */
export interface SetTransitionEffectArguments {
  readonly transitionId: string;
  /** The complete effect, as the document stores it. */
  readonly effect: DocumentObject;
}

/** Replaces how a transition combines its two sides; no time changes (D56.6). */
export interface SetTransitionEffectCommand extends SetTransitionEffectArguments {
  readonly type: 'SetTransitionEffect';
}

/** What a caller states for `SetTransitionEasing` (D67.7). */
export interface SetTransitionEasingArguments {
  readonly transitionId: string;
  /** The complete easing, as the document stores it. */
  readonly easing: DocumentObject;
}

/** Replaces how the progress of a transition moves; no time changes (D67.7). */
export interface SetTransitionEasingCommand extends SetTransitionEasingArguments {
  readonly type: 'SetTransitionEasing';
}

/** What a caller states for `SetCaptionWords` (D57.5). */
export interface SetCaptionWordsArguments {
  readonly nodeId: string;
  /** Every word, as the document stores it, in the order they are spoken. */
  readonly words: readonly DocumentObject[];
}

/** Replaces every word of a captions node: a new transcription (D57.5). */
export interface SetCaptionWordsCommand extends SetCaptionWordsArguments {
  readonly type: 'SetCaptionWords';
}

/** What a caller states for `SetCaptionWord` (D57.5). */
export interface SetCaptionWordArguments {
  readonly nodeId: string;
  /** The index of the word in the node's `words`, from 0. */
  readonly index: number;
  /** The complete word, as the document stores it. */
  readonly word: DocumentObject;
}

/** Replaces one word of a captions node: its text, its timing, or both (D57.5). */
export interface SetCaptionWordCommand extends SetCaptionWordArguments {
  readonly type: 'SetCaptionWord';
}

/** What a caller states for `SetCaptionStyle` (D57.5). */
export interface SetCaptionStyleArguments {
  readonly nodeId: string;
  /** The complete style, as the document stores it. */
  readonly style: DocumentObject;
}

/** Replaces the style of a captions node; no word and no time changes (D57.5). */
export interface SetCaptionStyleCommand extends SetCaptionStyleArguments {
  readonly type: 'SetCaptionStyle';
}

/** What a caller states for `SetTextStyle` (D69). */
export interface SetTextStyleArguments {
  readonly nodeId: string;
  /** The complete style, as the document stores it. */
  readonly style: DocumentObject;
}

/** Replaces the outline, the shadow, and the box of a text node (D69). */
export interface SetTextStyleCommand extends SetTextStyleArguments {
  readonly type: 'SetTextStyle';
}

/** What a caller states for `SetShapeGeometry` (D73). */
export interface SetShapeGeometryArguments {
  readonly nodeId: string;
  /** The complete geometry, as the document stores it. */
  readonly geometry: DocumentObject;
}

/** Replaces what a shape draws: a rectangle, an ellipse, a polygon, or a path (D73). */
export interface SetShapeGeometryCommand extends SetShapeGeometryArguments {
  readonly type: 'SetShapeGeometry';
}

/** What a caller states for `SetShapeFill` (D73). */
export interface SetShapeFillArguments {
  readonly nodeId: string;
  /** The complete fill, as the document stores it. */
  readonly fill: DocumentObject;
}

/** Replaces what the inside of a shape is painted with (D73). */
export interface SetShapeFillCommand extends SetShapeFillArguments {
  readonly type: 'SetShapeFill';
}

/** What a caller states for `SetShapeStroke` (D73). */
export interface SetShapeStrokeArguments {
  readonly nodeId: string;
  /** The complete stroke, as the document stores it. */
  readonly stroke: DocumentObject;
}

/** Replaces the outline of a shape: its colour, width, dashes, caps, and joins (D73). */
export interface SetShapeStrokeCommand extends SetShapeStrokeArguments {
  readonly type: 'SetShapeStroke';
}

/** The part of the outline of a shape that its stroke draws, in per mille of its length (D73). */
export interface ShapeTrim {
  readonly start: number;
  readonly end: number;
}

/** What a caller states for `SetShapeTrim` (D73). */
export interface SetShapeTrimArguments {
  readonly nodeId: string;
  readonly trim: ShapeTrim;
}

/** Sets the part of the outline of a shape that its stroke draws (D73). */
export interface SetShapeTrimCommand extends SetShapeTrimArguments {
  readonly type: 'SetShapeTrim';
}

/** What a caller states for `SetBlendMode` (D75). */
export interface SetBlendModeArguments {
  readonly nodeId: string;
  readonly blendMode: BlendMode;
}

/** Sets how a node blends with what lies below it in its scene or group (D75). */
export interface SetBlendModeCommand extends SetBlendModeArguments {
  readonly type: 'SetBlendMode';
}

/** What a caller states for `SetNodeMask` (D75). */
export interface SetNodeMaskArguments {
  readonly nodeId: string;
  /** The complete mask, as the document stores it. */
  readonly mask: DocumentObject;
}

/** Replaces what masks a node: nothing, a shape, or an image (D75). */
export interface SetNodeMaskCommand extends SetNodeMaskArguments {
  readonly type: 'SetNodeMask';
}

/** What a caller states for `SetNodeMatte` (D75). */
export interface SetNodeMatteArguments {
  readonly nodeId: string;
  /** The complete matte, as the document stores it. */
  readonly matte: DocumentObject;
}

/** Replaces which sibling shape mattes a node, and how (D75). */
export interface SetNodeMatteCommand extends SetNodeMatteArguments {
  readonly type: 'SetNodeMatte';
}

/** What a caller states for `AddTextAnimation` (D69). */
export interface AddTextAnimationArguments {
  readonly nodeId: string;
  /** The text animation's index in the node's `textAnimations` after the insertion. */
  readonly index: number;
  /** The complete text animation, with its ID and its tracks, as exact data. */
  readonly animation: DocumentObject;
}

/** Inserts a complete text animation into a text node's `textAnimations` (D69). */
export interface AddTextAnimationCommand extends AddTextAnimationArguments {
  readonly type: 'AddTextAnimation';
}

/** What a caller states for `RemoveTextAnimation` (D69). */
export interface RemoveTextAnimationArguments {
  readonly textAnimationId: string;
}

/** Removes one text animation (D69). */
export interface RemoveTextAnimationCommand extends RemoveTextAnimationArguments {
  readonly type: 'RemoveTextAnimation';
}

/** What a caller states for `SetTextAnimation` (D69). */
export interface SetTextAnimationArguments {
  /** The complete text animation; its `id` names the one it replaces. */
  readonly animation: DocumentObject;
}

/** Replaces a text animation by one with the same ID (D69). */
export interface SetTextAnimationCommand extends SetTextAnimationArguments {
  readonly type: 'SetTextAnimation';
}

/** What a caller states for `SetCaptionHighlight` (D70). */
export interface SetCaptionHighlightArguments {
  readonly nodeId: string;
  /** The complete highlight, as the document stores it. */
  readonly highlight: DocumentObject;
}

/** Replaces what the word being spoken shows in a captions node (D70). */
export interface SetCaptionHighlightCommand extends SetCaptionHighlightArguments {
  readonly type: 'SetCaptionHighlight';
}

/** What a caller states for `SetCaptionPageAnimation` (D70). */
export interface SetCaptionPageAnimationArguments {
  readonly nodeId: string;
  /** `in` for how every page enters, `out` for how it leaves. */
  readonly phase: 'in' | 'out';
  /** The complete page animation, or `{ kind: 'none' }`, as the document stores it. */
  readonly animation: DocumentObject;
}

/** Replaces how every page of a captions node enters or leaves (D70). */
export interface SetCaptionPageAnimationCommand extends SetCaptionPageAnimationArguments {
  readonly type: 'SetCaptionPageAnimation';
}

/** What a caller states for `SetSafeArea` (D70). */
export interface SetSafeAreaArguments {
  /** The complete safe area, as the document stores it. */
  readonly safeArea: DocumentObject;
}

/** Replaces the safe area of the composition (D70). */
export interface SetSafeAreaCommand extends SetSafeAreaArguments {
  readonly type: 'SetSafeArea';
}

/** What a caller states for `AddEffect` (D71). */
export interface AddEffectArguments {
  /** The node or the scene that takes the effect. */
  readonly ownerId: string;
  /** The effect's index in the owner's `effects` after the insertion. */
  readonly index: number;
  /** The complete effect, with its ID, its parameters, and its animations, as exact data. */
  readonly effect: DocumentObject;
}

/** Inserts a complete effect into the effects of a node or a scene (D71). */
export interface AddEffectCommand extends AddEffectArguments {
  readonly type: 'AddEffect';
}

/** What a caller states for `RemoveEffect` (D71). */
export interface RemoveEffectArguments {
  readonly effectId: string;
}

/** Removes one effect with its animations (D71). */
export interface RemoveEffectCommand extends RemoveEffectArguments {
  readonly type: 'RemoveEffect';
}

/** What a caller states for `ReorderEffect` (D71). */
export interface ReorderEffectArguments {
  readonly effectId: string;
  /** The effect's index in its owner's `effects` after the move. */
  readonly index: number;
}

/** Moves one effect to another place in the order of its owner's effects (D71). */
export interface ReorderEffectCommand extends ReorderEffectArguments {
  readonly type: 'ReorderEffect';
}

/** What a caller states for `SetEffect` (D71). */
export interface SetEffectArguments {
  /** The complete effect; its `id` names the one it replaces. */
  readonly effect: DocumentObject;
}

/** Replaces an effect by one with the same ID (D71). */
export interface SetEffectCommand extends SetEffectArguments {
  readonly type: 'SetEffect';
}

/** What a caller states for `AddTemplateInput` (D58.6). */
export interface AddTemplateInputArguments {
  /** The input's index in the template's inputs after the insertion. */
  readonly index: number;
  /** The complete input, as the document stores it. */
  readonly input: DocumentObject;
}

/** Inserts an input into the template section; nothing reads it until a binding does (D58.6). */
export interface AddTemplateInputCommand extends AddTemplateInputArguments {
  readonly type: 'AddTemplateInput';
}

/** What a caller states for `RemoveTemplateInput` (D58.6). */
export interface RemoveTemplateInputArguments {
  readonly inputId: string;
}

/** Removes an input that no binding and no placeholder uses (D58.6). */
export interface RemoveTemplateInputCommand extends RemoveTemplateInputArguments {
  readonly type: 'RemoveTemplateInput';
}

/** What a caller states for `SetTemplateInput` (D58.6). */
export interface SetTemplateInputArguments {
  readonly inputId: string;
  /** The complete input, as the document stores it, with the same ID. */
  readonly input: DocumentObject;
}

/**
 * Replaces an input — its constraints, its default, or both — and writes the
 * new default into every property and asset bound to it, so that they keep
 * holding it (D58.3, D58.6).
 */
export interface SetTemplateInputCommand extends SetTemplateInputArguments {
  readonly type: 'SetTemplateInput';
}

/** What a caller states for `AddTemplateBinding` (D58.6). */
export interface AddTemplateBindingArguments {
  /** The binding's index in the template's bindings after the insertion; their order has no meaning. */
  readonly index: number;
  /** The complete binding, as the document stores it. */
  readonly binding: DocumentObject;
}

/** Inserts a binding; its target must already hold its input's default (D58.3, D58.6). */
export interface AddTemplateBindingCommand extends AddTemplateBindingArguments {
  readonly type: 'AddTemplateBinding';
}

/** What a caller states for `RemoveTemplateBinding` (D58.6). */
export interface RemoveTemplateBindingArguments {
  readonly bindingId: string;
}

/** Removes a binding; its target keeps the value it holds (D58.6). */
export interface RemoveTemplateBindingCommand extends RemoveTemplateBindingArguments {
  readonly type: 'RemoveTemplateBinding';
}

/** What a caller states for `AddTemplateCondition` (D59.6). */
export interface AddTemplateConditionArguments {
  /** The condition's index in the template's conditions after the insertion; their order has no meaning. */
  readonly index: number;
  /** The complete condition, as the document stores it. */
  readonly condition: DocumentObject;
}

/** Inserts a condition: its scene or node is kept only while its test of an input holds (D59.1, D59.6). */
export interface AddTemplateConditionCommand extends AddTemplateConditionArguments {
  readonly type: 'AddTemplateCondition';
}

/** What a caller states for `RemoveTemplateCondition` (D59.6). */
export interface RemoveTemplateConditionArguments {
  readonly conditionId: string;
}

/** Removes a condition; its target is kept whatever the inputs (D59.6). */
export interface RemoveTemplateConditionCommand extends RemoveTemplateConditionArguments {
  readonly type: 'RemoveTemplateCondition';
}

/** What a caller states for `AddTemplateRepeat` (D59.6). */
export interface AddTemplateRepeatArguments {
  /** The repeat's index in the template's repeats after the insertion; their order has no meaning. */
  readonly index: number;
  /** The complete repeat, as the document stores it. */
  readonly repeat: DocumentObject;
}

/** Inserts a repeat: its scene or node is copied once for each item of a list (D59.2, D59.6). */
export interface AddTemplateRepeatCommand extends AddTemplateRepeatArguments {
  readonly type: 'AddTemplateRepeat';
}

/** What a caller states for `RemoveTemplateRepeat` (D59.6). */
export interface RemoveTemplateRepeatArguments {
  readonly repeatId: string;
}

/** Removes a repeat; its target is shown once, as it stands (D59.6). */
export interface RemoveTemplateRepeatCommand extends RemoveTemplateRepeatArguments {
  readonly type: 'RemoveTemplateRepeat';
}

/** What a caller states for `AddDefinition` (D76). */
export interface AddDefinitionArguments {
  /** The definition's index in `definitions` after the insertion, from 0 to their number. */
  readonly index: number;
  /** The complete definition, with its canvas, duration, nodes, clips, and transitions. */
  readonly definition: DocumentObject;
}

/** Inserts a complete definition, a nested composition an instance node places (D76). */
export interface AddDefinitionCommand extends AddDefinitionArguments {
  readonly type: 'AddDefinition';
}

/** What a caller states for `RemoveDefinition` (D76). */
export interface RemoveDefinitionArguments {
  readonly definitionId: string;
}

/** Removes a definition no instance places (D76). */
export interface RemoveDefinitionCommand extends RemoveDefinitionArguments {
  readonly type: 'RemoveDefinition';
}

/** What a caller states for `ConvertToDefinition` (D76). */
export interface ConvertToDefinitionArguments {
  /** The first node of the run of siblings, the lowest layer. */
  readonly fromNodeId: string;
  /** The last node of the run, the highest layer; equal to `fromNodeId` for one node. */
  readonly toNodeId: string;
  /** The ID of the new definition, unused in the document. */
  readonly definitionId: string;
  /** The ID of the new instance node, unused in the document. */
  readonly instanceId: string;
  /** The new definition's index in `definitions`, from 0 to their number. */
  readonly index: number;
}

/**
 * Moves a run of sibling nodes of a scene or a definition into a new
 * definition of the holder's canvas and duration, and places one instance of
 * it in their stead (D76).
 */
export interface ConvertToDefinitionCommand extends ConvertToDefinitionArguments {
  readonly type: 'ConvertToDefinition';
}

/** What a caller states for `ExpandInstance` (D76). */
export interface ExpandInstanceArguments {
  readonly instanceId: string;
}

/**
 * Puts the nodes of an instance's definition in the instance's stead and
 * removes the definition: the inverse of `ConvertToDefinition` (D76).
 */
export interface ExpandInstanceCommand extends ExpandInstanceArguments {
  readonly type: 'ExpandInstance';
}

/** What a caller states for `SetInstanceInput` (D77). */
export interface SetInstanceInputArguments {
  readonly instanceId: string;
  /** The complete value, as the instance stores it: `{ inputId, type, value }`. */
  readonly input: DocumentObject;
}

/**
 * Gives an input of an element instance a value: replaces the instance's value
 * of that input, or inserts it in the order of the input IDs (D77).
 */
export interface SetInstanceInputCommand extends SetInstanceInputArguments {
  readonly type: 'SetInstanceInput';
}

/** What a caller states for `ClearInstanceInput` (D77). */
export interface ClearInstanceInputArguments {
  readonly instanceId: string;
  readonly inputId: string;
}

/** Removes an instance's value of an input, which then takes its default (D77). */
export interface ClearInstanceInputCommand extends ClearInstanceInputArguments {
  readonly type: 'ClearInstanceInput';
}

/** What a caller states for `ReplaceDefinition` (D77). */
export interface ReplaceDefinitionArguments {
  readonly definitionId: string;
  /** The complete new definition, as the document stores it, with the same ID. */
  readonly definition: DocumentObject;
}

/**
 * Replaces a definition whole, its template included, keeping its ID and its
 * index: the one way to edit the template of an element (D77).
 */
export interface ReplaceDefinitionCommand extends ReplaceDefinitionArguments {
  readonly type: 'ReplaceDefinition';
}

export type Command =
  | SetNodePositionCommand
  | SetNodeOpacityCommand
  | SetTextContentCommand
  | AddNodeCommand
  | RemoveNodeCommand
  | DuplicateNodeCommand
  | ReorderNodeCommand
  | SetNodeScaleCommand
  | SetNodeSizeCommand
  | SetNodeColorCommand
  | SetTextFontSizeCommand
  | SetTextFontCommand
  | SetImageAssetCommand
  | AddAssetCommand
  | RemoveAssetCommand
  | AddAnimationCommand
  | RemoveAnimationCommand
  | SetOpacityKeyframeCommand
  | SetPositionKeyframeCommand
  | SetScaleKeyframeCommand
  | AddKeyframeCommand
  | RemoveKeyframeCommand
  | MoveKeyframeCommand
  | SetKeyframeEasingCommand
  | SetKeyframeValueCommand
  | SetNodeLifetimeCommand
  | SetNodeFitCommand
  | SetNodeFocusCommand
  | SetNodeRotationCommand
  | SetNodeOriginCommand
  | SetNodeCropCommand
  | SetNodeCornerRadiusCommand
  | SetVideoAssetCommand
  | SetVideoSourceCommand
  | SetVideoVolumeCommand
  | AddAudioClipCommand
  | RemoveAudioClipCommand
  | SetClipVolumeCommand
  | SetClipFadesCommand
  | SetClipSourceCommand
  | AddSceneCommand
  | RemoveSceneCommand
  | DuplicateSceneCommand
  | ReorderSceneCommand
  | SetSceneDurationCommand
  | MoveNodeToSceneCommand
  | AddSceneAudioClipCommand
  | MoveClipCommand
  | TrimClipStartCommand
  | TrimClipEndCommand
  | SplitClipCommand
  | JoinClipsCommand
  | AddSceneTransitionCommand
  | AddClipTransitionCommand
  | RemoveTransitionCommand
  | SetTransitionDurationCommand
  | SetTransitionEffectCommand
  | SetTransitionEasingCommand
  | SetCaptionWordsCommand
  | SetCaptionWordCommand
  | SetCaptionStyleCommand
  | SetTextStyleCommand
  | SetShapeGeometryCommand
  | SetShapeFillCommand
  | SetShapeStrokeCommand
  | SetShapeTrimCommand
  | SetBlendModeCommand
  | SetNodeMaskCommand
  | SetNodeMatteCommand
  | AddTextAnimationCommand
  | RemoveTextAnimationCommand
  | SetTextAnimationCommand
  | SetCaptionHighlightCommand
  | SetCaptionPageAnimationCommand
  | SetSafeAreaCommand
  | AddEffectCommand
  | RemoveEffectCommand
  | ReorderEffectCommand
  | SetEffectCommand
  | AddTemplateInputCommand
  | RemoveTemplateInputCommand
  | SetTemplateInputCommand
  | AddTemplateBindingCommand
  | RemoveTemplateBindingCommand
  | AddTemplateConditionCommand
  | RemoveTemplateConditionCommand
  | AddTemplateRepeatCommand
  | RemoveTemplateRepeatCommand
  | AddDefinitionCommand
  | RemoveDefinitionCommand
  | ConvertToDefinitionCommand
  | ExpandInstanceCommand
  | SetInstanceInputCommand
  | ClearInstanceInputCommand
  | ReplaceDefinitionCommand;

/** A JSON Schema of one property of a command's arguments. */
export type ArgumentSchema =
  | { readonly type: 'string'; readonly description: string; readonly minLength: number }
  | { readonly type: 'string'; readonly description: string; readonly pattern: string }
  | { readonly type: 'string'; readonly description: string; readonly enum: readonly string[] }
  | { readonly type: 'string'; readonly description: string }
  | { readonly type: 'number'; readonly description: string }
  | {
      readonly type: 'number';
      readonly description: string;
      readonly minimum: number;
      readonly maximum: number;
    }
  | {
      readonly type: 'integer';
      readonly description: string;
      readonly minimum: number;
      readonly maximum: number;
    }
  | ClosedObjectSchema<string>;

/** A JSON Schema of a JSON object with exactly the fields `K`, all of them required. */
export interface ClosedObjectSchema<K extends string> {
  readonly type: 'object';
  readonly description: string;
  readonly properties: { readonly [P in K]: ArgumentSchema };
  readonly required: readonly K[];
  readonly additionalProperties: false;
}

/** The argument schema of `SetNodePosition`, typed by the fields of its arguments. */
export interface SetNodePositionArgumentsSchema extends ClosedObjectSchema<
  keyof SetNodePositionArguments
> {
  readonly properties: {
    readonly nodeId: ArgumentSchema;
    readonly position: ClosedObjectSchema<keyof CommandPosition>;
  };
}

/** The argument schema of `SetNodeOpacity`, typed by the fields of its arguments. */
export type SetNodeOpacityArgumentsSchema = ClosedObjectSchema<keyof SetNodeOpacityArguments>;

/** The argument schema of `SetTextContent`, typed by the fields of its arguments. */
export type SetTextContentArgumentsSchema = ClosedObjectSchema<keyof SetTextContentArguments>;

/** The JSON Schema of an object whose shape the command does not restate (D39.1). */
export interface OpenObjectSchema {
  readonly type: 'object';
  readonly description: string;
}

/**
 * The argument schema of `AddNode`: closed, with `node` an open object, since
 * the document's schema checks the node itself (D30.6, D31.2).
 */
export interface AddNodeArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly parentId: ArgumentSchema;
    readonly index: ArgumentSchema;
    readonly node: OpenObjectSchema;
  };
  readonly required: readonly (keyof AddNodeArguments)[];
  readonly additionalProperties: false;
}
export type RemoveNodeArgumentsSchema = ClosedObjectSchema<keyof RemoveNodeArguments>;
export type DuplicateNodeArgumentsSchema = ClosedObjectSchema<keyof DuplicateNodeArguments>;
export type ReorderNodeArgumentsSchema = ClosedObjectSchema<keyof ReorderNodeArguments>;
export type SetNodeScaleArgumentsSchema = ClosedObjectSchema<keyof SetNodeScaleArguments>;
export type SetNodeSizeArgumentsSchema = ClosedObjectSchema<keyof SetNodeSizeArguments>;
export type SetNodeColorArgumentsSchema = ClosedObjectSchema<keyof SetNodeColorArguments>;
export type SetTextFontSizeArgumentsSchema = ClosedObjectSchema<keyof SetTextFontSizeArguments>;
export type SetTextFontArgumentsSchema = ClosedObjectSchema<keyof SetTextFontArguments>;
export type SetImageAssetArgumentsSchema = ClosedObjectSchema<keyof SetImageAssetArguments>;
export type SetNodeFitArgumentsSchema = ClosedObjectSchema<keyof SetNodeFitArguments>;
export type SetBlendModeArgumentsSchema = ClosedObjectSchema<keyof SetBlendModeArguments>;

/** The argument schema of `SetNodeMask`: closed, with `mask` an open object (D75). */
export interface SetNodeMaskArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly nodeId: ArgumentSchema;
    readonly mask: OpenObjectSchema;
  };
  readonly required: readonly (keyof SetNodeMaskArguments)[];
  readonly additionalProperties: false;
}

/** The argument schema of `SetNodeMatte`: closed, with `matte` an open object (D75). */
export interface SetNodeMatteArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly nodeId: ArgumentSchema;
    readonly matte: OpenObjectSchema;
  };
  readonly required: readonly (keyof SetNodeMatteArguments)[];
  readonly additionalProperties: false;
}
/** The argument schema of `SetNodeOrigin`, typed by the fields of its arguments. */
export interface SetNodeOriginArgumentsSchema extends ClosedObjectSchema<
  keyof SetNodeOriginArguments
> {
  readonly properties: {
    readonly nodeId: ArgumentSchema;
    readonly origin: ClosedObjectSchema<keyof Origin>;
  };
}

/** The argument schema of `SetNodeCrop`, typed by the fields of its arguments. */
export interface SetNodeCropArgumentsSchema extends ClosedObjectSchema<keyof SetNodeCropArguments> {
  readonly properties: {
    readonly nodeId: ArgumentSchema;
    readonly crop: ClosedObjectSchema<keyof Crop>;
  };
}

/** A keyframe value: a number, a string, or an object, judged by the animation it goes to (D65.2, D68). */
export interface KeyframeValueSchema {
  readonly description: string;
  readonly anyOf: readonly [
    { readonly type: 'number' },
    { readonly type: 'string' },
    { readonly type: 'object' },
  ];
}

/** The argument schema of `SetKeyframeValue`: closed, with `value` a number, a string, or an object (D68). */
export interface SetKeyframeValueArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly animationId: ArgumentSchema;
    readonly timeUs: ArgumentSchema;
    readonly value: KeyframeValueSchema;
  };
  readonly required: readonly (keyof SetKeyframeValueArguments)[];
  readonly additionalProperties: false;
}

/** The argument schema of `SetNodeFocus`, typed by the fields of its arguments. */
export interface SetNodeFocusArgumentsSchema extends ClosedObjectSchema<
  keyof SetNodeFocusArguments
> {
  readonly properties: {
    readonly nodeId: ArgumentSchema;
    readonly focus: ClosedObjectSchema<keyof Focus>;
  };
}
export type SetVideoAssetArgumentsSchema = ClosedObjectSchema<keyof SetVideoAssetArguments>;
export type SetVideoSourceArgumentsSchema = ClosedObjectSchema<keyof SetVideoSourceArguments>;
export type SetVideoVolumeArgumentsSchema = ClosedObjectSchema<keyof SetVideoVolumeArguments>;
export type RemoveAudioClipArgumentsSchema = ClosedObjectSchema<keyof RemoveAudioClipArguments>;
export type SetClipVolumeArgumentsSchema = ClosedObjectSchema<keyof SetClipVolumeArguments>;
export type SetClipFadesArgumentsSchema = ClosedObjectSchema<keyof SetClipFadesArguments>;
export type SetClipSourceArgumentsSchema = ClosedObjectSchema<keyof SetClipSourceArguments>;

/** The argument schema of `AddAudioClip`: closed, with `clip` an open object (D52.6). */
export interface AddAudioClipArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly index: ArgumentSchema;
    readonly clip: OpenObjectSchema;
  };
  readonly required: readonly (keyof AddAudioClipArguments)[];
  readonly additionalProperties: false;
}

/** The argument schema of `AddScene`: closed, with `scene` an open object (D54.5). */
export interface AddSceneArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly index: ArgumentSchema;
    readonly scene: OpenObjectSchema;
  };
  readonly required: readonly (keyof AddSceneArguments)[];
  readonly additionalProperties: false;
}

/** The argument schema of `AddSceneAudioClip`: closed, with `clip` an open object (D54.5). */
export interface AddSceneAudioClipArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly sceneId: ArgumentSchema;
    readonly index: ArgumentSchema;
    readonly clip: OpenObjectSchema;
  };
  readonly required: readonly (keyof AddSceneAudioClipArguments)[];
  readonly additionalProperties: false;
}
export type RemoveSceneArgumentsSchema = ClosedObjectSchema<keyof RemoveSceneArguments>;
export type DuplicateSceneArgumentsSchema = ClosedObjectSchema<keyof DuplicateSceneArguments>;
export type ReorderSceneArgumentsSchema = ClosedObjectSchema<keyof ReorderSceneArguments>;
export type SetSceneDurationArgumentsSchema = ClosedObjectSchema<keyof SetSceneDurationArguments>;
export type MoveNodeToSceneArgumentsSchema = ClosedObjectSchema<keyof MoveNodeToSceneArguments>;
export type MoveClipArgumentsSchema = ClosedObjectSchema<keyof MoveClipArguments>;
export type TrimClipStartArgumentsSchema = ClosedObjectSchema<keyof TrimClipStartArguments>;
export type TrimClipEndArgumentsSchema = ClosedObjectSchema<keyof TrimClipEndArguments>;
export type SplitClipArgumentsSchema = ClosedObjectSchema<keyof SplitClipArguments>;
export type JoinClipsArgumentsSchema = ClosedObjectSchema<keyof JoinClipsArguments>;
export type RemoveTransitionArgumentsSchema = ClosedObjectSchema<keyof RemoveTransitionArguments>;
export type SetTransitionDurationArgumentsSchema = ClosedObjectSchema<
  keyof SetTransitionDurationArguments
>;

/** The argument schema of `AddSceneTransition`: closed, with `transition` an open object (D56.6). */
export interface AddSceneTransitionArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly index: ArgumentSchema;
    readonly transition: OpenObjectSchema;
  };
  readonly required: readonly (keyof AddSceneTransitionArguments)[];
  readonly additionalProperties: false;
}

/** The argument schema of `AddClipTransition`: closed, with `transition` an open object (D56.6). */
export interface AddClipTransitionArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly sceneId: ArgumentSchema;
    readonly index: ArgumentSchema;
    readonly transition: OpenObjectSchema;
  };
  readonly required: readonly (keyof AddClipTransitionArguments)[];
  readonly additionalProperties: false;
}

/** The argument schema of `SetKeyframeEasing`: closed, with `easing` an open object (D67.7). */
export interface SetKeyframeEasingArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly animationId: ArgumentSchema;
    readonly timeUs: ArgumentSchema;
    readonly easing: OpenObjectSchema;
  };
  readonly required: readonly (keyof SetKeyframeEasingArguments)[];
  readonly additionalProperties: false;
}

/** The argument schema of `SetTransitionEasing`: closed, with `easing` an open object (D67.7). */
export interface SetTransitionEasingArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly transitionId: ArgumentSchema;
    readonly easing: OpenObjectSchema;
  };
  readonly required: readonly (keyof SetTransitionEasingArguments)[];
  readonly additionalProperties: false;
}

/** The argument schema of `SetTransitionEffect`: closed, with `effect` an open object (D56.6). */
export interface SetTransitionEffectArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly transitionId: ArgumentSchema;
    readonly effect: OpenObjectSchema;
  };
  readonly required: readonly (keyof SetTransitionEffectArguments)[];
  readonly additionalProperties: false;
}
/** The JSON Schema of an array of objects whose shape the command does not restate (D57.5). */
export interface OpenArraySchema {
  readonly type: 'array';
  readonly description: string;
  readonly items: OpenObjectSchema;
}

/** The argument schema of `SetCaptionWords`: closed, with `words` an array of open objects (D57.5). */
export interface SetCaptionWordsArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly nodeId: ArgumentSchema;
    readonly words: OpenArraySchema;
  };
  readonly required: readonly (keyof SetCaptionWordsArguments)[];
  readonly additionalProperties: false;
}

/** The argument schema of `SetCaptionWord`: closed, with `word` an open object (D57.5). */
export interface SetCaptionWordArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly nodeId: ArgumentSchema;
    readonly index: ArgumentSchema;
    readonly word: OpenObjectSchema;
  };
  readonly required: readonly (keyof SetCaptionWordArguments)[];
  readonly additionalProperties: false;
}

/** The argument schema of `SetCaptionStyle`: closed, with `style` an open object (D57.5). */
export interface SetCaptionStyleArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly nodeId: ArgumentSchema;
    readonly style: OpenObjectSchema;
  };
  readonly required: readonly (keyof SetCaptionStyleArguments)[];
  readonly additionalProperties: false;
}

/** The argument schema of `SetTextStyle`: closed, with `style` an open object (D69). */
export interface SetTextStyleArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly nodeId: ArgumentSchema;
    readonly style: OpenObjectSchema;
  };
  readonly required: readonly (keyof SetTextStyleArguments)[];
  readonly additionalProperties: false;
}

/** The argument schema of `SetShapeGeometry`: closed, with `geometry` an open object (D73). */
export interface SetShapeGeometryArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly nodeId: ArgumentSchema;
    readonly geometry: OpenObjectSchema;
  };
  readonly required: readonly (keyof SetShapeGeometryArguments)[];
  readonly additionalProperties: false;
}

/** The argument schema of `SetShapeFill`: closed, with `fill` an open object (D73). */
export interface SetShapeFillArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly nodeId: ArgumentSchema;
    readonly fill: OpenObjectSchema;
  };
  readonly required: readonly (keyof SetShapeFillArguments)[];
  readonly additionalProperties: false;
}

/** The argument schema of `SetShapeStroke`: closed, with `stroke` an open object (D73). */
export interface SetShapeStrokeArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly nodeId: ArgumentSchema;
    readonly stroke: OpenObjectSchema;
  };
  readonly required: readonly (keyof SetShapeStrokeArguments)[];
  readonly additionalProperties: false;
}

/** The argument schema of `SetShapeTrim`, typed by the fields of its arguments (D73). */
export interface SetShapeTrimArgumentsSchema extends ClosedObjectSchema<
  keyof SetShapeTrimArguments
> {
  readonly properties: {
    readonly nodeId: ArgumentSchema;
    readonly trim: ClosedObjectSchema<keyof ShapeTrim>;
  };
}

/** The argument schema of `AddTextAnimation`: closed, with `animation` an open object (D69). */
export interface AddTextAnimationArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly nodeId: ArgumentSchema;
    readonly index: ArgumentSchema;
    readonly animation: OpenObjectSchema;
  };
  readonly required: readonly (keyof AddTextAnimationArguments)[];
  readonly additionalProperties: false;
}

export type RemoveTextAnimationArgumentsSchema = ClosedObjectSchema<
  keyof RemoveTextAnimationArguments
>;

/** The argument schema of `SetCaptionHighlight`: closed, with `highlight` an open object (D70). */
export interface SetCaptionHighlightArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly nodeId: ArgumentSchema;
    readonly highlight: OpenObjectSchema;
  };
  readonly required: readonly (keyof SetCaptionHighlightArguments)[];
  readonly additionalProperties: false;
}

/** The argument schema of `SetCaptionPageAnimation`: closed, with `animation` an open object (D70). */
export interface SetCaptionPageAnimationArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly nodeId: ArgumentSchema;
    readonly phase: ArgumentSchema;
    readonly animation: OpenObjectSchema;
  };
  readonly required: readonly (keyof SetCaptionPageAnimationArguments)[];
  readonly additionalProperties: false;
}

/** The argument schema of `SetSafeArea`: closed, with `safeArea` an open object (D70). */
export interface SetSafeAreaArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly safeArea: OpenObjectSchema;
  };
  readonly required: readonly (keyof SetSafeAreaArguments)[];
  readonly additionalProperties: false;
}

/** The argument schema of `AddEffect`: closed, with `effect` an open object (D71). */
export interface AddEffectArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly ownerId: ArgumentSchema;
    readonly index: ArgumentSchema;
    readonly effect: OpenObjectSchema;
  };
  readonly required: readonly (keyof AddEffectArguments)[];
  readonly additionalProperties: false;
}

export type RemoveEffectArgumentsSchema = ClosedObjectSchema<keyof RemoveEffectArguments>;

export type ReorderEffectArgumentsSchema = ClosedObjectSchema<keyof ReorderEffectArguments>;

/** The argument schema of `SetEffect`: closed, with `effect` an open object (D71). */
export interface SetEffectArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly effect: OpenObjectSchema;
  };
  readonly required: readonly (keyof SetEffectArguments)[];
  readonly additionalProperties: false;
}

/** The argument schema of `SetTextAnimation`: closed, with `animation` an open object (D69). */
export interface SetTextAnimationArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly animation: OpenObjectSchema;
  };
  readonly required: readonly (keyof SetTextAnimationArguments)[];
  readonly additionalProperties: false;
}
/** The argument schema of `AddTemplateInput`: closed, with `input` an open object (D58.6). */
export interface AddTemplateInputArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly index: ArgumentSchema;
    readonly input: OpenObjectSchema;
  };
  readonly required: readonly (keyof AddTemplateInputArguments)[];
  readonly additionalProperties: false;
}

export type RemoveTemplateInputArgumentsSchema = ClosedObjectSchema<
  keyof RemoveTemplateInputArguments
>;

/** The argument schema of `SetTemplateInput`: closed, with `input` an open object (D58.6). */
export interface SetTemplateInputArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly inputId: ArgumentSchema;
    readonly input: OpenObjectSchema;
  };
  readonly required: readonly (keyof SetTemplateInputArguments)[];
  readonly additionalProperties: false;
}

/** The argument schema of `AddTemplateBinding`: closed, with `binding` an open object (D58.6). */
export interface AddTemplateBindingArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly index: ArgumentSchema;
    readonly binding: OpenObjectSchema;
  };
  readonly required: readonly (keyof AddTemplateBindingArguments)[];
  readonly additionalProperties: false;
}

export type RemoveTemplateBindingArgumentsSchema = ClosedObjectSchema<
  keyof RemoveTemplateBindingArguments
>;

/** The argument schema of `AddTemplateCondition`: closed, with `condition` an open object (D59.6). */
export interface AddTemplateConditionArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly index: ArgumentSchema;
    readonly condition: OpenObjectSchema;
  };
  readonly required: readonly (keyof AddTemplateConditionArguments)[];
  readonly additionalProperties: false;
}

export type RemoveTemplateConditionArgumentsSchema = ClosedObjectSchema<
  keyof RemoveTemplateConditionArguments
>;

/** The argument schema of `AddTemplateRepeat`: closed, with `repeat` an open object (D59.6). */
export interface AddTemplateRepeatArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly index: ArgumentSchema;
    readonly repeat: OpenObjectSchema;
  };
  readonly required: readonly (keyof AddTemplateRepeatArguments)[];
  readonly additionalProperties: false;
}

export type RemoveTemplateRepeatArgumentsSchema = ClosedObjectSchema<
  keyof RemoveTemplateRepeatArguments
>;

/** The argument schema of `AddDefinition`: closed, with `definition` an open object (D76). */
export interface AddDefinitionArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly index: ArgumentSchema;
    readonly definition: OpenObjectSchema;
  };
  readonly required: readonly (keyof AddDefinitionArguments)[];
  readonly additionalProperties: false;
}
export type RemoveDefinitionArgumentsSchema = ClosedObjectSchema<keyof RemoveDefinitionArguments>;
export type ConvertToDefinitionArgumentsSchema = ClosedObjectSchema<
  keyof ConvertToDefinitionArguments
>;
export type ExpandInstanceArgumentsSchema = ClosedObjectSchema<keyof ExpandInstanceArguments>;

/** The argument schema of `SetInstanceInput`: closed, with `input` an open object (D77). */
export interface SetInstanceInputArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly instanceId: ArgumentSchema;
    readonly input: OpenObjectSchema;
  };
  readonly required: readonly (keyof SetInstanceInputArguments)[];
  readonly additionalProperties: false;
}
export type ClearInstanceInputArgumentsSchema = ClosedObjectSchema<
  keyof ClearInstanceInputArguments
>;

/** The argument schema of `ReplaceDefinition`: closed, with `definition` an open object (D77). */
export interface ReplaceDefinitionArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly definitionId: ArgumentSchema;
    readonly definition: OpenObjectSchema;
  };
  readonly required: readonly (keyof ReplaceDefinitionArguments)[];
  readonly additionalProperties: false;
}
export type AddAssetArgumentsSchema = ClosedObjectSchema<keyof AddAssetArguments>;
export type RemoveAssetArgumentsSchema = ClosedObjectSchema<keyof RemoveAssetArguments>;

/** The argument schema of `AddAnimation`: closed, with `animation` an open object (D41.3). */
export interface AddAnimationArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly nodeId: ArgumentSchema;
    readonly index: ArgumentSchema;
    readonly animation: OpenObjectSchema;
  };
  readonly required: readonly (keyof AddAnimationArguments)[];
  readonly additionalProperties: false;
}

/**
 * The JSON Schema of a keyframe given as exact data: an object whose `timeUs` is
 * the one field the command reads; every other field is the validator's (D41.3).
 */
export interface KeyframePayloadSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: { readonly timeUs: ArgumentSchema };
  readonly required: readonly ['timeUs'];
}

/** The argument schema of `AddKeyframe`: closed, with `keyframe` open but for its time (D41.3). */
export interface AddKeyframeArgumentsSchema {
  readonly type: 'object';
  readonly description: string;
  readonly properties: {
    readonly animationId: ArgumentSchema;
    readonly keyframe: KeyframePayloadSchema;
  };
  readonly required: readonly (keyof AddKeyframeArguments)[];
  readonly additionalProperties: false;
}

export type RemoveAnimationArgumentsSchema = ClosedObjectSchema<keyof RemoveAnimationArguments>;
export type SetOpacityKeyframeArgumentsSchema = ClosedObjectSchema<
  keyof SetOpacityKeyframeArguments
>;
export type SetPositionKeyframeArgumentsSchema = ClosedObjectSchema<
  keyof SetPositionKeyframeArguments
>;
export type SetScaleKeyframeArgumentsSchema = ClosedObjectSchema<keyof SetScaleKeyframeArguments>;
export type RemoveKeyframeArgumentsSchema = ClosedObjectSchema<keyof RemoveKeyframeArguments>;
export type MoveKeyframeArgumentsSchema = ClosedObjectSchema<keyof MoveKeyframeArguments>;
export type SetNodeLifetimeArgumentsSchema = ClosedObjectSchema<keyof SetNodeLifetimeArguments>;

/** Freezes a JSON value and everything in it, so no caller can edit a shared value. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

const COORDINATE =
  'composition pixels. A fraction is rounded to an integer, halves towards +Infinity (2.5 becomes 3, -2.5 becomes -2), and -0 becomes 0.';

/**
 * The JSON Schema (draft 2020-12) of the arguments of `SetNodePosition`, which
 * the AI tool contract passes on as it is (D31.2). `x` and `y` are numbers, not
 * integers: `parseCommand` accepts a fraction and rounds it, so `integer` would
 * describe the document after normalisation, not this input. The bounds of a
 * coordinate are the document's (D15); a position the document cannot hold is
 * refused as `invalid-result` (D30.6), not restated here. A test feeds one
 * corpus to this schema and to `parseCommand` and demands the same verdict.
 */
export const setNodePositionArgumentsSchema: SetNodePositionArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Moves one node to an absolute base position.',
  properties: {
    nodeId: {
      type: 'string',
      description:
        'The stable ID of the node to move. A node without a position, such as the background, is refused.',
      minLength: 1,
    },
    position: {
      type: 'object',
      description:
        "The node's new base position, absolute, in composition pixels. A position animation adds its offsets on top of it.",
      properties: {
        x: { type: 'number', description: `Distance from the left edge, in ${COORDINATE}` },
        y: { type: 'number', description: `Distance from the top edge, in ${COORDINATE}` },
      },
      required: ['x', 'y'],
      additionalProperties: false,
    },
  },
  required: ['nodeId', 'position'],
  additionalProperties: false,
});

/**
 * The JSON Schema of the arguments of `SetNodeOpacity` (D38.2). The range 0 to
 * 1 inclusive is part of the command's public contract, so the schema states it
 * and `parseCommand` refuses a value outside it as `invalid-argument`; a test
 * demands the same verdict from both on one corpus.
 */
export const setNodeOpacityArgumentsSchema: SetNodeOpacityArgumentsSchema = deepFreeze({
  type: 'object',
  description: "Sets one node's base opacity.",
  properties: {
    nodeId: {
      type: 'string',
      description:
        'The stable ID of the node. A node without an opacity, such as the background, is refused.',
      minLength: 1,
    },
    opacity: {
      type: 'number',
      description:
        'The base opacity, from 0 (transparent) to 1 (opaque) inclusive; a fraction is kept as it is, and -0 becomes 0. An opacity animation multiplies it.',
      minimum: 0,
      maximum: 1,
    },
  },
  required: ['nodeId', 'opacity'],
  additionalProperties: false,
});

/**
 * The JSON Schema of the arguments of `SetTextContent` (D38.3). Any string is a
 * text, the empty one included: schema 0.2 sets no limit, so neither does this.
 */
export const setTextContentArgumentsSchema: SetTextContentArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Replaces the text of one text node.',
  properties: {
    nodeId: {
      type: 'string',
      description: 'The stable ID of a text node. Any other node is refused.',
      minLength: 1,
    },
    text: {
      type: 'string',
      description:
        'The new text, exactly as given: nothing is trimmed or normalised, and line breaks are kept.',
    },
  },
  required: ['nodeId', 'text'],
  additionalProperties: false,
});

/**
 * The document's own ID pattern, read from its schema rather than written out
 * again (D16.3, D30.8), for the one ID a command introduces by name: the copy of
 * `DuplicateNode` (D39.3).
 */
const ID_PATTERN: string = compositionSchema.properties.scenes.items.properties.id.pattern;

const NODE_ID = 'The stable ID of the node.';

const INDEX_BOUNDS = { minimum: 0, maximum: Number.MAX_SAFE_INTEGER } as const;

/** The document's own shape of an asset, read from its schema (D16.3, D30.8, D40.3). */
const ASSET = compositionSchema.properties.assets.items.properties;
const ASSET_TYPES: readonly string[] = ASSET.type.enum;
const HASH_PATTERN: string = ASSET.contentHash.pattern;

/**
 * A colour as a command accepts it: six hexadecimal digits after `#`, in either
 * case. The document stores lower case only; the parser lowercases (D40.1).
 */
const COLOR_INPUT = '^#[0-9A-Fa-f]{6}$';

/** The bounds of a keyframe's time, read from the schema (D41.2). */
const KEYFRAME_TIME = keyframeTimeBounds(compositionSchema);
/** The bounds of a node's lifetime, read from the schema once, when the module loads (D42.10). */
const LIFETIME = lifetimeBounds(compositionSchema);

const ANIMATION_ID = 'The ID of an animation of the document.';

/** The shapes of the node types that a scene holds, read from the schema (D30.8). */
const NODE_SHAPES = compositionSchema.properties.scenes.items.properties.nodes.items.oneOf;
type VideoShape = Extract<
  (typeof NODE_SHAPES)[number],
  { readonly properties: { readonly type: { readonly const: 'video' } } }
>;
const VIDEO_SHAPE = NODE_SHAPES.find(
  (shape): shape is VideoShape => shape.properties.type.const === 'video',
);
if (VIDEO_SHAPE === undefined) throw new Error('The schema has no video node.');
/** The values of `fit`, read from the schema (D50.1); images and videos share them. */
const FITS: readonly Fit[] = VIDEO_SHAPE.properties.fit.enum;
/** The bounds of a coordinate of `focus`, read from the schema (D63.1); images and videos share them. */
const FOCUS: Bounds = {
  minimum: VIDEO_SHAPE.properties.focus.properties.x.minimum,
  maximum: VIDEO_SHAPE.properties.focus.properties.x.maximum,
};
/** The bounds of a rotation, read from the schema (D68); every transformable node shares them. */
const ROTATION: Bounds = {
  minimum: VIDEO_SHAPE.properties.rotation.minimum,
  maximum: VIDEO_SHAPE.properties.rotation.maximum,
};
/** The bounds of a coordinate of `origin`, read from the schema (D68). */
const ORIGIN: Bounds = {
  minimum: VIDEO_SHAPE.properties.origin.properties.x.minimum,
  maximum: VIDEO_SHAPE.properties.origin.properties.x.maximum,
};
/** The key of a top inset, held in a constant: a literal `top` reads like the global of a page. */
const TOP = 'top';
/** The bounds of an inset of `crop`, read from the schema (D68); images and videos share them. */
const CROP: Bounds = {
  minimum: VIDEO_SHAPE.properties.crop.properties[TOP].minimum,
  maximum: VIDEO_SHAPE.properties.crop.properties[TOP].maximum,
};
type ShapeNodeShape = Extract<
  (typeof NODE_SHAPES)[number],
  { readonly properties: { readonly type: { readonly const: 'shape' } } }
>;
const SHAPE_NODE_SHAPE = NODE_SHAPES.find(
  (shape): shape is ShapeNodeShape => shape.properties.type.const === 'shape',
);
if (SHAPE_NODE_SHAPE === undefined) throw new Error('The schema has no shape node.');
/** The bounds of a point of a trim, read from the schema (D73). */
const TRIM: Bounds = {
  minimum: SHAPE_NODE_SHAPE.properties.trim.properties.start.minimum,
  maximum: SHAPE_NODE_SHAPE.properties.trim.properties.start.maximum,
};
/** The bounds of `sourceStartUs`, read from the schema (D50.1). */
const SOURCE_START: Bounds = {
  minimum: VIDEO_SHAPE.properties.sourceStartUs.minimum,
  maximum: VIDEO_SHAPE.properties.sourceStartUs.maximum,
};

/** The JSON Schema of the arguments of `SetNodeFit` (D50.6). */
export const setNodeFitArgumentsSchema: SetNodeFitArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Sets how the picture of an image or a video meets the box of its node.',
  properties: {
    nodeId: {
      type: 'string',
      description: `${NODE_ID} Only images and videos have a fit.`,
      minLength: 1,
    },
    fit: {
      type: 'string',
      description:
        'fill stretches the picture to the box; contain shows all of it inside the box; cover fills the box and crops. contain and cover keep the aspect ratio and place the picture by its focus, the centre unless set_node_focus moved it.',
      enum: FITS,
    },
  },
  required: ['nodeId', 'fit'],
  additionalProperties: false,
});

const FOCUS_COORDINATE = `An integer from ${String(FOCUS.minimum)} to ${String(FOCUS.maximum)}, per mille`;

/**
 * The JSON Schema of the arguments of `SetNodeFocus` (D63.4). The coordinates
 * are integers in the document's bounds: nothing is rounded or clamped, so the
 * schema states the bounds and `parseCommand` refuses a value outside them as
 * `invalid-argument`.
 */
export const setNodeFocusArgumentsSchema: SetNodeFocusArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Sets which point of the picture of an image or a video stays in its box.',
  properties: {
    nodeId: {
      type: 'string',
      description: `${NODE_ID} Only images and videos have a focus.`,
      minLength: 1,
    },
    focus: {
      type: 'object',
      description:
        'The focus point, in per mille of the picture: the point at x per mille of its width and y per mille of its height lies at the same fraction of the box. 500, 500 is the centre.',
      properties: {
        x: {
          type: 'integer',
          description: `${FOCUS_COORDINATE} of the width of the picture, from its left edge.`,
          minimum: FOCUS.minimum,
          maximum: FOCUS.maximum,
        },
        y: {
          type: 'integer',
          description: `${FOCUS_COORDINATE} of the height of the picture, from its top edge.`,
          minimum: FOCUS.minimum,
          maximum: FOCUS.maximum,
        },
      },
      required: ['x', 'y'],
      additionalProperties: false,
    },
  },
  required: ['nodeId', 'focus'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetNodeRotation` (D68): degrees in the document's bounds. */
export const setNodeRotationArgumentsSchema: ClosedObjectSchema<keyof SetNodeRotationArguments> =
  deepFreeze({
    type: 'object',
    description: 'Sets the rotation of a node about its origin point, in degrees.',
    properties: {
      nodeId: {
        type: 'string',
        description: `${NODE_ID} Every node but a background has a rotation.`,
        minLength: 1,
      },
      rotation: {
        type: 'number',
        description: `Degrees, positive clockwise, from ${String(ROTATION.minimum)} to ${String(ROTATION.maximum)}; several turns are allowed, and a whole number of turns is no rotation. Never rounded; -0 becomes 0.`,
        minimum: ROTATION.minimum,
        maximum: ROTATION.maximum,
      },
    },
    required: ['nodeId', 'rotation'],
    additionalProperties: false,
  });

const ORIGIN_COORDINATE = `An integer from ${String(ORIGIN.minimum)} to ${String(ORIGIN.maximum)}, per mille`;

/** The JSON Schema of the arguments of `SetNodeOrigin` (D68): integer per mille of the box. */
export const setNodeOriginArgumentsSchema: SetNodeOriginArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    "Sets the point of a node's box that its scale and rotation are about; the position stays that of the top-left corner.",
  properties: {
    nodeId: {
      type: 'string',
      description: `${NODE_ID} Every node but a background has an origin; a group's box is the canvas.`,
      minLength: 1,
    },
    origin: {
      type: 'object',
      description:
        'The origin, in per mille of the box: 0, 0 is the top-left corner and 500, 500 the centre.',
      properties: {
        x: {
          type: 'integer',
          description: `${ORIGIN_COORDINATE} of the width of the box, from its left edge.`,
          minimum: ORIGIN.minimum,
          maximum: ORIGIN.maximum,
        },
        y: {
          type: 'integer',
          description: `${ORIGIN_COORDINATE} of the height of the box, from its top edge.`,
          minimum: ORIGIN.minimum,
          maximum: ORIGIN.maximum,
        },
      },
      required: ['x', 'y'],
      additionalProperties: false,
    },
  },
  required: ['nodeId', 'origin'],
  additionalProperties: false,
});

const CROP_INSET = `An integer from ${String(CROP.minimum)} to ${String(CROP.maximum)}, per mille of the`;

/** The JSON Schema of the arguments of `SetNodeCrop` (D68): four integer insets in per mille. */
export const setNodeCropArgumentsSchema: SetNodeCropArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    'Sets what is cut away of the picture of an image or a video before it is fitted to its box.',
  properties: {
    nodeId: {
      type: 'string',
      description: `${NODE_ID} Only images and videos have a crop.`,
      minLength: 1,
    },
    crop: {
      type: 'object',
      description:
        'Insets from each edge of the picture, in per mille of its sides; two opposite insets add up to at most 999.',
      properties: {
        top: {
          type: 'integer',
          description: `${CROP_INSET} height, from the top edge.`,
          minimum: CROP.minimum,
          maximum: CROP.maximum,
        },
        right: {
          type: 'integer',
          description: `${CROP_INSET} width, from the right edge.`,
          minimum: CROP.minimum,
          maximum: CROP.maximum,
        },
        bottom: {
          type: 'integer',
          description: `${CROP_INSET} height, from the bottom edge.`,
          minimum: CROP.minimum,
          maximum: CROP.maximum,
        },
        left: {
          type: 'integer',
          description: `${CROP_INSET} width, from the left edge.`,
          minimum: CROP.minimum,
          maximum: CROP.maximum,
        },
      },
      required: ['top', 'right', 'bottom', 'left'],
      additionalProperties: false,
    },
  },
  required: ['nodeId', 'crop'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetNodeCornerRadius` (D68): pixels, rounded. */
export const setNodeCornerRadiusArgumentsSchema: ClosedObjectSchema<
  keyof SetNodeCornerRadiusArguments
> = deepFreeze({
  type: 'object',
  description: 'Sets the radius of the corners of an image or a video.',
  properties: {
    nodeId: {
      type: 'string',
      description: `${NODE_ID} Only images and videos have a corner radius.`,
      minLength: 1,
    },
    cornerRadius: {
      type: 'number',
      description:
        'Composition pixels, rounded to an integer, halves towards +Infinity; 0 is square, and a radius above half a side is reduced as CSS does.',
    },
  },
  required: ['nodeId', 'cornerRadius'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetVideoAsset` (D50.6). */
export const setVideoAssetArgumentsSchema: SetVideoAssetArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    'Points a video at another video asset of the document; its source start, size, and fit stay.',
  properties: {
    nodeId: {
      type: 'string',
      description: `${NODE_ID} Only videos have a video asset.`,
      minLength: 1,
    },
    assetId: {
      type: 'string',
      description: 'The ID of a video asset the document declares.',
      minLength: 1,
    },
  },
  required: ['nodeId', 'assetId'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetVideoSource` (D50.6). */
export const setVideoSourceArgumentsSchema: SetVideoSourceArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Sets the source time a video shows at the start of its lifetime; speed is 1.',
  properties: {
    nodeId: {
      type: 'string',
      description: `${NODE_ID} Only videos have a source.`,
      minLength: 1,
    },
    sourceStartUs: {
      type: 'integer',
      description:
        'The source time shown at the start of the lifetime, in integer microseconds from the first frame of the video; it is never rounded. -0 becomes 0.',
      minimum: SOURCE_START.minimum,
      maximum: SOURCE_START.maximum,
    },
  },
  required: ['nodeId', 'sourceStartUs'],
  additionalProperties: false,
});

/** The shape of an audio clip, read from the schema (D52.1). */
const CLIP = compositionSchema.properties.clips.items.properties;
/** The bounds of a volume, read from the schema (D52.1); clips and videos share them. */
const VOLUME = { minimum: CLIP.volume.minimum, maximum: CLIP.volume.maximum } as const;
/** The bounds of a fade, read from the schema (D52.2). */
const FADE: Bounds = { minimum: CLIP.fadeInUs.minimum, maximum: CLIP.fadeInUs.maximum };
/** The bounds of a clip's source start, read from the schema (D52.1). */
const CLIP_SOURCE_START: Bounds = {
  minimum: CLIP.sourceStartUs.minimum,
  maximum: CLIP.sourceStartUs.maximum,
};

const CLIP_ID = 'The ID of an audio clip of the document.';

const VOLUME_TEXT =
  'The linear factor of the amplitude, from 0 (silent) to 1 (the source as it is) inclusive; it never amplifies. A fraction is kept as it is, and -0 becomes 0.';

/** The JSON Schema of the arguments of `SetVideoVolume` (D52.6). */
export const setVideoVolumeArgumentsSchema: SetVideoVolumeArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Sets how loud the sound of a video is heard; 0 is silent.',
  properties: {
    nodeId: {
      type: 'string',
      description: `${NODE_ID} Only videos have a volume.`,
      minLength: 1,
    },
    volume: { type: 'number', description: VOLUME_TEXT, ...VOLUME },
  },
  required: ['nodeId', 'volume'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `AddAudioClip` (D52.6): the clip is the document's to judge. */
export const addAudioClipArgumentsSchema: AddAudioClipArgumentsSchema = deepFreeze({
  type: 'object',
  description: "Inserts a complete audio clip into the document's clips.",
  properties: {
    index: {
      type: 'integer',
      description:
        "The clip's index in the document's clips after the insertion, from 0 to their number. Clips are mixed whatever their order.",
      ...INDEX_BOUNDS,
    },
    clip: {
      type: 'object',
      description:
        'The complete clip as the document stores it: its ID, unused in the document; type audio; the ID of an audio asset; startUs and durationUs in composition time; sourceStartUs; volume; fadeInUs and fadeOutUs.',
    },
  },
  required: ['index', 'clip'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `RemoveAudioClip` (D52.6). */
export const removeAudioClipArgumentsSchema: RemoveAudioClipArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Removes one audio clip.',
  properties: { clipId: { type: 'string', description: CLIP_ID, minLength: 1 } },
  required: ['clipId'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetClipVolume` (D52.6). */
export const setClipVolumeArgumentsSchema: SetClipVolumeArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Sets the volume of one audio clip; 0 is silent.',
  properties: {
    clipId: { type: 'string', description: CLIP_ID, minLength: 1 },
    volume: { type: 'number', description: VOLUME_TEXT, ...VOLUME },
  },
  required: ['clipId', 'volume'],
  additionalProperties: false,
});

const FADE_TEXT =
  "in integer microseconds of the lifetime of the clip, 0 for none; it is never rounded, and -0 becomes 0. Both fades together take at most the clip's durationUs.";

/** The JSON Schema of the arguments of `SetClipFades` (D52.6). */
export const setClipFadesArgumentsSchema: SetClipFadesArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Sets the linear fade-in and fade-out of one audio clip.',
  properties: {
    clipId: { type: 'string', description: CLIP_ID, minLength: 1 },
    fadeInUs: {
      type: 'integer',
      description: `How long the clip rises from silence to its volume at its start, ${FADE_TEXT}`,
      ...FADE,
    },
    fadeOutUs: {
      type: 'integer',
      description: `How long the clip falls from its volume to silence at its end, ${FADE_TEXT}`,
      ...FADE,
    },
  },
  required: ['clipId', 'fadeInUs', 'fadeOutUs'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetClipSource` (D52.6). */
export const setClipSourceArgumentsSchema: SetClipSourceArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    'Points one audio clip at an audio asset and the source time it plays from; its lifetime stays.',
  properties: {
    clipId: { type: 'string', description: CLIP_ID, minLength: 1 },
    assetId: {
      type: 'string',
      description: 'The ID of an audio asset the document declares; it may be the one it has.',
      minLength: 1,
    },
    sourceStartUs: {
      type: 'integer',
      description:
        'The source time heard at the start of the clip, in integer microseconds from the first sample; it is never rounded, and -0 becomes 0.',
      minimum: CLIP_SOURCE_START.minimum,
      maximum: CLIP_SOURCE_START.maximum,
    },
  },
  required: ['clipId', 'assetId', 'sourceStartUs'],
  additionalProperties: false,
});

const TIME = {
  type: 'integer',
  description:
    'A scene time in integer microseconds from the start of the scene of the node; it may lie at or after the end of the scene, and it is never rounded. -0 becomes 0.',
  minimum: KEYFRAME_TIME.minimum,
  maximum: KEYFRAME_TIME.maximum,
} as const;

/** The JSON Schema of the arguments of `AddAnimation` (D41.1, D41.3). */
export const addAnimationArgumentsSchema: AddAnimationArgumentsSchema = deepFreeze({
  type: 'object',
  description: "Inserts a complete animation into a node's animations.",
  properties: {
    nodeId: {
      type: 'string',
      description: 'The stable ID of the node. The background has no animations.',
      minLength: 1,
    },
    index: {
      type: 'integer',
      description: "The animation's index in the node's animations after the insertion.",
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
    },
    animation: {
      type: 'object',
      description:
        'The complete animation as the document stores it: its ID, unused in the document; its property, which the node must not animate already; and its keyframes, each with its time, its value, and its easing.',
    },
  },
  required: ['nodeId', 'index', 'animation'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `RemoveAnimation` (D41.1). */
export const removeAnimationArgumentsSchema: RemoveAnimationArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Removes one animation with all its keyframes.',
  properties: { animationId: { type: 'string', description: ANIMATION_ID, minLength: 1 } },
  required: ['animationId'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetOpacityKeyframe` (D41.1, D41.3). */
export const setOpacityKeyframeArgumentsSchema: SetOpacityKeyframeArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    'Sets the keyframe at a time of an opacity animation, inserting it when none is there.',
  properties: {
    animationId: {
      type: 'string',
      description: `${ANIMATION_ID} It must animate opacity.`,
      minLength: 1,
    },
    timeUs: TIME,
    opacity: {
      type: 'number',
      description: 'The opacity factor, from 0 to 1 inclusive, kept as it is; -0 becomes 0.',
      minimum: 0,
      maximum: 1,
    },
  },
  required: ['animationId', 'timeUs', 'opacity'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetPositionKeyframe` (D41.1, D41.3). */
export const setPositionKeyframeArgumentsSchema: SetPositionKeyframeArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    'Sets the keyframe at a time of a position animation, inserting it when none is there.',
  properties: {
    animationId: {
      type: 'string',
      description: `${ANIMATION_ID} It must animate position.`,
      minLength: 1,
    },
    timeUs: TIME,
    offset: {
      type: 'object',
      description:
        "The offset added to the node's base position, in composition pixels; each coordinate is rounded to an integer, halves towards +Infinity, and -0 becomes 0.",
      properties: {
        x: { type: 'number', description: 'The horizontal offset.' },
        y: { type: 'number', description: 'The vertical offset.' },
      },
      required: ['x', 'y'],
      additionalProperties: false,
    },
  },
  required: ['animationId', 'timeUs', 'offset'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetScaleKeyframe` (D41.1, D41.3). */
export const setScaleKeyframeArgumentsSchema: SetScaleKeyframeArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Sets the keyframe at a time of a scale animation, inserting it when none is there.',
  properties: {
    animationId: {
      type: 'string',
      description: `${ANIMATION_ID} It must animate scale.`,
      minLength: 1,
    },
    timeUs: TIME,
    factor: {
      type: 'object',
      description: "The factors multiplied with the node's base scale.",
      properties: {
        x: {
          type: 'number',
          description: 'A factor from 0 to 1000 inclusive; -0 becomes 0.',
          minimum: 0,
          maximum: 1000,
        },
        y: {
          type: 'number',
          description: 'A factor from 0 to 1000 inclusive; -0 becomes 0.',
          minimum: 0,
          maximum: 1000,
        },
      },
      required: ['x', 'y'],
      additionalProperties: false,
    },
  },
  required: ['animationId', 'timeUs', 'factor'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `AddKeyframe` (D41.1, D41.3). */
export const addKeyframeArgumentsSchema: AddKeyframeArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    'Inserts a keyframe given as exact data at the place its time gives it; its value is judged by the document.',
  properties: {
    animationId: { type: 'string', description: ANIMATION_ID, minLength: 1 },
    keyframe: {
      type: 'object',
      description:
        'The keyframe as the document stores it: its time, which must be free, its value, and its easing.',
      properties: { timeUs: TIME },
      required: ['timeUs'],
    },
  },
  required: ['animationId', 'keyframe'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `RemoveKeyframe` (D41.1, D41.4). */
export const removeKeyframeArgumentsSchema: RemoveKeyframeArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    'Removes the keyframe at a time; refused when the animation would keep fewer keyframes than the document allows.',
  properties: {
    animationId: { type: 'string', description: ANIMATION_ID, minLength: 1 },
    timeUs: TIME,
  },
  required: ['animationId', 'timeUs'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `MoveKeyframe` (D41.1). */
export const moveKeyframeArgumentsSchema: MoveKeyframeArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Gives the keyframe at a time another time, which must be free.',
  properties: {
    animationId: { type: 'string', description: ANIMATION_ID, minLength: 1 },
    timeUs: TIME,
    toTimeUs: TIME,
  },
  required: ['animationId', 'timeUs', 'toTimeUs'],
  additionalProperties: false,
});

/**
 * What an easing is, for a model (D67): the same for keyframes and transitions.
 * Exported for the descriptions of the tools.
 */
export const EASINGS =
  'An easing is an object with its kind: {"kind":"linear"} (a constant speed), {"kind":"hold"} (the value stays until the next keyframe, then jumps), {"kind":"ease-in"} (starts slowly), {"kind":"ease-out"} (slows down at the end), {"kind":"ease-in-out"} (both), {"kind":"cubic-bezier","x1":0.34,"y1":1.56,"x2":0.64,"y2":1} (the curve of CSS cubic-bezier(); x1 and x2 from 0 to 1, y1 and y2 from -1 to 2, where a y outside 0 to 1 overshoots and the value is held within the range of its property), or {"kind":"steps","count":4,"position":"end"} (count equal jumps, 1 to 1000, at the end or the start of each interval, as CSS steps()).';

/** The JSON Schema of the arguments of `SetKeyframeEasing` (D67.7): the easing is the document's to judge. */
export const setKeyframeEasingArgumentsSchema: SetKeyframeEasingArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    'Replaces how the value moves from the keyframe at a time to the next one; the easing of the last keyframe is kept but never read.',
  properties: {
    animationId: { type: 'string', description: ANIMATION_ID, minLength: 1 },
    timeUs: TIME,
    easing: { type: 'object', description: `The complete new easing. ${EASINGS}` },
  },
  required: ['animationId', 'timeUs', 'easing'],
  additionalProperties: false,
});

/**
 * What a keyframe value of each property of schema 0.13 is, for a model
 * (D65.2, D68). Exported for the descriptions of the tools.
 */
export const KEYFRAME_VALUES =
  'The value depends on the property of the animation: rotation, a number of degrees added to the node\'s rotation; origin, {"x":…,"y":…} integers in per mille (-1000 to 1000) added to the node\'s origin; size, {"width":…,"height":…} in composition pixels (rounded) that replaces the node\'s size; color, "#rrggbb" that replaces the node\'s colour; crop, {"top":…,"right":…,"bottom":…,"left":…} integers in per mille that replaces the node\'s crop; cornerRadius, composition pixels (rounded) that replace the node\'s corner radius; fill and stroke/color, "#rrggbb" that replaces the colour of a shape\'s solid fill or of its stroke; stroke/width, composition pixels (0 to 1000) that replace the width of its stroke; trim/start and trim/end, integers in per mille (0 to 1000) of the outline that replace where its drawn part starts or ends; geometry, a complete geometry of the structure of the shape\'s own (its kind, its number of points, its commands in the same order with the same arc flags) that replaces it, every number moving on its own, so that a path morphs.';

/** The JSON Schema of the arguments of `SetKeyframeValue` (D65.2): the value is the row's to judge. */
export const setKeyframeValueArgumentsSchema: SetKeyframeValueArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    'Sets the keyframe at a time of an animation of rotation, origin, size, color, crop, cornerRadius, fill, stroke/color, stroke/width, trim/start, trim/end, or geometry, inserting it when none is there.',
  properties: {
    animationId: {
      type: 'string',
      description: `${ANIMATION_ID} Opacity, position, and scale have their own keyframe commands.`,
      minLength: 1,
    },
    timeUs: TIME,
    value: {
      description: `The keyframe value. ${KEYFRAME_VALUES}`,
      anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'object' }],
    },
  },
  required: ['animationId', 'timeUs', 'value'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetNodeLifetime` (D42.10). */
export const setNodeLifetimeArgumentsSchema: SetNodeLifetimeArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    'Sets when a node is shown: from startUs, for durationUs, in the time of its scene. It moves no keyframe of the node.',
  properties: {
    nodeId: {
      type: 'string',
      description: 'The stable ID of the node. Every node has a lifetime, the background included.',
      minLength: 1,
    },
    startUs: {
      type: 'integer',
      description:
        'The scene time from which the node is active, in integer microseconds from the start of its scene; it may lie at or after the end of the scene, and it is never rounded. -0 becomes 0.',
      minimum: LIFETIME.startUs.minimum,
      maximum: LIFETIME.startUs.maximum,
    },
    durationUs: {
      type: 'integer',
      description:
        'How long the node is active, in integer microseconds, at least 1; whatever lies past the end of its scene is cut, and it is never rounded.',
      minimum: LIFETIME.durationUs.minimum,
      maximum: LIFETIME.durationUs.maximum,
    },
  },
  required: ['nodeId', 'startUs', 'durationUs'],
  additionalProperties: false,
});

/** The bounds of a scene's duration, read from the schema (D54.1). */
const SCENE_DURATION: Bounds = {
  minimum: compositionSchema.properties.scenes.items.properties.durationUs.minimum,
  maximum: compositionSchema.properties.scenes.items.properties.durationUs.maximum,
};

const SCENE_ID = 'The stable ID of a scene of the document.';

/** The JSON Schema of the arguments of `AddScene` (D54.5): the scene is the document's to judge. */
export const addSceneArgumentsSchema: AddSceneArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    "Inserts a complete scene into the sequence; the composition's durationUs grows by the scene's.",
  properties: {
    index: {
      type: 'integer',
      description:
        "The scene's index in the sequence after the insertion, from 0 (the first scene) to the number of scenes (after the last).",
      ...INDEX_BOUNDS,
    },
    scene: {
      type: 'object',
      description:
        'The complete scene as the document stores it: its ID, durationUs, nodes, and clips, every ID of it chosen by the caller and unused in the document, every time in it scene time.',
    },
  },
  required: ['index', 'scene'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `RemoveScene` (D54.5). */
export const removeSceneArgumentsSchema: RemoveSceneArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    "Removes a scene with its nodes and clips; the composition's durationUs shrinks by the scene's. The last scene cannot be removed.",
  properties: { sceneId: { type: 'string', description: SCENE_ID, minLength: 1 } },
  required: ['sceneId'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `DuplicateScene` (D54.5). */
export const duplicateSceneArgumentsSchema: DuplicateSceneArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    "Copies a scene, with its nodes and clips, directly after it; the composition's durationUs grows by the scene's.",
  properties: {
    sceneId: { type: 'string', description: SCENE_ID, minLength: 1 },
    newSceneId: {
      type: 'string',
      description:
        'The ID of the copy, unused in the document. Every other ID of the copy derives from it: the node at index i becomes `<newSceneId>-n<i>`, its child at index j `<newSceneId>-n<i>-c<j>`, an animation `<owner>-a-<property>`, a text animation at index t `<owner>-t<t>`, and the clip at index k `<newSceneId>-k<k>`.',
      pattern: ID_PATTERN,
    },
  },
  required: ['sceneId', 'newSceneId'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `ReorderScene` (D54.5). */
export const reorderSceneArgumentsSchema: ReorderSceneArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Moves a scene to another place in the sequence; nothing inside it moves.',
  properties: {
    sceneId: { type: 'string', description: SCENE_ID, minLength: 1 },
    index: {
      type: 'integer',
      description:
        "The scene's index in the sequence after the move, from 0 (the first) to the number of scenes minus 1 (the last).",
      ...INDEX_BOUNDS,
    },
  },
  required: ['sceneId', 'index'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetSceneDuration` (D54.5). */
export const setSceneDurationArgumentsSchema: SetSceneDurationArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    "Sets how long a scene lasts; the composition's durationUs changes by the same amount, and every later scene starts that much earlier or later.",
  properties: {
    sceneId: { type: 'string', description: SCENE_ID, minLength: 1 },
    durationUs: {
      type: 'integer',
      description:
        'The new duration of the scene, in integer microseconds, at least 1; never rounded. What lies past it in the scene is cut.',
      minimum: SCENE_DURATION.minimum,
      maximum: SCENE_DURATION.maximum,
    },
  },
  required: ['sceneId', 'durationUs'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `MoveNodeToScene` (D54.5). */
export const moveNodeToSceneArgumentsSchema: MoveNodeToSceneArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    "Moves a node of a scene's own list, with its animations and children, into the list of a scene; its times stay the same scene times.",
  properties: {
    nodeId: {
      type: 'string',
      description: 'The stable ID of a node of a scene, not a child of a group.',
      minLength: 1,
    },
    sceneId: { type: 'string', description: SCENE_ID, minLength: 1 },
    index: {
      type: 'integer',
      description:
        "The node's index in the nodes of that scene after the move, from 0 (the bottom layer) to their number (the top), or their number minus 1 within its own scene.",
      ...INDEX_BOUNDS,
    },
  },
  required: ['nodeId', 'sceneId', 'index'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `AddSceneAudioClip` (D54.5): the clip is the document's to judge. */
export const addSceneAudioClipArgumentsSchema: AddSceneAudioClipArgumentsSchema = deepFreeze({
  type: 'object',
  description: "Inserts a complete audio clip into a scene's clips, in scene time.",
  properties: {
    sceneId: { type: 'string', description: SCENE_ID, minLength: 1 },
    index: {
      type: 'integer',
      description:
        "The clip's index in the scene's clips after the insertion, from 0 to their number. Clips are mixed whatever their order.",
      ...INDEX_BOUNDS,
    },
    clip: {
      type: 'object',
      description:
        'The complete clip as the document stores it: its ID, unused in the document; type audio; the ID of an audio asset; startUs and durationUs in scene time; sourceStartUs; volume; fadeInUs and fadeOutUs.',
    },
  },
  required: ['sceneId', 'index', 'clip'],
  additionalProperties: false,
});

const TIMELINE_CLIP_ID =
  'The stable ID of a clip: a node of any type, a child of a group included, or an audio clip of the composition or of a scene.';

/** A time of a timeline command (D55.2), with the bounds of a lifetime's start (D42.1). */
function timelineTime(description: string) {
  return {
    type: 'integer',
    description: `${description} In integer microseconds of the time of the clip's scene, or composition time for a composition clip; never rounded. -0 becomes 0.`,
    minimum: LIFETIME.startUs.minimum,
    maximum: LIFETIME.startUs.maximum,
  } as const;
}

/** The JSON Schema of the arguments of `MoveClip` (D55.2). */
export const moveClipArgumentsSchema: MoveClipArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    "Moves a clip to a new start, keeping its duration and its source; a node's keyframes, and a group's children with theirs, move by the same amount.",
  properties: {
    clipId: { type: 'string', description: TIMELINE_CLIP_ID, minLength: 1 },
    startUs: timelineTime('The new start of the clip.'),
  },
  required: ['clipId', 'startUs'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `TrimClipStart` (D55.2). */
export const trimClipStartArgumentsSchema: TrimClipStartArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    "Moves the start of a clip and keeps its end; a video's or an audio clip's sourceStartUs moves by the same amount, so what remains plays where it did.",
  properties: {
    clipId: { type: 'string', description: TIMELINE_CLIP_ID, minLength: 1 },
    startUs: timelineTime('The new start of the clip, before its end.'),
  },
  required: ['clipId', 'startUs'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `TrimClipEnd` (D55.2). */
export const trimClipEndArgumentsSchema: TrimClipEndArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Moves the end of a clip and keeps its start.',
  properties: {
    clipId: { type: 'string', description: TIMELINE_CLIP_ID, minLength: 1 },
    endUs: timelineTime('The new end of the clip, exclusive, after its start.'),
  },
  required: ['clipId', 'endUs'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SplitClip` (D55.2). */
export const splitClipArgumentsSchema: SplitClipArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    'Cuts a clip into two that meet at atUs; the second half is placed directly after the first.',
  properties: {
    clipId: { type: 'string', description: TIMELINE_CLIP_ID, minLength: 1 },
    atUs: timelineTime('The time of the cut, strictly between the start and the end of the clip.'),
    newClipId: {
      type: 'string',
      description:
        'The ID of the second half, unused in the document. Each copied animation becomes `<newClipId>-a-<property>`, and the text animation at index t `<newClipId>-t<t>`.',
      pattern: ID_PATTERN,
    },
  },
  required: ['clipId', 'atUs', 'newClipId'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `JoinClips` (D55.5). */
export const joinClipsArgumentsSchema: JoinClipsArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Joins two halves of a split back into one clip.',
  properties: {
    clipId: { type: 'string', description: 'The ID of the first half.', minLength: 1 },
    nextClipId: {
      type: 'string',
      description:
        'The ID of the second half: directly after the first in the same list, exactly as split_clip made it.',
      minLength: 1,
    },
  },
  required: ['clipId', 'nextClipId'],
  additionalProperties: false,
});

const TRANSITION_ID = 'The stable ID of a scene transition or a clip transition of the document.';

const EFFECTS =
  'An effect is an object with its kind, the same for scene and clip transitions: {"kind":"crossfade"} (the incoming side fades in over the outgoing one), {"kind":"fade-through-color","color":"#rrggbb"} (the outgoing side fades out to the colour, then the incoming one fades in from it), {"kind":"slide","direction":"left"|"right"|"up"|"down"} (the incoming side slides in, moving in its direction), {"kind":"wipe","direction":…} (an edge moving in its direction uncovers the incoming side), {"kind":"push","direction":…} (the incoming side slides in and pushes the outgoing one out the other way), {"kind":"zoom","fromScale":0.5} (the incoming side fades in while it scales from fromScale, 0 to 16, to its size about the centre of the frame), {"kind":"iris","center":{"x":500,"y":500}} (a circle opens from a point given in per mille of the frame, integers 0 to 1000), or {"kind":"blur-dissolve","radius":12} (the incoming side fades in and sharpens while the outgoing one blurs, radius the strongest blur in composition pixels, 0 to 1000). The frame of a clip transition is the canvas, in the space of the two nodes\' parent; between clips, the colour of fade-through-color covers the frame directly below the lower clip, and when the outgoing clip lies above the incoming one, a slide moves it out, a wipe and an iris cut it away, and a crossfade and a zoom fade it out, so the incoming clip is uncovered.';

const TRANSITION_DURATION: Bounds = {
  minimum: compositionSchema.properties.transitions.items.properties.durationUs.minimum,
  maximum: compositionSchema.properties.transitions.items.properties.durationUs.maximum,
};

/** The JSON Schema of the arguments of `AddSceneTransition` (D56.6): the transition is the document's to judge. */
export const addSceneTransitionArgumentsSchema: AddSceneTransitionArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    "Inserts a transition on the boundary between two adjacent scenes: the incoming scene starts durationUs earlier and overlaps the end of the outgoing one, and the composition's durationUs shrinks by as much.",
  properties: {
    index: {
      type: 'integer',
      description:
        "The transition's index in the composition's transitions after the insertion, from 0 to their number; their order has no meaning.",
      ...INDEX_BOUNDS,
    },
    transition: {
      type: 'object',
      description: `The complete transition as the document stores it: its ID, unused in the document; fromSceneId, the outgoing scene; toSceneId, the scene directly after it; durationUs, at most the duration of either scene; and effect. ${EFFECTS}`,
    },
  },
  required: ['index', 'transition'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `AddClipTransition` (D56.6): the transition is the document's to judge. */
export const addClipTransitionArgumentsSchema: AddClipTransitionArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    'Inserts a transition between two clips of one layer of a scene, two children of one parent whose lifetimes already overlap by exactly its durationUs; nothing moves.',
  properties: {
    sceneId: { type: 'string', description: SCENE_ID, minLength: 1 },
    index: {
      type: 'integer',
      description:
        "The transition's index in the scene's transitions after the insertion, from 0 to their number; their order has no meaning.",
      ...INDEX_BOUNDS,
    },
    transition: {
      type: 'object',
      description: `The complete transition as the document stores it: its ID, unused in the document; fromNodeId, the outgoing node, which ends durationUs after the incoming one starts; toNodeId, the incoming node; durationUs; and effect. ${EFFECTS}`,
    },
  },
  required: ['sceneId', 'index', 'transition'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `RemoveTransition` (D56.6). */
export const removeTransitionArgumentsSchema: RemoveTransitionArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    "Removes a transition. A scene transition's duration is given back: the incoming scene starts that much later, and the composition's durationUs grows by as much. A clip transition's clips stay where they are.",
  properties: { transitionId: { type: 'string', description: TRANSITION_ID, minLength: 1 } },
  required: ['transitionId'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetTransitionDuration` (D56.6). */
export const setTransitionDurationArgumentsSchema: SetTransitionDurationArgumentsSchema =
  deepFreeze({
    type: 'object',
    description:
      "Sets how long a transition lasts. For a scene transition, the incoming scene and every later one start earlier or later by the change, and the composition's durationUs changes by the opposite amount. For a clip transition, the outgoing clip's durationUs changes by the same amount, so that it still ends durationUs after the incoming clip starts.",
    properties: {
      transitionId: { type: 'string', description: TRANSITION_ID, minLength: 1 },
      durationUs: {
        type: 'integer',
        description:
          'The new duration of the transition, in integer microseconds, at least 1; at most the duration of either side, and the transitions into and out of one side together at most its duration.',
        minimum: TRANSITION_DURATION.minimum,
        maximum: TRANSITION_DURATION.maximum,
      },
    },
    required: ['transitionId', 'durationUs'],
    additionalProperties: false,
  });

/** The JSON Schema of the arguments of `SetTransitionEffect` (D56.6): the effect is the document's to judge. */
export const setTransitionEffectArgumentsSchema: SetTransitionEffectArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Replaces how a transition combines its two sides; no time changes.',
  properties: {
    transitionId: { type: 'string', description: TRANSITION_ID, minLength: 1 },
    effect: { type: 'object', description: `The complete new effect. ${EFFECTS}` },
  },
  required: ['transitionId', 'effect'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetTransitionEasing` (D67.7): the easing is the document's to judge. */
export const setTransitionEasingArgumentsSchema: SetTransitionEasingArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    'Replaces how the progress of a transition moves through its overlap; no time changes.',
  properties: {
    transitionId: { type: 'string', description: TRANSITION_ID, minLength: 1 },
    easing: { type: 'object', description: `The complete new easing. ${EASINGS}` },
  },
  required: ['transitionId', 'easing'],
  additionalProperties: false,
});

const CAPTIONS_ID = 'The stable ID of a captions node.';

const WORD =
  'A word is {text, startUs, durationUs}: text is at least one character and no white space; startUs is the scene time, in integer microseconds, at which it is spoken, and durationUs how long, at least 1. A word starts no earlier than the word before it ends. Words are in scene time, like keyframes: moving the node moves them, trimming it does not.';

/** The JSON Schema of the arguments of `SetCaptionWords` (D57.5): the words are the document's to judge. */
export const setCaptionWordsArgumentsSchema: SetCaptionWordsArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Replaces every word of a captions node, as a new transcription.',
  properties: {
    nodeId: { type: 'string', description: CAPTIONS_ID, minLength: 1 },
    words: {
      type: 'array',
      description: `Every word of the node, in the order they are spoken; an empty list shows nothing. ${WORD}`,
      items: { type: 'object', description: 'One word, as the document stores it.' },
    },
  },
  required: ['nodeId', 'words'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetCaptionWord` (D57.5): the word is the document's to judge. */
export const setCaptionWordArgumentsSchema: SetCaptionWordArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Replaces one word of a captions node: its text, its timing, or both.',
  properties: {
    nodeId: { type: 'string', description: CAPTIONS_ID, minLength: 1 },
    index: {
      type: 'integer',
      description: "The index of the word in the node's words, from 0.",
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
    },
    word: { type: 'object', description: `The complete new word. ${WORD}` },
  },
  required: ['nodeId', 'index', 'word'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetCaptionStyle` (D57.5): the style is the document's to judge. */
export const setCaptionStyleArgumentsSchema: SetCaptionStyleArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Replaces how a captions node shows its words; no word and no time changes.',
  properties: {
    nodeId: { type: 'string', description: CAPTIONS_ID, minLength: 1 },
    style: {
      type: 'object',
      description:
        'The complete new style: {fontSize, lineHeight, color, highlight, align, verticalAlign, maxLineLength, maxLines, stroke, shadow, box, pageIn, pageOut}. fontSize and lineHeight are integer composition pixels; color lowercase #rrggbb; highlight what the word being spoken shows (see set_caption_highlight); align is left, center, or right; verticalAlign top, middle, or bottom; maxLineLength the most characters of a line, 1 to 1000, a space between two words counting as one; maxLines the most lines of a page, 1 to 100; stroke, shadow, and box as the style of a text, the box lying behind every line; pageIn and pageOut how a page enters and leaves (see set_caption_page_animation).',
    },
  },
  required: ['nodeId', 'style'],
  additionalProperties: false,
});

const TEXT_ID = 'The stable ID of a text node.';

const TEXT_STYLE =
  'The complete style: {stroke, shadow, box}, each {kind: "none"} or: stroke {kind: "outside", color, width} for an outline of width pixels (1 to 1000) outside every glyph; shadow {kind: "drop", color, opacity, offset: {x, y}, blur} for a shadow moved by offset pixels (-1000 to 1000) and blurred by blur pixels (0 to 1000); box {kind: "solid", color, opacity, padding, cornerRadius} for a filled box behind the text, padding pixels beyond its lines on every side, with rounded corners. Colours are lowercase #rrggbb, opacities 0 to 1, and lengths integers.';

const TEXT_ANIMATION =
  'A text animation is {id, unit, phase, staggerUs, order, tracks}: unit "letter", "word", or "line"; phase {kind: "in"} (the first fragment starts at the node\'s start), {kind: "out"} (the last fragment ends at the node\'s end), or {kind: "accent", startUs} (the first fragment starts at that scene time); staggerUs the integer microseconds between two fragments that follow each other; order {kind: "forward"}, {kind: "backward"}, {kind: "center"}, {kind: "edges"}, or {kind: "random", seed} with an unsigned 32-bit integer seed; tracks at least one, at most one per property, each {property, keyframes} with property "opacity" (a factor 0 to 1), "offset" ({x, y} integer pixels added), "scale" ({x, y} factors about the fragment\'s centre), "rotation" (degrees added, about its centre), or "color" (#rrggbb that replaces the text\'s colour), and at least two keyframes {timeUs, value, easing} in ascending time, timeUs in the fragment\'s own time from 0.';

/** The JSON Schema of the arguments of `SetTextStyle` (D69): the style is the document's to judge. */
export const setTextStyleArgumentsSchema: SetTextStyleArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Replaces the outline, the shadow, and the box of a text node.',
  properties: {
    nodeId: { type: 'string', description: TEXT_ID, minLength: 1 },
    style: { type: 'object', description: TEXT_STYLE },
  },
  required: ['nodeId', 'style'],
  additionalProperties: false,
});

const SHAPE_ID = 'The stable ID of a shape node.';

const SHAPE_GEOMETRY =
  'The complete geometry, in composition pixels of the node\'s box: {kind: "rect", cornerRadius} fills the box, its corners rounded by cornerRadius pixels; {kind: "ellipse"} fills the box; {kind: "polygon", points} is closed through 3 to 1000 points {x, y}; {kind: "path", fillRule, commands} is 1 to 1000 absolute commands, the first a move: {kind: "move", x, y}, {kind: "line", x, y}, {kind: "cubic", x1, y1, x2, y2, x, y}, {kind: "quadratic", x1, y1, x, y}, {kind: "arc", rx, ry, rotation, largeArc, sweep, x, y}, {kind: "close"}, with fillRule "nonzero" or "evenodd". Coordinates are numbers from -1000000 to 1000000 and may leave the box.';

const SHAPE_FILL =
  'The complete fill: {kind: "none"}; {kind: "solid", color}; {kind: "linear-gradient", start: {x, y}, end: {x, y}, stops}; or {kind: "radial-gradient", center: {x, y}, radius, stops}, points and radius in composition pixels of the node\'s box; stops are 2 to 16 {offset, color, opacity}, offset an integer per mille of the gradient (0 to 1000) in ascending order, opacity 0 to 1. Colours are lowercase #rrggbb.';

const SHAPE_STROKE =
  'The complete stroke: {color, width, dash, cap, join}: color lowercase #rrggbb; width in composition pixels (0 to 1000, 0 draws none) centred on the outline; dash an even list of integer lengths of dashes and gaps in turn (1 to 1000 per mille of the whole outline, at most 16), [] for a solid stroke; cap "butt", "round", or "square"; join "miter", "round", or "bevel".';

/** The JSON Schema of the arguments of `SetShapeGeometry` (D73): the geometry is the document's to judge. */
export const setShapeGeometryArgumentsSchema: SetShapeGeometryArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Replaces what a shape draws.',
  properties: {
    nodeId: { type: 'string', description: SHAPE_ID, minLength: 1 },
    geometry: { type: 'object', description: SHAPE_GEOMETRY },
  },
  required: ['nodeId', 'geometry'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetShapeFill` (D73): the fill is the document's to judge. */
export const setShapeFillArgumentsSchema: SetShapeFillArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Replaces what the inside of a shape is painted with.',
  properties: {
    nodeId: { type: 'string', description: SHAPE_ID, minLength: 1 },
    fill: { type: 'object', description: SHAPE_FILL },
  },
  required: ['nodeId', 'fill'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetShapeStroke` (D73): the stroke is the document's to judge. */
export const setShapeStrokeArgumentsSchema: SetShapeStrokeArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Replaces the outline of a shape.',
  properties: {
    nodeId: { type: 'string', description: SHAPE_ID, minLength: 1 },
    stroke: { type: 'object', description: SHAPE_STROKE },
  },
  required: ['nodeId', 'stroke'],
  additionalProperties: false,
});

const COMPOSITED_ID =
  'ID of an image, video, text, captions, shape, or group node; only these blend, take a mask, and take a matte.';

/** The JSON Schema of the arguments of `SetBlendMode` (D75): one value of the schema's set. */
export const setBlendModeArgumentsSchema: SetBlendModeArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Sets how a node blends with what lies below it in its scene or group.',
  properties: {
    nodeId: { type: 'string', description: COMPOSITED_ID, minLength: 1 },
    blendMode: {
      type: 'string',
      description:
        'normal lays the node over what lies below; multiply, screen, overlay, darken, lighten, color-dodge, color-burn, hard-light, soft-light, difference, and exclusion blend each colour channel; hue, saturation, color, and luminosity take that part of the node and the rest of what lies below. A scene or group holding a node that blends is composited on its own.',
      enum: BLEND_MODES,
    },
  },
  required: ['nodeId', 'blendMode'],
  additionalProperties: false,
});

const NODE_MASK =
  'The complete mask: {kind: "none"}; {kind: "shape", x, y, width, height, geometry, inverted, feather, animations}, a geometry as a shape\'s (rect, ellipse, polygon, or path) drawn in the box x, y, width, height in pixels of the node\'s own box; or {kind: "image", assetId, x, y, width, height, mode, inverted, feather, animations}, an image asset stretched over that box, mode "alpha" or "luminance". inverted shows the node where the mask does not cover it; feather is the softness of the edge in composition pixels (0 to 1000). animations are [] or {id, property: "geometry" | "feather", keyframes} (geometry for a shape mask only, every keyframe of the mask\'s geometry structure).';

/** The JSON Schema of the arguments of `SetNodeMask` (D75): the mask is the document's to judge. */
export const setNodeMaskArgumentsSchema: SetNodeMaskArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Replaces what masks a node.',
  properties: {
    nodeId: { type: 'string', description: COMPOSITED_ID, minLength: 1 },
    mask: { type: 'object', description: NODE_MASK },
  },
  required: ['nodeId', 'mask'],
  additionalProperties: false,
});

const NODE_MATTE =
  'The complete matte: {kind: "none"}; or {kind: "node", nodeId, mode}, nodeId a shape node of the same scene or group that has no mask, matte, or blend mode of its own and is no side of a clip transition, mode "alpha", "alpha-inverted", "luminance", or "luminance-inverted".';

/** The JSON Schema of the arguments of `SetNodeMatte` (D75): the matte is the document's to judge. */
export const setNodeMatteArgumentsSchema: SetNodeMatteArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Replaces which sibling shape mattes a node.',
  properties: {
    nodeId: { type: 'string', description: COMPOSITED_ID, minLength: 1 },
    matte: { type: 'object', description: NODE_MATTE },
  },
  required: ['nodeId', 'matte'],
  additionalProperties: false,
});

const TRIM_POINT = `An integer from ${String(TRIM.minimum)} to ${String(TRIM.maximum)}, per mille of the length of the outline from where it starts,`;

/** The JSON Schema of the arguments of `SetShapeTrim` (D73): two integers in per mille. */
export const setShapeTrimArgumentsSchema: SetShapeTrimArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Sets the part of the outline of a shape that its stroke draws.',
  properties: {
    nodeId: { type: 'string', description: SHAPE_ID, minLength: 1 },
    trim: {
      type: 'object',
      description:
        'The drawn part of the outline: from start to end; 0 and 1000 is the whole outline, and an end at or before the start draws none of it. The fill is not trimmed.',
      properties: {
        start: {
          type: 'integer',
          description: `${TRIM_POINT} where the drawn part begins.`,
          minimum: TRIM.minimum,
          maximum: TRIM.maximum,
        },
        end: {
          type: 'integer',
          description: `${TRIM_POINT} where the drawn part ends.`,
          minimum: TRIM.minimum,
          maximum: TRIM.maximum,
        },
      },
      required: ['start', 'end'],
      additionalProperties: false,
    },
  },
  required: ['nodeId', 'trim'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `AddTextAnimation` (D69). */
export const addTextAnimationArgumentsSchema: AddTextAnimationArgumentsSchema = deepFreeze({
  type: 'object',
  description: "Inserts a complete text animation into a text node's text animations.",
  properties: {
    nodeId: { type: 'string', description: TEXT_ID, minLength: 1 },
    index: {
      type: 'integer',
      description: "The text animation's index in the node's text animations after the insertion.",
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
    },
    animation: {
      type: 'object',
      description: `The complete text animation, its ID unused in the document. ${TEXT_ANIMATION}`,
    },
  },
  required: ['nodeId', 'index', 'animation'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `RemoveTextAnimation` (D69). */
export const removeTextAnimationArgumentsSchema: RemoveTextAnimationArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Removes one text animation with all its tracks.',
  properties: {
    textAnimationId: {
      type: 'string',
      description: 'The ID of a text animation of the document.',
      minLength: 1,
    },
  },
  required: ['textAnimationId'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetTextAnimation` (D69). */
export const setTextAnimationArgumentsSchema: SetTextAnimationArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Replaces the text animation with the same ID.',
  properties: {
    animation: {
      type: 'object',
      description: `The complete new text animation; its id names the text animation it replaces. ${TEXT_ANIMATION}`,
    },
  },
  required: ['animation'],
  additionalProperties: false,
});

const CAPTION_HIGHLIGHT =
  'The complete highlight: {color, scale, tracks, underline, box}, shown on the word being spoken from its startUs for its durationUs and at no other time. color is lowercase #rrggbb; scale a factor of its size about its centre on both axes, 1 for none; tracks a list, at most one per property, of {property, keyframes} as the tracks of a text animation, in the word\'s own time from 0 at its startUs (a bounce, a pop), [] for none; underline {kind: "none"} or {kind: "solid", color, thickness, offset}, a bar as wide as the word, thickness pixels (1 to 1000) tall, its bottom edge offset pixels (-1000 to 1000) below the bottom of the word\'s line; box {kind: "none"} or {kind: "solid", color, opacity, padding, cornerRadius} behind the word. A scaled or moving word never pushes its neighbours: lines and pages stay as they are.';

const PAGE_ANIMATION =
  'The complete page animation: {kind: "none"}, or {kind: "animate", unit, staggerUs, order, tracks} with unit "word" or "line" of the page, staggerUs the integer microseconds between two fragments that follow each other, order as for a text animation, and tracks as for a text animation, in each fragment\'s own time. An entrance starts the first fragment at the start of the page\'s first word; an exit ends the last fragment\'s last keyframe at the start of the next page, or on the last page at the end of the last word.';

/** The JSON Schema of the arguments of `SetCaptionHighlight` (D70): the highlight is the document's to judge. */
export const setCaptionHighlightArgumentsSchema: SetCaptionHighlightArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Replaces what the word being spoken shows in a captions node.',
  properties: {
    nodeId: { type: 'string', description: CAPTIONS_ID, minLength: 1 },
    highlight: { type: 'object', description: CAPTION_HIGHLIGHT },
  },
  required: ['nodeId', 'highlight'],
  additionalProperties: false,
});

/** The phases of a page of captions (D70). */
const PAGE_PHASES: readonly SetCaptionPageAnimationArguments['phase'][] = Object.freeze([
  'in',
  'out',
]);

/** The JSON Schema of the arguments of `SetCaptionPageAnimation` (D70): the animation is the document's to judge. */
export const setCaptionPageAnimationArgumentsSchema: SetCaptionPageAnimationArgumentsSchema =
  deepFreeze({
    type: 'object',
    description: 'Replaces how every page of a captions node enters or leaves.',
    properties: {
      nodeId: { type: 'string', description: CAPTIONS_ID, minLength: 1 },
      phase: {
        type: 'string',
        description: 'in for how a page enters, out for how it leaves.',
        enum: PAGE_PHASES,
      },
      animation: { type: 'object', description: PAGE_ANIMATION },
    },
    required: ['nodeId', 'phase', 'animation'],
    additionalProperties: false,
  });

/** The JSON Schema of the arguments of `SetSafeArea` (D70): the safe area is the document's to judge. */
export const setSafeAreaArgumentsSchema: SetSafeAreaArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Replaces the safe area of the composition.',
  properties: {
    safeArea: {
      type: 'object',
      description:
        'The complete safe area: {fromTop, fromRight, fromBottom, fromLeft}, integer composition pixels from each edge of the canvas; two opposite insets leave at least 1 pixel, and all zero is the whole canvas.',
    },
  },
  required: ['safeArea'],
  additionalProperties: false,
});

const EFFECT_ID = 'The stable ID of an effect of a node or a scene of the document.';

const EFFECT_INDEX = {
  type: 'integer',
  description: "The effect's index in its owner's effects after the edit: 0 applies first.",
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
} as const;

/** What an effect is, for the descriptions of its arguments (D71). */
const EFFECT =
  'An effect is {id, kind, ...parameters, animations}: kind "blur" {radius} (the standard deviation in composition pixels, 0 to 1000; the blur spills beyond the box), "brightness", "contrast", or "saturate" {amount} (a factor 0 to 10, 1 changes nothing), "grayscale", "invert", or "sepia" {amount} (0 changes nothing to 1 for all of it), "hue-rotate" {angle} (degrees), or "drop-shadow" {color, opacity, offset {x, y}, blur} (lowercase #rrggbb, 0 to 1, pixels -1000 to 1000, a blur radius 0 to 1000); or, as SVG filters, "curves" {red, green, blue, amount} (2 to 32 output levels 0 to 1 per channel, [0, 1] changes nothing; amount 0 to 1 mixes them in), "color-grade" {lift, gamma, gain, temperature, tint} (-1 to 1, 0.1 to 10, 0 to 10, -1 to 1, -1 to 1; 0, 1, 1, 0, 0 change nothing), "glow" {color, opacity, radius} (a blurred copy of the shape in the colour, drawn under it), "vignette" {amount, size} (0 to 1 darkness of the edges; 0.05 to 10, small is tight), or "chroma-key" {key, tolerance, softness, spill} (key "green" or "blue"; 0 to 1, 0.01 to 1, 0 to 1). animations is a list, at most one per parameter, of {id, property, keyframes} with property the parameter\'s name and at least two keyframes {timeUs, value, easing} in ascending scene time; a sampled value replaces the parameter; [] for none.';

/** The JSON Schema of the arguments of `AddEffect` (D71): the effect is the document's to judge. */
export const addEffectArgumentsSchema: AddEffectArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Inserts a complete effect into the effects of a node or a scene.',
  properties: {
    ownerId: {
      type: 'string',
      description:
        'The stable ID of an image, video, text, captions node, or group, or of a scene, which takes the effect.',
      minLength: 1,
    },
    index: EFFECT_INDEX,
    effect: {
      type: 'object',
      description: `The complete effect, its ID and those of its animations unused in the document. ${EFFECT}`,
    },
  },
  required: ['ownerId', 'index', 'effect'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `RemoveEffect` (D71). */
export const removeEffectArgumentsSchema: RemoveEffectArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Removes one effect with its animations.',
  properties: {
    effectId: { type: 'string', description: EFFECT_ID, minLength: 1 },
  },
  required: ['effectId'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `ReorderEffect` (D71). */
export const reorderEffectArgumentsSchema: ReorderEffectArgumentsSchema = deepFreeze({
  type: 'object',
  description: "Moves one effect to another place in the order of its owner's effects.",
  properties: {
    effectId: { type: 'string', description: EFFECT_ID, minLength: 1 },
    index: EFFECT_INDEX,
  },
  required: ['effectId', 'index'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetEffect` (D71): the effect is the document's to judge. */
export const setEffectArgumentsSchema: SetEffectArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Replaces the effect with the same ID.',
  properties: {
    effect: {
      type: 'object',
      description: `The complete new effect; its id names the effect it replaces, and the IDs of new animations are unused in the document. ${EFFECT}`,
    },
  },
  required: ['effect'],
  additionalProperties: false,
});

const INPUT_ID = 'The stable ID of an input of the template.';

const INPUT =
  'An input is {id, type, ...constraints, default}: a text {minLength, maxLength} in code points, a number {minimum, maximum}, a boolean, a color (lowercase #rrggbb), an image, video, or audio (the default a content hash, sha256: and 64 hex digits), or a list {minItems, maxItems, fields, default}: each field {key, type, ...constraints} of a type other than list, and each item of the default a list with one {key, type, value} for each field, in their order. The default meets the constraints.';

const CONDITION =
  'A condition is {id, test, targetId, inputId} with test "empty" or "not-empty" (a text or list input), "true" or "false" (a boolean input), or {id, test: "equal-text", targetId, inputId, value: a text} or {id, test: "equal-number", targetId, inputId, value: a number}; targetId names a scene or a node. When a test does not hold, instantiation removes the target with everything in it and every transition that names it; every condition of a target must hold.';

const REPEAT =
  'A repeat is {id, duration: "target", targetId, inputId} — every copy lasts the durationUs of the target — or {id, duration: "field", targetId, inputId, key} — every copy lasts the microseconds a number field of its item names; inputId names a list input, targetId a scene or a node. Instantiation replaces the target by one copy for each item, one after the other, with IDs <id>--<index>; a target is repeated once at most, never inside another repeated one, and a repeated node is no side of a clip transition.';

const BINDING =
  'A binding is {id, kind: "property", nodeId, property, inputId} — the text of a text node takes a text input, the color of a text or a background a color input —, {id, kind: "placeholders", nodeId} — every {{inputId}} in the text of a text node stands for a text or number input, and inside a repeat over a list every {{list.key}} for a text or number field of the item —, {id, kind: "asset", assetId, inputId} — an image, video, or audio asset takes the content hash of an input of its type —, {id, kind: "item-property", nodeId, property, inputId, key} — inside a repeat over the list inputId, the text or color of the node takes the field key of the item of its copy —, or {id, kind: "item-asset", assetId, inputId, key} — an asset used only inside a repeat over the list becomes one asset per item, with the content hash of the field key. A property or asset bound to an input holds its default; at most one binding writes a target.';

/** The JSON Schema of the arguments of `AddTemplateInput` (D58.6): the input is the document's to judge. */
export const addTemplateInputArgumentsSchema: AddTemplateInputArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Inserts an input into the template section of the document.',
  properties: {
    index: {
      type: 'integer',
      description:
        "The input's index in the template's inputs after the insertion, from 0 to their number.",
      ...INDEX_BOUNDS,
    },
    input: {
      type: 'object',
      description: `The complete input as the document stores it, with an ID unused in the document. ${INPUT}`,
    },
  },
  required: ['index', 'input'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `RemoveTemplateInput` (D58.6). */
export const removeTemplateInputArgumentsSchema: RemoveTemplateInputArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Removes an input that no binding and no placeholder uses.',
  properties: { inputId: { type: 'string', description: INPUT_ID, minLength: 1 } },
  required: ['inputId'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetTemplateInput` (D58.6): the input is the document's to judge. */
export const setTemplateInputArgumentsSchema: SetTemplateInputArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    'Replaces an input with a complete new one of the same ID, and writes its default into every property and asset bound to it.',
  properties: {
    inputId: { type: 'string', description: INPUT_ID, minLength: 1 },
    input: {
      type: 'object',
      description: `The complete new input, with the same ID. ${INPUT}`,
    },
  },
  required: ['inputId', 'input'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `AddTemplateBinding` (D58.6): the binding is the document's to judge. */
export const addTemplateBindingArgumentsSchema: AddTemplateBindingArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    'Inserts a binding from an input to a property, the placeholders of a text, or an asset.',
  properties: {
    index: {
      type: 'integer',
      description:
        "The binding's index in the template's bindings after the insertion, from 0 to their number; their order has no meaning.",
      ...INDEX_BOUNDS,
    },
    binding: {
      type: 'object',
      description: `The complete binding as the document stores it, with an ID unused in the document. ${BINDING}`,
    },
  },
  required: ['index', 'binding'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `RemoveTemplateBinding` (D58.6). */
export const removeTemplateBindingArgumentsSchema: RemoveTemplateBindingArgumentsSchema =
  deepFreeze({
    type: 'object',
    description: 'Removes a binding; its target keeps the value it holds.',
    properties: {
      bindingId: {
        type: 'string',
        description: 'The stable ID of a binding of the template.',
        minLength: 1,
      },
    },
    required: ['bindingId'],
    additionalProperties: false,
  });

/** The JSON Schema of the arguments of `AddTemplateCondition` (D59.6): the condition is the document's to judge. */
export const addTemplateConditionArgumentsSchema: AddTemplateConditionArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    'Inserts a condition: its scene or node is kept only while its test of an input holds.',
  properties: {
    index: {
      type: 'integer',
      description:
        "The condition's index in the template's conditions after the insertion, from 0 to their number; their order has no meaning.",
      ...INDEX_BOUNDS,
    },
    condition: {
      type: 'object',
      description: `The complete condition as the document stores it, with an ID unused in the document. ${CONDITION}`,
    },
  },
  required: ['index', 'condition'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `RemoveTemplateCondition` (D59.6). */
export const removeTemplateConditionArgumentsSchema: RemoveTemplateConditionArgumentsSchema =
  deepFreeze({
    type: 'object',
    description: 'Removes a condition; its target is kept whatever the inputs.',
    properties: {
      conditionId: {
        type: 'string',
        description: 'The stable ID of a condition of the template.',
        minLength: 1,
      },
    },
    required: ['conditionId'],
    additionalProperties: false,
  });

/** The JSON Schema of the arguments of `AddTemplateRepeat` (D59.6): the repeat is the document's to judge. */
export const addTemplateRepeatArgumentsSchema: AddTemplateRepeatArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Inserts a repeat: its scene or node is copied once for each item of a list.',
  properties: {
    index: {
      type: 'integer',
      description:
        "The repeat's index in the template's repeats after the insertion, from 0 to their number; their order has no meaning.",
      ...INDEX_BOUNDS,
    },
    repeat: {
      type: 'object',
      description: `The complete repeat as the document stores it, with an ID unused in the document. ${REPEAT}`,
    },
  },
  required: ['index', 'repeat'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `RemoveTemplateRepeat` (D59.6). */
export const removeTemplateRepeatArgumentsSchema: RemoveTemplateRepeatArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Removes a repeat; its target is shown once, as it stands.',
  properties: {
    repeatId: {
      type: 'string',
      description: 'The stable ID of a repeat of the template.',
      minLength: 1,
    },
  },
  required: ['repeatId'],
  additionalProperties: false,
});

const DEFINITION_ID = 'The stable ID of a definition of the document.';

/** The JSON Schema of the arguments of `AddDefinition` (D76): the definition is the document's to judge. */
export const addDefinitionArgumentsSchema: AddDefinitionArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    'Inserts a complete definition, a nested composition with its own canvas and time that instance nodes place.',
  properties: {
    index: {
      type: 'integer',
      description:
        'The index in the definitions after the insertion, from 0 to the number of definitions; the order means nothing for the picture.',
      ...INDEX_BOUNDS,
    },
    definition: {
      type: 'object',
      description:
        'The complete definition as the document stores it: its ID, width, height, durationUs, nodes, clips, and transitions, every ID of it unused in the document, every time in it definition time.',
    },
  },
  required: ['index', 'definition'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `RemoveDefinition` (D76). */
export const removeDefinitionArgumentsSchema: RemoveDefinitionArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Removes a definition with everything in it; no instance may place it.',
  properties: { definitionId: { type: 'string', description: DEFINITION_ID, minLength: 1 } },
  required: ['definitionId'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `ConvertToDefinition` (D76). */
export const convertToDefinitionArgumentsSchema: ConvertToDefinitionArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    "Moves a run of sibling nodes of a scene or a definition into a new definition of the holder's canvas and duration, and places one instance of it, showing it unchanged, at the run's place.",
  properties: {
    fromNodeId: {
      type: 'string',
      description:
        'The lowest layer of the run: a node of a scene or a definition, not a child of a group.',
      minLength: 1,
    },
    toNodeId: {
      type: 'string',
      description:
        'The highest layer of the run, a sibling at or above fromNodeId; equal to fromNodeId for one node.',
      minLength: 1,
    },
    definitionId: {
      type: 'string',
      description: 'The ID of the new definition, unused in the document.',
      pattern: ID_PATTERN,
    },
    instanceId: {
      type: 'string',
      description: 'The ID of the new instance node, unused in the document.',
      pattern: ID_PATTERN,
    },
    index: {
      type: 'integer',
      description: "The new definition's index in the definitions, from 0 to their number.",
      ...INDEX_BOUNDS,
    },
  },
  required: ['fromNodeId', 'toNodeId', 'definitionId', 'instanceId', 'index'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `ExpandInstance` (D76). */
export const expandInstanceArgumentsSchema: ExpandInstanceArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    "Puts the nodes of an instance's definition in the instance's place and removes the definition; the inverse of ConvertToDefinition.",
  properties: {
    instanceId: { type: 'string', description: 'The stable ID of an instance node.', minLength: 1 },
  },
  required: ['instanceId'],
  additionalProperties: false,
});

const INSTANCE_ID = 'The stable ID of an instance node.';

/** The JSON Schema of the arguments of `SetInstanceInput` (D77): the value is the document's to judge. */
export const setInstanceInputArgumentsSchema: SetInstanceInputArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    "Gives one input of an element instance a value, replacing the instance's value of that input.",
  properties: {
    instanceId: { type: 'string', description: INSTANCE_ID, minLength: 1 },
    input: {
      type: 'object',
      description:
        "The value as the instance stores it: { inputId, type, value }, the inputId and type of an input of the instance's definition; a list value is an array of items, each an array of { key, type, value } in the order of the list's fields.",
    },
  },
  required: ['instanceId', 'input'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `ClearInstanceInput` (D77). */
export const clearInstanceInputArgumentsSchema: ClearInstanceInputArgumentsSchema = deepFreeze({
  type: 'object',
  description: "Removes an instance's value of an input, which then takes its default.",
  properties: {
    instanceId: { type: 'string', description: INSTANCE_ID, minLength: 1 },
    inputId: {
      type: 'string',
      description: "The ID of an input of the instance's definition.",
      minLength: 1,
    },
  },
  required: ['instanceId', 'inputId'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `ReplaceDefinition` (D77): the definition is the document's to judge. */
export const replaceDefinitionArgumentsSchema: ReplaceDefinitionArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    'Replaces a definition whole, with its nodes, clips, transitions, and template, keeping its ID and its place.',
  properties: {
    definitionId: { type: 'string', description: DEFINITION_ID, minLength: 1 },
    definition: {
      type: 'object',
      description:
        'The complete new definition as the document stores it, with the same ID: its sourceHash, width, height, durationUs, nodes, clips, transitions, and template; every ID it adds unused in the document.',
    },
  },
  required: ['definitionId', 'definition'],
  additionalProperties: false,
});

/**
 * The JSON Schema of the arguments of `AddNode` (D39.1). `node` is an object and
 * nothing more: its shape is the document's schema, which the full validation
 * applies to the result (D30.6, D31.2), so this schema does not restate it.
 */
export const addNodeArgumentsSchema: AddNodeArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Inserts a complete node, with its animations and children, into a list.',
  properties: {
    parentId: {
      type: 'string',
      description:
        'The ID of the scene, or of a group, whose list receives the node. A group takes image, text, video, and shape nodes only.',
      minLength: 1,
    },
    index: {
      type: 'integer',
      description:
        "The node's index in that list after the insertion, from 0 (the bottom layer) to the list's length (the top).",
      ...INDEX_BOUNDS,
    },
    node: {
      type: 'object',
      description:
        'The complete node as the document stores it, with every ID of its subtree chosen by the caller and unused in the document, and its animations in its own `animations` array.',
    },
  },
  required: ['parentId', 'index', 'node'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `RemoveNode` (D39.1). */
export const removeNodeArgumentsSchema: RemoveNodeArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Removes a node with its animations and, for a group, its children.',
  properties: {
    nodeId: { type: 'string', description: NODE_ID, minLength: 1 },
  },
  required: ['nodeId'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `DuplicateNode` (D39.1, D39.3). */
export const duplicateNodeArgumentsSchema: DuplicateNodeArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Copies a node, with its animations and children, directly above it.',
  properties: {
    nodeId: { type: 'string', description: NODE_ID, minLength: 1 },
    newNodeId: {
      type: 'string',
      description:
        'The ID of the copy, unused in the document. Every other ID of the copy derives from it: a child at index i becomes `<newNodeId>-c<i>`, an animation `<newNodeId>-a-<property>`, a text animation at index t `<newNodeId>-t<t>`, and an animation of that child `<newNodeId>-c<i>-a-<property>` (a text animation `<newNodeId>-c<i>-t<t>`).',
      pattern: ID_PATTERN,
    },
  },
  required: ['nodeId', 'newNodeId'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `ReorderNode` (D39.1). */
export const reorderNodeArgumentsSchema: ReorderNodeArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Moves a node within its own list, which changes the layer order.',
  properties: {
    nodeId: { type: 'string', description: NODE_ID, minLength: 1 },
    index: {
      type: 'integer',
      description:
        "The node's index in its own list after the move, from 0 (the bottom layer) to the list's length minus 1 (the top).",
      ...INDEX_BOUNDS,
    },
  },
  required: ['nodeId', 'index'],
  additionalProperties: false,
});

const PIXELS =
  'in composition pixels. A fraction is rounded to an integer, halves towards +Infinity, and -0 becomes 0; the document takes 1 to 1 000 000, and a rounded value outside that range is refused.';

const SCALE_FACTOR = {
  type: 'number',
  description: 'A factor from 0 to 1000 inclusive, kept as it is; -0 becomes 0.',
  minimum: 0,
  maximum: 1000,
} as const;

/** The JSON Schema of the arguments of `SetNodeScale` (D40.1). */
export const setNodeScaleArgumentsSchema: SetNodeScaleArgumentsSchema = deepFreeze({
  type: 'object',
  description: "Sets one node's base scale.",
  properties: {
    nodeId: {
      type: 'string',
      description: `${NODE_ID} A node without a scale, such as the background, is refused.`,
      minLength: 1,
    },
    scale: {
      type: 'object',
      description:
        "The node's new base scale about its own origin. A scale animation multiplies it.",
      properties: { x: SCALE_FACTOR, y: SCALE_FACTOR },
      required: ['x', 'y'],
      additionalProperties: false,
    },
  },
  required: ['nodeId', 'scale'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetNodeSize` (D40.1): numbers, since the parser rounds. */
export const setNodeSizeArgumentsSchema: SetNodeSizeArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Sets the size of an image, a video, or a Custom HTML element.',
  properties: {
    nodeId: {
      type: 'string',
      description: `${NODE_ID} Only images, videos, and Custom HTML elements have a size.`,
      minLength: 1,
    },
    width: { type: 'number', description: `The width, ${PIXELS}` },
    height: { type: 'number', description: `The height, ${PIXELS}` },
  },
  required: ['nodeId', 'width', 'height'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetNodeColor` (D40.1): either case, since the parser lowercases. */
export const setNodeColorArgumentsSchema: SetNodeColorArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Sets the colour of a text or a background.',
  properties: {
    nodeId: {
      type: 'string',
      description: `${NODE_ID} Only texts and backgrounds have a colour.`,
      minLength: 1,
    },
    color: {
      type: 'string',
      description:
        'An sRGB colour as `#` and six hexadecimal digits, in either case; it is stored in lower case. Short forms, names, and alpha are refused.',
      pattern: COLOR_INPUT,
    },
  },
  required: ['nodeId', 'color'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetTextFontSize` (D40.1): a number, since the parser rounds. */
export const setTextFontSizeArgumentsSchema: SetTextFontSizeArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Sets the font size of a text.',
  properties: {
    nodeId: {
      type: 'string',
      description: `${NODE_ID} Only texts have a font size.`,
      minLength: 1,
    },
    fontSize: { type: 'number', description: `The font size, ${PIXELS}` },
  },
  required: ['nodeId', 'fontSize'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetTextFont` (D40.2). */
export const setTextFontArgumentsSchema: SetTextFontArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Points a text or captions at another font asset of the document.',
  properties: {
    nodeId: {
      type: 'string',
      description: `${NODE_ID} Only texts and captions have a font.`,
      minLength: 1,
    },
    fontAssetId: {
      type: 'string',
      description: 'The ID of a font asset the document declares.',
      minLength: 1,
    },
  },
  required: ['nodeId', 'fontAssetId'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `SetImageAsset` (D40.2). */
export const setImageAssetArgumentsSchema: SetImageAssetArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Points an image at another image asset of the document; its size stays.',
  properties: {
    nodeId: {
      type: 'string',
      description: `${NODE_ID} Only images have an image asset.`,
      minLength: 1,
    },
    assetId: {
      type: 'string',
      description: 'The ID of an image asset the document declares.',
      minLength: 1,
    },
  },
  required: ['nodeId', 'assetId'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `AddAsset` (D40.3): the asset in the document's own form. */
export const addAssetArgumentsSchema: AddAssetArgumentsSchema = deepFreeze({
  type: 'object',
  description:
    'Declares an asset, pinned by the hash of its exact bytes. The host must then supply those bytes whenever the document is loaded, even while nothing uses the asset.',
  properties: {
    asset: {
      type: 'object',
      description: 'The asset as the document stores it.',
      properties: {
        id: {
          type: 'string',
          description: 'The ID of the asset, unused in the document.',
          pattern: ID_PATTERN,
        },
        type: { type: 'string', description: 'The kind of the asset.', enum: ASSET_TYPES },
        contentHash: {
          type: 'string',
          description: 'The algorithm, a colon, and the lower-case hex digest of the exact bytes.',
          pattern: HASH_PATTERN,
        },
      },
      required: ['id', 'type', 'contentHash'],
      additionalProperties: false,
    },
    index: {
      type: 'integer',
      description:
        "The asset's index in the document's assets after the insertion, from 0 to their number.",
      ...INDEX_BOUNDS,
    },
  },
  required: ['asset', 'index'],
  additionalProperties: false,
});

/** The JSON Schema of the arguments of `RemoveAsset` (D40.3). */
export const removeAssetArgumentsSchema: RemoveAssetArgumentsSchema = deepFreeze({
  type: 'object',
  description: 'Removes an asset that nothing uses; an asset in use is refused with its users.',
  properties: {
    assetId: {
      type: 'string',
      description: 'The ID of an asset the document declares.',
      minLength: 1,
    },
  },
  required: ['assetId'],
  additionalProperties: false,
});

export function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Rejects anything that is not an object with exactly `fields` as its own keys. */
export function fieldsOf(
  value: unknown,
  fields: readonly string[],
  what: string,
): Readonly<Record<string, unknown>> {
  if (!isPlainObject(value)) {
    throw new EditorError('invalid-argument', `${what} is not an object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((key, at) => key !== expected[at])) {
    throw new EditorError(
      'invalid-argument',
      `${what} must have exactly the fields ${expected.join(', ')}, not ${actual.join(', ') || '(none)'}.`,
    );
  }
  return value;
}

function nodeIdOf(fields: Readonly<Record<string, unknown>>, name = 'nodeId'): string {
  const nodeId: unknown = fields[name];
  if (typeof nodeId !== 'string' || nodeId === '') {
    throw new EditorError('invalid-argument', `\`${name}\` must be a non-empty string.`);
  }
  return nodeId;
}

/**
 * A position in a list: a safe integer from 0, never rounded (D39.2). Whether it
 * fits the list depends on the document, so that is decided when the command is
 * applied (`index-out-of-range`). A -0 becomes 0, as everywhere (D30.3).
 */
function indexOf(fields: Readonly<Record<string, unknown>>): number {
  const index: unknown = fields['index'];
  if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) {
    throw new EditorError(
      'invalid-argument',
      `\`index\` must be a safe integer from 0, not ${typeof index === 'number' ? String(index) : typeof index}.`,
    );
  }
  return index === 0 ? 0 : index;
}

/** An object the validator reads as JSON data: its prototype is `Object.prototype` or none. */
function isDataObject(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function notDataOf(path: string, what: string): never {
  throw new EditorError(
    'invalid-argument',
    `${path} holds ${what}; it must be composition data, which JSON can carry.`,
  );
}

/**
 * A copy of composition data that keeps every value as it is (D39.5): strings,
 * numbers, booleans, and null, arrays by index, and objects by their own
 * enumerable keys in their order, each value read once. What the validator would
 * not read as data — a function, a symbol, a bigint, `undefined`, a hole, an
 * object of another prototype such as a `Date`, or a cycle — is refused, so the
 * copy accepts no more than the document can hold and changes nothing through a
 * `toJSON`. The copy owns every object it has; the caller's are left alone.
 */
function copyData(value: unknown, path: string, ancestors: readonly object[]): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value !== 'object') return notDataOf(path, typeof value);
  if (ancestors.includes(value)) return notDataOf(path, 'a cycle');
  const inner = [...ancestors, value];
  if (Array.isArray(value)) {
    const items = value as readonly unknown[];
    const length = items.length;
    const copy: unknown[] = [];
    for (let at = 0; at < length; at += 1) {
      const itemPath = `${path}/${String(at)}`;
      if (!Object.prototype.hasOwnProperty.call(items, at)) return notDataOf(itemPath, 'a hole');
      copy.push(copyData(items[at], itemPath, inner));
    }
    return copy;
  }
  if (!isDataObject(value)) return notDataOf(path, 'an object that is not plain data');
  const fields = value as Readonly<Record<string, unknown>>;
  // `fromEntries` defines each key as data, so even `__proto__` stays a plain key.
  return Object.fromEntries(
    Object.keys(fields).map((key) => [key, copyData(fields[key], `${path}/${key}`, inner)]),
  );
}

/**
 * One coordinate as the document stores it: an integer number of composition
 * pixels (D15, D30.3). `Math.round` rounds halves towards +Infinity, so -2.5
 * becomes -2; a resulting -0 is normalised to 0, because -0 and 0 are the same
 * text after JSON.stringify but differ under Object.is, which would otherwise
 * make a no-op look like a change. Rounding is not clamping: a coordinate
 * outside the canvas stays as it is and the schema has the last word (D30.6).
 */
function integerPixels(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new EditorError(
      'invalid-argument',
      `${what} must be a finite number, not ${typeof value === 'number' ? String(value) : typeof value}.`,
    );
  }
  const rounded = Math.round(value);
  return rounded === 0 ? 0 : rounded;
}

function parsePosition(value: unknown, what: string): CommandPosition {
  const fields = fieldsOf(value, ['x', 'y'], what);
  return Object.freeze({
    x: integerPixels(fields['x'], `${what}.x`),
    y: integerPixels(fields['y'], `${what}.y`),
  });
}

/** The fields of a `SetNodePosition` (D30.3): closed, a non-empty ID, integer coordinates. */
export function parseSetNodePosition(value: unknown): SetNodePositionCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'position'], 'The command `SetNodePosition`');
  return Object.freeze({
    type: 'SetNodePosition',
    nodeId: nodeIdOf(fields),
    position: parsePosition(fields['position'], '`position`'),
  });
}

/**
 * The fields of a `SetNodeOpacity` (D38.2): a finite number from 0 to 1
 * inclusive. Nothing is rounded or clamped; -0 becomes 0, for the reason given
 * at `integerPixels`.
 */
export function parseSetNodeOpacity(value: unknown): SetNodeOpacityCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'opacity'], 'The command `SetNodeOpacity`');
  const opacity: unknown = fields['opacity'];
  if (typeof opacity !== 'number' || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw new EditorError(
      'invalid-argument',
      `\`opacity\` must be a finite number from 0 to 1, not ${typeof opacity === 'number' ? String(opacity) : typeof opacity}.`,
    );
  }
  return Object.freeze({
    type: 'SetNodeOpacity',
    nodeId: nodeIdOf(fields),
    opacity: opacity === 0 ? 0 : opacity,
  });
}

/** The fields of a `SetTextContent` (D38.3): any string, taken exactly as given. */
export function parseSetTextContent(value: unknown): SetTextContentCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'text'], 'The command `SetTextContent`');
  const text: unknown = fields['text'];
  if (typeof text !== 'string') {
    throw new EditorError('invalid-argument', `\`text\` must be a string, not ${typeof text}.`);
  }
  return Object.freeze({ type: 'SetTextContent', nodeId: nodeIdOf(fields), text });
}

/**
 * The fields of an `AddNode` (D39.1): a parent ID, an index, and the complete
 * node, copied and deep-frozen here, so the caller's object never reaches the
 * history and is never frozen itself (D39.5).
 */
export function parseAddNode(value: unknown): AddNodeCommand {
  const fields = fieldsOf(value, ['type', 'parentId', 'index', 'node'], 'The command `AddNode`');
  const parentId = nodeIdOf(fields, 'parentId');
  const index = indexOf(fields);
  const node: unknown = fields['node'];
  if (!isPlainObject(node) || !isDataObject(node)) {
    throw new EditorError('invalid-argument', '`node` must be an object.');
  }
  const copy = deepFreeze(copyData(node, '`node`', []) as DocumentObject);
  return Object.freeze({ type: 'AddNode', parentId, index, node: copy });
}

/** The fields of a `RemoveNode` (D39.1). */
export function parseRemoveNode(value: unknown): RemoveNodeCommand {
  const fields = fieldsOf(value, ['type', 'nodeId'], 'The command `RemoveNode`');
  return Object.freeze({ type: 'RemoveNode', nodeId: nodeIdOf(fields) });
}

/**
 * The fields of a `DuplicateNode` (D39.1): the new ID must match the document's
 * ID pattern, so every ID derived from it does too (D39.3).
 */
export function parseDuplicateNode(value: unknown): DuplicateNodeCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'newNodeId'], 'The command `DuplicateNode`');
  const nodeId = nodeIdOf(fields);
  const newNodeId: unknown = fields['newNodeId'];
  if (typeof newNodeId !== 'string' || !new RegExp(ID_PATTERN).test(newNodeId)) {
    throw new EditorError(
      'invalid-argument',
      `\`newNodeId\` must be an ID of the document's form, ${ID_PATTERN}.`,
    );
  }
  return Object.freeze({ type: 'DuplicateNode', nodeId, newNodeId });
}

/** The fields of a `ReorderNode` (D39.1). */
export function parseReorderNode(value: unknown): ReorderNodeCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'index'], 'The command `ReorderNode`');
  return Object.freeze({ type: 'ReorderNode', nodeId: nodeIdOf(fields), index: indexOf(fields) });
}

/** A mutable copy of a node of a validated document, for a command to rename (D39.3). */
export function copyNode(node: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return copyData(node, '`node`', []) as Record<string, unknown>;
}

/** A scale factor as the document takes it: finite, from 0 to 1000; -0 becomes 0 (D40.1). */
function scaleFactor(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000) {
    throw new EditorError(
      'invalid-argument',
      `${what} must be a finite number from 0 to 1000, not ${typeof value === 'number' ? String(value) : typeof value}.`,
    );
  }
  return value === 0 ? 0 : value;
}

/** The fields of a `SetNodeScale` (D40.1): both factors, checked, never rounded. */
export function parseSetNodeScale(value: unknown): SetNodeScaleCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'scale'], 'The command `SetNodeScale`');
  const nodeId = nodeIdOf(fields);
  const scale = fieldsOf(fields['scale'], ['x', 'y'], '`scale`');
  return Object.freeze({
    type: 'SetNodeScale',
    nodeId,
    scale: Object.freeze({
      x: scaleFactor(scale['x'], '`scale`.x'),
      y: scaleFactor(scale['y'], '`scale`.y'),
    }),
  });
}

/** The fields of a `SetNodeSize` (D40.1): rounded like a position (D15), not clamped. */
export function parseSetNodeSize(value: unknown): SetNodeSizeCommand {
  const fields = fieldsOf(
    value,
    ['type', 'nodeId', 'width', 'height'],
    'The command `SetNodeSize`',
  );
  const nodeId = nodeIdOf(fields);
  return Object.freeze({
    type: 'SetNodeSize',
    nodeId,
    width: integerPixels(fields['width'], '`width`'),
    height: integerPixels(fields['height'], '`height`'),
  });
}

/** The fields of a `SetNodeColor` (D40.1): six hex digits in either case, stored in lower case. */
export function parseSetNodeColor(value: unknown): SetNodeColorCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'color'], 'The command `SetNodeColor`');
  const nodeId = nodeIdOf(fields);
  const color: unknown = fields['color'];
  if (typeof color !== 'string' || !new RegExp(COLOR_INPUT).test(color)) {
    throw new EditorError(
      'invalid-argument',
      '`color` must be `#` and six hexadecimal digits, such as #1a2b3c.',
    );
  }
  return Object.freeze({ type: 'SetNodeColor', nodeId, color: color.toLowerCase() });
}

/** The fields of a `SetTextFontSize` (D40.1): rounded like a position (D15), not clamped. */
export function parseSetTextFontSize(value: unknown): SetTextFontSizeCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'fontSize'], 'The command `SetTextFontSize`');
  const nodeId = nodeIdOf(fields);
  return Object.freeze({
    type: 'SetTextFontSize',
    nodeId,
    fontSize: integerPixels(fields['fontSize'], '`fontSize`'),
  });
}

/** The fields of a `SetTextFont` (D40.2): the asset is looked up when the command applies. */
export function parseSetTextFont(value: unknown): SetTextFontCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'fontAssetId'], 'The command `SetTextFont`');
  const nodeId = nodeIdOf(fields);
  return Object.freeze({
    type: 'SetTextFont',
    nodeId,
    fontAssetId: nodeIdOf(fields, 'fontAssetId'),
  });
}

/** The fields of a `SetImageAsset` (D40.2): the asset is looked up when the command applies. */
export function parseSetImageAsset(value: unknown): SetImageAssetCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'assetId'], 'The command `SetImageAsset`');
  const nodeId = nodeIdOf(fields);
  return Object.freeze({ type: 'SetImageAsset', nodeId, assetId: nodeIdOf(fields, 'assetId') });
}

/**
 * Checks, field by field, that a copied asset has the document's own form — an
 * ID, a type, and a hash as the schema states them — and tells the compiler so;
 * the check at run time is what makes the narrower type true (D40.3).
 */
function assertAsset(
  asset: Readonly<Record<string, unknown>>,
): asserts asset is Readonly<Record<string, unknown>> & AssetData {
  const id: unknown = asset['id'];
  const type: unknown = asset['type'];
  const contentHash: unknown = asset['contentHash'];
  if (typeof id !== 'string' || !new RegExp(ID_PATTERN).test(id)) {
    throw new EditorError(
      'invalid-argument',
      `\`asset\`.id must be an ID of the form ${ID_PATTERN}.`,
    );
  }
  if (typeof type !== 'string' || !ASSET_TYPES.includes(type)) {
    throw new EditorError(
      'invalid-argument',
      `\`asset\`.type must be one of ${ASSET_TYPES.join(', ')}.`,
    );
  }
  if (typeof contentHash !== 'string' || !new RegExp(HASH_PATTERN).test(contentHash)) {
    throw new EditorError(
      'invalid-argument',
      `\`asset\`.contentHash must be of the form ${HASH_PATTERN}.`,
    );
  }
}

/**
 * The fields of an `AddAsset` (D40.3): an asset of the document's own form and an
 * index. The asset is copied with its keys in their order, each value read once,
 * then checked and frozen, so undoing its removal restores the same bytes and
 * the caller's object never reaches the history.
 */
export function parseAddAsset(value: unknown): AddAssetCommand {
  const fields = fieldsOf(value, ['type', 'asset', 'index'], 'The command `AddAsset`');
  const given = fieldsOf(fields['asset'], ['id', 'type', 'contentHash'], '`asset`');
  const copy = Object.fromEntries(Object.keys(given).map((key) => [key, given[key]]));
  assertAsset(copy);
  const index = indexOf(fields);
  return Object.freeze({ type: 'AddAsset', asset: Object.freeze(copy), index });
}

/** The fields of a `RemoveAsset` (D40.3). */
export function parseRemoveAsset(value: unknown): RemoveAssetCommand {
  const fields = fieldsOf(value, ['type', 'assetId'], 'The command `RemoveAsset`');
  return Object.freeze({ type: 'RemoveAsset', assetId: nodeIdOf(fields, 'assetId') });
}

/** A time a command takes: a safe integer within the schema's bounds, never rounded; -0 becomes 0 (D41.2). */
function timeOf(value: unknown, what: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < KEYFRAME_TIME.minimum ||
    value > KEYFRAME_TIME.maximum
  ) {
    throw new EditorError(
      'invalid-argument',
      `${what} must be an integer number of microseconds from ${String(KEYFRAME_TIME.minimum)} to ${String(KEYFRAME_TIME.maximum)}, not ${typeof value === 'number' ? String(value) : typeof value}.`,
    );
  }
  return value === 0 ? 0 : value;
}

/** An opacity factor: finite, from 0 to 1, never rounded; -0 becomes 0 (D38.2, D41.3). */
function opacityFactor(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new EditorError(
      'invalid-argument',
      `\`opacity\` must be a finite number from 0 to 1, not ${typeof value === 'number' ? String(value) : typeof value}.`,
    );
  }
  return value === 0 ? 0 : value;
}

/** The fields of an `AddAnimation` (D41.1): the animation copied as exact data (D41.3). */
export function parseAddAnimation(value: unknown): AddAnimationCommand {
  const fields = fieldsOf(
    value,
    ['type', 'nodeId', 'index', 'animation'],
    'The command `AddAnimation`',
  );
  const nodeId = nodeIdOf(fields);
  const index = indexOf(fields);
  const animation: unknown = fields['animation'];
  if (!isPlainObject(animation) || !isDataObject(animation)) {
    throw new EditorError('invalid-argument', '`animation` must be an object.');
  }
  const copy = deepFreeze(copyData(animation, '`animation`', []) as DocumentObject);
  return Object.freeze({ type: 'AddAnimation', nodeId, index, animation: copy });
}

/** The fields of a `RemoveAnimation` (D41.1). */
export function parseRemoveAnimation(value: unknown): RemoveAnimationCommand {
  const fields = fieldsOf(value, ['type', 'animationId'], 'The command `RemoveAnimation`');
  return Object.freeze({ type: 'RemoveAnimation', animationId: nodeIdOf(fields, 'animationId') });
}

/** The fields of a `SetOpacityKeyframe` (D41.1, D41.3). */
export function parseSetOpacityKeyframe(value: unknown): SetOpacityKeyframeCommand {
  const fields = fieldsOf(
    value,
    ['type', 'animationId', 'timeUs', 'opacity'],
    'The command `SetOpacityKeyframe`',
  );
  return Object.freeze({
    type: 'SetOpacityKeyframe',
    animationId: nodeIdOf(fields, 'animationId'),
    timeUs: timeOf(fields['timeUs'], '`timeUs`'),
    opacity: opacityFactor(fields['opacity']),
  });
}

/** The fields of a `SetPositionKeyframe` (D41.1, D41.3): the offset rounded like a position (D15). */
export function parseSetPositionKeyframe(value: unknown): SetPositionKeyframeCommand {
  const fields = fieldsOf(
    value,
    ['type', 'animationId', 'timeUs', 'offset'],
    'The command `SetPositionKeyframe`',
  );
  const animationId = nodeIdOf(fields, 'animationId');
  const timeUs = timeOf(fields['timeUs'], '`timeUs`');
  const offset = fieldsOf(fields['offset'], ['x', 'y'], '`offset`');
  return Object.freeze({
    type: 'SetPositionKeyframe',
    animationId,
    timeUs,
    offset: Object.freeze({
      x: integerPixels(offset['x'], '`offset`.x'),
      y: integerPixels(offset['y'], '`offset`.y'),
    }),
  });
}

/** The fields of a `SetScaleKeyframe` (D41.1, D41.3): factors checked as a scale's (D40.1). */
export function parseSetScaleKeyframe(value: unknown): SetScaleKeyframeCommand {
  const fields = fieldsOf(
    value,
    ['type', 'animationId', 'timeUs', 'factor'],
    'The command `SetScaleKeyframe`',
  );
  const animationId = nodeIdOf(fields, 'animationId');
  const timeUs = timeOf(fields['timeUs'], '`timeUs`');
  const factor = fieldsOf(fields['factor'], ['x', 'y'], '`factor`');
  return Object.freeze({
    type: 'SetScaleKeyframe',
    animationId,
    timeUs,
    factor: Object.freeze({
      x: scaleFactor(factor['x'], '`factor`.x'),
      y: scaleFactor(factor['y'], '`factor`.y'),
    }),
  });
}

/**
 * The fields of an `AddKeyframe` (D41.1, D41.3): the keyframe copied as exact
 * data, every field kept for the validator; only its time is read and checked,
 * because it places the keyframe, and a -0 time becomes 0.
 */
export function parseAddKeyframe(value: unknown): AddKeyframeCommand {
  const fields = fieldsOf(value, ['type', 'animationId', 'keyframe'], 'The command `AddKeyframe`');
  const animationId = nodeIdOf(fields, 'animationId');
  const keyframe: unknown = fields['keyframe'];
  if (!isPlainObject(keyframe) || !isDataObject(keyframe)) {
    throw new EditorError('invalid-argument', '`keyframe` must be an object.');
  }
  const copy = copyData(keyframe, '`keyframe`', []) as Record<string, unknown>;
  const timeUs = timeOf(copy['timeUs'], '`keyframe`.timeUs');
  copy['timeUs'] = timeUs;
  return Object.freeze({ type: 'AddKeyframe', animationId, keyframe: deepFreeze(copy) });
}

/** The fields of a `RemoveKeyframe` (D41.1). */
export function parseRemoveKeyframe(value: unknown): RemoveKeyframeCommand {
  const fields = fieldsOf(value, ['type', 'animationId', 'timeUs'], 'The command `RemoveKeyframe`');
  return Object.freeze({
    type: 'RemoveKeyframe',
    animationId: nodeIdOf(fields, 'animationId'),
    timeUs: timeOf(fields['timeUs'], '`timeUs`'),
  });
}

/**
 * A safe integer within `bounds`, never rounded; -0 becomes 0 (D42.10). The
 * bounds are the schema's, so a value this accepts cannot break the document.
 */
function integerWithin(value: unknown, bounds: Bounds, what: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < bounds.minimum ||
    value > bounds.maximum
  ) {
    throw new EditorError(
      'invalid-argument',
      `${what} must be an integer number of microseconds from ${String(bounds.minimum)} to ${String(bounds.maximum)}, not ${typeof value === 'number' ? String(value) : typeof value}.`,
    );
  }
  return value === 0 ? 0 : value;
}

/** The fields of a `SetNodeLifetime` (D42.10). No rule concerns the sum of the two times. */
export function parseSetNodeLifetime(value: unknown): SetNodeLifetimeCommand {
  const fields = fieldsOf(
    value,
    ['type', 'nodeId', 'startUs', 'durationUs'],
    'The command `SetNodeLifetime`',
  );
  return Object.freeze({
    type: 'SetNodeLifetime',
    nodeId: nodeIdOf(fields),
    startUs: integerWithin(fields['startUs'], LIFETIME.startUs, '`startUs`'),
    durationUs: integerWithin(fields['durationUs'], LIFETIME.durationUs, '`durationUs`'),
  });
}

/** The fields of a `MoveKeyframe` (D41.1). */
export function parseMoveKeyframe(value: unknown): MoveKeyframeCommand {
  const fields = fieldsOf(
    value,
    ['type', 'animationId', 'timeUs', 'toTimeUs'],
    'The command `MoveKeyframe`',
  );
  return Object.freeze({
    type: 'MoveKeyframe',
    animationId: nodeIdOf(fields, 'animationId'),
    timeUs: timeOf(fields['timeUs'], '`timeUs`'),
    toTimeUs: timeOf(fields['toTimeUs'], '`toTimeUs`'),
  });
}

/** The fields of a `SetKeyframeEasing` (D67.7); the document's validation judges the easing. */
export function parseSetKeyframeEasing(value: unknown): SetKeyframeEasingCommand {
  const fields = fieldsOf(
    value,
    ['type', 'animationId', 'timeUs', 'easing'],
    'The command `SetKeyframeEasing`',
  );
  return Object.freeze({
    type: 'SetKeyframeEasing',
    animationId: nodeIdOf(fields, 'animationId'),
    timeUs: timeOf(fields['timeUs'], '`timeUs`'),
    easing: dataOf(fields['easing'], 'easing'),
  });
}

/** The fields of a `SetNodeFit` (D50.6): one of the fits the schema lists. */
export function parseSetNodeFit(value: unknown): SetNodeFitCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'fit'], 'The command `SetNodeFit`');
  const nodeId = nodeIdOf(fields);
  const fit: unknown = fields['fit'];
  const known = FITS.find((item) => item === fit);
  if (known === undefined) {
    throw new EditorError('invalid-argument', `\`fit\` must be one of ${FITS.join(', ')}.`);
  }
  return Object.freeze({ type: 'SetNodeFit', nodeId, fit: known });
}

/** One coordinate of a focus point: an integer in the bounds of the schema (D63.1). */
function focusCoordinate(value: unknown, what: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < FOCUS.minimum ||
    value > FOCUS.maximum
  ) {
    throw new EditorError(
      'invalid-argument',
      `${what} must be an integer from ${String(FOCUS.minimum)} to ${String(FOCUS.maximum)}, not ${typeof value === 'number' ? String(value) : typeof value}.`,
    );
  }
  // -0 is an integer in the bounds; the document stores 0 (see `integerPixels`).
  return value === 0 ? 0 : value;
}

/** The fields of a `SetNodeFocus` (D63.4): closed, a non-empty ID, integer per mille. */
export function parseSetNodeFocus(value: unknown): SetNodeFocusCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'focus'], 'The command `SetNodeFocus`');
  const nodeId = nodeIdOf(fields);
  const focus = fieldsOf(fields['focus'], ['x', 'y'], '`focus`');
  return Object.freeze({
    type: 'SetNodeFocus',
    nodeId,
    focus: Object.freeze({
      x: focusCoordinate(focus['x'], '`focus.x`'),
      y: focusCoordinate(focus['y'], '`focus.y`'),
    }),
  });
}

/** A finite number within `bounds`, or `invalid-argument`; -0 becomes 0, nothing is rounded. */
function boundedNumber(value: unknown, bounds: Bounds, what: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < bounds.minimum ||
    value > bounds.maximum
  ) {
    throw new EditorError(
      'invalid-argument',
      `${what} must be a number from ${String(bounds.minimum)} to ${String(bounds.maximum)}, not ${typeof value === 'number' ? String(value) : typeof value}.`,
    );
  }
  return value === 0 ? 0 : value;
}

/** An integer within `bounds`, or `invalid-argument`; -0 becomes 0, nothing is rounded. */
function boundedInteger(value: unknown, bounds: Bounds, what: string): number {
  if (!Number.isInteger(value)) {
    throw new EditorError(
      'invalid-argument',
      `${what} must be an integer from ${String(bounds.minimum)} to ${String(bounds.maximum)}, not ${typeof value === 'number' ? String(value) : typeof value}.`,
    );
  }
  return boundedNumber(value, bounds, what);
}

/** The fields of a `SetNodeRotation` (D68): degrees in the schema's bounds, never rounded. */
export function parseSetNodeRotation(value: unknown): SetNodeRotationCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'rotation'], 'The command `SetNodeRotation`');
  const nodeId = nodeIdOf(fields);
  return Object.freeze({
    type: 'SetNodeRotation',
    nodeId,
    rotation: boundedNumber(fields['rotation'], ROTATION, '`rotation`'),
  });
}

/** The fields of a `SetNodeOrigin` (D68): integer per mille in the schema's bounds. */
export function parseSetNodeOrigin(value: unknown): SetNodeOriginCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'origin'], 'The command `SetNodeOrigin`');
  const nodeId = nodeIdOf(fields);
  const origin = fieldsOf(fields['origin'], ['x', 'y'], '`origin`');
  return Object.freeze({
    type: 'SetNodeOrigin',
    nodeId,
    origin: Object.freeze({
      x: boundedInteger(origin['x'], ORIGIN, '`origin.x`'),
      y: boundedInteger(origin['y'], ORIGIN, '`origin.y`'),
    }),
  });
}

/**
 * The fields of a `SetNodeCrop` (D68): four integer insets in per mille, in the
 * schema's bounds; whether two opposite ones leave a picture is the
 * document's to judge (`invalid-result`).
 */
export function parseSetNodeCrop(value: unknown): SetNodeCropCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'crop'], 'The command `SetNodeCrop`');
  const nodeId = nodeIdOf(fields);
  const crop = fieldsOf(fields['crop'], ['top', 'right', 'bottom', 'left'], '`crop`');
  return Object.freeze({
    type: 'SetNodeCrop',
    nodeId,
    crop: Object.freeze({
      top: boundedInteger(crop[TOP], CROP, '`crop.top`'),
      right: boundedInteger(crop['right'], CROP, '`crop.right`'),
      bottom: boundedInteger(crop['bottom'], CROP, '`crop.bottom`'),
      left: boundedInteger(crop['left'], CROP, '`crop.left`'),
    }),
  });
}

/** The fields of a `SetNodeCornerRadius` (D68): rounded like a position (D15), not clamped. */
export function parseSetNodeCornerRadius(value: unknown): SetNodeCornerRadiusCommand {
  const fields = fieldsOf(
    value,
    ['type', 'nodeId', 'cornerRadius'],
    'The command `SetNodeCornerRadius`',
  );
  const nodeId = nodeIdOf(fields);
  return Object.freeze({
    type: 'SetNodeCornerRadius',
    nodeId,
    cornerRadius: integerPixels(fields['cornerRadius'], '`cornerRadius`'),
  });
}

/**
 * The fields of a `SetKeyframeValue` (D65.2): the value copied as data, a
 * number, a string, or an object. What it must be is the property's, which
 * the animation names, so `normalizedKeyframeValue` judges it when the command
 * applies.
 */
export function parseSetKeyframeValue(value: unknown): SetKeyframeValueCommand {
  const fields = fieldsOf(
    value,
    ['type', 'animationId', 'timeUs', 'value'],
    'The command `SetKeyframeValue`',
  );
  const animationId = nodeIdOf(fields, 'animationId');
  const timeUs = timeOf(fields['timeUs'], '`timeUs`');
  const given: unknown = fields['value'];
  const data: KeyframeValueData =
    typeof given === 'number' || typeof given === 'string' ? given : dataOf(given, 'value');
  return Object.freeze({ type: 'SetKeyframeValue', animationId, timeUs, value: data });
}

/** The properties whose keyframes `SetKeyframeValue` sets: every row added by schema 0.13 (D65.2). */
export const GENERIC_KEYFRAME_PROPERTIES = Object.freeze([
  'rotation',
  'origin',
  'size',
  'color',
  'crop',
  'cornerRadius',
  'fill',
  'stroke/color',
  'stroke/width',
  'trim/start',
  'trim/end',
  'geometry',
] as const);

/**
 * A keyframe value of `property` as the document stores it (D65.2, D68), or
 * `invalid-argument`: a rotation a finite number, never rounded; an origin
 * offset and a crop integers, never rounded; a size and a corner radius
 * rounded like a position (D15); a colour `#` and six hexadecimal digits,
 * stored in lower case. -0 becomes 0. The bounds are the document's: a value
 * outside them is `invalid-result`.
 */
export function normalizedKeyframeValue(
  property: (typeof GENERIC_KEYFRAME_PROPERTIES)[number],
  value: KeyframeValueData,
): number | string | DocumentObject {
  const finite = (given: unknown, what: string): number => {
    if (typeof given !== 'number' || !Number.isFinite(given)) {
      throw new EditorError('invalid-argument', `${what} must be a finite number.`);
    }
    return given === 0 ? 0 : given;
  };
  const integer = (given: unknown, what: string): number => {
    if (!Number.isInteger(given)) {
      throw new EditorError('invalid-argument', `${what} must be an integer.`);
    }
    return finite(given, what);
  };
  switch (property) {
    case 'rotation':
      return finite(value, 'The value of a rotation keyframe');
    case 'cornerRadius':
      return integerPixels(value, 'The value of a cornerRadius keyframe');
    case 'color':
    case 'fill':
    case 'stroke/color':
      if (typeof value !== 'string' || !new RegExp(COLOR_INPUT).test(value)) {
        throw new EditorError(
          'invalid-argument',
          `The value of a ${property} keyframe must be \`#\` and six hexadecimal digits, such as #1a2b3c.`,
        );
      }
      return value.toLowerCase();
    case 'stroke/width':
      return finite(value, 'The value of a stroke/width keyframe');
    case 'trim/start':
    case 'trim/end':
      return integer(value, `The value of a ${property} keyframe`);
    case 'geometry':
      if (typeof value !== 'object') {
        throw new EditorError(
          'invalid-argument',
          'The value of a geometry keyframe must be a complete geometry object.',
        );
      }
      return value;
    case 'origin': {
      const fields = fieldsOf(value, ['x', 'y'], 'The value of an origin keyframe');
      return Object.freeze({
        x: integer(fields['x'], '`value.x`'),
        y: integer(fields['y'], '`value.y`'),
      });
    }
    case 'size': {
      const fields = fieldsOf(value, ['width', 'height'], 'The value of a size keyframe');
      return Object.freeze({
        width: integerPixels(fields['width'], '`value.width`'),
        height: integerPixels(fields['height'], '`value.height`'),
      });
    }
    case 'crop': {
      const fields = fieldsOf(
        value,
        ['top', 'right', 'bottom', 'left'],
        'The value of a crop keyframe',
      );
      return Object.freeze({
        top: integer(fields[TOP], '`value.top`'),
        right: integer(fields['right'], '`value.right`'),
        bottom: integer(fields['bottom'], '`value.bottom`'),
        left: integer(fields['left'], '`value.left`'),
      });
    }
    default:
      throw new EditorError('invalid-argument', 'Unknown keyframe property.');
  }
}

/** The fields of a `SetVideoAsset` (D50.6): the asset is looked up when the command applies. */
export function parseSetVideoAsset(value: unknown): SetVideoAssetCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'assetId'], 'The command `SetVideoAsset`');
  const nodeId = nodeIdOf(fields);
  return Object.freeze({ type: 'SetVideoAsset', nodeId, assetId: nodeIdOf(fields, 'assetId') });
}

/** The fields of a `SetVideoSource` (D50.6), with the bounds of the schema. */
export function parseSetVideoSource(value: unknown): SetVideoSourceCommand {
  const fields = fieldsOf(
    value,
    ['type', 'nodeId', 'sourceStartUs'],
    'The command `SetVideoSource`',
  );
  return Object.freeze({
    type: 'SetVideoSource',
    nodeId: nodeIdOf(fields),
    sourceStartUs: integerWithin(fields['sourceStartUs'], SOURCE_START, '`sourceStartUs`'),
  });
}

/** A volume: finite, within the schema's bounds, never rounded; -0 becomes 0 (D52.1). */
function volumeOf(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < VOLUME.minimum ||
    value > VOLUME.maximum
  ) {
    throw new EditorError(
      'invalid-argument',
      `\`volume\` must be a finite number from ${String(VOLUME.minimum)} to ${String(VOLUME.maximum)}, not ${typeof value === 'number' ? String(value) : typeof value}.`,
    );
  }
  return value === 0 ? 0 : value;
}

/** The fields of a `SetVideoVolume` (D52.6). */
export function parseSetVideoVolume(value: unknown): SetVideoVolumeCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'volume'], 'The command `SetVideoVolume`');
  const nodeId = nodeIdOf(fields);
  return Object.freeze({ type: 'SetVideoVolume', nodeId, volume: volumeOf(fields['volume']) });
}

/**
 * The fields of an `AddAudioClip` (D52.6): an index and the complete clip,
 * copied as exact data and deep-frozen, so the caller's object never reaches
 * the history (D39.5); the document's validation judges the clip.
 */
export function parseAddAudioClip(value: unknown): AddAudioClipCommand {
  const fields = fieldsOf(value, ['type', 'index', 'clip'], 'The command `AddAudioClip`');
  const index = indexOf(fields);
  const clip: unknown = fields['clip'];
  if (!isPlainObject(clip) || !isDataObject(clip)) {
    throw new EditorError('invalid-argument', '`clip` must be an object.');
  }
  const copy = deepFreeze(copyData(clip, '`clip`', []) as DocumentObject);
  return Object.freeze({ type: 'AddAudioClip', index, clip: copy });
}

/** The fields of a `RemoveAudioClip` (D52.6). */
export function parseRemoveAudioClip(value: unknown): RemoveAudioClipCommand {
  const fields = fieldsOf(value, ['type', 'clipId'], 'The command `RemoveAudioClip`');
  return Object.freeze({ type: 'RemoveAudioClip', clipId: nodeIdOf(fields, 'clipId') });
}

/** The fields of a `SetClipVolume` (D52.6). */
export function parseSetClipVolume(value: unknown): SetClipVolumeCommand {
  const fields = fieldsOf(value, ['type', 'clipId', 'volume'], 'The command `SetClipVolume`');
  const clipId = nodeIdOf(fields, 'clipId');
  return Object.freeze({ type: 'SetClipVolume', clipId, volume: volumeOf(fields['volume']) });
}

/** The fields of a `SetClipFades` (D52.6); whether both fit the clip is the document's rule. */
export function parseSetClipFades(value: unknown): SetClipFadesCommand {
  const fields = fieldsOf(
    value,
    ['type', 'clipId', 'fadeInUs', 'fadeOutUs'],
    'The command `SetClipFades`',
  );
  return Object.freeze({
    type: 'SetClipFades',
    clipId: nodeIdOf(fields, 'clipId'),
    fadeInUs: integerWithin(fields['fadeInUs'], FADE, '`fadeInUs`'),
    fadeOutUs: integerWithin(fields['fadeOutUs'], FADE, '`fadeOutUs`'),
  });
}

/** The fields of a `SetClipSource` (D52.6): the asset is looked up when the command applies. */
export function parseSetClipSource(value: unknown): SetClipSourceCommand {
  const fields = fieldsOf(
    value,
    ['type', 'clipId', 'assetId', 'sourceStartUs'],
    'The command `SetClipSource`',
  );
  return Object.freeze({
    type: 'SetClipSource',
    clipId: nodeIdOf(fields, 'clipId'),
    assetId: nodeIdOf(fields, 'assetId'),
    sourceStartUs: integerWithin(fields['sourceStartUs'], CLIP_SOURCE_START, '`sourceStartUs`'),
  });
}

/** A complete entity a command carries: copied as exact data and deep-frozen (D39.5). */
function dataOf(value: unknown, name: string): DocumentObject {
  if (!isPlainObject(value) || !isDataObject(value)) {
    throw new EditorError('invalid-argument', `\`${name}\` must be an object.`);
  }
  return deepFreeze(copyData(value, `\`${name}\``, []) as DocumentObject);
}

/** The fields of an `AddScene` (D54.5); the document's validation judges the scene. */
export function parseAddScene(value: unknown): AddSceneCommand {
  const fields = fieldsOf(value, ['type', 'index', 'scene'], 'The command `AddScene`');
  const index = indexOf(fields);
  return Object.freeze({ type: 'AddScene', index, scene: dataOf(fields['scene'], 'scene') });
}

/** The fields of a `RemoveScene` (D54.5). */
export function parseRemoveScene(value: unknown): RemoveSceneCommand {
  const fields = fieldsOf(value, ['type', 'sceneId'], 'The command `RemoveScene`');
  return Object.freeze({ type: 'RemoveScene', sceneId: nodeIdOf(fields, 'sceneId') });
}

/** The fields of a `DuplicateScene` (D54.5): the new ID must match the document's ID pattern. */
export function parseDuplicateScene(value: unknown): DuplicateSceneCommand {
  const fields = fieldsOf(value, ['type', 'sceneId', 'newSceneId'], 'The command `DuplicateScene`');
  const sceneId = nodeIdOf(fields, 'sceneId');
  const newSceneId: unknown = fields['newSceneId'];
  if (typeof newSceneId !== 'string' || !new RegExp(ID_PATTERN).test(newSceneId)) {
    throw new EditorError(
      'invalid-argument',
      `\`newSceneId\` must be an ID of the document's form, ${ID_PATTERN}.`,
    );
  }
  return Object.freeze({ type: 'DuplicateScene', sceneId, newSceneId });
}

/** The fields of a `ReorderScene` (D54.5). */
export function parseReorderScene(value: unknown): ReorderSceneCommand {
  const fields = fieldsOf(value, ['type', 'sceneId', 'index'], 'The command `ReorderScene`');
  return Object.freeze({
    type: 'ReorderScene',
    sceneId: nodeIdOf(fields, 'sceneId'),
    index: indexOf(fields),
  });
}

/** The fields of a `SetSceneDuration` (D54.5), with the bounds of the schema. */
export function parseSetSceneDuration(value: unknown): SetSceneDurationCommand {
  const fields = fieldsOf(
    value,
    ['type', 'sceneId', 'durationUs'],
    'The command `SetSceneDuration`',
  );
  return Object.freeze({
    type: 'SetSceneDuration',
    sceneId: nodeIdOf(fields, 'sceneId'),
    durationUs: integerWithin(fields['durationUs'], SCENE_DURATION, '`durationUs`'),
  });
}

/** The fields of a `MoveNodeToScene` (D54.5). */
export function parseMoveNodeToScene(value: unknown): MoveNodeToSceneCommand {
  const fields = fieldsOf(
    value,
    ['type', 'nodeId', 'sceneId', 'index'],
    'The command `MoveNodeToScene`',
  );
  return Object.freeze({
    type: 'MoveNodeToScene',
    nodeId: nodeIdOf(fields),
    sceneId: nodeIdOf(fields, 'sceneId'),
    index: indexOf(fields),
  });
}

/** The fields of an `AddSceneAudioClip` (D54.5); the document's validation judges the clip. */
export function parseAddSceneAudioClip(value: unknown): AddSceneAudioClipCommand {
  const fields = fieldsOf(
    value,
    ['type', 'sceneId', 'index', 'clip'],
    'The command `AddSceneAudioClip`',
  );
  const sceneId = nodeIdOf(fields, 'sceneId');
  const index = indexOf(fields);
  return Object.freeze({
    type: 'AddSceneAudioClip',
    sceneId,
    index,
    clip: dataOf(fields['clip'], 'clip'),
  });
}

/** A new ID a command gives, which must match the document's ID pattern (D39.3). */
function newIdOf(fields: Readonly<Record<string, unknown>>, name: string): string {
  const id: unknown = fields[name];
  if (typeof id !== 'string' || !new RegExp(ID_PATTERN).test(id)) {
    throw new EditorError(
      'invalid-argument',
      `\`${name}\` must be an ID of the document's form, ${ID_PATTERN}.`,
    );
  }
  return id;
}

/** The fields of a `MoveClip` (D55.2). */
export function parseMoveClip(value: unknown): MoveClipCommand {
  const fields = fieldsOf(value, ['type', 'clipId', 'startUs'], 'The command `MoveClip`');
  return Object.freeze({
    type: 'MoveClip',
    clipId: nodeIdOf(fields, 'clipId'),
    startUs: integerWithin(fields['startUs'], LIFETIME.startUs, '`startUs`'),
  });
}

/** The fields of a `TrimClipStart` (D55.2). */
export function parseTrimClipStart(value: unknown): TrimClipStartCommand {
  const fields = fieldsOf(value, ['type', 'clipId', 'startUs'], 'The command `TrimClipStart`');
  return Object.freeze({
    type: 'TrimClipStart',
    clipId: nodeIdOf(fields, 'clipId'),
    startUs: integerWithin(fields['startUs'], LIFETIME.startUs, '`startUs`'),
  });
}

/** The fields of a `TrimClipEnd` (D55.2). */
export function parseTrimClipEnd(value: unknown): TrimClipEndCommand {
  const fields = fieldsOf(value, ['type', 'clipId', 'endUs'], 'The command `TrimClipEnd`');
  return Object.freeze({
    type: 'TrimClipEnd',
    clipId: nodeIdOf(fields, 'clipId'),
    endUs: integerWithin(fields['endUs'], LIFETIME.startUs, '`endUs`'),
  });
}

/** The fields of a `SplitClip` (D55.2): the new ID must match the document's ID pattern. */
export function parseSplitClip(value: unknown): SplitClipCommand {
  const fields = fieldsOf(
    value,
    ['type', 'clipId', 'atUs', 'newClipId'],
    'The command `SplitClip`',
  );
  const clipId = nodeIdOf(fields, 'clipId');
  const atUs = integerWithin(fields['atUs'], LIFETIME.startUs, '`atUs`');
  return Object.freeze({
    type: 'SplitClip',
    clipId,
    atUs,
    newClipId: newIdOf(fields, 'newClipId'),
  });
}

/** The fields of a `JoinClips` (D55.5). */
export function parseJoinClips(value: unknown): JoinClipsCommand {
  const fields = fieldsOf(value, ['type', 'clipId', 'nextClipId'], 'The command `JoinClips`');
  return Object.freeze({
    type: 'JoinClips',
    clipId: nodeIdOf(fields, 'clipId'),
    nextClipId: nodeIdOf(fields, 'nextClipId'),
  });
}

/** The fields of an `AddSceneTransition` (D56.6); the document's validation judges the transition. */
export function parseAddSceneTransition(value: unknown): AddSceneTransitionCommand {
  const fields = fieldsOf(
    value,
    ['type', 'index', 'transition'],
    'The command `AddSceneTransition`',
  );
  const index = indexOf(fields);
  return Object.freeze({
    type: 'AddSceneTransition',
    index,
    transition: dataOf(fields['transition'], 'transition'),
  });
}

/** The fields of an `AddClipTransition` (D56.6); the document's validation judges the transition. */
export function parseAddClipTransition(value: unknown): AddClipTransitionCommand {
  const fields = fieldsOf(
    value,
    ['type', 'sceneId', 'index', 'transition'],
    'The command `AddClipTransition`',
  );
  const sceneId = nodeIdOf(fields, 'sceneId');
  const index = indexOf(fields);
  return Object.freeze({
    type: 'AddClipTransition',
    sceneId,
    index,
    transition: dataOf(fields['transition'], 'transition'),
  });
}

/** The fields of a `RemoveTransition` (D56.6). */
export function parseRemoveTransition(value: unknown): RemoveTransitionCommand {
  const fields = fieldsOf(value, ['type', 'transitionId'], 'The command `RemoveTransition`');
  return Object.freeze({
    type: 'RemoveTransition',
    transitionId: nodeIdOf(fields, 'transitionId'),
  });
}

/** The fields of a `SetTransitionDuration` (D56.6), with the bounds of the schema. */
export function parseSetTransitionDuration(value: unknown): SetTransitionDurationCommand {
  const fields = fieldsOf(
    value,
    ['type', 'transitionId', 'durationUs'],
    'The command `SetTransitionDuration`',
  );
  return Object.freeze({
    type: 'SetTransitionDuration',
    transitionId: nodeIdOf(fields, 'transitionId'),
    durationUs: integerWithin(fields['durationUs'], TRANSITION_DURATION, '`durationUs`'),
  });
}

/** The fields of a `SetTransitionEffect` (D56.6); the document's validation judges the effect. */
export function parseSetTransitionEffect(value: unknown): SetTransitionEffectCommand {
  const fields = fieldsOf(
    value,
    ['type', 'transitionId', 'effect'],
    'The command `SetTransitionEffect`',
  );
  const transitionId = nodeIdOf(fields, 'transitionId');
  return Object.freeze({
    type: 'SetTransitionEffect',
    transitionId,
    effect: dataOf(fields['effect'], 'effect'),
  });
}

/** The fields of a `SetTransitionEasing` (D67.7); the document's validation judges the easing. */
export function parseSetTransitionEasing(value: unknown): SetTransitionEasingCommand {
  const fields = fieldsOf(
    value,
    ['type', 'transitionId', 'easing'],
    'The command `SetTransitionEasing`',
  );
  return Object.freeze({
    type: 'SetTransitionEasing',
    transitionId: nodeIdOf(fields, 'transitionId'),
    easing: dataOf(fields['easing'], 'easing'),
  });
}

/** The fields of a `SetCaptionWords` (D57.5); the document's validation judges every word. */
export function parseSetCaptionWords(value: unknown): SetCaptionWordsCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'words'], 'The command `SetCaptionWords`');
  const nodeId = nodeIdOf(fields);
  const words: unknown = fields['words'];
  if (!Array.isArray(words)) {
    throw new EditorError('invalid-argument', '`words` must be an array of words.');
  }
  return Object.freeze({
    type: 'SetCaptionWords',
    nodeId,
    words: deepFreeze(
      (words as readonly unknown[]).map((word, at) => dataOf(word, `words/${String(at)}`)),
    ),
  });
}

/** The fields of a `SetCaptionWord` (D57.5); the document's validation judges the word. */
export function parseSetCaptionWord(value: unknown): SetCaptionWordCommand {
  const fields = fieldsOf(
    value,
    ['type', 'nodeId', 'index', 'word'],
    'The command `SetCaptionWord`',
  );
  const nodeId = nodeIdOf(fields);
  const index = indexOf(fields);
  return Object.freeze({
    type: 'SetCaptionWord',
    nodeId,
    index,
    word: dataOf(fields['word'], 'word'),
  });
}

/** The fields of a `SetCaptionStyle` (D57.5); the document's validation judges the style. */
export function parseSetCaptionStyle(value: unknown): SetCaptionStyleCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'style'], 'The command `SetCaptionStyle`');
  const nodeId = nodeIdOf(fields);
  return Object.freeze({
    type: 'SetCaptionStyle',
    nodeId,
    style: dataOf(fields['style'], 'style'),
  });
}

/** The fields of a `SetTextStyle` (D69); the document's validation judges the style. */
export function parseSetTextStyle(value: unknown): SetTextStyleCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'style'], 'The command `SetTextStyle`');
  const nodeId = nodeIdOf(fields);
  return Object.freeze({
    type: 'SetTextStyle',
    nodeId,
    style: dataOf(fields['style'], 'style'),
  });
}

/** The fields of a `SetShapeGeometry` (D73); the document's validation judges the geometry. */
export function parseSetShapeGeometry(value: unknown): SetShapeGeometryCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'geometry'], 'The command `SetShapeGeometry`');
  const nodeId = nodeIdOf(fields);
  return Object.freeze({
    type: 'SetShapeGeometry',
    nodeId,
    geometry: dataOf(fields['geometry'], 'geometry'),
  });
}

/** The fields of a `SetShapeFill` (D73); the document's validation judges the fill. */
export function parseSetShapeFill(value: unknown): SetShapeFillCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'fill'], 'The command `SetShapeFill`');
  const nodeId = nodeIdOf(fields);
  return Object.freeze({ type: 'SetShapeFill', nodeId, fill: dataOf(fields['fill'], 'fill') });
}

/** The fields of a `SetShapeStroke` (D73); the document's validation judges the stroke. */
export function parseSetShapeStroke(value: unknown): SetShapeStrokeCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'stroke'], 'The command `SetShapeStroke`');
  const nodeId = nodeIdOf(fields);
  return Object.freeze({
    type: 'SetShapeStroke',
    nodeId,
    stroke: dataOf(fields['stroke'], 'stroke'),
  });
}

/** The fields of a `SetBlendMode` (D75): one value of the schema's set. */
export function parseSetBlendMode(value: unknown): SetBlendModeCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'blendMode'], 'The command `SetBlendMode`');
  const nodeId = nodeIdOf(fields);
  const blendMode: unknown = fields['blendMode'];
  const known = BLEND_MODES.find((item) => item === blendMode);
  if (known === undefined) {
    throw new EditorError(
      'invalid-argument',
      `\`blendMode\` must be one of ${BLEND_MODES.join(', ')}.`,
    );
  }
  return Object.freeze({ type: 'SetBlendMode', nodeId, blendMode: known });
}

/** The fields of a `SetNodeMask` (D75); the document's validation judges the mask. */
export function parseSetNodeMask(value: unknown): SetNodeMaskCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'mask'], 'The command `SetNodeMask`');
  const nodeId = nodeIdOf(fields);
  return Object.freeze({ type: 'SetNodeMask', nodeId, mask: dataOf(fields['mask'], 'mask') });
}

/** The fields of a `SetNodeMatte` (D75); the document's validation judges the matte. */
export function parseSetNodeMatte(value: unknown): SetNodeMatteCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'matte'], 'The command `SetNodeMatte`');
  const nodeId = nodeIdOf(fields);
  return Object.freeze({ type: 'SetNodeMatte', nodeId, matte: dataOf(fields['matte'], 'matte') });
}

/** The fields of a `SetShapeTrim` (D73): two integers in per mille, in the schema's bounds. */
export function parseSetShapeTrim(value: unknown): SetShapeTrimCommand {
  const fields = fieldsOf(value, ['type', 'nodeId', 'trim'], 'The command `SetShapeTrim`');
  const nodeId = nodeIdOf(fields);
  const trim = fieldsOf(fields['trim'], ['start', 'end'], '`trim`');
  return Object.freeze({
    type: 'SetShapeTrim',
    nodeId,
    trim: Object.freeze({
      start: boundedInteger(trim['start'], TRIM, '`trim.start`'),
      end: boundedInteger(trim['end'], TRIM, '`trim.end`'),
    }),
  });
}

/** The fields of an `AddTextAnimation` (D69); the document's validation judges the animation. */
export function parseAddTextAnimation(value: unknown): AddTextAnimationCommand {
  const fields = fieldsOf(
    value,
    ['type', 'nodeId', 'index', 'animation'],
    'The command `AddTextAnimation`',
  );
  const nodeId = nodeIdOf(fields);
  const index = indexOf(fields);
  return Object.freeze({
    type: 'AddTextAnimation',
    nodeId,
    index,
    animation: dataOf(fields['animation'], 'animation'),
  });
}

/** The fields of a `RemoveTextAnimation` (D69). */
export function parseRemoveTextAnimation(value: unknown): RemoveTextAnimationCommand {
  const fields = fieldsOf(value, ['type', 'textAnimationId'], 'The command `RemoveTextAnimation`');
  return Object.freeze({
    type: 'RemoveTextAnimation',
    textAnimationId: nodeIdOf(fields, 'textAnimationId'),
  });
}

/**
 * The fields of a `SetTextAnimation` (D69): its `id` names the text animation
 * it replaces, which the command looks up; the rest is the validator's.
 */
export function parseSetTextAnimation(value: unknown): SetTextAnimationCommand {
  const fields = fieldsOf(value, ['type', 'animation'], 'The command `SetTextAnimation`');
  return Object.freeze({
    type: 'SetTextAnimation',
    animation: dataOf(fields['animation'], 'animation'),
  });
}

/** The fields of a `SetCaptionHighlight` (D70); the document's validation judges the highlight. */
export function parseSetCaptionHighlight(value: unknown): SetCaptionHighlightCommand {
  const fields = fieldsOf(
    value,
    ['type', 'nodeId', 'highlight'],
    'The command `SetCaptionHighlight`',
  );
  const nodeId = nodeIdOf(fields);
  return Object.freeze({
    type: 'SetCaptionHighlight',
    nodeId,
    highlight: dataOf(fields['highlight'], 'highlight'),
  });
}

/** The fields of a `SetCaptionPageAnimation` (D70); the document's validation judges the animation. */
export function parseSetCaptionPageAnimation(value: unknown): SetCaptionPageAnimationCommand {
  const fields = fieldsOf(
    value,
    ['type', 'nodeId', 'phase', 'animation'],
    'The command `SetCaptionPageAnimation`',
  );
  const nodeId = nodeIdOf(fields);
  const phase: unknown = fields['phase'];
  const known = PAGE_PHASES.find((item) => item === phase);
  if (known === undefined) {
    throw new EditorError(
      'invalid-argument',
      `\`phase\` must be one of ${PAGE_PHASES.join(', ')}.`,
    );
  }
  return Object.freeze({
    type: 'SetCaptionPageAnimation',
    nodeId,
    phase: known,
    animation: dataOf(fields['animation'], 'animation'),
  });
}

/** The fields of a `SetSafeArea` (D70); the document's validation judges the safe area. */
export function parseSetSafeArea(value: unknown): SetSafeAreaCommand {
  const fields = fieldsOf(value, ['type', 'safeArea'], 'The command `SetSafeArea`');
  return Object.freeze({
    type: 'SetSafeArea',
    safeArea: dataOf(fields['safeArea'], 'safeArea'),
  });
}

/** The fields of an `AddEffect` (D71); the document's validation judges the effect. */
export function parseAddEffect(value: unknown): AddEffectCommand {
  const fields = fieldsOf(value, ['type', 'ownerId', 'index', 'effect'], 'The command `AddEffect`');
  const ownerId = nodeIdOf(fields, 'ownerId');
  const index = indexOf(fields);
  return Object.freeze({
    type: 'AddEffect',
    ownerId,
    index,
    effect: dataOf(fields['effect'], 'effect'),
  });
}

/** The fields of a `RemoveEffect` (D71). */
export function parseRemoveEffect(value: unknown): RemoveEffectCommand {
  const fields = fieldsOf(value, ['type', 'effectId'], 'The command `RemoveEffect`');
  return Object.freeze({ type: 'RemoveEffect', effectId: nodeIdOf(fields, 'effectId') });
}

/** The fields of a `ReorderEffect` (D71). */
export function parseReorderEffect(value: unknown): ReorderEffectCommand {
  const fields = fieldsOf(value, ['type', 'effectId', 'index'], 'The command `ReorderEffect`');
  const effectId = nodeIdOf(fields, 'effectId');
  return Object.freeze({ type: 'ReorderEffect', effectId, index: indexOf(fields) });
}

/**
 * The fields of a `SetEffect` (D71): its `id` names the effect it replaces,
 * which the command looks up; the rest is the validator's.
 */
export function parseSetEffect(value: unknown): SetEffectCommand {
  const fields = fieldsOf(value, ['type', 'effect'], 'The command `SetEffect`');
  return Object.freeze({ type: 'SetEffect', effect: dataOf(fields['effect'], 'effect') });
}

/** The fields of an `AddTemplateInput` (D58.6); the document's validation judges the input. */
export function parseAddTemplateInput(value: unknown): AddTemplateInputCommand {
  const fields = fieldsOf(value, ['type', 'index', 'input'], 'The command `AddTemplateInput`');
  const index = indexOf(fields);
  return Object.freeze({
    type: 'AddTemplateInput',
    index,
    input: dataOf(fields['input'], 'input'),
  });
}

/** The fields of a `RemoveTemplateInput` (D58.6). */
export function parseRemoveTemplateInput(value: unknown): RemoveTemplateInputCommand {
  const fields = fieldsOf(value, ['type', 'inputId'], 'The command `RemoveTemplateInput`');
  return Object.freeze({ type: 'RemoveTemplateInput', inputId: nodeIdOf(fields, 'inputId') });
}

/** The fields of a `SetTemplateInput` (D58.6); the input keeps its ID, the document judges the rest. */
export function parseSetTemplateInput(value: unknown): SetTemplateInputCommand {
  const fields = fieldsOf(value, ['type', 'inputId', 'input'], 'The command `SetTemplateInput`');
  const inputId = nodeIdOf(fields, 'inputId');
  const input = dataOf(fields['input'], 'input');
  return Object.freeze({ type: 'SetTemplateInput', inputId, input });
}

/** The fields of an `AddTemplateBinding` (D58.6); the document's validation judges the binding. */
export function parseAddTemplateBinding(value: unknown): AddTemplateBindingCommand {
  const fields = fieldsOf(value, ['type', 'index', 'binding'], 'The command `AddTemplateBinding`');
  const index = indexOf(fields);
  return Object.freeze({
    type: 'AddTemplateBinding',
    index,
    binding: dataOf(fields['binding'], 'binding'),
  });
}

/** The fields of a `RemoveTemplateBinding` (D58.6). */
export function parseRemoveTemplateBinding(value: unknown): RemoveTemplateBindingCommand {
  const fields = fieldsOf(value, ['type', 'bindingId'], 'The command `RemoveTemplateBinding`');
  return Object.freeze({ type: 'RemoveTemplateBinding', bindingId: nodeIdOf(fields, 'bindingId') });
}

/** The fields of an `AddTemplateCondition` (D59.6); the document's validation judges the condition. */
export function parseAddTemplateCondition(value: unknown): AddTemplateConditionCommand {
  const fields = fieldsOf(
    value,
    ['type', 'index', 'condition'],
    'The command `AddTemplateCondition`',
  );
  const index = indexOf(fields);
  return Object.freeze({
    type: 'AddTemplateCondition',
    index,
    condition: dataOf(fields['condition'], 'condition'),
  });
}

/** The fields of a `RemoveTemplateCondition` (D59.6). */
export function parseRemoveTemplateCondition(value: unknown): RemoveTemplateConditionCommand {
  const fields = fieldsOf(value, ['type', 'conditionId'], 'The command `RemoveTemplateCondition`');
  return Object.freeze({
    type: 'RemoveTemplateCondition',
    conditionId: nodeIdOf(fields, 'conditionId'),
  });
}

/** The fields of an `AddTemplateRepeat` (D59.6); the document's validation judges the repeat. */
export function parseAddTemplateRepeat(value: unknown): AddTemplateRepeatCommand {
  const fields = fieldsOf(value, ['type', 'index', 'repeat'], 'The command `AddTemplateRepeat`');
  const index = indexOf(fields);
  return Object.freeze({
    type: 'AddTemplateRepeat',
    index,
    repeat: dataOf(fields['repeat'], 'repeat'),
  });
}

/** The fields of a `RemoveTemplateRepeat` (D59.6). */
export function parseRemoveTemplateRepeat(value: unknown): RemoveTemplateRepeatCommand {
  const fields = fieldsOf(value, ['type', 'repeatId'], 'The command `RemoveTemplateRepeat`');
  return Object.freeze({ type: 'RemoveTemplateRepeat', repeatId: nodeIdOf(fields, 'repeatId') });
}

/** The fields of an `AddDefinition` (D76); the document's validation judges the definition. */
export function parseAddDefinition(value: unknown): AddDefinitionCommand {
  const fields = fieldsOf(value, ['type', 'index', 'definition'], 'The command `AddDefinition`');
  const index = indexOf(fields);
  return Object.freeze({
    type: 'AddDefinition',
    index,
    definition: dataOf(fields['definition'], 'definition'),
  });
}

/** The fields of a `RemoveDefinition` (D76). */
export function parseRemoveDefinition(value: unknown): RemoveDefinitionCommand {
  const fields = fieldsOf(value, ['type', 'definitionId'], 'The command `RemoveDefinition`');
  return Object.freeze({
    type: 'RemoveDefinition',
    definitionId: nodeIdOf(fields, 'definitionId'),
  });
}

/** The fields of a `ConvertToDefinition` (D76): the new IDs must match the document's ID pattern. */
export function parseConvertToDefinition(value: unknown): ConvertToDefinitionCommand {
  const fields = fieldsOf(
    value,
    ['type', 'fromNodeId', 'toNodeId', 'definitionId', 'instanceId', 'index'],
    'The command `ConvertToDefinition`',
  );
  const fromNodeId = nodeIdOf(fields, 'fromNodeId');
  const toNodeId = nodeIdOf(fields, 'toNodeId');
  const definitionId = newIdOf(fields, 'definitionId');
  const instanceId = newIdOf(fields, 'instanceId');
  if (definitionId === instanceId) {
    throw new EditorError(
      'invalid-argument',
      '`definitionId` and `instanceId` must differ; IDs are unique in the document.',
    );
  }
  const index = indexOf(fields);
  return Object.freeze({
    type: 'ConvertToDefinition',
    fromNodeId,
    toNodeId,
    definitionId,
    instanceId,
    index,
  });
}

/** The fields of an `ExpandInstance` (D76). */
export function parseExpandInstance(value: unknown): ExpandInstanceCommand {
  const fields = fieldsOf(value, ['type', 'instanceId'], 'The command `ExpandInstance`');
  return Object.freeze({ type: 'ExpandInstance', instanceId: nodeIdOf(fields, 'instanceId') });
}

/** The fields of a `SetInstanceInput` (D77); the bus and the document's validation judge the value. */
export function parseSetInstanceInput(value: unknown): SetInstanceInputCommand {
  const fields = fieldsOf(value, ['type', 'instanceId', 'input'], 'The command `SetInstanceInput`');
  const instanceId = nodeIdOf(fields, 'instanceId');
  const input = dataOf(fields['input'], 'input');
  return Object.freeze({ type: 'SetInstanceInput', instanceId, input });
}

/** The fields of a `ClearInstanceInput` (D77). */
export function parseClearInstanceInput(value: unknown): ClearInstanceInputCommand {
  const fields = fieldsOf(
    value,
    ['type', 'instanceId', 'inputId'],
    'The command `ClearInstanceInput`',
  );
  return Object.freeze({
    type: 'ClearInstanceInput',
    instanceId: nodeIdOf(fields, 'instanceId'),
    inputId: nodeIdOf(fields, 'inputId'),
  });
}

/** The fields of a `ReplaceDefinition` (D77); the definition keeps its ID, the document judges the rest. */
export function parseReplaceDefinition(value: unknown): ReplaceDefinitionCommand {
  const fields = fieldsOf(
    value,
    ['type', 'definitionId', 'definition'],
    'The command `ReplaceDefinition`',
  );
  return Object.freeze({
    type: 'ReplaceDefinition',
    definitionId: nodeIdOf(fields, 'definitionId'),
    definition: dataOf(fields['definition'], 'definition'),
  });
}

/**
 * The closed registry of the commands this build knows (D38.1, D39.9). One
 * entry per member of `Command`, typed so that a member without an entry, or an
 * entry without a member, fails compilation. The table is deep-frozen at module
 * scope and not exported: no caller can add, replace, or remove a command, and
 * there is no way to load one from outside the package.
 *
 * Each entry reads the fields of its command (`parse`) and edits the document
 * (`edit`); `executeCommand`, behind the public `applyCommand`, does the rest of
 * D30.4 for every command alike — validating the result in full, and only then
 * returning it with its inverse.
 */
import { compositionSchema } from '@kadrion/schema';

import { keyframeMinimum } from './animations.js';
import {
  copyNode,
  deepFreeze,
  isPlainObject,
  parseAddAnimation,
  parseAddAsset,
  parseAddAudioClip,
  parseAddKeyframe,
  parseAddNode,
  parseAddScene,
  parseAddClipTransition,
  parseAddSceneTransition,
  parseRemoveTransition,
  parseSetTransitionDuration,
  parseSetTransitionEffect,
  parseSetTransitionEasing,
  parseSetCaptionStyle,
  parseSetTextStyle,
  parseSetShapeFill,
  parseSetBlendMode,
  parseSetNodeMask,
  parseSetNodeMatte,
  parseSetShapeGeometry,
  parseSetShapeStroke,
  parseSetShapeTrim,
  parseAddTextAnimation,
  parseRemoveTextAnimation,
  parseSetTextAnimation,
  parseSetCaptionHighlight,
  parseSetCaptionPageAnimation,
  parseSetSafeArea,
  parseAddEffect,
  parseRemoveEffect,
  parseReorderEffect,
  parseSetEffect,
  parseSetCaptionWord,
  parseSetCaptionWords,
  parseAddTemplateBinding,
  parseAddTemplateInput,
  parseRemoveTemplateBinding,
  parseAddTemplateCondition,
  parseRemoveTemplateCondition,
  parseAddTemplateRepeat,
  parseRemoveTemplateRepeat,
  parseRemoveTemplateInput,
  parseSetTemplateInput,
  parseAddSceneAudioClip,
  parseJoinClips,
  parseMoveClip,
  parseSplitClip,
  parseTrimClipEnd,
  parseTrimClipStart,
  parseDuplicateScene,
  parseMoveNodeToScene,
  parseRemoveScene,
  parseReorderScene,
  parseSetSceneDuration,
  parseDuplicateNode,
  parseMoveKeyframe,
  parseSetKeyframeEasing,
  parseRemoveAnimation,
  parseRemoveAsset,
  parseRemoveAudioClip,
  parseRemoveKeyframe,
  parseRemoveNode,
  parseReorderNode,
  parseSetClipFades,
  parseSetClipSource,
  parseSetClipVolume,
  parseSetImageAsset,
  parseSetNodeColor,
  parseSetNodeFit,
  parseSetNodeFocus,
  parseSetNodeRotation,
  parseSetNodeOrigin,
  parseSetNodeCrop,
  parseSetNodeCornerRadius,
  parseSetKeyframeValue,
  normalizedKeyframeValue,
  GENERIC_KEYFRAME_PROPERTIES,
  parseSetNodeLifetime,
  parseSetNodeOpacity,
  parseSetNodePosition,
  parseSetNodeScale,
  parseSetNodeSize,
  parseSetOpacityKeyframe,
  parseSetPositionKeyframe,
  parseSetScaleKeyframe,
  parseSetTextContent,
  parseSetTextFont,
  parseSetTextFontSize,
  parseSetVideoAsset,
  parseSetVideoSource,
  parseSetVideoVolume,
  type Command,
  type KeyframeValueData,
  type CommandPosition,
} from './commands.js';
import {
  assetUsers,
  assetsOf,
  clipListOf,
  findNode,
  findParent,
  idsIn,
  isObject,
  keyframeIndex,
  keyframesOf,
  locateAnimation,
  locateClip,
  locateTextAnimation,
  locateEffect,
  effectsIds,
  replaceEffects,
  locateNode,
  locateScene,
  locateTransition,
  placedByTime,
  replaceAnimation,
  replaceAssets,
  replaceTextAnimation,
  replaceClipList,
  replaceList,
  replaceNode,
  replaceScenes,
  replaceTransitionList,
  sceneIds,
  scenesOf,
  subtreeIds,
  transitionListOf,
  type AnimationLocation,
  type ClipOwner,
  type ListAddress,
  type DocumentObject,
  type NodeLocation,
  type TextAnimationLocation,
  type EffectLocation,
  type ValidationFinding,
} from './document.js';
import { EditorError } from './errors.js';

/**
 * A document with the command applied, not yet validated, and what the edit
 * did. The inverse is read from the concrete document the command was applied
 * to, never from the parser alone. An entry may prepare it while building the
 * candidate, or build it when asked; `executeCommand` — which the public
 * `applyCommand` wraps — asks through `invert` only once the document
 * validated, and discards the candidate and any prepared inverse when it does
 * not (D39.5).
 */
export interface DocumentEdit {
  readonly document: DocumentObject;
  readonly invert: () => Command;
  /** The IDs this command created, in the order of D39.4. */
  readonly createdIds: readonly string[];
  /** The IDs this command removed, with the whole subtree (D39.4). */
  readonly removedIds: readonly string[];
  /**
   * Reads the errors of a failed validation of `document` and returns the
   * failure they mean for this command, or `null` for `invalid-result`. Only
   * `RemoveAsset` has one: the uses of the removed asset (D40.4).
   */
  readonly refine?: (errors: readonly ValidationFinding[]) => EditorError | null;
}

/** How one command type reads its fields and edits a document. */
export interface CommandDefinition<C extends Command> {
  readonly parse: (value: unknown) => C;
  /**
   * The edited document, or `null` when the command changes no value (D30.9,
   * rule 7; D38.9). Throws an `EditorError` when the command cannot apply.
   */
  readonly edit: (document: DocumentObject, command: C) => DocumentEdit | null;
}

type Definitions = {
  readonly [T in Command['type']]: CommandDefinition<Extract<Command, { type: T }>>;
};

/** One coordinate of a node of a validated document, which the schema guarantees is an integer. */
function coordinate(position: DocumentObject, axis: 'x' | 'y', nodeId: string): number {
  const value: unknown = position[axis];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new EditorError(
      'unsupported-node',
      `The node \`${nodeId}\` has no numeric position.${axis}.`,
    );
  }
  return value;
}

function unknownNode(nodeId: string): EditorError {
  return new EditorError('unknown-node', `The document has no node \`${nodeId}\`.`);
}

/** The node with that ID and where it lives, or `unknown-node`. */
function located(document: DocumentObject, nodeId: string): NodeLocation {
  const location = locateNode(document, nodeId);
  if (location === null) throw unknownNode(nodeId);
  return location;
}

/**
 * The edit of one node's field (D30.4): find the node, let `change` rebuild it
 * or report that nothing changes, and put the new node in its place.
 */
function onNode(
  document: DocumentObject,
  nodeId: string,
  change: (
    node: DocumentObject,
  ) => { readonly node: DocumentObject; readonly inverse: Command } | null,
): DocumentEdit | null {
  const node = findNode(document, nodeId);
  if (node === null) throw unknownNode(nodeId);
  const edit = change(node);
  if (edit === null) return null;
  const inverse = edit.inverse;
  return {
    document: replaceNode(document, nodeId, edit.node),
    invert: () => inverse,
    createdIds: [],
    removedIds: [],
  };
}

/**
 * The edit of one audio clip's fields (D52.6): find the clip, let `change`
 * rebuild it or report that nothing changes, and put the new clip in its place.
 */
function onClip(
  document: DocumentObject,
  clipId: string,
  change: (
    clip: DocumentObject,
  ) => { readonly clip: DocumentObject; readonly inverse: Command } | null,
): DocumentEdit | null {
  const found = locateClip(document, clipId);
  if (found === null) {
    throw new EditorError('unknown-clip', `The document has no audio clip \`${clipId}\`.`);
  }
  const edit = change(found.clip);
  if (edit === null) return null;
  const inverse = edit.inverse;
  const clips = clipListOf(document, found.owner).map((clip, at) =>
    at === found.index ? edit.clip : clip,
  );
  return {
    document: replaceClipList(document, found.owner, clips),
    invert: () => inverse,
    createdIds: [],
    removedIds: [],
  };
}

/**
 * Refuses, before anything changes, every ID a command would add that the
 * document already uses — whatever the entity (D16.3) — or that the command
 * would add twice. The colliding IDs are the details, sorted (D39.3).
 */
function refuseTaken(document: DocumentObject, ids: readonly string[]): void {
  const present = idsIn(document);
  const seen = new Set<string>();
  const colliding = new Set<string>();
  for (const id of ids) {
    if (present.has(id) || seen.has(id)) colliding.add(id);
    seen.add(id);
  }
  if (colliding.size > 0) {
    throw new EditorError(
      'id-in-use',
      'The document already uses an ID that the command would add.',
      [...colliding].sort(),
    );
  }
}

/** The list with `node` inserted at `index`. */
function inserted(list: readonly unknown[], index: number, node: unknown): readonly unknown[] {
  return [...list.slice(0, index), node, ...list.slice(index)];
}

function outOfRange(index: number, last: number, what: string): EditorError {
  return new EditorError(
    'index-out-of-range',
    `The index ${String(index)} is outside ${what}, which takes 0 to ${String(last)}.`,
  );
}

/**
 * A node's animations renamed after their owner: `<owner>-a-<property>` (D39.3),
 * its text animations `<owner>-t<i>` by their index (D69), and its effects as
 * `renamedEffects` names them (D71).
 */
function renamedAnimations(owner: DocumentObject, ownerId: string): DocumentObject {
  let renamed = owner;
  const animations = owner['animations'];
  if (Array.isArray(animations)) {
    renamed = {
      ...renamed,
      animations: (animations as readonly unknown[]).map((animation) =>
        isObject(animation)
          ? { ...animation, id: `${ownerId}-a-${String(animation['property'])}` }
          : animation,
      ),
    };
  }
  const textAnimations = owner['textAnimations'];
  if (Array.isArray(textAnimations)) {
    renamed = {
      ...renamed,
      textAnimations: (textAnimations as readonly unknown[]).map((animation, index) =>
        isObject(animation) ? { ...animation, id: `${ownerId}-t${String(index)}` } : animation,
      ),
    };
  }
  return renamedEffects(renamed, ownerId);
}

/**
 * An owner's effects renamed after it (D71): the effect at index i is
 * `<owner>-e<i>`, and each of its animations that effect's ID followed by
 * `-a-<parameter>`, in the manner of D39.3.
 */
function renamedEffects(owner: DocumentObject, ownerId: string): DocumentObject {
  const effects = owner['effects'];
  if (!Array.isArray(effects)) return owner;
  return {
    ...owner,
    effects: (effects as readonly unknown[]).map((effect, index) =>
      isObject(effect)
        ? renamedAnimations(
            { ...effect, id: `${ownerId}-e${String(index)}` },
            `${ownerId}-e${String(index)}`,
          )
        : effect,
    ),
  };
}

/**
 * The copy of a subtree under the IDs D39.3 derives from `newNodeId`: the root
 * is `N`, the child at index i is `N-c<i>`, and each animation is its owner's ID
 * followed by `-a-<property>`. Only the `id` fields change; texts, HTML, and
 * every other value are copied as they are. Spreading keeps every key in place.
 */
function duplicated(source: DocumentObject, newNodeId: string): DocumentObject {
  const copy = copyNode(source);
  const root = renamedAnimations({ ...copy, id: newNodeId }, newNodeId);
  const children = root['children'];
  if (!Array.isArray(children)) return deepFreeze(root);
  return deepFreeze({
    ...root,
    children: (children as readonly unknown[]).map((child, at) => {
      if (!isObject(child)) return child;
      const childId = `${newNodeId}-c${String(at)}`;
      return renamedAnimations({ ...child, id: childId }, childId);
    }),
  });
}

/** The number a node holds in `field`, or `unsupported-node` (D30.8). */
function numberField(node: DocumentObject, field: string, nodeId: string): number {
  const value: unknown = node[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new EditorError('unsupported-node', `The node \`${nodeId}\` has no ${field}.`);
  }
  return value;
}

/** The point `{x, y}` a node holds in `field`, or `unsupported-node` (D63.4). */
function pointField(
  node: DocumentObject,
  field: string,
  nodeId: string,
): { readonly x: number; readonly y: number } {
  const value = node[field];
  if (!isObject(value)) {
    throw new EditorError('unsupported-node', `The node \`${nodeId}\` has no ${field}.`);
  }
  return { x: numberField(value, 'x', nodeId), y: numberField(value, 'y', nodeId) };
}

/** The string a node holds in `field`, or `unsupported-node` (D30.8). */
function stringField(node: DocumentObject, field: string, nodeId: string): string {
  const value: unknown = node[field];
  if (typeof value !== 'string') {
    throw new EditorError('unsupported-node', `The node \`${nodeId}\` has no ${field}.`);
  }
  return value;
}

/** Where an asset with that ID is in `assets`, looked up there alone (D40.2), or `null`. */
function locateAsset(
  document: DocumentObject,
  assetId: string,
): { readonly asset: DocumentObject; readonly index: number } | null {
  const assets = assetsOf(document);
  const index = assets.findIndex((asset) => isObject(asset) && asset['id'] === assetId);
  const asset = assets[index];
  return isObject(asset) ? { asset, index } : null;
}

function unknownAsset(assetId: string): EditorError {
  return new EditorError('unknown-asset', `The document declares no asset \`${assetId}\`.`);
}

/** Checks that an asset exists in `assets` and is of the type the field expects (D40.2). */
/** Refuses a node of another type than `type` with `unsupported-node` (D30.8). */
/** The node types that blend, take a mask, and take a matte (D75). */
const COMPOSITED_TYPES: readonly string[] = Object.freeze([
  'image',
  'video',
  'text',
  'captions',
  'shape',
  'group',
]);

function requireType(node: DocumentObject, types: readonly string[], nodeId: string): void {
  if (!types.includes(String(node['type']))) {
    throw new EditorError(
      'unsupported-node',
      `The node \`${nodeId}\` is of type ${String(node['type'])}, not ${types.join(' or ')}.`,
    );
  }
}

function requireAsset(
  document: DocumentObject,
  assetId: string,
  type: string | readonly string[],
): void {
  const found = locateAsset(document, assetId);
  if (found === null) throw unknownAsset(assetId);
  const types: readonly string[] = typeof type === 'string' ? [type] : type;
  if (!types.includes(found.asset['type'] as string)) {
    throw new EditorError(
      'asset-type-mismatch',
      `The asset \`${assetId}\` is of type ${String(found.asset['type'])}, not ${types.join(' or ')}.`,
    );
  }
}

/** The effect with that ID and where it lives, or `unknown-effect` (D71). */
function locatedEffect(document: DocumentObject, effectId: string): EffectLocation {
  const location = locateEffect(document, effectId);
  if (location === null) {
    throw new EditorError('unknown-effect', `The document has no effect \`${effectId}\`.`);
  }
  return location;
}

/** The node types that take effects (D71). */
const EFFECT_OWNERS = ['image', 'video', 'text', 'captions', 'group', 'shape'] as const;

/** The animation with that ID, or `unknown-animation` (D41.2). */
function locatedTextAnimation(
  document: DocumentObject,
  textAnimationId: string,
): TextAnimationLocation {
  const location = locateTextAnimation(document, textAnimationId);
  if (location === null) {
    throw new EditorError(
      'unknown-animation',
      `The document has no text animation \`${textAnimationId}\`.`,
    );
  }
  return location;
}

function locatedAnimation(document: DocumentObject, animationId: string): AnimationLocation {
  const location = locateAnimation(document, animationId);
  if (location === null) {
    throw new EditorError('unknown-animation', `The document has no animation \`${animationId}\`.`);
  }
  return location;
}

/** The animation at `location`, which must animate `property` (D41.5). */
function requireProperty(location: AnimationLocation, animationId: string, property: string): void {
  const actual: unknown = location.animation['property'];
  if (actual !== property) {
    throw new EditorError(
      'animation-property-mismatch',
      `The animation \`${animationId}\` animates ${String(actual)}, not ${property}.`,
    );
  }
}

function unknownKeyframe(animationId: string, timeUs: number): EditorError {
  return new EditorError(
    'unknown-keyframe',
    `The animation \`${animationId}\` has no keyframe at ${String(timeUs)} µs.`,
  );
}

function keyframeExists(animationId: string, timeUs: number): EditorError {
  return new EditorError(
    'keyframe-exists',
    `The animation \`${animationId}\` already has a keyframe at ${String(timeUs)} µs.`,
  );
}

/** The document with the animation at `location` holding `keyframes` instead. */
function withKeyframes(
  document: DocumentObject,
  location: AnimationLocation,
  keyframes: readonly unknown[],
): DocumentObject {
  return replaceAnimation(document, location, { ...location.animation, keyframes });
}

/** How a typed keyframe command reads and writes its value (D41.3). */
interface KeyframeValue {
  /** Whether the stored value already is the command's, compared after the normalisation. */
  readonly equals: (stored: unknown) => boolean;
  /** The stored value with the command's written into it, its keys in their order. */
  readonly merged: (stored: unknown) => unknown;
  /** The value of a keyframe the command inserts. */
  readonly fresh: unknown;
  /** The same command with the stored value: the inverse of a replacement. */
  readonly previous: (stored: unknown) => Command;
}

/** The object value `{ x, y }` of a position or scale keyframe (D41.3). */
function pairValue(
  pair: { readonly x: number; readonly y: number },
  previous: (stored: { readonly x: number; readonly y: number }) => Command,
): KeyframeValue {
  const read = (stored: unknown): { x: unknown; y: unknown } =>
    isObject(stored) ? { x: stored['x'], y: stored['y'] } : { x: undefined, y: undefined };
  return {
    equals: (stored) => {
      const { x, y } = read(stored);
      return x === pair.x && y === pair.y;
    },
    // The stored object is spread and x and y written into it, so a stored
    // `{ y, x }` stays `{ y, x }`; the parsed `{ x, y }` is never written (D41.3).
    merged: (stored) =>
      isObject(stored) ? { ...stored, x: pair.x, y: pair.y } : { x: pair.x, y: pair.y },
    fresh: { x: pair.x, y: pair.y },
    previous: (stored) => {
      const { x, y } = read(stored);
      return previous({ x: Number(x), y: Number(y) });
    },
  };
}

/**
 * The easing a keyframe inserted at `timeUs` takes (D67.7): a copy of that of
 * the keyframe before it, whose segment it splits, or linear before the first.
 */
function inheritedEasing(keyframes: readonly unknown[], timeUs: number): unknown {
  let easing: unknown = { kind: 'linear' };
  for (const keyframe of keyframes) {
    if (!isObject(keyframe) || typeof keyframe['timeUs'] !== 'number') continue;
    if (keyframe['timeUs'] >= timeUs) break;
    easing = keyframe['easing'];
  }
  return isObject(easing) ? copyNode(easing) : easing;
}

/**
 * Sets, or inserts, the keyframe at `timeUs` of an animation of `property`
 * (D41.1). A replacement spreads the stored keyframe and merges into its value,
 * its easing untouched; an insertion writes a new `{ timeUs, value, easing }` at
 * the place its time gives it, eased as the keyframe before it (D67.7).
 */
function setKeyframe(
  document: DocumentObject,
  animationId: string,
  property: string,
  timeUs: number,
  value: KeyframeValue,
): DocumentEdit | null {
  const location = locatedAnimation(document, animationId);
  requireProperty(location, animationId, property);
  const keyframes = keyframesOf(location.animation);
  const at = keyframeIndex(keyframes, timeUs);
  const stored = keyframes[at];
  if (isObject(stored)) {
    const previous = stored['value'];
    if (value.equals(previous)) return null;
    const replaced = { ...stored, value: value.merged(previous) };
    return {
      document: withKeyframes(
        document,
        location,
        keyframes.map((keyframe, index) => (index === at ? replaced : keyframe)),
      ),
      invert: () => value.previous(previous),
      createdIds: [],
      removedIds: [],
    };
  }
  const inserted = { timeUs, value: value.fresh, easing: inheritedEasing(keyframes, timeUs) };
  return {
    document: withKeyframes(document, location, placedByTime(keyframes, inserted, timeUs)),
    invert: () => parseRemoveKeyframe({ type: 'RemoveKeyframe', animationId, timeUs }),
    createdIds: [],
    removedIds: [],
  };
}

/** The scene with that ID and its index, or `unknown-scene` (D54.5). */
function locatedScene(
  document: DocumentObject,
  sceneId: string,
): { readonly scene: DocumentObject; readonly index: number } {
  const found = locateScene(document, sceneId);
  if (found === null) {
    throw new EditorError('unknown-scene', `The document has no scene \`${sceneId}\`.`);
  }
  return found;
}

/**
 * The document with `scenes` and its `durationUs` changed by `deltaUs`, so that
 * it stays the sum of the scenes' durations (D49.3, D54.2). A document whose
 * duration is not a number is left for the validation to refuse.
 */
function withScenes(
  document: DocumentObject,
  scenes: readonly unknown[],
  deltaUs: number,
): DocumentObject {
  const durationUs: unknown = document['durationUs'];
  const edited = replaceScenes(document, scenes);
  return typeof durationUs === 'number' ? { ...edited, durationUs: durationUs + deltaUs } : edited;
}

/** The duration a scene states, or 0 when it states none; the validation judges the rest. */
function sceneDuration(scene: DocumentObject): number {
  const durationUs: unknown = scene['durationUs'];
  return typeof durationUs === 'number' ? durationUs : 0;
}

/**
 * The copy of a scene under the IDs D54.5 derives from `newSceneId`, in the
 * manner of D39.3: the scene is `S`, the node at index i is `S-n<i>`, a child of
 * that node at index j is `S-n<i>-c<j>`, each animation is its owner's ID
 * followed by `-a-<property>`, an effect at index e of the scene or of a node
 * is its owner's ID followed by `-e<e>` and its animations that ID followed by
 * `-a-<parameter>` (D71), and the clip at index k is `S-k<k>`. Only the `id`
 * fields change.
 */
function duplicatedScene(source: DocumentObject, newSceneId: string): DocumentObject {
  const copy = copyNode(source);
  const nodes = copy['nodes'];
  const clips = copy['clips'];
  const transitions = copy['transitions'];
  // The new ID of every node of the scene, so that a clip transition names the copies (D56.6).
  const renamed = new Map<unknown, string>();
  if (Array.isArray(nodes)) {
    (nodes as readonly unknown[]).forEach((node, at) => {
      if (!isObject(node)) return;
      const nodeId = `${newSceneId}-n${String(at)}`;
      renamed.set(node['id'], nodeId);
      const children = node['children'];
      if (!Array.isArray(children)) return;
      (children as readonly unknown[]).forEach((child, index) => {
        if (isObject(child)) renamed.set(child['id'], `${nodeId}-c${String(index)}`);
      });
    });
  }
  return deepFreeze({
    ...renamedEffects(copy, newSceneId),
    id: newSceneId,
    ...(Array.isArray(nodes)
      ? {
          nodes: (nodes as readonly unknown[]).map((node, at) =>
            isObject(node) ? duplicated(node, `${newSceneId}-n${String(at)}`) : node,
          ),
        }
      : {}),
    ...(Array.isArray(clips)
      ? {
          clips: (clips as readonly unknown[]).map((clip, at) =>
            isObject(clip) ? { ...clip, id: `${newSceneId}-k${String(at)}` } : clip,
          ),
        }
      : {}),
    ...(Array.isArray(transitions)
      ? {
          transitions: (transitions as readonly unknown[]).map((transition, at) =>
            isObject(transition)
              ? {
                  ...transition,
                  id: `${newSceneId}-t${String(at)}`,
                  fromNodeId: renamed.get(transition['fromNodeId']) ?? transition['fromNodeId'],
                  toNodeId: renamed.get(transition['toNodeId']) ?? transition['toNodeId'],
                }
              : transition,
          ),
        }
      : {}),
  });
}

/** The transition with that ID and where it lives, or `unknown-transition` (D56.6). */
function locatedTransition(
  document: DocumentObject,
  transitionId: string,
): NonNullable<ReturnType<typeof locateTransition>> {
  const found = locateTransition(document, transitionId);
  if (found === null) {
    throw new EditorError(
      'unknown-transition',
      `The document has no transition \`${transitionId}\`.`,
    );
  }
  return found;
}

/**
 * The document with the composition's `durationUs` changed by `deltaUs`, so that
 * it stays the sum of the scenes' durations less the scene transitions' (D56.2).
 * A document whose duration is not a number is left for the validation to refuse.
 */
function withDuration(document: DocumentObject, deltaUs: number): DocumentObject {
  const durationUs: unknown = document['durationUs'];
  return typeof durationUs === 'number'
    ? { ...document, durationUs: durationUs + deltaUs }
    : document;
}

/** The duration a transition states, or 0 when it states none; the validation judges the rest. */
function transitionDuration(transition: DocumentObject): number {
  const durationUs: unknown = transition['durationUs'];
  return typeof durationUs === 'number' ? durationUs : 0;
}

/** The ID a transition being added carries, as the IDs it creates (D39.4). */
function transitionIds(transition: DocumentObject): string[] {
  const id: unknown = transition['id'];
  return typeof id === 'string' ? [id] : [];
}

/**
 * A clip of a timeline command (D55.1): a node, the list that holds it, and
 * its place there, or an audio clip in its list. `list` is a key of the list,
 * equal for two clips of the same list; `put` writes the list back.
 */
interface TimelineClip {
  readonly kind: 'node' | 'audio';
  readonly clip: DocumentObject;
  readonly items: readonly unknown[];
  readonly index: number;
  readonly list: string;
  readonly put: (document: DocumentObject, items: readonly unknown[]) => DocumentObject;
}

function nodeClip(
  node: DocumentObject,
  items: readonly unknown[],
  index: number,
  address: ListAddress,
): TimelineClip {
  return {
    kind: 'node',
    clip: node,
    items,
    index,
    list: `nodes:${String(address.sceneIndex)}:${String(address.groupIndex)}`,
    put: (document, edited) => replaceList(document, address, edited),
  };
}

function audioClip(
  clip: DocumentObject,
  items: readonly unknown[],
  index: number,
  owner: ClipOwner,
): TimelineClip {
  return {
    kind: 'audio',
    clip,
    items,
    index,
    list: `clips:${owner === null ? 'composition' : String(owner.sceneIndex)}`,
    put: (document, edited) => replaceClipList(document, owner, edited),
  };
}

/** The node or audio clip with that ID — a node first, IDs being one namespace — or `unknown-clip` (D55.1). */
function locatedClip(document: DocumentObject, clipId: string): TimelineClip {
  const node = locateNode(document, clipId);
  if (node !== null) return nodeClip(node.node, node.list, node.index, node.address);
  const found = locateClip(document, clipId);
  if (found !== null) {
    return audioClip(found.clip, clipListOf(document, found.owner), found.index, found.owner);
  }
  throw new EditorError('unknown-clip', `The document has no node or audio clip \`${clipId}\`.`);
}

/** The document with `clip` in the place of the located one. */
function withClip(
  document: DocumentObject,
  found: TimelineClip,
  clip: DocumentObject,
): DocumentObject {
  return found.put(
    document,
    found.items.map((item, at) => (at === found.index ? clip : item)),
  );
}

/** Whether a clip plays a source and so has `sourceStartUs`: a video node or an audio clip (D55.1). */
function hasSource(found: TimelineClip): boolean {
  return found.kind === 'audio' || found.clip['type'] === 'video';
}

/** Refuses a group, whose children have lifetimes of their own (D55.4). */
function refuseGroup(found: TimelineClip, clipId: string): void {
  if (found.kind === 'node' && found.clip['type'] === 'group') {
    throw new EditorError(
      'unsupported-node',
      `The node \`${clipId}\` is a group; its children have their own lifetimes, so it is not split or joined (D55.4).`,
    );
  }
}

/**
 * Every word of a captions node moved by `deltaUs`, as its keyframes are: the
 * words are in scene time and are content of the clip (D55.3, D57.5). Any
 * other node is returned as it is.
 */
function shiftedWords(node: DocumentObject, deltaUs: number): DocumentObject {
  const words: unknown = node['words'];
  if (node['type'] !== 'captions' || !Array.isArray(words)) return node;
  return {
    ...node,
    words: (words as readonly unknown[]).map((word) => {
      if (!isObject(word)) return word;
      const startUs: unknown = word['startUs'];
      return typeof startUs === 'number' ? { ...word, startUs: startUs + deltaUs } : word;
    }),
  };
}

/**
 * Every keyframe of an owner's animations, and the scene time of every accent of
 * its text animations, moved by `deltaUs`; every key keeps its place (D55.3, D69).
 */
function shiftedAnimations(owner: DocumentObject, deltaUs: number): DocumentObject {
  return shiftedEffects(shiftedKeyframes(shiftedAccents(owner, deltaUs), deltaUs), deltaUs);
}

/** Every keyframe of the animations of an owner's effects moved by `deltaUs` (D55.3, D71). */
function shiftedEffects(owner: DocumentObject, deltaUs: number): DocumentObject {
  const effects: unknown = owner['effects'];
  if (!Array.isArray(effects)) return owner;
  return {
    ...owner,
    effects: (effects as readonly unknown[]).map((effect) =>
      isObject(effect) ? shiftedKeyframes(effect, deltaUs) : effect,
    ),
  };
}

/** The accents of a text node's text animations moved by `deltaUs` (D69). */
function shiftedAccents(owner: DocumentObject, deltaUs: number): DocumentObject {
  const textAnimations: unknown = owner['textAnimations'];
  if (!Array.isArray(textAnimations)) return owner;
  return {
    ...owner,
    textAnimations: (textAnimations as readonly unknown[]).map((animation) => {
      if (!isObject(animation)) return animation;
      const phase: unknown = animation['phase'];
      if (!isObject(phase) || phase['kind'] !== 'accent') return animation;
      const startUs: unknown = phase['startUs'];
      return typeof startUs === 'number'
        ? { ...animation, phase: { ...phase, startUs: startUs + deltaUs } }
        : animation;
    }),
  };
}

/** Every keyframe of an owner's animations moved by `deltaUs` (D55.3). */
function shiftedKeyframes(owner: DocumentObject, deltaUs: number): DocumentObject {
  const animations: unknown = owner['animations'];
  if (!Array.isArray(animations)) return owner;
  return {
    ...owner,
    animations: (animations as readonly unknown[]).map((animation) =>
      isObject(animation)
        ? {
            ...animation,
            keyframes: keyframesOf(animation).map((keyframe) => {
              if (!isObject(keyframe)) return keyframe;
              const timeUs: unknown = keyframe['timeUs'];
              return typeof timeUs === 'number'
                ? { ...keyframe, timeUs: timeUs + deltaUs }
                : keyframe;
            }),
          }
        : animation,
    ),
  };
}

/**
 * The smallest number of whole microseconds that is a whole number of samples
 * at 48 kHz (D52.5, D53): 125 µs are 6 samples. A sound split at a multiple of
 * it from its start is heard sample for sample like the whole (D55.4).
 */
const SAMPLE_GRID_US = 125;

/** Whether a clip is heard: an audio clip, or a video node above volume 0 (D52.4). */
function isHeard(found: TimelineClip): boolean {
  if (found.kind === 'audio') return true;
  const volume: unknown = found.clip['volume'];
  return found.clip['type'] === 'video' && typeof volume === 'number' && volume > 0;
}

function outsideClip(clipId: string, what: string): EditorError {
  return new EditorError('time-outside-clip', `${what} of the clip \`${clipId}\` (D55.4).`);
}

/**
 * The two halves of a clip cut at `atUs` (D49.1, D55.4): the first keeps its ID
 * and start, the second is a copy under `newClipId` that starts at `atUs`,
 * with a source advanced by the same amount and its animations renamed after
 * it (D39.3). A sound is cut only where both halves are heard exactly as the
 * whole; otherwise `split-not-exact`. Every key keeps its place (D30.7).
 */
function splitHalves(
  found: TimelineClip,
  atUs: number,
  newClipId: string,
  clipId: string,
): { readonly first: DocumentObject; readonly second: DocumentObject } {
  const clip = found.clip;
  const startUs = numberField(clip, 'startUs', clipId);
  const durationUs = numberField(clip, 'durationUs', clipId);
  // A subtraction, never the sum, which need not be a safe integer (D42.2).
  const offsetUs = atUs - startUs;
  if (!(offsetUs > 0 && offsetUs < durationUs)) {
    throw outsideClip(
      clipId,
      `The time ${String(atUs)} µs does not lie strictly inside the lifetime`,
    );
  }
  if (isHeard(found) && offsetUs % SAMPLE_GRID_US !== 0) {
    const below = atUs - (offsetUs % SAMPLE_GRID_US);
    throw new EditorError(
      'split-not-exact',
      `The clip \`${clipId}\` is heard, and a split ${String(offsetUs)} µs after its start is not a whole number of samples; split it at a multiple of ${String(SAMPLE_GRID_US)} µs from its start, such as ${String(below)} or ${String(below + SAMPLE_GRID_US)} µs (D55.4).`,
    );
  }
  const restUs = durationUs - offsetUs;
  const source = hasSource(found)
    ? { sourceStartUs: numberField(clip, 'sourceStartUs', clipId) + offsetUs }
    : {};
  if (found.kind === 'audio') {
    const fadeInUs = numberField(clip, 'fadeInUs', clipId);
    const fadeOutUs = numberField(clip, 'fadeOutUs', clipId);
    if (fadeInUs > offsetUs || fadeOutUs > restUs) {
      throw new EditorError(
        'split-not-exact',
        `The time ${String(atUs)} µs lies inside a fade of the clip \`${clipId}\`; split it outside its fades (D55.4).`,
      );
    }
    return {
      first: { ...clip, durationUs: offsetUs, fadeOutUs: 0 },
      second: deepFreeze({
        ...copyNode(clip),
        id: newClipId,
        startUs: atUs,
        durationUs: restUs,
        ...source,
        fadeInUs: 0,
      }),
    };
  }
  if (phasesOf(clip).includes('out')) {
    throw new EditorError(
      'split-not-exact',
      `The text \`${clipId}\` has a text animation of phase out, which would end at the cut in the first half; change or remove it first (D69).`,
    );
  }
  return {
    first: { ...clip, durationUs: offsetUs },
    second: deepFreeze(
      renamedAnimations(
        entrancesAt(
          { ...copyNode(clip), id: newClipId, startUs: atUs, durationUs: restUs, ...source },
          startUs,
        ),
        newClipId,
      ),
    ),
  };
}

/** The phase kinds of a node's text animations, in their order (D69). */
function phasesOf(node: DocumentObject): readonly unknown[] {
  const textAnimations: unknown = node['textAnimations'];
  if (!Array.isArray(textAnimations)) return [];
  return (textAnimations as readonly unknown[]).map((animation) =>
    isObject(animation) && isObject(animation['phase']) ? animation['phase']['kind'] : undefined,
  );
}

/**
 * A node's text animations of phase in as accents at `startUs`, the scene time
 * they started at: the second half of a split plays them exactly as the whole
 * did (D55.3, D69). Every key keeps its place.
 */
function entrancesAt(node: DocumentObject, startUs: number): DocumentObject {
  const textAnimations: unknown = node['textAnimations'];
  if (!Array.isArray(textAnimations)) return node;
  return {
    ...node,
    textAnimations: (textAnimations as readonly unknown[]).map((animation) =>
      isObject(animation) && isObject(animation['phase']) && animation['phase']['kind'] === 'in'
        ? { ...animation, phase: { kind: 'accent', startUs } }
        : animation,
    ),
  };
}

/** The IDs a clip holds: a node's subtree (D39.4), or the audio clip's own. */
function clipIds(found: TimelineClip, clip: DocumentObject): readonly string[] {
  if (found.kind === 'node') return subtreeIds(clip);
  const id: unknown = clip['id'];
  return typeof id === 'string' ? [id] : [];
}

// The type argument makes the literal itself a `Definitions`: a missing entry and
// an entry for a type outside the union both fail compilation.
const DEFINITIONS = deepFreeze<Definitions>({
  SetNodePosition: {
    parse: parseSetNodePosition,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        const position = node['position'];
        if (!isObject(position)) {
          throw new EditorError(
            'unsupported-node',
            `The node \`${command.nodeId}\` has no position; it cannot be moved.`,
          );
        }
        const previous: CommandPosition = {
          x: coordinate(position, 'x', command.nodeId),
          y: coordinate(position, 'y', command.nodeId),
        };
        if (previous.x === command.position.x && previous.y === command.position.y) return null;
        return {
          // Spreading the originals keeps every existing field in its place (D30.7).
          node: {
            ...node,
            position: { ...position, x: command.position.x, y: command.position.y },
          },
          inverse: parseSetNodePosition({ ...command, position: previous }),
        };
      }),
  },
  SetNodeOpacity: {
    parse: parseSetNodeOpacity,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        const opacity: unknown = node['opacity'];
        if (typeof opacity !== 'number' || !Number.isFinite(opacity)) {
          throw new EditorError(
            'unsupported-node',
            `The node \`${command.nodeId}\` has no opacity; it cannot be faded.`,
          );
        }
        if (opacity === command.opacity) return null;
        return {
          node: { ...node, opacity: command.opacity },
          inverse: parseSetNodeOpacity({ ...command, opacity }),
        };
      }),
  },
  SetTextContent: {
    parse: parseSetTextContent,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        const text: unknown = node['text'];
        if (typeof text !== 'string') {
          throw new EditorError(
            'unsupported-node',
            `The node \`${command.nodeId}\` is not a text node; it has no text to replace.`,
          );
        }
        if (text === command.text) return null;
        return {
          node: { ...node, text: command.text },
          inverse: parseSetTextContent({ ...command, text }),
        };
      }),
  },
  AddNode: {
    parse: parseAddNode,
    edit(document, command) {
      const parent = findParent(document, command.parentId);
      if (parent.kind === 'unknown') {
        throw new EditorError(
          'unknown-parent',
          `The document has no scene or node \`${command.parentId}\`.`,
        );
      }
      if (parent.kind === 'no-children') {
        throw new EditorError(
          'unsupported-node',
          `The node \`${command.parentId}\` has no children; it cannot take a node.`,
        );
      }
      if (command.index > parent.list.length) {
        throw outOfRange(command.index, parent.list.length, `\`${command.parentId}\``);
      }
      // The IDs are read before the schema has seen the node, only where they are
      // well formed; the full validation judges everything else (D39.3).
      const createdIds = subtreeIds(command.node);
      refuseTaken(document, createdIds);
      return {
        document: replaceList(
          document,
          parent.address,
          inserted(parent.list, command.index, command.node),
        ),
        // The node validated by now, so its `id` is an ID of the document's form.
        invert: () => parseRemoveNode({ type: 'RemoveNode', nodeId: command.node['id'] }),
        createdIds,
        removedIds: [],
      };
    },
  },
  RemoveNode: {
    parse: parseRemoveNode,
    edit(document, command) {
      const location = located(document, command.nodeId);
      // The snapshot is a frozen copy of the subtree as the document holds it now,
      // with every animation of the node and of its children (D39.5).
      const inverse = parseAddNode({
        type: 'AddNode',
        parentId: location.parentId,
        index: location.index,
        node: location.node,
      });
      return {
        document: replaceList(
          document,
          location.address,
          location.list.filter((_, at) => at !== location.index),
        ),
        invert: () => inverse,
        createdIds: [],
        removedIds: subtreeIds(location.node),
      };
    },
  },
  DuplicateNode: {
    parse: parseDuplicateNode,
    edit(document, command) {
      const location = located(document, command.nodeId);
      const copy = duplicated(location.node, command.newNodeId);
      const createdIds = subtreeIds(copy);
      refuseTaken(document, createdIds);
      return {
        // Directly after the source: the layer right above it (D39.2).
        document: replaceList(
          document,
          location.address,
          inserted(location.list, location.index + 1, copy),
        ),
        invert: () => parseRemoveNode({ type: 'RemoveNode', nodeId: command.newNodeId }),
        createdIds,
        removedIds: [],
      };
    },
  },
  ReorderNode: {
    parse: parseReorderNode,
    edit(document, command) {
      const location = located(document, command.nodeId);
      const last = location.list.length - 1;
      if (command.index > last) {
        throw outOfRange(command.index, last, `the list of \`${command.nodeId}\``);
      }
      if (command.index === location.index) return null;
      const without = location.list.filter((_, at) => at !== location.index);
      return {
        // The node itself moves, the same object (D30.7).
        document: replaceList(
          document,
          location.address,
          inserted(without, command.index, location.node),
        ),
        invert: () =>
          parseReorderNode({ type: 'ReorderNode', nodeId: command.nodeId, index: location.index }),
        createdIds: [],
        removedIds: [],
      };
    },
  },
  SetNodeScale: {
    parse: parseSetNodeScale,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        const scale = node['scale'];
        if (!isObject(scale)) {
          throw new EditorError('unsupported-node', `The node \`${command.nodeId}\` has no scale.`);
        }
        const previous = {
          x: numberField(scale, 'x', command.nodeId),
          y: numberField(scale, 'y', command.nodeId),
        };
        if (previous.x === command.scale.x && previous.y === command.scale.y) return null;
        return {
          node: { ...node, scale: { ...scale, x: command.scale.x, y: command.scale.y } },
          inverse: parseSetNodeScale({ ...command, scale: previous }),
        };
      }),
  },
  SetNodeSize: {
    parse: parseSetNodeSize,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        const width = numberField(node, 'width', command.nodeId);
        const height = numberField(node, 'height', command.nodeId);
        if (width === command.width && height === command.height) return null;
        return {
          node: { ...node, width: command.width, height: command.height },
          inverse: parseSetNodeSize({ ...command, width, height }),
        };
      }),
  },
  SetNodeColor: {
    parse: parseSetNodeColor,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        const color = stringField(node, 'color', command.nodeId);
        // The parser lowercased the colour: the comparison is after it (D40.1).
        if (color === command.color) return null;
        return {
          node: { ...node, color: command.color },
          inverse: parseSetNodeColor({ ...command, color }),
        };
      }),
  },
  SetTextFontSize: {
    parse: parseSetTextFontSize,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        const fontSize = numberField(node, 'fontSize', command.nodeId);
        if (fontSize === command.fontSize) return null;
        return {
          node: { ...node, fontSize: command.fontSize },
          inverse: parseSetTextFontSize({ ...command, fontSize }),
        };
      }),
  },
  SetTextFont: {
    parse: parseSetTextFont,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        const fontAssetId = stringField(node, 'fontAssetId', command.nodeId);
        requireAsset(document, command.fontAssetId, 'font');
        if (fontAssetId === command.fontAssetId) return null;
        return {
          node: { ...node, fontAssetId: command.fontAssetId },
          inverse: parseSetTextFont({ ...command, fontAssetId }),
        };
      }),
  },
  SetImageAsset: {
    parse: parseSetImageAsset,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        // A video has an asset too, of another type and through its own command (D50.6).
        requireType(node, ['image'], command.nodeId);
        const assetId = stringField(node, 'assetId', command.nodeId);
        // An image node shows an image, or an SVG drawing as an image (D74).
        requireAsset(document, command.assetId, ['image', 'svg']);
        if (assetId === command.assetId) return null;
        return {
          node: { ...node, assetId: command.assetId },
          inverse: parseSetImageAsset({ ...command, assetId }),
        };
      }),
  },
  AddAsset: {
    parse: parseAddAsset,
    edit(document, command) {
      const assets = assetsOf(document);
      if (command.index > assets.length) {
        throw outOfRange(command.index, assets.length, 'the assets');
      }
      const createdIds = [command.asset.id];
      refuseTaken(document, createdIds);
      return {
        document: replaceAssets(document, inserted(assets, command.index, command.asset)),
        invert: () => parseRemoveAsset({ type: 'RemoveAsset', assetId: command.asset.id }),
        createdIds,
        removedIds: [],
      };
    },
  },
  RemoveAsset: {
    parse: parseRemoveAsset,
    edit(document, command) {
      const found = locateAsset(document, command.assetId);
      if (found === null) throw unknownAsset(command.assetId);
      // A frozen copy of the asset at its index, so undo restores the same bytes (D40.3).
      const inverse = parseAddAsset({ type: 'AddAsset', asset: found.asset, index: found.index });
      const candidate = replaceAssets(
        document,
        assetsOf(document).filter((_, at) => at !== found.index),
      );
      return {
        document: candidate,
        invert: () => inverse,
        createdIds: [],
        removedIds: [command.assetId],
        // The validator finds every use; no list of reference fields here (D40.4).
        refine(errors) {
          const users = assetUsers(candidate, errors, command.assetId);
          if (users === null) return null;
          return new EditorError(
            'asset-in-use',
            `The asset \`${command.assetId}\` is still used; nothing was removed.`,
            users,
          );
        },
      };
    },
  },
  AddAnimation: {
    parse: parseAddAnimation,
    edit(document, command) {
      const location = locateNode(document, command.nodeId);
      if (location === null) throw unknownNode(command.nodeId);
      const animations: unknown = location.node['animations'];
      // Whether a node has animations is read from the node (D30.8).
      if (!Array.isArray(animations)) {
        throw new EditorError(
          'unsupported-node',
          `The node \`${command.nodeId}\` has no animations.`,
        );
      }
      const list = animations as readonly unknown[];
      if (command.index > list.length) {
        throw outOfRange(command.index, list.length, `the animations of \`${command.nodeId}\``);
      }
      // The ID and the property are read only where they are strings; every other
      // malformation is the validator's (D41.3).
      const id: unknown = command.animation['id'];
      const createdIds = typeof id === 'string' ? [id] : [];
      refuseTaken(document, createdIds);
      const property: unknown = command.animation['property'];
      const existing = list.find(
        (animation) =>
          typeof property === 'string' && isObject(animation) && animation['property'] === property,
      );
      if (isObject(existing)) {
        throw new EditorError(
          'duplicate-animation-target',
          `The node \`${command.nodeId}\` animates ${String(property)} already.`,
          [String(existing['id'])],
        );
      }
      return {
        document: replaceNode(document, command.nodeId, {
          ...location.node,
          animations: inserted(list, command.index, command.animation),
        }),
        // The animation validated by now, so its `id` is an ID of the document's form.
        invert: () => parseRemoveAnimation({ type: 'RemoveAnimation', animationId: id }),
        createdIds,
        removedIds: [],
      };
    },
  },
  RemoveAnimation: {
    parse: parseRemoveAnimation,
    edit(document, command) {
      const location = locatedAnimation(document, command.animationId);
      // A frozen copy of the whole animation at its node and index (D41.1).
      const inverse = parseAddAnimation({
        type: 'AddAnimation',
        nodeId: location.ownerId,
        index: location.index,
        animation: location.animation,
      });
      return {
        document: replaceAnimation(document, location, null),
        invert: () => inverse,
        createdIds: [],
        removedIds: [command.animationId],
      };
    },
  },
  SetOpacityKeyframe: {
    parse: parseSetOpacityKeyframe,
    edit: (document, command) =>
      setKeyframe(document, command.animationId, 'opacity', command.timeUs, {
        equals: (stored) => stored === command.opacity,
        merged: () => command.opacity,
        fresh: command.opacity,
        previous: (stored) => parseSetOpacityKeyframe({ ...command, opacity: stored }),
      }),
  },
  SetPositionKeyframe: {
    parse: parseSetPositionKeyframe,
    edit: (document, command) =>
      setKeyframe(
        document,
        command.animationId,
        'position',
        command.timeUs,
        pairValue(command.offset, (offset) => parseSetPositionKeyframe({ ...command, offset })),
      ),
  },
  SetScaleKeyframe: {
    parse: parseSetScaleKeyframe,
    edit: (document, command) =>
      setKeyframe(
        document,
        command.animationId,
        'scale',
        command.timeUs,
        pairValue(command.factor, (factor) => parseSetScaleKeyframe({ ...command, factor })),
      ),
  },
  AddKeyframe: {
    parse: parseAddKeyframe,
    edit(document, command) {
      const location = locatedAnimation(document, command.animationId);
      const timeUs = Number(command.keyframe['timeUs']);
      const keyframes = keyframesOf(location.animation);
      if (keyframeIndex(keyframes, timeUs) >= 0) throw keyframeExists(command.animationId, timeUs);
      return {
        document: withKeyframes(
          document,
          location,
          placedByTime(keyframes, command.keyframe, timeUs),
        ),
        invert: () =>
          parseRemoveKeyframe({ type: 'RemoveKeyframe', animationId: command.animationId, timeUs }),
        createdIds: [],
        removedIds: [],
      };
    },
  },
  RemoveKeyframe: {
    parse: parseRemoveKeyframe,
    edit(document, command) {
      const location = locatedAnimation(document, command.animationId);
      const keyframes = keyframesOf(location.animation);
      const at = keyframeIndex(keyframes, command.timeUs);
      if (at < 0) throw unknownKeyframe(command.animationId, command.timeUs);
      // The minimum is the schema's, read for the animation's property (D41.4).
      const minimum = keyframeMinimum(compositionSchema, String(location.animation['property']));
      if (keyframes.length - 1 < minimum) {
        throw new EditorError(
          'too-few-keyframes',
          `The animation \`${command.animationId}\` would keep fewer than ${String(minimum)} keyframes; remove the animation instead.`,
          [command.animationId],
        );
      }
      // The exact keyframe, whatever the order of its keys, restores it (D41.3).
      const inverse = parseAddKeyframe({
        type: 'AddKeyframe',
        animationId: command.animationId,
        keyframe: keyframes[at],
      });
      return {
        document: withKeyframes(
          document,
          location,
          keyframes.filter((_, index) => index !== at),
        ),
        invert: () => inverse,
        createdIds: [],
        removedIds: [],
      };
    },
  },
  MoveKeyframe: {
    parse: parseMoveKeyframe,
    edit(document, command) {
      const location = locatedAnimation(document, command.animationId);
      const keyframes = keyframesOf(location.animation);
      const at = keyframeIndex(keyframes, command.timeUs);
      const keyframe = keyframes[at];
      if (!isObject(keyframe)) throw unknownKeyframe(command.animationId, command.timeUs);
      if (command.toTimeUs === command.timeUs) return null;
      if (keyframeIndex(keyframes, command.toTimeUs) >= 0) {
        throw keyframeExists(command.animationId, command.toTimeUs);
      }
      // A new keyframe object with its keys in their order; its value keeps its identity.
      const moved = { ...keyframe, timeUs: command.toTimeUs };
      const rest = keyframes.filter((_, index) => index !== at);
      return {
        document: withKeyframes(document, location, placedByTime(rest, moved, command.toTimeUs)),
        invert: () =>
          parseMoveKeyframe({
            type: 'MoveKeyframe',
            animationId: command.animationId,
            timeUs: command.toTimeUs,
            toTimeUs: command.timeUs,
          }),
        createdIds: [],
        removedIds: [],
      };
    },
  },
  SetKeyframeEasing: {
    parse: parseSetKeyframeEasing,
    edit(document, command) {
      const location = locatedAnimation(document, command.animationId);
      const keyframes = keyframesOf(location.animation);
      const at = keyframeIndex(keyframes, command.timeUs);
      const keyframe = keyframes[at];
      if (!isObject(keyframe)) throw unknownKeyframe(command.animationId, command.timeUs);
      const easing: unknown = keyframe['easing'];
      if (isObject(easing) && sameData(easing, command.easing)) return null;
      // A frozen copy of the easing as it was, so undo restores the same bytes (D30).
      const inverse = parseSetKeyframeEasing({ ...command, easing });
      return {
        document: withKeyframes(
          document,
          location,
          keyframes.map((stored, index) =>
            index === at ? { ...keyframe, easing: command.easing } : stored,
          ),
        ),
        invert: () => inverse,
        createdIds: [],
        removedIds: [],
      };
    },
  },
  SetKeyframeValue: {
    parse: parseSetKeyframeValue,
    edit(document, command) {
      const location = locatedAnimation(document, command.animationId);
      const property: unknown = location.animation['property'];
      const generic = GENERIC_KEYFRAME_PROPERTIES.find((row) => row === property);
      if (generic === undefined) {
        throw new EditorError(
          'use-typed-command',
          `The animation \`${command.animationId}\` animates ${String(property)}, whose keyframes are set by its own command.`,
        );
      }
      const value = normalizedKeyframeValue(generic, command.value);
      return setKeyframe(document, command.animationId, generic, command.timeUs, {
        equals: (stored) => sameData(stored, value),
        // An object is spread over the stored one, so its keys keep their order (D41.3).
        merged: (stored) => (isObject(stored) && isObject(value) ? { ...stored, ...value } : value),
        fresh: value,
        previous: (stored) =>
          parseSetKeyframeValue({ ...command, value: stored as KeyframeValueData }),
      });
    },
  },
  SetNodeLifetime: {
    parse: parseSetNodeLifetime,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        // Read from the node (D30.8): every node of schema 0.2 has both fields.
        const startUs = numberField(node, 'startUs', command.nodeId);
        const durationUs = numberField(node, 'durationUs', command.nodeId);
        if (startUs === command.startUs && durationUs === command.durationUs) return null;
        return {
          // The two keys keep their places, and every other value its identity (D42.10).
          node: { ...node, startUs: command.startUs, durationUs: command.durationUs },
          inverse: parseSetNodeLifetime({ ...command, startUs, durationUs }),
        };
      }),
  },
  SetNodeFit: {
    parse: parseSetNodeFit,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        requireType(node, ['image', 'video'], command.nodeId);
        const fit = stringField(node, 'fit', command.nodeId);
        if (fit === command.fit) return null;
        return {
          node: { ...node, fit: command.fit },
          inverse: parseSetNodeFit({ ...command, fit }),
        };
      }),
  },
  SetNodeFocus: {
    parse: parseSetNodeFocus,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        requireType(node, ['image', 'video'], command.nodeId);
        const focus = pointField(node, 'focus', command.nodeId);
        if (focus.x === command.focus.x && focus.y === command.focus.y) return null;
        return {
          // `focus` keeps its place, and every other value its identity (D42.10).
          node: { ...node, focus: command.focus },
          inverse: parseSetNodeFocus({ ...command, focus }),
        };
      }),
  },
  SetNodeRotation: {
    parse: parseSetNodeRotation,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        const rotation = numberField(node, 'rotation', command.nodeId);
        if (rotation === command.rotation) return null;
        return {
          node: { ...node, rotation: command.rotation },
          inverse: parseSetNodeRotation({ ...command, rotation }),
        };
      }),
  },
  SetNodeOrigin: {
    parse: parseSetNodeOrigin,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        const origin = pointField(node, 'origin', command.nodeId);
        if (origin.x === command.origin.x && origin.y === command.origin.y) return null;
        return {
          // The position is not touched: the origin moves nothing by itself (D68).
          node: { ...node, origin: command.origin },
          inverse: parseSetNodeOrigin({ ...command, origin }),
        };
      }),
  },
  SetNodeCrop: {
    parse: parseSetNodeCrop,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        requireType(node, ['image', 'video'], command.nodeId);
        const stored = node['crop'];
        if (!isObject(stored)) {
          throw new EditorError('unsupported-node', `The node \`${command.nodeId}\` has no crop.`);
        }
        const crop = {
          top: numberField(stored, 'top', command.nodeId),
          right: numberField(stored, 'right', command.nodeId),
          bottom: numberField(stored, 'bottom', command.nodeId),
          left: numberField(stored, 'left', command.nodeId),
        };
        if (sameData(crop, command.crop)) return null;
        return {
          node: { ...node, crop: command.crop },
          inverse: parseSetNodeCrop({ ...command, crop }),
        };
      }),
  },
  SetNodeCornerRadius: {
    parse: parseSetNodeCornerRadius,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        requireType(node, ['image', 'video'], command.nodeId);
        const cornerRadius = numberField(node, 'cornerRadius', command.nodeId);
        if (cornerRadius === command.cornerRadius) return null;
        return {
          node: { ...node, cornerRadius: command.cornerRadius },
          inverse: parseSetNodeCornerRadius({ ...command, cornerRadius }),
        };
      }),
  },
  SetVideoAsset: {
    parse: parseSetVideoAsset,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        requireType(node, ['video'], command.nodeId);
        const assetId = stringField(node, 'assetId', command.nodeId);
        requireAsset(document, command.assetId, 'video');
        if (assetId === command.assetId) return null;
        return {
          node: { ...node, assetId: command.assetId },
          inverse: parseSetVideoAsset({ ...command, assetId }),
        };
      }),
  },
  SetVideoSource: {
    parse: parseSetVideoSource,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        requireType(node, ['video'], command.nodeId);
        const sourceStartUs = numberField(node, 'sourceStartUs', command.nodeId);
        if (sourceStartUs === command.sourceStartUs) return null;
        return {
          node: { ...node, sourceStartUs: command.sourceStartUs },
          inverse: parseSetVideoSource({ ...command, sourceStartUs }),
        };
      }),
  },
  SetVideoVolume: {
    parse: parseSetVideoVolume,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        requireType(node, ['video'], command.nodeId);
        const volume = numberField(node, 'volume', command.nodeId);
        if (volume === command.volume) return null;
        return {
          node: { ...node, volume: command.volume },
          inverse: parseSetVideoVolume({ ...command, volume }),
        };
      }),
  },
  AddAudioClip: {
    parse: parseAddAudioClip,
    edit(document, command) {
      const clips = clipListOf(document, null);
      if (command.index > clips.length) {
        throw outOfRange(command.index, clips.length, 'the clips');
      }
      // The ID is read only where it is a string; every other malformation is the validator's.
      const id: unknown = command.clip['id'];
      const createdIds = typeof id === 'string' ? [id] : [];
      refuseTaken(document, createdIds);
      return {
        document: replaceClipList(document, null, inserted(clips, command.index, command.clip)),
        // The clip validated by now, so its `id` is an ID of the document's form.
        invert: () => parseRemoveAudioClip({ type: 'RemoveAudioClip', clipId: id }),
        createdIds,
        removedIds: [],
      };
    },
  },
  RemoveAudioClip: {
    parse: parseRemoveAudioClip,
    edit(document, command) {
      const found = locateClip(document, command.clipId);
      if (found === null) {
        throw new EditorError(
          'unknown-clip',
          `The document has no audio clip \`${command.clipId}\`.`,
        );
      }
      // A frozen copy of the whole clip at its index in its own list, so undo restores
      // the same bytes in the same place (D54.5).
      const scene = found.owner === null ? null : scenesOf(document)[found.owner.sceneIndex];
      const inverse =
        found.owner === null || !isObject(scene)
          ? parseAddAudioClip({ type: 'AddAudioClip', index: found.index, clip: found.clip })
          : parseAddSceneAudioClip({
              type: 'AddSceneAudioClip',
              sceneId: scene['id'],
              index: found.index,
              clip: found.clip,
            });
      return {
        document: replaceClipList(
          document,
          found.owner,
          clipListOf(document, found.owner).filter((_, at) => at !== found.index),
        ),
        invert: () => inverse,
        createdIds: [],
        removedIds: [command.clipId],
      };
    },
  },
  SetClipVolume: {
    parse: parseSetClipVolume,
    edit: (document, command) =>
      onClip(document, command.clipId, (clip) => {
        const volume = numberField(clip, 'volume', command.clipId);
        if (volume === command.volume) return null;
        return {
          clip: { ...clip, volume: command.volume },
          inverse: parseSetClipVolume({ ...command, volume }),
        };
      }),
  },
  SetClipFades: {
    parse: parseSetClipFades,
    edit: (document, command) =>
      onClip(document, command.clipId, (clip) => {
        const fadeInUs = numberField(clip, 'fadeInUs', command.clipId);
        const fadeOutUs = numberField(clip, 'fadeOutUs', command.clipId);
        if (fadeInUs === command.fadeInUs && fadeOutUs === command.fadeOutUs) return null;
        return {
          clip: { ...clip, fadeInUs: command.fadeInUs, fadeOutUs: command.fadeOutUs },
          inverse: parseSetClipFades({ ...command, fadeInUs, fadeOutUs }),
        };
      }),
  },
  SetClipSource: {
    parse: parseSetClipSource,
    edit: (document, command) =>
      onClip(document, command.clipId, (clip) => {
        const assetId = stringField(clip, 'assetId', command.clipId);
        const sourceStartUs = numberField(clip, 'sourceStartUs', command.clipId);
        requireAsset(document, command.assetId, 'audio');
        if (assetId === command.assetId && sourceStartUs === command.sourceStartUs) return null;
        return {
          clip: { ...clip, assetId: command.assetId, sourceStartUs: command.sourceStartUs },
          inverse: parseSetClipSource({ ...command, assetId, sourceStartUs }),
        };
      }),
  },
  AddScene: {
    parse: parseAddScene,
    edit(document, command) {
      const scenes = scenesOf(document);
      if (command.index > scenes.length) {
        throw outOfRange(command.index, scenes.length, 'the scenes');
      }
      const createdIds = sceneIds(command.scene);
      refuseTaken(document, createdIds);
      const id: unknown = command.scene['id'];
      return {
        document: withScenes(
          document,
          inserted(scenes, command.index, command.scene),
          sceneDuration(command.scene),
        ),
        // The scene validated by now, so its `id` is an ID of the document's form.
        invert: () => parseRemoveScene({ type: 'RemoveScene', sceneId: id }),
        createdIds,
        removedIds: [],
      };
    },
  },
  RemoveScene: {
    parse: parseRemoveScene,
    edit(document, command) {
      const found = locatedScene(document, command.sceneId);
      const scenes = scenesOf(document);
      if (scenes.length === 1) {
        throw new EditorError(
          'last-scene',
          `The scene \`${command.sceneId}\` is the only scene; a composition has at least one (D49.3).`,
        );
      }
      // A frozen copy of the whole scene at its index, so undo restores the same bytes (D30).
      const inverse = parseAddScene({ type: 'AddScene', index: found.index, scene: found.scene });
      return {
        document: withScenes(
          document,
          scenes.filter((_, at) => at !== found.index),
          -sceneDuration(found.scene),
        ),
        invert: () => inverse,
        createdIds: [],
        removedIds: sceneIds(found.scene),
      };
    },
  },
  DuplicateScene: {
    parse: parseDuplicateScene,
    edit(document, command) {
      const found = locatedScene(document, command.sceneId);
      const copy = duplicatedScene(found.scene, command.newSceneId);
      const createdIds = sceneIds(copy);
      refuseTaken(document, createdIds);
      return {
        // Directly after the source (D54.5).
        document: withScenes(
          document,
          inserted(scenesOf(document), found.index + 1, copy),
          sceneDuration(copy),
        ),
        invert: () => parseRemoveScene({ type: 'RemoveScene', sceneId: command.newSceneId }),
        createdIds,
        removedIds: [],
      };
    },
  },
  ReorderScene: {
    parse: parseReorderScene,
    edit(document, command) {
      const found = locatedScene(document, command.sceneId);
      const scenes = scenesOf(document);
      const last = scenes.length - 1;
      if (command.index > last) throw outOfRange(command.index, last, 'the scenes');
      if (command.index === found.index) return null;
      const without = scenes.filter((_, at) => at !== found.index);
      return {
        // The scene itself moves, the same object (D30.7); the sum of durations stays.
        document: replaceScenes(document, inserted(without, command.index, found.scene)),
        invert: () =>
          parseReorderScene({
            type: 'ReorderScene',
            sceneId: command.sceneId,
            index: found.index,
          }),
        createdIds: [],
        removedIds: [],
      };
    },
  },
  SetSceneDuration: {
    parse: parseSetSceneDuration,
    edit(document, command) {
      const found = locatedScene(document, command.sceneId);
      const durationUs = numberField(found.scene, 'durationUs', command.sceneId);
      if (durationUs === command.durationUs) return null;
      const scenes = scenesOf(document).map((scene, at) =>
        at === found.index ? { ...found.scene, durationUs: command.durationUs } : scene,
      );
      return {
        document: withScenes(document, scenes, command.durationUs - durationUs),
        invert: () => parseSetSceneDuration({ ...command, durationUs }),
        createdIds: [],
        removedIds: [],
      };
    },
  },
  MoveNodeToScene: {
    parse: parseMoveNodeToScene,
    edit(document, command) {
      const location = located(document, command.nodeId);
      if (location.address.groupIndex !== null) {
        throw new EditorError(
          'unsupported-node',
          `The node \`${command.nodeId}\` is a child of a group; it moves with its group (D49.3).`,
        );
      }
      const target = locatedScene(document, command.sceneId);
      const from = location.address.sceneIndex;
      const source = scenesOf(document)[from];
      const sourceId = isObject(source) ? source['id'] : undefined;
      const inverse = (): Command =>
        parseMoveNodeToScene({
          type: 'MoveNodeToScene',
          nodeId: command.nodeId,
          sceneId: sourceId,
          index: location.index,
        });
      const targetNodes = target.index === from ? location.list : listOf(target.scene);
      const last = target.index === from ? targetNodes.length - 1 : targetNodes.length;
      if (command.index > last) {
        throw outOfRange(command.index, last, `the nodes of \`${command.sceneId}\``);
      }
      if (target.index === from) {
        if (command.index === location.index) return null;
        const without = location.list.filter((_, at) => at !== location.index);
        return {
          document: replaceList(
            document,
            location.address,
            inserted(without, command.index, location.node),
          ),
          invert: inverse,
          createdIds: [],
          removedIds: [],
        };
      }
      // The node itself moves, the same object, with its scene times (D49.3, D30.7).
      const scenes = scenesOf(document).map((scene, at) => {
        if (!isObject(scene)) return scene;
        if (at === from) {
          return { ...scene, nodes: location.list.filter((_, index) => index !== location.index) };
        }
        if (at === target.index) {
          return { ...scene, nodes: inserted(targetNodes, command.index, location.node) };
        }
        return scene;
      });
      return {
        document: replaceScenes(document, scenes),
        invert: inverse,
        createdIds: [],
        removedIds: [],
      };
    },
  },
  AddSceneAudioClip: {
    parse: parseAddSceneAudioClip,
    edit(document, command) {
      const found = locatedScene(document, command.sceneId);
      const owner = { sceneIndex: found.index };
      const clips = clipListOf(document, owner);
      if (command.index > clips.length) {
        throw outOfRange(command.index, clips.length, `the clips of \`${command.sceneId}\``);
      }
      const id: unknown = command.clip['id'];
      const createdIds = typeof id === 'string' ? [id] : [];
      refuseTaken(document, createdIds);
      return {
        document: replaceClipList(document, owner, inserted(clips, command.index, command.clip)),
        invert: () => parseRemoveAudioClip({ type: 'RemoveAudioClip', clipId: id }),
        createdIds,
        removedIds: [],
      };
    },
  },
  MoveClip: {
    parse: parseMoveClip,
    edit(document, command) {
      const found = locatedClip(document, command.clipId);
      const startUs = numberField(found.clip, 'startUs', command.clipId);
      if (startUs === command.startUs) return null;
      const deltaUs = command.startUs - startUs;
      let clip: DocumentObject = { ...found.clip, startUs: command.startUs };
      if (found.kind === 'node') {
        // The content moves with the clip: its keyframes and words, and a group's children
        // with theirs (D55.3, D57.5).
        clip = shiftedWords(shiftedAnimations(clip, deltaUs), deltaUs);
        const children: unknown = clip['children'];
        if (Array.isArray(children)) {
          clip = {
            ...clip,
            children: (children as readonly unknown[]).map((child) => {
              if (!isObject(child)) return child;
              const childStart = numberField(child, 'startUs', String(child['id']));
              return shiftedAnimations({ ...child, startUs: childStart + deltaUs }, deltaUs);
            }),
          };
        }
      }
      return {
        document: withClip(document, found, clip),
        invert: () => parseMoveClip({ ...command, startUs }),
        createdIds: [],
        removedIds: [],
      };
    },
  },
  TrimClipStart: {
    parse: parseTrimClipStart,
    edit(document, command) {
      const found = locatedClip(document, command.clipId);
      const startUs = numberField(found.clip, 'startUs', command.clipId);
      const durationUs = numberField(found.clip, 'durationUs', command.clipId);
      if (startUs === command.startUs) return null;
      const deltaUs = command.startUs - startUs;
      if (deltaUs >= durationUs) {
        throw outsideClip(
          command.clipId,
          `A start at ${String(command.startUs)} µs leaves no duration`,
        );
      }
      let clip: DocumentObject = {
        ...found.clip,
        startUs: command.startUs,
        durationUs: durationUs - deltaUs,
      };
      if (hasSource(found)) {
        const sourceStartUs = numberField(found.clip, 'sourceStartUs', command.clipId);
        if (sourceStartUs + deltaUs < 0) {
          throw new EditorError(
            'source-range-exceeded',
            'The command would make a node or clip start before its source (D55.6).',
            [
              `${command.clipId}: would start ${String(-(sourceStartUs + deltaUs))} µs before its source`,
            ],
          );
        }
        clip = { ...clip, sourceStartUs: sourceStartUs + deltaUs };
      }
      return {
        document: withClip(document, found, clip),
        invert: () => parseTrimClipStart({ ...command, startUs }),
        createdIds: [],
        removedIds: [],
      };
    },
  },
  TrimClipEnd: {
    parse: parseTrimClipEnd,
    edit(document, command) {
      const found = locatedClip(document, command.clipId);
      const startUs = numberField(found.clip, 'startUs', command.clipId);
      const durationUs = numberField(found.clip, 'durationUs', command.clipId);
      const newDurationUs = command.endUs - startUs;
      if (newDurationUs <= 0) {
        throw outsideClip(
          command.clipId,
          `An end at ${String(command.endUs)} µs leaves no duration`,
        );
      }
      if (newDurationUs === durationUs) return null;
      // The inverse names the old end, which must itself be a time (D55.2).
      if (durationUs > Number.MAX_SAFE_INTEGER - startUs) {
        throw outsideClip(command.clipId, 'The end lies past the largest time and cannot be named');
      }
      const endUs = startUs + durationUs;
      return {
        document: withClip(document, found, { ...found.clip, durationUs: newDurationUs }),
        invert: () => parseTrimClipEnd({ ...command, endUs }),
        createdIds: [],
        removedIds: [],
      };
    },
  },
  SplitClip: {
    parse: parseSplitClip,
    edit(document, command) {
      const found = locatedClip(document, command.clipId);
      refuseGroup(found, command.clipId);
      const { first, second } = splitHalves(found, command.atUs, command.newClipId, command.clipId);
      const createdIds = clipIds(found, second);
      refuseTaken(document, createdIds);
      const items = found.items.map((item, at) => (at === found.index ? first : item));
      return {
        // The second half directly after the first: the layer right above it (D55.4).
        document: found.put(document, inserted(items, found.index + 1, second)),
        invert: () =>
          parseJoinClips({
            type: 'JoinClips',
            clipId: command.clipId,
            nextClipId: command.newClipId,
          }),
        createdIds,
        removedIds: [],
      };
    },
  },
  JoinClips: {
    parse: parseJoinClips,
    edit(document, command) {
      const found = locatedClip(document, command.clipId);
      const next = locatedClip(document, command.nextClipId);
      refuseGroup(found, command.clipId);
      const notJoinable = (why: string): EditorError =>
        new EditorError('clips-not-joinable', `The clip \`${command.nextClipId}\` ${why} (D55.5).`);
      if (next.list !== found.list || next.index !== found.index + 1) {
        throw notJoinable(`is not directly after \`${command.clipId}\` in the same list`);
      }
      const startUs = numberField(found.clip, 'startUs', command.clipId);
      const durationUs = numberField(found.clip, 'durationUs', command.clipId);
      const nextStartUs = numberField(next.clip, 'startUs', command.nextClipId);
      const nextDurationUs = numberField(next.clip, 'durationUs', command.nextClipId);
      if (nextStartUs - startUs !== durationUs) {
        throw notJoinable(`does not start where \`${command.clipId}\` ends`);
      }
      const joined: DocumentObject = {
        ...found.clip,
        durationUs: durationUs + nextDurationUs,
        ...(found.kind === 'audio'
          ? { fadeOutUs: numberField(next.clip, 'fadeOutUs', command.nextClipId) }
          : {}),
      };
      // Joined only when splitting the joined clip again gives both clips back,
      // byte for byte: then the inverse restores the document exactly (D55.5).
      let halves: ReturnType<typeof splitHalves>;
      try {
        halves = splitHalves(
          { ...found, clip: joined },
          nextStartUs,
          command.nextClipId,
          command.clipId,
        );
      } catch (reason) {
        if (reason instanceof EditorError)
          throw notJoinable(`cannot be split off again: ${reason.message}`);
        throw reason;
      }
      if (
        JSON.stringify(halves.first) !== JSON.stringify(found.clip) ||
        JSON.stringify(halves.second) !== JSON.stringify(next.clip)
      ) {
        throw notJoinable(`is not what a split of the joined clip would make`);
      }
      const items = found.items
        .filter((_, at) => at !== next.index)
        .map((item, at) => (at === found.index ? joined : item));
      return {
        document: found.put(document, items),
        invert: () =>
          parseSplitClip({
            type: 'SplitClip',
            clipId: command.clipId,
            atUs: nextStartUs,
            newClipId: command.nextClipId,
          }),
        createdIds: [],
        removedIds: clipIds(next, next.clip),
      };
    },
  },
  AddSceneTransition: {
    parse: parseAddSceneTransition,
    edit(document, command) {
      const transitions = transitionListOf(document, null);
      if (command.index > transitions.length) {
        throw outOfRange(command.index, transitions.length, 'the scene transitions');
      }
      const createdIds = transitionIds(command.transition);
      refuseTaken(document, createdIds);
      const id: unknown = command.transition['id'];
      return {
        // The incoming scene starts earlier by the transition's duration (D49.3, D56.2).
        document: withDuration(
          replaceTransitionList(
            document,
            null,
            inserted(transitions, command.index, command.transition),
          ),
          -transitionDuration(command.transition),
        ),
        // The transition validated by now, so its `id` is an ID of the document's form.
        invert: () => parseRemoveTransition({ type: 'RemoveTransition', transitionId: id }),
        createdIds,
        removedIds: [],
      };
    },
  },
  AddClipTransition: {
    parse: parseAddClipTransition,
    edit(document, command) {
      const found = locatedScene(document, command.sceneId);
      const owner = { sceneIndex: found.index };
      const transitions = transitionListOf(document, owner);
      if (command.index > transitions.length) {
        throw outOfRange(
          command.index,
          transitions.length,
          `the transitions of \`${command.sceneId}\``,
        );
      }
      const createdIds = transitionIds(command.transition);
      refuseTaken(document, createdIds);
      const id: unknown = command.transition['id'];
      return {
        document: replaceTransitionList(
          document,
          owner,
          inserted(transitions, command.index, command.transition),
        ),
        invert: () => parseRemoveTransition({ type: 'RemoveTransition', transitionId: id }),
        createdIds,
        removedIds: [],
      };
    },
  },
  RemoveTransition: {
    parse: parseRemoveTransition,
    edit(document, command) {
      const found = locatedTransition(document, command.transitionId);
      const scene = found.owner === null ? null : scenesOf(document)[found.owner.sceneIndex];
      // A frozen copy of the whole transition at its index in its own list, so undo
      // restores the same bytes in the same place (D30, D56.6).
      const inverse =
        found.owner === null || !isObject(scene)
          ? parseAddSceneTransition({
              type: 'AddSceneTransition',
              index: found.index,
              transition: found.transition,
            })
          : parseAddClipTransition({
              type: 'AddClipTransition',
              sceneId: scene['id'],
              index: found.index,
              transition: found.transition,
            });
      const removed = replaceTransitionList(
        document,
        found.owner,
        transitionListOf(document, found.owner).filter((_, at) => at !== found.index),
      );
      return {
        document:
          found.owner === null
            ? withDuration(removed, transitionDuration(found.transition))
            : removed,
        invert: () => inverse,
        createdIds: [],
        removedIds: [command.transitionId],
      };
    },
  },
  SetTransitionDuration: {
    parse: parseSetTransitionDuration,
    edit(document, command) {
      const found = locatedTransition(document, command.transitionId);
      const durationUs = numberField(found.transition, 'durationUs', command.transitionId);
      if (durationUs === command.durationUs) return null;
      const deltaUs = command.durationUs - durationUs;
      const transitions = transitionListOf(document, found.owner).map((transition, at) =>
        at === found.index ? { ...found.transition, durationUs: command.durationUs } : transition,
      );
      let edited = replaceTransitionList(document, found.owner, transitions);
      if (found.owner === null) {
        // Every later scene starts earlier by the change (D49.3, D56.2).
        edited = withDuration(edited, -deltaUs);
      } else {
        // The outgoing clip ends durationUs after the incoming one starts (D49.4, D56.6).
        const fromId = stringField(found.transition, 'fromNodeId', command.transitionId);
        const from = findNode(edited, fromId);
        if (from === null) throw unknownNode(fromId);
        const fromDuration = numberField(from, 'durationUs', fromId);
        edited = replaceNode(edited, fromId, { ...from, durationUs: fromDuration + deltaUs });
      }
      return {
        document: edited,
        invert: () => parseSetTransitionDuration({ ...command, durationUs }),
        createdIds: [],
        removedIds: [],
      };
    },
  },
  SetTransitionEffect: {
    parse: parseSetTransitionEffect,
    edit(document, command) {
      const found = locatedTransition(document, command.transitionId);
      const effect: unknown = found.transition['effect'];
      if (isObject(effect) && sameData(effect, command.effect)) return null;
      // A frozen copy of the effect as it was, so undo restores the same bytes (D30).
      const inverse = parseSetTransitionEffect({
        type: 'SetTransitionEffect',
        transitionId: command.transitionId,
        effect,
      });
      const transitions = transitionListOf(document, found.owner).map((transition, at) =>
        at === found.index ? { ...found.transition, effect: command.effect } : transition,
      );
      return {
        document: replaceTransitionList(document, found.owner, transitions),
        invert: () => inverse,
        createdIds: [],
        removedIds: [],
      };
    },
  },
  SetTransitionEasing: {
    parse: parseSetTransitionEasing,
    edit(document, command) {
      const found = locatedTransition(document, command.transitionId);
      const easing: unknown = found.transition['easing'];
      if (isObject(easing) && sameData(easing, command.easing)) return null;
      // A frozen copy of the easing as it was, so undo restores the same bytes (D30).
      const inverse = parseSetTransitionEasing({ ...command, easing });
      const transitions = transitionListOf(document, found.owner).map((transition, at) =>
        at === found.index ? { ...found.transition, easing: command.easing } : transition,
      );
      return {
        document: replaceTransitionList(document, found.owner, transitions),
        invert: () => inverse,
        createdIds: [],
        removedIds: [],
      };
    },
  },
  SetCaptionWords: {
    parse: parseSetCaptionWords,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        requireType(node, ['captions'], command.nodeId);
        const words = wordsOf(node);
        if (sameData(words, command.words)) return null;
        return {
          node: { ...node, words: command.words },
          // A frozen copy of the words as they were, so undo restores the same bytes (D30).
          inverse: parseSetCaptionWords({ type: 'SetCaptionWords', nodeId: command.nodeId, words }),
        };
      }),
  },
  SetCaptionWord: {
    parse: parseSetCaptionWord,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        requireType(node, ['captions'], command.nodeId);
        const words = wordsOf(node);
        const word = words[command.index];
        if (word === undefined) {
          throw outOfRange(command.index, words.length - 1, `the words of \`${command.nodeId}\``);
        }
        if (sameData(word, command.word)) return null;
        return {
          node: {
            ...node,
            words: words.map((item, at) => (at === command.index ? command.word : item)),
          },
          inverse: parseSetCaptionWord({ ...command, word }),
        };
      }),
  },
  SetCaptionStyle: {
    parse: parseSetCaptionStyle,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        requireType(node, ['captions'], command.nodeId);
        const style: unknown = node['style'];
        if (sameData(style, command.style)) return null;
        return {
          node: { ...node, style: command.style },
          inverse: parseSetCaptionStyle({ ...command, style }),
        };
      }),
  },
  SetTextStyle: {
    parse: parseSetTextStyle,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        requireType(node, ['text'], command.nodeId);
        const style: unknown = node['style'];
        if (sameData(style, command.style)) return null;
        return {
          node: { ...node, style: command.style },
          inverse: parseSetTextStyle({ ...command, style }),
        };
      }),
  },
  SetShapeGeometry: {
    parse: parseSetShapeGeometry,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        requireType(node, ['shape'], command.nodeId);
        const geometry: unknown = node['geometry'];
        if (sameData(geometry, command.geometry)) return null;
        return {
          node: { ...node, geometry: command.geometry },
          inverse: parseSetShapeGeometry({ ...command, geometry }),
        };
      }),
  },
  SetShapeFill: {
    parse: parseSetShapeFill,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        requireType(node, ['shape'], command.nodeId);
        const fill: unknown = node['fill'];
        if (sameData(fill, command.fill)) return null;
        return {
          node: { ...node, fill: command.fill },
          inverse: parseSetShapeFill({ ...command, fill }),
        };
      }),
  },
  SetShapeStroke: {
    parse: parseSetShapeStroke,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        requireType(node, ['shape'], command.nodeId);
        const stroke: unknown = node['stroke'];
        if (sameData(stroke, command.stroke)) return null;
        return {
          node: { ...node, stroke: command.stroke },
          inverse: parseSetShapeStroke({ ...command, stroke }),
        };
      }),
  },
  SetShapeTrim: {
    parse: parseSetShapeTrim,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        requireType(node, ['shape'], command.nodeId);
        const stored = node['trim'];
        if (!isObject(stored)) {
          throw new EditorError('unsupported-node', `The node \`${command.nodeId}\` has no trim.`);
        }
        const trim = {
          start: numberField(stored, 'start', command.nodeId),
          end: numberField(stored, 'end', command.nodeId),
        };
        if (sameData(trim, command.trim)) return null;
        return {
          node: { ...node, trim: command.trim },
          inverse: parseSetShapeTrim({ ...command, trim }),
        };
      }),
  },
  SetBlendMode: {
    parse: parseSetBlendMode,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        requireType(node, COMPOSITED_TYPES, command.nodeId);
        const blendMode = stringField(node, 'blendMode', command.nodeId);
        if (blendMode === command.blendMode) return null;
        return {
          node: { ...node, blendMode: command.blendMode },
          inverse: parseSetBlendMode({ ...command, blendMode }),
        };
      }),
  },
  SetNodeMask: {
    parse: parseSetNodeMask,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        requireType(node, COMPOSITED_TYPES, command.nodeId);
        const mask: unknown = node['mask'];
        if (sameData(mask, command.mask)) return null;
        return {
          node: { ...node, mask: command.mask },
          inverse: parseSetNodeMask({ ...command, mask }),
        };
      }),
  },
  SetNodeMatte: {
    parse: parseSetNodeMatte,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        requireType(node, COMPOSITED_TYPES, command.nodeId);
        const matte: unknown = node['matte'];
        if (sameData(matte, command.matte)) return null;
        return {
          node: { ...node, matte: command.matte },
          inverse: parseSetNodeMatte({ ...command, matte }),
        };
      }),
  },
  AddTextAnimation: {
    parse: parseAddTextAnimation,
    edit(document, command) {
      const location = locateNode(document, command.nodeId);
      if (location === null) throw unknownNode(command.nodeId);
      requireType(location.node, ['text'], command.nodeId);
      const textAnimations: unknown = location.node['textAnimations'];
      if (!Array.isArray(textAnimations)) {
        throw new EditorError(
          'unsupported-node',
          `The node \`${command.nodeId}\` has no text animations.`,
        );
      }
      const list = textAnimations as readonly unknown[];
      if (command.index > list.length) {
        throw outOfRange(
          command.index,
          list.length,
          `the text animations of \`${command.nodeId}\``,
        );
      }
      // The ID is read only where it is a string; every other malformation is the
      // validator's (D41.3).
      const id: unknown = command.animation['id'];
      const createdIds = typeof id === 'string' ? [id] : [];
      refuseTaken(document, createdIds);
      return {
        document: replaceNode(document, command.nodeId, {
          ...location.node,
          textAnimations: inserted(list, command.index, command.animation),
        }),
        // The animation validated by now, so its `id` is an ID of the document's form.
        invert: () =>
          parseRemoveTextAnimation({ type: 'RemoveTextAnimation', textAnimationId: id }),
        createdIds,
        removedIds: [],
      };
    },
  },
  RemoveTextAnimation: {
    parse: parseRemoveTextAnimation,
    edit(document, command) {
      const location = locatedTextAnimation(document, command.textAnimationId);
      // A frozen copy of the whole text animation at its node and index.
      const inverse = parseAddTextAnimation({
        type: 'AddTextAnimation',
        nodeId: location.ownerId,
        index: location.index,
        animation: location.animation,
      });
      return {
        document: replaceTextAnimation(document, location, null),
        invert: () => inverse,
        createdIds: [],
        removedIds: [command.textAnimationId],
      };
    },
  },
  SetTextAnimation: {
    parse: parseSetTextAnimation,
    edit(document, command) {
      const id: unknown = command.animation['id'];
      const location = locatedTextAnimation(document, typeof id === 'string' ? id : '');
      if (sameData(location.animation, command.animation)) return null;
      const inverse = parseSetTextAnimation({
        type: 'SetTextAnimation',
        animation: location.animation,
      });
      return {
        document: replaceTextAnimation(document, location, command.animation),
        invert: () => inverse,
        createdIds: [],
        removedIds: [],
      };
    },
  },
  SetCaptionHighlight: {
    parse: parseSetCaptionHighlight,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        requireType(node, ['captions'], command.nodeId);
        const style = captionStyleOf(node);
        const highlight: unknown = style['highlight'];
        if (sameData(highlight, command.highlight)) return null;
        return {
          // The highlight keeps its place in the style (D30.7).
          node: { ...node, style: { ...style, highlight: command.highlight } },
          inverse: parseSetCaptionHighlight({ ...command, highlight }),
        };
      }),
  },
  SetCaptionPageAnimation: {
    parse: parseSetCaptionPageAnimation,
    edit: (document, command) =>
      onNode(document, command.nodeId, (node) => {
        requireType(node, ['captions'], command.nodeId);
        const style = captionStyleOf(node);
        const key = command.phase === 'in' ? 'pageIn' : 'pageOut';
        const animation: unknown = style[key];
        if (sameData(animation, command.animation)) return null;
        return {
          node: { ...node, style: { ...style, [key]: command.animation } },
          inverse: parseSetCaptionPageAnimation({ ...command, animation }),
        };
      }),
  },
  AddEffect: {
    parse: parseAddEffect,
    edit(document, command) {
      // A scene or a node: IDs are unique across the document (D16).
      const scene = locateScene(document, command.ownerId);
      let owner: { owner: DocumentObject; ownerId: string; sceneIndex: number | null };
      if (scene !== null) {
        owner = { owner: scene.scene, ownerId: command.ownerId, sceneIndex: scene.index };
      } else {
        const location = locateNode(document, command.ownerId);
        if (location === null) {
          throw new EditorError(
            'unknown-node',
            `The document has no node or scene \`${command.ownerId}\`.`,
          );
        }
        requireType(location.node, EFFECT_OWNERS, command.ownerId);
        owner = { owner: location.node, ownerId: command.ownerId, sceneIndex: null };
      }
      const effects: unknown = owner.owner['effects'];
      if (!Array.isArray(effects)) {
        throw new EditorError('unsupported-node', `\`${command.ownerId}\` has no effects.`);
      }
      const list = effects as readonly unknown[];
      if (command.index > list.length) {
        throw outOfRange(command.index, list.length, `the effects of \`${command.ownerId}\``);
      }
      // The IDs are read only where they are strings; every other malformation is the
      // validator's (D41.3).
      const createdIds = effectsIds({ effects: [command.effect] });
      refuseTaken(document, createdIds);
      const id: unknown = command.effect['id'];
      return {
        document: replaceEffects(document, owner, inserted(list, command.index, command.effect)),
        // The effect validated by now, so its `id` is an ID of the document's form.
        invert: () => parseRemoveEffect({ type: 'RemoveEffect', effectId: id }),
        createdIds,
        removedIds: [],
      };
    },
  },
  RemoveEffect: {
    parse: parseRemoveEffect,
    edit(document, command) {
      const location = locatedEffect(document, command.effectId);
      // A frozen copy of the whole effect at its owner and index.
      const inverse = parseAddEffect({
        type: 'AddEffect',
        ownerId: location.ownerId,
        index: location.index,
        effect: location.effect,
      });
      return {
        document: replaceEffects(
          document,
          location,
          location.effects.filter((_, at) => at !== location.index),
        ),
        invert: () => inverse,
        createdIds: [],
        removedIds: effectsIds({ effects: [location.effect] }),
      };
    },
  },
  ReorderEffect: {
    parse: parseReorderEffect,
    edit(document, command) {
      const location = locatedEffect(document, command.effectId);
      const last = location.effects.length - 1;
      if (command.index > last) {
        throw outOfRange(command.index, last, `the effects of \`${location.ownerId}\``);
      }
      if (command.index === location.index) return null;
      const without = location.effects.filter((_, at) => at !== location.index);
      const inverse = parseReorderEffect({
        type: 'ReorderEffect',
        effectId: command.effectId,
        index: location.index,
      });
      return {
        document: replaceEffects(
          document,
          location,
          inserted(without, command.index, location.effect),
        ),
        invert: () => inverse,
        createdIds: [],
        removedIds: [],
      };
    },
  },
  SetEffect: {
    parse: parseSetEffect,
    edit(document, command) {
      const id: unknown = command.effect['id'];
      const location = locatedEffect(document, typeof id === 'string' ? id : '');
      if (sameData(location.effect, command.effect)) return null;
      // The IDs of animations the new effect adds, and of those it drops (D16).
      const before = effectsIds({ effects: [location.effect] });
      const after = effectsIds({ effects: [command.effect] });
      const createdIds = after.filter((item) => !before.includes(item));
      refuseTaken(document, createdIds);
      const inverse = parseSetEffect({ type: 'SetEffect', effect: location.effect });
      return {
        document: replaceEffects(
          document,
          location,
          location.effects.map((item, at) => (at === location.index ? command.effect : item)),
        ),
        invert: () => inverse,
        createdIds,
        removedIds: before.filter((item) => !after.includes(item)),
      };
    },
  },
  SetSafeArea: {
    parse: parseSetSafeArea,
    edit(document, command) {
      const safeArea: unknown = document['safeArea'];
      if (sameData(safeArea, command.safeArea)) return null;
      const inverse = parseSetSafeArea({ type: 'SetSafeArea', safeArea });
      return {
        // The safe area keeps its place in the document (D30.7).
        document: { ...document, safeArea: command.safeArea },
        invert: () => inverse,
        createdIds: [],
        removedIds: [],
      };
    },
  },
  AddTemplateInput: {
    parse: parseAddTemplateInput,
    edit(document, command) {
      const template = templateOf(document);
      const inputs = templateList(template, 'inputs');
      if (command.index > inputs.length) {
        throw outOfRange(command.index, inputs.length, "the template's inputs");
      }
      const id: unknown = command.input['id'];
      const createdIds = typeof id === 'string' ? [id] : [];
      refuseTaken(document, createdIds);
      return {
        document: withTemplate(document, {
          ...template,
          inputs: inserted(inputs, command.index, command.input),
        }),
        // The input validated by now, so its `id` is an ID of the document's form.
        invert: () => parseRemoveTemplateInput({ type: 'RemoveTemplateInput', inputId: id }),
        createdIds,
        removedIds: [],
      };
    },
  },
  RemoveTemplateInput: {
    parse: parseRemoveTemplateInput,
    edit(document, command) {
      const template = templateOf(document);
      const inputs = templateList(template, 'inputs');
      const index = inputs.findIndex((input) => isObject(input) && input['id'] === command.inputId);
      const input = inputs[index];
      if (!isObject(input)) throw unknownInput(command.inputId);
      // A frozen copy of the input at its index, so undo restores the same bytes (D30).
      const inverse = parseAddTemplateInput({ type: 'AddTemplateInput', index, input });
      return {
        document: withTemplate(document, {
          ...template,
          inputs: inputs.filter((_, at) => at !== index),
        }),
        invert: () => inverse,
        createdIds: [],
        removedIds: [command.inputId],
        // Its bindings and placeholders name it no longer (D58.6).
        refine(errors) {
          const users = bindingsAt(document, errors, ['unresolved-input-reference']);
          if (users.length === 0) return null;
          return new EditorError(
            'input-in-use',
            `The input \`${command.inputId}\` is still bound; remove its bindings first, in the same transaction (D58.6).`,
            users,
          );
        },
      };
    },
  },
  SetTemplateInput: {
    parse: parseSetTemplateInput,
    edit(document, command) {
      const template = templateOf(document);
      const inputs = templateList(template, 'inputs');
      const index = inputs.findIndex((input) => isObject(input) && input['id'] === command.inputId);
      const input = inputs[index];
      if (!isObject(input)) throw unknownInput(command.inputId);
      // The tool's schema cannot state it, so the bus judges it as it judges the document.
      if (command.input['id'] !== command.inputId) {
        throw new EditorError(
          'invalid-result',
          '`input.id` must be `inputId`: an input keeps its ID; remove it and add another to rename it (D58.6).',
          [`/template/inputs/${String(index)}/id`],
        );
      }
      if (sameData(input, command.input)) return null;
      const inverse = parseSetTemplateInput({ ...command, input });
      // Every property and asset bound to the input takes its new default (D58.3).
      const fallback: unknown = command.input['default'];
      let edited: DocumentObject = withTemplate(document, {
        ...template,
        inputs: inputs.map((item, at) => (at === index ? command.input : item)),
      });
      for (const binding of templateList(template, 'bindings')) {
        if (!isObject(binding) || binding['inputId'] !== command.inputId) continue;
        if (binding['kind'] === 'property') {
          const nodeId = binding['nodeId'];
          const property = binding['property'];
          if (typeof nodeId !== 'string' || typeof property !== 'string') continue;
          const node = findNode(edited, nodeId);
          if (node !== null)
            edited = replaceNode(edited, nodeId, { ...node, [property]: fallback });
        } else if (binding['kind'] === 'asset') {
          const assetId = binding['assetId'];
          if (typeof assetId !== 'string') continue;
          edited = replaceAssets(
            edited,
            assetsOf(edited).map((asset) =>
              isObject(asset) && asset['id'] === assetId
                ? { ...asset, contentHash: fallback }
                : asset,
            ),
          );
        }
      }
      return { document: edited, invert: () => inverse, createdIds: [], removedIds: [] };
    },
  },
  AddTemplateBinding: {
    parse: parseAddTemplateBinding,
    edit(document, command) {
      const template = templateOf(document);
      const bindings = templateList(template, 'bindings');
      if (command.index > bindings.length) {
        throw outOfRange(command.index, bindings.length, "the template's bindings");
      }
      const id: unknown = command.binding['id'];
      const createdIds = typeof id === 'string' ? [id] : [];
      refuseTaken(document, createdIds);
      return {
        document: withTemplate(document, {
          ...template,
          bindings: inserted(bindings, command.index, command.binding),
        }),
        invert: () => parseRemoveTemplateBinding({ type: 'RemoveTemplateBinding', bindingId: id }),
        createdIds,
        removedIds: [],
      };
    },
  },
  RemoveTemplateBinding: {
    parse: parseRemoveTemplateBinding,
    edit(document, command) {
      const template = templateOf(document);
      const bindings = templateList(template, 'bindings');
      const index = bindings.findIndex(
        (binding) => isObject(binding) && binding['id'] === command.bindingId,
      );
      const binding = bindings[index];
      if (!isObject(binding)) {
        throw new EditorError(
          'unknown-binding',
          `The template has no binding \`${command.bindingId}\`.`,
        );
      }
      const inverse = parseAddTemplateBinding({ type: 'AddTemplateBinding', index, binding });
      return {
        document: withTemplate(document, {
          ...template,
          bindings: bindings.filter((_, at) => at !== index),
        }),
        invert: () => inverse,
        createdIds: [],
        removedIds: [command.bindingId],
      };
    },
  },
  AddTemplateCondition: {
    parse: parseAddTemplateCondition,
    edit(document, command) {
      const template = templateOf(document);
      const conditions = templateList(template, 'conditions');
      if (command.index > conditions.length) {
        throw outOfRange(command.index, conditions.length, "the template's conditions");
      }
      const id: unknown = command.condition['id'];
      const createdIds = typeof id === 'string' ? [id] : [];
      refuseTaken(document, createdIds);
      return {
        document: withTemplate(document, {
          ...template,
          conditions: inserted(conditions, command.index, command.condition),
        }),
        // The condition validated by now, so its `id` is an ID of the document's form.
        invert: () =>
          parseRemoveTemplateCondition({ type: 'RemoveTemplateCondition', conditionId: id }),
        createdIds,
        removedIds: [],
      };
    },
  },
  RemoveTemplateCondition: {
    parse: parseRemoveTemplateCondition,
    edit(document, command) {
      const template = templateOf(document);
      const conditions = templateList(template, 'conditions');
      const index = conditions.findIndex(
        (entry) => isObject(entry) && entry['id'] === command.conditionId,
      );
      const entry = conditions[index];
      if (!isObject(entry)) {
        throw new EditorError(
          'unknown-condition',
          `The template has no condition \`${command.conditionId}\`.`,
        );
      }
      // A frozen copy of the condition at its index, so undo restores the same bytes (D30).
      const inverse = parseAddTemplateCondition({
        type: 'AddTemplateCondition',
        index,
        condition: entry,
      });
      return {
        document: withTemplate(document, {
          ...template,
          conditions: conditions.filter((_, at) => at !== index),
        }),
        invert: () => inverse,
        createdIds: [],
        removedIds: [command.conditionId],
      };
    },
  },
  AddTemplateRepeat: {
    parse: parseAddTemplateRepeat,
    edit(document, command) {
      const template = templateOf(document);
      const repeats = templateList(template, 'repeats');
      if (command.index > repeats.length) {
        throw outOfRange(command.index, repeats.length, "the template's repeats");
      }
      const id: unknown = command.repeat['id'];
      const createdIds = typeof id === 'string' ? [id] : [];
      refuseTaken(document, createdIds);
      return {
        document: withTemplate(document, {
          ...template,
          repeats: inserted(repeats, command.index, command.repeat),
        }),
        // The repeat validated by now, so its `id` is an ID of the document's form.
        invert: () => parseRemoveTemplateRepeat({ type: 'RemoveTemplateRepeat', repeatId: id }),
        createdIds,
        removedIds: [],
      };
    },
  },
  RemoveTemplateRepeat: {
    parse: parseRemoveTemplateRepeat,
    edit(document, command) {
      const template = templateOf(document);
      const repeats = templateList(template, 'repeats');
      const index = repeats.findIndex(
        (entry) => isObject(entry) && entry['id'] === command.repeatId,
      );
      const entry = repeats[index];
      if (!isObject(entry)) {
        throw new EditorError(
          'unknown-repeat',
          `The template has no repeat \`${command.repeatId}\`.`,
        );
      }
      // A frozen copy of the repeat at its index, so undo restores the same bytes (D30).
      const inverse = parseAddTemplateRepeat({ type: 'AddTemplateRepeat', index, repeat: entry });
      return {
        document: withTemplate(document, {
          ...template,
          repeats: repeats.filter((_, at) => at !== index),
        }),
        invert: () => inverse,
        createdIds: [],
        removedIds: [command.repeatId],
      };
    },
  },
});

/** The template section of a document (D58, D59): its inputs, bindings, conditions, and repeats. */
function templateOf(document: DocumentObject): DocumentObject {
  const template: unknown = document['template'];
  return isObject(template) ? template : { inputs: [], bindings: [], conditions: [], repeats: [] };
}

/** One list of a template section, in its order. */
function templateList(
  template: DocumentObject,
  key: 'inputs' | 'bindings' | 'conditions' | 'repeats',
): readonly unknown[] {
  const list: unknown = template[key];
  return Array.isArray(list) ? (list as readonly unknown[]) : [];
}

/** The document with `template` as its template section; every key keeps its place (D30.7). */
function withTemplate(document: DocumentObject, template: DocumentObject): DocumentObject {
  return { ...document, template };
}

function unknownInput(inputId: string): EditorError {
  return new EditorError('unknown-input', `The template has no input \`${inputId}\`.`);
}

/**
 * The IDs of the bindings, conditions, and repeats whose validation errors
 * have one of `codes`, sorted, read from the paths of the errors under
 * `/template/<list>/<index>` of the document they belong to (D58.6, D59.6).
 */
export function bindingsAt(
  document: object,
  errors: readonly ValidationFinding[],
  codes: readonly string[],
): readonly string[] {
  const template = templateOf(document as DocumentObject);
  const ids = new Set<string>();
  for (const { code, path } of errors) {
    if (!codes.includes(code)) continue;
    const tokens = path.split('/');
    const list = tokens[2];
    if (
      tokens[1] !== 'template' ||
      (list !== 'bindings' && list !== 'conditions' && list !== 'repeats')
    ) {
      continue;
    }
    const entry = templateList(template, list)[Number(tokens[3])];
    if (isObject(entry) && typeof entry['id'] === 'string') ids.add(entry['id']);
  }
  return [...ids].sort();
}

/** The style of a captions node, as the document holds it (D57, D70). */
function captionStyleOf(node: DocumentObject): DocumentObject {
  const style: unknown = node['style'];
  return isObject(style) ? style : {};
}

/** The words of a captions node, as the document holds them (D57). */
function wordsOf(node: DocumentObject): readonly unknown[] {
  const words: unknown = node['words'];
  return Array.isArray(words) ? (words as readonly unknown[]) : [];
}

/** Whether two values hold the same data, key order included, so that no edit is an edit (D30.9). */
function sameData(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The nodes of a scene, as the document holds them. */
function listOf(scene: DocumentObject): readonly unknown[] {
  const nodes: unknown = scene['nodes'];
  return Array.isArray(nodes) ? (nodes as readonly unknown[]) : [];
}

/**
 * Every command type this build knows: the keys of the registry, in the order
 * its entries are written, so the list cannot omit or add a type the table does
 * not have (D38.1). The keys are the members of `Command['type']` exactly, which
 * the type of the table guarantees, hence the assertion. The list is frozen: a
 * caller that pushed a name onto it would make `parseCommand` accept a type the
 * build does not know (D31.8).
 */
export const COMMAND_TYPES: readonly Command['type'][] = Object.freeze(
  Object.keys(DEFINITIONS) as Command['type'][],
);

function isKnown(type: string): type is Command['type'] {
  return COMMAND_TYPES.some((known) => known === type);
}

/** The entry of one command, typed by that command (the table's type pairs them). */
function definitionOf<C extends Command>(command: C): CommandDefinition<C> {
  return DEFINITIONS[command.type] as unknown as CommandDefinition<C>;
}

/**
 * The single entry into a typed command (D30.3). Rejects a payload that is not
 * an object, a type it does not know, and fields that are not exactly those of
 * that command; normalises what the command normalises and freezes the result,
 * so a caller that keeps the object cannot reach into the history afterwards.
 * Parsing an already-parsed command returns an equal command.
 */
export function parseCommand(value: unknown): Command {
  if (!isPlainObject(value)) {
    throw new EditorError('invalid-argument', 'A command is not an object.');
  }
  const type: unknown = value['type'];
  if (typeof type !== 'string') {
    throw new EditorError('invalid-argument', 'A command has no string `type`.');
  }
  if (!isKnown(type)) {
    throw new EditorError('unknown-command', `This build knows no command \`${type}\`.`);
  }
  return DEFINITIONS[type].parse(value);
}

/** Applies a parsed command to a document through its entry. */
export function editDocument(document: DocumentObject, command: Command): DocumentEdit | null {
  return definitionOf(command).edit(document, command);
}

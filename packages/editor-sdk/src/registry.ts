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
  parseAddKeyframe,
  parseAddNode,
  parseDuplicateNode,
  parseMoveKeyframe,
  parseRemoveAnimation,
  parseRemoveAsset,
  parseRemoveKeyframe,
  parseRemoveNode,
  parseReorderNode,
  parseSetImageAsset,
  parseSetNodeColor,
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
  type Command,
  type CommandPosition,
  type NodeData,
} from './commands.js';
import {
  assetUsers,
  assetsOf,
  findNode,
  findParent,
  idsIn,
  isObject,
  keyframeIndex,
  keyframesOf,
  locateAnimation,
  locateNode,
  placedByTime,
  replaceAnimation,
  replaceAssets,
  replaceList,
  replaceNode,
  subtreeIds,
  type AnimationLocation,
  type DocumentObject,
  type NodeLocation,
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

/** A node's animations renamed after their owner: `<owner>-a-<property>` (D39.3). */
function renamedAnimations(owner: DocumentObject, ownerId: string): DocumentObject {
  const animations = owner['animations'];
  if (!Array.isArray(animations)) return owner;
  return {
    ...owner,
    animations: (animations as readonly unknown[]).map((animation) =>
      isObject(animation)
        ? { ...animation, id: `${ownerId}-a-${String(animation['property'])}` }
        : animation,
    ),
  };
}

/**
 * The copy of a subtree under the IDs D39.3 derives from `newNodeId`: the root
 * is `N`, the child at index i is `N-c<i>`, and each animation is its owner's ID
 * followed by `-a-<property>`. Only the `id` fields change; texts, HTML, and
 * every other value are copied as they are. Spreading keeps every key in place.
 */
function duplicated(source: DocumentObject, newNodeId: string): NodeData {
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
function requireAsset(document: DocumentObject, assetId: string, type: string): void {
  const found = locateAsset(document, assetId);
  if (found === null) throw unknownAsset(assetId);
  if (found.asset['type'] !== type) {
    throw new EditorError(
      'asset-type-mismatch',
      `The asset \`${assetId}\` is of type ${String(found.asset['type'])}, not ${type}.`,
    );
  }
}

/** The animation with that ID, or `unknown-animation` (D41.2). */
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
 * Sets, or inserts, the keyframe at `timeUs` of an animation of `property`
 * (D41.1). A replacement spreads the stored keyframe and merges into its value;
 * an insertion writes a new `{ timeUs, value }` at the place its time gives it.
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
  const inserted = { timeUs, value: value.fresh };
  return {
    document: withKeyframes(document, location, placedByTime(keyframes, inserted, timeUs)),
    invert: () => parseRemoveKeyframe({ type: 'RemoveKeyframe', animationId, timeUs }),
    createdIds: [],
    removedIds: [],
  };
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
        const assetId = stringField(node, 'assetId', command.nodeId);
        requireAsset(document, command.assetId, 'image');
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
});

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

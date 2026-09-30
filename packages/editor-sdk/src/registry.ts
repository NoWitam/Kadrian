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
import {
  copyNode,
  deepFreeze,
  isPlainObject,
  parseAddAsset,
  parseAddNode,
  parseDuplicateNode,
  parseRemoveAsset,
  parseRemoveNode,
  parseReorderNode,
  parseSetImageAsset,
  parseSetNodeColor,
  parseSetNodeOpacity,
  parseSetNodePosition,
  parseSetNodeScale,
  parseSetNodeSize,
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
  locateNode,
  replaceAssets,
  replaceList,
  replaceNode,
  subtreeIds,
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

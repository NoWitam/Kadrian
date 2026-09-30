/**
 * Finding a node in a composition and rebuilding the document around a new
 * version of it (D30.7). The document is treated as the JSON value it is: the
 * intermediate result of an edit is not a `Composition` and is not claimed to
 * be one — `applyCommand` hands it to `validateComposition`, which derives the
 * type again (D30.6).
 *
 * Only the path from the root to the edited node is rebuilt; every untouched
 * subtree, and every array that does not contain the node, stays the same
 * object. Objects are rebuilt by spreading the original, so a field that
 * already exists keeps its place and the key order of the input survives.
 */

/** A JSON object of the document, as this module reads it. */
export type DocumentObject = Readonly<Record<string, unknown>>;

export function isObject(value: unknown): value is DocumentObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Any object read as a bag of unknown fields. Every document object is one;
 * `Composition` is a branded type that carries no index signature, so the view
 * is stated here once instead of at each use.
 */
export function fieldsOf(value: object): DocumentObject {
  return value as DocumentObject;
}

/** An array of unknown items, or `null`. `Array.isArray` alone widens to `any[]`. */
function asArray(value: unknown): readonly unknown[] | null {
  return Array.isArray(value) ? (value as readonly unknown[]) : null;
}

function objectsIn(value: unknown): readonly DocumentObject[] {
  return (asArray(value) ?? []).filter(isObject);
}

/** The node with that ID, searched scene by scene and into every group (D16). */
export function findNode(document: object, nodeId: string): DocumentObject | null {
  for (const scene of objectsIn(fieldsOf(document)['scenes'])) {
    for (const node of objectsIn(scene['nodes'])) {
      if (node['id'] === nodeId) return node;
      for (const child of objectsIn(node['children'])) {
        if (child['id'] === nodeId) return child;
      }
    }
  }
  return null;
}

/** The list with `replacement` in the place of the node with that ID, or `null` when absent. */
function replaceInList(
  nodes: readonly unknown[] | null,
  nodeId: string,
  replacement: DocumentObject,
): readonly unknown[] | null {
  if (nodes === null) return null;
  const at = nodes.findIndex((node) => isObject(node) && node['id'] === nodeId);
  if (at < 0) return null;
  // Every other element stays the same object; only this one is exchanged.
  return nodes.map((node, index) => (index === at ? replacement : node));
}

/** Whether a rebuilt list holds a different object anywhere; identity decides, not equality. */
function differs(rebuilt: readonly unknown[], original: readonly unknown[]): boolean {
  return rebuilt.some((item, at) => item !== original[at]);
}

/**
 * Where a list of nodes lives: the `nodes` of a scene, or the `children` of a
 * group in that scene (D16.4). Groups do not nest, so two indexes suffice.
 */
export interface ListAddress {
  readonly sceneIndex: number;
  /** The index of the group in the scene's `nodes`, or `null` for the scene's own list. */
  readonly groupIndex: number | null;
}

/** A node, the list that holds it, and its place there. */
export interface NodeLocation {
  readonly node: DocumentObject;
  readonly address: ListAddress;
  /** The ID of the list's owner: the scene or the group. */
  readonly parentId: string;
  readonly list: readonly unknown[];
  readonly index: number;
}

function idOf(value: DocumentObject): string {
  const id = value['id'];
  return typeof id === 'string' ? id : '';
}

/** The node with that ID and where it lives, searched as `findNode` searches. */
export function locateNode(document: object, nodeId: string): NodeLocation | null {
  const scenes = asArray(fieldsOf(document)['scenes']) ?? [];
  for (const [sceneIndex, scene] of scenes.entries()) {
    if (!isObject(scene)) continue;
    const nodes = asArray(scene['nodes']) ?? [];
    for (const [index, node] of nodes.entries()) {
      if (!isObject(node)) continue;
      if (node['id'] === nodeId) {
        const address = { sceneIndex, groupIndex: null };
        return { node, address, parentId: idOf(scene), list: nodes, index };
      }
      const children = asArray(node['children']) ?? [];
      for (const [childIndex, child] of children.entries()) {
        if (isObject(child) && child['id'] === nodeId) {
          const address = { sceneIndex, groupIndex: index };
          return { node: child, address, parentId: idOf(node), list: children, index: childIndex };
        }
      }
    }
  }
  return null;
}

/** A list that can take nodes: the scene with that ID, or a node with a `children` array. */
export type ParentLookup =
  | { readonly kind: 'list'; readonly address: ListAddress; readonly list: readonly unknown[] }
  | { readonly kind: 'no-children' }
  | { readonly kind: 'unknown' };

export function findParent(document: object, parentId: string): ParentLookup {
  const scenes = asArray(fieldsOf(document)['scenes']) ?? [];
  for (const [sceneIndex, scene] of scenes.entries()) {
    if (isObject(scene) && scene['id'] === parentId) {
      const address = { sceneIndex, groupIndex: null };
      return { kind: 'list', address, list: asArray(scene['nodes']) ?? [] };
    }
  }
  const location = locateNode(document, parentId);
  if (location === null) return { kind: 'unknown' };
  const children = asArray(location.node['children']);
  // Whether a node takes children is read from the node, not from its type (D30.8).
  if (children === null || location.address.groupIndex !== null) return { kind: 'no-children' };
  const address = { sceneIndex: location.address.sceneIndex, groupIndex: location.index };
  return { kind: 'list', address, list: children };
}

/**
 * The document with the list at `address` replaced by `list`. Every ancestor on
 * the path — the root, `scenes`, the scene, and for a group its list and the
 * group — is a new object; everything else keeps its identity (D30.7).
 */
export function replaceList(
  document: object,
  address: ListAddress,
  list: readonly unknown[],
): DocumentObject {
  const root = fieldsOf(document);
  const scenes = asArray(root['scenes']) ?? [];
  const scene = scenes[address.sceneIndex];
  if (!isObject(scene)) return root;
  let nodes: readonly unknown[] = list;
  if (address.groupIndex !== null) {
    const sceneNodes = asArray(scene['nodes']) ?? [];
    const group = sceneNodes[address.groupIndex];
    if (!isObject(group)) return root;
    const at = address.groupIndex;
    nodes = sceneNodes.map((node, index) => (index === at ? { ...group, children: list } : node));
  }
  const editedScene = { ...scene, nodes };
  return {
    ...root,
    scenes: scenes.map((item, index) => (index === address.sceneIndex ? editedScene : item)),
  };
}

/** Every string `id` anywhere in the document, whatever the entity (D16.3). */
export function idsIn(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value as readonly unknown[]) idsIn(item, into);
  } else if (isObject(value)) {
    for (const [name, child] of Object.entries(value)) {
      if (name === 'id' && typeof child === 'string') into.add(child);
      else idsIn(child, into);
    }
  }
  return into;
}

/**
 * The IDs a node's subtree carries, in the order D39.4 fixes: the node IDs in
 * preorder (the node, then its children in array order), then the animation IDs
 * grouped by owner in that same preorder, each owner's in array order. Reads
 * only a string `id` of the node, of the items of `children`, and of the items
 * of `animations`, and only where those are arrays of objects: any other shape
 * is left to the full validation (D39.3).
 */
export function subtreeIds(node: DocumentObject): readonly string[] {
  const owners = [node, ...objectsIn(node['children'])];
  const nodeIds = owners.map((owner) => owner['id']);
  const animationIds = owners.flatMap((owner) =>
    objectsIn(owner['animations']).map((animation) => animation['id']),
  );
  return [...nodeIds, ...animationIds].filter((id): id is string => typeof id === 'string');
}

/**
 * The document with `replacement` in the place of the node with that ID, or
 * the document itself when it has no such node.
 */
export function replaceNode(
  document: object,
  nodeId: string,
  replacement: DocumentObject,
): DocumentObject {
  const root = fieldsOf(document);
  const scenes = asArray(root['scenes']);
  if (scenes === null) return root;
  const edited = scenes.map((scene) => {
    if (!isObject(scene)) return scene;
    const nodes = asArray(scene['nodes']);
    if (nodes === null) return scene;
    const top = replaceInList(nodes, nodeId, replacement);
    if (top !== null) return { ...scene, nodes: top };
    const withChildren = nodes.map((node) => {
      if (!isObject(node)) return node;
      const children = replaceInList(asArray(node['children']), nodeId, replacement);
      return children === null ? node : { ...node, children };
    });
    return differs(withChildren, nodes) ? { ...scene, nodes: withChildren } : scene;
  });
  return differs(edited, scenes) ? { ...root, scenes: edited } : root;
}

/** The document's assets, in their order. */
export function assetsOf(document: object): readonly unknown[] {
  return asArray(fieldsOf(document)['assets']) ?? [];
}

/** The document with `assets` in place of its assets; everything else keeps its identity (D30.7). */
export function replaceAssets(document: object, assets: readonly unknown[]): DocumentObject {
  return { ...fieldsOf(document), assets };
}

/** The reference tokens of an RFC 6901 JSON Pointer, or `null` when it is not one. */
function tokensOf(path: string): string[] | null {
  if (!path.startsWith('/')) return null;
  return path
    .slice(1)
    .split('/')
    .map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'));
}

/** The object that holds the field a pointer names, and the field's value, or `null`. */
function fieldAt(document: object, path: string): { owner: DocumentObject; value: unknown } | null {
  const tokens = tokensOf(path);
  const name = tokens?.at(-1);
  if (tokens === null || name === undefined) return null;
  let current: unknown = document;
  for (const token of tokens.slice(0, -1)) {
    if (Array.isArray(current)) current = (current as readonly unknown[])[Number(token)];
    else if (isObject(current) && Object.prototype.hasOwnProperty.call(current, token)) {
      current = current[token];
    } else return null;
  }
  if (!isObject(current) || !Object.prototype.hasOwnProperty.call(current, name)) return null;
  return { owner: current, value: current[name] };
}

/** The structured part of a validation error that this module reads: its code and its path. */
export interface ValidationFinding {
  readonly code: string;
  readonly path: string;
}

/**
 * The users of an asset that a document no longer declares, read from the
 * validation of that document alone (D40.4): each error of the code
 * `unresolved-asset-reference` whose path holds `assetId` names a user, the
 * object that holds the field, by its `id`. Returns the users' IDs, each once and
 * sorted, when every error is such a use; `null` when any error is something
 * else, or a use whose holder has no ID. Knows no field name: a reference field
 * the validator checks is found whatever it is called.
 */
export function assetUsers(
  document: object,
  errors: readonly ValidationFinding[],
  assetId: string,
): readonly string[] | null {
  const users = new Set<string>();
  for (const { code, path } of errors) {
    if (code !== 'unresolved-asset-reference') return null;
    const field = fieldAt(document, path);
    if (field?.value !== assetId) return null;
    const user = field.owner['id'];
    if (typeof user !== 'string') return null;
    users.add(user);
  }
  return users.size === 0 ? null : [...users].sort();
}

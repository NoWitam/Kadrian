/**
 * Rules that JSON Schema cannot express (D16, D17). Runs only on a structurally
 * valid document. Errors are ordered by rule and then by position; the order
 * never depends on the key order of the input.
 *
 * The rules are those of schema 0.1 to 0.5 alike: a lifetime adds none
 * (D42.1), a video node adds only the reference to an asset of type video
 * (D50), which no earlier document can have, the fields an audio clip gains
 * in 0.4 add the rules of D52.3, which no earlier clip has the fields for, and
 * the scenes of 0.5 add the clips of a scene, checked as the composition's are,
 * and the rule that the composition lasts as long as its scenes (D54.2), which
 * no earlier scene has the fields for, and the transitions of 0.6 add the
 * rules of D56, which no earlier document has the field for, and subtract
 * their durations from that sum. `migrateComposition` applies them to
 * documents of 0.1 to 0.5 too (D35.4), which is why the document type is any
 * of the six versions'; the negative corpus of 0.1 is kept
 * and pins what they were. A rule that a later version changes gets its own
 * function, never a branch here.
 */
import { pointer, type ValidationError } from './errors.js';
import type { Asset, AudioClip, Composition, NodeAnimation, SceneNode } from './types.js';
// A type only: it is erased when the module is built, so the main entry reaches no
// historical module at run time (D42.8; `migration-entry.test.ts` walks the built output).
import type { CompositionV01 } from './v0-1/composition-schema.js';
import type { CompositionV02 } from './v0-2/composition-schema.js';
import type { CompositionV03 } from './v0-3/composition-schema.js';
import type { CompositionV04 } from './v0-4/composition-schema.js';
import type { CompositionV05 } from './v0-5/composition-schema.js';

/**
 * Generic on purpose: every `id` anywhere in the document takes part, so a new
 * kind of entity cannot be forgotten. Keys are visited in sorted order.
 */
function checkUniqueIds(
  value: unknown,
  path: string,
  seen: Set<string>,
  errors: ValidationError[],
): void {
  if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    items.forEach((item, index) => {
      checkUniqueIds(item, pointer(path, index), seen, errors);
    });
  } else if (typeof value === 'object' && value !== null) {
    for (const [name, child] of Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (name !== 'id' || typeof child !== 'string') {
        checkUniqueIds(child, pointer(path, name), seen, errors);
      } else if (seen.has(child)) {
        const message = `ID "${child}" is already used in this document.`;
        errors.push({ code: 'duplicate-id', path: pointer(path, name), message });
      } else {
        seen.add(child);
      }
    }
  }
}

function checkAnimations(
  animations: readonly NodeAnimation[],
  path: string,
  errors: ValidationError[],
): void {
  const animated = new Set<string>();
  animations.forEach((animation, index) => {
    const animationPath = pointer(path, index);
    if (animated.has(animation.property)) {
      const message = `Property "${animation.property}" of this node is already animated.`;
      errors.push({
        code: 'duplicate-animation-target',
        path: pointer(animationPath, 'property'),
        message,
      });
    }
    animated.add(animation.property);
    animation.keyframes.forEach((keyframe, keyframeIndex) => {
      const previous = animation.keyframes[keyframeIndex - 1];
      if (previous !== undefined && keyframe.timeUs <= previous.timeUs) {
        const keyframePath = pointer(pointer(animationPath, 'keyframes'), keyframeIndex);
        const message = 'Keyframe times must ascend strictly.';
        errors.push({
          code: 'keyframes-not-ascending',
          path: pointer(keyframePath, 'timeUs'),
          message,
        });
      }
    });
  });
}

export function validateSemantics(
  composition:
    | Composition
    | CompositionV01
    | CompositionV02
    | CompositionV03
    | CompositionV04
    | CompositionV05,
): ValidationError[] {
  const errors: ValidationError[] = [];
  checkUniqueIds(composition, '', new Set(), errors);

  const assets = new Map(composition.assets.map((asset) => [asset.id, asset]));
  const checkReference = (assetId: string, type: Asset['type'], path: string): void => {
    const asset = assets.get(assetId);
    if (asset === undefined) {
      const message = `No asset has the ID "${assetId}".`;
      errors.push({ code: 'unresolved-asset-reference', path, message });
    } else if (asset.type !== type) {
      const message = `Asset "${assetId}" is of type ${asset.type}, expected ${type}.`;
      errors.push({ code: 'asset-type-mismatch', path, message });
    }
  };
  const animationErrors: ValidationError[] = [];
  const sourceErrors: ValidationError[] = [];

  composition.scenes.forEach((scene, sceneIndex) => {
    const nodesPath = pointer(pointer(pointer('', 'scenes'), sceneIndex), 'nodes');
    scene.nodes.forEach((node, nodeIndex) => {
      const nodePath = pointer(nodesPath, nodeIndex);
      const members =
        node.type === 'group'
          ? node.children.map((child, childIndex) => ({
              node: child,
              path: pointer(pointer(nodePath, 'children'), childIndex),
            }))
          : [];
      for (const member of [{ node, path: nodePath }, ...members]) {
        if (member.node.type === 'image') {
          checkReference(member.node.assetId, 'image', pointer(member.path, 'assetId'));
        } else if (member.node.type === 'video') {
          checkReference(member.node.assetId, 'video', pointer(member.path, 'assetId'));
          // Every source time of the lifetime stays a safe integer (D50.2), so the
          // runtime never forms one that is not.
          if (member.node.sourceStartUs > Number.MAX_SAFE_INTEGER - member.node.durationUs + 1) {
            sourceErrors.push({
              code: 'source-time-out-of-range',
              path: pointer(member.path, 'sourceStartUs'),
              message: 'sourceStartUs + durationUs − 1 must be a safe integer.',
            });
          }
        } else if (member.node.type === 'text') {
          checkReference(member.node.fontAssetId, 'font', pointer(member.path, 'fontAssetId'));
        }
        if (member.node.type !== 'background') {
          const animationsPath = pointer(member.path, 'animations');
          checkAnimations(member.node.animations, animationsPath, animationErrors);
        }
      }
    });
  });
  const fadeErrors: ValidationError[] = [];
  const checkClip = (clip: AudioClip | CompositionV03['clips'][number], clipPath: string): void => {
    checkReference(clip.assetId, 'audio', pointer(clipPath, 'assetId'));
    // The fields of 0.4 (D52.3); a clip of an earlier version has none of them.
    if ('sourceStartUs' in clip) {
      if (clip.sourceStartUs > Number.MAX_SAFE_INTEGER - clip.durationUs + 1) {
        sourceErrors.push({
          code: 'source-time-out-of-range',
          path: pointer(clipPath, 'sourceStartUs'),
          message: 'sourceStartUs + durationUs − 1 must be a safe integer.',
        });
      }
      // Both fades are at most a safe integer each, so their sum is exact as a double
      // only up to 2^53; compared as a difference, it never rounds.
      if (clip.fadeInUs > clip.durationUs - clip.fadeOutUs) {
        fadeErrors.push({
          code: 'clip-fades-exceed-duration',
          path: pointer(clipPath, 'fadeOutUs'),
          message: 'fadeInUs + fadeOutUs must not exceed durationUs.',
        });
      }
    }
  };
  const clips: readonly (AudioClip | CompositionV03['clips'][number])[] = composition.clips;
  clips.forEach((clip, clipIndex) => {
    checkClip(clip, pointer(pointer('', 'clips'), clipIndex));
  });
  // The scenes of 0.5 (D54.2); a scene of an earlier version has no duration and no clips.
  const durationErrors: ValidationError[] = [];
  const scenes: readonly (
    Composition['scenes'][number] | { readonly id: string; readonly nodes: readonly unknown[] }
  )[] = composition.scenes;
  // Exact in BigInt: the durations may add up past the safe integers before the
  // transitions of 0.6 are subtracted (D56).
  let totalUs = 0n;
  let measured = true;
  for (const [sceneIndex, scene] of scenes.entries()) {
    if (!('durationUs' in scene)) {
      measured = false;
      break;
    }
    scene.clips.forEach((clip, clipIndex) => {
      checkClip(
        clip,
        pointer(pointer(pointer(pointer('', 'scenes'), sceneIndex), 'clips'), clipIndex),
      );
    });
    totalUs += BigInt(scene.durationUs);
  }
  // The transitions of 0.6 (D56); no earlier document has the field.
  const transitionErrors: ValidationError[] = [];
  if ('transitions' in composition) {
    for (const transition of composition.transitions) totalUs -= BigInt(transition.durationUs);
    transitionErrors.push(...checkTransitions(composition));
  }
  if (measured && totalUs !== BigInt(composition.durationUs)) {
    const safe = totalUs <= BigInt(Number.MAX_SAFE_INTEGER);
    durationErrors.push({
      code: 'composition-duration-mismatch',
      path: '/durationUs',
      message: `durationUs must be the sum of the durationUs of the scenes less those of the scene transitions, ${safe ? String(totalUs) : 'which exceeds the safe integers'}.`,
    });
  }

  return [
    ...errors,
    ...animationErrors,
    ...sourceErrors,
    ...fadeErrors,
    ...durationErrors,
    ...transitionErrors,
  ];
}

/** A node of a scene with where it lives: its parent's ID, or `null` for the scene itself. */
interface Located {
  readonly node: SceneNode | Extract<SceneNode, { type: 'group' }>['children'][number];
  readonly parentId: string | null;
}

/**
 * The rules of transitions (D49.4, D56). A scene transition joins a scene and
 * the scene directly after it, at most one per boundary; a clip transition
 * joins two siblings of one parent of its scene, neither a background, whose
 * lifetimes overlap by exactly its duration; a side meets at most one
 * transition at each end; and a transition is at most as long as either side,
 * and the two of one side together at most as long as it.
 */
function checkTransitions(composition: Composition): ValidationError[] {
  const errors: ValidationError[] = [];
  const sceneIndex = new Map(composition.scenes.map((scene, index) => [scene.id, index]));
  const sideErrors = (
    sides: { readonly id: string; readonly durationUs: number }[],
    entries: readonly {
      readonly from: string;
      readonly to: string;
      readonly durationUs: number;
      readonly path: string;
    }[],
  ): void => {
    const outgoing = new Map<string, number>();
    const incoming = new Map<string, number>();
    for (const entry of entries) {
      if (outgoing.has(entry.from) || incoming.has(entry.to)) {
        errors.push({
          code: 'duplicate-transition',
          path: entry.path,
          message: 'A side meets at most one transition at each of its ends.',
        });
        continue;
      }
      outgoing.set(entry.from, entry.durationUs);
      incoming.set(entry.to, entry.durationUs);
    }
    for (const side of sides) {
      const both = (incoming.get(side.id) ?? 0) + (outgoing.get(side.id) ?? 0);
      // Each of the two is at most the side's duration, so the sum is below 2^54 and exact
      // as a comparison of one against the other's complement.
      if ((incoming.get(side.id) ?? 0) > side.durationUs - (outgoing.get(side.id) ?? 0)) {
        const entry = entries.find(({ to }) => to === side.id);
        errors.push({
          code: 'transition-too-long',
          path: entry?.path ?? '',
          message: `The transitions into and out of "${side.id}" last ${String(both)} µs together, more than its durationUs.`,
        });
      }
    }
  };

  const sceneEntries: { from: string; to: string; durationUs: number; path: string }[] = [];
  composition.transitions.forEach((transition, index) => {
    const path = pointer(pointer('', 'transitions'), index);
    const from = sceneIndex.get(transition.fromSceneId);
    const to = sceneIndex.get(transition.toSceneId);
    for (const [key, at] of [
      ['fromSceneId', from],
      ['toSceneId', to],
    ] as const) {
      if (at === undefined) {
        errors.push({
          code: 'unresolved-scene-reference',
          path: pointer(path, key),
          message: `No scene has the ID "${transition[key]}".`,
        });
      }
    }
    if (from === undefined || to === undefined) return;
    if (to !== from + 1) {
      errors.push({
        code: 'transition-not-adjacent',
        path: pointer(path, 'toSceneId'),
        message: `Scene "${transition.toSceneId}" does not directly follow scene "${transition.fromSceneId}".`,
      });
      return;
    }
    const sides = [composition.scenes[from], composition.scenes[to]];
    if (sides.some((side) => side !== undefined && transition.durationUs > side.durationUs)) {
      errors.push({
        code: 'transition-too-long',
        path: pointer(path, 'durationUs'),
        message: 'A transition lasts at most as long as either of its scenes.',
      });
      return;
    }
    sceneEntries.push({
      from: transition.fromSceneId,
      to: transition.toSceneId,
      durationUs: transition.durationUs,
      path,
    });
  });
  sideErrors([...composition.scenes], sceneEntries);

  composition.scenes.forEach((scene, index) => {
    const scenePath = pointer(pointer('', 'scenes'), index);
    const located = new Map<string, Located>();
    for (const node of scene.nodes) {
      located.set(node.id, { node, parentId: null });
      if (node.type === 'group') {
        for (const child of node.children)
          located.set(child.id, { node: child, parentId: node.id });
      }
    }
    const clipEntries: { from: string; to: string; durationUs: number; path: string }[] = [];
    scene.transitions.forEach((transition, transitionIndex) => {
      const path = pointer(pointer(scenePath, 'transitions'), transitionIndex);
      const from = located.get(transition.fromNodeId);
      const to = located.get(transition.toNodeId);
      for (const [key, at] of [
        ['fromNodeId', from],
        ['toNodeId', to],
      ] as const) {
        if (at === undefined) {
          errors.push({
            code: 'unresolved-node-reference',
            path: pointer(path, key),
            message: `No node of this scene has the ID "${transition[key]}".`,
          });
        }
      }
      if (from === undefined || to === undefined) return;
      if (from.node.type === 'background' || to.node.type === 'background') {
        errors.push({
          code: 'transition-node-type',
          path,
          message: 'A background has no opacity and takes no clip transition.',
        });
        return;
      }
      if (from.node.id === to.node.id || from.parentId !== to.parentId) {
        errors.push({
          code: 'transition-not-siblings',
          path: pointer(path, 'toNodeId'),
          message: 'The two sides of a clip transition are two different children of one parent.',
        });
        return;
      }
      const { durationUs } = transition;
      if (durationUs > from.node.durationUs || durationUs > to.node.durationUs) {
        errors.push({
          code: 'transition-too-long',
          path: pointer(path, 'durationUs'),
          message: 'A transition lasts at most as long as either of its clips.',
        });
        return;
      }
      // The outgoing clip ends exactly durationUs after the incoming one starts, compared
      // as differences so that no end is ever formed past the safe integers.
      if (from.node.durationUs - durationUs !== to.node.startUs - from.node.startUs) {
        errors.push({
          code: 'transition-overlap-mismatch',
          path: pointer(path, 'durationUs'),
          message: `The lifetimes of "${from.node.id}" and "${to.node.id}" must overlap by exactly durationUs.`,
        });
        return;
      }
      clipEntries.push({
        from: from.node.id,
        to: to.node.id,
        durationUs,
        path,
      });
    });
    sideErrors(
      [...located.values()].map(({ node }) => node),
      clipEntries,
    );
  });
  return errors;
}

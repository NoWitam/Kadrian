/**
 * Rules that JSON Schema cannot express (D16, D17). Runs only on a structurally
 * valid document. Errors are ordered by rule and then by position; the order
 * never depends on the key order of the input.
 *
 * The rules are those of schema 0.1, 0.2, and 0.3 alike: a lifetime adds none
 * (D42.1), and a video node adds only the reference to an asset of type video
 * (D50), which no earlier document can have. `migrateComposition` applies them
 * to documents of 0.1 and 0.2 too (D35.4), which is why the document type is
 * any of the three versions'; the negative corpus of 0.1 is kept
 * and pins what they were. A rule that a later version changes gets its own
 * function, never a branch here.
 */
import { pointer, type ValidationError } from './errors.js';
import type { Asset, Composition, NodeAnimation } from './types.js';
// A type only: it is erased when the module is built, so the main entry reaches no
// historical module at run time (D42.8; `migration-entry.test.ts` walks the built output).
import type { CompositionV01 } from './v0-1/composition-schema.js';
import type { CompositionV02 } from './v0-2/composition-schema.js';

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
  composition: Composition | CompositionV01 | CompositionV02,
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
  composition.clips.forEach((clip, clipIndex) => {
    const clipPath = pointer(pointer('', 'clips'), clipIndex);
    checkReference(clip.assetId, 'audio', pointer(clipPath, 'assetId'));
  });

  return [...errors, ...animationErrors, ...sourceErrors];
}

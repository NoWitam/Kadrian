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
 * their durations from that sum, and the captions of 0.7 add the reference to
 * their font and the order of their words (D57), which no earlier document can
 * have, and the template section of 0.8 adds the rules of its inputs and
 * bindings (D58), which no earlier document has the field for, and the
 * conditions, repeats, and item bindings of 0.9 add the rules of D59, which no
 * earlier document has the fields for. `migrateComposition` applies them to
 * documents of 0.1 to 0.8 too (D35.4), which is why the document type is any
 * of the nine versions'; the negative corpus of 0.1 is kept
 * and pins what they were. A rule that a later version changes gets its own
 * function, never a branch here.
 */
import { pointer, type ValidationError } from './errors.js';
import { templateStructure } from './template-structure.js';
import { constraintProblem, copiedFrom, patternParts, valueProblem } from './template-values.js';
import type {
  Asset,
  AudioClip,
  CaptionsNode,
  Composition,
  FragmentTrack,
  NodeAnimation,
  SceneNode,
  TemplateCondition,
  TemplateInput,
  TemplateRepeat,
} from './types.js';
// A type only: it is erased when the module is built, so the main entry reaches no
// historical module at run time (D42.8; `migration-entry.test.ts` walks the built output).
import type { CompositionV01 } from './v0-1/composition-schema.js';
import type { CompositionV02 } from './v0-2/composition-schema.js';
import type { CompositionV03 } from './v0-3/composition-schema.js';
import type { CompositionV04 } from './v0-4/composition-schema.js';
import type { CompositionV05 } from './v0-5/composition-schema.js';
import type { CompositionV06 } from './v0-6/composition-schema.js';
import type { CompositionV07 } from './v0-7/composition-schema.js';
import type { CompositionV08 } from './v0-8/composition-schema.js';
import type { CompositionV09 } from './v0-9/composition-schema.js';
import type { CompositionV010 } from './v0-10/composition-schema.js';
import type { CompositionV011 } from './v0-11/composition-schema.js';
import type { CompositionV012 } from './v0-12/composition-schema.js';
import type { CompositionV013 } from './v0-13/composition-schema.js';

/** A node of a scene of 0.9, whose images and videos have no focus (D63). */
type SceneNodeV09 = CompositionV09['scenes'][number]['nodes'][number];
/** A node of 0.12, whose transformable nodes have no rotation, origin, crop, or corner radius (D68). */
type SceneNodeV012 = CompositionV012['scenes'][number]['nodes'][number];
/** A node of 0.13, whose texts have no style and no text animations (D69). */
type SceneNodeV013 = CompositionV013['scenes'][number]['nodes'][number];

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

/** An animation of any version: the rules read its property and the times of its keyframes only. */
type AnyAnimation = {
  readonly property: NodeAnimation['property'] | FragmentTrack['property'];
} & {
  readonly keyframes: readonly { readonly timeUs: number }[];
};

function checkAnimations(
  animations: readonly AnyAnimation[],
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
      if (animation.property === 'crop') {
        const keyframePath = pointer(pointer(animationPath, 'keyframes'), keyframeIndex);
        checkCrop(
          (keyframe as unknown as { readonly value: Crop }).value,
          pointer(keyframePath, 'value'),
          errors,
        );
      }
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

/** A crop of 0.13 (D68): four insets in per mille of the picture's sides. */
interface Crop {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** The key of a top inset, held in a constant: a literal `top` reads like the global of a page. */
const TOP = 'top';

/** Two opposite insets of a crop leave at least 1 per mille of the picture (D68). */
function cropError(crop: Crop, path: string): ValidationError | null {
  if (crop.left + crop.right <= 999 && crop[TOP] + crop.bottom <= 999) return null;
  return {
    code: 'crop-empty',
    path,
    message: 'Two opposite insets of a crop add up to at most 999 per mille.',
  };
}

function checkCrop(crop: Crop, path: string, errors: ValidationError[]): void {
  const error = cropError(crop, path);
  if (error !== null) errors.push(error);
}

/**
 * The words of a captions node are spoken one after the other (D57): each
 * starts no earlier than the one before it ends. Compared as a difference, so
 * no end is formed past the safe integers.
 */
function checkCaptionWords(
  words: CaptionsNode['words'],
  path: string,
  errors: ValidationError[],
): void {
  words.forEach((word, index) => {
    const previous = words[index - 1];
    if (previous !== undefined && word.startUs - previous.startUs < previous.durationUs) {
      errors.push({
        code: 'caption-words-overlap',
        path: pointer(pointer(path, index), 'startUs'),
        message: 'A word starts no earlier than the word before it ends.',
      });
    }
  });
}

export function validateSemantics(
  composition:
    | Composition
    | CompositionV01
    | CompositionV02
    | CompositionV03
    | CompositionV04
    | CompositionV05
    | CompositionV06
    | CompositionV07
    | CompositionV08
    | CompositionV09
    | CompositionV010
    | CompositionV011
    | CompositionV012
    | CompositionV013,
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
  const captionErrors: ValidationError[] = [];

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
          // The tracks of a text animation of 0.14 follow the rules of animations (D69).
          if ('textAnimations' in member.node) {
            member.node.textAnimations.forEach((item, index) => {
              const tracksPath = pointer(
                pointer(pointer(member.path, 'textAnimations'), index),
                'tracks',
              );
              checkAnimations(item.tracks, tracksPath, animationErrors);
            });
          }
        } else if (member.node.type === 'captions') {
          checkReference(member.node.fontAssetId, 'font', pointer(member.path, 'fontAssetId'));
          checkCaptionWords(member.node.words, pointer(member.path, 'words'), captionErrors);
        }
        // A background has animations since 0.13 (D68).
        if ('animations' in member.node) {
          const animationsPath = pointer(member.path, 'animations');
          checkAnimations(member.node.animations, animationsPath, animationErrors);
        }
        if ('crop' in member.node) {
          checkCrop(member.node.crop, pointer(member.path, 'crop'), animationErrors);
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

  // The template section of 0.8 (D58); no earlier document has the field.
  const templateErrors = 'template' in composition ? checkTemplate(composition) : [];

  return [
    ...errors,
    ...animationErrors,
    ...sourceErrors,
    ...fadeErrors,
    ...durationErrors,
    ...transitionErrors,
    ...captionErrors,
    ...templateErrors,
  ];
}

/** The errors of one input: its constraints, then its default against them (D58.1). */
function inputErrors(input: TemplateInput, path: string): ValidationError[] {
  const invalid = (at: string, message: string): ValidationError => ({
    code: 'template-input-invalid',
    path: at,
    message,
  });
  if (input.type !== 'list') {
    const contradiction = constraintProblem(input);
    if (contradiction !== null)
      return [invalid(pointer(path, contradiction.key), contradiction.message)];
    const problem = valueProblem(input, input.default);
    return problem === null ? [] : [invalid(pointer(path, 'default'), `The default: ${problem}`)];
  }
  const errors: ValidationError[] = [];
  if (input.minItems > input.maxItems) {
    errors.push(invalid(pointer(path, 'maxItems'), 'maxItems must not be less than minItems.'));
  }
  const keys = new Set<string>();
  input.fields.forEach((field, index) => {
    const fieldPath = pointer(pointer(path, 'fields'), index);
    if (keys.has(field.key)) {
      errors.push(
        invalid(
          pointer(fieldPath, 'key'),
          `The key "${field.key}" is already a field of this list.`,
        ),
      );
    }
    keys.add(field.key);
    const contradiction = constraintProblem(field);
    if (contradiction !== null) {
      errors.push(invalid(pointer(fieldPath, contradiction.key), contradiction.message));
    }
  });
  if (errors.length > 0) return errors;
  const defaultPath = pointer(path, 'default');
  if (input.default.length < input.minItems || input.default.length > input.maxItems) {
    errors.push(
      invalid(
        defaultPath,
        `The default has ${String(input.default.length)} items, expected ${String(input.minItems)} to ${String(input.maxItems)}.`,
      ),
    );
  }
  input.default.forEach((item, itemIndex) => {
    const itemPath = pointer(defaultPath, itemIndex);
    if (item.length !== input.fields.length) {
      errors.push(
        invalid(
          itemPath,
          `An item holds one value for each of the ${String(input.fields.length)} fields, in their order.`,
        ),
      );
      return;
    }
    item.forEach((entry, entryIndex) => {
      const field = input.fields[entryIndex];
      const entryPath = pointer(itemPath, entryIndex);
      if (field === undefined) return;
      if (entry.key !== field.key || entry.type !== field.type) {
        errors.push(
          invalid(
            entryPath,
            `Expected the value of the ${field.type} field "${field.key}", the field at this place.`,
          ),
        );
        return;
      }
      const problem = valueProblem(field, entry.value);
      if (problem !== null) errors.push(invalid(pointer(entryPath, 'value'), problem));
    });
  });
  return errors;
}

/** The node types whose property a binding may write, and the input type it takes (D58.2). */
const BOUND_PROPERTIES = {
  text: { nodeTypes: ['text'], inputType: 'text' },
  color: { nodeTypes: ['text', 'background'], inputType: 'color' },
} as const;

/** The field types an item binding of a property takes (D59.3), as `BOUND_PROPERTIES`. */
const ITEM_FIELD_TYPES = { text: 'text', color: 'color' } as const;

/** The input types each test of a condition reads (D59.1). */
const TESTED_TYPES: Readonly<Record<TemplateCondition['test'], readonly string[]>> = {
  empty: ['text', 'list'],
  'not-empty': ['text', 'list'],
  true: ['boolean'],
  false: ['boolean'],
  'equal-text': ['text'],
  'equal-number': ['number'],
};

/**
 * The rules of the template section (D58, D59): every input's constraints and
 * default; every binding's target and input, which exist and agree in type;
 * one binding per target; a bound property or asset that holds its input's
 * default; placeholders that parse and name a text or number input, or a text
 * or number field of a list that repeats them; item bindings inside a repeat
 * over their list; conditions and repeats whose targets and inputs exist and
 * fit; no repeat inside another, none of a side of a clip transition; and no
 * ID of the form of a copy of a repeated ID.
 */
function checkTemplate(
  composition:
    | Composition
    | CompositionV012
    | CompositionV013
    | CompositionV011
    | CompositionV010
    | CompositionV09
    | CompositionV08,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const { inputs, bindings } = composition.template;
  // The lists of 0.9 (D59); a template of 0.8 has neither.
  const flow = 'repeats' in composition.template;
  const conditions: readonly TemplateCondition[] = flow ? composition.template.conditions : [];
  const repeats: readonly TemplateRepeat[] = flow ? composition.template.repeats : [];
  const structure = templateStructure(composition);
  const inputById = new Map<string, TemplateInput>();
  inputs.forEach((input, index) => {
    if (!inputById.has(input.id)) inputById.set(input.id, input);
    errors.push(...inputErrors(input, pointer(pointer('/template', 'inputs'), index)));
  });
  const nodes = new Map<string, Located['node']>();
  for (const scene of composition.scenes) {
    for (const node of scene.nodes) {
      nodes.set(node.id, node);
      if (node.type === 'group') for (const child of node.children) nodes.set(child.id, child);
    }
  }
  const assets = new Map(composition.assets.map((asset) => [asset.id, asset]));
  const targets = new Set<string>();
  /** The field `key` of the list input `inputId`, or why there is none (D59). */
  const fieldOf = (
    input: TemplateInput,
    key: string,
  ): Extract<TemplateInput, { type: 'list' }>['fields'][number] | undefined =>
    input.type === 'list' ? input.fields.find((field) => field.key === key) : undefined;
  bindings.forEach((binding, index) => {
    const path = pointer(pointer('/template', 'bindings'), index);
    const push = (code: ValidationError['code'], at: string, message: string): void => {
      errors.push({ code, path: at, message });
    };
    const inputOf = (inputId: string): TemplateInput | undefined => {
      const input = inputById.get(inputId);
      if (input === undefined) {
        push(
          'unresolved-input-reference',
          pointer(path, 'inputId'),
          `No input has the ID "${inputId}".`,
        );
      }
      return input;
    };
    const claim = (target: string): boolean => {
      if (targets.has(target)) {
        push('duplicate-binding-target', path, 'Another binding writes the same target.');
        return false;
      }
      targets.add(target);
      return true;
    };
    /** The field of an item binding, after its input is known to be a list (D59.3). */
    const itemFieldOf = (
      input: TemplateInput,
      key: string,
    ): Extract<TemplateInput, { type: 'list' }>['fields'][number] | undefined => {
      if (input.type !== 'list') {
        push(
          'binding-type-mismatch',
          pointer(path, 'inputId'),
          `An item binding reads a list input, and "${input.id}" is of type ${input.type}.`,
        );
        return undefined;
      }
      const field = fieldOf(input, key);
      if (field === undefined) {
        push(
          'unresolved-field-reference',
          pointer(path, 'key'),
          `The items of "${input.id}" have no field "${key}".`,
        );
      }
      return field;
    };
    if (binding.kind === 'asset' || binding.kind === 'item-asset') {
      const asset = assets.get(binding.assetId);
      if (asset === undefined) {
        push(
          'unresolved-asset-reference',
          pointer(path, 'assetId'),
          `No asset has the ID "${binding.assetId}".`,
        );
      }
      const input = inputOf(binding.inputId);
      if (asset === undefined || input === undefined) return;
      if (binding.kind === 'item-asset') {
        const field = itemFieldOf(input, binding.key);
        if (field === undefined) return;
        if (field.type !== asset.type) {
          push(
            'binding-type-mismatch',
            pointer(path, 'key'),
            `Asset "${asset.id}" is of type ${asset.type} and takes a field of its type, not ${field.type}.`,
          );
          return;
        }
        if (!claim(`asset:${asset.id}`)) return;
        // Every user of the asset lies in the target of one repeat over the list (D59.3).
        const users = structure.assetUsers.get(asset.id) ?? [];
        const holders = new Set(
          users.map((user) => (user === null ? null : structure.repeatHolding(user))),
        );
        const [holder] = [...holders];
        if (
          holders.size !== 1 ||
          holder === null ||
          holder === undefined ||
          holder.inputId !== input.id
        ) {
          push(
            'item-outside-repeat',
            path,
            `Asset "${asset.id}" must be used, and only inside the target of one repeat over "${input.id}".`,
          );
        }
        return;
      }
      if (input.type !== asset.type) {
        push(
          'binding-type-mismatch',
          pointer(path, 'inputId'),
          `Asset "${asset.id}" is of type ${asset.type} and takes an input of its type, not ${input.type}.`,
        );
        return;
      }
      if (!claim(`asset:${asset.id}`)) return;
      if (asset.contentHash !== input.default) {
        push(
          'binding-value-mismatch',
          path,
          `Asset "${asset.id}" must hold the default of input "${input.id}".`,
        );
      }
      return;
    }
    const node = nodes.get(binding.nodeId);
    if (node === undefined) {
      push(
        'unresolved-node-reference',
        pointer(path, 'nodeId'),
        `No node has the ID "${binding.nodeId}".`,
      );
    }
    if (binding.kind === 'placeholders') {
      if (node === undefined) return;
      if (node.type !== 'text') {
        push(
          'binding-type-mismatch',
          pointer(path, 'nodeId'),
          `A ${node.type} node has no text to fill.`,
        );
        return;
      }
      if (!claim(`node:${node.id}/text`)) return;
      const parts = patternParts(node.text);
      // A field of an item is a placeholder of 0.9 (D59.3); 0.8 knew {{inputId}} only.
      if (
        parts === null ||
        (!flow && parts.some((part) => typeof part !== 'string' && part.key !== null))
      ) {
        push(
          'invalid-placeholder',
          path,
          `The text of "${node.id}" has a {{ that does not begin a placeholder {{inputId}} or {{inputId.key}}.`,
        );
        return;
      }
      for (const part of parts) {
        if (typeof part === 'string') continue;
        const input = inputById.get(part.inputId);
        if (input === undefined) {
          push('unresolved-input-reference', path, `No input has the ID "${part.inputId}".`);
          continue;
        }
        if (part.key === null) {
          if (input.type !== 'text' && input.type !== 'number') {
            push(
              'binding-type-mismatch',
              path,
              `A placeholder takes a text or number input, and "${input.id}" is of type ${input.type}.`,
            );
          }
          continue;
        }
        if (input.type !== 'list') {
          push(
            'binding-type-mismatch',
            path,
            `A placeholder {{${input.id}.${part.key}}} reads a list input, and "${input.id}" is of type ${input.type}.`,
          );
          continue;
        }
        const field = fieldOf(input, part.key);
        if (field === undefined) {
          push(
            'unresolved-field-reference',
            path,
            `The items of "${input.id}" have no field "${part.key}".`,
          );
        } else if (field.type !== 'text' && field.type !== 'number') {
          push(
            'binding-type-mismatch',
            path,
            `A placeholder takes a text or number field, and "${part.key}" of "${input.id}" is of type ${field.type}.`,
          );
        } else if (structure.repeatHolding(node.id)?.inputId !== input.id) {
          push(
            'item-outside-repeat',
            path,
            `The text of "${node.id}" reads an item of "${input.id}" outside every repeat over it.`,
          );
        }
      }
      return;
    }
    const input = inputOf(binding.inputId);
    if (node === undefined || input === undefined) return;
    const rule = BOUND_PROPERTIES[binding.property];
    if (!(rule.nodeTypes as readonly string[]).includes(node.type)) {
      push(
        'binding-type-mismatch',
        pointer(path, 'property'),
        `A ${node.type} node has no bindable ${binding.property}.`,
      );
      return;
    }
    // An animation of 0.13 replaces the colour at every instant (D68), so a bound
    // colour would never be seen.
    // A colour track of a text animation of 0.14 replaces it for every fragment, and
    // every glyph lies in a fragment (D69).
    const animated: readonly { readonly property: string }[] = [
      ...('animations' in node ? node.animations : []),
      ...('textAnimations' in node ? node.textAnimations.flatMap((item) => item.tracks) : []),
    ];
    if (animated.some((animation) => animation.property === binding.property)) {
      push(
        'bound-property-animated',
        pointer(path, 'property'),
        `The ${binding.property} of "${node.id}" is animated, and an animation replaces it at every instant.`,
      );
      return;
    }
    if (binding.kind === 'item-property') {
      const field = itemFieldOf(input, binding.key);
      if (field === undefined) return;
      if (field.type !== ITEM_FIELD_TYPES[binding.property]) {
        push(
          'binding-type-mismatch',
          pointer(path, 'key'),
          `The ${binding.property} takes a ${rule.inputType} field, and "${field.key}" is of type ${field.type}.`,
        );
        return;
      }
      if (!claim(`node:${node.id}/${binding.property}`)) return;
      if (structure.repeatHolding(node.id)?.inputId !== input.id) {
        push(
          'item-outside-repeat',
          path,
          `Node "${node.id}" lies outside every repeat over "${input.id}".`,
        );
      }
      return;
    }
    if (input.type !== rule.inputType) {
      push(
        'binding-type-mismatch',
        pointer(path, 'inputId'),
        `The ${binding.property} takes a ${rule.inputType} input, and "${input.id}" is of type ${input.type}.`,
      );
      return;
    }
    if (!claim(`node:${node.id}/${binding.property}`)) return;
    const stored: unknown = (node as unknown as Readonly<Record<string, unknown>>)[
      binding.property
    ];
    if (stored !== input.default) {
      push(
        'binding-value-mismatch',
        path,
        `The ${binding.property} of "${node.id}" must hold the default of input "${input.id}".`,
      );
    }
  });

  conditions.forEach((condition, index) => {
    const path = pointer(pointer('/template', 'conditions'), index);
    if (!structure.elements.has(condition.targetId)) {
      errors.push({
        code: 'unresolved-target-reference',
        path: pointer(path, 'targetId'),
        message: `No scene and no node has the ID "${condition.targetId}".`,
      });
    }
    const input = inputById.get(condition.inputId);
    if (input === undefined) {
      errors.push({
        code: 'unresolved-input-reference',
        path: pointer(path, 'inputId'),
        message: `No input has the ID "${condition.inputId}".`,
      });
    } else if (!TESTED_TYPES[condition.test].includes(input.type)) {
      errors.push({
        code: 'condition-type-mismatch',
        path: pointer(path, 'test'),
        message: `The test ${condition.test} reads a ${TESTED_TYPES[condition.test].join(' or ')} input, and "${input.id}" is of type ${input.type}.`,
      });
    }
  });

  const clipSides = new Set<string>();
  for (const scene of composition.scenes) {
    for (const transition of scene.transitions) {
      clipSides.add(transition.fromNodeId);
      clipSides.add(transition.toNodeId);
    }
  }
  const repeated = new Set<string>();
  repeats.forEach((repeat, index) => {
    const path = pointer(pointer('/template', 'repeats'), index);
    const element = structure.elements.get(repeat.targetId);
    if (element === undefined) {
      errors.push({
        code: 'unresolved-target-reference',
        path: pointer(path, 'targetId'),
        message: `No scene and no node has the ID "${repeat.targetId}".`,
      });
    }
    const input = inputById.get(repeat.inputId);
    if (input === undefined) {
      errors.push({
        code: 'unresolved-input-reference',
        path: pointer(path, 'inputId'),
        message: `No input has the ID "${repeat.inputId}".`,
      });
    } else if (input.type !== 'list') {
      errors.push({
        code: 'repeat-type-mismatch',
        path: pointer(path, 'inputId'),
        message: `A repeat reads a list input, and "${input.id}" is of type ${input.type}.`,
      });
    } else if (repeat.duration === 'field') {
      const field = fieldOf(input, repeat.key);
      if (field === undefined) {
        errors.push({
          code: 'unresolved-field-reference',
          path: pointer(path, 'key'),
          message: `The items of "${input.id}" have no field "${repeat.key}".`,
        });
      } else if (field.type !== 'number') {
        errors.push({
          code: 'repeat-type-mismatch',
          path: pointer(path, 'key'),
          message: `A duration is read from a number field, and "${field.key}" is of type ${field.type}.`,
        });
      }
    }
    if (element === undefined) return;
    const outer = structure.chain(repeat.targetId).slice(1);
    if (repeated.has(repeat.targetId) || outer.some((id) => structure.repeatOf.has(id))) {
      errors.push({
        code: 'nested-repeat',
        path: pointer(path, 'targetId'),
        message: `"${repeat.targetId}" is repeated already, or lies inside a repeated scene or group.`,
      });
    }
    repeated.add(repeat.targetId);
    if (element.kind === 'node' && clipSides.has(repeat.targetId)) {
      errors.push({
        code: 'repeat-in-transition',
        path: pointer(path, 'targetId'),
        message: `Node "${repeat.targetId}" is a side of a clip transition, whose overlap its copies cannot keep.`,
      });
    }
  });

  // No ID has the form of a copy of an ID that a repeat copies (D59.2).
  if (repeats.length > 0) {
    const copied = new Set<string>();
    for (const repeat of repeats) {
      collectIds(subtreeOf(composition, repeat.targetId), copied);
    }
    for (const binding of bindings) {
      if (binding.kind === 'item-asset') copied.add(binding.assetId);
    }
    const all: { id: string; path: string }[] = [];
    collectIdPaths(composition, '', all);
    for (const { id, path } of all) {
      const from = copiedFrom(id);
      if (from !== null && copied.has(from)) {
        errors.push({
          code: 'repeat-id-reserved',
          path,
          message: `"${id}" has the form of the ID of a copy of "${from}", which a repeat copies.`,
        });
      }
    }
  }
  return errors;
}

/** The scene or node with that ID, or `undefined`. */
function subtreeOf(
  composition:
    | Composition
    | CompositionV012
    | CompositionV013
    | CompositionV011
    | CompositionV010
    | CompositionV09
    | CompositionV08,
  id: string,
): unknown {
  for (const scene of composition.scenes) {
    if (scene.id === id) return scene;
    for (const node of scene.nodes) {
      if (node.id === id) return node;
      if (node.type === 'group') {
        const child = node.children.find((member) => member.id === id);
        if (child !== undefined) return child;
      }
    }
  }
  return undefined;
}

/** Every `id` of a value, at any depth. */
function collectIds(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value as readonly unknown[]) collectIds(item, into);
  } else if (typeof value === 'object' && value !== null) {
    for (const [name, child] of Object.entries(value)) {
      if (name === 'id' && typeof child === 'string') into.add(child);
      else collectIds(child, into);
    }
  }
}

/** Every `id` of a value with its path, in sorted key order like `checkUniqueIds`. */
function collectIdPaths(value: unknown, path: string, into: { id: string; path: string }[]): void {
  if (Array.isArray(value)) {
    (value as readonly unknown[]).forEach((item, index) => {
      collectIdPaths(item, pointer(path, index), into);
    });
  } else if (typeof value === 'object' && value !== null) {
    for (const [name, child] of Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (name === 'id' && typeof child === 'string')
        into.push({ id: child, path: pointer(path, name) });
      else collectIdPaths(child, pointer(path, name), into);
    }
  }
}

/** A node of a scene with where it lives: its parent's ID, or `null` for the scene itself. */
interface Located {
  readonly node:
    | SceneNode
    | Extract<SceneNode, { type: 'group' }>['children'][number]
    | SceneNodeV09
    | Extract<SceneNodeV09, { type: 'group' }>['children'][number]
    | SceneNodeV012
    | Extract<SceneNodeV012, { type: 'group' }>['children'][number]
    | SceneNodeV013
    | Extract<SceneNodeV013, { type: 'group' }>['children'][number];
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
function checkTransitions(
  composition:
    | Composition
    | CompositionV06
    | CompositionV07
    | CompositionV08
    | CompositionV09
    | CompositionV010
    | CompositionV011
    | CompositionV012
    | CompositionV013,
): ValidationError[] {
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

/**
 * Text animated in fragments (D65.3, D69): the letters, words, or lines of a
 * text node, each with its own opacity, offset, scale, rotation, and colour at
 * one instant, from the document and the time alone. Every fragment of a unit
 * runs the same tracks in its own time, which starts a stagger after the
 * fragment before it in the animation's order.
 */
import type { FragmentTrack, FragmentUnit, TextAnimation, TextNode } from '@kadrion/schema';

import type { Bounds } from './easing.js';
import { EvaluationError, unsupported } from './errors.js';
import { textLayout } from './graphemes.js';
import { sampleColorKeyframes, sampleNumberKeyframes, sampleVec2Keyframes } from './keyframes.js';
import type { FragmentState, TextFragmentsState, Vec2 } from './state.js';
import { textLines, type FontMetrics } from './text-frame.js';

/**
 * The bounds of a keyframe value of each track in the schema, within which an
 * eased segment is held (D67.6, D69). A test compares them with the schema.
 */
export const TRACK_BOUNDS: Readonly<Record<FragmentTrack['property'], Bounds>> = {
  opacity: { min: 0, max: 1 },
  offset: { min: -1_000_000, max: 1_000_000 },
  scale: { min: 0, max: 1000 },
  rotation: { min: -360_000, max: 360_000 },
  color: { min: 0, max: 255 },
};

/**
 * The next 32-bit output of the generator `mulberry32` from its state, and the
 * state after it (D69.5): integer operations only (`Math.imul`, `>>>`, `^`,
 * `|`), so every engine yields the same numbers.
 */
function mulberry32(state: number): readonly [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [(t ^ (t >>> 14)) >>> 0, next];
}

/**
 * The step of each of `count` fragments in an order (D69.4): the fragments of
 * one step start together, and step k starts k staggers after step 0.
 * `forward` and `backward` give every fragment a step of its own; `center` and
 * `edges` give two fragments as far from the middle the same step; `random`
 * shuffles the fragments by Fisher–Yates with `mulberry32` from the seed.
 */
export function fragmentSteps(order: TextAnimation['order'], count: number): number[] {
  const indices = Array.from({ length: count }, (_, index) => index);
  // `|2i − (n − 1)|`, twice the distance of fragment i from the middle, an integer.
  const fromMiddle = (index: number): number => Math.floor(Math.abs(2 * index - (count - 1)) / 2);
  switch (order.kind) {
    case 'forward':
      return indices;
    case 'backward':
      return indices.map((index) => count - 1 - index);
    case 'center':
      return indices.map(fromMiddle);
    case 'edges':
      return indices.map((index) => Math.floor((count - 1) / 2) - fromMiddle(index));
    case 'random': {
      const shuffled = [...indices];
      let state = order.seed >>> 0;
      for (let last = count - 1; last > 0; last -= 1) {
        const [value, next] = mulberry32(state);
        state = next;
        const other = value % (last + 1);
        const kept = shuffled[last] ?? 0;
        shuffled[last] = shuffled[other] ?? 0;
        shuffled[other] = kept;
      }
      const steps = new Array<number>(count).fill(0);
      shuffled.forEach((fragment, step) => {
        steps[fragment] = step;
      });
      return steps;
    }
    default:
      return unsupported(order, 'kind');
  }
}

/** The time of the last keyframe of any track: the length of one fragment's animation (D69.3, D70). */
export function tracksLength(tracks: readonly FragmentTrack[]): number {
  let length = 0;
  for (const track of tracks) {
    const last = track.keyframes[track.keyframes.length - 1];
    if (last !== undefined && last.timeUs > length) length = last.timeUs;
  }
  return length;
}

/**
 * The own time of a fragment of step `step` at the scene time `timeUs` (D69.3).
 * `in` starts step 0 at the node's start, `accent` at its `startUs`, and `out`
 * ends the last step's last keyframe at the node's end. Every operand is a
 * safe integer; the arithmetic is that of IEEE 754 doubles, the same on every
 * engine, and exact while every product and difference is a safe integer, as
 * it is for every stagger below a day and every text of fewer than 100 000
 * fragments.
 */
function ownTime(
  node: TextNode,
  animation: TextAnimation,
  step: number,
  steps: number,
  timeUs: number,
): number {
  const { phase, staggerUs } = animation;
  switch (phase.kind) {
    case 'in':
      return timeUs - node.startUs - step * staggerUs;
    case 'accent':
      return timeUs - phase.startUs - step * staggerUs;
    case 'out':
      return (
        timeUs -
        node.startUs -
        (node.durationUs - tracksLength(animation.tracks) - (steps - 1 - step) * staggerUs)
      );
    default:
      return unsupported(phase, 'kind');
  }
}

/** A fragment at rest: nothing moved, the colour of the text (D69). */
export function rest(color: string): FragmentState {
  return { opacity: 1, offset: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, color };
}

/**
 * One fragment after the tracks of one animation at its own time: opacity and
 * scale multiply, offset and rotation add, and a colour replaces (D69.3). The
 * highlight and the page animations of captions use the same rule (D70).
 */
export function applied(
  fragment: FragmentState,
  tracks: readonly FragmentTrack[],
  ownTimeUs: number,
): FragmentState {
  let { opacity, offset, scale, rotation, color } = fragment;
  for (const track of tracks) {
    const bounds = TRACK_BOUNDS[track.property];
    switch (track.property) {
      case 'opacity':
        opacity = opacity * sampleNumberKeyframes(track.keyframes, bounds, ownTimeUs);
        break;
      case 'rotation':
        rotation = rotation + sampleNumberKeyframes(track.keyframes, bounds, ownTimeUs);
        break;
      case 'offset': {
        const sampled: Vec2 = sampleVec2Keyframes(track.keyframes, bounds, ownTimeUs);
        offset = { x: offset.x + sampled.x, y: offset.y + sampled.y };
        break;
      }
      case 'scale': {
        const sampled: Vec2 = sampleVec2Keyframes(track.keyframes, bounds, ownTimeUs);
        scale = { x: scale.x * sampled.x, y: scale.y * sampled.y };
        break;
      }
      case 'color':
        color = sampleColorKeyframes(track.keyframes, ownTimeUs);
        break;
      default:
        unsupported(track, 'property');
    }
  }
  // `-0 + 0` is `0`: a rotation of -0 degrees is reported as 0.
  return { opacity, offset, scale, rotation: rotation + 0, color };
}

/**
 * How many line fragments a text has (D69.2, D83.5): its lines with a word,
 * which for a text with a frame are the lines of its wrap, measured with
 * `metrics`, the metrics of its font. A framed text without them is the
 * `EvaluationError` `font-metrics-missing` (D83.7).
 */
function lineFragments(
  node: TextNode,
  layout: { readonly fragmentLines: number },
  metrics: FontMetrics | undefined,
): number {
  if (node.frame.kind === 'none') return layout.fragmentLines;
  if (metrics === undefined) {
    throw new EvaluationError(
      'font-metrics-missing',
      `The text "${node.id}" has a frame, and its font "${node.fontAssetId}" has no metrics (D83.7).`,
    );
  }
  return textLines(node.text, node.fontSize, node.frame.width, metrics).filter((line) =>
    line.runs.some((run) => 'letters' in run),
  ).length;
}

/**
 * The fragments of a text node at the scene time `timeUs` (D69), or `null`
 * for a node without text animations, which is drawn in one piece. Each unit
 * its animations use lists one state per fragment, in the order of the text;
 * a unit no animation uses lists none. `color` is the colour of the text at
 * that instant, which a fragment shows until a colour track replaces it. The
 * lines of a text with a frame are those of its wrap (D83.5), for which
 * `metrics`, the metrics of its font, are needed.
 */
export function textFragments(
  node: TextNode,
  color: string,
  timeUs: number,
  metrics?: FontMetrics,
): TextFragmentsState | null {
  if (node.textAnimations.length === 0) return null;
  const layout = textLayout(node.text);
  const used = new Set(node.textAnimations.map((animation) => animation.unit));
  const counts: Readonly<Record<FragmentUnit, number>> = {
    letter: layout.letters,
    word: layout.words,
    line: used.has('line') ? lineFragments(node, layout, metrics) : 0,
  };
  const fragments: Record<FragmentUnit, FragmentState[]> = {
    letter: [],
    word: [],
    line: [],
  };
  for (const unit of used) {
    fragments[unit] = Array.from({ length: counts[unit] }, () => rest(color));
  }
  for (const animation of node.textAnimations) {
    const list = fragments[animation.unit];
    const steps = fragmentSteps(animation.order, list.length);
    const stepCount = steps.reduce((most, step) => (step + 1 > most ? step + 1 : most), 0);
    list.forEach((fragment, index) => {
      const ownTimeUs = ownTime(node, animation, steps[index] ?? 0, stepCount, timeUs);
      list[index] = applied(fragment, animation.tracks, ownTimeUs);
    });
  }
  return { letters: fragments.letter, words: fragments.word, lines: fragments.line };
}

/**
 * The forward step from schema 0.11 to 0.12 (D35.2, D49.7, D67): every
 * animation loses its `interpolation`, which 0.11 allowed to be `linear` only,
 * and every keyframe gets `easing: { kind: 'linear' }` right after its `value`;
 * every transition, between scenes or between clips, gets `easing: { kind:
 * 'linear' }` right after its `effect`; and `schemaVersion` becomes 0.12. A
 * linear segment is sampled by the arithmetic of D18.3 as before, so every
 * document renders byte for byte as it did. Nothing else changes: every other
 * key and its place, every array and its order, every ID, and every value,
 * every time value included (D49.7).
 *
 * It is pure, total over valid documents of 0.11, and deterministic; it never
 * writes its input, and its result shares no object with it.
 */
import { detached } from './detached.js';
import type { CompositionV011 } from '../v0-11/composition-schema.js';

type Fields = Readonly<Record<string, unknown>>;

/** The easing every keyframe and transition of 0.11 had, written out (D67). */
function linear(): Fields {
  return { kind: 'linear' };
}

/** A keyframe with `easing` added after its `value`. */
function keyframe(source: Fields): Fields {
  return Object.fromEntries(
    Object.entries(source).flatMap(([key, child]): [string, unknown][] =>
      key === 'value'
        ? [
            [key, detached(child)],
            ['easing', linear()],
          ]
        : [[key, detached(child)]],
    ),
  );
}

/** An animation without `interpolation`, its keyframes eased linearly. */
function animation(source: Fields): Fields {
  return Object.fromEntries(
    Object.entries(source).flatMap(([key, child]): [string, unknown][] => {
      if (key === 'interpolation') return [];
      if (key === 'keyframes' && Array.isArray(child)) {
        return [[key, (child as readonly Fields[]).map(keyframe)]];
      }
      return [[key, detached(child)]];
    }),
  );
}

/** The node with its children and its animations carried through. */
function node(source: Fields): Fields {
  return Object.fromEntries(
    Object.entries(source).map(([key, child]): [string, unknown] => {
      if (key === 'children' && Array.isArray(child)) {
        return [key, (child as readonly Fields[]).map(node)];
      }
      if (key === 'animations' && Array.isArray(child)) {
        return [key, (child as readonly Fields[]).map(animation)];
      }
      return [key, detached(child)];
    }),
  );
}

/** A transition with `easing` added after its `effect`. */
function transition(source: Fields): Fields {
  return Object.fromEntries(
    Object.entries(source).flatMap(([key, child]): [string, unknown][] =>
      key === 'effect'
        ? [
            [key, detached(child)],
            ['easing', linear()],
          ]
        : [[key, detached(child)]],
    ),
  );
}

function transitions(child: unknown): unknown {
  return Array.isArray(child) ? (child as readonly Fields[]).map(transition) : detached(child);
}

export function step011To012(document: CompositionV011): unknown {
  const scene = (source: Fields): Fields =>
    Object.fromEntries(
      Object.entries(source).map(([key, child]): [string, unknown] => {
        if (key === 'nodes' && Array.isArray(child)) {
          return [key, (child as readonly Fields[]).map(node)];
        }
        if (key === 'transitions') return [key, transitions(child)];
        return [key, detached(child)];
      }),
    );
  return Object.fromEntries(
    Object.entries(document).map(([key, child]): [string, unknown] => {
      if (key === 'schemaVersion') return [key, '0.12'];
      if (key === 'scenes' && Array.isArray(child)) {
        return [key, (child as readonly Fields[]).map(scene)];
      }
      if (key === 'transitions') return [key, transitions(child)];
      return [key, detached(child)];
    }),
  );
}

/**
 * `migrateComposition` and the steps 0.1 → 0.2, 0.2 → 0.3, 0.3 → 0.4,
 * 0.4 → 0.5, 0.5 → 0.6, 0.6 → 0.7, 0.7 → 0.8, 0.8 → 0.9, 0.9 → 0.10,
 * 0.10 → 0.11, 0.11 → 0.12, 0.12 → 0.13, 0.13 → 0.14, 0.14 → 0.15,
 * 0.15 → 0.16, 0.16 → 0.17, 0.17 → 0.18, 0.18 → 0.19, 0.19 → 0.20, 0.20 → 0.21, 0.21 → 0.22, and 0.22 → 0.23 (D35.2–D35.5, D42.7,
 * D42.8, D50.7, D52.6, D54.4, D56.4, D57, D58.5, D59.5, D63, D66, D67, D68, D69,
 * D70, D71, D72, D73, D74).
 *
 * Every expected document here was written by hand and none by a step: the
 * pairs of `@kadrion/test-fixtures`, and the reference composition of 0.23 beside
 * its frozen 0.1 to 0.22 originals. A pair that has nothing the step to 0.4
 * changes reaches 0.4 by its version alone, and 0.23 by its version, the
 * duration, the clips, and the transitions of its one scene, the
 * composition's transitions, its empty template section, and the centred
 * focus of its images, and the linear easing of its keyframes in place of the
 * interpolation of its animations, and no rotation about the top-left
 * corner of every transformed node, no crop and no rounded corners of its
 * images, and no animations of its background, and the plain style and no
 * text animations of its texts, and the safe area of the whole canvas, and no
 * effects of its scene and its nodes, and no fonts and no parameters of its Custom HTML, which the test states by hand (`as23`); a document of 0.5 reaches 0.6 by its version and its
 * empty lists of transitions (`to06`), a document of 0.6 reaches 0.7 by its
 * version alone, and a document of 0.7 reaches 0.8 by its version and an empty
 * template section at its end, and a document of 0.8 reaches 0.9 by its version
 * and the empty conditions and repeats of its template section, and a document
 * of 0.9 reaches 0.10 by its version and the centred focus of its images and
 * videos, and a document of 0.10 reaches 0.11 by its version alone, and a
 * document of 0.11 reaches 0.12 by its version, the linear easing of every
 * keyframe and transition, and no interpolation, and a document of 0.12
 * reaches 0.13 by its version, no rotation about the top-left corner of every
 * transformed node, no crop and no rounded corners of every image and video,
 * and no animations of every background, and a document of 0.13 reaches 0.14
 * by its version, and no stroke, no shadow, no box, and no text animations of
 * every text, and a document of 0.14 reaches 0.15 by its version, the safe
 * area of the whole canvas, and the highlight set and the plain style of every
 * captions node, and a document of 0.15 reaches 0.16 by its version and no
 * effects of every scene, image, video, text, captions node, and group, and a
 * document of 0.16 reaches 0.17 by its version alone, and a document of 0.17
 * reaches 0.18 by its version alone, and a document of 0.18 reaches 0.19 by its
 * version alone, and a document of 0.19 reaches 0.20 by its version and no mask,
 * no matte, and the normal blend mode of every image, video, text, captions
 * node, shape, and group, and a document of 0.20 reaches 0.21 by its version
 * and an empty list of definitions before its template, and a document of
 * 0.21 reaches 0.22 by its version and an empty source hash and template of
 * every definition and no values of every instance, and a document of 0.22
 * reaches 0.23 by its version and no fonts and no parameters of every Custom
 * HTML element.
 * Nothing the step produces is used as its own
 * expectation, and documents are compared as JSON text, so the order of the keys
 * is part of every comparison. What the repository can show is the frozen
 * content — the 0.1 files are byte for byte those of the last build of 0.1; in
 * which order the files were written is in the working record of PR-21, not in
 * a hash (D42, Verification).
 */
import { createHash } from 'node:crypto';

import {
  invalidCompositionCases,
  invalidCompositionCasesV01,
  invalidCompositionCasesV02,
  invalidCompositionCasesV03,
  invalidCompositionCasesV04,
  invalidCompositionCasesV05,
  invalidCompositionCasesV06,
  migrationPair01To02,
  migrationPair02To03,
  migrationPair03To04,
  migrationPair04To05,
  migrationPair05To06,
  migrationPair06To07,
  migrationPair07To08,
  migrationPair08To09,
  migrationPair09To10,
  migrationPair010To011,
  migrationPair011To012,
  migrationPair012To013,
  migrationPair013To014,
  migrationPair014To015,
  migrationPair015To016,
  migrationPair016To017,
  migrationPair017To018,
  migrationPair018To019,
  migrationPair019To020,
  migrationPair020To021,
  migrationPair021To022,
  migrationPair022To023,
  referenceComposition,
  referenceCompositionV01,
  referenceCompositionV02,
  referenceCompositionV03,
  referenceCompositionV04,
  referenceCompositionV05,
  referenceCompositionV06,
  referenceCompositionV07,
  referenceCompositionV08,
  referenceCompositionV09,
  referenceCompositionV010,
  referenceCompositionV011,
  referenceCompositionV012,
  referenceCompositionV013,
  referenceCompositionV014,
  referenceCompositionV015,
  referenceCompositionV016,
  referenceCompositionV017,
  referenceCompositionV018,
  referenceCompositionV019,
  referenceCompositionV020,
  referenceCompositionV021,
  referenceCompositionV022,
  invalidCompositionCasesV07,
  invalidCompositionCasesV08,
  invalidCompositionCasesV09,
  invalidCompositionCasesV010,
  invalidCompositionCasesV011,
  invalidCompositionCasesV012,
  invalidCompositionCasesV013,
  invalidCompositionCasesV014,
  invalidCompositionCasesV015,
  invalidCompositionCasesV016,
  invalidCompositionCasesV017,
  invalidCompositionCasesV018,
  invalidCompositionCasesV019,
  invalidCompositionCasesV020,
  invalidCompositionCasesV021,
  invalidCompositionCasesV022,
} from '@kadrion/test-fixtures';
import { compatibilityCorpus } from '@kadrion/test-fixtures/compatibility';
import { describe, expect, it, vi } from 'vitest';

import { validateComposition, type ValidationResult } from '../src/index.js';
import { migrateComposition, type MigrationResult, type SchemaVersion } from '../src/migrate.js';
import { migrateThrough, type VersionEntry } from '../src/migration/run.js';
import { step01To02 } from '../src/migration/step-0-1-to-0-2.js';
import { step02To03 } from '../src/migration/step-0-2-to-0-3.js';
import { step03To04 } from '../src/migration/step-0-3-to-0-4.js';
import { step04To05 } from '../src/migration/step-0-4-to-0-5.js';
import { step05To06 } from '../src/migration/step-0-5-to-0-6.js';
import { step06To07 } from '../src/migration/step-0-6-to-0-7.js';
import { step07To08 } from '../src/migration/step-0-7-to-0-8.js';
import { step08To09 } from '../src/migration/step-0-8-to-0-9.js';
import { step09To10 } from '../src/migration/step-0-9-to-0-10.js';
import { step010To011 } from '../src/migration/step-0-10-to-0-11.js';
import { step011To012 } from '../src/migration/step-0-11-to-0-12.js';
import { step012To013 } from '../src/migration/step-0-12-to-0-13.js';
import { step013To014 } from '../src/migration/step-0-13-to-0-14.js';
import { step014To015 } from '../src/migration/step-0-14-to-0-15.js';
import { step015To016 } from '../src/migration/step-0-15-to-0-16.js';
import { step016To017 } from '../src/migration/step-0-16-to-0-17.js';
import { step017To018 } from '../src/migration/step-0-17-to-0-18.js';
import { step018To019 } from '../src/migration/step-0-18-to-0-19.js';
import { step019To020 } from '../src/migration/step-0-19-to-0-20.js';
import { step020To021 } from '../src/migration/step-0-20-to-0-21.js';
import { step021To022 } from '../src/migration/step-0-21-to-0-22.js';
import { step022To023 } from '../src/migration/step-0-22-to-0-23.js';
import type { CompositionV01 } from '../src/v0-1/composition-schema.js';
import type { CompositionV02 } from '../src/v0-2/composition-schema.js';
import type { CompositionV03 } from '../src/v0-3/composition-schema.js';
import type { CompositionV04 } from '../src/v0-4/composition-schema.js';
import type { CompositionV05 } from '../src/v0-5/composition-schema.js';
import type { CompositionV06 } from '../src/v0-6/composition-schema.js';
import type { CompositionV07 } from '../src/v0-7/composition-schema.js';
import type { CompositionV08 } from '../src/v0-8/composition-schema.js';
import type { CompositionV09 } from '../src/v0-9/composition-schema.js';
import type { CompositionV010 } from '../src/v0-10/composition-schema.js';
import type { CompositionV011 } from '../src/v0-11/composition-schema.js';
import type { CompositionV012 } from '../src/v0-12/composition-schema.js';
import type { CompositionV013 } from '../src/v0-13/composition-schema.js';
import type { CompositionV014 } from '../src/v0-14/composition-schema.js';
import type { CompositionV015 } from '../src/v0-15/composition-schema.js';
import type { CompositionV016 } from '../src/v0-16/composition-schema.js';
import type { CompositionV017 } from '../src/v0-17/composition-schema.js';
import type { CompositionV018 } from '../src/v0-18/composition-schema.js';
import type { CompositionV019 } from '../src/v0-19/composition-schema.js';
import type { CompositionV020 } from '../src/v0-20/composition-schema.js';
import type { CompositionV021 } from '../src/v0-21/composition-schema.js';
import type { CompositionV022 } from '../src/v0-22/composition-schema.js';
import { applyPatch } from './apply-patch.js';

/** `render.compositionHash` of the golden manifest while the reference was a 0.1 document. */
const REFERENCE_HASH_V01 =
  'sha256:fa3c3c3051acb473d8941c2286ea69df935ae6ee5d502ceeeebb9eeacabf0312';

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const fields = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${fields.join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(text: string): string {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

/** Every object and array reachable from a value, itself included. */
function objectsOf(value: unknown, into = new Set<object>()): Set<object> {
  if (typeof value === 'object' && value !== null) {
    into.add(value);
    for (const child of Object.values(value)) objectsOf(child, into);
  }
  return into;
}

/** Every string `id` of a document, in the order a depth-first walk meets them. */
function idsOf(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((item) => idsOf(item, into));
  else if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'id' && typeof child === 'string') into.push(child);
      else idsOf(child, into);
    }
  }
  return into;
}

function success(result: MigrationResult): Extract<MigrationResult, { ok: true }> {
  if (!result.ok) throw new Error(`Not migrated: ${JSON.stringify(result.errors)}`);
  return result;
}

function failure(result: MigrationResult): Extract<MigrationResult, { ok: false }> {
  if (result.ok) throw new Error('Migrated, but a failure was expected.');
  return result;
}

/** A mutable, unfrozen copy: the fixtures are frozen, and a write to them would throw. */
function copy(value: unknown): Record<string, unknown> {
  return structuredClone(value) as Record<string, unknown>;
}

/**
 * A node of a hand-written document as 0.10 (D63): an image gets the centred
 * focus right after its `fit`, and a group's children get theirs.
 */
function focused(node: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(node).flatMap(([key, value]): [string, unknown][] => {
      if (key === 'children') {
        return [[key, (value as Record<string, unknown>[]).map(focused)]];
      }
      if (key === 'fit') {
        return [
          [key, value],
          ['focus', { x: 500, y: 500 }],
        ];
      }
      return [[key, value]];
    }),
  );
}

/**
 * A node of a hand-written document as 0.12 (D67): its animations, and those of
 * a group's children, lose their interpolation, and every keyframe gets the
 * linear easing right after its value.
 */
function eased(node: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(node).map(([key, value]): [string, unknown] => {
      if (key === 'children') return [key, (value as Record<string, unknown>[]).map(eased)];
      if (key !== 'animations') return [key, value];
      const animations = value as Record<string, unknown>[];
      return [
        key,
        animations.map((animation) =>
          Object.fromEntries(
            Object.entries(animation).flatMap(([field, child]): [string, unknown][] => {
              if (field === 'interpolation') return [];
              if (field !== 'keyframes') return [[field, child]];
              const keyframes = child as Record<string, unknown>[];
              return [
                [
                  field,
                  keyframes.map((keyframe) =>
                    Object.fromEntries(
                      Object.entries(keyframe).flatMap(([name, item]): [string, unknown][] =>
                        name === 'value'
                          ? [
                              [name, item],
                              ['easing', { kind: 'linear' }],
                            ]
                          : [[name, item]],
                      ),
                    ),
                  ),
                ],
              ];
            }),
          ),
        ),
      ];
    }),
  );
}

/**
 * A hand-written document of 0.3 that nothing of the step to 0.4 touches, as
 * 0.17 (D52.6, D54.4, D56.4, D57, D58.5, D59.5, D63, D66, D67, D68, D69, D70, D71, D72): its version, and its one scene, whose keys must be
 * exactly `id` and `nodes`, with the composition's duration after its `id`,
 * the centred focus of every image, the linear easing of every keyframe and no
 * interpolation, and no clips and no transitions after its nodes, no
 * transitions of the composition after its clips, and an empty template
 * section after them.
 */
/**
 * A node of a hand-written document as 0.14 (D68, D69): a node with a scale,
 * and each child of a group, gets no rotation and the top-left corner as its
 * origin right after its scale; an image or a video gets no crop and no
 * rounded corners right after its focus; a background gets no animations
 * right after its colour; a text gets the plain style and no text animations
 * right after its colour.
 */
function moved(node: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(node).flatMap(([key, value]): [string, unknown][] => {
      if (key === 'children') return [[key, (value as Record<string, unknown>[]).map(moved)]];
      if (key === 'scale') {
        return [
          [key, value],
          ['rotation', 0],
          ['origin', { x: 0, y: 0 }],
        ];
      }
      if (key === 'focus') {
        return [
          [key, value],
          ['crop', { top: 0, right: 0, bottom: 0, left: 0 }],
          ['cornerRadius', 0],
        ];
      }
      if (key === 'color' && node['type'] === 'background') {
        return [
          [key, value],
          ['animations', []],
        ];
      }
      if (key === 'color' && node['type'] === 'text') {
        return [
          [key, value],
          ['style', { stroke: { kind: 'none' }, shadow: { kind: 'none' }, box: { kind: 'none' } }],
          ['textAnimations', []],
        ];
      }
      return [[key, value]];
    }),
  );
}

/** A document with the safe area of the whole canvas right after its height (D70). */
function withSafeArea<T extends object>(document: T): T {
  return Object.fromEntries(
    Object.entries(document).flatMap(([key, value]): [string, unknown][] =>
      key === 'height'
        ? [
            [key, value],
            ['safeArea', { fromTop: 0, fromRight: 0, fromBottom: 0, fromLeft: 0 }],
          ]
        : [[key, value]],
    ),
  ) as T;
}

/** The kinds of node that hold effects (D71). */
const EFFECT_HOLDERS = new Set(['image', 'video', 'text', 'captions', 'group']);

/** A node with no effects as its last key, and each child of a group the same (D71). */
function plain(node: Record<string, unknown>): Record<string, unknown> {
  const out = Object.fromEntries(
    Object.entries(node).map(([key, value]): [string, unknown] =>
      key === 'children' ? [key, (value as Record<string, unknown>[]).map(plain)] : [key, value],
    ),
  );
  return EFFECT_HOLDERS.has(node['type'] as string) ? { ...out, effects: [] } : out;
}

/**
 * A node of 0.19 with no mask, no matte, and the normal blend mode after its effects, and each
 * child of a group the same (D75).
 */
function unmasked(node: Record<string, unknown>): Record<string, unknown> {
  const out = Object.fromEntries(
    Object.entries(node).map(([key, value]): [string, unknown] =>
      key === 'children' ? [key, (value as Record<string, unknown>[]).map(unmasked)] : [key, value],
    ),
  );
  return EFFECT_HOLDERS.has(node['type'] as string)
    ? { ...out, mask: { kind: 'none' }, matte: { kind: 'none' }, blendMode: 'normal' }
    : out;
}

/** A Custom HTML node of 0.22 as 0.23 (D78): no fonts and no parameters after its html. */
function fonted(node: Record<string, unknown>): Record<string, unknown> {
  if (node['type'] !== 'custom-html') return node;
  return Object.fromEntries(
    Object.entries(node).flatMap(([key, value]) =>
      key === 'html'
        ? [
            [key, value],
            ['fontAssetIds', []],
            ['parameters', []],
          ]
        : [[key, value]],
    ),
  );
}

function as23(document: unknown): unknown {
  const source = document as {
    durationUs: number;
    scenes: { id: string; nodes: Record<string, unknown>[] }[];
  };
  return {
    ...withSafeArea(source),
    schemaVersion: '0.23',
    scenes: source.scenes.map((scene) => {
      expect(Object.keys(scene)).toEqual(['id', 'nodes']);
      return {
        id: scene.id,
        durationUs: source.durationUs,
        nodes: scene.nodes.map((node) => fonted(unmasked(plain(moved(eased(focused(node))))))),
        clips: [],
        transitions: [],
        effects: [],
      };
    }),
    transitions: [],
    definitions: [],
    template: { inputs: [], bindings: [], conditions: [], repeats: [] },
  };
}

/**
 * A hand-written document of 0.5 as 0.6 (D56.4): its version, an empty list of
 * transitions as the last key of every scene, and one as its own last key.
 */
function to06(document: unknown): unknown {
  const source = document as { scenes: Record<string, unknown>[] };
  expect(Object.keys(source).at(-1)).toBe('clips');
  return {
    ...source,
    schemaVersion: '0.6',
    scenes: source.scenes.map((scene) => {
      expect(Object.keys(scene).at(-1)).toBe('clips');
      return { ...scene, transitions: [] };
    }),
    transitions: [],
  };
}

describe('the evidence of the step, written before it (D35.5)', () => {
  it('holds the reference composition of 0.1 exactly as the golden manifest hashed it', () => {
    expect(sha256(canonicalJson(referenceCompositionV01))).toBe(REFERENCE_HASH_V01);
  });

  it('chains the pairs: the pair of 0.2 → 0.3 starts where the pair of 0.1 → 0.2 ends', () => {
    expect(JSON.stringify(migrationPair02To03.before)).toBe(
      JSON.stringify(migrationPair01To02.after),
    );
  });

  it('starts the pair of 0.3 → 0.4 from the end of the pair of 0.2 → 0.3, with sound added', () => {
    const before = migrationPair03To04.before as CompositionV03;
    const end = migrationPair02To03.after as CompositionV03;
    const ids = (document: CompositionV03): string[] => idsOf(document);
    const added = ids(before).filter((id) => !ids(end).includes(id));
    expect(added).toEqual([
      'pair-video',
      'pair-audio',
      'pair-child-video',
      'pair-video-node',
      'pair-clip',
    ]);
    expect(ids(end).every((id) => ids(before).includes(id))).toBe(true);
  });

  it('starts the pair of 0.4 → 0.5 where the pair of 0.3 → 0.4 ends', () => {
    expect(JSON.stringify(migrationPair04To05.before)).toBe(
      JSON.stringify(migrationPair03To04.after),
    );
  });

  it('starts the pair of 0.5 → 0.6 where the pair of 0.4 → 0.5 ends', () => {
    expect(JSON.stringify(migrationPair05To06.before)).toBe(
      JSON.stringify(migrationPair04To05.after),
    );
  });

  it('starts the pair of 0.6 → 0.7 where the pair of 0.5 → 0.6 ends', () => {
    expect(JSON.stringify(migrationPair06To07.before)).toBe(
      JSON.stringify(migrationPair05To06.after),
    );
  });

  it('starts the pair of 0.7 → 0.8 where the pair of 0.6 → 0.7 ends', () => {
    expect(JSON.stringify(migrationPair07To08.before)).toBe(
      JSON.stringify(migrationPair06To07.after),
    );
  });

  it('starts the pair of 0.8 → 0.9 where the pair of 0.7 → 0.8 ends', () => {
    expect(JSON.stringify(migrationPair08To09.before)).toBe(
      JSON.stringify(migrationPair07To08.after),
    );
  });

  it('starts the pair of 0.9 → 0.10 where the pair of 0.8 → 0.9 ends', () => {
    expect(JSON.stringify(migrationPair09To10.before)).toBe(
      JSON.stringify(migrationPair08To09.after),
    );
  });

  it('starts the pair of 0.10 → 0.11 where the pair of 0.9 → 0.10 ends', () => {
    expect(JSON.stringify(migrationPair010To011.before)).toBe(
      JSON.stringify(migrationPair09To10.after),
    );
  });

  it('starts the pair of 0.11 → 0.12 where the pair of 0.10 → 0.11 ends', () => {
    expect(JSON.stringify(migrationPair011To012.before)).toBe(
      JSON.stringify(migrationPair010To011.after),
    );
  });

  it('starts the pair of 0.12 → 0.13 where the pair of 0.11 → 0.12 ends', () => {
    expect(JSON.stringify(migrationPair012To013.before)).toBe(
      JSON.stringify(migrationPair011To012.after),
    );
  });

  it('starts the pair of 0.13 → 0.14 where the pair of 0.12 → 0.13 ends', () => {
    expect(JSON.stringify(migrationPair013To014.before)).toBe(
      JSON.stringify(migrationPair012To013.after),
    );
  });

  it('starts the pair of 0.14 → 0.15 where the pair of 0.13 → 0.14 ends', () => {
    expect(JSON.stringify(migrationPair014To015.before)).toBe(
      JSON.stringify(migrationPair013To014.after),
    );
  });

  it('starts the pair of 0.15 → 0.16 where the pair of 0.14 → 0.15 ends', () => {
    expect(JSON.stringify(migrationPair015To016.before)).toBe(
      JSON.stringify(migrationPair014To015.after),
    );
  });

  it('starts the pair of 0.16 → 0.17 where the pair of 0.15 → 0.16 ends', () => {
    expect(JSON.stringify(migrationPair016To017.before)).toBe(
      JSON.stringify(migrationPair015To016.after),
    );
  });

  it('starts the pair of 0.17 → 0.18 where the pair of 0.16 → 0.17 ends', () => {
    expect(JSON.stringify(migrationPair017To018.before)).toBe(
      JSON.stringify(migrationPair016To017.after),
    );
  });

  it('starts the pair of 0.18 → 0.19 where the pair of 0.17 → 0.18 ends', () => {
    expect(JSON.stringify(migrationPair018To019.before)).toBe(
      JSON.stringify(migrationPair017To018.after),
    );
  });

  it('starts the pair of 0.19 → 0.20 where the pair of 0.18 → 0.19 ends', () => {
    expect(JSON.stringify(migrationPair019To020.before)).toBe(
      JSON.stringify(migrationPair018To019.after),
    );
  });

  it('starts the pair of 0.20 → 0.21 where the pair of 0.19 → 0.20 ends', () => {
    expect(JSON.stringify(migrationPair020To021.before)).toBe(
      JSON.stringify(migrationPair019To020.after),
    );
  });

  it('starts the pair of 0.21 → 0.22 where the pair of 0.20 → 0.21 ends', () => {
    expect(JSON.stringify(migrationPair021To022.before)).toBe(
      JSON.stringify(migrationPair020To021.after),
    );
  });

  it('starts the pair of 0.22 → 0.23 where the pair of 0.21 → 0.22 ends', () => {
    expect(JSON.stringify(migrationPair022To023.before)).toBe(
      JSON.stringify(migrationPair021To022.after),
    );
  });

  it('holds documents the validators tell apart', () => {
    for (const current of [referenceComposition, migrationPair022To023.after]) {
      expect(validateComposition(current).ok).toBe(true);
    }
    for (const older of [
      referenceCompositionV01,
      migrationPair01To02.before,
      referenceCompositionV02,
      migrationPair02To03.before,
      referenceCompositionV03,
      migrationPair02To03.after,
      migrationPair03To04.before,
      referenceCompositionV04,
      migrationPair03To04.after,
      referenceCompositionV05,
      migrationPair04To05.after,
      referenceCompositionV06,
      migrationPair05To06.after,
      referenceCompositionV07,
      migrationPair06To07.after,
      referenceCompositionV08,
      migrationPair07To08.after,
      referenceCompositionV09,
      migrationPair08To09.after,
      referenceCompositionV010,
      migrationPair09To10.after,
      referenceCompositionV011,
      migrationPair010To011.after,
      referenceCompositionV012,
      migrationPair011To012.after,
      referenceCompositionV013,
      migrationPair012To013.after,
      referenceCompositionV014,
      migrationPair013To014.after,
      referenceCompositionV015,
      migrationPair014To015.after,
      referenceCompositionV016,
      migrationPair015To016.after,
      referenceCompositionV017,
      migrationPair016To017.after,
      referenceCompositionV018,
      migrationPair017To018.after,
      referenceCompositionV019,
      migrationPair018To019.after,
      referenceCompositionV020,
      migrationPair019To020.after,
      referenceCompositionV021,
      migrationPair020To021.after,
      referenceCompositionV022,
      migrationPair021To022.after,
    ]) {
      const result = validateComposition(older);
      expect(result.ok ? [] : result.errors.map(({ code }) => code)).toEqual([
        'unsupported-schema-version',
      ]);
    }
  });
});

describe('the step 0.1 → 0.2 (D42.7)', () => {
  it.each([
    ['the hand-written pair', migrationPair01To02.before, migrationPair01To02.after],
    ['the reference composition', referenceCompositionV01, referenceCompositionV02],
  ])(
    'carries %s to its hand-written result, key for key and in their order',
    (_, before, after) => {
      const result = step01To02(before as CompositionV01);
      expect(JSON.stringify(result)).toBe(JSON.stringify(after));
    },
  );

  it.each([
    ['the hand-written pair', migrationPair01To02.before, as23(migrationPair02To03.after)],
    ['the reference composition', referenceCompositionV01, referenceComposition],
  ])('carries %s through every step to its hand-written result of 0.23', (_, before, after) => {
    const result = success(migrateComposition(before));
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
    expect(result.versions).toEqual([
      '0.1',
      '0.2',
      '0.3',
      '0.4',
      '0.5',
      '0.6',
      '0.7',
      '0.8',
      '0.9',
      '0.10',
      '0.11',
      '0.12',
      '0.13',
      '0.14',
      '0.15',
      '0.16',
      '0.17',
      '0.18',
      '0.19',
      '0.20',
      '0.21',
      '0.22',
      '0.23',
    ]);
    expect(validateComposition(result.composition).ok).toBe(true);
  });

  it('gives every node and every child the lifetime of the composition, and nothing else', () => {
    const composition = step01To02(migrationPair01To02.before as CompositionV01) as CompositionV02;
    const nodes = composition.scenes.flatMap((scene) =>
      scene.nodes.flatMap((node) => [node, ...(node.type === 'group' ? node.children : [])]),
    );
    expect(nodes).toHaveLength(6);
    for (const node of nodes) {
      expect({ startUs: node.startUs, durationUs: node.durationUs }, node.id).toEqual({
        startUs: 0,
        durationUs: 3_000_000,
      });
      // Directly after `type`, wherever `type` stands (D42.7).
      const keys = Object.keys(node);
      expect(keys.slice(keys.indexOf('type'), keys.indexOf('type') + 3), node.id).toEqual([
        'type',
        'startUs',
        'durationUs',
      ]);
    }
    // Without the two fields and the version, the document is the input, key for key.
    const stripped = JSON.parse(
      JSON.stringify(composition, (key, value: unknown) =>
        key === 'startUs' || key === 'durationUs' ? undefined : value,
      ),
    ) as Record<string, unknown>;
    const before = JSON.parse(
      JSON.stringify(migrationPair01To02.before, (key, value: unknown) =>
        key === 'startUs' || key === 'durationUs' ? undefined : value,
      ),
    ) as Record<string, unknown>;
    expect(JSON.stringify({ ...stripped, schemaVersion: '0.1' })).toBe(JSON.stringify(before));
  });

  it('keeps every ID and its place', () => {
    for (const before of [
      migrationPair01To02.before,
      referenceCompositionV01,
      referenceCompositionV02,
      referenceCompositionV03,
      migrationPair03To04.before,
      referenceCompositionV04,
      migrationPair04To05.before,
    ]) {
      const { composition } = success(migrateComposition(before));
      expect(idsOf(composition)).toEqual(idsOf(before));
    }
  });

  it('never writes its input, and shares no object with it at any depth', () => {
    const input = copy(migrationPair01To02.before);
    const text = JSON.stringify(input);
    const { composition } = success(migrateComposition(input));
    expect(JSON.stringify(input)).toBe(text);
    const mine = objectsOf(input);
    expect([...mine].filter((object) => Object.isFrozen(object))).toEqual([]);
    // The premise: both trees have objects several levels down.
    expect(mine.size).toBeGreaterThan(30);
    expect([...objectsOf(composition)].filter((object) => mine.has(object))).toEqual([]);
  });

  it('carries a -0 as it is, which a round trip through JSON text would lose', () => {
    const input = copy(migrationPair01To02.before) as {
      scenes: { nodes: { position?: { x: number } }[] }[];
    };
    const position = input.scenes[0]?.nodes[1]?.position;
    if (position === undefined) throw new Error('No position.');
    position.x = -0;
    const { composition } = success(migrateComposition(input));
    const migrated = composition.scenes[0]?.nodes[1];
    if (migrated === undefined || migrated.type === 'background') throw new Error('No group.');
    expect(Object.is(migrated.position.x, -0)).toBe(true);
  });

  it('is deterministic: the same input gives the same document every time', () => {
    const first = JSON.stringify(step01To02(migrationPair01To02.before as CompositionV01));
    const second = JSON.stringify(step01To02(migrationPair01To02.before as CompositionV01));
    expect(second).toBe(first);
  });
});

describe('the step 0.2 → 0.3 (D50.7)', () => {
  it.each([
    ['the hand-written pair', migrationPair02To03.before, migrationPair02To03.after],
    ['the reference composition', referenceCompositionV02, referenceCompositionV03],
  ])(
    'carries %s to its hand-written result, key for key and in their order',
    (_, before, after) => {
      expect(JSON.stringify(step02To03(before as CompositionV02))).toBe(JSON.stringify(after));
    },
  );

  it.each([
    ['the hand-written pair', migrationPair02To03.before, as23(migrationPair02To03.after)],
    ['the reference composition', referenceCompositionV02, referenceComposition],
  ])('carries %s on to its hand-written result of 0.23', (_, before, after) => {
    const result = success(migrateComposition(before));
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
    expect(result.versions).toEqual([
      '0.2',
      '0.3',
      '0.4',
      '0.5',
      '0.6',
      '0.7',
      '0.8',
      '0.9',
      '0.10',
      '0.11',
      '0.12',
      '0.13',
      '0.14',
      '0.15',
      '0.16',
      '0.17',
      '0.18',
      '0.19',
      '0.20',
      '0.21',
      '0.22',
      '0.23',
    ]);
  });

  it('gives every image, at any depth, fit "fill" as its last key, and nothing else', () => {
    const composition = step02To03(migrationPair02To03.before as CompositionV02) as CompositionV03;
    const nodes = composition.scenes.flatMap((scene) =>
      scene.nodes.flatMap((node) => [node, ...(node.type === 'group' ? node.children : [])]),
    );
    const images = nodes.filter((node) => node.type === 'image');
    expect(images.length).toBeGreaterThan(0);
    for (const node of nodes) {
      const keys = Object.keys(node);
      if (node.type === 'image') {
        expect(keys.at(-1), node.id).toBe('fit');
        expect(node.fit).toBe('fill');
      } else {
        expect(keys, node.id).not.toContain('fit');
      }
    }
    const stripped = JSON.stringify(composition, (key, value: unknown) =>
      key === 'fit' ? undefined : value,
    );
    expect(stripped).toBe(
      JSON.stringify({ ...(migrationPair02To03.before as object), schemaVersion: '0.3' }),
    );
  });

  it('changes no time value of the reference composition (D49.7)', () => {
    const times = (value: unknown): number[] =>
      JSON.stringify(value)
        .match(/"(?:startUs|durationUs|timeUs|sourceStartUs)":-?[0-9.e+]+/g)
        ?.map((entry) => Number(entry.split(':')[1])) ?? [];
    const composition = step02To03(referenceCompositionV02 as CompositionV02);
    expect(times(composition)).toEqual(times(referenceCompositionV02));
    expect(times(composition).length).toBeGreaterThan(10);
  });

  it('never writes its input, and shares no object with it at any depth', () => {
    const input = copy(migrationPair02To03.before);
    const text = JSON.stringify(input);
    const result = step02To03(input as unknown as CompositionV02);
    expect(JSON.stringify(input)).toBe(text);
    const mine = objectsOf(input);
    expect([...objectsOf(result)].filter((object) => mine.has(object))).toEqual([]);
  });
});

describe('the step 0.3 → 0.4 (D52.6)', () => {
  it.each([
    ['the hand-written pair', migrationPair03To04.before, migrationPair03To04.after],
    ['the reference composition', referenceCompositionV03, referenceCompositionV04],
  ])(
    'carries %s to its hand-written result, key for key and in their order',
    (_, before, after) => {
      expect(JSON.stringify(step03To04(before as CompositionV03))).toBe(JSON.stringify(after));
    },
  );

  it.each([
    ['the hand-written pair', migrationPair03To04.before, migrationPair022To023.after],
    ['the reference composition', referenceCompositionV03, referenceComposition],
  ])('carries %s on to its hand-written result of 0.23', (_, before, after) => {
    const result = success(migrateComposition(before));
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
    expect(result.versions).toEqual([
      '0.3',
      '0.4',
      '0.5',
      '0.6',
      '0.7',
      '0.8',
      '0.9',
      '0.10',
      '0.11',
      '0.12',
      '0.13',
      '0.14',
      '0.15',
      '0.16',
      '0.17',
      '0.18',
      '0.19',
      '0.20',
      '0.21',
      '0.22',
      '0.23',
    ]);
  });

  it('silences every video at any depth and gives every clip its source start, unity volume, and no fades, as its last keys', () => {
    const composition = step03To04(migrationPair03To04.before as CompositionV03) as CompositionV04;
    const nodes = composition.scenes.flatMap((scene) =>
      scene.nodes.flatMap((node) => [node, ...(node.type === 'group' ? node.children : [])]),
    );
    const videos = nodes.filter((node) => node.type === 'video');
    expect(videos).toHaveLength(2);
    for (const node of nodes) {
      const keys = Object.keys(node);
      if (node.type === 'video') {
        expect(keys.at(-1), node.id).toBe('volume');
        expect(node.volume).toBe(0);
      } else {
        expect(keys, node.id).not.toContain('volume');
      }
    }
    expect(composition.clips).toHaveLength(1);
    for (const clip of composition.clips) {
      expect(Object.keys(clip).slice(-4)).toEqual([
        'sourceStartUs',
        'volume',
        'fadeInUs',
        'fadeOutUs',
      ]);
      expect([clip.sourceStartUs, clip.volume, clip.fadeInUs, clip.fadeOutUs]).toEqual([
        0, 1, 0, 0,
      ]);
    }
    const added = new Set(['volume', 'sourceStartUs', 'fadeInUs', 'fadeOutUs']);
    const stripped = JSON.stringify(composition, (key, value: unknown) =>
      added.has(key) && typeof value === 'number' && key !== 'sourceStartUs' ? undefined : value,
    );
    // sourceStartUs of the video nodes was there before; only the clip's is new.
    const before = migrationPair03To04.before as CompositionV03;
    const expected = JSON.parse(JSON.stringify({ ...before, schemaVersion: '0.4' })) as {
      clips: Record<string, unknown>[];
    };
    for (const clip of expected.clips) clip['sourceStartUs'] = 0;
    expect(stripped).toBe(JSON.stringify(expected));
  });

  it('changes no time value of the reference composition (D49.7)', () => {
    const times = (value: unknown): number[] =>
      JSON.stringify(value)
        .match(/"(?:startUs|durationUs|timeUs)":-?[0-9.e+]+/g)
        ?.map((entry) => Number(entry.split(':')[1])) ?? [];
    const composition = step03To04(referenceCompositionV03 as CompositionV03);
    expect(times(composition)).toEqual(times(referenceCompositionV03));
    expect(times(composition).length).toBeGreaterThan(10);
  });

  it('never writes its input, and shares no object with it at any depth', () => {
    const input = copy(migrationPair03To04.before);
    const text = JSON.stringify(input);
    const result = step03To04(input as unknown as CompositionV03);
    expect(JSON.stringify(input)).toBe(text);
    const mine = objectsOf(input);
    expect([...objectsOf(result)].filter((object) => mine.has(object))).toEqual([]);
  });
});

describe('the step 0.4 → 0.5 (D54.4)', () => {
  it.each([
    ['the hand-written pair', migrationPair04To05.before, migrationPair04To05.after],
    ['the reference composition', referenceCompositionV04, referenceCompositionV05],
  ])(
    'carries %s to its hand-written result, key for key and in their order',
    (_, before, after) => {
      expect(JSON.stringify(step04To05(before as CompositionV04))).toBe(JSON.stringify(after));
    },
  );

  it.each([
    ['the hand-written pair', migrationPair04To05.before, migrationPair022To023.after],
    ['the reference composition', referenceCompositionV04, referenceComposition],
  ])('carries %s on to its hand-written result of 0.23', (_, before, after) => {
    const result = success(migrateComposition(before));
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
    expect(result.versions).toEqual([
      '0.4',
      '0.5',
      '0.6',
      '0.7',
      '0.8',
      '0.9',
      '0.10',
      '0.11',
      '0.12',
      '0.13',
      '0.14',
      '0.15',
      '0.16',
      '0.17',
      '0.18',
      '0.19',
      '0.20',
      '0.21',
      '0.22',
      '0.23',
    ]);
  });

  it("gives the one scene the composition's duration after its id and no clips as its last key, and nothing else", () => {
    const composition = step04To05(migrationPair04To05.before as CompositionV04) as CompositionV05;
    expect(composition.scenes).toHaveLength(1);
    for (const scene of composition.scenes) {
      const keys = Object.keys(scene);
      expect(keys[keys.indexOf('id') + 1]).toBe('durationUs');
      expect(keys.at(-1)).toBe('clips');
      expect(scene.durationUs).toBe(composition.durationUs);
      expect(scene.clips).toEqual([]);
    }
    const stripped = JSON.parse(
      JSON.stringify(composition, function (this: unknown, key, value: unknown) {
        // Only the two keys of a scene are new; every node keeps its own durationUs.
        const holder = this as Record<string, unknown> | undefined;
        const isScene = holder !== undefined && 'nodes' in holder;
        return isScene && (key === 'durationUs' || key === 'clips') ? undefined : value;
      }),
    ) as Record<string, unknown>;
    expect(JSON.stringify({ ...stripped, schemaVersion: '0.4' })).toBe(
      JSON.stringify(migrationPair04To05.before),
    );
  });

  it('changes no time value of the reference composition (D49.7)', () => {
    const times = (value: unknown): number[] =>
      JSON.stringify(value, (key, child: unknown) => (key === 'scenes' ? undefined : child))
        .match(/"(?:startUs|durationUs|timeUs|sourceStartUs)":-?[0-9.e+]+/g)
        ?.map((entry) => Number(entry.split(':')[1])) ?? [];
    const nodeTimes = (value: unknown): number[] =>
      JSON.stringify((value as { scenes: { nodes: unknown }[] }).scenes.map(({ nodes }) => nodes))
        .match(/"(?:startUs|durationUs|timeUs|sourceStartUs)":-?[0-9.e+]+/g)
        ?.map((entry) => Number(entry.split(':')[1])) ?? [];
    const composition = step04To05(referenceCompositionV04 as CompositionV04);
    expect(times(composition)).toEqual(times(referenceCompositionV04));
    expect(nodeTimes(composition)).toEqual(nodeTimes(referenceCompositionV04));
    expect(nodeTimes(composition).length).toBeGreaterThan(10);
  });

  it('never writes its input, and shares no object with it at any depth', () => {
    const input = copy(migrationPair04To05.before);
    const text = JSON.stringify(input);
    const result = step04To05(input as unknown as CompositionV04);
    expect(JSON.stringify(input)).toBe(text);
    const mine = objectsOf(input);
    expect([...objectsOf(result)].filter((object) => mine.has(object))).toEqual([]);
  });
});

describe('the step 0.5 → 0.6 (D56.4)', () => {
  it.each([
    ['the hand-written pair', migrationPair05To06.before, migrationPair05To06.after],
    ['the reference composition', referenceCompositionV05, referenceCompositionV06],
  ])(
    'carries %s to its hand-written result, key for key and in their order',
    (_, before, after) => {
      expect(JSON.stringify(step05To06(before as CompositionV05))).toBe(JSON.stringify(after));
      expect(JSON.stringify(after)).toBe(JSON.stringify(to06(before)));
    },
  );

  it.each([
    ['the hand-written pair', migrationPair05To06.before, migrationPair022To023.after],
    ['the reference composition', referenceCompositionV05, referenceComposition],
  ])('carries %s on to its hand-written result of 0.23', (_, before, after) => {
    const result = success(migrateComposition(before));
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
    expect(result.versions).toEqual([
      '0.5',
      '0.6',
      '0.7',
      '0.8',
      '0.9',
      '0.10',
      '0.11',
      '0.12',
      '0.13',
      '0.14',
      '0.15',
      '0.16',
      '0.17',
      '0.18',
      '0.19',
      '0.20',
      '0.21',
      '0.22',
      '0.23',
    ]);
  });

  it('adds an empty list of transitions as the last key of every scene and of the composition, and nothing else', () => {
    const composition = step05To06(migrationPair05To06.before as CompositionV05) as CompositionV06;
    expect(Object.keys(composition).at(-1)).toBe('transitions');
    expect(composition.transitions).toEqual([]);
    for (const scene of composition.scenes) {
      expect(Object.keys(scene).at(-1)).toBe('transitions');
      expect(scene.transitions).toEqual([]);
    }
    const stripped = JSON.parse(
      JSON.stringify(composition, (key, value: unknown) =>
        key === 'transitions' ? undefined : value,
      ),
    ) as Record<string, unknown>;
    expect(JSON.stringify({ ...stripped, schemaVersion: '0.5' })).toBe(
      JSON.stringify(migrationPair05To06.before),
    );
  });

  it('changes no time value of the reference composition (D49.7)', () => {
    const times = (value: unknown): number[] =>
      JSON.stringify(value)
        .match(/"(?:startUs|durationUs|timeUs|sourceStartUs)":-?[0-9.e+]+/g)
        ?.map((entry) => Number(entry.split(':')[1])) ?? [];
    const composition = step05To06(referenceCompositionV05 as CompositionV05);
    expect(times(composition)).toEqual(times(referenceCompositionV05));
    expect(times(composition).length).toBeGreaterThan(10);
  });

  it('never writes its input, and shares no object with it at any depth', () => {
    const input = copy(migrationPair05To06.before);
    const text = JSON.stringify(input);
    const result = step05To06(input as unknown as CompositionV05);
    expect(JSON.stringify(input)).toBe(text);
    const mine = objectsOf(input);
    expect([...objectsOf(result)].filter((object) => mine.has(object))).toEqual([]);
  });
});

describe('the step 0.6 → 0.7 (D57)', () => {
  it.each([
    ['the hand-written pair', migrationPair06To07.before, migrationPair06To07.after],
    ['the reference composition', referenceCompositionV06, referenceCompositionV07],
  ])(
    'carries %s to its hand-written result, key for key and in their order',
    (_, before, after) => {
      expect(JSON.stringify(step06To07(before as CompositionV06))).toBe(JSON.stringify(after));
    },
  );

  it.each([
    ['the hand-written pair', migrationPair06To07.before, migrationPair022To023.after],
    ['the reference composition', referenceCompositionV06, referenceComposition],
  ])('carries %s on to its hand-written result of 0.23', (_, before, after) => {
    const result = success(migrateComposition(before));
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
    expect(result.versions).toEqual([
      '0.6',
      '0.7',
      '0.8',
      '0.9',
      '0.10',
      '0.11',
      '0.12',
      '0.13',
      '0.14',
      '0.15',
      '0.16',
      '0.17',
      '0.18',
      '0.19',
      '0.20',
      '0.21',
      '0.22',
      '0.23',
    ]);
  });

  it('changes the version and nothing else', () => {
    const result = step06To07(referenceCompositionV06 as CompositionV06);
    expect(JSON.stringify({ ...(result as object), schemaVersion: '0.6' })).toBe(
      JSON.stringify(referenceCompositionV06),
    );
  });

  it('never writes its input, and shares no object with it at any depth', () => {
    const input = copy(migrationPair06To07.before);
    const text = JSON.stringify(input);
    const result = step06To07(input as unknown as CompositionV06);
    expect(JSON.stringify(input)).toBe(text);
    const mine = objectsOf(input);
    expect([...objectsOf(result)].filter((object) => mine.has(object))).toEqual([]);
  });
});

describe('the step 0.7 → 0.8 (D58.5)', () => {
  it.each([
    ['the hand-written pair', migrationPair07To08.before, migrationPair07To08.after],
    ['the reference composition', referenceCompositionV07, referenceCompositionV08],
  ])(
    'carries %s to its hand-written result, key for key and in their order',
    (_, before, after) => {
      expect(JSON.stringify(step07To08(before as CompositionV07))).toBe(JSON.stringify(after));
    },
  );

  it.each([
    ['the hand-written pair', migrationPair07To08.before, migrationPair022To023.after],
    ['the reference composition', referenceCompositionV07, referenceComposition],
  ])('carries %s on to its hand-written result of 0.23', (_, before, after) => {
    const result = success(migrateComposition(before));
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
    expect(result.versions).toEqual([
      '0.7',
      '0.8',
      '0.9',
      '0.10',
      '0.11',
      '0.12',
      '0.13',
      '0.14',
      '0.15',
      '0.16',
      '0.17',
      '0.18',
      '0.19',
      '0.20',
      '0.21',
      '0.22',
      '0.23',
    ]);
  });

  it('changes the version and adds an empty template section as the last key, and nothing else', () => {
    const result = step07To08(referenceCompositionV07 as CompositionV07) as Record<string, unknown>;
    expect(Object.keys(result).at(-1)).toBe('template');
    expect(result['template']).toEqual({ inputs: [], bindings: [] });
    const rest = { ...result };
    delete rest['template'];
    expect(JSON.stringify({ ...rest, schemaVersion: '0.7' })).toBe(
      JSON.stringify(referenceCompositionV07),
    );
  });

  it('never writes its input, and shares no object with it at any depth', () => {
    const input = copy(migrationPair07To08.before);
    const text = JSON.stringify(input);
    const result = step07To08(input as unknown as CompositionV07);
    expect(JSON.stringify(input)).toBe(text);
    const mine = objectsOf(input);
    expect([...objectsOf(result)].filter((object) => mine.has(object))).toEqual([]);
  });
});

describe('the step 0.8 → 0.9 (D59.5)', () => {
  it.each([
    ['the hand-written pair', migrationPair08To09.before, migrationPair08To09.after],
    ['the reference composition', referenceCompositionV08, referenceCompositionV09],
  ])(
    'carries %s to its hand-written result, key for key and in their order',
    (_, before, after) => {
      expect(JSON.stringify(step08To09(before as CompositionV08))).toBe(JSON.stringify(after));
    },
  );

  it.each([
    ['the hand-written pair', migrationPair08To09.before, migrationPair022To023.after],
    ['the reference composition', referenceCompositionV08, referenceComposition],
  ])('carries %s on to its hand-written result of 0.23', (_, before, after) => {
    const result = success(migrateComposition(before));
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
    expect(result.versions).toEqual([
      '0.8',
      '0.9',
      '0.10',
      '0.11',
      '0.12',
      '0.13',
      '0.14',
      '0.15',
      '0.16',
      '0.17',
      '0.18',
      '0.19',
      '0.20',
      '0.21',
      '0.22',
      '0.23',
    ]);
  });

  it('changes the version and adds empty conditions and repeats to the template section, and nothing else', () => {
    const result = step08To09(referenceCompositionV08 as CompositionV08) as Record<string, unknown>;
    expect(Object.keys(result).at(-1)).toBe('template');
    expect(JSON.stringify(result['template'])).toBe(
      JSON.stringify({ inputs: [], bindings: [], conditions: [], repeats: [] }),
    );
    expect(
      JSON.stringify({ ...result, schemaVersion: '0.8', template: { inputs: [], bindings: [] } }),
    ).toBe(JSON.stringify(referenceCompositionV08));
  });

  it('keeps the inputs and bindings of a template of 0.8 as they are', () => {
    const template = copy(referenceCompositionV08);
    template['template'] = {
      inputs: [{ id: 'headline', type: 'text', minLength: 0, maxLength: 9, default: '' }],
      bindings: [],
    };
    const result = step08To09(template as unknown as CompositionV08) as Record<string, unknown>;
    expect(JSON.stringify(result['template'])).toBe(
      JSON.stringify({ ...(template['template'] as object), conditions: [], repeats: [] }),
    );
  });

  it('never writes its input, and shares no object with it at any depth', () => {
    const input = copy(migrationPair08To09.before);
    const text = JSON.stringify(input);
    const result = step08To09(input as unknown as CompositionV08);
    expect(JSON.stringify(input)).toBe(text);
    const mine = objectsOf(input);
    expect([...objectsOf(result)].filter((object) => mine.has(object))).toEqual([]);
  });
});

describe('the step 0.9 → 0.10 (D63)', () => {
  it.each([
    ['the hand-written pair', migrationPair09To10.before, migrationPair09To10.after],
    ['the reference composition', referenceCompositionV09, referenceCompositionV010],
  ])(
    'carries %s to its hand-written result, key for key and in their order',
    (_, before, after) => {
      expect(JSON.stringify(step09To10(before as CompositionV09))).toBe(JSON.stringify(after));
    },
  );

  it.each([
    ['the hand-written pair', migrationPair09To10.before, migrationPair022To023.after],
    ['the reference composition', referenceCompositionV09, referenceComposition],
  ])('carries %s on to its hand-written result of 0.23', (_, before, after) => {
    const result = success(migrateComposition(before));
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
    expect(result.versions).toEqual([
      '0.9',
      '0.10',
      '0.11',
      '0.12',
      '0.13',
      '0.14',
      '0.15',
      '0.16',
      '0.17',
      '0.18',
      '0.19',
      '0.20',
      '0.21',
      '0.22',
      '0.23',
    ]);
  });

  it('gives every image and video, at any depth, the centre as its focus right after its fit, and nothing else', () => {
    const result = step09To10(migrationPair09To10.before as CompositionV09) as {
      scenes: { nodes: Record<string, unknown>[] }[];
    };
    const nodes = result.scenes.flatMap((scene) =>
      scene.nodes.flatMap((node) => [
        node,
        ...((node['children'] as Record<string, unknown>[] | undefined) ?? []),
      ]),
    );
    const pictures = nodes.filter((node) => node['type'] === 'image' || node['type'] === 'video');
    // The premise: the pair has an image in a group, a video, and a video in a group.
    expect(pictures.map((node) => node['type']).sort()).toEqual(['image', 'video', 'video']);
    for (const node of nodes) {
      const keys = Object.keys(node);
      if (node['type'] === 'image' || node['type'] === 'video') {
        expect(keys[keys.indexOf('fit') + 1], String(node['id'])).toBe('focus');
        expect(node['focus']).toEqual({ x: 500, y: 500 });
      } else {
        expect(keys, String(node['id'])).not.toContain('focus');
      }
    }
    const stripped = JSON.stringify(result, (key, value: unknown) =>
      key === 'focus' ? undefined : value,
    );
    expect(stripped).toBe(
      JSON.stringify({ ...(migrationPair09To10.before as object), schemaVersion: '0.10' }),
    );
  });

  it('never writes its input, and shares no object with it at any depth', () => {
    const input = copy(migrationPair09To10.before);
    const text = JSON.stringify(input);
    const result = step09To10(input as unknown as CompositionV09);
    expect(JSON.stringify(input)).toBe(text);
    const mine = objectsOf(input);
    expect([...objectsOf(result)].filter((object) => mine.has(object))).toEqual([]);
  });
});

describe('the step 0.10 → 0.11 (D66)', () => {
  it.each([
    ['the hand-written pair', migrationPair010To011.before, migrationPair010To011.after],
    ['the reference composition', referenceCompositionV010, referenceCompositionV011],
  ])(
    'carries %s to its hand-written result, key for key and in their order',
    (_, before, after) => {
      expect(JSON.stringify(step010To011(before as CompositionV010))).toBe(JSON.stringify(after));
    },
  );

  it.each([
    ['the hand-written pair', migrationPair010To011.before, migrationPair022To023.after],
    ['the reference composition', referenceCompositionV010, referenceComposition],
  ])('carries %s on to its hand-written result of 0.23', (_, before, after) => {
    const result = success(migrateComposition(before));
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
    expect(result.versions).toEqual([
      '0.10',
      '0.11',
      '0.12',
      '0.13',
      '0.14',
      '0.15',
      '0.16',
      '0.17',
      '0.18',
      '0.19',
      '0.20',
      '0.21',
      '0.22',
      '0.23',
    ]);
  });

  it('changes the version and nothing else: every effect of 0.10 means the same in 0.11', () => {
    const result = step010To011(referenceCompositionV010 as CompositionV010);
    expect(JSON.stringify(result)).toBe(
      JSON.stringify({ ...(referenceCompositionV010 as object), schemaVersion: '0.11' }),
    );
  });

  it('never writes its input, and shares no object with it at any depth', () => {
    const input = copy(migrationPair010To011.before);
    const text = JSON.stringify(input);
    const result = step010To011(input as unknown as CompositionV010);
    expect(JSON.stringify(input)).toBe(text);
    const mine = objectsOf(input);
    expect([...objectsOf(result)].filter((object) => mine.has(object))).toEqual([]);
  });
});

describe('the step 0.11 → 0.12 (D67)', () => {
  it.each([
    ['the hand-written pair', migrationPair011To012.before, migrationPair011To012.after],
    ['the reference composition', referenceCompositionV011, referenceCompositionV012],
  ])(
    'carries %s to its hand-written result, key for key and in their order',
    (_, before, after) => {
      expect(JSON.stringify(step011To012(before as CompositionV011))).toBe(JSON.stringify(after));
    },
  );

  it.each([
    ['the hand-written pair', migrationPair011To012.before, migrationPair022To023.after],
    ['the reference composition', referenceCompositionV011, referenceComposition],
  ])('carries %s on to its hand-written result of 0.23', (_, before, after) => {
    const result = success(migrateComposition(before));
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
    expect(result.versions).toEqual([
      '0.11',
      '0.12',
      '0.13',
      '0.14',
      '0.15',
      '0.16',
      '0.17',
      '0.18',
      '0.19',
      '0.20',
      '0.21',
      '0.22',
      '0.23',
    ]);
  });

  it('eases every keyframe and every transition linearly, drops the interpolation, and changes nothing else', () => {
    const transitions = compatibilityCorpus.find(({ id }) => id === 'transitions-0-11')?.input;
    const result = step011To012(transitions as CompositionV011) as {
      scenes: { transitions: Record<string, unknown>[] }[];
      transitions: Record<string, unknown>[];
    };
    const sides = [...result.transitions, ...result.scenes.flatMap((scene) => scene.transitions)];
    expect(sides.length).toBeGreaterThan(1);
    for (const transition of sides) {
      const keys = Object.keys(transition);
      expect(keys[keys.indexOf('effect') + 1]).toBe('easing');
      expect(transition['easing']).toEqual({ kind: 'linear' });
    }
    expect(JSON.stringify(result)).not.toContain('interpolation');
  });

  it('never writes its input, and shares no object with it at any depth', () => {
    const input = copy(migrationPair011To012.before);
    const text = JSON.stringify(input);
    const result = step011To012(input as unknown as CompositionV011);
    expect(JSON.stringify(input)).toBe(text);
    const mine = objectsOf(input);
    expect([...objectsOf(result)].filter((object) => mine.has(object))).toEqual([]);
  });
});

describe('the step 0.12 → 0.13 (D68)', () => {
  it.each([
    ['the hand-written pair', migrationPair012To013.before, migrationPair012To013.after],
    ['the reference composition', referenceCompositionV012, referenceCompositionV013],
  ])(
    'carries %s to its hand-written result, key for key and in their order',
    (_, before, after) => {
      expect(JSON.stringify(step012To013(before as CompositionV012))).toBe(JSON.stringify(after));
    },
  );

  it.each([
    ['the hand-written pair', migrationPair012To013.before, migrationPair022To023.after],
    ['the reference composition', referenceCompositionV012, referenceComposition],
  ])('carries %s on to its hand-written result of 0.23', (_, before, after) => {
    const result = success(migrateComposition(before));
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
    expect(result.versions).toEqual([
      '0.12',
      '0.13',
      '0.14',
      '0.15',
      '0.16',
      '0.17',
      '0.18',
      '0.19',
      '0.20',
      '0.21',
      '0.22',
      '0.23',
    ]);
  });

  it('places every transformed node about its top-left corner, unrotated, with whole pictures and square corners', () => {
    const video = compatibilityCorpus.find(({ id }) => id === 'video-0-12')?.input;
    const result = step012To013(video as CompositionV012) as {
      scenes: { nodes: Record<string, unknown>[] }[];
    };
    const nodes = result.scenes.flatMap((scene) =>
      scene.nodes.flatMap((node) => [node, ...((node['children'] ?? []) as typeof scene.nodes)]),
    );
    const pictures = nodes.filter(({ type }) => type === 'image' || type === 'video');
    expect(pictures.length).toBeGreaterThan(1);
    for (const node of nodes) {
      const keys = Object.keys(node);
      if (node['type'] === 'background') {
        expect(keys[keys.indexOf('color') + 1]).toBe('animations');
        expect(node['animations']).toEqual([]);
        continue;
      }
      expect(keys.slice(keys.indexOf('scale') + 1, keys.indexOf('scale') + 3)).toEqual([
        'rotation',
        'origin',
      ]);
      expect([node['rotation'], node['origin']]).toEqual([0, { x: 0, y: 0 }]);
    }
    for (const node of pictures) {
      const keys = Object.keys(node);
      expect(keys.slice(keys.indexOf('focus') + 1, keys.indexOf('focus') + 3)).toEqual([
        'crop',
        'cornerRadius',
      ]);
      expect([node['crop'], node['cornerRadius']]).toEqual([
        { top: 0, right: 0, bottom: 0, left: 0 },
        0,
      ]);
    }
  });

  it('never writes its input, and shares no object with it at any depth', () => {
    const input = copy(migrationPair012To013.before);
    const text = JSON.stringify(input);
    const result = step012To013(input as unknown as CompositionV012);
    expect(JSON.stringify(input)).toBe(text);
    const mine = objectsOf(input);
    expect([...objectsOf(result)].filter((object) => mine.has(object))).toEqual([]);
  });
});

describe('the step 0.13 → 0.14 (D69)', () => {
  it.each([
    ['the hand-written pair', migrationPair013To014.before, migrationPair013To014.after],
    ['the reference composition', referenceCompositionV013, referenceCompositionV014],
  ])(
    'carries %s to its hand-written result, key for key and in their order',
    (_, before, after) => {
      expect(JSON.stringify(step013To014(before as CompositionV013))).toBe(JSON.stringify(after));
    },
  );

  it.each([
    ['the hand-written pair', migrationPair013To014.before, migrationPair022To023.after],
    ['the reference composition', referenceCompositionV013, referenceComposition],
  ])('carries %s on to its hand-written result of 0.23', (_, before, after) => {
    const result = success(migrateComposition(before));
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
    expect(result.versions).toEqual([
      '0.13',
      '0.14',
      '0.15',
      '0.16',
      '0.17',
      '0.18',
      '0.19',
      '0.20',
      '0.21',
      '0.22',
      '0.23',
    ]);
  });

  it('draws every text in one piece, plain, and changes nothing else', () => {
    const scenes = compatibilityCorpus.find(({ id }) => id === 'scenes-0-13')?.input;
    const result = step013To014(scenes as CompositionV013) as {
      scenes: { nodes: Record<string, unknown>[] }[];
    };
    const nodes = result.scenes.flatMap((scene) =>
      scene.nodes.flatMap((node) => [node, ...((node['children'] ?? []) as typeof scene.nodes)]),
    );
    const texts = nodes.filter(({ type }) => type === 'text');
    expect(texts.length).toBeGreaterThan(0);
    for (const node of texts) {
      const keys = Object.keys(node);
      expect(keys.slice(keys.indexOf('color') + 1, keys.indexOf('color') + 3)).toEqual([
        'style',
        'textAnimations',
      ]);
      expect([node['style'], node['textAnimations']]).toEqual([
        { stroke: { kind: 'none' }, shadow: { kind: 'none' }, box: { kind: 'none' } },
        [],
      ]);
    }
    for (const node of nodes.filter(({ type }) => type !== 'text')) {
      expect(Object.keys(node)).not.toContain('textAnimations');
    }
  });

  it('never writes its input, and shares no object with it at any depth', () => {
    const input = copy(migrationPair013To014.before);
    const text = JSON.stringify(input);
    const result = step013To014(input as unknown as CompositionV013);
    expect(JSON.stringify(input)).toBe(text);
    const mine = objectsOf(input);
    expect([...objectsOf(result)].filter((object) => mine.has(object))).toEqual([]);
  });
});

describe('the step 0.14 → 0.15 (D70)', () => {
  it.each([
    ['the hand-written pair', migrationPair014To015.before, migrationPair014To015.after],
    ['the reference composition', referenceCompositionV014, referenceCompositionV015],
  ])(
    'carries %s to its hand-written result, key for key and in their order',
    (_, before, after) => {
      expect(JSON.stringify(step014To015(before as CompositionV014))).toBe(JSON.stringify(after));
    },
  );

  it.each([
    ['the hand-written pair', migrationPair014To015.before, migrationPair022To023.after],
    ['the reference composition', referenceCompositionV014, referenceComposition],
  ])('carries %s on to its hand-written result of 0.23', (_, before, after) => {
    const result = success(migrateComposition(before));
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
    expect(result.versions).toEqual([
      '0.14',
      '0.15',
      '0.16',
      '0.17',
      '0.18',
      '0.19',
      '0.20',
      '0.21',
      '0.22',
      '0.23',
    ]);
  });

  it('gives the composition the whole canvas as its safe area, right after its height', () => {
    const result = step014To015(migrationPair014To015.before as CompositionV014) as Record<
      string,
      unknown
    >;
    const keys = Object.keys(result);
    expect(keys.slice(keys.indexOf('height'), keys.indexOf('height') + 3)).toEqual([
      'height',
      'safeArea',
      'fps',
    ]);
    expect(result['safeArea']).toEqual({ fromTop: 0, fromRight: 0, fromBottom: 0, fromLeft: 0 });
  });

  it('turns the highlight colour of every captions node into a highlight set and adds the plain style', () => {
    const captions = compatibilityCorpus.find(({ id }) => id === 'captions-0-14')?.input as {
      scenes: { nodes: { type: string; style: Record<string, unknown> }[] }[];
    };
    const result = step014To015(captions as unknown as CompositionV014) as typeof captions;
    const before = captions.scenes.flatMap((scene) => scene.nodes);
    const after = result.scenes.flatMap((scene) => scene.nodes);
    const styled = after.filter(({ type }) => type === 'captions');
    expect(styled.length).toBeGreaterThan(0);
    for (const node of styled) {
      const old = before.find((item) => item === before[after.indexOf(node)])?.style ?? {};
      expect(Object.keys(node.style)).toEqual([
        'fontSize',
        'lineHeight',
        'color',
        'highlight',
        'align',
        'verticalAlign',
        'maxLineLength',
        'maxLines',
        'stroke',
        'shadow',
        'box',
        'pageIn',
        'pageOut',
      ]);
      expect(node.style['highlight']).toEqual({
        color: old['highlightColor'],
        scale: 1,
        tracks: [],
        underline: { kind: 'none' },
        box: { kind: 'none' },
      });
      for (const key of ['stroke', 'shadow', 'box', 'pageIn', 'pageOut']) {
        expect(node.style[key]).toEqual({ kind: 'none' });
      }
    }
    for (const node of after.filter(({ type }) => type !== 'captions')) {
      expect(JSON.stringify(node)).toBe(JSON.stringify(before[after.indexOf(node)]));
    }
  });

  it('never writes its input, and shares no object with it at any depth', () => {
    const input = copy(compatibilityCorpus.find(({ id }) => id === 'captions-0-14')?.input);
    const text = JSON.stringify(input);
    const result = step014To015(input as unknown as CompositionV014);
    expect(JSON.stringify(input)).toBe(text);
    const mine = objectsOf(input);
    expect([...objectsOf(result)].filter((object) => mine.has(object))).toEqual([]);
  });
});

describe('the step 0.15 → 0.16 (D71)', () => {
  it.each([
    ['the hand-written pair', migrationPair015To016.before, migrationPair015To016.after],
    ['the reference composition', referenceCompositionV015, referenceCompositionV016],
  ])(
    'carries %s to its hand-written result, key for key and in their order',
    (_, before, after) => {
      expect(JSON.stringify(step015To016(before as CompositionV015))).toBe(JSON.stringify(after));
    },
  );

  it.each([
    ['the hand-written pair', migrationPair015To016.before, migrationPair022To023.after],
    ['the reference composition', referenceCompositionV015, referenceComposition],
  ])('carries %s on to its hand-written result of 0.23', (_, before, after) => {
    const result = success(migrateComposition(before));
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
    expect(result.versions).toEqual([
      '0.15',
      '0.16',
      '0.17',
      '0.18',
      '0.19',
      '0.20',
      '0.21',
      '0.22',
      '0.23',
    ]);
  });

  /** A saved document of 0.15: an entry of the corpus of 0.15, or one of 0.14 taken one step on. */
  function of015(id: string): { scenes: Record<string, unknown>[] } {
    const own = compatibilityCorpus.find((entry) => entry.id === `${id}-0-15`)?.input;
    const older = compatibilityCorpus.find((entry) => entry.id === `${id}-0-14`)?.input;
    expect(own ?? older).toBeDefined();
    return (own ?? step014To015(older as CompositionV014)) as { scenes: Record<string, unknown>[] };
  }

  it.each(['scenes', 'captions', 'captions-motion', 'repeats', 'transitions', 'video', 'text'])(
    'gives every scene and every node that can hold effects none as its last key, and changes nothing else: %s',
    (id) => {
      const input = of015(id);
      const result = step015To016(input as unknown as CompositionV015) as typeof input;
      expect(JSON.stringify(result)).toBe(
        JSON.stringify({
          ...input,
          schemaVersion: '0.16',
          scenes: input.scenes.map((scene) => ({
            ...scene,
            nodes: (scene['nodes'] as Record<string, unknown>[]).map(plain),
            effects: [],
          })),
        }),
      );
    },
  );

  it('never writes its input, and shares no object with it at any depth', () => {
    const input = copy(of015('scenes'));
    const text = JSON.stringify(input);
    const result = step015To016(input as unknown as CompositionV015);
    expect(JSON.stringify(input)).toBe(text);
    const mine = objectsOf(input);
    expect([...objectsOf(result)].filter((object) => mine.has(object))).toEqual([]);
  });
});

describe('the step 0.16 → 0.17 (D72)', () => {
  it.each([
    ['the hand-written pair', migrationPair016To017.before, migrationPair016To017.after],
    ['the reference composition', referenceCompositionV016, referenceCompositionV017],
  ])(
    'carries %s to its hand-written result, key for key and in their order',
    (_, before, after) => {
      expect(JSON.stringify(step016To017(before as CompositionV016))).toBe(JSON.stringify(after));
    },
  );

  it.each([
    ['the hand-written pair', migrationPair016To017.before, migrationPair022To023.after],
    ['the reference composition', referenceCompositionV016, referenceComposition],
  ])('carries %s on to its hand-written result of 0.23', (_, before, after) => {
    const result = success(migrateComposition(before));
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
    expect(result.versions).toEqual([
      '0.16',
      '0.17',
      '0.18',
      '0.19',
      '0.20',
      '0.21',
      '0.22',
      '0.23',
    ]);
  });

  it.each(['scenes', 'captions', 'effects', 'repeats', 'transitions', 'video', 'text'])(
    'changes the version and nothing else: %s',
    (id) => {
      const input =
        compatibilityCorpus.find((entry) => entry.id === `${id}-0-16`)?.input ??
        step015To016(
          compatibilityCorpus.find((entry) => entry.id === `${id}-0-15`)?.input as CompositionV015,
        );
      const result = step016To017(input as CompositionV016);
      expect(JSON.stringify(result)).toBe(
        JSON.stringify({ ...(input as object), schemaVersion: '0.17' }),
      );
    },
  );

  it('never writes its input, and shares no object with it at any depth', () => {
    const input = copy(referenceCompositionV016);
    const text = JSON.stringify(input);
    const result = step016To017(input as CompositionV016);
    expect(JSON.stringify(input)).toBe(text);
    const mine = objectsOf(input);
    expect([...objectsOf(result)].filter((object) => mine.has(object))).toEqual([]);
  });
});

describe('the step 0.17 → 0.18 (D73)', () => {
  it.each([
    ['the hand-written pair', migrationPair017To018.before, migrationPair017To018.after],
    ['the reference composition', referenceCompositionV017, referenceCompositionV018],
  ])(
    'carries %s to its hand-written result, key for key and in their order',
    (_, before, after) => {
      expect(JSON.stringify(step017To018(before as CompositionV017))).toBe(JSON.stringify(after));
    },
  );

  it.each([
    ['the hand-written pair', migrationPair017To018.before, migrationPair022To023.after],
    ['the reference composition', referenceCompositionV017, referenceComposition],
  ])('carries %s on to its hand-written result of 0.23', (_, before, after) => {
    const result = success(migrateComposition(before));
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
    expect(result.versions).toEqual(['0.17', '0.18', '0.19', '0.20', '0.21', '0.22', '0.23']);
  });

  it.each([
    'scenes',
    'captions',
    'effects',
    'effects-svg',
    'repeats',
    'transitions',
    'video',
    'text',
  ])('changes the version and nothing else: %s', (id) => {
    const input = compatibilityCorpus.find((entry) => entry.id === `${id}-0-17`)?.input;
    expect(input).toBeDefined();
    const result = step017To018(input as CompositionV017);
    expect(JSON.stringify(result)).toBe(
      JSON.stringify({ ...(input as object), schemaVersion: '0.18' }),
    );
  });

  it('never writes its input, and shares no object with it at any depth', () => {
    const input = copy(referenceCompositionV017);
    const text = JSON.stringify(input);
    const result = step017To018(input as CompositionV017);
    expect(JSON.stringify(input)).toBe(text);
    const mine = objectsOf(input);
    expect([...objectsOf(result)].filter((object) => mine.has(object))).toEqual([]);
  });
});

describe('the step 0.18 → 0.19 (D74)', () => {
  it.each([
    ['the hand-written pair', migrationPair018To019.before, migrationPair018To019.after],
    ['the reference composition', referenceCompositionV018, referenceCompositionV019],
  ])(
    'carries %s to its hand-written result, key for key and in their order',
    (_, before, after) => {
      expect(JSON.stringify(step018To019(before as CompositionV018))).toBe(JSON.stringify(after));
    },
  );

  it.each([
    ['the hand-written pair', migrationPair018To019.before, migrationPair022To023.after],
    ['the reference composition', referenceCompositionV018, referenceComposition],
  ])('carries %s on to its hand-written result of 0.23', (_, before, after) => {
    const result = success(migrateComposition(before));
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
    expect(result.versions).toEqual(['0.18', '0.19', '0.20', '0.21', '0.22', '0.23']);
  });
  it.each([
    'scenes',
    'captions',
    'effects',
    'effects-svg',
    'shapes',
    'repeats',
    'transitions',
    'video',
    'text',
  ])('changes the version and nothing else: %s', (id) => {
    const input = compatibilityCorpus.find((entry) => entry.id === `${id}-0-18`)?.input;
    expect(input).toBeDefined();
    const result = step018To019(input as CompositionV018);
    expect(JSON.stringify(result)).toBe(
      JSON.stringify({ ...(input as object), schemaVersion: '0.19' }),
    );
  });

  it('never writes its input, and shares no object with it at any depth', () => {
    const input = copy(referenceCompositionV018);
    const text = JSON.stringify(input);
    const result = step018To019(input as CompositionV018);
    expect(JSON.stringify(input)).toBe(text);
    const mine = objectsOf(input);
    expect([...objectsOf(result)].filter((object) => mine.has(object))).toEqual([]);
  });
});

describe('the step 0.19 → 0.20 (D75)', () => {
  it.each([
    ['the hand-written pair', migrationPair019To020.before, migrationPair019To020.after],
    ['the reference composition', referenceCompositionV019, referenceCompositionV020],
  ])(
    'carries %s to its hand-written result, key for key and in their order',
    (_, before, after) => {
      expect(JSON.stringify(step019To020(before as CompositionV019))).toBe(JSON.stringify(after));
    },
  );

  it.each([
    ['the hand-written pair', migrationPair019To020.before, migrationPair022To023.after],
    ['the reference composition', referenceCompositionV019, referenceComposition],
  ])('carries %s on to its hand-written result of 0.23', (_, before, after) => {
    const result = success(migrateComposition(before));
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
    expect(result.versions).toEqual(['0.19', '0.20', '0.21', '0.22', '0.23']);
  });

  it.each([
    'scenes',
    'captions',
    'effects',
    'effects-svg',
    'shapes',
    'svg',
    'repeats',
    'transitions',
    'video',
    'text',
  ])(
    'gives every composited node no mask, no matte, and the normal blend mode, and changes nothing else: %s',
    (id) => {
      const entry = compatibilityCorpus.find((candidate) => candidate.id === `${id}-0-19`);
      const saved = compatibilityCorpus.find((candidate) => candidate.id === `${id}-0-20`);
      expect(entry).toBeDefined();
      expect(saved).toBeDefined();
      const result = step019To020(entry?.input as CompositionV019);
      expect(JSON.stringify(result)).toBe(JSON.stringify(saved?.input));
    },
  );

  it('never writes its input, and shares no object with it at any depth', () => {
    const input = copy(referenceCompositionV019);
    const text = JSON.stringify(input);
    const result = step019To020(input as CompositionV019);
    expect(JSON.stringify(input)).toBe(text);
    const mine = objectsOf(input);
    expect([...objectsOf(result)].filter((object) => mine.has(object))).toEqual([]);
  });
});

describe('the step 0.20 → 0.21 (D76)', () => {
  it.each([
    ['the hand-written pair', migrationPair020To021.before, migrationPair020To021.after],
    ['the reference composition', referenceCompositionV020, referenceCompositionV021],
  ])(
    'carries %s to its hand-written result, key for key and in their order',
    (_, before, after) => {
      expect(JSON.stringify(step020To021(before as CompositionV020))).toBe(JSON.stringify(after));
    },
  );

  it.each([
    ['the hand-written pair', migrationPair020To021.before, migrationPair022To023.after],
    ['the reference composition', referenceCompositionV020, referenceComposition],
  ])('carries %s on to its hand-written result of 0.23', (_, before, after) => {
    const result = success(migrateComposition(before));
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
    expect(result.versions).toEqual(['0.20', '0.21', '0.22', '0.23']);
  });

  it.each([
    'scenes',
    'captions',
    'compositing',
    'effects',
    'effects-svg',
    'shapes',
    'svg',
    'repeats',
    'transitions',
    'video',
    'text',
  ])(
    'gives the document an empty list of definitions before its template, and changes nothing else: %s',
    (id) => {
      const entry = compatibilityCorpus.find((candidate) => candidate.id === `${id}-0-20`);
      expect(entry).toBeDefined();
      const result = step020To021(entry?.input as CompositionV020);
      // The document of 0.21 has no definition, so the step to 0.22 changes its version only,
      // and the step to 0.23, tested on its own below, gives its Custom HTML no fonts and no parameters.
      const as022 = { ...(result as object), schemaVersion: '0.22' };
      expect(JSON.stringify(step021To022(result as CompositionV021))).toBe(JSON.stringify(as022));
      expect(JSON.stringify(step022To023(as022 as CompositionV022))).toBe(
        JSON.stringify(entry?.expected),
      );
      expect(Object.keys(result as object).slice(-2)).toEqual(['definitions', 'template']);
    },
  );

  it('never writes its input, and shares no object with it at any depth', () => {
    const input = copy(referenceCompositionV020);
    const text = JSON.stringify(input);
    const result = step020To021(input as CompositionV020);
    expect(JSON.stringify(input)).toBe(text);
    const mine = objectsOf(input);
    expect([...objectsOf(result)].filter((object) => mine.has(object))).toEqual([]);
  });
});

describe('the step 0.21 → 0.22 (D77)', () => {
  it.each([
    ['the hand-written pair', migrationPair021To022.before, migrationPair021To022.after],
    ['the reference composition', referenceCompositionV021, referenceCompositionV022],
  ])(
    'carries %s to its hand-written result, key for key and in their order',
    (_, before, after) => {
      expect(JSON.stringify(step021To022(before as CompositionV021))).toBe(JSON.stringify(after));
    },
  );

  it.each([
    ['the hand-written pair', migrationPair021To022.before, migrationPair022To023.after],
    ['the reference composition', referenceCompositionV021, referenceComposition],
  ])('carries %s on to its hand-written result of 0.23', (_, before, after) => {
    const result = success(migrateComposition(before));
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
    expect(result.versions).toEqual(['0.21', '0.22', '0.23']);
  });

  it('gives every definition an empty source hash and template, and every instance no values, wherever it lies', () => {
    const entry = compatibilityCorpus.find((candidate) => candidate.id === 'nested-0-21');
    expect(entry).toBeDefined();
    const result = step021To022(entry?.input as CompositionV021) as {
      readonly scenes: readonly { readonly nodes: readonly Record<string, unknown>[] }[];
      readonly definitions: readonly Record<string, unknown>[];
    };
    // The step to 0.23, tested on its own below, carries it to the expectation of the corpus.
    expect(JSON.stringify(step022To023(result as unknown as CompositionV022))).toBe(
      JSON.stringify(entry?.expected),
    );
    const instances = [
      ...result.scenes.flatMap((scene) => scene.nodes),
      ...result.definitions.flatMap(
        (definition) => definition['nodes'] as Record<string, unknown>[],
      ),
    ].filter((node) => node['type'] === 'instance');
    // Three instances of the card and one of the badge in the scene, one of the badge in the card.
    expect(instances).toHaveLength(5);
    for (const instance of instances) {
      const keys = Object.keys(instance);
      expect(keys[keys.indexOf('definitionId') + 1]).toBe('inputs');
      expect(instance['inputs']).toEqual([]);
    }
    for (const definition of result.definitions) {
      const keys = Object.keys(definition);
      expect(keys.slice(0, 2)).toEqual(['id', 'sourceHash']);
      expect(keys.at(-1)).toBe('template');
      expect(definition['sourceHash']).toBe('');
      expect(JSON.stringify(definition['template'])).toBe(
        JSON.stringify({ inputs: [], bindings: [], conditions: [], repeats: [] }),
      );
    }
  });

  it.each(['scenes', 'captions', 'compositing', 'shapes', 'repeats', 'video', 'text'])(
    'changes only the version of a document without definitions: %s',
    (id) => {
      const entry = compatibilityCorpus.find((candidate) => candidate.id === `${id}-0-20`);
      expect(entry).toBeDefined();
      const before = step020To021(entry?.input as CompositionV020) as Record<string, unknown>;
      const result = step021To022(before as unknown as CompositionV021);
      expect(JSON.stringify(result)).toBe(JSON.stringify({ ...before, schemaVersion: '0.22' }));
      expect(JSON.stringify(step022To023(result as CompositionV022))).toBe(
        JSON.stringify(entry?.expected),
      );
    },
  );

  it('never writes its input, and shares no object with it at any depth', () => {
    const entry = compatibilityCorpus.find((candidate) => candidate.id === 'nested-0-21');
    const input = copy(entry?.input);
    const text = JSON.stringify(input);
    const result = step021To022(input as CompositionV021);
    expect(JSON.stringify(input)).toBe(text);
    const mine = objectsOf(input);
    expect([...objectsOf(result)].filter((object) => mine.has(object))).toEqual([]);
  });
});

describe('the step 0.22 → 0.23 (D78)', () => {
  it.each([
    ['the hand-written pair', migrationPair022To023.before, migrationPair022To023.after],
    ['the reference composition', referenceCompositionV022, referenceComposition],
  ])(
    'carries %s to its hand-written result, key for key and in their order',
    (_, before, after) => {
      const result = success(migrateComposition(before));
      expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
      expect(result.versions).toEqual(['0.22', '0.23']);
      expect(JSON.stringify(step022To023(before as CompositionV022))).toBe(JSON.stringify(after));
    },
  );

  it('gives every Custom HTML element no fonts and no parameters right after its html, and changes nothing else', () => {
    const entry = compatibilityCorpus.find((candidate) => candidate.id === 'reference-0-22');
    expect(entry).toBeDefined();
    const before = entry?.input as CompositionV022;
    const result = step022To023(before) as {
      readonly scenes: readonly { readonly nodes: readonly Record<string, unknown>[] }[];
    };
    expect(JSON.stringify(result)).toBe(JSON.stringify(entry?.expected));
    const nodes = result.scenes.flatMap((scene) => scene.nodes);
    const elements = nodes.filter((node) => node['type'] === 'custom-html');
    expect(elements.length).toBeGreaterThan(0);
    for (const element of elements) {
      const keys = Object.keys(element);
      expect(keys.slice(keys.indexOf('html') + 1, keys.indexOf('html') + 3)).toEqual([
        'fontAssetIds',
        'parameters',
      ]);
      expect(element['fontAssetIds']).toEqual([]);
      expect(element['parameters']).toEqual([]);
    }
  });

  it.each(['scenes', 'captions', 'compositing', 'shapes', 'nested', 'elements', 'video', 'text'])(
    'changes the version and the Custom HTML alone: %s',
    (id) => {
      const entry = compatibilityCorpus.find((candidate) => candidate.id.startsWith(`${id}-0-`));
      expect(entry).toBeDefined();
      const result = success(migrateComposition(entry?.input));
      expect(JSON.stringify(result.composition)).toBe(JSON.stringify(entry?.expected));
      expect(result.versions.at(-1)).toBe('0.23');
    },
  );

  it('never writes its input, and shares no object with it at any depth', () => {
    const input = copy(referenceCompositionV022);
    const text = JSON.stringify(input);
    const result = step022To023(input as CompositionV022);
    expect(JSON.stringify(input)).toBe(text);
    const mine = objectsOf(input);
    expect([...objectsOf(result)].filter((object) => mine.has(object))).toEqual([]);
  });
});

describe('a document that is current already (D42.8)', () => {
  it('is validated and returned as a new tree, with the one version it went through', () => {
    const input = copy(referenceComposition);
    const text = JSON.stringify(input);
    const result = success(migrateComposition(input));
    expect(result.versions).toEqual(['0.23']);
    expect(result.composition).not.toBe(input);
    expect(JSON.stringify(result.composition)).toBe(text);
    expect(JSON.stringify(input)).toBe(text);
    const mine = objectsOf(input);
    expect([...mine].filter((object) => Object.isFrozen(object))).toEqual([]);
    expect([...objectsOf(result.composition)].filter((object) => mine.has(object))).toEqual([]);
  });

  it('keeps a -0 on this path too', () => {
    const input = copy(referenceComposition) as {
      scenes: { nodes: { position?: { y: number } }[] }[];
    };
    const position = input.scenes[0]?.nodes[1]?.position;
    if (position === undefined) throw new Error('No position.');
    position.y = -0;
    const node = success(migrateComposition(input)).composition.scenes[0]?.nodes[1];
    if (node === undefined || node.type === 'background') throw new Error('No group.');
    expect(Object.is(node.position.y, -0)).toBe(true);
  });
});

describe('ownership of the result (D42.8)', () => {
  it.each([
    ['a migrated document', referenceCompositionV01],
    ['a current document', referenceComposition],
  ])(
    'freezes the result and its arrays, and leaves the composition of %s to the caller',
    (_, input) => {
      const result = success(migrateComposition(input));
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.versions)).toBe(true);
      expect(
        [...objectsOf(result.composition)].filter((object) => Object.isFrozen(object)),
      ).toEqual([]);
    },
  );

  it('freezes a failure and its arrays', () => {
    const result = failure(migrateComposition({ schemaVersion: '0.2' }));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.versions)).toBe(true);
    expect(Object.isFrozen(result.errors)).toBe(true);
    expect(result.errors.length).toBeGreaterThan(1);
  });

  it('does not freeze, brand, or change an input that is invalid', () => {
    const input = { schemaVersion: '0.1', width: 1 };
    const text = JSON.stringify(input);
    failure(migrateComposition(input));
    expect(Object.isFrozen(input)).toBe(false);
    expect(JSON.stringify(input)).toBe(text);
  });
});

/** The cases of a corpus that keep the version of their reference. */
function keepingVersion<Case extends { readonly patch: readonly { readonly path: string }[] }>(
  cases: readonly Case[],
): Case[] {
  return cases.filter(({ patch }) => patch.every(({ path }) => path !== '/schemaVersion'));
}

describe('an input that is invalid under its own version (D35.3, D35.4)', () => {
  it('has frozen corpora of 0.1 to 0.22 to be judged by', () => {
    expect(keepingVersion(invalidCompositionCasesV01).length).toBeGreaterThan(35);
    expect(keepingVersion(invalidCompositionCasesV02).length).toBeGreaterThan(45);
    expect(keepingVersion(invalidCompositionCasesV03).length).toBeGreaterThan(50);
    expect(keepingVersion(invalidCompositionCasesV04).length).toBeGreaterThan(60);
    expect(keepingVersion(invalidCompositionCasesV05).length).toBeGreaterThan(65);
    expect(keepingVersion(invalidCompositionCasesV06).length).toBeGreaterThan(80);
    expect(keepingVersion(invalidCompositionCasesV07).length).toBeGreaterThan(85);
    expect(keepingVersion(invalidCompositionCasesV08).length).toBeGreaterThan(100);
    expect(keepingVersion(invalidCompositionCasesV09).length).toBeGreaterThan(100);
    expect(keepingVersion(invalidCompositionCasesV010).length).toBeGreaterThan(100);
    expect(keepingVersion(invalidCompositionCasesV011).length).toBeGreaterThan(100);
    expect(keepingVersion(invalidCompositionCasesV012).length).toBeGreaterThan(100);
    expect(keepingVersion(invalidCompositionCasesV013).length).toBeGreaterThan(100);
    expect(keepingVersion(invalidCompositionCasesV014).length).toBeGreaterThan(100);
    expect(keepingVersion(invalidCompositionCasesV015).length).toBeGreaterThan(100);
    expect(keepingVersion(invalidCompositionCasesV016).length).toBeGreaterThan(100);
    expect(keepingVersion(invalidCompositionCasesV017).length).toBeGreaterThan(100);
    expect(keepingVersion(invalidCompositionCasesV018).length).toBeGreaterThan(100);
    expect(keepingVersion(invalidCompositionCasesV019).length).toBeGreaterThan(100);
    expect(keepingVersion(invalidCompositionCasesV020).length).toBeGreaterThan(100);
    expect(keepingVersion(invalidCompositionCasesV021).length).toBeGreaterThan(100);
    expect(keepingVersion(invalidCompositionCasesV022).length).toBeGreaterThan(100);
  });

  it.each(keepingVersion(invalidCompositionCasesV022))(
    'is refused as 0.22 with exactly the errors 0.22 had: $name',
    ({ patch, expectedErrors }) => {
      const result = failure(migrateComposition(applyPatch(referenceCompositionV022, patch)));
      expect(result.version).toBe('0.22');
      expect(result.versions).toEqual(['0.22']);
      expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual(expectedErrors);
    },
  );

  it.each(keepingVersion(invalidCompositionCasesV021))(
    'is refused as 0.21 with exactly the errors 0.21 had: $name',
    ({ patch, expectedErrors }) => {
      const result = failure(migrateComposition(applyPatch(referenceCompositionV021, patch)));
      expect(result.version).toBe('0.21');
      expect(result.versions).toEqual(['0.21']);
      expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual(expectedErrors);
    },
  );

  it.each(keepingVersion(invalidCompositionCasesV020))(
    'is refused as 0.20 with exactly the errors 0.20 had: $name',
    ({ patch, expectedErrors }) => {
      const result = failure(migrateComposition(applyPatch(referenceCompositionV020, patch)));
      expect(result.version).toBe('0.20');
      expect(result.versions).toEqual(['0.20']);
      expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual(expectedErrors);
    },
  );

  it.each(keepingVersion(invalidCompositionCasesV019))(
    'is refused as 0.19 with exactly the errors 0.19 had: $name',
    ({ patch, expectedErrors }) => {
      const result = failure(migrateComposition(applyPatch(referenceCompositionV019, patch)));
      expect(result.version).toBe('0.19');
      expect(result.versions).toEqual(['0.19']);
      expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual(expectedErrors);
    },
  );

  it.each(keepingVersion(invalidCompositionCasesV018))(
    'is refused as 0.18 with exactly the errors 0.18 had: $name',
    ({ patch, expectedErrors }) => {
      const result = failure(migrateComposition(applyPatch(referenceCompositionV018, patch)));
      expect(result.version).toBe('0.18');
      expect(result.versions).toEqual(['0.18']);
      expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual(expectedErrors);
    },
  );

  it.each(keepingVersion(invalidCompositionCasesV017))(
    'is refused as 0.17 with exactly the errors 0.17 had: $name',
    ({ patch, expectedErrors }) => {
      const result = failure(migrateComposition(applyPatch(referenceCompositionV017, patch)));
      expect(result.version).toBe('0.17');
      expect(result.versions).toEqual(['0.17']);
      expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual(expectedErrors);
    },
  );

  it.each(keepingVersion(invalidCompositionCasesV016))(
    'is refused as 0.16 with exactly the errors 0.16 had: $name',
    ({ patch, expectedErrors }) => {
      const result = failure(migrateComposition(applyPatch(referenceCompositionV016, patch)));
      expect(result.version).toBe('0.16');
      expect(result.versions).toEqual(['0.16']);
      expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual(expectedErrors);
    },
  );

  it.each(keepingVersion(invalidCompositionCasesV015))(
    'is refused as 0.15 with exactly the errors 0.15 had: $name',
    ({ patch, expectedErrors }) => {
      const result = failure(migrateComposition(applyPatch(referenceCompositionV015, patch)));
      expect(result.version).toBe('0.15');
      expect(result.versions).toEqual(['0.15']);
      expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual(expectedErrors);
    },
  );

  it.each(keepingVersion(invalidCompositionCasesV014))(
    'is refused as 0.14 with exactly the errors 0.14 had: $name',
    ({ patch, expectedErrors }) => {
      const result = failure(migrateComposition(applyPatch(referenceCompositionV014, patch)));
      expect(result.version).toBe('0.14');
      expect(result.versions).toEqual(['0.14']);
      expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual(expectedErrors);
    },
  );

  it.each(keepingVersion(invalidCompositionCasesV013))(
    'is refused as 0.13 with exactly the errors 0.13 had: $name',
    ({ patch, expectedErrors }) => {
      const result = failure(migrateComposition(applyPatch(referenceCompositionV013, patch)));
      expect(result.version).toBe('0.13');
      expect(result.versions).toEqual(['0.13']);
      expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual(expectedErrors);
    },
  );

  it.each(keepingVersion(invalidCompositionCasesV012))(
    'is refused as 0.12 with exactly the errors 0.12 had: $name',
    ({ patch, expectedErrors }) => {
      const result = failure(migrateComposition(applyPatch(referenceCompositionV012, patch)));
      expect(result.version).toBe('0.12');
      expect(result.versions).toEqual(['0.12']);
      expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual(expectedErrors);
    },
  );

  it.each(keepingVersion(invalidCompositionCasesV011))(
    'is refused as 0.11 with exactly the errors 0.11 had: $name',
    ({ patch, expectedErrors }) => {
      const result = failure(migrateComposition(applyPatch(referenceCompositionV011, patch)));
      expect(result.version).toBe('0.11');
      expect(result.versions).toEqual(['0.11']);
      expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual(expectedErrors);
    },
  );

  it.each(keepingVersion(invalidCompositionCasesV010))(
    'is refused as 0.10 with exactly the errors 0.10 had: $name',
    ({ patch, expectedErrors }) => {
      const result = failure(migrateComposition(applyPatch(referenceCompositionV010, patch)));
      expect(result.version).toBe('0.10');
      expect(result.versions).toEqual(['0.10']);
      expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual(expectedErrors);
    },
  );

  it.each(keepingVersion(invalidCompositionCasesV09))(
    'is refused as 0.9 with exactly the errors 0.9 had: $name',
    ({ patch, expectedErrors }) => {
      const result = failure(migrateComposition(applyPatch(referenceCompositionV09, patch)));
      expect(result.version).toBe('0.9');
      expect(result.versions).toEqual(['0.9']);
      expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual(expectedErrors);
    },
  );

  it.each(keepingVersion(invalidCompositionCasesV08))(
    'is refused as 0.8 with exactly the errors 0.8 had: $name',
    ({ patch, expectedErrors }) => {
      const result = failure(migrateComposition(applyPatch(referenceCompositionV08, patch)));
      expect(result.version).toBe('0.8');
      expect(result.versions).toEqual(['0.8']);
      expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual(expectedErrors);
    },
  );

  it.each(keepingVersion(invalidCompositionCasesV07))(
    'is refused as 0.7 with exactly the errors 0.7 had: $name',
    ({ patch, expectedErrors }) => {
      const result = failure(migrateComposition(applyPatch(referenceCompositionV07, patch)));
      expect(result.version).toBe('0.7');
      expect(result.versions).toEqual(['0.7']);
      expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual(expectedErrors);
    },
  );

  it.each(keepingVersion(invalidCompositionCasesV06))(
    'is refused as 0.6 with exactly the errors 0.6 had: $name',
    ({ patch, expectedErrors }) => {
      const result = failure(migrateComposition(applyPatch(referenceCompositionV06, patch)));
      expect(result.version).toBe('0.6');
      expect(result.versions).toEqual(['0.6']);
      expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual(expectedErrors);
    },
  );

  it.each(keepingVersion(invalidCompositionCasesV05))(
    'is refused as 0.5 with exactly the errors 0.5 had: $name',
    ({ patch, expectedErrors }) => {
      const result = failure(migrateComposition(applyPatch(referenceCompositionV05, patch)));
      expect(result.version).toBe('0.5');
      expect(result.versions).toEqual(['0.5']);
      expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual(expectedErrors);
    },
  );

  it.each(keepingVersion(invalidCompositionCasesV04))(
    'is refused as 0.4 with exactly the errors 0.4 had: $name',
    ({ patch, expectedErrors }) => {
      const result = failure(migrateComposition(applyPatch(referenceCompositionV04, patch)));
      expect(result.version).toBe('0.4');
      expect(result.versions).toEqual(['0.4']);
      expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual(expectedErrors);
    },
  );

  it.each(keepingVersion(invalidCompositionCasesV03))(
    'is refused as 0.3 with exactly the errors 0.3 had: $name',
    ({ patch, expectedErrors }) => {
      const result = failure(migrateComposition(applyPatch(referenceCompositionV03, patch)));
      expect(result.version).toBe('0.3');
      expect(result.versions).toEqual(['0.3']);
      expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual(expectedErrors);
    },
  );

  it.each(keepingVersion(invalidCompositionCasesV02))(
    'is refused as 0.2 with exactly the errors 0.2 had: $name',
    ({ patch, expectedErrors }) => {
      const result = failure(migrateComposition(applyPatch(referenceCompositionV02, patch)));
      expect(result.version).toBe('0.2');
      expect(result.versions).toEqual(['0.2']);
      expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual(expectedErrors);
    },
  );

  it.each(keepingVersion(invalidCompositionCasesV01))(
    'is refused as 0.1 with exactly the errors 0.1 had: $name',
    ({ patch, expectedErrors }) => {
      const result = failure(migrateComposition(applyPatch(referenceCompositionV01, patch)));
      expect(result.version).toBe('0.1');
      expect(result.versions).toEqual(['0.1']);
      expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual(expectedErrors);
    },
  );

  it.each(keepingVersion(invalidCompositionCases))(
    'is refused as 0.23 with the errors of validateComposition: $name',
    ({ patch, expectedErrors }) => {
      const result = failure(migrateComposition(applyPatch(referenceComposition, patch)));
      expect(result.version).toBe('0.23');
      expect(result.versions).toEqual(['0.23']);
      expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual(expectedErrors);
    },
  );

  it('judges a 0.1 document by the schema of 0.1: a field of 0.2 is unknown there', () => {
    // A validator that used the schema of 0.2 without its two fields being
    // required, or no validation of the input at all, would accept this.
    const input = copy(referenceCompositionV01) as {
      scenes: { nodes: Record<string, unknown>[] }[];
    };
    const node = input.scenes[0]?.nodes[2];
    if (node === undefined) throw new Error('No node.');
    node['startUs'] = 0;
    const result = failure(migrateComposition(input));
    expect(result.version).toBe('0.1');
    expect(result.versions).toEqual(['0.1']);
    expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'unknown-field', path: '/scenes/0/nodes/2/startUs' },
    ]);
  });

  it('judges a 0.2 document by the schema of 0.2: a fit is unknown there', () => {
    const input = copy(referenceCompositionV03);
    input['schemaVersion'] = '0.2';
    const result = failure(migrateComposition(input));
    expect(result.version).toBe('0.2');
    expect(result.versions).toEqual(['0.2']);
    expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'unknown-field', path: '/scenes/0/nodes/1/children/0/fit' },
    ]);
  });

  it('judges a 0.10 document by the schema of 0.10: a clip may only crossfade there', () => {
    const wipe = invalidCompositionCasesV010.find(({ name }) => name === 'clip-transition-wipe');
    if (wipe === undefined) throw new Error('No case.');
    const result = failure(migrateComposition(applyPatch(referenceCompositionV010, wipe.patch)));
    expect(result.version).toBe('0.10');
    expect(result.versions).toEqual(['0.10']);
    expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'invalid-value', path: '/scenes/0/transitions/0/effect/kind' },
    ]);
    // The same wipe is a clip transition of 0.11 (D66), which loads as 0.14.
    expect(migrateComposition(applyPatch(referenceCompositionV011, wipe.patch)).ok).toBe(true);
  });

  it('judges a 0.11 document by the schema of 0.11: an easing is unknown there', () => {
    const input = copy(referenceComposition);
    input['schemaVersion'] = '0.11';
    const result = failure(migrateComposition(input));
    expect(result.version).toBe('0.11');
    expect(result.versions).toEqual(['0.11']);
    expect(result.errors.map(({ code }) => code)).toContain('missing-field');
    expect(result.errors).toContainEqual({
      code: 'unknown-field',
      path: '/scenes/0/nodes/1/animations/0/keyframes/0/easing',
      message: expect.any(String) as unknown,
    });
  });

  it('judges a 0.12 document by the schema of 0.12: a rotation is unknown there', () => {
    const input = copy(referenceComposition);
    input['schemaVersion'] = '0.12';
    const result = failure(migrateComposition(input));
    expect(result.version).toBe('0.12');
    expect(result.versions).toEqual(['0.12']);
    expect(result.errors).toContainEqual({
      code: 'unknown-field',
      path: '/scenes/0/nodes/1/rotation',
      message: expect.any(String) as unknown,
    });
  });

  it('judges a 0.13 document by the schema of 0.13: a text style is unknown there', () => {
    const input = copy(referenceComposition);
    input['schemaVersion'] = '0.13';
    const result = failure(migrateComposition(input));
    expect(result.version).toBe('0.13');
    expect(result.versions).toEqual(['0.13']);
    expect(result.errors).toContainEqual({
      code: 'unknown-field',
      path: '/scenes/0/nodes/1/children/1/style',
      message: expect.any(String) as unknown,
    });
  });

  it('judges a 0.9 document by the schema of 0.9: the focus of 0.10 is unknown there', () => {
    const input = copy(referenceCompositionV010);
    input['schemaVersion'] = '0.9';
    const result = failure(migrateComposition(input));
    expect(result.version).toBe('0.9');
    expect(result.versions).toEqual(['0.9']);
    expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'unknown-field', path: '/scenes/0/nodes/1/children/0/focus' },
    ]);
  });

  it('judges a 0.8 document by the schema of 0.8: the conditions and repeats of 0.9 are unknown there', () => {
    const input = copy(referenceCompositionV09);
    input['schemaVersion'] = '0.8';
    const result = failure(migrateComposition(input));
    expect(result.version).toBe('0.8');
    expect(result.versions).toEqual(['0.8']);
    expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'unknown-field', path: '/template/conditions' },
      { code: 'unknown-field', path: '/template/repeats' },
    ]);
  });

  it('judges a 0.7 document by the schema of 0.7: the template section of 0.8 is unknown there', () => {
    const input = copy(referenceCompositionV08);
    input['schemaVersion'] = '0.7';
    const result = failure(migrateComposition(input));
    expect(result.version).toBe('0.7');
    expect(result.versions).toEqual(['0.7']);
    expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'unknown-field', path: '/template' },
    ]);
  });

  it('judges a 0.6 document by the schema of 0.6: the captions of 0.7 are unknown there', () => {
    const input = copy(referenceCompositionV07) as { scenes: { nodes: unknown[] }[] } & Record<
      string,
      unknown
    >;
    input['schemaVersion'] = '0.6';
    input.scenes[0]?.nodes.push({
      id: 'node-captions',
      type: 'captions',
      startUs: 0,
      durationUs: 1_000_000,
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
      origin: { x: 0, y: 0 },
      opacity: 1,
      animations: [],
      fontAssetId: 'asset-font',
      width: 100,
      height: 100,
      style: {
        fontSize: 10,
        lineHeight: 12,
        color: '#ffffff',
        highlightColor: '#ffd400',
        align: 'left',
        verticalAlign: 'top',
        maxLineLength: 10,
        maxLines: 1,
      },
      words: [],
    });
    const result = failure(migrateComposition(input));
    expect(result.version).toBe('0.6');
    expect(result.versions).toEqual(['0.6']);
    expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'invalid-value', path: '/scenes/0/nodes/4/type' },
    ]);
  });

  it('judges a 0.5 document by the schema of 0.5: the transitions of 0.6 are unknown there', () => {
    const input = copy(referenceCompositionV06);
    input['schemaVersion'] = '0.5';
    const result = failure(migrateComposition(input));
    expect(result.version).toBe('0.5');
    expect(result.versions).toEqual(['0.5']);
    expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'unknown-field', path: '/scenes/0/transitions' },
      { code: 'unknown-field', path: '/transitions' },
    ]);
  });

  it('judges a 0.4 document by the schema of 0.4: the fields of a scene of 0.5 are unknown there', () => {
    const input = copy(referenceCompositionV05);
    input['schemaVersion'] = '0.4';
    const result = failure(migrateComposition(input));
    expect(result.version).toBe('0.4');
    expect(result.versions).toEqual(['0.4']);
    expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'unknown-field', path: '/scenes/0/clips' },
      { code: 'unknown-field', path: '/scenes/0/durationUs' },
    ]);
  });

  it('judges a 0.3 document by the schema of 0.3: the fields of a clip of 0.4 are unknown there', () => {
    const input = copy(referenceCompositionV04);
    input['schemaVersion'] = '0.3';
    const result = failure(migrateComposition(input));
    expect(result.version).toBe('0.3');
    expect(result.versions).toEqual(['0.3']);
    expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual(
      ['fadeInUs', 'fadeOutUs', 'sourceStartUs', 'volume'].map((field) => ({
        code: 'unknown-field',
        path: `/clips/0/${field}`,
      })),
    );
  });

  it('judges a document that names 0.2 by the schema of 0.2, whatever its shape', () => {
    const input = { ...copy(referenceCompositionV01), schemaVersion: '0.2' };
    const result = failure(migrateComposition(input));
    expect(result.version).toBe('0.2');
    expect(result.versions).toEqual(['0.2']);
    // One missing start and one missing duration for each of the six nodes.
    expect(result.errors.map(({ code }) => code)).toEqual(
      Array.from({ length: 12 }, () => 'missing-field'),
    );
  });
});

describe('a version nobody knows (D42.8)', () => {
  class Document {
    readonly schemaVersion = '0.1';
  }

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 5],
    ['a string', '0.1'],
    ['an array', ['0.1']],
    ['an object without a version', { width: 1 }],
    ['the number 0.1', { schemaVersion: 0.1 }],
    ['null as the version', { schemaVersion: null }],
    ['a future version', { ...copy(referenceComposition), schemaVersion: '0.24' }],
    ['the empty string', { schemaVersion: '' }],
    ['"constructor"', { schemaVersion: 'constructor' }],
    ['"__proto__"', { schemaVersion: '__proto__' }],
    ['"toString"', { schemaVersion: 'toString' }],
    ['"0.1 "', { schemaVersion: '0.1 ' }],
    ['an inherited version', Object.create({ schemaVersion: '0.1' }) as unknown],
  ])('gives %s one unsupported-schema-version error, no version, and no trace', (_, input) => {
    const result = failure(migrateComposition(input));
    expect(result.version).toBeNull();
    expect(result.versions).toEqual([]);
    expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'unsupported-schema-version', path: '/schemaVersion' },
    ]);
    expect(result.errors[0]?.message.length).toBeGreaterThan(0);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.versions)).toBe(true);
    expect(Object.isFrozen(result.errors)).toBe(true);
  });

  it('judges a class instance that names a version by that version, and refuses it there', () => {
    const result = failure(migrateComposition(new Document()));
    expect(result.version).toBe('0.1');
    expect(result.errors.map(({ code }) => code)).toEqual(['invalid-type']);
  });

  it.each([
    [
      'a sparse array',
      Object.assign(copy(referenceCompositionV01), { assets: new Array<unknown>(2) }),
    ],
    ['a date', Object.assign(copy(referenceCompositionV01), { scenes: new Date(0) })],
    ['a non-finite number', Object.assign(copy(referenceCompositionV01), { width: Number.NaN })],
    // Observed behaviour for malformed values, not a wider guarantee: what D42.8
    // promises is for plain objects, arrays, and primitives.
  ])('answers a document that holds %s with a failure result', (_, input) => {
    expect(failure(migrateComposition(input)).version).toBe('0.1');
  });

  it('states its boundary: an accessor that throws is outside the non-throwing guarantee', () => {
    // The guarantee is for passive data, as with validateComposition (D42.8). This
    // pins the boundary where it is, so that the documents do not promise more.
    const hostile = Object.defineProperty({}, 'schemaVersion', {
      enumerable: true,
      get: (): never => {
        throw new TypeError('hostile');
      },
    });
    expect(() => migrateComposition(hostile)).toThrow('hostile');
    expect(() => validateComposition(hostile)).toThrow('hostile');
  });
});

describe('the validation of the target is always enforced (D35.3, D42.8)', () => {
  type Version = 'old' | 'new';
  const valid = (document: unknown): ValidationResult => validateComposition(document);

  it('reports a step whose result does not validate, with the target version and the trace', () => {
    // A step table as data: this one only renames the version, so its result
    // lacks every lifetime. The real step never does this; the branch exists
    // so that a wrong step can never hand back a document as migrated.
    const table: readonly VersionEntry<SchemaVersion>[] = [
      {
        version: '0.1',
        errors: () => [],
        next: (document) => ({ ...(document as object), schemaVersion: '0.23' }),
      },
      { version: '0.23', errors: () => [] },
    ];
    const result = migrateThrough(table, valid, referenceCompositionV01);
    if (result.ok) throw new Error('The invalid result was accepted.');
    expect(result.version).toBe('0.23');
    expect(result.versions).toEqual(['0.1', '0.23']);
    expect(new Set(result.errors.map(({ code }) => code))).toEqual(
      new Set(['missing-field', 'unknown-field']),
    );
    // Two lifetime fields for each of six nodes, a fit and a focus, four fields
    // of the clip, the duration, the clips, and the transitions of the scene,
    // the transitions of the composition, its template section, and the easing
    // of each of six keyframes, the rotation and the origin of each of five
    // transformed nodes, the crop and the corner radius of the image, and the
    // animations of the background, and the style and the text animations of
    // each of two texts, the safe area, and the effects of the scene, the
    // group, the image, and the two texts are missing, and their masks, mattes,
    // and blend modes, and the definitions of the composition, and the fonts
    // and the parameters of the Custom HTML element; the interpolation of each
    // of three animations is unknown.
    expect(result.errors).toHaveLength(70);
    expect(Object.isFrozen(result.errors)).toBe(true);
  });

  it('validates the target even when the input was current and its own check passed', () => {
    const errors = [{ code: 'invalid-value', path: '/x', message: 'no' }] as const;
    const validateCurrent = vi.fn((): ValidationResult => ({ ok: false, errors }));
    const table: readonly VersionEntry<Version>[] = [{ version: 'new', errors: () => [] }];
    const result = migrateThrough(table, validateCurrent, { schemaVersion: 'new' });
    expect(validateCurrent).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, version: 'new', versions: ['new'], errors });
  });

  it('runs every later step in order and reports each version reached', () => {
    const seen: string[] = [];
    const table: readonly VersionEntry<'a' | 'b' | 'c'>[] = [
      { version: 'a', errors: () => [], next: (document) => (seen.push('a→b'), document) },
      { version: 'b', errors: () => [], next: (document) => (seen.push('b→c'), document) },
      { version: 'c', errors: () => [] },
    ];
    const stub = (): ValidationResult => ({ ok: false, errors: [] });
    expect(migrateThrough(table, stub, { schemaVersion: 'a' }).versions).toEqual(['a', 'b', 'c']);
    expect(migrateThrough(table, stub, { schemaVersion: 'b' }).versions).toEqual(['b', 'c']);
    expect(seen).toEqual(['a→b', 'b→c', 'b→c']);
  });

  it('validates the output of a step as a document of the version it reaches, before the next step', () => {
    // An internal table of three versions: no public version is added. The
    // first step yields a document that the middle version refuses.
    const second = vi.fn((document: unknown) => document);
    const refused = [{ code: 'missing-field', path: '/middle', message: 'no' }] as const;
    const middleErrors = vi.fn((document: unknown) =>
      (document as { broken?: boolean }).broken === true ? refused : [],
    );
    const table: readonly VersionEntry<'a' | 'b' | 'c'>[] = [
      { version: 'a', errors: () => [], next: () => ({ schemaVersion: 'b', broken: true }) },
      { version: 'b', errors: middleErrors, next: second },
      { version: 'c', errors: () => [] },
    ];
    const validateCurrent = vi.fn((): ValidationResult => ({ ok: false, errors: [] }));
    const result = migrateThrough(table, validateCurrent, { schemaVersion: 'a' });
    expect(result).toEqual({ ok: false, version: 'b', versions: ['a', 'b'], errors: refused });
    expect(Object.isFrozen(result)).toBe(true);
    expect(middleErrors).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    expect(validateCurrent).not.toHaveBeenCalled();
  });

  it('lets a valid intermediate document through to the next step and the target validation', () => {
    const calls: string[] = [];
    const table: readonly VersionEntry<'a' | 'b' | 'c'>[] = [
      { version: 'a', errors: () => (calls.push('a?'), []), next: (document) => document },
      { version: 'b', errors: () => (calls.push('b?'), []), next: (document) => document },
      { version: 'c', errors: () => (calls.push('c?'), []) },
    ];
    const errors = [{ code: 'invalid-value', path: '/x', message: 'no' }] as const;
    const validateCurrent = vi.fn(
      (): ValidationResult => (calls.push('current'), { ok: false, errors }),
    );
    const result = migrateThrough(table, validateCurrent, { schemaVersion: 'a' });
    // The input under its own version, the intermediate under its own, and the
    // last one by the full validation of the current version alone.
    expect(calls).toEqual(['a?', 'b?', 'current']);
    expect(result).toEqual({ ok: false, version: 'c', versions: ['a', 'b', 'c'], errors });
  });

  it('applies no step to an input its own version refuses', () => {
    const next = vi.fn((document: unknown) => document);
    const table: readonly VersionEntry<Version>[] = [
      { version: 'old', errors: () => [{ code: 'invalid-type', path: '', message: 'no' }], next },
      { version: 'new', errors: () => [] },
    ];
    const result = migrateThrough(table, valid, { schemaVersion: 'old' });
    expect(next).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, version: 'old', versions: ['old'] });
  });
});

/**
 * `migrateComposition` and the steps 0.1 → 0.2, 0.2 → 0.3, 0.3 → 0.4, and
 * 0.4 → 0.5 (D35.2–D35.5, D42.7, D42.8, D50.7, D52.6, D54.4).
 *
 * Every expected document here was written by hand and none by a step: the
 * pairs of `@kadrion/test-fixtures`, and the reference composition of 0.5 beside
 * its frozen 0.1 to 0.4 originals. A pair that has nothing the step to 0.4
 * changes reaches 0.4 by its version alone, and 0.5 by its version and the
 * duration and the clips of its one scene, which the test states by hand
 * (`as05`). Nothing the step produces is used as its own
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
  migrationPair01To02,
  migrationPair02To03,
  migrationPair03To04,
  migrationPair04To05,
  referenceComposition,
  referenceCompositionV01,
  referenceCompositionV02,
  referenceCompositionV03,
  referenceCompositionV04,
} from '@kadrion/test-fixtures';
import { describe, expect, it, vi } from 'vitest';

import { validateComposition, type ValidationResult } from '../src/index.js';
import { migrateComposition, type MigrationResult, type SchemaVersion } from '../src/migrate.js';
import { migrateThrough, type VersionEntry } from '../src/migration/run.js';
import { step01To02 } from '../src/migration/step-0-1-to-0-2.js';
import { step02To03 } from '../src/migration/step-0-2-to-0-3.js';
import { step03To04 } from '../src/migration/step-0-3-to-0-4.js';
import { step04To05 } from '../src/migration/step-0-4-to-0-5.js';
import type { CompositionV01 } from '../src/v0-1/composition-schema.js';
import type { CompositionV02 } from '../src/v0-2/composition-schema.js';
import type { CompositionV03 } from '../src/v0-3/composition-schema.js';
import type { CompositionV04 } from '../src/v0-4/composition-schema.js';
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
 * A hand-written document of 0.3 that nothing of the step to 0.4 touches, as
 * 0.5 (D52.6, D54.4): its version, and its one scene, whose keys must be
 * exactly `id` and `nodes`, with the composition's duration after its `id` and
 * no clips after its nodes.
 */
function as05(document: unknown): unknown {
  const source = document as { durationUs: number; scenes: { id: string; nodes: unknown }[] };
  return {
    ...source,
    schemaVersion: '0.5',
    scenes: source.scenes.map((scene) => {
      expect(Object.keys(scene)).toEqual(['id', 'nodes']);
      return { id: scene.id, durationUs: source.durationUs, nodes: scene.nodes, clips: [] };
    }),
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

  it('holds documents the validators tell apart', () => {
    for (const current of [referenceComposition, migrationPair04To05.after]) {
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
    ['the hand-written pair', migrationPair01To02.before, as05(migrationPair02To03.after)],
    ['the reference composition', referenceCompositionV01, referenceComposition],
  ])('carries %s through every step to its hand-written result of 0.5', (_, before, after) => {
    const result = success(migrateComposition(before));
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
    expect(result.versions).toEqual(['0.1', '0.2', '0.3', '0.4', '0.5']);
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
    ['the hand-written pair', migrationPair02To03.before, as05(migrationPair02To03.after)],
    ['the reference composition', referenceCompositionV02, referenceComposition],
  ])('carries %s on to its hand-written result of 0.5', (_, before, after) => {
    const result = success(migrateComposition(before));
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
    expect(result.versions).toEqual(['0.2', '0.3', '0.4', '0.5']);
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
    ['the hand-written pair', migrationPair03To04.before, migrationPair04To05.after],
    ['the reference composition', referenceCompositionV03, referenceComposition],
  ])('carries %s on to its hand-written result of 0.5', (_, before, after) => {
    const result = success(migrateComposition(before));
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
    expect(result.versions).toEqual(['0.3', '0.4', '0.5']);
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
    ['the reference composition', referenceCompositionV04, referenceComposition],
  ])(
    'carries %s to its hand-written result, key for key and in their order',
    (_, before, after) => {
      const result = success(migrateComposition(before));
      expect(JSON.stringify(result.composition)).toBe(JSON.stringify(after));
      expect(result.versions).toEqual(['0.4', '0.5']);
      expect(JSON.stringify(step04To05(before as CompositionV04))).toBe(JSON.stringify(after));
    },
  );

  it("gives the one scene the composition's duration after its id and no clips as its last key, and nothing else", () => {
    const { composition } = success(migrateComposition(migrationPair04To05.before));
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

describe('a document that is current already (D42.8)', () => {
  it('is validated and returned as a new tree, with the one version it went through', () => {
    const input = copy(referenceComposition);
    const text = JSON.stringify(input);
    const result = success(migrateComposition(input));
    expect(result.versions).toEqual(['0.5']);
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
  it('has frozen corpora of 0.1 to 0.4 to be judged by', () => {
    expect(keepingVersion(invalidCompositionCasesV01).length).toBeGreaterThan(35);
    expect(keepingVersion(invalidCompositionCasesV02).length).toBeGreaterThan(45);
    expect(keepingVersion(invalidCompositionCasesV03).length).toBeGreaterThan(50);
    expect(keepingVersion(invalidCompositionCasesV04).length).toBeGreaterThan(60);
  });

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
    'is refused as 0.5 with the errors of validateComposition: $name',
    ({ patch, expectedErrors }) => {
      const result = failure(migrateComposition(applyPatch(referenceComposition, patch)));
      expect(result.version).toBe('0.5');
      expect(result.versions).toEqual(['0.5']);
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

  it('judges a 0.4 document by the schema of 0.4: the fields of a scene of 0.5 are unknown there', () => {
    const input = copy(referenceComposition);
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
    ['a future version', { ...copy(referenceComposition), schemaVersion: '0.6' }],
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
        next: (document) => ({ ...(document as object), schemaVersion: '0.5' }),
      },
      { version: '0.5', errors: () => [] },
    ];
    const result = migrateThrough(table, valid, referenceCompositionV01);
    if (result.ok) throw new Error('The invalid result was accepted.');
    expect(result.version).toBe('0.5');
    expect(result.versions).toEqual(['0.1', '0.5']);
    expect(new Set(result.errors.map(({ code }) => code))).toEqual(new Set(['missing-field']));
    // Two lifetime fields for each of six nodes, a fit, four fields of the clip,
    // and the duration and the clips of the scene.
    expect(result.errors).toHaveLength(19);
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

/**
 * The saved text of a composition (D43): `parseComposition`,
 * `serializeComposition`, and `SUPPORTED_SCHEMA_VERSIONS`.
 *
 * The expectations are the compatibility corpus of
 * `@kadrion/test-fixtures/compatibility`: every expected document was written
 * by hand, and documents are compared as JSON text, so the order of their keys
 * is part of every comparison. What a failure must carry is asked of
 * `migrateComposition` and `validateComposition` themselves, which have tests
 * of their own: these tests fix that the text layer adds nothing to their
 * verdicts and takes nothing away.
 */
import { createHash } from 'node:crypto';

import {
  invalidCompositionCases,
  invalidCompositionCasesV01,
  referenceComposition,
  referenceCompositionV01,
} from '@kadrion/test-fixtures';
import { compatibilityCorpus } from '@kadrion/test-fixtures/compatibility';
import { describe, expect, it, vi } from 'vitest';

import { SCHEMA_VERSION, validateComposition } from '../src/index.js';
import {
  migrateComposition,
  parseComposition,
  serializeComposition,
  SUPPORTED_SCHEMA_VERSIONS,
  type MigrationResult,
  type ParseCompositionResult,
  type SerializeCompositionResult,
} from '../src/migrate.js';
import { parseThrough } from '../src/migration/text.js';
import { applyPatch } from './apply-patch.js';

const NOT_A_STRING = 'The saved composition is not a string.';
const INVALID_JSON = 'The saved composition is not JSON text.';
const MAX = Number.MAX_SAFE_INTEGER;

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

function hashOf(document: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(document)).digest('hex')}`;
}

/** Every object and array reachable from a value, itself included. */
function objectsOf(value: unknown, into = new Set<object>()): Set<object> {
  if (typeof value === 'object' && value !== null) {
    into.add(value);
    for (const child of Object.values(value)) objectsOf(child, into);
  }
  return into;
}

function loaded(result: ParseCompositionResult): Extract<ParseCompositionResult, { ok: true }> {
  if (!result.ok) throw new Error(`Not loaded: ${JSON.stringify(result)}`);
  return result;
}

function refused(result: ParseCompositionResult): Extract<ParseCompositionResult, { ok: false }> {
  if (result.ok) throw new Error('Loaded, but a failure was expected.');
  return result;
}

function saved(result: SerializeCompositionResult): string {
  if (!result.ok) throw new Error(`Not serialized: ${JSON.stringify(result.errors)}`);
  return result.text;
}

/** What the migration says of data, as the text layer must carry it. */
function documentFailure(data: unknown): unknown {
  const result: MigrationResult = migrateComposition(data);
  if (result.ok) throw new Error('The migration accepted the data.');
  return {
    ok: false,
    stage: 'document',
    version: result.version,
    versions: result.versions,
    errors: result.errors,
  };
}

/** A mutable, unfrozen copy: the fixtures are frozen. */
function copy(value: unknown): Record<string, unknown> {
  return structuredClone(value) as Record<string, unknown>;
}

const referenceText = JSON.stringify(referenceComposition);

describe('the compatibility corpus, read from saved text (D43.4, D43.6)', () => {
  it('holds documents of every supported version', () => {
    expect([...new Set(compatibilityCorpus.map((entry) => entry.schemaVersion))].sort()).toEqual(
      [...SUPPORTED_SCHEMA_VERSIONS].sort(),
    );
    expect(compatibilityCorpus.length).toBeGreaterThan(SUPPORTED_SCHEMA_VERSIONS.length);
  });

  it.each(compatibilityCorpus)(
    'loads $id as its hand-written document, key for key and in their order',
    (entry) => {
      const result = loaded(parseComposition(JSON.stringify(entry.input)));
      expect(result.versions).toEqual(entry.versions);
      expect(JSON.stringify(result.composition)).toBe(JSON.stringify(entry.expected));
      expect(hashOf(result.composition)).toBe(entry.expectedCompositionHash);
      expect(validateComposition(result.composition).ok).toBe(true);
    },
  );

  it.each(compatibilityCorpus)('loads $id the same whatever the white space', (entry) => {
    const compact = JSON.stringify(entry.input);
    const pretty = `${JSON.stringify(entry.input, null, 2)}\n`;
    const variants = [
      pretty,
      pretty.replaceAll('\n', '\r\n'),
      JSON.stringify(entry.input, null, '\t'),
      `\n\t  ${compact}  \r\n`,
    ];
    // The premise: these are four other texts.
    expect(new Set([compact, ...variants]).size).toBe(5);
    for (const text of variants) {
      const result = loaded(parseComposition(text));
      expect(result.versions).toEqual(entry.versions);
      expect(JSON.stringify(result.composition)).toBe(JSON.stringify(entry.expected));
    }
  });

  it.each(compatibilityCorpus)('reads $id as migrateComposition reads its data', (entry) => {
    const text = JSON.stringify(entry.input);
    const direct = migrateComposition(JSON.parse(text));
    if (!direct.ok) throw new Error('The migration refused a corpus entry.');
    const result = loaded(parseComposition(text));
    expect(result.versions).toEqual(direct.versions);
    expect(JSON.stringify(result.composition)).toBe(JSON.stringify(direct.composition));
  });

  it.each(compatibilityCorpus)('round-trips what $id loads as', (entry) => {
    const first = loaded(parseComposition(JSON.stringify(entry.input)));
    const text = saved(serializeComposition(first.composition));
    expect(text).toBe(JSON.stringify(entry.expected));
    // Loaded again, the document is current: no step, the same text, the same hash.
    const second = loaded(parseComposition(text));
    expect(second.versions).toEqual([SCHEMA_VERSION]);
    expect(saved(serializeComposition(second.composition))).toBe(text);
    expect(hashOf(second.composition)).toBe(entry.expectedCompositionHash);
    expect(second.composition).not.toBe(first.composition);
  });
});

describe('the supported versions (D43.5)', () => {
  it('is the frozen list of the migration, oldest first, the current one last', () => {
    expect(SUPPORTED_SCHEMA_VERSIONS).toEqual(['0.1', '0.2']);
    expect(Object.isFrozen(SUPPORTED_SCHEMA_VERSIONS)).toBe(true);
    expect(SUPPORTED_SCHEMA_VERSIONS.at(-1)).toBe(SCHEMA_VERSION);
    expect(new Set(SUPPORTED_SCHEMA_VERSIONS).size).toBe(SUPPORTED_SCHEMA_VERSIONS.length);
  });

  it.each([...SUPPORTED_SCHEMA_VERSIONS])(
    'lists %s, which the migration knows: a document naming it is judged under it',
    (version) => {
      // Nothing but a version: refused, but under that version and not as unknown.
      const result = refused(parseComposition(JSON.stringify({ schemaVersion: version })));
      expect(result.stage).toBe('document');
      if (result.stage !== 'document') return;
      expect(result.version).toBe(version);
      expect(result.versions).toEqual([version]);
      expect(result.errors.map(({ code }) => code)).not.toContain('unsupported-schema-version');
    },
  );

  it.each([
    '0.3',
    '0.20',
    '0.2.0',
    '0.10',
    '0.02',
    '1.0',
    '0.2 ',
    ' 0.2',
    '.2',
    '00.1',
    '0.1.0',
    'v0.2',
    '',
  ])('refuses a valid body that names %j, which is not listed, and guesses nothing', (version) => {
    expect(SUPPORTED_SCHEMA_VERSIONS).not.toContain(version);
    const text = JSON.stringify({ ...copy(referenceComposition), schemaVersion: version });
    const result = refused(parseComposition(text));
    expect(result.stage).toBe('document');
    if (result.stage !== 'document') return;
    expect(result.version).toBeNull();
    expect(result.versions).toEqual([]);
    expect(result.errors.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'unsupported-schema-version', path: '/schemaVersion' },
    ]);
    // The message names every version a host may send instead.
    for (const supported of SUPPORTED_SCHEMA_VERSIONS) {
      expect(result.errors[0]?.message).toContain(`"${supported}"`);
    }
  });
});

describe('a text that is no JSON (D43.4)', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 5],
    ['a boolean', true],
    ['a document, not its text', referenceComposition],
    ['an array of text', [referenceText]],
    ['a String object', new String(referenceText)],
    ['bytes', new TextEncoder().encode(referenceText)],
  ])('refuses %s as not a string, before JSON is tried', (_, input) => {
    const result = parseComposition(input as string);
    expect(result).toStrictEqual({
      ok: false,
      stage: 'text',
      error: { code: 'not-a-string', message: NOT_A_STRING },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(!result.ok && result.stage === 'text' && Object.isFrozen(result.error)).toBe(true);
  });

  it.each([
    ['the empty text', ''],
    ['white space', ' \n\t'],
    ['a truncated document', referenceText.slice(0, -1)],
    ['two documents', `${referenceText}${referenceText}`],
    ['a trailing comma', referenceText.replace(/}$/, ',}')],
    ['single quotes', "{'schemaVersion':'0.2'}"],
    ['an unquoted key', '{schemaVersion:"0.2"}'],
    ['a comment', `// saved by a host\n${referenceText}`],
    ['the word undefined', 'undefined'],
    ['NaN', referenceText.replace('"fps":30', '"fps":NaN')],
    ['a hexadecimal number', referenceText.replace('"fps":30', '"fps":0x1e')],
    ['a byte order mark before a valid document', `\uFEFF${referenceText}`],
  ])('refuses %s as invalid JSON, with a text of its own', (_, text) => {
    const result = parseComposition(text);
    expect(result).toStrictEqual({
      ok: false,
      stage: 'text',
      error: { code: 'invalid-json', message: INVALID_JSON },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(!result.ok && result.stage === 'text' && Object.isFrozen(result.error)).toBe(true);
  });

  it('holds valid documents in the texts it mutilated: the premise of the rows above', () => {
    expect(referenceText).toContain('"fps":30');
    expect(referenceText.endsWith('}')).toBe(true);
    expect(parseComposition(referenceText).ok).toBe(true);
  });

  it('never asks the migration about a text that is no JSON', () => {
    const migrate = vi.fn(migrateComposition);
    expect(parseThrough(migrate, 5).ok).toBe(false);
    expect(parseThrough(migrate, '{').ok).toBe(false);
    expect(migrate).not.toHaveBeenCalled();
    expect(parseThrough(migrate, referenceText).ok).toBe(true);
    expect(migrate).toHaveBeenCalledTimes(1);
  });

  it('never relabels what the migration reports or throws as invalid JSON', () => {
    // A verdict of the migration stays a verdict on the document.
    const verdict = refused(parseThrough(migrateComposition, '{"schemaVersion":"0.1"}'));
    expect(verdict.stage).toBe('document');
    // Even an error of the very kind JSON.parse throws passes through untouched.
    const broken = (): never => {
      throw new SyntaxError('thrown by the migration, not by JSON.parse');
    };
    expect(() => parseThrough(broken, referenceText)).toThrow(
      'thrown by the migration, not by JSON.parse',
    );
  });
});

describe('JSON that holds no supported document (D43.4, D42.8)', () => {
  it.each([
    ['null', 'null'],
    ['a number', '5'],
    ['a string that looks like a version', '"0.2"'],
    ['an array', '[]'],
    ['an empty object', '{}'],
    ['a document without a version', JSON.stringify({ width: 1 })],
    ['a number as the version', '{"schemaVersion":0.2}'],
    ['null as the version', '{"schemaVersion":null}'],
  ])('answers %s with the one error of an unknown version, not with invalid JSON', (_, text) => {
    const result = refused(parseComposition(text));
    expect(result).toStrictEqual(documentFailure(JSON.parse(text)));
    expect(result.stage === 'document' && result.version).toBeNull();
    expect(result.stage === 'document' && result.errors.map(({ code }) => code)).toEqual([
      'unsupported-schema-version',
    ]);
  });
});

describe('what the migration refuses, carried as it is (D42.8, D43.4)', () => {
  const cases = [
    ...invalidCompositionCasesV01.map(
      ({ name, patch }) => [`0.1: ${name}`, applyPatch(referenceCompositionV01, patch)] as const,
    ),
    ...invalidCompositionCases.map(
      ({ name, patch }) => [`0.2: ${name}`, applyPatch(referenceComposition, patch)] as const,
    ),
  ];

  it.each(cases)('carries the version, the versions, and every error of %s', (_, document) => {
    const text = JSON.stringify(document);
    const result = refused(parseComposition(text));
    // Asked of the data the text holds: JSON has no NaN and no undefined.
    expect(result).toStrictEqual(documentFailure(JSON.parse(text)));
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.stage === 'document' && Object.isFrozen(result.versions)).toBe(true);
    expect(result.stage === 'document' && Object.isFrozen(result.errors)).toBe(true);
  });

  it('carries several errors where the document has several: one is not promised', () => {
    const document = copy(referenceComposition);
    document['width'] = 0;
    document['height'] = 0;
    document['fps'] = 0;
    const result = refused(parseComposition(JSON.stringify(document)));
    expect(result.stage).toBe('document');
    if (result.stage !== 'document') return;
    expect(result.version).toBe(SCHEMA_VERSION);
    expect(result.errors.map(({ path }) => path)).toEqual(['/width', '/height', '/fps']);
    // The same holds for a document of an earlier version.
    const older = copy(referenceCompositionV01);
    older['width'] = 0;
    older['fps'] = 0;
    const earlier = refused(parseComposition(JSON.stringify(older)));
    expect(earlier.stage === 'document' && earlier.version).toBe('0.1');
    expect(earlier.stage === 'document' && earlier.errors).toHaveLength(2);
  });
});

describe('the rules of JSON, and no others (D43.2)', () => {
  it('lets the last of two equal keys win, as JSON.parse does', () => {
    // A valid 0.2 body with two versions: the later one decides.
    const current = referenceText.replace(
      '"schemaVersion":"0.2"',
      '"schemaVersion":"0.1","schemaVersion":"0.2"',
    );
    expect(loaded(parseComposition(current)).versions).toEqual(['0.2']);
    const older = referenceText.replace(
      '"schemaVersion":"0.2"',
      '"schemaVersion":"0.2","schemaVersion":"0.1"',
    );
    const judged = refused(parseComposition(older));
    // Judged as the 0.1 document its last key says it is, which it is not.
    expect(judged.stage === 'document' && judged.version).toBe('0.1');
    // And for any other field.
    const width = referenceText.replace('"width":1080', '"width":0,"width":1080');
    expect(width).not.toBe(referenceText);
    expect(JSON.stringify(loaded(parseComposition(width)).composition)).toBe(referenceText);
  });

  it('treats a __proto__ key as a field like any other: unknown, and harmless', () => {
    const text = referenceText.replace(/}$/, ',"__proto__":{"polluted":true}}');
    const result = refused(parseComposition(text));
    expect(
      result.stage === 'document' && result.errors.map(({ code, path }) => [code, path]),
    ).toEqual([['unknown-field', '/__proto__']]);
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
  });

  it.each([
    ['an exponent', '1e7'],
    ['a fraction of zero', '10000000.0'],
    ['a capital exponent with a sign', '1E+7'],
    ['a negative exponent', '100000000e-1'],
  ])('reads %s as the integer it is: checks see the value, not the spelling', (_, spelling) => {
    const text = referenceText.replace(
      '"durationUs":10000000,"assets"',
      `"durationUs":${spelling},"assets"`,
    );
    expect(text).not.toBe(referenceText);
    const result = loaded(parseComposition(text));
    // The same document, and saved again in the one spelling JSON.stringify has.
    expect(saved(serializeComposition(result.composition))).toBe(referenceText);
  });

  it('accepts a spelling that rounds to a valid value, and refuses one that rounds out of range', () => {
    const withDuration = (spelling: string): string =>
      referenceText.replace('"durationUs":10000000,"assets"', `"durationUs":${spelling},"assets"`);
    // 2^53 - 1 + 0.4 has no double of its own: JSON.parse reads 2^53 - 1.
    const rounded = loaded(parseComposition(withDuration('9007199254740991.4')));
    expect((rounded.composition as unknown as { durationUs: number }).durationUs).toBe(MAX);
    // 2^53 + 1 reads as 2^53, which is past the bound.
    const tooLarge = refused(parseComposition(withDuration('9007199254740993')));
    expect(tooLarge).toStrictEqual(documentFailure(JSON.parse(withDuration('9007199254740993'))));
    expect(
      tooLarge.stage === 'document' && tooLarge.errors.map(({ code, path }) => [code, path]),
    ).toEqual([['out-of-range', '/durationUs']]);
    // 1e999 reads as Infinity, which is no JSON number and no integer.
    const infinite = refused(parseComposition(withDuration('1e999')));
    expect(infinite).toStrictEqual(documentFailure(JSON.parse(withDuration('1e999'))));
    expect(
      infinite.stage === 'document' && infinite.errors.map(({ code, path }) => [code, path]),
    ).toEqual([['invalid-type', '/durationUs']]);
  });

  it('reads -0 as -0 and writes it as 0, which the composition hash does not see', () => {
    const text = referenceText.replace('"startUs":0', '"startUs":-0');
    expect(text).not.toBe(referenceText);
    const result = loaded(parseComposition(text));
    const zeros: number[] = [];
    const walk = (value: unknown): void => {
      if (typeof value === 'number' && Object.is(value, -0)) zeros.push(value);
      else if (typeof value === 'object' && value !== null) Object.values(value).forEach(walk);
    };
    walk(result.composition);
    expect(zeros).toHaveLength(1);
    expect(saved(serializeComposition(result.composition))).toBe(referenceText);
    expect(hashOf(result.composition)).toBe(hashOf(referenceComposition));
  });
});

describe('deeply nested JSON (D43.4)', () => {
  const DEPTH = 200_000;
  const texts: [string, string][] = [
    ['arrays', `${'['.repeat(DEPTH)}${']'.repeat(DEPTH)}`],
    ['objects', `${'{"a":'.repeat(DEPTH)}1${'}'.repeat(DEPTH)}`],
    [
      'arrays inside a field of a valid document',
      referenceText.replace('"assets":[', `"assets":[${'['.repeat(DEPTH)}${']'.repeat(DEPTH)},`),
    ],
    [
      'objects inside an unknown field of a valid document',
      referenceText.replace(/}$/, `,"deep":${'{"a":'.repeat(DEPTH)}1${'}'.repeat(DEPTH)}}`),
    ],
    ['unclosed arrays', '['.repeat(DEPTH)],
  ];

  it.each(texts)('answers %s with a result and does not throw', (_, text) => {
    expect(text.length).toBeGreaterThanOrEqual(DEPTH);
    let result: ParseCompositionResult | undefined;
    expect(() => {
      result = parseComposition(text);
    }).not.toThrow();
    expect(result?.ok).toBe(false);
    expect(Object.isFrozen(result)).toBe(true);
  });

  /**
   * The depth of the nested groups: smaller than the one of the bare texts
   * above, because every level is a whole node and the validator stops at the
   * first nested group, so a deeper text adds megabytes to parse and nothing to
   * check. It is still deeper than a recursive walk of the data survives.
   */
  const GROUP_DEPTH = 20_000;

  /**
   * Groups inside the `children` of groups, in a document that is valid but for
   * that: the one place where a document nests. The text is built level by
   * level in a loop, and goes through `JSON.parse` and the validation of its
   * version like any saved text.
   */
  function nestedGroups(version: string, depth: number): string {
    const lifetime = version === '0.1' ? '' : '"startUs":0,"durationUs":1,';
    let open = '';
    let close = '';
    for (let level = 0; level < depth; level += 1) {
      open +=
        `{"id":"group-${String(level)}","type":"group",${lifetime}"position":{"x":0,"y":0},` +
        '"scale":{"x":1,"y":1},"opacity":1,"animations":[],"children":[';
      close += ']}';
    }
    return (
      `{"schemaVersion":"${version}","width":1,"height":1,"fps":1,"durationUs":1,"assets":[],` +
      `"scenes":[{"id":"scene","nodes":[${open}${close}]}],"clips":[]}`
    );
  }

  it.each([...SUPPORTED_SCHEMA_VERSIONS])(
    'answers groups nested in groups in a %s document with the verdict on the first, at any depth',
    (version) => {
      // The premise: one such group is a valid document, so only the nesting is refused.
      const single = loaded(parseComposition(nestedGroups(version, 1)));
      expect(single.versions.at(0)).toBe(version);
      // Groups do not nest (D16): the first group inside a group is the error.
      const nesting = [
        { code: 'invalid-value', path: '/scenes/0/nodes/0/children/0/type' },
      ] as const;
      const shallow = refused(parseComposition(nestedGroups(version, 2)));
      expect(shallow.stage === 'document' && shallow.version).toBe(version);
      expect(
        shallow.stage === 'document' && shallow.errors.map(({ code, path }) => ({ code, path })),
      ).toEqual(nesting);

      const text = nestedGroups(version, GROUP_DEPTH);
      expect(text.split('"children":[').length - 1).toBe(GROUP_DEPTH);
      let deep: ParseCompositionResult | undefined;
      expect(() => {
        deep = parseComposition(text);
      }).not.toThrow();
      // The same verdict on the document as two levels get, and no fault of the text.
      expect(deep).toStrictEqual(shallow);
      expect(Object.isFrozen(deep)).toBe(true);
    },
  );
});

describe('ownership and freezing (D43.4, D43.3)', () => {
  // Both ways to a success: a document that is migrated, and one that is current.
  const successes = [
    ['a migrated 0.1 document', JSON.stringify(referenceCompositionV01), ['0.1', SCHEMA_VERSION]],
    ['a current document', referenceText, [SCHEMA_VERSION]],
  ] as const;

  it.each(successes)(
    'returns %s in a frozen result as the caller’s own, unfrozen tree',
    (_, text, versions) => {
      const result = loaded(parseComposition(text));
      expect(result.versions).toEqual(versions);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.versions)).toBe(true);
      const objects = objectsOf(result.composition);
      expect(objects.size).toBeGreaterThan(30);
      expect([...objects].filter((object) => Object.isFrozen(object))).toEqual([]);
      // Unfrozen all the way down: a write at the root and one in a nested array take.
      const tree = result.composition as unknown as { width: number; assets: unknown[] };
      tree.width = 1;
      tree.assets.length = 0;
      expect([tree.width, tree.assets]).toEqual([1, []]);
    },
  );

  it.each(successes)('gives every call that loads %s a tree of its own', (_, text) => {
    const first = loaded(parseComposition(text));
    const second = loaded(parseComposition(text));
    expect(second).not.toBe(first);
    const mine = objectsOf(first.composition);
    expect(mine.size).toBeGreaterThan(30);
    expect([...objectsOf(second.composition)].filter((object) => mine.has(object))).toEqual([]);
    // A write to one, at the root and deep inside, does not reach the other.
    const untouched = JSON.stringify(second.composition);
    const tree = first.composition as unknown as { width: number; assets: unknown[] };
    tree.width = 1;
    tree.assets.length = 0;
    expect(JSON.stringify(first.composition)).not.toBe(untouched);
    expect(JSON.stringify(second.composition)).toBe(untouched);
    expect(untouched).toBe(referenceText);
  });

  it('shares nothing between a migrated tree and a current one of the same document', () => {
    const migrated = loaded(parseComposition(JSON.stringify(referenceCompositionV01)));
    const current = loaded(parseComposition(referenceText));
    const mine = objectsOf(migrated.composition);
    expect([...objectsOf(current.composition)].filter((object) => mine.has(object))).toEqual([]);
    expect(JSON.stringify(migrated.composition)).toBe(JSON.stringify(current.composition));
  });

  it('neither writes nor freezes the document it serializes', () => {
    const document = copy(referenceComposition);
    const before = JSON.stringify(document);
    const result = serializeComposition(document);
    expect(result.ok).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(document)).toBe(before);
    expect([...objectsOf(document)].filter((object) => Object.isFrozen(object))).toEqual([]);
    // And a refusal leaves it alone as well.
    const older = copy(referenceCompositionV01);
    const olderBefore = JSON.stringify(older);
    const refusal = serializeComposition(older);
    expect(Object.isFrozen(refusal)).toBe(true);
    expect(!refusal.ok && Object.isFrozen(refusal.errors)).toBe(true);
    expect(JSON.stringify(older)).toBe(olderBefore);
    expect([...objectsOf(older)].filter((object) => Object.isFrozen(object))).toEqual([]);
  });

  it('serializes a deeply frozen document: it needs to write nothing', () => {
    expect(Object.isFrozen(referenceComposition)).toBe(true);
    expect(saved(serializeComposition(referenceComposition))).toBe(referenceText);
  });
});

describe('serializeComposition (D43.3)', () => {
  it.each(compatibilityCorpus.filter((entry) => entry.schemaVersion === SCHEMA_VERSION))(
    'writes $id as compact JSON without a trailing newline',
    (entry) => {
      // The whole result: nothing beside the text, which is the compact JSON of the document.
      expect(serializeComposition(entry.input)).toStrictEqual({
        ok: true,
        text: JSON.stringify(entry.input),
      });
      const text = saved(serializeComposition(entry.input));
      expect(text.endsWith('}')).toBe(true);
      expect(text).not.toMatch(/[\r\n]/);
    },
  );

  it('keeps the keys in the order the document has them', () => {
    const reversed = Object.fromEntries(Object.entries(copy(referenceComposition)).reverse());
    const text = saved(serializeComposition(reversed));
    expect(text.startsWith('{"clips":')).toBe(true);
    expect(text).not.toBe(referenceText);
    // Another text of the same document: one composition hash.
    expect(hashOf(JSON.parse(text))).toBe(hashOf(referenceComposition));
  });

  it.each(compatibilityCorpus.filter((entry) => entry.schemaVersion !== SCHEMA_VERSION))(
    'refuses $id, a document of an earlier version, and does not migrate it',
    (entry) => {
      const result = serializeComposition(entry.input);
      expect(result.ok).toBe(false);
      expect('text' in result).toBe(false);
      expect(!result.ok && result.errors.map(({ code, path }) => ({ code, path }))).toEqual([
        { code: 'unsupported-schema-version', path: '/schemaVersion' },
      ]);
      // The premise: it is a document the migration would have carried forward.
      expect(migrateComposition(entry.input).ok).toBe(true);
    },
  );

  it.each(
    invalidCompositionCases.map(
      ({ name, patch }) => [name, applyPatch(referenceComposition, patch)] as const,
    ),
  )('refuses %s with exactly the errors of validateComposition', (_, document) => {
    const verdict = validateComposition(document);
    if (verdict.ok) throw new Error('The validator accepted an invalid case.');
    const result = serializeComposition(document);
    expect(result).toStrictEqual({ ok: false, errors: verdict.errors });
    expect(Object.isFrozen(result)).toBe(true);
    expect(!result.ok && Object.isFrozen(result.errors)).toBe(true);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 5],
    ['its own text', referenceText],
    ['an array', []],
  ])('refuses %s, which is no document', (_, input) => {
    const verdict = validateComposition(input);
    if (verdict.ok) throw new Error('The validator accepted a value that is no document.');
    expect(serializeComposition(input)).toStrictEqual({ ok: false, errors: verdict.errors });
  });
});

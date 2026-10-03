/**
 * The schema of 0.1, kept as frozen data (D35.4, D24.2, D42.8). Its hash was
 * recorded from `compositionSchema` of the last build of 0.1, before schema 0.2
 * was written, so a schema rebuilt from memory, or from 0.2 with two fields
 * taken out, does not pass. Like the current schema it is frozen through and
 * through, stays within the validator's keyword subset, and agrees with a
 * reference implementation of JSON Schema (D17.4).
 */
import { createHash } from 'node:crypto';

import {
  invalidCompositionCasesV01,
  referenceComposition,
  referenceCompositionV01,
} from '@kadrion/test-fixtures';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import { compositionSchema, SCHEMA_VERSION } from '../src/index.js';
import { compositionSchemaV01, SCHEMA_VERSION_V01 } from '../src/v0-1/composition-schema.js';
import { assertSupportedSchema, validateStructure } from '../src/validate-structure.js';
import { applyPatch } from './apply-patch.js';

/** `JSON.stringify(compositionSchema)` of commit 27d6259, the last build of schema 0.1. */
const SCHEMA_V01_SHA256 = '1d311b8710363fef67234639df2b9162fcc582e6ab7a3d7d56f5a5d1f7beb3df';

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function everyObject(value: unknown, into: object[] = []): object[] {
  if (typeof value === 'object' && value !== null) {
    into.push(value);
    for (const child of Object.values(value)) everyObject(child, into);
  }
  return into;
}

describe('the frozen schema of 0.1 (D35.4)', () => {
  it('is, byte for byte, the schema the last build of 0.1 had', () => {
    expect(sha256(JSON.stringify(compositionSchemaV01))).toBe(SCHEMA_V01_SHA256);
    expect(SCHEMA_VERSION_V01).toBe('0.1');
  });

  it('is not the current schema, whose version it precedes', () => {
    expect(SCHEMA_VERSION).toBe('0.2');
    expect(sha256(JSON.stringify(compositionSchema))).not.toBe(SCHEMA_V01_SHA256);
  });

  it('is frozen with everything reachable from it, like the current schema (D24.2)', () => {
    for (const schema of [compositionSchemaV01, compositionSchema]) {
      const objects = everyObject(schema);
      expect(objects.length).toBeGreaterThan(100);
      expect(objects.filter((object) => !Object.isFrozen(object))).toEqual([]);
    }
  });

  it('stays within the keyword subset the validator interprets', () => {
    expect(() => {
      assertSupportedSchema(compositionSchemaV01);
    }).not.toThrow();
  });

  it('accepts the reference of 0.1 and refuses the reference of 0.2', () => {
    expect(validateStructure(compositionSchemaV01, referenceCompositionV01)).toEqual([]);
    const errors = validateStructure(compositionSchemaV01, referenceComposition);
    expect(errors.map(({ code }) => code)).toContain('unknown-field');
    expect(errors.find(({ path }) => path === '/schemaVersion')?.code).toBe('invalid-value');
  });
});

describe('conformance of the frozen schema with JSON Schema draft 2020-12 (D17.4)', () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const accepts = ajv.compile(compositionSchemaV01);

  it('is a well-formed schema under the strict mode of a reference implementation', () => {
    expect(ajv.validateSchema(compositionSchemaV01)).toBe(true);
  });

  it('agrees with the reference implementation on the frozen corpus of 0.1', () => {
    const documents = [
      referenceCompositionV01,
      ...invalidCompositionCasesV01.map(({ patch }) => applyPatch(referenceCompositionV01, patch)),
    ];
    const verdicts = documents.map((document) => accepts(document));
    // The premise: the corpus has documents of both verdicts.
    expect(verdicts.filter(Boolean).length).toBeGreaterThan(1);
    expect(verdicts.filter((verdict) => !verdict).length).toBeGreaterThan(20);
    documents.forEach((document, index) => {
      expect(validateStructure(compositionSchemaV01, document).length === 0, String(index)).toBe(
        verdicts[index],
      );
    });
  });
});

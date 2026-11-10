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
  invalidCompositionCasesV02,
  invalidCompositionCasesV03,
  referenceComposition,
  referenceCompositionV01,
  referenceCompositionV02,
  referenceCompositionV03,
  referenceCompositionV04,
  invalidCompositionCasesV04,
  referenceCompositionV05,
  invalidCompositionCasesV05,
  referenceCompositionV06,
  invalidCompositionCasesV06,
  referenceCompositionV07,
  invalidCompositionCasesV07,
  referenceCompositionV08,
  invalidCompositionCasesV08,
  referenceCompositionV09,
  invalidCompositionCasesV09,
  referenceCompositionV010,
  invalidCompositionCasesV010,
} from '@kadrion/test-fixtures';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import { compositionSchema, SCHEMA_VERSION } from '../src/index.js';
import { compositionSchemaV01, SCHEMA_VERSION_V01 } from '../src/v0-1/composition-schema.js';
import { compositionSchemaV02, SCHEMA_VERSION_V02 } from '../src/v0-2/composition-schema.js';
import { compositionSchemaV03, SCHEMA_VERSION_V03 } from '../src/v0-3/composition-schema.js';
import { compositionSchemaV04, SCHEMA_VERSION_V04 } from '../src/v0-4/composition-schema.js';
import { compositionSchemaV05, SCHEMA_VERSION_V05 } from '../src/v0-5/composition-schema.js';
import { compositionSchemaV06, SCHEMA_VERSION_V06 } from '../src/v0-6/composition-schema.js';
import { compositionSchemaV07, SCHEMA_VERSION_V07 } from '../src/v0-7/composition-schema.js';
import { compositionSchemaV08, SCHEMA_VERSION_V08 } from '../src/v0-8/composition-schema.js';
import { compositionSchemaV09, SCHEMA_VERSION_V09 } from '../src/v0-9/composition-schema.js';
import { compositionSchemaV010, SCHEMA_VERSION_V010 } from '../src/v0-10/composition-schema.js';
import { assertSupportedSchema, validateStructure } from '../src/validate-structure.js';
import { applyPatch } from './apply-patch.js';

/** `JSON.stringify(compositionSchema)` of commit 27d6259, the last build of schema 0.1. */
const SCHEMA_V01_SHA256 = '1d311b8710363fef67234639df2b9162fcc582e6ab7a3d7d56f5a5d1f7beb3df';
/** `JSON.stringify(compositionSchema)` of commit 6707a5a, the last build of schema 0.2. */
const SCHEMA_V02_SHA256 = '3a603b03ebf08024a980edc422eca06e3549c8209df02df383ccb4b5c0bd0252';
/** `JSON.stringify(compositionSchema)` of commit 0e3c8c9, the last build of schema 0.3. */
const SCHEMA_V03_SHA256 = 'd62167a646893d98f9be50855f7a357eef7a5274c9272ff8741b48aebc833259';
/** `JSON.stringify(compositionSchema)` of commit 6bfc534, the last build of schema 0.4. */
const SCHEMA_V04_SHA256 = '20255d0d226225eb731069d51459cbad0c1e7b88d1576fd3c5070f48b73e9137';
/** `JSON.stringify(compositionSchema)` of commit 2959915, the last build of schema 0.5. */
const SCHEMA_V05_SHA256 = 'd1f5225c7c3450453e79941d6699dfc8bcda6c517884e728f2da2e308c2e239d';
/** `JSON.stringify(compositionSchema)` of commit 62f0329, the last build of schema 0.6. */
const SCHEMA_V06_SHA256 = '0dbe5d675f7d92b30e774cea927d95b7ed7f9ae56568099f4e7e3882cc8158c3';
/** `JSON.stringify(compositionSchema)` of commit a2a2e58, the last build of schema 0.7. */
const SCHEMA_V07_SHA256 = '73ebefffa58253ca22972d6c0d3a7b50e5e33d05d36e0cf4db840bd814c11d3f';
/** `JSON.stringify(compositionSchema)` of commit c69ccee, the last build of schema 0.8. */
const SCHEMA_V08_SHA256 = '5db265a1413f696c8bd54a137cfca06c9066ba8c79f3eb0cd153a8573df351e0';
/** `JSON.stringify(compositionSchema)` of commit d924b2d, the last build of schema 0.9. */
const SCHEMA_V09_SHA256 = '84412aad3878db5fc0ea18932cab98133a05bc1097f09ab8dbc675aee663c835';
/** `JSON.stringify(compositionSchema)` of commit 3837211, the last build of schema 0.10. */
const SCHEMA_V010_SHA256 = '43b09fde081b42557e614278adc86b2fdcabecc0da8980918655c1b4250a41bd';

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
    expect(SCHEMA_VERSION).toBe('0.23');
    expect(sha256(JSON.stringify(compositionSchema))).not.toBe(SCHEMA_V01_SHA256);
    expect(sha256(JSON.stringify(compositionSchema))).not.toBe(SCHEMA_V02_SHA256);
    expect(sha256(JSON.stringify(compositionSchema))).not.toBe(SCHEMA_V03_SHA256);
    expect(sha256(JSON.stringify(compositionSchema))).not.toBe(SCHEMA_V04_SHA256);
    expect(sha256(JSON.stringify(compositionSchema))).not.toBe(SCHEMA_V05_SHA256);
    expect(sha256(JSON.stringify(compositionSchema))).not.toBe(SCHEMA_V06_SHA256);
    expect(sha256(JSON.stringify(compositionSchema))).not.toBe(SCHEMA_V07_SHA256);
    expect(sha256(JSON.stringify(compositionSchema))).not.toBe(SCHEMA_V08_SHA256);
    expect(sha256(JSON.stringify(compositionSchema))).not.toBe(SCHEMA_V09_SHA256);
    expect(sha256(JSON.stringify(compositionSchema))).not.toBe(SCHEMA_V010_SHA256);
  });

  it('has a frozen schema of 0.10 that is, byte for byte, the schema the last build of 0.10 had', () => {
    expect(sha256(JSON.stringify(compositionSchemaV010))).toBe(SCHEMA_V010_SHA256);
    expect(SCHEMA_VERSION_V010).toBe('0.10');
    expect(() => {
      assertSupportedSchema(compositionSchemaV010);
    }).not.toThrow();
    const objects = everyObject(compositionSchemaV010);
    expect(objects.filter((object) => !Object.isFrozen(object))).toEqual([]);
    expect(validateStructure(compositionSchemaV010, referenceCompositionV010)).toEqual([]);
    expect(
      validateStructure(compositionSchemaV010, referenceComposition).map(({ code }) => code),
    ).toContain('invalid-value');
  });

  it('has a frozen schema of 0.9 that is, byte for byte, the schema the last build of 0.9 had', () => {
    expect(sha256(JSON.stringify(compositionSchemaV09))).toBe(SCHEMA_V09_SHA256);
    expect(SCHEMA_VERSION_V09).toBe('0.9');
    expect(() => {
      assertSupportedSchema(compositionSchemaV09);
    }).not.toThrow();
    const objects = everyObject(compositionSchemaV09);
    expect(objects.filter((object) => !Object.isFrozen(object))).toEqual([]);
    expect(validateStructure(compositionSchemaV09, referenceCompositionV09)).toEqual([]);
    expect(
      validateStructure(compositionSchemaV09, referenceComposition).map(({ code }) => code),
    ).toContain('unknown-field');
  });

  it('has a frozen schema of 0.8 that is, byte for byte, the schema the last build of 0.8 had', () => {
    expect(sha256(JSON.stringify(compositionSchemaV08))).toBe(SCHEMA_V08_SHA256);
    expect(SCHEMA_VERSION_V08).toBe('0.8');
    expect(() => {
      assertSupportedSchema(compositionSchemaV08);
    }).not.toThrow();
    const objects = everyObject(compositionSchemaV08);
    expect(objects.filter((object) => !Object.isFrozen(object))).toEqual([]);
    expect(validateStructure(compositionSchemaV08, referenceCompositionV08)).toEqual([]);
    expect(
      validateStructure(compositionSchemaV08, referenceComposition).map(({ code }) => code),
    ).toContain('invalid-value');
  });

  it('has a frozen schema of 0.7 that is, byte for byte, the schema the last build of 0.7 had', () => {
    expect(sha256(JSON.stringify(compositionSchemaV07))).toBe(SCHEMA_V07_SHA256);
    expect(SCHEMA_VERSION_V07).toBe('0.7');
    expect(() => {
      assertSupportedSchema(compositionSchemaV07);
    }).not.toThrow();
    const objects = everyObject(compositionSchemaV07);
    expect(objects.filter((object) => !Object.isFrozen(object))).toEqual([]);
    expect(validateStructure(compositionSchemaV07, referenceCompositionV07)).toEqual([]);
    expect(
      validateStructure(compositionSchemaV07, referenceComposition).map(({ code }) => code),
    ).toContain('invalid-value');
  });

  it('has a frozen schema of 0.6 that is, byte for byte, the schema the last build of 0.6 had', () => {
    expect(sha256(JSON.stringify(compositionSchemaV06))).toBe(SCHEMA_V06_SHA256);
    expect(SCHEMA_VERSION_V06).toBe('0.6');
    expect(() => {
      assertSupportedSchema(compositionSchemaV06);
    }).not.toThrow();
    const objects = everyObject(compositionSchemaV06);
    expect(objects.filter((object) => !Object.isFrozen(object))).toEqual([]);
    expect(validateStructure(compositionSchemaV06, referenceCompositionV06)).toEqual([]);
    expect(
      validateStructure(compositionSchemaV06, referenceComposition).map(({ code }) => code),
    ).toContain('invalid-value');
  });

  it('has a frozen schema of 0.5 that is, byte for byte, the schema the last build of 0.5 had', () => {
    expect(sha256(JSON.stringify(compositionSchemaV05))).toBe(SCHEMA_V05_SHA256);
    expect(SCHEMA_VERSION_V05).toBe('0.5');
    expect(() => {
      assertSupportedSchema(compositionSchemaV05);
    }).not.toThrow();
    const objects = everyObject(compositionSchemaV05);
    expect(objects.filter((object) => !Object.isFrozen(object))).toEqual([]);
    expect(validateStructure(compositionSchemaV05, referenceCompositionV05)).toEqual([]);
    expect(
      validateStructure(compositionSchemaV05, referenceComposition).map(({ code }) => code),
    ).toContain('unknown-field');
  });

  it('has a frozen schema of 0.4 that is, byte for byte, the schema the last build of 0.4 had', () => {
    expect(sha256(JSON.stringify(compositionSchemaV04))).toBe(SCHEMA_V04_SHA256);
    expect(SCHEMA_VERSION_V04).toBe('0.4');
    expect(() => {
      assertSupportedSchema(compositionSchemaV04);
    }).not.toThrow();
    const objects = everyObject(compositionSchemaV04);
    expect(objects.filter((object) => !Object.isFrozen(object))).toEqual([]);
    expect(validateStructure(compositionSchemaV04, referenceCompositionV04)).toEqual([]);
    expect(
      validateStructure(compositionSchemaV04, referenceComposition).map(({ code }) => code),
    ).toContain('unknown-field');
  });

  it('has a frozen schema of 0.3 that is, byte for byte, the schema the last build of 0.3 had', () => {
    expect(sha256(JSON.stringify(compositionSchemaV03))).toBe(SCHEMA_V03_SHA256);
    expect(SCHEMA_VERSION_V03).toBe('0.3');
    expect(() => {
      assertSupportedSchema(compositionSchemaV03);
    }).not.toThrow();
    const objects = everyObject(compositionSchemaV03);
    expect(objects.filter((object) => !Object.isFrozen(object))).toEqual([]);
    expect(validateStructure(compositionSchemaV03, referenceCompositionV03)).toEqual([]);
    expect(
      validateStructure(compositionSchemaV03, referenceComposition).map(({ code }) => code),
    ).toContain('unknown-field');
  });

  it('has a frozen schema of 0.2 that is, byte for byte, the schema the last build of 0.2 had', () => {
    expect(sha256(JSON.stringify(compositionSchemaV02))).toBe(SCHEMA_V02_SHA256);
    expect(SCHEMA_VERSION_V02).toBe('0.2');
    expect(() => {
      assertSupportedSchema(compositionSchemaV02);
    }).not.toThrow();
    const objects = everyObject(compositionSchemaV02);
    expect(objects.filter((object) => !Object.isFrozen(object))).toEqual([]);
    expect(validateStructure(compositionSchemaV02, referenceCompositionV02)).toEqual([]);
    expect(
      validateStructure(compositionSchemaV02, referenceComposition).map(({ code }) => code),
    ).toContain('unknown-field');
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

describe('conformance of the frozen schema of 0.6 with JSON Schema draft 2020-12 (D17.4)', () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const accepts = ajv.compile(compositionSchemaV06);

  it('agrees with the reference implementation on the frozen corpus of 0.6', () => {
    expect(ajv.validateSchema(compositionSchemaV06)).toBe(true);
    const documents = [
      referenceCompositionV06,
      ...invalidCompositionCasesV06.map(({ patch }) => applyPatch(referenceCompositionV06, patch)),
    ];
    const verdicts = documents.map((document) => accepts(document));
    expect(verdicts.filter((verdict) => !verdict).length).toBeGreaterThan(20);
    documents.forEach((document, index) => {
      expect(validateStructure(compositionSchemaV06, document).length === 0, String(index)).toBe(
        verdicts[index],
      );
    });
  });
});

describe('conformance of the frozen schema of 0.5 with JSON Schema draft 2020-12 (D17.4)', () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const accepts = ajv.compile(compositionSchemaV05);

  it('agrees with the reference implementation on the frozen corpus of 0.5', () => {
    expect(ajv.validateSchema(compositionSchemaV05)).toBe(true);
    const documents = [
      referenceCompositionV05,
      ...invalidCompositionCasesV05.map(({ patch }) => applyPatch(referenceCompositionV05, patch)),
    ];
    const verdicts = documents.map((document) => accepts(document));
    expect(verdicts.filter((verdict) => !verdict).length).toBeGreaterThan(20);
    documents.forEach((document, index) => {
      expect(validateStructure(compositionSchemaV05, document).length === 0, String(index)).toBe(
        verdicts[index],
      );
    });
  });
});

describe('conformance of the frozen schema of 0.4 with JSON Schema draft 2020-12 (D17.4)', () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const accepts = ajv.compile(compositionSchemaV04);

  it('agrees with the reference implementation on the frozen corpus of 0.4', () => {
    expect(ajv.validateSchema(compositionSchemaV04)).toBe(true);
    const documents = [
      referenceCompositionV04,
      ...invalidCompositionCasesV04.map(({ patch }) => applyPatch(referenceCompositionV04, patch)),
    ];
    const verdicts = documents.map((document) => accepts(document));
    expect(verdicts.filter((verdict) => !verdict).length).toBeGreaterThan(20);
    documents.forEach((document, index) => {
      expect(validateStructure(compositionSchemaV04, document).length === 0, String(index)).toBe(
        verdicts[index],
      );
    });
  });
});

describe('conformance of the frozen schema of 0.3 with JSON Schema draft 2020-12 (D17.4)', () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const accepts = ajv.compile(compositionSchemaV03);

  it('agrees with the reference implementation on the frozen corpus of 0.3', () => {
    expect(ajv.validateSchema(compositionSchemaV03)).toBe(true);
    const documents = [
      referenceCompositionV03,
      ...invalidCompositionCasesV03.map(({ patch }) => applyPatch(referenceCompositionV03, patch)),
    ];
    const verdicts = documents.map((document) => accepts(document));
    expect(verdicts.filter((verdict) => !verdict).length).toBeGreaterThan(20);
    documents.forEach((document, index) => {
      expect(validateStructure(compositionSchemaV03, document).length === 0, String(index)).toBe(
        verdicts[index],
      );
    });
  });
});

describe('conformance of the frozen schema of 0.2 with JSON Schema draft 2020-12 (D17.4)', () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const accepts = ajv.compile(compositionSchemaV02);

  it('agrees with the reference implementation on the frozen corpus of 0.2', () => {
    expect(ajv.validateSchema(compositionSchemaV02)).toBe(true);
    const documents = [
      referenceCompositionV02,
      ...invalidCompositionCasesV02.map(({ patch }) => applyPatch(referenceCompositionV02, patch)),
    ];
    const verdicts = documents.map((document) => accepts(document));
    expect(verdicts.filter((verdict) => !verdict).length).toBeGreaterThan(20);
    documents.forEach((document, index) => {
      expect(validateStructure(compositionSchemaV02, document).length === 0, String(index)).toBe(
        verdicts[index],
      );
    });
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

describe('conformance of the frozen schema of 0.7 with JSON Schema draft 2020-12 (D17.4)', () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const accepts = ajv.compile(compositionSchemaV07);

  it('agrees with the reference implementation on the frozen corpus of 0.7', () => {
    expect(ajv.validateSchema(compositionSchemaV07)).toBe(true);
    const documents = [
      referenceCompositionV07,
      ...invalidCompositionCasesV07.map(({ patch }) => applyPatch(referenceCompositionV07, patch)),
    ];
    const verdicts = documents.map((document) => accepts(document));
    expect(verdicts.filter((verdict) => !verdict).length).toBeGreaterThan(20);
    documents.forEach((document, index) => {
      expect(validateStructure(compositionSchemaV07, document).length === 0, String(index)).toBe(
        verdicts[index],
      );
    });
  });
});

describe('conformance of the frozen schema of 0.8 with JSON Schema draft 2020-12 (D17.4)', () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const accepts = ajv.compile(compositionSchemaV08);

  it('agrees with the reference implementation on the frozen corpus of 0.8', () => {
    expect(ajv.validateSchema(compositionSchemaV08)).toBe(true);
    const documents = [
      referenceCompositionV08,
      ...invalidCompositionCasesV08.map(({ patch }) => applyPatch(referenceCompositionV08, patch)),
    ];
    const verdicts = documents.map((document) => accepts(document));
    expect(verdicts.filter((verdict) => !verdict).length).toBeGreaterThan(20);
    documents.forEach((document, index) => {
      expect(validateStructure(compositionSchemaV08, document).length === 0, String(index)).toBe(
        verdicts[index],
      );
    });
  });
});

describe('conformance of the frozen schema of 0.9 with JSON Schema draft 2020-12 (D17.4)', () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const accepts = ajv.compile(compositionSchemaV09);

  it('agrees with the reference implementation on the frozen corpus of 0.9', () => {
    expect(ajv.validateSchema(compositionSchemaV09)).toBe(true);
    const documents = [
      referenceCompositionV09,
      ...invalidCompositionCasesV09.map(({ patch }) => applyPatch(referenceCompositionV09, patch)),
    ];
    const verdicts = documents.map((document) => accepts(document));
    expect(verdicts.filter((verdict) => !verdict).length).toBeGreaterThan(20);
    documents.forEach((document, index) => {
      expect(validateStructure(compositionSchemaV09, document).length === 0, String(index)).toBe(
        verdicts[index],
      );
    });
  });
});

describe('conformance of the frozen schema of 0.10 with JSON Schema draft 2020-12 (D17.4)', () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const accepts = ajv.compile(compositionSchemaV010);

  it('agrees with the reference implementation on the frozen corpus of 0.10', () => {
    expect(ajv.validateSchema(compositionSchemaV010)).toBe(true);
    const documents = [
      referenceCompositionV010,
      ...invalidCompositionCasesV010.map(({ patch }) =>
        applyPatch(referenceCompositionV010, patch),
      ),
    ];
    const verdicts = documents.map((document) => accepts(document));
    expect(verdicts.filter((verdict) => !verdict).length).toBeGreaterThan(20);
    documents.forEach((document, index) => {
      expect(validateStructure(compositionSchemaV010, document).length === 0, String(index)).toBe(
        verdicts[index],
      );
    });
  });
});

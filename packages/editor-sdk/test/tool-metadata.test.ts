/**
 * The AI metadata of every command (D46.1): one entry per command of the
 * closed registry, in its order, carrying the command's own argument schema,
 * a description for a model, and an example the parser accepts and the
 * schema accepts.
 */
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import * as editorSdk from '../src/index.js';
import { COMMAND_TOOL_METADATA, COMMAND_TYPES, parseCommand } from '../src/index.js';

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

describe('COMMAND_TOOL_METADATA (D46.1)', () => {
  it('has one entry per command type, in the order of COMMAND_TYPES', () => {
    expect(COMMAND_TOOL_METADATA.map(({ commandType }) => commandType)).toEqual([...COMMAND_TYPES]);
  });

  it("carries each command's exported argument schema itself, not a copy", () => {
    const exported: Readonly<Record<string, unknown>> = editorSdk;
    for (const { commandType, argumentsSchema } of COMMAND_TOOL_METADATA) {
      const name = `${commandType.charAt(0).toLowerCase()}${commandType.slice(1)}ArgumentsSchema`;
      expect(argumentsSchema, commandType).toBe(exported[name]);
    }
  });

  it('gives an example that its schema and the parser both accept', () => {
    for (const { commandType, example, argumentsSchema } of COMMAND_TOOL_METADATA) {
      const accepts = new Ajv2020({ strict: true, strictNumbers: true }).compile(argumentsSchema);
      expect(accepts(example), commandType).toBe(true);
      expect(parseCommand({ type: commandType, ...example }).type).toBe(commandType);
    }
  });

  it('describes each command with its refusals', () => {
    for (const { commandType, description } of COMMAND_TOOL_METADATA) {
      expect(description, commandType).toMatch(/Refused with [a-z-]+/);
    }
  });

  it('is deep-frozen', () => {
    expect(isDeepFrozen(COMMAND_TOOL_METADATA)).toBe(true);
  });
});

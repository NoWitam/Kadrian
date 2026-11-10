/**
 * Ten requests a host's model is expected to meet with tool calls (PR-57,
 * D46): each fixture case names a request in words, the showcase it is made
 * on, the calls a model is expected to send, and the changes to the document
 * those calls must make, as JSON Patch operations (RFC 6902: add, remove, and
 * replace). The calls run through `executeTool` on a bus of their own, so the
 * case checks the tools, their descriptions' examples of arguments, and the
 * commands under them against one expected document, byte for byte, and
 * undoing every call gives the showcase back. It is no evaluation of a model:
 * choosing and prompting one is the host's (phase five, PR-57).
 */
import { readFileSync } from 'node:fs';

import { executeTool, TOOL_CATALOGUE } from '@kadrion/ai-sdk';
import { createCommandBus } from '@kadrion/editor-sdk';
import { describe, expect, it } from 'vitest';

interface Operation {
  readonly op: 'add' | 'remove' | 'replace';
  readonly path: string;
  readonly value?: unknown;
}

interface RequestCase {
  readonly request: string;
  /** The repository path of the showcase the request is made on. */
  readonly document: string;
  readonly calls: readonly { readonly name: string; readonly arguments: unknown }[];
  readonly changes: readonly Operation[];
}

const root = new URL('../../', import.meta.url);
const read = (path: string): unknown => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const CASES = read('tests/app/fixtures/model-requests.json') as readonly RequestCase[];

/** The keys of a JSON Pointer (RFC 6901). */
const keysOf = (pointer: string): string[] =>
  pointer
    .split('/')
    .slice(1)
    .map((key) => key.replaceAll('~1', '/').replaceAll('~0', '~'));

/** The document with the operations applied, in their order; the input is not changed. */
function applied(document: unknown, operations: readonly Operation[]): unknown {
  const copy = structuredClone(document);
  for (const { op, path, value } of operations) {
    const keys = keysOf(path);
    const last = keys.pop();
    if (last === undefined) throw new Error(`The operation ${op} has no path.`);
    let parent = copy as Record<string, unknown>;
    for (const key of keys) parent = parent[key] as Record<string, unknown>;
    if (Array.isArray(parent)) {
      const index = Number(last);
      if (!Number.isInteger(index) || index < 0 || index > parent.length) {
        throw new Error(`${path} is no index of its array.`);
      }
      if (op === 'add') parent.splice(index, 0, structuredClone(value));
      else if (op === 'remove') parent.splice(index, 1);
      else parent[index] = structuredClone(value);
    } else if (op === 'remove') {
      if (!(last in parent)) throw new Error(`${path} is not in the document.`);
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- a JSON Patch remove
      delete parent[last];
    } else {
      if (op === 'replace' && !(last in parent)) throw new Error(`${path} is not in the document.`);
      parent[last] = structuredClone(value);
    }
  }
  return copy;
}

describe('the fixture of requests (PR-57)', () => {
  it('has ten requests, each calling tools of the catalogue on a showcase', () => {
    expect(CASES).toHaveLength(10);
    const names = new Set(TOOL_CATALOGUE.map((tool) => tool.name));
    for (const request of CASES) {
      expect(request.document, request.request).toMatch(/^apps\/playground\/src\/showcases\//);
      expect(request.calls.length, request.request).toBeGreaterThan(0);
      expect(request.changes.length, request.request).toBeGreaterThan(0);
      for (const call of request.calls) expect(names, call.name).toContain(call.name);
    }
  });
});

describe.each(CASES)('the request "$request"', (request) => {
  it('gives its expected document, and undoing its calls gives the showcase back', () => {
    const source = read(request.document);
    const bus = createCommandBus(source);
    for (const call of request.calls) {
      const result = executeTool(bus, call.name, call.arguments);
      expect(['command', 'transaction'], call.name).toContain(result.kind);
    }
    // Strings rather than toEqual: a document is too large a tree to compare deeply in good time.
    expect(JSON.stringify(bus.getDocument())).toBe(
      JSON.stringify(applied(source, request.changes)),
    );
    request.calls.forEach(() => bus.undo());
    expect(JSON.stringify(bus.getDocument())).toBe(JSON.stringify(source));
  });
});

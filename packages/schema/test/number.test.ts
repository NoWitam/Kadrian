/**
 * A number in a text in the document (D91.2): every text has a `number`, the
 * kind `none` for none; a text with a number has no text of its own, two
 * separators that differ, and nothing that writes its text; the row `number`
 * animates the value of a text that has one, and of nothing else.
 */
import {
  numberComposition,
  referenceComposition,
  templateComposition,
} from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { validateComposition } from '../src/index.js';

type Node = Record<string, unknown> & { animations: Record<string, unknown>[] };
type Draft = {
  scenes: { nodes: (Node & { children?: Node[] })[] }[];
  definitions: { id: string; nodes: (Node & { children?: Node[] })[] }[];
  template: { bindings: Record<string, unknown>[] };
};

const FORMAT = {
  kind: 'number',
  value: 1234567.89,
  decimals: 2,
  decimalSeparator: ',',
  groupSeparator: ' ',
  prefix: '',
  suffix: ' zł',
} as const;

function edited(source: unknown, edit: (draft: Draft) => void): unknown {
  const draft = structuredClone(source) as Draft;
  edit(draft);
  return draft;
}

function nodeIn(draft: Draft, id: string): Node {
  for (const holder of [...draft.scenes, ...draft.definitions]) {
    for (const node of holder.nodes) {
      if (node['id'] === id) return node;
      for (const child of node.children ?? []) if (child['id'] === id) return child;
    }
  }
  throw new Error(`No node ${id}.`);
}

function errorsOf(document: unknown): { code: string; path: string }[] {
  const result = validateComposition(document);
  return result.ok ? [] : result.errors.map(({ code, path }) => ({ code, path }));
}

function numbered(node: Node): void {
  node['text'] = '';
  node['number'] = { ...FORMAT };
}

describe('a text with a number (D91.2)', () => {
  it('holds the fixture of numbers, and a text with a number in a group', () => {
    expect(errorsOf(numberComposition)).toEqual([]);
    expect(
      errorsOf(
        edited(referenceComposition, (draft) => {
          numbered(nodeIn(draft, 'node-caption'));
        }),
      ),
    ).toEqual([]);
  });

  it('takes every separator but the decimal one as the group separator, and none', () => {
    for (const decimalSeparator of ['.', ',']) {
      for (const groupSeparator of ['', ' ', ' ', ' ', '.', ',', "'"]) {
        const document = edited(referenceComposition, (draft) => {
          const title = nodeIn(draft, 'node-title');
          numbered(title);
          title['number'] = { ...FORMAT, decimalSeparator, groupSeparator };
        });
        expect(errorsOf(document)).toEqual(
          groupSeparator === decimalSeparator
            ? [{ code: 'invalid-number', path: '/scenes/0/nodes/2/number/groupSeparator' }]
            : [],
        );
      }
    }
  });

  it('refuses a text of its own beside the number', () => {
    const document = edited(referenceComposition, (draft) => {
      const title = nodeIn(draft, 'node-title');
      title['number'] = { ...FORMAT };
    });
    expect(errorsOf(document)).toEqual([
      { code: 'invalid-number', path: '/scenes/0/nodes/2/text' },
    ]);
  });

  it('bounds the decimals at six and the value at the safe integers', () => {
    for (const [field, value] of [
      ['decimals', 7],
      ['decimals', -1],
      ['decimals', 1.5],
      ['value', Number.MAX_SAFE_INTEGER + 2],
    ] as const) {
      const document = edited(referenceComposition, (draft) => {
        const title = nodeIn(draft, 'node-title');
        numbered(title);
        title['number'] = { ...FORMAT, [field]: value };
      });
      const errors = errorsOf(document);
      expect(errors.map(({ path }) => path)).toEqual([`/scenes/0/nodes/2/number/${field}`]);
    }
  });

  it('refuses a field the kind none does not have', () => {
    const document = edited(referenceComposition, (draft) => {
      nodeIn(draft, 'node-title')['number'] = { kind: 'none', value: 1 };
    });
    expect(errorsOf(document).length).toBeGreaterThan(0);
  });

  it('takes corners on a number without a frame, whose box the runtime measures (question 1 of D91)', () => {
    const document = edited(referenceComposition, (draft) => {
      const title = nodeIn(draft, 'node-title');
      numbered(title);
      title['corners'] = {
        topLeft: { x: 10, y: 0 },
        topRight: { x: 0, y: 0 },
        bottomRight: { x: 0, y: 0 },
        bottomLeft: { x: 0, y: 0 },
      };
    });
    expect(errorsOf(document)).toEqual([]);
  });
});

describe('the row number (D91.2)', () => {
  const animation = {
    id: 'animation-title-number',
    property: 'number',
    keyframes: [
      { timeUs: 0, value: -3, easing: { kind: 'cubic-bezier', x1: 0.3, y1: 1.6, x2: 0.6, y2: 1 } },
      { timeUs: 1_000_000, value: 1e9, easing: { kind: 'linear' } },
    ],
  };

  it('animates the value of a text with a number, with every curve of D67', () => {
    const document = edited(referenceComposition, (draft) => {
      const title = nodeIn(draft, 'node-title');
      numbered(title);
      title.animations.push(structuredClone(animation));
    });
    expect(errorsOf(document)).toEqual([]);
  });

  it('is refused on a text without a number, and on a node that is no text', () => {
    const plain = edited(referenceComposition, (draft) => {
      nodeIn(draft, 'node-title').animations.push(structuredClone(animation));
    });
    expect(errorsOf(plain)).toEqual([
      { code: 'invalid-number', path: '/scenes/0/nodes/2/animations/1' },
    ]);
    const image = edited(referenceComposition, (draft) => {
      nodeIn(draft, 'node-image').animations.push(structuredClone(animation));
    });
    expect(errorsOf(image).map(({ path }) => path)).toEqual([
      '/scenes/0/nodes/1/children/0/animations/1/property',
    ]);
  });

  it('is one animation of its node, as every row is', () => {
    const document = edited(referenceComposition, (draft) => {
      const title = nodeIn(draft, 'node-title');
      numbered(title);
      title.animations.push(structuredClone(animation), {
        ...structuredClone(animation),
        id: 'animation-title-number-again',
      });
    });
    expect(errorsOf(document).map(({ code }) => code)).toContain('duplicate-animation-target');
  });
});

describe('a template that would write the text of a number (D91.2)', () => {
  it('refuses a property binding of the text, and placeholders, on a text with a number', () => {
    const property = edited(templateComposition, (draft) => {
      numbered(nodeIn(draft, 'card-tagline'));
    });
    expect(errorsOf(property)).toEqual([
      { code: 'invalid-number', path: '/template/bindings/2/nodeId' },
    ]);
    const placeholders = edited(templateComposition, (draft) => {
      numbered(nodeIn(draft, 'card-title'));
    });
    expect(errorsOf(placeholders).map(({ code, path }) => ({ code, path }))).toContainEqual({
      code: 'invalid-number',
      path: '/template/bindings/1/nodeId',
    });
  });
});

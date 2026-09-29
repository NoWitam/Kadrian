/**
 * @vitest-environment jsdom
 *
 * Structural commands can add, duplicate, and restore a Custom HTML node
 * (D39.7), and the document still does not decide whether its code runs: the
 * host's policy does (D36). A document produced by those commands, mounted with
 * the policy `disabled`, gets the empty placeholder of every Custom HTML node
 * and no frame at all. The renderer is used as it is; only the documents come
 * from the bus.
 */
import { createCommandBus, type Command } from '@kadrion/editor-sdk';
import { mountComposition } from '@kadrion/renderer-dom';
import type { ValidatedComposition } from '@kadrion/schema';
import { referenceComposition, referenceExpectedRender } from '@kadrion/test-fixtures';
import { afterEach, describe, expect, it } from 'vitest';

const DISABLED = Object.freeze({ customHtml: Object.freeze({ mode: 'disabled' as const }) });
const TRUSTED = Object.freeze({ customHtml: Object.freeze({ mode: 'trusted' as const }) });
/** The stage carries it once too, so a placeholder is a node that carries it (D36). */
const MARK = 'data-kadrion-custom-html';

/** A second Custom HTML element, with its own ID. */
const html = {
  id: 'html-added',
  type: 'custom-html',
  position: { x: 90, y: 1500 },
  scale: { x: 1, y: 1 },
  opacity: 1,
  animations: [],
  width: 400,
  height: 100,
  html: '<script>parent.postMessage("ran", "*")</script>',
};

/**
 * Mounts a document into a fresh root, hands the root to `check`, and removes
 * the root — with every placeholder and frame the renderer put in it — in
 * `finally`, so a failed assertion leaves nothing mounted. The renderer keeps
 * no state of its own outside the root, and no Player is created here.
 */
function withMounted(
  document: ValidatedComposition,
  options: typeof DISABLED | typeof TRUSTED,
  check: (root: HTMLElement) => void,
): void {
  const root = window.document.createElement('div');
  window.document.body.append(root);
  try {
    mountComposition(root, document, referenceExpectedRender.assetUrls, options);
    check(root);
  } finally {
    root.remove();
  }
}

/** The documents the commands produce, each still holding Custom HTML nodes. */
function documents(): [string, ValidatedComposition, number][] {
  const bus = createCommandBus(referenceComposition);
  const added = bus.dispatch({ type: 'AddNode', parentId: 'scene-main', index: 4, node: html });
  const duplicated = bus.dispatch({
    type: 'DuplicateNode',
    nodeId: 'node-custom-html',
    newNodeId: 'html-copy',
  } satisfies Command);
  bus.dispatch({ type: 'RemoveNode', nodeId: 'html-copy' });
  bus.dispatch({ type: 'RemoveNode', nodeId: 'node-custom-html' });
  const restored = bus.undo();
  return [
    ['added', added.document, 2],
    ['duplicated', duplicated.document, 3],
    ['restored by undo', restored.document, 2],
  ];
}

describe('Custom HTML from structural commands under the host policy (D36, D39.7)', () => {
  afterEach(() => {
    // Nothing a test mounted survives it, frames included.
    expect(window.document.body.childNodes).toHaveLength(0);
    expect(window.document.querySelectorAll('iframe')).toHaveLength(0);
  });

  it.each(documents())(
    'mounts no frame for a node %s when the policy is disabled',
    (_, document, count) => {
      withMounted(document, DISABLED, (root) => {
        expect(root.querySelectorAll('iframe')).toHaveLength(0);
        const placeholders = root.querySelectorAll(`[data-kadrion-node][${MARK}="disabled"]`);
        expect(placeholders).toHaveLength(count);
        for (const placeholder of placeholders) expect(placeholder.childNodes).toHaveLength(0);
      });
    },
  );

  it('mounts the frames only when the host trusts Custom HTML, so the premise holds', () => {
    const duplicated = documents()[1];
    if (duplicated === undefined) throw new Error('No duplicated document.');
    const [, document, count] = duplicated;
    withMounted(document, TRUSTED, (root) => {
      expect(root.querySelectorAll('iframe')).toHaveLength(count);
    });
  });
});

/**
 * Custom HTML for AI authors at the bus (D78): `SetCustomHtml` replaces the
 * html, the fonts, and the parameters of an element in one step that one undo
 * reverts, the document's rules judge the result, and `checkCustomHtmlSource`
 * reads the html for what the sandbox refuses or the managed clock does not
 * drive.
 */
import { referenceComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import {
  checkCustomHtmlSource,
  createCommandBus,
  MAX_CUSTOM_HTML_LENGTH,
  parseCommand,
  type CommandBus,
} from '../src/index.js';
import { codeOf } from './support.js';

const ELEMENT = 'node-custom-html';

function elementOf(bus: CommandBus): Record<string, unknown> {
  const node = bus
    .getDocument()
    .scenes.flatMap((scene) => scene.nodes)
    .find(({ id }) => id === ELEMENT);
  if (node === undefined) throw new Error('No element.');
  return node;
}

const EDIT = {
  type: 'SetCustomHtml',
  nodeId: ELEMENT,
  html: '<div style="color:var(--accent);font-family:\'asset-font\'">Kadrion</div>',
  fontAssetIds: ['asset-font'],
  parameters: [
    { key: 'accent', type: 'color', value: '#f79009' },
    { key: 'speed', type: 'number', value: 2 },
  ],
} as const;

describe('SetCustomHtml (D78)', () => {
  it('replaces the html, the fonts, and the parameters, and one undo restores them', () => {
    const bus = createCommandBus(referenceComposition);
    const before = JSON.stringify(bus.getDocument());
    const result = bus.dispatch(EDIT);
    const element = elementOf(bus);
    expect(element['html']).toBe(EDIT.html);
    expect(element['fontAssetIds']).toEqual(['asset-font']);
    expect(element['parameters']).toEqual(EDIT.parameters);
    expect(result.inverse).toMatchObject({ type: 'SetCustomHtml', nodeId: ELEMENT });
    bus.undo();
    expect(JSON.stringify(bus.getDocument())).toBe(before);
    bus.redo();
    expect(elementOf(bus)['parameters']).toEqual(EDIT.parameters);
  });

  it('is no change, and no history entry, when the element already is so', () => {
    const bus = createCommandBus(referenceComposition);
    bus.dispatch(EDIT);
    const again = bus.dispatch(EDIT);
    expect(again.inverse).toBeNull();
    bus.undo();
    expect(bus.canUndo()).toBe(false);
  });

  it('refuses a node that is no Custom HTML, and an unknown node', () => {
    const bus = createCommandBus(referenceComposition);
    expect(codeOf(() => bus.dispatch({ ...EDIT, nodeId: 'node-title' }))).toBe('unsupported-node');
    expect(codeOf(() => bus.dispatch({ ...EDIT, nodeId: 'nope' }))).toBe('unknown-node');
  });

  it('refuses html longer than the limit before the bus, and accepts it at the limit', () => {
    expect(
      codeOf(() => parseCommand({ ...EDIT, html: 'a'.repeat(MAX_CUSTOM_HTML_LENGTH + 1) })),
    ).toBe('invalid-argument');
    expect(parseCommand({ ...EDIT, html: 'a'.repeat(MAX_CUSTOM_HTML_LENGTH) }).type).toBe(
      'SetCustomHtml',
    );
    for (const args of [
      { ...EDIT, html: 1 },
      { ...EDIT, fontAssetIds: [1] },
      { ...EDIT, fontAssetIds: 'asset-font' },
      { ...EDIT, parameters: {} },
      { ...EDIT, extra: true },
    ]) {
      expect(codeOf(() => parseCommand(args))).toBe('invalid-argument');
    }
  });

  it('leaves to the document what its rules judge: fonts that are fonts, sorted parameters', () => {
    const bus = createCommandBus(referenceComposition);
    const before = bus.getDocument();
    for (const edit of [
      { ...EDIT, fontAssetIds: ['asset-image'] },
      { ...EDIT, fontAssetIds: ['asset-font', 'asset-font'] },
      { ...EDIT, parameters: [...EDIT.parameters].reverse() },
      { ...EDIT, parameters: [{ key: 'accent', type: 'color', value: 'orange' }] },
    ]) {
      expect(codeOf(() => bus.dispatch(edit))).toBe('invalid-result');
      expect(bus.getDocument()).toBe(before);
    }
  });

  it('refuses to remove a parameter a binding writes', () => {
    const bus = createCommandBus(referenceComposition);
    bus.dispatch(EDIT);
    bus.dispatch({
      type: 'AddTemplateInput',
      index: 0,
      input: { id: 'accent', type: 'color', default: '#f79009' },
    });
    bus.dispatch({
      type: 'AddTemplateBinding',
      index: 0,
      binding: {
        id: 'bind-accent',
        kind: 'parameter',
        nodeId: ELEMENT,
        key: 'accent',
        inputId: 'accent',
      },
    });
    expect(codeOf(() => bus.dispatch({ ...EDIT, parameters: [] }))).toBe('binding-in-use');
  });
});

describe('checkCustomHtmlSource (D78)', () => {
  it('finds nothing in an element that reads only the managed clock', () => {
    expect(
      checkCustomHtmlSource(
        '<style>@keyframes a{to{transform:translateX(10px)}}div{animation:a 1s;background:url(data:image/png;base64,AA==)}</style><div></div><script>requestAnimationFrame(function(){document.body.textContent=String(Date.now()+performance.now()+Math.random())})</script>',
      ),
    ).toEqual([]);
  });

  it('names each finding with its code, offset, and the text it matched, in the order of the text', () => {
    const html =
      '<script>setTimeout(f,1);fetch("/x");localStorage.x=1;location.href="x";document.timeline</script><img src="x.png">';
    const findings = checkCustomHtmlSource(html);
    expect(findings.map(({ code, match }) => [code, match])).toEqual([
      ['timer', 'setTimeout'],
      ['network', 'fetch('],
      ['storage', 'localStorage'],
      ['navigation', 'location.href'],
      ['wall-clock', 'document.timeline'],
      ['network', '<img'],
    ]);
    for (const { at, match, message } of findings) {
      expect(html.slice(at, at + match.length)).toBe(match);
      expect(message.length).toBeGreaterThan(20);
    }
    expect(Object.isFrozen(findings)).toBe(true);
  });

  it('reports html over the limit of set_custom_html once, at offset 0', () => {
    const findings = checkCustomHtmlSource('a'.repeat(MAX_CUSTOM_HTML_LENGTH + 1));
    expect(findings.map(({ code, at }) => [code, at])).toEqual([['too-large', 0]]);
  });

  it('flags loading from the network in CSS, links, forms, and script sources', () => {
    const codes = (html: string): string[] => checkCustomHtmlSource(html).map(({ code }) => code);
    expect(codes('<style>@import "a.css"</style>')).toEqual(['network']);
    expect(codes('<div style="background:url(https://example.com/a.png)"></div>')).toEqual([
      'network',
    ]);
    expect(codes('<script src="a.js"></script>')).toEqual(['network']);
    expect(codes('<form></form>')).toEqual(['navigation']);
    expect(codes('<a href="x">x</a>')).toEqual(['navigation']);
  });
});

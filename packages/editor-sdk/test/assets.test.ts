/**
 * The asset commands of D40.2–D40.4: `SetImageAsset`, `SetTextFont`,
 * `AddAsset`, and `RemoveAsset`. An asset is looked up in `assets` alone and
 * must be of the type the field expects; adding one keeps the order of the
 * others; removing one that something uses is refused with its users, which the
 * validator finds without a list of reference fields in `editor-sdk`.
 */
import { referenceComposition } from '@kadrion/test-fixtures';
import { describe, expect, it } from 'vitest';

import { assetUsers } from '../src/document.js';
import {
  applyCommand,
  createCommandBus,
  parseCommand,
  type Command,
  type CommandBus,
} from '../src/index.js';

import { codeOf, errorOf, json, nodeOf, reference, validated } from './support.js';

const IMAGE = 'node-image';
const TITLE = 'node-title';
const CAPTION = 'node-caption';

/** A content hash of the right form; the bytes are never resolved here. */
function hash(digit: string): string {
  return `sha256:${digit.repeat(64)}`;
}

function asset(id: string, type: string, digit = 'a'): Record<string, string> {
  return { id, type, contentHash: hash(digit) };
}

function addAsset(value: unknown, index: number): Command {
  return { type: 'AddAsset', asset: value, index } as Command;
}

function removeAsset(assetId: string): Command {
  return { type: 'RemoveAsset', assetId };
}

function setImage(nodeId: string, assetId: string): Command {
  return { type: 'SetImageAsset', nodeId, assetId };
}

function setFont(nodeId: string, fontAssetId: string): Command {
  return { type: 'SetTextFont', nodeId, fontAssetId };
}

function fieldOf(document: unknown, nodeId: string, field: string): unknown {
  return (nodeOf(document, nodeId) as unknown as Record<string, unknown>)[field];
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen);
}

function assetIds(document: unknown): string[] {
  return (document as { assets: { id: string }[] }).assets.map(({ id }) => id);
}

/** A bus over the reference composition with extra assets declared. */
function busWith(...assets: Record<string, string>[]): CommandBus {
  const bus = createCommandBus(referenceComposition, { historyLimit: 1000 });
  for (const added of assets) {
    bus.dispatch(addAsset(added, assetIds(bus.getDocument()).length));
  }
  return bus;
}

describe('SetImageAsset (D40.2)', () => {
  it('points an image at another image asset; its size and the old asset stay', () => {
    const bus = busWith(asset('img-2', 'image'));
    const before = bus.getDocument();
    const result = bus.dispatch(setImage(IMAGE, 'img-2'));
    expect(fieldOf(result.document, IMAGE, 'assetId')).toBe('img-2');
    expect(fieldOf(result.document, IMAGE, 'width')).toBe(400);
    expect(result.document.assets).toBe(before.assets);
    expect(result.inverse).toEqual(setImage(IMAGE, 'asset-image'));
    bus.undo();
    expect(bus.getDocument()).not.toBe(before);
    expect(json(bus.getDocument())).toBe(json(before));
  });

  it('is a no-op for the asset the image already shows', () => {
    const document = reference();
    expect(applyCommand(document, setImage(IMAGE, 'asset-image')).document).toBe(document);
  });

  it.each([
    ['a missing asset', 'asset-missing', 'unknown-asset'],
    ['an image node, which is not an asset', IMAGE, 'unknown-asset'],
    ['the clip', 'clip-audio', 'unknown-asset'],
    ['the scene', 'scene-main', 'unknown-asset'],
    ['an animation', 'anim-image-scale', 'unknown-asset'],
    ['a font asset', 'asset-font', 'asset-type-mismatch'],
    ['an audio asset', 'asset-audio', 'asset-type-mismatch'],
  ])('refuses %s with %s', (_, assetId, code) => {
    expect(codeOf(() => applyCommand(reference(), setImage(IMAGE, assetId)))).toBe(code);
  });

  it('refuses a node without an image asset before it looks at the asset (D40.5)', () => {
    expect(codeOf(() => applyCommand(reference(), setImage(TITLE, 'asset-missing')))).toBe(
      'unsupported-node',
    );
    expect(codeOf(() => applyCommand(reference(), setImage('node-missing', 'asset-image')))).toBe(
      'unknown-node',
    );
  });
});

describe('SetTextFont (D40.2)', () => {
  it('points a text in the scene and in a group at another font', () => {
    const bus = busWith(asset('font-2', 'font'));
    const before = json(bus.getDocument());
    bus.dispatch(setFont(TITLE, 'font-2'));
    bus.dispatch(setFont(CAPTION, 'font-2'));
    expect(fieldOf(bus.getDocument(), TITLE, 'fontAssetId')).toBe('font-2');
    expect(fieldOf(bus.getDocument(), CAPTION, 'fontAssetId')).toBe('font-2');
    bus.undo();
    bus.undo();
    expect(json(bus.getDocument())).toBe(before);
  });

  it.each([
    ['a missing asset', 'font-missing', 'unknown-asset'],
    ['a text node', CAPTION, 'unknown-asset'],
    ['an image asset', 'asset-image', 'asset-type-mismatch'],
  ])('refuses %s with %s', (_, fontAssetId, code) => {
    expect(codeOf(() => applyCommand(reference(), setFont(TITLE, fontAssetId)))).toBe(code);
  });

  it('refuses a node without a font', () => {
    expect(codeOf(() => applyCommand(reference(), setFont(IMAGE, 'asset-font')))).toBe(
      'unsupported-node',
    );
  });

  it('refuses a node without a font before it looks at the asset (D40.5)', () => {
    // With the asset looked up first, this would be unknown-asset.
    expect(codeOf(() => applyCommand(reference(), setFont(IMAGE, 'font-missing')))).toBe(
      'unsupported-node',
    );
  });

  it('refuses an audio asset for a text as asset-type-mismatch', () => {
    expect(codeOf(() => applyCommand(reference(), setFont(TITLE, 'asset-audio')))).toBe(
      'asset-type-mismatch',
    );
  });

  it('is a no-op for the font the text already has: no history and no change', () => {
    const bus = createCommandBus(referenceComposition, { onListenerError: () => undefined });
    const changes: unknown[] = [];
    bus.subscribe((change) => changes.push(change));
    const before = bus.getDocument();
    const result = bus.dispatch(setFont(TITLE, 'asset-font'));
    expect(result.document).toBe(before);
    expect(result.inverse).toBeNull();
    expect(result.createdIds).toEqual([]);
    expect(bus.getDocument()).toBe(before);
    expect(bus.canUndo()).toBe(false);
    expect(changes).toEqual([]);
  });
});

describe('AddAsset (D40.3)', () => {
  it('inserts an asset at its index, keeping the others in order and identity', () => {
    const document = reference();
    for (const [index, order] of [
      [0, ['new', 'asset-image', 'asset-audio', 'asset-font']],
      [1, ['asset-image', 'new', 'asset-audio', 'asset-font']],
      [3, ['asset-image', 'asset-audio', 'asset-font', 'new']],
    ] as const) {
      const result = applyCommand(document, addAsset(asset('new', 'image'), index));
      expect(assetIds(result.document)).toEqual(order);
      for (const kept of document.assets) expect(result.document.assets).toContain(kept);
      expect(result.document.scenes).toBe(document.scenes);
      expect(result.createdIds).toEqual(['new']);
      expect(result.inverse).toEqual(removeAsset('new'));
    }
  });

  it('refuses an index past the end, and never rounds one', () => {
    expect(codeOf(() => applyCommand(reference(), addAsset(asset('n', 'image'), 4)))).toBe(
      'index-out-of-range',
    );
    expect(codeOf(() => applyCommand(reference(), addAsset(asset('n', 'image'), 1.5)))).toBe(
      'invalid-argument',
    );
  });

  it.each([
    ['a node', TITLE],
    ['the clip', 'clip-audio'],
    ['an animation', 'anim-title-opacity'],
    ['the scene', 'scene-main'],
    ['an asset', 'asset-font'],
  ])('refuses the ID of %s as id-in-use', (_, id) => {
    const error = errorOf(() => applyCommand(reference(), addAsset(asset(id, 'image'), 0)));
    expect(error.code).toBe('id-in-use');
    expect(error.details).toEqual([id]);
  });

  it.each([
    ['an ID of another form', { ...asset('a b', 'image') }],
    ['an unknown type', { ...asset('n', 'video') }],
    ['an upper-case hash', { id: 'n', type: 'image', contentHash: `sha256:${'A'.repeat(64)}` }],
    ['a short hash', { id: 'n', type: 'image', contentHash: 'sha256:abc' }],
    ['another algorithm', { id: 'n', type: 'image', contentHash: `sha1:${'a'.repeat(40)}` }],
    ['an extra field', { ...asset('n', 'image'), mediaType: 'image/png' }],
    ['a missing field', { id: 'n', type: 'image' }],
  ])('refuses %s as invalid-argument', (_, value) => {
    expect(codeOf(() => parseCommand(addAsset(value, 0)))).toBe('invalid-argument');
  });

  it('accepts two assets with the same bytes, as the schema does', () => {
    const bus = busWith(asset('a1', 'image', 'b'), asset('a2', 'image', 'b'));
    expect(assetIds(bus.getDocument()).slice(-2)).toEqual(['a1', 'a2']);
  });

  it('keeps its own frozen copy, with the keys in the caller’s order', () => {
    const given = { contentHash: hash('c'), type: 'font', id: 'f' };
    const bus = createCommandBus(referenceComposition);
    bus.dispatch(addAsset(given, 3));
    given.id = 'changed';
    expect(Object.isFrozen(given)).toBe(false);
    const stored = (bus.getDocument().assets as readonly unknown[])[3];
    expect(Object.isFrozen(stored)).toBe(true);
    expect(JSON.stringify(stored)).toBe(`{"contentHash":"${hash('c')}","type":"font","id":"f"}`);
  });

  it('takes IDs that are names of prototype members like any other', () => {
    for (const id of ['__proto__', 'constructor', 'toString']) {
      const bus = busWith(asset(id, 'image'));
      expect(assetIds(bus.getDocument())).toContain(id);
      bus.dispatch(setImage(IMAGE, id));
      expect(codeOf(() => bus.dispatch(removeAsset(id)))).toBe('asset-in-use');
      bus.dispatch(setImage(IMAGE, 'asset-image'));
      bus.dispatch(removeAsset(id));
      expect(assetIds(bus.getDocument())).not.toContain(id);
    }
  });
});

describe('RemoveAsset (D40.3, D40.4)', () => {
  it('removes an asset nothing uses, and undo puts the same bytes back at its index', () => {
    const bus = createCommandBus(referenceComposition);
    bus.dispatch(addAsset(asset('first', 'image'), 0));
    bus.dispatch(addAsset(asset('middle', 'font'), 2));
    const before = bus.getDocument();
    for (const id of ['first', 'middle']) {
      const result = bus.dispatch(removeAsset(id));
      expect(assetIds(result.document)).not.toContain(id);
      expect(result.inverse).toMatchObject({ type: 'AddAsset' });
      // A parsed, deep-frozen command: nothing can reach the history through it.
      expect(isDeepFrozen(result.inverse)).toBe(true);
      expect(parseCommand(result.inverse)).toEqual(result.inverse);
      bus.undo();
      expect(json(bus.getDocument())).toBe(json(before));
    }
  });

  it('keeps the other assets and the scenes as the same objects', () => {
    const bus = busWith(asset('u', 'image'));
    const before = bus.getDocument();
    const after = bus.dispatch(removeAsset('u')).document;
    expect(after.scenes).toBe(before.scenes);
    expect(after.clips).toBe(before.clips);
    before.assets.slice(0, 3).forEach((kept, at) => {
      expect(after.assets[at]).toBe(kept);
    });
  });

  /** A document in which one user alone refers to one asset. */
  function onlyUser(
    user: 'image-in-scene' | 'image-in-group' | 'text-in-scene' | 'text-in-group' | 'clip',
  ) {
    const bus = busWith(
      asset('lone', user.startsWith('text') ? 'font' : user === 'clip' ? 'audio' : 'image'),
    );
    switch (user) {
      case 'image-in-scene':
        bus.dispatch({
          type: 'AddNode',
          parentId: 'scene-main',
          index: 1,
          node: {
            id: 'top-image',
            type: 'image',
            position: { x: 0, y: 0 },
            scale: { x: 1, y: 1 },
            opacity: 1,
            animations: [],
            assetId: 'lone',
            width: 10,
            height: 10,
          },
        });
        return { bus, users: ['top-image'] };
      case 'image-in-group':
        bus.dispatch(setImage(IMAGE, 'lone'));
        return { bus, users: [IMAGE] };
      case 'text-in-scene':
        bus.dispatch(setFont(TITLE, 'lone'));
        return { bus, users: [TITLE] };
      case 'text-in-group':
        bus.dispatch(setFont(CAPTION, 'lone'));
        return { bus, users: [CAPTION] };
      case 'clip': {
        // No command edits the clip yet (PR-21): the document is built directly.
        const draft = structuredClone(referenceComposition) as {
          assets: Record<string, string>[];
          clips: { assetId: string }[];
        };
        draft.assets.push(asset('lone', 'audio'));
        const clip = draft.clips[0];
        if (clip === undefined) throw new Error('No clip.');
        clip.assetId = 'lone';
        return { bus: createCommandBus(validated(draft)), users: ['clip-audio'] };
      }
    }
  }

  it.each(['image-in-scene', 'image-in-group', 'text-in-scene', 'text-in-group', 'clip'] as const)(
    'refuses an asset used only by %s as asset-in-use, naming the user',
    (user) => {
      const { bus, users } = onlyUser(user);
      const before = bus.getDocument();
      const canUndo = bus.canUndo();
      const error = errorOf(() => bus.dispatch(removeAsset('lone')));
      expect(error.code).toBe('asset-in-use');
      expect(error.details).toEqual(users);
      expect(bus.getDocument()).toBe(before);
      expect(bus.canUndo()).toBe(canUndo);
    },
  );

  it('names every user once, sorted', () => {
    const error = errorOf(() => applyCommand(reference(), removeAsset('asset-font')));
    expect(error.details).toEqual([CAPTION, TITLE]);
    const both = createCommandBus(referenceComposition);
    both.dispatch({ type: 'DuplicateNode', nodeId: IMAGE, newNodeId: 'b-image' });
    expect(errorOf(() => both.dispatch(removeAsset('asset-image'))).details).toEqual([
      'b-image',
      IMAGE,
    ]);
  });

  it.each([
    ['a missing asset', 'asset-missing'],
    ['a node', IMAGE],
    ['the clip', 'clip-audio'],
    ['the scene', 'scene-main'],
  ])('refuses %s as unknown-asset', (_, assetId) => {
    expect(codeOf(() => applyCommand(reference(), removeAsset(assetId)))).toBe('unknown-asset');
  });

  it('judges use against the document the earlier commands of a transaction left', () => {
    const bus = busWith(asset('img-2', 'image'));
    const start = bus.getDocument();
    expect(
      codeOf(() => bus.dispatchTransaction([setImage(IMAGE, 'img-2'), removeAsset('img-2')])),
    ).toBe('asset-in-use');
    expect(bus.getDocument()).toBe(start);
    bus.dispatchTransaction([setImage(IMAGE, 'img-2'), removeAsset('asset-image')]);
    expect(assetIds(bus.getDocument())).not.toContain('asset-image');
    bus.undo();
    bus.dispatchTransaction([{ type: 'RemoveNode', nodeId: IMAGE }, removeAsset('asset-image')]);
    expect(assetIds(bus.getDocument())).not.toContain('asset-image');
  });

  it('reports net createdIds with the asset IDs (D39.4)', () => {
    const bus = createCommandBus(referenceComposition);
    expect(
      bus.dispatchTransaction([addAsset(asset('x', 'image'), 0), removeAsset('x')]).createdIds,
    ).toEqual([]);
    bus.dispatch(addAsset(asset('y', 'image'), 0));
    expect(
      bus.dispatchTransaction([removeAsset('y'), addAsset(asset('y', 'font'), 0)]).createdIds,
    ).toEqual(['y']);
    expect(bus.dispatch(removeAsset('y')).createdIds).toEqual([]);
    expect(bus.undo().createdIds).toEqual(['y']);
  });
});

describe('finding the users of an asset through the validator (D40.4)', () => {
  // A document that schema 0.1 does not know: a poster field on a node, a field
  // at the root, and escaped keys. The mapping knows no field name, so a
  // reference a future validator checks needs no list in `editor-sdk`. It is
  // tested here in isolation, with the errors written out, because no validator
  // can report such a field yet; its use through RemoveAsset is covered above
  // by the five users of schema 0.1.
  const document = {
    scenes: [{ id: 'scene', nodes: [{ id: 'video', posterAssetId: 'a' }] }],
    extras: { id: 'extra', 'thumb/ref': 'a', other: 'b' },
    tilde: { id: 'tilde', 'a~b': 'a', 'a/b': 'b' },
  };

  it('maps each unresolved reference to the ID of the object that holds it', () => {
    const errors = [
      { code: 'unresolved-asset-reference', path: '/scenes/0/nodes/0/posterAssetId' },
      { code: 'unresolved-asset-reference', path: '/extras/thumb~1ref' },
      { code: 'unresolved-asset-reference', path: '/scenes/0/nodes/0/posterAssetId' },
    ];
    expect(assetUsers(document, errors, 'a')).toEqual(['extra', 'video']);
  });

  it('declines when an error is of another code, names another value, or has no holder ID', () => {
    const use = { code: 'unresolved-asset-reference', path: '/scenes/0/nodes/0/posterAssetId' };
    expect(
      assetUsers(document, [use, { code: 'duplicate-id', path: '/extras/id' }], 'a'),
    ).toBeNull();
    expect(
      assetUsers(document, [{ code: 'unresolved-asset-reference', path: '/extras/other' }], 'a'),
    ).toBeNull();
    expect(
      assetUsers({ ref: 'a' }, [{ code: 'unresolved-asset-reference', path: '/ref' }], 'a'),
    ).toBeNull();
    expect(assetUsers(document, [], 'a')).toBeNull();
  });

  it('decodes ~1 to / before ~0 to ~ (RFC 6901)', () => {
    const tilde = { code: 'unresolved-asset-reference', path: '/tilde/a~0b' };
    expect(assetUsers(document, [tilde], 'a')).toEqual(['tilde']);
    // Decoding ~1 before ~0 turns `~01` into the literal key `~1`; decoding ~0
    // first would turn it into `~1` and then into `/`, the wrong key.
    expect(
      assetUsers(
        { id: 'h', '~1': 'a' },
        [{ code: 'unresolved-asset-reference', path: '/~01' }],
        'a',
      ),
    ).toEqual(['h']);
  });

  it('declines an error of another code even when its path holds the asset ID', () => {
    // Everything else would make this a use: the path resolves, it holds exactly
    // the removed asset's ID, and its holder has an ID. Only the code differs.
    const path = '/scenes/0/nodes/0/posterAssetId';
    expect(assetUsers(document, [{ code: 'unresolved-asset-reference', path }], 'a')).toEqual([
      'video',
    ]);
    expect(assetUsers(document, [{ code: 'asset-type-mismatch', path }], 'a')).toBeNull();
  });

  it('reads the code and the path, never the message', () => {
    const error = {
      code: 'unresolved-asset-reference',
      path: '/scenes/0/nodes/0/posterAssetId',
      message: 'anything',
    };
    expect(assetUsers(document, [error], 'a')).toEqual(['video']);
  });
});

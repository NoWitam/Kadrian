/**
 * The signatures that the amendments of PR-16 (D36) write into accepted ADRs
 * are those of the implementation (owner, 2026-09-25). The parameter names are
 * read from the sources, so a changed signature fails here until every ADR that
 * states it is amended again, and an ADR that states another one fails too.
 */
import { describe, expect, it } from 'vitest';

import { listFiles, readText } from './repo.js';

/**
 * The parameter names of an exported function of a source file, in order. The
 * parse is plain: a parameter type with a comma, a colon, or a parenthesis would
 * break it, and then this test fails loudly rather than passing.
 */
function parametersOf(source: string, name: string): string[] {
  const match = new RegExp(`export (?:async )?function ${name}\\(([^)]*)\\)`).exec(source);
  if (match === null) throw new Error(`No exported function ${name}.`);
  return (match[1] ?? '')
    .split(',')
    .map((parameter) => parameter.split(':')[0]?.trim() ?? '')
    .filter((parameter) => parameter !== '');
}

const page = readText('packages', 'renderer-dom', 'src', 'page.ts');
const mount = readText('packages', 'renderer-dom', 'src', 'mount.ts');
const player = readText('packages', 'player', 'src', 'player.ts');

const signature = (prefix: string, parameters: readonly string[]): string =>
  `${prefix}(${parameters.join(', ')})`;
const pageMount = signature('KadrionRuntime.mount', parametersOf(page, 'mount'));
const pageLoad = signature('KadrionRuntime.load', parametersOf(page, 'load'));
const mountComposition = signature('mountComposition', parametersOf(mount, 'mountComposition'));
const createPlayer = signature('createPlayer', parametersOf(player, 'createPlayer'));

/** An ADR's text with every run of white space as one space, so wrapped code still matches. */
function adr(file: string): string {
  return readText('docs', 'adr', file).replace(/\s+/g, ' ');
}

const AMENDED: readonly [string, readonly string[]][] = [
  ['D21-runtime-build-artifact.md', [pageMount]],
  ['D22-dom-mapping-and-css-serialisation.md', [mountComposition]],
  ['D23-custom-html-sandbox-and-time-contract.md', [mountComposition, pageLoad, pageMount]],
  ['D25-player-host-and-render-page.md', [createPlayer]],
  ['D27-fonts-and-the-load-step.md', [pageLoad]],
  ['D36-webrtc-in-the-player.md', [createPlayer, mountComposition, pageLoad, pageMount]],
];

/** The accepted text before PR-16, which stays, each time with its amendment in its section. */
const HISTORY = [
  'KadrionRuntime.mount(root, document, assetUrls)',
  'KadrionRuntime.load(root, document, assets, host)',
  'mountComposition(root, composition, assetUrls)',
];

const everyAdr = listFiles('docs', 'adr')
  .filter((path) => /\/D\d{2}-[^/]+\.md$/.test(path))
  .map((path) => path.split('/').at(-1) ?? '');

describe('the signatures that the amendments of PR-16 state (D36)', () => {
  it('are read from the sources: the policy is the last parameter of every mount', () => {
    expect(pageMount).toBe('KadrionRuntime.mount(root, document, assetUrls, options)');
    expect(pageLoad).toBe('KadrionRuntime.load(root, document, assets, host, options)');
    expect(mountComposition).toBe('mountComposition(root, composition, assetUrls, options)');
    expect(createPlayer).toBe('createPlayer(container, options)');
  });

  it.each(AMENDED)(
    '%s carries the amendment and names the signatures of the code',
    (file, signatures) => {
      const text = adr(file);
      expect(text).toContain('Amended by: PR-16 (D36)');
      for (const expected of signatures) expect(text, expected).toContain(expected);
    },
  );

  it('never names a mount or a load of the page, or createPlayer, with another list of parameters in any ADR', () => {
    expect(everyAdr.length).toBeGreaterThanOrEqual(36);
    for (const file of everyAdr) {
      const text = adr(file);
      const named = [
        ...text.matchAll(
          /(KadrionRuntime\.(?:mount|load)|\bmountComposition|\bcreatePlayer)\(([^)]*)\)/g,
        ),
      ].map((match) => `${match[1] ?? ''}(${match[2] ?? ''})`);
      for (const found of named) {
        expect(
          [pageMount, pageLoad, mountComposition, createPlayer, ...HISTORY],
          `${file}: ${found}`,
        ).toContain(found);
      }
    }
  });

  it('keeps each signature from before PR-16 only with its amendment in the same numbered section', () => {
    for (const file of everyAdr) {
      const text = adr(file);
      for (const old of HISTORY) {
        for (let at = text.indexOf(old); at >= 0; at = text.indexOf(old, at + old.length)) {
          const next = /\*\*\d+\.\d+ /.exec(text.slice(at + old.length));
          const section = text.slice(at, next === null ? undefined : at + old.length + next.index);
          expect(section, `${file}: ${old}`).toContain('Amended by PR-16 (D36)');
        }
      }
    }
  });

  it('lists every amended ADR in D23.10 and in the implementation of D36', () => {
    const d23 = adr('D23-custom-html-sandbox-and-time-contract.md');
    const d36 = adr('D36-webrtc-in-the-player.md');
    for (const name of ['D21', 'D22', 'D23', 'D25', 'D27']) {
      expect(d23.slice(d23.indexOf('**23.10'))).toContain(name);
      expect(d36.slice(d36.indexOf('## Implementation'))).toContain(name);
    }
  });
});

/**
 * `kadrion migrate` (D43, amended by PR-41): every document of the
 * compatibility corpus migrates through the command to the bytes of
 * `serializeComposition(parseComposition(…))`, `--check` writes nothing and
 * exits 6 for a document that is not current, a refused text or document
 * reports the typed errors of `parseComposition` as JSON, and a failure leaves
 * no file (D48).
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ProducerError } from '@kadrion/producer';
import { parseComposition, serializeComposition } from '@kadrion/schema/migrate';
import { compatibilityCorpus } from '@kadrion/test-fixtures/compatibility';
import { afterAll, describe, expect, it } from 'vitest';

import {
  EXIT_CANCELLED,
  EXIT_NOT_CURRENT,
  EXIT_OK,
  EXIT_PRODUCER_ERROR,
  EXIT_USAGE,
  JOB_COMMANDS,
  migrateText,
  runCli,
  USAGE,
} from '../src/index.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test-fixtures', 'src');

function io() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) },
  };
}

/** Every line of standard output parses as JSON (D48.1). */
function lines(out: readonly string[]): unknown[] {
  return out.map((line) => JSON.parse(line) as unknown);
}

/**
 * A scratch directory under the system's temporary directory, removed after
 * the file's tests: what a test leaves there slows every later scan of it,
 * such as the frame watch of the pinned export test.
 */
const scratchDirectories: string[] = [];
function scratchDirectory(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirectories.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of scratchDirectories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
  return scratchDirectory('kadrion-migrate-');
}

/** What a library caller gets from the same text: the bytes the command must write. */
function libraryText(text: string): string {
  const parsed = parseComposition(text);
  if (!parsed.ok) throw new Error('the premise: the corpus loads');
  const saved = serializeComposition(parsed.composition);
  if (!saved.ok) throw new Error('the premise: a loaded document saves');
  return saved.text;
}

const current = compatibilityCorpus.find((entry) => entry.versions.length === 1);
const earlier = compatibilityCorpus.find((entry) => entry.versions.length > 1);

describe('kadrion migrate', () => {
  it('is a job of D48', () => {
    expect(JOB_COMMANDS).toContain('migrate');
    expect(USAGE).toContain('kadrion migrate <file> (--out <file> | --check)');
  });

  it.each(compatibilityCorpus.map((entry) => [entry.id, entry] as const))(
    'migrates %s to the bytes of serializeComposition(parseComposition(…))',
    async (_id, entry) => {
      const input = join(FIXTURES, entry.inputFile);
      const text = readFileSync(input, 'utf8');
      const target = join(scratch(), 'out', 'migrated.json');
      const { out, err, io: streams } = io();
      await expect(runCli(['migrate', input, '--out', target], streams)).resolves.toBe(EXIT_OK);
      expect(err).toEqual([]);
      expect(lines(out)).toEqual([
        { event: 'versions', versions: entry.versions },
        { event: 'file', file: target },
        { event: 'done', manifest: null },
      ]);
      expect(readFileSync(target, 'utf8')).toBe(libraryText(text));
      // And the document it names is the hand-written expectation of the corpus.
      expect(JSON.parse(readFileSync(target, 'utf8'))).toEqual(entry.expected);
      expect(readdirSync(dirname(target))).toEqual(['migrated.json']);
    },
  );

  it('checks a current document: exit 0, nothing written', async () => {
    if (current === undefined) throw new Error('the premise: the corpus has a current document');
    const { out, io: streams } = io();
    const input = join(FIXTURES, current.inputFile);
    await expect(runCli(['migrate', input, '--check'], streams)).resolves.toBe(EXIT_OK);
    expect(lines(out)).toEqual([
      { event: 'versions', versions: current.versions },
      { event: 'done', manifest: null },
    ]);
  });

  it('checks an earlier document: exit 6 with not-current, nothing written', async () => {
    if (earlier === undefined) throw new Error('the premise: the corpus has an earlier document');
    const dir = scratch();
    const input = join(dir, 'saved.json');
    const text = readFileSync(join(FIXTURES, earlier.inputFile), 'utf8');
    writeFileSync(input, text);
    const { out, err, io: streams } = io();
    await expect(runCli(['migrate', input, '--check'], streams)).resolves.toBe(EXIT_NOT_CURRENT);
    expect(EXIT_NOT_CURRENT).toBe(6);
    expect(lines(out)).toEqual([
      { event: 'versions', versions: earlier.versions },
      { event: 'error', code: 'not-current', exitCode: 6 },
    ]);
    expect(err.join('\n')).toContain('not-current');
    expect(readdirSync(dir)).toEqual(['saved.json']);
    expect(readFileSync(input, 'utf8')).toBe(text);
  });

  it('migrates a document in place when --out names the input', async () => {
    if (earlier === undefined) throw new Error('the premise');
    const dir = scratch();
    const input = join(dir, 'saved.json');
    const text = readFileSync(join(FIXTURES, earlier.inputFile), 'utf8');
    writeFileSync(input, text);
    await expect(runCli(['migrate', input, '--out', input], io().io)).resolves.toBe(EXIT_OK);
    expect(readFileSync(input, 'utf8')).toBe(libraryText(text));
    expect(readdirSync(dir)).toEqual(['saved.json']);
    // A second run finds it current.
    await expect(runCli(['migrate', input, '--check'], io().io)).resolves.toBe(EXIT_OK);
  });

  it('reports a text that is not JSON as parseComposition does, and writes nothing', async () => {
    const dir = scratch();
    const input = join(dir, 'broken.json');
    writeFileSync(input, '﻿{"schemaVersion":"0.1"}');
    const target = join(dir, 'out.json');
    const { out, err, io: streams } = io();
    await expect(runCli(['migrate', input, '--out', target], streams)).resolves.toBe(
      EXIT_PRODUCER_ERROR,
    );
    const parsed = parseComposition(readFileSync(input, 'utf8'));
    if (parsed.ok || parsed.stage !== 'text') throw new Error('the premise: a BOM is no JSON');
    expect(lines(out)).toEqual([
      { event: 'invalid', stage: 'text', error: { ...parsed.error } },
      { event: 'error', code: 'invalid-document', exitCode: 1 },
    ]);
    expect(err.join('\n')).toContain('invalid-document');
    expect(existsSync(target)).toBe(false);
    expect(readdirSync(dir)).toEqual(['broken.json']);
  });

  it('reports every error of a refused document with its version, and writes nothing', async () => {
    const dir = scratch();
    const input = join(dir, 'invalid.json');
    writeFileSync(input, JSON.stringify({ schemaVersion: '0.2', width: -1 }));
    const target = join(dir, 'out.json');
    const { out, io: streams } = io();
    await expect(runCli(['migrate', input, '--out', target], streams)).resolves.toBe(
      EXIT_PRODUCER_ERROR,
    );
    const parsed = parseComposition(readFileSync(input, 'utf8'));
    if (parsed.ok || parsed.stage !== 'document') throw new Error('the premise');
    expect(parsed.errors.length).toBeGreaterThan(1);
    expect(lines(out)).toEqual([
      {
        event: 'invalid',
        stage: 'document',
        version: '0.2',
        versions: [...parsed.versions],
        errors: parsed.errors.map((error) => ({ ...error })),
      },
      { event: 'error', code: 'invalid-document', exitCode: 1 },
    ]);
    expect(existsSync(target)).toBe(false);
  });

  it('reports an unknown version with version null', async () => {
    const dir = scratch();
    const input = join(dir, 'future.json');
    writeFileSync(input, JSON.stringify({ schemaVersion: '9.9' }));
    const { out, io: streams } = io();
    await expect(runCli(['migrate', input, '--check'], streams)).resolves.toBe(EXIT_PRODUCER_ERROR);
    const [invalid] = lines(out) as { version: unknown; errors: { code: string }[] }[];
    expect(invalid?.version).toBeNull();
    expect(invalid?.errors.map((error) => error.code)).toEqual(['unsupported-schema-version']);
  });

  it.each([
    ['no file', ['--check']],
    ['two files', ['a.json', 'b.json', '--check']],
    ['neither --out nor --check', ['a.json']],
    ['both --out and --check', ['a.json', '--out', 'b.json', '--check']],
    ['an empty --out', ['a.json', '--out', '']],
    ['an unknown flag', ['a.json', '--check', '--assets', 'x']],
    ['a limit of a render', ['a.json', '--check', '--max-frames', '3']],
  ])('refuses %s as a usage error', async (_name, args) => {
    const { out, err, io: streams } = io();
    await expect(runCli(['migrate', ...args], streams)).resolves.toBe(EXIT_USAGE);
    expect(lines(out)).toEqual([{ event: 'error', code: 'usage', exitCode: EXIT_USAGE }]);
    expect(err).toContain(USAGE);
  });

  it('refuses a file it cannot read as a usage error', async () => {
    const { out, io: streams } = io();
    const missing = join(scratch(), 'missing.json');
    await expect(runCli(['migrate', missing, '--check'], streams)).resolves.toBe(EXIT_USAGE);
    expect(lines(out)).toEqual([{ event: 'error', code: 'usage', exitCode: EXIT_USAGE }]);
  });

  it('takes --max-wall-ms like every job', async () => {
    if (current === undefined) throw new Error('the premise');
    const input = join(FIXTURES, current.inputFile);
    const stopped: number[] = [];
    await expect(
      runCli(['migrate', input, '--check', '--max-wall-ms', '1000'], io().io, {
        startTimer: (_fire, milliseconds) => () => stopped.push(milliseconds),
      }),
    ).resolves.toBe(EXIT_OK);
    expect(stopped).toEqual([1000]);
  });

  it('writes nothing when the job was cancelled', async () => {
    if (earlier === undefined) throw new Error('the premise');
    const dir = scratch();
    const target = join(dir, 'out.json');
    const controller = new AbortController();
    controller.abort(new ProducerError('cancelled', 'stop'));
    const { out, io: streams } = io();
    await expect(
      runCli(['migrate', join(FIXTURES, earlier.inputFile), '--out', target], streams, {
        signal: controller.signal,
      }),
    ).resolves.toBe(EXIT_CANCELLED);
    expect(lines(out)).toEqual([{ event: 'error', code: 'cancelled', exitCode: EXIT_CANCELLED }]);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('cancels between reading and writing: no file under its final or temporary name', async () => {
    if (earlier === undefined) throw new Error('the premise');
    const dir = scratch();
    const target = join(dir, 'out.json');
    const controller = new AbortController();
    const { out, io: streams } = io();
    const outLine = (line: string): void => {
      streams.out(line);
      // The signal arrives once the document was read and judged.
      if (line.includes('"versions"')) controller.abort(new ProducerError('cancelled', 'stop'));
    };
    await expect(
      runCli(
        ['migrate', join(FIXTURES, earlier.inputFile), '--out', target],
        { out: outLine, err: streams.err },
        { signal: controller.signal },
      ),
    ).resolves.toBe(EXIT_CANCELLED);
    expect(lines(out).at(-1)).toEqual({ event: 'error', code: 'cancelled', exitCode: 5 });
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe('migrateText', () => {
  it('is parseComposition, then serializeComposition', () => {
    for (const entry of compatibilityCorpus) {
      const text = readFileSync(join(FIXTURES, entry.inputFile), 'utf8');
      const outcome = migrateText(text);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) continue;
      expect(outcome.text).toBe(libraryText(text));
      expect(outcome.current).toBe(entry.versions.length === 1);
      expect(outcome.text.endsWith('\n')).toBe(false);
    }
  });
});

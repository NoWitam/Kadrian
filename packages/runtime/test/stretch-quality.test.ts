/**
 * The quality check of `stretchSound` (D82, question 11; PR-59): the speech and
 * music fixtures at 1/4, 1/2, 3/4, 3/2, 2, and 4, each stretched by the
 * anchored grains of D82.6, by a sequential WSOLA of the same constants, and by
 * grains that each follow the nominal position of the grain before them,
 * and measured by how far the level strays from the source's (a stretch that
 * cancels its own grains loses level where they overlap). It is a report, not a
 * gate of quality: the owner decides by ear. With `KADRION_STRETCH_RECORDINGS`
 * set to a directory, the test also writes every sound as a 16-bit WAV file
 * there, with `report.json`, for the owner to listen to.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Speed } from '@kadrion/schema/time-map';
import { generateSoundFixture } from '@kadrion/test-fixtures';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { stretchSound } from '../src/stretch.js';

import {
  CHECKED_SPEEDS,
  levelDeviationDb,
  sequentialStretch,
  wavFile,
  wholeClip,
} from './stretch-support.js';

const SECONDS = 2;
const FIXTURES = ['speech', 'music'] as const;

function multiplier(speed: Speed): string {
  const value = speed.num / speed.den;
  return `x${String(value)}`;
}

interface Row {
  readonly fixture: string;
  readonly speed: string;
  readonly anchoredDb: number;
  readonly sequentialDb: number;
  readonly nominalDb: number;
}

const directory = process.env.KADRION_STRETCH_RECORDINGS;
const rows: Row[] = [];

function write(name: string, samples: Float32Array): void {
  if (directory !== undefined) writeFileSync(join(directory, `${name}.wav`), wavFile(samples));
}

describe('the quality check of stretchSound (D82, question 11)', () => {
  beforeAll(() => {
    if (directory !== undefined) mkdirSync(directory, { recursive: true });
  });

  afterAll(() => {
    const table = rows.map(
      (row) =>
        `${row.fixture.padEnd(6)} ${row.speed.padEnd(5)} anchored ${row.anchoredDb.toFixed(2)} dB, sequential ${row.sequentialDb.toFixed(2)} dB, nominal ${row.nominalDb.toFixed(2)} dB`,
    );
    console.info(`Mean level deviation from the source (lower is better):\n${table.join('\n')}`);
    if (directory !== undefined) {
      writeFileSync(
        join(directory, 'report.json'),
        `${JSON.stringify({ seconds: SECONDS, rows }, null, 2)}\n`,
      );
    }
  });

  describe.each(FIXTURES)('%s', (fixture) => {
    const source = generateSoundFixture(fixture, SECONDS);

    it('is written as it is generated', () => {
      write(`${fixture}-x1-source`, source);
      expect(source).toHaveLength(SECONDS * 48_000);
    });

    it.each(CHECKED_SPEEDS.map((speed) => [multiplier(speed), speed] as const))(
      'at %s: the anchored grains, a sequential WSOLA, and grains that follow the nominal one before',
      (name, speed) => {
        const { map, sampleCount } = wholeClip(speed, false, source.length);
        const anchored = stretchSound({
          map,
          source: { channels: [source], startSample: 0 },
          startSample: 0,
          sampleCount,
        })[0] as Float32Array;
        const sequential = sequentialStretch(source, speed, sampleCount);
        const nominal = sequentialStretch(source, speed, sampleCount, 'nominal');
        write(`${fixture}-${name}-anchored`, anchored);
        write(`${fixture}-${name}-sequential`, sequential);
        write(`${fixture}-${name}-nominal`, nominal);
        if (directory !== undefined) {
          const reversed = wholeClip(speed, true, source.length);
          write(
            `${fixture}-${name}-reversed`,
            stretchSound({
              map: reversed.map,
              source: { channels: [source], startSample: 0 },
              startSample: 0,
              sampleCount: reversed.sampleCount,
            })[0] as Float32Array,
          );
        }
        const row = {
          fixture,
          speed: name,
          anchoredDb: levelDeviationDb(source, anchored, speed),
          sequentialDb: levelDeviationDb(source, sequential, speed),
          nominalDb: levelDeviationDb(source, nominal, speed),
        };
        rows.push(row);
        expect(Number.isFinite(row.anchoredDb)).toBe(true);
        expect(Number.isFinite(row.sequentialDb)).toBe(true);
        expect(Number.isFinite(row.nominalDb)).toBe(true);
      },
    );
  });
});

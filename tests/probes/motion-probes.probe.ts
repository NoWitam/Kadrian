/**
 * The entry of the rendering probes of PR-45 (D65). It is not part of the
 * pinned suite and no `check` runs it; it is run by hand in the pinned
 * container (D26.2) with `--network none`, twice, each time in a fresh
 * container, the second time against the record of the first:
 *
 *   KADRION_PROBES_OUT=/out/motion-probes.first.json \
 *     corepack pnpm exec vitest run --config tests/probes/vitest.probes.config.ts
 *   KADRION_PROBES_OUT=/out/motion-probes.json KADRION_PROBES_AGAINST=/out/motion-probes.first.json \
 *     corepack pnpm exec vitest run --config tests/probes/vitest.probes.config.ts
 *
 * The second record is the one committed as `docs/spike/motion-probes.json`.
 * Vitest is only the loader here (it resolves the TypeScript imports of the
 * pinned helpers); the one test fails only when the probes cannot run.
 */
import { expect, it } from 'vitest';

import { runProbes } from './motion-probes.ts';

it('measures every candidate primitive of phase five (D65)', async () => {
  const ffmpeg = process.env.KADRION_FFMPEG;
  const out = process.env.KADRION_PROBES_OUT;
  if (ffmpeg === undefined || out === undefined) {
    throw new Error('KADRION_FFMPEG and KADRION_PROBES_OUT must be set.');
  }
  const record = await runProbes({
    out,
    against: process.env.KADRION_PROBES_AGAINST ?? null,
    ffmpeg,
  });
  expect(record.rows.length).toBeGreaterThan(0);
});

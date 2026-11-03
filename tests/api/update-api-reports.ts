/**
 * `node --run api:update`: writes the API report of every package from its
 * built `.d.ts` (D60). The script builds first; this file only writes.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { API_REPORT_FILE, apiReports, packageSurfaces } from './api-report.ts';

const packagesDir = fileURLToPath(new URL('../../packages', import.meta.url));
for (const [dir, report] of apiReports(packageSurfaces(packagesDir))) {
  const path = join(packagesDir, dir, API_REPORT_FILE);
  writeFileSync(path, report);
  console.log(`wrote packages/${dir}/${API_REPORT_FILE}`);
}

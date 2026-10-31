/**
 * `kadrion doctor` (D45): whether the current process is the one environment
 * whose output is reference output (D26.2, D28.9, D29.1). It reports in JSON
 * and changes nothing. Each check is an observation of this process, except
 * the image, which a container cannot observe about itself: that check only
 * compares what the run declares in `KADRION_PINNED_IMAGE` (D26.2), as every
 * manifest of the Producer does.
 *
 * Output anywhere else is not wrong, it is informative (D26): the doctor tells
 * a host's worker which of the two it produces, before it renders.
 */
import { networkInterfaces } from 'node:os';
import process from 'node:process';

import {
  CHROMIUM_REVISION,
  CHROMIUM_VERSION,
  FFMPEG_SHA256,
  FFPROBE_SHA256,
  installedPlaywright,
  launchChromium,
  loadRuntimeBuild,
  networkFacts,
  PINNED_IMAGE,
  PINNED_IMAGE_VARIABLE,
  PLAYWRIGHT_CORE_VERSION,
  verifyFfmpeg,
  type FfmpegPaths,
} from '@kadrion/producer';

export const DOCTOR_REPORT_VERSION = 1;

/** The checks, in the order they run and are reported. */
export const DOCTOR_CHECKS = Object.freeze([
  'platform',
  'image',
  'playwright',
  'chromium',
  'ffmpeg',
  'network',
  'runtime',
] as const);
export type DoctorCheckId = (typeof DOCTOR_CHECKS)[number];

export interface DoctorCheck {
  readonly id: DoctorCheckId;
  readonly ok: boolean;
  /** What was found, or why the check failed. */
  readonly detail: string;
}

export interface DoctorReport {
  readonly reportVersion: typeof DOCTOR_REPORT_VERSION;
  /** Every check passed: output of this process is reference output. */
  readonly reference: boolean;
  readonly checks: readonly DoctorCheck[];
}

/** What the doctor observes; tests replace it. */
export interface DoctorHost {
  readonly platform: string;
  readonly arch: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  playwright(): {
    readonly version: string;
    readonly revision: string | null;
    readonly browserVersion: string | null;
  };
  /** Launches the pinned Chromium, closes it, and returns the version it reported. */
  chromium(): Promise<string>;
  /** Verifies the executables as `exportMp4` does (D29.1) and returns their checksums. */
  verifyFfmpeg(paths: FfmpegPaths): Promise<{ ffmpegSha256: string; ffprobeSha256: string }>;
  networkInterfaces(): readonly string[];
  /** The content hash of the runtime build, verified against its manifest. */
  runtimeHash(): string;
}

export const systemDoctorHost: DoctorHost = {
  platform: process.platform,
  arch: process.arch,
  env: process.env,
  playwright: installedPlaywright,
  async chromium() {
    const launched = await launchChromium();
    await launched.browser.close();
    return launched.reportedVersion;
  },
  verifyFfmpeg: (paths) => verifyFfmpeg(paths),
  networkInterfaces: () => Object.keys(networkInterfaces()),
  runtimeHash: () => loadRuntimeBuild().contentHash,
};

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

async function check(
  id: DoctorCheckId,
  run: () => Promise<{ ok: boolean; detail: string }> | { ok: boolean; detail: string },
): Promise<DoctorCheck> {
  try {
    const { ok, detail } = await run();
    return { id, ok, detail };
  } catch (reason) {
    const code = (reason as { code?: unknown } | null)?.code;
    return {
      id,
      ok: false,
      detail: typeof code === 'string' ? `${code}: ${message(reason)}` : message(reason),
    };
  }
}

/**
 * Runs every check, each even when an earlier one failed, so one report names
 * everything that differs. The FFmpeg paths are the ones `kadrion export`
 * would use: given, or `KADRION_FFMPEG` and `KADRION_FFPROBE`.
 */
export async function runDoctor(
  ffmpeg: Partial<FfmpegPaths>,
  host: DoctorHost = systemDoctorHost,
): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [
    await check('platform', () => ({
      ok: host.platform === 'linux' && host.arch === 'x64',
      detail: `${host.platform}/${host.arch}; the reference is linux/x64`,
    })),
    await check('image', () => {
      const declared = host.env[PINNED_IMAGE_VARIABLE];
      return {
        ok: declared === PINNED_IMAGE,
        detail:
          declared === undefined
            ? `${PINNED_IMAGE_VARIABLE} is not set; the reference is ${PINNED_IMAGE}`
            : `${PINNED_IMAGE_VARIABLE} declares ${declared}; the reference is ${PINNED_IMAGE}`,
      };
    }),
    await check('playwright', () => {
      const found = host.playwright();
      return {
        ok:
          found.version === PLAYWRIGHT_CORE_VERSION &&
          found.revision === CHROMIUM_REVISION &&
          found.browserVersion === CHROMIUM_VERSION,
        detail: `playwright-core ${found.version} pins Chromium ${String(found.revision)} (${String(found.browserVersion)}); the reference is ${PLAYWRIGHT_CORE_VERSION}, ${CHROMIUM_REVISION} (${CHROMIUM_VERSION})`,
      };
    }),
    await check('chromium', async () => {
      const reported = await host.chromium();
      return {
        ok: reported === CHROMIUM_VERSION,
        detail: `the browser reports ${reported}`,
      };
    }),
    await check('ffmpeg', async () => {
      if (ffmpeg.ffmpegPath === undefined || ffmpeg.ffprobePath === undefined) {
        return {
          ok: false,
          detail:
            'no FFmpeg given: pass --ffmpeg and --ffprobe, or set KADRION_FFMPEG and KADRION_FFPROBE',
        };
      }
      const found = await host.verifyFfmpeg({
        ffmpegPath: ffmpeg.ffmpegPath,
        ffprobePath: ffmpeg.ffprobePath,
      });
      return {
        ok: found.ffmpegSha256 === FFMPEG_SHA256 && found.ffprobeSha256 === FFPROBE_SHA256,
        detail: `ffmpeg ${found.ffmpegSha256}, ffprobe ${found.ffprobeSha256}`,
      };
    }),
    await check('network', () => {
      const facts = networkFacts(host.networkInterfaces());
      return {
        ok: facts.loopbackOnly,
        detail: `interfaces ${facts.interfaces.join(', ') || 'none'}; the reference run has only lo (--network none)`,
      };
    }),
    await check('runtime', () => ({ ok: true, detail: host.runtimeHash() })),
  ];
  return {
    reportVersion: DOCTOR_REPORT_VERSION,
    reference: checks.every((entry) => entry.ok),
    checks,
  };
}

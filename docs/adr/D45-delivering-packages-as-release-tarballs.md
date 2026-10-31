# D45 — Delivering the packages as tarballs of a GitHub release

- Status: Accepted — by the project owner on 2026-10-31, after PR-26 was merged
- Date: 2026-10-31
- Supersedes: —
- Amends: D29 (29.1, where the installer of the pinned FFmpeg lives), with an
  `Amended by: PR-26 (D45)` line
- Related: D01, D12, D21, D26, D28, D29, D37, D43,
  [roadmap of phase three](../roadmap/phase-3.md) PR-26

## Context

A host builds its video editor on Kadrion (Studio item 11 of the phase-three
plan). Its browser side needs `@kadrion/editor-session`, `@kadrion/player` with
the runtime build of `@kadrion/renderer-dom`, `@kadrion/editor-sdk`,
`@kadrion/ai-sdk`, and `@kadrion/schema`; its queue worker needs
`@kadrion/producer` and `@kadrion/cli`, the pinned Chromium of the image of
D26, and the pinned FFmpeg of D29.1.

Before this decision a host could not install any of them. Every package is
`"private": true` and `"UNLICENSED"`, nothing is published to a registry, and
D37.3 keeps it so. The packages are workspace members: their manifests name
each other with `workspace:*`, and their `exports` point at `dist`, which only
the workspace's build writes. The fetch-and-verify step of FFmpeg was a test
script (`tests/pinned/fetch-ffmpeg.ts`), and nothing told a worker whether it
runs in the environment whose output is reference output.

## Decision

**45.1 What ships.** A release ships nine packages: `schema`, `runtime`,
`renderer-dom`, `player`, `editor-sdk`, `editor-session`, `ai-sdk`,
`producer`, and `cli`. `@kadrion/test-fixtures` is a development dependency
only (D12) and is not shipped. A shipped package depends at run time on shipped
packages only.

**45.2 One version.** Every workspace package carries the same version
`x.y.z`, committed in its `package.json`; the first is `0.1.0`. A release is
the tag `v<version>` of a commit of `main`, and only the owner pushes it. A
release whose tag is not `v` and that one version is refused. A later release
changes the version in every package in the same commit.

**45.3 The tarballs.** Each shipped package is packed by `pnpm pack`: it
replaces every `workspace:` range by the exact version of the same release and
publishes nothing. A tarball holds `package.json` and the build output under
`dist` only, without source maps and without the build state of `tsc` (the
`files` of each manifest: `dist`, `!dist/.tsbuildinfo`, `!dist/**/*.map`). The
packed manifest stays `"private": true` and `"UNLICENSED"` (D37.3). Packing the
same build twice gave the same bytes for PR-26, but a host relies on the
manifest's hashes, not on a rebuild.

**45.4 The manifest.** `kadrion-release.json` names the version, the tag, and
the commit; the schema version that `validateComposition` accepts and the
versions that `parseComposition` and `migrateComposition` accept (D43), so a
host knows when stored documents need `parseComposition`; the content hash of
the runtime build (D21); the reference environment (the image of D26.2 by
digest, its platform, Playwright and Chromium, no network, and the FFmpeg pins
of D29.1 with the URL it is downloaded from); and every tarball with its size,
its SHA-256, and its integrity (`sha512-…`, the form a lockfile records).

**45.5 The release workflow.** `.github/workflows/release.yml` is a file of its
own; `ci.yml` stays byte for byte (Q14). On a tag `v*.*.*` its job `pack` runs
in the image of D26.2: it installs, runs `check`, packs (45.3, 45.4), and runs
the smoke test of 45.6. Only when that passes does the job `publish`, the only
one with `contents: write`, check every file against the manifest by its
SHA-256 and attach the tarballs and the manifest to a GitHub release of that
tag. Every action is pinned by its commit. A release of a publicly visible
repository can be downloaded by anyone, as its code can be read; neither is a
licence (D37.1, D37.2).

**45.6 The smoke test.** A clean project outside the workspace installs the
nine tarballs of the release as a host does (45.7), from the files the manifest
names. Its lockfile must name every `@kadrion/*` package from its tarball with
the manifest's integrity, and no other. In Node it validates and migrates a
document, dispatches a command and the AI tool on one bus and undoes, checks
the runtime build against the manifest's hash, runs `kadrion doctor`, and
renders one frame through the Producer. A bundler (esbuild, at the version the
workspace pins) builds the browser packages for the browser.

**45.7 How a host installs a release.** The host pins each tarball by its URL
and its integrity in its own lockfile, or vendors the tarballs into its own
repository; either way it installs the bytes the manifest names. Every
`@kadrion/*` name is pinned, including the ones the host does not import,
because a shipped package names its Kadrion dependencies by version (45.3):
with npm the tarball is both a dependency and an `overrides` entry, with pnpm
an `overrides` entry. No Kadrion name may resolve from a registry, where
anyone could publish a package of that name.

**45.8 The worker.** Kadrion ships no image, and its tarballs contain no FFmpeg
(D29.2, D37.4). Output is reference output only in one environment: the image
of D26.2 by its digest, the FFmpeg of D29.1 by its checksums, and a run with
`--network none` (D28.9). The CLI gains two commands for that environment:

- `kadrion fetch-ffmpeg --dir <dir>` downloads the pinned archive unless a
  verified one is cached, accepts it only with its pinned SHA-256, installs
  `bin/ffmpeg`, `bin/ffprobe`, and `LICENSE.txt` into `<dir>/<release>/` only
  when both binaries hash to their pins, and prints the two paths. It needs a
  network; the render does not. It is the installer that the test script used
  (29.1), moved into `@kadrion/cli` unchanged in behaviour.
- `kadrion doctor [--ffmpeg <path>] [--ffprobe <path>]` reports in JSON whether
  the current process is that environment: the platform, the image declared in
  `KADRION_PINNED_IMAGE` (a container cannot observe its own digest, so this
  one is declared, as in every manifest of D26.4), the installed Playwright,
  the Chromium it launches, the FFmpeg verified as `exportMp4` verifies it, the
  network interfaces, and the runtime build. It exits 0 when every check
  passes and 3 when one does not, and changes nothing.

A host that builds its own worker image with FFmpeg inside makes a
distribution decision of its own, with the GPL obligations of D29.2.

## Alternatives considered

- **A Git dependency on a tag** — fails: the packages are workspace members
  with `workspace:` ranges and need a build, so a Git install of a
  subdirectory gets neither.
- **GitHub Packages or another registry** — a registry, which D37.3 excludes
  without a new ADR.
- **A submodule built by the host** — the host would run Kadrion's build and
  carry its pins (Node, pnpm, TypeScript, esbuild), and two hosts could build
  different bytes from one commit.
- **Tarballs committed to the repository** — generated artefacts stay out of
  Git (`AGENTS.md`), and a release is a better place for files that belong to
  one tag.
- **A Docker image of the worker** — it would contain the GPL build of FFmpeg
  and Chromium, a distribution that D37.4 leaves to a future ADR; and the host
  owns its worker.

## Consequences

- The packages become installable outside the workspace without being
  published; a host pins them as it pins any other dependency, by integrity.
- Every workspace package moves from `0.0.0` to `0.1.0`. Versions are no input
  of the runtime build, so its hash, the Player's dist tree, the golden frames,
  and parity do not change; `ci.yml` and the pinned test files do not change,
  so Q14 stays closed.
- `check` packs every shipped package (`tests/repo/release.test.ts`), so it
  needs `corepack pnpm` and `tar`, as the CI image and a development machine
  have.
- `@kadrion/cli` gains `fetch-ffmpeg` and `doctor`; the installer moved from
  `tests/ci/ffmpeg-install.ts` to `packages/cli/src/ffmpeg-install.ts`, and
  `node --run ffmpeg:fetch` uses it through `@kadrion/cli`, a new development
  dependency of the root. `@kadrion/producer` exports `verifyFfmpeg`. The
  package map of D12 is unchanged: the CLI still depends on the Producer only.
- A breaking change of a public API, or a new schema version, needs a new
  version and a new release before a host sees it; nothing reaches a host
  between releases.
- The release itself happens only when the owner pushes a tag; this decision
  creates none.

## Verification

- `tests/repo/release.test.ts`: the shipped packages are every package but the
  fixtures; every package has the one version; each shipped package has the
  `files` of 45.3 and depends on shipped packages only; every shipped package
  packs, and each tarball holds only `package.json` and `dist` without maps or
  build state, is private and unlicensed, and has exact versions; the manifest
  matches the files and repeats the pins; a tag other than `v<version>` is
  refused; the lockfile rule of 45.6; and the release workflow runs on tags,
  packs, smoke-tests with a rendered frame in the pinned image, publishes with
  `gh`, and pins every action by its commit.
- `packages/cli/test/doctor.test.ts`: every check of the doctor, its report,
  and its exit codes; `fetch-ffmpeg`'s output, refusals, and exit codes.
  `packages/cli/test/ffmpeg-install.test.ts` is the installer's test, moved
  with it.
- The smoke test of 45.6 runs in the release workflow, and was run in the
  pinned container for PR-26.

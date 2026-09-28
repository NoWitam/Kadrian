# D37 — The repository is publicly visible, and the code stays proprietary

- Status: Accepted — by the project owner on 2026-09-28
- Date: 2026-09-28
- Supersedes: [D10](D10-private-repo-designed-for-open-source.md)
- Related: D01, D12, D27 (27.5, the fixture assets), D29 (29.1–29.2, the FFmpeg
  build and its licence), [specification](../spike/vertical-spike.md) §3.2 and
  open question Q4

## Context

D10 decided that "the repository is private initially and designed for possible
future open source". In fact the GitHub repository `NoWitam/Kadrian` is
publicly visible: the public API reports `"private": false` and
`"visibility": "public"`, and CI runs are readable without an account (Q14). The
project owner confirmed on 2026-09-28 that the public visibility is intended.

Visibility is not a licence. The repository has no `LICENSE` file, the API
reports no licence, and every workspace package is `"private": true` with
`"license": "UNLICENSED"`. Being able to read the code grants no right to use,
modify, or redistribute it. So the project is publicly visible, but it is not
open source.

## Decision

> D37: The repository is publicly visible but proprietary; it grants no licence, its packages stay private and unpublished, and it stays designed for a possible future open-source release.

In detail:

1. **Visibility.** The repository is publicly visible. Anyone can read the code;
   that is not a licence.
2. **No licence.** The code stays proprietary. The repository grants no licence
   to use, modify, or redistribute it, and it is not called open source anywhere.
   No `LICENSE` file is added.
3. **Packages.** Every workspace package and application stays `"private": true`
   with `"license": "UNLICENSED"`, and nothing is published to a registry.
4. **A future release.** An open-source licence or the publication of packages
   needs an ADR of its own. That ADR analyses the licences of every dependency
   (the D12 allowlist records the runtime ones; development dependencies, the
   pinned image, and the fixture assets need their own inventory) and how FFmpeg
   is used: the pinned build of D29.1 contains libx264 under the GPL, and it is
   fetched by hash for the render environment, not redistributed by this
   repository.
5. **Architecture.** The engine stays designed so that such a release remains
   possible: no Taskio code, infrastructure, credentials, or private URLs in
   this repository (D01, `AGENTS.md`).
6. **Assets and records.** The asset-provenance rule of specification §3.2 and
   the licence records of the D12 allowlist continue under D37; references to
   D10 in §3.2, D12, D27.5, and D29.2 read as D37. Generated media, frames,
   browser caches, and large fixtures stay out of Git.

## Related rules in `AGENTS.md`

Verbatim quotations. `AGENTS.md` remains the authoritative text.

> The repository is publicly visible, but the project is not open source: no licence is granted to use, modify, or redistribute it (D37). It may become open source later only by a future ADR. Keep product-specific infrastructure, credentials, private URLs, and Taskio implementation details outside this repo.

> Never add secrets or real Taskio credentials.

> Keep generated media, frames, browser caches, and large fixtures out of Git.

## Alternatives considered

- **Make the repository private again** — D10 would hold again, but the owner
  wants the repository visible.
- **Choose an open-source licence now** — premature: Kadrion is developed for its
  owner and Taskio, and a licence needs the dependency and FFmpeg analysis first.
- **Only a status note in D10** — not enough: the visibility of the repository is
  the substance of D10, so the change needs an ADR that supersedes it.

## Consequences

- D10 is `Superseded by D37`; its text is kept as it was accepted.
- `AGENTS.md` lists D37 in place of D10 among the accepted decisions.
- Public visibility means that anything committed is public: the rules on
  secrets, credentials, and private URLs matter even more.

## Verification

`tests/repo/workspace-structure.test.ts` checks that every workspace package is
`"private": true` with `"license": "UNLICENSED"`, which prevents accidental
publication until a future ADR chooses a licence. `tests/repo/adr.test.ts`
checks that this ADR quotes its decision and related rules verbatim from
`AGENTS.md`. That the repository is publicly visible is a setting of GitHub,
checked by hand.

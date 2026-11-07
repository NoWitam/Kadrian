# D03 — MVP rendering uses DOM/SVG; Canvas/WebGL are later extensions

- Status: Accepted
- Recorded: 2026-09-21, from `AGENTS.md` at commit `250ae8f`
- Amended by: PR-35 on 2026-10-30, at the owner's instruction: the quotation
  of the excluded scope follows `AGENTS.md`, which no longer excludes
  transitions in phase three (roadmap of phase three, question 1); the
  decision is unchanged
- Amended by: PR-44 on 2026-11-04, at the owner's instruction: the quotation
  of the excluded scope follows `AGENTS.md`, which no longer excludes colour
  grading and filters in phase five and excludes 3D scenes (roadmap of phase
  five, question 1); the decision is unchanged
- Related: D05, D06

## Decision

> D03: MVP rendering uses DOM/SVG. Canvas/WebGL are later extensions.

## Rationale

Not recorded. `AGENTS.md` states this decision without its reasons. The project
owner is asked to supply the rationale; until then this section stays empty
rather than guessed.

## Related rules in `AGENTS.md`

Verbatim quotations. `AGENTS.md` remains the authoritative text.

> The same runtime renders it in pinned Chromium on the server.

> Do not hide meaningful state in CSS class names, DOM order, callbacks, or opaque code.

> Extension points require an explicit type manifest, property schema, runtime
> implementation, editor metadata, AI metadata, and reference tests.

> Assets, fonts, randomness, and runtime versions must be explicit or pinned.

Listed under "Explicitly outside the current scope":

> Full timeline UI, advanced trimming, or 3D scenes.

(Amended by PR-35: until 2026-10-30 the line also excluded transitions.
Transitions are planned for phase three as DOM/SVG rendering, within this
decision.)

(Amended by PR-44: until 2026-11-04 the line excluded colour grading and
filters instead of 3D scenes. Effects are planned for phase five as CSS and
SVG filters, within this decision; an effect that needs Canvas or WebGL waits
for a later ADR.)

## See also

- [Vertical-spike specification](../spike/vertical-spike.md), open question Q15,
  answered by [D20](D20-dom-renderer-package-and-host-clock.md): the DOM/SVG
  renderer lives in `@kadrion/renderer-dom`; its mapping is
  [D22](D22-dom-mapping-and-css-serialisation.md).

## Verification

Not mechanically verified in PR-00. From the renderer PR onwards: golden frames
rendered through the DOM/SVG path at the reference timestamps. (Annotated by
PR-03: the renderer PR verifies the rendered DOM tree; golden frames need the
pinned Chromium of PR-06, specification §10.)

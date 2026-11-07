# D67 — Easing curves of keyframes and transitions: schema 0.12

- Status: Proposed
- Date: 2026-11-07
- Supersedes: —
- Amends: D16 (16.6: the value between two keyframes follows the easing of
  the first), D18 (a new 18.7: the arithmetic of an eased segment; 18.3 stays
  the arithmetic of a linear one), D35 (the step from `0.11` to `0.12` and the
  frozen `0.11` schema), D41 (41.3: a new keyframe takes an easing), and D56
  (56.1: a transition has an easing; 56.5: the progress of an effect is eased),
  each with an `Amended by: PR-47 (D67)` line
- Related: D15, D17, D19, D30, D38, D39, D46, D49, D65, D66,
  [phase five](../roadmap/phase-5.md) PR-47

## Context

Every animation of schema `0.11` moves at a constant speed: an animation has
`interpolation: 'linear'`, the only value the schema allows, and a transition
has no easing at all. A host's motion graphics need a slow start, a slow end,
an overshoot, a held value, and steps, the same in the Player and the Producer
to the last bit, since the Producer is the reference output and parity is
measured at 0 differing pixels (D33).

What the repository has, read on 2026-11-07 at `main` `55c3a88`: schema `0.11`,
the sampling and arithmetic of D18 (`a + ((b − a)·(t − ti)) / (ti+1 − ti)`,
`+ − · /` only), D65's motion model, whose order of operations samples every
animated value before it is composed, 63 commands with their tools, and the
transitions of D56 and D66, whose progress is the elapsed time over the
duration.

ECMAScript leaves `Math.pow`, `Math.cbrt`, `Math.exp`, and the trigonometric
functions "implementation-approximated", so an engine may differ from another
in their last bits; `+ − · /` and the comparisons are IEEE 754 operations,
correctly rounded in every engine.

## Decision

> D67: Schema `0.12` gives every keyframe and every transition an `easing`: `linear`, `hold`, `ease-in`, `ease-out`, `ease-in-out`, `cubic-bezier` with its control points, or `steps` with a count and a position. A keyframe's easing shapes the segment that starts at it. A linear segment keeps the arithmetic of D18.3; every other curve is computed with `+ − · /` and comparisons only, a Bézier by 64 bisection steps, and its value is held within the bounds of its property. Two commands set an easing.

### 67.1 Where an easing belongs

- Each keyframe has an `easing`, right after its `value`. It shapes the
  segment from that keyframe to the next. The easing of the last keyframe is
  never read; it is kept so that a keyframe has one shape wherever it is, and
  so that a keyframe moved or inserted after it has an easing to carry.
- An animation no longer has `interpolation`: 0.11 allowed it to be `linear`
  only, and the step from `0.11` removes it (67.9).
- Why on the keyframe and not on the animation: an animation that eases in to
  a value, holds it, and eases out needs a different curve per segment, as in
  every editor that shows a graph of a property. One easing on the animation
  would force a host to split such an animation into nodes. Why on the
  keyframe the segment starts at, and not the one it ends at: it is the
  convention of CSS (`animation-timing-function` of a keyframe applies until
  the next one) and of the tools hosts know, and it gives the first keyframe a
  meaning and the last none, rather than the other way round.

### 67.2 The kinds

`easing` is a closed object, `oneOf` by `kind` (D17):

| `kind`         | Fields                                                      | Eased progress `e(p)`, `0 < p < 1`                  |
| -------------- | ----------------------------------------------------------- | --------------------------------------------------- |
| `linear`       | —                                                           | `p`, by the arithmetic of D18.3 (67.3)              |
| `hold`         | —                                                           | `0`: the value of the keyframe until the next one   |
| `ease-in`      | —                                                           | the Bézier `(0.42, 0, 1, 1)`                        |
| `ease-out`     | —                                                           | the Bézier `(0, 0, 0.58, 1)`                        |
| `ease-in-out`  | —                                                           | the Bézier `(0.42, 0, 0.58, 1)`                     |
| `cubic-bezier` | `x1`, `x2` from 0 to 1; `y1`, `y2` from −1 to 2             | the Bézier `(x1, y1, x2, y2)` from (0, 0) to (1, 1) |
| `steps`        | `count`, an integer from 1 to 1000; `position`, start / end | `j / count` with `j` jumps (67.5)                   |

- The named curves are the cubic Béziers of CSS Easing Functions Level 1.
- `x1` and `x2` lie within 0 and 1, as in CSS, so that `x(s)` never decreases
  and every progress has one parameter. `y1` and `y2` lie within −1 and 2:
  room for an overshoot or an anticipation of a whole range, and a bound that
  keeps every intermediate value of the arithmetic small.
- `spring` and `elastic` curves are not kinds: a host can bake them into
  keyframes (phase five, not included).

### 67.3 The arithmetic

The value of a channel between `(ti, a)` and `(ti+1, b)` at
`ti < t < ti+1`, with `elapsed = t − ti` and `span = ti+1 − ti`:

- `linear`: `a + ((b − a) · elapsed) / span`, D18.3 unchanged, so a document
  of `0.11` samples to the same bits in `0.12` (67.9).
- `hold`: `a`, without any arithmetic.
- `steps`: `a + ((b − a) · j) / count`, the order of D18.3 with the number of
  jumps `j` in place of the elapsed time (67.5).
- A Bézier: `p = elapsed / span`, then `a + (b − a) · e(p)`.

The eased progress of a Bézier is found by bisection:

1. One coordinate of the curve at the parameter `s` is
   `((A · s + B) · s + C) · s` with `C = 3·c1`, `B = 3·(c2 − c1) − C`, and
   `A = 1 − C − B`, the power form of `3(1 − s)²s·c1 + 3(1 − s)s²·c2 + s³`,
   evaluated in exactly this order.
2. The bracket `[low, high]` starts at `[0, 1]` and is halved 64 times: with
   `middle = (low + high) / 2`, `low` becomes `middle` while `x(middle) < p`,
   and `high` becomes `middle` otherwise.
3. `e(p)` is `y` at `(low + high) / 2`.

Every one of the 64 steps runs, whatever the curve: no step stops on a
tolerance, so the work and the result never depend on how fast an engine
converges. After 64 halvings the bracket is narrower than the spacing of
binary64 for every parameter above 2^-11; the steps after the midpoint stops
moving change nothing. The plan's example of 40 steps would leave the bracket
2^-40 wide, far wider than the spacing of the parameter, so the result would
depend on the step count rather than on the curve; 64 steps cost a few
hundred operations per sampled value and leave nothing to choose.

A JavaScript engine evaluates each operation separately; a later native or
GPU evaluator must not contract `A · s + B` or `a + (b − a) · e(p)` into a
fused multiply-add (D18.3's reason for multiply-first does not reach these
forms, which have no alternative without one).

### 67.4 Monotone, and how close

- **Monotone in the parameter.** For a progress `p ≤ q`, each step compares
  the same computed `x(middle)` with `p` and with `q`; whenever the step for
  `q` moves `high` down, `x(middle) ≥ q ≥ p`, so the step for `p` moves `high`
  down too. By induction the bracket of `p` never lies above the bracket of
  `q`, whatever the rounding of `x`, so the parameter found never decreases
  when the progress grows. For a curve whose `y` rises, as the named curves,
  `e(p)` then rises too except for the rounding of `y` itself; that is checked,
  not proven: over 4095 evenly spaced points and five runs of 200 adjacent
  doubles, `e(p)` never decreases for any named curve.
- **Close to exact.** A table computed independently — every control point and
  every progress as a dyadic rational of 256 fractional bits in `BigInt`, the
  Bernstein form instead of the power form, 240 bisection steps, one rounding
  at the end — gives the exact eased progress. At 66 fixed points (every 64th,
  and points 10^-9 from 0, 2^-40 from ½, and 2^-30 from 1) the runtime is
  within **2^-51** of it for the named curves and within **2^-50** for
  curves whose `y` reaches −1 or 2. That is not one unit in the last place of
  the result, which the plan asked for: near an end where a curve is flat,
  `e(p)` is tiny and its last place far finer than the rounding of `x(s)` that
  the bisection compares. Where `x` stands still inside the curve, as for
  `(1, −1, 0, 2)` at `s = ½`, an error of 2^-53 in `x(s)` moves the parameter
  by its cube root, and the distance to the table reaches 5.7·10^-6 (bounded
  in the tests by 2^-17). Every engine computes the same bits all the same:
  the accuracy is a property of the curve, the determinism one of the
  arithmetic.

### 67.5 Steps

- The number of jumps at `elapsed` of `span` is `floor(elapsed · count / span)`
  for `end`, and one more for `start`, computed exactly in `BigInt`, since the
  product of a time and a count can exceed 2^53.
- A span of a transition may be half of an odd duration (D56, the halves of
  `fade-through-color`): both times are then doubled first, which is exact.
- At `elapsed = 0` the value is the keyframe's own (D18.2 samples it there
  without arithmetic), for `start` too: a jump at the start happens the first
  microsecond after it. At the next keyframe its value holds.

### 67.6 Bounds

- A sampled value of every curve but `linear` is held within the bounds of its
  property, by comparisons only: an opacity factor within 0 and 1, a scale
  factor within 0 and 1000, a position offset within −1 000 000 and 1 000 000,
  the bounds of the schema's keyframe values. An overshoot therefore never
  leaves the range of its property; a value inside stays as it is. A unit test
  reads the bounds from `compositionSchema`, so they cannot drift apart.
- `linear` is not held: its value lies between its two keyframes already, and
  D18.3 stays exactly as it was.

### 67.7 Commands

- `SetKeyframeEasing { animationId, timeUs, easing }` sets the easing of the
  keyframe at that time, the last one included. Its inverse sets the old
  easing back; the same easing is no edit (D38.9); a time without a keyframe
  is `unknown-keyframe`, an animation that does not exist
  `unknown-animation`, and an easing outside the schema `invalid-result`
  (D41.5, D41.6). The keyframe keeps its time, its value, and the order of its
  keys.
- `SetTransitionEasing { transitionId, easing }` sets the easing of a scene
  or a clip transition, with the same rules (`unknown-transition`, D56).
- The typed keyframe commands (`SetOpacityKeyframe`, `SetPositionKeyframe`,
  `SetScaleKeyframe`) take no easing. A keyframe they insert is written as
  `{ timeUs, value, easing }` with a copy of the easing of the keyframe before
  it, or `linear` before the first; one they replace keeps its easing;
  `MoveKeyframe` keeps it too, and `AddKeyframe` and `AddAnimation` take it as
  exact data. **This differs from the plan**, which named an easing argument
  on the keyframe commands: no command of the registry has an optional
  argument, and a tool's parameters are its command's arguments (D46); a required
  easing on every typed command would make a host restate the curve of every
  value it edits. A host that inserts a keyframe with a curve sends both
  commands in one transaction.
- Both commands are tools (`set_keyframe_easing`, `set_transition_easing`,
  D46); the catalogue has 68 entries.

### 67.8 Transitions

- Every transition, between scenes or between clips, has an `easing` of the
  same set, right after its `effect`. It shapes the progress of its effect:
  every value an effect moves between two ends — an opacity, an offset, a
  scale, an inset, a radius — is `start + (end − start) · e(p)` for a Bézier,
  and as in 67.3 for the other kinds, then held within its two ends. A
  transition at elapsed time 0 is invisible, whatever its easing (D49.4).
- `fade-through-color` eases each half on its own: the outgoing side falls
  over the first half and the incoming side rises over the second, each with
  the whole curve.

### 67.9 Schema `0.12` and the step from `0.11`

`step011To012` removes each animation's `interpolation`, gives every keyframe
`easing: { "kind": "linear" }` after its `value` and every transition the same
after its `effect`, and sets `schemaVersion` to `0.12`. Since a linear segment
and a linear transition keep their arithmetic, every document of `0.11`
samples to the same bits and renders byte for byte. The frozen
`compositionSchemaV011` reads `0.11` (D35); the compatibility corpus gains
`compatibility/v0-12/` with a document of every kind of easing, every entry is
re-pointed there, the documents of `v0-11` become frozen inputs, and the
earlier corpora keep their bytes.

### 67.10 What this ADR does not decide

- Spring and elastic curves, expressions (phase five, not included).
- Easing of an audio fade (D52, linear) or of a clip's volume.
- Animated properties beyond opacity, position, and scale (PR-48).

## Alternatives considered

- **Easing on the animation.** One curve per property; see 67.1.
- **Easing on the keyframe a segment ends at.** See 67.1.
- **Newton–Raphson for the Bézier, as browsers do.** It stops on a tolerance
  and falls back to bisection where the slope is small, so its number of steps
  and its last bits depend on the curve and the point; bisection with a fixed
  count does not.
- **A cubic solved in closed form.** It needs `Math.cbrt` or `Math.sqrt`; the
  first is approximated by the specification, and the second, though
  correctly rounded, comes with a `Math.cos` or `Math.acos` in the case of
  three real roots.
- **No bounds.** An overshoot of an opacity factor above 1, or a scale below
  0, would produce values the schema refuses for a keyframe and the renderer
  never meant to write.
- **An easing argument on the typed keyframe commands.** See 67.7.

## Consequences

- `@kadrion/schema`: schema `0.12`, the type `Easing` and `AnimationKeyframe`,
  the frozen `0.11` reader, and the step.
- `@kadrion/runtime`: the curves, the bisection, the steps, the bounds, and the
  easing of every transition effect; a forged easing is `invalid-document`
  (D19). The runtime build hash changes, so the golden frames are written
  again and parity is measured again.
- `@kadrion/editor-sdk`: two commands, the inherited easing of a new keyframe,
  and their tool metadata; `@kadrion/ai-sdk`: two tools and the catalogue's
  snapshot. The change of the API is breaking (`interpolation` is gone).
- `@kadrion/test-fixtures`: the easing composition (640×360, 2.6 s: seven
  images moved by each kind, an eased slide, an eased growth), its 5 golden
  frames, the `0.12` corpus, and every fixture at `0.12`.
- Q14 stays open: a new pinned test and its two reports are added.

## Verification

- Unit tests (`packages/runtime/test/easing.test.ts`): each Bézier against the
  independent `BigInt` table at the fixed points, within the bounds of 67.4;
  the ill-conditioned curve within 2^-17; the named curves never decreasing; a
  table of bits of the named curves that a change of the arithmetic would
  change; steps exact for large times and for half of an odd span; linear
  exactly D18.3; hold without arithmetic; the bounds read from
  `compositionSchema`; and eased keyframes and transitions in the evaluated
  state, the two halves of a fade through a colour included.
- Unit tests of the commands, their undo byte for byte, their no-ops, and
  their refusals (`packages/editor-sdk/test/keyframes.test.ts`,
  `transitions.test.ts`), of the inherited easing, and of the tools
  (`packages/ai-sdk/test/tools.test.ts`).
- Negative fixtures for every field of an easing; the step 0.11 → 0.12 has its
  migration pair and the invalid corpus of `0.11`.
- In pinned Chromium (`tests/pinned/easing.pinned.test.ts`): the runtime's
  built modules compute the same bits in Chromium as in Node for seven curves
  at 1026 points and for the state of the easing composition at every one of
  its 78 frames; and its frames meet their 5 golden frames. The existing golden
  PNG files stay byte for byte.
- Parity of the Player against the Producer measured again.

# D61 — The Player's playback events: ended, play range and loop, waiting, and the asset of an error

- Status: Proposed
- Date: 2026-11-03
- Supersedes: —
- Amends: D25 (25.6 and 25.7: the statuses `waiting` and `ended`, the play
  range, the frames of the clock, the asset of an error, the code
  `invalid-play-range`) and D44 (44.4: rows of the `playback` event; 44.2:
  `setPlayRange` of the session), each with an `Amended by: PR-38 (D61)` line
- Related: D13, D20, D33, D51, D53, D60,
  [roadmap of phase four](../roadmap/phase-4.md) PR-38

## Context

A host's transport controls and playhead follow the Player through
`Player.subscribe` and the session's `playback` event (D44). Four things a
host editor needs were missing:

- **The end of playback.** At the last frame the clock stopped and the status
  became `ready`, the same as after a pause, so a host could not tell an end
  from a pause without reading the time and the duration itself.
- **A play range and a loop.** An editor plays a selection, often in a loop.
  A host could only seek back by itself when it saw the time pass the end of
  the selection, a frame late, and with the sound restarted from a new
  context time, so the loop point was neither exact in pixels nor in sound.
- **Waiting.** While a frame of the clock was being prepared (its video
  frames decoded in the host window, D51.4, its page render), the status went
  from `playing` to `seeking` and back on every frame; a host saw the status
  flicker during normal playback, and could not tell a late frame from a
  normal one.
- **Which asset failed.** A failed asset was reported with a code and a
  message that named the asset in prose; a host that marks the failed clip in
  its timeline had to parse the message.

## Decision

**61.1 `ended`.** `PlayerStatus` gains `ended`: a play reached the last frame
of the document, or of the play range (61.2), and stopped. The status becomes
`ended` once the last frame is shown, and is reported exactly once per play:
`play()` starts a new play (from the start of the document or of the range,
as at the last frame before), a seek leaves `ended` for `ready`, and `pause()`
after the end changes nothing. A load or an update leaves `ended` too. The
sound of the last frame plays to its end (D53), as before. Until the last
frame is shown, the status stays what it was; if a frame of the clock is in
flight at the end, the last frame follows it, so a play always shows its last
frame.

**61.2 The play range and the loop.** `Player.setPlayRange(range | null)` with
`range = { startUs, endUs, loop }` bounds playback; `null` is the whole
document. The range is state of the Player, not an option of the session: the
Player owns the preview clock (D20.2), and the session passes it through
(`EditorSession.setPlayRange`) as it does `seek`, `play`, and `pause`.

- It needs a loaded document (`not-loaded`) and is checked on the frame grid
  (D13), else the new code `invalid-play-range`: whole microseconds,
  `0 <= startUs < endUs <= durationUs`, `startUs` a frame time, and `endUs` a
  frame time or the document's end. The last frame of the range is the last
  frame that starts before `endUs`.
- `PlayerState` gains `playRange`: a frozen copy of the range, or `null`.
  `subscribe` reports its changes like those of `status`, `timeUs`, and
  `error`.
- `play()` starts from the frame shown if the range holds it before its last
  frame, else from the range's start. Without `loop`, playback ends at the
  range's last frame (61.1). With `loop`, the clock restarts at `startUs`
  after the range's last frame and never ends.
- The passes of a loop are computed from the start of the run, never from the
  frame shown: without sound in microseconds of the scheduler, with sound in
  samples heard. So `n` passes present the same frames as `n` plays of the
  range for the same clock readings, and a loop never drifts from its sound.
- With sound (D53), each pass is the plan scheduled from the sample of
  `startUs` (`sampleAt`, the rule of a seek) to the sample of `endUs`
  (exclusive), and is heard right after the pass before, sample for sample:
  `scheduleSounds` gains an optional `toSample`. The pass after the one heard
  is always scheduled, so the loop point needs no new context time; passes
  two behind are stopped. A sound of a range without `loop` is cut at the
  range's end; the sound of the whole document plays to its own end, as
  before.
- A seek while playing to a time inside the range plays on from there, as
  before (D53); a seek outside the range stops the clock, since playback
  stays inside the range, and shows the frame sought (`ready`).
- `setPlayRange` while playing plays on from the frame shown if the new
  range holds it, else from its start.
- `load` clears the range. `update` (D44.5) keeps it while the new document
  holds it on its frame grid; when the new document is shorter than its
  `endUs`, `endUs` is cut to the new end; otherwise, for instance when the
  document ends before `startUs` or its frame rate moved `startUs` off the
  grid, it is cleared. A failed update clears it with the document.

**61.3 `waiting`, and the frames of the clock.** `PlayerStatus` gains
`waiting`: the Player is playing, but what the clock is at is not shown yet.
It is reported when a tick of the clock finds a newer frame due while the
frame before it is still in flight (its video frames are being decoded, or the
page has not answered), and while the audio context the sound needs has not
started yet (a suspended context being resumed). Once the frame in flight is
shown, or the context runs, the status is `playing` again. It is a status, not
a separate event: it is a state of playback with a beginning and an end, which
a status already reports in order, and a host reads it with the other
statuses from one place.

The clock is not held: with sound the audio context's clock cannot pause
without a gap, and without sound holding the clock would make the frames
shown depend on the speed of the machine. The frame shown is still only ever
a frame of the document (D25.7); a frame the clock skipped is not shown late.

The frames the clock asks for no longer change the status: while playing, the
status stays `playing` (or `waiting`) instead of going to `seeking` and back
on every frame. A seek the host asks for still shows `seeking` until its frame
is ready, also while playing.

**61.4 An error names its asset.** `PlayerError` gains
`asset: { id, contentHash } | null`: the asset of the document the failure is
about, or `null` when it is about none. It is set for every failure of an
asset the Player decides in the host window — resolving and verifying
(`asset-missing`, `asset-hash-mismatch`, `asset-invalid`), reading and
decoding video (`video-unsupported`, `video-undecodable`), decoding sound
(`audio-invalid`, `audio-unsupported`), and the source ranges of video nodes
and sounds (`source-range-exceeded`; for several sounds, the asset of the
first, while `details` lists all) — and for `prepareVideo` and
`prepareAudio`. The `id` is the document's asset ID; the hash is the one the
document gives it.

Two failures are reported by the render page, in the runtime build, which
does not change in this decision: a font that does not load
(`font-load-failed`) and an image that does not decode
(`asset-decode-failed`). The page reports them as a code and a message only;
the Player names the asset from the message, which names the font's asset ID
or the image node's ID, through the document it sent. The forms of those two
messages are pinned by the jsdom tests that run the real runtime build; a
later change of the runtime build may give the page's errors a structured
asset ID instead.

The session reports these errors unchanged, in its `error` and `playback`
events and from `readMediaFacts`.

**61.5 The table of events (amends D44.4).** The `playback` row of D44.4
carries these rows, all in `state`:

| `state` field | Value                                | When                                                              |
| ------------- | ------------------------------------ | ----------------------------------------------------------------- |
| `status`      | `waiting`                            | playing, and the frame due or the sound is not ready yet (61.3)   |
| `status`      | `ended`                              | once per play, after its last frame is shown (61.1)               |
| `playRange`   | `{ startUs, endUs, loop }` or `null` | after `setPlayRange`, a load, or an update that cut or cleared it |
| `error.asset` | `{ id, contentHash }` or `null`      | with every error, naming the asset that failed (61.4)             |

Every event stays deterministic for the same operations and the same Player
answers: the passes, the end, and `waiting` are computed from the clock
readings and from which request is in flight, nothing else.

**61.6 Not included.** A playback rate other than 1 (its sound would need
resampling, which no ADR covers), stepping frame by frame beyond `seek`, and
any UI.

## Alternatives considered

- **The play range as an option of the session** — the session reads no
  clock (D44.1); the range bounds the Player's clock, so it is the Player's
  state, and a host without a session needs it too.
- **A loop by seeking back when the end is seen** — a frame late, and the
  sound restarted at a new context time with a gap of the scheduling lead;
  the loop point would be exact neither in pixels nor in sound.
- **`waiting` as a separate event** — `subscribe` reports states; a second
  kind of message would need a second listener type and an order between the
  two. As a status it is ordered with the rest by construction.
- **Holding the clock while waiting** — not possible with the audio clock
  without a gap, and it would make the frames shown depend on the machine.
- **`ended` as a flag beside the status** — the end is a state of the
  transport like `playing` and `ready`; a flag would allow combinations that
  mean nothing (`playing` and ended).
- **Clamping a range that an update no longer holds** — a range whose start
  is past the new end, or off a new frame grid, has no sensible clamp; only
  the end is cut, which keeps the host's selection when it shortens the
  document's tail.
- **A structured asset ID from the page now** — it changes the runtime build,
  which this pull request keeps byte for byte (phase four, PR-38).

## Consequences

- The Player's dist tree changes, so the parity record is measured again in
  the pinned environment (D33.10). The runtime build does not change.
- `tests/pinned/audio.pinned.test.ts` gains the loop of 61.2 in
  `OfflineAudioContext`, so a pinned test file changes and Q14 reopens
  (`docs/ci/first-run.md`); it closes by the evidence of a later push run of
  main.
- The API reports of `@kadrion/player` and `@kadrion/editor-session` change.
  Widening `PlayerStatus` and `PlayerErrorCode` widens what the Player
  returns, which D60.4 calls breaking; `PlayerState.playRange`,
  `Player.setPlayRange`, and `EditorSession.setPlayRange` are new members
  that a host implementing these interfaces (a test double) must add. The
  rest is additive. The next release raises its minor version (D60.4), as
  v0.2.0 does anyway (phase four, PR-43).
- A host that compared the status with `ready` to see the end of playback
  now sees `ended`; a host that waited for `seeking` during playback sees
  `playing` or `waiting`.

## Verification

- `packages/player/test/player.test.ts` ("playback events (D61)"), with an
  injected scheduler against the real render page in jsdom: `ended` once per
  play and again after a new play; the checks of a range and its frozen
  state; a range played to its end; three passes of a loop present the same
  frames as three plays of the range; seeks inside and outside the range
  while playing; a range set while playing; the range across updates that
  keep, cut, and clear it, and a load; `waiting` while a frame is in flight,
  with no `seeking` between the frames of the clock; the same events for the
  same operations twice. The typed errors before the first frame name their
  asset, including the font and the image the page reports.
- `packages/player/test/audio.test.ts`: `scheduleSounds` with `toSample`; a
  loop with sound schedules each pass right after the one before from the
  same samples, the pass after the one heard, and stops the passes two
  behind; a range without loop cuts its sound and ends; `waiting` until a
  suspended context runs.
- `packages/editor-session/test/session.test.ts`: `setPlayRange` passes
  through, and `playback` reports the range.
- `tests/pinned/audio.pinned.test.ts`: in pinned Chromium, three passes of a
  range of the Player's graph in `OfflineAudioContext` equal the Producer's
  mix of the range three times, within float automation (as D53).
- The API reports (D60).

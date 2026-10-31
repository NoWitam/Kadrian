# D44 — The host facade and the live preview

- Status: Accepted — by the project owner on 2026-10-31, after PR-23 was merged
- Date: 2026-10-31
- Supersedes: —
- Amends: D12 (the map gains `editor-session`), D25 (25.4 and 25.7, new 25.11),
  and D38 (D38.8, the history depths of a change), each with an
  `Amended by: PR-23 (D44)` line
- Related: D09, D13, D14, D20, D25, D30, D33, D36, D38,
  [roadmap of phase three](../roadmap/phase-3.md) PR-23

## Context

A host editor (Studio item 1 of the phase-three plan) needs one place that
joins a document, the command bus over it, the Player that shows it, and the
host's asset resolver, and it needs to hear about every change through one
table of events: the document, the history, the playback time, and errors.

Before this decision a host had to do the joining itself. The playground does:
`wireEditor` subscribes to the bus and calls `Player.load` for every change.
`load` recreates the mounted tree, asks the resolver for every asset again,
and seeks to 0, so each edit made the preview jump to the start and re-hash
every asset. Every later feature of phase three (video frames, audio playback,
scenes) reports through the same host, so the table of events has to exist
before them.

Nothing about this was implemented before: the plan's statement that PR-23 was
uncommitted work on the owner's machine was wrong (owner, 2026-10-31), and this
decision is written together with its code.

## Decision

**44.1 The package.** `@kadrion/editor-session`: host facade joining the
document, command bus, Player, and asset resolver. It may depend on
`editor-sdk`, `player`, and `schema`; no package may depend on it, and it may
not depend on `runtime`, `renderer-dom`, or `producer` (D12). It holds no
domain rule, reads no clock, and uses no network (the guardrails of 25.8 apply
to its sources).

**44.2 The session.**
`createEditorSession({ document, player, resolveAsset, historyLimit?, onListenerError? })`
creates the command bus over `document` (D38), loads it into `player` (a Player
not loaded yet, created with `onListenerError`), and resolves once frame 0 is
shown. The session owns the Player from then on and destroys it with itself,
and also when the document is refused or the load fails. It exposes:

- `bus`, the one command bus: UI and AI edit through it, and an edit made there
  needs no other call to reach the preview. The session has no second path into
  the document (D09, D30.9).
- `seek`, `play`, `pause`, `getPlaybackState`, passed through to the Player;
  `getHistory()`; `settled()`, which resolves once the preview has tried to show
  the bus's current document; `subscribe(listener)`, which needs
  `onListenerError` as D38.8 does; and `destroy()`.

**44.3 Edits reach the preview.** After every committed change the session
brings the preview to the bus's document with `Player.update` (44.5), one
update at a time. Changes committed while an update runs are coalesced: only
the latest document is sent next. When an update fails, the edit stays on the
bus, the session reports an `error` event, and the next document is sent with
`load` (from frame 0), because the Player then holds none.

**44.4 The table of events.** Every event is frozen and carries no clock
reading, no random value, and no revision number; the same operations and the
same Player answers give the same events.

| `type`     | Carries                                                 | When                                                              |
| ---------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| `document` | `change`: the `BusChange` of D38.8                      | synchronously, after every committed change of the bus            |
| `history`  | `history`: `{ canUndo, canRedo, undoDepth, redoDepth }` | right after its `document` event, only when one value changed     |
| `playback` | `state`: the Player's state (25.7)                      | after every change of the Player's `status`, `timeUs`, or `error` |
| `error`    | `error`: the `PlayerError` of a failed update or load   | when the preview could not show a document of the bus             |

The playback time is the Player's (D20.2); the session reads it, never a clock.
A listener's error goes to `onListenerError(error, event)` and does not stop the
other listeners, as in D38.8. A later feature that reports to the host adds a
row here.

**44.5 `Player.update(document, resolveAsset)` (amends D25).** It shows
`document` in place of the loaded one, in the same render page, at the time
shown now:

- The time shown is mapped onto the new frame grid (`timeUsToFrame`, then
  `frameToTimeUs`, D13) after being clamped to the new document's last instant;
  a document that became shorter shows its last frame.
- It is one request, `kadrion-player:update` (25.4): the page loads the document
  and renders the frame at that time in the same chain of promises, with no
  task in between, so the browser never paints the new tree before its first
  frame. It still mounts the tree again (D22.4): it is not an incremental
  update. What it avoids is a new page, a seek to 0, and a second request.
- Fonts are cleared and registered again before the mount, as in every load
  (D27.1), and images and Custom HTML elements of the new tree may paint before
  the frame is ready; `ready` keeps the meaning of 25.7 and does not mean
  "presented".
- Assets: the Player keeps the bytes it verified for the document shown, by
  content hash, and asks `resolveAsset` only for the assets whose hash it does
  not hold; it keeps only those of the new document afterwards. Bytes it holds
  are the copies it verified, so they are not verified again.
- It needs a loaded document (`not-loaded`), validates the document as `load`
  does (`invalid-document`, nothing sent), waits for a seek in flight, and
  supersedes a seek that waits. Updates run one after another. A seek
  requested meanwhile waits for the update and is rejected with
  `time-out-of-range` if the new document no longer contains its time. It
  plays on if it was playing.
- A failed update leaves no document loaded: the status is `error`, `timeUs` is
  `null`, and the page holds no document to seek in; the next document needs
  `load`. While an update runs, the status is `loading` and `timeUs` keeps the
  frame shown.

**44.6 `Player.subscribe(listener)` (amends D25).** It calls the listener with
the new state after every change of `status`, `timeUs`, or `error`, once per
change, until the returned function is called. It needs the new option
`onListenerError` of `createPlayer` (`invalid-options` otherwise); a
listener's error goes there, and the handler must not throw (as D38.8).

**44.7 History depths (amends D38.8).** A `BusChange` also carries `undoDepth`
and `redoDepth`: how many operations undo and redo reach after the change,
within `historyLimit`.

## Alternatives considered

- **The host keeps joining bus and Player itself** — every host repeats the
  wiring and its mistakes (a seek to 0 per edit, every asset hashed again), and
  there is no shared table of events for the later features.
- **An incremental update that patches the mounted tree** — `renderState`
  writes only the animated properties; static properties come from the mount
  (D22.4). Patching them would need a diff of documents in the runtime build,
  which changes the build and reopens Q14. The remount in one request costs
  less and keeps the build byte for byte.
- **Update as `load` followed by `seek`** — two requests, and the browser may
  paint the mounted tree before the seek renders it.
- **The session creates the Player** — it would repeat every Player option; the
  host creates the Player it wants and hands it over.
- **The session dispatches commands itself** — a second path into the document
  beside the bus; the bus already is the one path.
- **Moving the playground onto the session in this change** — the pinned editor
  test imports the playground's code, so the move changes a pinned test file
  and reopens Q14. It moves with PR-25a, which reopens Q14 in any case.

## Consequences

- The runtime build does not change (its content hash stays
  `sha256:213ddb1975d9d0926765f206e3dd9d2216824ee5e85b354074f06b6ce9b9017c`),
  and no pinned test file changes: Q14 stays closed. The Player's dist tree
  changes, so the parity record is measured again in the pinned environment
  (D33.10).
- The protocol gains one message and stays version 1: the Player and its page
  agent are one build (25.10).
- A host that only previews needs nothing new; `load`, `seek`, `play`, and
  `pause` are unchanged.
- The playground still joins bus and Player itself until PR-25a.

## Verification

- `packages/player/test/player.test.ts`: an update gives the same tree and Custom
  HTML time as a fresh load and seek; one request, same page, no asset asked
  again; the time on a new frame grid and on a shorter document; asset cache
  hits, misses, and eviction; a hash mismatch leaves nothing loaded; ordering
  with seeks and other updates; playing on; the page ignores a malformed
  update; `subscribe` and its error handler.
- `packages/editor-sdk/test/events.test.ts`: the depths of a change, within the
  history limit.
- `packages/editor-session/test/session.test.ts`: the load, the updates and
  their coalescing, failures, the table of events, listener errors, destroy.
- `tests/repo/package-boundaries.test.ts` and `workspace-structure.test.ts`:
  the package and its edges.
- Not mechanically verified in a browser yet: that the browser paints nothing
  between mount and frame. The pinned Player test of an update comes with
  PR-25a, together with the playground on the session.

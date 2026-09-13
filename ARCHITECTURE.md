# Architecture

## Data flow

```
pointerdown/move/up on <canvas>
        |
        v
canvas.js draws locally immediately (optimistic — no waiting on the server)
        |
        v
websocket.js batches points (~25fps) and sends stroke-start / stroke-point / stroke-end
        |
        v
server.js looks up the sender's room, updates drawing-state.js,
then re-broadcasts the same message to every OTHER client in that room
        |
        v
Other clients' main.js calls canvas.beginStroke/extendStroke/endStroke
with the same coordinates → identical stroke appears on their screen
```

The sender never waits for a round trip before drawing — that's the "client-
side prediction" the spec asks about. Because strokes are append-only and
never rewritten by the server (only marked visible/hidden via undo/redo),
there's nothing to reconcile: what the local user drew is never wrong.

## WebSocket protocol

All messages are JSON with a `type` field, one message per line of the
wire (no envelope/framing needed — WebSocket already gives you message
boundaries for free).

**Client → Server**

| type           | payload                                      |
|----------------|-----------------------------------------------|
| `join`         | `{ room, name }`                              |
| `stroke-start` | `{ id, tool, color, width, x, y }`            |
| `stroke-point` | `{ id, points: [{x,y}, ...] }` (batched)      |
| `stroke-end`   | `{ id }`                                      |
| `cursor`       | `{ x, y }`                                    |
| `undo`         | `{}`                                          |
| `redo`         | `{}`                                          |

**Server → Client**

| type           | payload                                             |
|----------------|------------------------------------------------------|
| `init`         | `{ userId, you, users[], strokes[] }` — sent once, right after join |
| `user-joined`  | `{ user }`                                            |
| `user-left`    | `{ userId }`                                          |
| `stroke-start` | `{ userId, id, tool, color, width, x, y }`            |
| `stroke-point` | `{ id, points[] }`                                    |
| `stroke-end`   | `{ id }`                                               |
| `cursor`       | `{ userId, x, y }`                                     |
| `undo`         | `{ id }` — the stroke id that just became hidden       |
| `redo`         | `{ id }` — the stroke id that just became visible      |

`stroke-start`/`point`/`end` are broadcast to everyone *except* the sender
(they already drew it locally). `undo`/`redo` are broadcast to *everyone
including* the sender, so the person who pressed undo doesn't have to
special-case their own UI — they just wait for the same message as
everybody else.

## Undo/redo strategy

This is the part the spec flags as the hard one, so here's the actual
reasoning, including the alternative I considered and rejected.

**What I did not do:** operational transforms or CRDTs. They solve a more
general problem (arbitrary concurrent edits to shared structured data) than
what a drawing canvas needs, and they're hard to get right in a time-boxed
project — the risk of a subtle bug outweighs the benefit here.

**What I did instead — a global command stack:**

- Every completed stroke gets pushed onto a per-room `undoStack` in
  completion order, and is *never deleted or reordered* — only marked
  `visible: true/false`.
- `undo` pops the most recent id off `undoStack`, sets `visible = false`,
  and pushes it onto `redoStack`.
- `redo` does the reverse.
- Starting a *new* stroke clears `redoStack` — the standard "you can't redo
  after you've done something new" rule, same as a text editor.
- A **separate** `order` array (creation order, never mutated) is what
  every client replays to redraw the canvas. Because layering only depends
  on `order`, and `order` never changes, undo/redo can never corrupt how
  strokes stack on top of each other — hiding stroke #3 out of 10 still
  leaves 1,2,4-10 drawn in the exact same relative order.

**Why global, not per-user:** the spec explicitly frames this as *global*
undo/redo ("works globally across all users"), which means Alice's Ctrl+Z
can undo Bob's stroke, not just her own. I considered per-user undo stacks
(each user can only undo their own strokes) as an alternative — it's
arguably more intuitive for end users, but it's a different feature from
what was asked, and it doesn't actually remove complexity: you'd still need
a rule for what happens when Alice undoes stroke #5 but Bob already drew
stroke #7 on top of it. I went with the literal spec requirement and
documented the trade-off rather than silently changing scope.

## Conflict resolution (simultaneous drawing)

There isn't really a "conflict" to resolve in the traditional sense,
because strokes don't share mutable state — each stroke is its own object
with its own id, owned by whoever started it. Two users drawing over the
same pixels at the same time isn't a data race, it's just two independent
strokes that happen to overlap visually. The only thing that determines
which one is "on top" is which `stroke-end` the server processed first,
which becomes that stroke's position in the `order` array. This falls out
of the data model for free — no special-case merge logic needed.

The one place a real ordering decision happens is undo: since `undoStack`
is a single global stack (not per-user), "undo" always means "undo the
single most recent completed stroke, whoever drew it." No merge conflicts
are possible because there's only one stack, so there's only one possible
next action.

## Performance decisions

- **Point batching (~25fps, `websocket.js`):** `pointermove` can fire at
  120Hz+ on some devices/browsers. Sending a WebSocket message per event
  would flood the socket for no visual benefit — the eye can't tell 120fps
  network updates from 25fps ones for a hand-drawn line. Batching cut
  message volume by roughly an order of magnitude in manual testing without
  any visible lag.
- **Full-canvas redraw on undo/redo, not incremental patching:** hiding a
  stroke can expose whatever was drawn *underneath* it, so a partial
  "erase just this stroke's pixels" approach would leave visual artifacts
  wherever strokes overlap. A full clear + replay of the `order` array is
  the only approach that's guaranteed correct, and for a canvas with
  hundreds to low thousands of strokes it's fast enough (sub-frame) that
  the correctness/simplicity trade-off clearly wins over a more clever
  incremental scheme.
- **Segments drawn as short line pieces, not smoothed/curve-fit:** keeps
  the renderer simple and the stroke data trivially replayable point-for-
  point on every client. A quadratic-curve smoothing pass would look nicer
  at very low sample rates but adds a second code path (raw points vs.
  fitted curve) that has to stay in sync between live drawing and replay —
  not worth the complexity for the time box.
- **In-memory state, no database:** the spec calls persistence a bonus, not
  a requirement, and every millisecond spent on a persistence layer was a
  millisecond not spent on the real-time sync path, which *is* a
  requirement and is graded at 30%.

## What I'd do with more time

- Per-stroke persistence (Redis or Postgres) so a server restart / redeploy
  doesn't wipe every room.
- Exponential backoff + jitter on reconnect instead of a fixed 1s retry.
- A "you are about to undo someone else's stroke" confirmation, since
  global undo is powerful but can surprise people.
- Basic room passwords/auth, since currently anyone with the URL can join
  and draw.

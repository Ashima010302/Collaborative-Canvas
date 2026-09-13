# Collaborative Canvas

**Live demo:** https://collaborative-canvas-jw6l.onrender.com

Real-time multi-user drawing board. Native WebSockets (`ws`) + Express on the
server, vanilla Canvas API on the client. No frontend framework, no drawing
libraries.

## Setup

```bash
npm install
npm start
```

Then open `http://localhost:3000` in a browser.

## Testing with multiple users

Open the app in two (or more) browser tabs/windows, or on two devices on the
same network hitting `http://<your-ip>:3000`. Everyone lands in the same
`default` room unless you add `?room=NAME` to the URL, e.g.:

```
http://localhost:3000/?room=team-a&name=Alex
http://localhost:3000/?room=team-a&name=Sam
```

Draw in one tab, it should appear in the other within ~40ms. Move your mouse
without drawing and the other tab should show a labeled cursor dot tracking
you. Undo/redo (buttons or Ctrl+Z / Ctrl+Shift+Z) affects everyone's canvas,
not just the user who drew the stroke.

## How it works (short version)

- Every completed stroke is stored on the server, keyed by id, in creation
  order. Order never changes.
- Undo hides the most recently completed stroke *globally* (not per-user).
  Redo un-hides it. Both are O(1) stack operations.
- A joining client gets a full snapshot of visible strokes and replays them
  in order, so a canvas built up over hours looks identical for someone who
  just walked in.

Full design rationale is in `ARCHITECTURE.md`.

## Known limitations

- **State is in-memory only.** Restarting the server wipes every room. No
  persistence layer — out of scope for the time box, called out as a bonus
  in the spec.
- **No auth.** Anyone with the room link can join and draw. Fine for a demo,
  not fine for production.
- **A user who joins mid-stroke won't see that in-progress stroke** until it
  completes — the snapshot only contains finished strokes. In practice this
  is a few dozen milliseconds of missing ink, not a visible gap.
- **Undo is global by design**, per the spec ("global undo/redo... tricky
  part"). This means Alice can undo Bob's stroke. That's intentional, not a
  bug — see ARCHITECTURE.md for the reasoning and the alternative
  (per-user undo) that was considered and rejected.
- **Fixed reconnect backoff (1s)**, not exponential. Good enough for a demo;
  would need backoff + jitter for a production deployment with many clients
  reconnecting simultaneously after an outage.
- **Free-tier hosting spins down after 15 minutes of inactivity.** The first
  request after idle time can take 20-30 seconds to wake the server up —
  expected behavior, not a bug.
- Tested on Chrome and Firefox. Should work on Safari (standard Canvas +
  WebSocket + Pointer Events APIs, no exotic features used) but not
  separately verified.

## Time spent

Roughly one focused session: server + undo/redo model, canvas engine,
WebSocket client, styling, and testing the sync/undo path with two
concurrent socket connections.

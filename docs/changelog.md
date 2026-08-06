# Changelog

All notable changes to Boboduko are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com); versions follow semver.

## [1.0.0] — 2026-08-06

Initial release: a browser-based, mobile-first sudoku game with no-login
multiplayer races, five difficulties, and a pastel kawaii presentation.

### Added — Sudoku engine (`public/js/sudoku.js`)

- **Generator/solver as one shared ES module**, imported by both the browser
  client and the Node server. *Why:* race fairness requires the server to
  generate one authoritative puzzle for both players, while solo play should
  generate instantly on-device — sharing the module gives both with zero
  duplicated logic.
- **Bitmask backtracking solver** with minimum-remaining-values cell selection,
  used as a solution *counter* with a cutoff of 2. *Why:* generation must prove
  uniqueness after every removed clue; stopping at the second solution makes
  that check cheap (full generation runs in ≤15 ms even for Expert).
- **Two-pass hole digging**: pass 1 removes 180°-rotationally-symmetric pairs
  (the classic newspaper aesthetic); pass 2 falls back to single-cell removal.
  *Why:* symmetric digging bottoms out around 26–28 clues, so Expert (23) was
  unreachable until the second pass sacrifices symmetry — mirroring how real
  expert puzzles are made.
- **Five difficulties** by target clue count: Easy 43 🌱, Medium 36 🌼,
  Hard 30 🌶️, Super Hard 26 🔥, Expert 23 👑 (`DIFFICULTIES` map with labels
  and emoji used across the UI).
- `boardMatches()` helper for verifying a full board claim against a solution.

### Added — Server (`server.js`)

- **Single Node process** (plain `node:http` + `ws`, the only runtime
  dependency) that serves the static client *and* referees multiplayer rooms.
  *Why:* no build step, no framework, trivially deployable behind any
  HTTPS/`wss` proxy.
- **Room lifecycle**: 4-letter codes (alphabet excludes I/O — they read like
  1/0), create → join → server-generated round for both players → verified
  finish → rematch handshake (both players must opt in) → cleanup.
- **Server-side finish verification**: a client claiming completion sends its
  board; the server checks it against its own solution copy before declaring a
  winner. *Why:* clients hold the solution for instant per-cell feedback, so
  the win itself must be adjudicated by the referee, not the claimant.
- **Progress relay** (clamped 0–1) so each player sees the opponent's live
  completion bar; disconnect notification hands the remaining player a
  win-by-default; heartbeat ping (30 s) reaps dead sockets; sweeper deletes
  rooms abandoned > 2 h.
- Static file serving with path-traversal guard and an explicit MIME map.

### Added — Client (`public/index.html`, `public/js/app.js`)

- **Single-page screen flow**: home → difficulty picker (shared by solo and
  race-create) → lobby (code + copy-invite-link) → game → result overlay, all
  as toggled sections in one HTML file — no router, no framework.
- **Full solving toolkit**: pencil notes (3×3 mini-grid per cell), undo stack,
  erase, hints ("Bobo helps"), mistake counter, timer, remaining-count numpad,
  row/column/box peer highlighting, same-number highlighting, and auto-removal
  of a placed digit from peer notes.
- **Digit spotlight (number-first survey mode)**: tapping a numpad digit when
  there is no editable target — nothing selected, a given or already-correct
  cell selected, or the digit fully placed — spotlights every placed copy of
  that digit and tints cells holding it as a pencil note (matching note turns
  pink). Tap another digit to switch, the same digit again, any cell, or
  Escape to exit; the active numpad button glows. Completed digits stay
  tappable (previously dead buttons) purely for surveying. *Why:* requested
  after first playtest — "click an existing number, then a number below, and
  toggle through to see where they all are." Routing through the existing
  "no editable target" branch means the feature can never steal a tap that
  was meant as a placement.
- **Multiplayer race client**: WebSocket protocol handler, 3-2-1-Go countdown,
  live dual progress bars with emoji runners, rematch flow, opponent-left
  handling, and `?room=CODE` invite links that auto-join on load.
- **No-login identities**: auto-generated cute names ("Sparkly Mochi" 🐰) from
  an adjective × animal list, persisted in `localStorage`. *Why:* multiplayer
  was required to work with zero accounts.
- **Keyboard support** on desktop: digits place, 0/Backspace/Delete erase,
  arrows move selection, N toggles notes, U/Z undoes, Escape clears
  selection/spotlight.
- **Cute layer**: Bobo the dumpling mascot as a single inline SVG template
  reused everywhere (home, header mini, lobby, result card) — blinks on a CSS
  timer, bounces on correct placements, wobbles on mistakes, celebrates wins,
  and is pattable on the home screen; canvas heart-confetti on wins (guarded
  no-op where canvas is unavailable); tiny WebAudio chime kit (pop/good/bad/
  win) that stays silent where audio is blocked.

### Added — Styling (`public/css/style.css`)

- **Pastel kawaii theme**: pink/mint/lavender palette on layered radial-
  gradient background, Baloo 2 rounded type, "squishy" buttons whose 3D edge
  (box-shadow) compresses on press.
- **Mobile-first, playable on all screens**: board sized via
  `min(100vw − 20 px, 100dvh − 300 px, 480 px)` so board + controls + numpad
  always fit one viewport; thumb-sized touch targets; safe-area insets;
  `user-scalable=no` + fixed body to stop double-tap zoom; compact-height and
  desktop breakpoints.
- Feedback animations: cell pop on entry, shake + teardrop on mistakes, golden
  glow on hints, sparkle sweep when a row/column/box completes, bouncy screen
  transitions, countdown pop, toast notifications.

### Added — Tests (`test/`)

- `sudoku.test.js` — generator hits clue targets for all five difficulties,
  solutions are valid, puzzle is a subset of its solution.
- `race.test.js` — end-to-end protocol over real WebSockets: create, bad-code
  rejection, identical puzzles for both players, progress relay, wrong-finish
  rejection, winner/loser adjudication, rematch, disconnect notification.
- `client.test.js` — the real `index.html` + `app.js` loaded in jsdom and
  driven by synthetic events: boot, solo game, wrong entry, undo, notes, digit
  spotlight (lights exactly the placed copies; exits on cell tap), hint-solve
  to the win overlay, then a live race (lobby code → countdown → opponent
  progress → server-verified win) against a real server. *Why jsdom:* the
  framework-free ES-module client runs unmodified in Node, so full UI testing
  needs no browser download.
- `test/all.js` runner (`npm test`) boots a throwaway server on port 3999 and
  runs all three suites — 27 checks total.

### Fixed (caught during 1.0.0 development)

- **Hint on the last cell didn't end the game**: `hint()` never called
  `checkCompletion()`, so a puzzle finished via hint showed no win screen
  (found by the jsdom suite's hint-solve test). Fix: completion check added to
  the hint path in `public/js/app.js`.
- **Expert generation stalled at 26–27 clues**: single symmetric dig pass ran
  out of removable pairs; fixed with the asymmetric second pass in
  `public/js/sudoku.js`.
- **Confetti crash where canvas is missing**: `burstConfetti()` now no-ops
  when `getContext('2d')` is unavailable (ancient browsers, jsdom).
- **`leaveRoom` state juggling** in `server.js` simplified to a single rule:
  a departure mid-round marks the room done and the remaining player wins by
  default.

### Notes

- Versions: Node 23 runtime; deps are `ws` ^8 (runtime) and `jsdom` ^27 (dev).
- Known trade-off: clients receive the solution for instant feedback, so a
  determined cheater could read it via devtools — accepted for a casual,
  no-stakes friend game; the server still verifies any winning board.

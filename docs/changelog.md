# Changelog

All notable changes to Boboduko are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com); versions follow semver.

## [1.5.0] — 2026-08-07

"They ran away!" came back, so this time the platform was measured instead of
reasoned about. A two-player probe run against production, three times over
the 300 s socket cut, found the real culprit — and it is the exact thing 1.4.0
listed under *Notes* as a theoretical limit and dismissed:

```
[301.0s] HUSBAND  opponent_dropped (grace 90s)
[314.6s] HUSBAND  socket CLOSED 1006      ← the platform cut, both at once
[314.6s] WIFE     socket CLOSED 1006
[315.6s] WIFE     resumed        ← landed on the instance holding the room
[315.7s] HUSBAND  resume_failed  ← landed on a different one
[392.8s] WIFE     opponent_left  ← "They ran away!" about someone still playing
```

Rooms live in one function instance's memory. 1.4.0 assumed that at
friends-and-family traffic there is only ever one warm instance, so a reconnect
lands home. That is true right up to the moment it matters: **the cut is itself
what creates the churn**, both players reconnect within a second of each other,
and they get load-balanced apart. Across three runs the room survived once,
lost one player once, and lost both once. A 20-minute race takes about four
cuts, so a long game was near-certain to break.

The fix stops treating an absent room as proof of anything. Both players
already hold the entire round — code, board, solution, and their own seat
token — so if the server has forgotten it, the first one back rebuilds it and
the second slots into the empty chair.

### Fixed — A forgotten room is rebuilt, not a forfeit (`server.js`, `public/js/app.js`)

- **`resume` now carries a snapshot** (difficulty, puzzle, solution, progress).
  Reaching an instance that has never heard of the room rebuilds it there;
  a returning player whose seat went down with the old instance takes the free
  chair on proof of the round. Validated, not trusted: a snapshot must be a
  genuinely solved grid whose puzzle is that grid with holes punched in it —
  otherwise a bad one could stand up a room whose "solution" rejects the other
  player's correct board.
- **`resume_failed` is retried** (up to four times on fresh sockets) before it
  is believed. Every reconnect is routed independently, so the next socket may
  well reach the instance still holding the seat.
- **Reconnect backoff is jittered.** Both clients are cut in the same instant,
  and reconnecting in lockstep is what got them split across instances.

### Fixed — Solving the board during a blackout no longer loses the race

- The server sees a socket die ~14 s before the browser does (measured). A
  `finish` sent in that window went to `net.send` on a dead socket and was
  **silently dropped** — the overlay only ever arrives as the server's
  `race_over`, so the board was completed and *nothing happened*, while the
  opponent went on to win a race that was already over. Messages that decide
  the game (`finish`, `progress`, `rematch`) are now queued and re-sent on
  resume.

### Fixed — The waits are sized by what is at stake

- **Mid-round grace is 15 min** (`BOBODUKO_PLAY_GRACE_MS`); lobbies and
  finished rooms still recycle at 90 s (`BOBODUKO_GRACE_MS`). The player still
  at the board loses nothing while we wait — they keep solving and can still
  win — whereas evicting early ends their race with a lie.
- **The client's retry budget comes from the server** (`graceSeconds` on
  `created`/`start`/`resumed`) instead of a flat 8 attempts. It was ~45 s
  against a 90 s grace, so a blip just longer than the retries abandoned a seat
  that was still being held.
- **A new `online` listener** and a wake-up path that always makes one honest
  attempt: a frozen tab runs no timers, so the deadline can lapse without a
  single try having been made. The server, not a stopwatch, decides the seat is
  gone.
- **A failed reconnect no longer confiscates the puzzle.** The board, timer and
  solution are all local, so the race is dropped and the player finishes solo
  instead of being shown a dead end.
- **Rematch tells the truth** when the invite lands on a dead socket.

### Changed — `vercel.json`

- `maxDuration: 800` (Pro ceiling) instead of the 300 s default: roughly one
  cut per 13-minute race instead of four.

### Added — Tests

- `race.test.js`: a mid-round seat outlives the idle grace; only the mid-round
  grace lapsing is a real leave; a room deleted entirely is rebuilt by the
  first player back, re-seats the second, and still referees the finish; a
  snapshot that is not a real solved grid cannot rebuild anything.
- `client.test.js`: wraps `WebSocket` to keep a handle on the app's own socket,
  kills it mid-round, solves the board during the blackout, and asserts the win
  still lands after the reconnect. Verified to fail without the fix.

### Notes

- This does not make the game correct on serverless, it makes it resilient.
  Two players can still end up on different instances and race in parallel
  universes until the grace lapses; the rebuild just means nobody is ejected
  and no board is taken away. The real fix is a single long-lived process
  (`server.js` already is one — Fly.io/Railway/Render need no code change) or
  shared state plus pub/sub, since the sockets themselves live on different
  machines.

## [1.4.0] — 2026-08-06

Mid-race "They ran away!" kicks, diagnosed and fixed. On Vercel the game
runs as a serverless function, and the platform **cuts every WebSocket when
the function hits its `maxDuration` (300 s on Hobby — not raisable)**; an
empirical probe against production showed the opponent being kicked at
exactly 300.0 s of socket life (close code 1006). The old code treated any
socket death as "player left" and ended the game instantly. Now a dead
socket is a hiccup: the server holds the seat during a grace period and the
client silently reconnects and resumes — the same race, the same board.

### Fixed — A dropped socket is no longer a forfeit (`server.js`, `public/js/app.js`)

- **Players now have identity beyond their socket**: each seat carries a
  `playerId` token (sent in `created`/`start`). *Why:* the server previously
  identified players only by the live `ws` object, so even an instant
  reconnect could not rejoin a game.
- **Server grace period** (`BOBODUKO_GRACE_MS`, default 90 s): on socket
  close the seat is kept and the opponent gets a soft `opponent_dropped`
  (name pulses in the race HUD 📶) instead of the game-ending
  `opponent_left`, which now fires only after the grace lapses or on an
  explicit leave. A `resume { code, playerId }` message reattaches a fresh
  socket to the seat and returns a full state snapshot (state, puzzle,
  opponent presence + progress, verdict if the race ended while away);
  the opponent gets `opponent_back`.
- **Client auto-reconnect** with exponential backoff (≈45 s of attempts vs
  the 90 s grace), per Vercel's own guidance for WebSocket clients. The
  board is already all-local, so resuming only re-syncs the progress bars.
  A lobby host who loses their socket reclaims the room the same way; if the
  race started while they were away they are dropped straight into it.
- **Wake-up liveness check**: on `visibilitychange` → visible the client
  pings (new `ping`/`pong` messages) and force-recycles a zombie socket.
  *Why:* phones freeze sockets on lock/background; the socket can look OPEN
  yet be long dead on the server — this reclaims the seat within grace.
- Progress pcts are remembered server-side per player so a resume can
  restore the opponent's bar without waiting for their next move.

### Added — Tests

- `race.test.js`: ping/pong; mid-round socket death → `opponent_dropped`
  with `graceSeconds`; resume reattaches the seat, returns the round, and
  progress relays over the new socket; bogus `playerId` → `resume_failed`;
  an expired grace converts the drop into a real `opponent_left`; a lobby
  host survives a socket cut and reclaims the room. The runner shrinks the
  grace to 1.5 s (`BOBODUKO_GRACE_MS`) so the expiry test stays fast.

### Notes

- The 300 s ceiling itself is a platform property. On a paid Vercel plan
  `maxDuration` can be raised to 800 s (dashboard or `vercel.json`), which
  makes cuts rarer — but they still happen (redeploys also sever every
  socket), so reconnect-and-resume is the real fix either way.
- Known limit: rooms still live in one function instance's memory. A
  reconnect that lands on a *different* instance gets an honest
  `resume_failed` ("The room is gone") instead of a silent hang. At
  friends-and-family traffic there is effectively one warm instance, so
  resumes land home; true multi-instance safety would need external state
  (e.g. Redis), noted as future work.

## [1.3.0] — 2026-08-06

The Mahjong themes stop borrowing Western numerals: each suit now draws
digits 1–9 as its **real tile face**. Still zero theme logic in JS — the
whole feature is two new CSS-variable families riding the existing
`data-v` hooks, so the picker's mini-boards preview the faces for free.

### Changed — Mahjong digits are now tile faces (`public/css/style.css`)

- **🎋 Bamboo Grove** — digits render as the 索子 stick arrangements
  (2 = two sticks, 9 = a 3×3 lattice…), and 1 is the bird, faithful to real
  tile sets. Sticks are rounded-rect silhouettes in an inline-SVG mask.
- **🀙 Lucky Circles** — digits render as the 筒子 dot arrangements
  (1 = the big ◉, 5 = a quincunx, 7 = three slanted over four…). The 1.2.0
  blue/green/cinnabar `--d1..9` trio now colors the dots themselves.
- **🀄 Ten Thousand** — the hanzi numeral (一…九) *is* the digit now, set in
  a brush-serif stack (`Kaiti SC` → `KaiTi` → `serif`), and the ornament
  hook flips meaning: every tile wears a small cinnabar **萬** at its
  bottom-right (`--h1..9` are all `萬` — the suit marker, not the number).
- **Mechanism, in the 1.1.0 leak-proof style** — two new var families
  consumed by neutral base rules on `.cell[data-v] .val::after`:
  - `--g1..9`: text-glyph faces (hanzi) via `content`;
  - `--m1..9` + `--face-bg: currentColor`: mask-image faces (sticks/dots)
    — *masks, not background images*, so the artwork is painted in
    `currentColor` and the cascade keeps working: givens stay ink, entries
    stay accent, the `--d1..9` cycle tints per digit, and **a wrong entry
    turns its whole face error-red** exactly like a numeral used to.
  - `--numeral-fill: transparent` hides the Arabic digit via
    `-webkit-text-fill-color` rather than removing it — `color` (which
    `text-fill-color` shadows) still flows to the pseudo-element faces, and
    the digit stays in the DOM for screen readers and the jsdom suite.
- **The numpad wears the same faces** (`.num-btn[data-n]::before`), so it
  doubles as the suit's legend — the remaining-count badge stays Arabic and
  visible. Pencil notes stay Arabic numerals too, deliberately: nine
  micro-tiles in one cell would be noise, and notes are the player's own
  annotations, not tiles.
- Reset groups extended for the new families (`--g/--m/--face-*/--orn-*/`
  `--numeral-fill`), same rule as before: each theme appears only in the
  groups whose decorations it does **not** define.
- Registry blurbs updated to describe the faces (`public/js/app.js`); no
  other JS.

### Added — Tests

- `client.test.js`: after the suit-theme leg, the stylesheet itself is
  checked — each suit theme must define all nine face vars (`--m1..9` for
  the drawn suits, `--g1..9` for 萬子) and `--numeral-fill: transparent`,
  guarding against a theme silently falling back to plain numerals.

## [1.2.0] — 2026-08-06

Three new themes, one per Mahjong suit — the suits are numbered 1–9 exactly
like sudoku digits, so each theme borrows its suit's real tile language.
Built entirely on the 1.1.0 theme system (variable-class blocks + `data-v`
digit hooks); no new JS beyond three registry entries.

### Added — Mahjong suit themes (`public/css/style.css`, `public/js/app.js`)

- **🎋 Bamboo Grove (索子)** — ivory tile cells on mahjong-table greens with a
  bamboo-green primary; palette-only (like Coffee Shop), letting the tile look
  carry the theme.
- **🀙 Lucky Circles (筒子)** — porcelain blues; digits cycle blue → green →
  cinnabar through values 1–9 via the existing `--d1..9` variables. *Why a
  trio, not a rainbow:* real circle tiles are painted in exactly those three
  ink colors, and it keeps the look distinct from Candy Pop.
- **🀄 Ten Thousand (萬子)** — rice-paper cream, ink-dark digits, cinnabar-red
  accents. Each digit wears a tiny red hanzi superscript (一二三…九), echoing
  the 萬 tiles. *Legibility rule:* the Arabic digit stays primary; the hanzi
  is a 0.38 em ornament. Error red is shifted pinker (`#ff4d6d`) so mistakes
  never blend into the cinnabar brand color.
- **New CSS hooks, same leak-proof pattern as 1.1.0**: hanzi ornaments render
  from `--h1..--h9` + `--ornament-color` through neutral base rules
  (`.cell[data-v="1"] .val::before { content: var(--h1, '') }`), and all
  three suit themes share a subtle "tile thickness" inset shadow via
  `--tile-edge`. Per-theme `--x: initial` resets are now *grouped* rules
  (one per decoration family) instead of repeated per-block boilerplate —
  each theme appears only in the groups whose decorations it does **not**
  define, so the disjoint property sets can never conflict.
- Picker cards for the suits carry real Unicode mahjong-tile badges
  (🀙 / 🀄) where fonts support them; six cards total, still built
  automatically from the `THEMES` registry.

### Added — Tests

- `client.test.js`: picker now expects 6 cards; a new leg applies each suit
  theme and asserts exactly one `theme-*` body class plus persistence
  (30 checks total).

## [1.1.0] — 2026-08-06

Themes: cosmetic reskins of the whole app, chosen per player and persisted
locally — purely visual, so multiplayer needs no protocol changes.

### Added — Theme system (`public/css/style.css`, `public/js/app.js`, `public/index.html`)

- **Three themes**: 🍡 *Pastel Picnic* (the original look, now the default
  theme), ☕ *Bobo's Coffee Shop*, and 🍬 *Candy Pop*. Picker lives behind a
  new "🎨 Themes" button on the home screen; choice is applied instantly,
  stored in `localStorage` (`boboduko-theme`), and restored on boot. Each
  theme also re-words the home tagline and updates the browser `theme-color`.
- **Architecture: a theme is a CSS class carrying variable overrides**
  (`.theme-coffee`, `.theme-candy`, plus `.theme-pastel` restating the
  `:root` defaults). *Why a class and not just `:root` swaps:* the same class
  works on `<body>` (whole app) and on any container — which is what makes
  the picker's live mini-board previews possible. Groundwork for this was
  variable-izing the previously hardcoded pink shadow tint (`--shadow-rgb`)
  and body background glows (`--glow1..3`).
- **Scoping rule learned the hard way**: per-digit colors/tilts are expressed
  as CSS *variables* (`--d1..--d9`, `--tilt-a..d`) consumed by neutral base
  rules (`.cell[data-v="1"] .val { color: var(--d1, inherit) }`), not as
  `.theme-candy .cell …` descendant selectors. *Why:* descendant selectors
  match preview cards *through* the body's theme class, so a pastel preview
  inside a candy body would have gone rainbow; `var()` resolves at the
  nearest ancestor definition, and `--d1: initial` in a theme block cleanly
  re-neutralizes an inherited value (`initial` = guaranteed-invalid for
  custom properties, triggering the `inherit` fallback).
- **☕ Bobo's Coffee Shop** — built from the two user-supplied logo PNGs
  (root dir → copied to `public/img/coffee-logo.png` and `coffee-cup.png`;
  originals untouched). Palette sampled from the artwork with PIL: cream
  `#eee6cc`, royal blue `#0b38a9` — the app background matches the logo's
  baked-in cream exactly, so the full logo (used as the picker card art)
  sits seamlessly. The transparent cup mascot replaces Bobo's dumpling SVG
  everywhere (home, game header, lobby, result card) via CSS; caramel tones
  take over the secondary accent; the home wordmark restyles lowercase blue
  to echo the logo.
- **🍬 Candy Pop** — the "modifies the numbers" theme: every digit 1–9 gets
  its own candy color (givens and entries alike, on both board and numpad)
  plus a sticker-sheet tilt (±2–4° via `nth-child` patterns). *Legibility
  choices:* digits stay digits (no symbol substitution), the nine hues are
  chosen for mutual contrast on white, wrong entries stay `--error` red via
  a rule ordered after the digit-color hooks, and tilts use the CSS `rotate`
  property so they compose with (not fight) the pop animation's `transform`.
- **Renderer hook**: cells now expose `data-v="<value>"`
  (`renderCell` in `app.js`) so pure CSS can style digits per value — no
  theme logic in JS beyond the body class swap.

### Added — Tests

- `client.test.js` grew a themes leg: picker opens with 3 cards and the
  active one checked, coffee applies + persists + re-words the tagline,
  switching leaves exactly one `theme-*` class on `<body>`, and board cells'
  `data-v` matches their value (29 checks total across the suites).

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

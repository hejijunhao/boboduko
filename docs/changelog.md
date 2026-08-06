# Changelog

All notable changes to Boboduko are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com); versions follow semver.

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

# Boboduko 🍡

A cute, browser-based, mobile-first sudoku game — with **no-login multiplayer races**.

## Quick start

```bash
npm install
npm start          # 🍡 steaming at http://localhost:3456
```

Open it on your phone too — everything is touch-sized and the board scales to any screen.

## Features

- **5 difficulties** — Easy 🌱, Medium 🌼, Hard 🌶️, Super Hard 🔥, Expert 👑 — every puzzle
  generated on the fly with a guaranteed unique solution.
- **Race a friend** — create a room, share the 4-letter code (or invite link), and race on the
  identical puzzle. Live progress bars, 3-2-1 countdown, server-verified finish, rematches.
  No accounts — you're auto-named something like *Sparkly Mochi* 🐰.
- **Comfy solving** — pencil notes, undo, erase, hints from Bobo, mistake counter, timer,
  peer/same-number highlighting, remaining-count numpad, full keyboard support on desktop.
- **Digit spotlight** — tap a numpad digit while a filled cell is selected (or nothing is)
  to light up every placed copy of that digit, plus its pencil notes; flip through 1–9 to
  survey the board, tap again or tap any cell to exit.
- **Cute engineering** — Bobo the dumpling mascot blinks, bounces, and reacts to your moves;
  confetti (with hearts) on wins; soft pastel everything.
- **Themes** — 🎨 dress up the board: 🍡 Pastel Picnic (default), ☕ Bobo's Coffee Shop
  (cream + royal blue, starring the shop's real cup mascot), and 🍬 Candy Pop (every digit
  its own candy color, sticker-tilted but still perfectly legible). Per-player, saved locally.

## Playing with friends on other devices

The server is a single Node process. To race across devices, both players need to reach it:

- Same Wi-Fi: share `http://<your-lan-ip>:3456`.
- Internet: put it behind any HTTPS reverse proxy or tunnel (the client auto-upgrades to `wss`).

## Tests

```bash
npm test           # engine + multiplayer protocol + full jsdom UI simulation
```

## Layout

```
server.js            # static file host + WebSocket race referee
public/
  index.html         # all screens (home, difficulty, lobby, game, overlays)
  css/style.css      # pastel kawaii theme + animations
  js/sudoku.js       # generator/solver — shared by client AND server
  js/app.js          # game logic, UI, mascot, sounds, race client
test/                # sudoku engine, race protocol, jsdom client suites
```

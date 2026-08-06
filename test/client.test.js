// Client smoke test: load the real index.html + app.js in jsdom and drive
// the UI by dispatching events — a full solo game, then a live race against
// the real server (which must be running on PORT).
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import WebSocket from 'ws';

const PORT = process.env.PORT || 3456;
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');

const dom = new JSDOM(html, {
  url: `http://localhost:${PORT}/`,
  pretendToBeVisual: true,
});

// app.js is a browser module — hand it the jsdom globals before importing.
const { window } = dom;
for (const key of ['document', 'location', 'localStorage', 'history', 'navigator',
  'innerWidth', 'innerHeight', 'devicePixelRatio', 'requestAnimationFrame']) {
  try {
    Object.defineProperty(global, key, { value: window[key], configurable: true, writable: true });
  } catch { /* keep Node's own if it refuses */ }
}
global.window = window;
global.innerWidth = 400;
global.innerHeight = 800;
global.devicePixelRatio = 1;

const fail = (msg) => { console.error(`❌ ${msg}`); process.exit(1); };
const ok = (msg) => console.log(`✅ ${msg}`);
const $ = (sel) => window.document.querySelector(sel);
const $$ = (sel) => [...window.document.querySelectorAll(sel)];
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const tap = (el) => el.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
const active = () => window.document.querySelector('.screen.active')?.id;
const until = (cond, what, timeout = 8000) => new Promise((resolve, reject) => {
  const t0 = Date.now();
  (function poll() {
    if (cond()) return resolve();
    if (Date.now() - t0 > timeout) return reject(new Error(`timed out: ${what}`));
    setTimeout(poll, 50);
  })();
});

await import('../public/js/app.js');
ok('app.js booted in jsdom without throwing');

if ($$('#difficulty-list .diff-btn').length !== 5) fail('expected 5 difficulty buttons');
if ($$('#numpad .num-btn').length !== 9) fail('expected 9 numpad buttons');
if (!$('#mascot svg')) fail('mascot SVG not injected');
ok('difficulty list, numpad, and mascot all rendered');

/* ───────── solo game ───────── */

click($('[data-action="solo"]'));
if (active() !== 'screen-difficulty') fail(`expected difficulty screen, got ${active()}`);
click($$('#difficulty-list .diff-btn')[0]); // easy
if (active() !== 'screen-game') fail(`expected game screen, got ${active()}`);
const cells = $$('#board .cell');
if (cells.length !== 81) fail(`expected 81 cells, got ${cells.length}`);
const givens = $$('#board .cell.given').length;
if (givens < 40 || givens > 46) fail(`easy givens out of range: ${givens}`);
ok(`solo game started (${givens} givens)`);

// pick an empty cell, try a wrong number, undo, then notes
const emptyIdx = cells.findIndex((c) => !c.classList.contains('given'));
tap(cells[emptyIdx]);
if (!cells[emptyIdx].classList.contains('selected')) fail('cell did not select');

// find a wrong digit for this cell by trying numpad buttons until error shows
let wrongPlaced = false;
for (let n = 1; n <= 9 && !wrongPlaced; n++) {
  tap($$('#numpad .num-btn')[n - 1]);
  if (cells[emptyIdx].classList.contains('error')) wrongPlaced = true;
  else click($('[data-action="undo"]')); // was correct — take it back
}
if (!wrongPlaced) fail('could not place a wrong number');
if ($('#stat-mistakes').textContent === '0') fail('mistake counter did not increment');
ok('wrong entry marked + mistake counted');

click($('[data-action="undo"]'));
if (cells[emptyIdx].textContent !== '') fail('undo did not clear the cell');
ok('undo works');

click($('#ctrl-notes'));
tap($$('#numpad .num-btn')[4]); // note "5"
if (!cells[emptyIdx].querySelector('.notes')) fail('note not rendered');
click($('#ctrl-notes'));
ok('pencil notes work');

// digit spotlight: tap a filled cell, then a numpad digit → survey mode
const givenCell = cells.find((c) => c.classList.contains('given'));
const digit = +givenCell.querySelector('.val').textContent;
tap(givenCell);
tap($$('#numpad .num-btn')[digit - 1]);
const placedCount = cells.filter((c) => c.querySelector('.val')?.textContent === String(digit)).length;
const litCount = $$('#board .cell.same').length;
if (litCount !== placedCount) fail(`spotlight lit ${litCount} cells, expected ${placedCount}`);
if (!$$('#numpad .num-btn')[digit - 1].classList.contains('hl')) fail('numpad button not glowing');
if ($$('#board .cell.selected').length !== 0) fail('survey mode should clear cell selection');
ok(`digit spotlight lights all ${placedCount} placed ${digit}s`);

tap($$('#numpad .num-btn')[digit - 1]); // same digit again → off
if ($$('#board .cell.same').length !== 0) fail('spotlight did not toggle off');
tap($$('#numpad .num-btn')[digit - 1]); // back on, then tap a cell → exits
tap(cells[emptyIdx]);
if ($$('#numpad .num-btn.hl').length !== 0) fail('tapping a cell should exit survey mode');
if (!cells[emptyIdx].classList.contains('selected')) fail('cell tap should still select');
ok('spotlight toggles off and exits when a cell is tapped');

// solve the whole board with hints → win overlay
const hintBtn = $('[data-action="hint"]');
for (let i = 0; i < 82 && $('#result-overlay').classList.contains('hidden'); i++) click(hintBtn);
if ($('#result-overlay').classList.contains('hidden')) fail('board solved but no result overlay');
if (!$('#result-title').textContent.includes('did it')) fail(`unexpected result title: ${$('#result-title').textContent}`);
ok('completing the board shows the win overlay');

// back home
click($$('#result-buttons .btn')[1]);
if (active() !== 'screen-home') fail('home button did not go home');
ok('back home after win');

/* ───────── themes ───────── */

click($('[data-action="themes"]'));
if (active() !== 'screen-themes') fail('themes button did not open themes screen');
const cards = $$('#theme-list .theme-card');
if (cards.length !== 6) fail(`expected 6 theme cards, got ${cards.length}`);
if (!cards.find((c) => c.dataset.theme === 'pastel').classList.contains('on')) fail('default theme not marked as active');
if (!$('.theme-card.theme-coffee .theme-logo')) fail('coffee card missing logo art');

click(cards.find((c) => c.dataset.theme === 'coffee'));
if (!window.document.body.classList.contains('theme-coffee')) fail('coffee theme not applied to body');
if (window.localStorage.getItem('boboduko-theme') !== 'coffee') fail('theme choice not persisted');
if (!$('#tagline').textContent.includes('coffee')) fail('tagline not re-worded by theme');

click(cards.find((c) => c.dataset.theme === 'candy'));
const themeClasses = [...window.document.body.classList].filter((c) => c.startsWith('theme-'));
if (themeClasses.join() !== 'theme-candy') fail(`body should carry exactly theme-candy, got: ${themeClasses}`);
if (!cards.find((c) => c.dataset.theme === 'candy').classList.contains('on')) fail('check mark did not move');
ok('theme picker applies, persists, re-words the tagline, and swaps cleanly');

// the mahjong suit themes apply like any other, with mini-board previews
for (const suit of ['bamboo', 'circles', 'chars']) {
  const card = cards.find((c) => c.dataset.theme === suit);
  if (!card) fail(`missing theme card: ${suit}`);
  if (!card.querySelector('.mini-board')) fail(`${suit} card missing mini-board preview`);
  click(card);
  const cls = [...window.document.body.classList].filter((c) => c.startsWith('theme-'));
  if (cls.join() !== `theme-${suit}`) fail(`body should carry exactly theme-${suit}, got: ${cls}`);
  if (window.localStorage.getItem('boboduko-theme') !== suit) fail(`${suit} not persisted`);
}
ok('all three mahjong suit themes apply and persist');

// each suit theme must draw all nine digits as tile faces from CSS vars
// (mask artwork for the stick/dot suits, hanzi glyphs for 萬子) and hide
// the plain numeral underneath — jsdom doesn't paint, so we check the sheet
const css = await readFile(new URL('../public/css/style.css', import.meta.url), 'utf8');
for (const [suit, face] of [['bamboo', '--m'], ['circles', '--m'], ['chars', '--g']]) {
  const block = css.match(new RegExp(`\\.theme-${suit} \\{[^}]*\\}`))?.[0];
  if (!block) fail(`no .theme-${suit} block in style.css`);
  for (let n = 1; n <= 9; n++) {
    if (!block.includes(`${face}${n}:`)) fail(`${suit} theme missing tile face ${face}${n}`);
  }
  if (!block.includes('--numeral-fill: transparent')) fail(`${suit} theme does not hide the plain numeral`);
}
ok('every suit theme defines nine tile faces and hides the numeral');

// board cells expose their value for per-digit candy styling
click($('[data-action="back-home"]'));
click($('[data-action="solo"]'));
click($$('#difficulty-list .diff-btn')[0]);
const themedGiven = $$('#board .cell').find((c) => c.classList.contains('given'));
if (themedGiven.dataset.v !== themedGiven.querySelector('.val').textContent) fail('data-v does not match cell value');
ok('cells expose data-v so themes can color digits per value');
click($('[data-action="quit-game"]'));

// back to pastel for the race leg
click($('[data-action="themes"]'));
click($$('#theme-list .theme-card')[0]);
click($('[data-action="back-home"]'));

/* ───────── race: jsdom client vs raw ws guest ───────── */

click($('[data-action="race"]'));
click($('[data-action="race-create"]'));
click($$('#difficulty-list .diff-btn')[0]); // easy race
await until(() => /^[A-Z]{4}$/.test($('#room-code').textContent), 'room code in lobby');
const code = $('#room-code').textContent;
ok(`lobby shows room code ${code}`);

const guest = new WebSocket(`ws://localhost:${PORT}`);
const guestMsgs = [];
guest.on('message', (raw) => guestMsgs.push(JSON.parse(raw)));
await new Promise((r) => guest.once('open', r));
guest.send(JSON.stringify({ t: 'join', code, name: 'Robo Turtle', emoji: '🐢' }));

await until(() => active() === 'screen-game', 'race game screen after countdown', 12000);
if ($('#race-hud').classList.contains('hidden')) fail('race HUD hidden in race mode');
if (!$('#racer-them').textContent.includes('Robo Turtle')) fail('opponent name not shown');
ok('race started after countdown, opponent shown in HUD');

guest.send(JSON.stringify({ t: 'progress', pct: 0.4 }));
await until(() => $('#race-fill-them').style.width === '40%', 'opponent progress bar update');
ok('opponent progress bar animates');

// host solves via hints → auto finish → server verdict → win overlay
const hintBtn2 = $('[data-action="hint"]');
for (let i = 0; i < 82 && $('#result-overlay').classList.contains('hidden'); i++) click(hintBtn2);
await until(() => !$('#result-overlay').classList.contains('hidden'), 'race result overlay');
if (!$('#result-title').textContent.includes('win')) fail(`unexpected race result: ${$('#result-title').textContent}`);
await until(() => guestMsgs.some((m) => m.t === 'race_over' && m.youWin === false), 'guest race_over');
ok('race finish verified by server — win overlay for host, loss for guest');

guest.close();
console.log('\n🍡 all client tests passed');
process.exit(0);

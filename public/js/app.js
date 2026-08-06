import { generatePuzzle, DIFFICULTIES } from './sudoku.js';

/* ══════════════════════ mascot ══════════════════════ */
// Bobo the dumpling — one inline SVG reused everywhere; moods are CSS classes.

const MASCOT_SVG = `
<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="bobo-body" cx="50%" cy="38%" r="75%">
      <stop offset="0%" stop-color="#fffdfa"/>
      <stop offset="78%" stop-color="#fff3f0"/>
      <stop offset="100%" stop-color="#ffe3ec"/>
    </radialGradient>
  </defs>
  <!-- ears -->
  <circle cx="33" cy="30" r="13" fill="url(#bobo-body)" stroke="#ecc8d6" stroke-width="2.5"/>
  <circle cx="87" cy="30" r="13" fill="url(#bobo-body)" stroke="#ecc8d6" stroke-width="2.5"/>
  <circle cx="33" cy="30" r="6" fill="#ffc9d8"/>
  <circle cx="87" cy="30" r="6" fill="#ffc9d8"/>
  <!-- body -->
  <path d="M60 22 C 90 22 105 44 105 70 C 105 97 84 111 60 111 C 36 111 15 97 15 70 C 15 44 30 22 60 22 Z"
        fill="url(#bobo-body)" stroke="#ecc8d6" stroke-width="2.5"/>
  <!-- sprout -->
  <path d="M60 22 C 60 15 63 11 68 8" fill="none" stroke="#8fd8b8" stroke-width="3" stroke-linecap="round"/>
  <ellipse cx="72" cy="8" rx="6" ry="3.6" fill="#a8e6c8" transform="rotate(-18 72 8)"/>
  <!-- eyes -->
  <g class="eye"><circle cx="44" cy="61" r="5.5" fill="#4a3d47"/><circle cx="46" cy="59" r="1.9" fill="#fff"/></g>
  <g class="eye"><circle cx="76" cy="61" r="5.5" fill="#4a3d47"/><circle cx="78" cy="59" r="1.9" fill="#fff"/></g>
  <path class="eye-happy" d="M38 61 Q44 54 50 61" fill="none" stroke="#4a3d47" stroke-width="3.5" stroke-linecap="round"/>
  <path class="eye-happy" d="M70 61 Q76 54 82 61" fill="none" stroke="#4a3d47" stroke-width="3.5" stroke-linecap="round"/>
  <!-- blush -->
  <ellipse cx="32" cy="72" rx="6.5" ry="4" fill="#ffb7c8" opacity="0.8"/>
  <ellipse cx="88" cy="72" rx="6.5" ry="4" fill="#ffb7c8" opacity="0.8"/>
  <!-- mouths -->
  <path class="mouth-normal" d="M54 72 Q57 76.5 60 72.5 Q63 76.5 66 72" fill="none" stroke="#4a3d47" stroke-width="2.6" stroke-linecap="round"/>
  <path class="mouth-sad" d="M53 77 Q60 71 67 77" fill="none" stroke="#4a3d47" stroke-width="2.6" stroke-linecap="round"/>
  <circle class="mouth-wow" cx="60" cy="75" r="4.5" fill="#4a3d47"/>
</svg>`;

document.querySelectorAll('.mascot, .mini-mascot').forEach((el) => { el.innerHTML = MASCOT_SVG; });

function setMood(el, mood, ms = 1200) {
  if (!el) return;
  el.classList.remove('happy', 'sad', 'wow', 'celebrate');
  if (!mood) return;
  void el.offsetWidth; // restart animation
  el.classList.add(mood);
  if (mood !== 'celebrate') setTimeout(() => el.classList.remove(mood), ms);
}

const homeMascot = document.getElementById('mascot');
const miniMascot = document.getElementById('mini-mascot');

/* ══════════════════════ tiny sound kit ══════════════════════ */

const sound = (() => {
  let ctx = null;
  const ac = () => (ctx ??= new (window.AudioContext || window.webkitAudioContext)());
  function tone(freq, dur, type = 'sine', gain = 0.12, when = 0) {
    try {
      const a = ac(), o = a.createOscillator(), g = a.createGain();
      const t = a.currentTime + when;
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(a.destination);
      o.start(t); o.stop(t + dur);
    } catch { /* audio blocked — stay silent */ }
  }
  return {
    pop: () => tone(660, 0.09, 'triangle', 0.1),
    good: () => { tone(740, 0.1, 'triangle'); tone(988, 0.12, 'triangle', 0.1, 0.07); },
    bad: () => tone(180, 0.2, 'square', 0.05),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, i * 0.12)),
  };
})();

/* ══════════════════════ themes ══════════════════════ */
// Cosmetic reskins — a body class swaps the CSS-variable palette (and, for
// coffee, the mascot). Per-player, persisted locally, never sent over the wire.

const THEMES = {
  pastel: {
    name: 'Pastel Picnic', blurb: 'soft pinks & dumpling dreams',
    tagline: 'the cutest sudoku in town 🍥', toast: '🍡 Back to the picnic!',
    themeColor: '#fdf1f5',
  },
  coffee: {
    name: "Bobo's Coffee Shop", blurb: 'fueled by happy thoughts and coffee',
    tagline: 'fueled by happy thoughts & coffee ☕', toast: '☕ Welcome to the coffee shop!',
    themeColor: '#eee6cc',
  },
  candy: {
    name: 'Candy Pop', blurb: 'rainbow numbers, sugar-rush squares',
    tagline: 'sweet squares, sweeter you 🍬', toast: '🍬 Sugar rush activated!',
    themeColor: '#fdeff8',
  },
};

let currentTheme = 'pastel';

function applyTheme(key, { silent = false } = {}) {
  if (!THEMES[key]) key = 'pastel';
  currentTheme = key;
  for (const k of Object.keys(THEMES)) document.body.classList.remove(`theme-${k}`);
  document.body.classList.add(`theme-${key}`);
  document.getElementById('tagline').textContent = THEMES[key].tagline;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES[key].themeColor);
  document.querySelectorAll('.theme-card').forEach((c) => c.classList.toggle('on', c.dataset.theme === key));
  try { localStorage.setItem('boboduko-theme', key); } catch { /* private mode */ }
  if (!silent) toast(THEMES[key].toast);
}

function buildThemeList() {
  const list = document.getElementById('theme-list');
  list.innerHTML = '';
  for (const [key, spec] of Object.entries(THEMES)) {
    const card = document.createElement('button');
    card.className = `theme-card theme-${key}`;
    card.dataset.action = 'pick-theme';
    card.dataset.theme = key;
    // coffee shows its real logo; the others show a live mini-board preview
    const art = key === 'coffee'
      ? `<img class="theme-logo" src="img/coffee-logo.png" alt="Bobo's Coffee Shop logo">`
      : `<div class="mini-board">${Array.from({ length: 9 }, (_, i) =>
          `<div class="cell${i % 2 === 0 ? ' given' : ''}" data-v="${i + 1}"><span class="val">${i + 1}</span></div>`).join('')}</div>`;
    card.innerHTML = `
      <div class="theme-art">${art}</div>
      <div class="theme-info"><b>${spec.name}</b><span>${spec.blurb}</span></div>
      <span class="theme-check">✓</span>`;
    list.appendChild(card);
  }
}

/* ══════════════════════ helpers ══════════════════════ */

const $ = (id) => document.getElementById(id);
const rowOf = (i) => Math.floor(i / 9);
const colOf = (i) => i % 9;
const boxOf = (i) => Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3);

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(id).classList.add('active');
}

let toastTimer = null;
function toast(msg, ms = 2200) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

function fmtTime(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* cute anonymous identity — no logins here! */
const CUTE = [
  ['Mochi', '🐰'], ['Boba', '🐻'], ['Pudding', '🐥'], ['Momo', '🐹'], ['Tofu', '🐱'],
  ['Choco', '🐨'], ['Miso', '🦊'], ['Taro', '🐸'], ['Kiwi', '🐧'], ['Beans', '🐢'],
];
const ADJ = ['Sleepy', 'Bouncy', 'Fluffy', 'Sparkly', 'Cozy', 'Zippy', 'Giggly', 'Snuggly'];

function myIdentity() {
  let id = null;
  try { id = JSON.parse(localStorage.getItem('boboduko-id')); } catch { /* fresh */ }
  if (!id) {
    const [animal, emoji] = CUTE[Math.floor(Math.random() * CUTE.length)];
    id = { name: `${ADJ[Math.floor(Math.random() * ADJ.length)]} ${animal}`, emoji };
    try { localStorage.setItem('boboduko-id', JSON.stringify(id)); } catch { /* private mode */ }
  }
  return id;
}
const me = myIdentity();

/* ══════════════════════ confetti ══════════════════════ */

const confettiCanvas = $('confetti');
const cctx = confettiCanvas.getContext('2d');
let confettiParts = [];
let confettiRaf = null;

function burstConfetti() {
  if (!cctx) return; // no canvas support — skip the party, keep the win
  confettiCanvas.width = innerWidth * devicePixelRatio;
  confettiCanvas.height = innerHeight * devicePixelRatio;
  cctx.scale(devicePixelRatio, devicePixelRatio);
  const colors = ['#ff8fab', '#ffc2d1', '#6fd8b2', '#b79ced', '#ffd166', '#fff'];
  for (let i = 0; i < 140; i++) {
    confettiParts.push({
      x: innerWidth / 2 + (Math.random() - 0.5) * 120,
      y: innerHeight * 0.35,
      vx: (Math.random() - 0.5) * 11,
      vy: -Math.random() * 13 - 4,
      size: Math.random() * 7 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      shape: Math.random() < 0.25 ? 'heart' : 'rect',
    });
  }
  if (!confettiRaf) confettiTick();
}

function confettiTick() {
  cctx.clearRect(0, 0, innerWidth, innerHeight);
  confettiParts = confettiParts.filter((p) => p.y < innerHeight + 30);
  for (const p of confettiParts) {
    p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.rot += p.vr;
    cctx.save();
    cctx.translate(p.x, p.y);
    cctx.rotate(p.rot);
    cctx.fillStyle = p.color;
    if (p.shape === 'heart') {
      cctx.font = `${p.size * 2}px serif`;
      cctx.fillText('💗', -p.size, p.size / 2);
    } else {
      cctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    }
    cctx.restore();
  }
  if (confettiParts.length) confettiRaf = requestAnimationFrame(confettiTick);
  else { confettiRaf = null; cctx.clearRect(0, 0, innerWidth, innerHeight); }
}

/* ══════════════════════ game state ══════════════════════ */

const game = {
  difficulty: 'easy',
  puzzle: null,       // number[81] givens
  solution: null,     // number[81]
  board: null,        // number[81] current
  notes: null,        // Set<number>[81]
  selected: -1,
  highlightDigit: 0, // number-first "where are all the 5s?" spotlight
  notesMode: false,
  mistakes: 0,
  hints: 0,
  seconds: 0,
  timerId: null,
  undoStack: [],
  finished: false,
  mode: 'solo',       // 'solo' | 'race'
};

const boardEl = $('board');
let cellEls = [];

function startGame({ puzzle, solution, difficulty, mode }) {
  Object.assign(game, {
    difficulty, puzzle: puzzle.slice(), solution, board: puzzle.slice(),
    notes: Array.from({ length: 81 }, () => new Set()),
    selected: -1, highlightDigit: 0, notesMode: false, mistakes: 0, hints: 0, seconds: 0,
    undoStack: [], finished: false, mode,
  });
  $('notes-state').textContent = 'off';
  $('ctrl-notes').classList.remove('on');
  const spec = DIFFICULTIES[difficulty];
  $('stat-difficulty').textContent = `${spec.emoji} ${spec.label}`;
  $('stat-mistakes').textContent = '0';
  $('stat-timer').textContent = '0:00';
  $('race-hud').classList.toggle('hidden', mode !== 'race');
  buildBoard();
  updateNumpad();
  showScreen('screen-game');
  startTimer();
}

function startTimer() {
  clearInterval(game.timerId);
  game.timerId = setInterval(() => {
    game.seconds++;
    $('stat-timer').textContent = fmtTime(game.seconds);
  }, 1000);
}

function stopTimer() { clearInterval(game.timerId); game.timerId = null; }

/* ─────────── board rendering ─────────── */

function buildBoard() {
  boardEl.innerHTML = '';
  cellEls = [];
  for (let i = 0; i < 81; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.setAttribute('role', 'gridcell');
    if (colOf(i) % 3 === 2 && colOf(i) !== 8) cell.classList.add('br3');
    if (rowOf(i) % 3 === 2 && rowOf(i) !== 8) cell.classList.add('bb3');
    if (game.puzzle[i] !== 0) cell.classList.add('given');
    cell.addEventListener('pointerdown', () => selectCell(i));
    boardEl.appendChild(cell);
    cellEls.push(cell);
    renderCell(i);
  }
}

function renderCell(i) {
  const cell = cellEls[i];
  const v = game.board[i];
  cell.dataset.v = v || ''; // lets themes style digits per value
  if (v !== 0) {
    cell.innerHTML = `<span class="val">${v}</span>`;
    cell.classList.toggle('error', v !== game.solution[i]);
  } else {
    cell.classList.remove('error');
    if (game.notes[i].size) {
      const spans = Array.from({ length: 9 }, (_, k) =>
        `<span>${game.notes[i].has(k + 1) ? k + 1 : ''}</span>`).join('');
      cell.innerHTML = `<div class="notes">${spans}</div>`;
    } else {
      cell.innerHTML = '';
    }
  }
}

function refreshHighlights() {
  const sel = game.selected;
  const hd = game.highlightDigit;
  const selVal = sel >= 0 ? game.board[sel] : hd;
  for (let i = 0; i < 81; i++) {
    const cl = cellEls[i].classList;
    cl.remove('selected', 'peer', 'same', 'same-note');
    if (i === sel) cl.add('selected');
    else if (sel >= 0 && (rowOf(i) === rowOf(sel) || colOf(i) === colOf(sel) || boxOf(i) === boxOf(sel))) cl.add('peer');
    if (selVal !== 0 && game.board[i] === selVal && i !== sel) cl.add('same');
    if (hd !== 0 && game.board[i] === 0 && game.notes[i].has(hd)) cl.add('same-note');
    for (const s of cellEls[i].querySelectorAll('.notes span')) {
      s.classList.toggle('note-hl', hd !== 0 && s.textContent === String(hd));
    }
  }
}

function selectCell(i) {
  game.selected = i;
  if (game.highlightDigit) { game.highlightDigit = 0; updateNumpad(); } // tapping the board exits survey mode
  refreshHighlights();
}

function toggleDigitHighlight(n) {
  game.highlightDigit = game.highlightDigit === n ? 0 : n;
  game.selected = -1; // spotlight the whole board, not one cell's peers
  refreshHighlights();
  updateNumpad();
  sound.pop();
}

function countCorrect(n) {
  let c = 0;
  for (let i = 0; i < 81; i++) if (game.board[i] === n && game.solution[i] === n) c++;
  return c;
}

/* ─────────── moves ─────────── */

function placeNumber(n) {
  if (game.finished) return;
  const i = game.selected;
  // No editable target (nothing selected, a given, an already-correct entry,
  // or a fully-placed digit)? The numpad becomes a digit spotlight instead.
  if (i < 0 || game.puzzle[i] !== 0 || countCorrect(n) === 9 ||
      (game.board[i] !== 0 && game.board[i] === game.solution[i])) {
    return toggleDigitHighlight(n);
  }

  if (game.notesMode && game.board[i] === 0) {
    game.undoStack.push({ i, board: game.board[i], notes: new Set(game.notes[i]) });
    game.notes[i].has(n) ? game.notes[i].delete(n) : game.notes[i].add(n);
    renderCell(i);
    sound.pop();
    return;
  }

  if (game.board[i] === n) return;
  game.undoStack.push({ i, board: game.board[i], notes: new Set(game.notes[i]) });
  game.board[i] = n;
  game.notes[i].clear();
  renderCell(i);
  cellEls[i].classList.add('pop');
  setTimeout(() => cellEls[i].classList.remove('pop'), 300);

  if (n !== game.solution[i]) {
    game.mistakes++;
    $('stat-mistakes').textContent = game.mistakes;
    cellEls[i].classList.add('shake');
    setTimeout(() => cellEls[i].classList.remove('shake'), 380);
    setMood(miniMascot, 'sad', 900);
    sound.bad();
  } else {
    // sweep this number out of peer notes, like a tidy little helper
    for (let p = 0; p < 81; p++) {
      if (p !== i && game.notes[p].has(n) &&
          (rowOf(p) === rowOf(i) || colOf(p) === colOf(i) || boxOf(p) === boxOf(i))) {
        game.notes[p].delete(n);
        renderCell(p);
      }
    }
    celebrateUnits(i);
    setMood(miniMascot, 'happy', 700);
    sound.good();
  }

  refreshHighlights();
  updateNumpad();
  sendProgress();
  checkCompletion();
}

function celebrateUnits(i) {
  const units = [
    Array.from({ length: 9 }, (_, k) => rowOf(i) * 9 + k),
    Array.from({ length: 9 }, (_, k) => k * 9 + colOf(i)),
    Array.from({ length: 9 }, (_, k) => {
      const b = boxOf(i);
      return (Math.floor(b / 3) * 3 + Math.floor(k / 3)) * 9 + (b % 3) * 3 + (k % 3);
    }),
  ];
  for (const unit of units) {
    if (unit.every((c) => game.board[c] === game.solution[c])) {
      unit.forEach((c, idx) => setTimeout(() => {
        cellEls[c].classList.add('unit-done');
        setTimeout(() => cellEls[c].classList.remove('unit-done'), 600);
      }, idx * 30));
    }
  }
}

function eraseCell() {
  const i = game.selected;
  if (i < 0 || game.finished || game.puzzle[i] !== 0) return;
  if (game.board[i] === 0 && game.notes[i].size === 0) return;
  game.undoStack.push({ i, board: game.board[i], notes: new Set(game.notes[i]) });
  game.board[i] = 0;
  game.notes[i].clear();
  renderCell(i);
  refreshHighlights();
  updateNumpad();
  sendProgress();
  sound.pop();
}

function undo() {
  const step = game.undoStack.pop();
  if (!step || game.finished) return;
  game.board[step.i] = step.board;
  game.notes[step.i] = step.notes;
  renderCell(step.i);
  selectCell(step.i);
  updateNumpad();
  sendProgress();
  sound.pop();
}

function hint() {
  if (game.finished) return;
  let i = game.selected;
  if (i < 0 || game.puzzle[i] !== 0 || game.board[i] === game.solution[i]) {
    const candidates = [];
    for (let c = 0; c < 81; c++) if (game.board[c] !== game.solution[c]) candidates.push(c);
    if (!candidates.length) return;
    i = candidates[Math.floor(Math.random() * candidates.length)];
  }
  game.undoStack.push({ i, board: game.board[i], notes: new Set(game.notes[i]) });
  game.board[i] = game.solution[i];
  game.notes[i].clear();
  game.hints++;
  renderCell(i);
  cellEls[i].classList.add('hinted');
  setTimeout(() => cellEls[i].classList.remove('hinted'), 900);
  selectCell(i);
  celebrateUnits(i);
  updateNumpad();
  sendProgress();
  sound.good();
  toast(`🌟 Bobo helped! (${game.hints} hint${game.hints > 1 ? 's' : ''})`);
  checkCompletion();
}

function toggleNotes() {
  game.notesMode = !game.notesMode;
  $('notes-state').textContent = game.notesMode ? 'on' : 'off';
  $('ctrl-notes').classList.toggle('on', game.notesMode);
}

/* ─────────── numpad ─────────── */

function buildNumpad() {
  const pad = $('numpad');
  pad.innerHTML = '';
  for (let n = 1; n <= 9; n++) {
    const b = document.createElement('button');
    b.className = 'num-btn';
    b.dataset.n = n;
    b.innerHTML = `${n}<small>9</small>`;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); placeNumber(n); });
    pad.appendChild(b);
  }
}

function updateNumpad() {
  const counts = new Array(10).fill(0);
  for (let i = 0; i < 81; i++) if (game.board[i] === game.solution[i]) counts[game.board[i]]++;
  document.querySelectorAll('.num-btn').forEach((b) => {
    const n = +b.dataset.n;
    const left = 9 - counts[n];
    b.querySelector('small').textContent = left;
    b.classList.toggle('done', left === 0);
    b.classList.toggle('hl', n === game.highlightDigit);
  });
}

/* ─────────── progress & completion ─────────── */

function progressPct() {
  const total = game.puzzle.filter((v) => v === 0).length;
  let correct = 0;
  for (let i = 0; i < 81; i++) {
    if (game.puzzle[i] === 0 && game.board[i] === game.solution[i]) correct++;
  }
  return total ? correct / total : 1;
}

function sendProgress() {
  if (game.mode !== 'race') return;
  const pct = progressPct();
  $('race-fill-me').style.width = `${Math.round(pct * 100)}%`;
  $('race-runner-me').style.left = `${Math.round(pct * 100)}%`;
  net.send({ t: 'progress', pct });
}

function checkCompletion() {
  for (let i = 0; i < 81; i++) if (game.board[i] !== game.solution[i]) return;
  game.finished = true;
  stopTimer();
  if (game.mode === 'race') {
    net.send({ t: 'finish', board: game.board });
    // server confirms the winner — result overlay arrives via 'race_over'
  } else {
    showResult({
      title: 'You did it! 🎉',
      sub: pickPraise(),
      mood: 'celebrate',
      stats: soloStats(),
      buttons: [
        { label: '🧩 Play again', cls: 'btn-pink', fn: () => { hideResult(); startGame({ ...generatePuzzle(game.difficulty), mode: 'solo' }); } },
        { label: '🏠 Home', cls: 'btn-lav', fn: () => { hideResult(); goHome(); } },
      ],
    });
    burstConfetti();
    sound.win();
  }
}

function pickPraise() {
  const lines = [
    'So smart, so cute!', 'Bobo is proud of you 💗', 'Big puzzle energy!',
    'Numbers fear you now.', 'Absolutely adorable logic.', 'A sudoku snack, well eaten.',
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

function soloStats() {
  return [
    `⏱️ ${fmtTime(game.seconds)}`,
    `💧 ${game.mistakes} mistake${game.mistakes === 1 ? '' : 's'}`,
    `🌟 ${game.hints} hint${game.hints === 1 ? '' : 's'}`,
  ];
}

/* ─────────── result overlay ─────────── */

function showResult({ title, sub, mood, stats, buttons }) {
  $('result-title').textContent = title;
  $('result-sub').textContent = sub;
  const rm = $('result-mascot');
  rm.innerHTML = MASCOT_SVG;
  rm.classList.remove('happy', 'sad', 'wow', 'celebrate');
  if (mood) rm.classList.add(mood);
  $('result-stats').innerHTML = stats.map((s) => `<span class="pill">${s}</span>`).join('');
  const btns = $('result-buttons');
  btns.innerHTML = '';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.className = `btn ${b.cls}`;
    el.textContent = b.label;
    el.addEventListener('click', b.fn);
    btns.appendChild(el);
  }
  $('result-overlay').classList.remove('hidden');
}

function hideResult() { $('result-overlay').classList.add('hidden'); }

function goHome() {
  stopTimer();
  net.leave();
  setMood(homeMascot, null);
  showScreen('screen-home');
}

/* ══════════════════════ multiplayer ══════════════════════ */

const net = {
  ws: null,
  roomCode: null,
  isHost: false,
  opponent: null,
  rematchAsked: false,

  connect() {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) return resolve();
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}`);
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('no connection'));
      ws.onmessage = (e) => { try { this.onMessage(JSON.parse(e.data)); } catch { /* ignore junk */ } };
      ws.onclose = () => {
        if (this.roomCode && !game.finished) toast('💔 Connection lost');
        this.ws = null;
      };
      this.ws = ws;
    });
  },

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  },

  async create(difficulty) {
    try {
      await this.connect();
    } catch { return toast('😿 Could not reach the server'); }
    this.isHost = true;
    this.send({ t: 'create', difficulty, name: me.name, emoji: me.emoji });
  },

  async join(code) {
    try {
      await this.connect();
    } catch { return toast('😿 Could not reach the server'); }
    this.isHost = false;
    this.send({ t: 'join', code, name: me.name, emoji: me.emoji });
  },

  leave() {
    if (this.roomCode) this.send({ t: 'leave' });
    this.roomCode = null;
    this.opponent = null;
    this.rematchAsked = false;
  },

  onMessage(msg) {
    switch (msg.t) {
      case 'created': {
        this.roomCode = msg.code;
        $('room-code').textContent = msg.code;
        $('lobby-status').textContent = 'Share this code with a friend!';
        $('lobby-difficulty').textContent =
          `${DIFFICULTIES[msg.difficulty].emoji} ${DIFFICULTIES[msg.difficulty].label} race`;
        showScreen('screen-lobby');
        break;
      }
      case 'start': {
        this.roomCode = msg.code;
        this.opponent = msg.opponent;
        this.rematchAsked = false;
        hideResult();
        $('racer-me').textContent = `${me.emoji} ${me.name}`;
        $('racer-them').textContent = `${msg.opponent.emoji} ${msg.opponent.name}`;
        $('race-runner-me').textContent = me.emoji;
        $('race-runner-them').textContent = msg.opponent.emoji;
        $('race-fill-me').style.width = '0%';
        $('race-fill-them').style.width = '0%';
        $('race-runner-me').style.left = '0%';
        $('race-runner-them').style.left = '0%';
        runCountdown(() => {
          startGame({ puzzle: msg.puzzle, solution: msg.solution, difficulty: msg.difficulty, mode: 'race' });
        });
        break;
      }
      case 'opponent': {
        const pct = Math.round((msg.pct || 0) * 100);
        $('race-fill-them').style.width = `${pct}%`;
        $('race-runner-them').style.left = `${pct}%`;
        break;
      }
      case 'race_over': {
        game.finished = true;
        stopTimer();
        const oppName = this.opponent ? this.opponent.name : 'Your friend';
        if (msg.youWin) {
          showResult({
            title: 'You win! 🏆',
            sub: `You out-puzzled ${oppName}!`,
            mood: 'celebrate',
            stats: soloStats(),
            buttons: this.rematchButtons(),
          });
          burstConfetti();
          sound.win();
        } else {
          showResult({
            title: 'So close! 🐢',
            sub: `${oppName} finished first — rematch?`,
            mood: 'sad',
            stats: soloStats(),
            buttons: this.rematchButtons(),
          });
        }
        break;
      }
      case 'opponent_left': {
        toast('👋 Your friend left the race');
        if (!game.finished && $('screen-game').classList.contains('active')) {
          game.finished = true;
          stopTimer();
          showResult({
            title: 'They ran away! 🏃',
            sub: 'Your friend left — you win by default.',
            mood: 'wow',
            stats: soloStats(),
            buttons: [
              { label: '🏠 Home', cls: 'btn-lav', fn: () => { hideResult(); goHome(); } },
            ],
          });
        } else if ($('screen-lobby').classList.contains('active')) {
          // stay in lobby, someone else can still join
          $('lobby-status').textContent = 'Share this code with a friend!';
        }
        break;
      }
      case 'rematch_wait': {
        toast('💌 Rematch request sent — waiting for your friend…');
        break;
      }
      case 'rematch_asked': {
        toast(`⚡ ${this.opponent ? this.opponent.name : 'Your friend'} wants a rematch!`);
        break;
      }
      case 'error': {
        toast(`😿 ${msg.msg}`);
        if ($('screen-lobby').classList.contains('active')) showScreen('screen-race');
        break;
      }
    }
  },

  rematchButtons() {
    return [
      { label: '⚡ Rematch', cls: 'btn-pink', fn: () => { net.rematchAsked = true; net.send({ t: 'rematch' }); } },
      { label: '🏠 Home', cls: 'btn-lav', fn: () => { hideResult(); goHome(); } },
    ];
  },
};

function runCountdown(done) {
  const overlay = $('countdown-overlay');
  const num = $('countdown-number');
  overlay.classList.remove('hidden');
  const steps = ['3', '2', '1', 'Go! 🍡'];
  let k = 0;
  const tick = () => {
    if (k >= steps.length) {
      overlay.classList.add('hidden');
      return done();
    }
    num.textContent = steps[k];
    num.style.animation = 'none';
    void num.offsetWidth;
    num.style.animation = '';
    sound.pop();
    k++;
    setTimeout(tick, 850);
  };
  tick();
}

/* ══════════════════════ screens & wiring ══════════════════════ */

let pendingRaceCreate = false;

function buildDifficultyList() {
  const list = $('difficulty-list');
  list.innerHTML = '';
  const stars = { easy: 1, medium: 2, hard: 3, superhard: 4, expert: 5 };
  const subs = {
    easy: 'gentle & breezy', medium: 'a comfy stroll', hard: 'now we’re thinking',
    superhard: 'brain sweat time', expert: 'only for legends',
  };
  for (const [key, spec] of Object.entries(DIFFICULTIES)) {
    const b = document.createElement('button');
    b.className = 'diff-btn';
    b.innerHTML = `
      <span class="diff-emoji">${spec.emoji}</span>
      <span><span class="diff-name">${spec.label}</span><br><span class="diff-sub">${subs[key]}</span></span>
      <span class="diff-stars">${'★'.repeat(stars[key])}${'☆'.repeat(5 - stars[key])}</span>`;
    b.addEventListener('click', () => {
      if (pendingRaceCreate) net.create(key);
      else startGame({ ...generatePuzzle(key), mode: 'solo' });
    });
    list.appendChild(b);
  }
}

document.body.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  switch (btn.dataset.action) {
    case 'solo':
      pendingRaceCreate = false;
      $('difficulty-title').textContent = 'Pick a difficulty';
      showScreen('screen-difficulty');
      break;
    case 'race':
      showScreen('screen-race');
      break;
    case 'themes':
      showScreen('screen-themes');
      break;
    case 'pick-theme':
      applyTheme(btn.dataset.theme);
      break;
    case 'race-create':
      pendingRaceCreate = true;
      $('difficulty-title').textContent = 'Pick a race difficulty';
      showScreen('screen-difficulty');
      break;
    case 'race-join': {
      const code = $('join-code').value.trim().toUpperCase();
      if (code.length !== 4) return toast('Codes are 4 letters, like BOBO');
      net.join(code);
      break;
    }
    case 'copy-link': {
      const url = `${location.origin}${location.pathname}?room=${net.roomCode}`;
      navigator.clipboard?.writeText(url)
        .then(() => toast('🔗 Invite link copied!'))
        .catch(() => toast(url, 5000));
      break;
    }
    case 'back-home':
      goHome();
      break;
    case 'lobby-leave':
      net.leave();
      showScreen('screen-race');
      break;
    case 'quit-game':
      if (game.mode === 'race' && !game.finished) toast('🏳️ You left the race');
      goHome();
      break;
    case 'undo': undo(); break;
    case 'erase': eraseCell(); break;
    case 'notes': toggleNotes(); break;
    case 'hint': hint(); break;
  }
});

$('room-code').addEventListener('click', () => {
  navigator.clipboard?.writeText(net.roomCode || '')
    .then(() => toast('📋 Code copied!'))
    .catch(() => { /* fine */ });
});

$('join-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.querySelector('[data-action="race-join"]').click();
});

/* keyboard support for desktop players */
document.addEventListener('keydown', (e) => {
  if (!$('screen-game').classList.contains('active') || game.finished) return;
  if (e.target.tagName === 'INPUT') return;
  if (e.key >= '1' && e.key <= '9') placeNumber(+e.key);
  else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') eraseCell();
  else if (e.key === 'n' || e.key === 'N') toggleNotes();
  else if (e.key === 'Escape') { game.selected = -1; game.highlightDigit = 0; refreshHighlights(); updateNumpad(); }
  else if (e.key === 'u' || e.key === 'z') undo();
  else if (e.key.startsWith('Arrow')) {
    e.preventDefault();
    let i = game.selected < 0 ? 40 : game.selected;
    if (e.key === 'ArrowUp' && rowOf(i) > 0) i -= 9;
    if (e.key === 'ArrowDown' && rowOf(i) < 8) i += 9;
    if (e.key === 'ArrowLeft' && colOf(i) > 0) i -= 1;
    if (e.key === 'ArrowRight' && colOf(i) < 8) i += 1;
    selectCell(i);
  }
});

/* mascot pats! */
homeMascot.addEventListener('pointerdown', () => {
  setMood(homeMascot, Math.random() < 0.7 ? 'happy' : 'wow', 900);
  sound.good();
});

/* ══════════════════════ boot ══════════════════════ */

buildDifficultyList();
buildNumpad();
buildThemeList();
let savedTheme = 'pastel';
try { savedTheme = localStorage.getItem('boboduko-theme') || 'pastel'; } catch { /* fine */ }
applyTheme(savedTheme, { silent: true });

const roomParam = new URLSearchParams(location.search).get('room');
if (roomParam && roomParam.length === 4) {
  history.replaceState(null, '', location.pathname);
  showScreen('screen-race');
  $('join-code').value = roomParam.toUpperCase();
  net.join(roomParam.toUpperCase());
}

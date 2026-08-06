// Boboduko sudoku engine — shared by the browser client and the Node server.
// Grids are flat arrays of 81 numbers, 0 = empty cell.

export const DIFFICULTIES = {
  easy:      { label: 'Easy',       clues: 43, emoji: '🌱' },
  medium:    { label: 'Medium',     clues: 36, emoji: '🌼' },
  hard:      { label: 'Hard',       clues: 30, emoji: '🌶️' },
  superhard: { label: 'Super Hard', clues: 26, emoji: '🔥' },
  expert:    { label: 'Expert',     clues: 23, emoji: '👑' },
};

const ALL = 0x1ff; // bitmask: all 9 candidates

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const rowOf = (i) => Math.floor(i / 9);
const colOf = (i) => i % 9;
const boxOf = (i) => Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3);

// Solution counter with a cutoff (limit=2 answers "is it unique?" cheaply).
// Uses bitmask candidate tracking + minimum-remaining-values cell selection.
function countSolutions(grid, limit, solutionOut) {
  const rows = new Array(9).fill(0);
  const cols = new Array(9).fill(0);
  const boxes = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const v = grid[i];
    if (v === 0) continue;
    const bit = 1 << (v - 1);
    if (rows[rowOf(i)] & bit || cols[colOf(i)] & bit || boxes[boxOf(i)] & bit) return 0;
    rows[rowOf(i)] |= bit;
    cols[colOf(i)] |= bit;
    boxes[boxOf(i)] |= bit;
  }

  let count = 0;
  const cells = grid.slice();

  function search() {
    if (count >= limit) return;
    // Pick the empty cell with the fewest candidates.
    let best = -1, bestMask = 0, bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (cells[i] !== 0) continue;
      const mask = ALL & ~(rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]);
      if (mask === 0) return; // dead end
      const n = popcount(mask);
      if (n < bestN) { bestN = n; best = i; bestMask = mask; if (n === 1) break; }
    }
    if (best === -1) { // solved
      count++;
      if (solutionOut && count === 1) for (let i = 0; i < 81; i++) solutionOut[i] = cells[i];
      return;
    }
    const r = rowOf(best), c = colOf(best), b = boxOf(best);
    let mask = bestMask;
    while (mask) {
      const bit = mask & -mask;
      mask ^= bit;
      cells[best] = Math.log2(bit) + 1;
      rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
      search();
      rows[r] ^= bit; cols[c] ^= bit; boxes[b] ^= bit;
      cells[best] = 0;
      if (count >= limit) return;
    }
  }

  search();
  return count;
}

function popcount(x) {
  let n = 0;
  while (x) { x &= x - 1; n++; }
  return n;
}

// Build a complete, valid grid with randomized backtracking.
function generateFull() {
  const grid = new Array(81).fill(0);
  const rows = new Array(9).fill(0);
  const cols = new Array(9).fill(0);
  const boxes = new Array(9).fill(0);

  function fill(i) {
    if (i === 81) return true;
    const r = rowOf(i), c = colOf(i), b = boxOf(i);
    const options = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const v of options) {
      const bit = 1 << (v - 1);
      if (rows[r] & bit || cols[c] & bit || boxes[b] & bit) continue;
      grid[i] = v; rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
      if (fill(i + 1)) return true;
      grid[i] = 0; rows[r] ^= bit; cols[c] ^= bit; boxes[b] ^= bit;
    }
    return false;
  }

  fill(0);
  return grid;
}

// Dig holes symmetrically (180° rotation) while the solution stays unique.
function digHoles(solution, targetClues) {
  const puzzle = solution.slice();
  let clues = 81;
  // Pass 1: remove 180°-rotationally-symmetric pairs (pretty layouts), plus
  // the center cell on its own.
  const order = shuffle(Array.from({ length: 40 }, (_, k) => [k, 80 - k]));
  order.push([40]);

  for (const cellGroup of order) {
    if (clues <= targetClues) break;
    if (cellGroup.length === 2 && clues - targetClues === 1) continue; // would overshoot
    const backup = cellGroup.map((i) => puzzle[i]);
    for (const i of cellGroup) puzzle[i] = 0;
    if (countSolutions(puzzle, 2) === 1) {
      clues -= backup.length;
    } else {
      cellGroup.forEach((i, idx) => { puzzle[i] = backup[idx]; });
    }
  }

  // Pass 2: symmetric digging bottoms out around 26-28 clues; for deeper
  // targets (expert) keep removing single cells, sacrificing symmetry.
  if (clues > targetClues) {
    const singles = shuffle(Array.from({ length: 81 }, (_, i) => i).filter((i) => puzzle[i] !== 0));
    for (const i of singles) {
      if (clues <= targetClues) break;
      const backup = puzzle[i];
      puzzle[i] = 0;
      if (countSolutions(puzzle, 2) === 1) clues--;
      else puzzle[i] = backup;
    }
  }
  return { puzzle, clues };
}

// Generate a puzzle for the given difficulty key. Retries a few times to get
// close to the target clue count (deep digs don't always succeed first try).
export function generatePuzzle(difficulty) {
  const spec = DIFFICULTIES[difficulty] || DIFFICULTIES.medium;
  let best = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const solution = generateFull();
    const { puzzle, clues } = digHoles(solution, spec.clues);
    if (!best || clues < best.clues) best = { puzzle, solution, clues };
    if (best.clues <= spec.clues + 1) break;
  }
  return { puzzle: best.puzzle, solution: best.solution, clues: best.clues, difficulty };
}

// Check a fully-filled board claim against the solution.
export function boardMatches(board, solution) {
  if (!Array.isArray(board) || board.length !== 81) return false;
  for (let i = 0; i < 81; i++) if (board[i] !== solution[i]) return false;
  return true;
}

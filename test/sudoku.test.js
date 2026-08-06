import { generatePuzzle, boardMatches, DIFFICULTIES } from '../public/js/sudoku.js';

function isValidSolution(g) {
  const groups = [];
  for (let i = 0; i < 9; i++) {
    groups.push(Array.from({ length: 9 }, (_, j) => g[i * 9 + j])); // row
    groups.push(Array.from({ length: 9 }, (_, j) => g[j * 9 + i])); // col
    const r0 = Math.floor(i / 3) * 3, c0 = (i % 3) * 3;
    groups.push(Array.from({ length: 9 }, (_, j) => g[(r0 + Math.floor(j / 3)) * 9 + c0 + (j % 3)])); // box
  }
  return groups.every((grp) => new Set(grp).size === 9 && grp.every((v) => v >= 1 && v <= 9));
}

let failures = 0;
for (const key of Object.keys(DIFFICULTIES)) {
  const t0 = performance.now();
  const { puzzle, solution, clues } = generatePuzzle(key);
  const ms = (performance.now() - t0).toFixed(0);
  const ok =
    isValidSolution(solution) &&
    puzzle.every((v, i) => v === 0 || v === solution[i]) &&
    boardMatches(solution, solution) &&
    !boardMatches(puzzle, solution);
  const target = DIFFICULTIES[key].clues;
  console.log(`${ok ? '✅' : '❌'} ${key.padEnd(10)} clues=${clues} (target ${target})  ${ms}ms`);
  if (!ok) failures++;
}
process.exit(failures ? 1 : 0);

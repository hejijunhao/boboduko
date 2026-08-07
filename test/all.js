// Test runner: boots a server on a scratch port, runs every suite against it.
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

const PORT = '3999';
// Shrink both grace periods so the expiry tests stay fast, while keeping the
// mid-round one clearly longer than the idle one — that gap is the fix for
// seats being recycled out from under a player who was still connected.
const GRACE = '1500';
const PLAY_GRACE = '5000';
const env = { ...process.env, PORT, BOBODUKO_GRACE_MS: GRACE, BOBODUKO_PLAY_GRACE_MS: PLAY_GRACE };
const server = spawn('node', ['server.js'], { env, stdio: 'ignore' });
await wait(600);

let failed = false;
for (const file of ['test/sudoku.test.js', 'test/race.test.js', 'test/client.test.js']) {
  console.log(`\n── ${file} ──`);
  const code = await new Promise((resolve) => {
    const p = spawn('node', [file], { env, stdio: ['ignore', 'inherit', 'ignore'] });
    p.on('exit', resolve);
  });
  if (code !== 0) failed = true;
}

server.kill();
process.exit(failed ? 1 : 0);

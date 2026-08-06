// Test runner: boots a server on a scratch port, runs every suite against it.
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

const PORT = '3999';
const GRACE = '1500'; // shrink the reconnect grace so the expiry test stays fast
const server = spawn('node', ['server.js'], { env: { ...process.env, PORT, BOBODUKO_GRACE_MS: GRACE }, stdio: 'ignore' });
await wait(600);

let failed = false;
for (const file of ['test/sudoku.test.js', 'test/race.test.js', 'test/client.test.js']) {
  console.log(`\n── ${file} ──`);
  const code = await new Promise((resolve) => {
    const p = spawn('node', [file], { env: { ...process.env, PORT, BOBODUKO_GRACE_MS: GRACE }, stdio: ['ignore', 'inherit', 'ignore'] });
    p.on('exit', resolve);
  });
  if (code !== 0) failed = true;
}

server.kill();
process.exit(failed ? 1 : 0);

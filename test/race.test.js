// End-to-end race simulation: two WebSocket clients play a full match,
// including progress relay, finish verification, rematch, and leave handling.
import WebSocket from 'ws';

const URL = `ws://localhost:${process.env.PORT || 3456}`;
const fail = (msg) => { console.error(`❌ ${msg}`); process.exit(1); };
const ok = (msg) => console.log(`✅ ${msg}`);

function client(name) {
  const ws = new WebSocket(URL);
  const queue = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    const w = waiters.shift();
    if (w) w(msg); else queue.push(msg);
  });
  return {
    ws,
    name,
    send: (m) => ws.send(JSON.stringify(m)),
    next: (timeout = 4000) => new Promise((resolve, reject) => {
      if (queue.length) return resolve(queue.shift());
      const t = setTimeout(() => reject(new Error(`${name}: timed out waiting for message`)), timeout);
      waiters.push((m) => { clearTimeout(t); resolve(m); });
    }),
    open: () => new Promise((r) => ws.once('open', r)),
  };
}

const host = client('host');
const guest = client('guest');
await Promise.all([host.open(), guest.open()]);

// 1. create room
host.send({ t: 'create', difficulty: 'easy', name: 'Testy Bunny', emoji: '🐰' });
const created = await host.next();
if (created.t !== 'created' || !/^[A-Z]{4}$/.test(created.code)) fail(`bad created: ${JSON.stringify(created)}`);
ok(`room created: ${created.code}`);

// 2. join with a bad code first
guest.send({ t: 'join', code: 'ZZZZ', name: 'Testy Turtle', emoji: '🐢' });
const err = await guest.next();
if (err.t !== 'error') fail('expected error for bad code');
ok('bad code rejected');

// 3. join for real — both get start with identical puzzle
guest.send({ t: 'join', code: created.code, name: 'Testy Turtle', emoji: '🐢' });
const [hStart, gStart] = await Promise.all([host.next(), guest.next()]);
if (hStart.t !== 'start' || gStart.t !== 'start') fail('expected start for both');
if (JSON.stringify(hStart.puzzle) !== JSON.stringify(gStart.puzzle)) fail('puzzles differ!');
if (hStart.opponent.name !== 'Testy Turtle' || gStart.opponent.name !== 'Testy Bunny') fail('opponent names wrong');
ok('both players got the same puzzle + correct opponent identities');

// 4. progress relay
host.send({ t: 'progress', pct: 0.5 });
const prog = await guest.next();
if (prog.t !== 'opponent' || prog.pct !== 0.5) fail(`bad progress relay: ${JSON.stringify(prog)}`);
ok('progress relays to opponent');

// 5. wrong finish claim is rejected
const wrongBoard = hStart.solution.slice();
wrongBoard[0] = wrongBoard[0] === 9 ? 1 : wrongBoard[0] + 1;
host.send({ t: 'finish', board: wrongBoard });
const notQuite = await host.next();
if (notQuite.t !== 'error') fail('wrong board should be rejected');
ok('wrong finish claim rejected');

// 6. correct finish → win/lose
host.send({ t: 'finish', board: hStart.solution });
const [hOver, gOver] = await Promise.all([host.next(), guest.next()]);
if (!(hOver.t === 'race_over' && hOver.youWin === true)) fail('host should win');
if (!(gOver.t === 'race_over' && gOver.youWin === false)) fail('guest should lose');
ok('finish verified — winner and loser notified');

// 7. late finish by loser is ignored (room already done)
guest.send({ t: 'finish', board: gStart.solution });

// 8. rematch handshake → new round with a fresh puzzle
host.send({ t: 'rematch' });
const wait = await host.next();
if (wait.t !== 'rematch_wait') fail(`expected rematch_wait, got ${JSON.stringify(wait)}`);
const asked = await guest.next();
if (asked.t !== 'rematch_asked') fail(`expected rematch_asked, got ${JSON.stringify(asked)}`);
guest.send({ t: 'rematch' });
const [h2, g2] = await Promise.all([host.next(), guest.next()]);
if (h2.t !== 'start' || g2.t !== 'start') fail('rematch should start a new round');
if (JSON.stringify(h2.puzzle) === JSON.stringify(hStart.puzzle)) fail('rematch reused the old puzzle');
ok('rematch starts a fresh round');

// 9. guest disconnects mid-round → host is told
guest.ws.close();
const left = await host.next();
if (left.t !== 'opponent_left') fail(`expected opponent_left, got ${JSON.stringify(left)}`);
ok('disconnect notifies the other player');

host.ws.close();
console.log('\n🍡 all race tests passed');
process.exit(0);

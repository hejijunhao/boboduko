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

// 9. ping/pong liveness check
host.send({ t: 'ping' });
const pong = await host.next();
if (pong.t !== 'pong') fail(`expected pong, got ${JSON.stringify(pong)}`);
ok('ping answered with pong');

// 10. guest's socket dies mid-round → soft drop with a grace period, NOT game over
guest.ws.close();
const dropped = await host.next();
if (dropped.t !== 'opponent_dropped') fail(`expected opponent_dropped, got ${JSON.stringify(dropped)}`);
if (!(dropped.graceSeconds > 0)) fail('opponent_dropped should carry graceSeconds');
ok('mid-round socket death is a soft drop, not a forfeit');

// 11. guest resumes on a fresh socket → same seat, full state back
const guest2 = client('guest2');
await guest2.open();
guest2.send({ t: 'resume', code: created.code, playerId: g2.playerId });
const resumed = await guest2.next();
if (resumed.t !== 'resumed' || resumed.state !== 'playing') fail(`bad resume: ${JSON.stringify(resumed).slice(0, 120)}`);
if (JSON.stringify(resumed.puzzle) !== JSON.stringify(h2.puzzle)) fail('resume returned the wrong puzzle');
const back = await host.next();
if (back.t !== 'opponent_back') fail(`expected opponent_back, got ${JSON.stringify(back)}`);
ok('resume reattaches the seat and restores the round');

// 12. progress still relays after the resume
guest2.send({ t: 'progress', pct: 0.25 });
const prog2 = await host.next();
if (prog2.t !== 'opponent' || prog2.pct !== 0.25) fail(`bad post-resume relay: ${JSON.stringify(prog2)}`);
ok('progress relays across the new socket');

// 13. resume with a bogus id is rejected
const stranger = client('stranger');
await stranger.open();
stranger.send({ t: 'resume', code: created.code, playerId: 'not-a-real-id' });
const denied = await stranger.next();
if (denied.t !== 'resume_failed') fail(`expected resume_failed, got ${JSON.stringify(denied)}`);
stranger.ws.close();
ok('bogus resume rejected');

// 14. drop again and let the grace period lapse → NOW it becomes a real leave
const graceMs = Number(process.env.BOBODUKO_GRACE_MS) || 90_000;
guest2.ws.close();
const dropped2 = await host.next();
if (dropped2.t !== 'opponent_dropped') fail(`expected opponent_dropped, got ${JSON.stringify(dropped2)}`);
const left = await host.next(graceMs + 3000);
if (left.t !== 'opponent_left') fail(`expected opponent_left after grace, got ${JSON.stringify(left)}`);
ok('expired grace converts the drop into a real leave');

// 15. a host alone in the lobby survives a socket death (serverless cut) and resumes
const host2 = client('host2');
await host2.open();
host2.send({ t: 'create', difficulty: 'easy', name: 'Lobby Bunny', emoji: '🐰' });
const created2 = await host2.next();
host2.ws.close();
await new Promise((r) => setTimeout(r, 150));
const host3 = client('host3');
await host3.open();
host3.send({ t: 'resume', code: created2.code, playerId: created2.playerId });
const lobbyResume = await host3.next();
if (lobbyResume.t !== 'resumed' || lobbyResume.state !== 'waiting') {
  fail(`lobby resume broken: ${JSON.stringify(lobbyResume).slice(0, 120)}`);
}
host3.ws.close();
ok('lobby host survives a socket cut and reclaims the room');

host.ws.close();
console.log('\n🍡 all race tests passed');
process.exit(0);

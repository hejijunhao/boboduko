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

// 14. a mid-round drop is held far longer than an idle one. This is the bug
//     that kept ending real games: the host cuts every socket on a timer, and
//     a seat recycled while its player was still reconnecting told the friend
//     at the board "they ran away" about someone who never left.
const idleMs = Number(process.env.BOBODUKO_GRACE_MS) || 90_000;
const playMs = Number(process.env.BOBODUKO_PLAY_GRACE_MS) || 15 * 60_000;
if (!(playMs > idleMs)) fail('mid-round grace must outlast the idle grace');

guest2.ws.close();
const dropped2 = await host.next();
if (dropped2.t !== 'opponent_dropped') fail(`expected opponent_dropped, got ${JSON.stringify(dropped2)}`);
if (Math.round(dropped2.graceSeconds) !== Math.round(playMs / 1000)) {
  fail(`mid-round drop should advertise the play grace, got ${dropped2.graceSeconds}s`);
}
// still seated well past the point where an idle seat would have been recycled
await new Promise((r) => setTimeout(r, idleMs + 500));
const guest3 = client('guest3');
await guest3.open();
guest3.send({ t: 'resume', code: created.code, playerId: g2.playerId });
const lateResume = await guest3.next();
if (lateResume.t !== 'resumed' || lateResume.state !== 'playing') {
  fail(`seat should survive past the idle grace mid-round, got ${JSON.stringify(lateResume).slice(0, 120)}`);
}
await host.next(); // opponent_back
ok('a mid-round seat outlives the idle grace — a slow reconnect is not a forfeit');

// 15. let the mid-round grace itself lapse → only now is it a real leave
guest3.ws.close();
const dropped3 = await host.next();
if (dropped3.t !== 'opponent_dropped') fail(`expected opponent_dropped, got ${JSON.stringify(dropped3)}`);
const left = await host.next(playMs + 3000);
if (left.t !== 'opponent_left') fail(`expected opponent_left after play grace, got ${JSON.stringify(left)}`);
ok('expired mid-round grace converts the drop into a real leave');

// 16. a host alone in the lobby survives a socket death (serverless cut) and resumes
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

/* ── 17. the instance holding a room is gone: rebuild it from the players ──
   Measured against production, this is the common case at a platform cut —
   both players reconnect at once and get routed to a machine that has never
   heard of their room. They carry the whole round between them, so the first
   one back stands it up again and the second takes the empty chair. */

const alice = client('alice');
const bob = client('bob');
await Promise.all([alice.open(), bob.open()]);
alice.send({ t: 'create', difficulty: 'easy', name: 'Alice', emoji: '🦊' });
const aRoom = await alice.next();
bob.send({ t: 'join', code: aRoom.code, name: 'Bob', emoji: '🦉' });
const [aStart, bStart] = await Promise.all([alice.next(), bob.next()]);
const snapshot = {
  difficulty: aStart.difficulty,
  puzzle: aStart.puzzle,
  solution: aStart.solution,
  pct: 0.3,
};

// Wipe the room the way a recycled instance does: both seats vanish together
// and nothing of the round is left server-side. Letting both graces lapse
// empties the room and deletes it, which is the same end state.
alice.ws.close();
bob.ws.close();
await new Promise((r) => setTimeout(r, playMs + 1000));

// a bogus solution must not be able to stand a room up
const forger = client('forger');
await forger.open();
forger.send({
  t: 'resume',
  code: aRoom.code,
  playerId: aStart.playerId,
  name: 'Forger',
  emoji: '🦝',
  snapshot: { ...snapshot, solution: new Array(81).fill(1) },
});
const forged = await forger.next();
if (forged.t !== 'resume_failed') fail(`a non-sudoku snapshot rebuilt a room: ${JSON.stringify(forged).slice(0, 90)}`);
forger.ws.close();
ok('a snapshot that is not a real solved grid cannot rebuild a room');

// the real players rebuild it and find each other again
const alice2 = client('alice2');
await alice2.open();
alice2.send({ t: 'resume', code: aRoom.code, playerId: aStart.playerId, name: 'Alice', emoji: '🦊', snapshot });
const aBack = await alice2.next();
if (aBack.t !== 'resumed' || aBack.state !== 'playing') fail(`rebuild failed: ${JSON.stringify(aBack).slice(0, 120)}`);
if (JSON.stringify(aBack.puzzle) !== JSON.stringify(aStart.puzzle)) fail('rebuilt room has the wrong board');
if (aBack.opponent) fail('rebuilt room should start with the other chair empty');
ok('the first player back rebuilds the room with the same board');

const bob2 = client('bob2');
await bob2.open();
bob2.send({ t: 'resume', code: aRoom.code, playerId: bStart.playerId, name: 'Bob', emoji: '🦉', snapshot });
const bBack = await bob2.next();
if (bBack.t !== 'resumed' || bBack.state !== 'playing') fail(`re-seat failed: ${JSON.stringify(bBack).slice(0, 120)}`);
if (bBack.opponent?.name !== 'Alice') fail(`expected Alice across the table, got ${JSON.stringify(bBack.opponent)}`);
const aliceSeesBob = await alice2.next();
if (aliceSeesBob.t !== 'opponent_back') fail(`expected opponent_back, got ${aliceSeesBob.t}`);
ok('the second player re-seats and the two are racing each other again');

// and the race still resolves correctly on the rebuilt room
bob2.send({ t: 'finish', board: bStart.solution });
const [bOver, aOver] = await Promise.all([bob2.next(), alice2.next()]);
if (!(bOver.t === 'race_over' && bOver.youWin === true)) fail('rebuilt room did not award the win');
if (!(aOver.t === 'race_over' && aOver.youWin === false)) fail('rebuilt room did not notify the loser');
ok('a rebuilt room still referees the finish');

alice2.ws.close();
bob2.ws.close();

host.ws.close();
console.log('\n🍡 all race tests passed');
process.exit(0);

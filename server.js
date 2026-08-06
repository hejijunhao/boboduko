// Boboduko server — serves the static client and referees multiplayer races.
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { generatePuzzle, boardMatches } from './public/js/sudoku.js';

const PORT = process.env.PORT || 3456;
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'public');

/* ─────────── static files ─────────── */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let path = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
    if (path === '/' || path === '\\') path = '/index.html';
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT)) throw new Error('nope');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 — no dumplings here');
  }
});

/* ─────────── rooms ─────────── */

const rooms = new Map(); // code -> room

// How long a dropped player keeps their seat before they truly forfeit.
// Serverless hosts (Vercel) cut every WebSocket when the function hits its
// maxDuration, and phones drop sockets on lock/network handoff — so a dead
// socket is routine, not proof the player left.
const GRACE_MS = Number(process.env.BOBODUKO_GRACE_MS) || 90_000;

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O — they read like 1/0
function makeCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function send(ws, msg) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function newPlayer(ws, msg) {
  return { id: randomUUID(), ws, name: sanitizeName(msg.name), emoji: sanitizeEmoji(msg.emoji), pct: 0, graceTimer: null };
}

function playerOf(ws) {
  return ws.room ? ws.room.players.find((p) => p.ws === ws) : null;
}

function opponentOf(room, player) {
  return room.players.find((p) => p !== player);
}

function startRound(room) {
  const { puzzle, solution } = generatePuzzle(room.difficulty);
  room.puzzle = puzzle;
  room.solution = solution;
  room.state = 'playing';
  room.winner = null;
  room.rematchVotes = new Set();
  for (const p of room.players) {
    p.pct = 0;
    const opp = opponentOf(room, p);
    send(p.ws, {
      t: 'start',
      code: room.code,
      playerId: p.id,
      difficulty: room.difficulty,
      puzzle,
      solution,
      opponent: { name: opp.name, emoji: opp.emoji },
    });
  }
  console.log(`[room ${room.code}] round started (${room.difficulty})`);
}

/* Socket died (platform cut, phone lock, network blip): hold the seat for
   GRACE_MS so the player can reattach via `resume`. The opponent is told
   softly — the race is only over if the grace period runs out. */
function dropPlayer(ws) {
  const room = ws.room;
  if (!room) return;
  const player = room.players.find((p) => p.ws === ws);
  ws.room = null;
  if (!player) return;
  player.ws = null;
  const opp = opponentOf(room, player);
  if (opp) send(opp.ws, { t: 'opponent_dropped', graceSeconds: Math.round(GRACE_MS / 1000) });
  clearTimeout(player.graceTimer);
  player.graceTimer = setTimeout(() => {
    console.log(`[room ${room.code}] grace expired for ${player.name}`);
    removePlayer(room, player);
  }, GRACE_MS);
  console.log(`[room ${room.code}] ${player.name} dropped — ${GRACE_MS / 1000}s to resume`);
}

/* Permanent removal: an explicit leave or an expired grace period. */
function removePlayer(room, player, notify = true) {
  clearTimeout(player.graceTimer);
  player.graceTimer = null;
  room.players = room.players.filter((p) => p !== player);
  if (player.ws) player.ws.room = null;
  if (room.players.length === 0) {
    rooms.delete(room.code);
    console.log(`[room ${room.code}] deleted (empty)`);
  } else if (notify) {
    send(room.players[0].ws, { t: 'opponent_left' });
    if (room.state === 'playing') room.state = 'done'; // remaining player wins by default
  }
}

function leaveRoom(ws, notify = true) {
  const player = playerOf(ws);
  if (player) removePlayer(ws.room, player, notify);
  ws.room = null;
}

/* ─────────── websocket protocol ─────────── */

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const room = ws.room;

    switch (msg.t) {
      case 'create': {
        leaveRoom(ws); // in case they were somewhere else
        const code = makeCode();
        const player = newPlayer(ws, msg);
        const newRoom = {
          code,
          difficulty: msg.difficulty in { easy: 1, medium: 1, hard: 1, superhard: 1, expert: 1 } ? msg.difficulty : 'medium',
          players: [player],
          state: 'waiting',
          winner: null,
          rematchVotes: new Set(),
          createdAt: Date.now(),
        };
        rooms.set(code, newRoom);
        ws.room = newRoom;
        send(ws, { t: 'created', code, playerId: player.id, difficulty: newRoom.difficulty });
        console.log(`[room ${code}] created (${newRoom.difficulty})`);
        break;
      }

      case 'join': {
        leaveRoom(ws);
        const target = rooms.get(String(msg.code || '').toUpperCase());
        if (!target) return send(ws, { t: 'error', msg: 'Room not found — check the code!' });
        if (target.players.length >= 2) return send(ws, { t: 'error', msg: 'That room is already full!' });
        target.players.push(newPlayer(ws, msg));
        ws.room = target;
        startRound(target);
        break;
      }

      /* A returning player reattaches a fresh socket to their old seat. */
      case 'resume': {
        const target = rooms.get(String(msg.code || '').toUpperCase());
        const player = target?.players.find((p) => p.id === msg.playerId);
        if (!target || !player) return send(ws, { t: 'resume_failed' });
        if (player.ws && player.ws !== ws) { player.ws.room = null; player.ws.close(); } // stale tab
        clearTimeout(player.graceTimer);
        player.graceTimer = null;
        player.ws = ws;
        ws.room = target;
        const opp = opponentOf(target, player);
        send(ws, {
          t: 'resumed',
          code: target.code,
          state: target.state,
          difficulty: target.difficulty,
          puzzle: target.puzzle || null,
          solution: target.solution || null,
          opponent: opp ? { name: opp.name, emoji: opp.emoji, connected: !!opp.ws, pct: opp.pct } : null,
          // done + no recorded winner means the opponent walked out — default win
          youWin: target.state === 'done' ? (target.winner ? target.winner === player.id : true) : null,
        });
        if (opp) send(opp.ws, { t: 'opponent_back', pct: player.pct });
        console.log(`[room ${target.code}] ${player.name} resumed`);
        break;
      }

      case 'progress': {
        if (!room || room.state !== 'playing') return;
        const player = playerOf(ws);
        if (!player) return;
        player.pct = Math.max(0, Math.min(1, Number(msg.pct) || 0));
        const opp = opponentOf(room, player);
        if (opp) send(opp.ws, { t: 'opponent', pct: player.pct });
        break;
      }

      case 'finish': {
        if (!room || room.state !== 'playing') return;
        const player = playerOf(ws);
        if (!player) return;
        if (!boardMatches(msg.board, room.solution)) {
          return send(ws, { t: 'error', msg: 'Hmm, that board isn’t quite right!' });
        }
        room.state = 'done';
        room.winner = player.id;
        send(ws, { t: 'race_over', youWin: true });
        const opp = opponentOf(room, player);
        if (opp) send(opp.ws, { t: 'race_over', youWin: false });
        console.log(`[room ${room.code}] race finished`);
        break;
      }

      case 'rematch': {
        if (!room || room.state !== 'done') return;
        const player = playerOf(ws);
        if (!player) return;
        if (room.players.length < 2) return send(ws, { t: 'error', msg: 'Your friend already left!' });
        room.rematchVotes.add(player.id);
        if (room.rematchVotes.size >= 2) {
          startRound(room);
        } else {
          send(ws, { t: 'rematch_wait' });
          const opp = opponentOf(room, player);
          if (opp) send(opp.ws, { t: 'rematch_asked' });
        }
        break;
      }

      case 'ping': {
        send(ws, { t: 'pong' });
        break;
      }

      case 'leave': {
        leaveRoom(ws);
        break;
      }
    }
  });

  ws.on('close', () => dropPlayer(ws));
});

function sanitizeName(name) {
  return String(name || 'Mystery Friend').slice(0, 24);
}
function sanitizeEmoji(emoji) {
  return String(emoji || '🐾').slice(0, 8);
}

/* heartbeat: drop dead sockets so rooms free up */
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000);

/* sweep stale rooms (abandoned > 2h) */
const sweeper = setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [code, room] of rooms) {
    if (room.createdAt < cutoff) {
      for (const p of room.players) {
        clearTimeout(p.graceTimer);
        if (p.ws) p.ws.room = null;
      }
      rooms.delete(code);
    }
  }
}, 10 * 60 * 1000);

wss.on('close', () => { clearInterval(heartbeat); clearInterval(sweeper); });

server.listen(PORT, () => {
  console.log(`🍡 Boboduko is steaming at http://localhost:${PORT}`);
});

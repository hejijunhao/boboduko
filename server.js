// Boboduko server — serves the static client and referees multiplayer races.
import http from 'node:http';
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

function opponentOf(room, ws) {
  return room.players.find((p) => p.ws !== ws);
}

function startRound(room) {
  const { puzzle, solution } = generatePuzzle(room.difficulty);
  room.puzzle = puzzle;
  room.solution = solution;
  room.state = 'playing';
  room.winner = null;
  room.rematchVotes = new Set();
  for (const p of room.players) {
    const opp = room.players.find((q) => q !== p);
    send(p.ws, {
      t: 'start',
      code: room.code,
      difficulty: room.difficulty,
      puzzle,
      solution,
      opponent: { name: opp.name, emoji: opp.emoji },
    });
  }
  console.log(`[room ${room.code}] round started (${room.difficulty})`);
}

function leaveRoom(ws, notify = true) {
  const room = ws.room;
  if (!room) return;
  room.players = room.players.filter((p) => p.ws !== ws);
  ws.room = null;
  if (room.players.length === 0) {
    rooms.delete(room.code);
    console.log(`[room ${room.code}] deleted (empty)`);
  } else if (notify) {
    send(room.players[0].ws, { t: 'opponent_left' });
    if (room.state === 'playing') room.state = 'done'; // remaining player wins by default
  }
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
        const newRoom = {
          code,
          difficulty: msg.difficulty in { easy: 1, medium: 1, hard: 1, superhard: 1, expert: 1 } ? msg.difficulty : 'medium',
          players: [{ ws, name: sanitizeName(msg.name), emoji: sanitizeEmoji(msg.emoji) }],
          state: 'waiting',
          winner: null,
          rematchVotes: new Set(),
          createdAt: Date.now(),
        };
        rooms.set(code, newRoom);
        ws.room = newRoom;
        send(ws, { t: 'created', code, difficulty: newRoom.difficulty });
        console.log(`[room ${code}] created (${newRoom.difficulty})`);
        break;
      }

      case 'join': {
        leaveRoom(ws);
        const target = rooms.get(String(msg.code || '').toUpperCase());
        if (!target) return send(ws, { t: 'error', msg: 'Room not found — check the code!' });
        if (target.players.length >= 2) return send(ws, { t: 'error', msg: 'That room is already full!' });
        target.players.push({ ws, name: sanitizeName(msg.name), emoji: sanitizeEmoji(msg.emoji) });
        ws.room = target;
        startRound(target);
        break;
      }

      case 'progress': {
        if (!room || room.state !== 'playing') return;
        const opp = opponentOf(room, ws);
        if (opp) send(opp.ws, { t: 'opponent', pct: Math.max(0, Math.min(1, Number(msg.pct) || 0)) });
        break;
      }

      case 'finish': {
        if (!room || room.state !== 'playing') return;
        if (!boardMatches(msg.board, room.solution)) {
          return send(ws, { t: 'error', msg: 'Hmm, that board isn’t quite right!' });
        }
        room.state = 'done';
        room.winner = ws;
        send(ws, { t: 'race_over', youWin: true });
        const opp = opponentOf(room, ws);
        if (opp) send(opp.ws, { t: 'race_over', youWin: false });
        console.log(`[room ${room.code}] race finished`);
        break;
      }

      case 'rematch': {
        if (!room || room.state !== 'done') return;
        if (room.players.length < 2) return send(ws, { t: 'error', msg: 'Your friend already left!' });
        room.rematchVotes.add(ws);
        if (room.rematchVotes.size >= 2) {
          startRound(room);
        } else {
          send(ws, { t: 'rematch_wait' });
          const opp = opponentOf(room, ws);
          if (opp) send(opp.ws, { t: 'rematch_asked' });
        }
        break;
      }

      case 'leave': {
        leaveRoom(ws);
        break;
      }
    }
  });

  ws.on('close', () => leaveRoom(ws));
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
      for (const p of room.players) { p.ws.room = null; }
      rooms.delete(code);
    }
  }
}, 10 * 60 * 1000);

wss.on('close', () => { clearInterval(heartbeat); clearInterval(sweeper); });

server.listen(PORT, () => {
  console.log(`🍡 Boboduko is steaming at http://localhost:${PORT}`);
});

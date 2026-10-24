// Impostor-Spiel: kleiner Server ohne Abhängigkeiten (nur Node.js >= 18)
// Start: node server.js   →   http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const INDEX = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
const MIN_PLAYERS = 3;

/** rooms: code -> { code, round, phase, host, players: Map<pid,{name,online}>, inGame:[pid], impostor, touched } */
const rooms = new Map();
/** streams: code -> Set<{pid,res}> */
const streams = new Map();

function newCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = Array.from({ length: 4 }, () => abc[crypto.randomInt(abc.length)]).join(''); } while (rooms.has(c));
  return c;
}

function viewFor(room, pid) {
  const list = (ids) => ids.filter((id) => room.players.has(id)).map((id) => ({ pid: id, name: room.players.get(id).name, online: room.players.get(id).online }));
  const lobbyIds = [...room.players.keys()];
  const inGame = room.inGame.includes(pid);
  return {
    code: room.code,
    round: room.round,
    phase: room.phase,
    host: room.host,
    you: pid,
    joined: room.players.has(pid),
    players: room.phase === 'lobby' ? list(lobbyIds) : list(room.inGame),
    inGame,
    // Jeder bekommt NUR seine eigene Rolle
    isImpostor: room.phase !== 'lobby' && inGame ? room.impostor === pid : null,
    impostorName: room.phase === 'reveal' ? (room.players.get(room.impostor)?.name || 'Jemand') : null,
    minPlayers: MIN_PLAYERS,
  };
}

function broadcast(room) {
  room.touched = Date.now();
  for (const s of streams.get(room.code) || []) {
    s.res.write(`data: ${JSON.stringify(viewFor(room, s.pid))}\n\n`);
  }
}

function cleanName(n) {
  return String(n || '').replace(/\s+/g, ' ').trim().slice(0, 24);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 10000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const actions = {
  create(body) {
    const name = cleanName(body.name);
    if (!name) return [400, { error: 'Bitte gib einen Namen ein.' }];
    const code = newCode();
    const room = { code, round: 1, phase: 'lobby', host: body.pid, players: new Map(), inGame: [], impostor: null, touched: Date.now() };
    room.players.set(body.pid, { name, online: false });
    rooms.set(code, room);
    return [200, { code }];
  },
  join(body, room) {
    const name = cleanName(body.name);
    if (!name) return [400, { error: 'Bitte gib einen Namen ein.' }];
    if (room.players.has(body.pid)) { room.players.get(body.pid).name = name; return [200, { code: room.code }]; }
    if (room.phase !== 'lobby') return [409, { error: 'Die Runde läuft schon. Warte, bis eine neue Runde beginnt.' }];
    if (room.players.size >= 20) return [409, { error: 'Der Raum ist voll.' }];
    room.players.set(body.pid, { name, online: false });
    if (!room.players.has(room.host)) room.host = body.pid;
    return [200, { code: room.code }];
  },
  leave(body, room) {
    room.players.delete(body.pid);
    room.inGame = room.inGame.filter((p) => p !== body.pid);
    if (room.host === body.pid) room.host = room.players.keys().next().value || null;
    return [200, {}];
  },
  start(body, room) {
    if (room.phase !== 'lobby') return [409, { error: 'Die Runde läuft schon.' }];
    if (!room.players.has(body.pid)) return [403, { error: 'Tritt zuerst bei.' }];
    const ids = [...room.players.keys()];
    if (ids.length < MIN_PLAYERS) return [409, { error: `Es braucht mindestens ${MIN_PLAYERS} Spieler.` }];
    room.inGame = ids;
    room.impostor = ids[crypto.randomInt(ids.length)];
    room.phase = 'play';
    return [200, {}];
  },
  reveal(body, room) {
    if (room.phase !== 'play') return [409, { error: 'Es läuft keine Runde.' }];
    if (!room.inGame.includes(body.pid)) return [403, { error: 'Nur Mitspieler können aufdecken.' }];
    room.phase = 'reveal';
    return [200, {}];
  },
  again(body, room) {
    if (room.phase !== 'reveal') return [409, { error: 'Deckt zuerst den Impostor auf.' }];
    room.round += 1;
    room.phase = 'lobby';
    room.inGame = [];
    room.impostor = null;
    return [200, {}];
  },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(INDEX);
  }

  if (req.method === 'GET' && url.pathname === '/api/exists') {
    const ok = rooms.has(String(url.searchParams.get('room') || '').toUpperCase());
    return send(res, ok ? 200 : 404, { ok });
  }

  // Live-Updates per Server-Sent Events
  if (req.method === 'GET' && url.pathname === '/api/events') {
    const room = rooms.get(String(url.searchParams.get('room') || '').toUpperCase());
    const pid = String(url.searchParams.get('pid') || '');
    if (!room || !pid) return send(res, 404, { error: 'Raum nicht gefunden.' });
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const entry = { pid, res };
    if (!streams.has(room.code)) streams.set(room.code, new Set());
    streams.get(room.code).add(entry);
    if (room.players.has(pid)) room.players.get(pid).online = true;
    broadcast(room);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => {
      clearInterval(ping);
      streams.get(room.code)?.delete(entry);
      const stillOnline = [...(streams.get(room.code) || [])].some((s) => s.pid === pid);
      const p = room.players.get(pid);
      if (p && !stillOnline) {
        p.online = false;
        // In der Lobby wird ein Spieler entfernt, wenn er 30 s weg ist
        setTimeout(() => {
          const again = [...(streams.get(room.code) || [])].some((s) => s.pid === pid);
          if (!again && room.phase === 'lobby' && room.players.has(pid)) actions.leave({ pid }, room);
          broadcast(room);
        }, 30000);
      }
      broadcast(room);
    });
    return;
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5);
    const fn = actions[name];
    if (!fn) return send(res, 404, { error: 'Unbekannte Aktion.' });
    const body = await readBody(req);
    body.pid = String(body.pid || '').slice(0, 64);
    if (!body.pid) return send(res, 400, { error: 'Fehlende Spieler-ID.' });
    if (name === 'create') return send(res, ...fn(body));
    const room = rooms.get(String(body.room || '').toUpperCase().trim());
    if (!room) return send(res, 404, { error: 'Diesen Raum gibt es nicht. Prüfe den Code.' });
    const [status, out] = fn(body, room);
    if (status === 200) broadcast(room);
    return send(res, status, out);
  }

  res.writeHead(404); res.end('Not found');
});

// Alte Räume nach 6 Stunden ohne Aktivität aufräumen
setInterval(() => {
  const cutoff = Date.now() - 6 * 3600 * 1000;
  for (const [code, room] of rooms) {
    if (room.touched < cutoff && !(streams.get(code)?.size)) { rooms.delete(code); streams.delete(code); }
  }
}, 600000);

server.listen(PORT, () => console.log(`Impostor läuft auf http://localhost:${PORT}`));

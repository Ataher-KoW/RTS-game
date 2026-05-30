import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PORT = Number(process.env.AT_STRATEGY_PORT || 8787);
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export function createAtStrategyServer({ host = '0.0.0.0', port = DEFAULT_PORT } = {}) {
  const rooms = new Map();
  const clients = new Map();
  let nextClientId = 1;
  let nextRoomId = 1;

  const server = http.createServer((request, response) => {
    if (request.url === '/health') {
      writeJson(response, 200, {
        ok: true,
        name: 'AT Strategy Multiplayer Server',
        rooms: rooms.size,
        clients: clients.size,
        lanAddresses: getLanAddresses(port),
      });
      return;
    }
    writeJson(response, 404, { ok: false, error: 'not_found' });
  });

  server.on('upgrade', (request, socket) => {
    const key = request.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const accept = crypto.createHash('sha1').update(`${key}${GUID}`).digest('base64');
    socket.write(
      [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '',
        '',
      ].join('\r\n'),
    );

    const client = {
      id: `p${nextClientId++}`,
      socket,
      roomId: null,
      player: null,
      latency: 0,
      lastPingAt: Date.now(),
    };
    clients.set(client.id, client);
    send(client, {
      type: 'server:welcome',
      clientId: client.id,
      lanAddresses: getLanAddresses(port),
      serverTime: Date.now(),
    });

    let buffered = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffered = Buffer.concat([buffered, chunk]);
      const parsed = decodeFrames(buffered);
      buffered = parsed.remaining;
      if (parsed.closed) {
        disconnect(client);
        socket.end();
        return;
      }
      for (const text of parsed.messages) {
        try {
          handleMessage(client, JSON.parse(text));
        } catch (error) {
          send(client, { type: 'server:error', message: error.message });
        }
      }
    });
    socket.on('close', () => disconnect(client));
    socket.on('error', () => disconnect(client));
  });

  function handleMessage(client, message) {
    if (message.type === 'client:pong') {
      client.latency = Date.now() - Number(message.sentAt || client.lastPingAt);
      return;
    }

    if (message.type === 'lobby:list') {
      send(client, { type: 'lobby:list', rooms: [...rooms.values()].map(publicRoom) });
      return;
    }

    if (message.type === 'lobby:create') {
      const roomId = `room-${nextRoomId++}`;
      const room = {
        id: roomId,
        name: message.name || `AT Match ${roomId}`,
        format: message.format || '1v1',
        mapId: message.mapId || 'fractured-frontier',
        maxPlayers: maxPlayersForFormat(message.format || '1v1'),
        hostId: client.id,
        status: 'lobby',
        tick: 0,
        players: new Map(),
        createdAt: Date.now(),
      };
      rooms.set(room.id, room);
      joinRoom(client, room, message.player);
      return;
    }

    if (message.type === 'lobby:join') {
      const room = rooms.get(message.roomId);
      if (!room) {
        send(client, { type: 'server:error', message: 'Room not found' });
        return;
      }
      joinRoom(client, room, message.player);
      return;
    }

    if (message.type === 'lobby:update-player') {
      const room = rooms.get(client.roomId);
      if (!room || !room.players.has(client.id)) {
        return;
      }
      room.players.set(client.id, sanitizePlayer(message.player, room.players.size, client.id));
      broadcastRoom(room, { type: 'lobby:update', room: publicRoom(room) });
      return;
    }

    if (message.type === 'match:start') {
      const room = rooms.get(client.roomId);
      if (!room || room.hostId !== client.id) {
        send(client, { type: 'server:error', message: 'Only the host can start the match' });
        return;
      }
      room.status = 'playing';
      broadcastRoom(room, { type: 'match:start', room: publicRoom(room), seed: message.seed || Date.now() });
      return;
    }

    if (message.type === 'match:input') {
      const room = rooms.get(client.roomId);
      if (!room || room.status !== 'playing') {
        return;
      }
      broadcastRoom(room, {
        type: 'match:input',
        from: client.id,
        tick: Number(message.tick || room.tick),
        input: message.input || {},
      });
      return;
    }

    if (message.type === 'match:state') {
      const room = rooms.get(client.roomId);
      if (!room || client.id !== room.hostId) {
        return;
      }
      room.tick = Number(message.tick || room.tick + 1);
      broadcastRoom(room, {
        type: 'match:state',
        from: client.id,
        tick: room.tick,
        state: message.state || {},
      });
    }
  }

  function joinRoom(client, room, player = {}) {
    if (room.players.size >= room.maxPlayers && !room.players.has(client.id)) {
      send(client, { type: 'server:error', message: 'Room is full' });
      return;
    }
    if (client.roomId) {
      leaveRoom(client);
    }
    client.roomId = room.id;
    client.player = sanitizePlayer(player, room.players.size, client.id);
    room.players.set(client.id, client.player);
    send(client, { type: 'lobby:joined', room: publicRoom(room), clientId: client.id });
    broadcastRoom(room, { type: 'lobby:update', room: publicRoom(room) });
  }

  function leaveRoom(client) {
    const room = rooms.get(client.roomId);
    if (!room) {
      client.roomId = null;
      return;
    }
    room.players.delete(client.id);
    if (room.players.size === 0) {
      rooms.delete(room.id);
    } else {
      if (room.hostId === client.id) {
        room.hostId = room.players.keys().next().value;
      }
      broadcastRoom(room, {
        type: 'match:ai-takeover',
        playerId: client.id,
        room: publicRoom(room),
      });
    }
    client.roomId = null;
  }

  function disconnect(client) {
    if (!clients.has(client.id)) {
      return;
    }
    leaveRoom(client);
    clients.delete(client.id);
  }

  function broadcastRoom(room, payload) {
    for (const client of clients.values()) {
      if (client.roomId === room.id) {
        send(client, payload);
      }
    }
  }

  const pingTimer = setInterval(() => {
    for (const client of clients.values()) {
      client.lastPingAt = Date.now();
      send(client, { type: 'server:ping', sentAt: client.lastPingAt });
    }
  }, 2000);

  return {
    listen() {
      return new Promise((resolve) => {
        server.listen(port, host, () => {
          resolve({
            port,
            host,
            lanAddresses: getLanAddresses(port),
          });
        });
      });
    },
    close() {
      clearInterval(pingTimer);
      for (const client of clients.values()) {
        client.socket.destroy();
      }
      return new Promise((resolve) => server.close(resolve));
    },
    rooms,
    clients,
    server,
  };
}

function sanitizePlayer(player = {}, index = 0, id = '') {
  const colors = ['#38bdf8', '#f97316', '#84cc16', '#a855f7'];
  return {
    id,
    name: String(player.name || `Commander ${index + 1}`).slice(0, 32),
    factionId: player.factionId || 'synthekon',
    color: player.color || colors[index % colors.length],
    team: Number(player.team || (index % 2) + 1),
    ready: Boolean(player.ready),
    disconnected: false,
  };
}

function publicRoom(room) {
  return {
    id: room.id,
    name: room.name,
    format: room.format,
    mapId: room.mapId,
    maxPlayers: room.maxPlayers,
    hostId: room.hostId,
    status: room.status,
    tick: room.tick,
    players: [...room.players.entries()].map(([id, player]) => ({ ...player, id })),
  };
}

function maxPlayersForFormat(format) {
  if (format === '2v2' || format === 'ffa') {
    return 4;
  }
  return 2;
}

function send(client, payload) {
  if (client.socket.destroyed) {
    return;
  }
  client.socket.write(encodeFrame(JSON.stringify(payload)));
}

function encodeFrame(text) {
  const payload = Buffer.from(text);
  const header = [];
  header.push(0x81);
  if (payload.length < 126) {
    header.push(payload.length);
  } else if (payload.length < 65536) {
    header.push(126, (payload.length >> 8) & 255, payload.length & 255);
  } else {
    header.push(127, 0, 0, 0, 0, (payload.length >> 24) & 255, (payload.length >> 16) & 255, (payload.length >> 8) & 255, payload.length & 255);
  }
  return Buffer.concat([Buffer.from(header), payload]);
}

function decodeFrames(buffer) {
  const messages = [];
  let closed = false;
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let length = second & 0x7f;
    let headerLength = 2;
    if (length === 126) {
      if (offset + 4 > buffer.length) {
        break;
      }
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      if (offset + 10 > buffer.length) {
        break;
      }
      const high = buffer.readUInt32BE(offset + 2);
      const low = buffer.readUInt32BE(offset + 6);
      length = high * 2 ** 32 + low;
      headerLength = 10;
    }
    const maskLength = masked ? 4 : 0;
    const frameEnd = offset + headerLength + maskLength + length;
    if (frameEnd > buffer.length) {
      break;
    }
    if (opcode === 0x8) {
      closed = true;
      offset = frameEnd;
      continue;
    }
    const mask = masked ? buffer.subarray(offset + headerLength, offset + headerLength + 4) : null;
    const payload = Buffer.from(buffer.subarray(offset + headerLength + maskLength, frameEnd));
    if (mask) {
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4];
      }
    }
    if (opcode === 0x1) {
      messages.push(payload.toString('utf8'));
    }
    offset = frameEnd;
  }
  return { messages, remaining: buffer.subarray(offset), closed };
}

function writeJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(`${JSON.stringify(body)}\n`);
}

function getLanAddresses(port) {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
    .map((entry) => `ws://${entry.address}:${port}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const server = createAtStrategyServer({
    port: DEFAULT_PORT,
    host: process.env.AT_STRATEGY_HOST || '0.0.0.0',
  });
  const info = await server.listen();
  console.log(`AT Strategy multiplayer server listening on ws://127.0.0.1:${info.port}`);
  for (const address of info.lanAddresses) {
    console.log(`LAN: ${address}`);
  }
}

const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const rooms = require('./rooms');
const drawing = require('./drawing-state');

const app = express();
app.use(express.static(path.join(__dirname, '..', 'client')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ws -> { id, roomId } so on disconnect we know who/where to clean up.
const clientMeta = new Map();

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(roomId, msg, exceptWs) {
  const payload = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    const meta = clientMeta.get(client);
    if (meta && meta.roomId === roomId && client !== exceptWs && client.readyState === client.OPEN) {
      client.send(payload);
    }
  });
}

wss.on('connection', (ws) => {
  const userId = crypto.randomUUID();

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return; // ignore anything that isn't valid JSON, don't crash the server over it
    }

    switch (msg.type) {
      case 'join': {
        const roomId = msg.room || 'default';
        clientMeta.set(ws, { id: userId, roomId });
        const user = rooms.addUser(roomId, userId, msg.name);

        send(ws, {
          type: 'init',
          userId,
          you: user,
          users: rooms.listUsers(roomId),
          strokes: drawing.getSnapshot(roomId),
        });
        broadcast(roomId, { type: 'user-joined', user }, ws);
        break;
      }

      case 'stroke-start': {
        const meta = clientMeta.get(ws);
        if (!meta) return;
        drawing.startStroke(meta.roomId, msg.id, meta.id, msg.tool, msg.color, msg.width, msg.x, msg.y);
        broadcast(meta.roomId, { ...msg, type: 'stroke-start', userId: meta.id });
        break;
      }

      case 'stroke-point': {
        const meta = clientMeta.get(ws);
        if (!meta) return;
        // Points arrive in small batches (see client/websocket.js) rather than
        // one message per mousemove -- keeps the socket from being flooded.
        for (const p of msg.points) drawing.addPoint(meta.roomId, msg.id, p.x, p.y);
        broadcast(meta.roomId, msg, ws);
        break;
      }

      case 'stroke-end': {
        const meta = clientMeta.get(ws);
        if (!meta) return;
        drawing.endStroke(meta.roomId, msg.id);
        broadcast(meta.roomId, msg, ws);
        break;
      }

      case 'cursor': {
        const meta = clientMeta.get(ws);
        if (!meta) return;
        rooms.updateCursor(meta.roomId, meta.id, msg.x, msg.y);
        broadcast(meta.roomId, { type: 'cursor', userId: meta.id, x: msg.x, y: msg.y }, ws);
        break;
      }

      case 'undo': {
        const meta = clientMeta.get(ws);
        if (!meta) return;
        const id = drawing.undo(meta.roomId);
        if (id) broadcast(meta.roomId, { type: 'undo', id }); // includes sender -- everyone must hide it
        break;
      }

      case 'redo': {
        const meta = clientMeta.get(ws);
        if (!meta) return;
        const id = drawing.redo(meta.roomId);
        if (id) broadcast(meta.roomId, { type: 'redo', id });
        break;
      }
    }
  });

  ws.on('close', () => {
    const meta = clientMeta.get(ws);
    if (!meta) return;
    rooms.removeUser(meta.roomId, meta.id);
    broadcast(meta.roomId, { type: 'user-left', userId: meta.id });
    clientMeta.delete(ws);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`listening on ${PORT}`));

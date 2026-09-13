

class RoomSocket {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.ws = null;
    this.pendingPoints = new Map(); // strokeId -> [{x,y}, ...] waiting to be flushed
    this.flushTimer = null;
    this._connect();
  }

  _connect() {
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${protocol}://${location.host}`);
    this.ws.addEventListener('message', (e) => this.onMessage(JSON.parse(e.data)));
    this.ws.addEventListener('close', () => {
      
      setTimeout(() => this._connect(), 1000);
    });
    this.ws.addEventListener('open', () => {
      if (this._onOpen) this._onOpen();
    });
  }

  whenOpen(fn) {
    if (this.ws.readyState === WebSocket.OPEN) fn();
    else this._onOpen = fn;
  }

  _send(msg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  join(room, name) {
    this._send({ type: 'join', room, name });
  }

  strokeStart(id, tool, color, width, x, y) {
    this._send({ type: 'stroke-start', id, tool, color, width, x, y });
  }


  strokePoint(id, x, y) {
    if (!this.pendingPoints.has(id)) this.pendingPoints.set(id, []);
    this.pendingPoints.get(id).push({ x, y });
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this._flush(), 40);
    }
  }

  _flush() {
    this.flushTimer = null;
    for (const [id, points] of this.pendingPoints) {
      if (points.length > 0) this._send({ type: 'stroke-point', id, points });
    }
    this.pendingPoints.clear();
  }

  strokeEnd(id) {
    this._flush(); 
    this._send({ type: 'stroke-end', id });
  }

  cursor(x, y) {
    this._send({ type: 'cursor', x, y });
  }

  undo() { this._send({ type: 'undo' }); }
  redo() { this._send({ type: 'redo' }); }
}

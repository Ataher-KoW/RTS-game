export class MultiplayerClient {
  constructor({ onEvent = () => {}, onStatus = () => {} } = {}) {
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.socket = null;
    this.clientId = null;
    this.room = null;
    this.connected = false;
    this.isHost = false;
    this.latency = 0;
    this.lastStateAt = 0;
  }

  async hostLocal({ port = 8787, format = '1v1', mapId = 'fractured-frontier', player = {} } = {}) {
    if (!window.atStrategy?.startLanHost) {
      throw new Error('LAN hosting is available in the Electron app');
    }
    const info = await window.atStrategy.startLanHost({ port });
    await this.connect(`ws://127.0.0.1:${info.port}`);
    this.isHost = true;
    this.send({
      type: 'lobby:create',
      format,
      mapId,
      player,
      name: `${player.name || 'Commander'} LAN Match`,
    });
    return info;
  }

  connect(url) {
    this.disconnect();
    this.setStatus(`Connecting to ${url}`);
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      this.socket = socket;
      socket.addEventListener('open', () => {
        this.connected = true;
        this.setStatus('Connected');
        resolve(true);
      });
      socket.addEventListener('message', (event) => this.handleMessage(event));
      socket.addEventListener('close', () => {
        this.connected = false;
        this.setStatus('Disconnected');
      });
      socket.addEventListener('error', () => {
        this.connected = false;
        reject(new Error('Could not connect to multiplayer server'));
      }, { once: true });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
    }
    this.socket = null;
    this.connected = false;
    this.clientId = null;
    this.room = null;
    this.isHost = false;
  }

  joinRoom(roomId, player = {}) {
    this.send({ type: 'lobby:join', roomId, player });
  }

  createOnlineRoom({ format, mapId, player }) {
    this.isHost = true;
    this.send({ type: 'lobby:create', format, mapId, player });
  }

  updatePlayer(player) {
    this.send({ type: 'lobby:update-player', player });
  }

  startMatch(seed = Date.now()) {
    this.send({ type: 'match:start', seed });
  }

  broadcastInput(input, tick = 0) {
    this.send({ type: 'match:input', input, tick });
  }

  broadcastState(state, tick = 0) {
    if (!this.isHost || !this.connected) {
      return;
    }
    const now = performance.now();
    if (now - this.lastStateAt < 120) {
      return;
    }
    this.lastStateAt = now;
    this.send({ type: 'match:state', state, tick });
  }

  handleMessage(event) {
    const message = JSON.parse(event.data);
    if (message.type === 'server:welcome') {
      this.clientId = message.clientId;
    }
    if (message.type === 'server:ping') {
      this.send({ type: 'client:pong', sentAt: message.sentAt });
    }
    if (message.type === 'lobby:joined' || message.type === 'lobby:update' || message.type === 'match:start') {
      this.room = message.room;
    }
    if (message.type === 'match:state') {
      this.latency = Math.max(0, Date.now() - Number(message.state?.sentAt || Date.now()));
    }
    this.onEvent(message, this);
  }

  send(payload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.socket.send(JSON.stringify(payload));
    return true;
  }

  setStatus(status) {
    this.onStatus({
      status,
      connected: this.connected,
      isHost: this.isHost,
      latency: this.latency,
      room: this.room,
    });
  }

  getState() {
    return {
      connected: this.connected,
      clientId: this.clientId,
      isHost: this.isHost,
      latency: this.latency,
      room: this.room,
    };
  }
}

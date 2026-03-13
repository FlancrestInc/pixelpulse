/** WebSocket signal bus with reconnect + demo-mode fallback. */
export class SignalBus {
  constructor() {
    this.listeners = new Map();
    this.anyListeners = new Set();
    this.modeListeners = new Set();
    this.socket = null;
    this.reconnectTimer = null;
    this.demoTimer = null;
    this.demoStartTimer = null;
    this.connected = false;
    this.liveReady = false;
    this.demoActive = false;
    this.signalState = new Map();
    this.pollIntervals = new Map();
    this.layout = { plots: [] };
  }

  start() {
    this._connect();
    this._scheduleDemoFallback();
  }

  stop() {
    if (this.socket) this.socket.close();
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    if (this.demoStartTimer) window.clearTimeout(this.demoStartTimer);
    this._stopDemoMode();
  }

  subscribe(signalId, cb) {
    if (!this.listeners.has(signalId)) this.listeners.set(signalId, new Set());
    this.listeners.get(signalId).add(cb);
    const current = this.signalState.get(signalId);
    if (current) cb(current);
    return () => this.listeners.get(signalId)?.delete(cb);
  }

  subscribeAny(cb) {
    this.anyListeners.add(cb);
    return () => this.anyListeners.delete(cb);
  }

  onModeChange(cb) {
    this.modeListeners.add(cb);
    cb(this.getMode());
    return () => this.modeListeners.delete(cb);
  }

  getSignal(signalId) {
    return this.signalState.get(signalId) ?? null;
  }

  getPollInterval(signalId) {
    return this.pollIntervals.get(signalId) ?? 5;
  }

  getLayout() {
    return this.layout;
  }

  getMode() {
    return this.liveReady ? 'live' : 'demo';
  }

  _emitMode() {
    const mode = this.getMode();
    this.modeListeners.forEach((cb) => cb(mode));
  }

  _connect() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;

    try {
      this.socket = new WebSocket(wsUrl);
    } catch (_err) {
      this._scheduleReconnect();
      return;
    }

    this.socket.addEventListener('open', () => {
      this.connected = true;
      this._stopDemoMode();
    });

    this.socket.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (_err) {
        return;
      }
      this._handleMessage(msg);
    });

    this.socket.addEventListener('close', () => {
      this.connected = false;
      this.liveReady = false;
      this._emitMode();
      this._scheduleReconnect();
      this._scheduleDemoFallback();
    });

    this.socket.addEventListener('error', () => {
      this.socket?.close();
    });
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this._connect();
    }, 3000);
  }

  _scheduleDemoFallback() {
    if (this.connected || this.demoActive || this.demoStartTimer) return;
    this.demoStartTimer = window.setTimeout(() => {
      this.demoStartTimer = null;
      if (!this.connected) this._startDemoMode();
    }, 5000);
  }

  _startDemoMode() {
    if (this.demoActive) return;
    this.demoActive = true;
    this.liveReady = false;
    this._emitMode();
    const t0 = performance.now();
    this.demoTimer = window.setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      this._emitSignal({
        id: 'cpu_load',
        type: 'gauge',
        value: 0.5 + Math.sin(t * 0.85) * 0.42,
        label: 'CPU Load',
        source: 'demo',
        timestamp: Date.now() / 1000,
      });
      this._emitSignal({
        id: 'memory_used',
        type: 'gauge',
        value: 0.45 + Math.sin(t * 0.48 + 1.2) * 0.38,
        label: 'Memory Used',
        source: 'demo',
        timestamp: Date.now() / 1000,
      });
      this._emitSignal({
        id: 'weather_text',
        type: 'text',
        value: ['Clear', 'Cloudy', 'Rain showers', 'Windy'][Math.floor(t / 4) % 4],
        label: 'Weather',
        source: 'demo',
        timestamp: Date.now() / 1000,
      });
      this._emitSignal({
        id: 'sky_time',
        type: 'gauge',
        value: ((t % 600) / 600),
        label: 'Sky Time',
        source: 'demo',
        timestamp: Date.now() / 1000,
      });
    }, 600);
  }

  _stopDemoMode() {
    if (this.demoTimer) {
      window.clearInterval(this.demoTimer);
      this.demoTimer = null;
    }
    this.demoActive = false;
  }

  _handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'handshake') {
      this.layout = msg.layout ?? { plots: [] };
      const signals = msg.signals ?? {};
      const hasSkyTime = Object.values(signals).some((signal) => signal?.id === 'sky_time');
      if (hasSkyTime) {
        this.liveReady = true;
        this._emitMode();
      }
      Object.values(signals).forEach((signal) => this._emitSignal(signal));
      this._readPollIntervals(msg.config);
      return;
    }

    if (msg.type === 'signal') {
      this._emitSignal(msg.signal);
      return;
    }

    if (msg.type === 'signal_update') {
      (msg.signals ?? []).forEach((signal) => this._emitSignal(signal));
    }
  }

  _readPollIntervals(config) {
    this.pollIntervals.clear();
    (config?.signals ?? []).forEach((entry) => {
      if (entry?.id) this.pollIntervals.set(entry.id, Number(entry.interval ?? 5));
    });
    if (config?.sky_driver?.id) {
      this.pollIntervals.set(config.sky_driver.id, Number(config.sky_driver.interval ?? 5));
    }
  }

  _emitSignal(signal) {
    if (!signal?.id) return;
    this.signalState.set(signal.id, signal);
    if (signal.id === 'sky_time' && this.connected) {
      this.liveReady = true;
      this._emitMode();
    }

    this.listeners.get(signal.id)?.forEach((cb) => cb(signal));
    this.anyListeners.forEach((cb) => cb(signal));
  }
}

/** WebSocket signal bus with reconnect + demo-mode fallback. */
export class SignalBus {
  constructor() {
    this.listeners = new Map();
    this.anyListeners = new Set();
    this.modeListeners = new Set();
    this.layoutListeners = new Set();
    this.layoutSaveListeners = new Set();
    this.socket = null;
    this.reconnectTimer = null;
    this.demoTimer = null;
    this.demoStartTimer = null;
    this.connected = false;
    this.liveReady = false;
    this.demoActive = false;
    this._demoPaused = false;
    this._demoPauseAt = 0;
    this._demoElapsed = 0;
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

  onLayoutChange(cb) {
    this.layoutListeners.add(cb);
    if (Array.isArray(this.layout?.plots) && this.layout.plots.length > 0) cb(this.layout);
    return () => this.layoutListeners.delete(cb);
  }

  onLayoutSaveStatus(cb) {
    this.layoutSaveListeners.add(cb);
    return () => this.layoutSaveListeners.delete(cb);
  }

  getSignal(signalId) { return this.signalState.get(signalId) ?? null; }
  getPollInterval(signalId) { return this.pollIntervals.get(signalId) ?? 5; }
  getLayout() { return this.layout; }
  getMode() { return this.liveReady ? 'live' : 'demo'; }

  pauseDemo() {
    if (!this.demoActive || this._demoPaused) return;
    this._demoPaused = true;
    this._demoPauseAt = performance.now();
    if (this.demoTimer) {
      window.clearInterval(this.demoTimer);
      this.demoTimer = null;
    }
  }

  resumeDemo() {
    if (!this.demoActive || !this._demoPaused) return;
    this._demoPaused = false;
    this._demoElapsed += performance.now() - this._demoPauseAt;
    this._startDemoTick();
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
    this._demoElapsed = 0;
    this._demoPaused = false;
    this._emitMode();
    this._startDemoTick();
  }

  _startDemoTick() {
    if (this.demoTimer) window.clearInterval(this.demoTimer);
    const baseElapsed = this._demoElapsed;
    const tickStart = performance.now();

    this.demoTimer = window.setInterval(() => {
      if (this._demoPaused) return;
      const t = (baseElapsed + performance.now() - tickStart) / 1000;

      // Showcase demo profile:
      // - cpu_load: slow breathing load with occasional pressure spikes
      // - memory_used: steadier elevated plateau
      // - disk_used: slow low-amplitude storage drift
      // - http_requests: livelier pulse for cafe and road activity
      // - news_ticker: rotating operational headlines
      // - weather_text: slower changing local conditions
      // - active_streams: medium-energy crowd curve for the drive-in
      // - deploy_event: occasional event pulse for the data vault
      // - sky_time: smooth full-day loop
      const timestamp = Date.now() / 1000;
      const cpuLoad = this._clamp01(0.48 + Math.sin(t * 0.55) * 0.18 + Math.max(0, Math.sin(t * 0.12 - 0.8)) * 0.28);
      const memoryUsed = this._clamp01(0.58 + Math.sin(t * 0.18 + 0.9) * 0.08 + Math.sin(t * 0.05) * 0.04);
      const diskUsed = this._clamp01(0.34 + Math.sin(t * 0.07 + 0.4) * 0.09);
      const httpRequests = this._clamp01(0.18 + Math.abs(Math.sin(t * 0.9)) * 0.42 + Math.max(0, Math.sin(t * 2.6)) * 0.12);
      const activeStreams = this._clamp01(0.3 + Math.sin(t * 0.35 + 1.2) * 0.16 + Math.max(0, Math.sin(t * 0.8 - 1.7)) * 0.2);
      const deployEvent = Math.floor(t) % 32 === 0 ? 1 : 0;

      this._emitSignal({ id: 'cpu_load', type: 'gauge', value: cpuLoad, label: 'CPU Load', source: 'demo', timestamp });
      this._emitSignal({ id: 'memory_used', type: 'gauge', value: memoryUsed, label: 'Memory Used', source: 'demo', timestamp });
      this._emitSignal({ id: 'disk_used', type: 'gauge', value: diskUsed, label: 'Disk Used', source: 'demo', timestamp });
      this._emitSignal({ id: 'http_requests', type: 'rate', value: httpRequests * 10, label: 'HTTP Requests', source: 'demo', timestamp });
      this._emitSignal({
        id: 'news_ticker',
        type: 'text',
        value: [
          'PIXELPULSE DEMO CITY ONLINE',
          'CPU LOAD NOMINAL ACROSS THE DISTRICT',
          'CAFE TRAFFIC RISING AFTER LUNCH',
          'STREAM ACTIVITY DRAWING CROWDS TONIGHT',
        ][Math.floor(t / 10) % 4],
        label: 'News Ticker',
        source: 'demo',
        timestamp,
      });
      this._emitSignal({
        id: 'weather_text',
        type: 'text',
        value: ['Clear and cool', 'Partly cloudy', 'Light rain nearby', 'Breezy evening'][Math.floor(t / 14) % 4],
        label: 'Weather',
        source: 'demo',
        timestamp,
      });
      this._emitSignal({ id: 'active_streams', type: 'gauge', value: activeStreams, label: 'Active Streams', source: 'demo', timestamp });
      this._emitSignal({ id: 'deploy_event', type: 'event', value: deployEvent, label: 'Deploy Event', source: 'demo', timestamp });
      this._emitSignal({ id: 'sky_time', type: 'gauge', value: ((t % 600) / 600), label: 'Sky Time', source: 'demo', timestamp });
    }, 600);
  }

  _stopDemoMode() {
    if (this.demoTimer) {
      window.clearInterval(this.demoTimer);
      this.demoTimer = null;
    }
    this.demoActive = false;
    this._demoPaused = false;
  }

  _handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'handshake') {
      this.layout = msg.layout ?? { plots: [] };
      this.layoutListeners.forEach((cb) => cb(this.layout));
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
      return;
    }

    if (msg.type === 'layout_saved') {
      if (msg.layout) {
        this.layout = msg.layout;
        this.layoutListeners.forEach((cb) => cb(this.layout));
      }
      this.layoutSaveListeners.forEach((cb) => cb({ ok: true }));
      return;
    }

    if (msg.type === 'layout_save_failed') {
      this.layoutSaveListeners.forEach((cb) => cb({ ok: false }));
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

  _clamp01(value) {
    return Math.max(0, Math.min(Number(value ?? 0), 1));
  }
}

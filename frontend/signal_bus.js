/** WebSocket signal bus with reconnect + demo-mode fallback. */
export class SignalBus {
  constructor() {
    this.listeners          = new Map();
    this.anyListeners       = new Set();
    this.modeListeners      = new Set();
    this.layoutListeners    = new Set();
    this.layoutSaveListeners = new Set();
    this.socket             = null;
    this.reconnectTimer     = null;
    this.demoTimer          = null;
    this.demoStartTimer     = null;
    this.connected          = false;
    this.liveReady          = false;
    this.demoActive         = false;
    this._demoPaused        = false;  // paused while tab is hidden
    this._demoT0            = 0;      // monotonic start for oscillator
    this._demoPauseAt       = 0;      // performance.now() when paused
    this._demoElapsed       = 0;      // accumulated elapsed before pause
    this.signalState        = new Map();
    this.pollIntervals      = new Map();
    this.layout             = { plots: [] };
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  start() {
    this._connect();
    this._scheduleDemoFallback();
  }

  stop() {
    if (this.socket)         this.socket.close();
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    if (this.demoStartTimer) window.clearTimeout(this.demoStartTimer);
    this._stopDemoMode();
  }

  // ── Subscriptions ──────────────────────────────────────────────────────────

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

  // ── Accessors ──────────────────────────────────────────────────────────────

  getSignal(signalId)      { return this.signalState.get(signalId) ?? null; }
  getPollInterval(signalId) { return this.pollIntervals.get(signalId) ?? 5; }
  getLayout()               { return this.layout; }
  getMode()                 { return this.liveReady ? 'live' : 'demo'; }

  // ── Demo pause / resume (called by main.js on visibilitychange) ────────────

  /**
   * Pause the demo oscillator while the tab is hidden.
   * Has no effect if the bus is connected to a live backend.
   */
  pauseDemo() {
    if (!this.demoActive || this._demoPaused) return;
    this._demoPaused  = true;
    this._demoPauseAt = performance.now();
    if (this.demoTimer) {
      window.clearInterval(this.demoTimer);
      this.demoTimer = null;
    }
  }

  /**
   * Resume the demo oscillator after the tab becomes visible again.
   * Adjusts the elapsed-time base so oscillation continues seamlessly.
   */
  resumeDemo() {
    if (!this.demoActive || !this._demoPaused) return;
    this._demoPaused = false;
    // Shift elapsed by the hidden duration so oscillator doesn't jump
    this._demoElapsed += performance.now() - this._demoPauseAt;
    this._startDemoTick();
  }

  // ── Private — WebSocket ────────────────────────────────────────────────────

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
      try { msg = JSON.parse(event.data); } catch (_err) { return; }
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

  // ── Private — Demo mode ────────────────────────────────────────────────────

  _startDemoMode() {
    if (this.demoActive) return;
    this.demoActive   = true;
    this.liveReady    = false;
    this._demoElapsed = 0;
    this._demoPaused  = false;
    this._emitMode();
    this._startDemoTick();
  }

  _startDemoTick() {
    if (this.demoTimer) window.clearInterval(this.demoTimer);
    const baseElapsed = this._demoElapsed;
    const tickStart   = performance.now();

    this.demoTimer = window.setInterval(() => {
      if (this._demoPaused) return;
      const t = (baseElapsed + performance.now() - tickStart) / 1000;

      this._emitSignal({ id: 'cpu_load',    type: 'gauge', value: 0.5 + Math.sin(t * 0.85) * 0.42,             label: 'CPU Load',     source: 'demo', timestamp: Date.now() / 1000 });
      this._emitSignal({ id: 'memory_used', type: 'gauge', value: 0.45 + Math.sin(t * 0.48 + 1.2) * 0.38,      label: 'Memory Used',  source: 'demo', timestamp: Date.now() / 1000 });
      this._emitSignal({ id: 'disk_used',   type: 'gauge', value: 0.3 + Math.sin(t * 0.12 + 0.5) * 0.2,        label: 'Disk Used',    source: 'demo', timestamp: Date.now() / 1000 });
      this._emitSignal({ id: 'auth_failures', type: 'rate', value: Math.max(0, Math.sin(t * 0.3 + 2) * 0.6),   label: 'Auth Failures', source: 'demo', timestamp: Date.now() / 1000 });
      this._emitSignal({ id: 'weather_text', type: 'text',  value: ['Partly cloudy', 'Clear', 'Overcast', 'Light rain'][Math.floor(t / 8) % 4], label: 'Weather', source: 'demo', timestamp: Date.now() / 1000 });
      this._emitSignal({ id: 'sky_time',    type: 'gauge', value: ((t % 600) / 600),                            label: 'Sky Time',     source: 'demo', timestamp: Date.now() / 1000 });
    }, 600);
  }

  _stopDemoMode() {
    if (this.demoTimer) {
      window.clearInterval(this.demoTimer);
      this.demoTimer = null;
    }
    this.demoActive  = false;
    this._demoPaused = false;
  }

  // ── Private — Message dispatch ─────────────────────────────────────────────

  _handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'handshake') {
      this.layout = msg.layout ?? { plots: [] };
      this.layoutListeners.forEach((cb) => cb(this.layout));
      const signals    = msg.signals ?? {};
      const hasSkyTime = Object.values(signals).some((s) => s?.id === 'sky_time');
      if (hasSkyTime) { this.liveReady = true; this._emitMode(); }
      Object.values(signals).forEach((s) => this._emitSignal(s));
      this._readPollIntervals(msg.config);
      return;
    }

    if (msg.type === 'signal') {
      this._emitSignal(msg.signal);
      return;
    }

    if (msg.type === 'signal_update') {
      (msg.signals ?? []).forEach((s) => this._emitSignal(s));
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
}
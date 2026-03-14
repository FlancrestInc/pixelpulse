const PIPE_WIDTH = 4;
const PULSE_DIAMETER = 8;
const PULSE_TRAVERSE_MS = 2000;
const RESIZE_DEBOUNCE_MS = 150;
const PIPE_COLORS = {
  gauge: '#4fc3f7',
  rate: '#81c784',
  text: '#ffb74d',
  event: '#ce93d8',
  state: '#ef9a9a',
};

/**
 * Renders and manages edit-mode signal pipes between source nodes and city plots.
 *
 * Rendering is driven by a requestAnimationFrame loop that runs only while edit
 * mode is active, giving the pulse-dot animation smooth per-frame motion without
 * burning CPU in display mode.
 */
export class PipeRenderer {
  /**
   * @param {object} deps
   * @param {import('../signal_bus.js').SignalBus} deps.signalBus Signal state provider.
   * @param {import('../scene/city/plot_manager.js').PlotManager} deps.plotManager Plot geometry source.
   * @param {PIXI.Container} deps.world Scene world container used for screen-space transforms.
   */
  constructor({ signalBus, plotManager, world }) {
    this.signalBus = signalBus;
    this.plotManager = plotManager;
    this.world = world;
    this.pipes = [];
    this.editMode = false;
    this.hoveredPipeKey = null;
    this.highlightedSignalIds = new Set();
    this.resizeTimer = null;
    this._rafId = null;

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:fixed;inset:0;z-index:43;pointer-events:none;';
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.valveButton = document.createElement('button');
    this.valveButton.textContent = '⚙';
    this.valveButton.setAttribute('aria-label', 'Configure valve');
    this.valveButton.style.cssText = 'position:fixed;display:none;z-index:69;border:1px solid rgba(255,255,255,.55);background:rgba(21,29,42,.95);color:#fff;border-radius:999px;width:24px;height:24px;cursor:pointer;line-height:20px;';
    document.body.appendChild(this.valveButton);

    this._bindEvents();
    this._fitCanvas();
  }

  /** Add or replace the signal pipe for a target plot. */
  addPipe(signalId, plotId) {
    // Remove any existing pipe for this plot.
    this.pipes = this.pipes.filter((pipe) => pipe.toPlotId !== plotId);

    // Insert a placeholder first so _sortedSignalIds includes this signalId
    // when computing the source node X position during route calculation.
    // Without this, a brand-new signal would get a different slot position
    // during routing than after the pipe is committed to the array.
    this.pipes.push({ signalId, toPlotId: plotId, route: [], fromNode: null, valve: null });

    const route = this._routePipe(signalId, plotId);
    const pipe = this.pipes.find((p) => p.toPlotId === plotId);
    if (route && pipe) {
      pipe.route = route;
      pipe.fromNode = this._sourceNodeForSignal(signalId);
    } else {
      // Routing failed — remove the placeholder.
      this.pipes = this.pipes.filter((p) => p.toPlotId !== plotId);
    }
  }

  /** Remove a pipe by target plot id. */
  removePipe(plotId) {
    this.pipes = this.pipes.filter((pipe) => pipe.toPlotId !== plotId);
    if (this.hoveredPipeKey === plotId) this.hoveredPipeKey = null;
  }

  /** Update persisted valve data attached to a pipe. */
  updateValve(plotId, valveConfig) {
    const pipe = this.pipes.find((entry) => entry.toPlotId === plotId);
    if (!pipe) return;
    pipe.valve = valveConfig ? { ...valveConfig } : null;
  }

  /** Return a defensive copy of the current in-memory pipe layout. */
  getLayoutPipes() {
    return this.pipes.map((pipe) => ({
      signalId: pipe.signalId,
      fromNode: { ...pipe.fromNode },
      toPlotId: pipe.toPlotId,
      route: pipe.route.map((point) => ({ ...point })),
      valve: pipe.valve ? { ...pipe.valve } : null,
    }));
  }

  /** Set edit mode visibility and pointer interaction state. */
  setEditMode(active) {
    this.editMode = active;
    // Canvas stays pointer-events:none always — events are caught on window instead.
    if (!active) {
      this.hoveredPipeKey = null;
      this.valveButton.style.display = 'none';
      this._stopRenderLoop();
      // Clear canvas when leaving edit mode.
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    } else {
      this._startRenderLoop();
    }
  }

  /** Rebuild routes from current plot wiring in the serializer state. */
  syncFromLayout(layoutPlots = []) {
    this.pipes = [];
    layoutPlots.forEach((entry) => {
      if (!entry?.plot_id || !entry?.signal) return;
      // Use addPipe so the placeholder-first ordering fix applies here too.
      this.addPipe(entry.signal, entry.plot_id);
      const pipe = this.pipes.find((p) => p.toPlotId === entry.plot_id);
      if (pipe && entry.valve) pipe.valve = { ...entry.valve };
    });
  }

  // ─── Render loop ──────────────────────────────────────────────────────────

  _startRenderLoop() {
    if (this._rafId != null) return;
    const tick = () => {
      if (!this.editMode) {
        this._rafId = null;
        return;
      }
      this._render();
      this._rafId = window.requestAnimationFrame(tick);
    };
    this._rafId = window.requestAnimationFrame(tick);
  }

  _stopRenderLoop() {
    if (this._rafId != null) {
      window.cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  // ─── Event binding ────────────────────────────────────────────────────────

  _bindEvents() {
    window.addEventListener('resize', () => {
      if (this.resizeTimer) window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => {
        this._fitCanvas();
        this._rerouteAll();
      }, RESIZE_DEBOUNCE_MS);
    });

    window.addEventListener('mousemove', (event) => {
      if (!this.editMode) return;
      const match = this._findPipeAtPoint(event.clientX, event.clientY);
      this.hoveredPipeKey = match?.toPlotId ?? null;
      this._positionValveButton(match);
    });

    window.addEventListener('click', (event) => {
      if (!this.editMode) return;
      const match = this._findPipeAtPoint(event.clientX, event.clientY);
      if (!match) return;
      document.dispatchEvent(new CustomEvent('pipe-selected', {
        detail: { plotId: match.toPlotId, x: event.clientX, y: event.clientY },
      }));
    });

    this.valveButton.addEventListener('click', () => {
      const pipe = this.pipes.find((entry) => entry.toPlotId === this.hoveredPipeKey);
      if (!pipe) return;
      const midpoint = this._routeMidpoint(pipe.route);
      document.dispatchEvent(new CustomEvent('pipe-selected', {
        detail: { plotId: pipe.toPlotId, x: midpoint.x, y: midpoint.y },
      }));
    });

    document.addEventListener('signal-highlight', (event) => {
      const signalId = event.detail?.signalId;
      this.highlightedSignalIds.clear();
      if (signalId) this.highlightedSignalIds.add(signalId);
    });
  }

  // ─── Canvas helpers ───────────────────────────────────────────────────────

  _fitCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  _rerouteAll() {
    this.pipes = this.pipes
      .map((pipe) => {
        const route = this._routePipe(pipe.signalId, pipe.toPlotId);
        if (!route) return null;
        return { ...pipe, fromNode: this._sourceNodeForSignal(pipe.signalId), route };
      })
      .filter(Boolean);
  }

  // ─── Source node geometry ─────────────────────────────────────────────────

  _sourceNodeForSignal(signalId) {
    const signalIds = this._sortedSignalIds();
    const index = Math.max(0, signalIds.indexOf(signalId));
    const slotWidth = Math.max(window.innerWidth - 420, 160);
    const spacing = Math.max(120, Math.min(220, slotWidth / Math.max(signalIds.length, 1)));
    const x = 360 + spacing * index + spacing * 0.5;
    const y = window.innerHeight - 24;
    return { x, y, width: 90, height: 28 };
  }

  _sortedSignalIds() {
    const ids = new Set(this.pipes.map((pipe) => pipe.signalId));
    this.plotManager.entries().forEach((plot) => {
      if (plot.layout?.signal) ids.add(plot.layout.signal);
    });
    return [...ids].sort();
  }

  // ─── Routing ──────────────────────────────────────────────────────────────

  _routePipe(signalId, plotId) {
    const plot = this.plotManager.getPlot(plotId);
    if (!plot) return null;
    const source = this._sourceNodeForSignal(signalId);
    const start = { x: source.x, y: source.y - source.height * 0.5 };
    const end = this._plotConnectionPoint(plot);
    const obstacles = this._buildingObstacles(plotId);
    return this._computeOrthogonalRoute(start, end, obstacles);
  }

  _plotConnectionPoint(plot) {
    const scale = this.world.scale.x || 1;
    return {
      x: this.world.x + plot.x * scale,
      y: this.world.y + (plot.y + 2) * scale,
    };
  }

  _buildingObstacles(excludePlotId) {
    const scale = this.world.scale.x || 1;
    return this.plotManager
      .entries()
      .filter((plot) => plot.id !== excludePlotId && plot.state === 'active')
      .map((plot) => ({
        left: this.world.x + (plot.x - 95) * scale,
        right: this.world.x + (plot.x + 95) * scale,
        top: this.world.y + (plot.y - 210) * scale,
        bottom: this.world.y + (plot.y + 6) * scale,
      }));
  }

  _computeOrthogonalRoute(start, end, obstacles) {
    const lRoutes = [
      [start, { x: start.x, y: end.y }, end],
      [start, { x: end.x, y: start.y }, end],
    ];

    const lCandidate = this._pickBestRoute(lRoutes, obstacles);
    if (lCandidate) return lCandidate;

    const xCandidates = [
      start.x, end.x,
      (start.x + end.x) * 0.5,
      start.x - 140, start.x + 140,
      end.x - 140, end.x + 140,
    ];
    const yCandidates = [
      start.y, end.y,
      (start.y + end.y) * 0.5,
      start.y - 120, end.y + 120,
    ];

    const zRoutes = [];
    xCandidates.forEach((xMid) => {
      zRoutes.push([start, { x: xMid, y: start.y }, { x: xMid, y: end.y }, end]);
    });
    yCandidates.forEach((yMid) => {
      zRoutes.push([start, { x: start.x, y: yMid }, { x: end.x, y: yMid }, end]);
    });

    return this._pickBestRoute(zRoutes, obstacles) ?? [start, { x: start.x, y: end.y }, end];
  }

  _pickBestRoute(candidates, obstacles) {
    const scored = candidates
      .map((route) => {
        const normalized = this._normalizeRoute(route);
        if (normalized.length < 2) return null;
        const collisionScore = this._collisionScore(normalized, obstacles);
        const length = this._routeLength(normalized);
        return { route: normalized, score: collisionScore * 1_000_000 + length };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score);
    return scored[0]?.route ?? null;
  }

  _normalizeRoute(route) {
    const out = [];
    route.forEach((point) => {
      if (!out.length) {
        out.push({ ...point });
        return;
      }
      const prev = out[out.length - 1];
      if (Math.round(prev.x) === Math.round(point.x) && Math.round(prev.y) === Math.round(point.y)) return;
      if (out.length >= 2) {
        const beforePrev = out[out.length - 2];
        const sameVertical = Math.round(beforePrev.x) === Math.round(prev.x) && Math.round(prev.x) === Math.round(point.x);
        const sameHorizontal = Math.round(beforePrev.y) === Math.round(prev.y) && Math.round(prev.y) === Math.round(point.y);
        if (sameVertical || sameHorizontal) {
          out[out.length - 1] = { ...point };
          return;
        }
      }
      out.push({ ...point });
    });
    return out;
  }

  _routeLength(route) {
    let total = 0;
    for (let i = 1; i < route.length; i += 1) {
      total += Math.abs(route[i].x - route[i - 1].x) + Math.abs(route[i].y - route[i - 1].y);
    }
    return total;
  }

  _collisionScore(route, obstacles) {
    let collisions = 0;
    for (let i = 1; i < route.length; i += 1) {
      const segment = { a: route[i - 1], b: route[i] };
      obstacles.forEach((box) => {
        if (this._segmentIntersectsBox(segment, box)) collisions += 1;
      });
    }
    return collisions;
  }

  _segmentIntersectsBox(segment, box) {
    const minX = Math.min(segment.a.x, segment.b.x);
    const maxX = Math.max(segment.a.x, segment.b.x);
    const minY = Math.min(segment.a.y, segment.b.y);
    const maxY = Math.max(segment.a.y, segment.b.y);

    if (segment.a.x === segment.b.x) {
      const x = segment.a.x;
      return x >= box.left && x <= box.right && maxY >= box.top && minY <= box.bottom;
    }
    if (segment.a.y === segment.b.y) {
      const y = segment.a.y;
      return y >= box.top && y <= box.bottom && maxX >= box.left && minX <= box.right;
    }
    return false;
  }

  // ─── Hit testing ──────────────────────────────────────────────────────────

  _findPipeAtPoint(x, y) {
    const tolerance = 8;
    return this.pipes.find((pipe) => {
      for (let i = 1; i < pipe.route.length; i += 1) {
        const a = pipe.route[i - 1];
        const b = pipe.route[i];
        if (a.x === b.x) {
          if (Math.abs(x - a.x) <= tolerance && y >= Math.min(a.y, b.y) - tolerance && y <= Math.max(a.y, b.y) + tolerance) return true;
        } else if (a.y === b.y) {
          if (Math.abs(y - a.y) <= tolerance && x >= Math.min(a.x, b.x) - tolerance && x <= Math.max(a.x, b.x) + tolerance) return true;
        }
      }
      return false;
    }) ?? null;
  }

  _positionValveButton(pipe) {
    if (!pipe || !this.editMode) {
      this.valveButton.style.display = 'none';
      return;
    }
    const midpoint = this._routeMidpoint(pipe.route);
    this.valveButton.style.left = `${Math.round(midpoint.x - 12)}px`;
    this.valveButton.style.top = `${Math.round(midpoint.y - 12)}px`;
    this.valveButton.style.display = 'block';
  }

  _routeMidpoint(route) {
    const length = this._routeLength(route);
    const target = length * 0.5;
    let travelled = 0;
    for (let i = 1; i < route.length; i += 1) {
      const a = route[i - 1];
      const b = route[i];
      const segLength = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (travelled + segLength >= target) {
        const delta = target - travelled;
        const ratio = segLength > 0 ? delta / segLength : 0;
        return {
          x: a.x + (b.x - a.x) * ratio,
          y: a.y + (b.y - a.y) * ratio,
        };
      }
      travelled += segLength;
    }
    return route[route.length - 1] ?? { x: 0, y: 0 };
  }

  // ─── Drawing ──────────────────────────────────────────────────────────────

  _render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.editMode) return;

    this.pipes.forEach((pipe) => {
      const signal = this.signalBus.getSignal(pipe.signalId);
      const color = PIPE_COLORS[signal?.type] ?? PIPE_COLORS.gauge;
      const highlighted = this.hoveredPipeKey === pipe.toPlotId || this.highlightedSignalIds.has(pipe.signalId);
      this._drawPipe(pipe.route, highlighted ? '#ffffff' : color);

      // Only draw pulse dot when the signal is live (not stale/disconnected).
      const interval = this.signalBus.getPollInterval(pipe.signalId);
      const age = signal ? (Date.now() / 1000 - Number(signal.timestamp ?? 0)) : Infinity;
      const isLive = signal != null && age < interval * 2;
      if (isLive) this._drawPulse(pipe.route);
    });
  }

  _drawPipe(route, color) {
    this.ctx.fillStyle = color;
    for (let i = 1; i < route.length; i += 1) {
      const a = route[i - 1];
      const b = route[i];
      if (a.x === b.x) {
        this.ctx.fillRect(a.x - PIPE_WIDTH * 0.5, Math.min(a.y, b.y), PIPE_WIDTH, Math.abs(b.y - a.y));
      } else {
        this.ctx.fillRect(Math.min(a.x, b.x), a.y - PIPE_WIDTH * 0.5, Math.abs(b.x - a.x), PIPE_WIDTH);
      }
    }
    // Fill bend corners with a square cap so there's no gap at the joint.
    for (let i = 1; i < route.length - 1; i += 1) {
      this.ctx.fillRect(route[i].x - PIPE_WIDTH * 0.5, route[i].y - PIPE_WIDTH * 0.5, PIPE_WIDTH, PIPE_WIDTH);
    }
  }

  _drawPulse(route) {
    const now = performance.now();
    const t = (now % PULSE_TRAVERSE_MS) / PULSE_TRAVERSE_MS;
    const position = this._pointAtDistance(route, this._routeLength(route) * t);
    this.ctx.beginPath();
    this.ctx.fillStyle = 'rgba(255,255,255,0.6)';
    this.ctx.arc(position.x, position.y, PULSE_DIAMETER * 0.5, 0, Math.PI * 2);
    this.ctx.fill();
  }

  _pointAtDistance(route, distance) {
    let travelled = 0;
    for (let i = 1; i < route.length; i += 1) {
      const a = route[i - 1];
      const b = route[i];
      const segLength = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (travelled + segLength >= distance) {
        const remain = distance - travelled;
        const ratio = segLength > 0 ? remain / segLength : 0;
        return {
          x: a.x + (b.x - a.x) * ratio,
          y: a.y + (b.y - a.y) * ratio,
        };
      }
      travelled += segLength;
    }
    return route[route.length - 1] ?? { x: 0, y: 0 };
  }
}
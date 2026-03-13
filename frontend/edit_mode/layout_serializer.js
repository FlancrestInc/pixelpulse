/**
 * Round-trip verification scenario (manual QA reference):
 * 1) Enter edit mode, wire `cpu_load` to `main_3`, place `windmill`, set valve label.
 * 2) Exit edit mode -> PUT /api/layout writes layout.yaml with display.plots_per_row,
 *    building/style, signal, and valve fields for every plot.
 * 3) Hand-edit backend/layout.yaml: move the building to another plot, change style,
 *    change plots_per_row, or remove a signal id.
 * 4) Reload page -> frontend consumes handshake layout payload and reconstructs plot
 *    states + pipes from that payload exactly.
 *
 * Known edge cases:
 * - Unknown building keys are preserved in serialized layout but ignored by city rendering.
 * - Missing/unknown signal IDs still serialize and zone plots, but show no live value.
 * - plots_per_row changes are preserved in display metadata; current v1 plot geometry is
 *   fixed, so remapping beyond known plot IDs is not applied automatically.
 */

/**
 * Maintains mutable edit-mode layout state and persists it to the backend.
 */
export class LayoutSerializer {
  /**
   * @param {object} deps
   * @param {object} [deps.initialLayout]
   * @param {import('../scene/city/plot_manager.js').PlotManager} [deps.plotManager]
   * @param {import('./pipe_renderer.js').PipeRenderer} [deps.pipeRenderer]
   */
  constructor({ initialLayout = { plots: [] }, plotManager = null, pipeRenderer = null } = {}) {
    this.plotManager = plotManager;
    this.pipeRenderer = pipeRenderer;
    this.plotMap = new Map();
    this.display = { plots_per_row: 6 };
    this.load(initialLayout);
  }

  /** Load a full layout payload into mutable in-memory plot records. */
  load(layout = { plots: [] }) {
    this.plotMap.clear();
    const plotsPerRow = Number(layout?.display?.plots_per_row);
    this.display.plots_per_row = Number.isFinite(plotsPerRow) && plotsPerRow > 0 ? plotsPerRow : 6;

    (layout?.plots ?? []).forEach((entry) => {
      if (!entry?.plot_id) return;
      this.plotMap.set(entry.plot_id, {
        plot_id: entry.plot_id,
        signal: entry.signal ?? null,
        building: entry.building ?? null,
        style: entry.style ?? null,
        valve: entry.valve ? { ...entry.valve } : null,
      });
    });

    this.plotManager?.setLayout(this.serializeAll().plots);
    this.pipeRenderer?.syncFromLayout(this.serializeAll().plots);
  }

  /** Return a mutable plot record, creating an empty one when missing. */
  ensurePlot(plotId) {
    if (!this.plotMap.has(plotId)) {
      this.plotMap.set(plotId, { plot_id: plotId, signal: null, building: null, style: null, valve: null });
    }
    return this.plotMap.get(plotId);
  }

  /** Assign signal wiring and optional valve payload for a plot. */
  setPipe(plotId, signalId, valve = null) {
    const plot = this.ensurePlot(plotId);
    plot.signal = signalId;
    plot.valve = valve ? { ...valve } : plot.valve;
    this.pipeRenderer?.addPipe(signalId, plotId);
    if (plot.valve) this.pipeRenderer?.updateValve(plotId, plot.valve);
  }

  /** Remove a signal connection while preserving the placed building + style. */
  removePipe(plotId) {
    const plot = this.ensurePlot(plotId);
    plot.signal = null;
    plot.valve = null;
    this.pipeRenderer?.removePipe(plotId);
  }

  /** Place or update a building on a plot. */
  setBuilding(plotId, building, style = null) {
    const plot = this.ensurePlot(plotId);
    plot.building = building;
    if (style != null) plot.style = style;
  }

  /** Remove the building while preserving zoning/pipe state. */
  removeBuilding(plotId) {
    const plot = this.ensurePlot(plotId);
    plot.building = null;
    plot.style = null;
  }

  /** Save valve configuration for a plot wiring. */
  setValve(plotId, valve) {
    const plot = this.ensurePlot(plotId);
    plot.valve = { ...valve };
    this.pipeRenderer?.updateValve(plotId, plot.valve);
  }

  /** Delete every plot wired to a specific signal id. */
  removeSignal(signalId) {
    this.plotMap.forEach((plot) => {
      if (plot.signal === signalId) {
        plot.signal = null;
        plot.building = null;
        plot.style = null;
        plot.valve = null;
        this.pipeRenderer?.removePipe(plot.plot_id);
      }
    });
  }

  /** Move building + wiring payload between plots. */
  moveBuilding(fromPlotId, toPlotId) {
    const from = this.ensurePlot(fromPlotId);
    const to = this.ensurePlot(toPlotId);
    to.building = from.building;
    to.style = from.style;
    to.signal = from.signal;
    to.valve = from.valve ? { ...from.valve } : null;
    from.building = null;
    from.style = null;
    from.signal = null;
    from.valve = null;

    this.pipeRenderer?.removePipe(fromPlotId);
    if (to.signal) {
      this.pipeRenderer?.addPipe(to.signal, toPlotId);
      if (to.valve) this.pipeRenderer?.updateValve(toPlotId, to.valve);
    }
  }

  /**
   * Create a backend-compatible layout payload matching layout.yaml schema.
   */
  serialize() {
    const plots = this._orderedPlotEntries().map((plot) => {
      const entry = { plot_id: plot.plot_id };
      if (plot.building) {
        entry.building = plot.building;
        if (plot.style) entry.style = plot.style;
      }
      if (plot.signal) {
        entry.signal = plot.signal;
        if (plot.valve) {
          entry.valve = {
            range_min: plot.valve.range_min,
            range_max: plot.valve.range_max,
            alert_threshold: plot.valve.alert_threshold,
            label: plot.valve.label,
          };
        }
      }
      return entry;
    });

    return {
      display: { plots_per_row: this.display.plots_per_row },
      plots,
    };
  }

  /** Create a full layout payload including empty plots for scene updates. */
  serializeAll() {
    const plots = this._orderedPlotEntries().map((plot) => ({
      plot_id: plot.plot_id,
      signal: plot.signal ?? undefined,
      building: plot.building ?? undefined,
      style: plot.style ?? undefined,
      valve: plot.valve ?? undefined,
    }));
    return {
      display: { plots_per_row: this.display.plots_per_row },
      plots,
    };
  }

  /** Persist current layout to the backend layout endpoint. */
  async save() {
    const payload = this.serialize();
    const response = await fetch('/api/layout', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layout: payload }),
    });
    if (!response.ok) throw new Error(`Layout save failed (${response.status})`);
    return payload;
  }

  _orderedPlotEntries() {
    if (this.plotManager) {
      return this.plotManager.entries().map((plot) => {
        const existing = this.ensurePlot(plot.id);
        return { ...existing, plot_id: plot.id };
      });
    }
    return [...this.plotMap.values()].sort((a, b) => a.plot_id.localeCompare(b.plot_id));
  }
}

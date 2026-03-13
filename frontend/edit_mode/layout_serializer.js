/**
 * Maintains in-memory edit layout state and persists it through the REST layout API.
 */
export class LayoutSerializer {
  constructor(initialLayout = { plots: [] }) {
    this.plotMap = new Map();
    this.load(initialLayout);
  }

  /** Load a full layout payload into mutable in-memory plot records. */
  load(layout = { plots: [] }) {
    this.plotMap.clear();
    (layout?.plots ?? []).forEach((entry) => {
      if (!entry?.plot_id) return;
      this.plotMap.set(entry.plot_id, {
        plot_id: entry.plot_id,
        signal: entry.signal ?? null,
        signal_type: entry.signal_type ?? entry.port_type ?? null,
        port_type: entry.port_type ?? entry.signal_type ?? null,
        building: entry.building ?? null,
        style: entry.style ?? null,
        valve: entry.valve ? { ...entry.valve } : null,
      });
    });
  }

  /** Return a mutable plot record, creating an empty one when missing. */
  ensurePlot(plotId) {
    if (!this.plotMap.has(plotId)) {
      this.plotMap.set(plotId, {
        plot_id: plotId,
        signal: null,
        signal_type: null,
        port_type: null,
        building: null,
        style: null,
        valve: null,
      });
    }
    return this.plotMap.get(plotId);
  }

  /** Assign signal wiring and optional valve payload for a plot. */
  setPipe(plotId, signalId, signalType = null, valve = null) {
    const plot = this.ensurePlot(plotId);
    plot.signal = signalId;
    if (signalType != null) {
      plot.signal_type = signalType;
      plot.port_type = signalType;
    }
    plot.valve = valve ? { ...valve } : plot.valve;
  }

  /** Remove a signal connection and reset plot to empty state. */
  removePipe(plotId) {
    const plot = this.ensurePlot(plotId);
    plot.signal = null;
    plot.signal_type = null;
    plot.port_type = null;
    plot.building = null;
    plot.style = null;
    plot.valve = null;
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
  }

  /** Delete every plot wired to a specific signal id. */
  removeSignal(signalId) {
    this.plotMap.forEach((plot) => {
      if (plot.signal === signalId) {
        plot.signal = null;
        plot.signal_type = null;
        plot.port_type = null;
        plot.building = null;
        plot.style = null;
        plot.valve = null;
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
    to.signal_type = from.signal_type ?? null;
    to.port_type = from.port_type ?? from.signal_type ?? null;
    to.valve = from.valve ? { ...from.valve } : null;
    from.building = null;
    from.style = null;
    from.signal = null;
    from.signal_type = null;
    from.port_type = null;
    from.valve = null;
  }

  /** Create a backend-compatible layout payload. */
  serialize() {
    const plots = [...this.plotMap.values()]
      .filter((plot) => plot.signal || plot.building)
      .map((plot) => ({
        plot_id: plot.plot_id,
        signal: plot.signal ?? undefined,
        signal_type: plot.signal_type ?? undefined,
        port_type: plot.port_type ?? plot.signal_type ?? undefined,
        building: plot.building ?? undefined,
        style: plot.style ?? undefined,
        valve: plot.valve ?? undefined,
      }));
    return { plots };
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
}

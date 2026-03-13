/** Tracks plot states (empty/zoned/active) and renders plot visuals. */
export class PlotManager {
  constructor(parent, plotDefs) {
    this.parent = parent;
    this.plots = new Map();
    this.container = new PIXI.Container();
    this.parent.addChild(this.container);

    plotDefs.forEach((plot) => {
      const node = new PIXI.Graphics();
      node.x = plot.x;
      node.y = plot.y;
      this.container.addChild(node);
      this.plots.set(plot.id, { ...plot, state: 'empty', node, layout: null });
      this._drawPlot(this.plots.get(plot.id));
    });
  }

  setLayout(layoutPlots = []) {
    this.plots.forEach((plot) => {
      plot.layout = null;
      plot.state = 'empty';
      this._drawPlot(plot);
    });

    layoutPlots.forEach((entry) => {
      const plot = this.plots.get(entry.plot_id);
      if (!plot) return;
      plot.layout = entry;
      plot.state = entry.building ? 'active' : entry.signal ? 'zoned' : 'empty';
      this._drawPlot(plot);
    });
  }

  getPlot(plotId) {
    return this.plots.get(plotId) ?? null;
  }

  entries() {
    return [...this.plots.values()];
  }

  _drawPlot(plot) {
    const color = plot.state === 'active' ? 0x4a6e53 : plot.state === 'zoned' ? 0x5c5578 : 0x2d3443;
    const line = plot.state === 'active' ? 0x9ad7a6 : plot.state === 'zoned' ? 0xb7ace6 : 0x93a3bf;
    plot.node.clear();
    plot.node.beginFill(color, 0.9);
    plot.node.drawRoundedRect(-86, 0, 172, 24, 8);
    plot.node.endFill();
    plot.node.lineStyle(2, line, 0.7);
    plot.node.drawRoundedRect(-82, 4, 164, 16, 6);
  }
}

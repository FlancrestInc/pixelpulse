/** Tracks plot states (empty/zoned/active) and renders plot visuals. */
export class PlotManager {
  constructor(parent, plotDefs) {
    this.parent = parent;
    this.plots = new Map();
    this.container = new PIXI.Container();
    this.parent.addChild(this.container);
    this.editMode = false;
    this.highlightProgress = 0;

    plotDefs.forEach((plot) => {
      const container = new PIXI.Container();
      container.x = plot.x;
      container.y = plot.y;
      container.eventMode = 'passive';

      const pad = new PIXI.Graphics();
      const overlay = new PIXI.Graphics();
      const icon = new PIXI.Graphics();
      const hoverGlow = new PIXI.Graphics();
      hoverGlow.alpha = 0;

      container.addChild(pad, hoverGlow, overlay, icon);
      this.container.addChild(container);

      const state = { ...plot, state: 'empty', node: container, pad, overlay, icon, hoverGlow, layout: null };
      this.plots.set(plot.id, state);
      this._wireInteractions(state);
      this._drawPlot(state);
    });
  }

  /** Toggle edit mode interaction + overlay rendering. */
  setEditMode(active) {
    this.editMode = active;
    this.plots.forEach((plot) => {
      plot.node.eventMode = active ? 'static' : 'none';
      plot.node.cursor = active ? 'pointer' : 'default';
      this._drawPlot(plot);
    });
  }

  /** Set highlight alpha progress used by edit-mode enter/exit animation timeline. */
  setHighlightProgress(progress) {
    this.highlightProgress = Math.max(0, Math.min(progress, 1));
    this.plots.forEach((plot) => {
      this._drawPlot(plot);
    });
  }

  /** Replace plot state from layout plots payload. */
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

  /** Update a single plot from a partial layout entry. */
  applyEntry(entry) {
    const plot = this.plots.get(entry.plot_id);
    if (!plot) return;
    plot.layout = { ...plot.layout, ...entry };
    plot.state = entry.building ? 'active' : entry.signal ? 'zoned' : 'empty';
    this._drawPlot(plot);
  }

  getPlot(plotId) {
    return this.plots.get(plotId) ?? null;
  }

  entries() {
    return [...this.plots.values()];
  }

  _wireInteractions(plot) {
    plot.node.on('pointerover', () => {
      if (!this.editMode) return;
      plot.hoverGlow.alpha = 0.9;
    });
    plot.node.on('pointerout', () => {
      plot.hoverGlow.alpha = 0;
    });
    plot.node.on('pointertap', () => {
      if (!this.editMode) return;
      document.dispatchEvent(new CustomEvent('plot-selected', { detail: { plotId: plot.id, plot } }));
    });
  }

  _drawPortIcon(graphics, type = 'gauge', x = 0, y = 0, size = 10, color = 0xd8ebff) {
    graphics.lineStyle(2, color, 1);
    if (type === 'text') {
      graphics.drawRoundedRect(x - size, y - size * 0.65, size * 2, size * 1.3, 3);
      graphics.moveTo(x - size * 0.7, y - 1);
      graphics.lineTo(x + size * 0.7, y - 1);
      graphics.moveTo(x - size * 0.7, y + 3);
      graphics.lineTo(x + size * 0.7, y + 3);
      return;
    }
    if (type === 'event') {
      graphics.moveTo(x - size * 0.4, y - size);
      graphics.lineTo(x + size * 0.1, y - size * 0.1);
      graphics.lineTo(x - size * 0.05, y - size * 0.1);
      graphics.lineTo(x + size * 0.45, y + size);
      graphics.lineTo(x - size * 0.2, y + size * 0.15);
      graphics.lineTo(x + size * 0.02, y + size * 0.15);
      graphics.closePath();
      return;
    }
    if (type === 'state') {
      graphics.drawRoundedRect(x - size * 0.55, y - size, size * 1.1, size * 2, 5);
      graphics.beginFill(color, 0.8);
      graphics.drawCircle(x, y - size * 0.5, size * 0.2);
      graphics.drawCircle(x, y, size * 0.2);
      graphics.drawCircle(x, y + size * 0.5, size * 0.2);
      graphics.endFill();
      return;
    }
    // gauge + rate share a dial motif (rate adds needle)
    graphics.drawCircle(x, y, size);
    graphics.moveTo(x, y);
    graphics.lineTo(x + size * 0.65, y - size * 0.35);
    if (type === 'rate') {
      graphics.moveTo(x - size * 0.7, y + size * 0.7);
      graphics.lineTo(x + size * 0.7, y + size * 0.7);
    }
  }

  _drawPlot(plot) {
    const portType = plot.layout?.port_type ?? plot.layout?.signal_type ?? 'gauge';

    plot.pad.clear();
    plot.overlay.clear();
    plot.icon.clear();
    plot.hoverGlow.clear();

    const color = plot.state === 'active' ? 0x4a6e53 : plot.state === 'zoned' ? 0x5c5578 : 0x2f5e48;
    const line = plot.state === 'active' ? 0x9ad7a6 : plot.state === 'zoned' ? 0xb7ace6 : 0x8fd7a8;

    plot.pad.beginFill(color, 0.9);
    plot.pad.drawRoundedRect(-86, 0, 172, 24, 8);
    plot.pad.endFill();
    plot.pad.lineStyle(2, line, 0.8);
    plot.pad.drawRoundedRect(-82, 4, 164, 16, 6);

    plot.hoverGlow.beginFill(0x8cf9d0, 0.25);
    plot.hoverGlow.drawRoundedRect(-96, -10, 192, 44, 10);
    plot.hoverGlow.endFill();

    if (this.editMode && plot.state === 'empty') {
      plot.overlay.lineStyle(2, 0xa5f8c6, 0.65 * this.highlightProgress);
      plot.overlay.drawRoundedRect(-90, -4, 180, 32, 10);
      plot.overlay.beginFill(0x8effcb, 0.06 * this.highlightProgress);
      plot.overlay.drawRoundedRect(-90, -4, 180, 32, 10);
      plot.overlay.endFill();
    }

    if (this.editMode && plot.state === 'zoned') {
      plot.overlay.beginFill(0x323a4d, 0.9);
      plot.overlay.drawRoundedRect(-10, -28, 20, 28, 5);
      plot.overlay.endFill();
      this._drawPortIcon(plot.icon, portType, 0, -42, 10, 0xf7f2c7);
      plot.icon.alpha = 0.35 + this.highlightProgress * 0.65;
    }

    if (this.editMode && plot.state === 'active') {
      plot.overlay.lineStyle(2, 0xffec9d, 0.5 + this.highlightProgress * 0.4);
      plot.overlay.drawRoundedRect(-88, -4, 176, 32, 10);
      this._drawPortIcon(plot.icon, portType, 56, -34, 9, 0xfff4bf);
      plot.icon.alpha = this.highlightProgress;
    }
  }
}
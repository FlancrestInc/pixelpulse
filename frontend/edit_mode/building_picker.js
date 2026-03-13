import { getBuildingType, listBuildingTypes } from '../scene/city/buildings.js';

/** Contextual building picker + style picker + building actions for edit mode. */
export class BuildingPicker {
  constructor(app, world, cityScene, layoutSerializer, plotManager) {
    this.app = app;
    this.world = world;
    this.cityScene = cityScene;
    this.layoutSerializer = layoutSerializer;
    this.plotManager = plotManager;
    this.editMode = false;
    this.moveFromPlot = null;
    this._buildDom();
    this._bindEvents();
  }

  _buildDom() {
    this.panel = document.createElement('div');
    this.panel.style.cssText = 'position:fixed;display:none;z-index:65;background:rgba(20,26,37,0.98);border:1px solid rgba(144,178,221,0.5);border-radius:10px;min-width:260px;max-width:320px;color:#fff;padding:10px;font:12px/1.4 system-ui,sans-serif;';
    document.body.appendChild(this.panel);

    this.menu = document.createElement('div');
    this.menu.style.cssText = 'position:fixed;display:none;z-index:66;background:rgba(20,26,37,0.98);border:1px solid rgba(144,178,221,0.5);border-radius:10px;color:#fff;padding:8px;font:12px/1.4 system-ui,sans-serif;';
    document.body.appendChild(this.menu);
  }

  _bindEvents() {
    document.addEventListener('plot-selected', (event) => {
      if (!this.editMode || this.moveFromPlot) return;
      this.openForPlot(event.detail.plotId, event.detail.plot);
    });

    document.addEventListener('building-selected', (event) => {
      if (!this.editMode) return;
      this._openBuildingMenu(event.detail);
    });

    document.addEventListener('plot-selected', (event) => {
      if (!this.moveFromPlot || !this.editMode) return;
      this._attemptMove(event.detail.plotId, event.detail.plot);
    });
  }

  setEditMode(active) {
    this.editMode = active;
    if (!active) {
      this.panel.style.display = 'none';
      this.menu.style.display = 'none';
      this.moveFromPlot = null;
    }
  }

  openForPlot(plotId, plot) {
    const layout = this.layoutSerializer.ensurePlot(plotId);
    const portType = layout.signal ? (plot.layout?.port_type ?? plot.layout?.signal_type ?? 'gauge') : null;
    const buildings = listBuildingTypes().filter((entry) => !portType || entry.portType === portType || (entry.portType === 'rate' && portType === 'gauge'));

    this.panel.innerHTML = `<div style="font-weight:700;margin-bottom:6px">Building Picker</div>`;
    buildings.forEach((entry) => {
      const row = document.createElement('button');
      row.style.cssText = 'width:100%;text-align:left;border:1px solid rgba(140,165,207,0.35);background:#263248;border-radius:8px;padding:8px;margin:4px 0;color:#fff;cursor:pointer;';
      row.innerHTML = `<div><strong>${entry.label}</strong> <span style="opacity:.75">(${entry.portType})</span></div><div style="height:28px;background:#33455e;border-radius:4px;margin-top:6px;display:flex;align-items:center;justify-content:center">Animated preview</div>`;
      row.onclick = () => {
        const style = entry.styles?.[0] ?? 'default';
        this.layoutSerializer.setBuilding(plotId, entry.id, style);
        if (!layout.signal) {
          plot.layout = { ...plot.layout, port_type: entry.portType };
        }
        document.dispatchEvent(new CustomEvent('layout-updated', { detail: { reason: 'building-place' } }));
        this.panel.style.display = 'none';
        this._openStylePicker(plotId, entry.id, style, row.getBoundingClientRect());
      };
      this.panel.appendChild(row);
    });

    const screen = this._toScreen(plot.x, plot.y - 30);
    this._positionWithin(this.panel, screen.x + 12, screen.y - 180);
    this.panel.style.display = 'block';
  }

  _openStylePicker(plotId, buildingId, currentStyle, rect) {
    const Type = getBuildingType(buildingId);
    const styles = Type.styles ?? ['default'];
    const picker = document.createElement('div');
    picker.style.cssText = 'margin-top:8px;padding-top:8px;border-top:1px solid rgba(140,165,207,0.35)';
    picker.innerHTML = '<div style="margin-bottom:6px">Pick style</div>';
    styles.forEach((style) => {
      const chip = document.createElement('button');
      chip.textContent = style;
      chip.style.cssText = `margin:2px;padding:4px 7px;border-radius:6px;border:1px solid rgba(170,200,240,.45);background:${style === currentStyle ? '#4f6a94' : '#2c3b54'};color:#fff;cursor:pointer;`;
      chip.onclick = () => {
        this.layoutSerializer.setBuilding(plotId, buildingId, style);
        document.dispatchEvent(new CustomEvent('layout-updated', { detail: { reason: 'style-change' } }));
      };
      picker.appendChild(chip);
    });
    this.panel.appendChild(picker);
    this.panel.style.display = 'block';
    this._positionWithin(this.panel, rect.left, rect.top);
  }

  _openBuildingMenu({ plotId, x, y, buildingId }) {
    this.menu.innerHTML = '';
    const mk = (label, handler) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'display:block;width:100%;text-align:left;padding:7px;border:0;background:transparent;color:#fff;cursor:pointer;';
      b.onclick = handler;
      this.menu.appendChild(b);
    };
    mk('Remove building', () => {
      this.layoutSerializer.removeBuilding(plotId);
      document.dispatchEvent(new CustomEvent('layout-updated', { detail: { reason: 'building-remove' } }));
      this.menu.style.display = 'none';
    });
    mk('Move building', () => {
      this.moveFromPlot = plotId;
      this._highlightCompatibleDropTargets(plotId, true);
      this.menu.style.display = 'none';
    });
    mk('Change style', () => {
      const rec = this.layoutSerializer.ensurePlot(plotId);
      this._openStylePicker(plotId, buildingId, rec.style, { left: x, top: y });
      this.menu.style.display = 'none';
    });
    this._positionWithin(this.menu, x + 8, y + 8);
    this.menu.style.display = 'block';
  }

  _highlightCompatibleDropTargets(fromPlotId, active) {
    const from = this.layoutSerializer.ensurePlot(fromPlotId);
    const type = getBuildingType(from.building).portType ?? 'gauge';
    this.plotManager.entries().forEach((plot) => {
      if (!active) {
        plot.node.alpha = 1;
        return;
      }
      const target = this.layoutSerializer.ensurePlot(plot.id);
      const compatible = !target.signal || target.signal === from.signal || (plot.layout?.port_type ?? type) === type;
      plot.node.alpha = compatible ? 1 : 0.45;
    });
  }

  _attemptMove(targetPlotId, targetPlot) {
    const fromId = this.moveFromPlot;
    if (!fromId || fromId === targetPlotId) return;
    const source = this.layoutSerializer.ensurePlot(fromId);
    const target = this.layoutSerializer.ensurePlot(targetPlotId);
    const type = getBuildingType(source.building).portType ?? 'gauge';
    const compatible = !target.signal || (targetPlot.layout?.port_type ?? type) === type;
    if (!compatible) {
      const x0 = targetPlot.node.x;
      [x0 - 6, x0 + 6, x0 - 3, x0 + 3, x0].forEach((x, i) => window.setTimeout(() => { targetPlot.node.x = x; }, i * 45));
      this.moveFromPlot = null;
      this._highlightCompatibleDropTargets(fromId, false);
      return;
    }
    this.layoutSerializer.moveBuilding(fromId, targetPlotId);
    this.moveFromPlot = null;
    this._highlightCompatibleDropTargets(fromId, false);
    document.dispatchEvent(new CustomEvent('layout-updated', { detail: { reason: 'building-move' } }));
  }

  _toScreen(x, y) {
    const scale = this.world.scale.x || 1;
    return { x: this.world.x + x * scale, y: this.world.y + y * scale };
  }

  _positionWithin(node, x, y) {
    node.style.display = 'block';
    const rect = node.getBoundingClientRect();
    const nx = Math.max(6, Math.min(x, window.innerWidth - rect.width - 6));
    const ny = Math.max(6, Math.min(y, window.innerHeight - rect.height - 6));
    node.style.left = `${nx}px`;
    node.style.top = `${ny}px`;
  }
}

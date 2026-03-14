import { getBuildingType, listBuildingTypes } from '../scene/city/buildings.js';
import { makeDraggable, positionWithin, dismissOnOutsideClick, makePanel, makeMenu, makeMenuButton, makeMenuDivider, showToast } from '../ui_utils.js';

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
    this.panel = makePanel({ zIndex: 65, title: 'Building Picker', draggable: true });
    this.menu  = makeMenu(66);
  }

  _bindEvents() {
    document.addEventListener('plot-selected', (event) => {
      if (!this.editMode) return;
      if (this.moveFromPlot) { this._attemptMove(event.detail.plotId, event.detail.plot); return; }
      this.openForPlot(event.detail.plotId, event.detail.plot);
    });

    document.addEventListener('building-selected', (event) => {
      if (!this.editMode) return;
      this._openBuildingMenu(event.detail);
    });
  }

  setEditMode(active) {
    this.editMode = active;
    if (!active) {
      this.panel.style.display = 'none';
      this.menu.style.display  = 'none';
      this.moveFromPlot = null;
    }
  }

  openForPlot(plotId, plot) {
    const layout = this.layoutSerializer.ensurePlot(plotId);
    const portType = layout.signal
      ? (plot.layout?.port_type ?? plot.layout?.signal_type ?? 'gauge')
      : null;
    const buildings = listBuildingTypes().filter(
      (e) => !portType || e.portType === portType || (e.portType === 'rate' && portType === 'gauge')
    );

    // Clear previous content (keep the title bar added by makePanel)
    const titleBar = this.panel.firstElementChild;
    this.panel.innerHTML = '';
    if (titleBar) this.panel.appendChild(titleBar);

    if (buildings.length === 0) {
      const msg = document.createElement('div');
      msg.style.cssText = 'color:rgba(200,220,255,0.6);padding:8px 0;';
      msg.textContent = 'No compatible buildings for this signal type.';
      this.panel.appendChild(msg);
    } else {
      buildings.forEach((entry) => {
        const row = document.createElement('button');
        row.style.cssText = [
          'width:100%', 'text-align:left',
          'border:1px solid rgba(140,165,207,0.3)',
          'background:rgba(38,50,72,0.9)',
          'border-radius:8px', 'padding:9px 10px',
          'margin:3px 0', 'color:#e8f1ff',
          'cursor:pointer', 'transition:background 0.1s',
        ].join(';');
        row.innerHTML = `<div style="font-weight:600">${entry.label} <span style="opacity:.6;font-weight:400">(${entry.portType})</span></div>`;
        row.addEventListener('mouseenter', () => { row.style.background = 'rgba(60,85,120,0.9)'; });
        row.addEventListener('mouseleave', () => { row.style.background = 'rgba(38,50,72,0.9)'; });
        row.addEventListener('click', () => {
          const style = entry.styles?.[0] ?? 'default';
          this.layoutSerializer.setBuilding(plotId, entry.id, style);
          if (!layout.signal) plot.layout = { ...plot.layout, port_type: entry.portType };
          document.dispatchEvent(new CustomEvent('layout-updated', { detail: { reason: 'building-place' } }));
          this._openStylePicker(plotId, entry.id, style);
        });
        this.panel.appendChild(row);
      });
    }

    const screen = this._toScreen(plot.x, plot.y - 30);
    positionWithin(this.panel, screen.x + 12, screen.y - 280);
    this.panel.style.display = 'block';
  }

  _openStylePicker(plotId, buildingId, currentStyle) {
    const Type   = getBuildingType(buildingId);
    const styles = Type.styles ?? ['default'];
    if (styles.length <= 1) return; // nothing to pick

    const existing = this.panel.querySelector('.style-picker');
    if (existing) existing.remove();

    const picker = document.createElement('div');
    picker.className = 'style-picker';
    picker.style.cssText = 'margin-top:10px;padding-top:10px;border-top:1px solid rgba(144,178,221,0.2);';

    const label = document.createElement('div');
    label.style.cssText = 'font-weight:600;margin-bottom:6px;color:rgba(200,220,255,0.7);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;';
    label.textContent = 'Style';
    picker.appendChild(label);

    const chips = document.createElement('div');
    chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;';
    styles.forEach((style) => {
      const chip = document.createElement('button');
      chip.textContent = style.replace(/_/g, ' ');
      const isActive = style === currentStyle;
      chip.style.cssText = [
        'padding:4px 8px', 'border-radius:6px',
        `border:1px solid rgba(170,200,240,${isActive ? '0.8' : '0.35'})`,
        `background:${isActive ? 'rgba(79,106,148,0.9)' : 'rgba(44,59,84,0.9)'}`,
        'color:#e8f1ff', 'cursor:pointer',
        'font:11px system-ui,sans-serif',
        'transition:all 0.1s',
      ].join(';');
      chip.addEventListener('click', () => {
        this.layoutSerializer.setBuilding(plotId, buildingId, style);
        document.dispatchEvent(new CustomEvent('layout-updated', { detail: { reason: 'style-change' } }));
        // Re-render chips to reflect new selection
        this._openStylePicker(plotId, buildingId, style);
      });
      chips.appendChild(chip);
    });
    picker.appendChild(chips);
    this.panel.appendChild(picker);
    this.panel.style.display = 'block';
  }

  _openBuildingMenu({ plotId, x, y, buildingId }) {
    this.menu.innerHTML = '';
    const rec = this.layoutSerializer.ensurePlot(plotId);

    // Signal section
    if (rec.signal) {
      makeMenuButton(this.menu, `${rec.signal}`, () => {
        this.menu.style.display = 'none';
        document.dispatchEvent(new CustomEvent('request-signal-select', { detail: { plotId } }));
      }, { icon: '↺', color: '#7ad8f0' });
      makeMenuButton(this.menu, 'Disconnect signal', () => {
        this.layoutSerializer.removePipe(plotId);
        document.dispatchEvent(new CustomEvent('layout-updated', { detail: { reason: 'signal-disconnect' } }));
        this.menu.style.display = 'none';
      }, { icon: '✕', color: '#f07a7a' });
    } else {
      makeMenuButton(this.menu, 'Connect signal…', () => {
        this.menu.style.display = 'none';
        document.dispatchEvent(new CustomEvent('request-signal-select', { detail: { plotId } }));
      }, { icon: '⚡', color: '#ffd080' });
    }

    makeMenuDivider(this.menu);

    // Building actions
    makeMenuButton(this.menu, 'Change style', () => {
      this._openStylePicker(plotId, buildingId, rec.style);
      this.menu.style.display = 'none';
    }, { icon: '🎨' });
    makeMenuButton(this.menu, 'Move building', () => {
      this.moveFromPlot = plotId;
      this._highlightCompatibleDropTargets(plotId, true);
      this.menu.style.display = 'none';
      showToast('Click another plot to move the building there', 'info', 2200);
    }, { icon: '↔' });
    makeMenuButton(this.menu, 'Remove building', () => {
      this.layoutSerializer.removeBuilding(plotId);
      document.dispatchEvent(new CustomEvent('layout-updated', { detail: { reason: 'building-remove' } }));
      this.menu.style.display = 'none';
    }, { icon: '🗑', color: '#f07a7a' });

    positionWithin(this.menu, x + 8, y + 8);
    makeDraggable(this.menu);
    this.menu.style.display = 'block';
    dismissOnOutsideClick(this.menu);
  }

  _highlightCompatibleDropTargets(fromPlotId, active) {
    const from = this.layoutSerializer.ensurePlot(fromPlotId);
    const type = getBuildingType(from.building).portType ?? 'gauge';
    this.plotManager.entries().forEach((plot) => {
      if (!active) { plot.node.alpha = 1; return; }
      const target = this.layoutSerializer.ensurePlot(plot.id);
      const compatible = !target.signal || target.signal === from.signal || (plot.layout?.port_type ?? type) === type;
      plot.node.alpha = compatible ? 1 : 0.4;
    });
  }

  _attemptMove(targetPlotId, targetPlot) {
    const fromId = this.moveFromPlot;
    if (!fromId || fromId === targetPlotId) { this.moveFromPlot = null; return; }
    const source = this.layoutSerializer.ensurePlot(fromId);
    const target = this.layoutSerializer.ensurePlot(targetPlotId);
    const type = getBuildingType(source.building).portType ?? 'gauge';
    const compatible = !target.signal || (targetPlot.layout?.port_type ?? type) === type;
    if (!compatible) {
      const x0 = targetPlot.node.x;
      [x0-6, x0+6, x0-3, x0+3, x0].forEach((x, i) => window.setTimeout(() => { targetPlot.node.x = x; }, i * 45));
      showToast('Incompatible signal type', 'warn');
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
}
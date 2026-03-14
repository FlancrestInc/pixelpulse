import { showToast } from '../ui_utils.js';

/**
 * Coordinates edit-mode entry/exit transitions and panel state.
 */
export class EditController {
  constructor({ cityScene, signalLibrary, buildingPicker, valvePanel, layoutSerializer, pipeRenderer, world, signalBus }) {
    this.cityScene        = cityScene;
    this.signalLibrary    = signalLibrary;
    this.buildingPicker   = buildingPicker;
    this.valvePanel       = valvePanel;
    this.layoutSerializer = layoutSerializer;
    this.pipeRenderer     = pipeRenderer;
    this.world            = world;
    this.signalBus        = signalBus;
    this.mode             = 'display';
    this.transition       = null;
    this.targetMode       = null;
    this._buildUi();
  }

  get isEditMode() { return this.mode === 'edit'; }

  _buildUi() {
    // ⚙ / Done button
    this.button = document.createElement('button');
    this.button.style.cssText = [
      'position:fixed', 'right:14px', 'bottom:14px', 'z-index:80',
      'border:0', 'border-radius:999px',
      'background:rgba(47,64,95,0.95)',
      'color:#fff', 'font:700 15px system-ui,sans-serif',
      'padding:10px 16px', 'cursor:pointer',
      'box-shadow:0 4px 16px rgba(0,0,0,0.4)',
      'transition:background 0.15s',
    ].join(';');
    this._setButtonLabel();
    this.button.addEventListener('mouseenter', () => { this.button.style.background = 'rgba(70,95,140,0.95)'; });
    this.button.addEventListener('mouseleave', () => { this.button.style.background = 'rgba(47,64,95,0.95)'; });
    this.button.onclick = () => {
      if (this.transition) { this._snapToTarget(); return; }
      if (this.isEditMode) this.exitEditMode();
      else this.enterEditMode();
    };
    document.body.appendChild(this.button);

    // Bottom pipe-layer gradient
    this.pipeLayer = document.createElement('div');
    this.pipeLayer.style.cssText = [
      'position:fixed', 'left:0', 'right:0', 'bottom:0', 'height:220px',
      'transform:translateY(220px)',
      'background:linear-gradient(0deg,rgba(20,26,42,.96),rgba(20,26,42,.45))',
      'pointer-events:none', 'z-index:30',
    ].join(';');
    document.body.appendChild(this.pipeLayer);

    // Source node chips row
    this.sourceNodes = document.createElement('div');
    this.sourceNodes.style.cssText = [
      'position:fixed', 'left:340px', 'right:20px', 'bottom:12px',
      'height:88px', 'display:flex', 'align-items:center', 'gap:10px',
      'transform:translateY(120px)', 'opacity:0', 'z-index:42',
      'pointer-events:none', 'overflow-x:auto', 'padding:0 4px',
    ].join(';');
    document.body.appendChild(this.sourceNodes);
    this._refreshSourceNodes();
  }

  _setButtonLabel() {
    this.button.textContent = this.isEditMode ? 'Done ✓' : '⚙';
  }

  showSavedToast()     { showToast('✓ Layout saved', 'success', 2000); }
  showSaveFailedToast(){ showToast('Layout save failed — changes may not persist', 'error', 3000); }

  _setComponentEditState() {
    const e = this.mode === 'edit';
    this.cityScene.setAnimationPaused(e);
    this.cityScene.plotManager.setEditMode(e);
    this.signalLibrary.setEditMode(e);
    this.buildingPicker.setEditMode(e);
    this.valvePanel.setEditMode(e);
    this.pipeRenderer.setEditMode(e);
  }

  _snapToTarget() {
    if (!this.transition) return;
    window.cancelAnimationFrame(this.transition.raf);
    this._applyProgress(1, this.targetMode);
    this.mode = this.targetMode;
    this.transition = null;
    this._setButtonLabel();
    this._setComponentEditState();
  }

  _applyProgress(progress, direction) {
    const entering = direction === 'edit';
    const p    = entering ? progress : 1 - progress;
    const ease = 0.5 - Math.cos(Math.PI * p) / 2;

    this.world.y = this.world.baseY + (-48 * ease);
    this.cityScene.setSkyBrightness(1 - ease * 0.4);

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
    const seg   = (lo, hi) => clamp((p - lo) / (hi - lo), 0, 1);

    const pipeP  = seg(entering ? 0.18 : 0.00, entering ? 0.62 : 0.45);
    this.pipeLayer.style.transform = `translateY(${220 - 220 * pipeP}px)`;

    const srcP = seg(entering ? 0.24 : 0.06, entering ? 0.72 : 0.50);
    this.sourceNodes.style.transform = `translateY(${120 - 120 * srcP}px)`;
    this.sourceNodes.style.opacity   = String(srcP);

    const plotP  = seg(entering ? 0.36 : 0.00, entering ? 0.78 : 0.42);
    this.cityScene.plotManager.setHighlightProgress(plotP);

    const panelP = seg(entering ? 0.42 : 0.00, entering ? 0.92 : 0.50);
    this.signalLibrary.setSlide(panelP);
  }

  _animateTo(targetMode) {
    this.targetMode = targetMode;
    const t0 = performance.now();
    const tick = (now) => {
      const progress = Math.max(0, Math.min((now - t0) / 600, 1));
      this._applyProgress(progress, targetMode);
      if (progress >= 1) {
        this.mode = targetMode;
        this.transition = null;
        this._setButtonLabel();
        this._setComponentEditState();
        return;
      }
      this.transition.raf = window.requestAnimationFrame(tick);
    };
    this.transition = { raf: window.requestAnimationFrame(tick) };
  }

  _refreshSourceNodes() {
    this.sourceNodes.innerHTML = '';

    const lbl = document.createElement('div');
    lbl.style.cssText = 'color:rgba(120,160,200,0.7);font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;white-space:nowrap;flex-shrink:0;';
    lbl.textContent = 'SOURCES';
    this.sourceNodes.appendChild(lbl);

    const typeColors = { gauge: '#4fc3f7', rate: '#81c784', text: '#ffb74d', event: '#ce93d8', state: '#ef9a9a' };
    const seen = new Set();
    const signals = this.signalBus ? [...(this.signalBus.signalState?.values() ?? [])] : [];

    signals.forEach((signal) => {
      if (!signal?.id || signal.id === 'sky_time' || seen.has(signal.id)) return;
      seen.add(signal.id);
      const chip = document.createElement('div');
      chip.dataset.signalId = signal.id;
      chip.style.cssText = [
        'flex-shrink:0', 'padding:7px 10px',
        'background:rgba(30,44,68,0.95)',
        'border:1px solid rgba(120,165,215,0.35)',
        'border-radius:8px', 'color:#d8eeff',
        'font-size:11px', 'line-height:1.4',
        'min-width:88px', 'max-width:140px',
      ].join(';');
      const dot = `<span style="color:${typeColors[signal.type] ?? '#aaa'}">● </span>`;
      chip.innerHTML = `${dot}<strong style="font-size:11px">${signal.id}</strong>
        <div style="opacity:.6;font-size:10px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          ${signal.label ?? signal.source ?? ''}
        </div>`;
      this.sourceNodes.appendChild(chip);
    });
  }

  enterEditMode() {
    if (this.mode === 'edit') return;
    this._refreshSourceNodes();
    this._animateTo('edit');
  }

  async exitEditMode() {
    if (this.mode !== 'edit') return;
    try { await this.layoutSerializer.save(); }
    catch { this.showSaveFailedToast(); }
    this._animateTo('display');
  }
}
/**
 * Coordinates edit-mode entry/exit transitions and panel state.
 */
export class EditController {
  constructor({ cityScene, signalLibrary, buildingPicker, valvePanel, layoutSerializer, world }) {
    this.cityScene = cityScene;
    this.signalLibrary = signalLibrary;
    this.buildingPicker = buildingPicker;
    this.valvePanel = valvePanel;
    this.layoutSerializer = layoutSerializer;
    this.world = world;
    this.mode = 'display';
    this.transition = null;
    this.targetMode = null;
    this._buildUi();
  }

  get isEditMode() {
    return this.mode === 'edit';
  }

  _buildUi() {
    this.button = document.createElement('button');
    this.button.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:80;border:0;border-radius:999px;background:#2f405f;color:#fff;font:700 15px system-ui,sans-serif;padding:10px 14px;cursor:pointer;';
    this._setButtonLabel();
    this.button.onclick = () => {
      if (this.transition) {
        this._snapToTarget();
        return;
      }
      if (this.isEditMode) this.exitEditMode();
      else this.enterEditMode();
    };
    document.body.appendChild(this.button);

    this.cityWrap = document.getElementById('app');
    this.pipeLayer = document.createElement('div');
    this.pipeLayer.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:220px;transform:translateY(220px);background:linear-gradient(0deg,rgba(31,38,55,.95),rgba(31,38,55,.55));pointer-events:none;z-index:30;';
    document.body.appendChild(this.pipeLayer);

    this.sourceNodes = document.createElement('div');
    this.sourceNodes.style.cssText = 'position:fixed;left:340px;right:20px;bottom:10px;height:90px;display:flex;gap:10px;transform:translateY(120px);opacity:0;z-index:42;pointer-events:none;';
    this.sourceNodes.innerHTML = '<div style="padding:8px 10px;background:#27364f;border-radius:8px;color:#fff">Sources</div>';
    document.body.appendChild(this.sourceNodes);

    this.toast = document.createElement('div');
    this.toast.style.cssText = 'position:fixed;right:18px;bottom:64px;z-index:90;background:rgba(29,34,48,.95);color:#fff;border-radius:8px;padding:8px 10px;display:none;';
    document.body.appendChild(this.toast);
  }

  _setButtonLabel() {
    this.button.textContent = this.isEditMode ? 'Done ✓' : '⚙';
  }

  _showToast(message) {
    this.toast.textContent = message;
    this.toast.style.display = 'block';
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { this.toast.style.display = 'none'; }, 2200);
  }

  _setComponentEditState() {
    const isEditMode = this.mode === 'edit';
    this.cityScene.setAnimationPaused(isEditMode);
    this.cityScene.plotManager.setEditMode(isEditMode);
    this.signalLibrary.setEditMode(isEditMode);
    this.buildingPicker.setEditMode(isEditMode);
    this.valvePanel.setEditMode(isEditMode);
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
    const p = entering ? progress : 1 - progress;
    const ease = 0.5 - Math.cos(Math.PI * p) / 2;

    const cityY = -48 * ease;
    const dim = 1 - ease * 0.4;
    this.world.y = this.world.baseY + cityY;
    this.cityScene.setSkyBrightness(dim);

    const pipeStart = entering ? 0.18 : 0;
    const pipeEnd = entering ? 0.62 : 0.45;
    const pipeP = Math.max(0, Math.min((p - pipeStart) / (pipeEnd - pipeStart), 1));
    this.pipeLayer.style.transform = `translateY(${220 - 220 * pipeP}px)`;

    const srcStart = entering ? 0.24 : 0.06;
    const srcEnd = entering ? 0.72 : 0.5;
    const srcP = Math.max(0, Math.min((p - srcStart) / (srcEnd - srcStart), 1));
    this.sourceNodes.style.transform = `translateY(${120 - 120 * srcP}px)`;
    this.sourceNodes.style.opacity = `${srcP}`;

    const plotStart = entering ? 0.36 : 0.0;
    const plotEnd = entering ? 0.78 : 0.42;
    const plotP = Math.max(0, Math.min((p - plotStart) / (plotEnd - plotStart), 1));
    this.cityScene.plotManager.setHighlightProgress(plotP);

    const panelStart = entering ? 0.42 : 0;
    const panelEnd = entering ? 0.92 : 0.5;
    const panelP = Math.max(0, Math.min((p - panelStart) / (panelEnd - panelStart), 1));
    this.signalLibrary.setSlide(panelP);
  }

  _animateTo(targetMode) {
    this.targetMode = targetMode;
    const t0 = performance.now();
    const duration = 600;
    const tick = (now) => {
      const progress = Math.max(0, Math.min((now - t0) / duration, 1));
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

  /** Enter edit mode with 600ms ease-in-out timeline. */
  enterEditMode() {
    if (this.mode === 'edit') return;
    this._animateTo('edit');
  }

  /** Exit edit mode: save layout first, then animate out regardless of save result. */
  async exitEditMode() {
    if (this.mode !== 'edit') return;
    try {
      await this.layoutSerializer.save();
    } catch (_err) {
      this._showToast('Layout save failed — changes may not persist.');
    }
    this._animateTo('display');
  }
}

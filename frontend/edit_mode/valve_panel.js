import { makeDraggable, positionWithin, dismissOnOutsideClick } from '../ui_utils.js';

/** Valve configuration panel with live mini-gauge preview. */
export class ValvePanel {
  constructor(signalBus, layoutSerializer) {
    this.signalBus = signalBus;
    this.layoutSerializer = layoutSerializer;
    this.editMode = false;
    this.activePlotId = null;
    this._buildDom();
    this._bindEvents();
  }

  _buildDom() {
    this.panel = document.createElement('div');
    this.panel.style.cssText = [
      'position:fixed', 'display:none', 'z-index:68',
      'background:rgba(17,22,33,0.98)',
      'border:1px solid rgba(145,178,220,0.5)',
      'border-radius:10px', 'color:#e8f1ff',
      'padding:0', 'min-width:250px',
      'font:12px/1.35 system-ui,sans-serif',
      'box-shadow:0 8px 32px rgba(0,0,0,0.55)',
    ].join(';');

    // Drag handle / title bar
    this.titleBar = document.createElement('div');
    this.titleBar.style.cssText = [
      'display:flex', 'justify-content:space-between', 'align-items:center',
      'padding:10px 12px 8px', 'font-weight:700',
      'border-bottom:1px solid rgba(145,178,220,0.2)',
      'cursor:grab', 'user-select:none',
    ].join(';');
    this.titleBar.innerHTML = '<span>⚙ Valve</span>';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'border:0;background:transparent;color:rgba(200,220,255,0.5);font-size:14px;cursor:pointer;padding:0 2px;line-height:1;';
    closeBtn.addEventListener('click', () => this.close(true));
    this.titleBar.appendChild(closeBtn);
    this.panel.appendChild(this.titleBar);

    // Form body
    const body = document.createElement('div');
    body.style.cssText = 'padding:10px 12px;';
    this.panel.appendChild(body);

    this.rangeMin  = this._addInput(body, 'Range min (raw)',           'number', '0');
    this.rangeMax  = this._addInput(body, 'Range max (raw)',           'number', '1');
    this.threshold = this._addInput(body, 'Alert threshold (0.0–1.0)', 'number', '0.85', { min:'0', max:'1', step:'0.01' });
    this.label     = this._addInput(body, 'Display label',             'text',   '');

    // Mini gauge canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width  = 220;
    this.canvas.height = 90;
    this.canvas.style.cssText = 'display:block;width:100%;margin-top:8px;background:rgba(28,38,55,0.7);border-radius:6px;';
    body.appendChild(this.canvas);

    // Close button
    const saveClose = document.createElement('button');
    saveClose.textContent = 'Save & Close';
    saveClose.style.cssText = [
      'display:block', 'width:100%', 'margin-top:10px',
      'border:0', 'background:rgba(60,100,160,0.85)',
      'color:#fff', 'padding:8px', 'border-radius:7px',
      'cursor:pointer', 'font-weight:600',
      'transition:background 0.1s',
    ].join(';');
    saveClose.addEventListener('mouseenter', () => { saveClose.style.background = 'rgba(80,130,200,0.9)'; });
    saveClose.addEventListener('mouseleave', () => { saveClose.style.background = 'rgba(60,100,160,0.85)'; });
    saveClose.addEventListener('click', () => this.close(true));
    body.appendChild(saveClose);

    document.body.appendChild(this.panel);
    makeDraggable(this.panel, this.titleBar);
  }

  _addInput(parent, labelText, type, value, attrs = {}) {
    const wrap  = document.createElement('label');
    wrap.style.cssText = 'display:block;margin:7px 0;';
    const span  = document.createElement('span');
    span.style.cssText = 'display:block;margin-bottom:3px;color:rgba(200,220,255,0.7);';
    span.textContent = labelText;
    const input = document.createElement('input');
    input.type  = type;
    input.value = value;
    Object.assign(input, attrs);
    input.style.cssText = [
      'display:block', 'width:100%', 'box-sizing:border-box',
      'background:rgba(28,40,60,0.9)',
      'border:1px solid rgba(148,173,211,0.4)',
      'color:#e8f1ff', 'border-radius:6px', 'padding:5px 8px',
    ].join(';');
    // Live gauge redraw on change
    input.addEventListener('input', () => this._drawGauge());
    wrap.appendChild(span);
    wrap.appendChild(input);
    parent.appendChild(wrap);
    return input;
  }

  _bindEvents() {
    document.addEventListener('pipe-selected', (event) => {
      if (!this.editMode) return;
      this.open(event.detail);
    });
    this.signalBus.subscribeAny(() => {
      if (this.activePlotId) this._drawGauge();
    });
  }

  setEditMode(active) {
    this.editMode = active;
    if (!active) this.close(false);
  }

  open({ plotId, x, y }) {
    this.activePlotId = plotId;
    const plot  = this.layoutSerializer.ensurePlot(plotId);
    const valve = plot.valve ?? { range_min: 0, range_max: 1, alert_threshold: 0.85, label: plot.signal ?? '' };
    this.rangeMin.value  = valve.range_min  ?? 0;
    this.rangeMax.value  = valve.range_max  ?? 1;
    this.threshold.value = valve.alert_threshold ?? 0.85;
    this.label.value     = valve.label ?? plot.signal ?? '';

    positionWithin(this.panel, x + 12, y + 12);
    this.panel.style.display = 'block';
    this._drawGauge();
    dismissOnOutsideClick(this.panel, () => this.close(false));
  }

  close(save) {
    if (save && this.activePlotId) {
      this.layoutSerializer.setValve(this.activePlotId, {
        range_min:       Number(this.rangeMin.value),
        range_max:       Number(this.rangeMax.value),
        alert_threshold: Number(this.threshold.value),
        label:           this.label.value,
      });
      document.dispatchEvent(new CustomEvent('layout-updated', { detail: { reason: 'valve-save' } }));
    }
    this.activePlotId = null;
    this.panel.style.display = 'none';
  }

  _drawGauge() {
    const ctx    = this.canvas.getContext('2d');
    const w = this.canvas.width, h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2, cy = h - 16, radius = h - 28;
    const plot  = this.layoutSerializer.ensurePlot(this.activePlotId);
    const signal = this.signalBus.getSignal(plot.signal);
    const min   = Number(this.rangeMin.value);
    const max   = Number(this.rangeMax.value) || 1;
    const raw   = Number(signal?.value ?? min);
    const norm  = Math.max(0, Math.min((raw - min) / Math.max(max - min, 1e-6), 1));
    const thr   = Math.max(0, Math.min(Number(this.threshold.value), 1));

    const start = Math.PI, sweep = Math.PI;

    // Track background
    ctx.lineWidth   = 12;
    ctx.strokeStyle = 'rgba(50,70,100,0.8)';
    ctx.lineCap     = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, radius, start, start + sweep); ctx.stroke();

    // Value arc
    ctx.strokeStyle = norm > thr ? '#f07a7a' : '#7ad8a8';
    ctx.beginPath(); ctx.arc(cx, cy, radius, start, start + sweep * norm); ctx.stroke();

    // Threshold marker
    const markerAngle = start + sweep * thr;
    ctx.strokeStyle = '#ffb74d';
    ctx.lineWidth   = 3;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(markerAngle) * (radius - 14), cy + Math.sin(markerAngle) * (radius - 14));
    ctx.lineTo(cx + Math.cos(markerAngle) * (radius + 14), cy + Math.sin(markerAngle) * (radius + 14));
    ctx.stroke();

    // Value text
    ctx.fillStyle = '#e8f1ff';
    ctx.font      = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`${(norm * 100).toFixed(0)}%`, cx, cy - 4);

    // Min / max labels
    ctx.fillStyle = 'rgba(180,200,230,0.6)';
    ctx.font      = '10px system-ui';
    ctx.textAlign = 'left';  ctx.fillText(String(min), cx - radius - 4, cy + 14);
    ctx.textAlign = 'right'; ctx.fillText(String(max), cx + radius + 4, cy + 14);
  }
}
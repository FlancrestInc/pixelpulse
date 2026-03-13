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
    this.panel.style.cssText = 'position:fixed;display:none;z-index:68;background:rgba(17,22,33,0.98);border:1px solid rgba(145,178,220,0.5);border-radius:10px;color:#fff;padding:10px;min-width:240px;font:12px/1.35 system-ui,sans-serif;';
    this.panel.innerHTML = '<div style="font-weight:700;margin-bottom:8px">Valve</div>';

    this.rangeMin = this._addInput('Signal range min', 'number', '0');
    this.rangeMax = this._addInput('Signal range max', 'number', '1');
    this.threshold = this._addInput('Alert threshold (0.0–1.0)', 'number', '0.85', { min: '0', max: '1', step: '0.01' });
    this.label = this._addInput('Label', 'text', '');

    this.canvas = document.createElement('canvas');
    this.canvas.width = 200;
    this.canvas.height = 90;
    this.canvas.style.cssText = 'width:100%;margin-top:8px;background:rgba(38,48,70,0.65);border-radius:6px;';
    this.panel.appendChild(this.canvas);

    const close = document.createElement('button');
    close.textContent = 'Close';
    close.style.cssText = 'margin-top:8px;border:0;background:#4d6791;color:#fff;padding:6px 10px;border-radius:6px;cursor:pointer;';
    close.onclick = () => this.close(true);
    this.panel.appendChild(close);

    document.body.appendChild(this.panel);
  }

  _addInput(label, type, value, attrs = {}) {
    const wrap = document.createElement('label');
    wrap.style.cssText = 'display:block;margin:6px 0;';
    wrap.textContent = label;
    const input = document.createElement('input');
    input.type = type;
    input.value = value;
    Object.assign(input, attrs);
    input.style.cssText = 'display:block;width:100%;margin-top:4px;background:#243349;border:1px solid rgba(148,173,211,0.45);color:#fff;border-radius:6px;padding:5px;';
    wrap.appendChild(input);
    this.panel.appendChild(wrap);
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
    const plot = this.layoutSerializer.ensurePlot(plotId);
    const valve = plot.valve ?? { range_min: 0, range_max: 1, alert_threshold: 0.85, label: plot.signal ?? '' };
    this.rangeMin.value = valve.range_min ?? 0;
    this.rangeMax.value = valve.range_max ?? 1;
    this.threshold.value = valve.alert_threshold ?? 0.85;
    this.label.value = valve.label ?? plot.signal ?? '';
    this.panel.style.left = `${Math.max(8, Math.min(x + 10, window.innerWidth - 260))}px`;
    this.panel.style.top = `${Math.max(8, Math.min(y + 10, window.innerHeight - 340))}px`;
    this.panel.style.display = 'block';
    this._drawGauge();
  }

  close(save) {
    if (save && this.activePlotId) {
      this.layoutSerializer.setValve(this.activePlotId, {
        range_min: Number(this.rangeMin.value),
        range_max: Number(this.rangeMax.value),
        alert_threshold: Number(this.threshold.value),
        label: this.label.value,
      });
      document.dispatchEvent(new CustomEvent('layout-updated', { detail: { reason: 'valve-save' } }));
    }
    this.activePlotId = null;
    this.panel.style.display = 'none';
  }

  _drawGauge() {
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const cx = 100;
    const cy = 74;
    const radius = 54;
    const plot = this.layoutSerializer.ensurePlot(this.activePlotId);
    const signal = this.signalBus.getSignal(plot.signal);
    const min = Number(this.rangeMin.value);
    const max = Number(this.rangeMax.value) || 1;
    const value = Number(signal?.value ?? min);
    const normalized = Math.max(0, Math.min((value - min) / Math.max(max - min, 1e-6), 1));
    const threshold = Math.max(0, Math.min(Number(this.threshold.value), 1));

    const start = Math.PI;
    const end = Math.PI * 2;
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#334560';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, end);
    ctx.stroke();

    ctx.strokeStyle = '#7ad8a8';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, start + (end - start) * normalized);
    ctx.stroke();

    const marker = start + (end - start) * threshold;
    ctx.strokeStyle = '#ff7f82';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(marker) * (radius - 12), cy + Math.sin(marker) * (radius - 12));
    ctx.lineTo(cx + Math.cos(marker) * (radius + 12), cy + Math.sin(marker) * (radius + 12));
    ctx.stroke();
  }
}

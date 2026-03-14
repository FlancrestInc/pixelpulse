import { showToast, makePanel, positionWithin, dismissOnOutsideClick } from '../ui_utils.js';

const PANEL_WIDTH = 320;

/** Signal library + adapter/source configuration flow for edit mode. */
export class SignalLibrary {
  constructor(signalBus, layoutSerializer) {
    this.signalBus       = signalBus;
    this.layoutSerializer = layoutSerializer;
    this.signals          = new Map();
    this.editMode         = false;
    this.dragSignal       = null;
    this._pendingPlotId   = null;
    this._pendingPortType = null;
    this._buildDom();
    this._bindBus();
    this._bindPlotDrop();
  }

  _buildDom() {
    this.panel = document.createElement('aside');
    Object.assign(this.panel.style, {
      position: 'fixed', top: '0', left: '0',
      width: `${PANEL_WIDTH}px`, height: '100%',
      transform: `translateX(-${PANEL_WIDTH}px)`,
      background: 'rgba(14,18,28,0.97)',
      borderRight: '1px solid rgba(146,183,229,0.25)',
      color: '#e8f1ff', zIndex: '40',
      font: '12px/1.4 system-ui, sans-serif',
      display: 'flex', flexDirection: 'column',
      boxShadow: '4px 0 24px rgba(0,0,0,0.4)',
    });

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'padding:14px 16px 12px;border-bottom:1px solid rgba(146,183,229,0.18);font-weight:700;font-size:13px;letter-spacing:0.3px;flex-shrink:0;';
    header.textContent = 'Signal Library';
    this.panel.appendChild(header);

    // Status bar
    this.statusBar = document.createElement('div');
    this.statusBar.style.cssText = [
      'padding:8px 14px', 'font-size:11px',
      'color:#8ab4d4', 'min-height:40px',
      'border-bottom:1px solid rgba(146,183,229,0.12)',
      'line-height:1.45', 'flex-shrink:0',
    ].join(';');
    this.statusBar.textContent = 'Click a signal to select it, then click a plot on the city.';
    this.panel.appendChild(this.statusBar);

    // Signal sections
    this.inUse     = this._section('In use');
    this.available = this._section('Available');
    this.panel.appendChild(this.inUse.wrap);
    this.panel.appendChild(this.available.wrap);

    // Add source button
    this.addButton = document.createElement('button');
    this.addButton.textContent = '+ Add Source';
    this.addButton.style.cssText = [
      'margin:10px 12px 12px', 'border:0',
      'border-radius:8px', 'background:rgba(60,100,180,0.85)',
      'color:#fff', 'padding:10px', 'font-weight:700',
      'cursor:pointer', 'flex-shrink:0',
      'transition:background 0.1s',
    ].join(';');
    this.addButton.addEventListener('mouseenter', () => { this.addButton.style.background = 'rgba(80,130,210,0.9)'; });
    this.addButton.addEventListener('mouseleave', () => { this.addButton.style.background = 'rgba(60,100,180,0.85)'; });
    this.addButton.addEventListener('click', () => this._openAdapterFlow());
    this.panel.appendChild(this.addButton);

    document.body.appendChild(this.panel);
  }

  _section(title) {
    const wrap = document.createElement('section');
    wrap.style.cssText = 'padding:10px 12px;overflow-y:auto;flex:1;min-height:60px;';
    const heading = document.createElement('div');
    heading.textContent = title;
    heading.style.cssText = 'font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:rgba(181,201,239,0.7);margin-bottom:8px;';
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
    wrap.append(heading, body);
    return { wrap, body };
  }

  _bindBus() {
    document.addEventListener('request-signal-select', (event) => {
      if (!this.editMode) return;
      this._pendingPlotId   = event.detail.plotId;
      this._pendingPortType = event.detail.portType ?? null;
      this.dragSignal       = null;

      // Highlight the panel border to draw the eye
      this.panel.style.borderRight = '2px solid rgba(255,208,80,0.8)';
      this.panel.style.boxShadow   = '4px 0 24px rgba(255,180,0,0.2)';

      const typeLabel = this._pendingPortType ? ` (${this._pendingPortType})` : '';
      this.statusBar.style.background = 'rgba(60,45,10,0.6)';
      this.statusBar.innerHTML = `<span style="color:#ffd080;font-weight:700">⚡ Select a signal${typeLabel}</span><br><span style="color:rgba(255,220,100,0.8)">Compatible signals are highlighted below. Click one to connect it to <strong>${event.detail.plotId}</strong>.</span>`;
      this.setSlide(1);
      this.render();
    });

    this.signalBus.subscribeAny((signal) => {
      if (!signal?.id) return;
      const existing = this.signals.get(signal.id);
      this.signals.set(signal.id, { ...(existing ?? signal), ...signal });
      if (existing) { this._updateSignalValue(signal.id, signal.value); return; }
      this.render();
    });
  }

  _updateSignalValue(signalId, value) {
    const node = this.panel.querySelector(`[data-signal-id="${CSS.escape(signalId)}"]`);
    if (node) node.textContent = String(value ?? '--');
  }

  _bindPlotDrop() {
    document.addEventListener('plot-selected', (event) => {
      if (!this.editMode || !this.dragSignal) return;
      const { plot } = event.detail;
      if (!plot) return;
      const accepted = (plot.layout?.port_type ?? plot.layout?.signal_type ?? this.dragSignal.type ?? 'gauge');
      if (accepted && accepted !== this.dragSignal.type && !(accepted === 'rate' && this.dragSignal.type === 'gauge')) {
        this._shake(plot.node);
        showToast('Incompatible signal type', 'warn');
        this.dragSignal = null;
        return;
      }
      this._connectSignalToPlot(this.dragSignal, plot.id);
      this.dragSignal = null;
    });
  }

  _connectSignalToPlot(signal, plotId) {
    const defaultValve = { range_min: 0, range_max: 1, alert_threshold: 0.85, label: signal.label || signal.id };
    this.layoutSerializer.setPipe(plotId, signal.id, defaultValve);
    const current = this.layoutSerializer.ensurePlot(plotId);
    if (current.building) this.layoutSerializer.setValve(plotId, defaultValve);
    document.dispatchEvent(new CustomEvent('layout-updated', { detail: { reason: 'signal-connect' } }));
    this.statusBar.textContent = 'Click a signal to select it, then click a plot on the city.';
    this.statusBar.style.color = '#8ab4d4';
    this.statusBar.style.background = 'transparent';
    this.panel.style.borderRight = '1px solid rgba(146,183,229,0.25)';
    this.panel.style.boxShadow   = '4px 0 24px rgba(0,0,0,0.4)';
    this._pendingPortType = null;
  }

  _selectSignal(signal) {
    // Immediate connect if triggered from building menu
    if (this._pendingPlotId) {
      const plotId = this._pendingPlotId;
      this._pendingPlotId = null;
      this._connectSignalToPlot(signal, plotId);
      this.dragSignal = null;
      this.render();
      showToast(`Connected ${signal.id} → ${plotId}`, 'success');
      return;
    }

    // Toggle selection
    if (this.dragSignal?.id === signal.id) {
      this.dragSignal = null;
      this.statusBar.textContent = 'Click a signal to select it, then click a plot on the city.';
      this.statusBar.style.color = '#8ab4d4';
      this.render();
      return;
    }

    this.dragSignal = signal;
    this.statusBar.innerHTML = `<span style="color:#a8f0c6">✓ <strong>${signal.id}</strong> selected</span><br>Now click a plot slot on the city street.`;
    document.dispatchEvent(new CustomEvent('signal-highlight', { detail: { signalId: signal.id } }));
    this.render();
  }

  _shake(node) {
    const x0 = node.x;
    [x0-6, x0+6, x0-3, x0+3, x0].forEach((x, i) => window.setTimeout(() => { node.x = x; }, i * 45));
  }

  setEditMode(active) { this.editMode = active; }

  setSlide(progress) {
    const x = -PANEL_WIDTH + PANEL_WIDTH * Math.max(0, Math.min(1, progress));
    this.panel.style.transform = `translateX(${x}px)`;
  }

  render() {
    const used = new Set(this.layoutSerializer.serialize().plots.map((p) => p.signal).filter(Boolean));
    this.inUse.body.innerHTML     = '';
    this.available.body.innerHTML = '';
    [...this.signals.values()].forEach((signal) => {
      const node = this._buildSignalNode(signal, used.has(signal.id));
      (used.has(signal.id) ? this.inUse.body : this.available.body).appendChild(node);
    });
  }

  _buildSignalNode(signal, inUse) {
    const isSelected = this.dragSignal?.id === signal.id;

    // Compatibility with pending port type
    const isCompatible = !this._pendingPortType
      || signal.type === this._pendingPortType
      || (this._pendingPortType === 'gauge' && signal.type === 'rate')
      || (this._pendingPortType === 'rate'  && signal.type === 'gauge');
    const isPending  = !!this._pendingPlotId;
    const isIncompat = isPending && !isCompatible;

    const node = document.createElement('div');
    let borderColor = 'rgba(124,161,215,0.3)';
    let bgColor     = inUse ? 'rgba(35,50,80,0.8)' : 'rgba(28,38,58,0.75)';
    if (isSelected)   { borderColor = 'rgba(100,220,180,0.9)'; bgColor = 'rgba(25,75,58,0.95)'; }
    else if (isPending && isCompatible)  { borderColor = 'rgba(255,208,80,0.7)'; bgColor = inUse ? 'rgba(55,50,20,0.9)' : 'rgba(45,42,15,0.85)'; }
    else if (isIncompat) { bgColor = 'rgba(20,22,32,0.5)'; }

    node.style.cssText = [
      'border-radius:8px', 'padding:9px 10px',
      `border:1px solid ${borderColor}`,
      `background:${bgColor}`,
      `cursor:${isIncompat ? 'not-allowed' : 'pointer'}`,
      `opacity:${isIncompat ? '0.4' : '1'}`,
      'transition:all 0.1s',
    ].join(';');
    if (inUse && !isPending) node.style.boxShadow = '0 0 0 1px rgba(161,255,199,0.3) inset';
    if (isPending && isCompatible && !isSelected) node.style.boxShadow = '0 0 0 1px rgba(255,208,80,0.35) inset';

    node.draggable = !isIncompat;
    if (!isIncompat) {
      node.addEventListener('dragstart', () => this._selectSignal(signal));
      node.addEventListener('click',     () => this._selectSignal(signal));
    } else {
      node.addEventListener('click', () => {
        showToast(`${signal.id} (${signal.type}) is not compatible — need ${this._pendingPortType}`, 'warn');
      });
    }
    node.addEventListener('mouseenter', () => {
      if (!isSelected) node.style.background = 'rgba(45,65,100,0.9)';
    });
    node.addEventListener('mouseleave', () => {
      if (!isSelected) node.style.background = inUse ? 'rgba(35,50,80,0.8)' : 'rgba(28,38,58,0.75)';
    });

    const typeColors = { gauge: '#4fc3f7', rate: '#81c784', text: '#ffb74d', event: '#ce93d8', state: '#ef9a9a' };
    const typeIcon   = { gauge: '🧭', rate: '⏱️', text: '📰', event: '⚡', state: '🚦' };
    const dot   = `<span style="color:${typeColors[signal.type] ?? '#aaa'};margin-right:4px">●</span>`;
    const icon  = typeIcon[signal.type] ?? '🔧';
    const badge = isPending && isCompatible
      ? `<span style="background:rgba(255,200,60,0.25);color:#ffd080;border:1px solid rgba(255,200,60,0.5);border-radius:4px;padding:1px 5px;font-size:10px;margin-left:4px">✓ compatible</span>`
      : '';

    node.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div>
          <div style="font-weight:600;margin-bottom:2px">${dot}${signal.id}${badge}</div>
          <div style="opacity:.65;font-size:11px">${signal.label ?? ''}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <span style="background:rgba(40,60,100,0.7);padding:1px 6px;border-radius:999px;font-size:10px">${signal.source ?? ''}</span>
          <div data-signal-id="${signal.id}" style="margin-top:4px;color:#9ad4f5;font-size:11px">${String(signal.value ?? '--')}</div>
        </div>
      </div>`;

    if (signal.source === 'prometheus') {
      const details = document.createElement('details');
      details.style.marginTop = '6px';
      details.innerHTML = `<summary style="cursor:pointer;font-size:11px;opacity:.7">Source details</summary>
        <div style="padding-top:5px;opacity:.8;font-size:11px">
          PromQL: ${signal.metadata?.promql ?? '--'}<br>
          URL: ${signal.metadata?.prometheus_url ?? '--'}
        </div>`;
      node.appendChild(details);
    }

    const remove = document.createElement('button');
    remove.textContent = 'Remove';
    remove.style.cssText = 'margin-top:7px;border:0;background:rgba(100,40,50,0.7);color:#ffaaaa;padding:3px 8px;border-radius:5px;cursor:pointer;font-size:11px;';
    remove.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await fetch(`/api/config/adapters/${encodeURIComponent(signal.id)}`, { method: 'DELETE' });
        this.layoutSerializer.removeSignal(signal.id);
        this.signals.delete(signal.id);
        document.dispatchEvent(new CustomEvent('layout-updated', { detail: { reason: 'remove-source' } }));
        this.render();
      } catch {
        showToast('Failed to remove source', 'error');
      }
    });
    node.appendChild(remove);
    return node;
  }

  async _openAdapterFlow() {
    const overlay = makePanel({
      zIndex: 70, padding: '0',
      minWidth: '460px', maxWidth: '520px',
      draggable: true, title: 'Add Source',
    });

    const body = document.createElement('div');
    body.style.cssText = 'padding:12px 14px;';
    overlay.appendChild(body);

    positionWithin(overlay, 340, 80);
    overlay.style.display = 'block';

    let adapters = [];
    try {
      adapters = await fetch('/api/adapters').then((r) => r.json()).then((r) => r.adapters ?? []);
    } catch {
      adapters = ['system', 'weather', 'rss_feed', 'http_poll', 'webhook', 'shell', 'file_watcher'];
    }

    const state = { step: 1, adapter: null, config: {}, signal: { id: '', label: '' } };

    const INPUT_CSS = 'display:block;width:100%;box-sizing:border-box;background:rgba(28,40,60,0.9);border:1px solid rgba(148,173,211,0.4);color:#e8f1ff;border-radius:6px;padding:7px 9px;margin-top:6px;';
    const BTN_CSS   = 'border:0;border-radius:7px;padding:8px 14px;cursor:pointer;font-weight:600;margin-top:10px;';

    const renderStep = () => {
      body.innerHTML = '';
      const step = document.createElement('div');
      step.style.cssText = 'color:rgba(180,200,240,0.6);font-size:11px;margin-bottom:10px;';
      step.textContent = `Step ${state.step} of 4`;
      body.appendChild(step);

      const next = () => { state.step++; renderStep(); };

      if (state.step === 1) {
        const lbl = document.createElement('div'); lbl.textContent = 'Choose adapter type'; body.appendChild(lbl);
        const sel = document.createElement('select');
        sel.style.cssText = INPUT_CSS;
        adapters.forEach((a) => { const o = document.createElement('option'); o.value = o.textContent = a; sel.appendChild(o); });
        body.appendChild(sel);
        const btn = document.createElement('button');
        btn.textContent = 'Next →'; btn.style.cssText = BTN_CSS + 'background:rgba(60,100,180,0.85);color:#fff;';
        btn.onclick = () => { state.adapter = sel.value; next(); };
        body.appendChild(btn);

      } else if (state.step === 2) {
        const prom = state.adapter === 'prometheus';
        const lbl = document.createElement('div'); lbl.textContent = `Configure ${state.adapter}`; body.appendChild(lbl);
        const url = document.createElement('input'); url.placeholder = 'URL (if applicable)'; url.style.cssText = INPUT_CSS; body.appendChild(url);
        let queryEl = null;
        if (prom) {
          queryEl = document.createElement('textarea');
          queryEl.placeholder = 'PromQL query'; queryEl.style.cssText = INPUT_CSS + 'height:80px;resize:vertical;';
          body.appendChild(queryEl);
          const testBtn = document.createElement('button');
          testBtn.textContent = 'Test Query'; testBtn.style.cssText = BTN_CSS + 'background:rgba(40,80,60,0.8);color:#aaffcc;margin-right:8px;';
          const out = document.createElement('div'); out.style.cssText = 'margin-top:6px;font-size:11px;opacity:.8;';
          testBtn.onclick = async () => {
            out.textContent = 'Testing…';
            try {
              const res = await fetch('/api/prometheus/test', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url: url.value, query: queryEl.value }) }).then(r => r.json());
              out.textContent = res.ok ? `✓ Value: ${res.value}` : `✗ ${res.error}`;
            } catch { out.textContent = '✗ Connection failed'; }
          };
          body.appendChild(testBtn); body.appendChild(out);
        }
        const btn = document.createElement('button');
        btn.textContent = 'Next →'; btn.style.cssText = BTN_CSS + 'background:rgba(60,100,180,0.85);color:#fff;';
        btn.onclick = () => { state.config.url = url.value; if (prom) state.config.query = queryEl?.value; next(); };
        body.appendChild(btn);

      } else if (state.step === 3) {
        const lbl = document.createElement('div'); lbl.textContent = 'Name this signal'; body.appendChild(lbl);
        const idEl = document.createElement('input'); idEl.placeholder = 'signal_id (e.g. cpu_load)'; idEl.style.cssText = INPUT_CSS; body.appendChild(idEl);
        const lblEl = document.createElement('input'); lblEl.placeholder = 'Display label'; lblEl.style.cssText = INPUT_CSS; body.appendChild(lblEl);
        const btn = document.createElement('button');
        btn.textContent = 'Next →'; btn.style.cssText = BTN_CSS + 'background:rgba(60,100,180,0.85);color:#fff;';
        btn.onclick = () => { state.signal.id = idEl.value; state.signal.label = lblEl.value; next(); };
        body.appendChild(btn);

      } else {
        const lbl = document.createElement('div'); lbl.textContent = 'Confirm'; body.appendChild(lbl);
        const pre = document.createElement('pre');
        pre.style.cssText = 'background:rgba(20,28,44,0.8);padding:10px;border-radius:6px;font-size:11px;overflow:auto;white-space:pre-wrap;margin:8px 0;';
        pre.textContent = JSON.stringify({ adapter: state.adapter, ...state.config, ...state.signal }, null, 2);
        body.appendChild(pre);
        const createBtn = document.createElement('button');
        createBtn.textContent = '✓ Create';
        createBtn.style.cssText = BTN_CSS + 'background:rgba(40,120,70,0.85);color:#aaffcc;margin-right:8px;';
        createBtn.onclick = async () => {
          const payload = { id: state.signal.id, label: state.signal.label, adapter: state.adapter, ...state.config };
          try {
            const response = await fetch('/api/config/adapters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adapter_config: payload }) });
            if (response.ok) {
              this.signals.set(payload.id, { id: payload.id, label: payload.label, value: '--', source: state.adapter, type: 'gauge', metadata: { promql: state.config.query, prometheus_url: state.config.url } });
              this.render(); overlay.remove();
              showToast(`Source "${payload.id}" added`, 'success');
            } else { showToast('Failed to create adapter', 'error'); }
          } catch { showToast('Network error', 'error'); }
        };
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel'; cancelBtn.style.cssText = BTN_CSS + 'background:rgba(60,30,30,0.7);color:#ffaaaa;';
        cancelBtn.onclick = () => overlay.remove();
        body.appendChild(createBtn); body.appendChild(cancelBtn);
      }
    };
    renderStep();
  }
}
const PANEL_WIDTH = 320;

/** Signal library + adapter/source configuration flow for edit mode. */
export class SignalLibrary {
  constructor(signalBus, layoutSerializer) {
    this.signalBus = signalBus;
    this.layoutSerializer = layoutSerializer;
    this.signals = new Map();
    this.editMode = false;
    this.dragSignal = null;
    this._buildDom();
    this._bindBus();
    this._bindPlotDrop();
  }

  _buildDom() {
    this.panel = document.createElement('aside');
    Object.assign(this.panel.style, {
      position: 'fixed', top: '0', left: '0', width: `${PANEL_WIDTH}px`, height: '100%',
      transform: `translateX(-${PANEL_WIDTH}px)`, background: 'rgba(16,20,30,0.96)', borderRight: '1px solid rgba(146,183,229,0.3)',
      color: '#e8f1ff', zIndex: '40', font: '12px/1.4 system-ui, sans-serif', display: 'flex', flexDirection: 'column',
    });
    this.panel.innerHTML = `<div style="padding:12px 14px;border-bottom:1px solid rgba(146,183,229,0.2);font-weight:700">Signal Library</div>`;
    this.inUse = this._section('Connected & in use');
    this.available = this._section('Connected & available');
    this.addButton = document.createElement('button');
    this.addButton.textContent = 'Add Source';
    this.addButton.style.cssText = 'margin:12px;border:0;border-radius:8px;background:#4b79b9;color:#fff;padding:10px;font-weight:700;cursor:pointer;';
    this.addButton.addEventListener('click', () => this._openAdapterFlow());
    this.panel.append(this.inUse.wrap, this.available.wrap, this.addButton);
    document.body.appendChild(this.panel);

    this.toast = document.createElement('div');
    this.toast.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:rgba(23,28,41,0.95);color:#fff;padding:8px 12px;border-radius:8px;display:none;z-index:55;';
    document.body.appendChild(this.toast);
  }

  _section(title) {
    const wrap = document.createElement('section');
    wrap.style.cssText = 'padding:10px;overflow:auto;flex:1;';
    const heading = document.createElement('div');
    heading.textContent = title;
    heading.style.cssText = 'font-weight:700;color:#b5c9ef;margin-bottom:8px;';
    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    wrap.append(heading, body);
    return { wrap, body };
  }

  _bindBus() {
    this.signalBus.subscribeAny((signal) => {
      if (!signal?.id) return;
      const entry = this.signals.get(signal.id) ?? { ...signal, value: signal.value };
      Object.assign(entry, signal);
      this.signals.set(signal.id, entry);
      this.render();
    });
  }

  _bindPlotDrop() {
    document.addEventListener('plot-selected', (event) => {
      if (!this.editMode || !this.dragSignal) return;
      const { plot } = event.detail;
      if (!plot) return;
      const accepted = (plot.layout?.port_type ?? plot.layout?.signal_type ?? this.dragSignal.type ?? 'gauge');
      if (accepted && accepted !== this.dragSignal.type && !(accepted === 'rate' && this.dragSignal.type === 'gauge')) {
        this._shake(plot.node);
        this._showToast('Incompatible signal type');
        this.dragSignal = null;
        return;
      }
      const defaultValve = { range_min: 0, range_max: 1, alert_threshold: 0.85, label: this.dragSignal.label || this.dragSignal.id };
      this.layoutSerializer.setPipe(plot.id, this.dragSignal.id, defaultValve);
      const current = this.layoutSerializer.ensurePlot(plot.id);
      if (current.building) this.layoutSerializer.setValve(plot.id, defaultValve);
      document.dispatchEvent(new CustomEvent('layout-updated', { detail: { reason: 'signal-drop' } }));
      this.dragSignal = null;
    });
  }

  _shake(node) {
    const keyframes = [{ x: node.x }, { x: node.x - 6 }, { x: node.x + 6 }, { x: node.x - 3 }, { x: node.x + 3 }, { x: node.x }];
    let i = 0;
    const tick = () => {
      if (i >= keyframes.length) return;
      node.x = keyframes[i].x;
      i += 1;
      window.setTimeout(tick, 35);
    };
    tick();
  }

  _showToast(message) {
    this.toast.textContent = message;
    this.toast.style.display = 'block';
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { this.toast.style.display = 'none'; }, 1400);
  }

  setEditMode(active) {
    this.editMode = active;
  }

  setSlide(progress) {
    const x = -PANEL_WIDTH + PANEL_WIDTH * Math.max(0, Math.min(1, progress));
    this.panel.style.transform = `translateX(${x}px)`;
  }

  render() {
    const used = new Set(this.layoutSerializer.serialize().plots.map((plot) => plot.signal).filter(Boolean));
    this.inUse.body.innerHTML = '';
    this.available.body.innerHTML = '';
    [...this.signals.values()].forEach((signal) => {
      const node = this._buildSignalNode(signal, used.has(signal.id));
      (used.has(signal.id) ? this.inUse.body : this.available.body).appendChild(node);
    });
  }

  _buildSignalNode(signal, inUse) {
    const node = document.createElement('div');
    node.style.cssText = 'border:1px solid rgba(124,161,215,0.35);border-radius:8px;padding:8px;background:rgba(39,48,69,0.75);';
    node.draggable = true;
    node.addEventListener('dragstart', () => { this.dragSignal = signal; });
    node.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('signal-highlight', { detail: { signalId: signal.id } }));
    });

    const icon = this._icon(signal.type);
    const source = signal.source ?? 'unknown';
    node.innerHTML = `<div style="display:flex;justify-content:space-between;gap:8px"><div>${icon} <strong>${signal.id}</strong><div style="opacity:.8">${signal.label ?? signal.id}</div></div><div style="text-align:right"><span style="background:#3f4f72;padding:2px 6px;border-radius:999px">${source}</span><div style="margin-top:6px;color:#bde5ff">${String(signal.value ?? '--')}</div></div></div>`;

    if (signal.source === 'prometheus') {
      const details = document.createElement('details');
      details.style.marginTop = '8px';
      details.innerHTML = `<summary style="cursor:pointer">Source details</summary><div style="padding-top:6px;opacity:.9">PromQL: ${signal.metadata?.query ?? '--'}<br>URL: ${signal.metadata?.url ?? '--'}<br>Host: ${signal.metadata?.host ?? '--'}</div>`;
      node.appendChild(details);
    }

    const remove = document.createElement('button');
    remove.textContent = 'Remove source';
    remove.style.cssText = 'margin-top:8px;border:0;background:#6f3c46;color:#fff;padding:4px 8px;border-radius:6px;cursor:pointer;';
    remove.addEventListener('click', async (event) => {
      event.stopPropagation();
      try {
        const response = await fetch(`/api/signals/${encodeURIComponent(signal.id)}`, { method: 'DELETE' });
        if (!response.ok) {
          await fetch(`/api/config/adapters/${encodeURIComponent(signal.id)}`, { method: 'DELETE' });
        }
        this.layoutSerializer.removeSignal(signal.id);
        this.signals.delete(signal.id);
        document.dispatchEvent(new CustomEvent('layout-updated', { detail: { reason: 'remove-source' } }));
        this.render();
      } catch (_err) {
        this._showToast('Failed to remove source');
      }
    });
    node.appendChild(remove);

    if (inUse) node.style.boxShadow = '0 0 0 1px rgba(161,255,199,0.45) inset';
    return node;
  }

  _icon(type) {
    return ({ gauge: '🧭', rate: '⏱️', text: '📰', event: '⚡', state: '🚦' }[type] ?? '🔧');
  }

  async _openAdapterFlow() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;left:340px;top:80px;width:480px;max-width:calc(100vw - 360px);background:rgba(14,18,27,0.98);border:1px solid rgba(160,190,230,0.45);border-radius:10px;padding:14px;z-index:70;color:#fff;';
    document.body.appendChild(overlay);
    const state = { step: 1, adapter: null, config: {}, signal: { id: '', label: '' } };

    const adapters = await fetch('/api/adapters').then((r) => r.json()).then((r) => r.adapters ?? []);

    const renderStep = () => {
      overlay.innerHTML = '<div style="font-weight:700;margin-bottom:8px">Add Source</div>';
      if (state.step === 1) {
        overlay.innerHTML += `<div>Step 1/4: choose adapter</div><select id="adapterSel" style="width:100%;margin-top:8px">${adapters.map((a) => `<option value="${a}">${a}</option>`).join('')}</select><button id="next" style="margin-top:10px">Next</button>`;
        overlay.querySelector('#next').onclick = () => { state.adapter = overlay.querySelector('#adapterSel').value; state.step = 2; renderStep(); };
      } else if (state.step === 2) {
        const prom = state.adapter === 'prometheus';
        overlay.innerHTML += `<div>Step 2/4: configure ${state.adapter}</div>
          <input id="url" placeholder="URL" style="width:100%;margin-top:8px" />
          ${prom ? '<textarea id="query" placeholder="PromQL" style="width:100%;margin-top:8px;height:90px"></textarea><button id="test">Test Query</button><div id="testOut" style="margin-top:6px"></div>' : ''}
          <button id="next" style="margin-top:10px">Next</button>`;
        if (prom) {
          overlay.querySelector('#test').onclick = async () => {
            const out = overlay.querySelector('#testOut');
            const res = await fetch('/api/prometheus/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: overlay.querySelector('#url').value, query: overlay.querySelector('#query').value }) }).then((r) => r.json());
            out.textContent = res.ok ? `Value: ${res.value}` : `Error: ${res.error}`;
          };
        }
        overlay.querySelector('#next').onclick = () => {
          state.config.url = overlay.querySelector('#url').value;
          if (prom) state.config.query = overlay.querySelector('#query').value;
          state.step = 3;
          renderStep();
        };
      } else if (state.step === 3) {
        overlay.innerHTML += `<div>Step 3/4: name signal</div><input id="id" placeholder="signal_id" style="width:100%;margin-top:8px"/><input id="label" placeholder="Signal label" style="width:100%;margin-top:8px"/><button id="next" style="margin-top:10px">Next</button>`;
        overlay.querySelector('#next').onclick = () => {
          state.signal.id = overlay.querySelector('#id').value;
          state.signal.label = overlay.querySelector('#label').value;
          state.step = 4;
          renderStep();
        };
      } else {
        overlay.innerHTML += `<div>Step 4/4: confirm</div><pre style="white-space:pre-wrap">${JSON.stringify({ adapter: state.adapter, ...state.config, ...state.signal }, null, 2)}</pre><button id="create">Create</button> <button id="cancel">Close</button>`;
        overlay.querySelector('#create').onclick = async () => {
          const payload = { id: state.signal.id, label: state.signal.label, adapter: state.adapter, ...state.config };
          let response = await fetch('/api/signals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signal: payload }) });
          if (!response.ok) {
            response = await fetch('/api/config/adapters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adapter_config: payload }) });
          }
          if (response.ok) {
            this.signals.set(payload.id, { id: payload.id, label: payload.label, value: '--', source: state.adapter, type: 'gauge', metadata: { query: state.config.query, url: state.config.url } });
            this.render();
            overlay.remove();
          }
        };
        overlay.querySelector('#cancel').onclick = () => overlay.remove();
      }
    };
    renderStep();
  }
}

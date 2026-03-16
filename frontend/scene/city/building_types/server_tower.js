/** Server Tower — CPU load gauge. Window blink rate + load bar scale with value. */
export class ServerTower {
  static portType = 'gauge';
  static styles = ['rack_classic', 'blade_modern', 'mini_tower'];
  static label = 'Server Tower';

  constructor(app, plot, style = 'rack_classic') {
    this.app = app; this.plot = plot; this.style = style;
    this.container = new PIXI.Container();
    this.windows = [];
    this.loadBar = null;
    this.alertOverlay = new PIXI.Graphics();
    this.disconnectIcon = null;
    this.state = 'idle';
    this.value = 0;
    this._blinkTimers = [];
  }

  init() {
    const palettes = {
      rack_classic: { body: 0x3a4a5c, trim: 0x5a7a9c, led: 0x00ff88 },
      blade_modern: { body: 0x2a3545, trim: 0x4a6a8c, led: 0x44aaff },
      mini_tower:   { body: 0x4a3a5c, trim: 0x7a5a9c, led: 0xff88aa },
    };
    const p = palettes[this.style] ?? palettes.rack_classic;

    // Tower body
    const body = new PIXI.Graphics();
    body.beginFill(p.body);
    body.drawRoundedRect(-38, -160, 76, 160, 6);
    body.endFill();
    body.lineStyle(2, p.trim, 0.6);
    body.drawRoundedRect(-38, -160, 76, 160, 6);

    // Rack unit dividers
    const rack = new PIXI.Graphics();
    rack.lineStyle(1, p.trim, 0.25);
    for (let i = 1; i < 8; i++) {
      rack.moveTo(-36, -160 + i * 20);
      rack.lineTo(36, -160 + i * 20);
    }

    // LED windows — 3 columns × 5 rows
    this.windows = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        const win = new PIXI.Graphics();
        win.beginFill(p.led, 0.9);
        win.drawRoundedRect(-2, -2, 8, 8, 2);
        win.endFill();
        win.x = -22 + col * 14;
        win.y = -148 + row * 20;
        this.windows.push(win);
        this.container.addChild(win); // add before body to get covered by overlay
      }
    }

    // Load bar at base
    const barBg = new PIXI.Graphics();
    barBg.beginFill(0x1a2030);
    barBg.drawRoundedRect(-30, -16, 60, 10, 3);
    barBg.endFill();

    this.loadBar = new PIXI.Graphics();

    // Alert overlay
    this.alertOverlay.beginFill(0xff3c3c, 0.55);
    this.alertOverlay.drawRoundedRect(-42, -164, 84, 168, 8);
    this.alertOverlay.endFill();
    this.alertOverlay.visible = false;

    this.disconnectIcon = new PIXI.Text('⚡', { fill: 0xffdf6a, fontSize: 20, fontWeight: 'bold' });
    this.disconnectIcon.anchor.set(0.5);
    this.disconnectIcon.position.set(0, -180);
    this.disconnectIcon.visible = false;

    this.container.addChild(body, rack, barBg, this.loadBar, this.alertOverlay, this.disconnectIcon);
    this.container.position.set(this.plot.x, this.plot.y);
    this._drawLoadBar();
  }

  _drawLoadBar() {
    this.loadBar.clear();
    const w = Math.max(2, this.value * 58);
    const color = this.value > 0.85 ? 0xff4444 : this.value > 0.6 ? 0xffaa22 : 0x44dd88;
    this.loadBar.beginFill(color, 0.9);
    this.loadBar.drawRoundedRect(-29, -15, w, 8, 3);
    this.loadBar.endFill();
  }

  onSignal(signal) {
    this.value = Math.max(0, Math.min(Number(signal?.value ?? 0), 1));
    this._drawLoadBar();
  }

  update(delta) {
    // Blink windows at rate proportional to load
    const blinkRate = 0.008 + this.value * 0.06;
    this.windows.forEach((win, i) => {
      const phase = (performance.now() * blinkRate + i * 0.8) % (Math.PI * 2);
      win.alpha = this.state === 'idle'
        ? 0.34 + Math.abs(Math.sin(phase * 0.35)) * 0.18
        : 0.2 + Math.abs(Math.sin(phase)) * 0.8;
    });

    const pulse = 0.5 + 0.5 * Math.sin((performance.now() / 1000) * Math.PI * 2 * 1.2);
    this.alertOverlay.alpha = 0.15 + pulse * 0.55;
    this.alertOverlay.visible = this.state === 'alert';
    this.disconnectIcon.visible = this.state === 'disconnected';
    if (this.state === 'disconnected') this.windows.forEach(w => { w.alpha = 0.1; });
  }

  setAnimationState(state) { this.state = state; }
  destroy() { this.container.destroy({ children: true }); }
}

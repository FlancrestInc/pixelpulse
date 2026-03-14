/** Power Station — CPU load gauge. Chimney smoke intensity scales with load. */
export class PowerStation {
  static portType = 'gauge';
  static styles = ['coal_classic', 'nuclear_dome', 'solar_modern'];
  static label = 'Power Station';

  constructor(app, plot, style = 'coal_classic') {
    this.app = app; this.plot = plot; this.style = style;
    this.container = new PIXI.Container();
    this.smokeParticles = [];
    this.alertOverlay = new PIXI.Graphics();
    this.disconnectIcon = null;
    this.state = 'idle';
    this.value = 0;
    this._lastSmoke = 0;
  }

  init() {
    const palettes = {
      coal_classic: { body: 0x5a4a3a, chimney: 0x4a3a2a, stripe: 0xcc4444 },
      nuclear_dome:  { body: 0x4a5a4a, chimney: 0x3a4a3a, stripe: 0x44aa66 },
      solar_modern:  { body: 0x3a4a5a, chimney: 0x2a3a4a, stripe: 0x44aaff },
    };
    const p = palettes[this.style] ?? palettes.coal_classic;

    // Main building
    const body = new PIXI.Graphics();
    body.beginFill(p.body);
    body.drawRect(-50, -90, 100, 90);
    body.endFill();

    // Roof
    const roof = new PIXI.Graphics();
    roof.beginFill(0x3a3030);
    roof.drawRect(-52, -95, 104, 10);
    roof.endFill();

    // Windows
    const windows = new PIXI.Graphics();
    windows.beginFill(0xffee88, 0.7);
    for (let i = 0; i < 3; i++) {
      windows.drawRect(-38 + i * 28, -75, 16, 22);
    }
    windows.endFill();

    // Two chimneys
    const chimney1 = new PIXI.Graphics();
    chimney1.beginFill(p.chimney);
    chimney1.drawRect(-40, -200, 22, 115);
    chimney1.endFill();
    chimney1.lineStyle(3, p.stripe, 0.9);
    chimney1.moveTo(-40, -155); chimney1.lineTo(-18, -155);
    chimney1.moveTo(-40, -130); chimney1.lineTo(-18, -130);

    const chimney2 = new PIXI.Graphics();
    chimney2.beginFill(p.chimney);
    chimney2.drawRect(18, -175, 22, 90);
    chimney2.endFill();
    chimney2.lineStyle(3, p.stripe, 0.9);
    chimney2.moveTo(18, -140); chimney2.lineTo(40, -140);

    this.smokeContainer = new PIXI.Container();

    this.alertOverlay.beginFill(0xff3c3c, 0.55);
    this.alertOverlay.drawRect(-55, -205, 110, 210);
    this.alertOverlay.endFill();
    this.alertOverlay.visible = false;

    this.disconnectIcon = new PIXI.Text('⚡', { fill: 0xffdf6a, fontSize: 20, fontWeight: 'bold' });
    this.disconnectIcon.anchor.set(0.5);
    this.disconnectIcon.position.set(0, -220);
    this.disconnectIcon.visible = false;

    this.container.addChild(body, roof, windows, chimney1, chimney2, this.smokeContainer, this.alertOverlay, this.disconnectIcon);
    this.container.position.set(this.plot.x, this.plot.y);
  }

  onSignal(signal) {
    this.value = Math.max(0, Math.min(Number(signal?.value ?? 0), 1));
  }

  update(delta) {
    const now = performance.now();

    // Spawn smoke particles based on load
    const spawnInterval = Math.max(80, 600 - this.value * 500);
    if (this.value > 0.05 && now - this._lastSmoke > spawnInterval) {
      this._lastSmoke = now;
      // Spawn from each chimney top
      [{ x: -29, y: -202 }, { x: 29, y: -177 }].forEach(origin => {
        const p = new PIXI.Graphics();
        const radius = 6 + Math.random() * 8;
        const grey = Math.floor(160 + Math.random() * 60);
        p.beginFill((grey << 16) | (grey << 8) | grey, 0.55);
        p.drawCircle(0, 0, radius);
        p.endFill();
        p.x = origin.x + (Math.random() - 0.5) * 6;
        p.y = origin.y;
        p._vy = -(0.4 + Math.random() * 0.5) * (0.5 + this.value);
        p._vx = (Math.random() - 0.5) * 0.3;
        p._life = 1.0;
        p._decay = 0.008 + Math.random() * 0.006;
        this.smokeParticles.push(p);
        this.smokeContainer.addChild(p);
      });
    }

    // Update smoke particles
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const p = this.smokeParticles[i];
      p.y += p._vy * delta;
      p.x += p._vx * delta;
      p._life -= p._decay * delta;
      p.alpha = Math.max(0, p._life * 0.55);
      p.scale.set(1 + (1 - p._life) * 1.5);
      if (p._life <= 0) {
        this.smokeContainer.removeChild(p);
        this.smokeParticles.splice(i, 1);
      }
    }

    const pulse = 0.5 + 0.5 * Math.sin((now / 1000) * Math.PI * 2 * 1.2);
    this.alertOverlay.alpha = 0.15 + pulse * 0.55;
    this.alertOverlay.visible = this.state === 'alert';
    this.disconnectIcon.visible = this.state === 'disconnected';
  }

  setAnimationState(state) { this.state = state; }
  destroy() { this.container.destroy({ children: true }); }
}
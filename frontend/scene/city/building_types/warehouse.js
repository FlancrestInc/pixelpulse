/** Warehouse — disk usage gauge. Shutter door height scales with fill level. */
export class Warehouse {
  static portType = 'gauge';
  static styles = ['industrial_grey', 'red_brick', 'modern_white'];
  static label = 'Warehouse';

  constructor(app, plot, style = 'industrial_grey') {
    this.app = app; this.plot = plot; this.style = style;
    this.container = new PIXI.Container();
    this.shutter = null;
    this.fillIndicator = null;
    this.alertOverlay = new PIXI.Graphics();
    this.disconnectIcon = null;
    this.state = 'idle';
    this.value = 0;
  }

  init() {
    const palettes = {
      industrial_grey: { wall: 0x5a6478, roof: 0x3d4555, door: 0x8a9ab2, shutter: 0x4a5568 },
      red_brick:       { wall: 0x7a4a3a, roof: 0x4a2a22, door: 0xaa8070, shutter: 0x6a3a2a },
      modern_white:    { wall: 0x9aaaba, roof: 0x6a7a8a, door: 0xccddee, shutter: 0x7a8a9a },
    };
    const p = palettes[this.style] ?? palettes.industrial_grey;

    // Main building body
    const body = new PIXI.Graphics();
    body.beginFill(p.wall);
    body.drawRect(-55, -130, 110, 130);
    body.endFill();

    // Roof (trapezoidal)
    const roof = new PIXI.Graphics();
    roof.beginFill(p.roof);
    roof.drawPolygon([-60, -130, 60, -130, 50, -155, -50, -155]);
    roof.endFill();

    // Dock door frame
    const doorFrame = new PIXI.Graphics();
    doorFrame.beginFill(0x1a2030);
    doorFrame.drawRect(-30, -80, 60, 80);
    doorFrame.endFill();
    doorFrame.lineStyle(3, p.door, 0.8);
    doorFrame.drawRect(-30, -80, 60, 80);

    // Shutter — slides up as fill increases (mask reveals from bottom)
    const shutterBg = new PIXI.Graphics();
    shutterBg.beginFill(p.shutter, 0.9);
    shutterBg.drawRect(-28, -78, 56, 76);
    shutterBg.endFill();

    // Shutter slats
    const slats = new PIXI.Graphics();
    slats.lineStyle(1, p.door, 0.3);
    for (let i = 0; i < 6; i++) {
      slats.moveTo(-28, -78 + i * 13);
      slats.lineTo(28, -78 + i * 13);
    }

    this.shutter = new PIXI.Graphics(); // filled portion (open area = dark)

    // Fill level bar on side
    const fillBg = new PIXI.Graphics();
    fillBg.beginFill(0x1a2030);
    fillBg.drawRect(38, -100, 10, 90);
    fillBg.endFill();

    this.fillIndicator = new PIXI.Graphics();

    // Roof vent / detail
    const vent = new PIXI.Graphics();
    vent.beginFill(p.roof);
    vent.drawRect(-10, -165, 20, 12);
    vent.endFill();

    this.alertOverlay.beginFill(0xff3c3c, 0.55);
    this.alertOverlay.drawRect(-60, -160, 120, 165);
    this.alertOverlay.endFill();
    this.alertOverlay.visible = false;

    this.disconnectIcon = new PIXI.Text('⚡', { fill: 0xffdf6a, fontSize: 20, fontWeight: 'bold' });
    this.disconnectIcon.anchor.set(0.5);
    this.disconnectIcon.position.set(0, -175);
    this.disconnectIcon.visible = false;

    this.container.addChild(body, roof, vent, doorFrame, shutterBg, slats, this.shutter, fillBg, this.fillIndicator, this.alertOverlay, this.disconnectIcon);
    this.container.position.set(this.plot.x, this.plot.y);
    this._applyValue();
  }

  _applyValue() {
    // Shutter: value=0 → door fully closed (shutter covers opening), value=1 → fully open
    this.shutter.clear();
    const openHeight = this.value * 76;
    if (openHeight > 1) {
      this.shutter.beginFill(0x1a2030, 1); // open = dark interior
      this.shutter.drawRect(-28, -80, 56, openHeight);
      this.shutter.endFill();
    }

    // Fill indicator bar
    this.fillIndicator.clear();
    const barH = Math.max(2, this.value * 88);
    const color = this.value > 0.9 ? 0xff4444 : this.value > 0.7 ? 0xffaa22 : 0x44aaff;
    this.fillIndicator.beginFill(color, 0.9);
    this.fillIndicator.drawRect(39, -8 - barH, 8, barH);
    this.fillIndicator.endFill();
  }

  onSignal(signal) {
    this.value = Math.max(0, Math.min(Number(signal?.value ?? 0), 1));
    this._applyValue();
  }

  update() {
    const pulse = 0.5 + 0.5 * Math.sin((performance.now() / 1000) * Math.PI * 2 * 1.2);
    this.alertOverlay.alpha = 0.15 + pulse * 0.55;
    this.alertOverlay.visible = this.state === 'alert';
    this.disconnectIcon.visible = this.state === 'disconnected';
  }

  setAnimationState(state) { this.state = state; }
  destroy() { this.container.destroy({ children: true }); }
}
/** Windmill building. Accepts gauge signal values. */
export class Windmill {
  static portType = 'gauge';

  static styles = ['classic_wood', 'modern_steel', 'rustic_stone'];

  static label = 'Windmill';

  constructor(app, plot, style = 'classic_wood') {
    this.app = app;
    this.plot = plot;
    this.style = style;
    this.container = new PIXI.Container();
    this.blades = new PIXI.Container();
    this.rotationSpeed = 0.02;
    this.alertOverlay = new PIXI.Graphics();
    this.disconnectIcon = null;
    this.state = 'idle';
    this.signalValue = 0;
  }

  init() {
    const palettes = {
      classic_wood: { tower: 0x8f6b4f, roof: 0x6d4737, blade: 0xf0e0bf },
      modern_steel: { tower: 0x9aa7b4, roof: 0x6c7786, blade: 0xe1ecf4 },
      rustic_stone: { tower: 0x8f8a83, roof: 0x786559, blade: 0xdbcaa7 },
    };
    const p = palettes[this.style] ?? palettes.classic_wood;

    const base = new PIXI.Graphics();
    base.beginFill(p.tower);
    base.drawPolygon([-40, 0, 40, 0, 26, -140, -26, -140]);
    base.endFill();

    const roof = new PIXI.Graphics();
    roof.beginFill(p.roof);
    roof.drawPolygon([-32, -140, 32, -140, 0, -178]);
    roof.endFill();

    const hub = new PIXI.Graphics();
    hub.beginFill(0x2f3b46);
    hub.drawCircle(0, -116, 10);
    hub.endFill();

    for (let i = 0; i < 4; i += 1) {
      const blade = new PIXI.Graphics();
      blade.beginFill(p.blade);
      blade.drawRoundedRect(-7, -85, 14, 92, 4);
      blade.endFill();
      blade.rotation = i * (Math.PI / 2);
      blade.y = -116;
      this.blades.addChild(blade);
    }

    this.alertOverlay.beginFill(0xff3c3c, 0.55);
    this.alertOverlay.drawCircle(0, -84, 80);
    this.alertOverlay.endFill();
    this.alertOverlay.visible = false;

    this.disconnectIcon = new PIXI.Text('⚡', { fill: 0xffdf6a, fontSize: 20, fontWeight: 'bold' });
    this.disconnectIcon.anchor.set(0.5);
    this.disconnectIcon.position.set(0, -170);
    this.disconnectIcon.visible = false;

    this.container.addChild(base, roof, this.blades, hub, this.alertOverlay, this.disconnectIcon);
    this.container.x = this.plot.x;
    this.container.y = this.plot.y;
  }

  update(delta) {
    this.blades.rotation += this.rotationSpeed * delta;
    const pulse = 0.5 + 0.5 * Math.sin((performance.now() / 1000) * Math.PI * 2 * 1.2);
    this.alertOverlay.alpha = 0.15 + pulse * 0.55;
    this.alertOverlay.visible = this.state === 'alert';
    this.disconnectIcon.visible = this.state === 'disconnected';
  }

  onSignal(signal) {
    const value = Number(signal?.value ?? 0);
    const n = Math.max(0, Math.min(value, 1));
    this.signalValue = n;
    this.rotationSpeed = 0.01 + n * 0.1;
  }

  setAnimationState(state) {
    this.state = state;
    if (state === 'idle') this.rotationSpeed = 0.015;
    if (state === 'disconnected') this.rotationSpeed *= 0.3;
  }

  setEditMode(active) {
    this.container.alpha = active ? 0.75 : 1;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}

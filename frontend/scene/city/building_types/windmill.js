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
    this.base = null;
    this.blades = new PIXI.Container();
    this.rotationSpeed = 0.03;
  }

  init() {
    const palettes = {
      classic_wood: { tower: 0x8f6b4f, roof: 0x6d4737, blade: 0xf0e0bf },
      modern_steel: { tower: 0x9aa7b4, roof: 0x6c7786, blade: 0xe1ecf4 },
      rustic_stone: { tower: 0x8f8a83, roof: 0x786559, blade: 0xdbcaa7 },
    };
    const p = palettes[this.style] ?? palettes.classic_wood;

    this.base = new PIXI.Graphics();
    this.base.beginFill(p.tower);
    this.base.drawPolygon([-40, 0, 40, 0, 26, -140, -26, -140]);
    this.base.endFill();

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

    this.container.addChild(this.base, roof, this.blades, hub);
    this.container.x = this.plot.x;
    this.container.y = this.plot.y;
  }

  update(delta) {
    this.blades.rotation += this.rotationSpeed * delta;
  }

  onSignal(signal) {
    const value = Number(signal?.value ?? 0.5);
    this.rotationSpeed = 0.015 + Math.max(0, Math.min(value, 1)) * 0.08;
  }

  setEditMode(active) {
    this.container.alpha = active ? 0.75 : 1;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}

/** Water Tower building. Gauge value maps to fill level. */
export class WaterTower {
  static portType = 'gauge';

  static styles = ['classic_wood_leg', 'steel_municipal', 'painted_vintage'];

  static label = 'Water Tower';

  constructor(app, plot) {
    this.app = app;
    this.plot = plot;
    this.container = new PIXI.Container();
    this.fill = new PIXI.Graphics();
    this.alertOverlay = new PIXI.Graphics();
    this.disconnectIcon = null;
    this.state = 'idle';
    this.value = 0.35;
  }

  init() {
    const legs = new PIXI.Graphics();
    legs.lineStyle(6, 0x748399);
    legs.moveTo(-28, 0); legs.lineTo(-40, -120);
    legs.moveTo(28, 0); legs.lineTo(40, -120);

    const tank = new PIXI.Graphics();
    tank.beginFill(0xa6b4c6);
    tank.drawRoundedRect(-56, -184, 112, 78, 16);
    tank.endFill();

    const windowMask = new PIXI.Graphics();
    windowMask.beginFill(0xffffff);
    windowMask.drawRoundedRect(-48, -176, 96, 62, 10);
    windowMask.endFill();

    this.fill.beginFill(0x4ba3f0);
    this.fill.drawRoundedRect(-48, -176, 96, 62, 10);
    this.fill.endFill();
    this.fill.mask = windowMask;

    this.alertOverlay.beginFill(0xff3c3c, 0.55);
    this.alertOverlay.drawCircle(0, -145, 70);
    this.alertOverlay.endFill();
    this.alertOverlay.visible = false;

    this.disconnectIcon = new PIXI.Text('⚡', { fill: 0xffdf6a, fontSize: 20, fontWeight: 'bold' });
    this.disconnectIcon.anchor.set(0.5);
    this.disconnectIcon.position.set(0, -210);
    this.disconnectIcon.visible = false;

    this.container.addChild(legs, tank, this.fill, windowMask, this.alertOverlay, this.disconnectIcon);
    this.container.position.set(this.plot.x, this.plot.y);
    this._applyFill();
  }

  _applyFill() {
    this.fill.scale.y = Math.max(0.05, this.value);
    this.fill.y = -176 + (1 - this.fill.scale.y) * 62;
  }

  onSignal(signal) {
    this.value = Math.max(0, Math.min(Number(signal?.value ?? 0), 1));
    this._applyFill();
  }

  update() {
    const pulse = 0.5 + 0.5 * Math.sin((performance.now() / 1000) * Math.PI * 2 * 1.2);
    this.alertOverlay.alpha = 0.15 + pulse * 0.55;
    this.alertOverlay.visible = this.state === 'alert';
    this.disconnectIcon.visible = this.state === 'disconnected';
  }

  setAnimationState(state) {
    this.state = state;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}

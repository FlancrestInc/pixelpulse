/** Bus stop sign. Displays text signal values. */
export class BusStop {
  static portType = 'text';

  static styles = ['classic_shelter', 'minimal_post', 'retro_covered'];

  static label = 'Bus Stop';

  constructor(app, plot) {
    this.app = app;
    this.plot = plot;
    this.container = new PIXI.Container();
    this.signText = null;
    this.alertOverlay = new PIXI.Graphics();
    this.disconnectIcon = null;
    this.state = 'idle';
  }

  init() {
    const post = new PIXI.Graphics();
    post.beginFill(0x6f7a8f);
    post.drawRect(-5, -130, 10, 130);
    post.endFill();

    const panel = new PIXI.Graphics();
    panel.beginFill(0x2d3345);
    panel.drawRoundedRect(-68, -148, 136, 58, 8);
    panel.endFill();
    panel.lineStyle(2, 0xbfd2eb, 0.8);
    panel.drawRoundedRect(-66, -146, 132, 54, 6);

    this.signText = new PIXI.Text('Waiting...', { fill: 0xe8f1ff, fontSize: 13 });
    this.signText.anchor.set(0.5);
    this.signText.position.set(0, -120);

    this.alertOverlay.beginFill(0xff3c3c, 0.55);
    this.alertOverlay.drawRoundedRect(-74, -154, 148, 70, 8);
    this.alertOverlay.endFill();
    this.alertOverlay.visible = false;

    this.disconnectIcon = new PIXI.Text('⚡', { fill: 0xffdf6a, fontSize: 20, fontWeight: 'bold' });
    this.disconnectIcon.anchor.set(0.5);
    this.disconnectIcon.position.set(0, -178);
    this.disconnectIcon.visible = false;

    this.container.addChild(post, panel, this.signText, this.alertOverlay, this.disconnectIcon);
    this.container.position.set(this.plot.x, this.plot.y);
  }

  onSignal(signal) {
    const text = String(signal?.value ?? '--');
    this.signText.text = text.slice(0, 22);
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

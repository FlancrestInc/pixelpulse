/** Bus stop sign. Displays text signal values. */
export class BusStop {
  static portType = 'text';

  static styles = ['classic_shelter', 'minimal_post', 'retro_covered'];

  static label = 'Bus Stop';

  constructor(app, plot, style = 'classic_shelter') {
    this.app = app;
    this.plot = plot;
    this.style = style;
    this.container = new PIXI.Container();
    this.signText = null;
    this.alertOverlay = new PIXI.Graphics();
    this.disconnectIcon = null;
    this.state = 'idle';
  }

  init() {
    const palettes = {
      classic_shelter: { post: 0x6f7a8f, panel: 0x2d3345, trim: 0xbfd2eb },
      minimal_post: { post: 0x7f8a70, panel: 0x31382a, trim: 0xd9e3b8 },
      retro_covered: { post: 0x7b6659, panel: 0x362b29, trim: 0xf0d2a8 },
    };
    const p = palettes[this.style] ?? palettes.classic_shelter;

    const post = new PIXI.Graphics();
    post.beginFill(p.post);
    post.drawRect(-5, -130, 10, 130);
    post.endFill();

    const panel = new PIXI.Graphics();
    panel.beginFill(p.panel);
    panel.drawRoundedRect(-68, -148, 136, 58, 8);
    panel.endFill();
    panel.lineStyle(2, p.trim, 0.8);
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
    if (this.state === 'idle') {
      this.signText.alpha = 0.88 + Math.sin(performance.now() * 0.002) * 0.05;
    } else if (this.state === 'disconnected') {
      this.signText.alpha = 0.45;
      if (!this.signText.text || this.signText.text === '--') this.signText.text = 'Signal offline';
    } else {
      this.signText.alpha = 1;
    }

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

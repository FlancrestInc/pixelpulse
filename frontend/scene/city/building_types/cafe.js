/** Café — HTTP request rate. Neon sign + foot traffic scales with request rate. */
export class Cafe {
  static portType = 'rate';
  static styles = ['corner_bistro', 'neon_diner', 'garden_terrace'];
  static label = 'Café';

  constructor(app, plot, style = 'corner_bistro') {
    this.app = app; this.plot = plot; this.style = style;
    this.container = new PIXI.Container();
    this.neonSign = null;
    this.alertOverlay = new PIXI.Graphics();
    this.disconnectIcon = null;
    this.state = 'idle';
    this.value = 0;
  }

  init() {
    const palettes = {
      corner_bistro:  { body: 0x6a4a38, awning: 0xcc4444, trim: 0xffcc88, sign: 0xff8844 },
      neon_diner:     { body: 0x2a2a3a, awning: 0x2244aa, trim: 0x66aaff, sign: 0x44ffcc },
      garden_terrace: { body: 0x4a6a38, awning: 0x44aa44, trim: 0xaaddaa, sign: 0xffee44 },
    };
    const p = palettes[this.style] ?? palettes.corner_bistro;

    // Building
    const body = new PIXI.Graphics();
    body.beginFill(p.body);
    body.drawRect(-48, -120, 96, 120);
    body.endFill();

    // Roof
    const roof = new PIXI.Graphics();
    roof.beginFill(0x3a2a1a);
    roof.drawRect(-52, -126, 104, 10);
    roof.endFill();

    // Large window
    const win = new PIXI.Graphics();
    win.beginFill(0x88ccff, 0.35);
    win.drawRect(-38, -100, 76, 55);
    win.endFill();
    win.lineStyle(3, p.trim, 0.8);
    win.drawRect(-38, -100, 76, 55);
    // Window cross
    win.moveTo(0, -100); win.lineTo(0, -45);
    win.moveTo(-38, -72); win.lineTo(38, -72);

    // Awning
    const awning = new PIXI.Graphics();
    awning.beginFill(p.awning);
    awning.drawPolygon([-52, -42, 52, -42, 44, -28, -44, -28]);
    awning.endFill();
    // Awning stripes
    awning.lineStyle(2, 0xffffff, 0.2);
    for (let i = -36; i < 52; i += 14) {
      awning.moveTo(i, -42); awning.lineTo(i - 6, -28);
    }

    // Door
    const door = new PIXI.Graphics();
    door.beginFill(p.trim, 0.6);
    door.drawRoundedRect(-14, -28, 28, 28, 4);
    door.endFill();
    door.lineStyle(2, p.trim, 0.9);
    door.drawRoundedRect(-14, -28, 28, 28, 4);

    // Neon sign
    this.neonSign = new PIXI.Text('CAFÉ', {
      fill: p.sign,
      fontSize: 13,
      fontWeight: 'bold',
      fontFamily: 'system-ui',
      dropShadow: true,
      dropShadowColor: p.sign,
      dropShadowBlur: 8,
      dropShadowDistance: 0,
    });
    this.neonSign.anchor.set(0.5, 0.5);
    this.neonSign.position.set(0, -110);

    this.alertOverlay.beginFill(0xff3c3c, 0.55);
    this.alertOverlay.drawRect(-52, -130, 104, 135);
    this.alertOverlay.endFill();
    this.alertOverlay.visible = false;

    this.disconnectIcon = new PIXI.Text('⚡', { fill: 0xffdf6a, fontSize: 20, fontWeight: 'bold' });
    this.disconnectIcon.anchor.set(0.5);
    this.disconnectIcon.position.set(0, -145);
    this.disconnectIcon.visible = false;

    this.container.addChild(body, roof, win, awning, door, this.neonSign, this.alertOverlay, this.disconnectIcon);
    this.container.position.set(this.plot.x, this.plot.y);
  }

  onSignal(signal) {
    this.value = Math.max(0, Math.min(Number(signal?.value ?? 0) / 10, 1)); // normalize rate
  }

  update() {
    if (this.neonSign) {
      // Flicker based on activity
      const t = performance.now() / 1000;
      const flicker = this.state === 'idle'
        ? 0.4
        : 0.7 + Math.sin(t * 4.5) * 0.08 + Math.sin(t * 11.3) * 0.04;
      this.neonSign.alpha = flicker;
    }

    const pulse = 0.5 + 0.5 * Math.sin((performance.now() / 1000) * Math.PI * 2 * 1.2);
    this.alertOverlay.alpha = 0.15 + pulse * 0.55;
    this.alertOverlay.visible = this.state === 'alert';
    this.disconnectIcon.visible = this.state === 'disconnected';
  }

  setAnimationState(state) { this.state = state; }
  destroy() { this.container.destroy({ children: true }); }
}
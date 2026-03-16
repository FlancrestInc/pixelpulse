/** Bank Ticker — text signal. Scrolling ticker tape on the building facade. */
export class BankTicker {
  static portType = 'text';
  static styles = ['art_deco', 'modern_glass', 'retro_neon'];
  static label = 'Bank Ticker';

  constructor(app, plot, style = 'art_deco') {
    this.app = app; this.plot = plot; this.style = style;
    this.container = new PIXI.Container();
    this.tickerText = null;
    this.tickerMask = null;
    this.tickerOffset = 0;
    this.currentText = 'PIXELPULSE SYSTEMS ● ALL SIGNALS NOMINAL ● ';
    this.alertOverlay = new PIXI.Graphics();
    this.disconnectIcon = null;
    this.state = 'idle';
  }

  init() {
    const palettes = {
      art_deco:     { body: 0x4a3a28, trim: 0xc8a84a, ticker: 0x1a1a0a, tickerText: 0xffee44 },
      modern_glass: { body: 0x2a3a4a, trim: 0x6aaddd, ticker: 0x0a1a2a, tickerText: 0x44eeff },
      retro_neon:   { body: 0x2a1a3a, trim: 0xcc44aa, ticker: 0x0a0a1a, tickerText: 0xff44cc },
    };
    const p = palettes[this.style] ?? palettes.art_deco;

    // Building body
    const body = new PIXI.Graphics();
    body.beginFill(p.body);
    body.drawRect(-60, -180, 120, 180);
    body.endFill();
    body.lineStyle(3, p.trim, 0.7);
    body.drawRect(-60, -180, 120, 180);

    // Decorative columns
    const cols = new PIXI.Graphics();
    cols.lineStyle(4, p.trim, 0.5);
    cols.moveTo(-45, -180); cols.lineTo(-45, 0);
    cols.moveTo(-15, -180); cols.lineTo(-15, 0);
    cols.moveTo(15, -180); cols.lineTo(15, 0);
    cols.moveTo(45, -180); cols.lineTo(45, 0);

    // Cornice / cap
    const cap = new PIXI.Graphics();
    cap.beginFill(p.trim, 0.8);
    cap.drawRect(-64, -188, 128, 12);
    cap.endFill();

    // Windows
    const wins = new PIXI.Graphics();
    wins.beginFill(0x8aeeff, 0.3);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 3; col++) {
        wins.drawRect(-48 + col * 34, -168 + row * 38, 20, 26);
      }
    }
    wins.endFill();

    // Ticker band
    const tickerBand = new PIXI.Graphics();
    tickerBand.beginFill(p.ticker);
    tickerBand.drawRect(-60, -28, 120, 22);
    tickerBand.endFill();
    tickerBand.lineStyle(2, p.trim, 0.8);
    tickerBand.drawRect(-60, -28, 120, 22);

    // Ticker text (will scroll)
    this.tickerText = new PIXI.Text(this.currentText + this.currentText, {
      fill: p.tickerText,
      fontSize: 11,
      fontFamily: 'monospace',
    });
    this.tickerText.y = -24;
    this.tickerText.x = 0;

    // Mask to clip ticker text to band
    this.tickerMask = new PIXI.Graphics();
    this.tickerMask.beginFill(0xffffff);
    this.tickerMask.drawRect(-58, -28, 116, 22);
    this.tickerMask.endFill();
    this.tickerText.mask = this.tickerMask;

    this.alertOverlay.beginFill(0xff3c3c, 0.55);
    this.alertOverlay.drawRect(-64, -192, 128, 197);
    this.alertOverlay.endFill();
    this.alertOverlay.visible = false;

    this.disconnectIcon = new PIXI.Text('⚡', { fill: 0xffdf6a, fontSize: 20, fontWeight: 'bold' });
    this.disconnectIcon.anchor.set(0.5);
    this.disconnectIcon.position.set(0, -205);
    this.disconnectIcon.visible = false;

    this.container.addChild(body, cols, cap, wins, tickerBand, this.tickerMask, this.tickerText, this.alertOverlay, this.disconnectIcon);
    this.container.position.set(this.plot.x, this.plot.y);
  }

  onSignal(signal) {
    const text = String(signal?.value ?? '');
    if (text) this.currentText = text + ' ● ';
    if (this.tickerText) {
      this.tickerText.text = this.currentText + this.currentText + this.currentText;
      this.tickerOffset = 0;
    }
  }

  update(delta) {
    if (this.tickerText) {
      if (this.state === 'disconnected' && !this.currentText.includes('OFFLINE')) {
        this.currentText = 'SIGNAL OFFLINE ● ';
        this.tickerText.text = this.currentText + this.currentText + this.currentText;
      }
      const scrollSpeed = this.state === 'idle' ? 0.75 : this.state === 'disconnected' ? 0 : 1.2;
      this.tickerOffset -= scrollSpeed * delta;
      const fullWidth = this.tickerText.width / 3;
      if (this.tickerOffset < -fullWidth) this.tickerOffset += fullWidth;
      this.tickerText.x = this.tickerOffset - 58;
      this.tickerText.alpha = this.state === 'disconnected' ? 0.45 : 1;
    }

    const pulse = 0.5 + 0.5 * Math.sin((performance.now() / 1000) * Math.PI * 2 * 1.2);
    this.alertOverlay.alpha = 0.15 + pulse * 0.55;
    this.alertOverlay.visible = this.state === 'alert';
    this.disconnectIcon.visible = this.state === 'disconnected';
  }

  setAnimationState(state) { this.state = state; }
  destroy() { this.container.destroy({ children: true }); }
}

/**
 * Billboard — Text/ticker signal. Large roadside display board.
 *
 * Visual behaviour:
 *  - Displays scrolling text from any text-type signal.
 *  - Three styles: classic (painted), digital (LED matrix), neon_backlit.
 *  - Idle (no signal): shows "PixelPulse" placeholder text.
 *  - Alert state: red border flash + exclamation overlay.
 *
 * portType: 'text'
 */
export class Billboard {
  static portType = 'text';
  static styles   = ['classic_painted', 'digital_led', 'neon_backlit'];
  static label    = 'Billboard';

  constructor(app, plot, style = 'classic_painted') {
    this.app   = app;
    this.plot  = plot;
    this.style = style;

    this.container    = new PIXI.Container();
    this.displayText  = null;
    this.borderGfx    = null;
    this.alertOverlay = new PIXI.Graphics();
    this.disconnectIcon = null;

    this.state       = 'idle';
    this._rawText    = 'PixelPulse';
    this._scrollX    = 0;
    this._textWidth  = 0;
    this._mask       = null;
  }

  init() {
    const palettes = {
      classic_painted: { frame: 0x6a5a3a, bg: 0xf5f0e0, text: 0x1a1a2a, pole: 0x7a6a4a, border: 0xaa8844 },
      digital_led:     { frame: 0x1a2a1a, bg: 0x0a0f0a, text: 0x22ff44, pole: 0x2a3a2a, border: 0x224422 },
      neon_backlit:    { frame: 0x1a0a2a, bg: 0x0a0010, text: 0xff44cc, pole: 0x2a0a3a, border: 0x880088 },
    };
    const p = palettes[this.style] ?? palettes.classic_painted;

    // ── Support poles ────────────────────────────────────────────────────────
    const poles = new PIXI.Graphics();
    poles.beginFill(p.pole);
    poles.drawRect(-45, -90, 10, 90);
    poles.drawRect( 35, -90, 10, 90);
    poles.endFill();
    // Bracing
    poles.lineStyle(4, p.pole, 0.7);
    poles.moveTo(-40, -30); poles.lineTo( 40, -30);

    // ── Board backing ────────────────────────────────────────────────────────
    const board = new PIXI.Graphics();
    board.beginFill(p.frame);
    board.drawRect(-68, -148, 136, 62);
    board.endFill();
    // Face
    board.beginFill(p.bg);
    board.drawRect(-64, -144, 128, 54);
    board.endFill();

    // ── LED grid dots for digital style ──────────────────────────────────────
    if (this.style === 'digital_led') {
      const dots = new PIXI.Graphics();
      dots.beginFill(0x224422, 0.5);
      for (let col = -62; col < 64; col += 6) {
        for (let row = -142; row < -92; row += 6) {
          dots.drawCircle(col, row, 1.5);
        }
      }
      dots.endFill();
      this.container.addChild(dots); // added after board in build below
    }

    // ── Scrolling text ────────────────────────────────────────────────────────
    const textStyle = {
      fill:       p.text,
      fontSize:   this.style === 'digital_led' ? 18 : 20,
      fontFamily: this.style === 'digital_led' ? '"Courier New", monospace' : 'system-ui, sans-serif',
      fontWeight: 'bold',
    };
    if (this.style === 'neon_backlit') {
      Object.assign(textStyle, {
        dropShadow:       true,
        dropShadowColor:  p.text,
        dropShadowBlur:   12,
        dropShadowDistance: 0,
      });
    }

    this.displayText = new PIXI.Text(this._rawText, textStyle);
    this.displayText.anchor.set(0, 0.5);
    this.displayText.y = -117; // vertical centre of board
    this._textWidth = this.displayText.width;

    // Mask to clip text within board bounds
    this._mask = new PIXI.Graphics();
    this._mask.beginFill(0xffffff);
    this._mask.drawRect(-63, -143, 126, 52);
    this._mask.endFill();
    this.displayText.mask = this._mask;

    // ── Border / frame highlight ──────────────────────────────────────────────
    this.borderGfx = new PIXI.Graphics();
    this._drawBorder(p.border, 1.0);

    // ── Alert overlay ─────────────────────────────────────────────────────────
    this.alertOverlay.beginFill(0xff2222, 0.5);
    this.alertOverlay.drawRect(-68, -152, 136, 66);
    this.alertOverlay.endFill();
    this.alertOverlay.visible = false;

    // ── Disconnect icon ───────────────────────────────────────────────────────
    this.disconnectIcon = new PIXI.Text('⚡', {
      fill: 0xffdf6a, fontSize: 20, fontWeight: 'bold',
    });
    this.disconnectIcon.anchor.set(0.5);
    this.disconnectIcon.position.set(0, -162);
    this.disconnectIcon.visible = false;

    this.container.addChild(
      poles, board,
      this._mask, this.displayText,
      this.borderGfx,
      this.alertOverlay, this.disconnectIcon,
    );
    this.container.position.set(this.plot.x, this.plot.y);

    this._scrollX = 0;
  }

  _drawBorder(color, alpha) {
    this.borderGfx.clear();
    this.borderGfx.lineStyle(3, color, alpha);
    this.borderGfx.drawRect(-68, -148, 136, 62);
  }

  /** Receive any text or ticker signal. */
  onSignal(signal) {
    const raw = String(signal?.value ?? '');
    if (raw && raw !== this._rawText) {
      this._rawText = raw;
      if (this.displayText) {
        this.displayText.text = raw;
        this._textWidth = this.displayText.width;
        this._scrollX   = 64; // reset to start from right edge
      }
    }
  }

  update() {
    const t = performance.now() / 1000;

    // ── Text scroll ───────────────────────────────────────────────────────────
    if (this.displayText) {
      // Scroll leftward; wrap around when fully offscreen
      const boardW   = 126;
      const textW    = this._textWidth + 32; // padding between loops
      const scrollSpeed = 40; // px/s — comfortable reading speed

      this._scrollX -= scrollSpeed / 60;
      if (this._scrollX < -(textW)) {
        this._scrollX = boardW;
      }
      this.displayText.x = this._scrollX - 63;

      // Neon flicker
      if (this.style === 'neon_backlit') {
        this.displayText.alpha = 0.88 + Math.sin(t * 17.3) * 0.04 + Math.sin(t * 5.1) * 0.06;
      }
    }

    // ── Alert overlay ──────────────────────────────────────────────────────────
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 1.4);
    this.alertOverlay.alpha   = 0.12 + pulse * 0.55;
    this.alertOverlay.visible = this.state === 'alert';

    this.disconnectIcon.visible = this.state === 'disconnected';
  }

  setAnimationState(state) { this.state = state; }
  destroy() { this.container.destroy({ children: true }); }
}
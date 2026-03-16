/**
 * AuthGate — Authentication failures rate signal.
 *
 * Visual behaviour:
 *  - Idle (value ≈ 0):   barrier down, amber indicator light, quiet.
 *  - Active (value > 0): barrier raises proportionally, indicator turns red,
 *                        alarm light pulses, red flash overlay scales with rate.
 *  - Alert state:        full red pulse overlay + siren beacon spinning.
 *
 * portType: 'rate'  (auth_failures events/sec, normalised 0–1 by caller)
 */
export class AuthGate {
  static portType = 'rate';
  static styles   = ['city_checkpoint', 'secure_facility', 'neon_barrier'];
  static label    = 'Auth Gate';

  constructor(app, plot, style = 'city_checkpoint') {
    this.app   = app;
    this.plot  = plot;
    this.style = style;

    this.container     = new PIXI.Container();
    this.barrier       = null;   // the striped arm
    this.alarmLight    = null;   // top beacon circle
    this.indicator     = null;   // small status LED
    this.alertOverlay  = new PIXI.Graphics();
    this.disconnectIcon = null;

    this.state = 'idle';
    this.value = 0;           // normalised 0–1
    this._barrierAngle = 0;   // current rotation (radians, 0 = down, -π/2 = up)
    this._targetAngle  = 0;
  }

  init() {
    const palettes = {
      city_checkpoint:  { booth: 0x3a4a5a, roof: 0x2a5a8a, arm: 0xdd3333, stripe: 0xeeeeee, beacon: 0xff4422 },
      secure_facility:  { booth: 0x2a2a2a, roof: 0x111111, arm: 0xffaa00, stripe: 0x222222, beacon: 0xffaa00 },
      neon_barrier:     { booth: 0x1a0a2a, roof: 0x3a0a5a, arm: 0xcc44ff, stripe: 0x220033, beacon: 0xcc44ff },
    };
    const p = palettes[this.style] ?? palettes.city_checkpoint;

    // ── Ground pad ──────────────────────────────────────────────────────────
    const pad = new PIXI.Graphics();
    pad.beginFill(0x2a2a2a, 0.6);
    pad.drawRect(-68, -10, 136, 10);
    pad.endFill();
    // Road markings
    pad.lineStyle(2, 0xeeeeee, 0.25);
    for (let x = -55; x < 70; x += 18) {
      pad.moveTo(x, -6); pad.lineTo(x + 9, -6);
    }

    // ── Guard booth ─────────────────────────────────────────────────────────
    const booth = new PIXI.Graphics();
    booth.beginFill(p.booth);
    booth.drawRect(-22, -80, 44, 80);
    booth.endFill();
    // Roof
    booth.beginFill(p.roof);
    booth.drawRect(-26, -86, 52, 10);
    booth.endFill();
    // Window
    booth.beginFill(0x88ccff, 0.4);
    booth.drawRect(-14, -68, 28, 30);
    booth.endFill();
    booth.lineStyle(2, 0x99bbdd, 0.7);
    booth.drawRect(-14, -68, 28, 30);
    // Window cross
    booth.moveTo(0, -68); booth.lineTo(0, -38);
    booth.moveTo(-14, -53); booth.lineTo(14, -53);
    // Door
    booth.beginFill(p.roof, 0.8);
    booth.drawRoundedRect(-10, -30, 20, 30, 3);
    booth.endFill();

    // ── Beacon / siren on roof ───────────────────────────────────────────────
    this.alarmLight = new PIXI.Graphics();
    this._drawBeacon(p.beacon, 1.0);

    // ── Barrier pivot post ───────────────────────────────────────────────────
    const post = new PIXI.Graphics();
    post.beginFill(0x666677);
    post.drawRect(-4, -52, 8, 52);
    post.endFill();
    post.beginFill(0x888899);
    post.drawCircle(0, -52, 6);
    post.endFill();
    post.x = -24;

    // ── Barrier arm (pivots at left end) ─────────────────────────────────────
    this.barrier = new PIXI.Container();
    this.barrier.x = -24;
    this.barrier.y = -52;

    const arm = new PIXI.Graphics();
    // Main arm
    arm.beginFill(p.arm);
    arm.drawRect(0, -5, 88, 10);
    arm.endFill();
    // Stripes
    arm.beginFill(p.stripe, 0.9);
    for (let i = 8; i < 88; i += 18) {
      arm.drawRect(i, -5, 9, 10);
    }
    arm.endFill();
    // Counterweight
    arm.beginFill(0x555566);
    arm.drawRect(-18, -8, 18, 16);
    arm.endFill();
    // Tip reflector
    arm.beginFill(0xffee44, 0.9);
    arm.drawRect(84, -5, 8, 10);
    arm.endFill();

    this.barrier.addChild(arm);

    // ── Status indicator LED ─────────────────────────────────────────────────
    this.indicator = new PIXI.Graphics();
    this._drawIndicator(0xffaa22); // default amber
    this.indicator.x = 8;
    this.indicator.y = -42;

    // ── Alert overlay ────────────────────────────────────────────────────────
    this.alertOverlay.beginFill(0xff2222, 0.5);
    this.alertOverlay.drawRect(-72, -95, 144, 100);
    this.alertOverlay.endFill();
    this.alertOverlay.visible = false;

    // ── Disconnect icon ──────────────────────────────────────────────────────
    this.disconnectIcon = new PIXI.Text('⚡', {
      fill: 0xffdf6a, fontSize: 20, fontWeight: 'bold',
    });
    this.disconnectIcon.anchor.set(0.5);
    this.disconnectIcon.position.set(0, -105);
    this.disconnectIcon.visible = false;

    this.container.addChild(
      pad, booth, post, this.barrier,
      this.alarmLight, this.indicator,
      this.alertOverlay, this.disconnectIcon,
    );
    this.container.position.set(this.plot.x, this.plot.y);

    // Arm starts down
    this.barrier.rotation = 0;
  }

  // ── Drawing helpers ────────────────────────────────────────────────────────

  _drawBeacon(color, alpha) {
    this.alarmLight.clear();
    this.alarmLight.beginFill(color, alpha);
    this.alarmLight.drawCircle(0, 0, 7);
    this.alarmLight.endFill();
    this.alarmLight.beginFill(0xffffff, alpha * 0.4);
    this.alarmLight.drawCircle(-2, -2, 3);
    this.alarmLight.endFill();
    this.alarmLight.x = -22;
    this.alarmLight.y = -90;
  }

  _drawIndicator(color) {
    this.indicator.clear();
    this.indicator.beginFill(color, 0.9);
    this.indicator.drawCircle(0, 0, 5);
    this.indicator.endFill();
    this.indicator.beginFill(0xffffff, 0.35);
    this.indicator.drawCircle(-1, -1, 2);
    this.indicator.endFill();
  }

  // ── Signal + update ────────────────────────────────────────────────────────

  /** Receive normalised rate value (0–1). */
  onSignal(signal) {
    this.value = Math.max(0, Math.min(Number(signal?.value ?? 0), 1));
    // Target barrier angle: 0 = down (no failures), -π/2 = fully raised (max failures)
    this._targetAngle = -(this.value * Math.PI * 0.5);
  }

  /** Called every frame. */
  update() {
    const t  = performance.now() / 1000;
    const dt = 1 / 60; // approx

    // ── Smooth barrier rotation ──────────────────────────────────────────────
    const diff = this._targetAngle - this._barrierAngle;
    this._barrierAngle += diff * Math.min(1, dt * 4);
    if (this.barrier) this.barrier.rotation = this._barrierAngle;

    // ── Beacon pulse ─────────────────────────────────────────────────────────
    if (this.state === 'alert') {
      // Fast strobing beacon
      const strobe = Math.sin(t * Math.PI * 6) > 0 ? 1.0 : 0.15;
      this._drawBeacon(0xff2222, strobe);
      // Spin effect via scale flipping
      this.alarmLight.scale.x = Math.cos(t * Math.PI * 6) > 0 ? 1 : 0.6;
    } else if (this.value > 0.05) {
      // Slow pulse when active
      const pulse = 0.7 + 0.3 * Math.sin(t * Math.PI * 2 * (1 + this.value * 3));
      this._drawBeacon(0xff4422, pulse);
      this.alarmLight.scale.x = 1;
    } else {
      // Idle — dim amber
      this._drawBeacon(0x886622, 0.5);
      this.alarmLight.scale.x = 1;
    }

    // ── Status LED colour ────────────────────────────────────────────────────
    if (this.state === 'disconnected') {
      this._drawIndicator(0x444444);
    } else if (this.value > 0.5) {
      this._drawIndicator(0xff2222);
    } else if (this.value > 0.1) {
      this._drawIndicator(0xff8800);
    } else {
      this._drawIndicator(0x22cc66);
    }

    // ── Alert overlay ─────────────────────────────────────────────────────────
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 1.4);
    this.alertOverlay.alpha   = 0.12 + pulse * 0.55;
    this.alertOverlay.visible = this.state === 'alert';

    this.disconnectIcon.visible = this.state === 'disconnected';
  }

  setAnimationState(state) { this.state = state; }
  destroy() { this.container.destroy({ children: true }); }
}
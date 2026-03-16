/** Drive-In Theater — active streams gauge. Screen + parked cars scale with stream count. */
export class DriveIn {
  static portType = 'gauge';
  static styles = ['classic_50s', 'modern_multiplex', 'retro_neon'];
  static label = 'Drive-In';

  constructor(app, plot, style = 'classic_50s') {
    this.app = app; this.plot = plot; this.style = style;
    this.container = new PIXI.Container();
    this.screen = null;
    this.cars = [];
    this.alertOverlay = new PIXI.Graphics();
    this.disconnectIcon = null;
    this.state = 'idle';
    this.value = 0;
  }

  init() {
    const palettes = {
      classic_50s:      { frame: 0x8a7a5a, screen: 0xeeeedd, post: 0x6a5a3a, car: 0xcc4444 },
      modern_multiplex: { frame: 0x3a4a5a, screen: 0xddeeff, post: 0x2a3a4a, car: 0x4488cc },
      retro_neon:       { frame: 0x3a1a4a, screen: 0xffeeff, post: 0x2a0a3a, car: 0xcc44aa },
    };
    const p = palettes[this.style] ?? palettes.classic_50s;

    // Screen post
    const post = new PIXI.Graphics();
    post.beginFill(p.post);
    post.drawRect(-6, -170, 12, 130);
    post.endFill();

    // Screen frame
    const frame = new PIXI.Graphics();
    frame.beginFill(p.frame);
    frame.drawRect(-65, -175, 130, 8);  // top bar
    frame.drawRect(-65, -100, 130, 8);  // bottom bar
    frame.drawRect(-65, -175, 8, 83);   // left
    frame.drawRect(57, -175, 8, 83);    // right
    frame.endFill();

    // Screen surface
    this.screen = new PIXI.Graphics();
    this._drawScreen(p.screen);

    // Parking lot ground
    const lot = new PIXI.Graphics();
    lot.beginFill(0x2a2a2a, 0.5);
    lot.drawRect(-72, -38, 144, 38);
    lot.endFill();

    // Parked cars (up to 6)
    this.cars = [];
    this.carContainer = new PIXI.Container();
    const carPositions = [-55, -33, -11, 11, 33, 55];
    carPositions.forEach((cx) => {
      const car = new PIXI.Graphics();
      // Car body
      car.beginFill(p.car);
      car.drawRoundedRect(-9, -14, 18, 10, 3);
      car.endFill();
      // Car roof
      car.beginFill(0x8aaabb, 0.6);
      car.drawRoundedRect(-6, -20, 12, 8, 2);
      car.endFill();
      // Wheels
      car.beginFill(0x222222);
      car.drawCircle(-6, -4, 3);
      car.drawCircle(6, -4, 3);
      car.endFill();
      car.x = cx;
      car.y = -12;
      car.visible = false;
      this.cars.push(car);
      this.carContainer.addChild(car);
    });

    // Booth
    const booth = new PIXI.Graphics();
    booth.beginFill(p.post);
    booth.drawRect(54, -40, 18, 40);
    booth.endFill();
    booth.beginFill(0xffee88, 0.6);
    booth.drawRect(56, -36, 14, 16);
    booth.endFill();

    this.alertOverlay.beginFill(0xff3c3c, 0.55);
    this.alertOverlay.drawRect(-70, -180, 140, 185);
    this.alertOverlay.endFill();
    this.alertOverlay.visible = false;

    this.disconnectIcon = new PIXI.Text('⚡', { fill: 0xffdf6a, fontSize: 20, fontWeight: 'bold' });
    this.disconnectIcon.anchor.set(0.5);
    this.disconnectIcon.position.set(0, -195);
    this.disconnectIcon.visible = false;

    this.container.addChild(lot, post, frame, this.screen, this.carContainer, booth, this.alertOverlay, this.disconnectIcon);
    this.container.position.set(this.plot.x, this.plot.y);
    this._updateCars();
  }

  _drawScreen(color) {
    this.screen.clear();
    const t = performance.now() / 1000;
    if (this.value > 0.05 && this.state !== 'disconnected') {
      // Animated scanlines on screen
      this.screen.beginFill(color, 0.92);
      this.screen.drawRect(-57, -167, 114, 67);
      this.screen.endFill();
      // Scanline effect
      this.screen.lineStyle(1, 0x000000, 0.06);
      for (let y = -167; y < -100; y += 4) {
        this.screen.moveTo(-57, y); this.screen.lineTo(57, y);
      }
    } else {
      const idleGlow = this.state === 'idle' ? 0.22 + Math.abs(Math.sin(t * 0.45)) * 0.08 : 0.08;
      this.screen.beginFill(0x222222, 0.8);
      this.screen.drawRect(-57, -167, 114, 67);
      this.screen.endFill();
      if (this.state !== 'disconnected') {
        this.screen.beginFill(color, idleGlow);
        this.screen.drawRect(-57, -167, 114, 67);
        this.screen.endFill();
      }
    }
  }

  _updateCars() {
    const count = Math.round(this.value * this.cars.length);
    this.cars.forEach((car, i) => { car.visible = i < count; });
  }

  onSignal(signal) {
    this.value = Math.max(0, Math.min(Number(signal?.value ?? 0), 1));
    this._updateCars();
  }

  update() {
    this._drawScreen();

    if (this.carContainer) {
      this.carContainer.alpha = this.state === 'disconnected' ? 0.35 : 1;
    }

    const pulse = 0.5 + 0.5 * Math.sin((performance.now() / 1000) * Math.PI * 2 * 1.2);
    this.alertOverlay.alpha = 0.15 + pulse * 0.55;
    this.alertOverlay.visible = this.state === 'alert';
    this.disconnectIcon.visible = this.state === 'disconnected';
  }

  setAnimationState(state) { this.state = state; }
  destroy() { this.container.destroy({ children: true }); }
}

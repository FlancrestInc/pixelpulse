/** Data Vault — event signal. Truck arrives and unloads on backup_done event. */
export class DataVault {
  static portType = 'event';
  static styles = ['bunker_classic', 'server_farm', 'glass_tower'];
  static label = 'Data Vault';

  constructor(app, plot, style = 'bunker_classic') {
    this.app = app; this.plot = plot; this.style = style;
    this.container = new PIXI.Container();
    this.truck = null;
    this.truckX = -200;
    this.truckActive = false;
    this.alertOverlay = new PIXI.Graphics();
    this.disconnectIcon = null;
    this.state = 'idle';
    this._eventTimer = 0;
  }

  init() {
    const palettes = {
      bunker_classic: { body: 0x4a4a3a, door: 0x8a7a5a, trim: 0xaaaa66 },
      server_farm:    { body: 0x3a4a3a, door: 0x5a8a5a, trim: 0x66aa66 },
      glass_tower:    { body: 0x3a4a5a, door: 0x5a7a9a, trim: 0x66aadd },
    };
    const p = palettes[this.style] ?? palettes.bunker_classic;

    // Bunker body
    const body = new PIXI.Graphics();
    body.beginFill(p.body);
    body.drawRect(-55, -100, 110, 100);
    body.endFill();
    body.lineStyle(3, p.trim, 0.5);
    body.drawRect(-55, -100, 110, 100);

    // Thick roof
    const roof = new PIXI.Graphics();
    roof.beginFill(0x3a3a2a);
    roof.drawRect(-60, -108, 120, 14);
    roof.endFill();

    // Vault door
    const door = new PIXI.Graphics();
    door.beginFill(p.door);
    door.drawRect(-24, -72, 48, 72);
    door.endFill();
    door.lineStyle(4, p.trim, 0.9);
    door.drawCircle(0, -36, 22); // vault wheel
    door.lineStyle(3, p.trim, 0.7);
    door.moveTo(0, -14); door.lineTo(0, -58); // spokes
    door.moveTo(-22, -36); door.lineTo(22, -36);

    // Antenna/satellite dish hint
    const ant = new PIXI.Graphics();
    ant.lineStyle(2, p.trim, 0.6);
    ant.moveTo(10, -108); ant.lineTo(10, -125);
    ant.beginFill(p.trim, 0.5);
    ant.drawEllipse(10, -128, 10, 5);
    ant.endFill();

    // Loading dock
    const dock = new PIXI.Graphics();
    dock.beginFill(0x2a2a1a, 0.6);
    dock.drawRect(-55, -8, 110, 8);
    dock.endFill();

    // Delivery truck (starts off-screen left, drives in on event)
    this.truck = new PIXI.Container();
    const truckBody = new PIXI.Graphics();
    truckBody.beginFill(0x5a7a5a);
    truckBody.drawRoundedRect(0, -20, 48, 20, 3);
    truckBody.endFill();
    const cab = new PIXI.Graphics();
    cab.beginFill(0x4a6a4a);
    cab.drawRoundedRect(32, -28, 16, 28, 3);
    cab.endFill();
    cab.beginFill(0x88ccff, 0.5);
    cab.drawRect(34, -26, 10, 10);
    cab.endFill();
    // Wheels
    const wheels = new PIXI.Graphics();
    wheels.beginFill(0x222222);
    wheels.drawCircle(10, 0, 5); wheels.drawCircle(36, 0, 5);
    wheels.endFill();
    this.truck.addChild(truckBody, cab, wheels);
    this.truck.x = -200;
    this.truck.y = -8;
    this.truck.visible = false;

    this.alertOverlay.beginFill(0xff3c3c, 0.55);
    this.alertOverlay.drawRect(-60, -112, 120, 117);
    this.alertOverlay.endFill();
    this.alertOverlay.visible = false;

    this.disconnectIcon = new PIXI.Text('⚡', { fill: 0xffdf6a, fontSize: 20, fontWeight: 'bold' });
    this.disconnectIcon.anchor.set(0.5);
    this.disconnectIcon.position.set(0, -128);
    this.disconnectIcon.visible = false;

    this.container.addChild(body, roof, door, ant, dock, this.truck, this.alertOverlay, this.disconnectIcon);
    this.container.position.set(this.plot.x, this.plot.y);
  }

  onSignal(signal) {
    // Any event value triggers truck animation
    if (signal?.value) {
      this.truckActive = true;
      this.truckX = -200;
      this.truck.visible = true;
      this._eventTimer = 4000; // show for 4 seconds
    }
  }

  update(delta) {
    if (this.truckActive) {
      this._eventTimer -= delta * 16;
      // Drive in to dock position
      if (this.truckX < -58) {
        this.truckX += 2.5 * delta;
      }
      this.truck.x = this.truckX;

      if (this._eventTimer <= 0) {
        // Drive away
        this.truckX -= 2 * delta;
        if (this.truckX < -200) {
          this.truckActive = false;
          this.truck.visible = false;
          this.truckX = -200;
        }
      }
    }

    const pulse = 0.5 + 0.5 * Math.sin((performance.now() / 1000) * Math.PI * 2 * 1.2);
    this.alertOverlay.alpha = 0.15 + pulse * 0.55;
    this.alertOverlay.visible = this.state === 'alert';
    this.disconnectIcon.visible = this.state === 'disconnected';
  }

  setAnimationState(state) { this.state = state; }
  destroy() { this.container.destroy({ children: true }); }
}
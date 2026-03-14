/**
 * Vehicle traffic system. Cars and trucks animate along road1 and road2.
 * Density and speed scale with a net_throughput signal (0.0–1.0).
 */

const ROAD1_Y = 597;  // centre of road1 lane
const ROAD2_Y = 795;  // centre of road2 lane
const REF_WIDTH = 1920;

const CAR_COLORS = [0xcc4444, 0x4488cc, 0xddcc44, 0x44aa66, 0xcc8844, 0x9944cc, 0xaaaaaa, 0x44cccc];

function makeCarGraphic(color, type = 'car') {
  const g = new PIXI.Graphics();
  if (type === 'truck') {
    // Truck body
    g.beginFill(color);
    g.drawRoundedRect(-28, -9, 56, 14, 3);
    g.endFill();
    g.beginFill(0x334455, 0.7);
    g.drawRoundedRect(-28, -9, 16, 14, 3); // cab
    g.endFill();
    g.beginFill(0x88aacc, 0.5);
    g.drawRect(-26, -7, 8, 6); // windshield
    g.endFill();
    g.beginFill(0x111111);
    g.drawCircle(-18, 5, 4);
    g.drawCircle(18, 5, 4);
    g.endFill();
  } else {
    // Car body
    g.beginFill(color);
    g.drawRoundedRect(-18, -7, 36, 11, 3);
    g.endFill();
    // Roof
    g.beginFill(color, 0.8);
    g.drawRoundedRect(-10, -13, 22, 8, 3);
    g.endFill();
    // Windshield
    g.beginFill(0x88aacc, 0.55);
    g.drawRect(-8, -12, 8, 6);
    g.drawRect(2, -12, 8, 6);
    g.endFill();
    // Wheels
    g.beginFill(0x111111);
    g.drawCircle(-10, 4, 4);
    g.drawCircle(10, 4, 4);
    g.endFill();
    // Headlights
    g.beginFill(0xffffaa, 0.8);
    g.drawRect(-18, -4, 4, 4);
    g.endFill();
  }
  return g;
}

class Vehicle {
  constructor(lane, direction, speed, color, type) {
    this.lane = lane;
    this.direction = direction; // 1 = left→right, -1 = right→left
    this.speed = speed;
    this.type = type;
    this.sprite = makeCarGraphic(color, type);
    this.sprite.y = lane;
    this.sprite.scale.x = direction; // flip for direction
    this.sprite.x = direction === 1
      ? -60 - Math.random() * 400
      : REF_WIDTH + 60 + Math.random() * 400;
  }

  update(delta) {
    this.sprite.x += this.direction * this.speed * delta;
  }

  isOffscreen() {
    return this.direction === 1
      ? this.sprite.x > REF_WIDTH + 80
      : this.sprite.x < -80;
  }
}

export class VehicleManager {
  constructor(stage) {
    this.stage = stage;
    this.container = new PIXI.Container();
    this.stage.addChild(this.container);
    this.vehicles = [];
    this.density = 0.2; // 0.0–1.0
    this._spawnTimer = 0;
    this._spawnInterval = 120; // frames between spawn attempts
  }

  onSignal(signal) {
    this.density = Math.max(0, Math.min(Number(signal?.value ?? 0.2), 1));
  }

  update(delta) {
    // Update existing vehicles
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      v.update(delta);
      if (v.isOffscreen()) {
        this.container.removeChild(v.sprite);
        this.vehicles.splice(i, 1);
      }
    }

    // Spawn new vehicles based on density
    this._spawnTimer += delta;
    const interval = Math.max(8, this._spawnInterval * (1 - this.density * 0.85));
    if (this._spawnTimer >= interval) {
      this._spawnTimer = 0;
      this._spawnVehicle();
    }
  }

  _spawnVehicle() {
    const maxVehicles = Math.floor(4 + this.density * 20);
    if (this.vehicles.length >= maxVehicles) return;

    const lane = Math.random() < 0.55 ? ROAD1_Y : ROAD2_Y;
    // road1: mostly left→right, road2: mostly right→left
    const defaultDir = lane === ROAD1_Y ? 1 : -1;
    const direction = Math.random() < 0.85 ? defaultDir : -defaultDir;
    const baseSpeed = 1.5 + this.density * 3.5;
    const speed = baseSpeed * (0.7 + Math.random() * 0.6);
    const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    const type = Math.random() < 0.15 ? 'truck' : 'car';

    const v = new Vehicle(lane, direction, speed, color, type);
    this.vehicles.push(v);
    this.container.addChild(v.sprite);
  }
}
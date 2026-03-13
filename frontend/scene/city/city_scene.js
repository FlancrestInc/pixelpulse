import { CityEnvironment } from './environment.js';
import { Windmill } from './building_types/windmill.js';

const REF_WIDTH = 1920;
const REF_HEIGHT = 1080;

function createRoad(y, height, color) {
  const road = new PIXI.Graphics();
  road.beginFill(color);
  road.drawRect(0, y, REF_WIDTH, height);
  road.endFill();
  road.lineStyle(3, 0xd7d8de, 0.8);
  for (let x = 24; x < REF_WIDTH; x += 90) {
    road.moveTo(x, y + height / 2);
    road.lineTo(x + 44, y + height / 2);
  }
  return road;
}

function createPlotRow(y, count, startX, gap, tint = 0x2d3443) {
  const row = new PIXI.Container();
  const plots = [];
  for (let i = 0; i < count; i += 1) {
    const plate = new PIXI.Graphics();
    plate.beginFill(tint, 0.9);
    plate.drawRoundedRect(-86, -12, 172, 24, 8);
    plate.endFill();
    plate.lineStyle(2, 0x93a3bf, 0.55);
    plate.drawRoundedRect(-82, -8, 164, 16, 6);
    plate.x = startX + i * gap;
    plate.y = y;
    row.addChild(plate);
    plots.push({ x: plate.x, y: plate.y - 12 });
  }
  return { row, plots };
}

function spawnTraffic(trackY, amount, direction, color) {
  const cars = [];
  for (let i = 0; i < amount; i += 1) {
    const car = new PIXI.Graphics();
    car.beginFill(color[i % color.length]);
    car.drawRoundedRect(-25, -10, 50, 20, 6);
    car.endFill();
    car.beginFill(0xbfcce0, 0.7);
    car.drawRect(-12, -9, 24, 8);
    car.endFill();
    car.x = (i / amount) * REF_WIDTH;
    car.y = trackY + (i % 2) * 6;
    car.speed = direction * (1.1 + Math.random() * 0.65);
    cars.push(car);
  }
  return cars;
}

function spawnWalkers(trackY, amount, direction) {
  const walkers = [];
  for (let i = 0; i < amount; i += 1) {
    const walker = new PIXI.Graphics();
    walker.beginFill(0x263044);
    walker.drawCircle(0, -15, 5);
    walker.endFill();
    walker.beginFill(0x8492a6);
    walker.drawRoundedRect(-4, -12, 8, 18, 4);
    walker.endFill();
    walker.x = (i / amount) * REF_WIDTH;
    walker.y = trackY;
    walker.speed = direction * (0.42 + Math.random() * 0.35);
    walkers.push(walker);
  }
  return walkers;
}

/** Pixel city scene for phase 1 static render. */
export class CityScene {
  constructor(app, world) {
    this.app = app;
    this.world = world;
    this.root = new PIXI.Container();
    this.actors = [];
    this.environment = null;
  }

  async init() {
    this.environment = new CityEnvironment(this.root, REF_WIDTH, REF_HEIGHT);
    await this.environment.init();

    const road1 = createRoad(560, 74, 0x2c3040);
    this.root.addChild(road1);

    const mainStrip = new PIXI.Graphics();
    mainStrip.beginFill(0x414f64);
    mainStrip.drawRect(0, 635, REF_WIDTH, 130);
    mainStrip.endFill();
    this.root.addChild(mainStrip);

    const road2 = createRoad(760, 70, 0x272c3b);
    this.root.addChild(road2);

    const midStrip = new PIXI.Graphics();
    midStrip.beginFill(0x3d4554);
    midStrip.drawRect(0, 830, REF_WIDTH, 128);
    midStrip.endFill();
    this.root.addChild(midStrip);

    const ticker = new PIXI.Graphics();
    ticker.beginFill(0x1f2433);
    ticker.drawRect(0, 958, REF_WIDTH, 58);
    ticker.endFill();
    ticker.lineStyle(2, 0x53627a, 0.7);
    ticker.moveTo(0, 958);
    ticker.lineTo(REF_WIDTH, 958);
    this.root.addChild(ticker);

    const mainRow = createPlotRow(700, 6, 250, 285);
    const midRow = createPlotRow(900, 3, 520, 420, 0x334055);
    this.root.addChild(mainRow.row, midRow.row);

    const windmill = new Windmill(this.app, mainRow.plots[1], 'classic_wood');
    windmill.init();
    this.root.addChild(windmill.container);
    this.actors.push(windmill);

    const windmill2 = new Windmill(this.app, midRow.plots[1], 'modern_steel');
    windmill2.init();
    windmill2.container.scale.set(0.78);
    this.root.addChild(windmill2.container);
    this.actors.push(windmill2);

    this.cars = [
      ...spawnTraffic(598, 9, 1, [0xf26f5e, 0x4bb3fd, 0xf4d35e]),
      ...spawnTraffic(798, 7, -1, [0x7bd389, 0xff9770, 0x6d90f5]),
    ];
    this.walkers = [...spawnWalkers(620, 8, 1), ...spawnWalkers(818, 6, -1)];

    this.cars.forEach((car) => this.root.addChild(car));
    this.walkers.forEach((walker) => this.root.addChild(walker));

    this.world.addChild(this.root);
  }

  update(delta) {
    this.environment.update(delta);
    this.actors.forEach((actor) => actor.update(delta));

    this.cars.forEach((car) => {
      car.x += car.speed * delta;
      if (car.speed > 0 && car.x > REF_WIDTH + 60) car.x = -60;
      if (car.speed < 0 && car.x < -60) car.x = REF_WIDTH + 60;
    });

    this.walkers.forEach((walker, i) => {
      walker.x += walker.speed * delta;
      walker.y += Math.sin((performance.now() + i * 120) * 0.008) * 0.15;
      if (walker.speed > 0 && walker.x > REF_WIDTH + 20) walker.x = -20;
      if (walker.speed < 0 && walker.x < -20) walker.x = REF_WIDTH + 20;
    });
  }
}

export { REF_WIDTH, REF_HEIGHT };

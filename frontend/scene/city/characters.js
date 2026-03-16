const WALKER_COLORS = [0xf2d16b, 0x8ad4ff, 0xff9f7a, 0x9ce28d, 0xd4a3ff];

class Walker {
  constructor({ x, y, direction = 1, speed = 0.7, tint = 0xf2d16b }) {
    this.direction = direction;
    this.speed = speed;
    this.sprite = new PIXI.Container();

    const head = new PIXI.Graphics();
    head.beginFill(0xf3d7b2);
    head.drawCircle(0, -18, 4);
    head.endFill();

    const body = new PIXI.Graphics();
    body.beginFill(tint);
    body.drawRoundedRect(-4, -14, 8, 12, 3);
    body.endFill();

    const legs = new PIXI.Graphics();
    legs.lineStyle(2, 0x2e3342, 1);
    legs.moveTo(-2, -2);
    legs.lineTo(-3, 8);
    legs.moveTo(2, -2);
    legs.lineTo(3, 8);

    this.sprite.addChild(head, body, legs);
    this.sprite.position.set(x, y);
    this.sprite.scale.x = direction;
    this.sprite.alpha = 0.95;
    this._life = 1;
  }

  update(delta) {
    this.sprite.x += this.direction * this.speed * delta;
    this._life -= 0.0016 * delta;
    this.sprite.y += Math.sin(performance.now() * 0.01 + this.sprite.x * 0.02) * 0.03;
  }

  isExpired(width) {
    return this._life <= 0 || this.sprite.x < -50 || this.sprite.x > width + 50;
  }
}

export class CharacterManager {
  constructor(stage, width = 1920) {
    this.stage = stage;
    this.width = width;
    this.container = new PIXI.Container();
    this.walkers = [];
    this._cooldowns = new Map();
    this.stage.addChild(this.container);
  }

  spawnWalker({ x, y, direction = 1, speed = 0.7, tint } = {}) {
    const walker = new Walker({
      x: x ?? (direction === 1 ? -20 : this.width + 20),
      y: y ?? 726,
      direction,
      speed,
      tint: tint ?? WALKER_COLORS[Math.floor(Math.random() * WALKER_COLORS.length)],
    });
    this.walkers.push(walker);
    this.container.addChild(walker.sprite);
  }

  triggerSceneBeat(kind, payload = {}) {
    const now = performance.now();
    const lastAt = this._cooldowns.get(kind) ?? 0;
    const cooldownMs = kind === 'deploy' ? 6000 : 2500;
    if (now - lastAt < cooldownMs) return;
    this._cooldowns.set(kind, now);

    if (kind === 'deploy') {
      this.spawnWalker({ x: 860, y: 905, direction: 1, speed: 0.9, tint: 0xf0c96a });
      this.spawnWalker({ x: 892, y: 905, direction: -1, speed: 0.75, tint: 0x8ed0ff });
      return;
    }

    if (kind === 'cafe') {
      this.spawnWalker({ x: 455, y: 905, direction: Math.random() < 0.5 ? 1 : -1, speed: 0.55, tint: 0xffb380 });
      if (payload.busy) this.spawnWalker({ x: 510, y: 905, direction: 1, speed: 0.65, tint: 0x9ce28d });
      return;
    }

    if (kind === 'drive_in') {
      this.spawnWalker({ x: 1330, y: 905, direction: -1, speed: 0.5, tint: 0xd7a2ff });
    }
  }

  update(delta) {
    for (let i = this.walkers.length - 1; i >= 0; i -= 1) {
      const walker = this.walkers[i];
      walker.update(delta);
      if (walker.isExpired(this.width)) {
        this.container.removeChild(walker.sprite);
        this.walkers.splice(i, 1);
      }
    }
  }
}

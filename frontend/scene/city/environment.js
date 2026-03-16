import { kRand } from '../shared/sprite_sheet.js';

const SKYLINE_FRAMES = [
  'building-skyscraper-a.png',
  'building-skyscraper-b.png',
  'building-skyscraper-c.png',
  'building-skyscraper-d.png',
  'building-skyscraper-e.png',
];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(c1, c2, t) {
  const r = lerp((c1 >> 16) & 0xff, (c2 >> 16) & 0xff, t);
  const g = lerp((c1 >> 8) & 0xff, (c2 >> 8) & 0xff, t);
  const b = lerp(c1 & 0xff, c2 & 0xff, t);
  return ((r & 0xff) << 16) + ((g & 0xff) << 8) + (b & 0xff);
}

function skyPalette(time01) {
  const keyframes = [
    { t: 0.0, top: 0x0b1026, bottom: 0x26143f, mood: 0x5d6f9c },
    { t: 0.23, top: 0xd57a5e, bottom: 0xf0b37c, mood: 0xb18874 },
    { t: 0.5, top: 0x67b7ff, bottom: 0xb6ecff, mood: 0x86a9c4 },
    { t: 0.77, top: 0xec8c61, bottom: 0x70438f, mood: 0x88668d },
    { t: 1.0, top: 0x0b1026, bottom: 0x26143f, mood: 0x5d6f9c },
  ];

  for (let i = 0; i < keyframes.length - 1; i += 1) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (time01 >= a.t && time01 <= b.t) {
      const localT = (time01 - a.t) / (b.t - a.t || 1);
      return {
        top: lerpColor(a.top, b.top, localT),
        bottom: lerpColor(a.bottom, b.bottom, localT),
        mood: lerpColor(a.mood, b.mood, localT),
      };
    }
  }

  return keyframes[0];
}

function drawGradient(ctx, canvas, texture, top, bottom) {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, `#${top.toString(16).padStart(6, '0')}`);
  gradient.addColorStop(1, `#${bottom.toString(16).padStart(6, '0')}`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  texture.baseTexture.update();
}

/** Environment layer: sky gradient + skyline strip + local day/night clock. */
export class CityEnvironment {
  constructor(stage, width, height) {
    this.stage = stage;
    this.width = width;
    this.height = height;
    this.container = new PIXI.Container();
    this.skyline = new PIXI.Container();
    this.hills = new PIXI.Container();
    this.timeOfDay = 0;
    this.followSystemClock = true;
    this.gradientCanvas = document.createElement('canvas');
    this.gradientCanvas.width = 8;
    this.gradientCanvas.height = 256;
    this.gradientCtx = this.gradientCanvas.getContext('2d');
    this.gradientTexture = PIXI.Texture.from(this.gradientCanvas);
    this.sky = new PIXI.Sprite(this.gradientTexture);
    this.sky.width = width;
    this.sky.height = height * 0.56;
    this.container.addChild(this.sky);
    this.container.addChild(this.skyline);
    this.container.addChild(this.hills);
    this.stage.addChild(this.container);
    this.lastPalette = null;
    this._timeDrift = 0;
  }

  async init() {
    this.buildHillRow();
    await this.buildSkyline();
    this.tickClock();
  }

  tickClock() {
    const now = new Date();
    const seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    this.timeOfDay = seconds / 86400;
  }

  buildHillRow() {
    const y = this.height * 0.52;
    for (let i = 0; i < 8; i += 1) {
      const hill = new PIXI.Graphics();
      const width = 280 + (i % 3) * 90;
      const height = 85 + (i % 4) * 20;
      hill.beginFill(0x30495f, 0.75);
      hill.drawEllipse(0, 0, width, height);
      hill.endFill();
      hill.x = i * 260 - 80;
      hill.y = y + (i % 2) * 20;
      this.hills.addChild(hill);
    }
  }

  async buildSkyline() {
    const y = this.height * 0.5;
    for (let i = 0; i < 22; i += 1) {
      const node = await kRand(SKYLINE_FRAMES, 190 + Math.random() * 130, { color: 0x364154 });
      node.x = 40 + i * 90 + Math.random() * 30;
      node.y = y + 40 + Math.random() * 20;
      node.alpha = 0.86;
      this.skyline.addChild(node);
    }
  }

  update(delta = 1) {
    if (this.followSystemClock) this.tickClock();
    else this._timeDrift = (this._timeDrift + delta * 0.00015) % 1;
    const palette = skyPalette(this.timeOfDay);
    if (!this.lastPalette || this.lastPalette.top !== palette.top || this.lastPalette.bottom !== palette.bottom) {
      drawGradient(this.gradientCtx, this.gradientCanvas, this.gradientTexture, palette.top, palette.bottom);
      this.lastPalette = palette;
    }

    this.skyline.children.forEach((child, i) => {
      child.tint = palette.mood;
      child.alpha = 0.68 + Math.sin(performance.now() * 0.00022 + i) * 0.035;
    });

    this.hills.tint = lerpColor(0x2d5064, 0x20253a, Math.abs(0.5 - this.timeOfDay) * 2);
  }
}

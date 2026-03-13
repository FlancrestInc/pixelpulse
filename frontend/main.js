import { CityScene, REF_HEIGHT, REF_WIDTH } from './scene/city/city_scene.js';

const appHost = document.getElementById('app');
const app = new PIXI.Application({
  resizeTo: window,
  backgroundColor: 0x1a1a2e,
  antialias: true,
  autoDensity: true,
});

appHost.appendChild(app.view);

const world = new PIXI.Container();
world.eventMode = 'none';
app.stage.addChild(world);

const cityScene = new CityScene(app, world);
await cityScene.init();

let resizeTimer = null;

function fitScene() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const scale = Math.min(w / REF_WIDTH, h / REF_HEIGHT);
  world.scale.set(scale);
  world.x = Math.floor((w - REF_WIDTH * scale) * 0.5);
  world.y = Math.floor((h - REF_HEIGHT * scale) * 0.5);
}

fitScene();
window.addEventListener('resize', () => {
  if (resizeTimer) {
    window.clearTimeout(resizeTimer);
  }
  resizeTimer = window.setTimeout(fitScene, 150);
});

app.ticker.add((delta) => {
  cityScene.update(delta);
});

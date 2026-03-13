import { SignalBus } from './signal_bus.js';
import { CityScene, REF_HEIGHT, REF_WIDTH } from './scene/city/city_scene.js';

const appHost = document.getElementById('app');
const app = new PIXI.Application({
  resizeTo: window,
  backgroundColor: 0x1a1a2e,
  antialias: true,
  autoDensity: true,
});
appHost.appendChild(app.view);

const hud = document.createElement('div');
hud.id = 'mode-hud';
Object.assign(hud.style, {
  position: 'fixed',
  top: '12px',
  right: '14px',
  fontFamily: 'system-ui, sans-serif',
  fontWeight: '700',
  letterSpacing: '0.4px',
  zIndex: '15',
});
document.body.appendChild(hud);

const tooltip = document.createElement('div');
Object.assign(tooltip.style, {
  position: 'fixed',
  display: 'none',
  background: 'rgba(18,22,34,0.92)',
  border: '1px solid rgba(172,196,236,0.45)',
  color: '#eaf3ff',
  padding: '6px 8px',
  borderRadius: '6px',
  font: '12px/1.35 system-ui, sans-serif',
  zIndex: '20',
  pointerEvents: 'none',
});
document.body.appendChild(tooltip);

const signalBus = new SignalBus();
signalBus.onModeChange((mode) => {
  if (mode === 'live') {
    hud.textContent = '● LIVE';
    hud.style.color = '#5aaeff';
  } else {
    hud.textContent = '● DEMO';
    hud.style.color = '#f2a641';
  }
});
signalBus.start();

const world = new PIXI.Container();
world.eventMode = 'none';
app.stage.addChild(world);

const cityScene = new CityScene(app, world, signalBus, tooltip);
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

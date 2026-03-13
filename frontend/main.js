import { EditController } from './edit_mode/edit_controller.js';
import { BuildingPicker } from './edit_mode/building_picker.js';
import { LayoutSerializer } from './edit_mode/layout_serializer.js';
import { SignalLibrary } from './edit_mode/signal_library.js';
import { ValvePanel } from './edit_mode/valve_panel.js';
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
world.baseY = 0;
app.stage.addChild(world);

const cityScene = new CityScene(app, world, signalBus, tooltip);
await cityScene.init();

const layoutSerializer = new LayoutSerializer(signalBus.getLayout());
const signalLibrary = new SignalLibrary(signalBus, layoutSerializer);
const buildingPicker = new BuildingPicker(app, world, cityScene, layoutSerializer, cityScene.plotManager);
const valvePanel = new ValvePanel(signalBus, layoutSerializer);
const editController = new EditController({ cityScene, signalLibrary, buildingPicker, valvePanel, layoutSerializer, world });

let resizeTimer = null;

function fitScene() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const scale = Math.min(w / REF_WIDTH, h / REF_HEIGHT);
  const cityOffsetY = world.y - world.baseY;
  const centeredY = Math.floor((h - REF_HEIGHT * scale) * 0.5);
  world.scale.set(scale);
  world.x = Math.floor((w - REF_WIDTH * scale) * 0.5);
  world.baseY = centeredY;
  world.y = centeredY + cityOffsetY;
}

document.addEventListener('layout-updated', () => {
  cityScene.applyLayout(layoutSerializer.serialize().plots);
  signalLibrary.render();
});

document.addEventListener('pipe-menu', (event) => {
  const { plotId, x, y } = event.detail;
  const menu = document.createElement('div');
  menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:67;background:rgba(18,23,35,.97);border:1px solid rgba(140,165,207,.4);border-radius:8px;padding:6px;`;
  menu.innerHTML = '<button id="cfg">Configure</button><button id="rm">Remove pipe</button>';
  document.body.appendChild(menu);
  menu.querySelector('#cfg').onclick = () => { document.dispatchEvent(new CustomEvent('pipe-selected', { detail: { plotId, x, y } })); menu.remove(); };
  menu.querySelector('#rm').onclick = () => { layoutSerializer.removePipe(plotId); cityScene.applyLayout(layoutSerializer.serialize().plots); signalLibrary.render(); menu.remove(); };
  window.setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
});

document.addEventListener('plot-selected', (event) => {
  if (!editController.isEditMode) return;
  const plot = layoutSerializer.ensurePlot(event.detail.plotId);
  if (plot.signal && !plot.building) {
    const scale = world.scale.x || 1;
    document.dispatchEvent(new CustomEvent('pipe-menu', {
      detail: {
        plotId: event.detail.plotId,
        x: world.x + event.detail.plot.x * scale,
        y: world.y + event.detail.plot.y * scale,
      },
    }));
  }
});

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

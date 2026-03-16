import { EditController }   from './edit_mode/edit_controller.js';
import { makeMenu, makeMenuButton, positionWithin, dismissOnOutsideClick } from './ui_utils.js';
import { BuildingPicker }   from './edit_mode/building_picker.js';
import { LayoutSerializer } from './edit_mode/layout_serializer.js';
import { PipeRenderer }     from './edit_mode/pipe_renderer.js';
import { SignalLibrary }    from './edit_mode/signal_library.js';
import { ValvePanel }       from './edit_mode/valve_panel.js';
import { SignalBus }        from './signal_bus.js';
import { CityScene, REF_HEIGHT, REF_WIDTH } from './scene/city/city_scene.js';

// ─── Pixi app ─────────────────────────────────────────────────────────────────

const appHost = document.getElementById('app');
const app = new PIXI.Application({
  resizeTo:        window,
  backgroundColor: 0x1a1a2e,
  antialias:       false,
  autoDensity:     true,
  resolution:      Math.min(window.devicePixelRatio || 1, 1.5),
  powerPreference: 'high-performance',
});
appHost.appendChild(app.view);

// ─── HUD (Live/Demo indicator) ────────────────────────────────────────────────
// Styled via index.html <style> block — just set id and let CSS do the work.
const hud = document.createElement('div');
hud.id = 'mode-hud';
document.body.appendChild(hud);

// ─── Tooltip ──────────────────────────────────────────────────────────────────
// The tooltip DOM element lives here and is driven by custom events from the
// scene, keeping scene code free of DOM node references.
const tooltip = document.getElementById('pp-tooltip') ?? (() => {
  const el = document.createElement('div');
  el.id = 'pp-tooltip';
  document.body.appendChild(el);
  return el;
})();

document.addEventListener('tooltip-show', (e) => {
  const { x, y, html } = e.detail ?? {};

  // html=null means a position-only update from pointermove — reposition without re-rendering
  if (html !== null && html !== undefined) {
    tooltip.innerHTML     = html;
    tooltip.style.display = 'block';
  }
  if (tooltip.style.display === 'none') return;

  if (x != null && y != null) {
    const margin = 10;
    const tipW   = tooltip.offsetWidth  || 180;
    const tipH   = tooltip.offsetHeight || 50;
    const left   = (x + margin + tipW > window.innerWidth)  ? x - tipW - margin : x + margin;
    const top    = Math.max(margin, Math.min(y - tipH / 2, window.innerHeight - tipH - margin));
    tooltip.style.left = `${left}px`;
    tooltip.style.top  = `${top}px`;
  }
});

document.addEventListener('tooltip-hide', () => {
  tooltip.style.display = 'none';
});

// ─── Signal bus ───────────────────────────────────────────────────────────────

const signalBus = new SignalBus();
signalBus.onModeChange((mode) => {
  hud.textContent  = mode === 'live' ? '● LIVE' : '● DEMO';
  hud.dataset.mode = mode;         // CSS targets [data-mode="live"] / [data-mode="demo"]
});
signalBus.start();

// ─── Scene world container ────────────────────────────────────────────────────

const world = new PIXI.Container();
world.eventMode = 'passive';
app.stage.addChild(world);

// Pan offset is tracked independently of world.y so fitScene is idempotent.
let _panOffsetY = 0;

// ─── City scene ───────────────────────────────────────────────────────────────

// Note: tooltip is driven by 'tooltip-show'/'tooltip-hide' DOM events —
// CityScene no longer receives a DOM node reference.
const cityScene = new CityScene(app, world, signalBus);
await cityScene.init();

// ─── Edit mode subsystems ─────────────────────────────────────────────────────

const pipeRenderer     = new PipeRenderer({ signalBus, plotManager: cityScene.plotManager, world });
const layoutSerializer = new LayoutSerializer({ initialLayout: signalBus.getLayout(), plotManager: cityScene.plotManager, pipeRenderer });
const signalLibrary    = new SignalLibrary(signalBus, layoutSerializer);
const buildingPicker   = new BuildingPicker(app, world, cityScene, layoutSerializer, cityScene.plotManager);
const valvePanel       = new ValvePanel(signalBus, layoutSerializer);
const editController   = new EditController({ cityScene, signalLibrary, buildingPicker, valvePanel, layoutSerializer, pipeRenderer, world, signalBus });

// ─── Layout ───────────────────────────────────────────────────────────────────

function applyLayout() {
  const layout = layoutSerializer.serializeAll();
  cityScene.applyLayout(layout.plots);
  pipeRenderer.syncFromLayout(layout.plots);
  signalLibrary.render();
}

document.addEventListener('layout-updated', applyLayout);

document.addEventListener('pipe-menu', (event) => {
  const { plotId, x, y } = event.detail;
  const menu = makeMenu(67);
  makeMenuButton(menu, 'Configure valve', () => {
    document.dispatchEvent(new CustomEvent('pipe-selected', { detail: { plotId, x, y } }));
    menu.remove();
  }, { icon: '⚙' });
  makeMenuButton(menu, 'Remove pipe', () => {
    layoutSerializer.removePipe(plotId);
    applyLayout();
    menu.remove();
  }, { icon: '✕', color: '#f07a7a' });
  positionWithin(menu, x + 8, y + 8);
  menu.style.display = 'block';
  dismissOnOutsideClick(menu, () => menu.remove());
});

document.addEventListener('plot-selected', (event) => {
  if (!editController.isEditMode) return;
  const plot = layoutSerializer.ensurePlot(event.detail.plotId);
  if (plot.signal && !plot.building) {
    const scale = world.scale.x || 1;
    document.dispatchEvent(new CustomEvent('pipe-menu', {
      detail: {
        plotId: event.detail.plotId,
        x:      world.x + event.detail.plot.x * scale,
        y:      world.y + event.detail.plot.y * scale,
      },
    }));
  }
});

// ─── Resize / fit ─────────────────────────────────────────────────────────────

function fitScene() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const scale     = Math.min(w / REF_WIDTH, h / REF_HEIGHT);
  const centeredY = Math.floor((h - REF_HEIGHT * scale) * 0.5);
  world.scale.set(scale);
  world.x     = Math.floor((w - REF_WIDTH * scale) * 0.5);
  // baseY is read by edit_controller._applyProgress for its enter/exit
  // animation offset — keep it in sync with centeredY on every resize.
  world.baseY = centeredY;
  // _panOffsetY tracks any additional manual pan so it survives resize.
  world.y     = centeredY + _panOffsetY;
}

let _resizeTimer = null;
window.addEventListener('resize', () => {
  window.clearTimeout(_resizeTimer);
  _resizeTimer = window.setTimeout(fitScene, 150);
});
fitScene();

// ─── Remote layout sync ────────────────────────────────────────────────────────

signalBus.onLayoutChange((layout) => {
  if (editController.isEditMode) return;
  layoutSerializer.load(layout);
  applyLayout();
});

signalBus.onLayoutSaveStatus((status) => {
  if (status.ok) {
    editController.showSavedToast();
  } else {
    editController.showSaveFailedToast();
  }
});

// ─── Render loop ───────────────────────────────────────────────────────────────

app.ticker.add((delta) => {
  cityScene.update(delta);
});

// ─── Visibility-aware demo oscillator pause ────────────────────────────────────
// Stops the demo setInterval from burning CPU when the tab is hidden.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    signalBus.pauseDemo?.();
  } else {
    signalBus.resumeDemo?.();
  }
});

// ─── Cleanup / teardown ────────────────────────────────────────────────────────
// Called on hot-reload in dev, or if the component is ever unmounted.
export function destroy() {
  signalBus.stop();
  app.ticker.stop();
  app.destroy(true, { children: true, texture: true, baseTexture: true });
  document.removeEventListener('layout-updated', applyLayout);
  window.clearTimeout(_resizeTimer);
  hud.remove();
  tooltip.remove();
}
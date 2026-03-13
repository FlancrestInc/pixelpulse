import { getBuildingType } from './buildings.js';
import { CityEnvironment } from './environment.js';
import { PlotManager } from './plot_manager.js';

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

function buildPlotDefs() {
  const defs = [];
  for (let i = 0; i < 6; i += 1) defs.push({ id: `main_${i + 1}`, x: 250 + i * 285, y: 688 });
  for (let i = 0; i < 3; i += 1) defs.push({ id: `mid_${i + 1}`, x: 520 + i * 420, y: 888 });
  return defs;
}

/** Pixel city scene for live signal rendering. */
export class CityScene {
  constructor(app, world, signalBus, tooltip) {
    this.app = app;
    this.world = world;
    this.signalBus = signalBus;
    this.tooltip = tooltip;
    this.root = new PIXI.Container();
    this.actors = [];
    this.actorMeta = [];
    this.layoutApplied = false;
  }

  async init() {
    this.environment = new CityEnvironment(this.root, REF_WIDTH, REF_HEIGHT);
    await this.environment.init();

    this.root.addChild(createRoad(560, 74, 0x2c3040));
    const mainStrip = new PIXI.Graphics();
    mainStrip.beginFill(0x414f64); mainStrip.drawRect(0, 635, REF_WIDTH, 130); mainStrip.endFill();
    this.root.addChild(mainStrip);
    this.root.addChild(createRoad(760, 70, 0x272c3b));
    const midStrip = new PIXI.Graphics();
    midStrip.beginFill(0x3d4554); midStrip.drawRect(0, 830, REF_WIDTH, 128); midStrip.endFill();
    this.root.addChild(midStrip);

    this.plotManager = new PlotManager(this.root, buildPlotDefs());
    this.world.addChild(this.root);

    this.signalBus.subscribe('sky_time', (signal) => {
      this.environment.timeOfDay = Math.max(0, Math.min(Number(signal?.value ?? 0), 1));
      this.environment.followSystemClock = false;
    });

    this.signalBus.subscribeAny(() => {
      const layoutPlots = this.signalBus.getLayout()?.plots ?? [];
      if (!this.layoutApplied && layoutPlots.length) {
        this.applyLayout(layoutPlots);
        this.layoutApplied = true;
      }
    });

    const layoutPlots = this.signalBus.getLayout()?.plots ?? [];
    if (!this.layoutApplied && layoutPlots.length) {
      this.applyLayout(layoutPlots);
      this.layoutApplied = true;
    }
  }

  applyLayout(layoutPlots) {
    this.actors.forEach((actor) => actor.destroy());
    this.actors = [];
    this.actorMeta = [];
    this.plotManager.setLayout(layoutPlots);

    layoutPlots.forEach((entry) => {
      if (!entry.building) return;
      const plot = this.plotManager.getPlot(entry.plot_id);
      if (!plot) return;
      const BuildingClass = getBuildingType(entry.building);
      const actor = new BuildingClass(this.app, plot, entry.style);
      actor.init();
      actor.container.eventMode = 'static';
      actor.container.cursor = 'pointer';
      this._attachTooltip(actor, entry);
      this.root.addChild(actor.container);
      this.actors.push(actor);

      const meta = {
        actor,
        signalId: entry.signal,
        label: entry.valve?.label || entry.signal,
        threshold: Number(entry.valve?.alert_threshold ?? 0.85),
        lastSignal: null,
        lastSignalReceivedAt: null,
      };
      this.actorMeta.push(meta);

      if (entry.signal) {
        this.signalBus.subscribe(entry.signal, (signal) => {
          meta.lastSignal = signal;
          meta.lastSignalReceivedAt = Date.now() / 1000;
          actor.onSignal(signal);
        });
      }
    });
  }

  _attachTooltip(actor, entry) {
    actor.container.on('pointerover', () => {
      const signal = this.signalBus.getSignal(entry.signal);
      this.tooltip.style.display = 'block';
      this.tooltip.innerHTML = `<strong>${actor.constructor.label || entry.building}</strong><br>${entry.valve?.label || entry.signal || 'Unwired'}: ${signal?.value ?? '--'}`;
    });
    actor.container.on('pointerout', () => {
      this.tooltip.style.display = 'none';
    });
    actor.container.on('pointermove', (e) => {
      const pt = e.data.global;
      this.tooltip.style.left = `${pt.x + 12}px`;
      this.tooltip.style.top = `${pt.y + 12}px`;
    });
  }

  update(delta) {
    this.environment.update(delta);

    const nowSec = Date.now() / 1000;
    this.actorMeta.forEach((meta) => {
      const interval = this.signalBus.getPollInterval(meta.signalId);
      const signalTimestamp = Number(meta.lastSignal?.timestamp ?? 0);
      const freshnessTimestamp = signalTimestamp > 0 ? signalTimestamp : meta.lastSignalReceivedAt;
      const disconnected = freshnessTimestamp != null && nowSec - freshnessTimestamp > interval * 2;
      const value = Number(meta.lastSignal?.value ?? 0);
      const active = meta.lastSignal != null;
      const alert = active && Number.isFinite(value) && value > meta.threshold;
      if (disconnected) meta.actor.setAnimationState('disconnected');
      else if (alert) meta.actor.setAnimationState('alert');
      else if (active) meta.actor.setAnimationState('active');
      else meta.actor.setAnimationState('idle');
    });

    this.actors.forEach((actor) => actor.update(delta));
  }
}

export { REF_WIDTH, REF_HEIGHT };

import { BusStop } from './building_types/bus_stop.js';
import { WaterTower } from './building_types/water_tower.js';
import { Windmill } from './building_types/windmill.js';

class PlaceholderBuilding {
  static portType = 'gauge';

  static styles = ['default'];

  static label = 'Placeholder';

  constructor(app, plot, style = 'default') {
    this.app = app;
    this.plot = plot;
    this.style = style;
    this.container = new PIXI.Container();
  }

  init() {
    const body = new PIXI.Graphics();
    body.beginFill(0x4b5b73, 0.9);
    body.drawRoundedRect(-40, -120, 80, 120, 8);
    body.endFill();
    this.container.addChild(body);
    this.container.x = this.plot.x;
    this.container.y = this.plot.y;
  }

  update() {}

  onSignal() {}

  setAnimationState() {}

  destroy() {
    this.container.destroy({ children: true });
  }
}

export class BuildingType extends PlaceholderBuilding {}

const BUILDING_REGISTRY = new Map();

function register(key, type) {
  BUILDING_REGISTRY.set(key, type);
}

register('windmill', Windmill);
register('water_tower', WaterTower);
register('bus_stop', BusStop);
register('warehouse', PlaceholderBuilding);
register('power_station', PlaceholderBuilding);
register('server_tower', PlaceholderBuilding);
register('bank_ticker', PlaceholderBuilding);
register('construction_yard', PlaceholderBuilding);
register('swimming_pool', PlaceholderBuilding);
register('cafe', PlaceholderBuilding);
register('billboard', PlaceholderBuilding);
register('data_vault', PlaceholderBuilding);
register('drive_in', PlaceholderBuilding);
register('auth_gate', PlaceholderBuilding);
register('city_park', PlaceholderBuilding);
register('dockyard', PlaceholderBuilding);

export function getBuildingType(key) {
  return BUILDING_REGISTRY.get(key) ?? PlaceholderBuilding;
}

export function listBuildingTypes() {
  return [...BUILDING_REGISTRY.entries()].map(([id, Type]) => ({
    id,
    label: Type.label ?? id,
    portType: Type.portType ?? 'gauge',
    styles: Type.styles ?? ['default'],
  }));
}

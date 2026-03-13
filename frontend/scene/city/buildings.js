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

    const roof = new PIXI.Graphics();
    roof.beginFill(0x384355);
    roof.drawRect(-46, -126, 92, 12);
    roof.endFill();

    this.container.addChild(body, roof);
    this.container.x = this.plot.x;
    this.container.y = this.plot.y;
  }

  update() {}

  onSignal() {}

  setEditMode(active) {
    this.container.alpha = active ? 0.75 : 1;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}

/** Base class for concrete buildings. */
export class BuildingType extends PlaceholderBuilding {}

const BUILDING_REGISTRY = new Map();

function register(key, type) {
  BUILDING_REGISTRY.set(key, type);
}

register('windmill', Windmill);
register('water_tower', PlaceholderBuilding);
register('warehouse', PlaceholderBuilding);
register('power_station', PlaceholderBuilding);
register('server_tower', PlaceholderBuilding);
register('bus_stop', PlaceholderBuilding);
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

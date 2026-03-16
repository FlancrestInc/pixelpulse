import { BusStop }      from './building_types/bus_stop.js';
import { WaterTower }   from './building_types/water_tower.js';
import { Windmill }     from './building_types/windmill.js';
import { ServerTower }  from './building_types/server_tower.js';
import { Warehouse }    from './building_types/warehouse.js';
import { PowerStation } from './building_types/power_station.js';
import { BankTicker }   from './building_types/bank_ticker.js';
import { Cafe }         from './building_types/cafe.js';
import { DriveIn }      from './building_types/drive_in.js';
import { DataVault }    from './building_types/data_vault.js';
import { AuthGate }     from './building_types/auth_gate.js';
import { CityPark }     from './building_types/city_park.js';
import { Billboard }    from './building_types/billboard.js';

class PlaceholderBuilding {
  static portType = 'gauge';
  static styles = ['default'];
  static label = 'Placeholder';

  constructor(app, plot, style = 'default') {
    this.app = app; this.plot = plot; this.style = style;
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
  destroy() { this.container.destroy({ children: true }); }
}

export class BuildingType extends PlaceholderBuilding {}

const BUILDING_REGISTRY = new Map();
function register(key, type) { BUILDING_REGISTRY.set(key, type); }

register('windmill',          Windmill);
register('water_tower',       WaterTower);
register('bus_stop',          BusStop);
register('server_tower',      ServerTower);
register('warehouse',         Warehouse);
register('power_station',     PowerStation);
register('bank_ticker',       BankTicker);
register('cafe',              Cafe);
register('drive_in',          DriveIn);
register('data_vault',        DataVault);
register('auth_gate',         AuthGate);
register('city_park',         CityPark);
register('billboard',         Billboard);
// Still placeholder — Phase 8a
register('construction_yard', PlaceholderBuilding);
register('swimming_pool',     PlaceholderBuilding);
register('dockyard',          PlaceholderBuilding);

export function getBuildingType(key) {
  return BUILDING_REGISTRY.get(key) ?? PlaceholderBuilding;
}

export function listBuildingTypes() {
  return [...BUILDING_REGISTRY.entries()]
    .filter(([, Type]) => Type !== PlaceholderBuilding)
    .map(([id, Type]) => ({
      id,
      label:    Type.label    ?? id,
      portType: Type.portType ?? 'gauge',
      styles:   Type.styles   ?? ['default'],
    }));
}
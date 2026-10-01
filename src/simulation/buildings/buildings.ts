import { BUILDING_EFFECTS, BUILDINGS, DIFFICULTY, IRRIGATION, REGIONS, STORAGE } from '../../data/balance';
import type { SimContext } from '../context';
import { addTransaction } from '../economy/ledger';
import { notify } from '../notifications';
import { techMult } from '../technology/technology';
import type { Building, BuildingType, GameState } from '../types';
import { getTile, isOwned, tileIndex } from '../world/map';

export function countBuildings(state: GameState, type: BuildingType): number {
  return state.buildings.filter((b) => b.type === type).length;
}

export function storageCapacity(state: GameState): number {
  const base = STORAGE.farmhouse * Math.max(1, countBuildings(state, 'farmhouse'));
  return Math.round((base + STORAGE.silo * countBuildings(state, 'silo')) * techMult(state, 'storageMult'));
}

export function storageUsed(state: GameState): number {
  return Object.values(state.inventory).reduce((s, v) => s + v, 0);
}

export function machineSlots(state: GameState): number {
  return BUILDING_EFFECTS.shedMachineSlots * countBuildings(state, 'shed') + 1;
}

export function workerSlots(state: GameState): number {
  return (
    BUILDING_EFFECTS.baseWorkerSlots + BUILDING_EFFECTS.officeWorkerSlots * countBuildings(state, 'office')
  );
}

export function buildingCost(state: GameState, type: BuildingType): number {
  return Math.round(
    BUILDINGS[type].price * DIFFICULTY[state.difficulty].costMult * REGIONS[state.region].costMult,
  );
}

/** True when tile (x,y) is inside the radius of any irrigation station. */
export function inIrrigationRange(state: GameState, x: number, y: number): boolean {
  const r = IRRIGATION.stationRadius;
  for (const b of state.buildings) {
    if (b.type !== 'irrigation') continue;
    const cx = b.x + 0.5;
    const cy = b.y + 0.5;
    if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) return true;
  }
  return false;
}

export type PlacementCheck = { ok: true; cost: number } | { ok: false; reason: string; cost: number };

export function canPlaceBuilding(state: GameState, type: BuildingType, x: number, y: number): PlacementCheck {
  const def = BUILDINGS[type];
  const cost = buildingCost(state, type);
  if (!def.buildable) return { ok: false, reason: 'err.notBuildable', cost };
  if (state.progression.level < def.unlockLevel) return { ok: false, reason: 'err.levelRequired', cost };
  for (let dy = 0; dy < def.size; dy++) {
    for (let dx = 0; dx < def.size; dx++) {
      const t = getTile(state, x + dx, y + dy);
      if (!t) return { ok: false, reason: 'err.outOfMap', cost };
      if (!isOwned(state, x + dx, y + dy)) return { ok: false, reason: 'err.notOwned', cost };
      if (t.terrain !== 'grass') return { ok: false, reason: 'err.badTerrain', cost };
      if (t.building !== null) return { ok: false, reason: 'err.occupied', cost };
      if (t.crop) return { ok: false, reason: 'err.hasCrop', cost };
    }
  }
  if (state.money < cost) return { ok: false, reason: 'err.noMoney', cost };
  return { ok: true, cost };
}

/** Places a building without charging (used by world setup). */
export function placeBuilding(state: GameState, type: BuildingType, x: number, y: number): Building {
  const b: Building = { id: state.nextId++, type, x, y, builtDay: state.day };
  const size = BUILDINGS[type].size;
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const t = state.map.tiles[tileIndex(state.map.width, x + dx, y + dy)];
      t.building = b.id;
      t.field = 'natural';
      t.crop = null;
    }
  }
  state.buildings.push(b);
  return b;
}

export function build(ctx: SimContext, type: BuildingType, x: number, y: number): PlacementCheck {
  const check = canPlaceBuilding(ctx.state, type, x, y);
  if (!check.ok) return check;
  addTransaction(
    ctx,
    'buildings',
    { key: 'ledger.build', params: { building: `@building.${type}` } },
    -check.cost,
  );
  placeBuilding(ctx.state, type, x, y);
  ctx.state.stats.buildingsBuilt++;
  const size = BUILDINGS[type].size;
  const changed: number[] = [];
  for (let dy = 0; dy < size; dy++)
    for (let dx = 0; dx < size; dx++) changed.push(tileIndex(ctx.state.map.width, x + dx, y + dy));
  ctx.emit('tilesChanged', changed);
  ctx.emit('buildingsChanged', undefined);
  notify(ctx, 'success', 'notif.built', { building: `@building.${type}` });
  ctx.emit('feedback', {
    key: 'fb.built',
    params: { building: `@building.${type}` },
    x: x + 1,
    y,
    tone: 'info',
  });
  ctx.emit('analytics', { name: 'building_built', props: { type } });
  ctx.emit('requestSave', 'build');
  return check;
}

export function buildingsUpkeep(state: GameState): number {
  return state.buildings.reduce((s, b) => s + BUILDINGS[b.type].upkeep, 0);
}

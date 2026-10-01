import {
  CROPS,
  DIFFICULTY,
  FOREST_CLEAR_MULT,
  IRRIGATION,
  OPERATIONS,
  PROGRESSION,
  REGIONS,
  SOIL,
  STORAGE,
} from '../../data/balance';
import { clamp, round } from '../../utils/math';
import { inIrrigationRange, storageCapacity, storageUsed } from '../buildings/buildings';
import type { SimContext } from '../context';
import { addTransaction } from '../economy/ledger';
import { eventSeedMult } from '../events/events';
import { conditionEfficiency, fuelPenalty, useMachine, workingMachine } from '../machinery/machines';
import { notify } from '../notifications';
import { addXp, checkProgress } from '../progression/progression';
import { techMult } from '../technology/technology';
import { toDate } from '../time/calendar';
import type { CropId, FieldOperation, GameState, Machine, Tile } from '../types';
import { fieldLaborDiscount, workforce } from '../workers/workers';
import { isOwned, tileIndex } from '../world/map';
import { estimateYield } from './growth';

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function normalizeRect(r: Rect): Rect {
  return {
    x0: Math.min(r.x0, r.x1),
    y0: Math.min(r.y0, r.y1),
    x1: Math.max(r.x0, r.x1),
    y1: Math.max(r.y0, r.y1),
  };
}

export interface OpPreview {
  op: FieldOperation;
  cropId: CropId | null;
  /** Tiles selected in the rectangle. */
  selected: number;
  /** Tiles where the operation applies. */
  eligible: number;
  /** Tiles that will actually be done today (capacity). */
  count: number;
  /** Tile indices that will be processed. */
  tiles: number[];
  laborCost: number;
  seedCost: number;
  fuelCost: number;
  totalCost: number;
  capacityLeft: number;
  usesMachine: boolean;
  /** Estimated harvest/yield in tonnes (harvest & plant). */
  estimatedTonnes: number;
  ok: boolean;
  reason: string | null;
  warnings: string[];
}

function costMult(state: GameState): number {
  return DIFFICULTY[state.difficulty].costMult * REGIONS[state.region].costMult;
}

export function totalCapacity(state: GameState, op: FieldOperation): number {
  const def = OPERATIONS[op];
  let cap = def.baseCapacity;
  if (def.machine) {
    const m = workingMachine(state, def.machine);
    if (m) cap += def.machineCapacity * conditionEfficiency(m);
  }
  cap += def.workerCapacity * workforce(state, op === 'irrigate' ? 'irrigation' : 'field');
  return Math.floor(cap * techMult(state, 'capacityMult'));
}

export function capacityLeft(state: GameState, op: FieldOperation): number {
  return Math.max(0, totalCapacity(state, op) - (state.workUsed[op] ?? 0));
}

function isEligible(state: GameState, op: FieldOperation, t: Tile, x: number, y: number, cropId: CropId | null): boolean {
  if (!isOwned(state, x, y) || t.building !== null) return false;
  switch (op) {
    case 'prepare':
      return (t.terrain === 'grass' || t.terrain === 'forest') && t.field === 'natural';
    case 'plant':
      return t.terrain === 'grass' && t.field === 'prepared' && cropId !== null;
    case 'irrigate':
      return t.terrain === 'grass' && t.field !== 'natural' && t.moisture < 90;
    case 'harvest':
      return t.field === 'planted' && t.crop !== null && t.crop.readyDay !== null;
  }
}

export function laborCostPerTile(state: GameState, op: FieldOperation, machine: Machine | null): number {
  const def = OPERATIONS[op];
  const base = machine ? def.machineCost : def.manualCost;
  return base * (1 - fieldLaborDiscount(state)) * costMult(state);
}

export function previewOperation(state: GameState, op: FieldOperation, rect: Rect, cropId: CropId | null = null): OpPreview {
  const r = normalizeRect(rect);
  const def = OPERATIONS[op];
  const machine = def.machine ? workingMachine(state, def.machine) : null;
  const warnings: string[] = [];
  const capLeft = capacityLeft(state, op);
  const tiles: number[] = [];
  let selected = 0;
  let eligible = 0;
  let labor = 0;
  let seeds = 0;
  let estimatedTonnes = 0;
  let capacityUsed = 0;
  let stationTiles = 0;

  if (op === 'plant') {
    if (!cropId) return emptyPreview(op, cropId, 'err.noCrop', capLeft);
    if (state.progression.level < CROPS[cropId].unlockLevel) return emptyPreview(op, cropId, 'err.levelRequired', capLeft);
  }
  const perTileLabor = laborCostPerTile(state, op, machine);
  const seedPerTile = cropId ? CROPS[cropId].seedCost * eventSeedMult(state) * costMult(state) : 0;

  for (let y = Math.max(0, r.y0); y <= Math.min(state.map.height - 1, r.y1); y++) {
    for (let x = Math.max(0, r.x0); x <= Math.min(state.map.width - 1, r.x1); x++) {
      selected++;
      const i = tileIndex(state.map.width, x, y);
      const t = state.map.tiles[i];
      if (!isEligible(state, op, t, x, y, cropId)) continue;
      eligible++;
      const viaStation = op === 'irrigate' && inIrrigationRange(state, x, y);
      if (!viaStation && capacityUsed >= capLeft) continue;
      if (viaStation) {
        stationTiles++;
        labor += IRRIGATION.stationCost * techMult(state, 'irrigationCostMult') * costMult(state);
      } else {
        capacityUsed++;
        let c = perTileLabor;
        if (op === 'prepare' && t.terrain === 'forest') c *= FOREST_CLEAR_MULT;
        if (op === 'harvest' && t.crop) c *= CROPS[t.crop.cropId].harvestEffort;
        if (op === 'irrigate') c *= techMult(state, 'irrigationCostMult');
        labor += c;
      }
      if (op === 'plant') seeds += seedPerTile;
      if (op === 'harvest') estimatedTonnes += estimateYield(state, t);
      tiles.push(i);
    }
  }
  const count = tiles.length;
  const fuelCost = machine ? count * def.fuelPerTile * fuelPenalty(machine) * state.market.fuelPrice : 0;
  const totalCost = round(labor + seeds + fuelCost, 2);

  if (op === 'plant' && cropId) {
    const season = toDate(state.day).season;
    if (!CROPS[cropId].plantingSeason.includes(season)) warnings.push('warn.outOfSeason');
    estimatedTonnes = count * CROPS[cropId].baseYield;
  }
  if (op === 'harvest') {
    if (estimatedTonnes > storageCapacity(state) - storageUsed(state)) warnings.push('warn.storageOverflow');
  }
  if (count < eligible) warnings.push('warn.capacityLimited');
  if (stationTiles > 0) warnings.push('warn.stationIrrigation');

  let reason: string | null = null;
  if (eligible === 0) reason = noEligibleReason(op);
  else if (count === 0) reason = 'err.noCapacity';
  else if (state.money < totalCost) reason = 'err.noMoney';

  return {
    op,
    cropId,
    selected,
    eligible,
    count,
    tiles,
    laborCost: round(labor, 2),
    seedCost: round(seeds, 2),
    fuelCost: round(fuelCost, 2),
    totalCost,
    capacityLeft: capLeft,
    usesMachine: machine !== null,
    estimatedTonnes: round(estimatedTonnes, 1),
    ok: reason === null,
    reason,
    warnings,
  };
}

function noEligibleReason(op: FieldOperation): string {
  switch (op) {
    case 'prepare':
      return 'err.nothingToPrepare';
    case 'plant':
      return 'err.nothingToPlant';
    case 'irrigate':
      return 'err.nothingToIrrigate';
    case 'harvest':
      return 'err.nothingToHarvest';
  }
}

function emptyPreview(op: FieldOperation, cropId: CropId | null, reason: string, capLeft: number): OpPreview {
  return {
    op,
    cropId,
    selected: 0,
    eligible: 0,
    count: 0,
    tiles: [],
    laborCost: 0,
    seedCost: 0,
    fuelCost: 0,
    totalCost: 0,
    capacityLeft: capLeft,
    usesMachine: false,
    estimatedTonnes: 0,
    ok: false,
    reason,
    warnings: [],
  };
}

export interface OpResult {
  ok: boolean;
  reason: string | null;
  count: number;
  cost: number;
  tonnes: number;
  overflowSold: number;
  overflowRevenue: number;
}

/** Executes a field operation over a rectangle. All validations happen here (not in the UI). */
export function executeOperation(ctx: SimContext, op: FieldOperation, rect: Rect, cropId: CropId | null = null): OpResult {
  const s = ctx.state;
  const p = previewOperation(s, op, rect, cropId);
  const fail = (reason: string): OpResult => ({ ok: false, reason, count: 0, cost: 0, tonnes: 0, overflowSold: 0, overflowRevenue: 0 });
  if (!p.ok) return fail(p.reason ?? 'err.unknown');

  const def = OPERATIONS[op];
  const machine = def.machine ? workingMachine(s, def.machine) : null;
  const r = normalizeRect(rect);
  const cx = Math.round((r.x0 + r.x1) / 2);
  const cy = Math.round((r.y0 + r.y1) / 2);

  // 1) Charge seeds and labour (fuel is charged by the machine use).
  if (p.seedCost > 0) {
    addTransaction(ctx, 'seeds', { key: 'ledger.seeds', params: { crop: `@crop.${cropId}`, count: p.count } }, -p.seedCost);
  }
  if (p.laborCost > 0) {
    addTransaction(
      ctx,
      op === 'irrigate' ? 'irrigation' : 'fieldwork',
      { key: `ledger.op.${op}`, params: { count: p.count } },
      -p.laborCost,
    );
  }
  let usedCapacity = 0;
  for (const i of p.tiles) {
    const x = i % s.map.width;
    const y = Math.floor(i / s.map.width);
    if (!(op === 'irrigate' && inIrrigationRange(s, x, y))) usedCapacity++;
  }
  s.workUsed[op] = (s.workUsed[op] ?? 0) + usedCapacity;
  if (machine && p.count > 0) useMachine(ctx, machine, p.count, def.fuelPerTile, def.wearPerTile);

  let tonnes = 0;
  let overflowSold = 0;
  let overflowRevenue = 0;

  // 2) Apply effects to tiles.
  for (const i of p.tiles) {
    const t = s.map.tiles[i];
    switch (op) {
      case 'prepare':
        if (t.terrain === 'forest') t.terrain = 'grass';
        t.field = 'prepared';
        break;
      case 'plant': {
        if (!cropId) break;
        if (t.lastCrop === cropId) t.soilHealth = clamp(t.soilHealth - SOIL.monocropPenalty, 30, 100);
        t.field = 'planted';
        t.crop = {
          cropId,
          plantedDay: s.day,
          progress: 0,
          health: 100,
          conditionSum: 0,
          conditionDays: 0,
          readyDay: null,
        };
        s.stats.tilesPlanted++;
        break;
      }
      case 'irrigate':
        t.moisture = clamp(t.moisture + IRRIGATION.moistureGain, 0, 100);
        break;
      case 'harvest': {
        const crop = t.crop;
        if (!crop) break;
        const y = estimateYield(s, t);
        const free = Math.max(0, storageCapacity(s) - storageUsed(s));
        const stored = Math.min(free, y);
        s.inventory[crop.cropId] = round(s.inventory[crop.cropId] + stored, 3);
        const over = y - stored;
        if (over > 0) {
          const price = s.market.commodities[crop.cropId].price * STORAGE.overflowSaleFactor;
          overflowSold += over;
          overflowRevenue += over * price;
          s.year.revenueByCrop[crop.cropId] = round((s.year.revenueByCrop[crop.cropId] ?? 0) + over * price, 2);
        }
        tonnes += y;
        s.stats.production[crop.cropId] = round(s.stats.production[crop.cropId] + y, 3);
        s.stats.totalProduction = round(s.stats.totalProduction + y, 3);
        s.stats.tilesHarvested++;
        t.fertility = clamp(t.fertility - CROPS[crop.cropId].fertilityRequirement, 5, 100);
        t.lastCrop = crop.cropId;
        t.crop = null;
        t.field = 'natural';
        break;
      }
    }
  }

  if (overflowRevenue > 0) {
    addTransaction(ctx, 'sales', { key: 'ledger.overflowSale', params: { tonnes: round(overflowSold, 1) } }, round(overflowRevenue, 2));
    s.stats.salesRevenue = round(s.stats.salesRevenue + overflowRevenue, 2);
    notify(ctx, 'warning', 'notif.storageFull', { tonnes: round(overflowSold, 1) });
  }

  ctx.emit('tilesChanged', p.tiles);
  const costKey = op === 'plant' ? 'fb.costSeeds' : 'fb.cost';
  if (p.totalCost > 0) ctx.emit('feedback', { key: costKey, params: { amount: Math.round(p.totalCost) }, x: cx, y: cy - 1, tone: 'bad' });

  switch (op) {
    case 'prepare':
      ctx.emit('feedback', { key: 'fb.prepared', params: { count: p.count }, x: cx, y: cy, tone: 'info' });
      break;
    case 'plant':
      ctx.emit('feedback', { key: 'fb.planted', params: { crop: `@crop.${cropId}` }, x: cx, y: cy, tone: 'good' });
      ctx.emit('analytics', { name: 'crop_planted', props: { crop: cropId ?? '', tiles: p.count } });
      break;
    case 'irrigate':
      ctx.emit('feedback', { key: 'fb.irrigated', params: { count: p.count }, x: cx, y: cy, tone: 'info' });
      break;
    case 'harvest': {
      ctx.emit('feedback', { key: 'fb.harvested', params: { tonnes: round(tonnes, 1) }, x: cx, y: cy, tone: 'good' });
      addXp(ctx, PROGRESSION.xpHarvestPerTile * p.count);
      ctx.emit('analytics', { name: 'crop_harvested', props: { tiles: p.count, tonnes: round(tonnes, 1) } });
      const fill = storageUsed(s) / Math.max(1, storageCapacity(s));
      if (fill >= 0.9) notify(ctx, 'warning', 'notif.storageAlmostFull', { pct: Math.round(fill * 100) });
      ctx.emit('requestSave', 'harvest');
      break;
    }
  }
  checkProgress(ctx);
  return { ok: true, reason: null, count: p.count, cost: p.totalCost, tonnes: round(tonnes, 2), overflowSold, overflowRevenue };
}

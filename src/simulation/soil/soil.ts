import { CROPS, EVENT_RULES, IRRIGATION, SOIL, WORKERS } from '../../data/balance';
import { clamp, round } from '../../utils/math';
import { inIrrigationRange } from '../buildings/buildings';
import { growCropOneDay } from '../crops/growth';
import type { SimContext } from '../context';
import { addTransaction } from '../economy/ledger';
import { eventCropDamage } from '../events/events';
import { workingMachine } from '../machinery/machines';
import { notify } from '../notifications';
import { techMult } from '../technology/technology';
import { toDate } from '../time/calendar';
import type { Tile } from '../types';
import { weatherMoistureDelta } from '../weather/weather';
import { workforce } from '../workers/workers';
import { isOwned } from '../world/map';

export interface SoilDayResult {
  changed: number[];
  becameReady: number;
  died: number;
  autoIrrigated: number;
}

/** Natural moisture change for a tile on a given day (without irrigation). */
export function dailyMoistureDelta(tile: Tile, weatherDelta: number, waterUseMult: number): number {
  let d = weatherDelta;
  if (tile.crop) d -= CROPS[tile.crop.cropId].waterRequirement * waterUseMult;
  // Slow drift toward field capacity (~55) from drainage/capillarity.
  d += (55 - tile.moisture) * 0.02;
  return d;
}

/**
 * Daily soil + crop update for the whole map: moisture, fertility recovery,
 * auto irrigation (stations and workers), growth, damage and death.
 */
export function updateSoilAndCrops(ctx: SimContext): SoilDayResult {
  const s = ctx.state;
  const { season } = toDate(s.day);
  const weather = s.weather.today;
  const wDelta = weatherMoistureDelta(weather);
  const waterUse = techMult(s, 'waterUseMult');
  const sprayer = workingMachine(s, 'sprayer');
  const pestDamage = eventCropDamage(s) * (sprayer ? EVENT_RULES.sprayerDamageFactor : 1);
  const changed: number[] = [];
  let becameReady = 0;
  let died = 0;
  let stationTiles = 0;
  const dryPlanted: number[] = [];

  for (let i = 0; i < s.map.tiles.length; i++) {
    const t = s.map.tiles[i];
    if (t.terrain !== 'grass') continue;
    t.moisture = round(clamp(t.moisture + dailyMoistureDelta(t, wDelta, waterUse), 0, 100), 2);
    if (t.field !== 'planted') {
      t.fertility = round(clamp(t.fertility + SOIL.fallowRecovery, 0, SOIL.maxFertility), 2);
      t.soilHealth = round(clamp(t.soilHealth + SOIL.soilHealthRecovery, 0, 100), 2);
    }
    if (!t.crop) continue;
    const x = i % s.map.width;
    const y = Math.floor(i / s.map.width);
    if (!isOwned(s, x, y)) continue;
    if (t.moisture < IRRIGATION.stationThreshold && inIrrigationRange(s, x, y)) {
      t.moisture = clamp(t.moisture + IRRIGATION.moistureGain, 0, 100);
      stationTiles++;
    } else if (t.moisture < SOIL.dryThreshold) {
      dryPlanted.push(i);
    }
    // Healthy crops slowly recover when a sprayer is available.
    if (sprayer && t.crop.health < 100 && pestDamage === 0) t.crop.health = Math.min(100, t.crop.health + 0.5);
    const r = growCropOneDay(s, t, season, weather, pestDamage);
    if (r.died) {
      t.crop = null;
      t.field = 'natural';
      died++;
      changed.push(i);
      continue;
    }
    if (r.becameReady) becameReady++;
    if (r.stageChanged) changed.push(i);
  }

  if (stationTiles > 0) {
    const cost = stationTiles * IRRIGATION.stationCost * techMult(s, 'irrigationCostMult');
    addTransaction(ctx, 'irrigation', { key: 'ledger.autoIrrigation', params: { count: stationTiles } }, -round(cost, 2));
  }

  // Irrigation workers water the driest planted tiles.
  let workerTiles = Math.floor(WORKERS.irrigationTilesPerDay * workforce(s, 'irrigation'));
  if (workerTiles > 0 && dryPlanted.length > 0) {
    dryPlanted.sort((a, b) => s.map.tiles[a].moisture - s.map.tiles[b].moisture);
    let n = 0;
    for (const i of dryPlanted) {
      if (workerTiles-- <= 0) break;
      s.map.tiles[i].moisture = clamp(s.map.tiles[i].moisture + IRRIGATION.moistureGain, 0, 100);
      n++;
    }
    if (n > 0) {
      addTransaction(
        ctx,
        'irrigation',
        { key: 'ledger.autoIrrigation', params: { count: n } },
        -round(n * WORKERS.irrigationWaterCost * techMult(s, 'irrigationCostMult'), 2),
      );
    }
  }

  if (sprayer && pestDamage > 0) {
    // Spraying during pests consumes fuel proportional to planted area.
    const planted = s.map.tiles.filter((t) => t.crop).length;
    const fuel = planted * 0.4;
    addTransaction(ctx, 'fuel', { key: 'ledger.fuel', params: { machine: '@machine.sprayer' } }, -round(fuel * s.market.fuelPrice, 2));
    sprayer.condition = Math.max(0, sprayer.condition - 0.2);
  }

  if (becameReady > 0) notify(ctx, 'success', 'notif.harvestReady', { count: becameReady });
  if (died > 0) notify(ctx, 'error', 'notif.cropsDied', { count: died });
  if (dryPlanted.length > 0 && s.day % 3 === 0) notify(ctx, 'weather', 'notif.drySoil', { count: dryPlanted.length });
  return { changed, becameReady, died, autoIrrigated: stationTiles };
}

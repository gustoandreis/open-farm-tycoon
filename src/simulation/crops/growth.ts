import { CROPS, DIFFICULTY, REGIONS, SOIL } from '../../data/balance';
import { clamp, round } from '../../utils/math';
import { techMult } from '../technology/technology';
import type { CropInstance, CropStage, GameState, Season, Tile, WeatherType } from '../types';
import { weatherGrowthFactor } from '../weather/weather';

/** Fraction of growth completed, clamped 0..1. */
export function growthFraction(crop: CropInstance): number {
  return clamp(crop.progress / CROPS[crop.cropId].growthDays, 0, 1);
}

export function cropStage(crop: CropInstance): CropStage {
  const f = growthFraction(crop);
  if (f >= 1) return 'ready';
  if (f >= 0.8) return 'mature';
  if (f >= 0.5) return 'mid';
  if (f >= 0.25) return 'early';
  if (f >= 0.08) return 'sprout';
  return 'seed';
}

export const CROP_STAGES: CropStage[] = ['seed', 'sprout', 'early', 'mid', 'mature', 'ready'];

export function moistureGrowthFactor(moisture: number): number {
  if (moisture <= SOIL.criticalThreshold) return 0.15;
  if (moisture < SOIL.dryThreshold)
    return 0.4 + ((moisture - SOIL.criticalThreshold) / (SOIL.dryThreshold - SOIL.criticalThreshold)) * 0.5;
  if (moisture > SOIL.waterlogThreshold) return 0.85;
  return 1;
}

export function fertilityFactor(fertility: number): number {
  return clamp(0.55 + (fertility / 100) * 0.6, 0.4, 1.15);
}

/** Daily growth factor (used for both growth speed and accumulated yield quality). */
export function dailyConditionFactor(tile: Tile, season: Season, weather: WeatherType): number {
  if (!tile.crop) return 0;
  const def = CROPS[tile.crop.cropId];
  const f =
    moistureGrowthFactor(tile.moisture) *
    def.seasonGrowth[season] *
    weatherGrowthFactor(weather) *
    (0.85 + (tile.soilHealth / 100) * 0.15);
  return clamp(f, 0, 1.3);
}

export interface GrowthResult {
  stageChanged: boolean;
  becameReady: boolean;
  died: boolean;
}

/**
 * Advances a planted tile by one day. Damage from weather/frost/pests is
 * applied to crop health. Returns what changed so the renderer can update.
 */
export function growCropOneDay(
  state: GameState,
  tile: Tile,
  season: Season,
  weather: WeatherType,
  extraDamage: number,
): GrowthResult {
  const crop = tile.crop;
  if (!crop) return { stageChanged: false, becameReady: false, died: false };
  const def = CROPS[crop.cropId];
  const before = cropStage(crop);
  const factor = dailyConditionFactor(tile, season, weather);

  if (crop.readyDay === null) {
    crop.progress = clamp(crop.progress + factor, 0, def.growthDays);
    crop.conditionSum += factor;
    crop.conditionDays += 1;
  }

  let damage = extraDamage;
  if (tile.moisture <= SOIL.criticalThreshold) damage += 2.5;
  if (weather === 'cold' || (season === 'winter' && weather === 'cloudy'))
    damage += def.frostSensitivity * (season === 'winter' ? 1 : 0.4);
  if (weather === 'storm') damage += 2.5;
  if (weather === 'heavyRain' && tile.moisture >= SOIL.waterlogThreshold) damage += 1;
  if (crop.readyDay !== null && state.day - crop.readyDay > 15) damage += 1; // left too long in the field
  crop.health = round(clamp(crop.health - damage, 0, 100), 2);

  let becameReady = false;
  if (crop.readyDay === null && crop.progress >= def.growthDays) {
    crop.readyDay = state.day;
    becameReady = true;
  }
  const died = crop.health <= 0;
  return { stageChanged: before !== cropStage(crop), becameReady, died };
}

/** Expected yield in tonnes for a crop if harvested now (or at maturity for growing crops). */
export function estimateYield(state: GameState, tile: Tile): number {
  const crop = tile.crop;
  if (!crop) return 0;
  const def = CROPS[crop.cropId];
  const avgCondition = crop.conditionDays > 0 ? crop.conditionSum / crop.conditionDays : 1;
  const conditionFactor = clamp(avgCondition, 0.2, 1.15);
  const healthFactor = clamp(crop.health / 100, 0, 1);
  const regionMult = REGIONS[state.region].yieldMult[crop.cropId] ?? 1;
  const y =
    def.baseYield *
    fertilityFactor(tile.fertility) *
    conditionFactor *
    healthFactor *
    techMult(state, 'yieldMult') *
    DIFFICULTY[state.difficulty].yieldMult *
    regionMult;
  return round(clamp(y, 0, def.baseYield * 1.6), 2);
}

import { describe, expect, it } from 'vitest';
import { CROPS } from '../src/data/balance';
import {
  cropStage,
  estimateYield,
  growCropOneDay,
  growthFraction,
  moistureGrowthFactor,
} from '../src/simulation/crops/growth';
import type { Tile } from '../src/simulation/types';
import { newTestGame } from './helpers';

function plantedTile(moisture = 60): Tile {
  return {
    terrain: 'grass',
    field: 'planted',
    fertility: 80,
    moisture,
    soilHealth: 100,
    building: null,
    lastCrop: null,
    crop: {
      cropId: 'corn',
      plantedDay: 0,
      progress: 0,
      health: 100,
      conditionSum: 0,
      conditionDays: 0,
      readyDay: null,
    },
  };
}

describe('crops & growth', () => {
  it('defines the 5 mandatory crops with complete config', () => {
    for (const id of ['corn', 'soy', 'wheat', 'potato', 'sunflower'] as const) {
      const c = CROPS[id];
      expect(c.seedCost).toBeGreaterThan(0);
      expect(c.growthDays).toBeGreaterThan(0);
      expect(c.baseYield).toBeGreaterThan(0);
      expect(c.baseMarketPrice).toBeGreaterThan(0);
      expect(c.plantingSeason.length).toBeGreaterThan(0);
      expect(c.harvestSeason.length).toBeGreaterThan(0);
    }
  });

  it('progresses through stages and becomes ready', () => {
    const g = newTestGame();
    const tile = plantedTile();
    const stages = new Set<string>();
    let ready = false;
    for (let d = 0; d < 100 && !ready; d++) {
      tile.moisture = 60;
      const r = growCropOneDay(g.state, tile, 'summer', 'sunny', 0);
      if (tile.crop) stages.add(cropStage(tile.crop));
      ready = r.becameReady;
    }
    expect(ready).toBe(true);
    expect(stages.has('sprout')).toBe(true);
    expect(stages.has('mid')).toBe(true);
    expect(stages.has('ready')).toBe(true);
  });

  it('growth is limited to growthDays (never exceeds 100%)', () => {
    const g = newTestGame();
    const tile = plantedTile();
    for (let d = 0; d < 300; d++) growCropOneDay(g.state, tile, 'summer', 'sunny', 0);
    expect(tile.crop === null || tile.crop.progress <= CROPS.corn.growthDays).toBe(true);
    if (tile.crop) expect(growthFraction(tile.crop)).toBeLessThanOrEqual(1);
  });

  it('low moisture slows growth', () => {
    expect(moistureGrowthFactor(60)).toBeGreaterThan(moistureGrowthFactor(20));
    expect(moistureGrowthFactor(20)).toBeGreaterThan(moistureGrowthFactor(5));
    const g = newTestGame();
    const wet = plantedTile(60);
    const dry = plantedTile(10);
    for (let d = 0; d < 10; d++) {
      wet.moisture = 60;
      dry.moisture = 10;
      growCropOneDay(g.state, wet, 'summer', 'sunny', 0);
      growCropOneDay(g.state, dry, 'summer', 'sunny', 0);
    }
    expect(wet.crop?.progress ?? 0).toBeGreaterThan(dry.crop?.progress ?? 0);
    // Critical moisture also damages the crop.
    expect(dry.crop?.health ?? 0).toBeLessThan(100);
  });

  it('out of season grows slower', () => {
    const g = newTestGame();
    const a = plantedTile();
    const b = plantedTile();
    for (let d = 0; d < 10; d++) {
      growCropOneDay(g.state, a, 'summer', 'cloudy', 0);
      growCropOneDay(g.state, b, 'winter', 'sunny', 0);
    }
    expect(a.crop?.progress ?? 0).toBeGreaterThan(b.crop?.progress ?? 0);
  });

  it('yield is never negative and is bounded', () => {
    const g = newTestGame();
    const tile = plantedTile();
    if (!tile.crop) throw new Error('no crop');
    tile.crop.health = 0;
    expect(estimateYield(g.state, tile)).toBe(0);
    tile.crop.health = 100;
    tile.crop.conditionSum = 50;
    tile.crop.conditionDays = 10;
    tile.fertility = 100;
    expect(estimateYield(g.state, tile)).toBeLessThanOrEqual(CROPS.corn.baseYield * 1.6);
    expect(estimateYield(g.state, tile)).toBeGreaterThan(0);
  });

  it('better fertility gives better yield', () => {
    const g = newTestGame();
    const a = plantedTile();
    const b = plantedTile();
    a.fertility = 90;
    b.fertility = 30;
    expect(estimateYield(g.state, a)).toBeGreaterThan(estimateYield(g.state, b));
  });
});

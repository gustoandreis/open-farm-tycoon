import { describe, expect, it } from 'vitest';
import { FORECAST_DAYS, WEATHER_TYPES } from '../src/data/balance';
import { getEventDef, triggerEvent } from '../src/simulation/events/events';
import { dailyMoistureDelta } from '../src/simulation/soil/soil';
import { rollWeather } from '../src/simulation/weather/weather';
import { Rng } from '../src/utils/rng';
import { newTestGame } from './helpers';

describe('weather', () => {
  it('keeps a 7-day forecast', () => {
    const g = newTestGame();
    expect(g.state.weather.forecast).toHaveLength(FORECAST_DAYS);
    g.advanceDays(25);
    expect(g.state.weather.forecast).toHaveLength(FORECAST_DAYS);
    for (const f of g.state.weather.forecast) {
      expect(WEATHER_TYPES).toContain(f.actual);
      expect(WEATHER_TYPES).toContain(f.shown);
    }
  });

  it('tomorrow becomes today (forecast actual is respected)', () => {
    const g = newTestGame('WX');
    const tomorrow = g.state.weather.forecast[0].actual;
    g.advanceDay();
    expect(g.state.weather.today).toBe(tomorrow);
  });

  it('is deterministic with the same seed', () => {
    const a = newTestGame('SAME');
    const b = newTestGame('SAME');
    a.advanceDays(60);
    b.advanceDays(60);
    expect(a.state.weather).toEqual(b.state.weather);
  });

  it('no cold-free summer: never "cold" in summer, frequent in winter', () => {
    const r = new Rng(3);
    let summerCold = 0;
    let winterCold = 0;
    for (let i = 0; i < 2000; i++) {
      if (rollWeather(r, 'summer', 'parana', null, null) === 'cold') summerCold++;
      if (rollWeather(r, 'winter', 'parana', null, null) === 'cold') winterCold++;
    }
    expect(summerCold).toBe(0);
    expect(winterCold).toBeGreaterThan(100);
  });

  it('rain increases moisture, drought decreases it', () => {
    const g = newTestGame();
    const tile = g.state.map.tiles.find((x) => x.terrain === 'grass');
    if (!tile) throw new Error('no grass');
    tile.moisture = 50;
    expect(dailyMoistureDelta(tile, 18, 1)).toBeGreaterThan(0);
    expect(dailyMoistureDelta(tile, -9, 1)).toBeLessThan(0);
  });

  it('a drought event biases the weather toward drought', () => {
    const g = newTestGame('DRY');
    const def = getEventDef('drought');
    if (!def) throw new Error('missing event');
    triggerEvent(g, def);
    let dry = 0;
    for (let i = 0; i < 8; i++) {
      g.advanceDay();
      if (g.state.weather.today === 'drought') dry++;
    }
    expect(dry).toBeGreaterThanOrEqual(3);
  });
});

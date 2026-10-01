import { describe, expect, it } from 'vitest';
import { EVENTS } from '../src/data/balance';
import { eventFuelMult, eventPriceMult, getEventDef, triggerEvent } from '../src/simulation/events/events';
import { storageCapacity } from '../src/simulation/buildings/buildings';
import { estimateYield } from '../src/simulation/crops/growth';
import { canResearch, techMult } from '../src/simulation/technology/technology';
import { ownedTileCount } from '../src/simulation/world/map';
import { newTestGame } from './helpers';

describe('events', () => {
  it('every event has the required data', () => {
    for (const e of EVENTS) {
      expect(e.id).toBeTruthy();
      expect(e.probability).toBeGreaterThan(0);
      expect(e.duration).toBeGreaterThan(0);
      expect(e.effects).toBeTypeOf('object');
    }
  });

  it('events happen over a long run and expire', () => {
    const g = newTestGame('EVENTS');
    g.advanceDays(720);
    expect(g.state.events.history.length).toBeGreaterThan(0);
    for (const a of g.state.events.active) expect(a.endDay).toBeGreaterThan(g.state.day);
  });

  it('subsidy pays per owned tile', () => {
    const g = newTestGame();
    const def = getEventDef('subsidy');
    if (!def) throw new Error('missing');
    const m0 = g.state.money;
    triggerEvent(g, def);
    expect(g.state.money).toBeCloseTo(m0 + 35 * ownedTileCount(g.state), 2);
  });

  it('fuel spike and price events change multipliers', () => {
    const g = newTestGame();
    triggerEvent(g, getEventDef('fuelSpike')!);
    triggerEvent(g, getEventDef('cornDrop')!);
    expect(eventFuelMult(g.state)).toBeGreaterThan(1);
    expect(eventPriceMult(g.state, 'corn')).toBeLessThan(1);
  });

  it('machine breakdown breaks a machine', () => {
    const g = newTestGame();
    g.buyMachine('tractor');
    triggerEvent(g, getEventDef('machineBreak')!);
    expect(g.state.machines[0].broken).toBe(true);
  });
});

describe('technology', () => {
  it('requires level, prerequisites and money', () => {
    const g = newTestGame();
    expect(canResearch(g.state, 'improvedSeeds').ok).toBe(false); // level 2
    g.state.progression.level = 5;
    g.state.money = 1e6;
    expect(canResearch(g.state, 'precisionAg').ok).toBe(false); // needs improvedSeeds
    expect(g.research('improvedSeeds').ok).toBe(true);
    expect(g.research('improvedSeeds').ok).toBe(false);
    expect(canResearch(g.state, 'precisionAg').ok).toBe(true);
  });

  it('has measurable effects', () => {
    const g = newTestGame();
    g.state.progression.level = 5;
    g.state.money = 1e6;
    const tile = g.state.map.tiles.find((x) => x.terrain === 'grass');
    if (!tile) throw new Error('no grass');
    tile.crop = {
      cropId: 'soy',
      plantedDay: 0,
      progress: 28,
      health: 100,
      conditionSum: 1,
      conditionDays: 1,
      readyDay: 0,
    };
    const y0 = estimateYield(g.state, tile);
    const cap0 = storageCapacity(g.state);
    g.research('improvedSeeds');
    g.research('logistics');
    g.research('advancedStorage');
    expect(estimateYield(g.state, tile)).toBeGreaterThan(y0);
    expect(storageCapacity(g.state)).toBeGreaterThan(cap0);
    expect(techMult(g.state, 'salePriceMult')).toBeCloseTo(1.05, 5);
  });
});

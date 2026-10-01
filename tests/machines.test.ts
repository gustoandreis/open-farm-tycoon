import { describe, expect, it } from 'vitest';
import { MACHINES } from '../src/data/balance';
import { totalCapacity } from '../src/simulation/crops/fieldOps';
import { repairCost } from '../src/simulation/machinery/machines';
import { newTestGame, startRect } from './helpers';

describe('machines & maintenance', () => {
  it('buying a machine charges money and increases capacity', () => {
    const g = newTestGame();
    const cap0 = totalCapacity(g.state, 'prepare');
    const money0 = g.state.money;
    const r = g.buyMachine('tractor');
    expect(r.ok).toBe(true);
    expect(g.state.money).toBe(money0 - r.cost);
    expect(totalCapacity(g.state, 'prepare')).toBeGreaterThan(cap0);
  });

  it('machine work is cheaper per tile and consumes fuel + condition', () => {
    const manual = newTestGame('M');
    const mech = newTestGame('M');
    mech.buyMachine('tractor');
    const rect = startRect(4, 4);
    const pManual = manual.previewOperation('prepare', rect);
    const pMech = mech.previewOperation('prepare', rect);
    expect(pMech.totalCost).toBeLessThan(pManual.totalCost);
    const m = mech.state.machines[0];
    const fuel0 = m.fuel;
    mech.executeOperation('prepare', rect);
    expect(m.fuel).toBeLessThan(fuel0);
    expect(m.condition).toBeLessThan(100);
  });

  it('locked machines cannot be bought', () => {
    const g = newTestGame();
    expect(MACHINES.harvester.unlockLevel).toBeGreaterThan(1);
    expect(g.buyMachine('harvester').ok).toBe(false);
  });

  it('maintenance restores condition and costs money; broken machines do not work', () => {
    const g = newTestGame();
    g.buyMachine('tractor');
    const m = g.state.machines[0];
    m.condition = 30;
    m.broken = true;
    const capBroken = totalCapacity(g.state, 'prepare');
    const cost = repairCost(g.state, m);
    expect(cost).toBeGreaterThan(0);
    const money0 = g.state.money;
    expect(g.maintainMachine(m.id).ok).toBe(true);
    expect(m.condition).toBe(100);
    expect(m.broken).toBe(false);
    expect(g.state.money).toBe(money0 - cost);
    expect(totalCapacity(g.state, 'prepare')).toBeGreaterThan(capBroken);
  });

  it('a workshop makes maintenance cheaper', () => {
    const g = newTestGame();
    g.state.money = 1e6;
    g.state.progression.level = 3;
    g.buyMachine('tractor');
    const m = g.state.machines[0];
    m.condition = 50;
    const before = repairCost(g.state, m);
    const r = startRect(2, 2);
    expect(g.build('workshop', r.x0, r.y0).ok).toBe(true);
    expect(repairCost(g.state, m)).toBeLessThan(before);
  });

  it('machines outside a roof wear down over time', () => {
    const g = newTestGame();
    g.state.money = 1e6;
    g.buyMachine('tractor');
    g.buyMachine('planter');
    g.advanceDays(30);
    const worst = Math.min(...g.state.machines.map((m) => m.condition));
    expect(worst).toBeLessThan(100);
  });
});

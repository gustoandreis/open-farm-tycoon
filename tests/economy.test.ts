import { describe, expect, it } from 'vitest';
import { STORAGE } from '../src/data/balance';
import { storageCapacity, storageUsed } from '../src/simulation/buildings/buildings';
import { incomeStatement, summarizeMonth } from '../src/simulation/economy/ledger';
import { netWorth } from '../src/simulation/economy/valuation';
import { monthKey } from '../src/simulation/time/calendar';
import { isParcelForSale } from '../src/simulation/world/map';
import { growUntilReady, newTestGame, startRect } from './helpers';

describe('economy: land, buildings, storage, ledger', () => {
  it('only adjacent parcels can be bought', () => {
    const g = newTestGame();
    g.state.money = 120_000;
    const far = g.state.parcels.find((p) => !p.owned && !isParcelForSale(g.state, p));
    const near = g.state.parcels.find((p) => isParcelForSale(g.state, p));
    if (!far || !near) throw new Error('setup');
    expect(g.buyParcel(far.id).ok).toBe(false);
    const money0 = g.state.money;
    const r = g.buyParcel(near.id);
    expect(r.ok).toBe(true);
    expect(near.owned).toBe(true);
    expect(g.state.money).toBe(money0 - r.cost);
    expect(g.buyParcel(near.id).ok).toBe(false);
  });

  it('land purchase fails without money', () => {
    const g = newTestGame();
    g.state.money = 100;
    const near = g.state.parcels.find((p) => isParcelForSale(g.state, p));
    if (!near) throw new Error('setup');
    expect(g.buyParcel(near.id).ok).toBe(false);
    expect(g.state.money).toBe(100);
  });

  it('builds a silo that increases storage', () => {
    const g = newTestGame();
    const r = startRect(2, 2);
    const cap0 = storageCapacity(g.state);
    const res = g.build('silo', r.x0, r.y0);
    expect(res.ok).toBe(true);
    expect(storageCapacity(g.state)).toBe(cap0 + STORAGE.silo);
    // Cannot build on top of an existing building.
    expect(g.build('shed', r.x0, r.y0).ok).toBe(false);
    // Cannot build outside owned land.
    expect(g.build('shed', 0, 0).ok).toBe(false);
  });

  it('silo never exceeds capacity: overflow is sold at a discount', () => {
    const g = newTestGame('SILO');
    g.state.money = 1e6;
    const rect = startRect(6, 6);
    for (let i = 0; i < 4; i++) {
      g.executeOperation('prepare', rect);
      g.advanceDay();
    }
    for (let i = 0; i < 4; i++) {
      g.executeOperation('plant', rect, 'corn');
      g.advanceDay();
    }
    growUntilReady(g, rect);
    let overflow = 0;
    for (let i = 0; i < 4; i++) {
      overflow += g.executeOperation('harvest', rect).overflowSold;
      g.advanceDay();
      expect(storageUsed(g.state)).toBeLessThanOrEqual(storageCapacity(g.state) + 1e-6);
    }
    expect(overflow).toBeGreaterThan(0);
  });

  it('ledger records revenue and expenses per month (DRE)', () => {
    const g = newTestGame();
    const rect = startRect(3, 3);
    g.executeOperation('prepare', rect);
    g.executeOperation('plant', rect, 'soy');
    const m = summarizeMonth(g.state, monthKey(g.state.day));
    expect(m.expenses).toBeGreaterThan(0);
    const st = incomeStatement(g.state, [monthKey(g.state.day)]);
    expect(st.farmCosts).toBeCloseTo(m.expenses, 2);
    expect(st.result).toBeCloseTo(-m.expenses, 2);
    for (const e of g.state.ledger) {
      expect(typeof e.day).toBe('number');
      expect(typeof e.category).toBe('string');
      expect(typeof e.description).toBe('string');
      expect(Number.isFinite(e.amount)).toBe(true);
    }
  });

  it('operations are refused on land the player does not own', () => {
    const g = newTestGame();
    const r = g.executeOperation('prepare', { x0: 0, y0: 0, x1: 3, y1: 3 });
    expect(r.ok).toBe(false);
  });

  it('daily capacity limits manual work', () => {
    const g = newTestGame();
    const rect = startRect(6, 6);
    const r = g.executeOperation('prepare', rect);
    expect(r.ok).toBe(true);
    expect(r.count).toBeLessThan(36);
    const again = g.executeOperation('prepare', rect);
    expect(again.ok).toBe(false);
    expect(again.reason).toBe('err.noCapacity');
    g.advanceDay();
    expect(g.executeOperation('prepare', rect).ok).toBe(true);
  });

  it('net worth is finite and includes land', () => {
    const g = newTestGame();
    expect(netWorth(g.state)).toBeGreaterThan(g.state.money);
  });
});

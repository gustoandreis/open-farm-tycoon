import { describe, expect, it } from 'vitest';
import { CROP_IDS, CROPS, MARKET } from '../src/data/balance';
import { GAME_CONFIG } from '../src/config/game';
import { quoteSale } from '../src/simulation/market/sales';
import { getEventDef, triggerEvent } from '../src/simulation/events/events';
import { newTestGame } from './helpers';

describe('commodity market', () => {
  it('prices stay valid over two years and history is bounded', () => {
    const g = newTestGame('MKT');
    for (let d = 0; d < 720; d++) {
      g.advanceDay();
      for (const id of CROP_IDS) {
        const m = g.state.market.commodities[id];
        expect(Number.isFinite(m.price)).toBe(true);
        expect(m.price).toBeGreaterThanOrEqual(CROPS[id].baseMarketPrice * MARKET.minFactor - 1e-6);
        expect(m.price).toBeLessThanOrEqual(CROPS[id].baseMarketPrice * MARKET.maxFactor + 1e-6);
        expect(m.history.length).toBeLessThanOrEqual(GAME_CONFIG.marketHistoryDays);
      }
      expect(g.state.market.fuelPrice).toBeGreaterThan(0);
    }
  });

  it('has at least 30 days of history from the start', () => {
    const g = newTestGame();
    for (const id of CROP_IDS)
      expect(g.state.market.commodities[id].history.length).toBeGreaterThanOrEqual(30);
  });

  it('daily moves are not absurd (<= 6%)', () => {
    const g = newTestGame('VOL', 'hard');
    for (let d = 0; d < 200; d++) {
      const before = g.state.market.commodities.potato.price;
      g.advanceDay();
      const after = g.state.market.commodities.potato.price;
      expect(Math.abs(after - before) / before).toBeLessThanOrEqual(0.062);
    }
  });

  it('selling validates stock, removes it and credits money', () => {
    const g = newTestGame();
    expect(g.sell('corn', 10).ok).toBe(false);
    g.state.inventory.corn = 50;
    const money0 = g.state.money;
    const quote = quoteSale(g.state, 'corn', 25);
    const r = g.sell('corn', 25);
    expect(r.ok).toBe(true);
    expect(g.state.inventory.corn).toBeCloseTo(25, 5);
    expect(g.state.money).toBeCloseTo(money0 + quote.total, 2);
    expect(g.sell('corn', 26).ok).toBe(false);
    expect(g.sell('corn', -5).ok).toBe(false);
    expect(g.sell('corn', Number.NaN).ok).toBe(false);
    expect(g.state.ledger.at(-1)?.category).toBe('sales');
  });

  it('large sales lower the price (no free arbitrage)', () => {
    const g = newTestGame();
    g.state.inventory.soy = 2000;
    const before = g.state.market.commodities.soy.price;
    const q = quoteSale(g.state, 'soy', 2000);
    expect(q.unitPrice).toBeLessThan(before);
    g.sell('soy', 2000);
    expect(g.state.market.commodities.soy.price).toBeLessThan(before);
  });

  it('market events change prices', () => {
    const g = newTestGame('EVT');
    const def = getEventDef('soyRally');
    if (!def) throw new Error('missing');
    const before = g.state.market.commodities.soy.price;
    triggerEvent(g, def);
    g.advanceDays(15);
    expect(g.state.market.commodities.soy.price).toBeGreaterThan(before);
  });
});

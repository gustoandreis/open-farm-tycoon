import { describe, expect, it } from 'vitest';
import { Game } from '../src/simulation/game';
import { MemoryStorage, SaveManager } from '../src/save/saveManager';
import { growUntilReady, newTestGame, startRect } from './helpers';

describe('core gameplay loop (integration)', () => {
  it('NEW GAME → PREPARE → PLANT → ADVANCE → HARVEST → STORE → SELL → SAVE → LOAD', () => {
    const game = newTestGame();
    const rect = startRect(4, 3);
    const money0 = game.state.money;

    const prep = game.executeOperation('prepare', rect);
    expect(prep.ok).toBe(true);
    expect(prep.count).toBe(12);
    expect(game.state.money).toBeLessThan(money0);

    const plant = game.executeOperation('plant', rect, 'corn');
    expect(plant.ok).toBe(true);
    expect(plant.count).toBe(12);
    const t0 = game.state.map.tiles[rect.y0 * 64 + rect.x0];
    expect(t0.field).toBe('planted');
    expect(t0.crop?.cropId).toBe('corn');

    // Harvest must fail before maturity.
    expect(game.executeOperation('harvest', rect).ok).toBe(false);

    const days = growUntilReady(game, rect);
    expect(days).toBeLessThan(200);

    const harvest = game.executeOperation('harvest', rect);
    expect(harvest.ok).toBe(true);
    expect(harvest.tonnes).toBeGreaterThan(0);
    const stored = game.state.inventory.corn;
    expect(stored).toBeGreaterThan(0);
    expect(game.state.map.tiles[rect.y0 * 64 + rect.x0].crop).toBeNull();

    const moneyBeforeSale = game.state.money;
    const sale = game.sell('corn', stored);
    expect(sale.ok).toBe(true);
    expect(game.state.inventory.corn).toBe(0);
    expect(game.state.money).toBeGreaterThan(moneyBeforeSale);
    // Selling again must fail (no duplicated stock).
    expect(game.sell('corn', 1).ok).toBe(false);

    const saves = new SaveManager(new MemoryStorage());
    expect(saves.save(game.snapshot())).toBe(true);
    const loaded = saves.load();
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') return;
    const restored = new Game(loaded.state);
    expect(restored.state.money).toBe(game.state.money);
    expect(restored.state.day).toBe(game.state.day);
    expect(restored.state.stats.totalProduction).toBe(game.state.stats.totalProduction);
    // Determinism: both games evolve identically after load.
    game.advanceDays(20);
    restored.advanceDays(20);
    expect(restored.state.money).toBe(game.state.money);
    expect(restored.state.market.commodities.soy.price).toBe(game.state.market.commodities.soy.price);
    expect(restored.state.weather.today).toBe(game.state.weather.today);
  });

  it('a full first season on NORMAL is profitable with reasonable play', () => {
    const game = newTestGame('BALANCE');
    const rect = startRect(6, 6);
    const money0 = game.state.money;
    // Capacity is limited per day, so work over several days.
    for (let i = 0; i < 4; i++) {
      game.executeOperation('prepare', rect);
      game.advanceDay();
    }
    for (let i = 0; i < 4; i++) {
      game.executeOperation('plant', rect, 'soy');
      game.advanceDay();
    }
    growUntilReady(game, rect);
    for (let i = 0; i < 5; i++) {
      game.executeOperation('harvest', rect);
      game.advanceDay();
    }
    if (game.state.inventory.soy > 0) game.sell('soy', game.state.inventory.soy);
    expect(game.state.money).toBeGreaterThan(money0);
  });
});

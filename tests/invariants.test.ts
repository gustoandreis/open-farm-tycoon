import { describe, expect, it } from 'vitest';
import { CROP_IDS, MACHINE_TYPES } from '../src/data/balance';
import { storageCapacity, storageUsed } from '../src/simulation/buildings/buildings';
import { CROPS } from '../src/data/balance';
import { isValidDate, toDate } from '../src/simulation/time/calendar';
import { Rng } from '../src/utils/rng';
import { newTestGame } from './helpers';
import type { Game } from '../src/simulation/game';

function checkInvariants(g: Game): void {
  const s = g.state;
  expect(Number.isFinite(s.money)).toBe(true);
  for (const id of CROP_IDS) {
    expect(s.inventory[id]).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(s.market.commodities[id].price)).toBe(true);
    expect(s.market.commodities[id].price).toBeGreaterThan(0);
  }
  expect(storageUsed(s)).toBeLessThanOrEqual(storageCapacity(s) + 1e-6);
  for (const l of s.loans) expect(l.remainingBalance).toBeGreaterThanOrEqual(0);
  expect(isValidDate(toDate(s.day))).toBe(true);
  const badTiles = s.map.tiles.filter(
    (t) =>
      t.moisture < 0 ||
      t.moisture > 100 ||
      (t.crop !== null && (t.crop.progress > CROPS[t.crop.cropId].growthDays + 1e-9 || t.crop.health < 0)),
  );
  expect(badTiles.length).toBe(0);
  for (const m of s.machines) {
    expect(m.condition).toBeGreaterThanOrEqual(0);
    expect(m.condition).toBeLessThanOrEqual(100);
  }
}

describe('invariants under a random player (2 years)', () => {
  for (const diff of ['easy', 'normal', 'hard'] as const) {
    it(`holds on ${diff}`, () => {
      const g = newTestGame(`BOT-${diff}`, diff);
      const r = new Rng(99);
      const W = g.state.map.width;
      for (let d = 0; d < 720 && !g.isGameOver; d++) {
        const x = r.int(16, 40);
        const y = r.int(16, 40);
        const rect = { x0: x, y0: y, x1: x + r.int(0, 6), y1: y + r.int(0, 6) };
        switch (r.int(0, 12)) {
          case 0:
            g.executeOperation('prepare', rect);
            break;
          case 1:
            g.executeOperation('plant', rect, r.pick(CROP_IDS));
            break;
          case 2:
            g.executeOperation('irrigate', rect);
            break;
          case 3:
            g.executeOperation('harvest', rect);
            break;
          case 4:
            g.sell(r.pick(CROP_IDS), r.range(0, 50));
            break;
          case 5:
            g.buyMachine(r.pick(MACHINE_TYPES));
            break;
          case 6:
            g.build(r.pick(['silo', 'shed', 'workshop', 'office', 'irrigation'] as const), x, y);
            break;
          case 7:
            g.takeLoan(r.int(1, 20) * 1000, r.pick([12, 24, 36]));
            break;
          case 8:
            if (g.state.loans[0]) g.prepayLoan(g.state.loans[0].id, r.range(0, 5000));
            break;
          case 9: {
            const p = g.state.parcels[r.int(0, g.state.parcels.length - 1)];
            g.buyParcel(p.id);
            break;
          }
          case 10:
            if (g.state.candidates[0]) g.hireWorker(g.state.candidates[0].id);
            break;
          case 11:
            if (g.state.machines[0]) g.maintainMachine(g.state.machines[0].id);
            break;
          default:
            break;
        }
        g.advanceDay();
        checkInvariants(g);
      }
      void W;
    });
  }

  it('8x-style bursts (many days at once) keep payments and events consistent', () => {
    const a = newTestGame('BURST');
    const b = newTestGame('BURST');
    a.takeLoan(10000, 12);
    b.takeLoan(10000, 12);
    for (let i = 0; i < 360; i++) a.advanceDay();
    b.advanceDays(360);
    expect(a.state.money).toBe(b.state.money);
    expect(a.state.loans.length).toBe(0);
    checkInvariants(a);
  });
});

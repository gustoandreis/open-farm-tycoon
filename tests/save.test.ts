import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../src/config/game';
import { MemoryStorage, SaveManager, validateState } from '../src/save/saveManager';
import { Game } from '../src/simulation/game';
import { newTestGame, startRect } from './helpers';

describe('save system', () => {
  it('round-trips the full relevant state', () => {
    const g = newTestGame('SAVE');
    g.state.money = 1e6;
    g.state.progression.level = 3;
    g.executeOperation('prepare', startRect(3, 3));
    g.executeOperation('plant', startRect(3, 3), 'corn');
    g.buyMachine('tractor');
    g.build('silo', startRect().x0 + 4, startRect().y0);
    g.takeLoan(10000, 12);
    g.hireWorker(g.state.candidates[0].id);
    g.research('improvedSeeds');
    g.advanceDays(10);
    const sm = new SaveManager(new MemoryStorage());
    expect(sm.hasSave()).toBe(false);
    expect(sm.save(g.snapshot())).toBe(true);
    expect(sm.hasSave()).toBe(true);
    const r = sm.load();
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.state).toEqual(g.snapshot());
    expect(r.state.saveVersion).toBe(GAME_CONFIG.saveVersion);
    const g2 = new Game(r.state);
    expect(g2.state.machines).toHaveLength(1);
    expect(g2.state.buildings.some((b) => b.type === 'silo')).toBe(true);
    expect(g2.state.loans).toHaveLength(1);
    expect(g2.state.workers).toHaveLength(1);
    expect(g2.state.technologies).toContain('improvedSeeds');
  });

  it('reports empty when nothing is saved', () => {
    expect(new SaveManager(new MemoryStorage()).load().status).toBe('empty');
  });

  it('corrupted JSON does not throw', () => {
    const st = new MemoryStorage();
    st.setItem(GAME_CONFIG.saveKey, '{not json');
    const r = new SaveManager(st).load();
    expect(r.status).toBe('corrupt');
  });

  it('rejects wrong versions and broken structures', () => {
    const st = new MemoryStorage();
    const sm = new SaveManager(st);
    const g = newTestGame();
    const snap = g.snapshot();
    st.setItem(GAME_CONFIG.saveKey, JSON.stringify({ saveVersion: 999, state: snap }));
    expect(sm.load().status).toBe('corrupt');
    const broken = { ...snap, money: 'lots' };
    st.setItem(GAME_CONFIG.saveKey, JSON.stringify({ saveVersion: GAME_CONFIG.saveVersion, state: broken }));
    expect(sm.load().status).toBe('corrupt');
    const noTiles = { ...snap, map: { ...snap.map, tiles: [] } };
    expect(validateState(noTiles)).not.toBeNull();
    expect(validateState(null)).not.toBeNull();
    expect(validateState(snap)).toBeNull();
    expect(sm.peek()).toBeNull();
  });

  it('works without storage (no crash)', () => {
    const sm = new SaveManager(null);
    expect(sm.available).toBe(false);
    expect(sm.save(newTestGame().snapshot())).toBe(false);
    expect(sm.load().status).toBe('empty');
  });

  it('clear() deletes the save', () => {
    const sm = new SaveManager(new MemoryStorage());
    sm.save(newTestGame().snapshot());
    sm.clear();
    expect(sm.hasSave()).toBe(false);
  });

  it('storage write errors are handled', () => {
    const sm = new SaveManager({
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
      removeItem: () => undefined,
    });
    expect(sm.save(newTestGame().snapshot())).toBe(false);
  });
});

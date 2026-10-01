import { describe, expect, it } from 'vitest';
import { Rng, hashString } from '../src/utils/rng';

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    const a = Rng.fromString('abc');
    const b = Rng.fromString('abc');
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('differs for different seeds', () => {
    const a = Rng.fromString('abc');
    const b = Rng.fromString('abd');
    const sa = Array.from({ length: 5 }, () => a.next());
    const sb = Array.from({ length: 5 }, () => b.next());
    expect(sa).not.toEqual(sb);
  });

  it('state can be saved and restored', () => {
    const a = new Rng(42);
    a.next();
    const saved = a.state;
    const x = a.next();
    const b = new Rng(0);
    b.state = saved;
    expect(b.next()).toBe(x);
  });

  it('stays within ranges', () => {
    const r = new Rng(7);
    for (let i = 0; i < 2000; i++) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.int(3, 9);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(9);
      expect(Number.isFinite(r.normal())).toBe(true);
    }
  });

  it('weighted pick respects zero weights', () => {
    const r = new Rng(1);
    for (let i = 0; i < 200; i++)
      expect(
        r.weighted([
          { item: 'a', weight: 0 },
          { item: 'b', weight: 1 },
        ]),
      ).toBe('b');
  });

  it('hashString is stable', () => {
    expect(hashString('OPEN-FARM')).toBe(hashString('OPEN-FARM'));
  });
});

import { GAME_CONFIG } from '../config/game';
import { CROP_IDS } from '../data/balance';
import type { GameState } from '../simulation/types';

/** Minimal Storage interface (localStorage-compatible) so tests can inject a fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveEnvelope {
  saveVersion: number;
  game: string;
  savedAt: number;
  state: GameState;
}

export type LoadResult =
  | { status: 'ok'; state: GameState; savedAt: number }
  | { status: 'empty' }
  | { status: 'corrupt'; error: string };

function defaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const k = '__oft_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    return null;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Structural validation of a loaded state. Returns an error string or null when valid. */
export function validateState(raw: unknown): string | null {
  if (!isObj(raw)) return 'state is not an object';
  const s = raw as Partial<GameState>;
  if (s.saveVersion !== GAME_CONFIG.saveVersion) return `unsupported saveVersion ${String(s.saveVersion)}`;
  if (!isNum(s.money)) return 'money invalid';
  if (!isNum(s.day) || s.day < 0) return 'day invalid';
  if (!isNum(s.rngState)) return 'rng invalid';
  if (typeof s.farmName !== 'string') return 'farmName invalid';
  if (!['easy', 'normal', 'hard'].includes(String(s.difficulty))) return 'difficulty invalid';
  if (!isObj(s.map) || !Array.isArray(s.map.tiles)) return 'map invalid';
  if (s.map.tiles.length !== s.map.width * s.map.height) return 'map size mismatch';
  for (const t of s.map.tiles) {
    if (!isObj(t) || !isNum(t.moisture) || !isNum(t.fertility) || typeof t.terrain !== 'string')
      return 'tile invalid';
  }
  if (!Array.isArray(s.parcels) || s.parcels.length === 0) return 'parcels invalid';
  if (!s.parcels.some((p) => p.owned)) return 'no owned parcel';
  if (!Array.isArray(s.buildings) || !Array.isArray(s.machines) || !Array.isArray(s.workers))
    return 'entities invalid';
  if (!Array.isArray(s.loans) || !Array.isArray(s.ledger)) return 'finance invalid';
  if (!isObj(s.inventory)) return 'inventory invalid';
  for (const id of CROP_IDS) {
    const v = (s.inventory as Record<string, unknown>)[id];
    if (!isNum(v) || v < 0) return `inventory ${id} invalid`;
  }
  if (!isObj(s.market) || !isObj(s.market.commodities)) return 'market invalid';
  for (const id of CROP_IDS) {
    const m = (s.market.commodities as Record<string, unknown>)[id];
    if (!isObj(m) || !isNum(m.price) || m.price <= 0 || !Array.isArray(m.history))
      return `market ${id} invalid`;
  }
  if (!isObj(s.weather) || !Array.isArray(s.weather.forecast)) return 'weather invalid';
  if (!isObj(s.progression) || !isNum(s.progression.level)) return 'progression invalid';
  if (!isObj(s.stats) || !isObj(s.finance) || !isObj(s.tutorial) || !isObj(s.year)) return 'meta invalid';
  return null;
}

export class SaveManager {
  private storage: StorageLike | null;

  constructor(storage?: StorageLike | null) {
    this.storage = storage === undefined ? defaultStorage() : storage;
  }

  get available(): boolean {
    return this.storage !== null;
  }

  hasSave(): boolean {
    try {
      return !!this.storage?.getItem(GAME_CONFIG.saveKey);
    } catch {
      return false;
    }
  }

  save(state: GameState): boolean {
    if (!this.storage) return false;
    const envelope: SaveEnvelope = {
      saveVersion: GAME_CONFIG.saveVersion,
      game: GAME_CONFIG.shortName,
      savedAt: Date.now(),
      state,
    };
    try {
      this.storage.setItem(GAME_CONFIG.saveKey, JSON.stringify(envelope));
      return true;
    } catch (err) {
      console.error('[save] failed to write save', err);
      return false;
    }
  }

  load(): LoadResult {
    if (!this.storage) return { status: 'empty' };
    let raw: string | null;
    try {
      raw = this.storage.getItem(GAME_CONFIG.saveKey);
    } catch (err) {
      return { status: 'corrupt', error: String(err) };
    }
    if (!raw) return { status: 'empty' };
    try {
      const env = JSON.parse(raw) as unknown;
      if (!isObj(env)) return { status: 'corrupt', error: 'envelope invalid' };
      if (env.saveVersion !== GAME_CONFIG.saveVersion)
        return { status: 'corrupt', error: 'unsupported save version' };
      const err = validateState(env.state);
      if (err) return { status: 'corrupt', error: err };
      return { status: 'ok', state: env.state as GameState, savedAt: isNum(env.savedAt) ? env.savedAt : 0 };
    } catch (err) {
      return { status: 'corrupt', error: `parse error: ${String(err)}` };
    }
  }

  /** Summary for the main menu without fully trusting the state. */
  peek(): { farmName: string; day: number; money: number; savedAt: number } | null {
    const r = this.load();
    if (r.status !== 'ok') return null;
    return { farmName: r.state.farmName, day: r.state.day, money: r.state.money, savedAt: r.savedAt };
  }

  clear(): void {
    try {
      this.storage?.removeItem(GAME_CONFIG.saveKey);
    } catch (err) {
      console.error('[save] failed to clear', err);
    }
  }
}

/** In-memory storage (tests, or when localStorage is blocked). */
export class MemoryStorage implements StorageLike {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

/**
 * Central product configuration. Change the game name here and it propagates
 * to the menu, HUD, document title and save metadata.
 */
export const GAME_CONFIG = {
  name: 'Open Farm Tycoon',
  shortName: 'OFT',
  version: '0.1.0',
  /** Bump when the save format changes in an incompatible way. */
  saveVersion: 1,
  saveKey: 'open-farm-tycoon.save',
  settingsKey: 'open-farm-tycoon.settings',
  /** Map size in tiles. */
  mapWidth: 64,
  mapHeight: 64,
  /** Land parcels are square blocks of tiles. */
  parcelSize: 8,
  tileSize: 32,
  /** Real milliseconds per in-game day at 1x speed. */
  msPerDayAt1x: 1200,
  /** Autosave interval (real time). */
  autosaveMs: 60_000,
  /** Available simulation speeds. 0 = paused. */
  speeds: [0, 1, 2, 4, 8] as const,
  /** Market history kept per commodity (days). */
  marketHistoryDays: 60,
  /** Ledger entries kept in the save (older ones are summarised in monthly totals). */
  ledgerLimit: 400,
} as const;

export type GameSpeed = (typeof GAME_CONFIG.speeds)[number];

export const IS_DEV: boolean = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;

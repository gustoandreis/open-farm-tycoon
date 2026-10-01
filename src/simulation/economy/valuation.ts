import { BUILDINGS, CROP_IDS } from '../../data/balance';
import { round } from '../../utils/math';
import { resaleValue } from '../machinery/machines';
import type { GameState } from '../types';

export function landValue(state: GameState): number {
  return state.parcels.filter((p) => p.owned).reduce((s, p) => s + p.purchasePrice, 0);
}

export function buildingsValue(state: GameState): number {
  return state.buildings.reduce((s, b) => s + BUILDINGS[b.type].price * 0.6, 0);
}

export function machinesValue(state: GameState): number {
  return state.machines.reduce((s, m) => s + resaleValue(m), 0);
}

export function inventoryValue(state: GameState): number {
  return CROP_IDS.reduce((s, id) => s + state.inventory[id] * state.market.commodities[id].price, 0);
}

export function totalDebt(state: GameState): number {
  return round(
    state.loans.reduce((s, l) => s + l.remainingBalance, 0),
    2,
  );
}

/** Estimated net worth: cash + assets - debt. */
export function netWorth(state: GameState): number {
  return round(
    state.money +
      landValue(state) +
      buildingsValue(state) +
      machinesValue(state) +
      inventoryValue(state) -
      totalDebt(state),
    2,
  );
}

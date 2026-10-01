import { DIFFICULTY, PROGRESSION } from '../../data/balance';
import type { SimContext } from '../context';
import { addTransaction } from '../economy/ledger';
import { notify } from '../notifications';
import { addXp, checkProgress } from '../progression/progression';
import type { GameState, Parcel } from '../types';
import { isParcelForSale, parcelPrice } from './map';

export function landPrice(state: GameState, parcel: Parcel): number {
  return parcelPrice(state, parcel, DIFFICULTY[state.difficulty].costMult);
}

export type LandCheck = { ok: true; cost: number } | { ok: false; reason: string; cost: number };

export function canBuyParcel(state: GameState, parcelId: number): LandCheck {
  const p = state.parcels[parcelId];
  if (!p) return { ok: false, reason: 'err.unknown', cost: 0 };
  const cost = landPrice(state, p);
  if (p.owned) return { ok: false, reason: 'err.alreadyOwned', cost };
  if (!isParcelForSale(state, p)) return { ok: false, reason: 'err.notAdjacent', cost };
  if (state.money < cost) return { ok: false, reason: 'err.noMoney', cost };
  return { ok: true, cost };
}

export function buyParcel(ctx: SimContext, parcelId: number): LandCheck {
  const s = ctx.state;
  const check = canBuyParcel(s, parcelId);
  if (!check.ok) return check;
  const p = s.parcels[parcelId];
  addTransaction(ctx, 'land', { key: 'ledger.land', params: { id: parcelId } }, -check.cost);
  p.owned = true;
  p.purchasePrice = check.cost;
  s.stats.landBought++;
  ctx.emit('tilesChanged', 'all');
  ctx.emit('parcelsChanged', undefined);
  notify(ctx, 'success', 'notif.landBought', { tiles: p.w * p.h });
  ctx.emit('feedback', { key: 'fb.landBought', x: p.x + p.w / 2, y: p.y + p.h / 2, tone: 'good' });
  ctx.emit('analytics', { name: 'land_purchased', props: { parcel: parcelId, cost: check.cost } });
  addXp(ctx, PROGRESSION.xpLandParcel);
  checkProgress(ctx);
  ctx.emit('requestSave', 'land');
  return check;
}

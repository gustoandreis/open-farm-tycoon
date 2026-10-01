import { GAME_CONFIG } from '../../config/game';
import { CROP_IDS, CROPS, DIFFICULTY, MARKET } from '../../data/balance';
import { average, clamp, round } from '../../utils/math';
import type { Rng } from '../../utils/rng';
import type { SimContext } from '../context';
import { eventFuelMult, eventPriceMult } from '../events/events';
import { toDate } from '../time/calendar';
import type { CommodityMarket, CropId, GameState } from '../types';

export function seasonalFactor(crop: CropId, month: number): number {
  const peak = CROPS[crop].pricePeakMonth;
  return 1 + MARKET.seasonalAmplitude * Math.cos((2 * Math.PI * (month - peak)) / 12);
}

/** Price the market drifts toward (before random variation). */
export function targetPrice(state: GameState, crop: CropId): number {
  const m = state.market.commodities[crop];
  const month = toDate(state.day).month;
  return (
    CROPS[crop].baseMarketPrice * seasonalFactor(crop, month) * m.supplyFactor * eventPriceMult(state, crop)
  );
}

export function initMarket(state: GameState, rng: Rng): void {
  const month = toDate(state.day).month;
  const commodities = {} as Record<CropId, CommodityMarket>;
  for (const id of CROP_IDS) {
    const base = CROPS[id].baseMarketPrice * seasonalFactor(id, month);
    const history: number[] = [];
    // Pre-fill 30 days of plausible history so charts are not empty.
    let p = base * (1 + rng.normal() * 0.03);
    for (let i = 0; i < 30; i++) {
      p = p + (base - p) * MARKET.reversion + p * CROPS[id].volatility * rng.normal();
      p = clamp(p, base * 0.7, base * 1.3);
      history.push(round(p, 2));
    }
    commodities[id] = { price: history[history.length - 1], history, supplyFactor: 1 };
  }
  state.market = { commodities, fuelPrice: MARKET.fuelBase, fuelHistory: [MARKET.fuelBase] };
}

/** Daily market tick: mean-reverting random walk around the target price. */
export function updateMarket(ctx: SimContext): void {
  const s = ctx.state;
  const volMult = DIFFICULTY[s.difficulty].volatilityMult;
  for (const id of CROP_IDS) {
    const m = s.market.commodities[id];
    m.supplyFactor = clamp(m.supplyFactor + (1 - m.supplyFactor) * MARKET.supplyRecovery, 0.5, 1.2);
    const target = targetPrice(s, id);
    const base = CROPS[id].baseMarketPrice;
    let p =
      m.price +
      (target - m.price) * MARKET.reversion +
      m.price * CROPS[id].volatility * volMult * ctx.rng.normal();
    // Avoid absurd daily moves: cap at 6% per day.
    p = clamp(p, m.price * 0.94, m.price * 1.06);
    p = clamp(p, base * MARKET.minFactor, base * MARKET.maxFactor);
    m.price = round(p, 2);
    m.history.push(m.price);
    if (m.history.length > GAME_CONFIG.marketHistoryDays)
      m.history.splice(0, m.history.length - GAME_CONFIG.marketHistoryDays);
  }
  const fuelTarget = MARKET.fuelBase * eventFuelMult(s);
  let f =
    s.market.fuelPrice +
    (fuelTarget - s.market.fuelPrice) * 0.1 +
    s.market.fuelPrice * MARKET.fuelVolatility * ctx.rng.normal();
  f = clamp(f, MARKET.fuelBase * 0.6, MARKET.fuelBase * 2.5);
  s.market.fuelPrice = round(f, 3);
  s.market.fuelHistory.push(s.market.fuelPrice);
  if (s.market.fuelHistory.length > GAME_CONFIG.marketHistoryDays) s.market.fuelHistory.shift();
}

export function priceChange(state: GameState, crop: CropId): number {
  const h = state.market.commodities[crop].history;
  if (h.length < 2) return 0;
  const prev = h[h.length - 2];
  return prev > 0 ? (h[h.length - 1] - prev) / prev : 0;
}

export function averagePrice(state: GameState, crop: CropId, days = 30): number {
  const h = state.market.commodities[crop].history;
  return round(average(h.slice(-days)), 2);
}

/** Instant discount applied to large sales (market depth). */
export function saleImpact(crop: CropId, tonnes: number): number {
  return clamp(tonnes / CROPS[crop].marketDepth, 0, MARKET.maxSaleImpact);
}

/** After a sale, local supply increases and the price drops a bit. */
export function applySalePressure(state: GameState, crop: CropId, tonnes: number): void {
  const m = state.market.commodities[crop];
  const drop = clamp((tonnes / CROPS[crop].marketDepth) * 0.5, 0, 0.1);
  m.supplyFactor = clamp(m.supplyFactor * (1 - drop), 0.5, 1.2);
  m.price = round(Math.max(CROPS[crop].baseMarketPrice * MARKET.minFactor, m.price * (1 - drop)), 2);
}

import { PROGRESSION } from '../../data/balance';
import { round } from '../../utils/math';
import type { SimContext } from '../context';
import { addTransaction } from '../economy/ledger';
import { addXp, checkProgress } from '../progression/progression';
import { techMult } from '../technology/technology';
import type { CropId, GameState } from '../types';
import { applySalePressure, saleImpact } from './market';

export interface SaleQuote {
  crop: CropId;
  tonnes: number;
  unitPrice: number;
  total: number;
  impact: number;
}

export function quoteSale(state: GameState, crop: CropId, tonnes: number): SaleQuote {
  const q = round(Math.max(0, Math.min(tonnes, state.inventory[crop])), 3);
  const impact = saleImpact(crop, q);
  const unitPrice = round(
    state.market.commodities[crop].price * techMult(state, 'salePriceMult') * (1 - impact),
    2,
  );
  return { crop, tonnes: q, unitPrice, total: round(q * unitPrice, 2), impact };
}

export type SaleResult = { ok: true; quote: SaleQuote } | { ok: false; reason: string };

/** Sells stored commodity. Validates stock, removes it, credits cash and records revenue. */
export function sellCommodity(ctx: SimContext, crop: CropId, tonnes: number): SaleResult {
  const s = ctx.state;
  if (!Number.isFinite(tonnes) || tonnes <= 0) return { ok: false, reason: 'err.invalidAmount' };
  if (s.inventory[crop] <= 0) return { ok: false, reason: 'err.noStock' };
  if (tonnes > s.inventory[crop] + 1e-6) return { ok: false, reason: 'err.notEnoughStock' };
  const quote = quoteSale(s, crop, tonnes);
  if (quote.tonnes <= 0 || quote.total <= 0) return { ok: false, reason: 'err.invalidAmount' };
  s.inventory[crop] = round(Math.max(0, s.inventory[crop] - quote.tonnes), 3);
  if (s.inventory[crop] < 0.001) s.inventory[crop] = 0;
  addTransaction(
    ctx,
    'sales',
    { key: 'ledger.sale', params: { crop: `@crop.${crop}`, tonnes: round(quote.tonnes, 1) } },
    quote.total,
  );
  s.stats.salesCount++;
  s.stats.salesRevenue = round(s.stats.salesRevenue + quote.total, 2);
  s.stats.biggestSale = Math.max(s.stats.biggestSale, quote.total);
  s.year.revenueByCrop[crop] = round((s.year.revenueByCrop[crop] ?? 0) + quote.total, 2);
  applySalePressure(s, crop, quote.tonnes);
  addXp(ctx, Math.floor((quote.total / 1000) * PROGRESSION.xpPer1000Sold));
  ctx.emit('analytics', {
    name: 'commodity_sold',
    props: { crop, tonnes: quote.tonnes, total: quote.total },
  });
  checkProgress(ctx);
  ctx.emit('requestSave', 'sale');
  return { ok: true, quote };
}

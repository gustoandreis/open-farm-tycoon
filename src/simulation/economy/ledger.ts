import { GAME_CONFIG } from '../../config/game';
import { finite, round } from '../../utils/math';
import type { I18nParams, SimContext } from '../context';
import { monthKey } from '../time/calendar';
import type { GameState, LedgerCategory } from '../types';

/** Categories that are financing flows, not revenue/expense. */
const NON_PNL: LedgerCategory[] = ['loanIn', 'loanOut'];

export interface LedgerParams {
  key: string;
  params?: I18nParams;
}

/**
 * Records a transaction and applies it to cash. Positive = income,
 * negative = expense. Every money change in the game goes through here.
 */
export function addTransaction(
  ctx: SimContext,
  category: LedgerCategory,
  description: LedgerParams,
  amount: number,
): void {
  const s = ctx.state;
  const value = round(finite(amount), 2);
  if (value === 0) return;
  s.money = round(finite(s.money + value), 2);
  s.ledger.push({
    day: s.day,
    category,
    description: description.params
      ? `${description.key}|${JSON.stringify(description.params)}`
      : description.key,
    amount: value,
  });
  if (s.ledger.length > GAME_CONFIG.ledgerLimit)
    s.ledger.splice(0, s.ledger.length - GAME_CONFIG.ledgerLimit);
  const key = monthKey(s.day);
  const month = (s.monthly[key] ??= {});
  month[category] = round((month[category] ?? 0) + value, 2);
  if (!NON_PNL.includes(category)) {
    if (value > 0) s.stats.totalRevenue = round(s.stats.totalRevenue + value, 2);
    else s.stats.totalExpenses = round(s.stats.totalExpenses - value, 2);
  }
  ctx.emit('money', s.money);
}

export function parseLedgerDescription(desc: string): LedgerParams {
  const bar = desc.indexOf('|');
  if (bar < 0) return { key: desc };
  try {
    const params = JSON.parse(desc.slice(bar + 1)) as I18nParams;
    return { key: desc.slice(0, bar), params };
  } catch {
    return { key: desc.slice(0, bar) };
  }
}

export interface MonthSummary {
  revenue: number;
  expenses: number;
  result: number;
  byCategory: Partial<Record<LedgerCategory, number>>;
}

export function summarizeMonth(state: GameState, key: string): MonthSummary {
  const byCategory = state.monthly[key] ?? {};
  let revenue = 0;
  let expenses = 0;
  for (const [cat, v] of Object.entries(byCategory) as [LedgerCategory, number][]) {
    if (NON_PNL.includes(cat)) continue;
    if (v > 0) revenue += v;
    else expenses -= v;
  }
  return {
    revenue: round(revenue, 2),
    expenses: round(expenses, 2),
    result: round(revenue - expenses, 2),
    byCategory,
  };
}

/** Simplified income statement (DRE) for a set of month keys. */
export interface IncomeStatement {
  revenue: number;
  farmCosts: number;
  salaries: number;
  fuel: number;
  maintenance: number;
  interest: number;
  investments: number;
  other: number;
  result: number;
}

export function incomeStatement(state: GameState, keys: string[]): IncomeStatement {
  const get = (cat: LedgerCategory) => keys.reduce((s, k) => s + (state.monthly[k]?.[cat] ?? 0), 0);
  const revenue = get('sales') + Math.max(0, get('event'));
  const farmCosts = -(get('seeds') + get('fieldwork') + get('irrigation'));
  const salaries = -get('salaries');
  const fuel = -get('fuel');
  const maintenance = -get('maintenance');
  const interest = -get('interest');
  const investments = -(get('machines') + get('buildings') + get('land') + get('technology'));
  const other = -(get('other') + Math.min(0, get('event')));
  const result = revenue - farmCosts - salaries - fuel - maintenance - interest - investments - other;
  return {
    revenue: round(revenue, 2),
    farmCosts: round(farmCosts, 2),
    salaries: round(salaries, 2),
    fuel: round(fuel, 2),
    maintenance: round(maintenance, 2),
    interest: round(interest, 2),
    investments: round(investments, 2),
    other: round(other, 2),
    result: round(result, 2),
  };
}

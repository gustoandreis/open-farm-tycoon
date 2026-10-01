import { TECHNOLOGIES, type TechDef } from '../../data/balance';
import type { SimContext } from '../context';
import { addTransaction } from '../economy/ledger';
import { notify } from '../notifications';
import type { GameState } from '../types';

type TechEffectKey = keyof TechDef['effects'];

/** Product of a multiplicative effect across all researched technologies. */
export function techMult(state: GameState, key: TechEffectKey): number {
  let m = 1;
  for (const id of state.technologies) {
    const def = TECHNOLOGIES.find((t) => t.id === id);
    const v = def?.effects[key];
    if (typeof v === 'number') m *= v;
  }
  return m;
}

export function getTech(id: string): TechDef | undefined {
  return TECHNOLOGIES.find((t) => t.id === id);
}

export type ResearchCheck = { ok: true; cost: number } | { ok: false; reason: string; cost: number };

export function canResearch(state: GameState, id: string): ResearchCheck {
  const def = getTech(id);
  if (!def) return { ok: false, reason: 'err.unknown', cost: 0 };
  if (state.technologies.includes(id)) return { ok: false, reason: 'err.alreadyResearched', cost: def.cost };
  if (state.progression.level < def.level) return { ok: false, reason: 'err.levelRequired', cost: def.cost };
  if (def.requires.some((r) => !state.technologies.includes(r)))
    return { ok: false, reason: 'err.techRequired', cost: def.cost };
  if (state.money < def.cost) return { ok: false, reason: 'err.noMoney', cost: def.cost };
  return { ok: true, cost: def.cost };
}

export function research(ctx: SimContext, id: string): ResearchCheck {
  const check = canResearch(ctx.state, id);
  if (!check.ok) return check;
  addTransaction(ctx, 'technology', { key: 'ledger.research', params: { tech: `@tech.${id}.name` } }, -check.cost);
  ctx.state.technologies.push(id);
  notify(ctx, 'success', 'notif.researched', { tech: `@tech.${id}.name` });
  ctx.emit('analytics', { name: 'technology_unlocked', props: { id } });
  ctx.emit('requestSave', 'research');
  return check;
}

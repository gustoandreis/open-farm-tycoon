import { OBJECTIVES, PROGRESSION, type AchievementId } from '../../data/balance';
import type { SimContext } from '../context';
import { addTransaction } from '../economy/ledger';
import { netWorth, totalDebt } from '../economy/valuation';
import { notify } from '../notifications';
import type { GameState } from '../types';

export function levelForXp(xp: number): number {
  let level = 1;
  for (let i = 0; i < PROGRESSION.levels.length; i++) if (xp >= PROGRESSION.levels[i]) level = i + 1;
  return level;
}

export function xpForNextLevel(level: number): number | null {
  return PROGRESSION.levels[level] ?? null;
}

export function addXp(ctx: SimContext, amount: number): void {
  if (amount <= 0) return;
  const p = ctx.state.progression;
  p.xp = Math.round(p.xp + amount);
  const newLevel = levelForXp(p.xp);
  if (newLevel > p.level) {
    p.level = newLevel;
    notify(ctx, 'success', 'notif.levelUp', { level: newLevel });
    ctx.emit('levelUp', newLevel);
  }
}

const OBJECTIVE_CHECKS: Record<string, (s: GameState) => boolean> = {
  plantFirst: (s) => s.stats.tilesPlanted > 0,
  harvestFirst: (s) => s.stats.tilesHarvested > 0,
  sell10k: (s) => s.stats.salesRevenue >= 10_000,
  buildSilo: (s) => s.buildings.some((b) => b.type === 'silo'),
  buyMachine: (s) => s.stats.machinesBought > 0,
  buyLand: (s) => s.stats.landBought > 0,
  hireWorker: (s) => s.workers.length > 0,
  research: (s) => s.technologies.length > 0,
  netWorth250k: (s) => netWorth(s) >= 250_000,
};

const ACHIEVEMENT_CHECKS: Record<AchievementId, (s: GameState) => boolean> = {
  firstHarvest: (s) => s.stats.tilesHarvested > 0,
  first10k: (s) => s.stats.salesRevenue >= 10_000,
  tons100: (s) => s.stats.totalProduction >= 100,
  tons1000: (s) => s.stats.totalProduction >= 1000,
  debtFree: (s) => s.stats.loansTaken > 0 && s.loans.length === 0 && totalDebt(s) === 0,
  bigFarm: (s) => s.parcels.filter((p) => p.owned).length >= 6,
  mechanized: (s) => new Set(s.machines.map((m) => m.type)).size >= 4,
  researcher: (s) => s.technologies.length >= 3,
};

/** The current (first incomplete) objective id, or null when all are done. */
export function currentObjective(state: GameState): string | null {
  return OBJECTIVES.find((o) => !state.objectives.includes(o.id))?.id ?? null;
}

/** Checks objectives (in order) and achievements; grants rewards. */
export function checkProgress(ctx: SimContext): void {
  const s = ctx.state;
  for (const o of OBJECTIVES) {
    if (s.objectives.includes(o.id)) continue;
    const check = OBJECTIVE_CHECKS[o.id];
    if (check && check(s)) {
      s.objectives.push(o.id);
      notify(ctx, 'success', 'notif.objectiveDone', { objective: `@objective.${o.id}` });
      if (o.reward > 0) addTransaction(ctx, 'event', { key: 'ledger.objectiveReward' }, o.reward);
      ctx.emit('objective', o.id);
      addXp(ctx, o.xp);
    }
  }
  for (const id of Object.keys(ACHIEVEMENT_CHECKS) as AchievementId[]) {
    if (s.achievements.includes(id)) continue;
    if (ACHIEVEMENT_CHECKS[id](s)) {
      s.achievements.push(id);
      notify(ctx, 'success', 'notif.achievement', { name: `@achievement.${id}.name` });
      ctx.emit('achievement', id);
    }
  }
}

import { BUILDING_EFFECTS, DIFFICULTY, MACHINE_RULES, MACHINES, REGIONS } from '../../data/balance';
import { clamp, round } from '../../utils/math';
import { countBuildings, machineSlots } from '../buildings/buildings';
import type { SimContext } from '../context';
import { addTransaction } from '../economy/ledger';
import { notify } from '../notifications';
import { techMult } from '../technology/technology';
import type { GameState, Machine, MachineType } from '../types';

export function machinePrice(state: GameState, type: MachineType): number {
  return Math.round(
    MACHINES[type].purchasePrice * DIFFICULTY[state.difficulty].costMult * REGIONS[state.region].costMult,
  );
}

/** Best available (not broken) machine of a type, or null. */
export function workingMachine(state: GameState, type: MachineType): Machine | null {
  let best: Machine | null = null;
  for (const m of state.machines) {
    if (m.type !== type || m.broken || m.condition <= 0) continue;
    if (!best || m.condition > best.condition) best = m;
  }
  return best;
}

/** Efficiency 0.5..1 depending on condition. */
export function conditionEfficiency(m: Machine): number {
  return 0.5 + clamp(m.condition, 0, 100) / 200;
}

/** Extra fuel use for worn machines (1..1.5). */
export function fuelPenalty(m: Machine): number {
  return 1 + (100 - clamp(m.condition, 0, 100)) / 200;
}

export function repairCost(state: GameState, m: Machine): number {
  const def = MACHINES[m.type];
  const workshop =
    countBuildings(state, 'workshop') > 0 ? 1 - BUILDING_EFFECTS.workshopMaintenanceDiscount : 1;
  const surcharge = m.broken ? 1 + MACHINE_RULES.brokenRepairSurcharge : 1;
  const missing = 100 - clamp(m.condition, 0, 100);
  return Math.round(
    (def.maintenanceCost *
      missing *
      workshop *
      surcharge *
      techMult(state, 'maintenanceMult') *
      DIFFICULTY[state.difficulty].costMult) /
      100,
  );
}

export function resaleValue(m: Machine): number {
  return Math.round(m.purchasePrice * MACHINE_RULES.resaleFactor * (0.3 + 0.7 * (m.condition / 100)));
}

export type MachineCheck = { ok: true; cost: number } | { ok: false; reason: string; cost: number };

export function canBuyMachine(state: GameState, type: MachineType): MachineCheck {
  const cost = machinePrice(state, type);
  if (state.progression.level < MACHINES[type].unlockLevel)
    return { ok: false, reason: 'err.levelRequired', cost };
  if (state.money < cost) return { ok: false, reason: 'err.noMoney', cost };
  return { ok: true, cost };
}

export function buyMachine(ctx: SimContext, type: MachineType): MachineCheck {
  const s = ctx.state;
  const check = canBuyMachine(s, type);
  if (!check.ok) return check;
  addTransaction(
    ctx,
    'machines',
    { key: 'ledger.buyMachine', params: { machine: `@machine.${type}` } },
    -check.cost,
  );
  s.machines.push({
    id: s.nextId++,
    type,
    condition: 100,
    fuel: MACHINES[type].tankSize,
    broken: false,
    purchasedDay: s.day,
    purchasePrice: check.cost,
    workDone: 0,
  });
  s.stats.machinesBought++;
  notify(ctx, 'success', 'notif.machineBought', { machine: `@machine.${type}` });
  ctx.emit('machinesChanged', undefined);
  ctx.emit('analytics', { name: 'machine_purchased', props: { type } });
  ctx.emit('requestSave', 'machine');
  return check;
}

export function sellMachine(ctx: SimContext, id: number): boolean {
  const s = ctx.state;
  const idx = s.machines.findIndex((m) => m.id === id);
  if (idx < 0) return false;
  const m = s.machines[idx];
  s.machines.splice(idx, 1);
  addTransaction(
    ctx,
    'machines',
    { key: 'ledger.sellMachine', params: { machine: `@machine.${m.type}` } },
    resaleValue(m),
  );
  ctx.emit('machinesChanged', undefined);
  return true;
}

export function maintainMachine(ctx: SimContext, id: number): MachineCheck {
  const s = ctx.state;
  const m = s.machines.find((mm) => mm.id === id);
  if (!m) return { ok: false, reason: 'err.unknown', cost: 0 };
  const cost = repairCost(s, m);
  if (cost <= 0 && !m.broken) return { ok: false, reason: 'err.nothingToDo', cost: 0 };
  if (s.money < cost) return { ok: false, reason: 'err.noMoney', cost };
  addTransaction(
    ctx,
    'maintenance',
    { key: 'ledger.maintenance', params: { machine: `@machine.${m.type}` } },
    -cost,
  );
  m.condition = 100;
  m.broken = false;
  ctx.emit('machinesChanged', undefined);
  return { ok: true, cost };
}

export function refuelCost(state: GameState, m: Machine): number {
  return round((MACHINES[m.type].tankSize - m.fuel) * state.market.fuelPrice, 2);
}

/** Refuels to full tank, paying current fuel price. */
export function refuelMachine(ctx: SimContext, m: Machine): number {
  const cost = refuelCost(ctx.state, m);
  if (cost <= 0) return 0;
  addTransaction(ctx, 'fuel', { key: 'ledger.fuel', params: { machine: `@machine.${m.type}` } }, -cost);
  m.fuel = MACHINES[m.type].tankSize;
  return cost;
}

/**
 * Applies the use of a machine for `tiles` tiles: consumes fuel (auto refuel,
 * registered as expense), wears it down and may break it.
 */
export function useMachine(
  ctx: SimContext,
  m: Machine,
  tiles: number,
  fuelPerTile: number,
  wearPerTile: number,
): void {
  const fuelNeeded = tiles * fuelPerTile * fuelPenalty(m);
  if (m.fuel < fuelNeeded) refuelMachine(ctx, m);
  // If still not enough (huge operation), pay the extra directly.
  if (m.fuel < fuelNeeded) {
    const extra = fuelNeeded - m.fuel;
    addTransaction(
      ctx,
      'fuel',
      { key: 'ledger.fuel', params: { machine: `@machine.${m.type}` } },
      -extra * ctx.state.market.fuelPrice,
    );
    m.fuel = 0;
  } else {
    m.fuel = round(m.fuel - fuelNeeded, 2);
  }
  m.condition = round(clamp(m.condition - tiles * wearPerTile * techMult(ctx.state, 'wearMult'), 0, 100), 2);
  m.workDone += tiles;
  if (m.condition < MACHINE_RULES.breakdownThreshold) {
    const p =
      ((MACHINE_RULES.breakdownThreshold - m.condition) / MACHINE_RULES.breakdownThreshold) *
      MACHINE_RULES.breakdownChanceAtZero;
    if (ctx.rng.chance(p)) {
      m.broken = true;
      notify(ctx, 'error', 'notif.machineBroken', { machine: `@machine.${m.type}` });
    }
  }
  ctx.emit('machinesChanged', undefined);
}

/** Daily machine upkeep: outdoor wear, workshop repairs, maintenance workers. */
export function updateMachinesDaily(ctx: SimContext, maintenanceBonus: number): void {
  const s = ctx.state;
  const slots = machineSlots(s);
  const workshop = countBuildings(s, 'workshop') > 0;
  // Machines sorted by value get the roof first.
  const sorted = [...s.machines].sort((a, b) => b.purchasePrice - a.purchasePrice);
  sorted.forEach((m, i) => {
    const outdoor = i >= slots;
    if (outdoor) m.condition -= MACHINE_RULES.outdoorWearPerDay * techMult(s, 'wearMult');
    if (!m.broken) {
      if (workshop) m.condition += BUILDING_EFFECTS.workshopRepairPerDay;
      m.condition += maintenanceBonus;
    }
    m.condition = round(clamp(m.condition, 0, 100), 2);
  });
}

export function machinesMonthlyUpkeep(state: GameState): number {
  return Math.round(
    state.machines.reduce(
      (s, m) => s + MACHINES[m.type].maintenanceCost * MACHINE_RULES.monthlyUpkeepFactor,
      0,
    ),
  );
}

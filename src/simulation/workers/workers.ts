import { WORKER_NAMES, WORKERS } from '../../data/balance';
import { clamp, round } from '../../utils/math';
import type { Rng } from '../../utils/rng';
import { workerSlots } from '../buildings/buildings';
import type { SimContext } from '../context';
import { addTransaction } from '../economy/ledger';
import { notify } from '../notifications';
import type { GameState, Worker, WorkerAssignment } from '../types';

export function generateCandidate(state: GameState, rng: Rng): Worker {
  const skill = rng.int(1, 5);
  const efficiency = round(clamp(0.6 + skill * 0.15 + rng.range(-0.1, 0.1), 0.5, 1.5), 2);
  const salary = Math.round((WORKERS.minSalary + WORKERS.salaryPerSkill * (skill - 1) + rng.range(-150, 150)) / 10) * 10;
  return {
    id: state.nextId++,
    name: `${rng.pick(WORKER_NAMES)} ${String.fromCharCode(65 + rng.int(0, 25))}.`,
    salary,
    skill,
    efficiency,
    assignment: 'field',
    hiredDay: -1,
  };
}

export function refreshCandidates(state: GameState, rng: Rng): void {
  state.candidates = [];
  for (let i = 0; i < WORKERS.candidates; i++) state.candidates.push(generateCandidate(state, rng));
}

export type WorkerCheck = { ok: true } | { ok: false; reason: string };

export function canHire(state: GameState, candidateId: number): WorkerCheck {
  const c = state.candidates.find((w) => w.id === candidateId);
  if (!c) return { ok: false, reason: 'err.unknown' };
  if (state.workers.length >= workerSlots(state)) return { ok: false, reason: 'err.noWorkerSlots' };
  if (state.money < c.salary) return { ok: false, reason: 'err.noMoney' };
  return { ok: true };
}

export function hireWorker(ctx: SimContext, candidateId: number): WorkerCheck {
  const s = ctx.state;
  const check = canHire(s, candidateId);
  if (!check.ok) return check;
  const idx = s.candidates.findIndex((w) => w.id === candidateId);
  const w = s.candidates.splice(idx, 1)[0];
  w.hiredDay = s.day;
  s.workers.push(w);
  notify(ctx, 'success', 'notif.hired', { name: w.name });
  ctx.emit('analytics', { name: 'worker_hired', props: { skill: w.skill } });
  return check;
}

export function fireWorker(ctx: SimContext, workerId: number): WorkerCheck {
  const s = ctx.state;
  const idx = s.workers.findIndex((w) => w.id === workerId);
  if (idx < 0) return { ok: false, reason: 'err.unknown' };
  const w = s.workers[idx];
  s.workers.splice(idx, 1);
  addTransaction(ctx, 'salaries', { key: 'ledger.severance', params: { name: w.name } }, -w.salary * WORKERS.severanceMonths);
  notify(ctx, 'info', 'notif.fired', { name: w.name });
  return { ok: true };
}

export function assignWorker(state: GameState, workerId: number, assignment: WorkerAssignment): boolean {
  const w = state.workers.find((x) => x.id === workerId);
  if (!w) return false;
  w.assignment = assignment;
  return true;
}

export function workersBy(state: GameState, a: WorkerAssignment): Worker[] {
  return state.workers.filter((w) => w.assignment === a);
}

/** Sum of efficiency of workers with an assignment. */
export function workforce(state: GameState, a: WorkerAssignment): number {
  return workersBy(state, a).reduce((s, w) => s + w.efficiency, 0);
}

export function fieldLaborDiscount(state: GameState): number {
  return Math.min(WORKERS.maxFieldLaborDiscount, workersBy(state, 'field').length * WORKERS.fieldLaborDiscount);
}

export function monthlyPayroll(state: GameState): number {
  return state.workers.reduce((s, w) => s + w.salary, 0);
}

export function paySalaries(ctx: SimContext): void {
  const total = monthlyPayroll(ctx.state);
  if (total > 0) addTransaction(ctx, 'salaries', { key: 'ledger.salaries', params: { count: ctx.state.workers.length } }, -total);
}

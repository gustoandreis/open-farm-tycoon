import { EVENT_RULES, EVENTS, type EventDef } from '../../data/balance';
import type { SimContext } from '../context';
import { addTransaction } from '../economy/ledger';
import { notify } from '../notifications';
import { toDate } from '../time/calendar';
import type { CropId, GameState, WeatherType } from '../types';
import { ownedTileCount } from '../world/map';

export function getEventDef(id: string): EventDef | undefined {
  return EVENTS.find((e) => e.id === id);
}

function activeDefs(state: GameState): EventDef[] {
  const out: EventDef[] = [];
  for (const a of state.events.active) {
    const d = getEventDef(a.id);
    if (d) out.push(d);
  }
  return out;
}

export function eventPriceMult(state: GameState, crop: CropId): number {
  let m = 1;
  for (const d of activeDefs(state)) {
    m *= d.effects.priceMult?.[crop] ?? 1;
    m *= d.effects.allPricesMult ?? 1;
  }
  return m;
}

export function eventFuelMult(state: GameState): number {
  return activeDefs(state).reduce((m, d) => m * (d.effects.fuelMult ?? 1), 1);
}

export function eventSeedMult(state: GameState): number {
  return activeDefs(state).reduce((m, d) => m * (d.effects.seedMult ?? 1), 1);
}

export function eventWeatherBias(state: GameState): WeatherType | null {
  for (const d of activeDefs(state)) if (d.effects.weatherBias) return d.effects.weatherBias;
  return null;
}

export function eventCropDamage(state: GameState): number {
  return activeDefs(state).reduce((s, d) => s + (d.effects.cropDamagePerDay ?? 0), 0);
}

/** Starts a specific event (also used by dev cheats and tests). */
export function triggerEvent(ctx: SimContext, def: EventDef): void {
  const s = ctx.state;
  s.events.active.push({ id: def.id, startDay: s.day, endDay: s.day + def.duration });
  s.events.lastEventDay = s.day;
  s.events.history.push({ id: def.id, day: s.day });
  if (s.events.history.length > 50) s.events.history.shift();

  if (def.effects.cashPerOwnedTile) {
    const amount = Math.round(def.effects.cashPerOwnedTile * ownedTileCount(s));
    addTransaction(ctx, 'event', { key: `event.${def.id}.title` }, amount);
  }
  if (def.effects.breakMachine) {
    const candidates = s.machines.filter((m) => !m.broken);
    if (candidates.length > 0) {
      const m = ctx.rng.pick(candidates);
      m.broken = true;
      m.condition = Math.min(m.condition, 25);
      ctx.emit('machinesChanged', undefined);
    } else {
      // Nothing to break: event has no effect, remove silently.
      s.events.active.pop();
      return;
    }
  }
  notify(ctx, def.positive ? 'success' : def.category === 'weather' ? 'weather' : 'warning', `event.${def.id}.title`, {
    desc: `@event.${def.id}.desc`,
  });
  ctx.emit('analytics', { name: 'game_event', props: { id: def.id } });
}

/** Daily event step: expire finished events and maybe start a new one. */
export function updateEvents(ctx: SimContext): void {
  const s = ctx.state;
  s.events.active = s.events.active.filter((a) => a.endDay > s.day);
  if (s.day < EVENT_RULES.graceDays) return;
  if (s.day - s.events.lastEventDay < EVENT_RULES.cooldownDays) return;
  if (s.events.active.length >= EVENT_RULES.maxActive) return;
  const season = toDate(s.day).season;
  for (const def of EVENTS) {
    if (def.seasons && !def.seasons.includes(season)) continue;
    if (s.events.active.some((a) => a.id === def.id)) continue;
    if (ctx.rng.chance(def.probability)) {
      triggerEvent(ctx, def);
      return;
    }
  }
}

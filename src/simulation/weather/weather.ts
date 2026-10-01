import { FORECAST_DAYS, FORECAST_ERROR_PER_DAY, REGIONS, WEATHER, WEATHER_TYPES } from '../../data/balance';
import type { Rng } from '../../utils/rng';
import type { SimContext } from '../context';
import { eventWeatherBias } from '../events/events';
import { notify } from '../notifications';
import { toDate } from '../time/calendar';
import type { GameState, RegionId, Season, WeatherDay, WeatherType } from '../types';

export function rollWeather(
  rng: Rng,
  season: Season,
  region: RegionId,
  bias: WeatherType | null,
  previous: WeatherType | null,
): WeatherType {
  const regionBias = REGIONS[region].weatherBias;
  const items = WEATHER_TYPES.map((w) => {
    let weight = WEATHER[w].weights[season] + (regionBias[w] ?? 0);
    // Persistence: weather tends to repeat for a few days.
    if (previous === w) weight *= 1.6;
    if (bias === w) weight += 60;
    if (bias === 'drought' && (w === 'rain' || w === 'heavyRain' || w === 'storm')) weight *= 0.2;
    if (bias === 'heavyRain' && (w === 'sunny' || w === 'drought' || w === 'heat')) weight *= 0.3;
    return { item: w, weight: Math.max(0, weight) };
  });
  return rng.weighted(items);
}

/** A forecast may be wrong; the further ahead, the more likely. */
function shownFor(rng: Rng, actual: WeatherType, daysAhead: number): WeatherType {
  if (rng.chance(FORECAST_ERROR_PER_DAY * daysAhead)) {
    const similar: Record<WeatherType, WeatherType[]> = {
      sunny: ['cloudy', 'heat'],
      cloudy: ['sunny', 'rain'],
      rain: ['cloudy', 'heavyRain'],
      heavyRain: ['rain', 'storm'],
      heat: ['sunny', 'drought'],
      drought: ['heat', 'sunny'],
      cold: ['cloudy', 'sunny'],
      storm: ['heavyRain', 'rain'],
    };
    return rng.pick(similar[actual]);
  }
  return actual;
}

export function initWeather(state: GameState, rng: Rng): void {
  const season = toDate(state.day).season;
  state.weather.today = rollWeather(rng, season, state.region, null, null);
  state.weather.forecast = [];
  let prev = state.weather.today;
  for (let k = 1; k <= FORECAST_DAYS; k++) {
    const actual = rollWeather(rng, toDate(state.day + k).season, state.region, null, prev);
    state.weather.forecast.push({ actual, shown: shownFor(rng, actual, k) });
    prev = actual;
  }
}

/** Advances weather by one day: tomorrow's actual becomes today; a new day is appended. */
export function advanceWeather(ctx: SimContext): void {
  const s = ctx.state;
  const bias = eventWeatherBias(s);
  const next = s.weather.forecast.shift();
  s.weather.today = next ? next.actual : rollWeather(ctx.rng, toDate(s.day).season, s.region, bias, null);
  if (bias && ctx.rng.chance(0.6)) s.weather.today = bias;
  // Refresh forecast accuracy as days approach.
  s.weather.forecast = s.weather.forecast.map((d: WeatherDay, i): WeatherDay => ({
    actual: d.actual,
    shown: d.shown === d.actual ? d.shown : shownFor(ctx.rng, d.actual, i + 1),
  }));
  const last = s.weather.forecast[s.weather.forecast.length - 1]?.actual ?? s.weather.today;
  while (s.weather.forecast.length < FORECAST_DAYS) {
    const k = s.weather.forecast.length + 1;
    const actual = rollWeather(ctx.rng, toDate(s.day + k).season, s.region, bias, last);
    s.weather.forecast.push({ actual, shown: shownFor(ctx.rng, actual, k) });
  }
  const tomorrow = s.weather.forecast[0]?.shown;
  if (tomorrow === 'storm' || (tomorrow === 'drought' && s.weather.today !== 'drought')) {
    notify(ctx, 'weather', 'notif.forecastAlert', { weather: `@weather.${tomorrow}` });
  }
}

export function weatherMoistureDelta(w: WeatherType): number {
  return WEATHER[w].moisture;
}

export function weatherGrowthFactor(w: WeatherType): number {
  return WEATHER[w].growth;
}

export function weatherDamage(w: WeatherType): number {
  return WEATHER[w].damage;
}

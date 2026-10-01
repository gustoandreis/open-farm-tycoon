import { START } from '../../data/balance';
import type { Season } from '../types';

export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;

export interface GameDate {
  /** 1-based day of month (1..30). */
  day: number;
  /** 1-based month (1..12). */
  month: number;
  /** 1-based year. */
  year: number;
  season: Season;
}

/** Converts an absolute game day (0 = start of the game) into a calendar date. */
export function toDate(absDay: number): GameDate {
  const d = Math.max(0, Math.floor(absDay)) + START.dayOffset;
  const year = Math.floor(d / DAYS_PER_YEAR) + 1;
  const inYear = d % DAYS_PER_YEAR;
  const month = Math.floor(inYear / DAYS_PER_MONTH) + 1;
  const day = (inYear % DAYS_PER_MONTH) + 1;
  return { day, month, year, season: seasonOfMonth(month) };
}

/** Southern hemisphere seasons (Brazil). */
export function seasonOfMonth(month: number): Season {
  if (month >= 9 && month <= 11) return 'spring';
  if (month === 12 || month <= 2) return 'summer';
  if (month >= 3 && month <= 5) return 'autumn';
  return 'winter';
}

export function monthKey(absDay: number): string {
  const d = toDate(absDay);
  return `${d.year}-${d.month}`;
}

export function isFirstDayOfMonth(absDay: number): boolean {
  return toDate(absDay).day === 1;
}

export function isFirstDayOfYear(absDay: number): boolean {
  const d = toDate(absDay);
  return d.day === 1 && d.month === 1;
}

/** Absolute day of the next first-of-month after absDay. */
export function nextMonthStart(absDay: number): number {
  const d = toDate(absDay);
  return absDay + (DAYS_PER_MONTH - d.day + 1);
}

export function isValidDate(date: GameDate): boolean {
  return (
    Number.isInteger(date.day) &&
    date.day >= 1 &&
    date.day <= DAYS_PER_MONTH &&
    Number.isInteger(date.month) &&
    date.month >= 1 &&
    date.month <= MONTHS_PER_YEAR &&
    Number.isInteger(date.year) &&
    date.year >= 1
  );
}

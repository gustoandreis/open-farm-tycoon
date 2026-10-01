import { describe, expect, it } from 'vitest';
import {
  isFirstDayOfMonth,
  isFirstDayOfYear,
  isValidDate,
  seasonOfMonth,
  toDate,
} from '../src/simulation/time/calendar';

describe('calendar', () => {
  it('starts on 1 October of year 1 (spring)', () => {
    expect(toDate(0)).toEqual({ day: 1, month: 10, year: 1, season: 'spring' });
  });

  it('rolls months and years', () => {
    expect(toDate(30).month).toBe(11);
    expect(toDate(90)).toMatchObject({ day: 1, month: 1, year: 2 });
    expect(isFirstDayOfYear(90)).toBe(true);
    expect(isFirstDayOfMonth(60)).toBe(true);
    expect(isFirstDayOfMonth(61)).toBe(false);
  });

  it('southern hemisphere seasons', () => {
    expect(seasonOfMonth(1)).toBe('summer');
    expect(seasonOfMonth(4)).toBe('autumn');
    expect(seasonOfMonth(7)).toBe('winter');
    expect(seasonOfMonth(10)).toBe('spring');
    expect(seasonOfMonth(12)).toBe('summer');
  });

  it('always produces valid dates', () => {
    for (let d = 0; d < 2000; d++) expect(isValidDate(toDate(d))).toBe(true);
  });
});

import { IS_DEV } from '../config/game';

export type AnalyticsEvent =
  | 'game_start'
  | 'game_continue'
  | 'tutorial_start'
  | 'tutorial_complete'
  | 'crop_planted'
  | 'crop_harvested'
  | 'commodity_sold'
  | 'land_purchased'
  | 'machine_purchased'
  | 'building_built'
  | 'loan_taken'
  | 'loan_paid'
  | 'technology_unlocked'
  | 'bankruptcy'
  | 'session_end'
  | (string & {});

export interface AnalyticsRecord {
  name: AnalyticsEvent;
  props?: Record<string, string | number | boolean>;
  at: number;
}

/**
 * Local analytics: keeps a small in-memory buffer and logs in development.
 * No data leaves the browser. A future backend/portal can subscribe via `onEvent`.
 */
export class AnalyticsService {
  private buffer: AnalyticsRecord[] = [];
  private listeners: ((r: AnalyticsRecord) => void)[] = [];
  constructor(private log = IS_DEV) {}

  track(name: AnalyticsEvent, props?: Record<string, string | number | boolean>): void {
    const r: AnalyticsRecord = { name, props, at: Date.now() };
    this.buffer.push(r);
    if (this.buffer.length > 200) this.buffer.shift();
    if (this.log) console.debug('[analytics]', name, props ?? '');
    for (const l of this.listeners) {
      try {
        l(r);
      } catch {
        // ignore listener errors
      }
    }
  }

  onEvent(fn: (r: AnalyticsRecord) => void): void {
    this.listeners.push(fn);
  }

  recent(): readonly AnalyticsRecord[] {
    return this.buffer;
  }
}

export const analytics = new AnalyticsService();

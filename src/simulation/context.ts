import type { Rng } from '../utils/rng';
import type { GameState, NotificationCategory, YearSummary } from './types';

export type I18nParams = Record<string, string | number>;

export interface FeedbackEvent {
  key: string;
  params?: I18nParams;
  x: number;
  y: number;
  tone: 'good' | 'bad' | 'info';
}

export interface SimEvents {
  /** Tile indices whose visual state changed, or 'all'. */
  tilesChanged: number[] | 'all';
  parcelsChanged: undefined;
  buildingsChanged: undefined;
  machinesChanged: undefined;
  money: number;
  day: number;
  notify: { category: NotificationCategory; key: string; params?: I18nParams };
  feedback: FeedbackEvent;
  yearEnd: YearSummary;
  gameOver: undefined;
  levelUp: number;
  objective: string;
  achievement: string;
  analytics: { name: string; props?: Record<string, string | number | boolean> };
  /** A system asks the host to persist the game (important action). */
  requestSave: string;
}

export interface SimContext {
  state: GameState;
  rng: Rng;
  emit<K extends keyof SimEvents>(type: K, payload: SimEvents[K]): void;
}

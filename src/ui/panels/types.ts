import type { GameSession } from '../../game/GameSession';
import type { Game } from '../../simulation/game';
import type { NotificationCategory } from '../../simulation/types';

export type PanelId =
  | 'land'
  | 'crops'
  | 'machines'
  | 'buildings'
  | 'workers'
  | 'market'
  | 'finance'
  | 'bank'
  | 'tech'
  | 'stats'
  | 'notifications'
  | 'settings';

export interface PanelContext {
  session: GameSession;
  game: Game;
  confirm(title: string, message: string, danger?: boolean): Promise<boolean>;
  toast(category: NotificationCategory, text: string): void;
  refresh(): void;
  openPanel(id: PanelId): void;
  closePanel(): void;
  /** UI-only state that survives re-renders of the same panel. */
  local: Record<string, unknown>;
}

export type PanelRenderer = (ctx: PanelContext) => HTMLElement;

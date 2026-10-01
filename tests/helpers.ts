import { START } from '../src/data/balance';
import { GAME_CONFIG } from '../src/config/game';
import { Game } from '../src/simulation/game';
import type { Rect } from '../src/simulation/crops/fieldOps';

export function newTestGame(seed = 'TEST-SEED', difficulty: 'easy' | 'normal' | 'hard' = 'normal'): Game {
  return Game.newGame({ farmName: 'Fazenda Teste', difficulty, seed });
}

/** A rectangle inside the starting parcel that avoids the farmhouse (bottom-right corner). */
export function startRect(w = 4, h = 4): Rect {
  const x0 = START.parcel.px * GAME_CONFIG.parcelSize;
  const y0 = START.parcel.py * GAME_CONFIG.parcelSize;
  return { x0, y0, x1: x0 + w - 1, y1: y0 + h - 1 };
}

/** Advances until every crop in rect is ready (or max days). */
export function growUntilReady(game: Game, rect: Rect, maxDays = 200): number {
  for (let d = 0; d < maxDays; d++) {
    let allReady = true;
    for (let y = rect.y0; y <= rect.y1; y++)
      for (let x = rect.x0; x <= rect.x1; x++) {
        const t = game.state.map.tiles[y * game.state.map.width + x];
        if (t.crop && t.crop.readyDay === null) allReady = false;
      }
    if (allReady) return d;
    // Keep crops watered so the test does not depend on weather luck.
    for (let y = rect.y0; y <= rect.y1; y++)
      for (let x = rect.x0; x <= rect.x1; x++)
        game.state.map.tiles[y * game.state.map.width + x].moisture = 60;
    game.advanceDay();
  }
  return maxDays;
}
